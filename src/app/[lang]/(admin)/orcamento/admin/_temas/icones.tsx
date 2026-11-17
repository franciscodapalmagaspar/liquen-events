"use client";

/**
 * Os ícones da Biblioteca de Temas.
 * (Saiu do topo do `Temas.tsx` na fase 8 de `docs/ESTRUTURA-DO-CODIGO.md`,
 * tal e qual.)
 */

export const PlusIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

export const FolderIcon = (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    aria-hidden="true"
  >
    <path
      d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
      strokeLinejoin="round"
    />
    <circle cx="9.5" cy="12.5" r="1.5" />
    <path d="m6 17 3.5-3 3 2.5L16 13l3 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ── OS ÍCONES DO MENU DO TEMA ───────────────────────────────────────────
   «Dentro de um grupo, ou todos têm ícone ou nenhum tem» (Parte 9.7). O menu
   já os tinha todos; os quatro itens novos da Fase 2 vêm no mesmo traço
   (15 px, 1,7) para os grupos não ficarem mistos. */
export const svgDoMenu = (filhos: React.ReactNode) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {filhos}
  </svg>
);
export const ICONE_ABRIR = svgDoMenu(
  <>
    <path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v3" />
    <path d="M13 19h7m0 0-3-3m3 3-3 3" />
    <path d="M20 14v-1M4 6v10a2 2 0 0 0 2 2h4" />
  </>,
);
/** Uma fotografia com um «+». */
export const ICONE_ADICIONAR = svgDoMenu(
  <>
    <path d="M13 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
    <path d="m4 16 4.5-4 3.5 3 2.5-2 5.5 4.5" />
    <path d="M19 2v6M16 5h6" />
  </>,
);
/** Um lápis. */
export const ICONE_RENOMEAR = svgDoMenu(
  <>
    <path d="M14.5 5.5 18.5 9.5" />
    <path d="M4 20l1-4.5L16 4.5a2.1 2.1 0 0 1 3 0l.5.5a2.1 2.1 0 0 1 0 3L8.5 19 4 20Z" />
  </>,
);
/** Uma fotografia com a estrela da capa. */
export const ICONE_CAPA = svgDoMenu(
  <>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <path d="m12 8.6 1.1 2.2 2.4.3-1.8 1.7.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.7 2.4-.3Z" />
  </>,
);

export const SearchIcon = (
  <svg
    className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/25"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" strokeLinecap="round" />
  </svg>
);
