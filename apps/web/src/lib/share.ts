import { getSupabaseClient } from '@/lib/supabase';

export interface ShareImage {
  position: number;
  url: string;
}

export interface ShareData {
  caption: string;
  imageUrls: ShareImage[];
  expired: boolean;
}

/**
 * Cria um link temporário (24h) para enviar o carrossel ao celular. Grava um
 * snapshot ordenado das URLs públicas + a legenda. Retorna o token.
 */
export async function createShareLink(
  carouselId: string,
  caption: string,
  imageUrls: ShareImage[],
): Promise<string> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase nao configurado');
  const token = crypto.randomUUID();
  const ordered = [...imageUrls].sort((a, b) => a.position - b.position);
  const { error } = await client.from('share_links').insert({
    carousel_id: carouselId,
    token,
    caption,
    image_urls: ordered,
  });
  if (error) throw error;
  return token;
}

/** Atualiza a legenda do link (reflete na página mobile). RLS: autenticado. */
export async function updateShareCaption(token: string, caption: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase nao configurado');
  const { error } = await client.from('share_links').update({ caption }).eq('token', token);
  if (error) throw error;
}

/**
 * Lê um link compartilhado pela página mobile (anon). Usa o RPC SECURITY DEFINER
 * `public.get_share` — o client default aponta para `content_hub`, então o RPC
 * em `public` é chamado via `.schema('public')`.
 */
export async function getShare(token: string): Promise<ShareData | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.schema('public').rpc('get_share', { p_token: token });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const rawUrls = (row.image_urls ?? []) as ShareImage[];
  return {
    caption: row.caption ?? '',
    imageUrls: [...rawUrls].sort((a, b) => a.position - b.position),
    expired: Boolean(row.expired),
  };
}
