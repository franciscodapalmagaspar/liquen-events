import "server-only";
import { createHash } from "node:crypto";
import { getSupabase } from "@/lib/supabase";
import { garantirBucketDeDerivadas } from "@/lib/theme-storage";
import { BUCKET_EDITORIAL } from "@/lib/fotos-editoriais-guardadas";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PÁGINA DO ESTÚDIO JÁ DESENHADA, GUARDADA FORA DA MEMÓRIA (10/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela: «quero pagar muito pouco mas fazer tudo». A página real do estúdio
 * (`pagina-do-rascunho`) é a rota que mais processador gasta: 0,6–1,3 s por
 * página desenhada. Ao abrir uma proposta o estúdio prepara-as TODAS — e a
 * memória da função dura o que dura a instância. Abrir a mesma proposta no dia
 * seguinte, noutro computador, ou depois de o navegador ter esquecido as suas
 * (`GUARDADAS_MAX`), voltava a desenhar a proposta inteira, para chegar às
 * mesmas imagens.
 *
 * Agora cada página desenhada fica também no armazenamento. A instância nova
 * DESCARREGA-a (espera de rede, que a Vercel não cobra como processador).
 *
 * ── UMA POR PÁGINA, A ÚLTIMA ─────────────────────────────────────────────
 *
 * O caminho é o pedido, a língua, a página e a largura — NÃO o rascunho. Cada
 * página desenhada escreve por cima da anterior: guarda-se só a última versão
 * de cada página, e o armazenamento fica limitado ao número de páginas das
 * propostas (umas 100 KB cada), por mais que ela escreva. É exactamente a que
 * interessa: a última versão é a que ela vê quando volta a abrir.
 *
 * Para nunca servir uma página velha, o ficheiro começa pela impressão digital
 * do rascunho que a desenhou (32 bytes) e pelo número de páginas do PDF
 * (2 bytes); a imagem vem a seguir. Rascunho diferente → não serve.
 *
 * ── E NUNCA MAIS LENTA ──────────────────────────────────────────────────
 *
 * Ao escrever, o rascunho é sempre novo e a leitura nunca acerta. Por isso a
 * leitura tem um tecto ({@link ESPERA_MAXIMA_MS}): se o armazenamento não
 * responder a tempo, desenha-se como antes. Guardar corre depois de a resposta
 * sair (`after`). Nada aqui lança: se falhar, é o comportamento de antes.
 */
export const ESPERA_MAXIMA_MS = 250;

const CABECALHO = 34;

function caminho(quoteId: string, idioma: string, n: number, largura: number): string {
  const q = createHash("sha256").update(quoteId).digest("hex").slice(0, 24);
  return `paginas-do-rascunho/${q}/${idioma}-${n}-${largura}.bin`;
}

function impressao(chave: string): Buffer {
  return createHash("sha256").update(chave).digest();
}

/** Junta a impressão, o número de páginas e a imagem (exportado para os testes). */
export function embrulhar(chave: string, paginas: number | null, imagem: Buffer): Buffer {
  const cab = Buffer.alloc(CABECALHO);
  impressao(chave).copy(cab, 0);
  cab.writeUInt16BE(Math.max(0, Math.min(65535, paginas ?? 0)), 32);
  return Buffer.concat([cab, imagem]);
}

/** O contrário: a imagem e as páginas, ou `null` se é de outro rascunho. */
export function desembrulhar(
  chave: string,
  bytes: Buffer,
): { imagem: Buffer; paginas: number | null } | null {
  if (bytes.length <= CABECALHO) return null;
  if (!bytes.subarray(0, 32).equals(impressao(chave))) return null;
  const paginas = bytes.readUInt16BE(32);
  return { imagem: bytes.subarray(CABECALHO), paginas: paginas || null };
}

/** A página guardada deste rascunho, ou `null` (não há, é velha, ou demorou). */
export async function lerPaginaGuardada(
  quoteId: string,
  idioma: string,
  n: number,
  largura: number,
  chave: string,
): Promise<{ imagem: Buffer; paginas: number | null } | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const ler = (async () => {
    try {
      const { data } = await sb.storage
        .from(BUCKET_EDITORIAL)
        .download(caminho(quoteId, idioma, n, largura));
      return data ? desembrulhar(chave, Buffer.from(await data.arrayBuffer())) : null;
    } catch {
      return null;
    }
  })();
  let tempo: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<null>((r) => {
    tempo = setTimeout(() => r(null), ESPERA_MAXIMA_MS);
  });
  try {
    return await Promise.race([ler, limite]);
  } finally {
    clearTimeout(tempo);
  }
}

/** Guarda a página por cima da anterior. Nunca lança. */
export async function guardarPaginaDoRascunho(
  quoteId: string,
  idioma: string,
  n: number,
  largura: number,
  chave: string,
  paginas: number | null,
  imagem: Buffer,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    if (!(await garantirBucketDeDerivadas(BUCKET_EDITORIAL))) return;
    const { error } = await sb.storage
      .from(BUCKET_EDITORIAL)
      .upload(caminho(quoteId, idioma, n, largura), embrulhar(chave, paginas, imagem), {
        contentType: "application/octet-stream",
        upsert: true,
        cacheControl: "0",
      });
    if (error) log.warn("paginas-do-rascunho: não ficou guardada", { erro: error.message });
  } catch (e) {
    log.warn("paginas-do-rascunho: não ficou guardada", { erro: String(e) });
  }
}
