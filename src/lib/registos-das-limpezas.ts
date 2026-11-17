/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS REGISTOS DAS LIMPEZAS DA NOITE — NOMEIAM FOTOS, NÃO AS USAM (17/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As limpezas guardam o seu próprio caderno em `app_state`: a lista de espera
 * das pastas órfãs, e o plano da junção dos duplicados (o que saiu, para onde
 * apontam agora os rascunhos, durante 60 dias). Esse caderno nomeia caminhos
 * de fotografias — mas é a limpeza a lembrar-se do que fez, não alguém a usar
 * a fotografia.
 *
 * Medido em produção a 17/11: duas pastas de pedidos apagados (52 + 4 MB de
 * originais, 68 MB com as derivadas) nunca chegavam à lista de espera de
 * `limpar-pastas-orfas`. A única «menção» era o `feitos` da junção — as cópias
 * que ela própria já tinha tirado de DENTRO dessas pastas.
 *
 * Irmã de `indices-de-fotos.ts` (os índices também nomeiam sem usar). Uma lista
 * só, para um registo novo não ter de ser lembrado em cada limpeza.
 */

/** `limpar-pastas-orfas.ts`: pasta → quando foi vista candidata. */
export const CHAVE_DAS_PASTAS_ORFAS = "limpeza:pastas-de-pedidos-apagados";

/** `juntar-fotos-duplicadas.ts`: o plano, as trocas e as cópias que já saíram. */
export const CHAVE_DOS_DUPLICADOS = "limpeza:fotos-duplicadas";

export const REGISTOS_DAS_LIMPEZAS = [CHAVE_DAS_PASTAS_ORFAS, CHAVE_DOS_DUPLICADOS] as const;

/** Esta chave de `app_state` é o caderno de uma limpeza (não é uma menção)? */
export function eRegistoDeLimpeza(chave: unknown): boolean {
  return (REGISTOS_DAS_LIMPEZAS as readonly string[]).includes(String(chave ?? ""));
}
