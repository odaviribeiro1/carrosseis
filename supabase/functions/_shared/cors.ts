import { getCredential } from './credentials.ts';

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;

  // Allow localhost on any port (development)
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;

  // Allow 127.0.0.1 on any port (development)
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true;

  // Allow Supabase domains
  if (/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(origin)) return true;

  // Allow Vercel preview and production domains
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return true;

  return false;
}

async function isAllowedOriginWithSettings(origin: string): Promise<boolean> {
  if (isAllowedOrigin(origin)) return true;

  // Allow extra origin from app_settings (self-hosted custom domain)
  const extra = await getCredential('frontend_origin').catch(() => null) ?? '';
  if (extra && origin === extra) return true;

  return false;
}

export async function getCorsHeaders(req: Request): Promise<Record<string, string>> {
  const origin = req.headers.get('Origin') ?? '';
  const allowedOrigin = await isAllowedOriginWithSettings(origin) ? origin : '';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };
}

// Backward-compatible export for OPTIONS preflight responses.
// Uses a restrictive default; edge functions should prefer getCorsHeaders(req).
export const corsHeaders = {
  'Access-Control-Allow-Origin': '',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
