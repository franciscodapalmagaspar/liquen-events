import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { isAuthed } from "@/lib/admin-auth";
import {
  uploadProposalImage,
  uploadProposalMid,
  uploadProposalThumb,
  listProposalImages,
  signProposalMids,
  signProposalPaths,
  signProposalThumbs,
} from "@/lib/proposal-storage";
import { getProposalByQuote } from "@/lib/proposals-store";
import { getProposalDraft } from "@/lib/proposal-drafts";
import { refsDeTemaNoDoc } from "@/lib/theme-materializar";
import { dimensoesReais, garantirFormatoImprimivel, motivoDaRecusa } from "@/lib/proposal-image";
import { lqipAceitavel } from "@/lib/lqip";
import { recusaDeImagem } from "@/lib/recusa-de-imagem";
import { isDatabaseConfigured } from "@/lib/supabase";
import { corNormalizada } from "@/lib/cor";
import { coresDeCaminhos, garantirFoto, updateFoto } from "@/lib/biblioteca-fotos-store";
import { log } from "@/lib/logger";
import { comCpu } from "@/lib/medir-cpu";
import { procurarExistentes, registarResumos, resumoDosBytes } from "@/lib/fotos-resumo";
import { impressaoDosBytes, registarImpressao } from "@/lib/fotos-parecidas";
import { lerEspaco, MARGEM_DAS_DERIVADAS, somarCarregado } from "@/lib/ocupacao-do-armazenamento";
import {
  PROPOSAL_BUCKET as PROPOSAL_BUCKET_DO_TRAVAO,
  PROPOSAL_MID_BUCKET,
  PROPOSAL_THUMB_BUCKET,
} from "@/lib/proposal-assinaturas";
import { isFingerprint } from "@/lib/theme-fingerprint";
import { ehRefDeTema } from "@/lib/theme-ref";

export const runtime = "nodejs";
// Carrega a foto, redimensiona-a com o sharp, guarda o original E a
// miniatura. Dez segundos não chegam para uma fotografia de telemóvel.
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB per image
// Pixel-dimension cap: a byte cap alone doesn't stop a decompression bomb (a
// tiny PNG can decode to gigapixels), which would exhaust memory when the PDF
// renderer later decodes it. 50 MP (~8660×5773) is far beyond any real photo we
// embed. Rejected at the door so a bomb can never be stored.
const MAX_PIXELS = 50_000_000;
const OK_TYPES = /^image\/(jpe?g|png|webp)$/i;

/** O documento gravado e o rascunho — os dois sítios onde as referências das
 *  fotografias desta proposta podem estar escritas. */
async function documentosDoPedido(quoteId: string): Promise<unknown[]> {
  const docs: unknown[] = [];
  try {
    const p = await getProposalByQuote(quoteId);
    if (p?.doc) docs.push(p.doc);
  } catch {
    /* sem proposta gravada — o rascunho ainda pode ter as referências */
  }
  try {
    const rascunho = await getProposalDraft(quoteId);
    if (rascunho?.doc) docs.push(rascunho.doc);
  } catch {
    /* sem rascunho */
  }
  return docs;
}

/** `<pasta>/<ficheiro>.jpg` — a forma de um caminho no bucket das propostas. */
const CAMINHO_DE_FOTO = /^[A-Za-z0-9_-]+\/[^/]+\.(?:jpe?g|png|webp)$/i;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA FOTO DESTE DOCUMENTO QUE MORA NA PASTA DE OUTRO PEDIDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A listagem do Storage é POR PASTA: `listProposalImages(id)` só vê
 * `<id>/…`. Quem assinava tudo o resto era o ramo da Biblioteca, e esse só
 * conhece as referências `tema:`.
 *
 * Fica um buraco no meio: um caminho `<outroPedido>/<uuid>.jpg` escrito no
 * documento — uma proposta copiada em que a recópia das fotos não chegou a
 * correr, ou correu a meio — não é assinado por NINGUÉM. A célula fica sem URL,
 * e o que se via era uma caixa cinzenta com a palavra «Imagem», que é
 * exactamente o sintoma que a dona do negócio descreveu. Sem retorno, sem
 * explicação e sem forma de distinguir isto de uma foto que ainda vem a
 * caminho.
 *
 * Assinar é o que devolve a fotografia ao ecrã. O ficheiro está lá — o que
 * faltava era alguém perguntar por ele.
 *
 * ── PORQUE É QUE ISTO NÃO ABRE UMA PORTA ──────────────────────────────────
 * Os caminhos saem do DOCUMENTO desta proposta, escrito no back office, e não
 * de nada que venha no pedido; e a rota inteira é `isAuthed`. É a mesma
 * confiança que o ramo da Biblioteca já deposita nas referências `tema:`.
 */
function fotosDeOutraPasta(docs: unknown[], quoteId: string): string[] {
  const safeId = quoteId.replace(/[^a-zA-Z0-9_-]/g, "");
  const fora = new Set<string>();
  const percorrer = (v: unknown): void => {
    if (typeof v === "string") {
      if (CAMINHO_DE_FOTO.test(v) && !v.startsWith(`${safeId}/`)) fora.add(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) percorrer(x);
      return;
    }
    if (v && typeof v === "object") for (const x of Object.values(v)) percorrer(x);
  };
  for (const d of docs) percorrer(d);
  return [...fora];
}

/**
 * As fotos deste pedido que NÃO estão na pasta dele, com URL fresco.
 *
 * Duas famílias, e a listagem da pasta não vê nenhuma delas:
 *
 *   · as ESCOLHIDAS DA BIBLIOTECA (`tema:<pasta>/<x>.jpg`), que vivem no bucket
 *     dos temas — sem isto, uma proposta reaberta noutro aparelho mostrava as
 *     células dos mood boards vazias;
 *   · as que ficaram na pasta de OUTRO PEDIDO — ver `fotosDeOutraPasta`.
 *
 * Onde estão umas e outras escritas: no documento gravado da proposta e no
 * rascunho do estúdio, que é exactamente onde o `theme-materializar` também as
 * vai procurar.
 *
 * Melhor esforço do princípio ao fim: sem base de dados, ou com uma proposta
 * que ainda não existe, devolve uma lista vazia e a página comporta-se como
 * antes desta funcionalidade.
 */
async function fotosForaDaPastaDoPedido(quoteId: string) {
  const docs = await documentosDoPedido(quoteId);
  const refs = new Set<string>();
  for (const d of docs) for (const r of refsDeTemaNoDoc(d)) refs.add(r);
  // E as fotos que estão na pasta de OUTRO pedido — ver `fotosDeOutraPasta`.
  for (const r of fotosDeOutraPasta(docs, quoteId)) refs.add(r);
  if (refs.size === 0) return [];

  const lista = [...refs];
  const [urls, thumbs] = await Promise.all([signProposalPaths(lista), signProposalThumbs(lista)]);
  return lista
    .map((ref) => {
      const url = urls.get(ref) ?? "";
      const thumbUrl = thumbs.get(ref);
      return { path: ref, url, ...(thumbUrl ? { thumbUrl } : {}) };
    })
    .filter((im) => im.url);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA CAIXA DE 174 px NUNCA PODE PEDIR UMA FOTOGRAFIA DE 1707 px
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As fotografias carregadas depois de as miniaturas existirem trazem `thumbUrl`
 * — o URL assinado do bucket das miniaturas, ~20 KB. As que ficaram para trás
 * não têm nenhuma, e para essas o estúdio caía para o ORIGINAL.
 *
 * O que isso custa, medido no estúdio a 1,6 Mbps com 24 células:
 *
 *     com miniatura      20 KB por célula   →   0,4 MB nas 24, 1.ª foto aos  2,5 s
 *     sem miniatura    1099 KB por célula   →  26,4 MB nas 24, 1.ª foto aos 34,0 s
 *
 * Este endereço fabrica a miniatura em falta À PRIMEIRA VEZ que alguém a pede,
 * e guarda-a (ver a rota `miniatura`). Portanto a lista deixa de ter buracos:
 * TODAS as fotos vêm com uma derivada leve para a grelha, e o original fica
 * onde deve ficar — no `url`, que é o plano B da célula e o que a lupa abre.
 *
 * Não é assinatura nenhuma: é o nosso próprio servidor, e a sessão do back
 * office vai no `<img>` como em qualquer pedido da mesma origem.
 */
function miniaturaAPedidoUrl(id: string, path: string): string {
  return `/api/orcamento/${encodeURIComponent(id)}/miniatura?ref=${encodeURIComponent(path)}`;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * E QUANDO A MINIATURA FALHA, HÁ ONDE CAIR QUE NÃO SEJA 1099 KB
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A célula do estúdio tinha DOIS degraus: a miniatura, e — a falhar essa — o
 * ORIGINAL. Nada pelo meio. Os números deste ficheiro, medidos a 1,6 Mbps com
 * 24 células:
 *
 *     miniatura (400 px)     20 KB por célula   →   0,4 MB nas 24
 *     derivada  (1200 px)  ~200 KB por célula   →   4,8 MB nas 24
 *     original  (2200 px)   1099 KB por célula  →  26,4 MB nas 24
 *
 * Uma miniatura que falhe é um acidente banal — uma assinatura de seis horas
 * que caducou numa foto da Biblioteca, um `sharp` que não correu, um pedido
 * que expirou. O que não é banal é o preço da queda: cinco vezes e meia a derivada
 * do meio, para desenhar a mesma caixa de ~100 px.
 *
 * A derivada de 1200 px já existe e já é fabricada em LOTE (`derivadas.ts`,
 * papel «essencial» nas duas famílias); o que faltava era o estúdio saber onde
 * ela está. Vai assinada e directa do Storage, como as miniaturas — sem passar
 * por nenhuma função nossa.
 *
 * ── PORQUE É QUE, AO CONTRÁRIO DA MINIATURA, NÃO HÁ ROTA A PEDIDO ─────────
 * Porque isto não é o degrau de todos os dias: é a REDE por baixo dele. A
 * miniatura é o que a grelha desenha sempre, e por isso tem de existir sempre —
 * daí `miniaturaAPedidoUrl`, que a fabrica à primeira vez. Esta só é pedida
 * quando a de cima falhou. Onde ela ainda não estiver fabricada, o campo vem
 * ausente e a cascata é a de antes (miniatura → original): pior na conta dos
 * bytes, e igual ao que já se fazia. Uma rota nova para fabricar a meio de uma
 * queda seria pôr um `sharp` no caminho de uma célula que JÁ está com
 * problemas.
 */
async function mediasAssinadas(caminhos: string[]): Promise<Map<string, string>> {
  try {
    return await signProposalMids(caminhos);
  } catch {
    // Melhor esforço, como tudo o que é derivada: sem isto a cascata volta a ter
    // dois degraus, e a grelha continua a desenhar-se.
    return new Map();
  }
}

/**
 * List every image already uploaded for this quote (each with a fresh signed
 * URL), so the studio can re-offer them on any device and re-preview images
 * whose cached URL is gone. Admin-only; returns an empty list when Storage
 * isn't configured rather than erroring.
 *
 * Junta as famílias todas — a pasta do pedido, as referências à Biblioteca e as
 * fotos que ficaram na pasta de outro pedido — numa lista só, porque o estúdio
 * guarda um mapa `caminho → URL` e não precisa de saber a diferença.
 */
async function GET_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const [proprias, daBiblioteca] = await Promise.all([
      listProposalImages(id),
      fotosForaDaPastaDoPedido(id),
    ]);
    const imagens = [...proprias, ...daBiblioteca];
    // AS CORES, num pedido só para todas.
    //
    // É com elas que o estúdio avisa que uma foto destoa da paleta do board e
    // arruma as fotos por cor. Vêm daqui — e não de um `canvas` do lado da
    // proposta — porque estas fotos chegam por URLs assinados de OUTRO domínio:
    // ler-lhes os píxeis lançaria (ver `cor-dominante.ts`).
    //
    // Melhor esforço: sem base de dados, ou com fotos anteriores a isto existir,
    // o mapa vem vazio e o estúdio comporta-se exactamente como antes.
    // As cores e as derivadas de 1200 px em PARALELO: são duas idas ao servidor
    // que não dependem uma da outra, e a grelha espera pelas duas.
    const [cores, medias] = await Promise.all([
      coresDeCaminhos(imagens.map((im) => im.path)),
      mediasAssinadas(imagens.map((im) => im.path)),
    ]);
    return NextResponse.json({
      ok: true,
      images: imagens.map((im) => {
        const cor = cores.get(im.path);
        const comCor = cor ? { ...im, cor } : im;
        // O degrau do meio da cascata. Ausente é uma resposta: quer dizer que a
        // derivada ainda não foi fabricada, e a célula cai directa ao original
        // como sempre caiu. Ver `mediasAssinadas`.
        const midUrl = medias.get(im.path);
        const comMedia = midUrl ? { ...comCor, midUrl } : comCor;
        return im.thumbUrl ? comMedia : { ...comMedia, thumbUrl: miniaturaAPedidoUrl(id, im.path) };
      }),
    });
  } catch (err) {
    // Um Storage em baixo saía daqui como 500 anónimo, sem ficar registado —
    // e o estúdio via a grelha vazia sem nada que dissesse porquê.
    log.error("assets GET falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * Admin-only upload of proposal mood-board / cover images to Supabase Storage.
 * Accepts multipart/form-data with one or more `files`; returns the stored
 * `path` + a signed `url` for each. Paths are persisted on the proposal doc so
 * the studio can re-open and re-edit a proposal without re-uploading.
 */
async function POST_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Armazenamento indisponível — configura o Supabase (SUPABASE_URL / SERVICE_ROLE_KEY).",
      },
      { status: 503 },
    );
  }
  const { id } = await params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Nenhuma imagem recebida." }, { status: 400 });
  }

  // As miniaturas vêm num campo PARALELO, alinhado por índice com `files`. O
  // browser já as fabrica na mesma descodificação que faz para encolher o
  // original (ver `image-prep.ts`), portanto chegam aqui de borla.
  //
  // São OPCIONAIS de propósito: um cliente antigo, ou um browser onde a
  // fabricação falhou, envia só o original e o carregamento corre na mesma —
  // a grelha cai para o original, que é o comportamento de hoje.
  const chaves = form.getAll("chaves").map((v) => (typeof v === "string" ? v : undefined));
  const thumbs = form.getAll("thumbs").filter((f): f is File => f instanceof File);

  /**
   * As de 1200 px, fabricadas no browser (ver `MID_EDGE` em `image-worker.ts`).
   *
   * É a derivada que a PÁGINA DO CASAL mostra — a de 400 px serve as grelhas
   * daqui. Nascia no servidor, uma a uma, à primeira vez que alguém olhava
   * para cada fotografia: um download do original, um `sharp` e um upload,
   * tudo dentro do pedido de quem estava a ver. Numa proposta acabada de
   * enviar, essa pessoa é o casal.
   *
   * Opcionais pela mesma razão que as miniaturas: um cliente antigo, ou um
   * browser onde a fabricação falhou, envia só o original e continua a
   * funcionar — a de 1200 volta a ser feita a pedido, como era.
   */
  const medias = form.getAll("medias").filter((f): f is File => f instanceof File);

  // As CORES dominantes, calculadas no browser (ver `corDe` em
  // `image-worker.ts`) e emparelhadas pela ordem, como as miniaturas.
  // Comprimentos diferentes significam que os dois lados discordam sobre o que
  // está a ser enviado: aí não se adivinha, vão todas a `null` — uma cor na
  // foto errada faria o aviso de paleta apontar a fotografia inocente.
  const coresCruas = form.getAll("cores").filter((v): v is string => typeof v === "string");
  const cores: (string | null)[] =
    coresCruas.length === files.length ? coresCruas.map(corNormalizada) : files.map(() => null);
  if (coresCruas.length > 0 && coresCruas.length !== files.length) {
    log.warn("assets: cores ignoradas (não correspondem aos ficheiros)", {
      files: files.length,
      cores: coresCruas.length,
    });
  }

  /**
   * Os LQIP, emparelhados pela ordem — a mesma regra das cores, e pela mesma
   * razão: comprimentos diferentes significam que os dois lados discordam sobre
   * o que está a ser enviado, e um placeholder na foto errada é uma mancha de
   * cor que não tem nada que ver com a fotografia que vai aparecer.
   *
   * Este caminho não os recebia. O da Biblioteca de Temas recebia — e por isso a
   * mesma página do casal tinha metade das células a abrir com placeholder e a
   * outra metade a abrir vazias, conforme a foto tivesse vindo de um sítio ou do
   * outro.
   */
  const lqipsCrus = form.getAll("lqips").filter((v): v is string => typeof v === "string");
  const lqips: (string | null)[] =
    lqipsCrus.length === files.length
      ? lqipsCrus.map((v) => (lqipAceitavel(v) ? v : null))
      : files.map(() => null);
  if (lqipsCrus.length > 0 && lqipsCrus.length !== files.length) {
    log.warn("assets: LQIP ignorados (não correspondem aos ficheiros)", {
      files: files.length,
      lqips: lqipsCrus.length,
    });
  }

  /**
   * O resumo do ficheiro ORIGINAL de cada foto, calculado no navegador antes de
   * a preparar (`fingerprintBlob`) e emparelhado pela ordem — a mesma regra das
   * cores. É com ele que uma foto que já está na Biblioteca (preparada lá com
   * outro tamanho, portanto com outros bytes) é reconhecida aqui. Opcional: sem
   * ele fica só o resumo dos bytes guardados, calculado abaixo.
   */
  /**
   * ── O TRAVÃO DO ESPAÇO (13/11, `ocupacao-do-armazenamento.ts`) ────────────
   *
   * `importacao`: o carregamento vem da importação de propostas antigas, e
   * passa pelo travão (nunca acima de 90% do plano). Conta-se o original e
   * uma margem para a média e a miniatura que vêm com ele
   * ({@link MARGEM_DAS_DERIVADAS}).
   */
  const daImportacao = form.get("importacao") === "1";
  if (daImportacao) {
    try {
      const espaco = await lerEspaco();
      const pedidos = Math.ceil(files.reduce((s, f) => s + f.size, 0) * MARGEM_DAS_DERIVADAS);
      if (espaco.conhecido && espaco.sobra < pedidos) {
        return NextResponse.json(
          {
            error:
              "O armazenamento chegou ao travão (90% do plano). A fotografia não foi guardada — junta-a depois, quando houver espaço.",
            travao: true,
          },
          { status: 507 },
        );
      }
    } catch {
      /* não se sabe — o importador já fez a conta antes de começar */
    }
  }

  const resumosCrus = form.getAll("resumos").map((v) => (typeof v === "string" ? v : ""));
  const resumosDoOriginal: (string | null)[] =
    resumosCrus.length === files.length
      ? resumosCrus.map((v) => (isFingerprint(v) ? v : null))
      : files.map(() => null);

  const uploaded: {
    path: string;
    url: string;
    thumbUrl?: string;
    cor?: string;
    /** Já estava guardada (nesta pasta ou na Biblioteca): zero bytes novos. */
    jaExistia?: true;
  }[] = [];
  for (const [indice, file] of files.entries()) {
    if (!OK_TYPES.test(file.type)) {
      return NextResponse.json(
        { error: `Formato não suportado: ${file.name}. Usa JPG, PNG ou WEBP.` },
        { status: 415 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Imagem demasiado grande: ${file.name} (máx. 12 MB).` },
        { status: 413 },
      );
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    // Reject decompression bombs by pixel count before the image is ever stored
    // or later decoded by the PDF renderer. sharp reads dimensions from the
    // header without fully decoding, so this is cheap.
    /**
     * A FORMA DA FOTOGRAFIA, GUARDADA — e não só contada.
     *
     * As colunas `largura`/`altura` da `biblioteca_fotos` existiam, eram lidas
     * por três consumidores, e NINGUÉM as escrevia. O `formasDeCaminhos`
     * devolvia sempre um mapa vazio, e com ele:
     *
     *  · a página do casal desenhava as 46 células sem `aspect-ratio` — o salto
     *    de 10 833 px que o cabeçalho do `Inspiracao.tsx` documenta como sendo
     *    «o comportamento sem a forma guardada». Não era o caso degradado: era
     *    o único caso que existia;
     *  · o empacotamento das colunas usava a altura de reserva para todas, e
     *    por isso nunca equilibrava — a queixa dos buracos na grelha;
     *  · e as «suspeitas» da verificação pré-envio («esta foto vai sair mole»)
     *    faziam `if (!forma) continue` sobre todas: código morto a responder
     *    «não há nada a apontar».
     *
     * O sharp já corria aqui, para o tecto de píxeis. Aproveita-se a mesma
     * leitura — mas pelo `dimensoesReais`, que troca os eixos quando a
     * orientação EXIF diz que a foto está deitada no ficheiro.
     */
    let forma: { w: number; h: number } | null = null;
    try {
      const meta = await sharp(bytes).metadata();
      const pixels = (meta.width ?? 0) * (meta.height ?? 0);
      if (!pixels || pixels > MAX_PIXELS) {
        return NextResponse.json(
          { error: `Imagem com dimensões inválidas ou demasiado grandes: ${file.name}.` },
          { status: 413 },
        );
      }
      forma = await dimensoesReais(bytes);
    } catch {
      return NextResponse.json(
        { error: `Não foi possível processar a imagem: ${file.name}.` },
        { status: 415 },
      );
    }
    // O que fica GUARDADO tem de ser um formato que o PDF saiba imprimir.
    // Aceita-se WebP à porta (é o formato em que o Pinterest serve as imagens,
    // e é de lá que vem a inspiração do estúdio), mas converte-se para JPEG
    // ANTES de guardar: o `pdf-lib` só embute JPEG/PNG, e um WebP guardado tal
    // e qual acabava numa moldura vazia na proposta do cliente.
    const pronto = await garantirFormatoImprimivel(bytes, file.type);
    if (!pronto) {
      // A frase diz O QUE aconteceu e o que fazer — ver `recusa-de-imagem`.
      return NextResponse.json(
        { error: recusaDeImagem(motivoDaRecusa(bytes, file.type), file.name) },
        { status: 415 },
      );
    }
    // ── UMA FOTOGRAFIA NUNCA SE GUARDA DUAS VEZES (ver `fotos-resumo.ts`) ──
    // O resumo dos bytes que IAM ser guardados, e o do original quando veio.
    // Se a foto já está na pasta deste pedido, ou na Biblioteca num tema vivo,
    // devolve-se esse caminho e não se guarda nada — nem a foto, nem as
    // derivadas, nem a linha da cor (a que lá está já as tem).
    //
    // O resumo do ORIGINAL vem do navegador: só serve para PROCURAR, nunca se
    // escreve no índice daqui. Se viesse errado e fosse registado, apontava
    // para sempre uma fotografia para outra (o `exists` continuava a dizer que
    // sim). O que se escreve é só o resumo dos bytes, calculado aqui.
    const resumoDosBytesGuardados = resumoDosBytes(pronto.bytes);
    const resumos = [resumoDosBytesGuardados, resumosDoOriginal[indice]];
    let jaGuardada: string | null = null;
    let peloConteudo = false;
    try {
      const achados = await procurarExistentes(resumos, id);
      const valores = [...achados.values()];
      jaGuardada = valores.find((c) => !ehRefDeTema(c)) ?? valores[0] ?? null;
      peloConteudo = !!jaGuardada && achados.get(resumoDosBytesGuardados) === jaGuardada;
    } catch (e) {
      // «Não sei» = guarda-se, como antes disto existir.
      log.warn("assets: índice dos resumos ilegível", { id, erro: String(e) });
    }
    // ── PELO QUE MOSTRA (`fotos-parecidas.ts`) ────────────────────────────
    // Aqui, SEM PERGUNTAR, só se reutiliza com o resumo dos BYTES igual (o
    // bloco de cima). Uma impressão «mesma» com bytes diferentes pode ser uma
    // versão retocada, ou maior, da que está guardada — e o estúdio não tem
    // onde perguntar: guarda-se a nova (revisão de 13/11). Quem pergunta é o
    // importador, antes de enviar. A impressão calcula-se só para a foto que
    // vai mesmo ser guardada, e entra no índice com o lado dela.
    if (jaGuardada) {
      const [urls, miniaturas] = await Promise.all([
        signProposalPaths([jaGuardada]),
        signProposalThumbs([jaGuardada]),
      ]);
      const url = urls.get(jaGuardada) ?? "";
      if (url) {
        // Só quando foram os BYTES a encontrá-la (põe-na à frente na lista).
        if (peloConteudo) await registarResumos([resumoDosBytesGuardados], jaGuardada);
        // Uma foto ANTIGA da pasta deste pedido pode não ter a forma, a cor ou
        // o LQIP (eram gravados por menos sítios). Os bytes são os mesmos, por
        // isso os valores também: grava-se o que veio, como num carregamento.
        if (peloConteudo && !ehRefDeTema(jaGuardada)) {
          const dados = {
            ...(cores[indice] ? { cor: cores[indice] } : {}),
            ...(lqips[indice] ? { lqip: lqips[indice] } : {}),
            ...(forma ? { largura: forma.w, altura: forma.h } : {}),
          };
          if (Object.keys(dados).length > 0) {
            try {
              await garantirFoto(jaGuardada, dados);
              await updateFoto(jaGuardada, dados);
            } catch (e) {
              log.warn("assets: cor/LQIP/forma não guardados", {
                path: jaGuardada,
                erro: String(e),
              });
            }
          }
        }
        const thumbUrl = miniaturas.get(jaGuardada) || miniaturaAPedidoUrl(id, jaGuardada);
        const cor = cores[indice];
        uploaded.push({
          path: jaGuardada,
          url,
          thumbUrl,
          ...(cor ? { cor } : {}),
          jaExistia: true,
        });
        continue;
      }
      // Sem URL não se consegue mostrar: guarda-se, como antes.
    }

    // A chave do carregamento (uma por foto, gerada no navegador): a mesma foto
    // repetida depois de uma rede que falhou vai para o MESMO caminho.
    const res = await uploadProposalImage(id, pronto.bytes, pronto.contentType, chaves[indice]);
    if (!res) {
      log.error("assets: upload falhou", null, { id, name: file.name });
      return NextResponse.json({ error: "Falha ao guardar a imagem." }, { status: 502 });
    }
    // Entra no índice: a próxima vez que esta foto chegar, não se guarda.
    await registarResumos([resumoDosBytesGuardados], res.path);
    // E no índice visual, com a impressão calculada aqui sobre estes bytes
    // e o lado maior deles (uma foto pequena nunca substitui uma maior).
    await registarImpressao(
      res.path,
      await impressaoDosBytes(pronto.bytes),
      forma ? Math.max(forma.w, forma.h) : 0,
    );
    // A miniatura só depois de o original estar guardado, e sempre em melhor
    // esforço: falhar aqui não pode fazer falhar um carregamento que já correu
    // bem. `uploadProposalThumb` nunca lança e devolve "" quando não dá.
    const thumb = thumbs[indice];
    let thumbUrl = "";
    if (thumb && OK_TYPES.test(thumb.type) && thumb.size <= MAX_BYTES) {
      thumbUrl = await uploadProposalThumb(
        res.path,
        Buffer.from(await thumb.arrayBuffer()),
        thumb.type,
      );
    }
    // A de 1200 px, pelo mesmo caminho e com as mesmas regras da miniatura:
    // só depois de o original estar guardado, e sempre em melhor esforço.
    // `uploadProposalMid` nunca lança e devolve `false` quando não dá — e aí
    // esta fotografia fica exactamente como estavam todas até aqui, com a
    // derivada a ser fabricada à primeira visita.
    const media = medias[indice];
    let bytesDaMedia = 0;
    if (media && OK_TYPES.test(media.type) && media.size <= MAX_BYTES) {
      if (await uploadProposalMid(res.path, Buffer.from(await media.arrayBuffer()), media.type))
        bytesDaMedia = media.size;
    }
    // O espaço que isto ocupou, para o travão da importação saber antes da
    // medição da noite (`ocupacao-do-armazenamento.ts`). Melhor esforço.
    await somarCarregado({
      [PROPOSAL_BUCKET_DO_TRAVAO]: pronto.bytes.length,
      ...(thumbUrl && thumb ? { [PROPOSAL_THUMB_BUCKET]: thumb.size } : {}),
      ...(bytesDaMedia ? { [PROPOSAL_MID_BUCKET]: bytesDaMedia } : {}),
    });
    // A cor entra na linha da foto. Melhor esforço, como a miniatura: a
    // fotografia já está guardada, e falhar aqui deixa-a sem cor — exactamente
    // como estão todas as anteriores a isto existir. Nunca é motivo para
    // devolver erro de um carregamento que correu bem.
    const cor = cores[indice];
    const lqip = lqips[indice];
    const dados = {
      ...(cor ? { cor } : {}),
      ...(lqip ? { lqip } : {}),
      ...(forma ? { largura: forma.w, altura: forma.h } : {}),
    };
    if (Object.keys(dados).length > 0) {
      try {
        await garantirFoto(res.path, dados);
        await updateFoto(res.path, dados);
      } catch (e) {
        log.warn("assets: cor/LQIP/forma não guardados", { path: res.path, erro: String(e) });
      }
    }
    uploaded.push({ ...res, ...(thumbUrl ? { thumbUrl } : {}), ...(cor ? { cor } : {}) });
  }

  return NextResponse.json({ ok: true, images: uploaded });
}

// Quanto processador gasta cada pedido (3/11) — ver `medir-cpu.ts`.
export const GET = comCpu("assets GET", GET_semMedida);
export const POST = comCpu("assets POST", POST_semMedida);
