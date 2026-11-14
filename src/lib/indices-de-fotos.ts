/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS CHAVES DE `app_state` QUE SÃO ÍNDICES — NOMEIAM FOTOS, NÃO AS USAM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As limpezas da noite (`juntar-fotos-duplicadas`, `limpar-pastas-orfas`,
 * `limpar-pdfs-substituidos`) só apagam uma fotografia que NINGUÉM mencione, e
 * procuram as menções em todas as tabelas, `app_state` incluída. Um índice
 * nomeia CADA fotografia guardada — se contasse como menção, nenhuma
 * limpeza voltava a apagar nada (achado da revisão de 13/11: as linhas
 * `foto-visual:*` bloqueavam as três).
 *
 * Uma lista só, para um índice novo não ter de ser lembrado em três sítios.
 */
export const PREFIXOS_DE_INDICE_DE_FOTOS = [
  /** `fotos-resumo.ts`: resumo exacto → caminhos. */
  "foto-resumo:",
  /** `fotos-parecidas.ts`: caminho → impressão visual. */
  "foto-visual:",
] as const;

/** Esta chave de `app_state` é um índice de fotografias (não é uma menção)? */
export function eChaveDeIndiceDeFotos(chave: unknown): boolean {
  const k = String(chave ?? "");
  return PREFIXOS_DE_INDICE_DE_FOTOS.some((p) => k.startsWith(p));
}
