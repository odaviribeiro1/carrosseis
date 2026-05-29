import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Eye, EyeOff, ExternalLink, X } from 'lucide-react';
import type { CredentialField as CredentialFieldConfig } from '../../../../../setup.config';

type CredentialFieldProps = {
  field: CredentialFieldConfig;
  initialHasValue: boolean;
  onChange: (key: string, value: string | null) => void;
  onValidationChange?: (key: string, isValid: boolean) => void;
};

export function CredentialField({
  field,
  initialHasValue,
  onChange,
  onValidationChange,
}: CredentialFieldProps) {
  const [editing, setEditing] = useState(!initialHasValue);
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>(
    initialHasValue ? 'valid' : 'idle',
  );
  const [message, setMessage] = useState('');

  // Guardamos os callbacks em refs para NAO precisar lista-los nas deps do efeito abaixo.
  // Se eles entrassem nas deps e o pai os recriasse a cada render (arrow inline), o efeito
  // — que chama onChange() — dispararia em loop infinito, travando a pagina.
  const onChangeRef = useRef(onChange);
  const onValidationChangeRef = useRef(onValidationChange);
  useEffect(() => {
    onChangeRef.current = onChange;
    onValidationChangeRef.current = onValidationChange;
  });

  useEffect(() => {
    setEditing(!initialHasValue);
    setStatus(initialHasValue ? 'valid' : 'idle');
  }, [initialHasValue]);

  useEffect(() => {
    if (!editing) return;
    onChangeRef.current(field.key, value || null);
    if (!value) {
      setStatus('idle');
      setMessage('');
      onValidationChangeRef.current?.(field.key, false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setStatus('validating');
      // Valida via proxy server-side: a chave nunca vai do browser direto pro provedor
      // (sem CORS com Anthropic/Groq/Resend, sem exposicao no Network tab).
      fetch('/api/validate-credential', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: field.key, value }),
      })
        .then((res) => res.json())
        .then((result: { valid?: boolean; message?: string }) => {
          setStatus(result.valid ? 'valid' : 'invalid');
          setMessage(result.message ?? '');
          onValidationChangeRef.current?.(field.key, Boolean(result.valid));
        })
        .catch(() => {
          setStatus('invalid');
          setMessage('Servico de validacao indisponivel, tente novamente.');
          onValidationChangeRef.current?.(field.key, false);
        });
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [editing, field, value]);

  const inputType = useMemo(() => {
    if (field.inputType !== 'password') return 'text';
    return show ? 'text' : 'password';
  }, [field.inputType, show]);

  function cancel() {
    setValue('');
    setEditing(false);
    setStatus(initialHasValue ? 'valid' : 'idle');
    onChange(field.key, null);
    onValidationChange?.(field.key, initialHasValue);
  }

  return (
    <div className="rounded-xl border border-[rgba(59,130,246,0.12)] bg-[rgba(255,255,255,0.02)] p-5">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <label className="mb-1 block text-[13px] font-medium text-[#CBD5E1]">{field.label}</label>
          {field.helpText && <p className="text-[13px] leading-5 text-[#94A3B8]">{field.helpText}</p>}
        </div>
        {field.docsUrl && (
          <a
            href={field.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-sm text-[#60A5FA] transition-colors hover:text-[#85B7EB]"
          >
            onde gerar <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {initialHasValue && !editing ? (
        <div className="flex items-center gap-3">
          <div className="flex h-11 flex-1 items-center rounded-lg border border-[rgba(59,130,246,0.2)] bg-[rgba(255,255,255,0.03)] px-4 font-mono text-sm text-[#F8FAFC]">
            ••••••••
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="h-11 rounded-lg border border-[rgba(59,130,246,0.2)] px-4 text-sm font-medium text-[#60A5FA] transition-all duration-300 hover:bg-[rgba(59,130,246,0.08)]"
          >
            Alterar
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <input
              value={value}
              type={inputType}
              placeholder={field.placeholder}
              onChange={(event) => setValue(event.target.value)}
              className="h-11 w-full rounded-lg border border-[rgba(59,130,246,0.2)] bg-[rgba(255,255,255,0.03)] px-4 pr-20 text-sm text-[#F8FAFC] outline-none transition-all duration-300 placeholder:text-[#94A3B8] focus:border-[#3B82F6] focus:shadow-[0_0_20px_rgba(59,130,246,0.2)]"
            />
            <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
              {field.inputType === 'password' && (
                <button type="button" onClick={() => setShow((current) => !current)} className="text-[#94A3B8]">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
              {status === 'valid' && <Check className="h-4 w-4 text-[#10B981]" />}
              {status === 'invalid' && <X className="h-4 w-4 text-[#EF4444]" />}
            </div>
          </div>
              <div className="flex min-h-5 items-center justify-between gap-3">
            <p className={`text-xs ${status === 'invalid' ? 'text-[#EF4444]' : 'text-[#94A3B8]'}`}>
              {status === 'validating' ? 'Validando...' : message}
            </p>
            {initialHasValue && (
              <button type="button" onClick={cancel} className="text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC]">
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
