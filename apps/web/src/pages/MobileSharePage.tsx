import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Download, Copy, Check, Music } from 'lucide-react';
import { getShare, type ShareData } from '@/lib/share';

type Status = 'loading' | 'ok' | 'notfound' | 'expired' | 'error';

const STEPS = [
  'Salve as imagens na galeria (na ordem 1, 2, 3...).',
  'Abra o Instagram e crie um novo post.',
  'Selecione as imagens na ordem.',
  'Escolha a música na biblioteca do Instagram.',
  'Cole a legenda e publique.',
];

export function MobileSharePage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<ShareData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('notfound');
      return;
    }
    getShare(token)
      .then((res) => {
        if (!res) return setStatus('notfound');
        if (res.expired) return setStatus('expired');
        setData(res);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [token]);

  async function copyCaption() {
    const text = data?.caption ?? '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback: seleção + execCommand para browsers/contextos sem Clipboard API.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadAll() {
    if (!data) return;
    data.imageUrls.forEach((img, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = img.url;
        a.download = `slide-${String(i + 1).padStart(2, '0')}.png`;
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, i * 600);
    });
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0F]">
        <Loader2 className="h-7 w-7 animate-spin text-[#3B82F6]" />
      </div>
    );
  }

  if (status !== 'ok' || !data) {
    const msg =
      status === 'expired'
        ? 'Este link expirou. Gere um novo no app.'
        : status === 'error'
          ? 'Erro ao carregar o link. Tente novamente.'
          : 'Link nao encontrado.';
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0F] p-6 text-center">
        <p className="text-sm text-[#94A3B8]">{msg}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] px-4 py-6 text-[#E7E9EA]">
      <div className="mx-auto max-w-md space-y-5">
        <header className="space-y-1">
          <h1 className="text-lg font-bold text-[#F8FAFC]">Seu carrossel</h1>
          <p className="text-xs text-[#94A3B8]">
            {data.imageUrls.length} slide(s). Salve na ordem e publique pelo Instagram com música.
          </p>
        </header>

        {/* Passo a passo */}
        <ol className="space-y-1.5 rounded-xl border border-[rgba(59,130,246,0.15)] bg-[rgba(59,130,246,0.04)] p-4 text-xs text-[#CBD5E1]">
          {STEPS.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[rgba(59,130,246,0.2)] text-[9px] font-bold text-[#60A5FA]">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>

        {/* Legenda */}
        {data.caption && (
          <div className="space-y-2 rounded-xl border border-[rgba(59,130,246,0.15)] bg-[rgba(255,255,255,0.02)] p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-[#94A3B8]">Legenda</span>
              <button
                type="button"
                onClick={() => void copyCaption()}
                className="flex items-center gap-1 rounded-md bg-[#3B82F6] px-2.5 py-1 text-xs font-medium text-white"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-[#CBD5E1]">{data.caption}</p>
          </div>
        )}

        {/* Baixar todas */}
        <button
          type="button"
          onClick={downloadAll}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#3B82F6] py-2.5 text-sm font-medium text-white"
        >
          <Download className="h-4 w-4" /> Baixar todas
        </button>
        <p className="text-center text-[10px] text-[#94A3B8]">
          Se a imagem abrir em vez de baixar, segure nela e toque em "Salvar na galeria".
        </p>

        {/* Imagens na ordem */}
        <div className="space-y-4">
          {data.imageUrls.map((img, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-[rgba(59,130,246,0.12)]">
              <img src={img.url} alt={`Slide ${i + 1}`} className="block w-full" loading="lazy" />
              <a
                href={img.url}
                download={`slide-${String(i + 1).padStart(2, '0')}.png`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-[rgba(59,130,246,0.1)] py-2.5 text-xs font-medium text-[#60A5FA]"
              >
                <Download className="h-3.5 w-3.5" /> Salvar slide {i + 1}
              </a>
            </div>
          ))}
        </div>

        {/* Aviso música */}
        <div className="flex gap-2 rounded-xl border border-[rgba(245,158,11,0.2)] bg-[rgba(245,158,11,0.05)] p-3 text-[11px] text-[#FCD34D]">
          <Music className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            A publicação final com música é manual: a biblioteca de música do Instagram só existe dentro
            do app e não é liberada para publicação automática por nenhuma ferramenta.
          </span>
        </div>
      </div>
    </div>
  );
}
