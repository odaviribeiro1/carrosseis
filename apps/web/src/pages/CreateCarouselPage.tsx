import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Loader2,
  FileText,
  Images,
  Image as ImageIcon,
  Film,
  Youtube,
  ArrowRight,
  ArrowLeft,
  Save,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CarouselPreview } from '@/components/preview/CarouselPreview';
import { VisualSettingsStep } from '@/components/create/VisualSettingsStep';
import { getSupabaseClient } from '@/lib/supabase';
import { generatedContentSchema, visualSettingsSchema } from '@/types/carousel';
import type { SlideContent, VisualSettings } from '@/types/carousel';
import { buildSlotPrompt } from '@/lib/ai/buildSlotPrompt';
import { generateArtDirection } from '@/lib/ai/generateArtDirection';
import type { ArtDirection } from '@content-hub/shared';
import { getInstanceImageProvider } from '@/lib/imageProvider';
import { getDefaultCta, getDefaultSocialProfile, setDefaultSocialProfile } from '@/lib/instanceSettings';
import { PRESETS, DEFAULT_PRESET_ID, getPreset, isSocialPreset } from '@/lib/presets';
import type { SlideType, SlideText } from '@/lib/presets/types';
import { mergeTokens, brandFontFaces } from '@/lib/presets/mergeTokens';
import { PresetThumbnail } from '@/components/render/PresetThumbnail';
import { SlideRenderer, FRAME_W, FRAME_H } from '@/components/render/SlideRenderer';
import { measureSlotSize } from '@/lib/render/measureSlot';
import { loadDefaultBrandKit, listBrandKits, loadBrandKitById, type BrandKitData } from '@/lib/brandKit';

type ContentSource = 'text' | 'ig_carousel' | 'ig_post' | 'ig_reel' | 'youtube';

type Depth = 'superficial' | 'normal' | 'aprofundado';

// Profundidade NAO aumenta densidade de texto por slide (quebra o Nano Banana em texto
// longo); aumenta a QUANTIDADE de slides, mantendo um teto seguro de palavras por corpo.
const DEPTH_CONFIG: Record<
  Depth,
  { wordCap: number; min: number; max: number; mid: number; label: string }
> = {
  superficial: { wordCap: 15, min: 3, max: 5, mid: 4, label: 'texto curto' },
  normal: { wordCap: 35, min: 5, max: 8, mid: 6, label: 'texto medio' },
  aprofundado: { wordCap: 55, min: 8, max: 12, mid: 10, label: 'texto longo' },
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Trunca o corpo no teto de palavras, preferindo terminar em pontuacao de frase.
function truncateToWordCap(text: string, cap: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= cap) return text.trim();
  const slice = words.slice(0, cap).join(' ');
  // Corta no fim da ultima frase completa, se houver dentro do limite.
  const lastSentence = slice.match(/^[\s\S]*[.!?]/);
  const result = lastSentence ? lastSentence[0] : slice;
  return result.replace(/[\s,;:]+$/, '').trim();
}

const configSchema = z.object({
  topic: z.string().optional().default(''),
  angle: z.string().optional().default(''),
  toneMode: z.enum(['original', 'custom']).default('original'),
  toneOfVoice: z.string().optional(),
  audience: z.string().optional(),
  depth: z.enum(['superficial', 'normal', 'aprofundado']).default('normal'),
  slideCount: z.number().min(3).max(15),
  presetId: z.string().default(DEFAULT_PRESET_ID),
  brandKitId: z.string().default(''),
});

type ConfigFormValues = z.infer<typeof configSchema>;

// O supabase-js empacota erros HTTP da Edge Function como FunctionsHttpError com
// `.message = "non-2xx status code"` e o corpo real em `.context` (Response).
// Extrai a mensagem pt-BR do corpo `{ error }` quando disponivel.
async function extractInvokeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const parsed = await ctx.json();
      if (parsed?.error) return String(parsed.error);
    } catch {
      /* corpo nao-JSON: usa a mensagem padrao abaixo */
    }
  }
  return error instanceof Error ? error.message : String(error);
}

// Mapeia o conteudo gerado (headline/body/cta) para o texto do slide (title/body/cta).
function toSlideText(s: SlideContent): SlideText {
  return { title: s.headline ?? '', body: s.body ?? '', cta: s.cta ?? '' };
}

// Tipo de slide do preset (preset so tem capa/conteudo/cta; 'transicao' vira 'conteudo').
function toSlideType(t: SlideContent['type']): SlideType {
  if (t === 'capa') return 'capa';
  if (t === 'cta') return 'cta';
  return 'conteudo';
}

const sourceIcons: Record<ContentSource, typeof FileText> = {
  text: FileText,
  ig_carousel: Images,
  ig_post: ImageIcon,
  ig_reel: Film,
  youtube: Youtube,
};

const sourceLabels: Record<ContentSource, string> = {
  text: 'Texto Livre',
  ig_carousel: 'Carrossel IG',
  ig_post: 'Post IG',
  ig_reel: 'Reels IG',
  youtube: 'YouTube',
};

const sourcePlaceholders: Record<ContentSource, string> = {
  text: '',
  ig_carousel: 'https://www.instagram.com/p/...',
  ig_post: 'https://www.instagram.com/p/...',
  ig_reel: 'https://www.instagram.com/reel/...',
  youtube: 'https://www.youtube.com/watch?v=...',
};

const defaultVisualSettings: VisualSettings = {
  imageStyle: 'realista',
  colorPalette: ['#1E3A5F', '#3B82F6', '#94A3B8', '#F8FAFC', '#0F1223'],
  aspectRatio: '4:5',
  slideMode: 'image_text',
  referenceImages: [],
  imagePrompt: '',
  resolution: 'standard',
};

type ScrapeResult = {
  caption: string;
  images: string[];
  videoUrl: string | null;
  type: 'Sidecar' | 'Image' | 'Video';
};

function isValidSourceUrl(source: ContentSource, value: string): boolean {
  if (source === 'text') return true;
  const v = value.trim();
  if (source === 'ig_carousel' || source === 'ig_post') {
    return /^https?:\/\/(www\.)?instagram\.com\/(p|tv)\//i.test(v);
  }
  if (source === 'ig_reel') {
    return /^https?:\/\/(www\.)?instagram\.com\/reel(s)?\//i.test(v);
  }
  if (source === 'youtube') {
    return /^https?:\/\/(www\.)?(youtube\.com\/(watch|shorts)|youtu\.be\/)/i.test(v);
  }
  return false;
}

// Concatena legenda + texto extraido no formato esperado pelo LLM.
function buildContentForLLM(params: {
  caption: string;
  perSlide?: Array<{ position: number; text: string }>;
  fullText?: string;
}): string {
  const parts: string[] = [];
  if (params.caption.trim()) {
    parts.push('[LEGENDA ORIGINAL]', params.caption.trim());
  }
  if (params.perSlide && params.perSlide.length > 0) {
    parts.push('\n[CONTEUDO EXTRAIDO]');
    for (const slide of params.perSlide) {
      parts.push(`\nSlide ${slide.position}:`);
      parts.push(slide.text.trim() || '(sem texto)');
    }
  } else if (params.fullText && params.fullText.trim()) {
    parts.push('\n[CONTEUDO EXTRAIDO]', params.fullText.trim());
  }
  return parts.join('\n');
}

export function CreateCarouselPage() {
  const navigate = useNavigate();
  // Em /draft/:id estamos editando um rascunho existente (abre direto na Preview).
  const { id: editingId } = useParams<{ id: string }>();
  const [loadingDraft, setLoadingDraft] = useState(Boolean(editingId));
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<ContentSource>('text');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');

  // Extracao
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [scrape, setScrape] = useState<ScrapeResult | null>(null);
  const [editedCaption, setEditedCaption] = useState('');

  // Carrossel: selecao de slides + OCR
  const [isOcring, setIsOcring] = useState(false);
  const [ocrResults, setOcrResults] = useState<Array<{ position: number; text: string }>>([]);

  // Transcricao (reel/youtube)
  const [transcript, setTranscript] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);

  // OCR para post unico
  const [postOcrText, setPostOcrText] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuggestingTopic, setIsSuggestingTopic] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [acceptProgress, setAcceptProgress] = useState('');
  // Quando true, a proxima geracao recomputa a direcao de arte (ignora o cache).
  const [forceArtDirection, setForceArtDirection] = useState(false);
  const [generatedSlides, setGeneratedSlides] = useState<SlideContent[]>([]);
  const [configValues, setConfigValues] = useState<ConfigFormValues | null>(null);
  // Brand Kit (overrides de cor/fonte/logo aplicados ao preset) + lista p/ seletor.
  const [brandKit, setBrandKit] = useState<BrandKitData | null>(null);
  const [brandKits, setBrandKits] = useState<BrandKitData[]>([]);
  useEffect(() => {
    listBrandKits().then(setBrandKits).catch(() => setBrandKits([]));
  }, []);
  // Renderers offscreen 1:1 (por position) para medir o slot antes de gerar a imagem.
  const slotRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Identidade social (presets Post do X): nome, @ e foto de perfil.
  const [socialName, setSocialName] = useState('');
  const [socialHandle, setSocialHandle] = useState('');
  const [socialAvatar, setSocialAvatar] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingSocialDefault, setSavingSocialDefault] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [visualSettings, setVisualSettings] = useState<VisualSettings>(defaultVisualSettings);
  // Conteudo extraido editavel na tela de Configuracao (origens Instagram/YouTube).
  const [extractedDraft, setExtractedDraft] = useState('');
  const [topicError, setTopicError] = useState('');

  // Origem com conteudo extraido (vs. tema/texto livre).
  const isExtracted = source !== 'text';

  const {
    register,
    handleSubmit,
    watch,
    setValue,
  } = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      topic: '',
      angle: '',
      toneMode: 'original',
      toneOfVoice: '',
      audience: '',
      depth: 'normal',
      slideCount: DEPTH_CONFIG.normal.mid,
      presetId: DEFAULT_PRESET_ID,
      brandKitId: '',
    },
  });

  const depth = (watch('depth') ?? 'normal') as Depth;
  const slideCountValue = watch('slideCount');

  const toneMode = watch('toneMode');
  const presetId = (watch('presetId') ?? DEFAULT_PRESET_ID) as string;
  const brandKitId = (watch('brandKitId') ?? '') as string;

  // Carrega o Brand Kit selecionado ('' = default, se houver).
  useEffect(() => {
    const load = brandKitId ? loadBrandKitById(brandKitId) : loadDefaultBrandKit();
    load.then(setBrandKit).catch(() => setBrandKit(null));
  }, [brandKitId]);

  // Profundidade dirige o default de quantidade de slides (faixa central).
  function handleDepthChange(next: Depth) {
    setValue('depth', next);
    setValue('slideCount', DEPTH_CONFIG[next].mid);
  }

  // Upload da foto de perfil (header social) -> Storage publico -> URL.
  async function handleAvatarUpload(file: File | undefined) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Use PNG, JPG ou WEBP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Imagem muito grande (max 5MB).');
      return;
    }
    setUploadingAvatar(true);
    try {
      const client = getSupabaseClient();
      if (!client) throw new Error('Supabase nao configurado');
      const { data: { user } } = await client.auth.getUser();
      if (!user) throw new Error('Nao autenticado');
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `avatars/${user.id}/${Date.now()}.${ext}`;
      const { error } = await client.storage.from('slide-images').upload(path, file, {
        contentType: file.type,
        upsert: true,
      });
      if (error) throw error;
      const url = client.storage.from('slide-images').getPublicUrl(path).data.publicUrl;
      setSocialAvatar(`${url}?t=${Date.now()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar foto');
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  function onSubmitConfig(data: ConfigFormValues) {
    if (!isExtracted && !data.topic?.trim()) {
      setTopicError('Tema e obrigatorio');
      return;
    }
    setTopicError('');
    const dc = DEPTH_CONFIG[data.depth];
    const clampedCount = Math.min(dc.max, Math.max(dc.min, data.slideCount || dc.mid));
    setConfigValues({ ...data, slideCount: clampedCount });
    setStep(3);
  }

  // Carrossel novo: pré-preenche a identidade do post com o padrão salvo da
  // instância (não sobrescreve o que o usuário já digitou). Rascunho usa a
  // identidade do próprio carrossel (carregada abaixo).
  useEffect(() => {
    if (editingId) return;
    let ignore = false;
    void (async () => {
      const sp = await getDefaultSocialProfile();
      if (ignore || !sp) return;
      setSocialName((v) => v || sp.name);
      setSocialHandle((v) => v || sp.handle);
      setSocialAvatar((v) => v ?? sp.avatar_url);
    })();
    return () => {
      ignore = true;
    };
  }, [editingId]);

  // Salva a identidade do post atual como padrão da instância (singleton).
  async function handleSaveSocialDefault() {
    setSavingSocialDefault(true);
    try {
      await setDefaultSocialProfile({
        name: socialName.trim(),
        handle: socialHandle.trim(),
        avatar_url: socialAvatar,
      });
      toast.success('Identidade salva como padrao');
    } catch (err) {
      console.error(err);
      toast.error('Nao foi possivel salvar (apenas o owner pode definir o padrao)');
    } finally {
      setSavingSocialDefault(false);
    }
  }

  // Edicao de rascunho: carrega conteudo + design specs + aspectos visuais e abre na Preview.
  useEffect(() => {
    if (!editingId) return;
    let ignore = false;
    async function loadDraft() {
      const client = getSupabaseClient();
      if (!client) return;
      try {
        const [{ data: carousel }, { data: slidesData }, { data: vs }] = await Promise.all([
          client.from('carousels').select('ai_input, preset_id, brand_kit_id, social_profile').eq('id', editingId).single(),
          client
            .from('carousel_slides')
            .select('position, content')
            .eq('carousel_id', editingId)
            .order('position', { ascending: true }),
          client.from('carousel_visual_settings').select('*').eq('carousel_id', editingId).maybeSingle(),
        ]);
        if (ignore) return;

        const rows = (slidesData ?? []).filter((r) => r.content);
        if (rows.length === 0) {
          toast.error('Este rascunho nao tem conteudo editavel. Crie um novo carrossel.');
          navigate('/');
          return;
        }

        const slides = rows.map((r) => r.content as SlideContent);
        setGeneratedSlides(slides);
        if (carousel?.preset_id) setValue('presetId', carousel.preset_id as string);
        const sp = (carousel?.social_profile ?? null) as { name?: string; handle?: string; avatar_url?: string } | null;
        if (sp) {
          setSocialName(sp.name ?? '');
          setSocialHandle(sp.handle ?? '');
          setSocialAvatar(sp.avatar_url ?? null);
        }

        if (vs) {
          setVisualSettings({
            imageStyle: (vs.image_style as string) ?? defaultVisualSettings.imageStyle,
            colorPalette: (vs.color_palette as string[]) ?? defaultVisualSettings.colorPalette,
            aspectRatio: (vs.aspect_ratio as string) ?? defaultVisualSettings.aspectRatio,
            slideMode:
              (vs.slide_mode as VisualSettings['slideMode']) ?? defaultVisualSettings.slideMode,
            referenceImages: [],
            imagePrompt: (vs.image_prompt as string) ?? '',
            resolution: (vs.resolution as string) ?? defaultVisualSettings.resolution,
          });
        }

        // Reconstroi a config (best-effort) a partir do ai_input salvo.
        const ai = (carousel?.ai_input ?? {}) as Record<string, unknown>;
        const cfg: ConfigFormValues = {
          topic: (ai.topic as string) ?? '',
          angle: (ai.angle as string) ?? '',
          toneMode: (ai.tone_mode as 'original' | 'custom') ?? 'original',
          toneOfVoice: (ai.tone_of_voice as string) ?? '',
          audience: (ai.audience as string) ?? '',
          depth: (ai.depth as Depth) ?? 'normal',
          slideCount: (ai.slide_count as number) ?? slides.length,
          presetId: (carousel?.preset_id as string) ?? DEFAULT_PRESET_ID,
          brandKitId: (carousel?.brand_kit_id as string) ?? '',
        };
        setConfigValues(cfg);
        if (typeof ai.content === 'string') setContent(ai.content);
        setStep(4);
      } catch (err) {
        if (ignore) return;
        toast.error('Erro ao carregar rascunho');
        console.error(err);
        navigate('/');
      } finally {
        if (!ignore) setLoadingDraft(false);
      }
    }
    void loadDraft();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  function resetExtraction() {
    setScrape(null);
    setEditedCaption('');
    setOcrResults([]);
    setTranscript('');
    setPostOcrText('');
    setExtractError('');
  }

  function handleSourceChange(next: ContentSource) {
    setSource(next);
    setContent('');
    setUrl('');
    resetExtraction();
  }

  async function extractContent() {
    if (!isValidSourceUrl(source, url)) {
      setExtractError('URL invalida para a fonte selecionada.');
      return;
    }
    resetExtraction();
    setIsExtracting(true);
    try {
      const client = getSupabaseClient();
      if (!client) throw new Error('Supabase nao configurado');

      if (source === 'youtube') {
        // YouTube: chama transcribe diretamente.
        setIsTranscribing(true);
        const { data, error } = await client.functions.invoke('transcribe', {
          body: { url: url.trim(), type: 'youtube' },
        });
        if (error) throw new Error(error.message || 'Erro ao transcrever');
        const result = data as { text?: string; error?: string };
        if (result?.error) throw new Error(result.error);
        const text = (result?.text ?? '').trim();
        if (!text) throw new Error('Transcricao vazia');
        setTranscript(text);
        toast.success('Transcricao extraida');
      } else {
        // Instagram (carousel/post/reel) — scrape-instagram primeiro.
        const type = source === 'ig_reel' ? 'reel' : 'post';
        const { data, error } = await client.functions.invoke('scrape-instagram', {
          body: { url: url.trim(), type },
        });
        if (error) throw new Error(error.message || 'Erro ao extrair do Instagram');
        const result = data as ScrapeResult & { error?: string };
        if (result?.error) throw new Error(result.error);
        setScrape(result);
        setEditedCaption(result.caption ?? '');

        if (source === 'ig_reel') {
          if (!result.videoUrl) throw new Error('Video do reel nao encontrado');
          setIsTranscribing(true);
          const transcribeRes = await client.functions.invoke('transcribe', {
            body: { type: 'reel', video_url: result.videoUrl },
          });
          if (transcribeRes.error) throw new Error(transcribeRes.error.message || 'Erro na transcricao');
          const tdata = transcribeRes.data as { text?: string; error?: string };
          if (tdata?.error) throw new Error(tdata.error);
          setTranscript((tdata?.text ?? '').trim());
          toast.success('Reel transcrito');
        } else if (source === 'ig_post') {
          // Post unico: OCR automatico da imagem.
          if (result.images.length === 0) throw new Error('Imagem do post nao encontrada');
          setIsOcring(true);
          const ocrRes = await client.functions.invoke('ocr-images', {
            body: { image_urls: result.images.slice(0, 1) },
          });
          if (ocrRes.error) throw new Error(ocrRes.error.message || 'Erro no OCR');
          const odata = ocrRes.data as { results?: Array<{ url: string; text: string }>; error?: string };
          if (odata?.error) throw new Error(odata.error);
          setPostOcrText((odata.results?.[0]?.text ?? '').trim());
          toast.success('Texto extraido');
        } else if (source === 'ig_carousel') {
          // Carrossel: OCR automatico de todos os slides apos a extracao.
          if (result.images.length === 0) throw new Error('Slides do carrossel nao encontrados');
          setIsOcring(true);
          const ocrRes = await client.functions.invoke('ocr-images', {
            body: { image_urls: result.images },
          });
          if (ocrRes.error) throw new Error(ocrRes.error.message || 'Erro no OCR');
          const odata = ocrRes.data as { results?: Array<{ url: string; text: string }>; error?: string };
          if (odata?.error) throw new Error(odata.error);
          setOcrResults((odata.results ?? []).map((r, i) => ({ position: i + 1, text: r.text })));
          toast.success(`Texto extraido de ${result.images.length} slide(s)`);
        }
      }
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Erro ao extrair conteudo');
    } finally {
      setIsExtracting(false);
      setIsTranscribing(false);
      setIsOcring(false);
    }
  }

  function buildFinalContent(): string {
    if (source === 'text') return content;
    if (source === 'youtube') {
      return buildContentForLLM({ caption: '', fullText: transcript });
    }
    if (source === 'ig_reel') {
      return buildContentForLLM({ caption: editedCaption, fullText: transcript });
    }
    if (source === 'ig_post') {
      return buildContentForLLM({ caption: editedCaption, fullText: postOcrText });
    }
    // ig_carousel
    return buildContentForLLM({
      caption: editedCaption,
      perSlide: ocrResults.map((r) => ({ position: r.position, text: r.text })),
    });
  }

  function canProceedFromStep1(): boolean {
    if (source === 'text') return content.trim().length > 0;
    if (source === 'youtube' || source === 'ig_reel') return transcript.trim().length > 0;
    if (source === 'ig_post') return postOcrText.trim().length > 0;
    if (source === 'ig_carousel') return ocrResults.some((r) => r.text.trim().length > 0);
    return false;
  }

  // Sugere automaticamente um tema a partir do conteudo extraido via IA.
  async function suggestTopic() {
    const finalContent = buildFinalContent().trim();
    if (!finalContent) return;
    setIsSuggestingTopic(true);
    try {
      const client = getSupabaseClient();
      if (!client) throw new Error('Supabase nao configurado');
      const { data, error } = await client.functions.invoke('generate-content', {
        body: { mode: 'topic', content: finalContent },
      });
      if (error) throw error;
      const suggested = (data as { topic?: string })?.topic?.trim();
      if (suggested) setValue('topic', suggested, { shouldValidate: true });
    } catch (err) {
      // Sugestao e best-effort: falha nao bloqueia o usuario, que digita o tema manualmente.
      console.error('Erro ao sugerir tema:', err);
    } finally {
      setIsSuggestingTopic(false);
    }
  }

  function goToConfigStep() {
    setStep(2);
    if (isExtracted) {
      // Inicializa o preview editavel do conteudo extraido (so na primeira vez).
      if (!extractedDraft.trim()) setExtractedDraft(buildFinalContent());
    } else if (!watch('topic')?.trim()) {
      // So sugere se o usuario ainda nao definiu um tema (evita sobrescrever ao voltar).
      void suggestTopic();
    }
  }

  // Validacao DUPLA do teto de palavras: alem da instrucao no prompt do LLM, garante
  // pos-geracao que nenhum slide passa o teto — reprocessa via LLM e, no fim, trunca.
  async function enforceWordCap(
    client: NonNullable<ReturnType<typeof getSupabaseClient>>,
    slides: SlideContent[],
    cap: number,
  ): Promise<SlideContent[]> {
    let result = [...slides];
    const over = result.filter((s) => countWords(s.body) > cap);

    if (over.length > 0) {
      try {
        const { data, error } = await client.functions.invoke('generate-content', {
          body: {
            mode: 'shorten',
            max_words: cap,
            slides: over.map((s) => ({ position: s.position, body: s.body })),
          },
        });
        if (!error) {
          const shortened = (data as { slides?: Array<{ position: number; body: string }> })?.slides ?? [];
          const byPos = new Map(shortened.map((s) => [s.position, s.body]));
          result = result.map((s) =>
            byPos.has(s.position) ? { ...s, body: byPos.get(s.position) as string } : s,
          );
        }
      } catch (err) {
        console.error('Erro ao encurtar slides acima do teto:', err);
      }
    }

    // Garantia final: trunca de forma limpa qualquer corpo ainda acima do teto.
    return result.map((s) =>
      countWords(s.body) > cap ? { ...s, body: truncateToWordCap(s.body, cap) } : s,
    );
  }

  // Substitui o último slide pelo CTA fixo global (se ativo). Mantém a posição.
  async function applyDefaultCta(slides: SlideContent[]): Promise<SlideContent[]> {
    if (slides.length === 0) return slides;
    const cta = await getDefaultCta();
    if (!cta?.enabled || !(cta.title.trim() || cta.body.trim() || cta.button.trim())) return slides;
    const last = slides[slides.length - 1]!;
    const replaced: SlideContent = {
      ...last,
      type: 'cta',
      headline: cta.title.trim() || last.headline,
      body: cta.body.trim() || last.body,
      cta: cta.button.trim() || last.cta,
    };
    return [...slides.slice(0, -1), replaced];
  }

  async function generateCarousel(visual: VisualSettings) {
    if (!configValues) return;
    setIsGenerating(true);
    try {
      const client = getSupabaseClient();
      if (!client) throw new Error('Nao configurado');

      const finalContent = isExtracted ? extractedDraft : buildFinalContent();
      const cap = DEPTH_CONFIG[configValues.depth].wordCap;
      const keepOriginalTone = isExtracted && configValues.toneMode === 'original';

      const { data: result, error } = await client.functions.invoke('generate-content', {
        body: {
          topic: configValues.topic,
          content: finalContent,
          angle: configValues.angle,
          audience: configValues.audience,
          tone_of_voice: keepOriginalTone ? '' : configValues.toneOfVoice,
          keep_original_tone: keepOriginalTone,
          slide_count: configValues.slideCount,
          max_words: cap,
          visual_settings: visual,
          // Presets sociais (Post do X) fundem título+corpo num bloco único; o LLM
          // marca a ênfase em negrito (**trecho**) e a abertura como frase forte.
          social_format: isSocialPreset(configValues.presetId ?? presetId),
        },
      });

      if (error) throw error;

      // Validate with Zod
      const parsed = generatedContentSchema.safeParse(result);
      if (!parsed.success) {
        console.error('Zod validation failed:', parsed.error);
        throw new Error('Resposta da IA nao esta no formato esperado');
      }

      // Validacao dupla do teto de palavras (pos-geracao).
      const cappedSlides = await enforceWordCap(client, parsed.data.slides, cap);

      // CTA fixo global: substitui o slide final pelo CTA padrao da instancia, se ativo.
      const withCta = await applyDefaultCta(cappedSlides);

      setGeneratedSlides(withCta);
      setVisualSettings(visual);
      setStep(4);
      toast.success('Carrossel gerado com sucesso');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar carrossel');
    } finally {
      setIsGenerating(false);
    }
  }

  // Compila o prompt do SLOT de imagem (so foto, sem texto) para cada slide.
  // O texto e renderizado por codigo (SlideRenderer); a IA so preenche o slot.
  function buildSlotPrompts(artDirection?: ArtDirection): string[] {
    return generatedSlides.map((slide) =>
      buildSlotPrompt({ content: toSlideText(slide), artDirection }),
    );
  }

  // Direcao de arte global (cache via hash em carousels). Best-effort: se faltar
  // a key da OpenAI ou der erro, os slides ainda sao gerados (sem a ancora global).
  async function resolveArtDirection(carouselId: string): Promise<ArtDirection | undefined> {
    try {
      const result = await generateArtDirection({
        carouselId,
        content: isExtracted ? extractedDraft : content,
        visualSettings,
        force: forceArtDirection,
      });
      if (forceArtDirection) setForceArtDirection(false);
      toast.message(result.cached ? 'Direcao de arte reusada (cache)' : 'Direcao de arte gerada');
      return result.artDirection;
    } catch (err) {
      console.warn('Direcao de arte indisponivel:', err);
      toast.message(err instanceof Error ? err.message : 'Direcao de arte indisponivel');
      return undefined;
    }
  }

  // Executa worker sobre items com no maximo `limit` chamadas concorrentes.
  async function runPool<T>(
    items: T[],
    limit: number,
    worker: (item: T, index: number) => Promise<void>,
  ): Promise<void> {
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        await worker(items[idx] as T, idx);
      }
    });
    await Promise.all(runners);
  }

  // Persiste o carrossel. Com generateImages=true dispara a geracao das imagens
  // via Edge Function generate-slide-image (Gerar Carrossel); false salva so como rascunho.
  // Em modo edicao (editingId), ATUALIZA o rascunho existente em vez de criar um novo.
  async function persistCarousel(opts: { generateImages: boolean }) {
    // Guarda contra duplo-clique: faz varios inserts/updates e demora.
    if (isAccepting || isSavingDraft) return;
    if (opts.generateImages) setIsAccepting(true);
    else setIsSavingDraft(true);
    setAcceptProgress('');
    try {
      const client = getSupabaseClient();
      if (!client) throw new Error('Supabase nao configurado');

      const { data: { user } } = await client.auth.getUser();
      if (!user) throw new Error('Nao autenticado');

      const cfg = configValues;
      // Modelo de imagem e global (definido na aba Credenciais); cada carrossel
      // recebe o valor atual no momento da criacao/atualizacao.
      const imageProvider = await getInstanceImageProvider();
      const aiInput = {
        type: source,
        content: isExtracted ? extractedDraft : content,
        topic: cfg?.topic ?? watch('topic') ?? '',
        angle: cfg?.angle ?? watch('angle') ?? '',
        audience: cfg?.audience ?? watch('audience') ?? '',
        tone_of_voice: cfg?.toneOfVoice ?? watch('toneOfVoice') ?? '',
        tone_mode: cfg?.toneMode ?? watch('toneMode') ?? 'original',
        depth: cfg?.depth ?? watch('depth') ?? 'normal',
        slide_count: generatedSlides.length,
      };
      const carouselFields = {
        title: generatedSlides[0]?.headline ?? 'Sem titulo',
        status: opts.generateImages ? 'ready' : 'draft',
        slide_count: generatedSlides.length,
        ai_input: aiInput,
        image_provider: imageProvider,
        preset_id: cfg?.presetId ?? watch('presetId') ?? DEFAULT_PRESET_ID,
        brand_kit_id: (cfg?.brandKitId ?? watch('brandKitId') ?? '') || null,
        social_profile: (() => {
          const name = socialName.trim();
          const handle = socialHandle.trim();
          if (isSocialPreset(cfg?.presetId ?? watch('presetId'))) {
            return { name, handle, avatar_url: socialAvatar };
          }
          // Demais presets: so o username do Instagram (canto superior esquerdo).
          return handle ? { name: '', handle, avatar_url: null } : null;
        })(),
        updated_at: new Date().toISOString(),
      };

      // 1) Carrossel (update se editando rascunho, insert se novo).
      let carouselId: string;
      if (editingId) {
        const { error } = await client.from('carousels').update(carouselFields).eq('id', editingId);
        if (error) throw error;
        carouselId = editingId;
      } else {
        const { data, error } = await client
          .from('carousels')
          .insert({ created_by: user.id, ...carouselFields })
          .select('id')
          .single();
        if (error) throw error;
        carouselId = data.id as string;
      }

      // 2) Aspectos visuais (upsert por carousel_id).
      const parsedVisual = visualSettingsSchema.safeParse(visualSettings);
      if (parsedVisual.success) {
        const { error: vsError } = await client.from('carousel_visual_settings').upsert(
          {
            carousel_id: carouselId,
            image_style: parsedVisual.data.imageStyle,
            color_palette: parsedVisual.data.colorPalette,
            aspect_ratio: parsedVisual.data.aspectRatio,
            slide_mode: parsedVisual.data.slideMode,
            reference_image_url: null,
            image_prompt: parsedVisual.data.imagePrompt,
            resolution: parsedVisual.data.resolution,
          },
          { onConflict: 'carousel_id' },
        );
        if (vsError) console.error('Erro ao salvar config visual:', vsError);
      }

      // 2.5) Direcao de arte global (cacheada por hash) + prompts dos slides ja
      // ancorados nela. Precisa do carouselId, por isso vem depois do passo 1.
      const artDirection = await resolveArtDirection(carouselId);
      const prompts = buildSlotPrompts(artDirection);

      // 3) Slides (texto estruturado + tipo + prompt do slot). content mantido p/ retrocompat.
      const slideIdByPosition = new Map<number, string>();
      if (editingId) {
        const { data: existing } = await client
          .from('carousel_slides')
          .select('id, position')
          .eq('carousel_id', carouselId);
        const existingByPos = new Map((existing ?? []).map((s) => [s.position as number, s.id as string]));
        for (let i = 0; i < generatedSlides.length; i++) {
          const slide = generatedSlides[i]!;
          const row = {
            content: slide,
            slide_type: toSlideType(slide.type),
            text_content: toSlideText(slide),
            image_prompt: prompts[i],
          };
          const sid = existingByPos.get(slide.position);
          if (sid) {
            await client.from('carousel_slides').update(row).eq('id', sid);
            slideIdByPosition.set(slide.position, sid);
          } else {
            const { data } = await client
              .from('carousel_slides')
              .insert({ carousel_id: carouselId, position: slide.position, ...row })
              .select('id')
              .single();
            if (data) slideIdByPosition.set(slide.position, data.id as string);
          }
        }
      } else {
        const slideRows = generatedSlides.map((slide, i) => ({
          carousel_id: carouselId,
          position: slide.position,
          content: slide,
          slide_type: toSlideType(slide.type),
          text_content: toSlideText(slide),
          image_prompt: prompts[i],
        }));
        const { data: insertedSlides, error: slidesError } = await client
          .from('carousel_slides')
          .insert(slideRows)
          .select('id, position');
        if (slidesError) throw slidesError;
        (insertedSlides ?? []).forEach((s) =>
          slideIdByPosition.set(s.position as number, s.id as string),
        );
      }

      if (opts.generateImages) {
        // Gera as imagens em paralelo (limite de 3) via provider do carrossel.
        let done = 0;
        const total = generatedSlides.length;
        const failures: string[] = [];
        setAcceptProgress(`Gerando slide 0/${total}`);
        await runPool(generatedSlides, 3, async (slide, i) => {
          const slideId = slideIdByPosition.get(slide.position);
          if (!slideId) return;
          try {
            // Mede o slot (offscreen 1:1) para gerar no ratio exato daquele slide.
            const { size, aspect } = measureSlotSize(slotRefs.current.get(slide.position));
            const { data, error } = await client.functions.invoke('generate-slide-image', {
              body: {
                slide_id: slideId,
                prompt: prompts[i],
                reference_images: visualSettings.referenceImages,
                size,
                aspect,
              },
            });
            if (error) throw new Error(await extractInvokeError(error));
            const result = data as { error?: string };
            if (result?.error) throw new Error(result.error);
          } catch (err) {
            // Best-effort: uma falha nao aborta o carrossel; o slide pode ser regenerado depois.
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`Erro ao gerar imagem do slide ${slide.position}:`, msg);
            failures.push(msg);
          } finally {
            done += 1;
            setAcceptProgress(`Gerando slide ${done}/${total}`);
          }
        });

        if (failures.length > 0) {
          const unique = Array.from(new Set(failures));
          toast.error(
            `${failures.length} de ${total} slides falharam: ${unique[0]}` +
              (failures.length < total ? ' Use "Regenerar este slide" no editor.' : ''),
          );
        }
        navigate(`/editor/${carouselId}`);
      } else {
        toast.success('Rascunho salvo');
        navigate('/');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar carrossel');
      setIsAccepting(false);
      setIsSavingDraft(false);
      setAcceptProgress('');
    }
  }

  function acceptCarousel() {
    void persistCarousel({ generateImages: true });
  }

  function saveDraft() {
    void persistCarousel({ generateImages: false });
  }

  // Forca uma nova base visual (direcao de arte) na proxima geracao, mantendo o
  // conteudo. O recomputo em si acontece em resolveArtDirection (force=true).
  function regenerateArtDirection() {
    setForceArtDirection(true);
    toast.message('Nova direcao de arte sera gerada ao gerar o carrossel.');
  }


  const extractingLabel: Record<ContentSource, string> = {
    text: '',
    ig_carousel: 'Extraindo carrossel...',
    ig_post: 'Extraindo post...',
    ig_reel: 'Transcrevendo reels...',
    youtube: 'Transcrevendo video...',
  };

  if (loadingDraft) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#3B82F6]" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-bold text-[#F8FAFC]">
          {editingId ? 'Editar Carrossel' : 'Novo Carrossel'}
        </h1>

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Fonte de Conteudo</CardTitle>
              <CardDescription>Escolha de onde vem o conteudo do carrossel.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-5 gap-2">
                {(Object.keys(sourceLabels) as ContentSource[]).map((s) => {
                  const Icon = sourceIcons[s];
                  return (
                    <button
                      key={s}
                      className={`flex flex-col items-center gap-2 rounded-lg border p-3 text-xs transition-colors ${
                        source === s ? 'border-[rgba(59,130,246,0.4)] bg-[rgba(59,130,246,0.1)]' : 'hover:border-[rgba(59,130,246,0.3)] text-[#94A3B8]'
                      }`}
                      onClick={() => handleSourceChange(s)}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-center leading-tight">{sourceLabels[s]}</span>
                    </button>
                  );
                })}
              </div>

              {source === 'text' ? (
                <div className="space-y-2">
                  <Label>Conteudo</Label>
                  <textarea
                    className="flex min-h-[160px] w-full rounded-md border border-[rgba(59,130,246,0.2)] bg-[rgba(15,18,35,0.5)] px-3 py-2 text-sm"
                    placeholder="Cole ou escreva o conteudo aqui..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>URL</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder={sourcePlaceholders[source]}
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                      <Button
                        variant={url.trim() && !scrape && !transcript ? 'default' : 'outline'}
                        onClick={() => void extractContent()}
                        disabled={isExtracting || !url.trim()}
                      >
                        {isExtracting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Extrair Conteudo'
                        )}
                      </Button>
                    </div>
                    {isExtracting && (
                      <p className="text-xs text-[#94A3B8]">{extractingLabel[source]}</p>
                    )}
                    {extractError && (
                      <p className="text-xs text-[#EF4444]">{extractError}</p>
                    )}
                  </div>

                  {/* Preview do carrossel IG com checkboxes */}
                  {source === 'ig_carousel' && scrape && scrape.images.length > 0 && (
                    <div className="space-y-3 rounded-lg border border-[rgba(59,130,246,0.15)] bg-[rgba(59,130,246,0.04)] p-3">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-[#F8FAFC]">
                          Slides extraidos ({scrape.images.length})
                        </p>
                        {isOcring && <Loader2 className="h-4 w-4 animate-spin text-[#60A5FA]" />}
                      </div>

                      {ocrResults.length > 0 ? (
                        <div className="space-y-2">
                          <Label>Texto extraido por slide (editavel)</Label>
                          {ocrResults.map((r) => (
                            <div key={r.position} className="space-y-1">
                              <p className="text-xs text-[#94A3B8]">Slide {r.position}</p>
                              <textarea
                                className="flex min-h-[60px] w-full rounded-md border border-[rgba(59,130,246,0.15)] bg-[rgba(15,18,35,0.5)] px-3 py-2 text-xs"
                                value={r.text}
                                onChange={(e) => {
                                  const newText = e.target.value;
                                  setOcrResults((prev) =>
                                    prev.map((p) => p.position === r.position ? { ...p, text: newText } : p)
                                  );
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[#94A3B8]">
                          {isOcring ? 'Extraindo texto dos slides...' : 'Nenhum texto extraido.'}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Preview do post IG */}
                  {source === 'ig_post' && scrape && scrape.images.length > 0 && (
                    <div className="space-y-3 rounded-lg border border-[rgba(59,130,246,0.15)] bg-[rgba(59,130,246,0.04)] p-3">
                      <p className="text-sm font-medium text-[#F8FAFC]">Imagem extraida</p>
                      <div className="mx-auto aspect-[4/5] w-32 overflow-hidden rounded">
                        <img src={scrape.images[0]} alt="Post" className="h-full w-full object-cover" />
                      </div>
                      {isOcring ? (
                        <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
                          <Loader2 className="h-3 w-3 animate-spin" /> Extraindo texto da imagem...
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Label>Texto da imagem (editavel)</Label>
                          <textarea
                            className="flex min-h-[80px] w-full rounded-md border border-[rgba(59,130,246,0.15)] bg-[rgba(15,18,35,0.5)] px-3 py-2 text-xs"
                            value={postOcrText}
                            onChange={(e) => setPostOcrText(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Preview do reel IG */}
                  {source === 'ig_reel' && scrape && (
                    <div className="space-y-3 rounded-lg border border-[rgba(59,130,246,0.15)] bg-[rgba(59,130,246,0.04)] p-3">
                      <p className="text-sm font-medium text-[#F8FAFC]">Reel extraido</p>
                      {isTranscribing ? (
                        <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
                          <Loader2 className="h-3 w-3 animate-spin" /> Transcrevendo audio...
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Label>Transcricao (editavel)</Label>
                          <textarea
                            className="flex min-h-[120px] w-full rounded-md border border-[rgba(59,130,246,0.15)] bg-[rgba(15,18,35,0.5)] px-3 py-2 text-xs"
                            value={transcript}
                            onChange={(e) => setTranscript(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Preview do YouTube */}
                  {source === 'youtube' && transcript && (
                    <div className="space-y-2 rounded-lg border border-[rgba(59,130,246,0.15)] bg-[rgba(59,130,246,0.04)] p-3">
                      <Label>Transcricao (editavel)</Label>
                      <textarea
                        className="flex min-h-[120px] w-full rounded-md border border-[rgba(59,130,246,0.15)] bg-[rgba(15,18,35,0.5)] px-3 py-2 text-xs"
                        value={transcript}
                        onChange={(e) => setTranscript(e.target.value)}
                      />
                    </div>
                  )}

                  {/* Caption editavel para fontes do Instagram */}
                  {scrape && (source === 'ig_carousel' || source === 'ig_post' || source === 'ig_reel') && (
                    <div className="space-y-1">
                      <Label>Legenda do post (editavel)</Label>
                      <textarea
                        className="flex min-h-[60px] w-full rounded-md border border-[rgba(59,130,246,0.15)] bg-[rgba(15,18,35,0.5)] px-3 py-2 text-xs"
                        value={editedCaption}
                        onChange={(e) => setEditedCaption(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}

              <Button
                onClick={goToConfigStep}
                className="w-full"
                disabled={!canProceedFromStep1()}
              >
                Proximo <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Configuração</CardTitle>
              <CardDescription>Defina os parametros de geracao.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmitConfig)} className="space-y-4">
                {isExtracted ? (
                  <>
                    <div className="space-y-2">
                      <Label>Conteudo extraido (editavel)</Label>
                      <textarea
                        value={extractedDraft}
                        onChange={(e) => setExtractedDraft(e.target.value)}
                        rows={6}
                        placeholder="Conteudo da extracao..."
                        className="flex w-full resize-none rounded-md border border-[rgba(59,130,246,0.2)] bg-[#0A0A0F] px-3 py-2 text-xs text-[#CBD5E1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]"
                      />
                      <p className="text-xs text-[#94A3B8]">Base do carrossel. Edite se quiser ajustar antes de gerar.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Angulo / Foco (opcional)</Label>
                      <Input
                        {...register('angle')}
                        placeholder='Ex: "foque na parte de precificacao", "formato de lista"'
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <Label>Tema / Topico</Label>
                    <div className="relative">
                      <Input
                        {...register('topic')}
                        placeholder={isSuggestingTopic ? 'Gerando tema com IA...' : 'Ex: 5 dicas de produtividade'}
                        disabled={isSuggestingTopic}
                      />
                      {isSuggestingTopic && (
                        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#94A3B8]" />
                      )}
                    </div>
                    {isSuggestingTopic ? (
                      <p className="text-xs text-[#94A3B8]">Preenchendo o tema automaticamente a partir do conteudo...</p>
                    ) : (
                      topicError && <p className="text-sm text-red-400">{topicError}</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tom de Voz</Label>
                    {isExtracted && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setValue('toneMode', 'original')}
                          className={`h-8 flex-1 rounded-md border px-2 text-[11px] transition-colors ${
                            toneMode === 'original'
                              ? 'border-[#3B82F6] bg-[rgba(59,130,246,0.15)] text-[#60A5FA]'
                              : 'border-[rgba(59,130,246,0.2)] text-[#94A3B8]'
                          }`}
                        >
                          Manter original
                        </button>
                        <button
                          type="button"
                          onClick={() => setValue('toneMode', 'custom')}
                          className={`h-8 flex-1 rounded-md border px-2 text-[11px] transition-colors ${
                            toneMode === 'custom'
                              ? 'border-[#3B82F6] bg-[rgba(59,130,246,0.15)] text-[#60A5FA]'
                              : 'border-[rgba(59,130,246,0.2)] text-[#94A3B8]'
                          }`}
                        >
                          Meu tom
                        </button>
                      </div>
                    )}
                    <Input
                      {...register('toneOfVoice')}
                      placeholder="Descontraido, profissional..."
                      disabled={isExtracted && toneMode === 'original'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Publico-Alvo</Label>
                    <Input {...register('audience')} placeholder="Empreendedores, designers..." />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Profundidade</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['superficial', 'normal', 'aprofundado'] as Depth[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => handleDepthChange(d)}
                        className={`rounded-md border px-2 py-2 text-center transition-colors ${
                          depth === d
                            ? 'border-[#3B82F6] bg-[rgba(59,130,246,0.15)]'
                            : 'border-[rgba(59,130,246,0.2)] hover:border-[rgba(59,130,246,0.4)]'
                        }`}
                      >
                        <span className={`block text-xs font-medium capitalize ${depth === d ? 'text-[#60A5FA]' : 'text-[#F8FAFC]'}`}>
                          {d}
                        </span>
                        <span className="block text-[10px] text-[#94A3B8]">
                          {DEPTH_CONFIG[d].min}-{DEPTH_CONFIG[d].max} slides
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-[#94A3B8]">
                    Estimativa: ~{slideCountValue} slides, {DEPTH_CONFIG[depth].label} (max {DEPTH_CONFIG[depth].wordCap} palavras/slide)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Quantidade de Slides</Label>
                  <Input
                    type="number"
                    min={DEPTH_CONFIG[depth].min}
                    max={DEPTH_CONFIG[depth].max}
                    {...register('slideCount', { valueAsNumber: true })}
                  />
                  <p className="text-[10px] text-[#94A3B8]">
                    Faixa da profundidade: {DEPTH_CONFIG[depth].min}-{DEPTH_CONFIG[depth].max}
                  </p>
                </div>

                {/* Seletor de preset (template do slide) */}
                <div className="space-y-2">
                  <Label>Modelo de slide (preset)</Label>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {PRESETS.map((p) => {
                      const sel = presetId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setValue('presetId', p.id)}
                          className={`flex flex-col items-center gap-2 rounded-xl border p-2 transition-all ${
                            sel
                              ? 'border-[#3B82F6] bg-[rgba(59,130,246,0.1)]'
                              : 'border-[rgba(59,130,246,0.15)] hover:border-[rgba(59,130,246,0.35)]'
                          }`}
                        >
                          <PresetThumbnail preset={p} width={120} />
                          <span className={`text-xs font-medium ${sel ? 'text-[#60A5FA]' : 'text-[#94A3B8]'}`}>
                            {p.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Identidade do post (apenas presets estilo Post do X) */}
                {isSocialPreset(presetId) && (
                  <div className="space-y-3 rounded-xl border border-[rgba(59,130,246,0.15)] bg-[rgba(59,130,246,0.03)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Identidade do post (Post do X)</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-xs"
                        disabled={savingSocialDefault || uploadingAvatar}
                        onClick={handleSaveSocialDefault}
                        title="Reutiliza esta identidade em todo carrossel novo"
                      >
                        {savingSocialDefault ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Save className="mr-1 h-3 w-3" />
                        )}
                        Salvar como padrao
                      </Button>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[rgba(59,130,246,0.25)] bg-[#0A0A0F] text-[10px] text-[#94A3B8]"
                        title="Foto de perfil"
                      >
                        {uploadingAvatar ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : socialAvatar ? (
                          <img src={socialAvatar} alt="" className="h-full w-full object-cover" />
                        ) : (
                          'Foto'
                        )}
                      </button>
                      <div className="grid flex-1 grid-cols-2 gap-2">
                        <Input
                          placeholder="Nome (ex: Davi Ribeiro)"
                          value={socialName}
                          onChange={(e) => setSocialName(e.target.value)}
                        />
                        <Input
                          placeholder="@usuario"
                          value={socialHandle}
                          onChange={(e) => setSocialHandle(e.target.value)}
                        />
                      </div>
                    </div>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => void handleAvatarUpload(e.target.files?.[0])}
                    />
                    <p className="text-[10px] text-[#94A3B8]">
                      Aparece no topo de cada slide (avatar, nome, selo azul e @). Deixe em branco para usar o placeholder.
                      Use "Salvar como padrao" para reaproveitar esta identidade em todo carrossel novo.
                    </p>
                  </div>
                )}

                {/* Username do Instagram (demais presets — canto superior esquerdo) */}
                {!isSocialPreset(presetId) && (
                  <div className="space-y-2 rounded-xl border border-[rgba(59,130,246,0.15)] bg-[rgba(59,130,246,0.03)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Username do Instagram</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-xs"
                        disabled={savingSocialDefault}
                        onClick={handleSaveSocialDefault}
                        title="Reutiliza este username em todo carrossel novo"
                      >
                        {savingSocialDefault ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Save className="mr-1 h-3 w-3" />
                        )}
                        Salvar como padrao
                      </Button>
                    </div>
                    <Input
                      placeholder="@seu_usuario"
                      value={socialHandle}
                      onChange={(e) => setSocialHandle(e.target.value)}
                    />
                    <p className="text-[10px] text-[#94A3B8]">
                      Aparece no canto superior esquerdo de cada slide. Deixe em branco para nao exibir.
                      Use "Salvar como padrao" para reaproveitar nos proximos carrosseis.
                    </p>
                  </div>
                )}

                {/* Brand Kit (cores/fontes/logo aplicados ao preset) */}
                {brandKits.length > 0 && (
                  <div className="space-y-2">
                    <Label>Brand Kit</Label>
                    <select
                      value={brandKitId}
                      onChange={(e) => setValue('brandKitId', e.target.value)}
                      className="h-10 w-full rounded-md border border-[rgba(59,130,246,0.2)] bg-[#0A0A0F] px-3 text-sm text-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]"
                    >
                      <option value="">Estilo do preset (sem Brand Kit)</option>
                      {brandKits.map((bk) => (
                        <option key={bk.id} value={bk.id}>
                          {bk.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                  </Button>
                  <Button type="submit" className="flex-1">
                    Avancar <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <VisualSettingsStep
            initial={visualSettings}
            onBack={() => setStep(2)}
            onGenerate={(visual) => void generateCarousel(visual)}
            isGenerating={isGenerating}
          />
        )}

        {step === 4 && (
          <CarouselPreview
            slides={generatedSlides}
            preset={getPreset(presetId)}
            brandKit={brandKit}
            accountName={socialName}
            accountHandle={socialHandle}
            avatarUrl={socialAvatar}
            onAccept={acceptCarousel}
            onSaveDraft={saveDraft}
            isAccepting={isAccepting}
            isSavingDraft={isSavingDraft}
            acceptProgress={acceptProgress}
            onRegenerateArtDirection={regenerateArtDirection}
            artDirectionPending={forceArtDirection}
            onReject={() => setStep(3)}
            onRegenerate={() => {
              setGeneratedSlides([]);
              setStep(3);
            }}
            onUpdateSlide={(position, field, value) => {
              setGeneratedSlides((prev) =>
                prev.map((s) =>
                  s.position === position ? { ...s, [field]: value } : s
                )
              );
            }}
          />
        )}

        {/* Renderers offscreen 1:1 para medir o slot de cada slide antes de gerar. */}
        {step === 4 && (() => {
          const preset = getPreset(presetId);
          const tokens = mergeTokens(preset, brandKit);
          const fonts = brandFontFaces(brandKit);
          return (
            <div style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none', opacity: 0 }} aria-hidden>
              {generatedSlides.map((slide) => (
                <div
                  key={slide.position}
                  ref={(el) => {
                    if (el) slotRefs.current.set(slide.position, el);
                    else slotRefs.current.delete(slide.position);
                  }}
                  style={{ width: FRAME_W, height: FRAME_H }}
                >
                  <SlideRenderer
                    preset={preset}
                    slideType={toSlideType(slide.type)}
                    tokens={tokens}
                    content={toSlideText(slide)}
                    accountName={socialName}
                    accountHandle={socialHandle}
                    avatarUrl={socialAvatar}
                    scale={1}
                    fontFaces={fonts}
                  />
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
