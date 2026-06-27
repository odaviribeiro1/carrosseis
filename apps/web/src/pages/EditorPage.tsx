import { useEffect, useRef, useState, type ChangeEvent } from 'react';
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
  ImagePlus,
  Pencil,
  X,
  Instagram,
  Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { getSupabaseClient } from '@/lib/supabase';
import { getZernioConnection, type ZernioConnection } from '@/lib/instanceSettings';
import { PublishModal } from '@/components/publish/PublishModal';
import { ShareModal } from '@/components/publish/ShareModal';
import { composeSlideBlobs, zipAndDownload } from '@/lib/export/compose';
import { measureSlotSize } from '@/lib/render/measureSlot';
import { getPreset, PRESETS, type Preset, type SlideType, type SlideText, type StyleTokens } from '@/lib/presets';
import { mergeTokens, brandFontFaces } from '@/lib/presets/mergeTokens';
import { loadDefaultBrandKit, loadBrandKitById, type BrandKitData } from '@/lib/brandKit';
import { SlideRenderer, FRAME_W, FRAME_H } from '@/components/render/SlideRenderer';

interface RefineSlide {
  id: string;
  position: number;
  slideType: SlideType;
  text: SlideText;
  slotImageUrl: string | null;
  imagePrompt: string | null;
  currentVersion: number;
}

function toSlideType(t: string | null): SlideType {
  if (t === 'capa') return 'capa';
  if (t === 'cta') return 'cta';
  return 'conteudo';
}

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  const [slides, setSlides] = useState<RefineSlide[]>([]);
  const [preset, setPreset] = useState<Preset>(getPreset(null));
  const [brandKit, setBrandKit] = useState<BrandKitData | null>(null);
  const [social, setSocial] = useState<{ name?: string; handle?: string; avatar_url?: string } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [refinePrompt, setRefinePrompt] = useState('');
  const [refineImage, setRefineImage] = useState<string | null>(null);
  const [refineImageName, setRefineImageName] = useState('');
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [applyAllProgress, setApplyAllProgress] = useState('');
  const [reverting, setReverting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [zernioConn, setZernioConn] = useState<ZernioConnection | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Nós 1:1 (offscreen) para captura no export.
  const exportRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Conexão Zernio (Instagram) — carregada uma vez para o botão de publicação.
  useEffect(() => {
    getZernioConnection().then(setZernioConn).catch(() => setZernioConn(null));
  }, []);

  const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

  const tokens: StyleTokens = mergeTokens(preset, brandKit);
  const fonts = brandFontFaces(brandKit);

  function handleAttachImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Formato nao suportado. Use PNG, JPG ou WEBP.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('Imagem muito grande (max 10MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setRefineImage(reader.result as string);
      setRefineImageName(file.name);
    };
    reader.onerror = () => toast.error('Erro ao ler a imagem.');
    reader.readAsDataURL(file);
  }

  function removeRefineImage() {
    setRefineImage(null);
    setRefineImageName('');
  }

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
        const [{ data: carousel }, { data, error }] = await Promise.all([
          client.from('carousels').select('preset_id, brand_kit_id, social_profile').eq('id', id).maybeSingle(),
          client
            .from('carousel_slides')
            .select('id, position, slide_type, text_content, slot_image_url, image_url, content, image_prompt, current_version')
            .eq('carousel_id', id)
            .order('position', { ascending: true }),
        ]);
        if (error) throw error;
        if (ignore) return;
        if (carousel?.preset_id) setPreset(getPreset(carousel.preset_id as string));
        setSocial((carousel?.social_profile ?? null) as typeof social);
        const bkId = carousel?.brand_kit_id as string | null;
        (bkId ? loadBrandKitById(bkId) : loadDefaultBrandKit())
          .then((bk) => !ignore && setBrandKit(bk))
          .catch(() => {});
        setSlides(
          (data ?? []).map((s) => {
            const tc = (s.text_content as SlideText | null) ?? null;
            const legacy = (s.content as { headline?: string; body?: string; cta?: string } | null) ?? null;
            return {
              id: s.id as string,
              position: s.position as number,
              slideType: toSlideType(s.slide_type as string | null),
              text: tc ?? {
                title: legacy?.headline ?? '',
                body: legacy?.body ?? '',
                cta: legacy?.cta ?? '',
              },
              slotImageUrl: (s.slot_image_url as string | null) ?? (s.image_url as string | null) ?? null,
              imagePrompt: (s.image_prompt as string | null) ?? null,
              currentVersion: (s.current_version as number | null) ?? 1,
            };
          }),
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
    const adj = instruction.trim();
    let prompt = basePrompt;
    if (adj) {
      prompt += `\n\nAJUSTE SOLICITADO (mantendo a regra de NAO incluir texto): ${adj}.`;
    } else if (refineImage) {
      prompt += '\n\nAJUSTE SOLICITADO: use a imagem de referencia fornecida como inspiracao visual, mantendo a regra de NAO incluir texto.';
    }
    if (!prompt.trim()) throw new Error('Este slide nao tem prompt base. Gere o carrossel novamente.');

    // Mede o slot (offscreen 1:1) para gerar a imagem no ratio exato.
    const { size, aspect } = measureSlotSize(exportRefs.current.get(slide.id));

    const { data, error } = await client.functions.invoke('generate-slide-image', {
      body: { slide_id: slide.id, prompt, reference_image: refineImage ?? undefined, size, aspect },
    });
    if (error) throw error;
    const result = data as { slot_image_url?: string; image_url?: string; version?: number; error?: string };
    if (result?.error) throw new Error(result.error);
    const url = result?.slot_image_url ?? result?.image_url;
    if (!url) throw new Error('Nenhuma imagem retornada');
    return { imageUrl: url, version: result.version ?? slide.currentVersion + 1, prompt };
  }

  function applyResult(slideId: string, imageUrl: string, version: number, prompt: string) {
    setSlides((prev) =>
      prev.map((s) =>
        s.id === slideId
          ? { ...s, slotImageUrl: `${imageUrl}?v=${version}`, currentVersion: version, imagePrompt: prompt }
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
    if (!instruction && !refineImage) {
      toast.error('Escreva uma instrucao ou anexe uma imagem para aplicar em todos.');
      return;
    }
    let done = 0;
    const total = slides.length;
    setApplyAllProgress(`Aplicando 0/${total}`);
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
      const { data: versions, error } = await client
        .from('carousel_slide_versions')
        .select('id, version, image_url, image_prompt')
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
          slot_image_url: prev.image_url,
          image_prompt: prev.image_prompt,
          current_version: prev.version,
        })
        .eq('id', active.id);
      if (updErr) throw updErr;

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

  // Troca o preset do carrossel inteiro: recompoe todos os slides (mantendo
  // conteudo e imagens dos slots). So muda o template; persiste em carousels.preset_id.
  async function changePreset(nextId: string) {
    const next = getPreset(nextId);
    if (next.id === preset.id) return;
    setPreset(next);
    const client = getSupabaseClient();
    if (client && id) {
      const { error } = await client.from('carousels').update({ preset_id: next.id }).eq('id', id);
      if (error) toast.error('Erro ao salvar preset');
      else toast.success(`Preset alterado para ${next.name}`);
    }
  }

  async function handleDownload() {
    if (slides.length === 0) return;
    setDownloading(true);
    try {
      // Composição client-side: o MESMO SlideRenderer (offscreen, 1:1) é capturado.
      const ordered = [...slides].sort((a, b) => a.position - b.position);
      const pairs = ordered
        .map((s) => ({ slide: s, node: exportRefs.current.get(s.id) }))
        .filter((p): p is { slide: RefineSlide; node: HTMLDivElement } => Boolean(p.node));
      if (pairs.length === 0) throw new Error('Nada para exportar.');

      const blobs = await composeSlideBlobs(pairs.map((p) => p.node));
      await zipAndDownload(blobs, 'carrossel');

      // Persiste o PNG final composto (composed_image_url) — usado pelo download do Dashboard.
      const client = getSupabaseClient();
      if (client && id) {
        await Promise.all(
          pairs.map(async (p, i) => {
            try {
              const path = `${id}/${p.slide.id}_composed.png`;
              const up = await client.storage.from('slide-images').upload(path, blobs[i]!, {
                contentType: 'image/png',
                upsert: true,
              });
              if (up.error) return;
              const url = client.storage.from('slide-images').getPublicUrl(path).data.publicUrl;
              await client.from('carousel_slides').update({ composed_image_url: `${url}?t=${Date.now()}` }).eq('id', p.slide.id);
            } catch {
              /* best-effort: falha de upload nao impede o download local */
            }
          }),
        );
        await client.from('carousels').update({ downloaded_at: new Date().toISOString() }).eq('id', id);
      }
      toast.success('Download iniciado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao baixar');
    } finally {
      setDownloading(false);
    }
  }

  // Compõe os slides finais (1:1) e sobe os PNGs ao bucket público; retorna as
  // URLs públicas na ordem dos slides (consumidas pelo Zernio). Igual à composição
  // do download, mas devolve URLs em vez de baixar — garante composed_image_url
  // mesmo sem "Baixar ZIP" antes de publicar.
  async function composeAndUpload(): Promise<{ position: number; url: string }[]> {
    const client = getSupabaseClient();
    if (!client || !id) throw new Error('Supabase nao configurado.');
    const ordered = [...slides].sort((a, b) => a.position - b.position);
    const pairs = ordered
      .map((s) => ({ slide: s, node: exportRefs.current.get(s.id) }))
      .filter((p): p is { slide: RefineSlide; node: HTMLDivElement } => Boolean(p.node));
    if (pairs.length === 0) throw new Error('Nada para compor.');

    const blobs = await composeSlideBlobs(pairs.map((p) => p.node));
    const urls: { position: number; url: string }[] = [];
    for (let i = 0; i < pairs.length; i += 1) {
      const p = pairs[i]!;
      const path = `${id}/${p.slide.id}_composed.png`;
      const up = await client.storage.from('slide-images').upload(path, blobs[i]!, {
        contentType: 'image/png',
        upsert: true,
      });
      if (up.error) throw new Error('Falha ao subir a imagem do slide.');
      const url = client.storage.from('slide-images').getPublicUrl(path).data.publicUrl;
      await client.from('carousel_slides').update({ composed_image_url: `${url}?t=${Date.now()}` }).eq('id', p.slide.id);
      urls.push({ position: p.slide.position, url });
    }
    return urls;
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

  const THUMB_W = 160;
  const thumbScale = THUMB_W / FRAME_W;
  const CENTER_W = 480;
  const centerScale = CENTER_W / FRAME_W;

  return (
    <div className="flex h-screen flex-col bg-[#0A0A0F]">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-[rgba(59,130,246,0.15)] px-4 py-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Dashboard
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/draft/${id}`)} disabled={busy}>
            <Pencil className="mr-2 h-4 w-4" /> Voltar para a etapa anterior
          </Button>
        </div>
        <div className="flex items-center gap-3 text-sm text-[#94A3B8]">
          <span className="flex items-center gap-2">
            <Layers className="h-4 w-4" /> {slides.length} slides
          </span>
          <label className="flex items-center gap-1.5">
            <span className="text-xs">Preset</span>
            <select
              value={preset.id}
              disabled={busy}
              onChange={(e) => void changePreset(e.target.value)}
              className="rounded-md border border-[rgba(59,130,246,0.2)] bg-[#0A0A0F] px-2 py-1 text-xs text-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] disabled:opacity-50"
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void handleDownload()} disabled={downloading}>
            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Baixar ZIP
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)} disabled={slides.length === 0}>
            <Smartphone className="mr-2 h-4 w-4" />
            Enviar pro celular
          </Button>
          <Button size="sm" onClick={() => setPublishOpen(true)} disabled={slides.length === 0}>
            <Instagram className="mr-2 h-4 w-4" />
            Publicar no Instagram
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Painel de slides (esquerda) */}
        <div className="w-48 shrink-0 space-y-2 overflow-y-auto border-r border-[rgba(59,130,246,0.15)] p-3">
          {slides.map((slide, i) => (
            <div
              key={slide.id}
              className={`group relative cursor-pointer overflow-hidden rounded-lg border-2 transition-all ${
                i === activeIndex ? 'border-[#3B82F6]' : 'border-transparent opacity-70 hover:opacity-100'
              }`}
              onClick={() => setActiveIndex(i)}
            >
              <SlideRenderer
                preset={preset}
                slideType={slide.slideType}
                tokens={tokens}
                content={slide.text}
                slotImageUrl={slide.slotImageUrl}
                accountName={social?.name}
                accountHandle={social?.handle}
                avatarUrl={social?.avatar_url}
                scale={thumbScale}
                fontFaces={fonts}
              />
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
        <div className="flex flex-1 items-center justify-center overflow-auto p-6">
          {active ? (
            <div className="relative overflow-hidden rounded-2xl border border-[rgba(59,130,246,0.2)] shadow-[0_0_60px_rgba(59,130,246,0.08)]">
              <SlideRenderer
                preset={preset}
                slideType={active.slideType}
                tokens={tokens}
                content={active.text}
                slotImageUrl={active.slotImageUrl}
                accountName={social?.name}
                accountHandle={social?.handle}
                avatarUrl={social?.avatar_url}
                scale={centerScale}
                fontFaces={fonts}
              />
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
              Descreva o ajuste da imagem (foto do slot). O texto e do template e nao muda aqui.
            </p>
          </div>

          <textarea
            value={refinePrompt}
            onChange={(e) => setRefinePrompt(e.target.value)}
            rows={4}
            placeholder='Ex: "fundo mais escuro, foco no objeto"'
            disabled={busy}
            className="flex w-full resize-none rounded-md border border-[rgba(59,130,246,0.2)] bg-[#0A0A0F] px-3 py-2 text-xs text-[#CBD5E1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] disabled:opacity-50"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleAttachImage}
          />
          {refineImage ? (
            <div className="flex items-center gap-2 rounded-md border border-[rgba(59,130,246,0.2)] bg-[#0A0A0F] p-2">
              <img src={refineImage} alt="Referencia" className="h-12 w-12 shrink-0 rounded object-cover" />
              <span className="min-w-0 flex-1 truncate text-[11px] text-[#CBD5E1]">{refineImageName}</span>
              <button
                type="button"
                onClick={removeRefineImage}
                disabled={busy}
                className="shrink-0 rounded p-1 text-[#94A3B8] hover:text-[#EF4444] disabled:opacity-40"
                title="Remover imagem"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()} disabled={busy}>
              <ImagePlus className="mr-2 h-4 w-4" /> Anexar imagem
            </Button>
          )}

          <Button className="w-full" onClick={() => void regenerateSlide()} disabled={busy}>
            {regeneratingId === active?.id ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando...</>
            ) : (
              <><RefreshCw className="mr-2 h-4 w-4" /> Regenerar imagem deste slide</>
            )}
          </Button>

          <Button variant="outline" className="w-full" onClick={() => void applyToAll()} disabled={busy}>
            {applyAllProgress ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {applyAllProgress}</>
            ) : (
              <><Layers className="mr-2 h-4 w-4" /> Regenerar imagem de todos</>
            )}
          </Button>

          <Button variant="outline" className="w-full" onClick={() => void revertSlide()} disabled={busy}>
            {reverting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Revertendo...</>
            ) : (
              <><Undo2 className="mr-2 h-4 w-4" /> Reverter para versao anterior</>
            )}
          </Button>

          {active && <p className="text-[10px] text-[#94A3B8]/70">Versao atual: v{active.currentVersion}</p>}
        </div>
      </div>

      {/* Render offscreen 1:1 para o export (mesmo componente do preview). */}
      <div style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none', opacity: 0 }} aria-hidden>
        {slides.map((slide) => (
          <div
            key={slide.id}
            ref={(el) => {
              if (el) exportRefs.current.set(slide.id, el);
              else exportRefs.current.delete(slide.id);
            }}
            style={{ width: FRAME_W, height: FRAME_H }}
          >
            <SlideRenderer
              preset={preset}
              slideType={slide.slideType}
              tokens={tokens}
              content={slide.text}
              slotImageUrl={slide.slotImageUrl}
              accountName={social?.name}
              accountHandle={social?.handle}
              avatarUrl={social?.avatar_url}
              scale={1}
              fontFaces={fonts}
            />
          </div>
        ))}
      </div>

      {publishOpen && id && (
        <PublishModal
          carouselId={id}
          slideCount={slides.length}
          captionSlides={slides
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((s) => ({ headline: s.text.title, body: s.text.body }))}
          connection={zernioConn}
          composeAndUpload={composeAndUpload}
          onClose={() => setPublishOpen(false)}
        />
      )}

      {shareOpen && id && (
        <ShareModal
          carouselId={id}
          captionSlides={slides
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((s) => ({ headline: s.text.title, body: s.text.body }))}
          composeAndUpload={composeAndUpload}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}
