import "server-only";
import { opcoesDeCarregamento } from "./cache-das-fotos";
import { createHash, randomUUID } from "node:crypto";
import { getSupabase } from "./supabase";
import {
  fileNameFor,
  fingerprintOfFileName,
  forcedSuffix,
  isFingerprint,
  md5OfETag,
} from "./theme-fingerprint";
import {
  PROPOSAL_BUCKET,
  uploadProposalImage,
  ensureBucket as ensureProposalBucket,
  inspectStoredImage,
  removeStoredObject,
  UPLOAD_MIME_TYPES,
  DERIVADA_MIME_TYPES,
  BUCKET_FILE_SIZE_LIMIT,
  MAX_UPLOAD_TICKETS,
  PROPOSAL_THUMB_BUCKET,
  signProposalPaths,
  signProposalThumbs,
  type UploadTicket,
} from "./proposal-storage";
import {
  THEME_BUCKET,
  THEME_THUMB_BUCKET,
  THEME_MICRO_BUCKET,
  THEME_MID_BUCKET,
  THEME_AVIF_BUCKET,
  THEME_AVIF_MICRO_BUCKET,
  THEME_SIGNED_TTL,
  isThemePath,
  refDeTema,
  themeIdOfPath,
} from "./theme-ref";
import { log } from "./logger";
import { lqipsECoresDeCaminhos } from "./biblioteca-fotos-store";
import type { ThemeImage, ThemeImagePage } from "./theme-types";
import { THEME_PAGE_SIZE, MAX_THEME_PAGE_SIZE } from "./theme-types";

/**
 * Storage das fotos da Biblioteca de Temas, num bucket PRIVADO de Supabase
 * Storage separado do das propostas: `theme-assets`, uma pasta por tema
 * (`<themeId>/<uuid>.jpg`).
 *
 * Porquê um bucket próprio: as fotos de um tema são um ativo do estúdio,
 * reutilizado em muitas propostas, e não devem ser apagadas quando um pedido
 * é limpo. Quando a equipa escolhe fotos de um tema para uma proposta, o
 * documento passa a guardar uma REFERÊNCIA (`tema:<pasta>/<ficheiro>.jpg`) e
 * os bytes ficam onde estão — ver `theme-ref.ts` para o porquê e
 * `materializarAntesDeApagar` mais abaixo para o que garante que uma proposta
 * já enviada nunca perde uma foto por a biblioteca ter sido arrumada.
 *
 * Requer SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. O bucket é criado no
 * primeiro uso (idempotente), tal como o das propostas.
 *
 * Os três nomes de bucket, o `isThemePath` e o formato da referência vivem em
 * `theme-ref.ts` — um módulo-folha, para o `proposal-storage.ts` os poder ler
 * sem criar um ciclo (este módulo já importa esse). Continuam a ser
 * reexportados daqui porque é aqui que toda a gente os foi buscar até hoje.
 */
export {
  THEME_BUCKET,
  THEME_THUMB_BUCKET,
  THEME_MICRO_BUCKET,
  THEME_REF_PREFIX,
  caminhoDoRefDeTema,
  ehRefDeTema,
  isThemePath,
  refDeTema,
  themeIdOfPath,
} from "./theme-ref";

/**
 * As MINIATURAS (`theme-thumbs`, 400 px) e as MICRO (`theme-micro`, 96 px)
 * partilham a chave do original: a derivada de `theme-assets/<tema>/<x>.jpg` é
 * `theme-thumbs/<tema>/<x>.jpg`. Sem índice nenhum a manter — o caminho do
 * original é o caminho da derivada.
 *
 * São DERIVADAS e DESCARTÁVEIS: a listagem faz-se sempre sobre `theme-assets`,
 * uma derivada em falta cai para a de cima (as fotos anteriores às miniaturas
 * não têm nenhuma) e falhar a limpeza NUNCA impede apagar uma foto ou um tema.
 * São geradas no NAVEGADOR, a partir do mesmo bitmap já descodificado para
 * comprimir o original — não há aqui `sharp` nem transformações pagas do
 * Supabase.
 *
 * A micro existe por uma medição: as três tiras de pré-visualização de cada
 * cartão de tema são desenhadas com 43 × 42 px e recebiam o ficheiro de
 * 400 px. Eram 18 dos 24 pedidos da vista Temas e ~360 KB dos 415 KB. A 96 px
 * são 1,8 KB por foto — **91% menos bytes** para a mesma tira.
 */

/**
 * Validade dos URLs assinados da biblioteca: 6 horas.
 *
 * Eram 10 anos. Num bucket com milhares de fotos isso é um empréstimo
 * permanente: cada URL que escapa (um print, um log, o histórico do
 * navegador) fica a servir a foto para sempre, e são milhares deles. 6 horas
 * cobrem folgadamente a sessão de trabalho mais longa — as rotas assinam de
 * novo a cada pedido, e nada do lado do cliente guarda URLs (só o id do
 * último tema usado), por isso encurtar não custa nada a quem trabalha.
 * Prolongar a validade também não ajudava a cache do navegador: o token muda
 * a cada assinatura, logo o URL muda na mesma.
 *
 * O valor vive em `theme-ref.ts` porque o `proposal-storage.ts` também precisa
 * dele: quando assina uma foto referenciada por um documento de proposta, o
 * prazo que conta é este e não o das propostas.
 */
export const SIGNED_TTL = THEME_SIGNED_TTL;

/**
 * A cópia tema → proposta assina no bucket DAS PROPOSTAS, e esse URL é
 * guardado no documento da proposta. Tem de durar o que dura o de uma foto
 * carregada à mão no estúdio (`proposal-storage`: 10 anos), senão uma foto
 * vinda da biblioteca deixava de aparecer numa proposta antiga e a outra não.
 */
const PROPOSAL_COPY_TTL = 60 * 60 * 24 * 365 * 10;

/** Fotos pedidas de uma vez ao Storage (limite por página da listagem). */
const PAGE = 500;

/** Página usada quando só se está a CONTAR (não se assina nada, logo pode ser
 *  maior: menos idas ao Storage para o mesmo total). */
const COUNT_PAGE = 1000;

/** Teto de páginas a contar — 20 × 1000 = 20 000 fotos. Acima disto o total
 *  devolvido é um mínimo (`truncated`), em vez de a rota andar a passear pela
 *  pasta sem fim. */
const MAX_COUNT_PAGES = 20;

/** Teto de páginas ao esvaziar uma pasta — 40 × 500 = 20 000 fotos. */
const MAX_DELETE_PAGES = 40;

/**
 * Memo por bucket da verificação "existe?" — ver `ensureBucket`. Um `Map`
 * porque são dois buckets (fotos e miniaturas) com ciclos de vida diferentes:
 * o das miniaturas só nasce no primeiro carregamento com miniatura.
 */
const ready = new Map<string, Promise<boolean>>();

/**
 * O erro do Storage diz mesmo "não existe"? Só um 404 justifica criar o
 * bucket; confundir uma avaria de rede com "bucket em falta" faz-nos criar às
 * cegas e, pior, dar a avaria por resolvida.
 */
function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: unknown; statusCode?: unknown; message?: unknown };
  if (e.status === 404 || e.statusCode === 404 || e.statusCode === "404") return true;
  return typeof e.message === "string" && /not found|does not exist/i.test(e.message);
}

/**
 * O erro do Storage diz mesmo "já existe"? Gémeo do `isNotFound` acima, e pela
 * mesma razão: só isto justifica contar uma escrita recusada como "já lá
 * estava". Confundir uma avaria com um duplicado esconderia uma foto que NÃO
 * foi copiada e diria à Catarina que estava tudo bem.
 *
 * Olha para o código E para a frase porque as versões do Storage não
 * concordam: umas devolvem 409, outras uma mensagem com "already exists" ou
 * "Duplicate". Se nenhuma das duas casar, o resultado é `failed` — visível e
 * repetível —, nunca um duplicado silencioso.
 */
export function isAlreadyExists(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: unknown; statusCode?: unknown; message?: unknown; error?: unknown };
  if (e.status === 409 || e.statusCode === 409 || e.statusCode === "409") return true;
  if (typeof e.error === "string" && /duplicate|already exists/i.test(e.error)) return true;
  return (
    typeof e.message === "string" && /already exists|duplicate|resource already/i.test(e.message)
  );
}

/**
 * Aplica a um bucket já existente os limites que travam um URL de
 * carregamento roubado (formatos aceites + tamanho máximo). Melhor esforço
 * declarado: um Storage sem `updateBucket` deixa o bucket como está — que é
 * exatamente como está hoje —, nunca faz falhar um carregamento.
 *
 * ── A MESMA LISTA COM QUE O BUCKET NASCE ──────────────────────────────────
 * Isto escrevia a lista estreita dos ORIGINAIS em todos os buckets, os das
 * derivadas incluídos — e tirava-lhes o `image/avif` com que o `ensureBucket`
 * os cria. Era por isso que nenhuma fotografia tinha a sua versão AVIF: a
 * geração «falhava em silêncio», exactamente como o comentário do
 * `ensureBucket` avisa. Encontrado ao pôr a capa da proposta online em AVIF
 * (ela, 27/10: «sim, avança com a capa em AVIF»; e «Sim, corrige»).
 */
export function formatosDoBucket(bucket: string): string[] {
  return bucket === THEME_BUCKET ? UPLOAD_MIME_TYPES : DERIVADA_MIME_TYPES;
}

async function hardenBucket(bucket: string): Promise<void> {
  const sb = getSupabase();
  if (!sb || typeof sb.storage.updateBucket !== "function") return;
  try {
    const { error } = await sb.storage.updateBucket(bucket, {
      public: false,
      fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
      allowedMimeTypes: formatosDoBucket(bucket),
    });
    if (error) {
      log.warn("theme-storage: limites do bucket não aplicados", {
        bucket,
        erro: error.message,
      });
    }
  } catch (e) {
    log.warn("theme-storage: limites do bucket não aplicados", { bucket, erro: String(e) });
  }
}

/**
 * Garante um bucket, uma vez por processo e por bucket. Memoiza a PROMESSA (e
 * não um booleano): vários pedidos em paralelo — a lista de temas faz um por
 * tema — partilham a mesma verificação em vez de dispararem
 * getBucket/createBucket ao mesmo tempo. Numa falha o memo é limpo, para que
 * uma indisponibilidade passageira não fique marcada para sempre.
 *
 * Só quem ESCREVE chama isto. Ler, assinar ou apagar miniaturas nunca cria o
 * bucket das miniaturas: numa instalação antiga (sem miniatura nenhuma) essas
 * operações falham em silêncio e cai-se para o original — criar o bucket ali
 * seria trabalho e ruído sem nada lá dentro.
 */
async function ensureBucket(bucket: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  let pending = ready.get(bucket);
  if (!pending) {
    const attempt = (async () => {
      const { data, error } = await sb.storage.getBucket(bucket);
      if (data) {
        // Já existia: aperta os limites (formato + tamanho) uma vez por
        // processo. Com carregamento DIRETO é aqui, e só aqui, que uma regra
        // ainda se aplica — a rota deixou de ver os bytes.
        await hardenBucket(bucket);
        return true;
      }
      if (error && !isNotFound(error)) {
        log.error("theme-storage: getBucket falhou", error, { bucket });
        return false;
      }
      const { error: createError } = await sb.storage.createBucket(bucket, {
        public: false,
        fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
        // O bucket dos ORIGINAIS é o único que recebe ficheiros de fora, e é o
        // único que fica com a lista estreita. Os das derivadas têm de aceitar
        // o que nós fabricamos — sem `image/avif` a geração falhava em
        // silêncio, com o contador a dizer «geradas 0» sem dizer porquê.
        allowedMimeTypes: formatosDoBucket(bucket),
      });
      // Ignora corridas "already exists"; qualquer outro erro é reportado.
      if (createError && !/exist/i.test(createError.message)) {
        log.error("theme-storage: createBucket falhou", createError, { bucket });
        return false;
      }
      return true;
    })();
    pending = attempt.then(
      (ok) => {
        if (!ok) ready.delete(bucket);
        return ok;
      },
      (err) => {
        ready.delete(bucket);
        log.error("theme-storage: ensureBucket falhou", err, { bucket });
        return false;
      },
    );
    ready.set(bucket, pending);
  }
  return pending;
}

/** Nome de pasta seguro para um tema (o id nunca deve escapar da sua pasta). */
export function themeFolder(themeId: string): string {
  return themeId.replace(/[^a-zA-Z0-9_-]/g, "");
}

function extFor(contentType: string): string {
  if (/png/i.test(contentType)) return "png";
  if (/webp/i.test(contentType)) return "webp";
  return "jpg";
}

/** Content-type inferido da extensão de um caminho do bucket. */
export function contentTypeForPath(path: string): string {
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.webp$/i.test(path)) return "image/webp";
  return "image/jpeg";
}

/** A miniatura que acompanha uma foto no carregamento (feita no navegador). */
export interface ThemeThumbInput {
  bytes: Buffer;
  contentType: string;
}

/**
 * Carrega a miniatura de uma foto, NA MESMA CHAVE do original mas no bucket
 * das miniaturas, e devolve o URL assinado (ou "" se algo correu mal).
 *
 * Melhor esforço do princípio ao fim: a miniatura é derivada e descartável, e
 * a foto boa já está guardada — falhar aqui deixa a foto sem miniatura (a
 * grelha mostra o original), nunca deita o carregamento abaixo.
 *
 * O content-type gravado é o da MINIATURA, que pode não corresponder à
 * extensão da chave (um PNG grande vira uma miniatura JPEG). É de propósito: a
 * chave tem de ser idêntica à do original para se poder derivar uma da outra
 * sem índice, e quem serve o ficheiro vai pelo content-type, não pelo nome.
 */
/**
 * Garante um bucket de DERIVADAS a partir de fora.
 *
 * O gerador em lote (`derivadas.ts`) escreve directamente no Storage, sem
 * passar pelo `uploadThemeDerivada` — e um bucket que não existe faz esse
 * `upload` falhar em silêncio, para sempre. Antes só acontecia a instalações
 * antigas; com os buckets do AVIF passou a ser o caso de TODAS, porque nenhum
 * deles existe ainda em lado nenhum.
 */
export function garantirBucketDeDerivadas(bucket: string): Promise<boolean> {
  return ensureBucket(bucket);
}

async function uploadThemeDerivada(
  bucket: string,
  path: string,
  thumb: ThemeThumbInput,
): Promise<string> {
  const sb = getSupabase();
  if (!sb || !isThemePath(path)) return "";
  try {
    if (!(await ensureBucket(bucket))) return "";
    const { error } = await sb.storage
      .from(bucket)
      .upload(path, thumb.bytes, opcoesDeCarregamento(thumb.contentType, true));
    if (error) {
      log.warn("theme-storage: derivada não guardada", { bucket, path, erro: error.message });
      return "";
    }
    const { data } = await sb.storage.from(bucket).createSignedUrl(path, SIGNED_TTL);
    return data?.signedUrl ?? "";
  } catch (e) {
    log.warn("theme-storage: derivada não guardada", { bucket, path, erro: String(e) });
    return "";
  }
}

/** A miniatura de 400 px (ver `uploadThemeDerivada`). */
const uploadThemeThumb = (path: string, thumb: ThemeThumbInput) =>
  uploadThemeDerivada(THEME_THUMB_BUCKET, path, thumb);

/** A micro de 96 px. */
const uploadThemeMicro = (path: string, micro: ThemeThumbInput) =>
  uploadThemeDerivada(THEME_MICRO_BUCKET, path, micro);

/**
 * A de 1200 px — a que a PÁGINA DO CASAL mostra.
 *
 * As de 400 e 96 servem as grelhas e as tiras daqui. Aquela nascia no
 * servidor, uma a uma, à primeira vez que alguém olhava para cada fotografia,
 * e chega agora já feita do browser (ver `MID_EDGE` em `image-worker.ts`).
 */
const uploadThemeMid = (path: string, mid: ThemeThumbInput) =>
  uploadThemeDerivada(THEME_MID_BUCKET, path, mid);

/**
 * O que aconteceu a uma foto que se tentou guardar.
 *
 * `duplicate` NÃO é um erro: é a resposta certa a "esta foto já está no tema",
 * e a rota devolve-a com 200. `null` é que é a avaria.
 */
export type ThemeUploadResult =
  | { kind: "created"; image: ThemeImage }
  | { kind: "duplicate"; path: string };

/** O que decide o NOME do ficheiro (e, com ele, a identidade da foto). */
export interface ThemeUploadOptions {
  /** Resumo do ficheiro ORIGINAL, calculado no navegador. Ausente ou mal
   *  formado = nome UUID, como sempre foi (retro-compatível: nunca recusa). */
  fingerprint?: string | null;
  /** "Adicionar mesmo assim": guarda com `<resumo>-<4 hex>` para a cópia
   *  forçada continuar a contar como "esta foto está no tema". */
  force?: boolean;
}

/**
 * Carrega uma foto (bytes) para a pasta de um tema, com a sua miniatura
 * quando o cliente a enviou.
 *
 * O CAMINHO é `<pasta>/<resumo>.<ext>` quando vem um resumo bem formado, e
 * `<pasta>/<uuid>.<ext>` quando não vem. Com o resumo no nome, o `upsert:
 * false` que já existia deixa de ser uma verificação com corrida e passa a ser
 * uma garantia atómica do Storage: dois separadores a carregar a mesma pasta ao
 * mesmo tempo não conseguem duplicar nada — o segundo apanha um 409, que sai
 * daqui como `duplicate`.
 */
export async function uploadThemeImage(
  themeId: string,
  bytes: Buffer,
  contentType: string,
  thumb?: ThemeThumbInput,
  options?: ThemeUploadOptions,
  micro?: ThemeThumbInput,
  mid?: ThemeThumbInput,
): Promise<ThemeUploadResult | null> {
  const sb = getSupabase();
  if (!sb || !(await ensureBucket(THEME_BUCKET))) return null;
  const folder = themeFolder(themeId);
  if (!folder) return null;
  const fingerprint = isFingerprint(options?.fingerprint) ? options.fingerprint : null;
  // 32 hex validados: não há travessia de diretórios possível e o `isThemePath`
  // continua a aceitar o caminho tal como aceitava um UUID.
  const name = fingerprint
    ? fileNameFor(fingerprint, options?.force ? forcedSuffix() : undefined)
    : randomUUID();
  const path = `${folder}/${name}.${extFor(contentType)}`;
  const { error } = await sb.storage
    .from(THEME_BUCKET)
    .upload(path, bytes, opcoesDeCarregamento(contentType));
  if (error) {
    // A foto já lá estava — o guarda atómico a fazer o seu trabalho. Não é uma
    // avaria e não pode sair daqui como uma.
    if (isAlreadyExists(error)) return { kind: "duplicate", path };
    log.error("theme-storage: upload falhou", error, { themeId });
    return null;
  }
  invalidateThemeCount(themeId);
  // O índice acompanha o que acabámos de escrever, em vez de ser reconstruído
  // (ver a armadilha em `FINGERPRINT_TTL_MS`).
  noteThemeFingerprint(themeId, { hash: fingerprint, md5: md5Of(bytes), path });
  // As QUATRO em paralelo: a assinatura do original e as três derivadas não
  // dependem umas das outras, e em série somavam-se quatro idas ao Storage por
  // foto num lote que pode ter 300.
  const [{ data }, thumbUrl, microUrl] = await Promise.all([
    sb.storage.from(THEME_BUCKET).createSignedUrl(path, SIGNED_TTL),
    thumb ? uploadThemeThumb(path, thumb) : Promise.resolve(""),
    micro ? uploadThemeMicro(path, micro) : Promise.resolve(""),
    // O URL desta não vai na resposta: a grelha do back office não a usa, e é
    // a página do casal que a procura pelo caminho. Guardar é o que interessa.
    mid ? uploadThemeMid(path, mid) : Promise.resolve(""),
  ]);
  return {
    kind: "created",
    image: {
      path,
      url: data?.signedUrl ?? "",
      ...(thumbUrl ? { thumbUrl } : {}),
      ...(microUrl ? { microUrl } : {}),
    },
  };
}

/**
 * CARREGAMENTO DIRETO — um bilhete por foto.
 *
 * Hoje cada foto atravessa a rede DUAS vezes: navegador → função → Storage. A
 * função tem de receber o multipart inteiro em memória antes de poder reenviar
 * um único byte, e é por isso que existe o teto de ~4,5 MB por pedido. Um
 * bilhete troca isso por um URL que o navegador usa para escrever DIRETAMENTE
 * no bucket.
 *
 * O que o bilhete NÃO é: uma autorização geral. O caminho é construído aqui —
 * `<pasta do tema>/<uuid>.<ext>` — e nunca aceite do cliente. Cada bilhete
 * abre exatamente UM caminho, `upsert: false` impede-o de substituir seja o
 * que for, e os limites do bucket (`hardenBucket`) travam o formato e o
 * tamanho do que lá pode entrar.
 *
 * A miniatura leva bilhete próprio, com a MESMA chave no bucket das
 * miniaturas — a regra "o caminho do original é o caminho da miniatura"
 * mantém-se, e continua a não haver índice nenhum a manter.
 */
export interface ThemeUploadTicket {
  /** O caminho no bucket dos temas. É por aqui que a confirmação identifica a foto. */
  path: string;
  /** Bilhete para o ORIGINAL (bucket `theme-assets`). */
  original: UploadTicket;
  /** Bilhete para a MINIATURA (bucket `theme-thumbs`), ou `null` quando não foi
   *  possível emitir — a foto sobe na mesma e a grelha cai para o original,
   *  exatamente como faz com as fotos anteriores às miniaturas. */
  thumb: UploadTicket | null;
}

/** O Storage desta instalação sabe emitir URLs de carregamento? Um Supabase
 *  mais antigo não sabe — e aí a rota manda o cliente pelo multipart. */
function canMintUploadUrls(sb: NonNullable<ReturnType<typeof getSupabase>>): boolean {
  return typeof sb.storage.from(THEME_BUCKET).createSignedUploadUrl === "function";
}

async function mintOne(bucket: string, path: string): Promise<UploadTicket | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.storage
      .from(bucket)
      .createSignedUploadUrl(path, { upsert: false });
    if (error || !data) return null;
    return { path, uploadUrl: data.signedUrl, token: data.token };
  } catch {
    return null;
  }
}

/**
 * Emite bilhetes para carregar fotos DIRETAMENTE na pasta de um tema.
 *
 * `contentTypes` só decide a EXTENSÃO do caminho — nunca o destino. Um tipo
 * que não reconheçamos vira `.jpg`, e o que o bucket aceita de facto é
 * decidido pelos limites do bucket, não por esta lista.
 *
 * Devolve `null` quando esta instalação não sabe emitir URLs de carregamento:
 * a rota traduz isso em "usa o multipart de sempre", e nada quebra.
 */
export async function createThemeUploadTickets(
  themeId: string,
  contentTypes: readonly string[],
  /** Resumos emparelhados pela ORDEM com `contentTypes` (opcional). Com eles, a
   *  foto repetida nem bilhete recebe: zero bytes na rede. */
  fingerprints?: readonly (string | null | undefined)[],
): Promise<ThemeUploadTicket[] | null> {
  const sb = getSupabase();
  if (!sb || !(await ensureBucket(THEME_BUCKET))) return null;
  if (!canMintUploadUrls(sb)) return null;
  const folder = themeFolder(themeId);
  if (!folder) return null;
  const wanted = contentTypes.slice(0, MAX_UPLOAD_TICKETS);
  if (wanted.length === 0) return [];

  // O bucket das miniaturas pode ainda não existir (instalação antiga). Só se
  // pedem bilhetes de miniatura se ele estiver mesmo lá — falhar a criá-lo
  // deixa as fotos sem miniatura, nunca impede o carregamento.
  const thumbsReady = await ensureBucket(THEME_THUMB_BUCKET);

  const tickets = await Promise.all(
    wanted.map(async (type, i) => {
      // Mesma regra de nome da `uploadThemeImage`: o resumo quando ele existe,
      // UUID quando não — para os dois caminhos de carregamento darem fotos
      // com a mesma identidade.
      const fp = fingerprints?.[i];
      const name = isFingerprint(fp) ? fileNameFor(fp) : randomUUID();
      const path = `${folder}/${name}.${extFor(type)}`;
      const [original, thumb] = await Promise.all([
        mintOne(THEME_BUCKET, path),
        thumbsReady ? mintOne(THEME_THUMB_BUCKET, path) : Promise.resolve(null),
      ]);
      return original ? { path, original, thumb } : null;
    }),
  );
  // Ou saem todos, ou nenhum: bilhetes com buracos punham o cliente a
  // adivinhar quais podia usar, e é mais barato cair para o multipart.
  if (tickets.some((t) => t === null)) {
    log.warn("theme-storage: emissão de bilhetes incompleta", { themeId });
    return null;
  }
  return tickets as ThemeUploadTicket[];
}

/**
 * Confirma as fotos que o navegador escreveu no bucket.
 *
 * Porquê uma confirmação e não só relistar: a pasta CONTINUA a ser a fonte de
 * verdade — nada aqui é gravado, e um carregamento que nunca seja confirmado
 * aparece na mesma na listagem seguinte. O que a confirmação faz, e a
 * listagem não pode fazer, é OLHAR PARA A IMAGEM. Enquanto os bytes passavam
 * pela função, era ela que recusava um ficheiro com dimensões absurdas antes
 * de o guardar; com escrita direta ninguém o vê. A verificação mudou de
 * lugar, não desapareceu — e lê só o cabeçalho, uns KB, para não trazer de
 * volta a travessia que este desenho veio eliminar.
 *
 * O que não passa é APAGADO e devolvido em `rejected`, para o estúdio poder
 * dizer quais falharam. Nunca lança.
 */
export async function confirmThemeUploads(
  themeId: string,
  paths: readonly string[],
): Promise<{ images: ThemeImage[]; rejected: string[] }> {
  const folder = themeFolder(themeId);
  const rejected: string[] = [];
  if (!getSupabase() || !folder) return { images: [], rejected: [...paths] };

  // O caminho vem do cliente: só se aceita um ficheiro DENTRO da pasta deste
  // tema — nunca de outro tema, nunca com travessia de diretórios.
  const mine: string[] = [];
  for (const p of paths) {
    if (isThemePath(p) && themeIdOfPath(p) === folder) mine.push(p);
    else rejected.push(p);
  }

  const checked = await Promise.all(
    mine.map(async (path) => ({ path, verdict: await inspectStoredImage(THEME_BUCKET, path) })),
  );
  const good: string[] = [];
  for (const { path, verdict } of checked) {
    if (verdict.ok) {
      good.push(path);
      continue;
    }
    log.warn("theme-storage: foto recusada na confirmação", { path, motivo: verdict.reason });
    rejected.push(path);
    // Sai o original E a miniatura: uma miniatura órfã de uma foto recusada é
    // lixo que a grelha nunca mostraria e que ninguém voltaria a limpar.
    await Promise.all([
      removeStoredObject(THEME_BUCKET, path),
      removeStoredObject(THEME_THUMB_BUCKET, path),
    ]);
  }
  // A pasta mudou: a contagem guardada deixou de valer.
  invalidateThemeCount(themeId);
  if (good.length === 0) return { images: [], rejected };

  const [urls, thumbs] = await Promise.all([signThemePaths(good), signThemeThumbs(good)]);
  const images: ThemeImage[] = good
    .map((path) => {
      const thumbUrl = thumbs.get(path);
      return { path, url: urls.get(path) ?? "", ...(thumbUrl ? { thumbUrl } : {}) };
    })
    .filter((im) => im.url);
  return { images, rejected };
}

/** O conteúdo (cru) da pasta de um tema — ver `listThemeFiles`. */
export interface ThemeFileList {
  /** Nomes dos ficheiros DENTRO da pasta (sem o prefixo da pasta). */
  names: string[];
  /** A pasta foi mesmo lida. `false` = Storage em baixo, NÃO "pasta vazia". */
  ok: boolean;
  /** A página veio cheia: há (provavelmente) mais fotos do que estas. */
  truncated: boolean;
}

/** Um objeto da pasta, com o que a listagem já traz de graça. */
export interface ThemeObject {
  /** Nome do ficheiro dentro da pasta (sem o prefixo). */
  name: string;
  /** MD5 do conteúdo guardado, quando o eTag desta instalação o for. `null`
   *  quando não se pode afirmar (ver `md5OfETag`) — e aí não se afirma nada. */
  md5: string | null;
}

/** O conteúdo da pasta com os metadados que a listagem já devolve. */
export interface ThemeObjectList {
  objects: ThemeObject[];
  ok: boolean;
  truncated: boolean;
}

/**
 * Lista a pasta de um tema SEM assinar nada. É a primitiva barata: assinar
 * URLs é o passo caro, e quem só precisa de contar fotos (a lista de temas)
 * ou de as apagar não tem de os pedir.
 *
 * A distinção que interessa é `ok`: uma pasta ilegível devolve `ok: false`, e
 * quem chama tem de a mostrar como "fotos indisponíveis" — nunca como "0
 * fotos", que a equipa leria como "as minhas fotos desapareceram". Nunca lança.
 *
 * Devolve também o MD5 de cada objeto porque o `list()` já o traz no
 * `metadata.eTag` — não custa uma única ida a mais ao Storage, e é o que
 * permite reconhecer as fotos da biblioteca ANTIGA (nome UUID, sem resumo no
 * nome) sem migração nenhuma. Ver `readThemeFingerprints`.
 */
export async function listThemeObjects(
  themeId: string,
  limit = PAGE,
  offset = 0,
): Promise<ThemeObjectList> {
  const unreadable: ThemeObjectList = { objects: [], ok: false, truncated: false };
  const sb = getSupabase();
  if (!sb || !(await ensureBucket(THEME_BUCKET))) return unreadable;
  const folder = themeFolder(themeId);
  // Sem pasta segura não há nada que possamos afirmar sobre o conteúdo.
  if (!folder) return unreadable;
  try {
    const { data, error } = await sb.storage.from(THEME_BUCKET).list(folder, {
      limit,
      offset,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error || !data) {
      log.error("theme-storage: list falhou", error, { themeId });
      return unreadable;
    }
    // Só ficheiros reais (o Storage devolve marcadores de pasta sem id).
    const objects = data
      .filter((o) => o.id && !o.name.startsWith("."))
      .map((o) => ({ name: o.name, md5: md5OfETag(o.metadata?.eTag) }));
    // O limite é contado sobre a página CRUA: uma página cheia de marcadores
    // continua a significar "há mais para trás".
    return { objects, ok: true, truncated: data.length >= limit };
  } catch (e) {
    log.error("theme-storage: list falhou", e, { themeId });
    return unreadable;
  }
}

/**
 * Só os NOMES da pasta — o invólucro fino de `listThemeObjects` que a lista de
 * temas e a rota das miniaturas já usavam. Mantém-se com esta forma para não
 * obrigar quem só quer contar a saber que existem eTags.
 */
export async function listThemeFiles(
  themeId: string,
  limit = PAGE,
  offset = 0,
): Promise<ThemeFileList> {
  const { objects, ok, truncated } = await listThemeObjects(themeId, limit, offset);
  return { names: objects.map((o) => o.name), ok, truncated };
}

/** Conta as fotos de uma pasta — ver `countThemeFiles`. */
export interface ThemeFileCount {
  /** Fotos contadas. Com `truncated`, é um MÍNIMO. */
  total: number;
  /** A pasta foi mesmo lida até ao fim (ou até ao teto). */
  ok: boolean;
  /** Bateu no teto de páginas: há mais fotos do que as contadas. */
  truncated: boolean;
}

/**
 * Conta as fotos de um tema percorrendo a pasta por páginas, SEM assinar nada.
 *
 * Não há API de contagem no Storage do Supabase (a tabela `storage.objects`
 * não está exposta ao PostgREST), por isso contar é mesmo listar: 1 ida ao
 * Storage por cada `COUNT_PAGE` ficheiros. Com 5000 fotos são 5 idas, só com
 * metadados — o passo caro, assinar, não acontece aqui.
 *
 * `maxPages` é o orçamento de quem chama: a grelha de um tema pode gastar as
 * 20 páginas (total exato até 20 000), a lista de temas gasta UMA e mostra a
 * contagem como mínimo — desenhar cartões nunca pode custar ler pastas
 * inteiras, e são vários temas por ecrã.
 */
export async function countThemeFiles(
  themeId: string,
  maxPages = MAX_COUNT_PAGES,
  pageSize = COUNT_PAGE,
): Promise<ThemeFileCount> {
  const cached = readCount(themeId, maxPages, pageSize);
  if (cached) return cached;
  let total = 0;
  for (let page = 0; page < maxPages; page++) {
    const listed = await listThemeFiles(themeId, pageSize, page * pageSize);
    if (!listed.ok) return { total, ok: false, truncated: false };
    total += listed.names.length;
    if (!listed.truncated) {
      return writeCount(themeId, maxPages, pageSize, { total, ok: true, truncated: false });
    }
  }
  return writeCount(themeId, maxPages, pageSize, { total, ok: true, truncated: true });
}

/**
 * MEMÓRIA CURTA DA CONTAGEM — medido, não suposto.
 *
 * Contar é listar: uma ida ao Storage por cada `COUNT_PAGE` fotos. Numa pasta
 * de 5000 são 6, SEQUENCIAIS, e a `listThemeImagePage` recontava-as em CADA
 * página da grelha. Medido com latências de Storage realistas (list 120 ms,
 * assinatura 90 ms): abrir uma página de um tema de 5000 fotos custava 936 ms,
 * de 12 000 custava 1778 ms, e percorrer cinco páginas pagava isso cinco
 * vezes. O custo crescia com a BIBLIOTECA, não com o que se mostra — que é o
 * oposto da promessa deste módulo.
 *
 * Isto não é um índice, e não é uma segunda fonte de verdade: é o resultado da
 * mesma contagem, guardado por 60 segundos DENTRO do processo. Expira sozinho,
 * é deitado fora a cada escrita (`invalidateThemeCount`) e, se o processo
 * morrer, conta-se outra vez. A pasta continua a mandar em tudo.
 *
 * Só se guardam contagens COMPLETAS e com os parâmetros por omissão: uma
 * contagem que falhou a meio, ou que bateu no teto, ou que alguém pediu com
 * um orçamento próprio, não tem nada que ficar em cache a mentir a outra
 * chamada.
 */
const COUNT_TTL_MS = 60_000;
const countMemo = new Map<string, { at: number; value: ThemeFileCount }>();

function countMemoKey(themeId: string, maxPages: number, pageSize: number): string | null {
  if (maxPages !== MAX_COUNT_PAGES || pageSize !== COUNT_PAGE) return null;
  const folder = themeFolder(themeId);
  return folder ? folder : null;
}

function readCount(themeId: string, maxPages: number, pageSize: number): ThemeFileCount | null {
  const key = countMemoKey(themeId, maxPages, pageSize);
  if (!key) return null;
  const hit = countMemo.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > COUNT_TTL_MS) {
    countMemo.delete(key);
    return null;
  }
  return hit.value;
}

function writeCount(
  themeId: string,
  maxPages: number,
  pageSize: number,
  value: ThemeFileCount,
): ThemeFileCount {
  const key = countMemoKey(themeId, maxPages, pageSize);
  // Uma contagem truncada é um MÍNIMO: guardá-la fixaria esse mínimo durante
  // um minuto inteiro, em vez de ele melhorar quando a pasta encolhe.
  if (key && !value.truncated) countMemo.set(key, { at: Date.now(), value });
  return value;
}

/**
 * Esquece a contagem de um tema. Chamada por tudo o que ESCREVE na pasta —
 * carregar, confirmar, apagar —, para que o número que a Catarina vê mude no
 * momento em que ela mexe nas fotos, e não daqui a um minuto.
 */
export function invalidateThemeCount(themeId: string): void {
  const folder = themeFolder(themeId);
  if (folder) countMemo.delete(folder);
}

// ── O ÍNDICE DE REPETIDAS ──────────────────────────────────────────────────

/**
 * O que a pasta sabe sobre "esta foto já cá está".
 *
 * Não é uma segunda fonte de verdade: é a MESMA listagem da pasta, lida de
 * outra maneira. `hashes` vem dos NOMES (`<32 hex>.jpg`, ver
 * `theme-fingerprint.ts`) e `md5s` vem do eTag que a listagem já traz — a rede
 * secundária que apanha a biblioteca antiga, de nome UUID.
 */
export interface ThemeFingerprintIndex {
  /** Resumos do ficheiro original das fotos que estão na pasta. */
  hashes: Set<string>;
  /** `MD5 do conteúdo → caminho`, para se poder DIZER qual é a repetida. */
  md5s: Map<string, string>;
  /** A pasta foi mesmo lida. `false` = não se pode afirmar nada. */
  ok: boolean;
  /** Percorreu-se a pasta até ao fim. `false` = bateu no teto de páginas e daí
   *  para cima é melhor esforço — a UI NÃO pode anunciar poupanças. */
  complete: boolean;
  /** Há fotos sem resumo no nome (carregadas antes desta funcionalidade). É o
   *  que autoriza a UI a dizer, uma vez, que nem todas são reconhecíveis. */
  legacy: boolean;
}

/**
 * MEMÓRIA DO ÍNDICE — e o cuidado que aqui é decisivo.
 *
 * ARMADILHA EVITADA: pendurar isto no `invalidateThemeCount` (que dispara a
 * CADA foto carregada) transformaria um lote de 300 fotos em 300 reconstruções
 * do índice. Num tema de 4000 fotos são 300 × 4 chamadas `list` × 120 ms ≈
 * 144 s de Storage desperdiçados por arrasto — a funcionalidade ficaria mais
 * cara do que o problema que resolve.
 *
 * Em vez disso: o índice é ATUALIZADO na escrita (`noteThemeFingerprint`, que
 * acrescenta exatamente o que sabemos que mudou) e só é DEITADO FORA em
 * remoções (`forgetThemeFingerprints`). Expira sozinho ao fim de 60 s, tal
 * como a contagem.
 *
 * A staleness possível está limitada a 60 s e é sempre para o lado de "esta
 * foto já cá está" (uma foto apagada noutra instância). É o único falso
 * positivo do desenho, e é por isso que a lista de saltadas TEM de ser
 * accionável ("Adicionar mesmo assim") e não um mero número.
 */
const FINGERPRINT_TTL_MS = 60_000;
/** Quantos temas ficam em memória. Quatro chegam: trabalha-se num tema de cada
 *  vez e o quinto entrada expulsa o mais antigo, em vez de a memória do
 *  processo crescer com a biblioteca (4000 fotos ≈ 520 KB por tema). */
const FINGERPRINT_LRU = 4;
const fingerprintMemo = new Map<string, { at: number; index: ThemeFingerprintIndex }>();

/**
 * Lê o índice de repetidas de um tema (da pasta, com memória de 60 s).
 *
 * Percorre a pasta com a MESMA paginação e o MESMO teto que a contagem já usa
 * (`COUNT_PAGE`, `MAX_COUNT_PAGES`), portanto num tema de 4000 fotos são 4
 * chamadas `list` (~0,5 s) e ZERO assinaturas — o passo caro não acontece. É
 * por LOTE de fotos, não por foto.
 *
 * Nunca lança. Uma pasta ilegível devolve `ok: false`, e quem chama tem de
 * subir tudo: o `upsert: false` da escrita continua a ser o guarda que não
 * falha.
 */
export async function readThemeFingerprints(themeId: string): Promise<ThemeFingerprintIndex> {
  const folder = themeFolder(themeId);
  const empty = (): ThemeFingerprintIndex => ({
    hashes: new Set(),
    md5s: new Map(),
    ok: false,
    complete: false,
    legacy: false,
  });
  if (!folder) return empty();

  const hit = fingerprintMemo.get(folder);
  if (hit && Date.now() - hit.at <= FINGERPRINT_TTL_MS) return hit.index;
  if (hit) fingerprintMemo.delete(folder);

  const index = empty();
  for (let pageIndex = 0; pageIndex < MAX_COUNT_PAGES; pageIndex++) {
    const listed = await listThemeObjects(themeId, COUNT_PAGE, pageIndex * COUNT_PAGE);
    // Uma leitura falhada NÃO é "pasta sem repetidas": devolve-se `ok: false`
    // e o que já se leu fica de fora, para ninguém anunciar uma poupança que
    // não pôde ser verificada.
    if (!listed.ok) return empty();
    for (const o of listed.objects) {
      const hash = fingerprintOfFileName(o.name);
      if (hash) index.hashes.add(hash);
      else index.legacy = true;
      if (o.md5) index.md5s.set(o.md5, `${folder}/${o.name}`);
    }
    if (!listed.truncated) {
      index.ok = true;
      index.complete = true;
      break;
    }
    // Bateu no teto: daqui para cima é melhor esforço declarado.
    if (pageIndex === MAX_COUNT_PAGES - 1) {
      index.ok = true;
      index.complete = false;
    }
  }

  fingerprintMemo.set(folder, { at: Date.now(), index });
  // LRU simples: o `Map` mantém a ordem de inserção, por isso a primeira chave
  // é a mais antiga.
  while (fingerprintMemo.size > FINGERPRINT_LRU) {
    const oldest = fingerprintMemo.keys().next().value;
    if (oldest === undefined) break;
    fingerprintMemo.delete(oldest);
  }
  return index;
}

/**
 * Acrescenta ao índice em memória o que ACABOU de ser escrito na pasta.
 *
 * É isto que substitui reconstruir o índice a cada foto (ver a armadilha em
 * `FINGERPRINT_TTL_MS`): sabemos exatamente o que mudou, por isso não é
 * preciso voltar a perguntar ao Storage. Sem índice em memória não faz nada —
 * a próxima leitura constrói-o já com a foto lá dentro.
 */
export function noteThemeFingerprint(
  themeId: string,
  entry: { hash?: string | null; md5?: string | null; path?: string },
): void {
  const folder = themeFolder(themeId);
  if (!folder) return;
  const hit = fingerprintMemo.get(folder);
  if (!hit) return;
  if (entry.hash) hit.index.hashes.add(entry.hash);
  if (entry.md5 && entry.path) hit.index.md5s.set(entry.md5, entry.path);
}

/**
 * Esquece o índice de um tema. Chamado por tudo o que REMOVE da pasta —
 * apagar uma foto, esvaziar um tema, tirar fotos ao mover.
 *
 * Só nas remoções: uma remoção retira do índice, e nada em memória sabe o que
 * é preciso retirar (o `hashes` não guarda caminhos). Deitar fora é a resposta
 * certa e é rara; deitar fora às escritas é que era o desastre de desempenho.
 */
export function forgetThemeFingerprints(themeId: string): void {
  const folder = themeFolder(themeId);
  if (folder) fingerprintMemo.delete(folder);
}

/** MD5 de uns bytes, para comparar com o eTag da listagem (rede secundária). */
function md5Of(bytes: Buffer): string {
  return createHash("md5").update(bytes).digest("hex");
}

/**
 * Estes bytes já estão guardados neste tema? Devolve o caminho da foto que já
 * lá está, ou `null`.
 *
 * É a REDE SECUNDÁRIA — a que apanha as repetidas da biblioteca ANTIGA, cujo
 * nome é um UUID e não diz nada. Compara o MD5 dos bytes preparados com o eTag
 * que a listagem já trouxe. O preço é que os bytes dessa repetida antiga
 * viajam antes de serem recusados; só acontece para a cauda antiga, e ela
 * encolhe sozinha à medida que a biblioteca é renovada.
 *
 * Falha SEMPRE para o lado seguro: se o eTag desta instalação não for o MD5 do
 * conteúdo, ou se ela mudar de browser (os bytes preparados passam a ser
 * outros), nada casa — que é exatamente o comportamento de hoje. Um falso
 * positivo exigiria dois JPEG diferentes com o mesmo MD5.
 */
export async function findThemeImageByBytes(
  themeId: string,
  bytes: Buffer,
): Promise<string | null> {
  const index = await readThemeFingerprints(themeId);
  if (!index.ok) return null;
  return index.md5s.get(md5Of(bytes)) ?? null;
}

/**
 * Assina em bloco um conjunto de caminhos — podem ser de pastas diferentes, é
 * o mesmo bucket. Um único pedido ao Storage para todos: é o que permite
 * desenhar a lista de temas assinando só as capas em vez de todas as fotos de
 * todos os temas. Devolve `caminho → URL`; nunca lança.
 *
 * `bucket` permite assinar as MINIATURAS com as mesmas chaves (ver
 * `signThemeThumbs`), sem duplicar esta função.
 */
export async function signThemePaths(
  paths: string[],
  bucket: string = THEME_BUCKET,
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const sb = getSupabase();
  if (!sb) return urls;
  // Falhar a assinar ORIGINAIS é uma avaria (a grelha fica vazia); falhar a
  // assinar MINIATURAS é rotina numa instalação que ainda não tem nenhuma —
  // não pode encher o alerta de erros por causa de algo que já tem plano B.
  const report = (err: unknown) =>
    bucket === THEME_BUCKET
      ? log.error("theme-storage: assinatura falhou", err, { count: paths.length, bucket })
      : log.warn("theme-storage: assinatura de miniaturas falhou", {
          count: paths.length,
          bucket,
        });
  try {
    const { data, error } = await sb.storage.from(bucket).createSignedUrls(paths, SIGNED_TTL);
    if (error || !data) {
      report(error);
      return urls;
    }
    for (const s of data) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  } catch (e) {
    report(e);
  }
  return urls;
}

/**
 * Assina as MINIATURAS dos caminhos dados (mesmas chaves, outro bucket).
 *
 * As que não existem — fotos anteriores às miniaturas, ou uma miniatura que
 * falhou ao carregar — vêm sem URL do Storage e simplesmente não entram no
 * mapa; quem chama cai para o original. Um bucket de miniaturas que nem sequer
 * exista dá o mesmo resultado: mapa vazio, tudo mostrado a partir do original.
 * Nunca lança e nunca cria nada.
 */
export function signThemeThumbs(paths: string[]): Promise<Map<string, string>> {
  return signThemePaths(paths, THEME_THUMB_BUCKET);
}

/** Assina as MICRO (96 px). Mesmas regras das miniaturas: o que não existe
 *  simplesmente não entra no mapa, e quem chama cai para a miniatura. */
export function signThemeMicros(paths: string[]): Promise<Map<string, string>> {
  return signThemePaths(paths, THEME_MICRO_BUCKET);
}

/**
 * ── A OFERTA EM AVIF, E O QUE A TORNA SEGURA ─────────────────────────────
 *
 * Um `<source type="image/avif">` que dá 404 NÃO faz o navegador recuar para o
 * `<img>`: a escolha faz-se pelo `type`, uma vez, antes de haver resposta.
 * Oferecer um AVIF que não existe é uma célula vazia, sem recurso.
 *
 * O que torna isto seguro é a mesma propriedade em que as miniaturas já
 * assentam: o Supabase **só assina o que lá está**. Um caminho sem AVIF
 * simplesmente não vem no mapa, e quem desenha não o oferece. Não é uma
 * suposição — é o mesmo mecanismo que faz `signThemeThumbs` devolver um mapa
 * esparso para as fotos anteriores às miniaturas.
 */
export function signThemeAvif(paths: string[]): Promise<Map<string, string>> {
  return signThemePaths(paths, THEME_AVIF_BUCKET);
}

/** O irmão das micro, em AVIF. Ver `signThemeAvif`. */
export function signThemeAvifMicros(paths: string[]): Promise<Map<string, string>> {
  return signThemePaths(paths, THEME_AVIF_MICRO_BUCKET);
}

/**
 * Os caminhos de uma página, já com a ordem manual à frente (puro — testado).
 *
 * A pasta do Storage devolve sempre as mais recentes primeiro. Quando o tema
 * tem fotos arrumadas à mão, essas passam a valer como um PREFIXO da lista, e
 * o resto continua atrás pela ordem de sempre. É isto que permite arrastar
 * meia dúzia de fotos boas para a frente sem guardar uma cópia do catálogo.
 *
 * Devolve também `storageSkip`: quantas fotos NÃO arrumadas é preciso saltar
 * na pasta para chegar ao ponto certo — é o que mantém a paginação barata,
 * porque só se lê a pasta a partir daí.
 */
export function planOrderedPage(
  order: readonly string[],
  limit: number,
  offset: number,
): { fromOrder: string[]; storageSkip: number; needFromStorage: number } {
  const fromOrder = order.slice(offset, offset + limit);
  // Depois de esgotado o prefixo arrumado, a pasta continua de onde ficou —
  // descontando as fotos arrumadas, que já foram mostradas lá à frente.
  const storageSkip = Math.max(0, offset - order.length);
  return { fromOrder, storageSkip, needFromStorage: limit - fromOrder.length };
}

/**
 * Uma PÁGINA das fotos de um tema, mais recentes primeiro, com URL assinado do
 * original e — quando existe — da miniatura.
 *
 * É aqui que mora a promessa de escala: assina-se SÓ a página pedida, em duas
 * chamadas ao Storage (uma por bucket), em vez de assinar a pasta toda ao
 * abrir o tema. A pasta do bucket continua a ser o índice — não há lista de
 * imagens duplicada na base de dados que possa dessincronizar.
 *
 * O total é exato quando a pasta cabe na primeira página (custo zero: já
 * sabemos que acabou) e, caso contrário, é contado à parte com o orçamento de
 * `countThemeFiles`. Nunca lança.
 */
export async function listThemeImagePage(
  themeId: string,
  limit = THEME_PAGE_SIZE,
  offset = 0,
  order: readonly string[] = [],
): Promise<ThemeImagePage> {
  const size = Math.min(Math.max(1, Math.trunc(limit) || THEME_PAGE_SIZE), MAX_THEME_PAGE_SIZE);
  const from = Math.max(0, Math.trunc(offset) || 0);
  const folder = themeFolder(themeId);

  // Sem ordem manual, o caminho é o de sempre: uma leitura da pasta, uma
  // página. Com ordem manual, as arrumadas vêm à frente e a pasta continua
  // atrás — saltando as que já foram mostradas no prefixo.
  const arranged = order.filter((p) => themeIdOfPath(p) === folder);
  const plan = planOrderedPage(arranged, size, from);
  const arrangedSet = new Set(arranged);

  let paths: string[] = [...plan.fromOrder];
  let listed: ThemeFileList = { names: [], ok: true, truncated: false };
  if (plan.needFromStorage > 0) {
    listed = await listThemeFiles(
      themeId,
      plan.needFromStorage + arrangedSet.size,
      plan.storageSkip,
    );
    // Pasta ilegível: NÃO é "tema sem fotos". Quem chama tem de o dizer assim.
    if (!listed.ok) return { ok: false, images: [], total: 0, truncated: false };
    for (const name of listed.names) {
      if (paths.length >= size) break;
      const path = `${folder}/${name}`;
      // As arrumadas já saíram no prefixo — mostrá-las outra vez aqui era
      // repeti-las a meio da grelha.
      if (arrangedSet.has(path)) continue;
      paths.push(path);
    }
  } else {
    paths = paths.slice(0, size);
  }
  // Os três EM PARALELO. O LQIP é a única leitura que não vai ao Storage, e
  // pô-la em série atrás das assinaturas somaria a latência da base de dados ao
  // caminho crítico da grelha — para servir precisamente aquilo que existe
  // para o caminho crítico ser mais curto.
  //
  // A COR vem na mesma consulta do borrão (é a mesma linha): é ela que deixa
  // a capa escolhida AQUI chegar ao cartão com a cor do lugar — ver
  // `capa-do-cartao.ts` e `ThemeSummary.coverCor`. Não custa ida nenhuma.
  const nenhum = {
    lqips: new Map<string, string>(),
    cores: new Map<string, string>(),
    formas: new Map<string, { largura: number; altura: number }>(),
  };
  const [urls, thumbs, { lqips, cores, formas }] = await Promise.all([
    signThemePaths(paths),
    paths.length > 0 ? signThemeThumbs(paths) : Promise.resolve(new Map<string, string>()),
    paths.length > 0 ? lqipsECoresDeCaminhos(paths) : Promise.resolve(nenhum),
  ]);
  const images: ThemeImage[] = paths
    .map((path) => {
      const thumbUrl = thumbs.get(path);
      const lqip = lqips.get(path);
      const cor = cores.get(path);
      const forma = formas.get(path);
      return {
        path,
        url: urls.get(path) ?? "",
        ...(thumbUrl ? { thumbUrl } : {}),
        ...(lqip ? { lqip } : {}),
        ...(cor ? { cor } : {}),
        ...(forma ? { largura: forma.largura, altura: forma.altura } : {}),
      };
    })
    .filter((im) => im.url);

  // Primeira página que não veio cheia: a pasta acabou aqui, o total já é este
  // e não se gasta nem mais uma ida ao Storage (o caso normal de um tema
  // pequeno). Caso contrário conta-se a sério.
  //
  // Com ordem manual esta conta deixa de fechar — a página mistura o prefixo
  // arrumado com a pasta —, por isso aí conta-se sempre. É o preço, uma
  // chamada, de um tema que alguém arrumou à mão.
  if (arranged.length === 0 && from === 0 && !listed.truncated) {
    return { ok: true, images, total: listed.names.length, truncated: false };
  }
  const counted = await countThemeFiles(themeId);
  // A contagem pode ter batido no teto, ou falhado a meio depois de a PÁGINA
  // já ter sido lida. Nos dois casos o que sabemos ao certo é que existem pelo
  // menos as que já vimos: devolve-se isso, marcado como mínimo, em vez de um
  // total mais pequeno do que a própria página.
  const floor = from + paths.length;
  return {
    ok: true,
    images,
    total: Math.max(counted.total, floor),
    truncated: counted.truncated || !counted.ok,
  };
}

/**
 * Apaga miniaturas — melhor esforço, sempre. Nunca lança, nunca cria o bucket
 * e o resultado NÃO conta para o sucesso da operação que a chamou: uma
 * miniatura órfã é lixo invisível e barato, uma foto que não se consegue
 * apagar é que era um problema.
 */
async function removeThumbs(paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const { error } = await sb.storage.from(THEME_THUMB_BUCKET).remove(paths);
    if (error) {
      log.warn("theme-storage: miniaturas não apagadas", { count: paths.length });
      return false;
    }
    return true;
  } catch (e) {
    log.warn("theme-storage: miniaturas não apagadas", { count: paths.length, erro: String(e) });
    return false;
  }
}

/** Apaga uma foto do tema (e a sua miniatura). `true` se o Storage confirmou
 *  a remoção do ORIGINAL — a miniatura é acessório e não decide nada. */
export async function deleteThemeImage(path: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb || !isThemePath(path) || !(await ensureBucket(THEME_BUCKET))) return false;
  const { error } = await sb.storage.from(THEME_BUCKET).remove([path]);
  if (error) {
    log.error("theme-storage: remove falhou", error, { path });
    return false;
  }
  invalidateThemeCount(themeIdOfPath(path));
  // Uma REMOÇÃO tira do índice, e nada em memória sabe o quê (o conjunto de
  // resumos não guarda caminhos): deita-se fora e reconstrói-se à próxima.
  forgetThemeFingerprints(themeIdOfPath(path));
  await removeThumbs([path]);
  return true;
}

// ── A Reciclagem (fase R3b de `docs/TUDO-REVERSIVEL.md`) ──────────────────
//
// Uma foto removida de um tema que CONTINUA vivo tem de sair da pasta: a pasta
// é a fonte da verdade do que o tema mostra. Vai para `reciclagem/<entrada>/`
// no mesmo bucket, com `move` — atómico por foto, como o `transferThemeImage`.
// A miniatura e as outras derivadas ficam onde estão: nada as lista sem o
// original, e ao repor a foto volta ao MESMO caminho e reencontra-as.
//
// O caminho na Reciclagem tem dois níveis, de propósito: o `isThemePath` só
// aceita um, e portanto nenhuma porta de temas lhe chega por engano.

/** A pasta, à raiz do bucket das fotos, onde esperam as fotos removidas. */
export const PASTA_DA_RECICLAGEM = "reciclagem";

/** `reciclagem/<entrada>/<ficheiro>`, ou `null` se algum dos dois for estranho. */
export function caminhoNaReciclagem(path: string, entradaId: string): string | null {
  if (!isThemePath(path) || !/^[a-zA-Z0-9-]{1,64}$/.test(entradaId)) return null;
  return `${PASTA_DA_RECICLAGEM}/${entradaId}/${path.slice(path.indexOf("/") + 1)}`;
}

const naReciclagemValido = (c: string) =>
  /^reciclagem\/[a-zA-Z0-9-]{1,64}\/[a-zA-Z0-9_-]+\.(jpe?g|png|webp)$/.test(c);

/** Tira uma foto do tema para a Reciclagem. `true` se o Storage a mudou. */
export async function levarFotoParaAReciclagem(path: string, destino: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb || !isThemePath(path) || !naReciclagemValido(destino)) return false;
  if (!(await ensureBucket(THEME_BUCKET))) return false;
  try {
    const { error } = await sb.storage.from(THEME_BUCKET).move(path, destino);
    if (error) {
      log.error("theme-storage: foto não foi para a Reciclagem", error, { path });
      return false;
    }
  } catch (e) {
    log.error("theme-storage: foto não foi para a Reciclagem", e, { path });
    return false;
  }
  invalidateThemeCount(themeIdOfPath(path));
  forgetThemeFingerprints(themeIdOfPath(path));
  return true;
}

/**
 * Devolve a foto ao tema, no MESMO caminho.
 *  · `"ok"`     — voltou;
 *  · `"existe"` — já há uma foto com aquele nome no tema (a mesma, carregada
 *                 outra vez): não se pisa;
 *  · `"falhou"` — o Storage recusou, e a foto continua na Reciclagem.
 */
export async function trazerFotoDaReciclagem(
  path: string,
  origem: string,
): Promise<"ok" | "existe" | "falhou"> {
  const sb = getSupabase();
  if (!sb || !isThemePath(path) || !naReciclagemValido(origem)) return "falhou";
  try {
    const { error } = await sb.storage.from(THEME_BUCKET).move(origem, path);
    if (error) {
      if (isAlreadyExists(error)) return "existe";
      log.error("theme-storage: foto não voltou da Reciclagem", error, { path });
      return "falhou";
    }
  } catch (e) {
    log.error("theme-storage: foto não voltou da Reciclagem", e, { path });
    return "falhou";
  }
  invalidateThemeCount(themeIdOfPath(path));
  forgetThemeFingerprints(themeIdOfPath(path));
  return "ok";
}

/** Há uma foto neste caminho? `null` quando não se conseguiu saber. */
export async function fotoExisteNoTema(path: string): Promise<boolean | null> {
  const sb = getSupabase();
  if (!sb || !isThemePath(path)) return null;
  const pasta = path.slice(0, path.indexOf("/"));
  const nome = path.slice(path.indexOf("/") + 1);
  try {
    const { data, error } = await sb.storage
      .from(THEME_BUCKET)
      .list(pasta, { limit: 100, search: nome });
    if (error || !data) return null;
    return data.some((o) => o.name === nome);
  } catch {
    return null;
  }
}

/**
 * A foto sai de vez da Reciclagem (ao fim dos 30 dias, ou «Apagar de vez»).
 *
 * As derivadas só saem se a foto NÃO tiver voltado ao tema entretanto: o
 * mesmo ficheiro carregado outra vez tem o mesmo nome (a impressão digital), e
 * a miniatura que ficou é já a dela. `true` quando o original guardado saiu;
 * sem Storage não há nada guardado, e também é `true`.
 */
export async function largarFotoDaReciclagem(path: string, guardada: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return true;
  if (!naReciclagemValido(guardada)) return false;
  try {
    const { error } = await sb.storage.from(THEME_BUCKET).remove([guardada]);
    if (error) {
      log.error("theme-storage: foto da Reciclagem não saiu", error, { guardada });
      return false;
    }
  } catch (e) {
    log.error("theme-storage: foto da Reciclagem não saiu", e, { guardada });
    return false;
  }
  if ((await fotoExisteNoTema(path)) === false) await removeThumbs([path]);
  return true;
}

/**
 * Esvazia a pasta de um tema (usado ao eliminar o tema).
 *
 * Percorre a pasta em páginas até uma página curta, para que um tema com mais
 * fotos do que uma página não deixe as restantes órfãs e invisíveis. `ok` é a
 * palavra da rota: só com `ok: true` é que o tema pode desaparecer da lista —
 * caso contrário a eliminação é recusada e pode ser repetida.
 *
 * As miniaturas saem no fim e à parte: são derivadas, e não conseguir apagá-las
 * nunca pode impedir eliminar um tema.
 */
export async function deleteThemeFolder(
  themeId: string,
): Promise<{ ok: boolean; removed: number }> {
  const sb = getSupabase();
  if (!sb || !(await ensureBucket(THEME_BUCKET))) return { ok: false, removed: 0 };
  const folder = themeFolder(themeId);
  if (!folder) return { ok: false, removed: 0 };

  // 1) Recolhe TUDO antes de apagar: apagar à medida que se lista mexeria nos
  //    índices da própria paginação.
  const paths: string[] = [];
  let complete = false;
  for (let page = 0; page < MAX_DELETE_PAGES; page++) {
    const listed = await listThemeFiles(themeId, PAGE, page * PAGE);
    if (!listed.ok) return { ok: false, removed: 0 };
    paths.push(...listed.names.map((n) => `${folder}/${n}`));
    if (!listed.truncated) {
      complete = true;
      break;
    }
  }
  if (!complete) {
    // Uma pasta com mais de 20 000 fotos não é um caso real — é um sinal de
    // avaria. Apagamos o que já temos e recusamos (a repetição continua a
    // limpar), em vez de eliminar o tema deixando fotos para trás.
    log.error("theme-storage: limpeza da pasta atingiu o teto de páginas", null, {
      themeId,
      pages: MAX_DELETE_PAGES,
    });
  }

  // 2) Remove em lotes do mesmo tamanho da página.
  let removed = 0;
  for (let i = 0; i < paths.length; i += PAGE) {
    const chunk = paths.slice(i, i + PAGE);
    try {
      const { data, error } = await sb.storage.from(THEME_BUCKET).remove(chunk);
      if (error) {
        log.error("theme-storage: limpeza da pasta falhou", error, { themeId });
        return { ok: false, removed };
      }
      removed += data?.length ?? chunk.length;
    } catch (e) {
      log.error("theme-storage: limpeza da pasta falhou", e, { themeId });
      return { ok: false, removed };
    }
  }

  invalidateThemeCount(themeId);
  forgetThemeFingerprints(themeId);

  // 3) E só então as miniaturas: são derivadas, e o seu destino não pode
  //    influenciar o resultado. Se a limpeza das fotos tivesse falhado
  //    saíamos acima — apagar miniaturas de fotos que ficaram lá só faria a
  //    grelha voltar a puxar originais de 3 MB.
  await purgeThumbFolder(folder);

  return { ok: complete, removed };
}

/**
 * Esvazia a pasta de miniaturas de um tema. Melhor esforço declarado: percorre
 * o que conseguir, regista o que falhar e devolve sempre `void` — nada aqui
 * pode impedir um tema de ser eliminado. Não cria o bucket: numa instalação
 * anterior às miniaturas não há nada para apagar.
 */
async function purgeThumbFolder(folder: string): Promise<void> {
  const sb = getSupabase();
  if (!sb || !folder) return;
  try {
    for (let page = 0; page < MAX_DELETE_PAGES; page++) {
      const { data, error } = await sb.storage.from(THEME_THUMB_BUCKET).list(folder, {
        limit: PAGE,
        offset: 0, // apaga-se sempre a primeira página: a pasta encolhe a cada volta
        sortBy: { column: "created_at", order: "desc" },
      });
      if (error || !data) return;
      const names = data.filter((o) => o.id && !o.name.startsWith(".")).map((o) => o.name);
      if (names.length === 0) return;
      // Sem confirmação da remoção, parar: insistir só voltaria a pedir a
      // mesma página, que continua lá.
      if (!(await removeThumbs(names.map((n) => `${folder}/${n}`)))) return;
      if (data.length < PAGE) return;
    }
  } catch (e) {
    log.warn("theme-storage: limpeza das miniaturas falhou", { folder, erro: String(e) });
  }
}

/**
 * Bytes de uma foto do tema, para copiar para a pasta de uma proposta.
 * Aceita SÓ caminhos do bucket de temas — nunca URLs — para que um caminho
 * vindo do cliente não possa apontar para outro sítio.
 */
export async function fetchThemeImageBytes(path: string): Promise<Buffer | null> {
  const sb = getSupabase();
  if (!sb || !isThemePath(path)) return null;
  try {
    const { data, error } = await sb.storage.from(THEME_BUCKET).download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch (e) {
    log.error("theme-storage: download falhou", e, { path });
    return null;
  }
}

/**
 * ESCOLHER UM LOTE de fotos da Biblioteca para uma proposta.
 *
 * ── O que mudou aqui, e porquê ────────────────────────────────────────────
 * Isto chamava-se `importarFotosDaBiblioteca` e COPIAVA os bytes para a pasta
 * da proposta. Agora não copia nada: devolve `tema:<caminho>` e a foto fica
 * onde está. O raciocínio completo está em `theme-ref.ts`; em duas linhas:
 *
 *   A cópia dava à foto uma identidade NOVA (`proposal-assets/<pedido>/<uuid>`)
 *   e, com isso, deitava fora a cache do navegador e do service worker sobre a
 *   foto que ele tinha ACABADO de descarregar no seletor. Importar catorze
 *   fotos fazia a grelha do estúdio voltar a puxar catorze miniaturas que já
 *   estavam no disco do telemóvel.
 *
 * O que isso muda, medido em idas ao Storage:
 *
 *     copiava:      ceil(N/8) + 1 idas,  e N × (576 KB + 20 KB) de bytes novos
 *     referencia:   1 ida (duas assinaturas em paralelo),  0 bytes novos
 *
 * ── O que se mantém, e é de propósito ─────────────────────────────────────
 * · A ORDEM é a que ela pediu — as referências saem na ordem em que entraram.
 * · Uma foto sem URL sai da lista e o seu caminho é devolvido em `failed`,
 *   para o estúdio a poder manter seleccionada.
 * · Uma miniatura em falta não é avaria: a foto entra na mesma e a grelha cai
 *   para o original, como já fazia.
 * · **Uma proposta já enviada não pode perder fotos.** Era esta a razão de ser
 *   da cópia, e continua a ser respeitada — mas noutro sítio: apagar da
 *   Biblioteca copia primeiro para quem referencia. Ver
 *   {@link materializarAntesDeApagar}.
 *
 * Os caminhos JÁ COPIADOS por propostas anteriores não são tocados: continuam
 * a ser `<pedido>/<uuid>.jpg` no bucket das propostas e a resolver como sempre.
 * Nada migra.
 *
 * @returns as referências pela ordem pedida (sem as falhadas) e o que falhou.
 */
export async function referenciarFotosDaBiblioteca(themePaths: readonly string[]): Promise<{
  images: { path: string; url: string; thumbUrl?: string; sourcePath: string }[];
  failed: string[];
}> {
  const validos = themePaths.filter(isThemePath);
  const invalidos = themePaths.filter((p) => !isThemePath(p));
  if (validos.length === 0) return { images: [], failed: [...themePaths] };

  // Uma ida: as duas assinaturas em paralelo, cada uma um pedido para o lote
  // inteiro. Com 1 foto ou com 40, é a mesma espera.
  const refs = validos.map(refDeTema);
  const [urls, thumbs] = await Promise.all([signProposalPaths(refs), signProposalThumbs(refs)]);

  const images = validos
    .map((themePath) => {
      const ref = refDeTema(themePath);
      const url = urls.get(ref) ?? "";
      const thumbUrl = thumbs.get(ref);
      return { path: ref, url, sourcePath: themePath, ...(thumbUrl ? { thumbUrl } : {}) };
    })
    // Sem URL a foto é inútil para o estúdio — conta como falhada, com
    // honestidade, em vez de aparecer como uma célula vazia.
    .filter((im) => im.url);

  const semUrl = validos.filter((p) => !urls.get(refDeTema(p)));
  return { images, failed: [...invalidos, ...semUrl] };
}

/**
 * Copia uma foto do tema para a pasta de uma proposta e devolve o novo
 * caminho + URL assinado, no formato que o estúdio já usa.
 *
 * A cópia é feita DENTRO do Storage (`copy` com `destinationBucket`), sem os
 * bytes passarem por aqui — um lote de 40 fotos deixa de puxar dezenas de MB
 * para a função e voltar a enviá-los. Se o Storage recusar a cópia, cai no
 * caminho antigo (download + upload), que dá o mesmo resultado mais devagar.
 *
 * O destino é construído NO SERVIDOR, com o mesmo layout do
 * `uploadProposalImage` (`<quoteId>/<uuid>.<ext>`), para que nada a jusante
 * consiga notar que a foto veio de uma cópia.
 */
export async function copyThemeImageToProposal(
  themePath: string,
  quoteId: string,
): Promise<{ path: string; url: string; thumbUrl?: string } | null> {
  // O caminho vem do cliente: valida-o ANTES de tocar no Storage.
  if (!isThemePath(themePath)) return null;
  const sb = getSupabase();
  if (!sb || !(await ensureProposalBucket())) return null;
  const safeQuoteId = quoteId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeQuoteId) return null;

  const contentType = contentTypeForPath(themePath);
  const dest = `${safeQuoteId}/${randomUUID()}.${extFor(contentType)}`;
  try {
    const { error } = await sb.storage
      .from(THEME_BUCKET)
      .copy(themePath, dest, { destinationBucket: PROPOSAL_BUCKET });
    if (!error) {
      const { data } = await sb.storage
        .from(PROPOSAL_BUCKET)
        .createSignedUrl(dest, PROPOSAL_COPY_TTL);
      const thumbUrl = await copiarMiniaturaParaProposta(themePath, dest);
      const copia = { path: dest, url: data?.signedUrl ?? "" };
      return thumbUrl ? { ...copia, thumbUrl } : copia;
    }
    log.warn("theme-storage: cópia no Storage falhou, a descarregar", {
      themePath,
      erro: error.message,
    });
  } catch (e) {
    log.error("theme-storage: cópia no Storage falhou", e, { themePath });
  }

  // Recurso: puxar os bytes e voltar a carregá-los.
  const bytes = await fetchThemeImageBytes(themePath);
  if (!bytes) return null;
  const carregada = await uploadProposalImage(quoteId, bytes, contentType);
  if (!carregada) return null;
  const thumbUrl = await copiarMiniaturaParaProposta(themePath, carregada.path);
  return thumbUrl ? { ...carregada, thumbUrl } : carregada;
}

/**
 * Leva a miniatura do tema com a foto, quando a foto é copiada para uma
 * proposta.
 *
 * Sem isto, uma foto escolhida da Biblioteca chegava à proposta SEM miniatura —
 * e a grelha do estúdio voltava a puxar o original por célula, que é
 * exactamente o que as miniaturas vieram resolver. O tema já tem a sua; é só
 * copiá-la para a chave nova.
 *
 * Melhor esforço do princípio ao fim: a foto boa já está copiada quando isto
 * corre, e falhar aqui deixa a proposta a cair para o original — o
 * comportamento de antes. Nunca lança e nunca impede uma importação.
 */
async function copiarMiniaturaParaProposta(themePath: string, dest: string): Promise<string> {
  const sb = getSupabase();
  if (!sb) return "";
  try {
    const { error } = await sb.storage
      .from(THEME_THUMB_BUCKET)
      .copy(themePath, dest, { destinationBucket: PROPOSAL_THUMB_BUCKET });
    // Sem miniatura no tema (foto anterior às miniaturas) não é avaria nenhuma.
    if (error) return "";
    const { data } = await sb.storage
      .from(PROPOSAL_THUMB_BUCKET)
      .createSignedUrl(dest, PROPOSAL_COPY_TTL);
    return data?.signedUrl ?? "";
  } catch {
    return "";
  }
}

// ── Levar fotos de um tema para outro ──────────────────────────────────────

/** O que aconteceu a uma foto que se tentou levar para outro tema. */
export type ThemeTransferOutcome =
  /** Ficou no destino (e, ao mover, saiu da origem). */
  | "copied"
  /** JÁ estava no destino. Não é um erro e não pode aparecer a vermelho. */
  | "exists"
  /** Não foi possível — continua na origem, intacta. */
  | "failed";

/**
 * Leva UMA foto para outro tema, PRESERVANDO O NOME DO FICHEIRO.
 *
 * ESTA É A DECISÃO QUE MANDA EM TUDO O RESTO: `temaA/2f9c….jpg` vai para
 * `temaB/2f9c….jpg` — mesmo nome, outra pasta, nunca um nome novo. Porquê:
 *
 *  · "esta foto já está no destino?" passa a ser uma COLISÃO DE CHAVE, que o
 *    próprio Storage responde (409) sem ler um único byte, sem hash, sem
 *    índice, sem tocar na regra "a pasta é a única fonte de verdade";
 *  · a operação fica IDEMPOTENTE — repetir o mesmo lote não cria duplicados,
 *    devolve "já lá estavam". É isto que faz o "Tentar novamente" de uma falha
 *    parcial ser seguro em vez de perigoso;
 *  · a IDENTIDADE VIAJA COM A FOTO. Desde que o nome é o resumo do ficheiro
 *    original (ver `theme-fingerprint.ts`), o tema de destino fica a saber que
 *    tem aquela foto — largar depois o ficheiro original em B é corretamente
 *    detetado como repetido. Cunhar um UUID novo aqui abriria um buraco
 *    permanente no índice do destino, por cada foto copiada.
 *
 * O destino é construído NO SERVIDOR a partir do `destThemeId` — o caminho de
 * destino nunca é aceite do cliente.
 *
 * SEM RECURSO A DESCARREGAR-E-VOLTAR-A-CARREGAR, ao contrário do
 * `copyThemeImageToProposal`: ali a cópia atravessa buckets (pode não ser
 * suportada) e protege um PDF já prometido a um cliente; aqui é o MESMO
 * bucket, a operação mais básica que há. O recurso custaria 109 MB a
 * atravessar a função por lote de 40 (2,6 MB × 40 + miniaturas), com
 * `maxDuration: 60` a rebentar antes do fim — e recodificar os bytes partiria
 * a identidade de conteúdo de que a deteção de repetidas depende. Uma falha é
 * uma falha reportada e repetível, não um plano B caro.
 */
export async function transferThemeImage(
  fromPath: string,
  destThemeId: string,
  mode: "copy" | "move",
): Promise<{ outcome: ThemeTransferOutcome; to: string; thumb: boolean }> {
  const nowhere = { outcome: "failed" as const, to: "", thumb: false };
  // O caminho vem do cliente: valida-o ANTES de tocar no Storage.
  if (!isThemePath(fromPath)) return nowhere;
  const folder = themeFolder(destThemeId);
  if (!folder) return nowhere;
  const name = fromPath.slice(fromPath.indexOf("/") + 1);
  const to = `${folder}/${name}`;
  // Copiar uma foto para cima de si própria não é uma operação: seria pedir ao
  // Storage para escrever na chave que está a ler.
  if (to === fromPath) return nowhere;

  const sb = getSupabase();
  if (!sb || !(await ensureBucket(THEME_BUCKET))) return nowhere;

  try {
    const bucket = sb.storage.from(THEME_BUCKET);
    // `move` e não "copy + remove": é o que torna o mover ATÓMICO por foto —
    // nunca existe um instante em que a foto não esteja em lado nenhum.
    const { error } =
      mode === "move" ? await bucket.move(fromPath, to) : await bucket.copy(fromPath, to);
    if (error) {
      if (isAlreadyExists(error)) {
        // Já lá estava. Ao MOVER, a origem NÃO é apagada de propósito: apagar
        // seria inferir, a partir do nome, que os bytes são os mesmos. Fica
        // selecionada e a UI diz "já estava em «X» — ficou aqui".
        return { outcome: "exists", to, thumb: true };
      }
      log.error("theme-storage: transferência falhou", error, { fromPath, to, mode });
      return { outcome: "failed", to, thumb: false };
    }
  } catch (e) {
    log.error("theme-storage: transferência falhou", e, { fromPath, to, mode });
    return { outcome: "failed", to, thumb: false };
  }

  invalidateThemeCount(destThemeId);
  noteThemeFingerprint(destThemeId, { hash: fingerprintOfFileName(name), path: to });
  if (mode === "move") {
    invalidateThemeCount(themeIdOfPath(fromPath));
    forgetThemeFingerprints(themeIdOfPath(fromPath));
  }

  // AS DERIVADAS VÃO NO MESMO GESTO — e é a diferença entre 1,78 MB e 164 MB.
  //
  // Sem a miniatura, o tema de destino puxa ORIGINAIS: com os números já
  // apurados neste repositório (2,6 MB por original, 29 KB por miniatura), uma
  // página de 60 fotos passa de 1,78 MB / 0,3 s para 164 MB / 26 s a 50 Mbit/s
  // — 92× mais bytes, e o mesmo 26 s que a rota `/miniaturas` já mediu em
  // bancada. Repará-la depois custaria 818 MB por 300 fotos; copiá-la custa
  // uma chamada e zero bytes.
  //
  // São DUAS e não uma: a miniatura de 400 px e a MICRO de 96 px (as três tiras
  // de pré-visualização do cartão de tema). Levar só a miniatura fazia duas
  // avarias de uma vez — ao mover, a micro ficava órfã na origem a apontar para
  // uma foto que já lá não está; e o cartão do destino voltava a desenhar
  // 43 × 42 px com o ficheiro de 400 px, que são os 91% de bytes a mais que a
  // micro existe para poupar.
  //
  // Melhor esforço absoluto: NUNCA muda o `outcome` e NUNCA cria os buckets das
  // derivadas (numa instalação antiga não há derivada nenhuma para copiar, e o
  // 404 é ignorado — a foto chega ao destino exatamente no estado em que estava
  // na origem, e o banner de reparação cobre-a).
  const levarDerivada = async (nomeDoBucket: string) => {
    try {
      const derivadas = sb.storage.from(nomeDoBucket);
      const { error } =
        mode === "move" ? await derivadas.move(fromPath, to) : await derivadas.copy(fromPath, to);
      if (error && !isAlreadyExists(error) && !isNotFound(error)) {
        log.warn("theme-storage: derivada não acompanhou a foto", {
          bucket: nomeDoBucket,
          fromPath,
          to,
          mode,
        });
      }
      return !error || isAlreadyExists(error);
    } catch (e) {
      log.warn("theme-storage: derivada não acompanhou a foto", {
        bucket: nomeDoBucket,
        fromPath,
        erro: String(e),
      });
      return false;
    }
  };

  // Só a MINIATURA entra no veredicto que sai daqui: é sobre ela que o painel
  // conta as "N sem miniatura" a seguir a um lote. Uma micro em falta não é a
  // mesma coisa — quem não a encontra cai na miniatura, e o pior que acontece
  // é uma tira de pré-visualização mais pesada.
  const [thumb] = await Promise.all([
    levarDerivada(THEME_THUMB_BUCKET),
    levarDerivada(THEME_MICRO_BUCKET),
  ]);

  return { outcome: "copied", to, thumb };
}
