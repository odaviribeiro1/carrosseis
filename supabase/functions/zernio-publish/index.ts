import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';
import { getCorsHeaders } from '../_shared/cors.ts';
import { getCredential } from '../_shared/credentials.ts';
import { zernioFetch, zernioErrorMessage } from '../_shared/zernio.ts';

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const ALLOWED_STATUS = new Set(['draft', 'scheduled', 'published', 'failed']);

// Publica/agenda/rascunha um carrossel no Instagram via Zernio (POST /posts).
// Modo SEMPRE explicito (exatamente um de publishNow|scheduledFor|isDraft).
Deno.serve(async (req: Request) => {
  const cors = await getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Nao autorizado' }, 401, cors);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, {
      db: { schema: 'content_hub' },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'Nao autenticado' }, 401, cors);

    const apiKey = await getCredential('zernio_api_key');
    if (!apiKey) {
      return json({ error: 'Configure a Zernio API Key em Configuracoes > Credenciais.' }, 400, cors);
    }

    const body = await req.json().catch(() => ({}));
    const carouselId = String(body?.carousel_id ?? '');
    const caption = String(body?.caption ?? '').slice(0, 2200);
    const mode = String(body?.mode ?? 'draft'); // 'now' | 'schedule' | 'draft'
    const scheduledFor = body?.scheduled_for ? String(body.scheduled_for) : null;
    const timezone = String(body?.timezone ?? 'America/Sao_Paulo');
    const requestId = String(body?.request_id ?? '');
    const imageUrls: Array<{ position: number; url: string }> = Array.isArray(body?.image_urls)
      ? body.image_urls
      : [];

    if (!carouselId) return json({ error: 'carousel_id e obrigatorio' }, 400, cors);
    if (mode === 'schedule' && !scheduledFor) {
      return json({ error: 'Informe a data/hora do agendamento.' }, 400, cors);
    }

    // Conta IG conectada (singleton).
    const { data: settings } = await userClient
      .from('instance_settings')
      .select('zernio_connection')
      .limit(1)
      .maybeSingle();
    const accountId = String((settings?.zernio_connection as { account_id?: string } | null)?.account_id ?? '');
    if (!accountId) {
      return json({ error: 'Conecte uma conta do Instagram em Credenciais antes de publicar.' }, 400, cors);
    }

    // mediaItems na ordem dos slides (max 10).
    const ordered = [...imageUrls]
      .filter((i) => i?.url)
      .sort((a, b) => a.position - b.position)
      .slice(0, 10);
    if (ordered.length === 0) return json({ error: 'Nenhuma imagem para publicar.' }, 400, cors);
    const mediaItems = ordered.map((i) => ({ type: 'image', url: i.url }));

    // Body do POST /posts — modo sempre explicito.
    const postBody: Record<string, unknown> = {
      content: caption,
      mediaItems,
      platforms: [{ platform: 'instagram', accountId }],
    };
    if (mode === 'now') postBody.publishNow = true;
    else if (mode === 'schedule') {
      postBody.scheduledFor = scheduledFor;
      postBody.timezone = timezone;
    } else postBody.isDraft = true;

    const headers: Record<string, string> = {};
    if (requestId) headers['x-request-id'] = requestId;

    console.log('[zernio-publish] POST /posts', {
      carouselId,
      mode,
      items: mediaItems.length,
      accountId,
      hasRequestId: Boolean(requestId),
    });

    const res = await zernioFetch('/posts', apiKey, { method: 'POST', body: postBody, headers });

    // Dedup por content-hash (24h): nao e erro fatal.
    if (res.status === 409) {
      const existingPostId = res.data?.existingPostId ?? res.data?.post?._id ?? null;
      return json(
        {
          duplicate: true,
          existingPostId,
          message: 'Esse conteudo ja foi publicado/agendado recentemente.',
        },
        200,
        cors,
      );
    }

    if (!res.ok) {
      console.error('[zernio-publish] erro', res.status, res.data?.error ?? res.data);
      return json({ error: zernioErrorMessage(res) }, 502, cors);
    }

    const zPost = res.data?.post ?? {};
    const zStatus = String(zPost.status ?? '');
    // Normaliza ao enum da tabela; estados transitorios (pending/publishing)
    // caem no mapeamento por modo (otimista p/ "agora"; webhooks ajustam depois).
    const byMode = mode === 'now' ? 'published' : mode === 'schedule' ? 'scheduled' : 'draft';
    const status = ALLOWED_STATUS.has(zStatus) ? zStatus : byMode;

    console.log('[zernio-publish] ok', { postId: zPost._id, zStatus, status });

    const { error: insErr } = await userClient.from('scheduled_posts').insert({
      carousel_id: carouselId,
      zernio_post_id: zPost._id ?? null,
      status,
      scheduled_for: mode === 'schedule' ? scheduledFor : null,
      caption,
    });
    if (insErr) console.error('[zernio-publish] falha ao gravar scheduled_posts:', insErr.message);

    return json({ ok: true, status, postId: zPost._id ?? null, duplicate: false }, 200, cors);
  } catch (err) {
    const cors2 = await getCorsHeaders(req);
    return json({ error: `Erro interno: ${String(err)}` }, 500, cors2);
  }
});
