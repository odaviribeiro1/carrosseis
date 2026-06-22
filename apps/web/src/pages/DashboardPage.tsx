import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2, Plus, Pencil, Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

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
import { downloadImagesAsZip } from '@/lib/export/download-zip';
import type { Carousel, CarouselStatus } from '@content-hub/shared';

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
        .select('position, image_url')
        .eq('carousel_id', carousel.id)
        .order('position', { ascending: true });

      if (error) throw error;
      if (!slidesData || slidesData.length === 0) {
        toast.error('Esse carrossel ainda nao tem slides.');
        return;
      }

      const images = slidesData
        .filter((s) => s.image_url)
        .map((s) => ({ position: s.position as number, url: s.image_url as string }));

      if (images.length === 0) {
        toast.error('Esse carrossel ainda nao tem imagens geradas.');
        return;
      }

      const safeName = carousel.title
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .toLowerCase() || 'carrossel';

      await downloadImagesAsZip(images, safeName);
      toast.success('Download iniciado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao baixar carrossel');
    } finally {
      setDownloadingId(null);
    }
  }

  const filtered = carousels?.filter(
    (c) =>
      (statusFilter === 'all' || c.status === statusFilter) &&
      (!search || c.title.toLowerCase().includes(search.toLowerCase()))
  );

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
                    <span
                      className={`rounded-lg px-1.5 py-0.5 text-[10px] font-medium ${
                        statusColors[carousel.status]
                      }`}
                    >
                      {statusLabels[carousel.status]}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="aspect-[4/5] rounded-xl bg-[rgba(59,130,246,0.04)] border border-[rgba(59,130,246,0.08)] flex items-center justify-center">
                    <span className="text-xs text-[#94A3B8]">
                      {carousel.slide_count} slides
                    </span>
                  </div>
                  <div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <Link to={`/editor/${carousel.id}`} className="flex-1">
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
