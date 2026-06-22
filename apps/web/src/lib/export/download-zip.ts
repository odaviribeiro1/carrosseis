import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export interface SlideImage {
  position: number;
  url: string;
}

/**
 * Baixa as imagens dos slides (URLs do Supabase Storage) como um ZIP de PNGs.
 * Substitui o antigo render via Konva — agora cada slide ja e uma imagem pronta.
 */
export async function downloadImagesAsZip(
  images: SlideImage[],
  filename: string = 'carrossel',
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  const zip = new JSZip();
  const sorted = [...images].filter((img) => img.url).sort((a, b) => a.position - b.position);

  for (let i = 0; i < sorted.length; i++) {
    const img = sorted[i];
    if (!img) continue;
    onProgress?.(i + 1, sorted.length);
    const res = await fetch(img.url);
    if (!res.ok) throw new Error(`Falha ao baixar slide ${i + 1}`);
    const blob = await res.blob();
    zip.file(`slide-${String(i + 1).padStart(2, '0')}.png`, blob);
  }

  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `${filename}.zip`);
}
