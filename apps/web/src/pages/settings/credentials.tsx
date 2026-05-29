import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, KeyRound, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { setupConfig } from '../../../../../setup.config';
import { CredentialField } from '@/components/credentials/CredentialField';
import { RoleGuard } from '@/components/layout/RoleGuard';
import { useAuthStore } from '@/stores/auth-store';

export function CredentialsSettingsPage() {
  const [presence, setPresence] = useState<Record<string, { exists: boolean }>>({});
  const [changed, setChanged] = useState<Record<string, string>>({});
  const [valid, setValid] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { session } = useAuthStore();

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
    () => Object.keys(changed).length > 0 && Object.keys(changed).every((key) => valid[key]),
    [changed, valid],
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

  const handleValidationChange = useCallback((key: string, isValid: boolean) => {
    setValid((current) => ({ ...current, [key]: isValid }));
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
      setValid({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar credenciais');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] p-6 text-[#F8FAFC]">
      <div className="mx-auto max-w-5xl">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-[#94A3B8] hover:text-[#F8FAFC]">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <div className="mb-8 flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(59,130,246,0.12)] text-[#60A5FA]">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-[28px] font-semibold text-[#F8FAFC]">Credenciais de aplicacao</h1>
            <p className="mt-1 text-base leading-[1.6] text-[#94A3B8]">
              Edite as chaves de API usadas pela ferramenta. Alteracoes entram em vigor sem redeploy.
            </p>
          </div>
        </div>

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
              <div className={setupConfig.appCredentials.length > 6 ? 'grid gap-4 lg:grid-cols-2' : 'space-y-4'}>
                {setupConfig.appCredentials.map((field) => (
                  <CredentialField
                    key={`${field.key}-${presence[field.key]?.exists ? 'set' : 'empty'}-${changed[field.key] ? 'changed' : 'idle'}`}
                    field={field}
                    initialHasValue={Boolean(presence[field.key]?.exists) && changed[field.key] === undefined}
                    onChange={handleChange}
                    onValidationChange={handleValidationChange}
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
    </div>
  );
}
