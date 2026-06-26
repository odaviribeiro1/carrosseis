import { toPng } from 'html-to-image';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { FRAME_W, FRAME_H } from '@/components/render/SlideRenderer';

/**
 * Captura um nó DOM do `SlideRenderer` (frame 1080x1350) em PNG. Como é o MESMO
 * componente exibido no preview, o export é pixel-idêntico por construção.
 * O nó deve estar renderizado a 1:1 (scale=1) no momento da captura.
 */
export async function composeSlidePng(node: HTMLElement): Promise<Blob> {
  const dataUrl = await toPng(node, {
    width: FRAME_W,
    height: FRAME_H,
    pixelRatio: 1,
    cacheBust: true,
    skipFonts: false,
  });
  const res = await fetch(dataUrl);
  return res.blob();
}

/** Compõe vários nós 1:1 em blobs PNG (na ordem recebida). */
export async function composeSlideBlobs(
  nodes: HTMLElement[],
  onProgress?: (current: number, total: number) => void,
): Promise<Blob[]> {
  const blobs: Blob[] = [];
  for (let i = 0; i < nodes.length; i++) {
    onProgress?.(i + 1, nodes.length);
    blobs.push(await composeSlidePng(nodes[i]!));
  }
  return blobs;
}

/** Zipa blobs PNG e dispara o download. */
export function zipAndDownload(blobs: Blob[], filename = 'carrossel'): Promise<void> {
  const zip = new JSZip();
  blobs.forEach((blob, i) => zip.file(`slide-${String(i + 1).padStart(2, '0')}.png`, blob));
  return zip.generateAsync({ type: 'blob' }).then((content) => saveAs(content, `${filename}.zip`));
}

/** Baixa PNGs ja prontos (URLs, ex.: composed_image_url) como ZIP. */
export async function downloadUrlsAsZip(
  urls: Array<{ position: number; url: string }>,
  filename = 'carrossel',
): Promise<void> {
  const sorted = [...urls].filter((u) => u.url).sort((a, b) => a.position - b.position);
  const zip = new JSZip();
  for (let i = 0; i < sorted.length; i++) {
    const res = await fetch(sorted[i]!.url);
    if (!res.ok) throw new Error(`Falha ao baixar slide ${i + 1}`);
    zip.file(`slide-${String(i + 1).padStart(2, '0')}.png`, await res.blob());
  }
  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `${filename}.zip`);
}

/** Compõe vários slides (nós 1:1) e baixa como ZIP de PNGs 1080x1350. */
export async function downloadComposedZip(
  nodes: HTMLElement[],
  filename = 'carrossel',
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  const blobs = await composeSlideBlobs(nodes, onProgress);
  await zipAndDownload(blobs, filename);
}
