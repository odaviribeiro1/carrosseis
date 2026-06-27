import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, X, Smartphone, Copy, Check, Wand2, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSupabaseClient } from '@/lib/supabase';
import { generateQRCodeDataUrl } from '@/lib/qrcode';
import { createShareLink, updateShareCaption } from '@/lib/share';

interface ShareModalProps {
  carouselId: string;
  captionSlides: Array<{ headline: string; body: string }>;
  composeAndUpload: () => Promise<{ position: number; url: string }[]>;
  onClose: () => void;
}

const STEPS = [
  'Escaneie o QR com o celular.',
  'Salve as imagens na galeria (na ordem).',
  'Abra o Instagram → novo post → selecione na ordem.',
  'Escolha a música na biblioteca do Instagram.',
  'Cole a legenda e publique.',
];

export function ShareModal({ carouselId, captionSlides, composeAndUpload, onClose }: ShareModalProps) {
  const [preparing, setPreparing] = useState(true);
  const [progress, setProgress] = useState('Preparando...');
  const [error, setError] = useState('');
  const [caption, setCaption] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const tokenRef = useRef('');
  const captionSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function fetchCaption(): Promise<string> {
    const client = getSupabaseClient();
    if (!client) return '';
    const { data: carousel } = await client
      .from('carousels')
      .select('tone, ai_input')
      .eq('id', carouselId)
      .maybeSingle();
    const tone = (carousel?.tone as string) ?? 'informativo';
    const audience = ((carousel?.ai_input as { audience?: string } | null)?.audience) ?? '';
    const { data, error: err } = await client.functions.invoke('generate-content', {
      body: { mode: 'caption', caption_slides: captionSlides, tone, audience },
    });
    if (err) throw err;
    return (data as { caption?: string })?.caption ?? '';
  }

  // Ao abrir: compõe os PNGs, gera a legenda e cria o link + QR.
  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        setProgress('Gerando imagens finais...');
        const imageUrls = await composeAndUpload();
        if (ignore) return;

        setProgress('Gerando legenda...');
        let cap = '';
        try {
          cap = await fetchCaption();
        } catch {
          cap = ''; // legenda é opcional; segue sem ela
        }
        if (ignore) return;
        setCaption(cap);

        setProgress('Criando link...');
        const token = await createShareLink(carouselId, cap, imageUrls);
        if (ignore) return;
        tokenRef.current = token;
        const url = `${window.location.origin}/m/${token}`;
        setShareUrl(url);
        setQrDataUrl(await generateQRCodeDataUrl(url, { width: 320 }));
        setPreparing(false);
      } catch (err) {
        if (ignore) return;
        setError(err instanceof Error ? err.message : 'Erro ao preparar o envio.');
        setPreparing(false);
      }
    })();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persiste edições da legenda no link (debounce) para refletir no celular.
  function onCaptionChange(value: string) {
    setCaption(value);
    if (!tokenRef.current) return;
    if (captionSaveTimer.current) clearTimeout(captionSaveTimer.current);
    captionSaveTimer.current = setTimeout(() => {
      void updateShareCaption(tokenRef.current, value).catch(() => {/* best-effort */});
    }, 600);
  }

  async function regenerateCaption() {
    setRegenerating(true);
    try {
      const cap = await fetchCaption();
      setCaption(cap);
      if (tokenRef.current) await updateShareCaption(tokenRef.current, cap);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nao foi possivel gerar a legenda');
    } finally {
      setRegenerating(false);
    }
  }

  async function copyCaption() {
    if (!caption) return;
    try {
      await navigator.clipboard.writeText(caption);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = caption;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[rgba(59,130,246,0.2)] bg-[#0E1117] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-[#F8FAFC]">
            <Smartphone className="h-5 w-5" /> Enviar para o celular
          </h2>
          <button type="button" onClick={onClose} className="text-[#94A3B8] hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {preparing ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-7 w-7 animate-spin text-[#3B82F6]" />
            <p className="text-sm text-[#94A3B8]">{progress}</p>
          </div>
        ) : error ? (
          <div className="space-y-4 py-4">
            <p className="text-sm text-red-400">{error}</p>
            <Button variant="outline" className="w-full" onClick={onClose}>Fechar</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* QR */}
            <div className="flex flex-col items-center gap-2">
              {qrDataUrl && (
                <img src={qrDataUrl} alt="QR code" className="h-44 w-44 rounded-lg bg-white p-2" />
              )}
              <p className="text-center text-xs text-[#94A3B8]">
                Escaneie com o celular para baixar as imagens. Link válido por 24h.
              </p>
            </div>

            {/* Passo a passo */}
            <ol className="space-y-1.5 rounded-xl border border-[rgba(59,130,246,0.15)] bg-[rgba(59,130,246,0.04)] p-3 text-xs text-[#CBD5E1]">
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
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-wider text-[#94A3B8]">Legenda</label>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={regenerating} onClick={() => void regenerateCaption()}>
                    {regenerating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Wand2 className="mr-1 h-3 w-3" />}
                    Gerar outra
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void copyCaption()}>
                    {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
                    Copiar legenda
                  </Button>
                </div>
              </div>
              <textarea
                value={caption}
                onChange={(e) => onCaptionChange(e.target.value)}
                rows={5}
                placeholder="Legenda..."
                className="flex w-full resize-none rounded-md border border-[rgba(59,130,246,0.15)] bg-[rgba(15,18,35,0.5)] px-3 py-2 text-xs text-[#CBD5E1]"
              />
            </div>

            {/* Aviso música */}
            <div className="flex gap-2 rounded-xl border border-[rgba(245,158,11,0.2)] bg-[rgba(245,158,11,0.05)] p-3 text-[11px] text-[#FCD34D]">
              <Music className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                A publicação com música é manual: a biblioteca de música do Instagram só existe dentro do app
                e não é liberada para publicação automática por nenhuma ferramenta. A ferramenta entrega tudo
                pronto; só o passo final é no celular.
              </span>
            </div>

            {shareUrl && (
              <p className="break-all text-center text-[10px] text-[#94A3B8]/60">{shareUrl}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
