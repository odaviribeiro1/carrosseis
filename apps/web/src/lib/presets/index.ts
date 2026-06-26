import type { Preset } from './types';
import { postX } from './post-x';
import { editorial } from './editorial';
import { boldMinimal } from './bold-minimal';
import { magazine } from './magazine';
import { techDark } from './tech-dark';

// Registry dos 5 presets curados.
export const PRESETS: Preset[] = [postX, editorial, boldMinimal, magazine, techDark];

export const DEFAULT_PRESET_ID = postX.id;

export function getPreset(id: string | null | undefined): Preset {
  return PRESETS.find((p) => p.id === id) ?? postX;
}

export * from './types';
export { mergeTokens } from './mergeTokens';
