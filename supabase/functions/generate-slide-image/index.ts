import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';
import { getCorsHeaders } from '../_shared/cors.ts';
import { getCredential } from '../_shared/credentials.ts';

const BUCKET = 'slide-images';
// Nano Banana 2 primeiro, fallback para Nano Banana Pro.
const MODELS = ['gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview'];

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

    const { slide_id, prompt, reference_image } = await req.json();
    if (!slide_id) return json({ error: 'slide_id e obrigatorio' }, 400);
    if (!prompt || !String(prompt).trim()) return json({ error: 'Prompt e obrigatorio' }, 400);

    // Imagem de referencia opcional (data URL, URL http ou base64 puro) -> inlineData.
    let referencePart: { inlineData: { mimeType: string; data: string } } | null = null;
    if (reference_image && typeof reference_image === 'string') {
      try {
        const dataUrl = reference_image.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
        if (dataUrl) {
          referencePart = { inlineData: { mimeType: dataUrl[1], data: dataUrl[2] } };
        } else if (/^https?:\/\//.test(reference_image)) {
          const imgResp = await fetch(reference_image);
          if (!imgResp.ok) throw new Error(`status ${imgResp.status}`);
          const mimeType = imgResp.headers.get('content-type') || 'image/png';
          const buf = new Uint8Array(await imgResp.arrayBuffer());
          let bin = '';
          for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
          referencePart = { inlineData: { mimeType, data: btoa(bin) } };
        } else {
          referencePart = { inlineData: { mimeType: 'image/png', data: reference_image } };
        }
      } catch (err) {
        return json({ error: `Imagem de referencia invalida: ${String(err)}` }, 400);
      }
    }

    const apiKey =
      (await getCredential('gemini_imagen_api_key')) ??
      (await getCredential('google_api_key')) ??
      '';
    if (!apiKey) {
      return json(
        { error: 'Credencial de imagem nao configurada (google_api_key). Configure nas credenciais.' },
        500,
      );
    }

    // Service role para ler/gravar slide e fazer upload no Storage.
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
      db: { schema: 'content_hub' },
    });

    const { data: slide, error: slideErr } = await admin
      .from('carousel_slides')
      .select('id, carousel_id, image_url, image_prompt, design_spec, current_version')
      .eq('id', slide_id)
      .single();
    if (slideErr || !slide) return json({ error: 'Slide nao encontrado' }, 404);

    // Geracao da imagem via Gemini (Nano Banana) com fallback de modelo.
    let imageBase64 = '';
    let usedModel = '';
    let lastError = '';
    for (const model of MODELS) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
              contents: [{
                parts: referencePart
                  ? [{ text: String(prompt) }, referencePart]
                  : [{ text: String(prompt) }],
              }],
              generationConfig: {
                responseModalities: ['TEXT', 'IMAGE'],
                imageConfig: { aspectRatio: '3:4' },
              },
            }),
          },
        );
        if (!resp.ok) {
          lastError = `${model}: ${resp.status} - ${await resp.text()}`;
          continue;
        }
        const data = await resp.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.mimeType?.startsWith('image/')) {
            imageBase64 = part.inlineData.data;
            usedModel = model;
            break;
          }
        }
        if (imageBase64) break;
        lastError = `${model}: sem imagem na resposta`;
      } catch (err) {
        lastError = `${model}: ${String(err)}`;
      }
    }
    if (!imageBase64) return json({ error: `Falha ao gerar imagem. ${lastError}` }, 400);

    // Versionamento: arquiva a versao atual antes de sobrescrever.
    const currentVersion = (slide.current_version as number | null) ?? 1;
    const hasPrev = Boolean(slide.image_url);
    const newVersion = hasPrev ? currentVersion + 1 : currentVersion;

    if (hasPrev) {
      const { error: verErr } = await admin.from('carousel_slide_versions').insert({
        slide_id: slide.id,
        version: currentVersion,
        image_url: slide.image_url,
        image_prompt: slide.image_prompt,
        design_spec: slide.design_spec,
      });
      if (verErr) console.error('Erro ao arquivar versao anterior:', verErr);
    }

    // Decodifica base64 -> bytes e faz upload (path unico por versao).
    const bytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
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
      .update({ image_url: publicUrl, image_prompt: String(prompt), current_version: newVersion })
      .eq('id', slide.id);
    if (updErr) return json({ error: `Erro ao atualizar slide: ${updErr.message}` }, 500);

    return json({ image_url: publicUrl, version: newVersion, model: usedModel });
  } catch (err) {
    const cors = await getCorsHeaders(req);
    return new Response(JSON.stringify({ error: `Erro interno: ${String(err)}` }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
