import "server-only";
import { log } from "@/lib/logger";
import { idDaLoja } from "./baldes";
import { registar, travao } from "./uso";
import type { Recusa } from "./tectos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O VERCEL BLOB, EM POUCAS PORTAS — cada uma com o travão à frente
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Tudo o que fala com o Blob passa por aqui, e cada porta:
 *  1. pergunta ao contador se a operação cabe no tecto (`uso.ts`);
 *  2. faz a operação, com um tecto de tempo (o SDK repete sozinho 10 vezes
 *     com espera, o que numa função da Vercel podia passar do limite);
 *  3. soma o que gastou.
 *
 * O TOKEN NUNCA SAI DAQUI: os erros que se devolvem e registam são frases
 * nossas, sem a mensagem crua do SDK (que pode trazer o endereço com a
 * assinatura). O store é PRIVADO: todas as escritas levam `access: "private"`.
 */

/**
 * O SDK só se carrega quando se fala mesmo com o Blob (revisão de 17/11,
 * n.º 12): sem o token, nenhuma destas portas é chamada e o `@vercel/blob`
 * (e o `undici` que ele traz) não pesa no arranque de nenhuma função.
 */
let oSdk: Promise<typeof import("@vercel/blob")> | null = null;
function sdk(): Promise<typeof import("@vercel/blob")> {
  oSdk ??= import("@vercel/blob");
  return oSdk;
}

export class BlobRecusado extends Error {
  constructor(readonly motivo: Recusa) {
    super(`O Blob recusou pelo tecto (${motivo}).`);
    this.name = "BlobRecusado";
  }
}

/** Uma avaria do Blob, sem nada do pedido lá dentro. */
export class BlobAvariado extends Error {
  constructor(
    readonly operacao: string,
    readonly codigo: "nao-existe" | "ja-existe" | "avaria",
  ) {
    super(
      codigo === "nao-existe"
        ? "O ficheiro não existe no Blob."
        : codigo === "ja-existe"
          ? "O ficheiro já existe no Blob."
          : `O Blob falhou (${operacao}).`,
    );
    this.name = "BlobAvariado";
  }
}

const TEMPO_MS = 25_000;

function token(): string {
  const t = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!t) throw new BlobAvariado("configuracao", "avaria");
  return t;
}

/** Traduz um erro do SDK para um dos nossos, sem copiar a mensagem dele. */
function traduzir(operacao: string, e: unknown): BlobAvariado {
  const nome = (e as { name?: unknown })?.name;
  const msg = String((e as { message?: unknown })?.message ?? "");
  if (nome === "BlobNotFoundError" || /not.?found/i.test(msg))
    return new BlobAvariado(operacao, "nao-existe");
  if (/already exists/i.test(msg)) return new BlobAvariado(operacao, "ja-existe");
  // Só o NOME da classe vai para os registos — a mensagem pode trazer endereços.
  log.warn("blob: operação falhou", { operacao, erro: typeof nome === "string" ? nome : "?" });
  return new BlobAvariado(operacao, "avaria");
}

async function comTravao<T>(
  gasto: Parameters<typeof travao>[0],
  operacao: string,
  fazer: () => Promise<T>,
): Promise<T> {
  const recusa = await travao(gasto);
  if (recusa) throw new BlobRecusado(recusa);
  let r: T;
  try {
    r = await fazer();
  } catch (e) {
    if (e instanceof BlobAvariado || e instanceof BlobRecusado) throw e;
    throw traduzir(operacao, e);
  }
  await registar(gasto);
  return r;
}

/**
 * Guarda bytes. `sobrescrever: false` recusa se já lá estiver (o mesmo
 * `upsert: false` do Supabase). Uma operação avançada.
 */
export async function porNoBlob(
  chave: string,
  bytes: Uint8Array,
  opcoes: { contentType?: string; sobrescrever: boolean; cacheSegundos?: number },
): Promise<{ etag: string | null }> {
  return comTravao({ avancadas: 1, bytes: bytes.byteLength }, "put", async () => {
    const r = await (
      await sdk()
    ).put(chave, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
      access: "private",
      token: token(),
      addRandomSuffix: false,
      allowOverwrite: opcoes.sobrescrever,
      contentType: opcoes.contentType,
      // O mínimo do Blob é um minuto; o resto, como o Supabase o tinha.
      cacheControlMaxAge:
        opcoes.cacheSegundos && opcoes.cacheSegundos >= 60 ? opcoes.cacheSegundos : undefined,
      abortSignal: AbortSignal.timeout(TEMPO_MS),
    });
    return { etag: r.etag ?? null };
  });
}

/** Os metadados, sem os bytes. `null` se não existe. Uma operação simples. */
export async function cabecalhoNoBlob(
  chave: string,
): Promise<{ tamanho: number; tipo: string; etag: string | null } | null> {
  try {
    return await comTravao({ simples: 1 }, "head", async () => {
      const r = await (
        await sdk()
      ).head(chave, { token: token(), abortSignal: AbortSignal.timeout(TEMPO_MS) });
      return { tamanho: r.size, tipo: r.contentType, etag: r.etag ?? null };
    });
  } catch (e) {
    if (e instanceof BlobAvariado && e.codigo === "nao-existe") return null;
    throw e;
  }
}

/** Apaga (de graça no Blob). Devolve os bytes que deixaram de contar. */
export async function apagarDoBlob(chaves: readonly string[], bytesQueSaem = 0): Promise<void> {
  if (chaves.length === 0) return;
  try {
    for (let i = 0; i < chaves.length; i += 100) {
      await (
        await sdk()
      ).del(chaves.slice(i, i + 100), {
        token: token(),
        abortSignal: AbortSignal.timeout(TEMPO_MS),
      });
    }
  } catch (e) {
    throw traduzir("del", e);
  }
  await registar({ bytes: -Math.max(0, bytesQueSaem) });
}

/** Copia dentro do Blob. Uma operação avançada. */
export async function copiarNoBlob(
  de: string,
  para: string,
  opcoes: { tamanho: number; sobrescrever: boolean; contentType?: string; cacheSegundos?: number },
): Promise<void> {
  await comTravao({ avancadas: 1, bytes: opcoes.tamanho }, "copy", async () => {
    await (
      await sdk()
    ).copy(de, para, {
      access: "private",
      token: token(),
      addRandomSuffix: false,
      allowOverwrite: opcoes.sobrescrever,
      contentType: opcoes.contentType,
      // O mesmo `Cache-Control` do original (revisão de 17/11, n.º 9).
      cacheControlMaxAge:
        opcoes.cacheSegundos && opcoes.cacheSegundos >= 60 ? opcoes.cacheSegundos : undefined,
      abortSignal: AbortSignal.timeout(TEMPO_MS),
    });
  });
}

/** O endereço privado de um ficheiro (sem assinatura: só abre com o token). */
function enderecoPrivado(chave: string): string {
  const loja = idDaLoja();
  if (!loja) throw new BlobAvariado("configuracao", "avaria");
  return `https://${loja}.private.blob.vercel-storage.com/${chave.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Lê do Blob pelo servidor, com `Range` e validadores repassados, e devolve a
 * `Response` crua para quem a quiser passar em fluxo (o PDF). `null` = não
 * existe. Uma operação simples e a transferência do que vier.
 *
 * Conta-se ANTES de ler, com o tamanho que se espera (`tamanhoPrevisto`), para
 * o travão poder parar a leitura; o que se soma depois é o `content-length` real.
 */
export async function lerRespostaDoBlob(
  chave: string,
  cabecalhos: Record<string, string> = {},
  tamanhoPrevisto = 0,
): Promise<Response | null> {
  // Tamanho desconhecido conta 1 byte na pergunta: com o tecto já passado,
  // recusa (revisão de 17/11, n.º 4) — sem isto, uma leitura sem tamanho
  // passava sempre, mesmo com a transferência do mês esgotada.
  const recusa = await travao({ simples: 1, transferencia: Math.max(1, tamanhoPrevisto) });
  if (recusa) throw new BlobRecusado(recusa);
  let res: Response;
  // O tecto de tempo vale até chegarem os CABEÇALHOS: um PDF a correr para um
  // telemóvel lento pode demorar mais, e cortá-lo a meio era um ficheiro partido.
  const corte = new AbortController();
  const relogio = setTimeout(() => corte.abort(), TEMPO_MS);
  try {
    res = await fetch(enderecoPrivado(chave), {
      headers: { ...cabecalhos, Authorization: `Bearer ${token()}` },
      cache: "no-store",
      signal: corte.signal,
    });
  } catch (e) {
    throw traduzir("get", e);
  } finally {
    clearTimeout(relogio);
  }
  if (res.status === 404 || (!res.ok && res.status !== 206 && res.status !== 304)) {
    await registar({ simples: 1 });
    if (res.status === 404) return null;
    log.warn("blob: leitura respondeu mal", { estado: res.status });
    throw new BlobAvariado("get", "avaria");
  }
  /**
   * A transferência conta-se EXACTA: o `content-length` quando o Blob o dá;
   * senão, os bytes contados à medida que passam, somados no fim do fluxo
   * (ou quando quem lê desiste a meio).
   */
  const declarado = Number(res.headers.get("content-length"));
  if (res.headers.has("content-length") && Number.isFinite(declarado)) {
    await registar({ simples: 1, transferencia: declarado });
    return res;
  }
  await registar({ simples: 1 });
  if (!res.body) return res;
  let contados = 0;
  let somado = false;
  const somar = () => {
    if (somado) return;
    somado = true;
    void registar({ transferencia: contados });
  };
  const contador = new TransformStream<Uint8Array, Uint8Array>({
    transform(pedaco, c) {
      contados += pedaco.byteLength;
      c.enqueue(pedaco);
    },
    flush: somar,
    // `cancel` (quem lê desistiu a meio) ainda não está nos tipos do TS.
    cancel: somar,
  } as Transformer<Uint8Array, Uint8Array>);
  return new Response(res.body.pipeThrough(contador), {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}

/** Lê os bytes todos. `null` = não existe. */
export async function lerDoBlob(
  chave: string,
  tamanhoPrevisto = 0,
): Promise<{ bytes: Uint8Array; tipo: string } | null> {
  const res = await lerRespostaDoBlob(chave, {}, tamanhoPrevisto);
  if (!res) return null;
  try {
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      tipo: res.headers.get("content-type") ?? "application/octet-stream",
    };
  } catch (e) {
    throw traduzir("get", e);
  }
}

/**
 * ── O ENDEREÇO ASSINADO PARA O NAVEGADOR ──────────────────────────────────
 *
 * O testemunho de assinatura (`issueSignedToken`) é UMA ida à API e serve para
 * assinar qualquer ficheiro do store até expirar (no máximo 7 dias). Guarda-se
 * em memória e assina-se localmente (HMAC, sem rede) — o próprio guia da
 * Vercel manda fazer assim. Conta-se como operação avançada, por prudência.
 *
 * O endereço resultante é servido pela rede da Vercel DIRECTAMENTE ao
 * navegador: os bytes não passam por função nenhuma (Blob Data Transfer, a
 * tarifa mais barata), que é o que o dono pediu para as fotografias.
 */
let testemunho: { delegationToken: string; clientSigningToken: string; validUntil: number } | null =
  null;
const VIDA_DO_TESTEMUNHO_MS = 6 * 24 * 3600_000;
/** Um endereço não pode durar mais do que o testemunho que o assinou. */
export const MAX_VALIDADE_MS = 24 * 3600_000;

async function testemunhoValido(): Promise<NonNullable<typeof testemunho>> {
  if (testemunho && testemunho.validUntil - Date.now() > MAX_VALIDADE_MS + 60_000)
    return testemunho;
  testemunho = await comTravao({ avancadas: 1 }, "signed-token", async () =>
    (await sdk()).issueSignedToken({
      token: token(),
      pathname: "*",
      operations: ["get"],
      validUntil: Date.now() + VIDA_DO_TESTEMUNHO_MS,
      abortSignal: AbortSignal.timeout(TEMPO_MS),
    }),
  );
  return testemunho;
}

/**
 * Um endereço de leitura com prazo, direto ao Blob. Cada endereço passa pelo
 * travão e conta uma operação simples e o ficheiro inteiro — o pior caso, mas
 * a medida verdadeira: a Vercel cobra cada entrega (2.ª revisão de 17/11,
 * n.º 1). Nunca se guarda um para outro pedido.
 */
export async function urlDeLeituraDoBlob(
  chave: string,
  validoAteMs: number,
  tamanho: number,
): Promise<string> {
  const t = await testemunhoValido();
  return comTravao({ simples: 1, transferencia: Math.max(1, tamanho) }, "presign", async () => {
    const { presignedUrl } = await (
      await sdk()
    ).presignUrl(t, {
      operation: "get",
      pathname: chave,
      access: "private",
      validUntil: Math.min(validoAteMs, Date.now() + MAX_VALIDADE_MS),
    });
    return presignedUrl;
  });
}

/** Só para os testes. */
export function esquecerTestemunho(): void {
  testemunho = null;
}
