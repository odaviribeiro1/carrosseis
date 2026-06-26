export type CredentialField = {
  key: string;
  label: string;
  helpText?: string;
  docsUrl?: string;
  placeholder?: string;
  inputType?: 'text' | 'password';
  // Opcional => nao aparece no wizard inicial e nao trava a finalizacao do setup.
  // Continua editavel na aba Credenciais (Configuracoes).
  optional?: boolean;
  validate: (value: string) => Promise<{ ok: boolean; message?: string }>;
};

export type SetupConfig = {
  toolName: string;
  toolSlug: string;
  appCredentials: CredentialField[];
  postBootstrapRedirect: string;
};

async function validateWithFormat(
  value: string,
  prefix: string | string[],
  minLength: number,
): Promise<{ ok: boolean; message?: string }> {
  if (!value.trim()) return { ok: false, message: 'Informe um valor.' };
  const prefixes = Array.isArray(prefix) ? prefix : [prefix];
  if (!prefixes.some((p) => value.startsWith(p))) {
    return { ok: false, message: `Deve comecar com ${prefixes.join(' ou ')}` };
  }
  if (value.length < minLength) return { ok: false, message: `Deve ter no minimo ${minLength} caracteres` };
  return { ok: true };
}

export const setupConfig: SetupConfig = {
  toolName: 'Content Hub',
  toolSlug: 'content-hub',
  postBootstrapRedirect: '/',
  appCredentials: [
    {
      key: 'openai_api_key',
      label: 'OpenAI API Key',
      placeholder: 'sk-...',
      inputType: 'password',
      docsUrl: 'https://platform.openai.com/api-keys',
      helpText: 'Obrigatoria. Usada para geracao de imagens (GPT Image 2), direcao de arte, OCR (GPT-4o Vision) e transcricao de Reels (Whisper).',
      validate: async (value) =>
        validateWithFormat(value, 'sk-', 20),
    },
    {
      key: 'google_api_key',
      label: 'Gemini (Google AI) API Key',
      placeholder: 'AIza... ou AQ....',
      inputType: 'password',
      optional: true,
      docsUrl: 'https://aistudio.google.com/app/apikey',
      helpText: 'Opcional. Necessaria apenas para o gerador de imagem Google Nano Banana e para transcricao de videos do YouTube/Shorts (Gemini).',
      validate: async (value) =>
        // Google AI Studio emite chaves no formato classico (AIza...) e no formato novo (AQ....).
        validateWithFormat(value, ['AIza', 'AQ.'], 20),
    },
    {
      key: 'apify_token',
      label: 'Apify API Token',
      placeholder: 'apify_api_...',
      inputType: 'password',
      optional: true,
      docsUrl: 'https://console.apify.com/account/integrations',
      helpText: 'Opcional. Usado para extrair posts/carrosseis/reels do Instagram.',
      validate: async (value) =>
        validateWithFormat(value, 'apify_api_', 20),
    },
  ],
};
