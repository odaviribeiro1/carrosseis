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
const PRESET_BUCKET = 'preset-images';
const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function parseSettings(raw: unknown): VisualSettings {
  const parsed = visualSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : (raw as VisualSettings);
}

type Client = NonNullable<ReturnType<typeof getSupabaseClient>>;

/**
 * Sobe uma imagem de referencia (data URL base64) para o Storage e devolve a URL
 * publica. Se ja for uma URL (http/https), retorna sem alterar — assim presets
 * antigos ou referencias ja hospedadas continuam funcionando.
 */
async function uploadReferenceImage(
  client: Client,
  userId: string,
  image: string,
  index: number,
): Promise<string> {
  if (!image.startsWith('data:')) return image;

  const mime = image.match(/^data:([^;]+);base64,/)?.[1] ?? 'image/png';
  const ext = MIME_EXT[mime] ?? 'png';
  const blob = await (await fetch(image)).blob();
  const path = `${userId}/${Date.now()}-${index}.${ext}`;

  const { error } = await client.storage
    .from(PRESET_BUCKET)
    .upload(path, blob, { contentType: mime, upsert: true });
  if (error) throw error;

  return client.storage.from(PRESET_BUCKET).getPublicUrl(path).data.publicUrl;
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

  // Imagens de referencia vivem no Storage; o preset guarda so as URLs (leve e
  // confiavel no round-trip pela API).
  const referenceImages = await Promise.all(
    (settings.referenceImages ?? []).map((img, i) => uploadReferenceImage(client, user.id, img, i)),
  );
  const lightSettings: VisualSettings = { ...settings, referenceImages };

  const { data, error } = await client
    .from('visual_presets')
    .insert({ name: name.trim(), settings: lightSettings, created_by: user.id })
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
