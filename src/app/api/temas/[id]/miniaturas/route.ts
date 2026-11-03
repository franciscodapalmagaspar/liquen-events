import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { isAuthed } from "@/lib/admin-auth";
import { getTheme } from "@/lib/themes-store";
import {
  THEME_THUMB_BUCKET,
  countThemeFiles,
  fetchThemeImageBytes,
  listThemeFiles,
  themeFolder,
} from "@/lib/theme-storage";
import { BUCKET_FILE_SIZE_LIMIT, UPLOAD_MIME_TYPES } from "@/lib/proposal-storage";
import { getSupabase, isDatabaseConfigured } from "@/lib/supabase";
import { MINIATURA } from "@/lib/derivadas-medidas";
import { log } from "@/lib/logger";
import { comCpu } from "@/lib/medir-cpu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * MINIATURAS EM FALTA — o remendo para a biblioteca que já existe.
 *
 * As miniaturas passaram a ser feitas no navegador ao carregar a foto. Tudo o
 * que foi carregado ANTES disso — a biblioteca inteira da Catarina — não tem
 * nenhuma, e a grelha cai no original: cada célula de 150 px puxa 2,6 MB. Uma
 * página de 60 fotos são ~150 MB e (medido, a 50 Mbit/s) 26 segundos até a
 * última aparecer. Com miniaturas a mesma página são 1,5 MB.
 *
 * Esta rota anda pela pasta de um tema e gera, com `sharp`, a miniatura que
 * falta a cada foto. Porquê no servidor e não no navegador: para fazer a
 * miniatura no browser era preciso DESCARREGAR o original (2,6 MB × 4000) para
 * a máquina dela e voltar a subir — o dobro da rede, na ponta mais fraca da
 * ligação. Aqui os bytes andam entre o Storage e a função, na mesma casa.
 *
 * COMO É CHAMADA: um POST por lote, com o `cursor` que o lote anterior
 * devolveu. É o cliente que dá corda ao relógio, e é isso que a torna:
 *   · RETOMÁVEL — fechar o separador a meio não perde nada; recomeçar do mesmo
 *     cursor (ou do zero: o que já tem miniatura é saltado) acaba o trabalho;
 *   · SEM BLOQUEIO — cada pedido é curto e a página fica a responder entre eles;
 *   · HONESTA — cada resposta diz quantas viu, quantas gerou e quantas falharam.
 *
 * O ORIGINAL NUNCA É TOCADO: só se LÊ o bucket das fotos; só se ESCREVE no
 * bucket das miniaturas, e sempre na mesma chave do original (é a regra que já
 * existe: `theme-assets/<tema>/<uuid>.jpg` → `theme-thumbs/<tema>/<uuid>.jpg`).
 *
 * SEGURANÇA: o cliente manda um NÚMERO, e mais nada. Os caminhos são
 * construídos aqui a partir da listagem da pasta deste tema, por isso não há
 * caminho nenhum vindo de fora para validar — e continua a ser preciso sessão
 * de admin, como em todas as rotas de temas.
 */

/**
 * O lado e a qualidade da miniatura são a `MINIATURA` partilhada
 * (`derivadas-medidas.ts`, 400 px e q78) — os MESMOS do lote das derivadas e
 * do `scripts/derivadas-em-falta.mjs`. Eram números próprios (400 e q72,
 * copiados do `image-prep.ts` do navegador), e a mesma fotografia saía com
 * duas qualidades conforme a miniatura tivesse sido feita aqui ou no lote. O
 * formato continua JPEG: é o que esta rota sempre gravou, na chave do
 * original.
 */

/**
 * Quantas fotos se EXAMINAM por pedido. Examinar é barato (uma listagem de
 * metadados), gerar é que não — por isso a janela é larga: um tema que já
 * esteja quase todo feito avança 200 fotos por pedido em vez de 8.
 */
const SCAN_WINDOW = 200;

/**
 * Quantas miniaturas se GERAM por pedido.
 *
 * MEDIDO, não estimado: uma foto real de 3000 px (2,6 MB) reduzida a 400 px
 * q72 custa 37 ms de CPU (mediana de 12; o `sharp` desce a resolução ainda
 * dentro do descodificador de JPEG, por isso nem chega a montar a imagem
 * grande em memória) e sai com ~29 KB — o mesmo tamanho da miniatura que o
 * navegador faz. Um lote de 8 com três em voo são 127 ms de CPU. (Medido a
 * q72, antes de a rota passar à `MINIATURA` de q78; a q78 o ficheiro sai um
 * pouco maior e o CPU é da mesma ordem — não foi remedido.)
 *
 * Ou seja: o custo de um lote NÃO é o `sharp`, são os 8 descarregamentos de
 * 2,6 MB entre o Storage e a função. Oito é o número que mantém cada pedido
 * curto — segundos, não dezenas — para caber no `maxDuration` mesmo num dia
 * mau do Storage, e para a barra de progresso andar a olhos vistos. Subir este
 * número acelera pouco (o gargalo é a rede) e arrisca perder o lote todo num
 * tempo-limite.
 */
const MAX_PER_BATCH = 8;

/** Quantas fotos em voo dentro de um lote. Três chega para tapar a latência do
 *  Storage sem abrir uma dúzia de ligações nem empilhar bytes na memória da
 *  função — e, a 37 ms de CPU cada, o processador nunca é o problema. */
const BATCH_CONCURRENCY = 3;

/** Uma miniatura maior do que isto não é uma miniatura — é um erro nosso. */
const MAX_THUMB_BYTES = 2 * 1024 * 1024;

/**
 * MEMÓRIA CURTA DA PASTA DAS MINIATURAS.
 *
 * Para saber o que falta é preciso saber o que já lá está, e isso é listar o
 * bucket das miniaturas: numa pasta de 4000 são 4 idas ao Storage. Fazê-lo a
 * cada lote seriam 4 idas × 500 lotes. Guarda-se o conjunto de nomes durante
 * 30 s DENTRO do processo e vai-se juntando o que se gera.
 *
 * Não é um índice nem uma segunda fonte de verdade: expira sozinho e, se
 * estiver desactualizado, o pior que acontece é gerar-se uma miniatura que já
 * existia (o `upsert` escreve por cima) ou saltar-se uma que foi apagada há
 * pouco (a passagem seguinte apanha-a).
 */
const THUMB_SET_TTL_MS = 30_000;
const thumbSets = new Map<string, { at: number; names: Set<string> }>();

/** Páginas de miniaturas a listar (1000 × 20 = 20 000, o mesmo teto do resto
 *  do módulo de Storage). */
const THUMB_LIST_PAGE = 1000;
const MAX_THUMB_PAGES = 20;

/**
 * Garante o bucket das miniaturas. Numa instalação anterior às miniaturas ele
 * NÃO existe — que é exatamente o caso desta rota —, por isso é aqui que ele
 * nasce, com os mesmos limites do bucket das fotos (privado, formatos e
 * tamanho travados). Idempotente e silencioso perante uma corrida.
 */
async function ensureThumbBucket(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const { data } = await sb.storage.getBucket(THEME_THUMB_BUCKET);
    if (data) return true;
    const { error } = await sb.storage.createBucket(THEME_THUMB_BUCKET, {
      public: false,
      fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
      allowedMimeTypes: UPLOAD_MIME_TYPES,
    });
    if (error && !/exist/i.test(error.message)) {
      log.error("miniaturas: createBucket falhou", error, {});
      return false;
    }
    return true;
  } catch (e) {
    log.error("miniaturas: ensureThumbBucket falhou", e, {});
    return false;
  }
}

/** Os nomes das miniaturas que já existem na pasta deste tema. `null` = não foi
 *  possível ler (e aí não se gera nada às cegas: seria refazer o que já existe). */
async function existingThumbNames(folder: string): Promise<Set<string> | null> {
  const hit = thumbSets.get(folder);
  if (hit && Date.now() - hit.at < THUMB_SET_TTL_MS) return hit.names;
  const sb = getSupabase();
  if (!sb) return null;
  const names = new Set<string>();
  try {
    for (let page = 0; page < MAX_THUMB_PAGES; page++) {
      const { data, error } = await sb.storage.from(THEME_THUMB_BUCKET).list(folder, {
        limit: THUMB_LIST_PAGE,
        offset: page * THUMB_LIST_PAGE,
      });
      if (error || !data) return null;
      for (const o of data) if (o.id && !o.name.startsWith(".")) names.add(o.name);
      if (data.length < THUMB_LIST_PAGE) break;
    }
  } catch (e) {
    log.warn("miniaturas: listagem falhou", { folder, erro: String(e) });
    return null;
  }
  thumbSets.set(folder, { at: Date.now(), names });
  return names;
}

/**
 * Gera e guarda a miniatura de UMA foto. Devolve `true` se ficou guardada.
 *
 * Nunca lança e nunca toca no original: lê os bytes da foto, reduz para 400 px
 * de lado maior e escreve na mesma chave, no bucket das miniaturas. Uma foto
 * corrompida (ou que o `sharp` não leia) devolve `false` e o lote segue — uma
 * foto má não pode travar as 3999 seguintes.
 */
async function makeThumb(path: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const bytes = await fetchThemeImageBytes(path);
    if (!bytes) return false;
    const thumb = await sharp(bytes, { failOn: "none" })
      // `rotate()` sem argumentos = aplica a orientação do EXIF. Sem isto uma
      // foto de telemóvel deitada aparecia deitada só na miniatura.
      .rotate()
      .resize(MINIATURA.lado, MINIATURA.lado, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: MINIATURA.qualidade, progressive: false, chromaSubsampling: "4:2:0" })
      .toBuffer();
    if (thumb.byteLength === 0 || thumb.byteLength > MAX_THUMB_BYTES) return false;
    const { error } = await sb.storage
      .from(THEME_THUMB_BUCKET)
      // `upsert: true` porque isto é reentrante por desenho: repetir um lote
      // tem de dar o mesmo resultado, não um erro de "já existe".
      .upload(path, thumb, { contentType: "image/jpeg", upsert: true });
    if (error) {
      log.warn("miniaturas: gravação falhou", { path, erro: error.message });
      return false;
    }
    return true;
  } catch (e) {
    log.warn("miniaturas: geração falhou", { path, erro: String(e) });
    return false;
  }
}

/** Corre `worker` sobre `items` com no máximo `limit` em voo. `worker` nunca
 *  lança — cada falha é contada por quem chama. */
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        await worker(items[i]);
      }
    }),
  );
}

/** O corpo JSON do pedido, ou `null` se não for sequer JSON. */
async function body(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await request.json().catch(() => null);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * UM LOTE do trabalho. Corpo: `{ "cursor": 0 }` (ausente = começar do princípio).
 *
 * Devolve:
 *   `scanned`    — fotos examinadas neste lote
 *   `generated`  — miniaturas criadas
 *   `skipped`    — já tinham miniatura
 *   `failed`     — não foi possível gerar (foto ilegível, Storage a recusar…)
 *   `nextCursor` — por onde continuar; `null` quando a pasta acabou
 *   `total`      — fotos do tema (mínimo, se `truncated`), só para a barra
 *
 * A pasta é lida pela MESMA ordem da grelha (mais recentes primeiro), por isso
 * as primeiras miniaturas a aparecer são as das fotos que ela vê primeiro.
 */
async function POST_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Armazenamento indisponível." }, { status: 503 });
  }
  const { id } = await params;
  try {
    const theme = await getTheme(id);
    if (!theme) return NextResponse.json({ error: "Tema não encontrado" }, { status: 404 });

    const folder = themeFolder(id);
    if (!folder) return NextResponse.json({ error: "Tema inválido." }, { status: 400 });

    const raw = (await body(request))?.cursor;
    const n = Number(raw);
    const cursor = Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;

    if (!(await ensureThumbBucket())) {
      return NextResponse.json({ error: "Armazenamento indisponível." }, { status: 503 });
    }

    // A pasta das fotos, tal como a grelha a vê. Ilegível = 503 retomável: o
    // cliente volta a tentar do MESMO cursor e não perde o trabalho já feito.
    const listed = await listThemeFiles(id, SCAN_WINDOW, cursor);
    if (!listed.ok) {
      return NextResponse.json({ error: "Não foi possível ler a pasta do tema." }, { status: 503 });
    }

    const have = await existingThumbNames(folder);
    if (!have) {
      return NextResponse.json(
        { error: "Não foi possível ler as miniaturas existentes." },
        { status: 503 },
      );
    }

    // Quantas fotos desta janela é que este lote consome: pára ao chegar às
    // `MAX_PER_BATCH` que faltam, para o pedido não crescer sem limite.
    let scanned = 0;
    let skipped = 0;
    const todo: string[] = [];
    for (const name of listed.names) {
      if (todo.length >= MAX_PER_BATCH) break;
      scanned += 1;
      if (have.has(name)) {
        skipped += 1;
        continue;
      }
      todo.push(name);
    }

    let generated = 0;
    let failed = 0;
    await pool(todo, BATCH_CONCURRENCY, async (name) => {
      const ok = await makeThumb(`${folder}/${name}`);
      if (ok) {
        generated += 1;
        // O conjunto em memória acompanha o que acabámos de escrever: sem
        // isto, um lote repetido dentro da janela dos 30 s voltava a gerar.
        have.add(name);
      } else {
        failed += 1;
      }
    });

    // A página veio curta → a pasta acabou aqui (`listThemeFiles` marca
    // `truncated` quando a página vem cheia).
    const done = !listed.truncated && scanned >= listed.names.length;
    // O cursor anda SEMPRE para a frente. Uma página cheia só de marcadores de
    // pasta dá `names` vazio: avançar zero era ficar a pedir a mesma página
    // para sempre.
    const advance = scanned > 0 ? scanned : SCAN_WINDOW;
    const counted = await countThemeFiles(id);

    return NextResponse.json({
      ok: true,
      scanned,
      generated,
      skipped,
      failed,
      nextCursor: done ? null : cursor + advance,
      total: counted.ok ? counted.total : null,
      totalTruncated: counted.truncated,
    });
  } catch (err) {
    log.error("temas miniaturas POST falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// Quanto processador gasta cada pedido (3/11) — ver `medir-cpu.ts`.
export const POST = comCpu("temas-miniaturas POST", POST_semMedida);
