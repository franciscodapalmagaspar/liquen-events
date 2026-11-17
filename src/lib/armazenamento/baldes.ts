/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUE BALDES PODEM SAIR DO SUPABASE PARA O VERCEL BLOB (16/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O Supabase gratuito tem 1 GB de ficheiros e ia em 913 MB. Os PDF das
 * propostas crescem ~100 MB por mês. O dono escolheu o Vercel Blob (store
 * PRIVADO), pago do crédito mensal do Pro que já tem — sem cartão novo.
 *
 * Só saem os ficheiros GRANDES e que não se refazem: os PDF guardados e os
 * ORIGINAIS das fotografias. As derivadas (médias, miniaturas, AVIF, capas,
 * fotos tratadas) ficam no Supabase: são pequenas, refazem-se num botão, e são
 * elas que o navegador lê quase sempre — tirá-las de lá era pôr cada visita a
 * gastar o crédito.
 *
 * Este ficheiro é puro (sem `server-only`) para os testes e o
 * `next.config.ts` o poderem ler.
 */

/** Os três que podem ir para o Blob. Qualquer outro passa direito ao Supabase. */
export const BALDES_DO_BLOB = ["proposal-pdfs", "theme-assets", "proposal-assets"] as const;
export type BaldeDoBlob = (typeof BALDES_DO_BLOB)[number];

export function ehBaldeDoBlob(nome: string): nome is BaldeDoBlob {
  return (BALDES_DO_BLOB as readonly string[]).includes(nome);
}

/**
 * Onde vive cada balde, guardado em `app_state` (ver `modos.ts`):
 *  - `supabase` — como sempre (a omissão, e o que vale sem o token);
 *  - `espelho`  — escreve nos DOIS, lê do Supabase. É a fase de ensaio: o Blob
 *                 enche-se sem que nada dependa dele;
 *  - `blob`     — escreve e lê no Blob; uma leitura que lá não encontre o
 *                 ficheiro volta ao Supabase (nunca se perde uma foto a meio da
 *                 migração), e uma escrita que o Blob recuse vai para o
 *                 Supabase (nunca se perde uma foto por causa de um tecto).
 */
export type ModoDoBalde = "supabase" | "espelho" | "blob";
export const MODOS: readonly ModoDoBalde[] = ["supabase", "espelho", "blob"];

export function ehModo(v: unknown): v is ModoDoBalde {
  return typeof v === "string" && (MODOS as readonly string[]).includes(v);
}

/** A linha de `app_state` com o modo de cada balde. */
export const CHAVE_DOS_MODOS = "armazenamento-blob";

/**
 * O Blob está configurado? Só com o token de leitura e escrita que a Vercel
 * cria sozinha quando o store é ligado ao projecto. Sem ele, NADA muda: o
 * `balde()` devolve o balde do Supabase tal e qual.
 */
export function blobConfigurado(env: Record<string, string | undefined> = process.env): boolean {
  const t = env.BLOB_READ_WRITE_TOKEN;
  return typeof t === "string" && t.trim().length > 0;
}

/**
 * O identificador do store, tirado do token (`vercel_blob_rw_<loja>_<segredo>`
 * — é o que o próprio SDK faz). O identificador NÃO é segredo: vai em todos os
 * endereços do store. O resto do token nunca sai desta função.
 */
export function idDaLoja(env: Record<string, string | undefined> = process.env): string | null {
  const t = env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!t) return null;
  const loja = t.split("_")[3] ?? "";
  return /^[A-Za-z0-9]{4,64}$/.test(loja) ? loja : null;
}

/** A origem dos ficheiros privados do store, para a CSP. `null` sem token. */
export function origemDoBlob(env: Record<string, string | undefined> = process.env): string | null {
  const loja = idDaLoja(env);
  return loja ? `https://${loja.toLowerCase()}.private.blob.vercel-storage.com` : null;
}

/**
 * Um caminho que se aceita como chave. O mesmo que o Supabase aceitaria de nós:
 * relativo, sem `..`, sem barras duplas, sem caracteres de controlo.
 */
export function caminhoValido(c: unknown): c is string {
  if (typeof c !== "string" || c.length === 0 || c.length > 512) return false;
  if (c.startsWith("/") || c.endsWith("/") || c.includes("//")) return false;
  if (/[\u0000-\u001f\\?#]/.test(c)) return false;
  return !c.split("/").some((p) => p === "." || p === "..");
}

/** A chave no Blob: o nome do balde do Supabase passa a prefixo. */
export function chaveNoBlob(balde: BaldeDoBlob, caminho: string): string {
  return `${balde}/${caminho}`;
}
