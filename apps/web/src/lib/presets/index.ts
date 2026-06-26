import type { Preset } from './types';
import { postX } from './post-x';
import { editorial } from './editorial';

// Registry dos presets curados. Fase 1: 2 presets. Fase 2 adiciona 3.
export const PRESETS: Preset[] = [postX, editorial];

export const DEFAULT_PRESET_ID = postX.id;

export function getPreset(id: string | null | undefined): Preset {
  return PRESETS.find((p) => p.id === id) ?? postX;
}

export * from './types';
export { mergeTokens } from './mergeTokens';
