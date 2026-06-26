import type { Preset } from './types';
import { postX } from './post-x';
import { postXDark } from './post-x-dark';
import { editorial } from './editorial';
import { boldMinimal } from './bold-minimal';
import { magazine } from './magazine';
import { techDark } from './tech-dark';

// Registry dos presets curados.
export const PRESETS: Preset[] = [postX, postXDark, editorial, boldMinimal, magazine, techDark];

export const DEFAULT_PRESET_ID = postX.id;

/** Presets que usam o header social (avatar/nome/@/selo). */
export const SOCIAL_PRESET_IDS = ['post-x', 'post-x-dark'];
export const isSocialPreset = (id: string | null | undefined): boolean =>
  SOCIAL_PRESET_IDS.includes(id ?? '');

export function getPreset(id: string | null | undefined): Preset {
  return PRESETS.find((p) => p.id === id) ?? postX;
}

export * from './types';
export { mergeTokens } from './mergeTokens';
