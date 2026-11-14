/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE NENHUMA LIMPEZA DA NOITE PODE APAGAR — UMA LISTA SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O arquivo desmontado (`docs/ARQUIVO-DE-PDFS.md`, fase 2) guarda cada imagem
 * UMA vez, partilhada por todos os PDF que a usam. Uma imagem que se perca
 * estraga TODOS os esqueletos que a citam — e a fase 3 vai servir PDFs a
 * partir delas. Por isso nenhuma limpeza lhes toca enquanto houver um esqueleto
 * que as cite; e, como saber isso exige ler os esqueletos todos, a regra de
 * hoje é mais forte: o arquivo inteiro é intocável pelas limpezas. Quando um
 * dia se quiser libertar uma imagem, é uma tarefa PRÓPRIA que lê os esqueletos
 * (`imagensCitadasPor`, em `desmontar.ts`), com a autorização dele.
 *
 * É a mesma ideia de `indices-de-fotos.ts`: uma lista, para uma limpeza nova
 * não ter de se lembrar disto. Cada limpeza da noite passa os caminhos que vai
 * apagar por {@link semProtegidos} — e um teste prende que todas o fazem.
 *
 * Sem `server-only`: é uma lista e duas funções puras.
 */

/** O bucket do arquivo desmontado (privado). Criado à mão, no Supabase. */
export const BUCKET_DO_ARQUIVO = "proposal-pdfs-arquivo";
/** As imagens, pelo resumo: `img/<sha256>.jpg`. */
export const PASTA_DAS_IMAGENS = "img/";
/** Os esqueletos: `esq/<proposta>__<chave>.gz`. */
export const PASTA_DOS_ESQUELETOS = "esq/";

export const PREFIXOS_PROTEGIDOS: readonly { bucket: string; prefixo: string }[] = [
  { bucket: BUCKET_DO_ARQUIVO, prefixo: PASTA_DAS_IMAGENS },
  { bucket: BUCKET_DO_ARQUIVO, prefixo: PASTA_DOS_ESQUELETOS },
];

/** Este caminho, neste bucket, está protegido das limpezas? */
export function eCaminhoProtegido(bucket: string, caminho: string): boolean {
  const c = caminho.replace(/^\/+/, "");
  return PREFIXOS_PROTEGIDOS.some((p) => p.bucket === bucket && c.startsWith(p.prefixo));
}

/** Os caminhos que uma limpeza pode mesmo apagar (sem os protegidos). */
export function semProtegidos(bucket: string, caminhos: readonly string[]): string[] {
  return caminhos.filter((c) => !eCaminhoProtegido(bucket, c));
}
