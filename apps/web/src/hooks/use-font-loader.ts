import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '@/lib/supabase';

interface CustomFont {
  id: string;
  family_name: string;
  font_url: string;
  format: string;
}

const MAGIC_BYTES: Record<string, number[]> = {
  woff2: [0x77, 0x4f, 0x46, 0x32],
  ttf: [0x00, 0x01, 0x00, 0x00],
  otf: [0x4f, 0x54, 0x54, 0x4f],
};

/**
 * Validates font file MIME type via magic bytes (not extension).
 */
export function validateFontMagicBytes(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer, 0, 4);
  for (const [format, magic] of Object.entries(MAGIC_BYTES)) {
    if (magic.every((b, i) => bytes[i] === b)) {
      return format;
    }
  }
  return null;
}

/**
 * Loads custom fonts via FontFace API.
 * Ensures fonts are loaded before canvas rendering.
 */
export function useFontLoader() {
  const [loaded, setLoaded] = useState(false);
  const [fontFamilies, setFontFamilies] = useState<string[]>([]);

  const { data: fonts } = useQuery({
    queryKey: ['custom-fonts'],
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data } = await client.from('custom_fonts').select('*');
      return (data ?? []) as CustomFont[];
    },
  });

  useEffect(() => {
    if (!fonts || fonts.length === 0) {
      setLoaded(true);
      return;
    }

    async function loadFonts() {
      const families: string[] = [];

      for (const font of fonts!) {
        try {
          const fontFace = new FontFace(
            font.family_name,
            `url(${font.font_url})`,
            { display: 'swap' }
          );

          const loadedFont = await fontFace.load();
          document.fonts.add(loadedFont);
          families.push(font.family_name);
        } catch (err) {
          console.warn(`Falha ao carregar fonte ${font.family_name}:`, err);
        }
      }

      setFontFamilies(families);
      setLoaded(true);
    }

    void loadFonts();
  }, [fonts]);

  return { loaded, fontFamilies, customFonts: fonts ?? [] };
}
