import { type GenOpts, type GenResult, type ImageProvider, ProviderError } from './types.ts';

// Provider PADRAO: OpenAI GPT Image 2. Sem fallback de modelo — apenas gpt-image-2.
// 4:5 nativo (1024x1280, multiplo de 16). O Konva escala para 1080x1350 no
// editor/export, sem normalizacao server-side.
const MODEL = 'gpt-image-2';
const SIZE = '1024x1280'; // 4:5 exato; W e H divisiveis por 16
const QUALITY = 'medium';
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Refaz a requisicao em caso de 429 (rate limit) com backoff exponencial + jitter.
async function fetchWithBackoff(makeReq: () => Promise<Response>): Promise<Response> {
  let delay = 1500;
  for (let attempt = 0; ; attempt += 1) {
    const resp = await makeReq();
    if (resp.status !== 429 || attempt >= MAX_RETRIES) return resp;
    const jitter = Math.floor(Math.random() * 400);
    console.warn(`[gpt-image] 429 rate limit, retry ${attempt + 1}/${MAX_RETRIES} em ${delay}ms`);
    await sleep(delay + jitter);
    delay *= 2;
  }
}

// Converte uma referencia (data URL / URL http / base64 puro) em Blob para multipart.
async function refToBlob(ref: string): Promise<Blob> {
  const dataUrl = ref.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrl) {
    const bytes = Uint8Array.from(atob(dataUrl[2]), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: dataUrl[1] });
  }
  if (/^https?:\/\//.test(ref)) {
    const r = await fetch(ref);
    if (!r.ok) throw new ProviderError(`Imagem de referencia inacessivel (status ${r.status}).`);
    const buf = new Uint8Array(await r.arrayBuffer());
    return new Blob([buf], { type: r.headers.get('content-type') || 'image/png' });
  }
  const bytes = Uint8Array.from(atob(ref), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: 'image/png' });
}

// Trata a resposta da OpenAI: extrai a imagem ou lanca ProviderError com mensagem pt-BR.
async function readImage(resp: Response): Promise<Uint8Array> {
  if (!resp.ok) {
    const text = await resp.text();
    // Organizacao nao verificada (gpt-image-2 exige verificacao por organizacao).
    if (resp.status === 403 || /verif/i.test(text)) {
      throw new ProviderError(
        'Sua organizacao na OpenAI precisa ser verificada para usar o gpt-image-2. ' +
          'Verifique em https://platform.openai.com/settings/organization/general e tente novamente.',
        'ORG_NOT_VERIFIED',
      );
    }
    if (resp.status === 429) {
      throw new ProviderError(
        'Limite de requisicoes da OpenAI atingido. Aguarde alguns instantes e tente novamente.',
        'RATE_LIMIT',
      );
    }
    throw new ProviderError(`OpenAI ${resp.status}: ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new ProviderError('A OpenAI nao retornou imagem.');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export const gptImage: ImageProvider = {
  async generate({ prompt, refs, apiKey }: GenOpts): Promise<GenResult> {
    const auth = { Authorization: `Bearer ${apiKey}` };

    // Com imagens de referencia -> /v1/images/edits (multipart, image[] multiplas).
    if (refs.length > 0) {
      const blobs = await Promise.all(refs.map(refToBlob));
      const resp = await fetchWithBackoff(() => {
        const form = new FormData();
        form.append('model', MODEL);
        form.append('prompt', prompt);
        form.append('size', SIZE);
        form.append('quality', QUALITY);
        form.append('output_format', 'png');
        for (const blob of blobs) form.append('image[]', blob, 'ref.png');
        return fetch('https://api.openai.com/v1/images/edits', {
          method: 'POST',
          headers: auth, // sem Content-Type: o FormData define o boundary
          body: form,
        });
      });
      return { bytes: await readImage(resp), modelUsed: MODEL };
    }

    // Sem referencias -> /v1/images/generations (JSON).
    const resp = await fetchWithBackoff(() =>
      fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          prompt,
          size: SIZE,
          quality: QUALITY,
          output_format: 'png',
          n: 1,
        }),
      }),
    );
    return { bytes: await readImage(resp), modelUsed: MODEL };
  },
};
