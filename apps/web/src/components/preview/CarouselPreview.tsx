import { Check, RefreshCw, Save, Loader2, Wand2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SlideContent } from '@/types/carousel';
import type { Preset } from '@/lib/presets/types';
import { mergeTokens, brandFontFaces } from '@/lib/presets/mergeTokens';
import type { BrandKitData } from '@/lib/brandKit';
import { SlideRenderer, FRAME_W } from '@/components/render/SlideRenderer';

interface CarouselPreviewProps {
  slides: SlideContent[];
  preset: Preset;
  brandKit?: BrandKitData | null;
  onUpdateSlide?: (position: number, field: keyof SlideContent, value: string) => void;
  onAccept: () => void;
  onReject: () => void;
  onRegenerate: () => void;
  onSaveDraft: () => void;
  onRegenerateArtDirection?: () => void;
  artDirectionPending?: boolean;
  isAccepting?: boolean;
  isSavingDraft?: boolean;
  acceptProgress?: string;
}

const typeLabels: Record<string, string> = {
  capa: 'Capa',
  conteudo: 'Conteudo',
  cta: 'CTA',
  transicao: 'Transicao',
};

function toSlideType(t: SlideContent['type']): 'capa' | 'conteudo' | 'cta' {
  if (t === 'capa') return 'capa';
  if (t === 'cta') return 'cta';
  return 'conteudo';
}

const THUMB_W = 150;

export function CarouselPreview({
  slides,
  preset,
  brandKit,
  onUpdateSlide,
  onAccept,
  onReject,
  onRegenerate,
  onSaveDraft,
  onRegenerateArtDirection,
  artDirectionPending = false,
  isAccepting = false,
  isSavingDraft = false,
  acceptProgress = '',
}: CarouselPreviewProps) {
  const busy = isAccepting || isSavingDraft;
  const tokens = mergeTokens(preset, brandKit);
  const fonts = brandFontFaces(brandKit);
  const thumbScale = THUMB_W / FRAME_W;

  return (
    <div className="rounded-2xl border border-[rgba(59,130,246,0.12)] bg-[rgba(255,255,255,0.02)] p-6">
      <h2 className="mb-1 text-lg font-bold text-[#F8FAFC]">Preview do Carrossel</h2>
      <p className="mb-5 text-sm text-[#94A3B8]">
        O texto e renderizado pelo template (preset {preset.name}); a imagem de cada slide e gerada
        ao confirmar. Edite os textos abaixo — sem regerar imagem.
      </p>

      {/* Grid de slides renderizados ao vivo (texto do preset; slot ainda vazio) */}
      <div className="mb-6 flex flex-wrap gap-3">
        {slides.map((slide) => (
          <div key={slide.position} className="relative">
            <div className="absolute left-1.5 top-1.5 z-10 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-white">
              {typeLabels[slide.type] ?? slide.type}
            </div>
            <div className="overflow-hidden rounded-lg border border-[rgba(59,130,246,0.12)]">
              <SlideRenderer
                preset={preset}
                slideType={toSlideType(slide.type)}
                tokens={tokens}
                content={{ title: slide.headline, body: slide.body, cta: slide.cta }}
                scale={thumbScale}
                fontFaces={fonts}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Edicao de texto por slide (instantanea, sem regenerar imagem) */}
      <div className="space-y-3">
        {slides.map((slide) => (
          <div
            key={slide.position}
            className="space-y-2 rounded-xl border border-[rgba(59,130,246,0.15)] bg-[rgba(59,130,246,0.03)] p-4"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(59,130,246,0.12)] text-xs font-bold text-[#3B82F6]">
                {slide.position}
              </span>
              <span className="text-xs font-medium text-[#94A3B8]">{typeLabels[slide.type] ?? slide.type}</span>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-[#94A3B8]">Titulo</Label>
              <Input
                value={slide.headline}
                onChange={(e) => onUpdateSlide?.(slide.position, 'headline', e.target.value)}
                className="text-sm font-semibold"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-[#94A3B8]">Corpo</Label>
              <textarea
                value={slide.body}
                onChange={(e) => onUpdateSlide?.(slide.position, 'body', e.target.value)}
                rows={2}
                className="flex w-full resize-none rounded-md border border-[rgba(59,130,246,0.15)] bg-[rgba(15,18,35,0.5)] px-3 py-2 text-xs text-[#CBD5E1]"
              />
            </div>
            {(slide.type === 'cta' || slide.cta) && (
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-[#94A3B8]">CTA</Label>
                <Input
                  value={slide.cta}
                  onChange={(e) => onUpdateSlide?.(slide.position, 'cta', e.target.value)}
                  className="text-xs"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Regerar direcao de arte (estilo das fotos dos slots) */}
      {onRegenerateArtDirection && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-dashed border-[rgba(59,130,246,0.25)] px-3 py-2">
          <span className="text-xs text-[#94A3B8]">
            {artDirectionPending
              ? 'Nova direcao de arte agendada para a proxima geracao.'
              : 'As fotos dos slots compartilham uma direcao de arte (estilo/iluminacao).'}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-xs"
            disabled={busy || artDirectionPending}
            onClick={onRegenerateArtDirection}
          >
            <Wand2 className="mr-1 h-3 w-3" /> Regerar direcao de arte
          </Button>
        </div>
      )}

      {/* Acoes */}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="outline" onClick={onReject} className="flex-1" disabled={busy}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        <Button variant="outline" onClick={onRegenerate} className="flex-1" disabled={busy}>
          <RefreshCw className="mr-2 h-4 w-4" /> Regenerar
        </Button>
        <Button variant="outline" onClick={onSaveDraft} className="flex-1" disabled={busy}>
          {isSavingDraft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {isSavingDraft ? 'Salvando...' : 'Salvar Rascunho'}
        </Button>
        <Button onClick={onAccept} className="flex-1" disabled={busy}>
          {isAccepting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
          {isAccepting ? acceptProgress || 'Gerando...' : 'Gerar Carrossel'}
        </Button>
      </div>
    </div>
  );
}
