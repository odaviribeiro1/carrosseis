export type CredentialField = {
  key: string;
  label: string;
  helpText?: string;
  docsUrl?: string;
  placeholder?: string;
  inputType?: 'text' | 'password';
  validate: (value: string) => Promise<{ ok: boolean; message?: string }>;
};

export type SetupConfig = {
  toolName: string;
  toolSlug: string;
  appCredentials: CredentialField[];
  postBootstrapRedirect: string;
};

async function validateWithEndpoint(
  value: string,
  endpoint: string,
  headers: HeadersInit = {},
): Promise<{ ok: boolean; message?: string }> {
  if (!value.trim()) return { ok: false, message: 'Informe um valor.' };
  try {
    const res = await fetch(endpoint, { headers });
    return res.ok
      ? { ok: true }
      : { ok: false, message: 'Credencial invalida ou sem permissao.' };
  } catch {
    return { ok: false, message: 'Nao foi possivel validar agora. Confira o formato.' };
  }
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
      helpText: 'Usada para geracao de conteudo (LLM).',
      validate: async (value) =>
        validateWithEndpoint(value, 'https://api.openai.com/v1/models', {
          Authorization: `Bearer ${value}`,
        }),
    },
    {
      key: 'google_api_key',
      label: 'Gemini (Google AI) API Key',
      placeholder: 'AIza...',
      inputType: 'password',
      docsUrl: 'https://aistudio.google.com/app/apikey',
      helpText: 'Usada para geracao de imagens (Gemini) e transcricao.',
      validate: async (value) =>
        validateWithEndpoint(value, `https://generativelanguage.googleapis.com/v1beta/models?key=${value}`),
    },
  ],
};
