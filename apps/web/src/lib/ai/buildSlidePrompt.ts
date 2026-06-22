import type { SlideContent, DesignSpec, VisualSettings, TextRole } from '@/types/carousel';

const ROLE_LABEL: Record<TextRole, string> = {
  titulo: 'TÍTULO',
  subtitulo: 'SUBTÍTULO',
  corpo: 'CORPO',
  destaque: 'DESTAQUE',
};

const ALIGN_LABEL: Record<DesignSpec['layout']['align'], string> = {
  left: 'à esquerda',
  center: 'ao centro',
  right: 'à direita',
};

const POSITION_LABEL: Record<DesignSpec['layout']['position'], string> = {
  top: 'no topo',
  center: 'no centro',
  bottom: 'na base',
};

const LOGO_LABEL: Record<DesignSpec['identity']['logoPosition'], string> = {
  'none': '',
  'top-left': 'canto superior esquerdo',
  'top-right': 'canto superior direito',
  'bottom-left': 'canto inferior esquerdo',
  'bottom-right': 'canto inferior direito',
};

const STYLE_LABEL: Record<string, string> = {
  realista: 'fotográfico realista',
  ilustracao: 'ilustração',
  '3d': 'render 3D',
  cinematografico: 'cinematográfico',
  arte_digital: 'arte digital',
  vintage: 'vintage',
  minimalista: 'minimalista',
};

export interface BuildSlidePromptArgs {
  content: SlideContent;
  designSpec: DesignSpec;
  visual: VisualSettings;
  slideIndex: number;
  slideTotal: number;
  /** Instrução de refino em linguagem natural, anexada ao final. */
  refineInstruction?: string;
}

/**
 * Compila um prompt textual rico para o Nano Banana renderizar um slide inteiro
 * (imagem + texto). Usado tanto na geração inicial quanto no refino.
 */
export function buildSlidePrompt(args: BuildSlidePromptArgs): string {
  const { content, designSpec, visual, slideIndex, slideTotal, refineInstruction } = args;
  const ts = designSpec.typography;
  const style = STYLE_LABEL[visual.imageStyle] ?? visual.imageStyle;
  const palette = visual.colorPalette.join(', ');

  const lines: string[] = [];
  lines.push(
    `Crie um slide de carrossel para Instagram, proporção 4:5 (1080x1350px), estilo ${style}.`,
  );
  lines.push(`Este é o slide ${slideIndex + 1} de ${slideTotal} (tipo: ${content.type}).`);
  lines.push(`Paleta de cores (hex): ${palette}.`);
  lines.push('');
  lines.push('Renderize EXATAMENTE o seguinte texto na imagem, sem alterar, traduzir nem abreviar:');

  const headlineRole = designSpec.hierarchy.headline;
  const headlineStyle = ts[headlineRole];
  lines.push(
    `- ${ROLE_LABEL[headlineRole]} (fonte ${headlineStyle.fontFamily}, ~${headlineStyle.fontSize}px, peso bold): "${content.headline}"`,
  );

  if (content.body?.trim()) {
    const bodyRole = designSpec.hierarchy.body;
    const bodyStyle = ts[bodyRole];
    lines.push(
      `- ${ROLE_LABEL[bodyRole]} (fonte ${bodyStyle.fontFamily}, ~${bodyStyle.fontSize}px): "${content.body}"`,
    );
  }

  if (content.cta?.trim()) {
    const ctaRole = designSpec.hierarchy.cta;
    const ctaStyle = ts[ctaRole];
    lines.push(
      `- ${ROLE_LABEL[ctaRole]} (fonte ${ctaStyle.fontFamily}, ~${ctaStyle.fontSize}px): "${content.cta}"`,
    );
  }

  lines.push('');
  lines.push(
    `Hierarquia: o título deve dominar visualmente; o corpo é secundário${
      content.cta?.trim() ? '; o CTA deve ter destaque de chamada para ação' : ''
    }.`,
  );
  lines.push(
    `Layout: texto alinhado ${ALIGN_LABEL[designSpec.layout.align]}, posicionado ${POSITION_LABEL[designSpec.layout.position]} do slide.`,
  );

  const identity = designSpec.identity;
  const identityParts: string[] = [];
  if (identity.logoPosition !== 'none') {
    identityParts.push(`reserve um espaço limpo para o logo da marca no ${LOGO_LABEL[identity.logoPosition]}`);
  }
  if (identity.watermark && identity.watermarkText.trim()) {
    identityParts.push(`inclua uma marca d'água translúcida com o texto "${identity.watermarkText.trim()}"`);
  }
  if (identityParts.length > 0) {
    lines.push(`Identidade: ${identityParts.join('; ')}.`);
  }

  lines.push(
    'Use os tamanhos de fonte como proporção relativa entre os textos, garantindo legibilidade e alto contraste com o fundo.',
  );
  lines.push(
    `Mantenha consistência visual com os demais ${slideTotal} slides do carrossel (mesma identidade, paleta e tipografia).`,
  );

  if (visual.imagePrompt?.trim()) {
    lines.push(`Direção de arte adicional: ${visual.imagePrompt.trim()}.`);
  }

  if (refineInstruction?.trim()) {
    lines.push('');
    lines.push(
      `AJUSTE SOLICITADO (aplique mantendo o texto literal e a identidade): ${refineInstruction.trim()}.`,
    );
  }

  return lines.join('\n');
}
