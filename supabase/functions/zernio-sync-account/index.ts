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

// Pos-OAuth: lista contas no Zernio, acha a do Instagram, valida que e
// Business/Creator com permissao de publicacao, e persiste account_id/username.
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

    const accountsRes = await zernioFetch('/accounts', apiKey);
    if (!accountsRes.ok) return json({ error: zernioErrorMessage(accountsRes) }, 502, cors);

    // deno-lint-ignore no-explicit-any
    const accounts: any[] = accountsRes.data?.accounts ?? [];
    const ig = accounts.find((a) => a.platform === 'instagram' && a.isActive !== false);
    if (!ig) {
      return json({ connected: false, error: 'Nenhuma conta do Instagram conectada no Zernio.' }, 200, cors);
    }

    // Business/Creator: a permissao de publicacao e o sinal definitivo.
    const permissions: string[] = ig.permissions ?? [];
    const canPublish = permissions.includes('instagram_business_content_publish');
    const accountType: string | undefined = ig.metadata?.profileData?.extraData?.accountType;
    if (!canPublish) {
      return json(
        {
          connected: false,
          error:
            'A conta do Instagram precisa ser Business ou Creator (e autorizar publicacao). ' +
            'Converta a conta para profissional e reconecte.',
        },
        200,
        cors,
      );
    }

    const { data: settings } = await userClient
      .from('instance_settings')
      .select('zernio_connection')
      .limit(1)
      .maybeSingle();
    const prev = (settings?.zernio_connection ?? {}) as Record<string, unknown>;
    const profileId = String(prev.profile_id ?? ig.profileId?._id ?? ig.profileId ?? '');

    const connection = {
      profile_id: profileId,
      account_id: String(ig._id),
      username: String(ig.username ?? ''),
      account_type: accountType ?? null,
      connected_at: new Date().toISOString(),
    };
    const { error: upErr } = await userClient
      .from('instance_settings')
      .update({ zernio_connection: connection, updated_at: new Date().toISOString() })
      .eq('id', true);
    if (upErr) return json({ error: `Falha ao salvar conexao: ${upErr.message}` }, 500, cors);

    return json({ connected: true, username: connection.username, account_type: accountType ?? null }, 200, cors);
  } catch (err) {
    const cors2 = await getCorsHeaders(req);
    return json({ error: `Erro interno: ${String(err)}` }, 500, cors2);
  }
});
