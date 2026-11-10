/**
 * ── SÓ OS VALORES QUE A PÁGINA PEDE (10/11) ─────────────────────────────
 *
 * Eram dois números livres, só limitados a um intervalo: `b=0.4200001`,
 * `b=0.4200002`… davam cada um um desenho novo com o `sharp` e um ficheiro
 * novo no armazenamento — trabalho e espaço sem fim, a partir de uma ligação
 * que o casal pode reencaminhar. Agora cada valor cai no mais próximo da lista
 * do que a página realmente usa (`proposta-web/modelo.ts`, o `fundo(…)`): no
 * máximo 4 × 4 imagens por fotografia. Um teste prende as duas listas ao
 * modelo.
 */
export const BRILHOS_DO_FUNDO = [0.32, 0.38, 0.42, 0.62] as const;
export const ANGULOS_DO_FUNDO = [-24, -14, -10, -8] as const;
