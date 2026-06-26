import { forwardRef, useEffect, useState } from 'react';
import type {
  Preset,
  SlideType,
  StyleTokens,
  SlideText,
  LayoutZone,
  TypeStyle,
  ImageSlot,
  TextRole,
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

function zoneStyle(z: LayoutZone): React.CSSProperties {
  return {
    position: 'absolute',
    left: `${z.x}%`,
    top: `${z.y}%`,
    width: `${z.w}%`,
    height: `${z.h}%`,
  };
}

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
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  };
}

function Slot({ slot, url }: { slot: ImageSlot; url?: string | null }) {
  return (
    <div style={{ ...zoneStyle(slot), borderRadius: slot.radius, overflow: 'hidden' }}>
      {url ? (
        <img
          src={url}
          alt=""
          crossOrigin="anonymous"
          style={{ width: '100%', height: '100%', objectFit: slot.objectFit, display: 'block' }}
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
      {slot.overlay && (
        <div style={{ position: 'absolute', inset: 0, background: slot.overlay }} />
      )}
    </div>
  );
}

/**
 * Renderiza UM slide no frame fixo 1080x1350 a partir do preset + tokens.
 * O MESMO componente é usado no preview (scale<1) e no export (scale=1 via
 * html-to-image), garantindo saída pixel-idêntica. O `ref` aponta para o frame
 * 1:1 interno (alvo da captura).
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
  const roleText: Record<TextRole, string> = {
    title: content.title,
    subtitle: content.body,
    body: content.body,
    cta: content.cta,
  };

  // Decoração opcional do preset.
  const showAccentBar = tokens.decoration === 'accent-bar';
  const showTopRule = tokens.decoration === 'top-rule';
  const showCornerDot = tokens.decoration === 'corner-dot';

  return (
    <div
      style={{
        width: FRAME_W * scale,
        height: FRAME_H * scale,
        overflow: 'hidden',
        flex: '0 0 auto',
      }}
    >
      <div
        ref={ref}
        style={{
          width: FRAME_W,
          height: FRAME_H,
          position: 'relative',
          background: c.bg,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          opacity: fontsReady ? 1 : 0.999, // força repaint quando a fonte carrega
        }}
      >
        {/* Slot de imagem primeiro (fica atrás do texto sobreposto, ex.: capa Editorial) */}
        {layout.imageSlot && <Slot slot={layout.imageSlot} url={slotImageUrl} />}

        {/* Decoração 'corner-dot': ponto de acento no canto superior direito */}
        {showCornerDot && (
          <div
            style={{
              position: 'absolute',
              top: 54,
              right: 64,
              width: 18,
              height: 18,
              borderRadius: 999,
              background: c.accent,
              boxShadow: `0 0 24px ${c.accent}`,
            }}
          />
        )}

        {/* Header: logo (esq) + barra de marca */}
        {layout.header && (
          <div style={{ ...zoneStyle(layout.header), display: 'flex', alignItems: 'center', gap: 16 }}>
            {logoUrl ? (
              <img src={logoUrl} alt="" crossOrigin="anonymous" style={{ height: '100%', objectFit: 'contain' }} />
            ) : (
              <div style={{ width: 14, height: 14, borderRadius: 999, background: c.accent }} />
            )}
            {showTopRule && <div style={{ flex: 1, height: 2, background: c.accent }} />}
          </div>
        )}

        {showAccentBar && layout.title && (
          <div
            style={{
              position: 'absolute',
              left: `${layout.title.x}%`,
              top: `${layout.title.y - 1.4}%`,
              width: 90,
              height: 10,
              borderRadius: 999,
              background: c.accent,
            }}
          />
        )}

        {/* Título */}
        <div style={{ ...zoneStyle(layout.title), ...textStyle(tokens.typography.title, c.text) }}>
          {content.title}
        </div>

        {/* Subtítulo (capa) */}
        {layout.subtitle && roleText.subtitle && (
          <div style={{ ...zoneStyle(layout.subtitle), ...textStyle(tokens.typography.subtitle, c.textMuted) }}>
            {content.body}
          </div>
        )}

        {/* Corpo */}
        {layout.body && content.body && (
          <div style={{ ...zoneStyle(layout.body), ...textStyle(tokens.typography.body, c.text) }}>
            {content.body}
          </div>
        )}

        {/* CTA */}
        {layout.cta && content.cta && (
          <div style={{ ...zoneStyle(layout.cta), display: 'flex', alignItems: 'center' }}>
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
        )}

        {/* Footer */}
        {layout.footer && (
          <div
            style={{
              ...zoneStyle(layout.footer),
              ...textStyle({ ...tokens.typography.cta, sizePx: 24, weight: 500, transform: 'none', letterSpacing: 0 }, c.textMuted),
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{preset.name}</span>
          </div>
        )}
      </div>
    </div>
  );
});
