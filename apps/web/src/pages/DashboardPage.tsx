import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2, Plus, Pencil, Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getSupabaseClient } from '@/lib/supabase';
import { downloadUrlsAsZip } from '@/lib/export/compose';
import { getPreset, DEFAULT_PRESET_ID } from '@/lib/presets';
import { mergeTokens, brandFontFaces } from '@/lib/presets/mergeTokens';
import type { SlideText, SlideType } from '@/lib/presets/types';
import { SlideRenderer, FRAME_W } from '@/components/render/SlideRenderer';
import { listBrandKits, loadDefaultBrandKit, type BrandKitData } from '@/lib/brandKit';
import type { Carousel, CarouselStatus } from '@content-hub/shared';

// Campos presentes na linha de carousels mas ausentes no tipo compartilhado.
type CarouselExt = Carousel & {
  preset_id?: string | null;
  social_profile?: { name?: string; handle?: string; avatar_url?: string | null } | null;
};

interface FirstSlide {
  slideType: SlideType;
  content: SlideText;
  slotImageUrl: string | null;
}

function toSlideType(t: string | null): SlideType {
  if (t === 'capa') return 'capa';
  if (t === 'cta') return 'cta';
  return 'conteudo';
}

// Renderiza o primeiro slide preenchendo o card (mede a largura e escala o frame
// 1080x1350 do SlideRenderer para caber). É o MESMO componente do preview/export.
function SlideThumb({
  carousel,
  slide,
  brandKit,
}: {
  carousel: CarouselExt;
  slide: FirstSlide;
  brandKit: BrandKitData | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / FRAME_W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const preset = getPreset(carousel.preset_id ?? DEFAULT_PRESET_ID);
  const tokens = mergeTokens(preset, brandKit);
  const fonts = brandFontFaces(brandKit);
  const sp = carousel.social_profile;

  return (
    <div ref={ref} className="h-full w-full">
      {scale > 0 && (
        <SlideRenderer
          preset={preset}
          slideType={slide.slideType}
          tokens={tokens}
          content={slide.content}
          slotImageUrl={slide.slotImageUrl}
          accountName={sp?.name}
          accountHandle={sp?.handle}
          avatarUrl={sp?.avatar_url ?? null}
          scale={scale}
          fontFaces={fonts}
        />
      )}
    </div>
  );
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Busca TODOS os carrosseis num unico cache; o filtro de status e aplicado no client.
  // Evita caches por aba (que faziam "Todos" mostrar lista desatualizada vs "Rascunho").
  const { data: carousels, isLoading } = useQuery({
    queryKey: ['carousels'],
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data } = await client
        .from('carousels')
        .select('*')
        .order('updated_at', { ascending: false });
      return (data ?? []) as Carousel[];
    },
    // Revalida ao montar: lista sempre fresca ao voltar de criar/salvar um carrossel.
    refetchOnMount: 'always',
  });

  // Thumbnail = primeiro slide (menor position) de cada carrossel, renderizado ao
  // vivo pelo SlideRenderer (mesmo componente do preview/editor/export). Não depende
  // do composed_image_url, que só existe após um download. Mapeia carousel_id -> dados.
  const { data: firstSlides } = useQuery({
    queryKey: ['carousel-first-slides'],
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return {} as Record<string, FirstSlide>;
      const { data } = await client
        .from('carousel_slides')
        .select('carousel_id, position, slide_type, text_content, content, slot_image_url, image_url')
        .order('position', { ascending: true });
      const map: Record<string, FirstSlide> = {};
      const seen = new Set<string>();
      for (const s of data ?? []) {
        const cid = s.carousel_id as string;
        if (seen.has(cid)) continue; // primeira ocorrencia = menor position (primeiro slide)
        seen.add(cid);
        const tc = (s.text_content as SlideText | null) ?? null;
        const legacy = (s.content as { headline?: string; body?: string; cta?: string } | null) ?? null;
        map[cid] = {
          slideType: toSlideType(s.slide_type as string | null),
          content: tc ?? {
            title: legacy?.headline ?? '',
            body: legacy?.body ?? '',
            cta: legacy?.cta ?? '',
          },
          slotImageUrl: (s.slot_image_url as string | null) ?? (s.image_url as string | null) ?? null,
        };
      }
      return map;
    },
    refetchOnMount: 'always',
  });

  // Brand Kits (id -> dados) + default, para mesclar cores/fontes nos thumbnails.
  const { data: brandKits } = useQuery({
    queryKey: ['brand-kits-map'],
    queryFn: async () => {
      const [list, def] = await Promise.all([listBrandKits(), loadDefaultBrandKit()]);
      const map: Record<string, BrandKitData> = {};
      for (const bk of list) map[bk.id] = bk;
      return { map, fallback: def };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const client = getSupabaseClient();
      if (!client) throw new Error('Supabase nao configurado');
      const { error } = await client.from('carousels').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['carousels'] });
      toast.success('Carrossel removido');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function handleDownload(carousel: Carousel) {
    const client = getSupabaseClient();
    if (!client) {
      toast.error('Supabase nao configurado');
      return;
    }
    setDownloadingId(carousel.id);
    try {
      const { data: slidesData, error } = await client
        .from('carousel_slides')
        .select('position, composed_image_url, image_url')
        .eq('carousel_id', carousel.id)
        .order('position', { ascending: true });

      if (error) throw error;
      if (!slidesData || slidesData.length === 0) {
        toast.error('Esse carrossel ainda nao tem slides.');
        return;
      }

      // PNG final composto (preset + texto + slot). image_url e fallback legado.
      const images = slidesData
        .map((s) => ({
          position: s.position as number,
          url: (s.composed_image_url as string | null) ?? (s.image_url as string | null),
        }))
        .filter((s): s is { position: number; url: string } => Boolean(s.url));

      if (images.length === 0) {
        toast.error('Abra o carrossel no editor e baixe uma vez para gerar o PNG final.');
        return;
      }

      const safeName = carousel.title
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .toLowerCase() || 'carrossel';

      await downloadUrlsAsZip(images, safeName);
      // Marca como baixado (alimenta a aba/badge "Baixado").
      await client
        .from('carousels')
        .update({ downloaded_at: new Date().toISOString() })
        .eq('id', carousel.id);
      void queryClient.invalidateQueries({ queryKey: ['carousels'] });
      toast.success('Download iniciado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao baixar carrossel');
    } finally {
      setDownloadingId(null);
    }
  }

  const filtered = carousels?.filter((c) => {
    const matchesTab =
      statusFilter === 'all'
        ? true
        : statusFilter === 'downloaded'
          ? Boolean(c.downloaded_at)
          : c.status === statusFilter;
    const matchesSearch = !search || c.title.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const statusLabels: Record<CarouselStatus, string> = {
    draft: 'Rascunho',
    ready: 'Pronto',
  };

  const statusColors: Record<CarouselStatus, string> = {
    draft: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
    ready: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  };

  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#F8FAFC]">Dashboard</h1>
          <Link to="/create">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Novo Carrossel
            </Button>
          </Link>
        </div>

        <div className="mb-4 flex items-center gap-4">
          <Input
            placeholder="Buscar por titulo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList>
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="draft">Rascunho</TabsTrigger>
              <TabsTrigger value="ready">Pronto</TabsTrigger>
              <TabsTrigger value="downloaded">Baixado</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[#3B82F6]" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {filtered?.map((carousel) => (
              <Card key={carousel.id} className="group">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm line-clamp-1">
                      {carousel.title}
                    </CardTitle>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {carousel.downloaded_at && (
                        <span className="rounded-lg border border-[#3B82F6]/20 bg-[#3B82F6]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#60A5FA]">
                          Baixado
                        </span>
                      )}
                      <span
                        className={`rounded-lg px-1.5 py-0.5 text-[10px] font-medium ${
                          statusColors[carousel.status]
                        }`}
                      >
                        {statusLabels[carousel.status]}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-[rgba(59,130,246,0.04)] border border-[rgba(59,130,246,0.08)] flex items-center justify-center">
                    {firstSlides?.[carousel.id] ? (
                      <>
                        <SlideThumb
                          carousel={carousel as CarouselExt}
                          slide={firstSlides[carousel.id]!}
                          brandKit={
                            carousel.brand_kit_id
                              ? brandKits?.map[carousel.brand_kit_id] ?? null
                              : brandKits?.fallback ?? null
                          }
                        />
                        <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {carousel.slide_count} slides
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-[#94A3B8]">
                        {carousel.slide_count} slides
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <Link
                      to={carousel.status === 'draft' ? `/draft/${carousel.id}` : `/editor/${carousel.id}`}
                      className="flex-1"
                    >
                      <Button variant="outline" size="sm" className="w-full">
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      title="Baixar ZIP"
                      disabled={downloadingId === carousel.id}
                      onClick={() => void handleDownload(carousel)}
                    >
                      {downloadingId === carousel.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Download className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteTargetId(carousel.id)}
                    >
                      <Trash2 className="h-3 w-3 text-red-400" />
                    </Button>
                  </div>
                  <p className="mt-1 text-[10px] text-[#94A3B8]/70">
                    {new Date(carousel.updated_at).toLocaleDateString('pt-BR')}
                  </p>
                </CardContent>
              </Card>
            ))}
            {filtered?.length === 0 && (
              <div className="col-span-full py-12 text-center text-[#94A3B8]">
                Nenhum carrossel encontrado.
              </div>
            )}
          </div>
        )}

        <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir carrossel</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir este carrossel? Esta acao nao pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deleteTargetId) {
                    deleteMutation.mutate(deleteTargetId);
                    setDeleteTargetId(null);
                  }
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
