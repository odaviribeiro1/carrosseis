import { useCallback, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { Check, Eye, EyeOff, ExternalLink, Loader2, X } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { setupConfig } from '../../../../../setup.config';
import { CredentialField } from '@/components/credentials/CredentialField';
import { isSupabaseConfigured, getSupabaseClient } from '@/lib/supabase';
import { clearStep2, loadStep2, persistStep2 } from '@/lib/setup-persistence';

const STEP_SESSION_KEY = 'agentise.setup.step';
const TOKEN_SESSION_KEY = 'agentise.setup.owner_token';

type CoreValues = {
  supabase_url: string;
  supabase_anon_key: string;
  supabase_service_role_key: string;
  supabase_pat: string;
  vercel_token: string;
  owner_email: string;
  owner_password: string;
};

const emptyCoreValues: CoreValues = {
  supabase_url: '',
  supabase_anon_key: '',
  supabase_service_role_key: '',
  supabase_pat: '',
  vercel_token: '',
  owner_email: '',
  owner_password: '',
};

const stepLabels = ['PREPARAR', 'CREDENCIAIS', 'BOOTSTRAP', 'APIS'];

const BOOTSTRAP_STEPS = [
  'Conectando ao Supabase',
  'Rodando migrations',
  'Deployando Edge Functions',
  'Criando conta de administrador',
  'Configurando Vercel',
  'Disparando redeploy',
  'Aguardando aplicacao reiniciar',
];

type TokenProxyType = 'supabase_anon_key' | 'supabase_service_role_key' | 'supabase_pat' | 'vercel_token';

// Correcao 3: tokens core sao validados server-side via /api/validate-token.
// O valor nunca trafega do browser direto para as APIs externas (Supabase/Vercel).
async function validateTokenViaProxy(
  type: TokenProxyType,
  value: string,
  supabaseUrl?: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch('/api/validate-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, value, supabase_url: supabaseUrl }),
    });
    const data = await res.json();
    return { ok: Boolean(data.valid), message: data.message };
  } catch {
    return { ok: false, message: 'Servico de validacao indisponivel, tente novamente em alguns minutos.' };
  }
}

// KI-001: acompanha o redeploy via proxy server-side. Resolve true quando READY,
// false em timeout (5 min) ou estado de falha. Backoff de 3s entre tentativas.
async function waitForDeployment(deploymentId: string, vercelToken: string): Promise<boolean> {
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch('/api/deployment-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deployment_id: deploymentId, vercel_token: vercelToken }),
      });
      const data = await res.json();
      if (data.state === 'READY') return true;
      if (data.state === 'ERROR' || data.state === 'CANCELED') return false;
    } catch {
      // transitorio — continua tentando ate o deadline
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return false;
}

function restoreSessionStep(): number {
  try {
    const saved = sessionStorage.getItem(STEP_SESSION_KEY);
    if (saved) {
      const n = Number(saved);
      if (n >= 1 && n <= 4) return n;
    }
  } catch {}
  return Number(new URLSearchParams(location.search).get('step') ?? '1');
}

function restoreSessionToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_SESSION_KEY);
  } catch {
    return null;
  }
}

function saveSessionStep(step: number) {
  try { sessionStorage.setItem(STEP_SESSION_KEY, String(step)); } catch {}
}

function saveSessionToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_SESSION_KEY, token);
    else sessionStorage.removeItem(TOKEN_SESSION_KEY);
  } catch {}
}

export function SetupPage() {
  const [step, setStep] = useState(() => restoreSessionStep());
  const [coreValues, setCoreValues] = useState<CoreValues>(emptyCoreValues);
  const [valid, setValid] = useState<Record<keyof CoreValues, boolean>>({} as Record<keyof CoreValues, boolean>);
  const [bootstrapState, setBootstrapState] = useState<string[]>([]);
  const [bootstrapError, setBootstrapError] = useState('');
  const [loginWarning, setLoginWarning] = useState('');
  const [ownerAccessToken, setOwnerAccessToken] = useState<string | null>(restoreSessionToken());
  const [appCredentials, setAppCredentials] = useState<Record<string, string>>({});
  const [appValid, setAppValid] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Espelho dos valores atuais para o validador (identidade estavel, leitura sempre fresca).
  const coreValuesRef = useRef(coreValues);
  coreValuesRef.current = coreValues;

  useEffect(() => {
    saveSessionStep(step);
  }, [step]);

  useEffect(() => {
    saveSessionToken(ownerAccessToken);
  }, [ownerAccessToken]);

  useEffect(() => {
    const saved = loadStep2();
    if (saved) {
      // Campos sensiveis nunca vem do localStorage — comecam sempre vazios.
      setCoreValues((current) => ({ ...current, ...saved, owner_password: '' }));
    }
  }, []);

  useEffect(() => {
    persistStep2(coreValues);
  }, [coreValues]);

  const allCoreValid = useMemo(
    () => (Object.keys(emptyCoreValues) as Array<keyof CoreValues>).every((key) => valid[key]),
    [valid],
  );

  const requiredAppFields = setupConfig.appCredentials.filter((field) =>
    ['openai_api_key', 'google_api_key'].includes(field.key),
  );
  const allAppValid = requiredAppFields.every((field) => appValid[field.key]);

  const updateCore = useCallback((key: keyof CoreValues, value: string) => {
    setCoreValues((current) => ({ ...current, [key]: value }));
  }, []);

  const handleCoreValid = useCallback((key: keyof CoreValues, ok: boolean) => {
    setValid((current) => ({ ...current, [key]: ok }));
  }, []);

  // Identidade estavel obrigatoria: o CredentialField chama estes handlers de dentro de um
  // useEffect que os tem como dependencia. Arrow inline -> loop infinito de render -> trava.
  const updateAppCredential = useCallback((key: string, value: string | null) => {
    setAppCredentials((current) => ({ ...current, [key]: value ?? '' }));
  }, []);

  const handleAppValid = useCallback((key: string, isValid: boolean) => {
    setAppValid((current) => ({ ...current, [key]: isValid }));
  }, []);

  const validateCore = useCallback(
    async (key: keyof CoreValues, value: string): Promise<{ ok: boolean; message?: string }> => {
      switch (key) {
        case 'supabase_url':
          return /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(value)
            ? { ok: true }
            : { ok: false, message: 'Use o formato https://xxxx.supabase.co' };
        case 'owner_email':
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
            ? { ok: true }
            : { ok: false, message: 'Informe um email valido.' };
        case 'owner_password':
          return value.length >= 8 && /[a-zA-Z]/.test(value) && /\d/.test(value)
            ? { ok: true }
            : { ok: false, message: 'Minimo 8 caracteres, com letras e numeros.' };
        case 'supabase_anon_key':
        case 'supabase_service_role_key':
          return validateTokenViaProxy(key, value, coreValuesRef.current.supabase_url);
        case 'supabase_pat':
          return validateTokenViaProxy('supabase_pat', value);
        case 'vercel_token':
          return validateTokenViaProxy('vercel_token', value);
        default:
          return { ok: true };
      }
    },
    [],
  );

  async function runBootstrap() {
    setStep(3);
    setBootstrapError('');
    setLoginWarning('');
    setBootstrapState(['Conectando ao Supabase']);
    try {
      const res = await fetch('/api/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coreValues),
      });
      // O bootstrap pode estourar o tempo da function (504), e nesse caso a Vercel responde
      // com texto, nao JSON. Tratamos isso para mostrar uma mensagem util de retry em vez de
      // "Unexpected token ... is not valid JSON". O bootstrap e idempotente: basta tentar de novo.
      const raw = await res.text();
      let data: { success?: boolean; message?: string; deployment_id?: string } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        if (res.status === 504 || res.status === 502) {
          throw new Error(
            'O bootstrap excedeu o tempo limite antes de concluir. Ele salva o progresso a cada etapa — clique em "Tentar" novamente para continuar de onde parou.',
          );
        }
        throw new Error(`Resposta inesperada do servidor (HTTP ${res.status}). Tente novamente.`);
      }
      if (!res.ok || !data.success) throw new Error(data.message ?? 'Bootstrap falhou');

      // Passos concluidos ate o disparo do redeploy.
      setBootstrapState(BOOTSTRAP_STEPS.slice(0, 6));

      // KI-001: esperar o redeploy ficar READY antes do Step 4 — so assim as envs core ficam
      // ativas nas API Routes (/api/credentials etc.). Sem isso o Step 4 renderiza cedo demais
      // e o save quebra com 500.
      const deploymentId = typeof data.deployment_id === 'string' ? data.deployment_id : '';
      if (deploymentId) {
        const ready = await waitForDeployment(deploymentId, coreValues.vercel_token);
        if (!ready) {
          setBootstrapError('O redeploy esta demorando mais que o esperado. Acompanhe no painel da Vercel e tente de novo.');
          return;
        }
      }
      setBootstrapState(BOOTSTRAP_STEPS);

      // Correcao 1.4: login automatico do owner usando os valores core ja em memoria.
      // Client ad-hoc (independe das envs VITE do build atual) — fala direto com o Auth do Supabase.
      try {
        const authClient = createClient(coreValues.supabase_url, coreValues.supabase_anon_key);
        const { data: signIn, error } = await authClient.auth.signInWithPassword({
          email: coreValues.owner_email,
          password: coreValues.owner_password,
        });
        if (error || !signIn.session) throw error ?? new Error('Sessao nao retornada');
        setOwnerAccessToken(signIn.session.access_token);
        // Limpar a senha da memoria React imediatamente apos o login.
        setCoreValues((current) => ({ ...current, owner_password: '' }));
        window.setTimeout(() => setStep(4), 400);
      } catch {
        setLoginWarning(
          'Bootstrap concluido, mas nao foi possivel autenticar automaticamente. ' +
            'Faca login como administrador para finalizar as credenciais.',
        );
      }
    } catch (err) {
      setBootstrapError(err instanceof Error ? err.message : 'Erro no bootstrap');
    }
  }

  async function finishSetup() {
    setSaving(true);
    try {
      let token = ownerAccessToken;
      if (!token && isSupabaseConfigured) {
        const client = getSupabaseClient();
        if (!client) throw new Error('Cliente Supabase nao disponivel.');
        const { data } = await client.auth.getSession();
        token = data.session?.access_token ?? null;
      }
      if (!token) {
        throw new Error('Sessao de administrador necessaria. Faca login e tente novamente.');
      }
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ credentials: appCredentials }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message ?? 'Erro ao salvar credenciais');
      clearStep2();
      try { sessionStorage.removeItem(STEP_SESSION_KEY); sessionStorage.removeItem(TOKEN_SESSION_KEY); } catch {}
      window.location.href = setupConfig.postBootstrapRedirect;
    } catch (err) {
      setBootstrapError(err instanceof Error ? err.message : 'Erro ao finalizar setup');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] px-4 py-8 text-[#F8FAFC]">
      <div className="mx-auto max-w-[760px]">
        <StepIndicator current={step} />
        <div className="rounded-2xl border border-[rgba(59,130,246,0.15)] bg-[rgba(255,255,255,0.02)] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-[40px] md:p-12">
          {step === 1 && <PrepareStep onContinue={() => setStep(2)} />}
          {step === 2 && (
            <CoreStep
              values={coreValues}
              onChange={updateCore}
              validate={validateCore}
              onValid={handleCoreValid}
              canSubmit={allCoreValid}
              onSubmit={runBootstrap}
            />
          )}
          {step === 3 && <BootstrapStep state={bootstrapState} error={bootstrapError} warning={loginWarning} onRetry={runBootstrap} />}
          {step === 4 && (
            <ApiStep
              values={appCredentials}
              valid={appValid}
              saving={saving}
              error={bootstrapError}
              onChange={updateAppCredential}
              onValidationChange={handleAppValid}
              canSubmit={allAppValid}
              onSubmit={finishSetup}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="mb-8 flex items-start justify-center">
      {stepLabels.map((label, index) => {
        const number = index + 1;
        const active = current === number;
        const complete = current > number;
        return (
          <div key={label} className="flex min-w-0 flex-1 items-start">
            <div className="flex min-w-[64px] flex-1 flex-col items-center">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${
                  active
                    ? 'bg-[#3B82F6] text-white shadow-[0_0_30px_rgba(59,130,246,0.5)]'
                    : complete
                      ? 'bg-[#1E3A8A] text-white'
                      : 'border border-[rgba(59,130,246,0.3)] text-[#94A3B8]'
                }`}
              >
                {complete ? <Check className="h-4 w-4" /> : number}
              </div>
              <span className={`mt-2 whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.1em] ${active ? 'text-[#F8FAFC]' : 'text-[#94A3B8]'}`}>
                {label}
              </span>
            </div>
            {index < stepLabels.length - 1 && <div className="mt-5 flex-1 border-t border-[rgba(59,130,246,0.2)]" />}
          </div>
        );
      })}
    </div>
  );
}

function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-xl px-8 py-4 font-medium text-white transition-all duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none max-md:w-full ${props.className ?? ''}`}
      style={{
        background: 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)',
        border: 'none',
        boxShadow: props.disabled
          ? 'none'
          : '0 8px 40px rgba(59,130,246,0.4), 0 0 60px rgba(59,130,246,0.2)',
      }}
    />
  );
}

function PrepareStep({ onContinue }: { onContinue: () => void }) {
  const cards = [
    ['Criar projeto Supabase', 'Abra o dashboard e crie um projeto novo para esta instancia.', ['SUPABASE URL', 'ANON KEY', 'SERVICE ROLE'], 'https://supabase.com/dashboard/new'],
    ['Gerar PAT Supabase', 'Crie um token pessoal para o wizard aplicar migrations e publicar functions.', ['SUPABASE PAT'], 'https://supabase.com/dashboard/account/tokens'],
    ['Gerar Vercel Token', 'Crie um token para o wizard gravar envs core e preparar o redeploy.', ['VERCEL TOKEN'], 'https://vercel.com/account/tokens'],
  ];
  return (
    <>
      <h1 className="mb-2 text-[28px] font-semibold text-[#F8FAFC]">Preparar setup</h1>
      <p className="mb-8 text-base leading-[1.6] text-[#94A3B8]">
        Tenha estes acessos em maos. A configuracao acontece aqui, sem editar arquivos e sem terminal.
      </p>
      <div className="space-y-4">
        {cards.map(([title, description, pills, url], index) => (
          <div key={title as string} className="relative flex gap-4 rounded-xl border border-[rgba(59,130,246,0.12)] bg-[rgba(255,255,255,0.02)] p-5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[rgba(59,130,246,0.4)] text-sm font-medium text-[#60A5FA]">
              {index + 1}
            </div>
            <div className="pr-16">
              <h2 className="text-base font-semibold text-[#F8FAFC]">{title}</h2>
              <p className="mt-1 text-[13px] leading-5 text-[#94A3B8]">{description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(pills as string[]).map((pill) => (
                  <span key={pill} className="rounded-full border border-[rgba(59,130,246,0.3)] bg-[rgba(30,58,138,0.4)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.05em] text-[#60A5FA]">
                    {pill}
                  </span>
                ))}
              </div>
            </div>
            <a href={url as string} target="_blank" rel="noreferrer" className="absolute right-5 top-5 inline-flex items-center gap-1 text-sm text-[#60A5FA] hover:text-[#85B7EB]">
              abrir <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ))}
      </div>
      <div className="mt-8 flex justify-end">
        <PrimaryButton onClick={onContinue}>Ja tenho tudo isso → continuar</PrimaryButton>
      </div>
    </>
  );
}

function CoreField({
  fieldKey,
  label,
  help,
  placeholder,
  isPassword,
  value,
  onChange,
  validate,
  onValid,
}: {
  fieldKey: keyof CoreValues;
  label: string;
  help: string;
  placeholder: string;
  isPassword: boolean;
  value: string;
  onChange: (key: keyof CoreValues, value: string) => void;
  validate: (key: keyof CoreValues, value: string) => Promise<{ ok: boolean; message?: string }>;
  onValid: (key: keyof CoreValues, ok: boolean) => void;
}) {
  const [status, setStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [message, setMessage] = useState('');
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!value) {
      setStatus('idle');
      setMessage('');
      onValid(fieldKey, false);
      return;
    }
    setStatus('validating');
    const timeout = window.setTimeout(() => {
      validate(fieldKey, value).then((result) => {
        setStatus(result.ok ? 'valid' : 'invalid');
        setMessage(result.message ?? '');
        onValid(fieldKey, result.ok);
      });
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [fieldKey, value, validate, onValid]);

  const inputType = isPassword && !show ? 'password' : 'text';

  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-[#CBD5E1]">{label}</label>
      <div className="relative">
        <input
          type={inputType}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(fieldKey, event.target.value)}
          className="h-11 w-full rounded-lg border border-[rgba(59,130,246,0.2)] bg-[rgba(255,255,255,0.03)] px-4 pr-16 text-sm text-[#F8FAFC] outline-none transition-all placeholder:text-[#94A3B8] focus:border-[#3B82F6] focus:shadow-[0_0_20px_rgba(59,130,246,0.2)]"
        />
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
          {isPassword && (
            <button type="button" onClick={() => setShow((current) => !current)} className="text-[#94A3B8]">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
          {status === 'validating' && <Loader2 className="h-4 w-4 animate-spin text-[#60A5FA]" />}
          {status === 'valid' && <Check className="h-4 w-4 text-[#10B981]" />}
          {status === 'invalid' && <X className="h-4 w-4 text-[#EF4444]" />}
        </div>
      </div>
      <p className={`mt-1 text-xs ${status === 'invalid' ? 'text-[#EF4444]' : 'text-[#94A3B8]'}`}>
        {status === 'invalid' && message ? message : help}
      </p>
    </div>
  );
}

function CoreStep({
  values,
  onChange,
  validate,
  onValid,
  canSubmit,
  onSubmit,
}: {
  values: CoreValues;
  onChange: (key: keyof CoreValues, value: string) => void;
  validate: (key: keyof CoreValues, value: string) => Promise<{ ok: boolean; message?: string }>;
  onValid: (key: keyof CoreValues, ok: boolean) => void;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  const fields: Array<[keyof CoreValues, string, string, string, boolean]> = [
    ['supabase_url', 'Supabase URL', 'https://xxxx.supabase.co', 'Cole a Project URL do Supabase.', false],
    ['supabase_anon_key', 'Supabase anon key', 'eyJ...', 'Chave publica anon.', true],
    ['supabase_service_role_key', 'Supabase service role key', 'eyJ...', 'Chave service_role. Nunca sera salva no browser nem em localStorage.', true],
    ['supabase_pat', 'Supabase PAT', 'sbp_...', 'Token pessoal usado apenas durante o bootstrap.', true],
    ['vercel_token', 'Vercel Token', 'vercel_...', 'Token usado apenas durante o bootstrap.', true],
    ['owner_email', 'Email do administrador', 'voce@email.com', 'Esta sera a conta owner da ferramenta.', false],
    ['owner_password', 'Senha do administrador', 'Minimo 8 caracteres', 'Precisa ter letras e numeros.', true],
  ];
  return (
    <>
      <h1 className="mb-2 text-[28px] font-semibold text-[#F8FAFC]">Credenciais core</h1>
      <p className="mb-8 text-base leading-[1.6] text-[#94A3B8]">
        Estes dados conectam sua instancia ao Supabase e Vercel. Tokens de bootstrap sao descartados apos o uso.
      </p>
      <div className="grid gap-4">
        {fields.map(([key, label, placeholder, help, isPassword]) => (
          <CoreField
            key={key}
            fieldKey={key}
            label={label}
            placeholder={placeholder}
            help={help}
            isPassword={isPassword}
            value={values[key]}
            onChange={onChange}
            validate={validate}
            onValid={onValid}
          />
        ))}
      </div>
      <div className="mt-8 flex justify-end">
        <PrimaryButton disabled={!canSubmit} onClick={onSubmit}>Configurar</PrimaryButton>
      </div>
    </>
  );
}

function BootstrapStep({ state, error, warning, onRetry }: { state: string[]; error: string; warning: string; onRetry: () => void }) {
  return (
    <>
      <h1 className="mb-2 text-[28px] font-semibold text-[#F8FAFC]">Bootstrap em execucao</h1>
      <p className="mb-8 text-base leading-[1.6] text-[#94A3B8]">Pode deixar esta aba aberta. Se algo falhar, o retry continua dos checkpoints ja concluidos.</p>
      <div className="space-y-3">
        {BOOTSTRAP_STEPS.map((item) => {
          const done = state.includes(item);
          return (
            <div key={item} className="flex items-center gap-3 rounded-xl border border-[rgba(59,130,246,0.12)] bg-[rgba(255,255,255,0.02)] p-4">
              {done ? <Check className="h-5 w-5 text-[#10B981]" /> : <Loader2 className="h-5 w-5 animate-spin text-[#60A5FA]" />}
              <span className="text-sm text-[#CBD5E1]">{item}</span>
            </div>
          );
        })}
      </div>
      {warning && (
        <div className="mt-4 rounded-xl border border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.06)] p-4 text-sm text-[#FCD34D]">
          {warning}{' '}
          <a href="/login" className="font-medium underline">Ir para login</a>
        </div>
      )}
      {error && (
        <div className="mt-4 text-sm text-[#EF4444]">
          <p>{error}</p>
          <a
            href="https://vercel.com/dashboard"
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block font-medium text-[#FCA5A5] underline"
          >
            Abrir painel da Vercel
          </a>
        </div>
      )}
      {error && <div className="mt-6 flex justify-end"><PrimaryButton onClick={onRetry}>Tentar de novo</PrimaryButton></div>}
    </>
  );
}

function ApiStep({
  values,
  saving,
  error,
  onChange,
  onValidationChange,
  canSubmit,
  onSubmit,
}: {
  values: Record<string, string>;
  valid: Record<string, boolean>;
  saving: boolean;
  error: string;
  onChange: (key: string, value: string | null) => void;
  onValidationChange: (key: string, valid: boolean) => void;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  return (
    <>
      <h1 className="mb-2 text-[28px] font-semibold text-[#F8FAFC]">APIs da ferramenta</h1>
      <p className="mb-8 text-base leading-[1.6] text-[#94A3B8]">
        Estas credenciais ficam criptografadas no Supabase da sua propria instancia.
      </p>
      <div className="space-y-4">
        {setupConfig.appCredentials.map((field) => (
          <CredentialField
            key={field.key}
            field={field}
            initialHasValue={false}
            onChange={onChange}
            onValidationChange={onValidationChange}
          />
        ))}
      </div>
      {error && <p className="mt-4 text-sm text-[#EF4444]">{error}</p>}
      <div className="mt-8 flex justify-end">
        <PrimaryButton disabled={!canSubmit || saving || Object.keys(values).length === 0} onClick={onSubmit}>
          {saving ? 'Salvando...' : 'Salvar e finalizar'}
        </PrimaryButton>
      </div>
    </>
  );
}
