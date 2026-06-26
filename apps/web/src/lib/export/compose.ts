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

/** Compõe vários slides (nós 1:1) e baixa como ZIP de PNGs 1080x1350. */
export async function downloadComposedZip(
  nodes: HTMLElement[],
  filename = 'carrossel',
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  const zip = new JSZip();
  for (let i = 0; i < nodes.length; i++) {
    onProgress?.(i + 1, nodes.length);
    const blob = await composeSlidePng(nodes[i]!);
    zip.file(`slide-${String(i + 1).padStart(2, '0')}.png`, blob);
  }
  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `${filename}.zip`);
}
