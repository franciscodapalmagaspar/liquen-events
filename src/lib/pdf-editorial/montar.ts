import "server-only";
import { PDFDocument, type PDFImage } from "pdf-lib";
import { depositPercentOf, resolveValidUntil, type ProposalDoc } from "@/lib/proposal-doc";
import { docNaLingua } from "@/lib/proposal-doc-bilingue";
import type { DocTruncation } from "@/lib/proposal-doc-pdf";
import {
  blocosFixosNaLingua,
  camposDoEventoNaLingua,
  IDIOMA_POR_OMISSAO,
  isoDaDataPorExtenso,
  rotuloDoTotalNaLingua,
  textosDaProposta,
  type IdiomaDaProposta,
} from "@/lib/proposal-doc-textos";
import { chaveDeRubrica, ordemDeSaida } from "@/lib/proposal-ordem";
import { eurDocumento, milharesComPonto, montanteNaLingua, round2 } from "@/lib/money";
import {
  normalizarValor,
  ressalvaDoValor,
  somaDosExtrasSemIva,
  totaisDaProposta,
} from "@/lib/proposal-budget";
import { opcionaisDe, totaisDasVersoes } from "@/lib/orcamento/versoes-da-proposta";
import { LOGO_WHITE_PNG_B64 } from "@/lib/proposal-assets";
import { SITE } from "@/lib/site";
import {
  TAM_MINIMO,
  aoMeio,
  paginarColunasFixas,
  paginarCorrido,
  repartir,
  type Peca,
} from "./colunas";
import { bytesDaFoto, embedImagem } from "./embutir";
import { Album, comMedida, medir, type Foto } from "./fotos";
import { capitulos as capitulosDaInspiracao, eDasMesas } from "./grupos";
import { eCasamento } from "../proposal-evento";
import { logotipoNaCor } from "./imagens";
import type { Contexto } from "./moldura";
import { disposicaoDoTema, repartir as repartirFotos, temaDizONome } from "./mosaico";
import { HEX } from "./paleta";
import { paletaDasFotos } from "./paleta-das-fotos";
import { capa, contracapa } from "./paginas/capa";
import { Chaves, cartoesPorPagina, ordemDoDesenho, servicosDoDocumento } from "./plano";
import type { FotosDoPdf, Medida } from "./fotos-do-pdf";

export type { FotoNaPagina, FotosDoPdf, Medida } from "./fotos-do-pdf";
import { problemaDaCapa } from "./regra-da-capa";
import {
  alturaDasColunas,
  comoTitulo,
  larguraDaColuna,
  paginaDeColunas,
} from "./paginas/condicoes";
import { citacao, separador } from "./paginas/fotografia";
import { orcamento, repartirLinhas, total, type LinhaDoOrcamento } from "./paginas/orcamento";
import { ambiente, servicos, type Servico } from "./paginas/servicos";
import { tema } from "./paginas/tema";
import { apresentacao, indice, type EntradaDoIndice } from "./paginas/texto";
import { dataCurta, primeirosNomes, textosEditoriais } from "./textos";
import { embutirLetras } from "./texto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PDF EDITORIAL — a proposta no desenho de 23/10 (`docs/PDF-DESIGN-NOVO.md`)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Só muda o ASPECTO e a paginação. Os dados, as contas, os textos legais, os
 * contactos e o logótipo são os mesmos do gerador antigo e vêm das mesmas
 * funções (`textosDaProposta`, `blocosFixosNaLingua`, `totaisDaProposta`,
 * `camposDoEventoNaLingua`, `docNaLingua`, `resolveValidUntil`, `SITE`). O
 * gerador antigo (`proposal-doc-pdf.ts`) não é tocado; deixou de ser o do
 * envio quando ela aprovou este («Sim, passa a enviar o novo»).
 *
 * A mesma sequência, sem desenhar, está em `plano.ts` — é o que o estúdio
 * conta e mostra. Um teste prende as duas uma à outra.
 *
 * A sequência é a do documento de 23/10 (§6):
 *
 *   capa · índice · a proposta · o que propomos · paleta e ambiente
 *   · por cada capítulo de inspiração: separador + as páginas dos temas
 *   · citação
 *   · investimento: total + quadro                          (se houver orçamento)
 *   · condições: notas · condições gerais · pagamento      (SEMPRE)
 *   · contracapa
 *
 * Recebe o documento com as fotografias JÁ RESOLVIDAS (base64), como o
 * `renderProposalDocPdfWithReport`.
 */
export async function renderEditorialPdf(
  original: ProposalDoc,
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
  /**
   * `rascunho`: o PDF descarregado com erros por resolver (B1 do documento
   * dela). Sai igual, com «RASCUNHO» à frente do rodapé de cada página e no
   * título do ficheiro — nada mais muda no desenho.
   */
  opcoes: { rascunho?: boolean } = {},
  fontes: FontesDasFotos = {},
): Promise<{
  bytes: Uint8Array;
  truncations: DocTruncation[];
  undrawnImages: number;
  /** Que fotografia foi para cada lugar de cada página — ver `fotosDoEditorial`. */
  fotos: FotosDoPdf;
}> {
  const m = await motor(original, idioma, opcoes, fontes);
  for (const [i, passo] of m.plano.entries()) await passo.desenhar(i + 1, m.entradas);
  const bytes = await m.pdf.save();
  return {
    bytes,
    truncations: m.ctx.cortes,
    undrawnImages: m.ctx.naoDesenhadas.size,
    fotos: fotosDoPlano(m.plano),
  };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS DE CADA PÁGINA, SEM DESENHAR O PDF
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A colaboradora dela viu-o: as miniaturas do estúdio mostravam fotografias
 * «que não têm nada a ver» com as do PDF. A miniatura adivinhava por conta
 * própria (`fontesDasFolhas` rodava as fotos dos temas), e quem escolhe é o
 * álbum, aqui, pelos pixéis de cada ficheiro — que o navegador não sabe.
 *
 * Agora a miniatura pergunta: corre-se o MESMO plano do PDF (as mesmas páginas,
 * as mesmas regras do álbum, as mesmas medidas), sem desenhar nada, e devolve-se
 * o caminho de cada fotografia em cada página, pela chave da página
 * (`chavesDasPaginas`). `original` tem as referências do armazenamento no lugar
 * dos bytes; as `medidas` são as mesmas que o desenho usa (ver
 * `medidasDasFotos`, em `proposal-doc-render.ts`).
 */
export async function fotosDoEditorial(
  original: ProposalDoc,
  idioma: IdiomaDaProposta,
  medidas: ReadonlyMap<string, Medida>,
): Promise<FotosDoPdf> {
  const m = await motor(original, idioma, {}, { semBytes: true, medidas });
  return fotosDoPlano(m.plano);
}

/**
 * De onde vêm as fotografias. Sem nada, como sempre: os bytes vêm no próprio
 * documento (base64) e medem-se aqui.
 */
export interface FontesDasFotos {
  /**
   * O caminho no armazenamento de cada fotografia do documento resolvido, no
   * mesmo lugar: a capa, as de cada mood board (depois das que faltaram
   * saírem) e as de `fotosDasPaginas`. É o que identifica uma foto entre o PDF
   * e o estúdio.
   */
  refs?: {
    capa: readonly (string | null)[];
    temas: readonly (readonly string[])[];
    paginas: Readonly<Record<string, readonly (string | null)[]>>;
  };
  /** As medidas por caminho; o que faltar mede-se dos bytes. */
  medidas?: ReadonlyMap<string, Medida>;
  /** O documento traz caminhos e não bytes: só se planeia, não se desenha. */
  semBytes?: boolean;
}

/** Uma página por desenhar, com a sua chave e as fotografias que leva. */
interface Passo {
  entrada?: string;
  chave: string;
  fotos: readonly (Foto | null)[];
  desenhar: (numero: number, entradas: readonly EntradaDoIndice[]) => Promise<unknown>;
}

function fotosDoPlano(plano: readonly Passo[]): FotosDoPdf {
  const saida: FotosDoPdf = {};
  for (const p of plano) {
    saida[p.chave] = p.fotos.map((f) => ({
      ref: f?.ref ?? null,
      ...(f?.foco ? { foco: f.foco } : {}),
    }));
  }
  return saida;
}

async function motor(
  original: ProposalDoc,
  idioma: IdiomaDaProposta,
  { rascunho = false }: { rascunho?: boolean },
  fontes: FontesDasFotos,
) {
  const doc = docNaLingua(original, idioma);
  const t = textosDaProposta(idioma);
  const te = textosEditoriais(idioma);
  const evento = camposDoEventoNaLingua(doc, idioma);
  const fixos = blocosFixosNaLingua(doc, idioma);
  const org = doc.template === "organizacao";
  // Casamento ou não — a regra é uma só, e é a mesma do plano e do estúdio.
  const casamento = eCasamento(doc.eventType);
  const totais = totaisDaProposta(doc, depositPercentOf(doc));
  /** O dinheiro na língua do documento — a mesma conversão do gerador antigo. */
  const dinheiro = (texto: string) => montanteNaLingua(milharesComPonto(texto), idioma);
  const eurDoc = (n: number) => dinheiro(eurDocumento(n));

  const pdf = await PDFDocument.create();
  pdf.setTitle(
    `${rascunho ? `${te.rascunho} · ` : ""}${te.rodapeModelo(org)} · ${doc.clientNames}`,
  );
  pdf.setAuthor(SITE.name);
  const ctx: Contexto = {
    pdf,
    letras: await embutirLetras(pdf),
    idioma,
    t,
    te,
    // A marca do rascunho vai À FRENTE: o rodapé encolhe pelo fim quando não
    // cabe (`moldura.rodape`), e a marca é a única parte que não pode cair.
    rodape: [rascunho ? te.rascunho : "", te.rodapeModelo(org), doc.clientNames, evento.eventDate]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join(" · "),
    logo: await logotipo(pdf),
    cortes: [],
    naoDesenhadas: new Set(),
    embutidas: new Map(),
  };

  // ── As fotografias, medidas ──────────────────────────────────────────────
  let proximoId = 0;
  /**
   * Uma fotografia do documento, medida. Com `semBytes` o documento traz o
   * CAMINHO e a medida vem de `medidas` — sem medida, a foto não existe (é a
   * que o desenho também não conseguiria buscar). Com bytes, a medida das
   * `medidas` manda quando existe, para o desenho e a miniatura compararem as
   * fotos pelos MESMOS números; senão lê-se do ficheiro, como sempre.
   */
  const medida = async (
    dado: string | null | undefined,
    origem: string,
    tema: number | null,
    refDada?: string | null,
  ): Promise<Foto | null> => {
    const ref = (fontes.semBytes ? dado : refDada) || undefined;
    const sabida = ref ? fontes.medidas?.get(ref) : undefined;
    if (fontes.semBytes) {
      if (!ref || !sabida) return null;
      return comMedida(Buffer.alloc(0), origem, proximoId++, tema, sabida, ref);
    }
    const bytes = bytesDaFoto(dado);
    if (!bytes) return null;
    const id = proximoId++;
    const f = sabida
      ? comMedida(bytes, origem, id, tema, sabida)
      : await medir(bytes, origem, id, tema);
    return ref ? { ...f, ref } : f;
  };
  // UMA fotografia de capa: a primeira que houver. As propostas antigas tinham
  // dois lugares, «Esquerda» e «Direita», e há-as só com a da direita.
  const iCapa = (doc.coverImages ?? []).findIndex((d) => d && d.trim());
  const fotoDaCapa = await medida(
    iCapa >= 0 ? doc.coverImages[iCapa] : undefined,
    "Capa · fotografia",
    null,
    iCapa >= 0 ? fontes.refs?.capa[iCapa] : null,
  );

  // Os temas pela ordem do documento (a mesma do gerador antigo), e as fotos
  // de cada um pela ordem dela, com a «principal» à frente — sempre: é a foto
  // do cartão em «O que propomos» e a primeira do mosaico (`plano.ts`).
  const ordem = ordemDeSaida(original, original.moodBoards, (b) => b.title ?? "");
  const temas = await Promise.all(
    ordem.map(async (i, vez) => {
      const pt = original.moodBoards[i];
      const naLingua = doc.moodBoards[i] ?? pt;
      const fotos = (
        await Promise.all(
          ordemDoDesenho(pt).map((k) =>
            medida(
              pt.images?.[k],
              `Tema «${pt.title}» · foto ${k + 1}`,
              vez,
              fontes.refs?.temas[i]?.[k],
            ),
          ),
        )
      ).filter((f): f is Foto => f !== null);
      return {
        bi: i,
        pt,
        titulo: (naLingua.title ?? "").trim(),
        subtitulo: (naLingua.subtitulo ?? "").trim(),
        nota: (naLingua.annotation ?? "").trim(),
        fotos,
        disposicao: disposicaoDoTema(pt),
      };
    }),
  );
  // Um tema sem fotografias E sem texto não tem nada para mostrar; um tema só
  // com texto tem a sua página de texto, como o documento dela pede.
  const comConteudo = temas.filter((x) => x.fotos.length || x.titulo || x.subtitulo || x.nota);
  const inspiracao = comConteudo.flatMap((x) => x.fotos);
  const album = new Album(inspiracao);

  // ── As fotografias que ELA escolheu para cada página (`fotosDasPaginas`) ──
  // Uma que já esteja num tema é a MESMA foto para o álbum (o mesmo `id`): o
  // automático deixa de a pôr na página ao lado. Uma da biblioteca ou carregada
  // só para aqui entra como foto nova. Uma que não se deixe buscar cai — e a
  // página volta a escolher sozinha.
  //
  // CADA UMA NO SEU LUGAR (23/10): na paleta, o 6.º lugar é o painel grande e
  // os outros cinco são a fila. Um lugar vazio (`""`) é «automático»; uma foto
  // que não chegou deixa o SEU lugar vazio — não puxa as seguintes, e o foco
  // de cada uma continua a ser o dela.
  const porLugar = new Map<string, (Foto | null)[]>();
  for (const [chave, e] of Object.entries(original.fotosDasPaginas ?? {})) {
    const lugares: (Foto | null)[] = [];
    for (const [k, dado] of (e?.fotos ?? []).entries()) {
      if (!dado || !dado.trim()) {
        lugares.push(null);
        continue;
      }
      const ref = fontes.semBytes ? dado : fontes.refs?.paginas[chave]?.[k];
      const ja = ref ? inspiracao.find((f) => f.ref === ref) : undefined;
      const f = ja ?? (await medida(dado, `Página «${chave}» · foto ${k + 1}`, null, ref));
      const foco = e.focos?.[k];
      lugares.push(f ? (foco ? { ...f, foco } : f) : null);
    }
    if (lugares.some(Boolean)) porLugar.set(chave, lugares);
  }
  const chaves = new Chaves();
  /** As que ela escolheu para a página `chave`, já registadas no álbum. */
  const escolhidas = (chave: string, pagina: number): Foto[] | null => {
    const e = porLugar.get(chave)?.filter((f): f is Foto => f !== null);
    if (!e?.length) return null;
    for (const f of e) album.usar(f, pagina);
    return e;
  };
  /** O mesmo, lugar a lugar (`null` = o automático escolhe esse). */
  const escolhidasPorLugar = (chave: string, pagina: number): (Foto | null)[] | null => {
    const e = porLugar.get(chave);
    if (!e) return null;
    for (const f of e) if (f) album.usar(f, pagina);
    return e;
  };

  // ── O plano: cada página sabe o seu número antes de se desenhar ─────────
  // É o que deixa o índice dizer a página VERDADEIRA de cada secção, e o
  // álbum não repetir uma fotografia em duas páginas seguidas.
  const plano: Passo[] = [];
  const proxima = () => plano.length + 1;

  // ── Capa ──
  // A fotografia que ela escolheu, se servir para a página inteira (deitada e
  // com pixéis para isso — `regra-da-capa.ts`, a mesma regra do aviso do
  // estúdio); senão, a melhor deitada da inspiração; senão, a dela na mesma.
  // Não há painel: ela pediu a capa só com a fotografia de fundo.
  // Ou a dela na mesma, quando ela o disse (`capaMesmoAssim`).
  // O enquadramento escolhido à mão (`focoDaCapa`) é da fotografia DELA: só
  // vai com ela, nunca com a deitada que a substitui.
  const fundoDaCapa =
    fotoDaCapa && (doc.capaMesmoAssim || !problemaDaCapa(fotoDaCapa.w, fotoDaCapa.h))
      ? doc.focoDaCapa
        ? { ...fotoDaCapa, foco: doc.focoDaCapa }
        : fotoDaCapa
      : (album.escolher(1, "deitada")[0] ?? fotoDaCapa ?? null);
  plano.push({
    chave: chaves.nova("capa"),
    fotos: [fundoDaCapa],
    desenhar: () =>
      capa(ctx, {
        sobretitulo: te.sobretituloCapa(org, casamento),
        nomes: doc.clientNames,
        // «JANTAR DE EMPRESA · 11.12.2026 · PALÁCIO PESTANA» — a data curta
        // lê-se da data dela (em português); sem ela, a data como está escrita.
        linha: [
          evento.eventType ?? "",
          dataCurta(isoDaDataPorExtenso(original.eventDate ?? "")) ?? evento.eventDate ?? "",
          doc.location ?? "",
        ]
          .map((s) => s.trim())
          .filter(Boolean)
          .join(" · "),
        fundo: fundoDaCapa,
      }),
  });

  // ── Índice ──
  {
    const chave = chaves.nova("indice");
    const foto =
      escolhidas(chave, proxima())?.[0] ?? album.escolher(proxima(), "alta")[0] ?? fundoDaCapa;
    plano.push({
      chave,
      fotos: [foto],
      desenhar: (numero, entradas) =>
        indice(ctx, { sobretitulo: te.indice, titulo: te.tituloIndice, entradas, foto, numero }),
    });
  }

  // ── A proposta ──
  {
    const chave = chaves.nova("proposta");
    const foto =
      escolhidas(chave, proxima())?.[0] ?? album.escolher(proxima(), "deitada")[0] ?? fundoDaCapa;
    const factos = [
      // «Noivos» só num casamento: num restaurante, numa empresa, numa festa,
      // quem recebe a proposta é o cliente.
      {
        rotulo: org || !casamento ? te.factos.cliente : te.factos.noivos,
        valor: doc.clientNames,
      },
      ...(org ? [] : [{ rotulo: te.factos.evento, valor: evento.eventType ?? "" }]),
      { rotulo: te.factos.data, valor: evento.eventDate ?? "" },
      { rotulo: te.factos.local, valor: doc.location ?? "" },
      { rotulo: te.factos.convidados, valor: evento.guests ?? "" },
      { rotulo: te.factos.servico, valor: doc.servico ?? "" },
      ...(org
        ? []
        : [
            // Num casamento, sempre; fora dele, só se ela a escreveu — é a regra
            // do estúdio, que só mostra o campo nesses dois casos.
            ...(casamento || (evento.ceremony ?? "").trim()
              ? [{ rotulo: te.factos.cerimonia, valor: evento.ceremony ?? "" }]
              : []),
            { rotulo: te.factos.hora, valor: evento.time ?? "" },
          ]),
    ].filter((f) => f.valor.trim());
    plano.push({
      entrada: te.aProposta,
      chave,
      fotos: [foto],
      desenhar: (numero) =>
        apresentacao(ctx, {
          sobretitulo: t.sobretituloApresentacao,
          titulo: te.tituloDaProposta(
            casamento
              ? primeirosNomes(doc.clientNames, idioma)
              : (doc.clientNames ?? "").trim() || null,
            org,
            casamento,
          ),
          factos,
          // O documento não tem um campo para esta nota: é a primeira que ela
          // escreveu nos temas, que é onde descreve a decoração.
          nota: comConteudo.find((x) => x.nota)?.nota ?? "",
          foto,
          numero,
        }),
    });
  }

  // ── O que propomos ──
  {
    const lista = servicosDoDocumento(original, doc);
    if (lista.length) {
      const grupos = (doc.serviceGroups ?? []).filter((g) => (g.title ?? "").trim());
      const titulo = te.tituloServicos(
        lista.length,
        grupos.length === 1 ? grupos[0].title.trim().toLocaleLowerCase("pt-PT") : null,
      );
      for (const { de: i, quantos } of cartoesPorPagina(lista.length)) {
        const pagina = proxima();
        const desta: Servico[] = lista.slice(i, i + quantos).map((s) => {
          const casado = temaDoServico(s.chave, comConteudo);
          const foto = casado?.fotos[0] ?? album.escolher(pagina, "deitada")[0] ?? null;
          if (foto) album.usar(foto, pagina);
          return { nome: s.nome, descricao: s.descricao, foto };
        });
        plano.push({
          chave: chaves.nova("servicos"),
          fotos: desta.map((d) => d.foto),
          desenhar: (numero) =>
            servicos(ctx, {
              sobretitulo: t.sobretituloServicos,
              titulo: i ? `${titulo} ${te.continuacao}` : titulo,
              servicos: desta,
              primeiro: i + 1,
              pagina: numero,
            }),
        });
      }
    }
  }

  // ── Paleta e ambiente ──
  if (inspiracao.length) {
    const pagina = proxima();
    const chave = chaves.nova("ambiente");
    // As cores e as fotografias desta página vêm das MESAS (jantar, buffet,
    // centros) — não da cerimónia, que vem primeiro e as dominava. Pedido
    // dela a 20/10; ver `eDasMesas`. Sem nenhum tema das mesas, ficam todas.
    // Só os que têm fotografias: um tema «Mesas» só com texto não dá cor.
    const dasMesas = comConteudo.filter(
      (x) => x.fotos.length && eDasMesas(x.pt.title ?? "", x.pt.subtitulo ?? ""),
    );
    const daPaleta = dasMesas.length ? dasMesas.flatMap((x) => x.fotos) : inspiracao;
    // As que ELA escolheu (23/10): lugares 0–4 a fila, o 5 o painel. Só as
    // fotografias — as cores continuam a ser as das mesas.
    const minhas = escolhidasPorLugar(chave, pagina) ?? [];
    const filaDela = Array.from({ length: 5 }, (_, i) => minhas[i] ?? null);
    const painelDela = minhas[5] ?? null;
    const dela = new Set(minhas.filter((f): f is Foto => !!f).map((f) => f.id));
    // A primeira fotografia de cada tema, depois as outras.
    const primeiras = (dasMesas.length ? dasMesas : comConteudo)
      .map((x) => x.fotos[0])
      .filter((f): f is Foto => Boolean(f));
    let filaAuto: Foto[];
    let painel: Foto | null;
    const quantasAuto = filaDela.filter((f) => !f).length;
    if (dasMesas.length) {
      // O painel (a fotografia grande) primeiro, das mesas; a fila com as
      // outras das mesas, e só se não chegarem a cinco, as restantes.
      painel = painelDela ?? album.escolher(pagina, "alta", 1, daPaleta, dela)[0] ?? null;
      filaAuto = [...new Set([...primeiras, ...daPaleta, ...inspiracao])]
        .filter((f) => f !== painel && !dela.has(f.id))
        .slice(0, quantasAuto);
    } else {
      // Sem tema das mesas: as primeiras de cada tema, e o painel à parte.
      filaAuto = [...new Set([...primeiras, ...inspiracao])]
        .filter((f) => !dela.has(f.id) && f !== painelDela)
        .slice(0, quantasAuto);
      painel =
        painelDela ??
        album.escolher(
          pagina,
          "alta",
          1,
          inspiracao,
          new Set([...dela, ...filaAuto.map((f) => f.id)]),
        )[0] ??
        null;
    }
    // Cada lugar vazio da fila leva a seguinte das automáticas.
    const fila: Foto[] = [];
    let a = 0;
    for (const f of filaDela) {
      const posta = f ?? filaAuto[a++];
      if (posta) fila.push(posta);
    }
    plano.push({
      chave,
      // A fila nos cinco primeiros lugares, o painel no sexto.
      fotos: [...fila, ...Array<null>(5 - fila.length).fill(null), painel],
      desenhar: async (numero) =>
        ambiente(ctx, {
          // A paleta lê os bytes: só quando se desenha (o plano não os tem).
          cores: await paletaDasFotos(daPaleta.slice(0, 40).map((f) => f.bytes)),
          fotos: fila,
          painel,
          pagina: numero,
        }),
    });
  }

  // ── Cronograma (modelo Organização) ──
  if (org) {
    const pecas: Peca[] = (doc.cronograma ?? [])
      .filter((f) => (f.title ?? "").trim() || f.items?.some((i) => i.trim()))
      .flatMap((f) => [
        { tipo: "h3" as const, texto: f.title.trim() },
        ...f.items.filter((i) => i.trim()).map((i) => ({ tipo: "item" as const, texto: i })),
      ]);
    if (pecas.length) {
      paginasDeColunasCorridas(
        "cronograma",
        t.sobretituloCronograma,
        t.tituloCronograma,
        pecas,
        2,
        t.tituloCronograma,
      );
    }
  }

  // ── Os capítulos de inspiração ──
  const capitulos = capitulosDaInspiracao(comConteudo, (x) => x.pt, casamento);
  let vezDoTema = 0;
  capitulos.forEach((c, ci) => {
    // Num casamento, o nome do dia («Cocktail»); fora dele, o título do próprio
    // mood board — é o que ela escreveu, e é o que o capítulo é.
    const nome = c.grupo ? te.grupos[c.grupo] : c.itens[0].titulo || te.inspiracao;
    const doCapitulo = c.itens.flatMap((x) => x.fotos);
    // O separador: as DUAS fotografias de maior resolução do capítulo — é a
    // regra do documento dela, e a forma não entra na escolha —, de
    // preferência fora do primeiro tema, que vem logo a seguir.
    const paginaDoSeparador = proxima();
    const chaveDoSeparador = chaves.nova(`separador:${c.chave}`);
    // «Nunca a mesma fotografia em páginas vizinhas» (§5): fora as da página
    // que vem logo a seguir — a primeira do primeiro tema. Se o capítulo não
    // tem mais nenhuma (um tema só, numa página), vêm de outro capítulo; e só
    // sem nenhuma outra na proposta é que se repete.
    const primeiro = c.itens[0];
    const logoASeguir = primeiro.fotos.slice(
      0,
      primeiro.fotos.length ? repartirFotos(primeiro.fotos.length, primeiro.disposicao)[0] : 0,
    );
    const evitar = new Set(logoASeguir.map((f) => f.id));
    const fora = (l: readonly Foto[]) => l.filter((f) => !evitar.has(f.id));
    const daqui = fora(doCapitulo).length
      ? doCapitulo
      : fora(inspiracao).length
        ? inspiracao
        : doCapitulo.length
          ? doCapitulo
          : inspiracao;
    // As que ela escolheu mandam: uma (o fundo é a mesma) ou duas.
    const fotosDoSeparador =
      escolhidas(chaveDoSeparador, paginaDoSeparador)?.slice(0, 2) ??
      album.escolher(paginaDoSeparador, "qualquer", 2, daqui, evitar);
    // Fora de um casamento, um tema em metades ou tríptico não tem texto na
    // página: a nota dele vai no separador, para não se perder.
    const notaDoSeparador =
      !c.grupo &&
      logoASeguir.length &&
      !temaDizONome(
        logoASeguir.map((f) => f.aspecto),
        vezDoTema + 1,
        primeiro.disposicao,
        false,
      )
        ? primeiro.nota
        : "";
    plano.push({
      entrada: `${te.inspiracao} · ${nome}`,
      chave: chaveDoSeparador,
      fotos: fotosDoSeparador,
      desenhar: (numero) =>
        separador(ctx, {
          sobretitulo: `${te.inspiracao} · ${String(ci + 1).padStart(2, "0")}`,
          titulo: nome,
          // A linha pequena: o subtítulo do primeiro tema do capítulo que o tem
          // («COMPOSIÇÕES FLORAIS, VELAS E CASTIÇAIS»).
          linha: c.itens.find((x) => x.subtitulo)?.subtitulo ?? "",
          nota: notaDoSeparador,
          fotos: fotosDoSeparador,
          numero,
        }),
    });

    for (const x of c.itens) {
      vezDoTema++;
      const numero = vezDoTema;
      const porPagina = x.fotos.length ? repartirFotos(x.fotos.length, x.disposicao) : [0];
      let feitas = 0;
      porPagina.forEach((quantas, k) => {
        const fotos = x.fotos.slice(feitas, feitas + quantas);
        feitas += quantas;
        const pagina = proxima();
        const chave = chaves.nova(`tema:${x.bi}`);
        for (const f of fotos) album.usar(f, pagina);
        // Um tema sem fotografias leva um painel de outro tema do capítulo
        // (ou, não havendo, de qualquer tema) — nenhuma página é só texto. Ou
        // o que ela escolheu para esse painel.
        const painel = fotos.length
          ? null
          : (escolhidas(chave, pagina)?.[0] ??
            album.escolher(pagina, "alta", 1, doCapitulo.length ? doCapitulo : inspiracao)[0] ??
            null);
        plano.push({
          chave,
          fotos: fotos.length ? fotos : [painel],
          desenhar: (n) =>
            tema(ctx, {
              numero,
              capitulo: ci + 1,
              // Um capítulo que é o próprio mood board não repete o título no topo.
              grupo: c.grupo ? nome : "",
              titulo: x.titulo,
              subtitulo: x.subtitulo,
              nota: x.nota,
              fotos,
              pagina: n,
              primeira: k === 0,
              painel,
              disposicao: x.disposicao,
            }),
        });
      });
    }
  });

  // ── A citação, depois da inspiração (§6.7): a fotografia horizontal de
  // maior resolução da proposta que não esteja numa página vizinha.
  if (capitulos.length) {
    const foto = escolhidas("citacao", proxima())?.[0] ?? album.escolher(proxima(), "deitada")[0];
    if (foto) {
      plano.push({
        chave: chaves.nova("citacao"),
        fotos: [foto],
        desenhar: () =>
          citacao(ctx, {
            sobretitulo: te.formaDeVer,
            frase: t.slogan ?? SITE.slogan,
            assinatura: SITE.name,
            foto,
          }),
      });
    }
  }

  // ── Investimento ──
  {
    const semMarcador = (v: string) => (/^\[[^\]]*\]$/.test(v.trim()) ? "" : v);
    const totalStr = semMarcador(org ? (doc.totalEstimatedText ?? "") : (doc.totalText ?? ""));
    const linhas: LinhaDoOrcamento[] = org
      ? (doc.budgetRows ?? [])
          .filter((r) => (r.item ?? "").trim())
          .map((r) => {
            const preco = semMarcador((r.price ?? "").trim()).trim();
            return { nome: r.item, preco: preco ? dinheiro(preco) : undefined };
          })
      : (() => {
          const marcas = opcionaisDe(doc);
          return ordemDeSaida(original, original.budgetItems, (s) => s)
            .filter((i) => (doc.budgetItems[i] ?? "").trim())
            .map((i) => ({
              nome: doc.budgetItems[i],
              marca: marcas[i] ? t.marcaExtra : undefined,
            }));
        })();
    const temOrcamento = linhas.length > 0 || totais.aPagar > 0 || Boolean(totalStr.trim());
    if (temOrcamento) {
      // O total primeiro (é a página «Investimento» do índice, §6.8); o
      // quadro das linhas a seguir, no mesmo desenho.
      const chaveDoTotal = chaves.nova("total");
      const fotoDoTotal =
        escolhidas(chaveDoTotal, proxima())?.[0] ?? album.escolher(proxima(), "deitada")[0] ?? null;
      plano.push({
        entrada: te.investimento,
        chave: chaveDoTotal,
        fotos: [fotoDoTotal],
        desenhar: (numero) => total(ctx, { ...dadosDoTotal(), foto: fotoDoTotal, pagina: numero }),
      });

      let primeiro = 1;
      for (const [k, desta] of repartirLinhas(ctx, linhas).entries()) {
        if (!desta.length) continue;
        const chave = chaves.nova("orcamento");
        const painel =
          escolhidas(chave, proxima())?.[0] ?? album.escolher(proxima(), "alta")[0] ?? null;
        const n0 = primeiro;
        primeiro += desta.length;
        plano.push({
          chave,
          fotos: [painel],
          desenhar: (numero) =>
            orcamento(ctx, {
              titulo: k ? `${te.tituloOrcamento} ${te.continuacao}` : te.tituloOrcamento,
              subtitulo: k ? "" : te.quantosServicos(linhas.length),
              linhas: desta,
              primeiro: n0,
              painel,
              pagina: numero,
            }),
        });
      }

      // O total e a escada que o explica — os mesmos rótulos e números do
      // gerador antigo (ver o bloco «Orçamento» de `proposal-doc-pdf.ts`).
      function dadosDoTotal() {
        const pct = totais.percentagemSinal;
        const extras = (doc.budgetExtras ?? []).filter(
          (e) => (e.label ?? "").trim() || (e.valueText ?? "").trim(),
        );
        const comIvaDito = (texto: string) =>
          totais.modo === "acrescer" && !/\+\s*(iva|vat)/i.test(texto)
            ? `${texto} ${t.maisIva}`
            : texto;
        const notas: string[] = [];
        const versoes = totaisDasVersoes(doc);
        if (versoes && versoes.comoOTotal.base > 0 && versoes.extras > 0) {
          const maisIva = totais.modo === "acrescer" ? ` ${t.maisIva}` : "";
          notas.push(`${t.semOsExtras}: ${eurDoc(versoes.comoOTotal.base)}${maisIva}`);
          notas.push(
            versoes.linhasExtra === 1 ? t.umaLinhaExtra : t.variasLinhasExtra(versoes.linhasExtra),
          );
        }
        if (doc.budgetNote?.trim()) notas.push(t.nota(doc.budgetNote));

        if (totais.aPagar <= 0) {
          return {
            rotulo: org ? t.totalEstimado : rotuloDoTotalNaLingua(doc, idioma),
            valor: comIvaDito(dinheiro(totalStr) || "—"),
            linhas: [],
            marcos: [],
            rodapeDoTotal: notas,
          };
        }
        const escada: { rotulo: string; valor: string; forte?: boolean }[] = [];
        if (extras.length) {
          escada.push({
            rotulo: org ? t.subtotalServicosEstimado : t.subtotalServicos,
            valor: eurDoc(totais.servicos),
          });
          for (const ex of extras) {
            const cru = normalizarValor(ex.valueText);
            const base = somaDosExtrasSemIva([ex], { mode: totais.modo, vatRate: totais.taxa });
            const escritoDela = (ex.valueText ?? "").trim();
            const mostraTudo = cru === null || round2(cru) !== base;
            const aoLado = mostraTudo ? dinheiro(escritoDela) : ressalvaDoValor(escritoDela);
            escada.push({
              rotulo: aoLado ? `${ex.label} (${aoLado})` : ex.label,
              valor: cru === null ? "—" : `+ ${eurDoc(base)}`,
            });
          }
        }
        escada.push({ rotulo: emFrase(t.totalSemIva), valor: eurDoc(totais.total), forte: true });
        escada.push({ rotulo: t.iva(percentagemDoIva(totais.taxa)), valor: eurDoc(totais.iva) });
        return {
          rotulo: t.totalAPagar,
          valor: eurDoc(totais.aPagar),
          nota: te.comIvaIncluido,
          linhas: escada,
          marcos: [
            { valor: eurDoc(totais.sinal), texto: `${t.sinal(pct)} · ${t.quandoSinal}` },
            { valor: eurDoc(totais.saldo), texto: `${t.saldo(100 - pct)} · ${t.quandoSaldo}` },
          ],
          rodapeDoTotal: notas,
        };
      }
    }
  }

  // ── Condições — SEMPRE, com ou sem orçamento ──
  {
    const lista = (titulo: string, itens: readonly string[]): Peca[] =>
      itens.length
        ? [
            { tipo: "h3", texto: comoTitulo(titulo) },
            ...itens.map((texto) => ({ tipo: "item" as const, texto })),
          ]
        : [];
    const validade = t.data(resolveValidUntil(doc));

    // 1. Notas, condições de reserva e próximos passos — três colunas.
    const notas = [
      [
        ...lista(t.notasImportantes, fixos.notasImportantes),
        ...lista(t.proximosPassos, [t.passoAceitar, t.passoSinal, t.passoValidade(validade)]),
      ],
      [
        ...lista(t.incluidoNaProposta, fixos.incluido),
        ...lista(t.naoIncluidoNoOrcamento, fixos.naoIncluido),
      ],
      lista(t.observacoesGerais, fixos.observacoesGerais),
    ].filter((c) => c.length);
    // Corridas pelas três colunas (e não uma secção por coluna, como no
    // modelo): os textos da casa são mais compridos do que os dele, e uma
    // coluna fixa deixava as outras vazias e passava para uma 4.ª página.
    paginasDeColunasCorridas(
      "condicoes:notas",
      te.condicoes,
      te.tituloNotas,
      notas.flat(),
      3,
      te.condicoes,
    );

    // 2. Condições gerais — duas colunas corridas.
    const gerais: Peca[] = fixos.condicoesGerais.map((texto) => ({ tipo: "item", texto }));
    if (gerais.length)
      paginasDeColunasCorridas(
        "condicoes:gerais",
        t.sobretituloCondicoes,
        te.tituloCondicoesGerais,
        gerais,
        2,
      );

    // 3. Pagamento e cancelamento — o faseamento com os valores, os contactos.
    const pct = totais.percentagemSinal;
    const marcos: Peca[] =
      totais.aPagar > 0
        ? [
            {
              tipo: "item",
              forte: `${t.sinal(pct)} · ${eurDoc(totais.sinal)}`,
              texto: t.quandoSinal,
            },
            {
              tipo: "item",
              forte: `${t.saldo(100 - pct)} · ${eurDoc(totais.saldo)}`,
              texto: t.quandoSaldo,
            },
            { tipo: "item", texto: t.baseDoCalculo(eurDoc(totais.aPagar)) },
          ]
        : [];
    const faseamento = lista(t.faseamentoDoPagamento, fixos.faseamento);
    const pagamento = [
      [
        ...(faseamento.length
          ? [...faseamento, ...marcos]
          : marcos.length
            ? [{ tipo: "h3" as const, texto: comoTitulo(t.faseamentoDoPagamento) }, ...marcos]
            : []),
      ],
      lista(t.cancelamento, fixos.cancelamento),
    ].filter((c) => c.length);
    paginasDeColunasFixas(
      "condicoes:pagamento",
      t.sobretituloCondicoes,
      te.tituloPagamento,
      pagamento,
      undefined,
      // Os contactos numa faixa por baixo das colunas, sem h3: o rótulo de
      // cada linha já diz o que é (o modelo).
      [
        { rotulo: t.email, valor: SITE.email },
        { rotulo: t.telefone, valor: SITE.phoneDisplay },
      ],
    );
  }

  // ── Contracapa ──
  // A da capa, ou a que ela escolheu só para aqui.
  const chaveDaContracapa = chaves.nova("contracapa");
  const fundoDaContracapa = escolhidas(chaveDaContracapa, proxima())?.[0] ?? fundoDaCapa;
  plano.push({
    chave: chaveDaContracapa,
    fotos: [fundoDaContracapa],
    desenhar: () =>
      contracapa(ctx, {
        sobretitulo: t.obrigada,
        agradecimento: t.agradecimento,
        // «E-MAIL · TELEFONE · VÁLIDA ATÉ 03.11.2026».
        linha: [
          SITE.email,
          SITE.phoneDisplay,
          `${te.validaAte} ${dataCurta(resolveValidUntil(doc)) ?? t.data(resolveValidUntil(doc))}`,
        ].join(" · "),
        fundo: fundoDaContracapa,
      }),
  });

  const entradas: EntradaDoIndice[] = plano.flatMap((p, i) =>
    p.entrada ? [{ titulo: p.entrada, pagina: i + 1 }] : [],
  );
  return { pdf, ctx, plano, entradas };

  /* ── As páginas de colunas, repartidas antes de se desenharem ────────── */

  /** Colunas fixas (cada uma continua na mesma coluna da página seguinte). */
  function paginasDeColunasFixas(
    base: string,
    sobre: string,
    titulo: string,
    colunas: readonly (readonly Peca[])[],
    entrada?: string,
    contactos?: readonly { rotulo: string; valor: string }[],
  ) {
    if (!colunas.length) return;
    const largura = larguraDaColuna(colunas.length);
    const altura = alturaDasColunas(ctx, titulo, Boolean(contactos?.length));
    const { paginas, tam } = numaPagina((tam) =>
      paginarColunasFixas(ctx, colunas, largura, altura, tam),
    );
    paginas.forEach((cols, k) => {
      const chave = chaves.nova(base);
      const faixa =
        escolhidas(chave, proxima())?.[0] ?? album.escolher(proxima(), "alta")[0] ?? null;
      plano.push({
        entrada: k === 0 ? entrada : undefined,
        chave,
        fotos: [faixa],
        desenhar: (numero) =>
          paginaDeColunas(ctx, {
            sobretitulo: sobre,
            titulo: k ? `${titulo} ${te.continuacao}` : titulo,
            colunas: cols,
            numeroDeColunas: colunas.length,
            tam,
            contactos: k === paginas.length - 1 ? contactos : undefined,
            faixa,
            pagina: numero,
          }),
      });
    });
  }

  /**
   * O texto das condições não se corta: se não couber numa página ao tamanho
   * do documento (14 px), a letra desce meio píxel de cada vez até
   * {@link TAM_MINIMO}; se nem assim, fica nos 14 e continua na página
   * seguinte. É o «encolhe até caber» das notas, aplicado a texto que não
   * pode perder uma palavra.
   */
  function numaPagina(paginar: (tam: number) => Peca[][][]) {
    for (let tam = 14; tam >= TAM_MINIMO; tam -= 0.5) {
      const paginas = paginar(tam);
      if (paginas.length <= 1) return { paginas, tam };
    }
    return { paginas: paginar(14), tam: 14 };
  }

  /** Uma lista corrida em `n` colunas, equilibradas quando cabe numa página. */
  function paginasDeColunasCorridas(
    base: string,
    sobre: string,
    titulo: string,
    pecas: readonly Peca[],
    n: number,
    entrada?: string,
  ) {
    const largura = larguraDaColuna(n);
    const altura = alturaDasColunas(ctx, titulo);
    const escolha = numaPagina((tam) => paginarCorrido(ctx, pecas, n, largura, altura, tam));
    const { tam } = escolha;
    let { paginas } = escolha;
    if (paginas.length === 1 && n === 2) {
      const k = aoMeio(ctx, pecas, largura, tam);
      const equilibradas = [pecas.slice(0, k), pecas.slice(k)];
      // Só se as duas metades couberem mesmo — senão fica a repartição corrida.
      if (equilibradas.every((c) => repartir(ctx, c, largura, altura, 1, tam).length <= 1)) {
        paginas = [equilibradas.filter((c) => c.length)];
      }
    }
    paginas.forEach((cols, k) => {
      const chave = chaves.nova(base);
      const faixa =
        escolhidas(chave, proxima())?.[0] ?? album.escolher(proxima(), "alta")[0] ?? null;
      plano.push({
        entrada: k === 0 ? entrada : undefined,
        chave,
        fotos: [faixa],
        desenhar: (numero) =>
          paginaDeColunas(ctx, {
            sobretitulo: sobre,
            titulo: k ? `${titulo} ${te.continuacao}` : titulo,
            colunas: cols,
            numeroDeColunas: n,
            tam,
            faixa,
            pagina: numero,
          }),
      });
    });
  }
}

/* ── Os serviços ─────────────────────────────────────────────────────────── */

/**
 * O tema que corresponde a um serviço, pelo nome: a mesma chave que o resto
 * do documento usa para alinhar o orçamento com os serviços
 * (`chaveDeRubrica`), igual ou contida uma na outra — «Apontamento Floral
 * Mesa Bolo» casa com «Decor Floral Mesa Bolo».
 */
function temaDoServico<T extends { pt: { title?: string }; fotos: readonly Foto[] }>(
  chave: string,
  temas: readonly T[],
): T | undefined {
  if (!chave) return undefined;
  const meus = chave.split(" ");
  return temas.find((x) => {
    if (!x.fotos.length) return false;
    const seus = chaveDeRubrica(x.pt.title ?? "")
      .split(" ")
      .filter(Boolean);
    if (!seus.length) return false;
    return seus.every((s) => meus.includes(s)) || meus.every((m) => seus.includes(m));
  });
}

/* ── Pequenas coisas ─────────────────────────────────────────────────────── */

/** «TOTAL (sem IVA)» como o exemplo o escreve: «Total (sem IVA)». */
const emFrase = (s: string) => s.replace(/^TOTAL\b/, "Total");

/** A taxa de IVA como o gerador antigo a escreve: «23%», «23,5%». */
const percentagemDoIva = (taxa: number): string =>
  `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(round2(taxa * 100))}%`;

async function logotipo(pdf: PDFDocument): Promise<PDFImage | null> {
  const png = await logotipoNaCor(Buffer.from(LOGO_WHITE_PNG_B64, "base64"), HEX.cal);
  return embedImagem(pdf, png);
}
