// api/validate-token.ts
// Valida tokens core (Supabase + Vercel) server-side, sem expor os valores no browser.
// O token nunca aparece no Network tab / DevTools do aluno — só trafega entre esta
// Serverless Function e o provedor (api.supabase.com / api.vercel.com).
import type { VercelRequest, VercelResponse } from '@vercel/node';

type TokenType =
  | 'supabase_url'
  | 'supabase_anon_key'
  | 'supabase_service_role_key'
  | 'supabase_pat'
  | 'vercel_token';

type ValidateBody = {
  type: TokenType;
  value: string;
  // supabase_anon_key e supabase_service_role_key precisam da URL para o ping.
  supabase_url?: string;
};

const SUPABASE_URL_RE = /^https:\/\/[a-z0-9]+\.supabase\.co$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { type, value, supabase_url } = (req.body ?? {}) as ValidateBody;

  if (typeof value !== 'string' || value.length === 0) {
    return res.status(400).json({ valid: false, message: 'Valor ausente' });
  }
  if (typeof type !== 'string') {
    return res.status(400).json({ valid: false, message: 'Tipo ausente' });
  }

  // ⚠️ Nunca logar `value`. Log apenas `type` + tamanho + outcome.
  const logCtx = { type, value_length: value.length };

  try {
    let valid = false;
    let message: string | undefined;

    switch (type) {
      case 'supabase_url':
        valid = SUPABASE_URL_RE.test(value);
        if (!valid) message = 'URL do Supabase invalida';
        break;

      case 'supabase_anon_key':
      case 'supabase_service_role_key': {
        if (!supabase_url || !SUPABASE_URL_RE.test(supabase_url)) {
          return res.status(400).json({ valid: false, message: 'URL Supabase valida necessaria' });
        }
        const r = await fetch(`${supabase_url}/rest/v1/`, {
          headers: { apikey: value, Authorization: `Bearer ${value}` },
        });
        valid = r.ok;
        if (!valid) message = 'Chave Supabase invalida ou sem permissao';
        break;
      }

      case 'supabase_pat': {
        const r = await fetch('https://api.supabase.com/v1/projects', {
          headers: { Authorization: `Bearer ${value}` },
        });
        valid = r.ok;
        if (!valid) message = 'Personal Access Token Supabase invalido';
        break;
      }

      case 'vercel_token': {
        const r = await fetch('https://api.vercel.com/v2/user', {
          headers: { Authorization: `Bearer ${value}` },
        });
        valid = r.ok;
        if (!valid) message = 'Token Vercel invalido';
        break;
      }

      default:
        return res.status(400).json({ valid: false, message: 'Tipo de token desconhecido' });
    }

    console.log('[validate-token]', { ...logCtx, valid });
    return res.status(200).json({ valid, message });
  } catch (err) {
    console.error('[validate-token] erro:', { ...logCtx, error: (err as Error).message });
    return res.status(502).json({ valid: false, message: 'Falha ao validar token' });
  }
}
