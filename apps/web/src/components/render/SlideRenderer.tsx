import { forwardRef, useEffect, useState } from 'react';
import type {
  Preset,
  SlideType,
  StyleTokens,
  SlideText,
  TypeStyle,
  ImageSlotStyle,
  LayoutBlock,
} from '@/lib/presets/types';

export const FRAME_W = 1080;
export const FRAME_H = 1350;

interface SlideRendererProps {
  preset: Preset;
  slideType: SlideType;
  tokens: StyleTokens; // já mesclado com Brand Kit
  content: SlideText;
  slotImageUrl?: string | null;
  logoUrl?: string | null;
  /** Escala de exibição (1 = export 1:1). Ex.: 0.25 para preview. */
  scale?: number;
  /** Fontes (com url) a pré-carregar antes de renderizar. */
  fontFaces?: Array<{ family: string; url: string }>;
}

const px = (pct: number, base: number) => (pct / 100) * base;

const scaleType = (ts: TypeStyle, s?: number): TypeStyle =>
  s && s !== 1 ? { ...ts, sizePx: Math.round(ts.sizePx * s) } : ts;

function textStyle(ts: TypeStyle, color: string): React.CSSProperties {
  return {
    fontFamily: `'${ts.family}', sans-serif`,
    fontSize: `${ts.sizePx}px`,
    fontWeight: ts.weight,
    lineHeight: ts.lineHeight,
    letterSpacing: `${ts.letterSpacing}px`,
    textTransform: ts.transform ?? 'none',
    fontStyle: ts.italic ? 'italic' : 'normal',
    color,
    margin: 0,
  };
}

function Slot({
  slot,
  url,
  style,
}: {
  slot: ImageSlotStyle;
  url?: string | null;
  style: React.CSSProperties;
}) {
  return (
    <div data-slot style={{ ...style, borderRadius: slot.radius, overflow: 'hidden', position: 'relative' }}>
      {url ? (
        <img
          src={url}
          alt=""
          crossOrigin="anonymous"
          style={{
            width: '100%',
            height: '100%',
            objectFit: slot.objectFit,
            objectPosition: 'center',
            display: 'block',
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: 'linear-gradient(135deg, rgba(120,120,140,0.18), rgba(120,120,140,0.06))',
          }}
        />
      )}
      {slot.overlay && <div style={{ position: 'absolute', inset: 0, background: slot.overlay }} />}
    </div>
  );
}

/**
 * Renderiza UM slide no frame fixo 1080x1350 via CSS flex. O bloco 'slot'
 * (imagem) usa flex:1 e consome o espaço que o texto deixou (texto curto =>
 * slot alto, sem faixa branca). O MESMO componente é usado no preview (scale<1),
 * na medição (1:1, lê [data-slot]) e no export (html-to-image, 1:1) — garantindo
 * preview = geração = export.
 */
export const SlideRenderer = forwardRef<HTMLDivElement, SlideRendererProps>(function SlideRenderer(
  { preset, slideType, tokens, content, slotImageUrl, logoUrl, scale = 1, fontFaces = [] },
  ref,
) {
  const [fontsReady, setFontsReady] = useState(fontFaces.length === 0);

  useEffect(() => {
    if (fontFaces.length === 0) return;
    let active = true;
    Promise.all(
      fontFaces.map(async ({ family, url }) => {
        try {
          const face = new FontFace(family, `url(${url})`);
          await face.load();
          (document.fonts as FontFaceSet).add(face);
        } catch {
          /* fonte indisponível: cai no fallback sans-serif */
        }
      }),
    ).then(() => active && setFontsReady(true));
    return () => {
      active = false;
    };
  }, [fontFaces]);

  const layout = preset.layouts[slideType];
  const c = tokens.colors;
  const pad = px(layout.padPct ?? 8, FRAME_W);
  const showAccentBar = tokens.decoration === 'accent-bar';
  const showTopRule = tokens.decoration === 'top-rule';
  const showCornerDot = tokens.decoration === 'corner-dot';

  function blockEl(block: LayoutBlock, key: number, opts: { onImageBg?: boolean } = {}) {
    const gap = block.gapPct ? px(block.gapPct, FRAME_H) : 0;
    const base: React.CSSProperties = { marginBottom: gap, flexShrink: 0 };
    const onBg = opts.onImageBg; // texto sobre imagem (full-bleed) => cor clara

    switch (block.kind) {
      case 'header':
        return (
          <div key={key} style={{ ...base, display: 'flex', alignItems: 'center', gap: 20, height: 40 }}>
            {logoUrl ? (
              <img src={logoUrl} alt="" crossOrigin="anonymous" style={{ height: '100%', objectFit: 'contain' }} />
            ) : (
              <div style={{ width: 20, height: 20, borderRadius: 999, background: c.accent, flexShrink: 0 }} />
            )}
            {showTopRule && <div style={{ flex: 1, height: 3, borderRadius: 999, background: c.accent }} />}
          </div>
        );
      case 'title':
        return (
          <div key={key} style={base}>
            {showAccentBar && (
              <div style={{ width: 96, height: 10, borderRadius: 999, background: c.accent, marginBottom: 24 }} />
            )}
            <div style={textStyle(scaleType(tokens.typography.title, block.scale), onBg ? '#FFFFFF' : c.text)}>
              {content.title}
            </div>
          </div>
        );
      case 'subtitle':
        return content.body ? (
          <div key={key} style={{ ...base, ...textStyle(scaleType(tokens.typography.subtitle, block.scale), onBg ? 'rgba(255,255,255,0.85)' : c.textMuted) }}>
            {content.body}
          </div>
        ) : null;
      case 'body':
        return content.body ? (
          <div key={key} style={{ ...base, ...textStyle(scaleType(tokens.typography.body, block.scale), onBg ? 'rgba(255,255,255,0.92)' : c.text) }}>
            {content.body}
          </div>
        ) : null;
      case 'cta':
        return content.cta ? (
          <div key={key} style={{ ...base, display: 'flex' }}>
            <span
              style={{
                ...textStyle(tokens.typography.cta, '#FFFFFF'),
                display: 'inline-block',
                background: c.accent,
                padding: '18px 40px',
                borderRadius: tokens.radius,
                boxShadow: tokens.shadow,
              }}
            >
              {content.cta}
            </span>
          </div>
        ) : null;
      case 'footer':
        // Sem nome de preset dentro do slide (white-label). Com Brand Kit, o logo
        // ocupa o rodapé; sem logo, o footer some (não reserva espaço).
        return logoUrl ? (
          <div key={key} style={{ ...base, display: 'flex', alignItems: 'center', height: 40 }}>
            <img src={logoUrl} alt="" crossOrigin="anonymous" style={{ height: '100%', objectFit: 'contain' }} />
          </div>
        ) : null;
      case 'spacer':
        return <div key={key} style={{ flex: block.flex ?? 1 }} />;
      case 'slot':
        return (
          <Slot
            key={key}
            slot={layout.slot}
            url={slotImageUrl}
            style={{ ...base, flex: block.flex ?? 1, minHeight: block.minPct ? px(block.minPct, FRAME_H) : 0, width: '100%' }}
          />
        );
      default:
        return null;
    }
  }

  const frameBase: React.CSSProperties = {
    width: FRAME_W,
    height: FRAME_H,
    position: 'relative',
    background: c.bg,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    overflow: 'hidden',
    opacity: fontsReady ? 1 : 0.999,
  };

  let inner: React.ReactNode;

  if (layout.mode === 'full-bleed') {
    // Slot de fundo cobrindo o frame; texto sobreposto (sem o bloco 'slot' no fluxo).
    const textBlocks = layout.blocks.filter((b) => b.kind !== 'slot');
    inner = (
      <>
        <Slot slot={layout.slot} url={slotImageUrl} style={{ position: 'absolute', inset: 0 }} />
        <div style={{ position: 'absolute', inset: 0, padding: pad, display: 'flex', flexDirection: 'column' }}>
          {textBlocks.map((b, i) => blockEl(b, i, { onImageBg: true }))}
        </div>
      </>
    );
  } else if (layout.mode === 'split') {
    // Coluna de texto + coluna de imagem (slot preenche a altura da coluna).
    const textBlocks = layout.blocks.filter((b) => b.kind !== 'slot');
    const imgPct = layout.splitImagePct ?? 42;
    inner = (
      <div style={{ position: 'absolute', inset: 0, padding: pad, display: 'flex', flexDirection: 'row', gap: px(4, FRAME_W) }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {textBlocks.map((b, i) => blockEl(b, i))}
        </div>
        <div style={{ width: `${imgPct}%`, display: 'flex' }}>
          <Slot slot={layout.slot} url={slotImageUrl} style={{ flex: 1, width: '100%', minHeight: '100%' }} />
        </div>
      </div>
    );
  } else {
    // stack: coluna vertical; o bloco 'slot' (flex:1) consome o espaço restante.
    inner = (
      <div style={{ position: 'absolute', inset: 0, padding: pad, display: 'flex', flexDirection: 'column' }}>
        {layout.blocks.map((b, i) => blockEl(b, i))}
      </div>
    );
  }

  return (
    <div style={{ width: FRAME_W * scale, height: FRAME_H * scale, overflow: 'hidden', flex: '0 0 auto' }}>
      <div ref={ref} style={frameBase}>
        {showCornerDot && (
          <div
            style={{
              position: 'absolute',
              top: 54,
              right: 64,
              zIndex: 2,
              width: 18,
              height: 18,
              borderRadius: 999,
              background: c.accent,
              boxShadow: `0 0 24px ${c.accent}`,
            }}
          />
        )}
        {inner}
      </div>
    </div>
  );
});
