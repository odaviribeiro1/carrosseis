import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { setupConfig } from '../../../../../setup.config';
import { CredentialField } from '@/components/credentials/CredentialField';
import { RoleGuard } from '@/components/layout/RoleGuard';
import { useAuthStore } from '@/stores/auth-store';
import {
  getInstanceImageProvider,
  setInstanceImageProvider,
  type ImageProviderId,
} from '@/lib/imageProvider';
import { getDefaultCta, setDefaultCta, EMPTY_CTA, type DefaultCta } from '@/lib/instanceSettings';
import { getZernioConnection, type ZernioConnection } from '@/lib/instanceSettings';
import { getSupabaseClient } from '@/lib/supabase';
import { Input } from '@/components/ui/input';

export function CredentialsPanel() {
  const [presence, setPresence] = useState<Record<string, { exists: boolean }>>({});
  const [changed, setChanged] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { session } = useAuthStore();

  // Modelo de geracao de imagem padrao da instancia (global).
  const [imageProvider, setImageProvider] = useState<ImageProviderId>('gpt_image');
  const [savingProvider, setSavingProvider] = useState(false);
  useEffect(() => {
    getInstanceImageProvider()
      .then(setImageProvider)
      .catch(() => {/* mantem default gpt_image */});
  }, []);

  async function changeImageProvider(next: ImageProviderId) {
    const prev = imageProvider;
    setImageProvider(next);
    setSavingProvider(true);
    try {
      await setInstanceImageProvider(next);
      toast.success('Modelo de imagem atualizado');
    } catch (err) {
      setImageProvider(prev);
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar modelo');
    } finally {
      setSavingProvider(false);
    }
  }

  // CTA fixo global (slide final padrão de todo carrossel).
  const [cta, setCta] = useState<DefaultCta>(EMPTY_CTA);
  const [savingCta, setSavingCta] = useState(false);
  useEffect(() => {
    getDefaultCta().then((v) => v && setCta(v)).catch(() => {/* mantem vazio */});
  }, []);

  async function saveCta() {
    setSavingCta(true);
    try {
      await setDefaultCta(cta);
      toast.success('CTA fixo atualizado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar CTA');
    } finally {
      setSavingCta(false);
    }
  }

  // Conexão Zernio (Instagram). connected = conta IG resolvida e salva.
  const [zernioConn, setZernioConn] = useState<ZernioConnection | null>(null);
  const [zernioBusy, setZernioBusy] = useState(false);

  async function refreshZernio() {
    try {
      setZernioConn(await getZernioConnection());
    } catch {
      setZernioConn(null);
    }
  }

  // Carrega a conexão e, ao voltar do OAuth (?zernio=connected), sincroniza a conta.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('zernio') === 'connected') {
      void (async () => {
        setZernioBusy(true);
        try {
          const client = getSupabaseClient();
          if (client) {
            const { data, error } = await client.functions.invoke('zernio-sync-account', { body: {} });
            if (error) throw error;
            const res = data as { connected?: boolean; username?: string; error?: string };
            if (res?.connected) toast.success(`Instagram conectado: @${res.username}`);
            else toast.error(res?.error ?? 'Nao foi possivel conectar a conta.');
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Erro ao sincronizar conta');
        } finally {
          await refreshZernio();
          window.history.replaceState({}, '', window.location.pathname);
          setZernioBusy(false);
        }
      })();
    } else {
      void refreshZernio();
    }
  }, []);

  async function connectInstagram() {
    setZernioBusy(true);
    try {
      const client = getSupabaseClient();
      if (!client) throw new Error('Supabase nao configurado');
      const redirectUrl = `${window.location.origin}/settings/credentials?zernio=connected`;
      const { data, error } = await client.functions.invoke('zernio-connect', {
        body: { redirect_url: redirectUrl },
      });
      if (error) throw error;
      const res = data as { authUrl?: string; error?: string };
      if (res?.error) throw new Error(res.error);
      if (!res?.authUrl) throw new Error('Zernio nao retornou a URL de autorizacao.');
      window.location.href = res.authUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao conectar Instagram');
      setZernioBusy(false);
    }
  }

  useEffect(() => {
    const keys = setupConfig.appCredentials.map((field) => field.key).join(',');
    fetch(`/api/credentials?keys=${encodeURIComponent(keys)}`, {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    })
      .then((res) => res.json())
      .then((data) => setPresence(data))
      .catch(() => toast.error('Erro ao carregar credenciais'))
      .finally(() => setLoading(false));
  }, [session?.access_token]);

  const canSave = useMemo(
    () => Object.keys(changed).length > 0,
    [changed],
  );

  // Estes handlers PRECISAM ter identidade estavel: o CredentialField os lista no array de
  // dependencias de um useEffect que, por sua vez, chama onChange(). Se forem recriados a cada
  // render (arrow inline), o efeito dispara em loop infinito -> a pagina trava. Ver useCallback.
  const handleChange = useCallback((key: string, value: string | null) => {
    setChanged((current) => {
      const next = { ...current };
      if (value === null) delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ credentials: changed }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message ?? 'Erro ao salvar');
      toast.success('Credenciais atualizadas');
      setPresence((current) => {
        const next = { ...current };
        for (const key of Object.keys(changed)) next[key] = { exists: true };
        return next;
      });
      setChanged({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar credenciais');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <p className="mb-6 text-sm text-[#94A3B8]">
        Edite as chaves de API usadas pela ferramenta. Alteracoes entram em vigor sem redeploy.
      </p>

      <RoleGuard
        minRole="owner"
        fallback={
          <div className="rounded-2xl border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.05)] p-6 text-[#FCA5A5]">
            Apenas administradores podem editar credenciais.
          </div>
        }
      >
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[#60A5FA]" />
          </div>
        ) : (
          <>
            {/* Modelo de geracao de imagem (global da instancia) */}
            <div className="mb-6 rounded-2xl border border-[rgba(59,130,246,0.12)] bg-[rgba(255,255,255,0.02)] p-5">
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-[13px] font-medium text-[#CBD5E1]">Modelo de geracao de imagem</h3>
                {savingProvider && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#60A5FA]" />}
              </div>
              <p className="mb-3 text-[13px] leading-5 text-[#94A3B8]">
                Modelo usado para gerar as imagens dos slides. Vale para todos os carrosseis novos.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'gpt_image', label: 'GPT Image', hint: 'OpenAI - so precisa da chave OpenAI' },
                  { value: 'nano_banana', label: 'Google Nano Banana', hint: 'Requer chave do Google' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={savingProvider}
                    onClick={() => void changeImageProvider(opt.value)}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-60 ${
                      imageProvider === opt.value
                        ? 'border-[#3B82F6] bg-[rgba(59,130,246,0.15)]'
                        : 'border-[rgba(59,130,246,0.15)] hover:border-[rgba(59,130,246,0.3)]'
                    }`}
                  >
                    <span className="block text-sm font-medium text-[#F8FAFC]">{opt.label}</span>
                    <span className="block text-[10px] text-[#94A3B8]">{opt.hint}</span>
                  </button>
                ))}
              </div>
              {imageProvider === 'nano_banana' && presence.google_api_key?.exists === false && (
                <p className="mt-3 text-[11px] text-[#F59E0B]">
                  Configure a chave do Google abaixo para o Nano Banana funcionar.
                </p>
              )}
            </div>

            {/* Instagram (Zernio) — conexão da conta para publicação */}
            <div className="mb-6 rounded-2xl border border-[rgba(59,130,246,0.12)] bg-[rgba(255,255,255,0.02)] p-5">
              <h3 className="mb-2 text-[13px] font-medium text-[#CBD5E1]">Instagram (Zernio)</h3>
              <p className="mb-3 text-[13px] leading-5 text-[#94A3B8]">
                Conecte uma conta <strong>Business ou Creator</strong> para publicar/agendar carrosseis.
                Requer a Zernio API Key salva abaixo.
              </p>
              {zernioConn?.account_id ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-[rgba(16,185,129,0.25)] bg-[rgba(16,185,129,0.08)] px-3 py-2">
                  <span className="text-sm text-[#E7E9EA]">
                    Conectado: <span className="text-[#34D399]">@{zernioConn.username}</span>
                  </span>
                  <button
                    type="button"
                    disabled={zernioBusy}
                    onClick={() => void connectInstagram()}
                    className="text-xs text-[#94A3B8] underline hover:text-white disabled:opacity-60"
                  >
                    Reconectar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={zernioBusy || presence.zernio_api_key?.exists === false}
                  onClick={() => void connectInstagram()}
                  className="flex h-9 items-center justify-center gap-2 rounded-lg bg-[#3B82F6] px-4 text-sm font-medium text-white transition-colors hover:bg-[#2563EB] disabled:opacity-60"
                >
                  {zernioBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Conectar Instagram
                </button>
              )}
              {presence.zernio_api_key?.exists === false && !zernioConn?.account_id && (
                <p className="mt-2 text-[11px] text-[#F59E0B]">Salve a Zernio API Key abaixo primeiro.</p>
              )}
            </div>

            {/* CTA fixo (slide final de todo carrossel) */}
            <div className="mb-6 rounded-2xl border border-[rgba(59,130,246,0.12)] bg-[rgba(255,255,255,0.02)] p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-medium text-[#CBD5E1]">CTA fixo (slide final)</h3>
                <label className="flex items-center gap-2 text-[12px] text-[#94A3B8]">
                  <input
                    type="checkbox"
                    checked={cta.enabled}
                    onChange={(e) => setCta((p) => ({ ...p, enabled: e.target.checked }))}
                  />
                  Ativar
                </label>
              </div>
              <p className="mb-3 text-[13px] leading-5 text-[#94A3B8]">
                Quando ativo, o último slide de todo carrossel novo usa este CTA (substitui o que a IA geraria).
              </p>
              <div className="space-y-2">
                <Input
                  placeholder="Título do CTA (ex: Gostou do conteúdo?)"
                  value={cta.title}
                  onChange={(e) => setCta((p) => ({ ...p, title: e.target.value }))}
                  disabled={!cta.enabled}
                />
                <textarea
                  placeholder="Corpo (ex: Me segue para mais conteúdos como este.)"
                  value={cta.body}
                  onChange={(e) => setCta((p) => ({ ...p, body: e.target.value }))}
                  disabled={!cta.enabled}
                  rows={2}
                  className="flex w-full resize-none rounded-md border border-[rgba(59,130,246,0.2)] bg-[#0A0A0F] px-3 py-2 text-sm text-[#CBD5E1] disabled:opacity-50"
                />
                <Input
                  placeholder="Texto do botão (ex: Seguir)"
                  value={cta.button}
                  onChange={(e) => setCta((p) => ({ ...p, button: e.target.value }))}
                  disabled={!cta.enabled}
                />
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => void saveCta()}
                  disabled={savingCta}
                  className="rounded-lg border border-[rgba(59,130,246,0.25)] px-4 py-2 text-sm font-medium text-[#60A5FA] transition-all hover:bg-[rgba(59,130,246,0.08)] disabled:opacity-50"
                >
                  {savingCta ? 'Salvando...' : 'Salvar CTA'}
                </button>
              </div>
            </div>

            <div className={setupConfig.appCredentials.length > 6 ? 'grid gap-4 lg:grid-cols-2' : 'space-y-4'}>
              {setupConfig.appCredentials.map((field) => (
                <CredentialField
                  key={field.key}
                  field={field}
                  initialHasValue={Boolean(presence[field.key]?.exists) && changed[field.key] === undefined}
                  onChange={handleChange}
                />
              ))}
            </div>
            <div className="sticky bottom-0 mt-8 flex justify-end border-t border-[rgba(59,130,246,0.12)] bg-[#0A0A0F]/90 py-4 backdrop-blur-xl">
              <button
                type="button"
                disabled={!canSave || saving}
                onClick={save}
                className="rounded-xl px-8 py-4 font-medium text-white transition-all duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none max-md:w-full"
                style={{
                  background: 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)',
                  border: 'none',
                  boxShadow: !canSave || saving
                    ? 'none'
                    : '0 8px 40px rgba(59,130,246,0.4), 0 0 60px rgba(59,130,246,0.2)',
                }}
              >
                {saving ? 'Salvando...' : 'Salvar alteracoes'}
              </button>
            </div>
          </>
        )}
      </RoleGuard>
    </div>
  );
}
