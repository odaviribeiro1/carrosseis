import type { ArtDirection } from '@content-hub/shared';
import type { VisualSettings } from '@/types/carousel';
import { getSupabaseClient } from '@/lib/supabase';

export interface ArtDirectionResult {
  artDirection: ArtDirection;
  hash: string;
  /** true quando a direcao de arte veio do cache (sem chamada ao GPT). */
  cached: boolean;
}

/**
 * Fingerprint estavel das imagens de referencia (data URLs base64) para o hash
 * de cache: contagem + tamanho de cada uma. Evita mandar megabytes de base64 so
 * para detectar mudanca, mas invalida o cache quando as referencias mudam.
 */
export function referenceImagesKey(referenceImages: string[]): string {
  return `${referenceImages.length}:${referenceImages.map((r) => r.length).join(',')}`;
}

/**
 * Gera (ou reusa do cache) a Direcao de Arte global do carrossel.
 *
 * A chamada real ao GPT acontece server-side na Edge Function
 * `generate-art-direction` (a `openai_api_key` nunca toca o browser). Passe
 * `force: true` para "Regerar direcao de arte" (ignora o cache).
 */
export async function generateArtDirection(params: {
  carouselId: string;
  content: string;
  visualSettings: VisualSettings;
  force?: boolean;
}): Promise<ArtDirectionResult> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase nao configurado');

  // Hash nao deve depender das imagens base64 inteiras — usa o fingerprint.
  const { referenceImages, ...visualForHash } = params.visualSettings;

  const { data, error } = await client.functions.invoke('generate-art-direction', {
    body: {
      carousel_id: params.carouselId,
      content: params.content,
      visual_settings: visualForHash,
      reference_images_key: referenceImagesKey(referenceImages),
      force: params.force ?? false,
    },
  });

  if (error) {
    let message = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const parsed = await ctx.json();
        if (parsed?.error) message = parsed.error;
      } catch {
        /* corpo nao-JSON: mantem a mensagem original */
      }
    }
    throw new Error(message);
  }

  const result = data as { art_direction?: ArtDirection; hash?: string; cached?: boolean; error?: string };
  if (result?.error || !result?.art_direction) {
    throw new Error(result?.error ?? 'Direcao de arte vazia');
  }
  return {
    artDirection: result.art_direction,
    hash: result.hash ?? '',
    cached: Boolean(result.cached),
  };
}
