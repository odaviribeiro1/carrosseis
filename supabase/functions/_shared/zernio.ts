// Helper compartilhado das Edge Functions Zernio. Centraliza base URL, auth e o
// parsing de erro. A API key NUNCA toca o browser — vem de getCredential server-side.

export const ZERNIO_BASE = 'https://zernio.com/api/v1';

export interface ZernioResult {
  ok: boolean;
  status: number;
  // deno-lint-ignore no-explicit-any
  data: any;
}

/** Chama a API do Zernio. `path` começa com '/'. Body é serializado como JSON. */
export async function zernioFetch(
  path: string,
  apiKey: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<ZernioResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    ...(init.headers ?? {}),
  };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';

  const resp = await fetch(`${ZERNIO_BASE}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  let data: unknown = null;
  const text = await resp.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 300) };
    }
  }
  return { ok: resp.ok, status: resp.status, data };
}

/** Mensagem amigável (pt-BR) a partir de um erro do Zernio. */
export function zernioErrorMessage(result: ZernioResult): string {
  const d = result.data ?? {};
  if (d.reason === 'free_tier_exceeded' || d.code === 'PAYMENT_REQUIRED') {
    return 'Limite do plano gratuito do Zernio atingido (máx. 2 contas). Adicione um método de pagamento no painel do Zernio.';
  }
  if (typeof d.error === 'string' && d.error) return d.error;
  if (typeof d.message === 'string' && d.message) return d.message;
  return `Erro do Zernio (HTTP ${result.status}).`;
}
