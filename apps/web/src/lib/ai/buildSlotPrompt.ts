import { artDirectionToPromptBlock, type ArtDirection } from '@content-hub/shared';
import type { SlideText } from '@/lib/presets/types';

// Diretriz de fotorrealismo: tira a "cara de IA" (render 3D/CGI/glow) e força
// fotografia real. Reforcada em todo slot + na direcao de arte global.
export const PHOTO_DIRECTIVE = [
  'ESTILO VISUAL OBRIGATÓRIO: fotografia realista, como uma foto tirada por câmera profissional ' +
    '(editorial/fotojornalismo). Iluminação natural e realista, texturas do mundo real, ' +
    'profundidade de campo, leve grão fotográfico. Aparência de foto real, não de imagem gerada.',
  'PROIBIDO: renderização 3D, CGI, ilustração, arte digital, mockup com glow/neon, elementos ' +
    'holográficos flutuando, UI futurista sobreposta, fundo gradiente sintético, superfícies ' +
    'plásticas/glossy perfeitas, pódios/displays de produto irreais.',
  'VÍNCULO COM O TEXTO: a imagem deve representar o tema do slide de forma realista e concreta ' +
    '(uma cena, objeto ou contexto do mundo real ligado ao conteúdo), não uma metáfora abstrata genérica.',
].join('\n');

/**
 * Monta o prompt do SLOT de imagem (gpt-image-2). A IA gera APENAS a foto/visual
 * que vai dentro do slot — nunca o slide inteiro. Instrução restritiva para
 * impedir texto/UI/tipografia na imagem (o texto é renderizado por código).
 *
 * Coerência entre slots vem da direção de arte (cacheada) compartilhada por
 * todos os slides + refs/âncora enviados na chamada à Edge Function.
 */
export function buildSlotPrompt(params: {
  content: SlideText;
  artDirection?: ArtDirection | null;
  refineInstruction?: string;
}): string {
  const { content, artDirection, refineInstruction } = params;
  const subject = [content.title, content.body].filter((t) => t?.trim()).join(' — ');

  const lines: string[] = [
    'Gere APENAS uma fotografia/visual para ilustrar um slide de carrossel.',
    'PROIBIDO ABSOLUTO: nao inclua NENHUM texto, palavra, letra, numero, legenda, ' +
      'rotulo, logotipo, marca dagua, interface (UI), botao, balao de fala nem tipografia. ' +
      'Apenas imagem fotografica/ilustrativa limpa, sem qualquer caractere escrito.',
    `Tema/assunto a ilustrar visualmente: "${subject}". Use elementos concretos e ` +
      'diretamente relacionados a esse assunto (objetos, pessoas, ambiente, cena ou metafora visual pertinente).',
    'Composicao: sujeito principal CENTRALIZADO, com margem de seguranca nas bordas; ' +
      'nada importante encostado nas extremidades (pode haver um corte leve no encaixe). ' +
      'Area de respiro ao redor do foco.',
    '',
    PHOTO_DIRECTIVE,
  ];

  if (artDirection) {
    lines.push('');
    lines.push('Mantenha o MESMO estilo visual/iluminacao/paleta em todas as imagens deste carrossel:');
    lines.push(artDirectionToPromptBlock(artDirection));
  }

  if (refineInstruction?.trim()) {
    lines.push('');
    lines.push(`AJUSTE SOLICITADO (mantendo a regra de NAO incluir texto): ${refineInstruction.trim()}.`);
  }

  return lines.join('\n');
}
