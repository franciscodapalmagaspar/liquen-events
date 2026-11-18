import { ESPACOS, chavesDosEspacos } from "@/lib/app-state/espacos";

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
 * Uma lista só, para um índice novo não ter de ser lembrado em três sítios — e
 * derivada do registo dos espaços do `app_state` (`app-state/espacos.ts`).
 */
export const PREFIXOS_DE_INDICE_DE_FOTOS: readonly string[] = chavesDosEspacos(
  // `foto-resumo:` (resumo exacto → caminhos), `foto-visual:` (caminho →
  // impressão visual) e `blob:i:` (o que está no Vercel Blob, uma linha por
  // ficheiro: contá-la como menção travava as três limpezas — revisão de
  // 17/11, n.º 3). Quem é índice di-lo o registo dos espaços.
  (e) => e.indiceDeFotos === true,
);

/** O prefixo do índice do Vercel Blob (`armazenamento/indice.ts`), à parte para quem só o quer a ele. */
export const PREFIXO_DO_INDICE_DO_BLOB = ESPACOS.indiceDoBlob.chave;

/** Esta chave de `app_state` é um índice de fotografias (não é uma menção)? */
export function eChaveDeIndiceDeFotos(chave: unknown): boolean {
  const k = String(chave ?? "");
  return PREFIXOS_DE_INDICE_DE_FOTOS.some((p) => k.startsWith(p));
}
