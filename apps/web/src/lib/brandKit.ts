import { getSupabaseClient } from '@/lib/supabase';
import type { BrandKitOverrides } from '@/lib/presets/types';

export interface BrandKitData extends BrandKitOverrides {
  id: string;
  name: string;
}

interface BrandKitRow {
  id: string;
  name: string;
  colors: { primary?: string; accent?: string; background?: string; text?: string } | null;
  fonts: { heading?: { family?: string; url?: string }; body?: { family?: string; url?: string } } | null;
  logo_url: string | null;
}

function toOverrides(row: BrandKitRow): BrandKitData {
  return {
    id: row.id,
    name: row.name,
    colors: {
      bg: row.colors?.background,
      accent: row.colors?.accent ?? row.colors?.primary,
      text: row.colors?.text,
    },
    fonts: {
      heading: row.fonts?.heading,
      body: row.fonts?.body,
    },
    logoUrl: row.logo_url ?? undefined,
  };
}

const COLS = 'id, name, colors, fonts, logo_url';

/** Carrega o Brand Kit default (se houver) e mapeia para overrides do preset. */
export async function loadDefaultBrandKit(): Promise<BrandKitData | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from('brand_kits')
    .select(COLS)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return toOverrides(data as BrandKitRow);
}

/** Lista todos os Brand Kits (para o seletor). */
export async function listBrandKits(): Promise<BrandKitData[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client.from('brand_kits').select(COLS).order('name');
  if (error || !data) return [];
  return (data as BrandKitRow[]).map(toOverrides);
}

/** Carrega um Brand Kit por id. */
export async function loadBrandKitById(id: string): Promise<BrandKitData | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.from('brand_kits').select(COLS).eq('id', id).maybeSingle();
  if (error || !data) return null;
  return toOverrides(data as BrandKitRow);
}
