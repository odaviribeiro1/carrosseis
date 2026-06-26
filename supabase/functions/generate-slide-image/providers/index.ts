import type { ImageProvider } from './types.ts';
import { gptImage } from './gptImage.ts';
import { nanoBanana } from './nanoBanana.ts';

export type ProviderName = 'gpt_image' | 'nano_banana';

// Roteia pelo provider salvo no carrossel. Default: gpt_image.
export function getProvider(name: string | null | undefined): {
  provider: ImageProvider;
  name: ProviderName;
} {
  if (name === 'nano_banana') return { provider: nanoBanana, name: 'nano_banana' };
  return { provider: gptImage, name: 'gpt_image' };
}

export { ProviderError } from './types.ts';
export type { GenOpts, GenResult, ImageProvider } from './types.ts';
