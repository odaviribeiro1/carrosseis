import { describe, it, expect } from 'vitest';
import {
  stableStringify,
  computeArtHash,
  parseJsonStrict,
  artDirectionToPromptBlock,
  type ArtDirection,
} from './artDirection';

const baseInputs = {
  visualSettings: {
    imageStyle: 'realista',
    colorPalette: ['#1E3A5F', '#3B82F6', '#94A3B8', '#F8FAFC', '#0F1223'],
    aspectRatio: '4:5',
    imagePrompt: '',
    resolution: 'standard',
  },
  referenceImagesKey: '2:1024,2048',
};

describe('stableStringify', () => {
  it('produz a mesma string independente da ordem das chaves', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it('preserva a ordem dos arrays', () => {
    expect(stableStringify([1, 2, 3])).not.toBe(stableStringify([3, 2, 1]));
  });
});

describe('computeArtHash', () => {
  it('e deterministico: mesmas entradas -> mesmo hash', async () => {
    const h1 = await computeArtHash(baseInputs);
    const h2 = await computeArtHash(baseInputs);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('ignora a ordem das chaves das entradas', async () => {
    const reordered = {
      referenceImagesKey: baseInputs.referenceImagesKey,
      visualSettings: baseInputs.visualSettings,
    };
    expect(await computeArtHash(reordered)).toBe(await computeArtHash(baseInputs));
  });

  it('muda quando a paleta muda', async () => {
    const changed = {
      ...baseInputs,
      visualSettings: {
        ...baseInputs.visualSettings,
        colorPalette: ['#000000', '#111111', '#222222', '#333333', '#444444'],
      },
    };
    expect(await computeArtHash(changed)).not.toBe(await computeArtHash(baseInputs));
  });

  it('muda quando o estilo muda', async () => {
    const changed = {
      ...baseInputs,
      visualSettings: { ...baseInputs.visualSettings, imageStyle: 'minimalista' },
    };
    expect(await computeArtHash(changed)).not.toBe(await computeArtHash(baseInputs));
  });

  it('muda quando as imagens de referencia mudam', async () => {
    const changed = { ...baseInputs, referenceImagesKey: '1:512' };
    expect(await computeArtHash(changed)).not.toBe(await computeArtHash(baseInputs));
  });
});

describe('parseJsonStrict', () => {
  it('faz parse de JSON valido', () => {
    expect(parseJsonStrict<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('tolera fences de markdown', () => {
    expect(parseJsonStrict('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('lanca em JSON malformado (gatilho de reprocesso)', () => {
    expect(() => parseJsonStrict('isto nao e json')).toThrow();
    expect(() => parseJsonStrict('')).toThrow();
  });
});

describe('artDirectionToPromptBlock', () => {
  it('inclui estilo, fundo e tipografia no bloco', () => {
    const art: ArtDirection = {
      palette: { primary: '#1', secondary: '#2', accent: '#3', background: '#4', text: '#5' },
      visualStyle: 'editorial minimalista',
      backgroundTreatment: 'gradiente suave',
      lighting: 'luz lateral',
      composition: 'titulo no topo',
      typography: { heading: 'Poppins bold', body: 'Inter', treatment: 'caixa alta' },
      motifs: ['linhas finas'],
    };
    const block = artDirectionToPromptBlock(art);
    expect(block).toContain('editorial minimalista');
    expect(block).toContain('gradiente suave');
    expect(block).toContain('Poppins bold');
    expect(block).toContain('linhas finas');
  });
});
