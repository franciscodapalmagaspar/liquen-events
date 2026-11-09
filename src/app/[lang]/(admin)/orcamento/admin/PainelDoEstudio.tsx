"use client";

import { useMemo, useRef, useState } from "react";
import type { MoodBoard, ProposalDoc } from "@/lib/proposal-doc";
import {
  capituloDoTema,
  ordemDoDesenho,
  planoDaProposta,
  type EntradaDoPlano,
} from "@/lib/pdf-editorial/plano";
import { MAXIMO_POR_PAGINA, disposicaoDoTema, repartir } from "@/lib/pdf-editorial/mosaico";
import { grupoDoTema } from "@/lib/pdf-editorial/grupos";
import { eCasamento } from "@/lib/proposal-evento";
import PaginaEditorial, { fontesDasFolhas } from "./PaginaEditorial";
import { ESTADO, MARCA, PRESSAO } from "./ui/movimento";
import { useMarcaQueAnda } from "./ui/useMarcaQueAnda";
import { FolhaOuDialogo } from "./ui";
import { usePaginaReal } from "./usePaginaReal";
import { IDIOMA_POR_OMISSAO, type IdiomaDaProposta } from "@/lib/proposal-doc-textos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A TERCEIRA ZONA — o painel que acompanha o que está a ser editado
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «hoje há uma miniatura "A página, como vai sair" por baixo de
 * cada mood board — minúscula e repetida sete vezes. Quero uma
 * pré-visualização grande e fixa à direita, no espaço hoje vazio».
 *
 * O estúdio era uma coluna de trabalho com um índice à esquerda e vazio dos
 * dois lados, enquanto o formulário se estendia por dez mil píxeis na vertical.
 * Passa a haver três zonas: onde estou (o índice), o que estou a escrever, e o
 * que vai sair.
 *
 * ── PORQUE É QUE É UM PAINEL SÓ, COM SEPARADORES ────────────────────────
 *
 * Porque a pré-visualização e a biblioteca de fotografias nunca são precisas
 * ao mesmo tempo: ou se está a montar uma página e o que faz falta são
 * fotografias à mão, ou se está a rever e o que faz falta é ver a folha. Dois
 * painéis lado a lado deixavam a coluna do meio com metade da largura — que é
 * exactamente o problema que isto existe para resolver.
 *
 * ── E PORQUE É QUE SÓ APARECE MUITO LARGO ───────────────────────────────
 *
 * Porque abaixo disso ele rouba ao trabalho. A regra da casa vale aqui como no
 * índice lateral: o editor de desktop ganha zonas, o telemóvel continua a ser o
 * formulário simples, e nada do que aqui está é a única maneira de fazer alguma
 * coisa.
 */

export interface PaginaParaOPainel {
  /** O índice REAL no documento — é por ele que o salto encontra a página. */
  bi: number;
  board: MoodBoard;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PAINEL SÓ CUSTA ONDE APARECE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um `hidden 2xl:block` esconde-o com CSS — e o React desenha-o na mesma.
 * Medido: numa proposta no tecto do gerador, desenhar as páginas aqui dentro
 * num ecrã onde elas nem se veem foi o suficiente para o estúdio deixar de
 * responder em cinco segundos num teste que antes corria à vontade.
 *
 * Quem trabalha num portátil não pode pagar o painel que não tem. Isto pergunta
 * ao navegador se ele CABE, e só aí é que há alguma coisa para desenhar.
 *
 * `useSyncExternalStore` e não um `useEffect` com estado: a resposta é uma
 * subscrição a uma coisa de fora do React, é exactamente para isso que ele
 * existe, e assim não há um fotograma desenhado com a resposta errada. No
 * servidor devolve `false` — o HTML sai sem painel e ele aparece na hidratação,
 * que é o mesmo que já acontece com o índice lateral.
 *
 * ── UM NÚMERO SÓ, E É O DA CASA ─────────────────────────────────────────
 *
 * Havia DOIS, e discordavam: esta medida dizia 1536 e o `<aside>` trazia
 * `hidden 2xl:block`, que também é 1536 — mas nenhum dos dois é um corte desta
 * casa. Os cortes são três (`ui/adaptativo.ts`), e o que quer dizer «há espaço
 * para um painel lateral SEM tirar nada ao conteúdo» é o `CORTES.largo`, 1440.
 * Entre 1440 e 1536 o painel cabia e não aparecia.
 *
 * E o `hidden … 2xl:block` sai por inteiro, não muda de número. Ele é a
 * segunda resposta à mesma pergunta, e é a resposta errada: esconder por CSS
 * é precisamente o que este ficheiro existe para NÃO fazer. Com a montagem
 * condicional, quando o `<aside>` é desenhado é porque cabe.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * A DECISÃO DEIXOU DE SER DAQUI — E A RAZÃO É QUE ESTE FICHEIRO NÃO A SABE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto era `useMedida("(min-width: 1440px)")`: uma pergunta à JANELA. E o
 * comentário acima prometia, em letra de lei, «quando o `<aside>` é desenhado é
 * porque cabe».
 *
 * A promessa era falsa, e MEDIDA num Chromium: no painel que abre a partir do
 * cartão de um cliente — que é por onde ela chega ao estúdio — a fila das três
 * colunas tem 712 px, por mais largo que seja o ecrã. Este `<aside>` de 21rem
 * mais o índice de 12rem pedem 576 sem negociar, e a coluna onde ela escreve
 * ficava com 136 px. A 1440, com 82.
 *
 * A janela tinha 2000. A caixa onde este painel aterra tinha 712. Este ficheiro
 * não tem como saber isso — só quem desenha a fila sabe. Por isso a resposta
 * passa a vir de fora, já medida onde importa (ver `LARGURA_MINIMA_DA_FILA`, no
 * `ProposalStudio.tsx`).
 *
 * O que NÃO mudou: continua a ser montagem condicional e não `hidden`. Esconder
 * por CSS deixa dois painéis montados, cada um com o seu estado — é isso que
 * este ficheiro existe para não fazer, e continua a não fazer.
 */

export default function PainelDoEstudio({
  cabe,
  paginas,
  activa,
  urls,
  originais,
  aspetos,
  doc,
  onSaltar,
  onEscolherFotos,
  quoteId,
  idioma = IDIOMA_POR_OMISSAO,
  seccao = null,
}: {
  /** As páginas com fotografias, pela ordem em que saem. */
  paginas: readonly PaginaParaOPainel[];
  /** O `bi` da página que está a ser editada, quando se sabe. */
  activa?: number;
  urls: Record<string, string>;
  originais: Record<string, string>;
  aspetos: Record<string, number>;
  /**
   * O documento, para as páginas saírem do PLANO do PDF novo (`plano.ts`) —
   * a vez de cada tema, que decide o lado do mosaico, e as páginas a mais de
   * um tema com mais de doze fotografias. Sem ele, cada tema desenha-se só com
   * as suas fotografias, como se fosse o único.
   */
  doc?: ProposalDoc;
  onSaltar: (bi: number) => void;
  /**
   * Abrir a biblioteca de temas já apontada a esta página.
   *
   * ── O QUE ISTO É, E O QUE AINDA NÃO É ───────────────────────────────────
   *
   * Ela pediu a biblioteca ABERTA no painel, para arrastar fotografias direto
   * para as páginas. Isto ainda não é isso: é o caminho mais curto para o
   * seletor que já existe, a partir do sítio onde ela está a olhar para a
   * página, sem ter de a ir procurar no meio do formulário.
   *
   * Está escrito para não se confundir com o que falta. O seletor de hoje é um
   * ecrã inteiro — com pesquisa, filtros e a marca das fotos já usadas — e
   * pô-lo dentro de uma coluna de vinte e uma polegadas é reescrevê-lo, não
   * mudá-lo de sítio.
   */
  onEscolherFotos?: (bi: number) => void;
  /**
   * Se há espaço para este painel — decidido por quem desenha a fila, que é o
   * único que sabe quanto ela mede. Sem isto, este ficheiro perguntava à janela
   * e aterrava numa caixa três vezes mais pequena.
   */
  cabe: boolean;
  /**
   * O pedido, para o painel pedir ao servidor a página REAL do rascunho (A1)
   * — ver `usePaginaReal`. Sem ele, fica a aproximação de sempre.
   */
  quoteId?: string;
  /** A língua em que o PDF vai sair — a da pré-visualização. */
  idioma?: IdiomaDaProposta;
  /**
   * A secção do formulário que está à vista (`useSeccaoAVista`). Fora da
   * Inspiração, o painel mostra a página que ESSA secção produz — a capa, a
   * proposta, os serviços, o orçamento — e não a última página de mood board.
   */
  seccao?: string | null;
}) {
  const [vista, setVista] = useState<"pagina" | "documento">("pagina");

  /**
   * ── E ESTA BARRA TAMBÉM TEM UMA MARCA QUE ANDA ──────────────────────────
   *
   * Esta é a única barra de separadores do estúdio escrita à mão, fora do
   * `ui/Segmented.tsx` — e por isso a única que ficou sem o gesto que ele já
   * tem: o botão activo acendia num sítio e apagava-se no outro no mesmo
   * fotograma, com os 120 ms do `ESTADO` a mudar-lhe só a cor.
   *
   * `useMarcaQueAnda` é a mesma medida do `NavEstudio` — a zona é a barra
   * (`relative`), o marcado reconhece-se pelo `aria-selected` que estes botões
   * já tinham, e a `chave` é a vista escolhida. O desenho fica aqui, porque é
   * aqui que ele difere: a pílula do `Segmented` é `rounded-full` e branca
   * numa calha de 1 px; esta é o `rounded-[6px]` que os botões já usavam.
   *
   * O tempo é o `MARCA` da casa (o degrau `quick` do documento), e a assimetria
   * é a que o `Segmented` explica: o texto acende nos 120 ms do `ESTADO` e a
   * marca chega aos 250. Não se escreve aqui um segundo número.
   */
  const separadoresRef = useRef<HTMLDivElement>(null);
  const { marca, podeAndar } = useMarcaQueAnda(separadoresRef, '[aria-selected="true"]', vista);

  /**
   * A primeira página de cada tema, tal como o plano do PDF a desenha. Sem
   * documento (ou um tema que o plano não tem — vazio), uma página feita só
   * com as fotografias do tema.
   */
  const plano = useMemo(() => (doc ? planoDaProposta(doc) : []), [doc]);
  const docDosTemas = useMemo<ProposalDoc>(() => {
    if (doc) return doc;
    const moodBoards: MoodBoard[] = [];
    for (const p of paginas) moodBoards[p.bi] = p.board;
    return { moodBoards } as ProposalDoc;
  }, [doc, paginas]);
  const entradaDe = (p: PaginaParaOPainel, vez: number): EntradaDoPlano =>
    plano.find((e) => e.tipo === "tema" && e.bi === p.bi && e.parte === 0) ?? {
      tipo: "tema",
      bi: p.bi,
      vez,
      // A mesma chave de capítulo que o `plano.ts` dá: o grupo do dia num
      // casamento, `tema-<n>` fora dele (cada mood board é o seu capítulo).
      grupo: (doc ? eCasamento(doc.eventType) : true)
        ? grupoDoTema(p.board.title ?? "", p.board.subtitulo ?? "")
        : `tema-${vez}`,
      titulo: (p.board.title ?? "").trim(),
      parte: 0,
      partes: 1,
      fotos: ordemDoDesenho(p.board).slice(
        0,
        repartir(p.board.images.length, disposicaoDoTema(p.board))[0] ?? MAXIMO_POR_PAGINA,
      ),
      disposicao: disposicaoDoTema(p.board),
      nome:
        (p.board.title ?? "").trim() ||
        capituloDoTema(p.board, doc ? eCasamento(doc.eventType) : true),
      seccao: "moodboards",
    };
  const entradas = paginas.map((p, i) => entradaDe(p, i + 1));
  const fontes = fontesDasFolhas(docDosTemas, plano.length ? plano : entradas, urls, originais);
  const folha = (p: PaginaParaOPainel, i: number) => (
    <PaginaEditorial
      pagina={entradas[i]}
      doc={docDosTemas}
      aspetos={aspetos}
      capa={fontes.capa}
      fotosDoTema={fontes.fotosDoTema}
      outras={fontes.outrasDa(Math.max(0, plano.indexOf(entradas[i])))}
    />
  );

  // Quantas inspirações o PDF leva — pelo plano, que conta também um mood
  // board que ainda só tem título (já é uma página). `paginas` só tem os que
  // já têm fotografias, e o painel dizia «0 inspirações» com uma lá dentro.
  const nInspiracoes = plano.length
    ? plano.filter((e) => e.tipo === "tema" && e.parte === 0).length
    : paginas.length;
  const aVer = paginas.find((p) => p.bi === activa) ?? paginas[0];

  /* ── A PÁGINA REAL (A1) ──────────────────────────────────────────────────
     O número da página no PDF é o lugar dela no plano (`plano.ts` — o mesmo
     que o estúdio conta, e que um teste prende ao PDF). A página real só se
     pede quando o painel está à vista e na vista «Esta página»: na vista de
     conjunto, e com o painel fechado, não há pedido nenhum. */
  const nDaPagina = (() => {
    if (!aVer) return null;
    const i = plano.findIndex((e) => e.tipo === "tema" && e.bi === aVer.bi && e.parte === 0);
    return i >= 0 ? i + 1 : null;
  })();
  /* ── A PÁGINA DA SECÇÃO QUE ESTÁ À VISTA ────────────────────────────────
     Pedido dela (9/11): «à medida que vamos fazendo scroll, as páginas vão
     mudando». Cada página do plano diz que secção a produz (`seccao`); a
     secção à vista escolhe a primeira dessas — com três preferências, porque a
     primeira nem sempre é a que se está a mexer: no Evento a página «A
     proposta» (o índice vem antes, mas não muda com o que lá se escreve), nas
     Capas a capa, e no Total a página do total. Numa secção que não tem página
     (as notas, o envio), fica a última que tinha. */
  /* O mood board que está a ser editado, pelo plano — e não só pelos que já
     têm fotografias (`paginas`). Um mood board novo, só com o título, já tem
     página no PDF; o painel ficava na página anterior até lhe pôr uma foto
     (achado da volta à mão de 9/11). */
  const nDoBoard = (() => {
    if (activa == null) return null;
    const i = plano.findIndex((e) => e.tipo === "tema" && e.bi === activa && e.parte === 0);
    return i >= 0 ? i + 1 : null;
  })();
  const nDaSeccao = (() => {
    if (!seccao) return null;
    const preferida = PAGINA_PREFERIDA[seccao];
    let i = preferida ? plano.findIndex((e) => e.tipo === preferida) : -1;
    if (i < 0) i = plano.findIndex((e) => e.seccao === seccao);
    return i >= 0 ? i + 1 : null;
  })();
  const naInspiracao = seccao === "moodboards" || seccao == null;
  const nSeguida = naInspiracao ? (nDoBoard ?? nDaPagina ?? nDaSeccao) : nDaSeccao;

  // A última página seguida, para uma secção sem página (as notas, o envio)
  // não deixar o painel vazio. Estado derivado acertado no próprio render — o
  // padrão do React para «lembrar o valor anterior de uma prop».
  const [ultimaSeguida, setUltimaSeguida] = useState<number | null>(null);
  if (nSeguida != null && nSeguida !== ultimaSeguida) setUltimaSeguida(nSeguida);
  /* «Anterior» e «Seguinte» folheiam a partir da que se segue — e a mão larga
     a página no instante em que ela desce para outra secção. */
  const [folheada, setFolheada] = useState<{ de: number | null; n: number } | null>(null);
  const base = nSeguida ?? ultimaSeguida ?? (plano.length ? 1 : null);
  const nMostrada = folheada && folheada.de === base ? folheada.n : base;
  const aFolhear = !!folheada && folheada.de === base;
  /* Uma secção que FAZ páginas, mas ainda não fez nenhuma (um orçamento sem
     linhas, serviços por escrever): mostrar a página anterior era mostrar uma
     página que não tem nada a ver com o que se está a escrever. Diz-se que a
     página ainda não existe. As secções que nunca fazem página (as notas, o
     envio) continuam a deixar ficar a última. */
  const semPaginaAinda =
    !!seccao && SECCOES_COM_PAGINA.has(seccao) && nSeguida == null && plano.length > 0 && !aFolhear;
  const entradaMostrada = nMostrada ? plano[nMostrada - 1] : undefined;
  /* ── O QUE SE VÊ É O QUE SAI ─────────────────────────────────────────────
     Palavras dela (9/11): «é mesmo importante que aquilo que se está a ver é
     aquilo que vai sair». Com um pedido (`quoteId`), o painel mostra SÓ a
     página real, desenhada pelo motor do PDF — nunca a aproximação feita no
     navegador, que podia partir uma linha noutro sítio ou escolher outra foto.
     Enquanto a real não chega: a última real dessa página com «A atualizar…»,
     ou, na primeira vez, uma folha em branco com o nome dela. A aproximação só
     fica onde não há pedido nenhum a quem perguntar. */
  const mostraTema =
    !quoteId &&
    !!aVer &&
    (!entradaMostrada ||
      (entradaMostrada.tipo === "tema" &&
        entradaMostrada.bi === aVer.bi &&
        entradaMostrada.parte === 0));
  const folhear = (passo: number) => {
    if (!nMostrada || !plano.length) return;
    const n = Math.min(plano.length, Math.max(1, nMostrada + passo));
    setFolheada({ de: base, n });
  };

  const real = usePaginaReal({
    quoteId: cabe && vista === "pagina" ? quoteId : undefined,
    doc,
    idioma,
    n: nMostrada,
    total: plano.length || undefined,
  });
  // A imagem que chegou é desta página? Se ela mudou de página, a anterior
  // seria a página ERRADA — fica a aproximação até a certa chegar.
  const urlReal = real.url && real.n === nMostrada ? real.url : null;
  const [emGrande, setEmGrande] = useState(false);

  // Não cabe: não há painel nenhum, nem o custo de o desenhar. Ver
  // `useLarguraQueChega`.
  if (!cabe) return null;

  return (
    <aside
      className="w-[21rem] shrink-0"
      aria-label="O que vai sair"
      data-seccao={seccao ?? ""}
      data-pagina={nMostrada ?? ""}
    >
      {/* `sticky` e não fixo: acompanha o scroll da coluna do meio sem sair da
          página, e por isso continua a poder ser percorrido no fim do
          formulário como qualquer outra coisa. */}
      <div className="sticky top-[var(--bo-colado-topo)] flex max-h-[var(--bo-colado-altura)] flex-col">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <p className="bo-eyebrow">O que vai sair</p>
          {/*
           * A conta de páginas, ao vivo — E COM O NOME DO QUE CONTA.
           *
           * São as páginas de mood board: as que mudam com o que ela faz aqui.
           * As folhas fixas do documento (capa, apresentação, serviços,
           * orçamento, condições) não mudam com um clique nesta secção, e
           * contá-las aqui dava um número que nunca se mexia.
           *
           * O que mudou foi a PALAVRA. Dizia «7 páginas», e a vista de conjunto
           * ao lado diz «Página 4 de 13» sobre o mesmo documento — dois números
           * com o mesmo nome a falar de coisas diferentes, que é literalmente a
           * queixa dela: «a contagem tem de bater certo». Contam coisas
           * diferentes de propósito; o que não podiam era chamar-lhes o mesmo.
           */}
          <p className="text-[11px] text-foreground/45 tabular-nums">
            {nInspiracoes === 1 ? "1 inspiração" : `${nInspiracoes} inspirações`}
          </p>
        </div>

        {!plano.length && paginas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--bo-hairline-strong)] px-3 py-6 text-center text-[12px] leading-relaxed text-foreground/45">
            Ainda não há páginas de inspiração.
            <br />
            Aparecem aqui à medida que as fizeres.
          </p>
        ) : (
          <>
            {paginas.length > 0 && (
              <div
                ref={separadoresRef}
                role="tablist"
                aria-label="O que mostrar"
                /* `relative` porque é ESTA barra o `offsetParent` da marca: as
                 medidas que o `useMarcaQueAnda` devolve são relativas a ela. */
                className="relative mb-3 flex gap-1 rounded-lg bg-[var(--bo-tinta-6)] p-0.5"
              >
                {/* A marca que anda. `aria-hidden` porque não diz nada que o
                  `aria-selected` de cada separador não diga melhor — é
                  desenho, não informação. Fica ATRÁS dos botões (eles são
                  `relative`), para o texto continuar por cima do branco.

                  `MARCA` traz `motion-safe:` nas duas classes: quem pediu para
                  não animar vê-a mudar de sítio de um fotograma para o outro. */}
                {marca && (
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute left-0 top-0 rounded-[6px] bg-[var(--bo-surface)] ${
                      podeAndar ? MARCA : ""
                    }`}
                    style={{
                      translate: `${marca.x}px ${marca.y}px`,
                      width: marca.largura,
                      height: marca.altura,
                    }}
                  />
                )}
                {(
                  [
                    ["pagina", "Esta página"],
                    ["documento", "Todas"],
                  ] as const
                ).map(([id, rotulo]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={vista === id}
                    onClick={() => setVista(id)}
                    className={`relative flex-1 rounded-[6px] px-2 py-1.5 text-[11px] ${ESTADO} ${PRESSAO} ${
                      vista === id
                        ? /* O fundo próprio é a rede de antes de a marca existir
                           — no servidor, e no fotograma antes da primeira
                           medida. Sai no instante em que ela está no sítio:
                           nunca há dois fundos, e nunca há nenhum. É a mesma
                           regra que o `Segmented` explica por extenso. */
                          `text-[var(--bo-text)] ${marca ? "" : "bg-[var(--bo-surface)]"}`
                        : "text-[var(--bo-text-muted)] hover:text-[var(--bo-text)]"
                    }`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {/* ── E O PAINEL QUE CHEGA APRESENTA-SE ────────────────────────
                  O separador movia-se e o conteúdo trocava de golpe. É o mesmo
                  gesto que os separadores do painel do pedido já têm — a
                  `.view-in` da casa, 240 ms, a curva de quem apresenta.

                  ── PORQUE É QUE AQUI O `key` PODE REMONTAR ─────────────────
                  Lá os dois painéis ficam montados (só `hidden`) e a classe
                  entra e sai com eles, porque o painel que sai guarda um
                  rascunho escrito à mão. Aqui não guarda nada: o que estas
                  duas vistas mostram é derivado do documento, e o cabeçalho
                  deste ficheiro explica porque é que a vista escondida NÃO
                  pode ficar montada — desenhar todas as páginas num ecrã onde
                  não se veem foi o suficiente para o estúdio deixar de
                  responder. As duas já se desmontavam uma à outra; o `key` só
                  garante que a classe recomeça em vez de o React reaproveitar
                  o nó e a animação nunca correr. */}
              <div key={vista} className="view-in">
                {vista === "pagina" && semPaginaAinda ? (
                  <>
                    <div className="flex aspect-[1123/794] w-full items-center justify-center rounded-[3px] border border-dashed border-[var(--bo-hairline-strong)] px-5 text-center text-[11px] leading-relaxed text-[var(--bo-text-muted)]">
                      Esta parte ainda não tem página no PDF. Aparece aqui assim que a preencheres.
                    </div>
                    <Folhear n={nMostrada} total={real.paginas ?? plano.length} onFolhear={folhear}>
                      {plano.length} páginas no PDF
                    </Folhear>
                  </>
                ) : vista === "pagina" && !mostraTema ? (
                  <PaginaDaSeccao
                    url={urlReal}
                    n={nMostrada}
                    total={real.paginas ?? plano.length}
                    nome={entradaMostrada?.nome}
                    aCarregar={real.aCarregar}
                    falhou={real.falhou}
                    onAbrir={() => setEmGrande(true)}
                    onFolhear={folhear}
                    onEscolherFotos={
                      onEscolherFotos && entradaMostrada?.tipo === "tema"
                        ? () => onEscolherFotos(entradaMostrada.bi)
                        : undefined
                    }
                  />
                ) : vista === "pagina" && aVer ? (
                  <>
                    {urlReal ? (
                      /* A página real, desenhada pelo motor do PDF. Um toque
                         abre-a em grande — a mesma imagem, sem outro pedido. */
                      <button
                        type="button"
                        onClick={() => setEmGrande(true)}
                        aria-label={`Ver a página ${nMostrada} em grande`}
                        className={`relative block w-full rounded-[3px] ${ESTADO} ${PRESSAO}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={urlReal}
                          alt={`Página ${nMostrada} do PDF, como vai sair`}
                          className="block w-full rounded-[3px] border border-[var(--bo-hairline)]"
                        />
                        {real.aCarregar && (
                          <span className="absolute right-2 top-2 rounded-full bg-[var(--bo-surface)] px-2 py-0.5 text-[10px] text-[var(--bo-text-muted)]">
                            A atualizar…
                          </span>
                        )}
                      </button>
                    ) : (
                      <div className="relative">
                        {folha(aVer, paginas.indexOf(aVer))}
                        {/* Dizer que é uma aproximação: a página real é a do
                            PDF, e esta é o navegador a adivinhar. */}
                        {quoteId && (
                          <span className="absolute inset-x-2 bottom-2 rounded-md bg-[var(--bo-surface)] px-2 py-1 text-center text-[10px] text-[var(--bo-text-muted)]">
                            {real.falhou
                              ? "Aproximação — a página real não chegou agora"
                              : "Aproximação — a página real está a chegar"}
                          </span>
                        )}
                      </div>
                    )}
                    <Folhear onFolhear={folhear} n={nMostrada} total={real.paginas ?? plano.length}>
                      {nMostrada && (real.paginas ?? plano.length)
                        ? `Página ${nMostrada} de ${real.paginas ?? plano.length} · `
                        : ""}
                      Inspiração {paginas.findIndex((p) => p.bi === aVer.bi) + 1} de{" "}
                      {paginas.length}
                    </Folhear>
                    {onEscolherFotos && (
                      <button
                        type="button"
                        onClick={() => onEscolherFotos(aVer.bi)}
                        className={`mt-3 w-full rounded-lg border border-[var(--bo-hairline-strong)] px-3 py-2 text-[12px] text-[var(--bo-text-muted)] hover:border-sage-600/40 hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
                      >
                        Escolher fotografias para esta página
                      </button>
                    )}
                  </>
                ) : (
                  /*
                   * ── DUAS A DUAS, COMO NO PAPEL ──────────────────────────
                   *
                   * «Ver duas páginas lado a lado, como no PDF impresso.» Uma
                   * proposta lê-se em par: quem a abre num leitor de PDF vê a
                   * folha esquerda e a direita ao mesmo tempo, e a pergunta que
                   * só se faz assim é se as duas combinam.
                   */
                  <div className="grid grid-cols-2 gap-2">
                    {paginas.map((p, i) => (
                      <button
                        key={p.board.id ?? p.bi}
                        type="button"
                        onClick={() => onSaltar(p.bi)}
                        className={`rounded-[3px] text-left hover:opacity-100 ${ESTADO} ${PRESSAO} ${
                          p.bi === activa ? "opacity-100" : "opacity-75"
                        }`}
                        aria-label={`Ir para a página ${i + 1}${p.board.title ? `: ${p.board.title}` : ""}`}
                      >
                        {folha(p, i)}
                        <span className="mt-1 block truncate text-[10px] text-foreground/45 tabular-nums">
                          {i + 1}. {p.board.title || "sem título"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      <FolhaOuDialogo
        aberto={emGrande && !!urlReal}
        onFechar={() => setEmGrande(false)}
        titulo={nMostrada ? `Página ${nMostrada}` : "A página"}
        largura="largo"
      >
        {urlReal && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={urlReal}
            alt={`Página ${nMostrada} do PDF, como vai sair`}
            className="block w-full rounded-[3px] border border-[var(--bo-hairline)]"
          />
        )}
      </FolhaOuDialogo>
    </aside>
  );
}

/** As secções do formulário que produzem páginas no plano (`plano.ts`). */
const SECCOES_COM_PAGINA = new Set([
  "capas",
  "evento",
  "servicos",
  "moodboards",
  "cronograma",
  "orcamento",
  "total",
]);

/** Qual das páginas de uma secção é a que ela está a mexer (ver `nDaSeccao`). */
const PAGINA_PREFERIDA: Record<string, EntradaDoPlano["tipo"]> = {
  evento: "proposta",
  capas: "capa",
  total: "total",
};

/** A legenda da página, com «anterior» e «seguinte» de cada lado. */
function Folhear({
  n,
  total,
  onFolhear,
  children,
}: {
  n: number | null;
  total: number;
  onFolhear: (passo: number) => void;
  children: React.ReactNode;
}) {
  const seta = `alvo-toque flex h-7 w-7 items-center justify-center rounded-full text-[var(--bo-text-muted)] hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-text)] disabled:opacity-30 ${ESTADO} ${PRESSAO}`;
  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <button
        type="button"
        className={seta}
        onClick={() => onFolhear(-1)}
        disabled={!n || n <= 1}
        aria-label="Página anterior"
      >
        ‹
      </button>
      <p
        className="min-w-0 text-center text-[11px] text-foreground/45 tabular-nums"
        aria-live="polite"
      >
        {children}
      </p>
      <button
        type="button"
        className={seta}
        onClick={() => onFolhear(1)}
        disabled={!n || n >= total}
        aria-label="Página seguinte"
      >
        ›
      </button>
    </div>
  );
}

/**
 * Uma página que não é de mood board — a capa, a proposta, os serviços, o
 * orçamento. Destas não há aproximação desenhada no navegador: é a página
 * REAL (o motor do PDF) ou, enquanto não chega, uma folha em branco com o
 * nome dela, do tamanho exacto da página, para nada saltar quando chega.
 */
function PaginaDaSeccao({
  url,
  n,
  total,
  nome,
  aCarregar,
  falhou,
  onAbrir,
  onFolhear,
  onEscolherFotos,
}: {
  url: string | null;
  n: number | null;
  total: number;
  nome?: string;
  aCarregar: boolean;
  falhou: boolean;
  onAbrir: () => void;
  onFolhear: (passo: number) => void;
  onEscolherFotos?: () => void;
}) {
  return (
    <>
      {url ? (
        <button
          type="button"
          onClick={onAbrir}
          aria-label={`Ver a página ${n} em grande`}
          className={`relative block w-full rounded-[3px] ${ESTADO} ${PRESSAO}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`Página ${n} do PDF, como vai sair`}
            className="block w-full rounded-[3px] border border-[var(--bo-hairline)]"
          />
          {(aCarregar || falhou) && (
            <span className="absolute right-2 top-2 rounded-full bg-[var(--bo-surface)] px-2 py-0.5 text-[10px] text-[var(--bo-text-muted)]">
              {aCarregar ? "A atualizar…" : "Por atualizar — tenta daqui a pouco"}
            </span>
          )}
        </button>
      ) : (
        <div className="flex aspect-[1123/794] w-full items-center justify-center rounded-[3px] border border-[var(--bo-hairline)] bg-[var(--bo-tinta-6)] px-4 text-center text-[11px] leading-relaxed text-[var(--bo-text-muted)]">
          {falhou
            ? "A página não chegou agora — tenta daqui a pouco"
            : `A preparar «${nome ?? "a página"}»…`}
        </div>
      )}
      <Folhear n={n} total={total} onFolhear={onFolhear}>
        {n ? `Página ${n} de ${total}` : ""}
        {nome ? ` · ${nome}` : ""}
      </Folhear>
      {onEscolherFotos && (
        <button
          type="button"
          onClick={onEscolherFotos}
          className={`mt-3 w-full rounded-lg border border-[var(--bo-hairline-strong)] px-3 py-2 text-[12px] text-[var(--bo-text-muted)] hover:border-sage-600/40 hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
        >
          Escolher fotografias para esta página
        </button>
      )}
    </>
  );
}
