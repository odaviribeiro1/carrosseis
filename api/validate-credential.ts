// api/validate-credential.ts
// Valida as credenciais do Step 4 (chaves de provedores de IA, Resend, etc.) server-side.
// Mesma motivacao do /api/validate-token: a chave nunca trafega do browser direto pro
// provedor — evita CORS (Anthropic/Groq/Resend nao liberam navegador) e nao expoe a
// chave no Network tab. Usa exatamente os validators de setup.config (mesma logica do save).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setupConfig } from '../setup.config';

const fieldsByKey = new Map(setupConfig.appCredentials.map((field) => [field.key, field]));

type ValidateBody = { key?: string; value?: string };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ valid: false, message: 'Metodo nao permitido' });

  const { key, value } = (req.body ?? {}) as ValidateBody;
  if (typeof key !== 'string' || typeof value !== 'string') {
    return res.status(400).json({ valid: false, message: 'Parametros invalidos' });
  }

  const field = fieldsByKey.get(key);
  if (!field) return res.status(400).json({ valid: false, message: 'Credencial desconhecida' });

  try {
    const result = await field.validate(value);
    return res.status(200).json({ valid: result.ok, message: result.message });
  } catch (err) {
    // ⚠️ Nunca logar `value`.
    console.error('[validate-credential] erro:', { key, error: (err as Error).message });
    return res.status(502).json({ valid: false, message: 'Nao foi possivel validar agora.' });
  }
}
