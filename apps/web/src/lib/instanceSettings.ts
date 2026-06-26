import { getSupabaseClient } from '@/lib/supabase';

// CTA fixo global da instância (slide final padrão de todo carrossel).
export interface DefaultCta {
  enabled: boolean;
  title: string;
  body: string;
  button: string;
}

export const EMPTY_CTA: DefaultCta = { enabled: false, title: '', body: '', button: '' };

/** Lê o CTA fixo global (singleton). Retorna null se não configurado. */
export async function getDefaultCta(): Promise<DefaultCta | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client
    .from('instance_settings')
    .select('default_cta')
    .limit(1)
    .maybeSingle();
  const raw = (data?.default_cta ?? null) as Partial<DefaultCta> | null;
  if (!raw) return null;
  return {
    enabled: Boolean(raw.enabled),
    title: raw.title ?? '',
    body: raw.body ?? '',
    button: raw.button ?? '',
  };
}

/** Define o CTA fixo global. RLS exige role owner. */
export async function setDefaultCta(cta: DefaultCta): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase nao configurado');
  const { error } = await client
    .from('instance_settings')
    .update({ default_cta: cta, updated_at: new Date().toISOString() })
    .eq('id', true);
  if (error) throw error;
}
