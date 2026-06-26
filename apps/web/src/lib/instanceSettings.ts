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

// Identidade do post (Post do X) padrão da instância — nome, @ e avatar
// reaproveitados em todo carrossel novo, para não preencher a cada vez.
export interface DefaultSocialProfile {
  name: string;
  handle: string;
  avatar_url: string | null;
}

/** Lê a identidade do post padrão (singleton). Null se nada estiver preenchido. */
export async function getDefaultSocialProfile(): Promise<DefaultSocialProfile | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client
    .from('instance_settings')
    .select('default_social_profile')
    .limit(1)
    .maybeSingle();
  const raw = (data?.default_social_profile ?? null) as Partial<DefaultSocialProfile> | null;
  if (!raw) return null;
  const profile: DefaultSocialProfile = {
    name: raw.name ?? '',
    handle: raw.handle ?? '',
    avatar_url: raw.avatar_url ?? null,
  };
  if (!profile.name && !profile.handle && !profile.avatar_url) return null;
  return profile;
}

/** Define a identidade do post padrão. RLS exige role owner. */
export async function setDefaultSocialProfile(profile: DefaultSocialProfile): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase nao configurado');
  const { error } = await client
    .from('instance_settings')
    .update({ default_social_profile: profile, updated_at: new Date().toISOString() })
    .eq('id', true);
  if (error) throw error;
}
