import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getTheme } from "@/lib/themes-store";
import {
  listThemeImagePage,
  uploadThemeImage,
  findThemeImageByBytes,
  isThemePath,
  themeIdOfPath,
  themeFolder,
  type ThemeThumbInput,
} from "@/lib/theme-storage";
import { fingerprintOfFileName, isFingerprint } from "@/lib/theme-fingerprint";
import { impressaoDosBytes, registarImpressao } from "@/lib/fotos-parecidas";
import { somarCarregado } from "@/lib/ocupacao-do-armazenamento";
import {
  THEME_BUCKET,
  THEME_MICRO_BUCKET,
  THEME_MID_BUCKET,
  THEME_THUMB_BUCKET,
  refDeTema,
} from "@/lib/theme-ref";
import { dimensoesReais, garantirFormatoImprimivel, motivoDaRecusa } from "@/lib/proposal-image";
import { recusaDeImagem } from "@/lib/recusa-de-imagem";
import {
  THEME_PAGE_SIZE,
  MAX_THEME_PAGE_SIZE,
  type ThemeDuplicate,
  type ThemeImage,
} from "@/lib/theme-types";
import { isDatabaseConfigured } from "@/lib/supabase";
import { NaoDeuParaApagar, enviarParaAReciclagem, quemApagou } from "@/lib/reciclagem";
import { registarResumos, resumoDosBytes } from "@/lib/fotos-resumo";
import { log } from "@/lib/logger";
import { lqipAceitavel } from "@/lib/lqip";
import { corNormalizada } from "@/lib/cor";
import { idDaPaleta, paletaDaCor } from "@/lib/paleta-da-cor";
import { etiquetar } from "@/lib/biblioteca-foto-etiquetas-store";
import { garantirFoto, updateFoto } from "@/lib/biblioteca-fotos-store";
import { comCpu } from "@/lib/medir-cpu";

export const runtime = "nodejs";
// Igual aos anexos da proposta: sharp, armazenamento, miniatura e LQIP,
// vezes o número de fotos que ela largou de uma vez na biblioteca.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB por imagem
/** Uma miniatura acima disto é um erro do cliente, não uma miniatura. É
 *  ignorada (fica a foto sem miniatura), nunca recusa o carregamento. */
const MAX_THUMB_BYTES = 2 * 1024 * 1024;
const OK_TYPES = /^image\/(jpe?g|png|webp)$/i;

/**
 * Resposta a uma falha inesperada: se o Storage nem sequer está configurado, a
 * causa é essa (503, e não um "erro interno" que manda a Catarina procurar um
 * problema que não existe); caso contrário é mesmo um 500.
 */
function failed(message: string, err: unknown, id: string) {
  log.error(message, err, { id });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Armazenamento indisponível." }, { status: 503 });
  }
  return NextResponse.json({ error: "Erro interno" }, { status: 500 });
}

/** Um inteiro >= 0 vindo da query string; `fallback` para tudo o resto. */
function num(raw: string | null, fallback: number): number {
  const n = Number(raw);
  return raw !== null && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

/**
 * UMA PÁGINA das fotos de um tema: `?offset=&limit=`.
 *
 * Devolve `{ ok, images, total, truncated }`. Só a página pedida é assinada —
 * abrir um tema com 3000 fotos custa o mesmo que abrir um com 30. Cada foto
 * traz `url` (o ORIGINAL, que é o que vai para a proposta) e, quando existe,
 * `thumbUrl` — a miniatura, que é o que a grelha deve mostrar. As fotos
 * carregadas antes de as miniaturas existirem vêm sem `thumbUrl`.
 *
 * `ok: false` (com 200) quer dizer "a pasta não pôde ser lida agora", que a UI
 * mostra como "Fotos indisponíveis" — nunca como um tema vazio.
 */
async function GET_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    // O tema inexistente é um `return` (404), nunca uma exceção — um 404
    // legítimo não pode sair daqui disfarçado de 500.
    const theme = await getTheme(id);
    if (!theme) return NextResponse.json({ error: "Tema não encontrado" }, { status: 404 });

    const q = request.nextUrl.searchParams;
    // Teto rígido: um `?limit=5000` mandaria assinar a biblioteca inteira num
    // pedido. Corta-se em silêncio (o cliente pagina), não se recusa.
    const limit = Math.min(Math.max(1, num(q.get("limit"), THEME_PAGE_SIZE)), MAX_THEME_PAGE_SIZE);
    const offset = num(q.get("offset"), 0);
    // A ordem arrumada à mão (se existir) manda no início da lista; a pasta
    // continua a mandar no resto. O tema já foi lido acima, não custa nada.
    return NextResponse.json(await listThemeImagePage(id, limit, offset, theme.photoOrder ?? []));
  } catch (err) {
    return failed("temas imagens GET falhou", err, id);
  }
}

/**
 * Recolhe as miniaturas que vieram no formulário, emparelhadas com os
 * ficheiros pela ORDEM (o campo `thumbs` é opcional).
 *
 * Ou os dois campos têm o mesmo comprimento, ou não há emparelhamento
 * possível: pelo índice, uma miniatura a menos passaria a acompanhar a foto
 * errada — uma foto com a miniatura de outra é pior do que foto nenhuma. O
 * cliente que não consiga gerar uma miniatura deve enviar um marcador vazio no
 * lugar dela (`new Blob([])`), que aqui simplesmente não conta.
 */
function pairThumbs(files: File[], form: FormData): (File | null)[] {
  const thumbs = form.getAll("thumbs").filter((f): f is File => f instanceof File);
  if (thumbs.length === 0) return files.map(() => null);
  if (thumbs.length !== files.length) {
    log.warn("temas: miniaturas ignoradas (não correspondem aos ficheiros)", {
      files: files.length,
      thumbs: thumbs.length,
    });
    return files.map(() => null);
  }
  return thumbs.map((t) => {
    if (t.size === 0) return null; // marcador: esta foto vem sem miniatura
    if (!OK_TYPES.test(t.type) || t.size > MAX_THUMB_BYTES) {
      log.warn("temas: miniatura descartada", { tipo: t.type, bytes: t.size });
      return null;
    }
    return t;
  });
}

/**
 * Os resumos das fotos, emparelhados com os ficheiros pela ORDEM (campo
 * opcional `hashes`).
 *
 * A regra é a MESMA do `pairThumbs` acima e pela mesma razão: ou os dois
 * campos têm o mesmo comprimento, ou não há emparelhamento possível. Um resumo
 * a menos faria uma foto ser guardada com a identidade de OUTRA — e a partir
 * daí a foto certa seria sempre reportada como repetida. Perante a menor
 * dúvida, ignora-se o campo todo e as fotos sobem com nome UUID, que é
 * exatamente o comportamento de antes desta funcionalidade.
 *
 * Um resumo mal formado (não 32 hex) vira `null` na sua posição, sem
 * desalinhar os outros. É também a validação que impede o nome do ficheiro
 * — que passa a vir do cliente — de conter travessia de diretórios.
 */
/**
 * Os LQIP, emparelhados pela ORDEM — mesma regra do `pairThumbs` e do
 * `pairHashes`, e pela mesma razão: comprimentos diferentes significam que o
 * cliente e o servidor discordam sobre o que está a ser enviado, e um
 * placeholder atribuído à foto errada seria a cor de outra fotografia a
 * aparecer nesta célula. Aí não se adivinha — vão todos a `null`.
 *
 * Cada valor passa pelo guarda do `lqip.ts`: um `data:` URI que vem do cliente
 * e vai parar a um `src` não entra sem lista de permitidos.
 */
/** As MICRO (96 px), emparelhadas pela ordem — mesma regra do `pairThumbs`. */
function pairMicros(files: File[], form: FormData): (File | null)[] {
  const micros = form.getAll("micros").filter((f): f is File => f instanceof File);
  if (micros.length === 0) return files.map(() => null);
  if (micros.length !== files.length) {
    log.warn("temas: micros ignoradas (não correspondem aos ficheiros)", {
      files: files.length,
      micros: micros.length,
    });
    return files.map(() => null);
  }
  return micros.map((m) => (m.size === 0 ? null : m));
}

/**
 * As de 1200 px, emparelhadas pela ordem — mesma regra do `pairThumbs`.
 *
 * É a derivada que a PÁGINA DO CASAL mostra (as de 400 e 96 servem as grelhas
 * e as tiras do back office). Nascia no servidor, uma a uma, à primeira vez
 * que alguém olhava para cada fotografia; chega agora já feita do browser, do
 * mesmo canvas que fez a miniatura.
 */
function pairMids(files: File[], form: FormData): (File | null)[] {
  const mids = form.getAll("medias").filter((f): f is File => f instanceof File);
  if (mids.length === 0) return files.map(() => null);
  if (mids.length !== files.length) {
    log.warn("temas: derivadas de 1200 px ignoradas (não correspondem aos ficheiros)", {
      files: files.length,
      medias: mids.length,
    });
    return files.map(() => null);
  }
  return mids.map((m) => (m.size === 0 ? null : m));
}

function pairLqips(files: File[], form: FormData): (string | null)[] {
  const raw = form.getAll("lqips").filter((v): v is string => typeof v === "string");
  if (raw.length === 0) return files.map(() => null);
  if (raw.length !== files.length) {
    log.warn("temas: LQIP ignorados (não correspondem aos ficheiros)", {
      files: files.length,
      lqips: raw.length,
    });
    return files.map(() => null);
  }
  return raw.map((v) => (lqipAceitavel(v) ? v : null));
}

/**
 * As CORES dominantes, emparelhadas pela ordem — mesma regra do `pairLqips`.
 *
 * Comprimentos diferentes significam que o cliente e o servidor discordam sobre
 * o que está a ser enviado, e uma cor atribuída à foto errada faria o aviso de
 * paleta apontar a fotografia inocente. Aí não se adivinha: vão todas a `null`.
 */
function pairCores(files: File[], form: FormData): (string | null)[] {
  const raw = form.getAll("cores").filter((v): v is string => typeof v === "string");
  if (raw.length === 0) return files.map(() => null);
  if (raw.length !== files.length) {
    log.warn("temas: cores ignoradas (não correspondem aos ficheiros)", {
      files: files.length,
      cores: raw.length,
    });
    return files.map(() => null);
  }
  return raw.map((v) => corNormalizada(v));
}

function pairHashes(files: File[], form: FormData): (string | null)[] {
  const raw = form.getAll("hashes").filter((h): h is string => typeof h === "string");
  if (raw.length === 0) return files.map(() => null);
  if (raw.length !== files.length) {
    log.warn("temas: resumos ignorados (não correspondem aos ficheiros)", {
      files: files.length,
      hashes: raw.length,
    });
    return files.map(() => null);
  }
  return raw.map((h) => (isFingerprint(h) ? h : null));
}

/**
 * Carrega fotos para a pasta de um tema. Aceita multipart/form-data com um ou
 * mais `files` e, opcionalmente, os `thumbs` correspondentes pela mesma ordem —
 * as miniaturas são feitas no navegador, a partir do mesmo bitmap já
 * descodificado para comprimir o original.
 *
 * A miniatura é um acessório: falhar a guardá-la deixa a foto sem miniatura
 * (a grelha mostra o original), nunca faz o carregamento falhar.
 *
 * NÃO REPETIR FOTOS QUE JÁ ESTÃO NO TEMA. Além dos `thumbs`, aceita `hashes` —
 * o resumo do ficheiro ORIGINAL de cada foto, calculado no navegador. Com ele,
 * a foto é guardada como `<tema>/<resumo>.jpg` e o `upsert: false` que já
 * existia recusa atomicamente uma segunda cópia. Uma foto assim recusada NÃO é
 * um erro HTTP: sai em `duplicates`, com 200, e a UI mostra-a como "já estava
 * neste tema" com um botão para forçar.
 *
 * Há ainda a rede secundária, para a biblioteca ANTIGA (nome UUID, sem resumo):
 * compara-se o MD5 dos bytes recebidos com o eTag que a listagem da pasta já
 * traz. Custa uma listagem memoizada por lote e apanha a cauda que o nome não
 * consegue apanhar.
 *
 * `force: "1"` salta as duas verificações e guarda com `<resumo>-<4 hex>` — é o
 * "Adicionar mesmo assim", e a recuperação de qualquer modo de falha do índice.
 */
async function POST_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
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
  const theme = await getTheme(id);
  if (!theme) return NextResponse.json({ error: "Tema não encontrado" }, { status: 404 });

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
  const thumbs = pairThumbs(files, form);
  const hashes = pairHashes(files, form);
  const lqips = pairLqips(files, form);
  const cores = pairCores(files, form);
  const micros = pairMicros(files, form);
  const mids = pairMids(files, form);
  const force = form.get("force") === "1";

  const uploaded: ThemeImage[] = [];
  const duplicates: ThemeDuplicate[] = [];
  for (const [i, file] of files.entries()) {
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
    const recebidos = Buffer.from(await file.arrayBuffer());

    // O que fica GUARDADO tem de ser um formato que o PDF saiba imprimir. Um
    // WebP (o formato em que o Pinterest serve as imagens, e daí vem a maior
    // parte destas fotos) não é embutível pelo `pdf-lib` e saía como uma
    // moldura vazia no PDF do cliente. Continua a aceitar-se WebP à porta — o
    // que muda é o que se guarda.
    //
    // Isto ficou MAIS importante, não menos, desde que uma foto escolhida para
    // um mood board passou a ser REFERENCIADA em vez de copiada (ver
    // `theme-ref.ts`): os bytes que estão neste bucket são agora, sem
    // intermediário nenhum, os bytes que o gerador de PDF vai buscar.
    const pronto = await garantirFormatoImprimivel(recebidos, file.type);
    if (!pronto) {
      // A frase diz O QUE aconteceu e o que fazer — ver `recusa-de-imagem`.
      return NextResponse.json(
        { error: recusaDeImagem(motivoDaRecusa(recebidos, file.type), file.name) },
        { status: 415 },
      );
    }
    // A partir daqui trabalha-se sobre os bytes CONVERTIDOS: é sobre eles que a
    // rede secundária compara MD5, e são eles que ficam no bucket — comparar
    // uns e guardar outros deixaria a verificação a olhar para o ficheiro
    // errado. A conversão é determinística, portanto a mesma foto carregada
    // duas vezes continua a dar os mesmos bytes (e a ser apanhada como
    // repetida). O `hashes` do cliente é do ficheiro ORIGINAL e não muda.
    const bytes = pronto.bytes;

    // Rede secundária: a foto antiga, de nome UUID, que o resumo não apanha.
    // Feita ANTES de escrever, para não deixar uma segunda cópia no bucket.
    if (!force) {
      const already = await findThemeImageByBytes(id, bytes);
      if (already) {
        duplicates.push({ name: file.name, path: already, reason: "no-tema" });
        // A foto antiga entra no índice de graça: as propostas passam a
        // reconhecê-la (ver `fotos-resumo.ts`).
        // Só o resumo dos BYTES: foi o MD5 deles que a encontrou. O `hashes[i]`
        // vem do navegador e não se escreve no índice sem prova.
        await registarResumos([resumoDosBytes(bytes)], refDeTema(already));
        continue;
      }
    }

    // A miniatura fica como veio: só é vista na grelha do navegador, nunca é
    // impressa, e todos os browsers que a geram já a dão em JPEG.
    const thumb = thumbs[i];
    const thumbInput: ThemeThumbInput | undefined = thumb
      ? { bytes: Buffer.from(await thumb.arrayBuffer()), contentType: thumb.type }
      : undefined;
    const micro = micros[i];
    const microInput: ThemeThumbInput | undefined = micro
      ? { bytes: Buffer.from(await micro.arrayBuffer()), contentType: micro.type }
      : undefined;
    const mid = mids[i];
    const midInput: ThemeThumbInput | undefined = mid
      ? { bytes: Buffer.from(await mid.arrayBuffer()), contentType: mid.type }
      : undefined;
    // `pronto.contentType` e não `file.type`: o que ficou guardado foi o
    // ficheiro CONVERTIDO, e declarar o tipo de entrada faria o bucket guardar
    // um JPEG rotulado de WebP.
    const res = await uploadThemeImage(
      id,
      bytes,
      pronto.contentType,
      thumbInput,
      { fingerprint: hashes[i], force },
      microInput,
      midInput,
    );
    if (!res) {
      log.error("temas: upload falhou", null, { id, name: file.name });
      return NextResponse.json({ error: "Falha ao guardar a imagem." }, { status: 502 });
    }
    // "Já cá estava" é uma resposta, não uma avaria: 200 com a foto na lista de
    // repetidas. Um 502 aqui mandaria a Catarina procurar um problema que não
    // existe — e o "Tentar novamente" voltaria a fazer o mesmo para sempre.
    if (res.kind === "duplicate") {
      duplicates.push({ name: file.name, path: res.path, reason: "no-tema" });
      // Foi o NOME (= o resumo do cliente) que bateu: os bytes que chegaram não
      // são prova de nada sobre a que lá está. Regista-se só o que o nome já
      // diz — nenhuma informação nova entra no índice por aqui.
      await registarResumos([hashes[i]], refDeTema(res.path));
      continue;
    }
    // ── O ÍNDICE DOS RESUMOS (`fotos-resumo.ts`) ──────────────────────────
    // Os bytes guardados e o original: é por aqui que uma proposta que receba
    // esta mesma fotografia devolve `tema:<caminho>` em vez de a guardar outra
    // vez. Melhor esforço — nunca lança.
    // O resumo do original só quando o NOME do ficheiro o traz: é a mesma
    // afirmação que a Biblioteca já faz ao dar-lhe esse nome (`theme-fingerprint`),
    // e a cópia forçada (`<resumo>-<4 hex>`) também a faz.
    const doNome = fingerprintOfFileName(res.image.path.slice(res.image.path.indexOf("/") + 1));
    await registarResumos(
      [resumoDosBytes(bytes), ...(doNome ? [doNome] : [])],
      refDeTema(res.image.path),
    );
    // O LQIP entra na linha da foto que acabou de nascer. Melhor esforço: a
    // fotografia já está guardada, e falhar aqui deixa-a sem placeholder —
    // exactamente como estão todas as anteriores a isto existir. Nunca é
    // motivo para devolver erro de um carregamento que correu bem.
    const lqip = lqips[i];
    const cor = cores[i];
    /**
     * A FORMA DA FOTOGRAFIA, GUARDADA — e não só usada e deitada fora.
     *
     * As colunas `largura`/`altura` existiam na tabela, eram lidas por três
     * consumidores, e ninguém as escrevia: o `formasDeCaminhos` devolvia sempre
     * um mapa vazio. A página do casal desenhava as células sem `aspect-ratio`
     * (o salto de 10 833 px documentado no `Inspiracao.tsx`), o empacotamento
     * das colunas nunca equilibrava, e as suspeitas da verificação pré-envio
     * saltavam todas com um `if (!forma) continue`.
     *
     * Lê-se dos bytes que já estão em memória, pelo `dimensoesReais` e não pela
     * `metadata()` crua: uma foto de telemóvel ao alto tem largura e altura
     * trocadas no cabeçalho, e gravá-las assim trocava o problema por outro.
     *
     * Sobre `pronto` e não sobre `recebidos`: é `pronto` que fica no bucket.
     */
    const forma = await dimensoesReais(pronto.bytes);
    // A impressão visual, calculada aqui sobre os bytes guardados, com o lado
    // maior deles — é por ela que uma proposta antiga com esta fotografia
    // recomprimida a reconhece (`fotos-parecidas.ts`). Melhor esforço.
    await registarImpressao(
      refDeTema(res.image.path),
      await impressaoDosBytes(bytes),
      forma ? Math.max(forma.w, forma.h) : 0,
    );
    // E o espaço que ocupou, para o travão da importação saber antes da
    // medição da noite (`ocupacao-do-armazenamento.ts`). As derivadas contam-se
    // pelo que veio (se uma não tiver ficado, conta a mais — o lado seguro).
    await somarCarregado({
      [THEME_BUCKET]: bytes.length,
      ...(thumbInput ? { [THEME_THUMB_BUCKET]: thumbInput.bytes.length } : {}),
      ...(microInput ? { [THEME_MICRO_BUCKET]: microInput.bytes.length } : {}),
      ...(midInput ? { [THEME_MID_BUCKET]: midInput.bytes.length } : {}),
    });
    const dados = {
      ...(lqip ? { lqip } : {}),
      ...(cor ? { cor } : {}),
      ...(forma ? { largura: forma.w, altura: forma.h } : {}),
    };
    if (Object.keys(dados).length > 0) {
      try {
        await garantirFoto(res.image.path, dados);
        await updateFoto(res.image.path, dados);
      } catch (e) {
        log.warn("temas: LQIP/cor/forma não guardados", {
          path: res.image.path,
          erro: String(e),
        });
      }
    }
    // ── A ETIQUETA DE PALETA, DE GRAÇA ────────────────────────────────────
    //
    // A cor acabou de ser guardada; traduzi-la para o vocabulário da
    // biblioteca não custa uma consulta nem um cêntimo, e é o que faz
    // «paleta:terracotta» devolver alguma coisa. `origem: "upload"` para a
    // revisão em lote saber que foi a máquina a pô-la e não uma pessoa.
    //
    // Melhor esforço, como o resto deste bloco: a fotografia já está guardada,
    // e uma etiqueta que falhe deixa-a como estão todas as anteriores a isto
    // existir. Nunca é motivo para devolver erro de um carregamento que correu
    // bem.
    if (cor) {
      const paleta = paletaDaCor(cor);
      if (paleta) {
        try {
          await etiquetar(res.image.path, idDaPaleta(paleta), "upload");
        } catch (e) {
          log.warn("temas: paleta não etiquetada", { path: res.image.path, erro: String(e) });
        }
      }
    }
    // Devolvidos JÁ na resposta: a célula que acabou de entrar na grelha não
    // tem de esperar pela próxima listagem para ter placeholder nem cor.
    uploaded.push({ ...res.image, ...(lqip ? { lqip } : {}), ...(cor ? { cor } : {}) });
  }

  return NextResponse.json({ ok: true, images: uploaded, duplicates });
}

/** Remove UMA foto do tema: `?path=<themeId>/<ficheiro>`. Vai 30 dias para a
 *  Reciclagem; sem ela, sai de vez com a miniatura (melhor esforço). */
async function DELETE_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const path = request.nextUrl.searchParams.get("path") ?? "";
    // O caminho tem de ser um ficheiro DENTRO da pasta deste tema — nunca de
    // outro tema, nunca com travessia de diretórios.
    if (!isThemePath(path) || themeIdOfPath(path) !== themeFolder(id)) {
      return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
    }
    // Pela Reciclagem (fase R3b de `docs/TUDO-REVERSIVEL.md`): a foto sai da
    // pasta para `reciclagem/<entrada>/`, e volta ao mesmo caminho. Antes,
    // como sempre, quem a referencia fica com a sua cópia — uma foto escolhida
    // para um mood board é REFERENCIADA, não copiada (`theme-materializar.ts`).
    const reciclagem = await enviarParaAReciclagem("foto-de-tema", path, quemApagou(request));
    return NextResponse.json({ ok: true, reciclagem });
  } catch (err) {
    if (err instanceof NaoDeuParaApagar) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return failed("temas imagens DELETE falhou", err, id);
  }
}

// Quanto processador gasta cada pedido (3/11) — ver `medir-cpu.ts`.
export const GET = comCpu("temas-imagens GET", GET_semMedida);
export const POST = comCpu("temas-imagens POST", POST_semMedida);
export const DELETE = comCpu("temas-imagens DELETE", DELETE_semMedida);
