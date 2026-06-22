import { useState } from 'react';
import { Check, X, RefreshCw, Save, Loader2, Type, ChevronDown, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import type { SlideContent, DesignSpec, VisualSettings, TextRole } from '@/types/carousel';
import { FONT_FAMILIES, TEXT_ROLES } from '@/types/carousel';
import { buildSlidePrompt } from '@/lib/ai/buildSlidePrompt';

interface CarouselPreviewProps {
  slides: SlideContent[];
  specs: DesignSpec[];
  visual: VisualSettings;
  onUpdateSlide?: (position: number, field: keyof SlideContent, value: string) => void;
  onUpdateSpec: (index: number, spec: DesignSpec) => void;
  onStandardizeTypography: (sourceIndex: number) => void;
  onAccept: () => void;
  onReject: () => void;
  onRegenerate: () => void;
  onSaveDraft: () => void;
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

const roleLabels: Record<TextRole, string> = {
  titulo: 'Titulo',
  subtitulo: 'Subtitulo',
  corpo: 'Corpo',
  destaque: 'Destaque',
};

const selectClass =
  'h-9 w-full rounded-md border border-[rgba(59,130,246,0.2)] bg-[#0A0A0F] px-2 text-xs text-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]';

const sectionLabel = 'text-[10px] font-semibold uppercase tracking-wider text-[#60A5FA]';

export function CarouselPreview({
  slides,
  specs,
  visual,
  onUpdateSlide,
  onUpdateSpec,
  onStandardizeTypography,
  onAccept,
  onReject,
  onRegenerate,
  onSaveDraft,
  isAccepting = false,
  isSavingDraft = false,
  acceptProgress = '',
}: CarouselPreviewProps) {
  const busy = isAccepting || isSavingDraft;
  // Slides comecam colapsados; o usuario expande a edicao via botao "Editar".
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggleExpanded(index: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function patchSpec(index: number, patch: (s: DesignSpec) => DesignSpec) {
    const current = specs[index];
    if (!current) return;
    onUpdateSpec(index, patch(current));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview do Carrossel</CardTitle>
        <CardDescription>
          Revise conteudo, tipografia, hierarquia, layout e identidade antes de gerar as imagens.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Slide grid (visao geral) */}
        <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
          {slides.map((slide) => (
            <div
              key={slide.position}
              className="group relative aspect-[4/5] overflow-hidden rounded-lg border border-[rgba(59,130,246,0.12)] bg-gradient-to-br from-primary/5 to-primary/10 p-3"
            >
              <div className="absolute left-2 top-2 rounded bg-primary/20 px-1.5 py-0.5 text-[9px] font-medium text-[#3B82F6]">
                {typeLabels[slide.type] ?? slide.type}
              </div>
              <div className="flex h-full flex-col justify-center gap-2 pt-4">
                <p className="text-center text-[11px] font-bold leading-tight line-clamp-3">
                  {slide.headline}
                </p>
                <p className="text-center text-[9px] leading-tight text-[#94A3B8] line-clamp-4">
                  {slide.body}
                </p>
                {slide.cta && (
                  <p className="text-center text-[8px] font-semibold text-[#3B82F6]">{slide.cta}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Detalhes editaveis por slide */}
        <div className="space-y-4">
          {slides.map((slide, index) => {
            const spec = specs[index];
            if (!spec) return null;
            const promptPreview = buildSlidePrompt({
              content: slide,
              designSpec: spec,
              visual,
              slideIndex: index,
              slideTotal: slides.length,
            });

            const isExpanded = expanded.has(index);

            return (
              <div
                key={slide.position}
                className="space-y-3 rounded-xl border border-[rgba(59,130,246,0.15)] bg-[rgba(59,130,246,0.03)] p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgba(59,130,246,0.12)] text-xs font-bold text-[#3B82F6]">
                    {slide.position}
                  </span>
                  <span className="shrink-0 text-xs font-medium text-[#94A3B8]">
                    {typeLabels[slide.type] ?? slide.type}
                  </span>
                  {!isExpanded && (
                    <span className="min-w-0 flex-1 truncate text-xs text-[#CBD5E1]">
                      {slide.headline}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-auto h-7 shrink-0 text-[10px]"
                    onClick={() => toggleExpanded(index)}
                  >
                    <Pencil className="mr-1 h-3 w-3" />
                    {isExpanded ? 'Fechar' : 'Editar'}
                    <ChevronDown
                      className={`ml-1 h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </Button>
                </div>

                {isExpanded && (
                  <>
                {/* 1) Conteudo */}
                <div className="space-y-2">
                  <p className={sectionLabel}>Conteudo</p>
                  <Input
                    value={slide.headline}
                    onChange={(e) => onUpdateSlide?.(slide.position, 'headline', e.target.value)}
                    className="text-sm font-semibold"
                    placeholder="Titulo"
                  />
                  <textarea
                    value={slide.body}
                    onChange={(e) => onUpdateSlide?.(slide.position, 'body', e.target.value)}
                    rows={2}
                    placeholder="Corpo"
                    className="flex w-full resize-none rounded-md border border-[rgba(59,130,246,0.2)] bg-[#0A0A0F] px-3 py-2 text-xs text-[#CBD5E1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]"
                  />
                  {slide.cta !== undefined && slide.cta !== '' && (
                    <Input
                      value={slide.cta}
                      onChange={(e) => onUpdateSlide?.(slide.position, 'cta', e.target.value)}
                      className="text-xs"
                      placeholder="CTA"
                    />
                  )}
                </div>

                {/* 2) Tipografia */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className={sectionLabel}>Tipografia</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px]"
                      onClick={() => onStandardizeTypography(index)}
                    >
                      <Type className="mr-1 h-3 w-3" />
                      Padronizar em todos
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {TEXT_ROLES.map((role) => (
                      <div key={role} className="space-y-1">
                        <p className="text-[10px] text-[#94A3B8]">{roleLabels[role]}</p>
                        <div className="flex gap-1">
                          <select
                            className={selectClass}
                            value={spec.typography[role].fontFamily}
                            onChange={(e) =>
                              patchSpec(index, (s) => ({
                                ...s,
                                typography: {
                                  ...s.typography,
                                  [role]: { ...s.typography[role], fontFamily: e.target.value },
                                },
                              }))
                            }
                          >
                            {FONT_FAMILIES.map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center rounded-md border border-[rgba(59,130,246,0.2)] bg-[#0A0A0F]">
                            <input
                              type="number"
                              min={8}
                              max={200}
                              value={spec.typography[role].fontSize}
                              onChange={(e) =>
                                patchSpec(index, (s) => ({
                                  ...s,
                                  typography: {
                                    ...s.typography,
                                    [role]: {
                                      ...s.typography[role],
                                      fontSize: Number(e.target.value) || 0,
                                    },
                                  },
                                }))
                              }
                              className="h-9 w-12 bg-transparent px-1 text-center text-xs text-[#F8FAFC] focus-visible:outline-none"
                            />
                            <span className="pr-2 text-[10px] text-[#94A3B8]">px</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3) Hierarquia */}
                <div className="space-y-2">
                  <p className={sectionLabel}>Hierarquia (papel de cada bloco)</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['headline', 'body', 'cta'] as const).map((block) => (
                      <div key={block} className="space-y-1">
                        <p className="text-[10px] capitalize text-[#94A3B8]">
                          {block === 'headline' ? 'Titulo' : block === 'body' ? 'Corpo' : 'CTA'}
                        </p>
                        <select
                          className={selectClass}
                          value={spec.hierarchy[block]}
                          onChange={(e) =>
                            patchSpec(index, (s) => ({
                              ...s,
                              hierarchy: { ...s.hierarchy, [block]: e.target.value as TextRole },
                            }))
                          }
                        >
                          {TEXT_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {roleLabels[role]}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4) Layout */}
                <div className="space-y-2">
                  <p className={sectionLabel}>Layout</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <p className="text-[10px] text-[#94A3B8]">Alinhamento</p>
                      <select
                        className={selectClass}
                        value={spec.layout.align}
                        onChange={(e) =>
                          patchSpec(index, (s) => ({
                            ...s,
                            layout: { ...s.layout, align: e.target.value as DesignSpec['layout']['align'] },
                          }))
                        }
                      >
                        <option value="left">Esquerda</option>
                        <option value="center">Centro</option>
                        <option value="right">Direita</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-[#94A3B8]">Posicao</p>
                      <select
                        className={selectClass}
                        value={spec.layout.position}
                        onChange={(e) =>
                          patchSpec(index, (s) => ({
                            ...s,
                            layout: {
                              ...s.layout,
                              position: e.target.value as DesignSpec['layout']['position'],
                            },
                          }))
                        }
                      >
                        <option value="top">Topo</option>
                        <option value="center">Centro</option>
                        <option value="bottom">Base</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 5) Identidade */}
                <div className="space-y-2">
                  <p className={sectionLabel}>Identidade</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <p className="text-[10px] text-[#94A3B8]">Posicao do logo</p>
                      <select
                        className={selectClass}
                        value={spec.identity.logoPosition}
                        onChange={(e) =>
                          patchSpec(index, (s) => ({
                            ...s,
                            identity: {
                              ...s.identity,
                              logoPosition: e.target.value as DesignSpec['identity']['logoPosition'],
                            },
                          }))
                        }
                      >
                        <option value="none">Nenhum</option>
                        <option value="top-left">Sup. esquerdo</option>
                        <option value="top-right">Sup. direito</option>
                        <option value="bottom-left">Inf. esquerdo</option>
                        <option value="bottom-right">Inf. direito</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-[#94A3B8]">Watermark</p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            patchSpec(index, (s) => ({
                              ...s,
                              identity: { ...s.identity, watermark: !s.identity.watermark },
                            }))
                          }
                          className={`h-9 rounded-md border px-3 text-xs transition-colors ${
                            spec.identity.watermark
                              ? 'border-[#3B82F6] bg-[rgba(59,130,246,0.15)] text-[#60A5FA]'
                              : 'border-[rgba(59,130,246,0.2)] text-[#94A3B8]'
                          }`}
                        >
                          {spec.identity.watermark ? 'Ativo' : 'Inativo'}
                        </button>
                        {spec.identity.watermark && (
                          <Input
                            value={spec.identity.watermarkText}
                            onChange={(e) =>
                              patchSpec(index, (s) => ({
                                ...s,
                                identity: { ...s.identity, watermarkText: e.target.value },
                              }))
                            }
                            placeholder="Texto"
                            className="h-9 text-xs"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Resumo do prompt (read-only, expansivel) */}
                <details className="group rounded-lg border border-[rgba(59,130,246,0.12)] bg-[#0A0A0F]">
                  <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                    Prompt enviado ao Nano Banana
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                  </summary>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap px-3 pb-3 text-[10px] leading-relaxed text-[#CBD5E1]">
                    {promptPreview}
                  </pre>
                </details>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Acoes */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onReject} className="flex-1" disabled={busy}>
            <X className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <Button variant="outline" onClick={onRegenerate} className="flex-1" disabled={busy}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Regenerar
          </Button>
          <Button variant="outline" onClick={onSaveDraft} className="flex-1" disabled={busy}>
            {isSavingDraft ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar Rascunho
              </>
            )}
          </Button>
          <Button onClick={onAccept} className="flex-1" disabled={busy}>
            {isAccepting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {acceptProgress || 'Gerando...'}
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Gerar Carrossel
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
