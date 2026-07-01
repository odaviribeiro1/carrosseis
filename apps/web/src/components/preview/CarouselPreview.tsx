import { Check, RefreshCw, Save, Loader2, Wand2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState, useEffect } from 'react';
import type { SlideContent } from '@/types/carousel';
import type { Preset } from '@/lib/presets/types';
import { mergeTokens, brandFontFaces } from '@/lib/presets/mergeTokens';
import type { BrandKitData } from '@/lib/brandKit';
import { SlideRenderer, FRAME_W } from '@/components/render/SlideRenderer';

interface CarouselPreviewProps {
  slides: SlideContent[];
  preset: Preset;
  brandKit?: BrandKitData | null;
  accountName?: string;
  accountHandle?: string;
  avatarUrl?: string | null;
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
  accountName,
  accountHandle,
  avatarUrl,
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
  const [selectedPosition, setSelectedPosition] = useState(slides[0]?.position ?? 1);
  const selectedSlide = slides.find((s) => s.position === selectedPosition) ?? slides[0];

  // Atualiza selectedPosition se o slide selecionado for removido
  useEffect(() => {
    if (!slides.find((s) => s.position === selectedPosition)) {
      setSelectedPosition(slides[0]?.position ?? 1);
    }
  }, [slides, selectedPosition]);

  return (
    <div className="rounded-2xl border border-[rgba(59,130,246,0.12)] bg-[rgba(255,255,255,0.02)] p-6">
      <h2 className="mb-1 text-lg font-bold text-[#F8FAFC]">Preview do Carrossel</h2>
      <p className="mb-5 text-sm text-[#94A3B8]">
        O texto e renderizado pelo template (preset {preset.name}); a imagem de cada slide e gerada
        ao confirmar. Clique em um slide para editar seu texto — sem regerar imagem.
      </p>

      {/* Grid de slides renderizados ao vivo — clique para selecionar */}
      <div className="mb-6 flex flex-wrap gap-3">
        {slides.map((slide) => {
          const isSelected = slide.position === selectedPosition;
          return (
            <button
              key={slide.position}
              type="button"
              onClick={() => setSelectedPosition(slide.position)}
              className={`relative cursor-pointer rounded-lg border-2 bg-transparent p-0 text-left transition-all ${
                isSelected
                  ? 'border-[#3B82F6] shadow-[0_0_12px_rgba(59,130,246,0.35)]'
                  : 'border-transparent opacity-70 hover:opacity-100'
              }`}
            >
              <div className="absolute left-1.5 top-1.5 z-10 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-white">
                {typeLabels[slide.type] ?? slide.type} {slide.position}
              </div>
              <div className="overflow-hidden rounded-[5px]">
                <SlideRenderer
                  preset={preset}
                  slideType={toSlideType(slide.type)}
                  tokens={tokens}
                  content={{ title: slide.headline, body: slide.body, cta: slide.cta }}
                  accountName={accountName}
                  accountHandle={accountHandle}
                  avatarUrl={avatarUrl}
                  scale={thumbScale}
                  fontFaces={fonts}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Edicao de texto do slide selecionado (instantanea, sem regenerar imagem) */}
      {selectedSlide && (
        <div className="rounded-xl border border-[rgba(59,130,246,0.15)] bg-[rgba(59,130,246,0.03)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#3B82F6] text-xs font-bold text-white">
              {selectedSlide.position}
            </span>
            <span className="text-xs font-medium text-[#94A3B8]">
              {typeLabels[selectedSlide.type] ?? selectedSlide.type}
            </span>
            <span className="ml-auto text-[10px] text-[#94A3B8]">
              Slide {selectedSlide.position} de {slides.length}
            </span>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-[#94A3B8]">Titulo</Label>
            <Input
              value={selectedSlide.headline}
              onChange={(e) => onUpdateSlide?.(selectedSlide.position, 'headline', e.target.value)}
              className="text-sm font-semibold"
            />
          </div>
          <div className="mt-3 space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-[#94A3B8]">Corpo</Label>
            <textarea
              value={selectedSlide.body}
              onChange={(e) => onUpdateSlide?.(selectedSlide.position, 'body', e.target.value)}
              rows={3}
              className="flex w-full resize-none rounded-md border border-[rgba(59,130,246,0.15)] bg-[rgba(15,18,35,0.5)] px-3 py-2 text-xs text-[#CBD5E1]"
            />
          </div>
          {(selectedSlide.type === 'cta' || selectedSlide.cta) && (
            <div className="mt-3 space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-[#94A3B8]">CTA</Label>
              <Input
                value={selectedSlide.cta}
                onChange={(e) => onUpdateSlide?.(selectedSlide.position, 'cta', e.target.value)}
                className="text-xs"
              />
            </div>
          )}
        </div>
      )}

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
