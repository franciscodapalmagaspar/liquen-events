import "server-only";
import { oSharp } from "./sharp-adiado";
import { opcoesDeCarregamento } from "./cache-das-fotos";
import { randomUUID } from "node:crypto";
import { getSupabase } from "./supabase";
import { THEME_BUCKET, THEME_THUMB_BUCKET, caminhoDoRefDeTema, ehRefDeTema } from "./theme-ref";
import { log } from "./logger";
/**
 * As assinaturas vivem noutro ficheiro, e a seta aponta só neste sentido — o
 * porquê está por extenso no `proposal-assinaturas.ts`. Em duas linhas: a
 * página que o casal abre só precisa das assinaturas, e enquanto elas
 * estivessem aqui ela levava consigo o `sharp` que este ficheiro usa para
 * confirmar carregamentos, e nunca chama.
 */
import {
  PROPOSAL_AVIF_MID_BUCKET,
  PROPOSAL_BUCKET,
  PROPOSAL_MID_BUCKET,
  PROPOSAL_THUMB_BUCKET,
  SIGNED_TTL,
  assinarLote,
  chaveDaCapaWeb,
  signProposalThumbs,
} from "./proposal-assinaturas";

/** Quem já os importava daqui continua a poder — mudou a casa, não a porta. */
export {
  PROPOSAL_AVIF_MID_BUCKET,
  PROPOSAL_BUCKET,
  PROPOSAL_MID_BUCKET,
  PROPOSAL_THUMB_BUCKET,
  signProposalMids,
  signProposalMidsAvif,
  signProposalPaths,
} from "./proposal-assinaturas";
export { signProposalThumbs };

/**
 * Storage for proposal mood-board / cover images, backed by a private Supabase
 * Storage bucket. Uploads return a stable `path` (persisted on the proposal so
 * it can be re-edited) plus a long-lived signed `url` for the admin preview.
 * The PDF generator never touches Storage directly — the generate route resolves
 * every path to bytes via `fetchProposalImageBytes` before rendering, keeping
 * the generator storage-agnostic.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. The bucket is created on
 * first use (idempotent), so no manual Supabase setup step is needed.
 */

let bucketReady = false;

/**
 * Limites gravados NO PRÓPRIO BUCKET (não só na rota).
 *
 * Enquanto todos os bytes passavam por uma função nossa, era a rota que
 * recusava um ficheiro grande ou de formato errado. Com carregamento DIRETO
 * (ver `createProposalUploadTickets`) o navegador escreve no Storage sem nos
 * passar pela frente — e então o único sítio onde uma regra ainda se aplica é
 * o bucket. É isto que limita o estrago de um URL de carregamento roubado: com
 * ele não se consegue escrever um executável, nem um ficheiro de 2 GB.
 */
export const UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
/**
 * ── O QUE UM BUCKET DE DERIVADAS ACEITA ──────────────────────────────────
 *
 * Outra lista, e não a de cima. A de cima é uma medida de SEGURANÇA: limita o
 * que uma pessoa consegue escrever com um bilhete de carregamento, e alargá-la
 * alarga essa porta. As derivadas não vêm de fora — são fabricadas aqui — e o
 * que precisam é de aceitar o que nós produzimos.
 *
 * Sem `image/avif` nesta lista, o bucket recusaria os AVIF e a geração falhava
 * em silêncio: o contador diria «geradas 0» sem dizer porquê. Ficam também os
 * dois anteriores, porque os buckets já existentes têm derivadas JPEG lá dentro
 * e continuam a ter de as poder substituir.
 */
export const DERIVADA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
export const BUCKET_FILE_SIZE_LIMIT = 12 * 1024 * 1024; // 12 MB, como a rota

/**
 * Aplica os limites acima a um bucket que já existia (instalações anteriores a
 * esta mudança foram criadas sem eles). Melhor esforço declarado: um Storage
 * antigo pode nem ter `updateBucket`, e não conseguir apertar os limites não
 * pode deitar abaixo um carregamento — apenas deixa o bucket como estava, que
 * é exatamente o que é hoje.
 */
async function hardenBucket(bucket: string): Promise<void> {
  const sb = getSupabase();
  const update = sb?.storage?.updateBucket;
  if (!sb || typeof update !== "function") return;
  try {
    const { error } = await sb.storage.updateBucket(bucket, {
      public: false,
      fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
      allowedMimeTypes: UPLOAD_MIME_TYPES,
    });
    if (error)
      log.warn("storage: limites do bucket não aplicados", { bucket, erro: error.message });
  } catch (e) {
    log.warn("storage: limites do bucket não aplicados", { bucket, erro: String(e) });
  }
}

/**
 * Exported so the theme→proposal copy (`copyThemeImageToProposal`) can make
 * sure the destination bucket exists once per batch before Storage copies
 * into it — that path never calls `uploadProposalImage`, so nothing else
 * would create it.
 */
export async function ensureBucket(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  if (bucketReady) return true;
  const { data } = await sb.storage.getBucket(PROPOSAL_BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(PROPOSAL_BUCKET, {
      public: false,
      fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
      allowedMimeTypes: UPLOAD_MIME_TYPES,
    });
    // Ignore "already exists" races; surface anything else.
    if (error && !/exist/i.test(error.message)) {
      log.error("proposal-storage: createBucket falhou", error);
      return false;
    }
  } else {
    // Já existia: aperta os limites uma vez por processo, sem bloquear nada.
    await hardenBucket(PROPOSAL_BUCKET);
  }
  bucketReady = true;
  return true;
}

/**
 * Validade de um bilhete de carregamento. NÃO é uma escolha nossa: o Supabase
 * emite estes tokens com 2 horas fixas e não expõe parâmetro para encurtar.
 * Está aqui declarado para que o número apareça na resposta da rota (e no
 * relatório de segurança) em vez de ficar implícito.
 */
export const UPLOAD_TICKET_TTL = 60 * 60 * 2;

/** Teto de bilhetes por pedido — ver `createProposalUploadTickets`. */
export const MAX_UPLOAD_TICKETS = 24;

/** Um bilhete: UM caminho, construído no servidor, e o token que o abre. */
export interface UploadTicket {
  /** O caminho dentro do bucket. É o que o cliente devolve na confirmação. */
  path: string;
  /** URL completo de escrita (PUT direto), já com o token. */
  uploadUrl: string;
  /** O mesmo token à parte, para quem use `uploadToSignedUrl` do supabase-js. */
  token: string;
}

/**
 * O Storage sabe emitir URLs de carregamento? Um Supabase mais antigo (ou um
 * duplo de teste) pode não ter esta API — e nesse caso a resposta certa é
 * "não", para a rota mandar o cliente pelo caminho multipart de sempre.
 */
function canMintUploadUrls(sb: NonNullable<ReturnType<typeof getSupabase>>): boolean {
  return typeof sb.storage.from(PROPOSAL_BUCKET).createSignedUploadUrl === "function";
}

/**
 * Emite bilhetes de carregamento DIRETO para a pasta de um pedido.
 *
 * O caminho é construído aqui, no servidor — `<quoteId>/<uuid>.<ext>` —, nunca
 * aceite do cliente: é a mesma regra que `uploadProposalImage` já seguia, e é
 * ela que garante que um cliente não consegue escrever na pasta de outro
 * pedido. O cliente só recebe um URL que abre EXATAMENTE esse caminho.
 *
 * `upsert` fica em `false` de propósito: o bilhete cria um objeto novo num
 * caminho aleatório que mais ninguém conhece e não consegue substituir nada
 * que já lá esteja.
 *
 * Devolve `null` quando o Storage não sabe emitir estes URLs — a rota traduz
 * isso em "usa o multipart", e nada quebra.
 */
export async function createProposalUploadTickets(
  quoteId: string,
  contentTypes: readonly string[],
): Promise<UploadTicket[] | null> {
  const sb = getSupabase();
  if (!sb || !(await ensureBucket())) return null;
  if (!canMintUploadUrls(sb)) return null;
  const safeId = quoteId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) return null;
  const wanted = contentTypes.slice(0, MAX_UPLOAD_TICKETS);
  if (wanted.length === 0) return [];

  try {
    const tickets = await Promise.all(
      wanted.map(async (type) => {
        const path = `${safeId}/${randomUUID()}.${extFor(type)}`;
        const { data, error } = await sb.storage
          .from(PROPOSAL_BUCKET)
          .createSignedUploadUrl(path, { upsert: false });
        if (error || !data) return null;
        return { path, uploadUrl: data.signedUrl, token: data.token };
      }),
    );
    // Ou se emitem todos, ou nenhum: meia dúzia de bilhetes com buracos punha
    // o cliente a adivinhar quais podia usar.
    if (tickets.some((t) => t === null)) return null;
    return tickets as UploadTicket[];
  } catch (e) {
    log.error("proposal-storage: emissão de URLs de carregamento falhou", e, { quoteId });
    return null;
  }
}

/**
 * Quantos bytes bastam para ler o CABEÇALHO de uma imagem. O IHDR de um PNG
 * está nos primeiros 33 bytes, o VP8X de um WEBP nos primeiros 30, e o SOF de
 * um JPEG normal aparece bem dentro dos primeiros KB. 256 KB é folga a mais
 * sem deixar de ser desprezável ao pé dos 3 MB da foto.
 */
const HEADER_BYTES = 256 * 1024;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM REDIRECCIONAMENTO NÃO PODE FAZER UMA FOTO DESAPARECER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os pedidos ao armazenamento iam com `redirect: "error"`. É uma boa defesa —
 * é o que impede um endereço aparentemente inofensivo de nos levar a um sítio
 * interno — mas é uma defesa cega: se o armazenamento responder «isto agora
 * está noutro sítio» (uma rede de distribuição à frente, uma rota assinada que
 * muda de forma), o `fetch` lança, a foto conta como em falta, e não fica nada
 * escrito a dizer porquê. A proposta sai com um buraco e o registo está mudo.
 *
 * Passa a SEGUIR o redireccionamento, com a mesma guarda a cada salto: só
 * `https`, e só para o mesmo anfitrião que já era o único permitido. Um desvio
 * para outro lado continua a ser recusado — mas agora fica REGISTADO, com o
 * destino, que é a diferença entre uma defesa e um mistério.
 */
const MAX_SALTOS = 3;

async function fetchSeguindoRedireccoes(
  url: string,
  init: RequestInit,
  permitido: string | null,
): Promise<Response | null> {
  let alvo = url;
  for (let salto = 0; salto <= MAX_SALTOS; salto++) {
    const res = await fetch(alvo, { ...init, redirect: "manual" });
    if (res.status < 300 || res.status >= 400) return res;
    const destino = res.headers.get("location");
    if (!destino) return res;
    let seguinte: URL;
    try {
      seguinte = new URL(destino, alvo);
    } catch {
      log.warn("storage: redireccionamento com destino ilegível", { de: alvo });
      return null;
    }
    if (seguinte.protocol !== "https:" || !permitido || seguinte.host !== permitido) {
      log.error("storage: redireccionamento para fora do anfitrião permitido (SSRF guard)", null, {
        host: seguinte.host,
      });
      return null;
    }
    alvo = seguinte.toString();
  }
  log.warn("storage: demasiados redireccionamentos", { url });
  return null;
}

/**
 * Teto de pixéis, o mesmo que a rota multipart já aplicava.
 *
 * Um teto de BYTES não chega: um PNG minúsculo pode descodificar para
 * gigapixéis, e quem paga isso é o gerador do PDF, mais tarde, com a memória
 * toda. Enquanto os bytes passavam por nós, a rota via a imagem e recusava-a.
 * Com carregamento direto ninguém a vê — por isso a verificação mudou de sítio
 * (passou a ser feita na CONFIRMAÇÃO), não desapareceu.
 */
export const MAX_IMAGE_PIXELS = 50_000_000;

/**
 * Lê só o início de um objeto do Storage. Pede um `Range` e, se o servidor o
 * ignorar, corta na mesma ao fim de `HEADER_BYTES` — nunca puxa a foto toda
 * para a função, que era exatamente o custo que este desenho veio eliminar.
 */
async function fetchHeader(bucket: string, path: string): Promise<Buffer | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.storage.from(bucket).createSignedUrl(path, 60);
    if (!data?.signedUrl) return null;
    return lerCabecalho(data.signedUrl, bucket, path);
  } catch (e) {
    // Nunca lança: quem chama trata `null` como "não se conseguiu ler", e um
    // Storage a rebentar aqui não pode derrubar a confirmação inteira.
    log.warn("storage: cabeçalho não lido", { bucket, path, erro: String(e) });
    return null;
  }
}

/**
 * O mesmo, a partir de um URL JÁ assinado — para quem assinou um LOTE inteiro
 * de uma vez (ver `confirmProposalUploads`) e não tem de voltar ao servidor
 * para assinar foto a foto.
 */
async function lerCabecalho(
  signedUrl: string,
  bucket: string,
  path: string,
): Promise<Buffer | null> {
  try {
    const res = await fetchSeguindoRedireccoes(
      signedUrl,
      {
        headers: { Range: `bytes=0-${HEADER_BYTES - 1}` },
        signal: AbortSignal.timeout(8000),
      },
      new URL(signedUrl).host,
    );
    if (!res || !res.ok || !res.body) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body.getReader();
    while (total < HEADER_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    await reader.cancel().catch(() => {});
    return Buffer.concat(chunks.map((c) => Buffer.from(c)));
  } catch (e) {
    log.warn("storage: cabeçalho não lido", { bucket, path, erro: String(e) });
    return null;
  }
}

/**
 * Uma foto acabada de escrever no Storage tem dimensões aceitáveis?
 *
 * `ok: false` quer dizer "apaga-a": ou não está lá, ou não é uma imagem que
 * consigamos ler, ou é uma bomba de descompressão. Nunca lança.
 */
export async function inspectStoredImage(
  bucket: string,
  path: string,
): Promise<{ ok: boolean; reason: string }> {
  return avaliarCabecalho(await fetchHeader(bucket, path));
}

/** A decisão em si, separada de COMO os bytes foram buscados — para o caminho
 *  em lote poder reutilizá-la sem duplicar a regra dos pixéis. */
async function avaliarCabecalho(head: Buffer | null): Promise<{ ok: boolean; reason: string }> {
  if (!head || head.byteLength === 0) return { ok: false, reason: "ilegivel" };
  try {
    /**
     * O `sharp` só se carrega aqui — este é o único sítio deste ficheiro que
     * dele precisa, e corre no back office (a confirmação de um carregamento),
     * nunca no caminho do casal. A razão por extenso, e o defeito que uma
     * corrida de oito `import()` soltos causou, estão no `sharp-adiado.ts`.
     *
     * Uma falha do módulo cai no `catch` de baixo e responde
     * «formato-invalido» em vez de derrubar a função inteira — que é
     * exactamente a avaria que já mordeu esta casa em produção e está escrita
     * por extenso no `next.config`.
     */
    const meta = await (await oSharp())(head).metadata();
    const pixels = (meta.width ?? 0) * (meta.height ?? 0);
    if (!pixels) return { ok: false, reason: "sem-dimensoes" };
    if (pixels > MAX_IMAGE_PIXELS) return { ok: false, reason: "dimensoes-excessivas" };
    return { ok: true, reason: "" };
  } catch {
    return { ok: false, reason: "formato-invalido" };
  }
}

/** Apaga um objeto — usado quando a confirmação o recusa. Melhor esforço. */
export async function removeStoredObject(bucket: string, path: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.storage.from(bucket).remove([path]);
  } catch (e) {
    log.warn("storage: objeto recusado não foi apagado", { bucket, path, erro: String(e) });
  }
}

/** O caminho é `<pasta>/<ficheiro>.<ext>`, sem travessia de diretórios? */
export function isProposalPath(ref: unknown, quoteId: string): ref is string {
  if (typeof ref !== "string") return false;
  if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(jpe?g|png|webp)$/i.test(ref)) return false;
  return ref.slice(0, ref.indexOf("/")) === quoteId.replace(/[^a-zA-Z0-9_-]/g, "");
}

/**
 * Confirma fotos escritas DIRETAMENTE no bucket: verifica cada uma, apaga as
 * que não passam, e devolve as boas já assinadas para o estúdio as mostrar.
 *
 * Não é um índice: não guarda nada em lado nenhum. Lê o objeto que o cliente
 * diz ter escrito, no caminho que NÓS emitimos, e assina-o — a pasta continua
 * a ser a única fonte de verdade, e um cliente que não confirme nada apenas
 * verá as fotos na próxima listagem.
 */
export async function confirmProposalUploads(
  quoteId: string,
  paths: readonly string[],
): Promise<{ images: UploadedImage[]; rejected: string[] }> {
  const sb = getSupabase();
  const images: UploadedImage[] = [];
  const rejected: string[] = [];
  if (!sb) return { images, rejected: [...paths] };

  // O caminho vem do cliente: só se aceita um que pertença a ESTE pedido.
  const mine = paths.filter((p) => isProposalPath(p, quoteId));
  for (const p of paths) if (!mine.includes(p)) rejected.push(p);

  /**
   * ── PORQUE É QUE ISTO É EM LOTE E COM TECTO ──────────────────────────────
   *
   * Estava um `Promise.all` sobre as fotos todas, e cada uma assinava o SEU URL
   * e fazia o SEU pedido de cabeçalho: sessenta fotos eram cento e vinte
   * pedidos ao Storage disparados no mesmo instante, dentro de uma rota que
   * alguém está a ver a rodar. Uma ida ao servidor POR FOTO é precisamente o
   * que o `assinarLote` existe para não haver (ver `signProposalThumbs`).
   *
   * Assina-se tudo num pedido só, e os cabeçalhos vão em grupos de oito — o
   * mesmo tecto de `duplicarFotosParaPedido`, e pela mesma razão.
   */
  const assinados = await assinarLote(PROPOSAL_BUCKET, [...mine], false, 60);
  const EM_PARALELO = 8;
  const checked: { path: string; verdict: { ok: boolean; reason: string } }[] = [];
  for (let i = 0; i < mine.length; i += EM_PARALELO) {
    const lote = mine.slice(i, i + EM_PARALELO);
    checked.push(
      ...(await Promise.all(
        lote.map(async (path) => {
          const url = assinados.get(path);
          // Sem URL no lote, volta-se a assinar esta sozinha: uma assinatura em
          // falta não pode passar por "a foto não presta" e mandá-la apagar.
          const head = url
            ? await lerCabecalho(url, PROPOSAL_BUCKET, path)
            : await fetchHeader(PROPOSAL_BUCKET, path);
          return { path, verdict: await avaliarCabecalho(head) };
        }),
      )),
    );
  }
  const good: string[] = [];
  for (const { path, verdict } of checked) {
    if (verdict.ok) {
      good.push(path);
      continue;
    }
    log.warn("proposal-storage: foto recusada na confirmação", { path, motivo: verdict.reason });
    rejected.push(path);
    await removeStoredObject(PROPOSAL_BUCKET, path);
  }
  if (good.length === 0) return { images, rejected };

  try {
    const { data } = await sb.storage.from(PROPOSAL_BUCKET).createSignedUrls(good, SIGNED_TTL);
    for (const s of data ?? []) {
      if (s.path && s.signedUrl) images.push({ path: s.path, url: s.signedUrl });
    }
  } catch (e) {
    log.error("proposal-storage: assinatura pós-confirmação falhou", e, { quoteId });
  }
  return { images, rejected };
}

function extFor(contentType: string): string {
  if (/png/i.test(contentType)) return "png";
  if (/webp/i.test(contentType)) return "webp";
  return "jpg";
}

export interface UploadedImage {
  path: string;
  url: string;
  /**
   * URL da miniatura, quando existe. As fotos carregadas antes das miniaturas
   * existirem não têm nenhuma — e é por isso que é opcional em vez de "" : quem
   * desenha distingue "não há" de "há e está vazia", e cai para o original.
   */
  thumbUrl?: string;
}

/** Upload one image (bytes) for a quote; returns its storage path + signed URL. */
export async function uploadProposalImage(
  quoteId: string,
  bytes: Buffer,
  contentType: string,
): Promise<UploadedImage | null> {
  const sb = getSupabase();
  if (!sb || !(await ensureBucket())) return null;
  const safeId = quoteId.replace(/[^a-zA-Z0-9_-]/g, "");
  const path = `${safeId}/${randomUUID()}.${extFor(contentType)}`;
  const { error } = await sb.storage
    .from(PROPOSAL_BUCKET)
    .upload(path, bytes, opcoesDeCarregamento(contentType));
  if (error) {
    log.error("proposal-storage: upload falhou", error, { quoteId });
    return null;
  }
  const { data } = await sb.storage.from(PROPOSAL_BUCKET).createSignedUrl(path, SIGNED_TTL);
  return { path, url: data?.signedUrl ?? "" };
}

/**
 * Uma PÁGINA da listagem do Storage, e o tecto de páginas.
 *
 * O `list` do Storage nunca devolve a pasta inteira: traz uma página, e é quem
 * chama que tem de pedir a seguinte. Estava um `limit: 200` seco e sem
 * paginação nenhuma — passadas 200 fotos num pedido, as mais antigas
 * desapareciam do estúdio EM SILÊNCIO, que é exactamente a truncagem calada que
 * a regra da casa proíbe (ver o comentário no topo de `repository.ts`).
 *
 * O tecto de páginas existe por prudência, não por desenho: um Storage que
 * ignore o `offset` devolveria a mesma página para sempre e o ciclo não
 * acabava. Ao bater no tecto fica um AVISO — a truncagem continua a nunca ser
 * calada.
 */
const PAGINA_DA_LISTAGEM = 200;
const MAX_PAGINAS = 25;

/**
 * List every image already uploaded for a quote, newest first, each with a fresh
 * signed URL. The bucket folder (`${quoteId}/…`) is the device-independent index
 * of what the studio has stored for this pedido, so the studio can re-offer those
 * images on ANY device (a localStorage draft is per-browser and lost elsewhere).
 * Returns [] when Storage is unavailable — never throws.
 */
export async function listProposalImages(quoteId: string): Promise<UploadedImage[]> {
  const sb = getSupabase();
  if (!sb || !(await ensureBucket())) return [];
  const safeId = quoteId.replace(/[^a-zA-Z0-9_-]/g, "");
  try {
    const objectos: { id?: string | null; name: string }[] = [];
    let pagina = 0;
    for (; pagina < MAX_PAGINAS; pagina++) {
      const { data, error } = await sb.storage.from(PROPOSAL_BUCKET).list(safeId, {
        limit: PAGINA_DA_LISTAGEM,
        offset: pagina * PAGINA_DA_LISTAGEM,
        sortBy: { column: "created_at", order: "desc" },
      });
      // Um erro na PRIMEIRA página não dá lista nenhuma, como sempre deu. Numa
      // página seguinte já há fotos na mão: devolvê-las é melhor do que devolver
      // vazio, mas não pode passar por completo — daí o aviso.
      if (error || !data) {
        if (objectos.length === 0) return [];
        log.warn("proposal-storage: listagem interrompida a meio — faltam fotos", {
          quoteId,
          pagina,
          ate_agora: objectos.length,
        });
        break;
      }
      objectos.push(...data);
      // Página incompleta = fim da pasta. É a única forma de saber que acabou.
      if (data.length < PAGINA_DA_LISTAGEM) break;
    }
    if (pagina === MAX_PAGINAS) {
      log.warn("proposal-storage: listagem truncada no tecto de páginas", {
        quoteId,
        fotos: objectos.length,
      });
    }
    // Only real files (Storage can report folder placeholders with no id).
    const paths = objectos
      .filter((o) => o.id && !o.name.startsWith("."))
      .map((o) => `${safeId}/${o.name}`);
    if (paths.length === 0) return [];
    // Assinar em lotes do tamanho da página: com paginação a pasta pode agora
    // trazer milhares de caminhos, e um só pedido com todos seria um corpo
    // enorme. Continua a ser uma ida ao servidor por LOTE, nunca por foto.
    const signed: { path?: string | null; signedUrl?: string | null }[] = [];
    for (let i = 0; i < paths.length; i += PAGINA_DA_LISTAGEM) {
      const { data: lote } = await sb.storage
        .from(PROPOSAL_BUCKET)
        .createSignedUrls(paths.slice(i, i + PAGINA_DA_LISTAGEM), SIGNED_TTL);
      signed.push(...(lote ?? []));
    }
    const imagens = signed
      .map((s) => ({ path: s.path ?? "", url: s.signedUrl ?? "" }))
      .filter((im) => im.path && im.url);
    // As miniaturas EM LOTE, num só pedido: assinar uma de cada vez seria uma
    // ida ao servidor por célula antes de a primeira imagem sequer começar a
    // descarregar. Sem miniaturas nesta instalação, o mapa vem vazio e cada
    // célula fica com o original — o comportamento de hoje.
    const miniaturas = await signProposalThumbs(imagens.map((im) => im.path));
    return imagens.map((im) => {
      const thumbUrl = miniaturas.get(im.path);
      return thumbUrl ? { ...im, thumbUrl } : im;
    });
  } catch (e) {
    log.error("proposal-storage: list falhou", e, { quoteId });
    return [];
  }
}

/**
 * As fotografias de um pedido que saiu de vez da Reciclagem (fase R3b de
 * `docs/TUDO-REVERSIVEL.md`): a pasta `<pedido>/` e as mesmas nas derivadas.
 *
 * Ao contrário do `listProposalImages`, uma listagem que falha NÃO passa por
 * pasta vazia: a entrada fica na Reciclagem e tenta-se no dia seguinte, em
 * vez de a pasta ficar órfã para sempre. `true` quando os originais saíram;
 * as derivadas são melhor esforço. Sem Storage não há nada guardado.
 */
export async function apagarPastaDoPedido(quoteId: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return true;
  const safeId = quoteId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) return false;
  const paths: string[] = [];
  try {
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const { data, error } = await sb.storage.from(PROPOSAL_BUCKET).list(safeId, {
        limit: PAGINA_DA_LISTAGEM,
        offset: pagina * PAGINA_DA_LISTAGEM,
      });
      if (error || !data) return false;
      paths.push(
        ...data.filter((o) => o.id && !o.name.startsWith(".")).map((o) => `${safeId}/${o.name}`),
      );
      if (data.length < PAGINA_DA_LISTAGEM) break;
    }
    // Apagar à medida que se lista mexeria nos índices da paginação: primeiro
    // tudo, depois em lotes do tamanho da página.
    for (let i = 0; i < paths.length; i += PAGINA_DA_LISTAGEM) {
      const { error } = await sb.storage
        .from(PROPOSAL_BUCKET)
        .remove(paths.slice(i, i + PAGINA_DA_LISTAGEM));
      if (error) return false;
    }
  } catch (e) {
    log.error("proposal-storage: pasta do pedido não saiu", e, { quoteId });
    return false;
  }
  for (const bucket of [
    PROPOSAL_THUMB_BUCKET,
    PROPOSAL_MID_BUCKET,
    PROPOSAL_AVIF_MID_BUCKET,
    PROPOSAL_COVER_BUCKET,
  ]) {
    for (let i = 0; i < paths.length; i += PAGINA_DA_LISTAGEM) {
      try {
        await sb.storage.from(bucket).remove(paths.slice(i, i + PAGINA_DA_LISTAGEM));
      } catch {
        /* derivada órfã: lixo invisível, não decide nada */
      }
    }
  }
  // E a capa grande da proposta online (`chaveDaCapaWeb`), que vive ao lado
  // da AVIF de 1200 com outro nome.
  const capasWeb = paths.map(chaveDaCapaWeb);
  for (let i = 0; i < capasWeb.length; i += PAGINA_DA_LISTAGEM) {
    try {
      await sb.storage
        .from(PROPOSAL_AVIF_MID_BUCKET)
        .remove(capasWeb.slice(i, i + PAGINA_DA_LISTAGEM));
    } catch {
      /* idem */
    }
  }
  return true;
}

// Hard cap on a single fetched image, so a hostile/huge URL can't buffer an
// unbounded response into memory during a PDF render.
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

// The only legitimate source of a REMOTE image URL in a proposal doc is a
// Supabase Storage signed URL, so remote fetches are restricted to that host.
// This is an anti-SSRF allow-list: without it, a URL stored in a doc (authored
// in the back office) could point the server at an internal/metadata address
// (e.g. 169.254.169.254) or another intranet service.
function allowedRemoteHost(): string | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Resolve an image reference to raw bytes for embedding in the PDF. Accepts a
 * bucket storage path, a full http(s) URL, or a base64 (optionally data:-URI)
 * string — so the generator input can mix stored images and inline uploads.
 */
export async function fetchProposalImageBytes(ref: string): Promise<Buffer | null> {
  const bytes = await fetchProposalImageBytesInner(ref);
  if (!bytes) {
    // PORQUÊ REGISTAR ISTO.
    //
    // Todos os caminhos de falha aqui devolviam `null` em silêncio, e quem
    // desenha o PDF salta a foto que não resolve. O resultado é uma proposta a
    // seguir para o cliente com fotografias a menos e NINGUÉM a saber: nem a
    // Catarina, nem os registos do servidor. Foi assim que isto apareceu, com
    // ela a abrir o PDF e a dar pela falta.
    //
    // O `kind` diz onde procurar sem expor o caminho todo: um caminho de bucket
    // que falha é outro problema (permissões, ficheiro apagado) de um URL que
    // falha (assinatura expirada, anfitrião errado).
    // Uma foto da BIBLIOTECA que não resolve tem uma causa própria e uma
    // resolução própria (foi apagada de um tema, apesar da salvaguarda do
    // `theme-materializar`), por isso não pode ficar misturada com as fotos da
    // pasta do pedido nos registos.
    const kind = ref.startsWith("data:")
      ? "data-uri"
      : /^https?:\/\//i.test(ref)
        ? "url"
        : ehRefDeTema(ref)
          ? "biblioteca-de-temas"
          : "caminho-do-bucket";
    log.warn("proposal-storage: imagem não resolveu, vai FALTAR no PDF", {
      kind,
      ref: ref.slice(0, 120),
    });
  }
  return bytes;
}

async function fetchProposalImageBytesInner(ref: string): Promise<Buffer | null> {
  if (!ref) return null;
  // Inline base64 / data URI.
  if (ref.startsWith("data:") || (!ref.includes("/") && ref.length > 128)) {
    try {
      const raw = ref.includes(",") ? ref.slice(ref.indexOf(",") + 1) : ref;
      return Buffer.from(raw, "base64");
    } catch {
      return null;
    }
  }
  // Absolute URL (e.g. a Supabase signed URL). SSRF guard: only https, only the
  // configured Supabase Storage host, no following redirects, a request timeout,
  // and a hard size cap.
  if (/^https?:\/\//i.test(ref)) {
    let parsed: URL;
    try {
      parsed = new URL(ref);
    } catch {
      return null;
    }
    const allowedHost = allowedRemoteHost();
    if (parsed.protocol !== "https:" || !allowedHost || parsed.host !== allowedHost) {
      log.error("proposal-storage: remote image host não permitido (SSRF guard)", null, {
        host: parsed.host,
      });
      return null;
    }
    try {
      const res = await fetchSeguindoRedireccoes(
        ref,
        { signal: AbortSignal.timeout(8000) },
        allowedHost,
      );
      if (!res || !res.ok) return null;
      const declared = Number(res.headers.get("content-length") ?? "0");
      if (declared && declared > MAX_IMAGE_BYTES) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > MAX_IMAGE_BYTES) return null;
      return buf;
    } catch {
      return null;
    }
  }
  const sb = getSupabase();
  if (!sb) return null;
  // Uma foto da Biblioteca de Temas, referenciada em vez de copiada. O bucket é
  // outro; tudo o resto — o `download`, os bytes, o que o gerador faz a seguir —
  // é igual. `ehRefDeTema` já validou a forma do caminho, portanto o que chega
  // ao Storage nunca é uma travessia.
  if (ehRefDeTema(ref)) {
    return descarregar(sb, THEME_BUCKET, caminhoDoRefDeTema(ref));
  }
  // Bucket storage path.
  return descarregar(sb, PROPOSAL_BUCKET, ref);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA FALHA PASSAGEIRA NÃO PODE CUSTAR UMA FOTOGRAFIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma proposta descarrega até oitenta ficheiros seguidos. Basta UM pedido a
 * cair — uma ligação reciclada do outro lado, um pico no armazenamento — para
 * essa fotografia desaparecer do documento: devolvia-se `null` à primeira e
 * ficava uma moldura vazia numa proposta que ia para um casal.
 *
 * Duas tentativas extra, com uma pausa curta pelo meio. É o mesmo raciocínio
 * do envio (`proposta-doc`), um nível abaixo: em vez de desenhar o documento
 * todo outra vez por causa de uma foto, repete-se a foto.
 *
 * A pausa cresce (150 ms, 300 ms) porque um armazenamento que acabou de
 * recusar um pedido raramente aceita o seguinte no mesmo instante — e é curta
 * porque isto acontece dentro de uma geração de PDF que alguém está a esperar.
 */
const TENTATIVAS = 3;
const PAUSA_MS = 150;
/** Tecto por tentativa. Ver a corrida lá dentro: sem isto, um pedido pendurado
 *  fica com a função inteira na mão. */
const TEMPO_POR_TENTATIVA_MS = 8000;

async function descarregar(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  bucket: string,
  caminho: string,
): Promise<Buffer | null> {
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      /**
       * COM TEMPO CONTADO, SEMPRE.
       *
       * O `download` do cliente do Storage não traz limite nenhum: um pedido
       * que fica pendurado fica pendurado até a PLATAFORMA matar a função — e
       * leva com ele a proposta inteira, que estava a ser desenhada. O caminho
       * por URL, aqui em cima, já tinha este cuidado (`AbortSignal.timeout`);
       * este não tinha, e é o que corre oitenta vezes seguidas.
       *
       * Oito segundos é generoso para uma fotografia e é curto ao pé do
       * orçamento da função: mais vale três tentativas rápidas do que uma
       * eterna.
       */
      const { data, error } = await Promise.race([
        sb.storage.from(bucket).download(caminho),
        new Promise<never>((_, rejeitar) =>
          setTimeout(() => rejeitar(new Error("tempo esgotado")), TEMPO_POR_TENTATIVA_MS),
        ),
      ]);
      if (!error && data) return Buffer.from(await data.arrayBuffer());
    } catch {
      /* segue para a tentativa seguinte */
    }
    if (tentativa < TENTATIVAS) {
      await new Promise((r) => setTimeout(r, PAUSA_MS * tentativa));
    }
  }
  // Três vezes não é passageiro: ou o ficheiro não está lá, ou o armazenamento
  // está em baixo. Quem chama conta-a como foto em falta — e o envio, com esta
  // contagem, recusa-se a mandar a proposta.
  log.warn("storage: foto não descarregada ao fim de três tentativas", { bucket, caminho });
  return null;
}

/**
 * Os bytes da MINIATURA de 400 px de uma referência, ou `null` se não houver.
 *
 * Existe para o gerador de PDF poder pedir o tamanho de que precisa em vez do
 * tamanho de arquivo: uma célula pequena de mood board é desenhada com ~266 px
 * e recebia um ficheiro de 2200 px e 576 KB — 28× os bytes e ~30× os pixéis a
 * descodificar, para o `sharp` deitar fora quase tudo a seguir.
 *
 * `null` quer dizer "não há miniatura", e isso não é erro: as fotos anteriores
 * às miniaturas não têm nenhuma, e uma imagem embutida (`data:`) ou um URL
 * externo não têm derivada nenhuma por definição. Quem chama cai para o
 * original, que é o comportamento de sempre.
 *
 * Nunca lança.
 */
export async function fetchProposalThumbBytes(ref: string): Promise<Buffer | null> {
  if (!ref || ref.startsWith("data:") || /^https?:\/\//i.test(ref)) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const daBiblioteca = ehRefDeTema(ref);
  const bucket = daBiblioteca ? THEME_THUMB_BUCKET : PROPOSAL_THUMB_BUCKET;
  const caminho = daBiblioteca ? caminhoDoRefDeTema(ref) : ref;
  if (!caminho) return null;
  try {
    const { data, error } = await sb.storage.from(bucket).download(caminho);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

// ── Miniaturas ─────────────────────────────────────────────────────────────
/**
 * Bucket das miniaturas das fotos das propostas.
 *
 * O desenho é o mesmo que a Biblioteca de Temas já usa e que está provado:
 * **bucket paralelo, MESMA chave**. A miniatura de
 * `proposal-assets/<pedido>/<uuid>.jpg` é `proposal-thumbs/<pedido>/<uuid>.jpg`.
 *
 * Sem índice para manter, sem coluna nova na base de dados: o caminho do
 * original É o caminho da miniatura. E, o que mais importa, uma miniatura em
 * falta cai sozinha para o original — as fotos carregadas antes disto existir
 * continuam a funcionar sem migração obrigatória.
 *
 * Porquê isto: medido em IMAGES-BEFORE.md, a grelha do estúdio puxava 1130 KB
 * por célula para desenhar 174 px. A miniatura pesa ~30–60 KB, e é o browser
 * que já a fabrica na mesma descodificação que faz para encolher o original.
 */

let thumbBucketReady = false;

/**
 * Garante o bucket das miniaturas. SÓ QUEM ESCREVE chama isto: ler ou assinar
 * miniaturas nunca o cria, para uma instalação antiga (sem miniatura nenhuma)
 * não pagar uma chamada por leitura.
 */
async function ensureThumbBucket(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  if (thumbBucketReady) return true;
  const { data } = await sb.storage.getBucket(PROPOSAL_THUMB_BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(PROPOSAL_THUMB_BUCKET, {
      public: false,
      fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
      allowedMimeTypes: UPLOAD_MIME_TYPES,
    });
    if (error && !/exist/i.test(error.message)) {
      log.warn("proposal-storage: createBucket das miniaturas falhou", { erro: error.message });
      return false;
    }
  }
  thumbBucketReady = true;
  return true;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A DERIVADA INTERMÉDIA — a que faz falta ao telemóvel do casal
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO, e é a razão de este bucket existir: a grelha da página do casal pede
 * a miniatura de 400 px. Num iPhone, uma fotografia ocupa ~343 pontos e o ecrã
 * tem TRÊS pixéis por ponto — precisa de ~1030. Estava a esticar 400 para
 * 1030, duas vezes e meia acima do que a imagem tem, e vê-se: as palavras dela
 * foram «essas imagens parecem estar desfocadas, ou com pouca qualidade».
 *
 * Servir o ORIGINAL resolvia a nitidez e partia a página: 2,6 MB por
 * fotografia, 46 fotografias, 120 MB num telemóvel em 4G. É precisamente a
 * conta que esta página existe para não fazer.
 *
 * Daí uma TERCEIRA medida, entre as duas: 1200 px, ~200 KB. O navegador
 * escolhe (`srcset`): 400 no computador, 1200 no telemóvel, o original só
 * quando ampliam. Nítida em todo o lado e leve.
 *
 * Bucket próprio, e não uma pasta dentro do das miniaturas: o contador de
 * derivadas em falta LISTA as pastas de cada bucket para saber o que gerar, e
 * uma família escondida dentro da outra apareceria como um pedido chamado «m».
 */

/**
 * ── A MESMA, EM AVIF: UMA OFERTA, NÃO UMA SUBSTITUIÇÃO ────────────────────
 *
 * Bucket próprio pela mesma razão do `THEME_AVIF_BUCKET`, que lá está escrita
 * por extenso: o `<picture>` propõe o AVIF primeiro e o navegador que não o
 * souber ler pede o WebP, que está no bucket de sempre e existe SEMPRE. Quem
 * ganha ganha; quem não ganha fica exactamente como estava.
 *
 * O caminho dentro do bucket é o mesmo, que é o que permite assinar os dois
 * lados com a mesma lista.
 *
 * Estas são as fotografias que o casal descarrega — a página serve a de 1200
 * em qualquer telemóvel. Numa proposta de quarenta e seis, ~28% de cada uma é
 * a diferença entre uma página que se vê e uma que se espera.
 */

let midBucketReady = false;

/** Garante o bucket das derivadas intermédias. Mesma regra do das miniaturas:
 *  só quem ESCREVE o chama, para uma instalação antiga não pagar uma chamada
 *  por leitura. */
async function ensureMidBucket(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  if (midBucketReady) return true;
  const { data } = await sb.storage.getBucket(PROPOSAL_MID_BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(PROPOSAL_MID_BUCKET, {
      public: false,
      fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
      allowedMimeTypes: UPLOAD_MIME_TYPES,
    });
    if (error && !/exist/i.test(error.message)) {
      log.warn("proposal-storage: createBucket das intermédias falhou", { erro: error.message });
      return false;
    }
  }
  midBucketReady = true;
  return true;
}

/**
 * Guarda a derivada intermédia, na MESMA chave do original.
 *
 * Melhor esforço, como a miniatura: falhar aqui só quer dizer que a abertura
 * seguinte volta a pagar o `sharp`. Nunca impede a imagem de ser servida.
 */
export async function uploadProposalMid(
  path: string,
  bytes: Buffer,
  // As derivadas saem em WebP desde a Fase 1 da biblioteca — ver `FORMATO` em
  // `derivadas.ts`. Fica em parâmetro para o formato viver num sítio só: um
  // «image/jpeg» escrito aqui era um cabeçalho a mentir sobre os bytes.
  contentType = "image/webp",
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb || !path) return false;
  try {
    if (!(await ensureMidBucket())) return false;
    const { error } = await sb.storage
      .from(PROPOSAL_MID_BUCKET)
      .upload(path, bytes, opcoesDeCarregamento(contentType, true));
    if (error && !/exist/i.test(error.message)) {
      log.warn("proposal-storage: intermédia não guardada", { path, erro: error.message });
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Guarda a miniatura de uma foto, na MESMA chave do original mas no bucket das
 * miniaturas.
 *
 * Melhor esforço do princípio ao fim, e é deliberado: a miniatura é derivada e
 * descartável, e a foto boa já está guardada quando isto corre. Falhar aqui
 * deixa a foto sem miniatura — a grelha cai para o original, que é o
 * comportamento de hoje — e NUNCA faz falhar um carregamento.
 */
export async function uploadProposalThumb(
  path: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const sb = getSupabase();
  if (!sb || !path) return "";
  try {
    if (!(await ensureThumbBucket())) return "";
    const { error } = await sb.storage
      .from(PROPOSAL_THUMB_BUCKET)
      .upload(path, bytes, opcoesDeCarregamento(contentType, true));
    if (error) {
      log.warn("proposal-storage: miniatura não guardada", { path, erro: error.message });
      return "";
    }
    const { data } = await sb.storage.from(PROPOSAL_THUMB_BUCKET).createSignedUrl(path, SIGNED_TTL);
    return data?.signedUrl ?? "";
  } catch (e) {
    log.warn("proposal-storage: miniatura não guardada", { path, erro: String(e) });
    return "";
  }
}

// ── Derivadas da capa ──────────────────────────────────────────────────────
/**
 * ════════════════════════════════════════════════════════════════════════════
 * A TIRA DA CAPA, JÁ RECORTADA, GUARDADA À ESPERA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O mesmo desenho das miniaturas — **bucket paralelo, MESMA chave** — mas do
 * outro lado da escala. A miniatura serve a grelha do estúdio (400 px); esta
 * serve a caixa mais cara do documento: a tira de capa de 617×1323 px que, a
 * partir do original, custa 250 ms de `sharp` por cada geração de PDF, para
 * sempre. Guardada já recortada, custa 0,1 ms — o `resizeToBox` reconhece que
 * os pixéis são exactamente os que ia produzir e devolve os bytes intactos.
 *
 * Dois buckets e não um, pela mesma razão que as miniaturas são dois: uma foto
 * da pasta de um pedido e uma foto da Biblioteca têm caminhos com a MESMA forma
 * (`<pasta>/<ficheiro>.jpg`), e metê-las no mesmo bucket seria pôr a
 * possibilidade de duas fotos diferentes se escreverem por cima uma da outra à
 * espera de um pedido que por acaso se chamasse como uma pasta de temas.
 *
 * Uma derivada em falta NÃO é um erro: as fotos carregadas antes disto existir
 * não têm nenhuma, e caem para o original — o comportamento de sempre. É por
 * isso que não há migração obrigatória nenhuma.
 */
export const PROPOSAL_COVER_BUCKET = "proposal-capas";
/** O gémeo para as fotos escolhidas da Biblioteca de Temas. */
export const THEME_COVER_BUCKET = "theme-capas";

const capaBucketPronto = new Set<string>();

/** Onde vive a derivada da capa desta referência — ou `null` se ela não pode
 *  ter derivada (uma imagem embutida, um URL externo). */
function destinoDaCapa(ref: string): { bucket: string; caminho: string } | null {
  if (!ref || ref.startsWith("data:") || /^https?:\/\//i.test(ref)) return null;
  if (ehRefDeTema(ref)) {
    const caminho = caminhoDoRefDeTema(ref);
    return caminho ? { bucket: THEME_COVER_BUCKET, caminho } : null;
  }
  return { bucket: PROPOSAL_COVER_BUCKET, caminho: ref };
}

/** Garante o bucket das capas. Só quem ESCREVE chama isto — ler nunca cria
 *  nada, para uma instalação sem derivada nenhuma não pagar por leitura. */
async function ensureCapaBucket(bucket: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  if (capaBucketPronto.has(bucket)) return true;
  const { data } = await sb.storage.getBucket(bucket);
  if (!data) {
    const { error } = await sb.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
      allowedMimeTypes: UPLOAD_MIME_TYPES,
    });
    if (error && !/exist/i.test(error.message)) {
      log.warn("proposal-storage: createBucket das capas falhou", { bucket, erro: error.message });
      return false;
    }
  }
  capaBucketPronto.add(bucket);
  return true;
}

/**
 * Guarda a derivada da capa de uma foto, na MESMA chave do original.
 *
 * Melhor esforço do princípio ao fim, como a miniatura, e pela mesma razão: é
 * uma derivada descartável, a foto boa já está guardada, e falhar aqui não pode
 * fazer falhar o carregamento nem a geração do PDF que a mandou escrever.
 * Devolve se ficou mesmo guardada — quem chama usa isso só para registos.
 */
export async function uploadProposalCover(ref: string, bytes: Buffer): Promise<boolean> {
  const sb = getSupabase();
  const destino = destinoDaCapa(ref);
  if (!sb || !destino || bytes.length === 0) return false;
  try {
    if (!(await ensureCapaBucket(destino.bucket))) return false;
    // TECTO DE TEMPO. Isto também é chamado A MEIO de uma geração de PDF que
    // alguém está à espera (ver `proposal-doc-render`), e é trabalho de que
    // ESSA geração já não precisa — está a guardar para a próxima. Um
    // armazenamento pendurado não pode segurar a proposta de um casal por causa
    // de uma optimização: passados 5 segundos desiste-se, e a derivada será
    // escrita da próxima vez.
    const { error } = await Promise.race([
      sb.storage
        .from(destino.bucket)
        .upload(destino.caminho, bytes, opcoesDeCarregamento("image/jpeg", true)),
      new Promise<{ error: { message: string } }>((r) =>
        setTimeout(() => r({ error: { message: "tempo esgotado" } }), 5000),
      ),
    ]);
    if (error) {
      log.warn("proposal-storage: derivada da capa não guardada", {
        ...destino,
        erro: error.message,
      });
      return false;
    }
    return true;
  } catch (e) {
    log.warn("proposal-storage: derivada da capa não guardada", { ...destino, erro: String(e) });
    return false;
  }
}

/**
 * Os bytes da derivada de capa de uma referência, ou `null` se não houver.
 *
 * `null` é o caso normal numa instalação que ainda não tem derivadas, e não é
 * erro nenhum: quem chama vai buscar o original, exactamente como antes disto
 * existir. Nunca lança.
 */
export async function fetchProposalCoverBytes(ref: string): Promise<Buffer | null> {
  const sb = getSupabase();
  const destino = destinoDaCapa(ref);
  if (!sb || !destino) return null;
  try {
    const { data, error } = await sb.storage.from(destino.bucket).download(destino.caminho);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * URL assinado da miniatura de cada caminho, EM LOTE.
 *
 * Em lote e não um a um: são até 24 células numa grelha, e assinar uma de cada
 * vez é uma ida ao servidor por célula antes de a primeira imagem sequer
 * começar a descarregar. Caminhos sem miniatura simplesmente não aparecem no
 * mapa — quem chama cai para o original.
 *
 * Nunca cria o bucket e nunca lança: numa instalação sem miniatura nenhuma
 * devolve um mapa vazio, e a grelha comporta-se como hoje.
 */
/**
 * Assina VÁRIOS originais da pasta de uma proposta num só pedido.
 *
 * O gémeo de `signProposalThumbs`, para o bucket dos originais. Existe pela
 * mesma razão: assinar um a um é uma ida ao servidor POR FOTO, e a importação
 * da Biblioteca de Temas fazia exactamente isso — quatro idas por foto, das
 * quais duas eram assinaturas.
 */

/**
 * COPIAR AS FOTOS DE UMA PROPOSTA PARA OUTRO PEDIDO.
 *
 * ── Porque é que não basta copiar os caminhos ─────────────────────────────
 * Os caminhos das fotos vivem debaixo do pedido a que pertencem
 * (`{quoteId}/{uuid}.jpg` — ver {@link isProposalPath}). Quando ela cria uma
 * proposta "a partir de" outra, copiar o caminho tal e qual deixaria a
 * proposta NOVA a apontar para a pasta do pedido ANTIGO. Enquanto ninguém
 * mexer no antigo ninguém dá por nada; no dia em que esse pedido for apagado,
 * a proposta nova — provavelmente já enviada — fica sem imagens, em silêncio.
 *
 * ── Porquê `copy` e não descarregar e voltar a carregar ───────────────────
 * `storage.copy()` é feita DENTRO do Supabase: os bytes nunca atravessam esta
 * função. Trinta fotos de mood board são trinta chamadas curtas em vez de
 * trinta descarregamentos e trinta carregamentos. O recurso de descarregar
 * existe, mas fica atrás de um aviso nos registos — se aparecer a sério, é ele
 * que explica porque é que de repente tudo ficou lento.
 *
 * Devolve o mapa `caminho antigo → caminho novo`. O que falhar não aparece no
 * mapa: quem chama mantém o caminho antigo (a proposta continua a funcionar,
 * acoplada à antiga) em vez de ficar com um buraco onde estava uma foto.
 */
export async function duplicarFotosParaPedido(
  caminhos: readonly string[],
  quoteIdDestino: string,
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const sb = getSupabase();
  const destino = quoteIdDestino.replace(/[^a-zA-Z0-9_-]/g, "");
  // Só caminhos do Storage. Uma imagem embutida (`data:`) viaja no documento e
  // não tem nada para copiar.
  //
  // Uma referência à Biblioteca (`tema:…`) também não: ela NÃO vive debaixo do
  // pedido, e é precisamente por isso que o problema descrito acima não lhe
  // toca. Copiar o caminho tal e qual é aqui a resposta certa — ela não aparece
  // no mapa, quem chama mantém a referência, e duplicar uma proposta cheia de
  // fotos da biblioteca passa a não custar chamada nenhuma ao Storage.
  const validos = [
    ...new Set(
      caminhos.filter(
        (p) => typeof p === "string" && p && !p.startsWith("data:") && !ehRefDeTema(p),
      ),
    ),
  ];
  if (!sb || !destino || validos.length === 0) return mapa;
  if (!(await ensureBucket())) return mapa;

  const extDe = (p: string) => {
    const m = /\.([a-zA-Z0-9]+)$/.exec(p);
    return m ? m[1].toLowerCase() : "jpg";
  };

  // O mesmo tecto do import da biblioteca, e pela mesma razão: sem ele, uma
  // proposta com quarenta fotos abre oitenta ligações ao Storage de uma vez.
  const EM_PARALELO = 8;
  for (let i = 0; i < validos.length; i += EM_PARALELO) {
    const lote = validos.slice(i, i + EM_PARALELO);
    await Promise.all(
      lote.map(async (origem) => {
        const novo = `${destino}/${randomUUID()}.${extDe(origem)}`;
        try {
          const { error } = await sb.storage.from(PROPOSAL_BUCKET).copy(origem, novo);
          if (error) {
            log.warn("proposal-storage: cópia da foto falhou", { origem, erro: error.message });
            return;
          }
        } catch (e) {
          log.error("proposal-storage: cópia da foto rebentou", e, { origem });
          return;
        }
        mapa.set(origem, novo);
        // A miniatura é melhor esforço: sem ela a grelha cai para o original,
        // que é feio mas funciona. Falhar aqui não pode perder a foto.
        try {
          await sb.storage.from(PROPOSAL_THUMB_BUCKET).copy(origem, novo);
        } catch {
          /* a foto entra na mesma */
        }
      }),
    );
  }
  return mapa;
}
