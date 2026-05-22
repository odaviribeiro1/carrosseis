// api/deployment-status.ts
// Proxy server-side do status de um deployment Vercel, usado pelo polling do Step 3 do wizard.
// O VERCEL_TOKEN trafega apenas no body (browser -> nossa funcao -> Vercel); nunca vai do
// browser direto para api.vercel.com, e nunca e logado.
import type { VercelRequest, VercelResponse } from '@vercel/node';

type Body = { deployment_id?: string; vercel_token?: string };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  const { deployment_id, vercel_token } = (req.body ?? {}) as Body;
  if (typeof deployment_id !== 'string' || typeof vercel_token !== 'string' || !deployment_id || !vercel_token) {
    return res.status(400).json({ error: 'Parametros obrigatorios ausentes' });
  }

  try {
    const r = await fetch(`https://api.vercel.com/v13/deployments/${deployment_id}`, {
      headers: { Authorization: `Bearer ${vercel_token}` },
    });
    const data = await r.json();
    const state = data?.readyState ?? data?.state;
    // Nunca logar o token. Log apenas o id e o estado.
    console.log('[deployment-status]', { deployment_id, state });
    return res.status(r.status).json({ state, url: data?.url });
  } catch (err) {
    console.error('[deployment-status] erro:', { deployment_id, error: (err as Error).message });
    return res.status(502).json({ error: 'Falha ao consultar status do deployment' });
  }
}
