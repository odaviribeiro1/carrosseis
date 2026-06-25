import { getSupabaseClient } from '@/lib/supabase';
import { visualSettingsSchema, type VisualSettings } from '@/types/carousel';

export interface VisualPreset {
  id: string;
  name: string;
  settings: VisualSettings;
  created_by: string;
  created_at: string;
}

const SELECT_COLS = 'id, name, settings, created_by, created_at';

function parseSettings(raw: unknown): VisualSettings {
  const parsed = visualSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : (raw as VisualSettings);
}

/** Lista os presets de aspectos visuais compartilhados (mais recentes primeiro). */
export async function listVisualPresets(): Promise<VisualPreset[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from('visual_presets')
    .select(SELECT_COLS)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    settings: parseSettings(row.settings),
    created_by: row.created_by as string,
    created_at: row.created_at as string,
  }));
}

/** Salva os aspectos visuais atuais como um preset nomeado (inclui as imagens de referencia). */
export async function saveVisualPreset(name: string, settings: VisualSettings): Promise<VisualPreset> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase nao configurado');
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('Nao autenticado');

  const { data, error } = await client
    .from('visual_presets')
    .insert({ name: name.trim(), settings, created_by: user.id })
    .select(SELECT_COLS)
    .single();
  if (error) throw error;
  return {
    id: data.id as string,
    name: data.name as string,
    settings: parseSettings(data.settings),
    created_by: data.created_by as string,
    created_at: data.created_at as string,
  };
}

/** Exclui um preset (RLS garante que apenas o criador consegue). */
export async function deleteVisualPreset(id: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase nao configurado');
  const { error } = await client.from('visual_presets').delete().eq('id', id);
  if (error) throw error;
}
