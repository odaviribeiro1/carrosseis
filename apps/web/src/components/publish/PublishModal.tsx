import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Instagram, X, Wand2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSupabaseClient } from '@/lib/supabase';
import type { ZernioConnection } from '@/lib/instanceSettings';

type Mode = 'now' | 'schedule' | 'draft';

interface PublishModalProps {
  carouselId: string;
  slideCount: number;
  captionSlides: Array<{ headline: string; body: string }>;
  connection: ZernioConnection | null;
  composeAndUpload: () => Promise<{ position: number; url: string }[]>;
  onClose: () => void;
}

const TZ = 'America/Sao_Paulo';

export function PublishModal({
  carouselId,
  slideCount,
  captionSlides,
  connection,
  composeAndUpload,
  onClose,
}: PublishModalProps) {
  const [caption, setCaption] = useState('');
  const [loadingCaption, setLoadingCaption] = useState(false);
  const [mode, setMode] = useState<Mode>('now');
  const [scheduledFor, setScheduledFor] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState('');
  // x-request-id estável por abertura do modal (reusado em retries da mesma ação).
  const requestId = useRef(crypto.randomUUID());

  const connected = Boolean(connection?.account_id);

  // Gera a sugestão de legenda por IA ao abrir.
  async function generateCaption() {
    const client = getSupabaseClient();
    if (!client) return;
    setLoadingCaption(true);
    try {
      // Tom/público do carrossel para a legenda ficar coerente.
      const { data: carousel } = await client
        .from('carousels')
        .select('tone, ai_input')
        .eq('id', carouselId)
        .maybeSingle();
      const tone = (carousel?.tone as string) ?? 'informativo';
      const audience = ((carousel?.ai_input as { audience?: string } | null)?.audience) ?? '';
      const { data, error } = await client.functions.invoke('generate-content', {
        body: { mode: 'caption', caption_slides: captionSlides, tone, audience },
      });
      if (error) throw error;
      const text = (data as { caption?: string })?.caption ?? '';
      if (text) setCaption(text);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nao foi possivel gerar a legenda');
    } finally {
      setLoadingCaption(false);
    }
  }

  useEffect(() => {
    if (connected) void generateCaption();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePublish() {
    if (publishing) return;
    if (mode === 'schedule' && !scheduledFor) {
      toast.error('Escolha a data e hora do agendamento.');
      return;
    }
    setPublishing(true);
    try {
      const client = getSupabaseClient();
      if (!client) throw new Error('Supabase nao configurado');

      setProgress('Gerando imagens finais...');
      const imageUrls = await composeAndUpload();

      setProgress(
        mode === 'now' ? 'Publicando...' : mode === 'schedule' ? 'Agendando...' : 'Salvando rascunho...',
      );
      const { data, error } = await client.functions.invoke('zernio-publish', {
        body: {
          carousel_id: carouselId,
          caption,
          mode,
          scheduled_for: mode === 'schedule' ? scheduledFor : null,
          timezone: TZ,
          image_urls: imageUrls,
          request_id: requestId.current,
        },
      });
      if (error) throw error;

      const res = data as
        | { ok?: boolean; status?: string; postId?: string; duplicate?: boolean; existingPostId?: string; message?: string; error?: string };

      if (res?.error) throw new Error(res.error);

      if (res?.duplicate) {
        toast.warning(res.message ?? 'Esse conteudo ja foi publicado/agendado recentemente.');
        onClose();
        return;
      }

      const label =
        res?.status === 'published'
          ? 'Publicado no Instagram!'
          : res?.status === 'scheduled'
            ? 'Agendado com sucesso!'
            : 'Rascunho salvo no Zernio.';
      toast.success(label);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao publicar');
    } finally {
      setPublishing(false);
      setProgress('');
    }
  }

  const overLimit = slideCount > 10;
  const actionLabel = mode === 'now' ? 'Publicar' : mode === 'schedule' ? 'Agendar' : 'Salvar rascunho';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[rgba(59,130,246,0.2)] bg-[#0E1117] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-[#F8FAFC]">
            <Instagram className="h-5 w-5" /> Publicar no Instagram
          </h2>
          <button type="button" onClick={onClose} className="text-[#94A3B8] hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!connected ? (
          <div className="space-y-4">
            <p className="text-sm text-[#CBD5E1]">
              Nenhuma conta do Instagram conectada. Conecte uma conta Business ou Creator em Credenciais
              para publicar.
            </p>
            <Link to="/settings/credentials">
              <Button className="w-full">
                <ExternalLink className="mr-2 h-4 w-4" /> Ir para Credenciais
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-[#94A3B8]">
              Conta conectada: <span className="text-[#60A5FA]">@{connection?.username}</span>
            </p>

            {/* Legenda */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-wider text-[#94A3B8]">Legenda</label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={loadingCaption}
                  onClick={() => void generateCaption()}
                >
                  {loadingCaption ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Wand2 className="mr-1 h-3 w-3" />}
                  Gerar outra
                </Button>
              </div>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={6}
                maxLength={2200}
                placeholder={loadingCaption ? 'Gerando legenda...' : 'Escreva a legenda...'}
                className="flex w-full resize-none rounded-md border border-[rgba(59,130,246,0.15)] bg-[rgba(15,18,35,0.5)] px-3 py-2 text-xs text-[#CBD5E1]"
              />
              <p className="text-right text-[10px] text-[#94A3B8]/70">{caption.length}/2200</p>
            </div>

            {/* Quando publicar */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-[#94A3B8]">Quando publicar</label>
              <div className="grid grid-cols-3 gap-2">
                {([['now', 'Agora'], ['schedule', 'Agendar'], ['draft', 'Rascunho']] as const).map(([m, lbl]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`h-9 rounded-md border text-xs transition-colors ${
                      mode === m
                        ? 'border-[#3B82F6] bg-[rgba(59,130,246,0.15)] text-[#60A5FA]'
                        : 'border-[rgba(59,130,246,0.2)] text-[#94A3B8] hover:border-[rgba(59,130,246,0.4)]'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              {mode === 'schedule' && (
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="mt-2 w-full rounded-md border border-[rgba(59,130,246,0.15)] bg-[rgba(15,18,35,0.5)] px-3 py-2 text-xs text-[#CBD5E1]"
                />
              )}
              {mode === 'schedule' && (
                <p className="text-[10px] text-[#94A3B8]/70">Fuso: {TZ}</p>
              )}
            </div>

            {/* Preview / contagem */}
            <p className="text-xs text-[#94A3B8]">
              {Math.min(slideCount, 10)} slide(s) serao publicados na ordem.
              {overLimit && <span className="text-amber-400"> O Instagram aceita no maximo 10; os demais serao ignorados.</span>}
            </p>

            <Button className="w-full" disabled={publishing} onClick={() => void handlePublish()}>
              {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Instagram className="mr-2 h-4 w-4" />}
              {publishing ? progress || 'Enviando...' : actionLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
