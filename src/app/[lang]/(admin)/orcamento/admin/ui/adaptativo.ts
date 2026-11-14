"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FUNDAÇÕES ADAPTATIVAS DO BACK OFFICE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Responsivo ≠ adaptativo. Um layout que encolhe é responsivo; um ecrã que muda
 * de FORMA porque a tarefa é outra é adaptativo. Este módulo é o que permite o
 * segundo sem duplicar uma única regra de negócio: dá a informação, e cada ecrã
 * escolhe a apresentação.
 *
 * ── OS DOIS EIXOS, QUE NÃO SÃO O MESMO ──────────────────────────────────────
 * Esta é a decisão que mais engano evita, e por isso são duas funções e não uma:
 *
 *   LARGURA  decide o LAYOUT  — cabem duas colunas? uma tabela? uma barra ao lado?
 *   PONTEIRO decide os ALVOS  — há hover? é dedo ou rato? um menu revelado ao
 *                               passar por cima existe, ou é invisível?
 *
 * Um iPad com teclado é largo E de toque. Um portátil com ecrã táctil é largo E
 * de toque. Um telemóvel ao alto ligado a um monitor é... outra coisa. Tratar
 * "estreito" e "dedo" como sinónimos é o que faz um tablet receber a interface
 * de um telemóvel — que foi um dos quatro achados Críticos do MOBILE-AUDIT.
 *
 * ── PORQUE É QUE HÁ UM `montado` ────────────────────────────────────────────
 * O servidor não tem `window`. Se o primeiro desenho do browser já usasse a
 * largura real, o HTML do servidor e o do cliente seriam diferentes e o React
 * queixava-se (hydration mismatch) — ou pior, calava-se e deixava o ecrã num
 * estado a meio. Por isso a primeira leitura é sempre a mesma dos dois lados, e
 * `montado` diz a quem chama se o que está a ler já é a verdade.
 *
 * REGRA PRÁTICA, e está aqui para não se perder:
 *   · Diferença só de ESTILO (colunas, espaçamento, tamanhos)? Faz-se em CSS,
 *     com as variantes do Tailwind. Não custa JavaScript e não pisca.
 *   · Diferença ESTRUTURAL (uma tabela vira cartões; um diálogo vira folha
 *     inferior; um arrasto vira menu)? Aí sim usa-se este módulo — mas cuidado
 *     com o primeiro desenho.
 */

/**
 * Os pontos de corte, em píxeis.
 *
 * São os que a Catarina definiu, e coincidem de propósito com apenas TRÊS dos
 * do Tailwind: `sm` (640) e `lg` (1024) — mais um `wide` (1440) que o Tailwind
 * não tem e que aqui se acrescenta.
 *
 * `md` (768) e `xl` (1280) NÃO se usam no back office. Não é gosto: dois
 * sistemas de pontos de corte a competir é como um ecrã acaba com uma tabela a
 * três colunas a 800 px e a duas a 900 px, sem ninguém perceber porquê.
 */
export const CORTES = {
  /** Abaixo disto é telemóvel. */
  telemovel: 640,
  /** A partir daqui é desktop (e é onde a barra lateral deixa de ser gaveta). */
  desktop: 1024,
  /** Ecrã largo: há espaço para um painel lateral SEM tirar nada ao conteúdo. */
  largo: 1440,
} as const;

/** A classe de largura em que o ecrã está. */
export type Largura = "telemovel" | "tablet" | "desktop" | "largo";

/**
 * As capacidades do aparelho — o que ele SABE FAZER, não o tamanho que tem.
 */
export interface Capacidade {
  /** `(hover: hover)` — o aparelho consegue mesmo pairar? Num ecrã táctil não:
   *  tudo o que só apareça no hover é, ali, invisível. */
  hover: boolean;
  /** `(pointer: coarse)` — o apontador principal é grosso (um dedo). É isto, e
   *  não a largura, que decide se os alvos têm de ter 44 px. */
  toque: boolean;
}

/**
 * ── UMA PERGUNTA POR MEDIA QUERY, E NÃO UMA POR DESENHO (10/11) ──────────
 *
 * Ela: «está a travar imenso e super pouco fluido» no «Fazer proposta». MEDIDO
 * (perfil do processador a escrever 21 letras numa descrição de mood board,
 * com 8 páginas de 12 fotos): ~230 ms em `matchMedia`. Cada célula de foto
 * monta as acções (`AccoesDaFoto` → `useAdaptativo` → cinco `useMedia`), e
 * cada `useMedia`:
 *
 *   · criava um `MediaQueryList` NOVO em cada leitura (`window.matchMedia(mq)`
 *     a cada desenho, e o React lê duas vezes por desenho para se proteger de
 *     valores rasgados) — 96 células × 5 perguntas × 2 por letra;
 *   · e dava ao `useSyncExternalStore` uma função `subscrever` NOVA a cada
 *     desenho, o que o obriga a cancelar e voltar a subscrever, também a cada
 *     letra.
 *
 * Agora há UM `MediaQueryList` e UMA função de subscrição por media query,
 * guardados ao nível do módulo. A leitura passa a ser ler `.matches` de um
 * objecto que já existe. O comportamento é o mesmo — a mesma pergunta, as
 * mesmas respostas, o mesmo `false` no servidor.
 */
const listas = new Map<string, MediaQueryList>();
/** O `matchMedia` de onde vieram as listas — se for trocado (os testes trocam-no
 *  entre casos), as listas guardadas são de outro mundo e esquecem-se. */
let fonteDasListas: typeof window.matchMedia | null = null;

function listaDe(mq: string): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  if (fonteDasListas !== window.matchMedia) {
    listas.clear();
    fonteDasListas = window.matchMedia;
  }
  let m = listas.get(mq);
  if (!m) {
    m = window.matchMedia(mq);
    listas.set(mq, m);
  }
  return m;
}

/** O que o `matchMedia` diria no servidor: nada. Uma leitura só do cliente. */
const consulta = (mq: string): boolean => listaDe(mq)?.matches ?? false;

const subscricoes = new Map<string, (avisar: () => void) => () => void>();

function subscricaoDe(mq: string): (avisar: () => void) => () => void {
  let s = subscricoes.get(mq);
  if (!s) {
    s = (avisar: () => void) => {
      const m = listaDe(mq);
      if (!m) return () => {};
      // `addEventListener` é o moderno; o Safari antigo só tem `addListener`.
      // Falhar aqui deixava o ecrã congelado na primeira leitura — o que se
      // nota exactamente quando se roda o telemóvel.
      if (typeof m.addEventListener === "function") {
        m.addEventListener("change", avisar);
        return () => m.removeEventListener("change", avisar);
      }
      m.addListener(avisar);
      return () => m.removeListener(avisar);
    };
    subscricoes.set(mq, s);
  }
  return s;
}

/** Para os testes: um `matchMedia` falso novo exige esquecer as listas. */
export function esquecerMediaQueries(): void {
  listas.clear();
  subscricoes.clear();
}

/**
 * Subscreve uma media query. Feito com `useSyncExternalStore` de propósito:
 * é a API que o React 18+ tem para ler algo de fora do React sem correr o risco
 * de mostrar um valor rasgado (metade do ecrã a achar que é telemóvel e a outra
 * metade que não) quando o desenho é interrompido.
 *
 * No SERVIDOR devolve sempre `false` — que é o mesmo que o cliente devolve no
 * primeiro desenho. É essa igualdade que impede o desencontro de hidratação.
 */
function useMedia(mq: string): boolean {
  const getSnapshot = useCallback(() => consulta(mq), [mq]);
  return useSyncExternalStore(subscricaoDe(mq), getSnapshot, () => false);
}

/**
 * Já estamos no browser e as leituras abaixo são a verdade?
 *
 * Enquanto for `false`, quem lê está a ver o valor do SERVIDOR. Um ecrã que
 * troque de estrutura tem de usar isto para não desenhar a versão errada e
 * saltar para a certa à frente de quem está a olhar.
 */
export function useMontado(): boolean {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  return montado;
}

/**
 * A classe de largura actual.
 *
 * NOTA sobre o valor no servidor: sem `window`, as três consultas dão `false` e
 * isto devolve `"telemovel"`. É a escolha deliberada — o layout de telemóvel é
 * o mais simples e o que menos estraga quando aparece por um instante num ecrã
 * grande. O contrário (desenhar uma tabela de desktop e trocá-la por cartões)
 * é muito mais visível.
 */
export function useLargura(): Largura {
  const acimaDeTelemovel = useMedia(`(min-width: ${CORTES.telemovel}px)`);
  const acimaDeDesktop = useMedia(`(min-width: ${CORTES.desktop}px)`);
  const acimaDeLargo = useMedia(`(min-width: ${CORTES.largo}px)`);
  if (acimaDeLargo) return "largo";
  if (acimaDeDesktop) return "desktop";
  if (acimaDeTelemovel) return "tablet";
  return "telemovel";
}

/** As capacidades do aparelho (ver `Capacidade`). */
export function useCapacidade(): Capacidade {
  const hover = useMedia("(hover: hover)");
  const toque = useMedia("(pointer: coarse)");
  return { hover, toque };
}

/** O que um ecrã precisa de saber para escolher a sua forma. */
export interface Adaptativo extends Capacidade {
  largura: Largura;
  /** Atalhos legíveis — `largura === "telemovel"` lê-se mal em JSX. */
  telemovel: boolean;
  tablet: boolean;
  /** Desktop OU largo: "há espaço para densidade". */
  desktop: boolean;
  /** Há espaço para um painel lateral sem apertar o conteúdo. */
  largo: boolean;
  /** As leituras acima já são as do browser (ver `useMontado`). */
  montado: boolean;
}

/**
 * O hook que os ecrãs usam.
 *
 * Contém APENAS informação sobre o aparelho — nenhuma regra de negócio, nenhum
 * estado de dados. É essa separação que permite ter dois layouts sem ter duas
 * versões da lógica: o hook de dados é o mesmo, e só a apresentação diverge.
 */
export function useAdaptativo(): Adaptativo {
  const largura = useLargura();
  const capacidade = useCapacidade();
  const montado = useMontado();
  return {
    ...capacidade,
    largura,
    telemovel: largura === "telemovel",
    tablet: largura === "tablet",
    desktop: largura === "desktop" || largura === "largo",
    largo: largura === "largo",
    montado,
  };
}

/**
 * Uma acção só existe se se puder descobrir.
 *
 * Devolve `true` quando revelar algo ao passar o rato por cima é aceitável — ou
 * seja, quando há hover E o apontador é fino. Em qualquer outro caso a acção
 * tem de estar visível, porque num ecrã táctil "aparece no hover" quer dizer
 * "não existe".
 *
 * É a mesma regra que já estava espalhada por `pointer-coarse:opacity-100` em
 * meia dúzia de sítios; aqui fica com nome e com a razão escrita.
 */
export function usePodeEsconderNoHover(): boolean {
  const { hover, toque } = useCapacidade();
  return hover && !toque;
}

/**
 * JÁ DESCEU O SUFICIENTE PARA O CABEÇALHO ENCOLHER?
 *
 * Num telemóvel de 667 px de altura, o cabeçalho fixo do back office media
 * 102 px e a barra de baixo 56: 158 px de moldura, quase um quarto do ecrã,
 * ocupados para sempre por uma coisa que só se lê uma vez — o nome da vista.
 *
 * A solução não é tirar o cabeçalho (perdia-se o menu e a pesquisa) nem deixá-lo
 * a rolar para fora (perdia-se o acesso a eles a meio de uma lista). É deixá-lo
 * ENCOLHER assim que ela começa a descer: no topo mostra-se por inteiro, e a
 * partir daí fica só a faixa com os botões.
 *
 * ── Notas de implementação ──────────────────────────────────────────────────
 * · `passive: true` — este ouvinte NUNCA chama `preventDefault`, e dizê-lo ao
 *   browser deixa-o continuar a fazer scroll sem esperar pelo JavaScript. Sem
 *   isto, o gesto engasga-se exactamente onde se quer que seja fluido.
 * · Começa em `false` no servidor E no primeiro desenho do browser, e só depois
 *   mede: o HTML dos dois lados tem de ser igual ou há erro de hidratação.
 * · A histerese (encolhe aos 24 px, volta a crescer aos 8) existe porque sem
 *   ela, com o dedo parado em cima do limiar, o cabeçalho piscava entre os dois
 *   tamanhos ao ritmo dos pixéis do scroll.
 */
export function useDesceu(limiar = 24, voltaAos = 8): boolean {
  const [desceu, setDesceu] = useState(false);
  useEffect(() => {
    const ver = () => {
      const y = window.scrollY;
      setDesceu((antes) => (antes ? y > voltaAos : y > limiar));
    };
    ver();
    window.addEventListener("scroll", ver, { passive: true });
    return () => window.removeEventListener("scroll", ver);
  }, [limiar, voltaAos]);
  return desceu;
}

/**
 * TOQUE LONGO — o "botão direito" de quem não tem rato.
 *
 * Num computador, as acções de uma linha vivem num menu que aparece ao passar
 * o rato ou ao carregar com o botão direito. Num telemóvel não há nem uma coisa
 * nem outra — e o Safari do iPhone NÃO dispara `contextmenu` no toque longo.
 * Medido na auditoria do telemóvel (14/11): com os menus só em `onContextMenu`,
 * o toque longo num dia, numa marcação ou numa tarefa fazia o mesmo que um
 * toque curto (abria «Adicionar ao calendário», abria a tarefa).
 *
 * UMA peça para todos, e por isso devolve uma FÁBRICA: um gancho por lista, e
 * `toqueLongo(aoDisparar, aoMenuDoRato)` por alvo — as 42 células do mês não
 * podem chamar um gancho cada uma, e a lista das tarefas delega num contentor
 * só. Só há um dedo a carregar de cada vez, portanto um temporizador chega.
 *
 * O que está aqui e não é óbvio:
 *
 * · **550 ms.** É o que o iOS usa para o menu de contexto. Menos e dispara a
 *   quem só estava a pousar o dedo para rolar; mais e parece que não responde.
 * · **Um dedo a mover-se cancela** (mais de 10 px), **e a página a deslizar
 *   também** — um rolo de um contentor lá dentro não move o dedo em relação ao
 *   ecrã, mas é um gesto de rolar, não de carregar.
 * · **Só com toque a sério.** Com rato, `pointerdown` também dispara, e manter
 *   o botão carregado passaria a abrir um menu em vez de seleccionar texto. O
 *   rato continua a ter o botão direito, que segue para `aoMenuDoRato`.
 * · **Num campo de texto não dispara**: pousar o dedo e não largar é como se
 *   põe o cursor a meio de uma palavra no iOS.
 * · **Depois do toque longo não há clique.** O dedo levanta-se e o browser
 *   manda o `click` do costume — que abria o dia ou a tarefa por baixo do menu
 *   que acabou de abrir. Engole-se UM clique, em captura na janela (o menu vive
 *   num portal, fora do alvo), e a bandeira cai no próximo `pointerdown`.
 * · **O alvo é o primeiro que o reclama.** Uma marcação dentro de um dia: as
 *   duas têm toque longo, e só a de dentro pode abrir o seu menu — é o mesmo
 *   `stopPropagation` que o botão direito já fazia.
 * · **Onde o Android dispara `contextmenu`** ao fim do toque longo, o menu
 *   abre uma vez só: quem chegar primeiro, o temporizador ou o browser, ganha.
 * · **Não substitui nada.** O toque longo é um atalho; a acção tem sempre outro
 *   caminho visível (ver NO-KEYBOARD.md — a mesma regra, outro dispositivo).
 *
 * `aoDisparar` devolve `false` quando o toque não era com ele (a lista das
 * tarefas, num sítio sem tarefa): então não há menu e o clique segue.
 */
export type PontoDoToque = { x: number; y: number };
export type AoToqueLongo = (ponto: PontoDoToque, alvo: HTMLElement) => boolean | void;

/** O desenho de um alvo de toque longo: sem lupa nem selecção de texto no dedo. */
export const SEM_LUPA = "pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]";

const RECLAMADOS = new WeakSet<Event>();

export function useToqueLongo(ms = 550) {
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origem = useRef<PontoDoToque | null>(null);
  const aoRolar = useRef<(() => void) | null>(null);
  const engolirClique = useRef<((e: Event) => void) | null>(null);
  /** Um toque longo disparou e o `contextmenu` que o Android manda a seguir é dele. */
  const disparou = useRef(false);

  const largarRolo = useCallback(() => {
    if (aoRolar.current) window.removeEventListener("scroll", aoRolar.current, true);
    aoRolar.current = null;
  }, []);
  const cancelar = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    origem.current = null;
    largarRolo();
  }, [largarRolo]);
  const largarClique = useCallback(() => {
    if (engolirClique.current) {
      window.removeEventListener("click", engolirClique.current, true);
      window.removeEventListener("pointerdown", engolirClique.current, true);
    }
    engolirClique.current = null;
  }, []);

  useEffect(
    () => () => {
      cancelar();
      largarClique();
    },
    [cancelar, largarClique],
  );

  return useCallback(
    (aoDisparar: AoToqueLongo, aoMenuDoRato?: (e: React.MouseEvent<HTMLElement>) => void) => {
      const disparar = (ponto: PontoDoToque, alvo: HTMLElement) => {
        if (aoDisparar(ponto, alvo) === false) return;
        disparou.current = true;
        largarClique();
        // Um `pointerdown` em QUALQUER sítio também a deita abaixo: o iOS nem
        // sempre manda o clique depois do toque longo, e uma bandeira que
        // ficasse levantada engolia o próximo toque noutro alvo.
        const engolir = (e: Event) => {
          if (e.type === "click") {
            e.preventDefault();
            e.stopPropagation();
          }
          largarClique();
        };
        engolirClique.current = engolir;
        window.addEventListener("click", engolir, true);
        window.addEventListener("pointerdown", engolir, true);
      };
      return {
        onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
          // Um toque novo: o clique que ficou por engolir (o iOS nem sempre o
          // manda) não pode levar este.
          largarClique();
          disparou.current = false;
          if (e.pointerType !== "touch" || RECLAMADOS.has(e.nativeEvent)) return;
          if (
            (e.target as HTMLElement | null)?.closest?.(
              "input, textarea, select, [contenteditable]",
            )
          )
            return;
          RECLAMADOS.add(e.nativeEvent);
          cancelar();
          const ponto = { x: e.clientX, y: e.clientY };
          const alvo = e.target as HTMLElement;
          origem.current = ponto;
          aoRolar.current = cancelar;
          window.addEventListener("scroll", cancelar, { capture: true, passive: true });
          temporizador.current = setTimeout(() => {
            temporizador.current = null;
            origem.current = null;
            largarRolo();
            disparar(ponto, alvo);
          }, ms);
        },
        onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
          const o = origem.current;
          if (!o) return;
          if (Math.abs(e.clientX - o.x) > 10 || Math.abs(e.clientY - o.y) > 10) cancelar();
        },
        onPointerUp: cancelar,
        onPointerCancel: cancelar,
        onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
          // O toque longo já abriu o menu: o do browser (e o nosso outra vez)
          // não abrem por cima.
          if (disparou.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          // O browser chegou primeiro (Android): conta como o toque longo.
          if (origem.current) {
            const ponto = origem.current;
            cancelar();
            e.preventDefault();
            e.stopPropagation();
            disparar(ponto, e.target as HTMLElement);
            return;
          }
          aoMenuDoRato?.(e);
        },
      };
    },
    [cancelar, largarClique, largarRolo, ms],
  );
}
