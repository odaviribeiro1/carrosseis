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

// Inicia o OAuth hospedado do Zernio para conectar uma conta do Instagram.
// Garante um profile no Zernio (cria/reusa), persiste profile_id e devolve a authUrl.
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
    const redirectUrl = String(body?.redirect_url ?? '').trim();
    if (!redirectUrl) return json({ error: 'redirect_url e obrigatorio' }, 400, cors);

    // 1) Garante um profile no Zernio (reusa o salvo; senao usa o Default/cria).
    const { data: settings } = await userClient
      .from('instance_settings')
      .select('zernio_connection')
      .limit(1)
      .maybeSingle();
    const conn = (settings?.zernio_connection ?? {}) as Record<string, unknown>;
    let profileId = String(conn.profile_id ?? '');

    if (!profileId) {
      const list = await zernioFetch('/profiles', apiKey);
      if (list.ok) {
        const profiles = list.data?.profiles ?? [];
        const def = profiles.find((p: { isDefault?: boolean }) => p.isDefault) ?? profiles[0];
        if (def?._id) profileId = String(def._id);
      }
      if (!profileId) {
        const created = await zernioFetch('/profiles', apiKey, {
          method: 'POST',
          body: { name: 'Content Hub' },
        });
        if (!created.ok) return json({ error: zernioErrorMessage(created) }, 502, cors);
        profileId = String(created.data?.profile?._id ?? '');
      }
      if (!profileId) return json({ error: 'Nao foi possivel resolver um profile no Zernio.' }, 502, cors);
      await userClient
        .from('instance_settings')
        .update({ zernio_connection: { ...conn, profile_id: profileId }, updated_at: new Date().toISOString() })
        .eq('id', true);
    }

    // 2) Pede a URL de OAuth hospedada.
    const qs = `profileId=${encodeURIComponent(profileId)}&redirectUrl=${encodeURIComponent(redirectUrl)}`;
    const connectRes = await zernioFetch(`/connect/instagram?${qs}`, apiKey);
    if (!connectRes.ok) return json({ error: zernioErrorMessage(connectRes) }, connectRes.status === 402 ? 402 : 502, cors);

    const authUrl = connectRes.data?.authUrl ?? connectRes.data?.url ?? connectRes.data?.connectUrl;
    if (!authUrl) return json({ error: 'Zernio nao retornou a URL de autorizacao.' }, 502, cors);

    return json({ authUrl }, 200, cors);
  } catch (err) {
    const cors2 = await getCorsHeaders(req);
    return json({ error: `Erro interno: ${String(err)}` }, 500, cors2);
  }
});
