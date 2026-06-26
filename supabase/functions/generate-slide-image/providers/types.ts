// Interface comum dos providers de geracao de imagem de slide.
// Cada provider recebe o prompt (texto rico ja montado), as imagens de
// referencia (data URL / URL http / base64 puro) e a API key, e devolve os
// bytes PNG da imagem + qual modelo foi usado.

export interface GenOpts {
  prompt: string;
  refs: string[];
  apiKey: string;
}

export interface GenResult {
  bytes: Uint8Array;
  modelUsed: string;
}

export interface ImageProvider {
  generate(opts: GenOpts): Promise<GenResult>;
}

// Erro de provider com mensagem pt-BR pronta para o usuario e um code opcional
// para o roteador decidir o status HTTP (ex.: RATE_LIMIT -> 429).
export class ProviderError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}
