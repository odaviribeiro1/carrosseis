import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setupConfig } from '../setup.config';
import { getSupabaseAdmin, listCredentialPresence, setCredential } from '../src/lib/credentials';

const allowedKeys = new Set(setupConfig.appCredentials.map((field) => field.key));

type AuthResult = { userId: string } | { status: 401 | 403; message: string };

// Auth obrigatoria: GET e POST so respondem a um owner autenticado.
// Modelo de role deste repo: content_hub.user_roles (role 'owner' | 'member').
async function requireOwner(req: VercelRequest): Promise<AuthResult> {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return { status: 401, message: 'Token de acesso ausente' };

  const supabase = getSupabaseAdmin();

  // 1. Validar JWT contra auth.users.
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return { status: 401, message: 'Sessao invalida ou expirada' };

  // 2. Validar role owner em content_hub.user_roles.
  const { data: role, error: roleError } = await supabase
    .schema('content_hub')
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (roleError) return { status: 403, message: 'Nao foi possivel verificar a role do usuario' };
  if (role?.role !== 'owner') {
    return { status: 403, message: 'Apenas administradores podem editar credenciais' };
  }

  return { userId: userData.user.id };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireOwner(req);
  if ('status' in auth) {
    return res.status(auth.status).json({ success: false, message: auth.message });
  }

  try {
    if (req.method === 'GET') {
      const keys = String(req.query.keys ?? '')
        .split(',')
        .map((key) => key.trim())
        .filter((key) => allowedKeys.has(key));
      // Retorna apenas presenca ({ exists }), nunca o valor descriptografado.
      return res.status(200).json(await listCredentialPresence(keys));
    }

    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Metodo nao permitido' });

    const input = (req.body?.credentials ?? req.body) as Record<string, unknown>;
    const credentials = Object.entries(input).filter(
      ([key, value]) => allowedKeys.has(key) && typeof value === 'string' && value.length > 0,
    ) as Array<[string, string]>;

    // Validacao server-side: re-checa o formato de cada credencial antes de salvar.
    for (const [key, value] of credentials) {
      const field = setupConfig.appCredentials.find((item) => item.key === key);
      const validation = await field?.validate(value);
      if (validation && !validation.ok) {
        return res.status(400).json({
          success: false,
          key,
          message: validation.message ?? 'Credencial invalida.',
        });
      }
    }

    for (const [key, value] of credentials) {
      await setCredential(key, value);
    }

    const supabase = getSupabaseAdmin();
    await supabase
      .from('_bootstrap_state')
      .upsert({ step: 'app_credentials_saved', metadata: { keys: credentials.map(([key]) => key) } });

    return res.status(200).json({ success: true, saved: credentials.map(([key]) => key) });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Erro ao salvar credenciais.',
    });
  }
}
