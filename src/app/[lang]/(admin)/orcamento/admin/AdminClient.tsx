"use client";

import { useState, useMemo, useEffect, useRef, useCallback, Fragment } from "react";
import { usePathname } from "next/navigation";
import { localeDoCaminho } from "@/lib/i18n/config";
import { razaoDaRecusa, porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import type { LeituraFalhada } from "@/lib/porque-nao-leu";
import type { Quote, QuoteSummary, QuoteStatus, ActivityEntry } from "@/lib/orcamento/types";
import type { RecentQuote } from "./CommandPalette";
import { AvisoDeArmazenamento } from "./AvisoDeArmazenamento";
import { alturaQueSobraParaODetalhe, tecladoAberto } from "@/lib/orcamento/barra-de-destinos";
import {
  esquecerRascunho,
  guardarRascunho,
  oQueMudou,
  type CamposDoPedido,
  type RascunhoEncontrado,
} from "./rascunho-do-pedido";
import { mesesDeEvento, plannersDe, regioesDe } from "@/lib/orcamento/espera";
import { useToast } from "./Toast";
import CommandPalette, { type Command } from "./CommandPalette";
// Janelas que só se abrem a pedido, fora do pacote inicial (`janela-a-pedido.tsx`).
import {
  AjudaGlossario,
  aquecerJanelas,
  PasskeysDialog,
  RestoreDialog,
  ShortcutsModal,
} from "./janela-a-pedido";
// O «Novo pedido» fica no pacote, como o ⌘K: abre-se com o «n» e escreve-se logo.
import NewQuoteModal from "./NewQuoteModal";
import SessaoExpirada from "./SessaoExpirada";
import { downloadCsv, quotesToCsvRows, dateStamp } from "./exportar-em-csv";
import { lerDaCache, prefetchList } from "./useCachedList";
import { temasEmCache } from "./theme-picker-cache";
import {
  montarGruposDaProcura,
  type GrupoDaProcura,
  type PedidoDaPaleta,
  type PropostaDaProcura,
} from "./procura-em-tudo";
import { useGravacaoAutomatica, useTravaoDeSaida } from "./useGravacaoAutomatica";
import { fetchComTecto, respostaDeHttp, type RespostaDoEnvio } from "@/lib/gravar-com-tecto";
import { useInscricaoNoRegisto } from "./registo-de-gravacoes";
import { onIdle } from "@/lib/onIdle";
import { marcarSaidaDeProposito } from "./entrada-destino";
import { limparCachesAoSair } from "@/lib/limpar-caches-ao-sair";
import { randomId, todayKey } from "./util";
import { useAnular } from "./ui/anular";
import { useDepoisDeApagar, useDepoisDeApagarVarios } from "./ui/depois-de-apagar";
import { reporEstadoDoPedido } from "./anular-estado";
import { useFocusTrap } from "./useFocusTrap";
import { useCamadaDeHistoria } from "./useCamadaDeHistoria";
import { useTrincoDeScroll } from "./useTrincoDeScroll";
import { asPropostasMudaram, usePropostasLevesSoOuvir } from "./percentagem-do-sinal";
import { NAV, type View } from "./nav";
import { useDesceu } from "./ui/adaptativo";
import { Button, EmCurso, FolhaOuDialogo, PerguntaDestrutiva } from "./ui";
/* ── A ESCALA DE MOVIMENTO DA CASA ─────────────────────────────────────────
   Ver `ui/movimento.ts` para o censo que a motivou. Duas velocidades e só
   duas: `ESTADO` são os 120 ms do degrau `micro` (passar o rato, focar, mudar
   de cor/contorno/sombra) numa lista FECHADA de propriedades — nenhuma delas
   força *layout* —, e `PRESSAO` é o toque a 20 ms para tudo aquilo em que se
   carrega. As duas trazem `motion-safe:` porque o `globals.css` não tem rede
   global nenhuma: só desliga transições dentro de `prefers-reduced-motion` em
   três sítios muito concretos, e nenhum deles é este ficheiro. */
import { useDescarga } from "./ui/descarregar";

import { useMarcaQueAnda } from "./ui/useMarcaQueAnda";
/* A outra metade do vocabulário: a `.bo-saida` é a palavra em CSS, e este hook
   é a parte que o CSS não pode fazer sozinho — segurar o nó montado os 200 ms
   da saída. A prosa toda está no `ui/saida.ts` e na regra do `globals.css`. */
import { SAIDA, SAIDA_FUNDO, useSaidaAdiada } from "./ui/saida";
/* E a palavra do corpo de um `<details>`, escrita uma vez para os dez do
   back office. O censo dela conta estes dois como «fora de alcance» porque
   vivem aqui; ficam dentro. */
import { useGaveta } from "./ui/gaveta";
import { varrerDerivadasEmFundo } from "./varrer-derivadas";
import { varrerAquecimentoEmFundo } from "./varrer-aquecimento";
import { ImportarProposta } from "./lazy";
import { ListaDosPedidos } from "./_pedidos/ListaDosPedidos";
import { BarraDaSeleccao } from "./_pedidos/BarraDaSeleccao";
import { PastilhasDaLista } from "./_pedidos/PastilhasDaLista";
import { ControlosDaLista } from "./_pedidos/ControlosDaLista";
import { accoesDosPedidos } from "./_pedidos/accoes-dos-pedidos";
import { OPedidoAberto } from "./_pedidos/painel/pedido-aberto";
import { PeDoPainel } from "./_pedidos/painel/PeDoPainel";
import { TopoDoPainel } from "./_pedidos/painel/TopoDoPainel";
import { RascunhoPorRepor } from "./_pedidos/painel/RascunhoPorRepor";
import { CabecalhoDoPainel } from "./_pedidos/painel/CabecalhoDoPainel";
import { FerramentasDoPedido } from "./_pedidos/painel/FerramentasDoPedido";
import { ContactoDoCliente } from "./_pedidos/painel/ContactoDoCliente";
import { GestaoDoPedido } from "./_pedidos/painel/GestaoDoPedido";
import { Vistas } from "./_casca/Vistas";
import { BarraDeDestinos } from "./_casca/BarraDeDestinos";
import { MenuLateral } from "./_casca/MenuLateral";
import { Cabecalho } from "./_casca/Cabecalho";
import { useNovaTarefa } from "./_casca/useNovaTarefa";
import { useAtalhosDoTeclado } from "./_casca/useAtalhosDoTeclado";
import { useVistaNoEndereco } from "./_casca/useVistaNoEndereco";
import { useFiltrosGuardados } from "./_pedidos/useFiltrosGuardados";
import { useAvisosDoPedido } from "./_pedidos/painel/useAvisosDoPedido";
import { useSeparadoresDoPainel } from "./_pedidos/painel/useSeparadoresDoPainel";
import { CHAVE_DOS_VISTOS, lerVistos } from "@/lib/orcamento/pedidos/vistos-recentemente";
/* O que é dos pedidos e já não vive neste ficheiro (fase 7 de
   `docs/ESTRUTURA-DO-CODIGO.md`): as regras puras em `lib/orcamento/pedidos/`,
   e as peças de interface da lista e do painel em `_pedidos/`. */
import { contarPorEstado, etiquetasEmUso } from "@/lib/orcamento/pedidos/filtros-dos-pedidos";
import { mesmasNotas, type NotasAutomaticas } from "@/lib/orcamento/pedidos/notas-automaticas";
import { oQueSePerdeComOPedido, textoDoPreco } from "@/lib/orcamento/pedidos/textos-do-pedido";
import { useEdicaoDoPedido } from "./_pedidos/useEdicaoDoPedido";
import { useFiltrosDosPedidos } from "./_pedidos/useFiltrosDosPedidos";
import { VIEW_WRAP } from "./_casca/moldura-da-vista";
import { ACOES_DE_PEDIDOS } from "./_casca/titulos-das-vistas";
import { STATUS_OPTIONS } from "./_pedidos/pastilha-do-estado";
import { comPedidoAlterado, comPedidoSubstituido } from "@/lib/orcamento/pedidos/lista-de-pedidos";
import { pedidoDaResposta } from "@/lib/orcamento/pedidos/pedido-da-resposta";
import { useAccoesEmLote, type LoteEmCurso } from "./_pedidos/useAccoesEmLote";
import { useGravacaoDoPedido } from "./_pedidos/useGravacaoDoPedido";
import { useHistoricoDoPedido } from "./_pedidos/useHistoricoDoPedido";
import { useAberturaDoPedido } from "./_pedidos/useAberturaDoPedido";
import { useLeituraDoPedido } from "./_pedidos/useLeituraDoPedido";
import { usePaginaDaLista } from "./_pedidos/usePaginaDaLista";

/** A chave da saída do painel do pedido — há um painel só, e a chave é uma. */
const SAIDA_DO_PAINEL = "painel-do-pedido";

// Code-split views + detail-panel tools live in ./lazy — only the view the
// user opens ships its JS, keeping the back-office's initial load lean.

/**
 * O que se diz de uma gravação recusada, pelo código que voltou.
 *
 * A regra vive agora em `razaoDaRecusa` (`lib/porque-falhou.ts`), e este nome
 * fica como o atalho local. Havia DUAS cópias disto — esta e a da
 * `PerguntaDeDesfecho` — e tinham divergido: uma tratava o 413 e a outra o 404,
 * portanto o mesmo 404 dizia «este pedido já não existe» num sítio e nada no
 * outro, no mesmo ecrã.
 */
const porqueNaoGravou = razaoDaRecusa;

interface Props {
  /**
   * A lista vem em RESUMO do servidor (ver `resumirQuote`): traz tudo o que
   * esta lista, os filtros e as vistas de conjunto lêem, e NÃO traz as
   * colecções que só o pedido aberto mostra. Um resumo continua a ser um
   * `Quote` válido — os campos que faltam são todos opcionais —, por isso as
   * vistas que recebem a lista não mudam; o que muda é `openQuote`, que vai
   * buscar o pedido inteiro antes de o mostrar.
   */
  initialQuotes: QuoteSummary[];
  userName?: string;
  /**
   * A leitura dos pedidos falhou do lado do servidor?
   *
   * Vem do `page.tsx`, que até aqui engolia a falha e devolvia `[]` — e o back
   * office abria como se ela não tivesse pedido nenhum. Ver o comentário lá.
   */
  falhaDosPedidos?: LeituraFalhada | null;
  /**
   * A secção com que abrir, decidida NO SERVIDOR a partir do cookie.
   *
   * `undefined` = não havia cookie, e o primeiro desenho é a Visão Geral. Ver
   * `VIEW_COOKIE`: é isto que faz o salto de secção desaparecer, porque o
   * servidor já desenha a secção certa em vez de o cliente a corrigir à vista.
   */
  vistaInicial?: View;
  /**
   * Há armazenamento configurado neste ambiente?
   *
   * Decidido NO SERVIDOR, e serve uma coisa só: não deixar a varredura das
   * versões leves arrancar onde ela não pode fazer nada. Sem isto, a primeira
   * chamada dela levava 503 («Armazenamento indisponível») e o browser
   * escrevia «Failed to load resource» na consola — em TODAS as entradas no
   * back office de qualquer ambiente sem Supabase.
   *
   * Não é ruído inofensivo: um passeio de telemóvel que exige a consola limpa
   * chumbou por causa disto, nas três tentativas. E uma consola com um erro
   * fixo é uma consola onde o erro seguinte, o verdadeiro, passa despercebido.
   *
   * Perguntar ao servidor com um pedido era trocar um erro por outro — a rota
   * que responde a contagem também devolve 503 sem armazenamento. Quem sabe é
   * quem desenha a página, e por isso a resposta desce daí.
   */
  armazenamentoLigado?: boolean;
}

export default function AdminClient({
  initialQuotes,
  userName = "Catarina",
  falhaDosPedidos = null,
  vistaInicial,
  armazenamentoLigado = false,
}: Props) {
  // `QuoteSummary` é atribuível a `Quote` (só faltam campos opcionais), e o
  // estado tem mesmo de ser `Quote[]`: assim que um pedido é aberto ou gravado,
  // o elemento da lista passa a ser o pedido INTEIRO devolvido pelo servidor.
  const [quotes, setQuotes] = useState<Quote[]>(initialQuotes);
  /** A lista de AGORA, para quem corre mais tarde (o «Anular» de um lote). */
  const quotesRef = useRef(quotes);
  useEffect(() => {
    quotesRef.current = quotes;
  }, [quotes]);
  // Para as Tarefas: o nome de cada pedido, pelo id (ver `NomesDosPedidos`).
  const nomesDosPedidos = useMemo(
    () => new Map(quotes.map((q) => [q.id, q.name] as const)),
    [quotes],
  );
  const [selected, setSelected] = useState<Quote | null>(null);
  // O que os filhos recebem em vez do `setQuotes`/`setSelected` — ver
  // `_pedidos/accoes-dos-pedidos.ts`.
  // Estáveis (os dois `set*` do `useState` também o são): entram nas listas de
  // dependências sem mudar a identidade de quem as usa.
  const { substituirPedido, alterarPedido } = useMemo(
    () => accoesDosPedidos(setQuotes, setSelected),
    [setQuotes, setSelected],
  );
  // A lista leve de propostas, SÓ OUVIDA (sem pedido novo): a fase do pedido
  // aberto lê dela o total a pagar da proposta que conta, como o dossiê.
  const propostasLeves = usePropostasLevesSoOuvir();

  const [saving, setSaving] = useState(false);
  /**
   * O id do pedido cujo desfecho acabou de ser marcado NO PAINEL.
   *
   * É um id e não um booleano: trocar de pedido tem de voltar a mostrar a
   * pergunta, e um `true` esquecido deixava o recibo do casamento anterior em
   * cima do pedido seguinte.
   */
  const [marcadoNoPainel, setMarcadoNoPainel] = useState<string | null>(null);
  /* Os onze campos editáveis do painel e as perguntas que se lhes fazem (o
     número de convidados serve? o que falta gravar?) — ver o hook. */
  const edicao = useEdicaoDoPedido(selected);
  const {
    editPrice,
    setEditPrice,
    editNotes,
    setEditNotes,
    editStatus,
    setEditStatus,
    editAssigned,
    setEditAssigned,
    editLostReason,
    setEditLostReason,
    editDate,
    setEditDate,
    editGuests,
    setEditGuests,
    editLocation,
    setEditLocation,
    editNome,
    setEditNome,
    editEmail,
    setEditEmail,
    editTelefone,
    setEditTelefone,
    motivoVaiComADecisao,
    alteracoesPorConfirmar,
    escritoPorGravar,
    absorver,
  } = edicao;
  const { ganhoSemProposta, escolherEstado, devolvidoAqui, emailSugerido } = useAvisosDoPedido({
    selected,
    setEditStatus,
    editEmail,
    quotes,
  });
  const {
    detailTab,
    detailTabsVisitados,
    abrirDetailTab,
    abrirPrimeiroDetailTab,
    separadorPorDecidirRef,
  } = useSeparadoresDoPainel(selected, propostasLeves);

  // Scroll targets for the "Próxima ação" shortcut: the always-visible
  // management form and the tools (tabs) section.
  const gestaoRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  // ETag da última lista de pedidos vinda de `/api/orcamento`, para a
  // revalidação poder perguntar "mudou alguma coisa?" em vez de mandar vir tudo
  // outra vez. Começa vazio: a primeira lista veio no HTML, sem carimbo.
  const quotesEtag = useRef<string | null>(null);
  /** Quando foi a última revalidação, para não a repetir a cada piscar de olhos. */
  const ultimaRevalidacao = useRef(0);
  const [view, setView] = useState<View>(vistaInicial ?? "overview");
  /* A procura com que «Propostas» abre quando se chega lá de outra vista
     («Ver em Propostas», ⌘K) viaja no `pedidoDaPaleta`, servido uma vez —
     era um estado à parte e ficava presa ao voltar pelo menu (revisão · 7). */
  /**
   * O que a paleta pediu a uma vista (BO 4): abrir uma tarefa, uma marcação, um
   * tema, ou abrir a vista já filtrada. Um objecto novo por escolha — a vista
   * serve-o uma vez (`servirUmaVez`), e voltar a ela mais tarde não o repete.
   */
  const [pedidoDaPaleta, setPedidoDaPaleta] = useState<{
    vista: View;
    pedido: PedidoDaPaleta;
  } | null>(null);
  const pedidoPara = (v: View): PedidoDaPaleta | undefined =>
    pedidoDaPaleta?.vista === v ? pedidoDaPaleta.pedido : undefined;
  const irComPedido = useCallback((vista: View, pedido: PedidoDaPaleta) => {
    setPedidoDaPaleta({ vista, pedido: { ...pedido } });
    setView(vista);
  }, []);
  const [navOpen, setNavOpen] = useState(false);
  // A gaveta é modal: com ela aberta, o Tab passeava pelo fundo desfocado
  // (Ajuda → Tudo guardado → Pesquisar → Novo) e o foco ficava no botão que a
  // abriu. A armadilha da casa leva o foco para dentro, prende o Tab, tira o
  // fundo da árvore e devolve o foco a quem a abriu quando fecha.
  const gavetaRef = useFocusTrap<HTMLDivElement>(navOpen);
  /**
   * ════════════════════════════════════════════════════════════════════════
   * O MENU ENCOLHIDO NO COMPUTADOR — E SOZINHO AO FAZER PROPOSTA
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «quero que haja uma cruz para que dê no desktop para
   * carregar e o menu fica ocultado e a zona do back office estende de forma a
   * aumentar o espaço para fazer propostas (…) aliás eu quero que quando
   * carregamos em fazer proposta o menu oculte-se automaticamente».
   *
   * A barra lateral mede 256 px e está sempre lá. No estúdio isso importa mais
   * do que em qualquer outro ecrã: a coluna onde ela escreve vive dentro de
   * TRÊS outras (esta, o índice do estúdio a 192 e o painel «O que vai sair» a
   * 336), e é a primeira a pagar quando o ecrã não é enorme.
   *
   * `navOpen` é outra coisa e continua a ser: é a GAVETA do telemóvel. Isto é
   * o computador, onde a barra é uma coluna em fluxo. Dois estados porque são
   * dois comportamentos — juntá-los fazia fechar a gaveta no telemóvel
   * esconder a barra no computador da próxima vez que lá voltasse.
   */
  /** Já desceu o suficiente para o cabeçalho encolher? Ver `ui/adaptativo.ts`. */
  const desceu = useDesceu();

  /**
   * ══════════════════════════════════════════════════════════════════════
   * O CABEÇALHO MEDE-SE, PARA QUEM COLA POR BAIXO DELE SABER ONDE PARAR
   * ══════════════════════════════════════════════════════════════════════
   *
   * A barra do topo é `sticky top-0`. Qualquer `<h2 sticky top-0>` dentro de
   * uma vista pede o mesmo zero — e desaparece por baixo dela, levando com ele
   * a primeira linha da secção, que passa a estar tapada e a não se poder tocar.
   *
   * A altura NÃO é uma constante: o cabeçalho encolhe quando a página desce
   * (`desceu`), muda com o `pt-safe` de um telemóvel com entalhe, e cresce se o
   * título partir em duas linhas. Um número escrito à mão fica errado no dia em
   * que qualquer uma dessas coisas mudar, e não se queixa — está escrito por
   * extenso no `carregamento/[eventId]/Carregamento.tsx`, que é onde a casa
   * pagou esta lição.
   *
   * `ResizeObserver` e não um `useEffect` com `offsetHeight`: o encolher é uma
   * transição, e uma medição tirada no fotograma do render apanha a altura de
   * antes.
   */
  const cabecalhoRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = cabecalhoRef.current;
    if (!el) return;
    const publicar = () =>
      document.documentElement.style.setProperty("--bo-cabecalho", `${el.offsetHeight}px`);
    publicar();
    const ro = new ResizeObserver(publicar);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--bo-cabecalho");
    };
  }, []);
  /** Pedido escolhido na vista "Fazer proposta".
   *
   *  Vive aqui e não dentro da vista porque a vista desmonta ao mudar de
   *  ecrã: sem isto, ir ver o calendário a meio de escrever uma proposta
   *  devolvia-a à lista de clientes ao voltar. (O conteúdo da proposta em si
   *  não se perde — o estúdio grava rascunho —, mas ter de reescolher a
   *  pessoa a cada volta era atrito puro.) */
  const [propostaPara, setPropostaPara] = useState<string | null>(null);
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A MARCA DO DESTINO ACTIVO ANDA, EM VEZ DE PISCAR NOUTRO SÍTIO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «quero animações em tudo o que seja para ir de uma coisa à
   * outra, quando se carrega numa coisa e vai-se para outra coisa».
   *
   * Trocar de destino na barra lateral é o gesto que ela faz mais vezes por
   * dia, e era o menos visível: o fundo acendia num item e apagava-se noutro,
   * ao mesmo tempo. Nada dizia que se veio de um sítio e se foi para outro.
   *
   * Este é o mesmo gesto que o `Segmented` já faz há muito, e a razão está
   * escrita lá: «numa barra de filtros o segmento activo não muda de cor de
   * repente; há um indicador que ANDA». Aqui a barra é vertical, portanto o
   * indicador é um filete que desliza pela esquerda — e é o `translate` que
   * anda, composto na GPU, sem remedir nada à volta (o filete é `absolute`).
   *
   * ── A MEDIDA DEIXOU DE VIVER AQUI ─────────────────────────────────────────
   *
   * Estavam aqui trinta linhas — o `ResizeObserver`, o `offsetTop`, o
   * fotograma que não anda — e havia uma segunda cópia delas no índice do
   * estúdio. Quando a terceira apareceu (a barra «Esta página / Todas» do
   * `PainelDoEstudio`), extraiu-se `ui/useMarcaQueAnda.ts` a partir DESTAS —
   * mas este ficheiro estava então debaixo de outras mãos e a ordem foi não
   * lhe tocar, portanto ficou a cópia. É essa cópia que sai agora: o gancho é
   * literalmente esta lógica, mais o eixo `x` que uma barra vertical não usa,
   * e as razões todas (porque MEDE em vez de calcular, porque não anda no
   * primeiro desenho) estão escritas lá, uma vez só.
   *
   * ── A `chave` DIZ QUANDO É QUE HÁ QUE REMEDIR ────────────────────────────
   *
   * São as mesmas duas coisas que o efeito daqui pedia: o destino activo
   * (`view`) e a gaveta do telemóvel (`navOpen`), que ao abrir dá disposição a
   * uma coluna que até aí não tinha nenhuma. Vão numa cadeia de caracteres
   * porque a `chave` é UM valor e entra na lista de dependências de um efeito:
   * um objecto novo a cada desenho punha-o a correr sempre.
   *
   * (Houve aqui uma terceira dependência — o grupo «Mais» que abria e fechava —
   * e saiu com ele: a lista deixou de ter dobra nenhuma. Ver a nota da coluna,
   * lá em baixo, e o caso que o prende no `AdminClient.menu-sem-dobra.test.tsx`.)
   */
  const colunaDosDestinos = useRef<HTMLElement | null>(null);
  const { marca: marcaDoDestino, podeAndar: marcaPodeAndar } = useMarcaQueAnda(
    colunaDosDestinos,
    '[aria-current="page"]',
    `${view}:${navOpen}`,
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newQuoteOpen, setNewQuoteOpen] = useState(false);
  const [importarOpen, setImportarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [passkeysOpen, setPasskeysOpen] = useState(false);
  const [ajudaOpen, setAjudaOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const haSeleccao = selectedIds.size > 0;
  /**
   * O LOTE QUE ESTÁ A CORRER, E QUANTOS JÁ LÁ VÃO.
   *
   * Era um booleano (`bulkBusy`), e o único sinal que dava vivia dentro de um
   * `<option>` de um `<select>` FECHADO — ou seja, na prática ela carregava e
   * não via nada acontecer. Guardar a contagem é o que permite ao `EmCurso`
   * dizer a verdade: são N pedidos, e a barra sobe a cada um que responde.
   *
   * `bulkBusy` continua a existir logo abaixo, derivado, porque o que os botões
   * precisam de saber (está a correr? então não se carrega outra vez) não mudou.
   */
  const [lote, setLote] = useState<LoteEmCurso | null>(null);
  const bulkBusy = lote !== null;

  /** Mais um pedido respondeu. Ver a nota em `applyBulkStatus`. */
  function contarMaisUmNoLote() {
    setLote((l) => (l ? { ...l, feito: l.feito + 1 } : l));
  }
  const [recentQuotes, setRecentQuotes] = useState<RecentQuote[]>([]);
  // Below xl the detail panel is a modal slide-over (overlay + scrim); at xl+ it
  // is an inline sticky column. Only the overlay should behave as a dialog (focus
  // trap, aria-modal, scroll lock) — the inline panel must not trap focus.
  const [isDetailOverlay, setIsDetailOverlay] = useState(false);
  /**
   * O teclado do sistema está a ocupar o fundo do ecrã? Ver
   * `lib/orcamento/barra-de-destinos.ts` — a regra e o porquê vivem lá, num
   * módulo puro, para se poderem provar sem browser.
   */
  const [tecladoNoEcra, setTecladoNoEcra] = useState(false);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * E A GAVETA DO PEDIDO TAMBÉM DEIXA DE FECHAR A SECO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Ela abria com o véu a acender em 240 ms e desaparecia num fotograma — o
   * painel e o véu, os dois, no mesmo instante em que `selected` passava a
   * `null`. É a metade que faltava ao gesto, e a palavra para ela já existe:
   * a `.bo-saida` do `globals.css` (200 ms, a curva de quem sai, e o
   * `pointer-events` largado dentro da própria classe).
   *
   * ── O QUE SE SEGURA, E PORQUE É QUE NÃO É UM FANTASMA ─────────────────────
   *
   * O que se adia é o `setSelected(null)`, e não uma cópia do pedido posta de
   * lado para o desenho. Enquanto a saída corre, o painel continua a ser o
   * painel — com os dados verdadeiros, o trinco do scroll, a armadilha de foco
   * e a camada de história que ele já tinha. Um fantasma obrigava a duplicar
   * mil e seiscentas linhas de JSX para mostrar uma casca vazia, e a casca é
   * precisamente o que não se quer ver a desvanecer-se.
   *
   * ── E POR ISSO É PRECISO UM PORTEIRO NO FIM ──────────────────────────────
   *
   * Durante os 200 ms a LISTA continua viva (a saída larga os toques do painel,
   * não os da página). Ela pode fechar um pedido e abrir outro dentro desse
   * intervalo — e o relógio que fecha o primeiro não pode fechar o segundo. Daí
   * o `idASair`: quando o tempo acaba, só desmonta se ainda for o mesmo pedido.
   * E quando o pedido muda antes do fim, `podar` esquece a saída, senão a marca
   * ficava presa e o painel novo nascia já a desaparecer.
   *
   * O `useSaidaAdiada` é indexado por chave porque nasceu numa pilha de avisos;
   * aqui há um painel só, e a chave é constante.
   */
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * OS DOIS «MAIS CAMPOS» DO PAINEL
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O plano de decoração e o histórico de atividade: dois `<details>` NATIVOS
   * cujo corpo aparecia e desaparecia do fluxo sem gesto nenhum.
   *
   * A palavra é do `ui/gaveta.ts`, e não uma escrita aqui — o censo dela conta
   * dez gavetas no back office, sete tratadas lá e estas duas dadas como «fora
   * de alcance» por viverem neste ficheiro. Ficam dentro: uma palavra escrita
   * duas vezes é o passo antes de haver duas palavras.
   *
   * O que a peça resolve, e que uma classe pousada no corpo não resolve: uma
   * animação em CSS é do ELEMENTO, e este elemento nunca desmonta (é isso que o
   * `<details>` nativo faz de bom — abre sem JavaScript, e o «localizar na
   * página» encontra-o fechado). Deixada lá, a entrada corria uma vez e nunca
   * mais. A peça arma-a no gesto e desarma-a no fecho, e por isso só anima o
   * que ELA abriu, agora: uma gaveta aberta pelo ⌘F do browser não anima nada,
   * porque ali não houve gesto nenhum a que responder.
   *
   * Dois `useGaveta()` e não um: são duas gavetas, em dois separadores, e cada
   * uma tem o seu estado.
   */
  const gavetaDoPlano = useGaveta();
  const gavetaDoHistorico = useGaveta();

  const idASair = useRef<string | null>(null);
  const {
    aSair: saidasDoPainel,
    comecarSaida: comecarSaidaDoPainel,
    podar: podarSaidaDoPainel,
  } = useSaidaAdiada(() => {
    const id = idASair.current;
    idASair.current = null;
    setSelected((prev) => (prev && prev.id === id ? null : prev));
  });
  const painelASair = saidasDoPainel.includes(SAIDA_DO_PAINEL);
  const sairDoPainel = useCallback(
    (id: string | null) => {
      // ── E SÓ A GAVETA SAI; A COLUNA DO COMPUTADOR NÃO ────────────────────
      //
      // Abaixo de `xl` isto é uma gaveta FORA DE FLUXO por cima da página: sai
      // e não deixa espaço nenhum atrás de si — o caso que o `ui/saida.ts`
      // descreve como o dele («uma folha ou um diálogo não deixam espaço
      // nenhum»).
      //
      // A partir de `xl` é uma COLUNA DENTRO DA GRELHA, e a grelha reparte-se
      // pelo que lá está: com o painel aberto são duas faixas (o carril de
      // 360 px e o resto), sem ele é uma só. Segurar a coluna 200 ms a
      // desvanecer-se não animava essa mudança — a lista continuava estreita
      // durante a saída e SALTAVA para a largura toda no fim. Seria o mesmo
      // corte seco, 200 ms mais tarde e com uma animação por cima a dizer que
      // não era. E animar a largura da grelha está fora de questão: é layout a
      // cada fotograma, que é a regra que esta casa não quebra.
      //
      // Portanto: gaveta sai, coluna fecha. Não é uma excepção envergonhada,
      // é a diferença entre um elemento fora de fluxo e um elemento em fluxo.
      if (!isDetailOverlay || id === null) {
        setSelected(null);
        return;
      }
      idASair.current = id;
      comecarSaidaDoPainel(SAIDA_DO_PAINEL);
    },
    [comecarSaidaDoPainel, isDetailOverlay],
  );
  const idSeleccionado = selected?.id ?? null;
  useEffect(() => {
    // Abriu outro pedido a meio da saída: a saída deixou de ter sujeito.
    if (idASair.current !== null && idASair.current !== idSeleccionado) {
      idASair.current = null;
      podarSaidaDoPainel([]);
    }
  }, [idSeleccionado, podarSaidaDoPainel]);
  /**
   * Os pedidos que já foram buscados por inteiro nesta sessão. Sem esta marca
   * não havia como distinguir «este casamento não tem convidados registados»
   * de «a lista de convidados ainda não veio» — as duas coisas são um campo
   * ausente —, e reabrir o mesmo pedido pagava outra ida ao servidor.
   */
  const completos = useRef(new Set<string>());
  /* Os filtros da lista de pedidos — o estado, as contas e a lista filtrada
     e ordenada. As regras vivem em `lib/orcamento/pedidos/filtros-dos-pedidos.ts`. */
  const filtros = useFiltrosDosPedidos(quotes, userName);
  const { filterStatus, setFilterStatus, showArchived, setShowArchived, sort, setSort, filtered } =
    filtros;
  /** O pedido que está a ser aberto agora — ver `openQuote`. */
  const [aAbrir, setAAbrir] = useState<{ id: string; nome: string } | null>(null);
  /**
   * As perguntas destrutivas abertas.
   *
   * Estado e não `window.confirm`: a pergunta tem de caber uma LISTA lá dentro
   * — ver `PerguntaDestrutiva`, e a razão por que «tens a certeza?» não é uma
   * pergunta.
   */
  const [aApagar, setAApagar] = useState<Quote | null>(null);
  const [aApagarLote, setAApagarLote] = useState<string[] | null>(null);
  /** Arquivar mais de `ARQUIVAR_SEM_PERGUNTAR` pede confirmação (revisão · 3). */
  const [aArquivarLote, setAArquivarLote] = useState<string[] | null>(null);
  /* O último lote perguntado, para o título e os nomes durante os 200 ms em
     que a pergunta se fecha — sem ele lia-se «Arquivar 0 pedidos?» a sair
     (2.ª revisão · 5). Ajustado no desenho, como o React deixa. */
  const [loteDaPergunta, setLoteDaPergunta] = useState<string[]>([]);
  if (aArquivarLote && aArquivarLote !== loteDaPergunta) setLoteDaPergunta(aArquivarLote);
  const [aSair, setASair] = useState(false);

  /**
   * ── A ALTURA DA COLUNA DE DETALHE, MEDIDA E NÃO PRESUMIDA ─────────────────
   *
   * `xl:max-h-[calc(100vh-7rem)]` presumia que esta coluna começa colada ao
   * cabeçalho: 6rem do `xl:top-24` mais 1rem de folga no fundo. Não começa.
   * MEDIDO num 1440×900: a linha da grelha arranca a 341 px do topo — abaixo
   * do título e da barra de filtros —, a coluna ficava com 788 px de altura, e
   * 341 + 788 dá 1129 num ecrã de 900. A barra «Guardar alterações», que vive
   * colada ao fundo DESTA coluna, nascia 229 px abaixo da dobra:
   * `elementFromPoint` no centro do botão devolvia `null`.
   *
   * E rolar a gaveta até ao fim não a trazia — ela está colada ao fundo do
   * contentor que rola, não ao fundo do ecrã —, portanto quem rola até bater no
   * fim conclui, com toda a razão, que não há mais nada por baixo. Só rolar a
   * PÁGINA inteira (269 px, todo o curso que ela tem) a revelava.
   *
   * O `xl:sticky xl:top-24` também nunca chegou a colar nada: um `sticky` só
   * tem caminho para andar se a caixa que o contém for mais alta do que ele, e
   * aqui a altura da grelha É a desta coluna — zero caminho. Por isso isto não
   * se resolve só com CSS: a altura que sobra depende de ONDE a coluna começa,
   * e onde ela começa mede-se.
   *
   * ── E DEPOIS A BARRA DE DESTINOS PASSOU A FICAR, E FOI OUTRA VEZ ─────────
   *
   * A medição acima reservava 16 px no fundo (a folga de 1rem do `calc`). Era
   * o número certo enquanto o fundo do ecrã estivesse vazio nesta largura —
   * e deixou de estar: a barra de destinos ficou a FICAR com um pedido aberto
   * (`barraDeveSumir`), porque aqui o detalhe é uma coluna e não uma folha
   * modal. A coluna reservava 16 px, e o mesmo botão «Guardar alterações»
   * voltou a ficar inalcançável — agora por estar TAPADO em vez de estar
   * abaixo da dobra.
   *
   * MEDIDO num 1440×900: a faixa da barra vai de 816 a 900 (84 px — 72 da
   * cápsula mais 12 de folga), e o botão nascia de 821 a 853, dentro dela. O
   * token `--bo-barra-inferior` diz 86; a barra MEDE 84. São dois números
   * diferentes para a mesma coisa, e é por isso que se mede o elemento.
   *
   * O que se reserva agora é a altura MEDIDA da barra. A conta, a razão e o
   * controlo negativo estão em `lib/orcamento/barra-de-destinos.ts`.
   *
   * `null` até à primeira medição — e nessa altura vale a classe do Tailwind,
   * que reserva o mesmo pelo token. Nunca se aplica no telemóvel: lá a gaveta é
   * `fixed inset-y-0` e já está certa (medida: 775→844 num ecrã de 844).
   */
  const [alturaDoDetalhe, setAlturaDoDetalhe] = useState<number | null>(null);
  /**
   * A barra de destinos, para a coluna de detalhe lhe poder MEDIR a altura.
   *
   * É uma referência e não um `querySelector` pelo `aria-label` de propósito.
   * O nome acessível da barra é o que vinte passeios do Playwright usam para
   * dizer «já estou dentro do back office», e um `barra-inferior.test.tsx`
   * recorta o bloco da `<nav>` a partir da PRIMEIRA vez que esse nome aparece
   * no ficheiro para medir o que lá está dentro. Escrever o nome uma segunda
   * vez aqui em cima passava esse recorte a começar no sítio errado — e foi o
   * que ele apanhou. Uma referência não tem nome para colidir.
   */
  const barraDeDestinosRef = useRef<HTMLElement | null>(null);
  const { toast } = useToast();
  const anular = useAnular();
  // A cópia de segurança, de UMA maneira só: a barra lateral e a paleta
  // chamavam-na cada uma à sua (um `<a href>` e um `location.href`), e
  // nenhuma dizia nada enquanto o ficheiro vinha. Agora a barra conta os
  // bytes contra o `Content-Length` da rota (D1, #211).
  const copiaDeSeguranca = useDescarga();
  const descarregarCopia = useCallback(() => {
    if (copiaDeSeguranca.aCorrer) return;
    copiaDeSeguranca
      .correr("/api/backup", `liquen-backup-${new Date().toISOString().slice(0, 10)}.json`)
      .catch((e: unknown) =>
        toast(
          e instanceof Error && e.message
            ? e.message
            : "Não foi possível descarregar a cópia de segurança.",
          "error",
        ),
      );
  }, [copiaDeSeguranca, toast]);
  // Apagar um pedido deixa-o 30 dias na Reciclagem (R3b), com «Anular».
  const depoisDeApagar = useDepoisDeApagar();
  const depoisDeApagarVarios = useDepoisDeApagarVarios();
  const searchRef = useRef<HTMLInputElement>(null);
  /**
   * Focus trap for the mobile detail drawer — active only while it's the overlay.
   *
   * ── E DESARMA-SE NO GESTO, NÃO 200 ms DEPOIS ────────────────────────────
   *
   * O `&& !painelASair` não é cosmético. A armadilha só larga o foco quando
   * `active` passa a falso, e `active` dependia do `selected` — que só cai ao
   * FIM dos 200 ms da saída. MEDIDO logo a seguir ao gesto de fechar: o foco
   * ficava dentro de uma gaveta que já está a desaparecer, e o `previouslyFocused
   * ?.focus?.()` da limpeza só corria um quinto de segundo mais tarde. Quem
   * fecha com Escape ficava esse tempo sem sítio para o teclado.
   *
   * É a regra desta ronda dita ao caso mais sensível que ela tem: nenhuma
   * animação pode ATRASAR uma tarefa, e devolver o foco é a tarefa. O
   * `painelASair` levanta-se no instante do gesto (é ele que põe a classe de
   * saída), portanto a armadilha larga no mesmo fotograma em que a gaveta
   * começa a sair — a saída continua a ver-se, só que já não prende ninguém.
   *
   * É o que catorze dos dezasseis sítios equivalentes da casa já fazem; o
   * `ui/FolhaOuDialogo` é o modelo mais próximo. A varredura que nomeia esta
   * gaveta é o `a-saida-sai-da-arvore.test.ts`.
   */
  const drawerRef = useFocusTrap<HTMLDivElement>(!!selected && isDetailOverlay && !painelASair);
  // Focus management for the inline (desktop, non-overlay) detail workspace. The
  // mobile overlay already traps + restores focus via useFocusTrap; for the inline
  // panel we manually move focus to the panel heading on open and hand it back to
  // the element that opened it on close, so keyboard users are never stranded.
  const detailTitleRef = useRef<HTMLHeadingElement>(null);
  const detailOpenerRef = useRef<HTMLElement | null>(null);
  // Current locale, read from the path (/{lang}/orcamento/admin), to build the
  // deep link into a quote's full-screen Dossier route.
  const pathname = usePathname();
  /**
   * ── O LINK DO DOSSIER SAÍA DO BACK OFFICE PARA UM 404 ───────────────────
   *
   * Estava `pathname.split("/").filter(Boolean)[0]`, a chamar «língua» ao
   * primeiro segmento do caminho. Mas o site é português SEM prefixo: a página
   * canónica é `/orcamento/admin`, e nesse caminho o primeiro segmento é a
   * palavra **`orcamento`**. O link do Dossier ficava
   * `/orcamento/orcamento/admin/evento/{id}` — o 404 do site público, com o
   * menu comercial e um botão que leva à homepage comercial. Sem caminho de
   * volta ao back office a não ser escrever o URL à mão.
   *
   * E o destino verdadeiro é o Dossier do Evento: financeiro, pagamentos,
   * fornecedores, produção, cronograma do dia, convidados. Estava construído,
   * a funcionar, e inacessível pela interface.
   *
   * `localeDoCaminho` faz a pergunta certa (é o espelho inglês?) e
   * `localizeHref` é quem sabe compor o endereço nas duas línguas — as mesmas
   * funções que o resto do site já usa.
   */
  const locale = localeDoCaminho(pathname);

  // Does the detail panel have edits not yet saved? Used to warn before
  // switching/closing a quote so work is never silently lost.
  const isDirty = alteracoesPorConfirmar || escritoPorGravar;
  // Latest value mirrored into a ref for listeners bound earlier (e.g. Escape).
  // É o que ainda exige um clique: o que grava sozinho não se «descarta» — está
  // no servidor, ou a caminho dele.
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = alteracoesPorConfirmar;
  }, [alteracoesPorConfirmar]);

  // ── A gravação automática do que se escreve ───────────────────────────────
  //
  // É a MESMA cadeia do estúdio de propostas (ver `useGravacaoAutomatica`): o
  // adiamento, a descarga do que ficou pendente ao fechar ou ao trocar de
  // pedido, o travão de fechar o separador, as repetições, e o indicador que só
  // diz «guardado» depois de o servidor o confirmar. Não há aqui um segundo
  // mecanismo — há este, usado por mais um ecrã.

  /** O pedido aberto, para quem corre fora do desenho. */
  const selectedRef = useRef<Quote | null>(null);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  /**
   * O que o SERVIDOR tem dos campos que gravam sozinhos.
   *
   * É contra isto que se decide o que enviar. Enviar um campo que ninguém tocou
   * é escrever por cima do que outra pessoa acabou de lá pôr — e gravar sozinho
   * torna esse encontro mais frequente, não menos.
   */
  const escritoNoServidor = useRef<NotasAutomaticas | null>(null);
  /** O pedido cuja linha «Notas internas atualizadas» já foi escrita. O registo
   *  de atividade conta O QUE ACONTECEU, não quantas vezes o temporizador
   *  correu: uma linha por sessão de edição, não uma a cada 800 ms. */
  const registouNotas = useRef<string | null>(null);

  /**
   * A linha de base acompanha o pedido que está aberto — SEMPRE, e não só no
   * `openQuote`.
   *
   * O painel adopta um pedido por mais caminhos do que um: duplicar um cliente,
   * a paleta de comandos, uma acção da lista. Marcar a base num sítio só era
   * deixar esses caminhos com uma gravação automática que não sabe contra o quê
   * comparar — e uma gravação que não sabe o que está no servidor não deve
   * escrever lá nada.
   */
  useEffect(() => {
    if (!selected) {
      escritoNoServidor.current = null;
      return;
    }
    if (escritoNoServidor.current?.id === selected.id) return;
    escritoNoServidor.current = {
      id: selected.id,
      adminNotes: selected.adminNotes ?? "",
      lostReason: selected.lostReason ?? "",
    };
    registouNotas.current = null;
  }, [selected]);

  /**
   * Arruma o pedido que o servidor devolveu.
   *
   * Os campos que ela NÃO tocou passam a mostrar o que o servidor tem — é a
   * forma barata de o painel deixar de ser cego ao que outra pessoa gravou
   * enquanto ele esteve aberto. Os que ela tocou ficam como estão: substituí-los
   * era deitar fora trabalho por causa de uma gravação alheia.
   */
  const absorverDoServidor = useCallback(
    (updated: Quote) => {
      const antes = selectedRef.current;
      substituirPedido(updated);
      if (antes && antes.id === updated.id) absorver(antes, updated);
    },
    [substituirPedido, absorver],
  );

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O PEDIDO QUE VOLTOU DE UMA MARCAÇÃO DE DESFECHO
   * ════════════════════════════════════════════════════════════════════════
   *
   * Parece o {@link absorverDoServidor} e não é — e a diferença tem duas
   * razões, uma de conteúdo e outra de forma.
   *
   * ── Conteúdo: aqui a marcação GANHA ────────────────────────────────────
   * O `absorverDoServidor` é conservador de propósito: só acerta os campos que
   * ela NÃO tocou, para uma gravação alheia não lhe apagar trabalho. Uma
   * marcação de desfecho não é alheia — é ela, agora, a confirmar um estado e
   * um valor que acabou de ler no ecrã. Esses dois campos passam a ser o que
   * o servidor gravou, ponto.
   *
   * ── Forma: nada de `ref` ───────────────────────────────────────────────
   * O `absorverDoServidor` lê o `selectedRef` para saber como o pedido estava
   * antes. Passá-lo à fábrica das colunas — que é CHAMADA durante o desenho —
   * fazia a regra `react-hooks` acusar leitura de `ref` no desenho. A regra
   * tem razão na forma (ninguém garante que a fábrica não chama o que recebe),
   * e a saída certa não é calá-la: é este caminho, que lê o `selected` do
   * estado e não de um `ref`.
   *
   * Só mexe no formulário quando o pedido marcado é o que está ABERTO. Sem
   * essa guarda, marcar o casamento da Ana na tabela escrevia o estado dela
   * por cima do formulário do casamento do Rui, aberto ao lado.
   */
  const marcarDesfecho = useCallback(
    (actualizado: Quote) => {
      setQuotes((prev) => comPedidoSubstituido(prev, actualizado));
      if (selected?.id !== actualizado.id) return;
      setSelected(actualizado);
      setEditStatus(actualizado.status);
      setEditPrice(textoDoPreco(actualizado));
      setEditLostReason(actualizado.lostReason ?? "");
      /**
       * ── O QUE AQUI NÃO SE FAZ, E PORQUÊ ──────────────────────────────────
       * Não se mexe na linha de base da gravação automática
       * (`escritoNoServidor`). Seria uma escrita num `ref` dentro do que a
       * fábrica das colunas recebe, e é exactamente isso que faz a regra
       * `react-hooks` acusar leitura de `ref` no desenho — o preço de a
       * calar seria pior do que o defeito.
       *
       * O que se perde: quando o gesto grava um motivo de perda com o pedido
       * ABERTO, a base fica um passo atrás e a gravação automática reenvia o
       * MESMO motivo uma vez. É um PATCH repetido e idempotente, não uma
       * perda: o `isDirty` não se acende (o campo e o pedido dizem o mesmo) e
       * nada é apagado. Trocar isso pela regra desligada não valia a pena.
       */
    },
    [selected?.id, setEditLostReason, setEditPrice, setEditStatus],
  );

  /**
   * Mudar o estado na pastilha da lista — o mesmo gesto do quadro
   * (`Kanban.changeStatus`): muda logo no ecrã, grava com a linha no
   * histórico, e se o servidor recusar volta atrás e diz porquê. Gravado,
   * deixa dez segundos para «Anular» (`reporEstadoDoPedido`, que também
   * desfaz o que um «Ganho» criou).
   */
  const mudarEstadoNaLinha = useCallback(
    async (q: Quote, status: QuoteStatus) => {
      if (q.status === status) return;
      const de = STATUS_OPTIONS.find((o) => o.id === q.status)?.label ?? q.status;
      const para = STATUS_OPTIONS.find((o) => o.id === status)?.label ?? status;
      setQuotes((prev) => comPedidoAlterado(prev, q.id, { status }));
      const entrada: ActivityEntry = {
        id: randomId(),
        at: new Date().toISOString(),
        kind: "status_change",
        actor: userName,
        summary: `${de} → ${para}`,
      };
      const oQue = `mudar «${q.name}» para «${para}»`;
      const voltar = (mensagem: string) => {
        setQuotes((prev) => comPedidoAlterado(prev, q.id, { status: q.status }));
        toast(`${mensagem} O estado ficou «${de}».`, "error");
      };
      let res: Response;
      try {
        res = await fetch(`/api/orcamento/${q.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, activityLogAppend: [entrada] }),
        });
      } catch {
        voltar(porqueRebentou(oQue).mensagem);
        return;
      }
      const corpo = await res.json().catch(() => null);
      if (!res.ok) {
        voltar(porqueFalhou(oQue, res, corpo).mensagem);
        return;
      }
      const actualizado = pedidoDaResposta(corpo);
      if (actualizado) marcarDesfecho(actualizado);
      // O PATCH acabou: o estado novo pode ter arrastado a proposta.
      asPropostasMudaram();
      anular(`${q.name}: ${de} → ${para}`, async () => {
        const reposto = await reporEstadoDoPedido({
          quoteId: q.id,
          de: q.status,
          para: status,
          actor: userName,
        });
        if (reposto) marcarDesfecho(reposto);
      });
    },
    [userName, toast, anular, marcarDesfecho],
  );

  /**
   * Um 409 traz em `current` o que o servidor tem AGORA. A base das notas passa
   * a ser essa: sem isto, cada gravação seguinte levava a base velha e voltava
   * a dar 409 até recarregar a página. O texto que ela escreveu fica no campo
   * — o aviso do 409 já lhe disse que alguém mexeu entretanto.
   */
  const acertarBaseDoConflito = useCallback(async (id: string, res: Response) => {
    // Uma cópia: o corpo original ainda vai ser lido para a frase do aviso.
    let corpo: { current?: Partial<Quote> } | null = null;
    try {
      corpo = (await res.clone().json()) as { current?: Partial<Quote> } | null;
    } catch {
      return;
    }
    const actual = corpo?.current;
    if (!actual || actual.id !== id) return;
    escritoNoServidor.current = {
      id,
      adminNotes: actual.adminNotes ?? "",
      lostReason: actual.lostReason ?? "",
    };
  }, []);

  /**
   * Manda ao servidor SÓ o que foi tocado. Uma tentativa — a repetição é do
   * hook.
   */
  const enviarEscrito = useCallback(
    async (v: NotasAutomaticas): Promise<RespostaDoEnvio> => {
      const base = escritoNoServidor.current;
      if (!base || base.id !== v.id) {
        // Sem saber o que está no servidor não se escreve por cima dele às
        // cegas. Não se repete: a resposta seguinte seria a mesma.
        return {
          estado: "falhou",
          porque: "O pedido ainda não foi lido do servidor.",
          definitivo: true,
        };
      }
      const corpo: Record<string, unknown> = {};
      if (v.adminNotes !== base.adminNotes) {
        corpo.adminNotes = v.adminNotes;
        // O texto tal como foi lido do servidor: se a colega gravou outras
        // notas entretanto, o servidor recusa com 409 em vez de as apagar.
        corpo.base = { adminNotes: base.adminNotes };
      }
      if (v.lostReason !== null && v.lostReason !== base.lostReason) {
        corpo.lostReason = v.lostReason || null;
      }
      // Não há nada por enviar — o clique em «Guardar» chegou primeiro. Está
      // guardado, e dizê-lo é a verdade.
      if (Object.keys(corpo).length === 0) return { estado: "guardado" };

      const primeiraNota = corpo.adminNotes !== undefined && registouNotas.current !== v.id;
      if (primeiraNota) {
        corpo.activityLogAppend = [
          {
            id: randomId(),
            at: new Date().toISOString(),
            kind: "note_added",
            actor: userName,
            summary: "Notas internas atualizadas",
          },
        ];
      }

      const res = await fetchComTecto(`/api/orcamento/${encodeURIComponent(v.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!res.ok) {
        if (res.status === 409) await acertarBaseDoConflito(v.id, res);
        return respostaDeHttp(res.status, { porque: porqueNaoGravou(res.status) });
      }
      const updated = pedidoDaResposta(await res.json().catch(() => null));
      if (primeiraNota) registouNotas.current = v.id;
      // Um 200 é um 200: as notas GRAVARAM. Sem o pedido no corpo não há o
      // que absorver, e não se repete (ver `pedidoDaResposta`).
      if (!updated) return { estado: "guardado" };
      escritoNoServidor.current = {
        id: updated.id,
        adminNotes: updated.adminNotes ?? "",
        lostReason: updated.lostReason ?? "",
      };
      absorverDoServidor(updated);
      return { estado: "guardado" };
    },
    [userName, absorverDoServidor, acertarBaseDoConflito],
  );

  /**
   * ── A REDE DE SEGURANÇA DO PAINEL ─────────────────────────────────────────
   *
   * Só duas coisas gravam sozinhas aqui: as notas e o motivo de perda. O preço,
   * a data, os convidados, o local e os contactos só saem deste telemóvel
   * quando ela carrega em «Guardar» — e o travão que existia, um
   * `beforeunload`, é quase decorativo num iPhone: o Safari descarta
   * separadores em segundo plano e não o corre quando o faz.
   *
   * Ver `rascunho-do-pedido.ts` para o porquê de ser cópia LOCAL e não no
   * servidor, e de nunca repor sozinha.
   */
  const camposNoEcra = useMemo<CamposDoPedido>(
    () => ({
      preco: editPrice,
      notas: editNotes,
      // A outra ponta do mesmo campo (ver `camposDoPedido` mais abaixo): o
      // `editStatus` é semeado a partir de `q.status`, que pode não existir.
      estado: editStatus ?? "",
      responsavel: editAssigned,
      motivoDePerda: editLostReason,
      data: editDate,
      convidados: editGuests,
      local: editLocation,
      nome: editNome,
      email: editEmail,
      telefone: editTelefone,
    }),
    [
      editPrice,
      editNotes,
      editStatus,
      editAssigned,
      editLostReason,
      editDate,
      editGuests,
      editLocation,
      editNome,
      editEmail,
      editTelefone,
    ],
  );

  /** O mesmo pedido, como o servidor o tem — para se poder comparar. */
  const camposDoPedido = useCallback(
    (q: Quote): CamposDoPedido => ({
      preco: textoDoPreco(q),
      notas: q.adminNotes ?? "",
      /**
       * `?? ""` como os dez irmãos, e não por simetria: era o ÚNICO campo sem
       * defesa, e um pedido sem `status` fazia o `oQueMudou` chamar `.trim()`
       * sobre `undefined` — dentro de um efeito, portanto o que ela via era o
       * back office inteiro substituído por «Ocorreu um erro inesperado».
       *
       * E pedidos sem `status` existem: o `degrauDoEstado` da máquina de
       * estados di-lo por escrito — «há pedidos gravados antes de metade destes
       * campos existirem», e trata o caso em vez de recusar. Aqui não tratava.
       */
      estado: q.status ?? "",
      responsavel: q.assignedTo ?? "",
      motivoDePerda: q.lostReason ?? "",
      data: q.date ?? "",
      convidados: String(q.guests ?? ""),
      local: q.location ?? "",
      nome: q.name ?? "",
      email: q.email ?? "",
      telefone: q.phone ?? "",
    }),
    [],
  );

  /** O rascunho encontrado ao abrir, à espera de uma decisão dela. */
  const [rascunhoPorRepor, setRascunhoPorRepor] = useState<RascunhoEncontrado | null>(null);

  /**
   * Guarda o que está escrito, com um atraso curto.
   *
   * O atraso não é para poupar escritas — é para não guardar o meio de uma
   * palavra como se fosse uma decisão. E quando o que está no ecrã volta a ser
   * igual ao servidor (gravou, ou ela desfez), a cópia é deitada fora: uma rede
   * de segurança que sobrevive ao perigo passa a ser um aviso falso da próxima
   * vez que se abre o pedido.
   */
  useEffect(() => {
    const q = selected;
    if (!q) return;
    if (oQueMudou(camposNoEcra, camposDoPedido(q)).length === 0) {
      esquecerRascunho(q.id);
      return;
    }
    const t = setTimeout(() => guardarRascunho(q.id, camposNoEcra, new Date().toISOString()), 800);
    return () => clearTimeout(t);
  }, [selected, camposNoEcra, camposDoPedido]);

  /**
   * Repõe o que ficou por gravar — nos campos, e NÃO no servidor.
   *
   * A distinção é o ponto todo: repor escreve no ecrã e deixa-o por gravar, com
   * o botão «Guardar» a acender como acenderia se ela tivesse escrito aquilo
   * agora. Gravar por ela seria decidir por ela, e o rascunho pode ter dias.
   */
  function reporRascunho() {
    const r = rascunhoPorRepor;
    if (!r) return;
    setEditPrice(r.campos.preco);
    setEditNotes(r.campos.notas);
    // O estado é o único campo que não é texto livre. Um valor que já não
    // existe (um separador removido entretanto) fica de fora em silêncio, em
    // vez de pôr o pedido num estado que a aplicação não sabe desenhar.
    if (STATUS_OPTIONS.some((o) => o.id === r.campos.estado)) {
      setEditStatus(r.campos.estado as QuoteStatus);
    }
    setEditAssigned(r.campos.responsavel);
    setEditLostReason(r.campos.motivoDePerda);
    setEditDate(r.campos.data);
    setEditGuests(r.campos.convidados);
    setEditLocation(r.campos.local);
    setEditNome(r.campos.nome);
    setEditEmail(r.campos.email);
    setEditTelefone(r.campos.telefone);
    setRascunhoPorRepor(null);
    toast("Reposto no ecrã. Ainda não está guardado — confirma e carrega em Guardar.", "success");
  }

  function descartarRascunho() {
    if (selected) esquecerRascunho(selected.id);
    setRascunhoPorRepor(null);
  }

  const escritoNoEcra = useMemo<NotasAutomaticas>(
    () => ({
      id: selected?.id ?? "",
      adminNotes: editNotes,
      lostReason: motivoVaiComADecisao ? null : editLostReason,
    }),
    [selected?.id, editNotes, editLostReason, motivoVaiComADecisao],
  );

  const gravacao = useGravacaoAutomatica<NotasAutomaticas>({
    valor: escritoNoEcra,
    enviar: enviarEscrito,
    // Fechado, não há nada para gravar; e a `chave` faz com que fechar ou trocar
    // de pedido descarregue primeiro o que ficou por gravar do anterior.
    activo: !!selected,
    chave: selected?.id ?? null,
    saoIguais: mesmasNotas,
    // Este painel inscreve-se no registo À MÃO, mesmo por baixo. Não é
    // esquecimento: pelo hook entrava só o texto que grava sozinho, e este
    // painel tem também as decisões que continuam a exigir um clique. Duas
    // linhas sobre o mesmo pedido no botão «Guardar tudo» seria ela ter de
    // perceber por que é que o pedido dela aparece duas vezes.
    nome: null,
  });

  /**
   * ── O PAINEL DO PEDIDO NO BOTÃO «GUARDAR TUDO» ────────────────────────────
   *
   * Uma linha só, com o nome por que ela chama ao pedido, e que conta as duas
   * metades do painel: o que se escreve (grava sozinho) e o que é uma decisão
   * (espera por um clique). A segunda metade é a que mais falta fazia aqui — é
   * trabalho feito, à espera de um gesto, e sem isto o gesto único do back
   * office passava-lhe ao lado.
   */
  const nomeNoRegisto = selected ? `Pedido ${selected.id} — ${selected.name}` : "";
  const oRegistoFalaPeloPedido = useInscricaoNoRegisto({
    nome: nomeNoRegisto,
    porGravar: escritoPorGravar || alteracoesPorConfirmar || !!gravacao.naoChegouAoServidor,
    // Calado: quem dá a notícia é a resposta do «Guardar tudo», que fala de
    // todos os ecrãs de uma vez e nomeia cada um.
    gravarJa: () => guardarTudoDoPedido(true),
    activo: !!selected,
  });

  // O travão de fechar o separador vale TAMBÉM para o que ainda exige um
  // clique. (O que grava sozinho já tem o seu, dentro do hook.) Era isto que
  // não existia de todo: escrevia-se, tocava o telefone, fechava-se o
  // separador, e o navegador não perguntava nada.
  //
  // Havendo registo, quem trava é ele — um só travão para o back office
  // inteiro, e que sabe nomear o que se perde. Sem registo, este continua a
  // valer: um travão que desaparecesse em silêncio seria a pior troca possível.
  useTravaoDeSaida(!oRegistoFalaPeloPedido && alteracoesPorConfirmar);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Full-screen tool surface: hide public nav, grain & chrome.
  useEffect(() => {
    document.body.classList.add("admin-mode");
    return () => document.body.classList.remove("admin-mode");
  }, []);

  // As janelas a pedido chegam antes de ela as pedir (ver `janela-a-pedido.tsx`).
  useEffect(() => aquecerJanelas(), []);

  // Warm the caches of the high-traffic API views during idle after first
  // paint, so the first click on Propostas / Tarefas / Calendário is
  // instant instead of a cold round-trip. Uses the same shared cache the views
  // read from (useCachedList), so a warmed view renders immediately with no
  // skeleton. Cheap + non-blocking; skipped if already cached/in-flight.
  useEffect(() => {
    return onIdle(() => {
      // A lista de propostas vai em modo LEVE (`?semDoc=1`): aquecer a cache
      // não pode custar o documento inteiro de cada proposta — com um ano de
      // trabalho lá dentro são megabytes descarregados a seguir à primeira
      // pintura, para uma vista em que muitas vezes ninguém chega a tocar.
      //
      // Chave PRÓPRIA, e é de propósito: os painéis de Propostas,
      // Acompanhamento e Análise ainda pedem a forma pesada em "propostas", e
      // servir-lhes o que não têm (o `doc`) a partir da cache mostrava-lhes
      // números errados durante uma pintura. Quando passarem a `?semDoc=1`,
      // passam também a esta chave e voltam a aproveitar o aquecimento.
      prefetchList("propostas-leves", "/api/propostas?semDoc=1");
      prefetchList("tarefas", "/api/tarefas");
      prefetchList("calendario", "/api/calendario");
    });
  }, []);

  useVistaNoEndereco(view, setView, vistaInicial);

  useEffect(() => {
    try {
      const vistos = lerVistos(localStorage.getItem(CHAVE_DOS_VISTOS));
      if (vistos.length) setRecentQuotes(vistos);
    } catch {
      /* ignore */
    }
  }, []);

  /**
   * ── O MENU RECOLHIDO SAIU DAQUI, E O PEDIDO DELE FICOU CUMPRIDO ─────────
   *
   * Havia um estado (`menuRecolhido`), duas gravações por aparelho, um efeito
   * que o ligava ao entrar em «Fazer proposta» e duas cruzes para o ligar e
   * desligar à mão. Existia por palavras dela: «quando carregamos em fazer
   * proposta o menu oculte-se automaticamente», porque a coluna de 256 px
   * comia o ecrã do estúdio — que já vive dentro de outras três.
   *
   * Deixou de fazer falta, e não por se ter desistido: a coluna ACABOU. «A
   * barra substitui o menu» — os destinos passaram todos para a cápsula que
   * flutua em baixo, e o estúdio tem agora a largura toda em TODAS as vistas,
   * sempre, sem estado nenhum para guardar nem cruz nenhuma para carregar.
   *
   * Um estado que ninguém pode mudar é um estado que mente a quem o lê a
   * seguir; por isso saiu inteiro, com a chave de `localStorage` e o teste que
   * o guardava (`AdminClient.menu-recolhido.test.tsx`). O que ele prometia
   * está guardado noutro sítio — `a-barra-e-o-menu.test.tsx`.
   */

  useFiltrosGuardados({ filterStatus, setFilterStatus, sort, setSort });

  // O «+ Nova tarefa» da barra, servido pelas Tarefas (ver `useNovaTarefa`).
  const { pedirNovaTarefa, novaTarefa } = useNovaTarefa(view);
  const { filtradosRef, painelPorCimaRef } = useAtalhosDoTeclado({
    view,
    setView,
    janelas: { paletteOpen, newQuoteOpen, shortcutsOpen, ajudaOpen, restoreOpen },
    setPaletteOpen,
    setNewQuoteOpen,
    setShortcutsOpen,
    searchRef,
    pedirNovaTarefa,
    setSelectedIds,
    navOpen,
    setNavOpen,
    selected,
    sairDoPainel,
    dirtyRef,
    haSeleccao,
    aApagarLote,
    aArquivarLote,
    bulkBusy,
    drawerRef,
  });

  // Lock background scroll while the mobile nav drawer is open. O trinco é o
  // mesmo dos diálogos (`useTrincoDeScroll`), agora num sítio só: era daqui que
  // o padrão vinha, e faltava em dez caixas que também tapam a página.
  useTrincoDeScroll(navOpen);

  /* ── O GESTO DE VOLTAR FECHA O QUE ESTÁ ABERTO ─────────────────────────────
     Do registo do audit, e são dois dos oito bloqueios de uma vez.

     O primeiro: «zero `pushState` em todo o `src/` … no iPhone, deslizar da
     esquerda É o botão de voltar, portanto isto acontece por acidente, a
     qualquer profundidade».

     O segundo: «com um pedido aberto sobra UM alvo de saída no ecrã todo» — o
     «×» do canto superior direito, que é o ponto do ecrã mais longe do polegar.
     A partir daqui o gesto é uma segunda saída, e é a que a mão já faz.

     E o `closeDetail` é o caminho, e não o `setSelected(null)`: é ele que
     pergunta «tem alterações por guardar?». Era esse guarda que o audit dizia
     que nunca chegava a correr. */
  useCamadaDeHistoria(navOpen, () => setNavOpen(false));
  useCamadaDeHistoria(!!selected, () => closeDetail());

  // Track whether the detail panel is currently a modal overlay (below xl) so the
  // dialog/focus-trap behaviour is gated to that state. matchMedia may be absent
  // (SSR / jsdom) — guard so this stays a no-op there, defaulting to inline.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 1279px)");
    const update = () => setIsDetailOverlay(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  /**
   * ── E A OUTRA METADE: O TECLADO DO TELEMÓVEL ────────────────────────────
   *
   * Mede-se a diferença entre a janela de LAYOUT e a VISUAL. Os dois motores
   * mexem na segunda quando o teclado sobe, incluindo o iOS, que não mexe na
   * primeira. A conta e o limiar estão em `lib/orcamento/barra-de-destinos.ts`.
   *
   * Sem `visualViewport` — jsdom, e browsers antigos — isto fica um no-op e a
   * barra comporta-se como antes. É o lado seguro: o defeito que estamos a
   * fechar é ela FALTAR.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const ver = () => setTecladoNoEcra(tecladoAberto(window.innerHeight, vv.height));
    ver();
    vv.addEventListener("resize", ver);
    return () => vv.removeEventListener("resize", ver);
  }, []);

  /**
   * Mede quanto ECRÃ sobra a partir de onde a coluna de detalhe começa, e é
   * essa a altura dela. Ver a nota do `alturaDoDetalhe`, lá em cima.
   *
   * Mede-se o topo da LINHA da grelha e não o do painel: o painel é `sticky`, e
   * um painel colado ao cabeçalho mentiria sobre onde começa. A linha é
   * estática, portanto `rect.top + scrollY` é sempre o sítio dela no documento
   * — o pior caso, com a página por rolar, que é como ela abre um pedido.
   *
   * Volta a medir quando a janela muda de tamanho e quando alguma caixa acima
   * cresce (a barra de filtros a passar para duas linhas, por exemplo). O
   * `ResizeObserver` também dispara com a mudança que nós próprios fazemos —
   * mas aí o topo é o mesmo, o valor é o mesmo, e o React não volta a desenhar.
   */
  useEffect(() => {
    if (!selected || isDetailOverlay) return;
    if (typeof window === "undefined") return;
    const linha = drawerRef.current?.parentElement;
    if (!linha) return;

    const medir = () => {
      const topo = linha.getBoundingClientRect().top + window.scrollY;
      /**
       * ── E O QUE SE RESERVA NO FUNDO É A BARRA, NÃO UMA FOLGA ───────────
       *
       * Aqui estava um 16 — a folga de 1rem do `calc(100vh-7rem)`, que era
       * tudo o que precisava de estar no fundo enquanto a barra de destinos
       * não existia nesta largura. Passou a existir e a FICAR (é a regra do
       * `barraDeveSumir`), e ocupa 86 px: a coluna acabava 70 px por baixo
       * dela, com o «Guardar alterações» — que vive no pé desta coluna —
       * inteiro debaixo do vidro. A conta e a medição estão em
       * `lib/orcamento/barra-de-destinos.ts`.
       *
       * MEDE-SE A BARRA em vez de se copiar o token. Não é desconfiança do
       * token: é que o que tem de ser evitado é o ESTORVO, e o estorvo é o
       * elemento — com o recuo dele, com o entalhe do ecrã somado e com a
       * altura que ele tiver no dia em que alguém lhe mexer. Dois «56px» em
       * ficheiros diferentes já discordaram uma vez nesta casa (ver o recuo
       * do corpo da vista, mais abaixo); um número medido não pode discordar
       * de si próprio. O token fica como recurso para quando a barra ainda
       * não está desenhada.
       */
      const barra = barraDeDestinosRef.current;
      /**
       * O recurso lê-se do `body` e não do `documentElement`: os tokens do
       * back office vivem todos num `body:is(.admin-mode, …)` — é a separação
       * do CSS que a Parte −1 do `docs/DESIGN-SYSTEM.md` manda —, e no
       * `documentElement` este nome não existe. MEDIDO: ali devolve string
       * vazia, o `parseFloat` dá `NaN`, e um `NaN` aqui reservava ZERO, que é
       * exactamente o defeito que isto fecha. Um recurso que não funciona é
       * pior do que não ter recurso, porque não se nota.
       */
      const alturaDaBarra = barra
        ? barra.getBoundingClientRect().height
        : parseFloat(getComputedStyle(document.body).getPropertyValue("--bo-barra-inferior"));
      setAlturaDoDetalhe(alturaQueSobraParaODetalhe(window.innerHeight, topo, alturaDaBarra));
    };

    medir();
    window.addEventListener("resize", medir);
    const observador = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    observador?.observe(linha);
    // E a caixa da vista inteira, que é quem muda de altura quando cresce algo
    // ACIMA da grelha — a grelha sozinha não dá por isso.
    if (linha.parentElement) observador?.observe(linha.parentElement);
    return () => {
      window.removeEventListener("resize", medir);
      observador?.disconnect();
    };
  }, [selected, isDetailOverlay, drawerRef]);

  /**
   * ── AS VERSÕES LEVES DAS FOTOGRAFIAS FAZEM-SE ENQUANTO ELA TRABALHA ──────
   *
   * Uma linha aqui porque é aqui que o back office abre, e a lista de
   * fotografias por converter só se limpa se alguém a limpar. O porquê inteiro
   * — os 1099 KB de um original contra os 20 KB de uma miniatura, e as duas
   * únicas portas que isto tinha antes (um botão e as sobras de um cron
   * diário) — está em `varrer-derivadas.ts`.
   *
   * Não pede rede a ela: o trabalho pesado é do servidor, e o que sai daqui é
   * um POST pequeno de cada vez.
   */
  useEffect(() => {
    if (!armazenamentoLigado) return;
    return varrerDerivadasEmFundo();
  }, [armazenamentoLigado]);

  /**
   * E os PDF das propostas que ela JÁ enviou aquecem pelo mesmo caminho.
   *
   * Palavras dela: «quero que a rapidez não seja só nas futuras, mas também
   * nas que já enviei». O aquecimento nocturno faz seis por noite e com
   * oitenta na fila são duas semanas; isto faz oito por lote enquanto o
   * separador estiver aberto, e põe as mesmas oitenta em uns quinze minutos.
   *
   * Um efeito à parte e não uma linha dentro do de cima, de propósito: são
   * dois trabalhos com ritmos diferentes, e este arranca 45 s depois para
   * deixar as derivadas — que são as que ela VÊ — passarem à frente. O porquê
   * inteiro está em `varrer-aquecimento.ts`.
   */
  useEffect(() => {
    if (!armazenamentoLigado) return;
    return varrerAquecimentoEmFundo();
  }, [armazenamentoLigado]);

  // Lock background scroll while the detail drawer is open as a mobile overlay
  // (mirrors the nav-drawer lock above). The inline xl panel never locks.
  useTrincoDeScroll(!!selected && isDetailOverlay);

  // Inline (desktop) detail: move focus into the workspace heading when a pedido
  // opens and restore it to the opener when it closes. Skipped while the panel is
  // the mobile overlay, where useFocusTrap owns focus instead.
  useEffect(() => {
    if (!selected || isDetailOverlay) return;
    const opener = detailOpenerRef.current;
    // Defer to after paint so the heading exists and layout has settled.
    const id = requestAnimationFrame(() => detailTitleRef.current?.focus());
    return () => {
      cancelAnimationFrame(id);
      opener?.focus?.();
    };
  }, [selected, isDetailOverlay]);

  /**
   * ── A PROCURA EM TUDO, LIDA DA MEMÓRIA NO INSTANTE EM QUE A PALETA ABRE ──
   *
   * BO 4. Cada grupo vem de uma lista que o back office JÁ tem — as que o
   * aquecimento em ociosidade traz (propostas leves, tarefas, calendário), a
   * dos temas, e as dos contratos, fornecedores e material quando alguém já as
   * abriu. `lerDaCache` só lê o `Map`: a paleta não faz pedido nenhum ao
   * servidor nem leitura nenhuma ao Supabase. O que não está na memória não
   * aparece — e não se vai buscar só para isto (ver `procura-em-tudo.ts`).
   *
   * Lido ao ABRIR (e não a cada render): a cache não avisa este ecrã quando
   * muda, e uma paleta aberta é um instante. Reabrir lê outra vez.
   */
  const gruposDaProcura: GrupoDaProcura[] = useMemo(() => {
    if (!paletteOpen) return [];
    return montarGruposDaProcura(
      {
        propostas: lerDaCache<PropostaDaProcura[]>("propostas-leves"),
        tarefas: lerDaCache("tarefas"),
        calendario: lerDaCache("calendario"),
        temas: temasEmCache(),
        contratos: lerDaCache("contratos"),
        fornecedores: lerDaCache("fornecedores"),
        material: lerDaCache("material"),
      },
      {
        // As Propostas não têm detalhe próprio: abrem filtradas pelo nome do
        // casal, pela mesma porta do «Ver em Propostas» do Fazer proposta.
        // O pedido leva a procura e é servido UMA vez: voltar às Propostas pelo
        // menu já não a traz presa (revisão · 7).
        proposta: (p) => irComPedido("propostas", { procura: p.clientName ?? "" }),
        tarefa: (t) => irComPedido("tarefas", { id: t.id }),
        marcacao: (e) => irComPedido("calendario", { id: e.id }),
        tema: (t) => irComPedido("temas", { id: t.id }),
        contrato: (c) => irComPedido("contratos", { procura: c.clientName ?? "" }),
        fornecedor: (f) => irComPedido("fornecedores", { procura: f.name }),
        material: (m) => irComPedido("material", { procura: m.name }),
      },
    );
  }, [paletteOpen, irComPedido]);

  const paletteCommands: Command[] = useMemo(
    () => [
      {
        id: "action-new-quote",
        label: "Novo pedido (registo manual)",
        group: "Ações",
        run: () => setNewQuoteOpen(true),
      },
      {
        id: "action-export",
        label: "Exportar pedidos (CSV)",
        group: "Ações",
        run: () => {
          downloadCsv(`pedidos-${dateStamp()}`, quotesToCsvRows(quotes));
          toast(
            `${quotes.length} pedido${quotes.length !== 1 ? "s" : ""} exportado${quotes.length !== 1 ? "s" : ""}`,
            "success",
          );
        },
      },
      {
        id: "action-backup",
        label: "Descarregar backup",
        group: "Ações",
        run: descarregarCopia,
      },
      {
        // A outra metade do backup. Sai na paleta ao lado dele de propósito:
        // quem procura "backup" num dia mau está a procurar isto.
        id: "action-restore",
        label: "Repor cópia de segurança (backup)",
        group: "Ações",
        run: () => setRestoreOpen(true),
      },
      /* ── OS QUATRO COMANDOS DE BO 4 ──────────────────────────────────────
         Cada um faz o que o botão da sua vista faz, pela mesma porta: a
         tarefa abre a linha de escrever das Tarefas, o evento abre o «Novo no
         calendário», a proposta leva ao Fazer proposta, e os atalhos abrem a
         folha que o «?» abre. */
      {
        id: "action-new-task",
        label: "Nova tarefa",
        group: "Ações",
        run: () => irComPedido("tarefas", { novo: true }),
      },
      {
        id: "action-new-event",
        label: "Novo evento",
        group: "Ações",
        run: () => irComPedido("calendario", { novo: true }),
      },
      {
        id: "action-fazer-proposta",
        label: "Fazer proposta",
        group: "Ações",
        run: () => setView("fazer-proposta"),
      },
      {
        id: "action-shortcuts",
        label: "Atalhos de teclado",
        group: "Ações",
        run: () => setShortcutsOpen(true),
      },
      // O «Fazer proposta» já está nas Ações, por cima: no Navegar seria a
      // mesma linha duas vezes.
      ...NAV.filter((item) => item.id !== "fazer-proposta").map((item) => ({
        id: `nav-${item.id}`,
        label: item.label,
        group: "Navegar",
        run: () => setView(item.id),
      })),
    ],
    [quotes, toast, descarregarCopia, irComPedido],
  );

  const { closeDetail, discardGuard, comPedidoInteiro, lembrarRecente, recarregarPedido } =
    useLeituraDoPedido({
      setQuotes,
      quotes,
      selected,
      setRecentQuotes,
      sairDoPainel,
      completos,
      absorverDoServidor,
      edicao,
    });

  const { abrirCliente, openQuote, abrirDaLista, duplicateQuote } = useAberturaDoPedido({
    setQuotes,
    setSelected,
    propostasLeves,
    abrirPrimeiroDetailTab,
    separadorPorDecidirRef,
    setView,
    setPropostaPara,
    setAAbrir,
    toast,
    detailOpenerRef,
    locale,
    camposDoPedido,
    setRascunhoPorRepor,
    discardGuard,
    comPedidoInteiro,
    lembrarRecente,
    edicao,
  });

  /**
   * Vai buscar a lista de pedidos ao servidor, em silêncio.
   *
   * Isto era um botão "Atualizar" no cimo da página. Um botão desses é uma
   * pergunta que o programa faz a quem o usa — "achas que isto está velho?" —
   * quando é o programa que sabe a resposta. Passou a correr sozinho: ao voltar
   * ao separador, ao devolver o foco à janela, e de dois em dois minutos com a
   * página à vista. Um pedido novo entrado pelo site aparece sem ninguém pedir.
   *
   * Custa quase nada porque vai com `If-None-Match`: quando nada mudou o
   * servidor responde **304 sem corpo** e ficamos com o array que já tínhamos —
   * a MESMA referência, por isso o React nem sequer volta a desenhar as linhas.
   *
   * `forcar` salta o intervalo mínimo. É o que as mutações usam: depois de
   * gravar quero a lista do servidor, não a que tinha há trinta segundos.
   */
  const revalidarPedidos = useCallback(
    async (forcar = false) => {
      const agora = Date.now();
      if (!forcar && agora - ultimaRevalidacao.current < 15_000) return;
      ultimaRevalidacao.current = agora;
      try {
        // Em RESUMO, como no primeiro carregamento: isto corre de dois em dois
        // minutos e sem o resumo a lista inteira voltava a descarregar-se aí,
        // deitando fora a poupança da página logo à primeira revalidação.
        const res = await fetch("/api/orcamento?resumo=1", {
          cache: "no-store",
          headers: {
            "x-admin-refresh": "1",
            ...(quotesEtag.current ? { "If-None-Match": quotesEtag.current } : {}),
          },
        });
        if (res.status === 304) return;
        const data = await res.json();
        if (Array.isArray(data)) {
          quotesEtag.current = res.headers.get("etag");
          setQuotes(data);
          // A lista voltou a ser de RESUMOS: o que estava completo já não está.
          // Não limpar isto era o pior dos casos — reabrir um pedido dado como
          // completo montava o painel de convidados sobre uma lista vazia, e a
          // primeira edição gravava-a por cima da verdadeira.
          completos.current.clear();
        }
      } catch {
        // Sem rede não há nada a dizer: a lista que está no ecrã continua a ser
        // a última verdade conhecida, e um erro por cada tentativa falhada
        // seria ruído de fundo em vez de informação.
      }
    },
    [setQuotes],
  );

  /**
   * A lista mantém-se fresca sozinha — é isto que dispensa o botão "Atualizar".
   *
   * Três gatilhos, todos com uma razão concreta:
   *   • voltar ao separador (`visibilitychange`) — o caso comum, estar noutro
   *     lado e regressar depois de o telefone ter tocado;
   *   • devolver o foco à janela (`focus`) — o mesmo, sem trocar de separador;
   *   • cinco em cinco minutos com a página à vista, para o pedido que entra pelo
   *     site enquanto a Catarina está a olhar para a lista.
   *
   * O relógio pára quando a página está escondida: revalidar um separador que
   * ninguém vê é gastar bateria para nada. O `revalidarPedidos` tem um intervalo
   * mínimo próprio, por isso alt-tab a repetir não dispara pedidos a repetir.
   */
  useEffect(() => {
    if (typeof document === "undefined") return;
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void revalidarPedidos();
    };
    /**
     * ── NINGUÉM A MEXER, NINGUÉM A PERGUNTAR (4/11) ──────────────────────
     *
     * «Visível» não quer dizer «alguém a olhar»: uma janela esquecida aberta
     * atrás de outra continua visível, e os registos de 4/11 mostram o back
     * office a perguntar de cinco em cinco minutos durante horas. Ela pediu
     * para cortar o processador da Vercel «mantendo tudo como está».
     *
     * O relógio só pergunta se houve um gesto (rato, tecla, toque, rodinha) nos
     * últimos `PARADO_MS`. Quem está a ler a lista sem mexer continua coberto
     * durante esse tempo. E o primeiro gesto depois de uma paragem pergunta
     * logo — o pedido que entrou entretanto aparece antes de ela dar por isso.
     */
    const PARADO_MS = 15 * 60_000;
    let ultimoGesto = Date.now();
    const aoGesto = () => {
      const estavaParado = Date.now() - ultimoGesto > 300_000;
      ultimoGesto = Date.now();
      if (estavaParado && document.visibilityState === "visible") void revalidarPedidos();
    };
    // Cinco minutos e não dois (3/11): cada volta lê os pedidos todos no
    // servidor, e a conta da Vercel passou o limite de processador. Voltar ao
    // separador (foco, visibilidade) continua a revalidar logo.
    const relogio = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultimoGesto > PARADO_MS) return;
      void revalidarPedidos();
    }, 300_000);
    const gestos = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const g of gestos) window.addEventListener(g, aoGesto, { passive: true });
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      clearInterval(relogio);
      for (const g of gestos) window.removeEventListener(g, aoGesto);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [revalidarPedidos]);

  /**
   * ── SAIR NÃO PERGUNTAVA NADA ──────────────────────────────────────────
   *
   * Nem sequer com trabalho por gravar. Fechar o painel de um pedido pergunta
   * (ver `discardGuard`); sair do back office inteiro — que fecha o painel e
   * mais tudo o resto — não perguntava. Era o buraco maior dos dois, e o mais
   * fácil de encontrar por acidente: o «Sair» está na barra, ao lado de tudo.
   */
  function pedirParaSair() {
    if (isDirty) {
      setASair(true);
      return;
    }
    void sairMesmo();
  }

  async function sairMesmo() {
    setASair(false);
    await fetch("/api/admin/logout", { method: "POST" });
    // O que o service worker guardou do back office sai do aparelho com a
    // sessão (n.º 6 de 16/11). Nunca atira e nunca prende mais de 1,5 s.
    await limparCachesAoSair();
    // Sair é uma decisão, e tem de aguentar a chegada ao ecrã de entrada: sem
    // esta marca, a entrada automática pela passkey voltava a abrir a sessão
    // sozinha (ver `consumirMarcaDeSaida`).
    marcarSaidaDeProposito();
    window.location.href = "/orcamento/admin";
  }

  const { appendActivity, refletirEstadoDoEstudio, refletirPedidoReposto } = useHistoricoDoPedido({
    setQuotes,
    setSelected,
    substituirPedido,
    toast,
    selectedRef,
    escritoNoServidor,
    edicao,
  });
  const { guardarTudoDoPedido, guardarAgora } = useGravacaoDoPedido({
    refletirPedidoReposto,
    userName,
    setQuotes,
    setSelected,
    selected,
    setSaving,
    toast,
    anular,
    escritoNoServidor,
    acertarBaseDoConflito,
    setRascunhoPorRepor,
    gravacao,
    edicao,
  });

  const {
    nomesDoLote,
    apagarMesmo,
    applyBulkArchive,
    applyBulkStatus,
    pedirParaArquivar,
    deleteSelected,
  } = useAccoesEmLote({
    userName,
    quotes,
    setQuotes,
    quotesRef,
    setSelected,
    selectedRef,
    absorverDoServidor,
    setSelectedIds,
    setLote,
    bulkBusy,
    contarMaisUmNoLote,
    setAApagarLote,
    setAArquivarLote,
    toast,
    anular,
    depoisDeApagarVarios,
    revalidarPedidos,
  });

  const archivedCount = useMemo(() => quotes.filter((q) => q.archived).length, [quotes]);
  /* ── SEM ARQUIVADOS, NÃO HÁ LISTA DE ARQUIVADOS (revisão · 1) ────────────
     Restaurar o último deixava os Pedidos na lista dos arquivados, vazia, e o
     botão que a fecha («Arquivados · N») só existe com N > 0 — não havia saída.
     Corrige-se no próprio desenho, que é onde o React deixa ajustar estado a
     partir de outro sem um segundo passo. */
  if (showArchived && archivedCount === 0) setShowArchived(false);

  /**
   * «Ver os arquivados» — a saída dos vazios da Visão Geral e do Kanban.
   *
   * Os três gestos andam juntos: levar à lista sem destapar os arquivados, ou
   * com um filtro de estado ainda por limpar, dava outra lista vazia — e essa
   * já não tinha saída nenhuma.
   */
  const verArquivados = useCallback(() => {
    setShowArchived(true);
    setFilterStatus("all");
    setView("pedidos");
  }, [setFilterStatus, setShowArchived]);

  // Archived quotes are soft-deleted: keep them out of the analytical surfaces
  // (overview, pipeline, clientes, calendário, estatísticas) so a junk or
  // duplicate lead never pollutes the numbers. They stay reachable via the
  // "Arquivados" toggle on Pedidos and the command palette.
  const activeQuotes = useMemo(() => quotes.filter((q) => !q.archived), [quotes]);

  /**
   * As opções dos filtros saem dos DADOS, não de uma lista fixa. Um mês sem
   * eventos ou uma região onde nunca houve um casamento não aparecem — um
   * filtro que só tem escolhas vazias é ruído com aspeto de função.
   */
  const mesesDisponiveis = useMemo(() => mesesDeEvento(activeQuotes), [activeQuotes]);
  const regioesDisponiveis = useMemo(() => regioesDe(activeQuotes), [activeQuotes]);
  const plannersDisponiveis = useMemo(() => plannersDe(activeQuotes), [activeQuotes]);

  const { visibleQuotes, visibleCount, setVisibleCount, setInicioDoLote, ehDoLoteNovo } =
    usePaginaDaLista({ filtros });

  /**
   * ── A SELECÇÃO SOBRE QUE OS BOTÕES DO LOTE AGEM ───────────────────────────
   *
   * `selectedIds` guarda o que ela marcou; isto é a parte que continua NO ECRÃ
   * depois de o filtro ou a procura terem mudado. A barra do lote contava a
   * selecção crua e as duas acções que mexem (Marcar como, Apagar) corriam-na
   * inteira: marcavam-se três pedidos, escrevia-se um nome na procura para
   * conferir um, e o «Apagar (3)» apagava para sempre dois que já não estavam
   * no ecrã. O número que a barra mostra e o número sobre que os botões agem
   * têm de ser o mesmo.
   *
   * Sobre `filtered` e não sobre `visibleQuotes`: a paginação é só do desenho —
   * «Selecionar todos (N)» já conta a lista filtrada inteira, e cortar aqui
   * pelo que coube na primeira página era um segundo desencontro.
   */
  const seleccionadosAVista = useMemo(
    () => filtered.filter((q) => selectedIds.has(q.id)).map((q) => q.id),
    [filtered, selectedIds],
  );
  useEffect(() => {
    // Os DESENHADOS, e não a lista filtrada inteira (revisão · 3): o ⌘A não
    // escolhe o que ela não vê. Os outros oferecem-se à parte, na barra.
    filtradosRef.current = visibleQuotes.map((q) => q.id);
  }, [visibleQuotes, filtradosRef]);
  useEffect(() => {
    painelPorCimaRef.current = !!selected && isDetailOverlay;
  }, [selected, isDetailOverlay, painelPorCimaRef]);

  // «Por responder» inclui a proposta que se está a preparar: o casal ainda
  // não recebeu nada, portanto a bola continua do nosso lado.
  const pendingCount = activeQuotes.filter(
    (q) => q.status === "pendente" || q.status === "em_revisao" || q.status === "a_preparar",
  ).length;

  // Every tag in use across all quotes — feeds the tag editor suggestions and
  // the Pedidos tag filter.
  const allTags = useMemo(() => etiquetasEmUso(quotes), [quotes]);

  // Active-quote counts per status, computed once instead of one full
  // `quotes.filter()` per status pill on every render.
  const statusCounts = useMemo(() => contarPorEstado(quotes), [quotes]);

  const todayStr = todayKey();

  /** Escolher um destino no menu: muda a vista e fecha a gaveta do telemóvel. */
  const escolherDestino = (id: View) => {
    setView(id);
    setNavOpen(false);
  };

  const mostrarAccoesDePedidos = ACOES_DE_PEDIDOS.has(view);

  return (
    <>
      {/* Houve aqui um `-mt-24` a cancelar o `pt-24` do `<main>` do cromado do
          sítio — em `className` e não em CSS, porque a versão em CSS dependia
          da classe `admin-mode`, que só entra num efeito, e o salto de 96 px à
          montagem valia 0,128 de CLS medidos.
          Saiu com o cromado: o back office no grupo `(admin)` já não tem
          `pt-24` para cancelar, e o `<main>` que faltava está no layout do
          grupo. Enquanto os dois se cruzaram, a raiz começava a `top: -96px` —
          os primeiros 96 px do back office estavam fora do ecrã. */}
      <div className="min-h-screen bg-[var(--bo-chao)] flex">
        <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        {/* Repor uma cópia troca os dados TODOS no servidor, e a lista que está
            aqui em memória não tem como saber o que mudou. É o único sítio onde
            a revalidação salta o intervalo mínimo: ao fechar o diálogo, o que
            está no ecrã tem de ser o que ficou gravado. */}
        <RestoreDialog
          open={restoreOpen}
          onClose={() => {
            setRestoreOpen(false);
            void revalidarPedidos(true);
          }}
          // Se o código da janela não chegou, nada foi reposto: fecha só.
          aoNaoChegar={() => setRestoreOpen(false)}
          toast={toast}
        />
        {/* A cópia de segurança a chegar. Pedida da barra lateral OU da
            paleta (que no telemóvel é o único caminho), por isso flutua num
            sítio só, à esquerda, longe dos avisos que saem à direita. Opaca:
            flutua por cima do conteúdo, e a única camada de vidro do ecrã é
            o cabeçalho e a barra de destinos. */}
        {copiaDeSeguranca.mostrar && (
          <div className="fixed bottom-[calc(var(--bo-barra-inferior)+env(safe-area-inset-bottom)+0.75rem)] left-4 right-4 z-[79] rounded-xl bg-[var(--bo-elevado)] shadow-[var(--bo-sombra-suspensa)] sm:left-6 sm:right-auto sm:w-80">
            <EmCurso
              titulo="A descarregar a cópia de segurança…"
              pronto="Cópia de segurança guardada"
              estimadoMs={4000}
              {...copiaDeSeguranca.barra}
            />
          </div>
        )}
        <PasskeysDialog open={passkeysOpen} onClose={() => setPasskeysOpen(false)} toast={toast} />
        {/* Se a sessão cair a meio do trabalho, este painel abre POR CIMA e
            reautentica sem desmontar nada — ver o cabeçalho do ficheiro. Está
            aqui, e não numa vista, para valer no back office inteiro. */}
        <SessaoExpirada />
        <AjudaGlossario open={ajudaOpen} onClose={() => setAjudaOpen(false)} />
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          navCommands={paletteCommands}
          quotes={quotes}
          onOpenQuote={abrirCliente}
          recentQuotes={recentQuotes}
          grupos={gruposDaProcura}
        />
        <NewQuoteModal
          open={newQuoteOpen}
          onClose={() => setNewQuoteOpen(false)}
          existingQuotes={quotes}
          onCreated={(q) => {
            setQuotes((prev) => [q, ...prev]);
            abrirCliente(q);
          }}
          onImportar={() => {
            setNewQuoteOpen(false);
            setImportarOpen(true);
          }}
        />
        {/* Uma proposta antiga (Word/PowerPoint) → o pedido e o rascunho, e
            abre no «Fazer proposta» pela mesma porta do «Novo pedido». */}
        {importarOpen && (
          <ImportarProposta
            open={importarOpen}
            onClose={() => setImportarOpen(false)}
            onCreated={(q) => {
              setQuotes((prev) => [q, ...prev]);
              abrirCliente(q);
            }}
          />
        )}
        {/* ── Sidebar ── */}
        {/* `inert` quando é gaveta E está fechada.
            Sem isto, os 20 botões da gaveta fechada continuavam alcançáveis: o
            `-translate-x-full` empurra-os para `x = -244` mas não os tira do
            DOM, portanto o TAB de um teclado externo e o varrimento do
            VoiceOver entravam lá dentro e o foco desaparecia do ecrã — ficava-se
            a carregar em Tab às cegas. `inert` tira-os da ordem de foco e da
            árvore de acessibilidade de uma vez.
            As duas condições são precisas: a partir de `lg` a barra é uma
            coluna sempre visível, e marcá-la inerte ali desligava a navegação
            no portátil. */}
        {/* ── O INVÓLUCRO QUE IMPEDE A PÁGINA DE SE ARRASTAR PARA O LADO ─────
            ESTE É O DEFEITO QUE ELA VIU DUAS VEZES, e que nunca se reproduziu
            aqui. Medido no ecrã dela: a página desliza 261 px para a direita e
            do outro lado fica uma folha branca. A gaveta fechada tem 256 px.

            A gaveta é `position: fixed` e, fechada, vive em `x = -256`. Duas
            consequências que se juntam:

            · A rede de segurança do `globals.css` (`body { overflow-x: clip }`)
              NÃO a alcança. Um elemento `fixed` tem como bloco contentor o
              viewport, e nenhum antepassado o corta — a não ser que esse
              antepassado seja ele próprio o bloco contentor dos fixos, o que
              só acontece com `transform`, `filter` ou `contain`. O `clip` do
              `body` corta tudo menos exactamente isto.

            · O Safari do iPhone conta os elementos `fixed` para a área que se
              pode arrastar. O Chromium não — e é por isso que aqui a página
              mede 390 px em 390 px de ecrã, com zero elementos a passar a
              margem direita, e no telemóvel dela se arrasta 256.

            O invólucro resolve as duas de uma vez: `translateZ(0)` faz dele o
            bloco contentor da gaveta, e aí o `overflow-hidden` já a corta. Fica
            do tamanho exacto do ecrã, portanto não transborda nada.

            `lg:contents` desmonta-o a partir dos 1024 px: sem caixa não há
            transform, não há corte, e a gaveta volta a ser a coluna `sticky` em
            fluxo que era. `pointer-events-none` no invólucro (e `auto` na
            gaveta) porque ele cobre o ecrã todo e não pode comer os toques da
            página por baixo.

            Porque não `hidden` quando fechada, que era mais simples: matava as
            duas animações — a gaveta passava a aparecer e desaparecer de um
            fotograma para o outro. Isto corrige o arrasto e não mexe no que
            já estava bem. */}
        <MenuLateral
          userName={userName}
          view={view}
          navOpen={navOpen}
          setNavOpen={setNavOpen}
          gavetaRef={gavetaRef}
          colunaDosDestinos={colunaDosDestinos}
          marcaDoDestino={marcaDoDestino}
          marcaPodeAndar={marcaPodeAndar}
          setShortcutsOpen={setShortcutsOpen}
          setRestoreOpen={setRestoreOpen}
          setPasskeysOpen={setPasskeysOpen}
          setAjudaOpen={setAjudaOpen}
          copiaDeSeguranca={copiaDeSeguranca}
          descarregarCopia={descarregarCopia}
          pedirParaSair={pedirParaSair}
          pendingCount={pendingCount}
          escolherDestino={escolherDestino}
        />

        <BarraDeDestinos
          selected={selected}
          view={view}
          setView={setView}
          setNavOpen={setNavOpen}
          navOpen={navOpen}
          isDetailOverlay={isDetailOverlay}
          tecladoNoEcra={tecladoNoEcra}
          barraDeDestinosRef={barraDeDestinosRef}
          pendingCount={pendingCount}
        />

        {/* ── Main ── */}
        {/* Bottom padding clears the real mobile nav height + the notch
            safe-area inset, so the last row never hides under the tab bar.
            A altura vem do token `--bo-barra-inferior` e não de um número
            copiado: eram dois «56px» em ficheiros diferentes, e discordaram
            assim que os rótulos da barra subiram ao chão de 12 px (a barra
            passou a 71, o conteúdo continuou a guardar 56). Ver
            `barra-inferior.test.tsx`. */}
        {/* O `lg:pb-0` caiu: a barra passou a estar no computador também, e o
            espaço que ela ocupa tem de ser guardado nas duas larguras — senão a
            última linha de qualquer lista fica por baixo dela. Os outros três
            sítios que leem o `--bo-barra-inferior` (o aviso do `Toast`, a barra
            do estúdio e o fundo da lista da biblioteca) perderam o seu pelo
            mesmo motivo. */}
        <div className="flex-1 min-w-0 flex flex-col pb-[calc(var(--bo-barra-inferior)+env(safe-area-inset-bottom))]">
          <Cabecalho
            selected={selected}
            view={view}
            setNavOpen={setNavOpen}
            desceu={desceu}
            cabecalhoRef={cabecalhoRef}
            setPaletteOpen={setPaletteOpen}
            setNewQuoteOpen={setNewQuoteOpen}
            setAjudaOpen={setAjudaOpen}
            mostrarAccoesDePedidos={mostrarAccoesDePedidos}
            pedirNovaTarefa={pedirNovaTarefa}
          />

          {/* ── O ARMAZENAMENTO, ANTES DE SE COMEÇAR A TRABALHAR ─────────────
              Uma colaboradora montou uma proposta inteira — fotos, mood boards,
              textos — numa instalação onde a tabela dos rascunhos não existia.
              O sistema dizia «Guardado» e não estava a guardar nada. Isto é a
              mesma verdade dita à ABERTURA, enquanto ainda dá para não começar.

              Aqui e num sítio só: fica por baixo da navegação e por cima de
              todas as vistas, portanto vê-se em qualquer separador sem ter de
              ser repetido dentro de cada um. Quase nunca aparece — só quando o
              servidor diz que há mesmo alguma coisa errada. Ver o cabeçalho do
              componente. */}
          <AvisoDeArmazenamento />

          {/* ── AS PERGUNTAS DESTRUTIVAS ────────────────────────────────────
              Aqui e não junto de cada botão: as três podem ser disparadas de
              sítios diferentes (o menu do detalhe, a barra do lote, a
              navegação) e uma caixa modal não pertence a nenhum deles. */}
          <PerguntaDestrutiva
            aberto={aApagar !== null}
            onFechar={() => setAApagar(null)}
            titulo={`Apagar o pedido de ${aApagar?.name ?? ""}?`}
            oQueSePerde={oQueSePerdeComOPedido(aApagar)}
            aviso="Fica 30 dias na Reciclagem, de onde pode voltar. Para o tirar da lista sem o apagar, usa «Arquivar»."
            rotuloConfirmar="Apagar o pedido"
            onConfirmar={async () => {
              const alvo = aApagar;
              if (!alvo) return;
              const oQue = `apagar o pedido de ${alvo.name}`;
              let res: Response;
              try {
                res = await fetch(`/api/orcamento/${alvo.id}`, { method: "DELETE" });
              } catch {
                toast(porqueRebentou(oQue).mensagem, "error");
                return;
              }
              const corpo = await res.json().catch(() => null);
              if (!res.ok) {
                toast(porqueFalhou(oQue, res, corpo).mensagem, "error");
                return;
              }
              setQuotes((prev) => prev.filter((q) => q.id !== alvo.id));
              setSelected(null);
              setAApagar(null);
              depoisDeApagar(
                corpo,
                `Pedido de ${alvo.name} apagado.`,
                () => void revalidarPedidos(true),
              );
            }}
          />

          <PerguntaDestrutiva
            aberto={aApagarLote !== null}
            onFechar={() => setAApagarLote(null)}
            titulo={`Apagar ${aApagarLote?.length ?? 0} pedido${
              (aApagarLote?.length ?? 0) === 1 ? "" : "s"
            }?`}
            /* Os NOMES, e não só a conta. Quem lê «12 pedidos» não tem como
               saber se a selecção é a que pensa que é — e a única maneira de
               confirmar era cancelar e contar à mão. */
            oQueSePerde={nomesDoLote(aApagarLote)}
            aviso="Ficam 30 dias na Reciclagem, de onde podem voltar."
            rotuloConfirmar={`Apagar ${aApagarLote?.length ?? 0} pedido${
              (aApagarLote?.length ?? 0) === 1 ? "" : "s"
            }`}
            onConfirmar={() => apagarMesmo(aApagarLote ?? [])}
          />

          {/* Arquivar MUITOS pergunta primeiro, com o número e os nomes
              (revisão · 3). Não é destrutivo — o «Anular» repõe-nos, e os
              arquivados estão a um toque — por isso a pergunta é a da casa
              com o verbo no botão, e não a vermelha de apagar. */}
          <FolhaOuDialogo
            aberto={aArquivarLote !== null}
            onFechar={() => setAArquivarLote(null)}
            titulo={`Arquivar ${loteDaPergunta.length} pedidos?`}
            largura="sm"
            accoes={
              <>
                <Button variant="ghost" onClick={() => setAArquivarLote(null)}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    const ids = aArquivarLote ?? [];
                    setAArquivarLote(null);
                    void applyBulkArchive(true, ids);
                  }}
                >
                  {`Arquivar ${loteDaPergunta.length} pedidos`}
                </Button>
              </>
            }
          >
            <ul className="space-y-1 text-sm text-[var(--bo-tinta-72)]">
              {nomesDoLote(loteDaPergunta).map((nome, i) => (
                <li key={i}>{nome}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-[var(--bo-text-muted)]">
              Saem da lista principal e ficam nos arquivados, de onde voltam com um toque.
            </p>
          </FolhaOuDialogo>

          <PerguntaDestrutiva
            aberto={aSair}
            onFechar={() => setASair(false)}
            titulo="Sair com alterações por guardar?"
            oQueSePerde={[
              <>
                O que está no painel de <strong>{selected?.name ?? "um pedido"}</strong> e ainda não
                foi confirmado.
              </>,
            ]}
            aviso="Fechar o painel primeiro guarda-as."
            rotuloConfirmar="Sair mesmo assim"
            onConfirmar={sairMesmo}
          />

          {/* A espera de abrir um pedido, aqui pelo mesmo motivo que o aviso
              acima: as seis portas que abrem um pedido estão espalhadas por
              cinco vistas, e o sinal tem de aparecer naquela em que o dedo
              tocou. */}
          {/* FORA DO FLUXO: no fluxo, o aviso empurrava a lista para baixo ao
              aparecer e deixava-a subir ao sair — MEDIDO a 390 px ao abrir uma
              proposta a partir das Propostas, um salto de 0,157 (acima do 0,1
              que já é «mau»). Fica numa âncora de altura zero, por cima do
              topo da vista, com fundo opaco para não se ler através dele. */}
          {aAbrir && (
            <div className="relative z-10 h-0" data-ancora-em-curso>
              <div className="absolute inset-x-0 top-0 rounded-xl bg-[var(--bo-surface)] shadow-[var(--bo-sombra-suspensa)]">
                <EmCurso
                  titulo={`A abrir o pedido de ${aAbrir.nome}`}
                  estimadoMs={1200}
                  nota="Vai buscar os convidados, a checklist e o cronograma — é o que falta ao resumo da lista."
                  notaDemorada="A ligação está lenta. Podes esperar, ou voltar atrás e tentar daqui a pouco."
                />
              </div>
            </div>
          )}

          <Vistas
            pedidos={{
              quotes,
              activeQuotes,
              nomesDosPedidos,
              archivedCount,
              falhaDosPedidos,
              substituirPedido,
              alterarPedido,
              refletirEstadoDoEstudio,
              absorverDoServidor,
              marcarDesfecho,
              revalidarPedidos,
              verArquivados,
              comPedidoInteiro,
              abrirCliente,
              openQuote,
            }}
            navegacao={{
              view,
              setView,
              pedidoPara,
              irComPedido,
              propostaPara,
              setPropostaPara,
              setNewQuoteOpen,
              novaTarefa,
            }}
            userName={userName}
          />

          {/* ── Pedidos ── */}
          <div className={`${VIEW_WRAP} ${view === "pedidos" ? "view-in" : "hidden"}`}>
            <ControlosDaLista
              filtros={filtros}
              userName={userName}
              toast={toast}
              searchRef={searchRef}
              mesesDisponiveis={mesesDisponiveis}
              regioesDisponiveis={regioesDisponiveis}
              plannersDisponiveis={plannersDisponiveis}
            />

            <PastilhasDaLista
              filtros={filtros}
              archivedCount={archivedCount}
              allTags={allTags}
              statusCounts={statusCounts}
            />

            <BarraDaSeleccao
              filtros={filtros}
              setSelectedIds={setSelectedIds}
              selectedIds={selectedIds}
              lote={lote}
              bulkBusy={bulkBusy}
              applyBulkStatus={applyBulkStatus}
              pedirParaArquivar={pedirParaArquivar}
              deleteSelected={deleteSelected}
              visibleQuotes={visibleQuotes}
              seleccionadosAVista={seleccionadosAVista}
            />

            {/* When a pedido is open, the list collapses to a slim rail and the
                detail takes over the remaining width as a spacious workspace.
                With nothing selected the list spreads full-width. */}
            <div
              className={`grid grid-cols-1 gap-[var(--bo-gap-vista)] ${
                selected ? "xl:grid-cols-[minmax(320px,360px)_minmax(0,1fr)]" : "xl:grid-cols-1"
              }`}
            >
              {/* List */}
              <ListaDosPedidos
                filtros={filtros}
                userName={userName}
                selected={selected}
                setNewQuoteOpen={setNewQuoteOpen}
                selectedIds={selectedIds}
                marcarDesfecho={marcarDesfecho}
                mudarEstadoNaLinha={mudarEstadoNaLinha}
                toggleSelect={toggleSelect}
                abrirDaLista={abrirDaLista}
                visibleCount={visibleCount}
                setVisibleCount={setVisibleCount}
                setInicioDoLote={setInicioDoLote}
                visibleQuotes={visibleQuotes}
                ehDoLoteNovo={ehDoLoteNovo}
                todayStr={todayStr}
              />

              {/* Detail — in-grid sticky panel on desktop, slide-over drawer on mobile */}
              {selected ? (
                <>
                  {/* ── O VÉU VAI-SE COM A CAIXA QUE TROUXE ──────────────
                      Acendia em 240 ms e apagava-se num fotograma. A saída é a
                      do fundo — zero de deslocação, porque um fundo não vem de
                      sítio nenhum nem vai para sítio nenhum, só apaga —, e ela
                      traz o `pointer-events: none` dentro da classe: durante os
                      200 ms o véu deixa de comer o toque que ela deu na lista.

                      NOTA PARA QUEM VARRE: o `entrada-dos-fundos.test.ts`
                      procura véus por `className="…inset-0…"` literal, e a
                      partir daqui esta lista deixou de ser literal — este véu
                      sai desse censo. Quem passa a guardá-lo, e guarda mais do
                      que ele guardava (a entrada E a saída), é o
                      `entrada-do-painel-do-pedido.test.ts`. */}
                  <div
                    className={`${
                      painelASair ? SAIDA_FUNDO : "bo-entrada bo-entrada-fundo"
                    } fixed inset-0 z-40 bg-black/50 xl:hidden`}
                    onClick={closeDetail}
                  />
                  <div
                    ref={drawerRef}
                    /* ── A SAÍDA SAI TAMBÉM DA ÁRVORE DE ACESSIBILIDADE ─────
                       O `inert` aqui em baixo já largava os toques e o Tab. O
                       que faltava era a outra metade: `isDetailOverlay` é a
                       LARGURA DO ECRÃ e não muda quando ela fecha, portanto
                       durante os 200 ms da saída esta caixa continuava a ser um
                       `role="dialog"` com `aria-modal="true"` e com nome — e o
                       `getByRole("dialog")` ainda a encontrava por ele. Um
                       diálogo modal que já não está lá é pior do que nenhum: a
                       promessa do `aria-modal` é «só isto conta», e a caixa que
                       a fazia está a desaparecer.

                       `painelASair` levanta-se no instante do gesto, portanto
                       os três atributos caem no mesmo fotograma em que a saída
                       começa. O `aria-hidden` acompanha-os pela mesma razão —
                       é a frase dita ao leitor de ecrã, como o `inert` é a
                       frase dita ao teclado. Guardado pelo
                       `a-saida-sai-da-arvore.test.ts`, de cuja lista de dívida
                       este ficheiro sai com esta alteração. */
                    role={isDetailOverlay && !painelASair ? "dialog" : undefined}
                    aria-modal={isDetailOverlay && !painelASair ? true : undefined}
                    aria-labelledby={
                      isDetailOverlay && !painelASair ? "detail-drawer-title" : undefined
                    }
                    aria-hidden={painelASair || undefined}
                    /* ── O PAINEL É UMA MOLDURA: CABEÇA, MEIO QUE ROLA, PÉ ───
                       O que rola passou a ser a caixa de DENTRO. Antes rolava
                       o painel inteiro e a barra de gravação ia lá dentro,
                       `sticky bottom-0` — colada ao fundo do que rola. Duas
                       coisas más saíam daí:

                       · o estúdio de propostas tem a SUA barra `sticky
                         bottom-0` (z-20) e as duas disputavam a mesma aresta:
                         medido a 1280×800, a meio da rolagem quem estava no
                         centro do «Guardar alterações» era a barra do estúdio;
                       · e uma barra colada ao fundo de uma caixa que rola
                         depende de onde a caixa está — não é uma promessa.

                       Com o pé FORA da caixa que rola, a aresta de baixo do
                       que rola fica por cima dele: o `sticky` do estúdio cola
                       ali e nunca mais o tapa, sem guerra de `z-index` e sem o
                       estúdio ter de saber que existe um pé por baixo. */
                    /* ── A CAIXA ENTRA E SAI, E SEM SE MEXER UM PÍXEL ──────
                       O véu já entrava; a caixa aparecia no primeiro fotograma.
                       Lia-se como meio gesto — o ecrã escurecia devagar e o
                       painel estava lá desde sempre.

                       ZERO DE DESLOCAÇÃO, e não os quatro píxeis de omissão da
                       casa. A razão é geométrica e vê-se: no telemóvel esta
                       caixa é `fixed inset-y-0`, ou seja encosta às duas
                       arestas do ecrã. Qualquer `translateY` abre uma fresta da
                       altura da deslocação numa delas — a página a espreitar
                       por baixo de uma gaveta que devia tapar o ecrã inteiro.
                       Uma entrada que mostra o que devia esconder não é uma
                       entrada melhor do que nenhuma.

                       Fica portanto só a opacidade, escrita como a casa a
                       escreve: a `.bo-entrada` com o `--bo-entrada-y` a zero, e
                       a `.bo-saida` com o `--bo-saida-y` a zero. É a mesma
                       decisão que o véu já tinha (a `-fundo` é exactamente
                       isto), mas dita aqui em vez de emprestada — esta caixa
                       não é um fundo, e chamar-lhe um só para lhe apanhar o
                       zero fazia-a passar a ser lida como tal.

                       E há uma segunda razão para não deixar um `transform`
                       vivo aqui: esta caixa é `fixed` no telemóvel e `sticky`
                       no computador, tem um cabeçalho `sticky` lá dentro e o
                       estúdio de propostas traz a sua barra `sticky bottom-0`.
                       Um `transform` num antepassado cria um bloco de contenção
                       e é a razão por que as classes desta casa acabam em
                       `transform: none`. MEDIDO num Chromium sobre a mesma
                       geometria (`e2e/entrada-da-gaveta.mjs`): com `translateY`
                       vivo o cabeçalho e a barra do estúdio deslocam-se com a
                       caixa durante a animação; com zero, ficam onde estavam,
                       fotograma a fotograma. */
                    className={`${
                      painelASair ? SAIDA : "bo-entrada"
                    } fixed xl:static inset-y-0 right-0 z-50 xl:z-auto flex w-full max-w-md flex-col overflow-hidden border-l bg-[var(--bo-surface)] shadow-[var(--bo-sombra-modal)] xl:shadow-none sm:max-w-xl lg:max-w-3xl xl:sticky xl:top-24 xl:w-auto xl:max-w-none xl:rounded-2xl xl:border border-[var(--bo-hairline)] max-h-[100dvh] xl:max-h-[calc(100vh-6rem-var(--bo-barra-inferior)-env(safe-area-inset-bottom))]`}
                    /* A saída larga os toques dentro da própria classe; o
                       `inert` é a mesma frase dita ao teclado e ao leitor de
                       ecrã. Sem ele, durante 200 ms havia um painel a
                       desaparecer onde ainda se podia entrar com o Tab. */
                    inert={painelASair}
                    // A altura medida ganha à classe — e só existe na coluna do
                    // computador. Ver `alturaDoDetalhe`.
                    style={
                      {
                        "--bo-entrada-y": "0px",
                        "--bo-saida-y": "0px",
                        ...(isDetailOverlay || alturaDoDetalhe === null
                          ? null
                          : { maxHeight: alturaDoDetalhe }),
                      } as React.CSSProperties
                    }
                  >
                    <OPedidoAberto
                      selected={selected}
                      edicao={edicao}
                      userName={userName}
                      locale={locale}
                      toast={toast}
                      setQuotes={setQuotes}
                      setSelected={setSelected}
                      abrirDetailTab={abrirDetailTab}
                      gestaoRef={gestaoRef}
                      toolsRef={toolsRef}
                      appendActivity={appendActivity}
                      refletirEstadoDoEstudio={refletirEstadoDoEstudio}
                      activeQuotes={activeQuotes}
                    >
                      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
                        <CabecalhoDoPainel
                          setAApagar={setAApagar}
                          detailTitleRef={detailTitleRef}
                          closeDetail={closeDetail}
                          duplicateQuote={duplicateQuote}
                        />

                        <RascunhoPorRepor
                          rascunhoPorRepor={rascunhoPorRepor}
                          reporRascunho={reporRascunho}
                          descartarRascunho={descartarRascunho}
                        />

                        {/* Tudo à vista: ciclo de vida, próxima ação, o formulário de
                        gestão sempre presente e as ferramentas em separadores logo
                        abaixo — nada fica escondido atrás de revelações. */}
                        <div className="mx-auto flex w-full max-w-3xl flex-col gap-[var(--bo-gap-vista)] px-3.5 py-3.5 sm:px-7 sm:py-8">
                          <TopoDoPainel
                            propostasLeves={propostasLeves}
                            marcadoNoPainel={marcadoNoPainel}
                            setMarcadoNoPainel={setMarcadoNoPainel}
                            marcarDesfecho={marcarDesfecho}
                            recarregarPedido={recarregarPedido}
                          />

                          <GestaoDoPedido
                            ganhoSemProposta={ganhoSemProposta}
                            escolherEstado={escolherEstado}
                            devolvidoAqui={devolvidoAqui}
                            emailSugerido={emailSugerido}
                            allTags={allTags}
                          />

                          <ContactoDoCliente />

                          <FerramentasDoPedido
                            detailTab={detailTab}
                            detailTabsVisitados={detailTabsVisitados}
                            gavetaDoPlano={gavetaDoPlano}
                            gavetaDoHistorico={gavetaDoHistorico}
                          />
                        </div>
                        {/* A aresta que diz «há mais por baixo» — F-09 da auditoria. Última
                          filha do que rola, de propósito: é o `sticky` que a faz aparecer e
                          desaparecer sozinha, sem uma linha de JavaScript a ouvir o scroll.
                          O porquê inteiro está em `globals.css`, na regra. */}
                        <div className="bo-ha-mais-abaixo" aria-hidden="true" />
                      </div>

                      <PeDoPainel
                        saving={saving}
                        isDirty={isDirty}
                        gravacao={gravacao}
                        guardarAgora={guardarAgora}
                      />
                    </OPedidoAberto>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
