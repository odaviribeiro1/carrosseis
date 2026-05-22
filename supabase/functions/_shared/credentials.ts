import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';

const cache = new Map<string, { value: string | null; expiresAt: number }>();

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function decrypt(payload: string): Promise<string> {
  const [ivHex, tagHex, cipherHex] = payload.split(':');
  const keyHex = Deno.env.get('CRYPTO_KEY') ?? '';
  if (!ivHex || !tagHex || !cipherHex || !/^[a-f0-9]{64}$/i.test(keyHex)) {
    throw new Error('Configuracao de criptografia invalida');
  }
  const key = await crypto.subtle.importKey('raw', fromHex(keyHex), 'AES-GCM', false, ['decrypt']);
  const cipher = fromHex(`${cipherHex}${tagHex}`);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromHex(ivHex), tagLength: 128 }, key, cipher);
  return new TextDecoder().decode(decrypted);
}

export async function getCredential(key: string, ttlMs = 60_000): Promise<string | null> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) throw new Error('Supabase core ausente na Edge Function');

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin
    .from('app_settings')
    .select('value_encrypted')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;

  const value = data ? await decrypt(data.value_encrypted) : null;
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}
