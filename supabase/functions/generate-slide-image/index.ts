import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';
import { getCorsHeaders } from '../_shared/cors.ts';
import { getCredential } from '../_shared/credentials.ts';
import { getProvider, ProviderError } from './providers/index.ts';

const BUCKET = 'slide-images';

Deno.serve(async (req: Request) => {
  const corsHeaders = await getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Nao autorizado' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Valida o JWT do usuario.
    const userClient = createClient(supabaseUrl, anonKey, {
      db: { schema: 'content_hub' },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'Nao autenticado' }, 401);

    const { slide_id, prompt, reference_image, reference_images, size, aspect } = await req.json();
    if (!slide_id) return json({ error: 'slide_id e obrigatorio' }, 400);
    if (!prompt || !String(prompt).trim()) return json({ error: 'Prompt e obrigatorio' }, 400);

    // Referencias: uma unica (refino) e/ou um array (aspectos visuais).
    const refs: string[] = [];
    if (reference_image && typeof reference_image === 'string') refs.push(reference_image);
    if (Array.isArray(reference_images)) {
      for (const r of reference_images) if (typeof r === 'string' && r) refs.push(r);
    }

    // Service role para ler/gravar slide, ler o provider do carrossel e upload.
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
      db: { schema: 'content_hub' },
    });

    const { data: slide, error: slideErr } = await admin
      .from('carousel_slides')
      .select('id, carousel_id, slot_image_url, image_url, image_prompt, design_spec, current_version')
      .eq('id', slide_id)
      .single();
    if (slideErr || !slide) return json({ error: 'Slide nao encontrado' }, 404);

    // Provider de imagem vem do carrossel (default gpt_image).
    const { data: carousel } = await admin
      .from('carousels')
      .select('image_provider')
      .eq('id', slide.carousel_id)
      .single();
    const { provider, name: providerName } = getProvider(carousel?.image_provider as string);

    // Credencial conforme o provider.
    let apiKey = '';
    if (providerName === 'gpt_image') {
      apiKey = (await getCredential('openai_api_key')) ?? '';
      if (!apiKey) {
        return json(
          { error: 'Configure sua chave da OpenAI nas Credenciais para gerar imagens com GPT Image.' },
          400,
        );
      }
    } else {
      apiKey =
        (await getCredential('gemini_imagen_api_key')) ??
        (await getCredential('google_api_key')) ??
        '';
      if (!apiKey) {
        return json(
          { error: 'Configure sua chave do Google nas Credenciais para usar o Nano Banana.' },
          400,
        );
      }
    }

    console.log('[slide-image] req', {
      slide_id,
      provider: providerName,
      promptLen: String(prompt).length,
      refCount: refs.length,
    });

    // Gera a imagem (cada provider trata seus erros como ProviderError pt-BR).
    let bytes: Uint8Array;
    let modelUsed: string;
    try {
      const result = await provider.generate({
        prompt: String(prompt),
        refs,
        apiKey,
        size: typeof size === 'string' ? size : undefined,
        aspect: typeof aspect === 'string' ? aspect : undefined,
      });
      bytes = result.bytes;
      modelUsed = result.modelUsed;
    } catch (err) {
      const isProvider = err instanceof ProviderError;
      const message = isProvider ? err.message : `Falha ao gerar imagem. ${String(err)}`;
      const status = isProvider && err.code === 'RATE_LIMIT' ? 429 : 400;
      console.error('[slide-image] falha:', providerName, message);
      return json({ error: message }, status);
    }

    console.log('[slide-image] ok', { provider: providerName, model: modelUsed });

    // Versionamento: arquiva a versao atual do slot antes de sobrescrever.
    // (carousel_slide_versions.image_url guarda historicamente a imagem do slot.)
    const prevSlot = (slide.slot_image_url as string | null) ?? (slide.image_url as string | null);
    const currentVersion = (slide.current_version as number | null) ?? 1;
    const hasPrev = Boolean(prevSlot);
    const newVersion = hasPrev ? currentVersion + 1 : currentVersion;

    if (hasPrev) {
      const { error: verErr } = await admin.from('carousel_slide_versions').insert({
        slide_id: slide.id,
        version: currentVersion,
        image_url: prevSlot,
        image_prompt: slide.image_prompt,
        design_spec: slide.design_spec,
      });
      if (verErr) console.error('Erro ao arquivar versao anterior:', verErr);
    }

    // Upload (path unico por versao) — bytes ja em PNG, sem pos-processamento.
    const path = `${slide.carousel_id}/${slide.id}_v${newVersion}.png`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: 'image/png',
      upsert: true,
    });
    if (upErr) return json({ error: `Erro ao salvar imagem: ${upErr.message}` }, 500);

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    const { error: updErr } = await admin
      .from('carousel_slides')
      .update({ slot_image_url: publicUrl, image_prompt: String(prompt), current_version: newVersion })
      .eq('id', slide.id);
    if (updErr) return json({ error: `Erro ao atualizar slide: ${updErr.message}` }, 500);

    // Retorna slot_image_url (novo) e image_url (retrocompat com clients antigos).
    return json({ slot_image_url: publicUrl, image_url: publicUrl, version: newVersion, model: modelUsed, provider: providerName });
  } catch (err) {
    const cors = await getCorsHeaders(req);
    return new Response(JSON.stringify({ error: `Erro interno: ${String(err)}` }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
