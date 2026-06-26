import { type GenOpts, type GenResult, type ImageProvider, ProviderError } from './types.ts';

// Provider OPCIONAL: Google Gemini (Nano Banana). Mantem a logica existente —
// inlineData para as referencias + fallback de modelo Gemini (2 -> Pro).
const MODELS = ['gemini-3.1-flash-image', 'gemini-3-pro-image'];

async function toInlinePart(
  ref: string,
): Promise<{ inlineData: { mimeType: string; data: string } }> {
  const dataUrl = ref.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (dataUrl) {
    return { inlineData: { mimeType: dataUrl[1], data: dataUrl[2] } };
  }
  if (/^https?:\/\//.test(ref)) {
    const imgResp = await fetch(ref);
    if (!imgResp.ok) throw new ProviderError(`Imagem de referencia inacessivel (status ${imgResp.status}).`);
    const mimeType = imgResp.headers.get('content-type') || 'image/png';
    const buf = new Uint8Array(await imgResp.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return { inlineData: { mimeType, data: btoa(bin) } };
  }
  return { inlineData: { mimeType: 'image/png', data: ref } };
}

export const nanoBanana: ImageProvider = {
  async generate({ prompt, refs, apiKey }: GenOpts): Promise<GenResult> {
    const referenceParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
    for (const ref of refs) referenceParts.push(await toInlinePart(ref));

    let imageBase64 = '';
    let usedModel = '';
    let lastError = '';
    for (const model of MODELS) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }, ...referenceParts] }],
              generationConfig: {
                responseModalities: ['TEXT', 'IMAGE'],
                imageConfig: { aspectRatio: '3:4' },
              },
            }),
          },
        );
        if (!resp.ok) {
          lastError = `${model}: ${resp.status} - ${(await resp.text()).slice(0, 300)}`;
          continue;
        }
        const data = await resp.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.mimeType?.startsWith('image/')) {
            imageBase64 = part.inlineData.data;
            usedModel = model;
            break;
          }
        }
        if (imageBase64) break;
        lastError = `${model}: sem imagem na resposta`;
      } catch (err) {
        lastError = `${model}: ${String(err)}`;
      }
    }

    if (!imageBase64) {
      throw new ProviderError(`Falha ao gerar imagem (Nano Banana). ${lastError}`);
    }
    const bytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
    return { bytes, modelUsed: usedModel };
  },
};
