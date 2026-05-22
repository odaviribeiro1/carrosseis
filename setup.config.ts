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
      key: 'llm_provider',
      label: 'Provider padrao de IA',
      placeholder: 'openai',
      inputType: 'text',
      helpText: 'Use openai, anthropic, google ou groq.',
      validate: async (value) => {
        const valid = ['openai', 'anthropic', 'google', 'groq'].includes(value.trim().toLowerCase());
        return valid ? { ok: true } : { ok: false, message: 'Use openai, anthropic, google ou groq.' };
      },
    },
    {
      key: 'llm_model',
      label: 'Modelo padrao de IA',
      placeholder: 'gpt-4o',
      inputType: 'text',
      helpText: 'Opcional. Se vazio, a ferramenta usa o modelo default do provider.',
      validate: async () => ({ ok: true }),
    },
    {
      key: 'openai_api_key',
      label: 'OpenAI API Key',
      placeholder: 'sk-...',
      inputType: 'password',
      docsUrl: 'https://platform.openai.com/api-keys',
      helpText: 'Usada para geracao de conteudo quando o provider for OpenAI.',
      validate: async (value) =>
        validateWithEndpoint(value, 'https://api.openai.com/v1/models', {
          Authorization: `Bearer ${value}`,
        }),
    },
    {
      key: 'anthropic_api_key',
      label: 'Anthropic API Key',
      placeholder: 'sk-ant-...',
      inputType: 'password',
      docsUrl: 'https://console.anthropic.com/settings/keys',
      helpText: 'Usada para geracao de conteudo quando o provider for Anthropic.',
      validate: async (value) =>
        validateWithEndpoint(value, 'https://api.anthropic.com/v1/models', {
          'x-api-key': value,
          'anthropic-version': '2023-06-01',
        }),
    },
    {
      key: 'google_api_key',
      label: 'Google AI API Key',
      placeholder: 'AIza...',
      inputType: 'password',
      docsUrl: 'https://aistudio.google.com/app/apikey',
      helpText: 'Usada para Gemini, transcricao de YouTube e fallback de imagens.',
      validate: async (value) =>
        validateWithEndpoint(value, `https://generativelanguage.googleapis.com/v1beta/models?key=${value}`),
    },
    {
      key: 'groq_api_key',
      label: 'Groq API Key',
      placeholder: 'gsk_...',
      inputType: 'password',
      docsUrl: 'https://console.groq.com/keys',
      helpText: 'Usada para geracao de conteudo quando o provider for Groq.',
      validate: async (value) =>
        validateWithEndpoint(value, 'https://api.groq.com/openai/v1/models', {
          Authorization: `Bearer ${value}`,
        }),
    },
    {
      key: 'gemini_imagen_api_key',
      label: 'Gemini Imagen API Key',
      placeholder: 'AIza...',
      inputType: 'password',
      docsUrl: 'https://aistudio.google.com/app/apikey',
      helpText: 'Opcional. Se vazio, a geracao de imagem usa Google AI API Key.',
      validate: async (value) =>
        validateWithEndpoint(value, `https://generativelanguage.googleapis.com/v1beta/models?key=${value}`),
    },
    {
      key: 'resend_api_key',
      label: 'Resend API Key',
      placeholder: 're_...',
      inputType: 'password',
      docsUrl: 'https://resend.com/api-keys',
      helpText: 'Opcional. Envia emails de convite; sem ela, o link pode ser copiado manualmente.',
      validate: async (value) =>
        validateWithEndpoint(value, 'https://api.resend.com/domains', {
          Authorization: `Bearer ${value}`,
        }),
    },
    {
      key: 'email_from',
      label: 'Email remetente',
      placeholder: 'noreply@seudominio.com',
      inputType: 'text',
      helpText: 'Opcional. Precisa ser um remetente verificado no Resend.',
      validate: async (value) => {
        if (!value.trim()) return { ok: true };
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
          ? { ok: true }
          : { ok: false, message: 'Informe um email valido.' };
      },
    },
    {
      key: 'app_url',
      label: 'URL publica do app',
      placeholder: 'https://content.seudominio.com',
      inputType: 'text',
      helpText: 'Opcional. Usada para montar links de convite em email.',
      validate: async (value) => {
        if (!value.trim()) return { ok: true };
        try {
          const url = new URL(value);
          return url.protocol === 'https:'
            ? { ok: true }
            : { ok: false, message: 'Use uma URL https.' };
        } catch {
          return { ok: false, message: 'Informe uma URL valida.' };
        }
      },
    },
    {
      key: 'frontend_origin',
      label: 'Origem CORS customizada',
      placeholder: 'https://content.seudominio.com',
      inputType: 'text',
      helpText: 'Opcional. Necessario apenas para dominio proprio fora de *.vercel.app.',
      validate: async (value) => {
        if (!value.trim()) return { ok: true };
        try {
          const url = new URL(value);
          return url.protocol === 'https:'
            ? { ok: true }
            : { ok: false, message: 'Use uma origem https.' };
        } catch {
          return { ok: false, message: 'Informe uma origem valida.' };
        }
      },
    },
  ],
};
