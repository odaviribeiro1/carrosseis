import { getSupabaseClient } from '@/lib/supabase';

export type ImageProviderId = 'gpt_image' | 'nano_banana';

export const IMAGE_PROVIDER_LABELS: Record<ImageProviderId, string> = {
  gpt_image: 'GPT Image (OpenAI)',
  nano_banana: 'Google Nano Banana',
};

/** Le o modelo de imagem padrao da instancia (singleton). Default: gpt_image. */
export async function getInstanceImageProvider(): Promise<ImageProviderId> {
  const client = getSupabaseClient();
  if (!client) return 'gpt_image';
  const { data } = await client
    .from('instance_settings')
    .select('image_provider')
    .limit(1)
    .maybeSingle();
  return (data?.image_provider as ImageProviderId) ?? 'gpt_image';
}

/** Define o modelo de imagem padrao da instancia. RLS exige role owner. */
export async function setInstanceImageProvider(provider: ImageProviderId): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase nao configurado');
  const { error } = await client
    .from('instance_settings')
    .update({ image_provider: provider, updated_at: new Date().toISOString() })
    .eq('id', true);
  if (error) throw error;
}
