import { makePostX } from './post-x';

// "Post do X Dark" — mesma estrutura social do Post do X, tema escuro (X dark).
export const postXDark = makePostX(
  'post-x-dark',
  'Post do X Dark',
  { bg: '#000000', surface: '#16181C', text: '#E7E9EA', textMuted: '#71767B', accent: '#1D9BF0' },
  '0 10px 40px rgba(29,155,240,0.28)',
);
