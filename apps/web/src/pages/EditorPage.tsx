import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Loader2,
  Monitor,
  ArrowLeft,
  Download,
  RefreshCw,
  Layers,
  Undo2,
  ChevronUp,
  ChevronDown,
  ImageOff,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { getSupabaseClient } from '@/lib/supabase';
import { downloadImagesAsZip } from '@/lib/export/download-zip';
import type { DesignSpec } from '@/types/carousel';

interface RefineSlide {
  id: string;
  position: number;
  imageUrl: string | null;
  imagePrompt: string | null;
  designSpec: DesignSpec | null;
  currentVersion: number;
}

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  const [slides, setSlides] = useState<RefineSlide[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [refinePrompt, setRefinePrompt] = useState('');
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [applyAllProgress, setApplyAllProgress] = useState('');
  const [reverting, setReverting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    function checkSize() {
      setIsMobile(window.innerWidth < 1024);
    }
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, []);

  useEffect(() => {
    if (!id) return;
    let ignore = false;

    async function load() {
      const client = getSupabaseClient();
      if (!client) return;
      try {
        const { data, error } = await client
          .from('carousel_slides')
          .select('id, position, image_url, image_prompt, design_spec, current_version')
          .eq('carousel_id', id)
          .order('position', { ascending: true });
        if (error) throw error;
        if (ignore) return;
        setSlides(
          (data ?? []).map((s) => ({
            id: s.id as string,
            position: s.position as number,
            imageUrl: (s.image_url as string | null) ?? null,
            imagePrompt: (s.image_prompt as string | null) ?? null,
            designSpec: (s.design_spec as DesignSpec | null) ?? null,
            currentVersion: (s.current_version as number | null) ?? 1,
          })),
        );
      } catch (err) {
        if (ignore) return;
        toast.error('Erro ao carregar carrossel');
        console.error(err);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [id]);

  const busy = Boolean(regeneratingId) || Boolean(applyAllProgress) || reverting;
  const active = slides[activeIndex];

  async function callGenerate(slide: RefineSlide, instruction: string) {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase nao configurado');
    const basePrompt = slide.imagePrompt ?? '';
    const prompt = instruction.trim()
      ? `${basePrompt}\n\nAJUSTE SOLICITADO (mantenha o texto literal e a identidade): ${instruction.trim()}.`
      : basePrompt;
    if (!prompt.trim()) throw new Error('Este slide nao tem prompt base. Gere o carrossel novamente.');

    const { data, error } = await client.functions.invoke('generate-slide-image', {
      body: { slide_id: slide.id, prompt },
    });
    if (error) throw error;
    const result = data as { image_url?: string; version?: number; error?: string };
    if (result?.error) throw new Error(result.error);
    if (!result?.image_url) throw new Error('Nenhuma imagem retornada');
    return { imageUrl: result.image_url, version: result.version ?? slide.currentVersion + 1, prompt };
  }

  function applyResult(slideId: string, imageUrl: string, version: number, prompt: string) {
    setSlides((prev) =>
      prev.map((s) =>
        s.id === slideId
          ? { ...s, imageUrl: `${imageUrl}?v=${version}`, currentVersion: version, imagePrompt: prompt }
          : s,
      ),
    );
  }

  async function regenerateSlide() {
    if (!active || busy) return;
    setRegeneratingId(active.id);
    try {
      const { imageUrl, version, prompt } = await callGenerate(active, refinePrompt);
      applyResult(active.id, imageUrl, version, prompt);
      setRefinePrompt('');
      toast.success(`Slide ${active.position} regenerado`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao regenerar slide');
    } finally {
      setRegeneratingId(null);
    }
  }

  async function applyToAll() {
    if (busy || slides.length === 0) return;
    const instruction = refinePrompt.trim();
    if (!instruction) {
      toast.error('Escreva uma instrucao de refino para aplicar em todos.');
      return;
    }
    let done = 0;
    const total = slides.length;
    setApplyAllProgress(`Aplicando 0/${total}`);
    // Concorrencia 3 (last-write-wins por slide; cada slide e independente).
    let cursor = 0;
    const list = [...slides];
    const runners = Array.from({ length: Math.min(3, list.length) }, async () => {
      while (cursor < list.length) {
        const slide = list[cursor++];
        if (!slide) continue;
        try {
          const { imageUrl, version, prompt } = await callGenerate(slide, instruction);
          applyResult(slide.id, imageUrl, version, prompt);
        } catch (err) {
          console.error(`Erro ao aplicar refino no slide ${slide.position}:`, err);
        } finally {
          done += 1;
          setApplyAllProgress(`Aplicando ${done}/${total}`);
        }
      }
    });
    await Promise.all(runners);
    setApplyAllProgress('');
    setRefinePrompt('');
    toast.success('Refino aplicado em todos os slides');
  }

  async function revertSlide() {
    if (!active || busy) return;
    const client = getSupabaseClient();
    if (!client) return;
    setReverting(true);
    try {
      // Busca a versao imediatamente anterior arquivada.
      const { data: versions, error } = await client
        .from('carousel_slide_versions')
        .select('id, version, image_url, image_prompt, design_spec')
        .eq('slide_id', active.id)
        .order('version', { ascending: false })
        .limit(1);
      if (error) throw error;
      const prev = versions?.[0];
      if (!prev) {
        toast.error('Nao ha versao anterior para este slide.');
        return;
      }

      const { error: updErr } = await client
        .from('carousel_slides')
        .update({
          image_url: prev.image_url,
          image_prompt: prev.image_prompt,
          design_spec: prev.design_spec,
          current_version: prev.version,
        })
        .eq('id', active.id);
      if (updErr) throw updErr;

      // Remove a versao restaurada para que reverter de novo volte mais um passo.
      await client.from('carousel_slide_versions').delete().eq('id', prev.id);

      applyResult(active.id, prev.image_url as string, prev.version as number, (prev.image_prompt as string) ?? '');
      toast.success(`Slide ${active.position} revertido para versao ${prev.version}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao reverter slide');
    } finally {
      setReverting(false);
    }
  }

  async function reorder(index: number, dir: -1 | 1) {
    if (busy) return;
    const target = index + dir;
    if (target < 0 || target >= slides.length) return;
    const a = slides[index];
    const b = slides[target];
    if (!a || !b) return;
    const client = getSupabaseClient();
    if (!client) return;

    // Troca as posicoes localmente e persiste.
    const next = [...slides];
    const aPos = a.position;
    const bPos = b.position;
    next[index] = { ...b, position: aPos };
    next[target] = { ...a, position: bPos };
    setSlides(next);
    setActiveIndex(target);

    const [r1, r2] = await Promise.all([
      client.from('carousel_slides').update({ position: bPos }).eq('id', a.id),
      client.from('carousel_slides').update({ position: aPos }).eq('id', b.id),
    ]);
    if (r1.error || r2.error) toast.error('Erro ao reordenar slides');
  }

  async function handleDownload() {
    if (slides.length === 0) return;
    const images = slides
      .filter((s) => s.imageUrl)
      .map((s) => ({ position: s.position, url: s.imageUrl as string }));
    if (images.length === 0) {
      toast.error('Nenhum slide tem imagem gerada ainda.');
      return;
    }
    setDownloading(true);
    try {
      await downloadImagesAsZip(images, 'carrossel');
      toast.success('Download iniciado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao baixar');
    } finally {
      setDownloading(false);
    }
  }

  if (isMobile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0F] p-8">
        <div className="text-center">
          <Monitor className="mx-auto h-12 w-12 text-[#94A3B8]" />
          <h2 className="mt-4 text-lg font-semibold">Use no Desktop</h2>
          <p className="mt-2 text-sm text-[#94A3B8]">
            O refino de carrosseis funciona melhor em telas maiores que 1024px.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#3B82F6]" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#0A0A0F]">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-[rgba(59,130,246,0.15)] px-4 py-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Dashboard
        </Button>
        <div className="flex items-center gap-2 text-sm text-[#94A3B8]">
          <Layers className="h-4 w-4" /> {slides.length} slides
        </div>
        <Button variant="outline" size="sm" onClick={() => void handleDownload()} disabled={downloading}>
          {downloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Baixar ZIP
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Painel de slides (esquerda) */}
        <div className="w-44 shrink-0 space-y-2 overflow-y-auto border-r border-[rgba(59,130,246,0.15)] p-3">
          {slides.map((slide, i) => (
            <div
              key={slide.id}
              className={`group relative cursor-pointer overflow-hidden rounded-lg border-2 transition-all ${
                i === activeIndex
                  ? 'border-[#3B82F6]'
                  : 'border-transparent opacity-70 hover:opacity-100'
              }`}
              onClick={() => setActiveIndex(i)}
            >
              <div className="flex aspect-[4/5] items-center justify-center bg-[rgba(59,130,246,0.06)]">
                {slide.imageUrl ? (
                  <img src={slide.imageUrl} alt={`Slide ${slide.position}`} className="h-full w-full object-cover" />
                ) : (
                  <ImageOff className="h-6 w-6 text-[#94A3B8]" />
                )}
              </div>
              <div className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                {slide.position}
              </div>
              <div className="absolute right-1 top-1 flex flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  className="rounded bg-black/60 p-0.5 text-white disabled:opacity-30"
                  disabled={i === 0 || busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    void reorder(i, -1);
                  }}
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  className="rounded bg-black/60 p-0.5 text-white disabled:opacity-30"
                  disabled={i === slides.length - 1 || busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    void reorder(i, 1);
                  }}
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
              {regeneratingId === slide.id && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Slide ativo (centro) */}
        <div className="flex flex-1 items-center justify-center overflow-hidden p-6">
          {active ? (
            <div className="relative aspect-[4/5] h-full max-h-[80vh] overflow-hidden rounded-2xl border border-[rgba(59,130,246,0.2)] bg-[rgba(59,130,246,0.04)] shadow-[0_0_60px_rgba(59,130,246,0.08)]">
              {active.imageUrl ? (
                <img src={active.imageUrl} alt={`Slide ${active.position}`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[#94A3B8]">
                  <ImageOff className="h-10 w-10" />
                  <p className="text-sm">Imagem ainda nao gerada</p>
                </div>
              )}
              {regeneratingId === active.id && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <div className="flex items-center gap-2 text-white">
                    <Loader2 className="h-5 w-5 animate-spin" /> Gerando slide {active.position}...
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[#94A3B8]">Nenhum slide.</p>
          )}
        </div>

        {/* Painel de refino (direita) */}
        <div className="w-80 shrink-0 space-y-4 overflow-y-auto border-l border-[rgba(59,130,246,0.15)] p-4">
          <div>
            <h2 className="text-sm font-semibold text-[#F8FAFC]">Refinar slide {active?.position ?? ''}</h2>
            <p className="mt-1 text-xs text-[#94A3B8]">
              Descreva o ajuste em linguagem natural. A IA regenera a imagem mantendo o texto.
            </p>
          </div>

          <textarea
            value={refinePrompt}
            onChange={(e) => setRefinePrompt(e.target.value)}
            rows={4}
            placeholder='Ex: "deixe o fundo mais escuro e o titulo maior"'
            disabled={busy}
            className="flex w-full resize-none rounded-md border border-[rgba(59,130,246,0.2)] bg-[#0A0A0F] px-3 py-2 text-xs text-[#CBD5E1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] disabled:opacity-50"
          />

          <Button className="w-full" onClick={() => void regenerateSlide()} disabled={busy}>
            {regeneratingId === active?.id ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" /> Regenerar este slide
              </>
            )}
          </Button>

          <Button variant="outline" className="w-full" onClick={() => void applyToAll()} disabled={busy}>
            {applyAllProgress ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {applyAllProgress}
              </>
            ) : (
              <>
                <Layers className="mr-2 h-4 w-4" /> Aplicar em todos os slides
              </>
            )}
          </Button>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => void revertSlide()}
            disabled={busy}
          >
            {reverting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Revertendo...
              </>
            ) : (
              <>
                <Undo2 className="mr-2 h-4 w-4" /> Reverter para versao anterior
              </>
            )}
          </Button>

          {active && (
            <p className="text-[10px] text-[#94A3B8]/70">Versao atual: v{active.currentVersion}</p>
          )}
        </div>
      </div>
    </div>
  );
}
