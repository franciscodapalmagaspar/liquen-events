"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { idUnico } from "@/lib/id-unico";
/* A escala de movimento da casa — ver `ui/movimento.ts`. Aqui só o botão de
   fechar é um estado de interacção; a ENTRADA da caixa tem escala própria,
   logo abaixo, porque não é um estado a mudar — é o sistema a apresentar. */
import { ESTADO, PRESSAO } from "./ui/movimento";
/* E a SAÍDA é vocabulário da casa, não deste ficheiro: a classe `.bo-saida`
   vive no `globals.css` ao lado da `.bo-entrada`, e o hook que segura o nó
   montado enquanto ela corre vive no `ui/saida.ts`. As duas nasceram aqui e
   estão lá fora de propósito — o mesmo buraco existe em todas as folhas e
   diálogos do back office. */
import { SAIDA_FOLHA, SAIDA_MS, semMovimento, useSaidaAdiada } from "./ui/saida";

type ToastKind = "success" | "error" | "info";
/**
 * ── O QUE UM AVISO PODE OFERECER ALÉM DE SE FECHAR ──────────────────────────
 *
 * «Permitir desfazer sempre, rotulando a ação e mostrando o resultado.»
 * [APPLE] Três dos documentos dela pedem a mesma coisa pelo mesmo nome: um
 * «Anular» dentro do aviso — a tarefa concluída, o evento movido, a fotografia
 * removida.
 *
 * Fica opcional e fica SÓ isto: um rótulo e o que fazer. Nem ícone, nem
 * segundo botão, nem cor própria — um aviso com duas acções é um diálogo mal
 * disfarçado, e um diálogo pede-se com o `PerguntaDestrutiva` que já existe.
 *
 * Tocar na acção FECHA o aviso: quem anulou já viu o resultado, e deixar a
 * caixa aberta a oferecer anular uma coisa já anulada é a porta para anular
 * duas vezes.
 */
export interface AccaoDoAviso {
  rotulo: string;
  aoTocar: () => void;
}

interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  accao?: AccaoDoAviso;
}

interface ToastApi {
  toast: (message: string, kind?: ToastKind, accao?: AccaoDoAviso) => void;
}

const ToastContext = createContext<ToastApi>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const TOAST_DURATION = 4000;
/**
 * Um aviso que oferece «Anular» fica DEZ segundos, e não quatro.
 *
 * Palavras dela, a 10/10: «tem que haver no site todo, em tudo aquilo que se
 * faz, uma forma de voltar atrás». Quatro segundos é o tempo de ler a frase —
 * não o de perceber que foi o gesto errado e ir lá carregar. Os «Anular» que
 * cada ecrã tinha feito à mão andavam entre 4, 5, 8 e 10 s; passa a ser um só
 * número, e é este. Continua a parar com o rato ou o foco por cima.
 */
export const TOAST_ANULAR_MS = 10_000;

/**
 * ── QUANTOS AVISOS CABEM NO ECRÃ AO MESMO TEMPO ─────────────────────────────
 *
 * A pilha cresce para cima a partir do canto de baixo à direita e não tinha
 * tecto nenhum. Uma gravação em lote que falha em doze linhas dá doze caixas de
 * ~64 px — 768 px, mais alto do que o ecrã de um telemóvel. Nessa altura o
 * aviso deixou de avisar: tapou a página inteira, incluindo o trabalho a que se
 * refere, e as primeiras caixas nem sequer se vêem porque saem por cima.
 *
 * Quatro é o que cabe folgadamente em 375 px de altura útil. Quando chega mais
 * um, sai o MAIS VELHO: o recente é o que ainda diz respeito ao que se acabou
 * de carregar, e o velho já teve os seus segundos.
 */
const MAX_TOASTS = 4;

/**
 * ── A ENTRADA DE UM AVISO: 240 ms, E A CURVA DE QUEM APRESENTA ──────────────
 *
 * Estava `transition-all duration-300`, sem `motion-safe:`. Três desvios num
 * sítio só, e nenhum deles escolhido:
 *
 *  1. **300 ms.** A casa fixou 240 para tudo o que APARECE por cima da página
 *     — é o número da `.bo-entrada` e da `.view-in` do `globals.css`, e é o que
 *     os outros nove sítios do back office que se apresentam já usam. Trezentos
 *     não era um degrau: era um número solto a discordar dos vizinhos em
 *     silêncio, num aviso que nasce ao lado deles.
 *
 *  2. **A curva.** Sem `ease-*`, uma `transition-*` desta casa sai com o
 *     `--default-transition-timing-function`, que é a curva de ASSINATURA
 *     (`cubic-bezier(0.16, 1, 0.3, 1)`). Essa é para o que o utilizador
 *     provoca. Um aviso não é provocado — chega quando o sistema tem alguma
 *     coisa a dizer —, e o que o sistema apresenta entra na curva que SÓ
 *     DESACELERA, `cubic-bezier(0, 0, 0.2, 1)`. É a mesma da `.bo-entrada`, e
 *     o `duracoes-da-casa.test.ts` prende este literal ao do `globals.css`
 *     para as duas pontas não poderem afinar-se sozinhas.
 *
 *  3. **`transition-all`, e sem `motion-safe:`.** O `all` obriga o browser a
 *     considerar `width`, `height` e `margin` em cada fotograma — layout, no
 *     elemento que aparece precisamente quando alguma coisa já correu mal. A
 *     lista aqui é fechada: `opacity` e `translate` (no Tailwind v4 o
 *     `translate-y-2` emite a propriedade AUTÓNOMA `translate`, não
 *     `transform` — compilado para confirmar), as duas compostas na GPU. E o
 *     `motion-safe:` porque o `globals.css` não tem rede global nenhuma: só
 *     desliga transições dentro de `prefers-reduced-motion` em três sítios
 *     concretos, e este não é nenhum deles.
 *
 * ── PORQUE É QUE NÃO É A CLASSE `.bo-entrada` ───────────────────────────────
 *
 * Seria o caminho mais curto — traz o número, a curva e a guarda de movimento
 * reduzido de graça. Mas a `.bo-entrada` é uma ANIMAÇÃO à montagem, e o
 * `entrada-do-que-aparece.test.ts` (que não é meu) prende, letra por letra, o
 * gesto que este aviso faz hoje: `"opacity-0 translate-y-2"`. Trocá-lo por
 * `.bo-entrada` punha esse teste vermelho num ficheiro que não me cabe
 * corrigir. Fica igual em tudo o que se vê — os mesmos 8 px, os mesmos 240 ms,
 * a mesma curva —, e a mudança da mecânica fica para quem for dono do teste.
 */
const ENTRADA_DO_AVISO =
  "motion-safe:transition-[opacity,translate] " +
  "motion-safe:duration-[240ms] " +
  "motion-safe:ease-[cubic-bezier(0,0,0.2,1)]";

/** A curva de quem apresenta, escrita como o CSS a quer (ver o ponto 2 acima). */
const CURVA_QUE_APRESENTA = "cubic-bezier(0, 0, 0.2, 1)";

/**
 * ── O QUE UM NÓ TEM A MAIS DO QUE A SUA POSIÇÃO DE LAYOUT ───────────────────
 *
 * O `getBoundingClientRect` devolve o sítio onde o nó está DESENHADO, ou seja
 * já com tudo o que estiver a animar por cima dele somado. Para o FLIP isso não
 * serve: o que ele precisa de comparar entre dois fotogramas é onde o nó
 * ASSENTA — senão um aviso medido a meio de um gesto entra no cálculo seguinte
 * com a posição errada, e o deslize sai a compensar um movimento que já estava
 * a acontecer.
 *
 * São DUAS propriedades e não uma, e é uma armadilha do Tailwind 4: o
 * `translate-y-2` da entrada emite a propriedade AUTÓNOMA `translate`, que não
 * é o `transform` que este ficheiro escreve à mão no deslize. As duas somam-se
 * no que se vê, portanto as duas têm de ser lidas.
 *
 * Em jsdom não há disposição nenhuma e o `getComputedStyle` devolve vazio —
 * isto dá zero, e o FLIP inteiro fica a somar zeros, que é o que lá se quer.
 */
function deslocamentoY(el: HTMLElement): { entrada: number; deslize: number; total: number } {
  if (typeof getComputedStyle !== "function") return { entrada: 0, deslize: 0, total: 0 };
  const estilo = getComputedStyle(el);
  let entrada = 0;
  const daEntrada = estilo.translate;
  if (daEntrada && daEntrada !== "none") {
    const partes = daEntrada.trim().split(/\s+/);
    if (partes.length > 1) entrada = Number.parseFloat(partes[1]) || 0;
  }
  let deslize = 0;
  const doDeslize = estilo.transform;
  if (doDeslize && doDeslize !== "none" && typeof DOMMatrixReadOnly === "function") {
    try {
      deslize = new DOMMatrixReadOnly(doDeslize).m42;
    } catch {
      /* uma matriz que o browser não saiba ler não vale um erro aqui */
    }
  }
  return { entrada, deslize, total: entrada + deslize };
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * A SAÍDA DE UM AVISO — porque é que ela não podia ser feita da maneira óbvia
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Até aqui o aviso ENTRAVA com animação e SAÍA num fotograma: desaparecia do
 * array e os que ficavam mudavam de sítio de repente. Estava escrito como
 * dívida, com duas razões concretas, e são estas duas que este ficheiro
 * responde. O QUE é a saída — 200 ms, `--ease-in`, 8 px, e o `pointer-events`
 * largado dentro da própria classe — está na `.bo-saida` do `globals.css`;
 * COMO se segura um nó montado enquanto ela corre está no `ui/saida.ts`. Aqui
 * fica só o que é desta pilha e de mais nenhum sítio.
 *
 * ── 1. O ESPAÇO TEM DE ENCOLHER, E ENCOLHER NÃO PODE SER LAYOUT ─────────────
 *
 * Desvanecer o aviso em `opacity` não corrige o salto — adia-o 200 ms. Para os
 * que ficam DESLIZAREM em vez de saltarem, o espaço do que sai tem de fechar-se
 * ao longo dos mesmos 200 ms. As três maneiras de o fazer foram MEDIDAS, num
 * Chromium, com o `Performance.getMetrics` do próprio browser (contador
 * `LayoutCount`), sobre uma página com 1500 linhas em fluxo e a pilha de quatro
 * avisos por cima — o instrumento está em `e2e/saida-do-aviso.mjs` e volta a
 * correr com `node e2e/saida-do-aviso.mjs`:
 *
 *     A · transicionar `height`               ~19 layouts   ~1,4 ms de layout
 *     B · `grid-template-rows: 1fr → 0fr`     ~19 layouts   ~1,4 ms de layout
 *     C · só `transform` nos irmãos            ~4 layouts   ~0,3 ms de layout
 *
 * A conclusão desmente a suposição com que este trabalho começou: o truque do
 * `grid-template-rows` NÃO é mais barato do que a altura. É o MESMO custo —
 * dezanove recálculos de layout, um por fotograma da transição, contra os
 * quatro de C (que são as medições feitas à mão, uma vez, e não por fotograma).
 * O browser interpola o tamanho da faixa e volta a dispor a grelha e tudo o que
 * ela contém, exactamente como faria com a altura. A diferença que se lhe
 * costuma atribuir é outra coisa: o custo fica CONFINADO porque a pilha é
 * `position: fixed` e portanto fora de fluxo — e esse confinamento vale
 * igualmente para a altura, ou seja não é argumento para escolher entre as
 * duas.
 *
 * Fica portanto C, que é a única que cumpre a regra da casa à letra: **só
 * `transform` e `opacity`**. Funciona assim, e é um FLIP clássico:
 *
 *   · o aviso que sai passa a `position: absolute` no sítio exacto onde já
 *     estava — sai do FLUXO num fotograma, sem se mexer um pixel à vista;
 *   · nesse mesmo fotograma, antes de o browser pintar, mede-se de quanto é que
 *     cada um dos que ficam se deslocou, e dá-se-lhes um `transform` que os
 *     põe de volta onde estavam (o passo «inverter»);
 *   · no fotograma seguinte tira-se-lhes o `transform` com transição de 200 ms:
 *     deslizam para o lugar novo em vez de saltarem.
 *
 * São DUAS medições por saída — uma antes e uma depois de tirar do fluxo —, não
 * uma por fotograma. É essa a diferença que interessa.
 *
 * Porque é que se mede em vez de calcular «altura da caixa + gap»: a pilha são
 * duas regiões (`role="alert"` e `role="status"`) com `gap` entre elas e dentro
 * delas, e o aviso que sai pode ser o último da sua região — casos em que a
 * conta dá o número errado. Medir dá o certo em todos, e é código a menos.
 *
 * E a curva do deslize é a de quem APRESENTA (`cubic-bezier(0, 0, 0.2, 1)`) e
 * não a `--ease-in` da caixa que sai: quem desliza não se vai embora — chega ao
 * lugar novo e assenta lá.
 *
 * ── 2. OS `POINTER-EVENTS` LARGAM-SE NO PRIMEIRO FOTOGRAMA ──────────────────
 *
 * Esta pilha pousa em cima da barra de acção do estúdio de propostas (ver o
 * comentário do `bottom-[calc(…)]` mais abaixo). Um aviso a desvanecer-se por
 * cima do botão «Gerar e enviar» continua a ser o alvo do toque enquanto lá
 * estiver: o utilizador carrega, e não acontece nada — durante 200 ms, e sem
 * nenhum sinal de porquê. É a razão pela qual sair de repente era, até aqui,
 * mais seguro do que sair bonito.
 *
 * Por isso o `pointer-events-none` não é aplicado quando a animação acaba, nem
 * num `setTimeout`, nem num `requestAnimationFrame`: entra no MESMO commit do
 * React que marca o aviso como «a sair», ou seja antes de o browser pintar o
 * primeiro fotograma da saída. E vem duas vezes, de propósito — pela classe
 * `.bo-saida` (que o traz para toda a casa) e pelo utilitário do Tailwind aqui
 * no sítio, que é o que fica de pé se alguém um dia trocar a classe. O
 * `Toast.saida.test.tsx` tem um teste só para isto.
 *
 * ── 3. E A ENTRADA É O MESMO FLIP, AO CONTRÁRIO ─────────────────────────────
 *
 * A saída ficou tratada e a ENTRADA continuou a empurrar. MEDIDO, com o
 * `e2e/60-fotogramas-no-telemovel.mjs`: um aviso que já lá estava mexia-se
 * **53,25 px num único fotograma** quando o seguinte entrava — enquanto o que
 * entra percorre 8 px em 240 ms, no máximo 3,4 px por fotograma. Dezassete
 * vezes mais depressa não é um gesto: é um salto. E havia um segundo, de
 * 53,9 px, quando um aviso saía ENQUANTO outro entrava.
 *
 * As duas metades são a mesma coisa: a pilha está encostada ao FUNDO, portanto
 * o que muda o seu conteúdo empurra para cima ou puxa para baixo tudo o que lá
 * está. Um aviso a chegar é o mesmo acontecimento de um aviso a sair, com o
 * sinal trocado — e por isso não há aqui um segundo mecanismo: há o mesmo FLIP,
 * a correr para os dois casos, no mesmo efeito.
 *
 * O que a saída tinha e não chegava era o **«antes»**. Ele era medido DENTRO do
 * efeito, e isso só está certo quando a saída é a única coisa a acontecer: num
 * commit em que um aviso chega e outro se vai embora, quando o efeito corre o
 * recém-chegado já empurrou toda a gente, e o «antes» medido ali já é o depois
 * — era exactamente esse o salto de 53,9 px. Agora o «antes» é o que ficou
 * GUARDADO do commit anterior (`pousada`), que é o único sítio onde ele existe.
 *
 * E guarda-se medido a partir do CHÃO da pilha, não do topo do ecrã. A pilha
 * levanta-se e baixa-se sozinha quando o estúdio publica outra
 * `--bo-barra-accao`; com coordenadas de ecrã, esse movimento — que leva a
 * pilha inteira de uma vez e não desarruma nada — entrava no FLIP como um
 * desvio e os avisos deslizavam por causa de uma barra a mudar de altura. O
 * chão é `bottom`, que é fixo por construção (`position: fixed` com `bottom:`
 * escrito e `top: auto`): só se mexe quando a barra se mexe, e é por isso que
 * medir a partir dele apaga esse falso desvio e deixa passar o verdadeiro.
 *
 * ── E ISTO FOI MEDIDO DEPOIS, NUM BROWSER ──────────────────────────────────
 *
 * O instrumento é o `e2e/a-entrada-nao-empurra.mjs`: segue um aviso, fotograma
 * a fotograma, enquanto o seguinte chega. Nesta geometria a caixa mais o `gap`
 * dão 78 px, e o mesmo percurso lê-se assim:
 *
 *     sem o FLIP na entrada    78 px em  1 fotograma   (100 % num só)
 *     com o FLIP na entrada    78 px em 11 fotogramas  (26 % no maior)
 *
 * E o mesmo com um aviso a chegar 90 ms depois de outro começar a sair — o
 * segundo salto do enunciado —, que passou de 78 px num fotograma para os
 * mesmos 11. Esse caso precisou de mais do que o «antes» guardado: precisou de
 * contar o deslize que ainda ia A MEIO (ver `aMeio`, lá em baixo).
 */

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pilhaRef = useRef<HTMLDivElement | null>(null);
  /** O nó de cada aviso montado, para o FLIP os poder medir e deslocar. */
  const nos = useRef(new Map<string, HTMLDivElement>());
  /** Saídas cujo nó já foi tirado do fluxo — o efeito de layout é reentrante. */
  const jaDeslizados = useRef(new Set<string>());
  /**
   * ONDE É QUE CADA AVISO ASSENTOU NO COMMIT ANTERIOR — o «antes» do FLIP.
   *
   * `chao` é o `bottom` da pilha; cada item guarda a que ALTURA desse chão
   * assentava. Ver o ponto 3 do bloco acima para o porquê das duas escolhas.
   */
  const pousada = useRef<{ chao: number; itens: Map<string, number> }>({
    chao: 0,
    itens: new Map(),
  });
  /**
   * Os deslizes a correr, e o bilhete de cada um. O bilhete existe porque um
   * aviso pode ser apanhado por um segundo deslize antes de o primeiro acabar
   * (três chegadas seguidas dão isso): sem ele, a arrumação do primeiro
   * apagava o `transform` do segundo a meio.
   */
  const deslizes = useRef(new WeakMap<HTMLDivElement, number>());
  const bilhetes = useRef(0);

  /** Tira o aviso do array de vez. Chamado pelo hook quando a saída acaba. */
  const arrumar = useCallback((id: string) => {
    jaDeslizados.current.delete(id);
    setToasts((prev) => (prev.some((t) => t.id === id) ? prev.filter((t) => t.id !== id) : prev));
  }, []);

  /**
   * `comecarSaida` NÃO remove o aviso: um aviso que sai do array desaparece
   * antes de poder animar seja o que for, e era isso que fazia a saída seca. O
   * que ele faz é marcá-lo — e é essa marca que, no mesmo commit, lhe tira os
   * `pointer-events` e lhe põe o gesto de saída.
   */
  const { aSair, comecarSaida, podar } = useSaidaAdiada(arrumar);

  // The auto-dismiss timer now lives in each ToastItem so it can be paused on
  // hover/focus — the provider just enqueues.
  const toast = useCallback((message: string, kind: ToastKind = "info", accao?: AccaoDoAviso) => {
    const id = idUnico();
    setToasts((prev) => [...prev, { id, kind, message, accao }].slice(-MAX_TOASTS));
  }, []);

  /**
   * Onde é que cada aviso ASSENTA agora — a altura a que está acima do chão da
   * pilha, sem o que estiver a animar por cima dele. É o que fica guardado de
   * um commit para o seguinte e serve de «antes» ao FLIP.
   */
  const medirPousada = useCallback(() => {
    const pilha = pilhaRef.current;
    const chao = pilha ? pilha.getBoundingClientRect().bottom : 0;
    const itens = new Map<string, number>();
    for (const [id, el] of nos.current) {
      if (!el.isConnected) continue;
      itens.set(id, chao - (el.getBoundingClientRect().top - deslocamentoY(el).total));
    }
    return { chao, itens };
  }, []);

  /**
   * PLAY — larga o aviso para o lugar novo e, quando lá chegar, apaga o que o
   * FLIP lhe escreveu. A arrumação é de cada deslize e não de um efeito por
   * cima de todos: um `transform` apagado a meio é um salto, e o caso REAL em
   * que isso acontecia é o do enunciado — um aviso a chegar enquanto outro se
   * vai embora. O relógio é a rede para o `transitionend` que não chega (uma
   * transição que o browser decida não correr não avisa ninguém).
   */
  const largar = useCallback((el: HTMLDivElement, bilhete: number) => {
    el.style.transition = `transform ${SAIDA_MS}ms ${CURVA_QUE_APRESENTA}`;
    el.style.transform = "translateY(0px)";
    const arrumarDeslize = () => {
      if (deslizes.current.get(el) !== bilhete) return; // já há outro a mandar
      deslizes.current.delete(el);
      el.removeEventListener("transitionend", noFim);
      clearTimeout(relogio);
      el.style.transition = "";
      el.style.transform = "";
    };
    const noFim = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === "transform") arrumarDeslize();
    };
    el.addEventListener("transitionend", noFim);
    const relogio = setTimeout(arrumarDeslize, SAIDA_MS + 60);
  }, []);

  /**
   * O FLIP, e é UM SÓ para a entrada e para a saída. Corre num efeito de
   * LAYOUT — antes de o browser pintar —, senão o salto que isto existe para
   * esconder aparecia um fotograma antes de ser corrigido, que é precisamente
   * o defeito. Ver o ponto 3 do bloco grande lá em cima.
   */
  useLayoutEffect(() => {
    const pilha = pilhaRef.current;
    if (!pilha) return;
    const antes = pousada.current;

    // ── FIRST está GUARDADO, não se mede aqui ────────────────────────────
    // Medir o «antes» dentro deste efeito era o defeito: neste instante o
    // aviso que chegou já empurrou toda a gente. O «antes» é o `pousada` do
    // commit anterior, lá em cima.

    // 1 · SAÍDA — quem sai passa a `absolute` no sítio onde ELA o viu.
    for (const id of aSair) {
      if (jaDeslizados.current.has(id)) continue;
      const noQueSai = nos.current.get(id);
      const grupo = noQueSai?.parentElement;
      if (!noQueSai || !grupo) continue;
      jaDeslizados.current.add(id);

      // A largura da pilha é a do aviso mais largo, e a caixa está encostada à
      // direita. Se quem sai for o mais largo, tirá-lo do fluxo encolhe a pilha
      // e leva os que ficam com ela, para o lado. Fixa-se a largura durante a
      // saída; volta ao normal quando a pilha ficar sem ninguém a sair.
      pilha.style.minWidth = `${pilha.getBoundingClientRect().width}px`;

      // Fora do fluxo, no sítio exacto onde já estava. O grupo é `relative`,
      // portanto o `top` é medido a partir dele.
      //
      // E MEDE-SE O GRUPO DEPOIS, NÃO ANTES. Esta ordem custou uma medição a
      // descobrir e é a armadilha toda deste bloco: ao sair do fluxo, o aviso
      // deixa de contar para a altura do grupo — e como a pilha está encostada
      // ao FUNDO, o grupo encolhe pelo topo e desce. Um `top` calculado com a
      // caixa antiga do grupo punha o fantasma 42 a 50 px abaixo de onde
      // estava, ou seja o aviso SALTAVA no primeiro fotograma da saída, que é
      // exactamente o defeito que isto existe para corrigir. Medido nos quatro
      // arranjos possíveis da pilha (ver `e2e/saida-do-aviso.mjs`); com o grupo
      // medido depois, o salto é zero nos quatro.
      const caixa = noQueSai.getBoundingClientRect();
      // A altura guardada, e não a caixa de agora: se um aviso chegou no mesmo
      // commit, a caixa de agora já está empurrada para cima — e pregá-lo aí
      // era o salto de 53,9 px do enunciado, agora do lado de quem sai.
      const guardado = antes.itens.get(id);
      const topoAntigo =
        guardado === undefined
          ? caixa.top - deslocamentoY(noQueSai).total
          : pilha.getBoundingClientRect().bottom - guardado;
      noQueSai.style.position = "absolute";
      noQueSai.style.right = "0px";
      noQueSai.style.width = `${caixa.width}px`;
      const caixaGrupo = grupo.getBoundingClientRect();
      noQueSai.style.top = `${topoAntigo - caixaGrupo.top}px`;
    }

    // 2 · LAST — onde é que tudo passou a assentar, já com quem sai fora do
    //     fluxo e com quem chegou no lugar. E guarda-se, que é o «antes» do
    //     commit seguinte. Guarda-se SEMPRE, mesmo sem movimento nenhum: quem
    //     pediu menos movimento continua a precisar de contas certas no dia em
    //     que voltar a ligá-lo.
    const depois = medirPousada();
    pousada.current = depois;

    // A guarda de movimento reduzido é aqui, em JavaScript, e não só no CSS:
    // sem ela o `transform` era escrito na mesma e ficava pendurado à espera de
    // uma transição que a media query desligou.
    if (semMovimento()) return;

    // 3 · INVERT — de volta ao sítio antigo, sem transição nenhuma.
    //     Quem já está a sair está pregado ao sítio onde morreu: deslocá-lo
    //     seria mexer num fantasma.
    const paradas = new Set(aSair);
    const ficam: [string, HTMLDivElement][] = [...nos.current.entries()].filter(
      ([id, el]) => !paradas.has(id) && el.isConnected,
    );
    /**
     * O DESLIZE QUE AINDA VAI A MEIO — a peça que o cenário B do
     * `e2e/a-entrada-nao-empurra.mjs` apanhou, e que faltava.
     *
     * MEDIDO: um aviso a chegar 90 ms depois de outro começar a sair dava
     * **78 px num único fotograma** — o salto inteiro, com o FLIP a correr. A
     * razão: um FLIP devolve o nó à posição em que ELA O VIU, e um nó a meio de
     * um deslize NÃO está na sua posição de layout — está nela mais o
     * `transform` que ainda falta andar. Escrever o desvio novo por cima
     * deitava fora esse resto de uma vez.
     *
     * Lê-se AQUI, antes de qualquer escrita, e é só a parte do `transform`: a
     * `translate` da entrada é outra animação, que continua por sua conta e não
     * pode ser contada duas vezes.
     */
    const aMeio = new Map<string, number>();
    for (const [id, el] of ficam) aMeio.set(id, deslocamentoY(el).deslize);

    const deslocados: { el: HTMLDivElement; bilhete: number }[] = [];
    for (const [id, el] of ficam) {
      const alturaAntes = antes.itens.get(id);
      const alturaDepois = depois.itens.get(id);
      // Um aviso que acabou de nascer não tem «antes»: entra pela sua própria
      // entrada (240 ms, 8 px) e não é assunto do FLIP.
      if (alturaAntes === undefined || alturaDepois === undefined) continue;
      // As alturas contam-se a partir do chão, portanto crescem para CIMA e o
      // ecrã conta para baixo: o desvio que devolve o nó ao sítio antigo é a
      // diferença das alturas, e o sinal vem trocado de graça. Mais o que
      // faltava andar do deslize anterior, se houver um a meio.
      const desvio = alturaDepois - alturaAntes + (aMeio.get(id) ?? 0);
      if (Math.abs(desvio) < 0.5) continue;
      const bilhete = ++bilhetes.current;
      deslizes.current.set(el, bilhete);
      el.style.transition = "none";
      el.style.transform = `translateY(${desvio}px)`;
      deslocados.push({ el, bilhete });
    }

    if (deslocados.length === 0) return;
    // Obriga o browser a assentar o `transform` acima ANTES de o fotograma
    // seguinte lhe mexer: sem esta leitura as duas escritas juntavam-se numa
    // só e não havia transição nenhuma para animar.
    void pilha.offsetHeight;

    // PLAY — e daí para o lugar novo, nos mesmos 200 ms do desvanecimento.
    // Dois `requestAnimationFrame` porque o primeiro pode ainda cair no
    // fotograma que já está a ser preparado, e aí o «inverter» e o «largar»
    // aconteciam no mesmo — ou seja, não se via nada.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const { el, bilhete } of deslocados) largar(el, bilhete);
      });
    });
  }, [toasts, aSair, medirPousada, largar]);

  /**
   * A rede: quando não há ninguém a sair, apaga-se o que o FLIP tenha deixado
   * escrito. Não é arrumação por gosto — um `transform` que fica pendurado num
   * elemento cria um containing block, e é assim que um `position: fixed` lá
   * dentro deixa de ser fixo.
   *
   * ── E SALTA O QUE ESTÁ A DESLIZAR, QUE É O CASO NOVO ────────────────────
   * Isto apagava tudo, e passou a poder apagar de mais: com o FLIP a correr
   * TAMBÉM na entrada, há deslizes vivos em commits em que ninguém está a
   * sair. O caso concreto é o do enunciado — um aviso chega enquanto outro se
   * vai embora: 200 ms depois a saída acaba, o `aSair` esvazia-se, este efeito
   * corria e cortava as pernas ao deslize da entrada, que ainda ia a meio.
   * Cada deslize arruma-se a si próprio no fim (ver `largar`); aqui só se
   * apaga o que não tem dono.
   */
  useLayoutEffect(() => {
    if (aSair.length > 0) return;
    for (const el of nos.current.values()) {
      if (deslizes.current.has(el)) continue;
      el.style.transition = "";
      el.style.transform = "";
    }
    if (pilhaRef.current) pilhaRef.current.style.minWidth = "";
  }, [aSair]);

  /* ── A PILHA DECLARA-SE ACIMA DOS MODAIS, E ISSO CHEGA ────────────────────
     Aqui esteve uma defesa por `MutationObserver`: a pilha vigiava-se a si
     própria e apagava o `inert` sempre que a armadilha de foco lho punha. Era
     uma pilha a discutir com um armadilhador, e não um acordo — dois
     mecanismos para a mesma coisa, com o segundo a correr para sempre.

     A raiz está corrigida no `useFocusTrap`: quem tem `data-acima-dos-modais`
     não se inertiza. O atributo está no `<div>` da pilha, aqui em baixo. */

  /**
   * Um aviso a sair pode ser deitado fora pelo tecto do `MAX_TOASTS` antes de a
   * saída acabar. Sem esta poda ficava um nome preso na lista do hook para
   * sempre — e com ele a pilha com a largura fixa e os irmãos com `transform`
   * colado.
   */
  useLayoutEffect(() => {
    podar(toasts.map((t) => t.id));
  }, [toasts, podar]);

  const registar = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) nos.current.set(id, el);
    else nos.current.delete(id);
  }, []);

  // Errors go to an assertive `role="alert"` region so they interrupt and are
  // never missed; success/info stay in a polite `role="status"` region. Both
  // sit in one visual stack (bottom-right) so ordering still reads naturally.
  const errorToasts = toasts.filter((t) => t.kind === "error");
  const politeToasts = toasts.filter((t) => t.kind !== "error");

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* ── O AVISO NÃO PODE POUSAR EM CIMA DA NAVEGAÇÃO ──────────────────
          MEDIDO a 375×667: com `bottom-6` (24 px) a caixa do aviso acabava aos
          635 px e a barra de baixo do telemóvel começa aos 610 — 25 px de
          sobreposição, opaco sobre opaco, mesmo por cima dos ícones de «Visão
          Geral» e «Pedidos» (que ficam nos primeiros ~20 px da barra). E é o
          pior momento possível para tapar a navegação: o aviso aparece quando
          alguma coisa falhou, que é quando ela quer sair dali.

          A conta é a mesma que o `<main>` já faz para não esconder a última
          linha da lista: a altura da barra, mais o entalhe, mais um respiro.
          Acima de `lg` não há barra nenhuma e volta aos 24 px de sempre.

          ── E A ALTURA VEM DO TOKEN, não de um «56px» escrito aqui ──────────
          Estava escrito. Era a TERCEIRA cópia do mesmo número (o `<main>` tinha
          as outras duas), e foi a que sobrou quando a barra cresceu para 72 px
          ao levantar os rótulos de 8 px para o chão de 12: o aviso passou a
          acabar aos 603 px com a barra a começar aos 594, ou seja a pousar-lhe
          em cima — exactamente o defeito que este comentário diz ter corrigido.
          Quem o apanhou foi o passeio `admin-mobile.spec.ts`, não os olhos.
          Com `var(--bo-barra-inferior)` deixa de haver número para discordar.

          ── E HÁ UM ECRÃ COM UMA SEGUNDA BARRA POR CIMA DESSA ──────────────
          O estúdio de propostas põe a sua acção principal («Pré-visualizar»,
          «Gerar e enviar») numa barra que pousa em cima da navegação, com uns
          64 px de altura. O aviso levantava-se 12 px do chão e nascia DENTRO
          dessa faixa — em cima do botão, a apanhar-lhe o toque durante os 4 s
          em que fica no ecrã. Medido a 375 px.
          `--bo-barra-accao` é a altura MEDIDA dessa barra, publicada pelo
          próprio estúdio enquanto está aberto (e ausente — logo, zero — em
          todo o resto do back office, que não tem barra nenhuma ali). O aviso
          soma-a e passa a pousar-lhe em cima, à vista, sem tapar nada. Acima
          de `lg` a navegação do telemóvel desaparece mas a barra do estúdio
          fica, encostada ao fundo: por isso o `lg:` também a soma. */}
      {/* ── E NÃO SAI PELA MARGEM DA ESQUERDA (auditoria de 14/11, n.º 14) ──
          Só com `right-6`, um aviso de 384 px (`max-w-sm`) num ecrã de 390
          começava no x = 0: colado ao bordo, sem a margem de 16 px que todo o
          resto do ecrã tem. Com `left-4` a pilha tem os dois lados, e o
          `items-end` mantém cada aviso encostado à direita e do tamanho do
          texto — num ecrã largo nada muda. */}
      <div
        ref={pilhaRef}
        data-acima-dos-modais=""
        className="fixed bottom-[calc(var(--bo-barra-inferior)+var(--bo-barra-accao,0px)+env(safe-area-inset-bottom)+0.75rem)] left-4 right-4 sm:right-6 z-[80] flex flex-col items-end gap-2 pointer-events-none"
      >
        {/* `relative` porque o aviso que sai passa a `absolute` DENTRO da sua
            região, no sítio exacto onde estava (ver o FLIP acima). Sem isto o
            sítio seria medido a partir de outra caixa e o aviso mudava de lugar
            no primeiro fotograma da saída, que é o oposto do que se quer. */}
        <div role="alert" aria-live="assertive" className="relative flex flex-col gap-2">
          {errorToasts.map((t) => (
            <ToastItem
              key={t.id}
              toast={t}
              aSair={aSair.includes(t.id)}
              aoFechar={() => comecarSaida(t.id)}
              registar={registar}
            />
          ))}
        </div>
        <div role="status" aria-live="polite" className="relative flex flex-col gap-2">
          {politeToasts.map((t) => (
            <ToastItem
              key={t.id}
              toast={t}
              aSair={aSair.includes(t.id)}
              aoFechar={() => comecarSaida(t.id)}
              registar={registar}
            />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

const DOT: Record<ToastKind, string> = {
  success: "#7c854b",
  error: "#8a2a22",
  info: "#8a8a82",
};

function ToastItem({
  toast,
  aSair,
  aoFechar,
  registar,
}: {
  toast: Toast;
  aSair: boolean;
  aoFechar: () => void;
  registar: (id: string, el: HTMLDivElement | null) => void;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /**
   * ── UM ERRO NÃO SE DISPENSA SOZINHO ────────────────────────────────────────
   *
   * O relógio dos 4 s era armado para TODOS os avisos, incluindo os de erro.
   * Isso quer dizer que a única notícia de que uma gravação, um envio ou um
   * carregamento falhou aparecia e ia-se embora ao fim de quatro segundos —
   * sem gesto nenhum de quem estava a trabalhar, e sem sítio nenhum onde a
   * voltar a ler. Quem estivesse a olhar para outro separador do ecrã, a
   * escrever num campo, ou simplesmente a ler mais devagar do que quatro
   * segundos, perdia-a por completo e ficava a achar que tinha corrido bem.
   *
   * A norma diz o mesmo (WCAG 2.2.1): conteúdo que desaparece por si tem de
   * poder ser dispensado por quem o lê. Um sucesso pode ir-se — a página por
   * baixo já mostra o resultado —, um erro não: só sai pelo «Fechar».
   *
   * A pausa por `hover`/`focus` continua a existir para os avisos que ainda
   * contam o tempo; para um erro não há tempo nenhum a contar, e por isso o
   * `resume()` também tem de o respeitar — senão bastava um `mouseleave` para
   * o erro voltar a armar o relógio que este bloco lhe tirou.
   */
  const seDispensaSozinho = toast.kind !== "error";

  // Auto-dismiss after TOAST_DURATION, but pause the countdown while the toast is
  // hovered or focused (and resume from where it left off on leave/blur) so a
  // reader is never rushed off a message they're still engaging with.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(toast.accao ? TOAST_ANULAR_MS : TOAST_DURATION);
  const startedRef = useRef(0);
  const onCloseRef = useRef(aoFechar);
  // Keep the ref current without touching it during render (refs are write-only
  // outside render/effects); this lets the mount-only timer always call the
  // latest onClose without re-arming on every parent re-render.
  useEffect(() => {
    onCloseRef.current = aoFechar;
  });

  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const resume = () => {
    clear();
    if (!seDispensaSozinho) return;
    startedRef.current = Date.now();
    timerRef.current = setTimeout(() => onCloseRef.current(), remainingRef.current);
  };
  const pause = () => {
    if (!timerRef.current) return;
    clear();
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedRef.current));
  };

  useEffect(() => {
    if (!seDispensaSozinho) return;
    startedRef.current = Date.now();
    timerRef.current = setTimeout(() => onCloseRef.current(), remainingRef.current);
    return clear;
    // Corre uma vez por aviso; o `onClose` é lido por `ref`, logo não é
    // dependência. O `seDispensaSozinho` é constante para um dado aviso (o
    // `kind` nunca muda depois de criado), portanto declará-lo não faz o
    // relógio rearmar-se — só satisfaz a regra das dependências.
  }, [seDispensaSozinho]);

  // Já a sair: o relógio não tem mais nada a fazer, e um aviso fora de fluxo
  // não deve poder recomeçar a contagem por um `mouseleave` de despedida.
  useEffect(() => {
    if (aSair) clear();
  }, [aSair]);

  return (
    <div
      ref={(el) => registar(toast.id, el)}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      /* ── E O AVISO QUE SAI SAI TAMBÉM DA ÁRVORE E DO FIO DO TECLADO ──────
         O mesmo defeito dos `pointer-events`, dito aos outros dois públicos —
         e MEDIDO, com o aviso a apagar-se: o `getByRole("button", { name:
         "Fechar" })` ainda o encontrava, a mensagem continuava dentro da
         região `role="alert"` (um leitor de ecrã podia anunciar um aviso que
         já se foi), e o foco ficava no «×» a desaparecer até cair no `<body>`
         200 ms depois — quem anda de Tab perdia o sítio sem nada lhe dizer.

         `aria-hidden` tira-o da árvore; `inert` tira-o do fio do teclado. São
         os dois e não um: o `aria-hidden` não tira do Tab e o `inert` não é
         igualmente forte em todo o lado. E chegam no MESMO commit do gesto,
         pela mesma razão que os `pointer-events` — ver o ponto 2 do bloco
         grande lá em cima. É o que o `FolhaOuDialogo` já faz, e o que a
         varredura `a-saida-sai-da-arvore.test.ts` passou a exigir. */
      aria-hidden={aSair || undefined}
      inert={aSair}
      /* ── O `pointer-events` LARGA-SE AQUI, E É POR ISSO QUE É UMA CLASSE ──
         `aSair` chega a este componente no mesmo commit do React em que a saída
         começa, portanto o `pointer-events-none` está aplicado antes de o
         browser pintar o primeiro fotograma. Se isto fosse feito num
         `setTimeout`, num `requestAnimationFrame` ou no fim da animação, havia
         uma janela em que uma caixa a desaparecer continuava a ser o alvo do
         toque — e por baixo dela está o botão «Gerar e enviar» do estúdio. Ver
         o bloco grande lá em cima, ponto 2.

         A `.bo-saida` já traz `pointer-events: none` dentro dela; o utilitário
         aqui é a segunda volta à chave, e é o que um teste em jsdom consegue
         ver (uma folha de estilo não é carregada lá). */
      className={`${
        aSair
          ? `${SAIDA_FOLHA} pointer-events-none`
          : `pointer-events-auto ${ENTRADA_DO_AVISO} ${
              shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            }`
      } flex items-center gap-3 min-w-[260px] max-w-sm bg-[var(--bo-surface)] border border-[var(--bo-hairline-strong)] rounded-xl pl-4 pr-3 py-3 shadow-[var(--bo-sombra-suspensa)]`}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: DOT[toast.kind] }}
      />
      <p className="flex-1 text-[var(--bo-tinta-72)] text-sm leading-snug">{toast.message}</p>
      {/* A acção antes do fecho, e não depois: lê-se «Tarefa concluída ·
          Anular · ×», que é a ordem em que se decide. Um alvo de toque a
          sério, como o × ao lado — este é o botão que desfaz, e falhá-lo num
          telemóvel é ficar com o que se queria desfazer. */}
      {toast.accao && (
        <button
          type="button"
          onClick={() => {
            toast.accao?.aoTocar();
            aoFechar();
          }}
          className={`alvo-toque -my-2 shrink-0 rounded-full px-2 py-2 text-sm font-medium text-[var(--bo-accent)] underline underline-offset-[3px] hover:text-[var(--bo-accent-hover)] ${ESTADO} ${PRESSAO}`}
        >
          {toast.accao.rotulo}
        </button>
      )}
      {/* ── 9×14 PX, E É O BOTÃO QUE FECHA UM AVISO ──────────────────────
          MEDIDO a 375 px: nove píxeis de largura por catorze de altura. É o
          alvo mais pequeno de todo o back office, e está no elemento que
          aparece precisamente quando alguma coisa correu mal — «Não foi
          possível guardar», «Não foi possível criar a tarefa». Num telemóvel
          não havia como o fechar: restava esperar que se apagasse sozinho,
          com o aviso pousado por cima do conteúdo até lá.

          `alvo-toque` dá-lhe 44×44 só sob `(pointer: coarse)`; o `×` desenhado
          continua do mesmo tamanho, e no portátil o aviso fica igual. O
          `-mr-1.5` devolve ao aviso a largura que a caixa maior lhe tirava,
          para o texto não encolher por causa disto. */}
      <button
        onClick={aoFechar}
        className={`alvo-toque pointer-coarse:-mr-1.5 text-foreground/40 hover:text-[var(--bo-tinta-72)] ${ESTADO} ${PRESSAO} text-sm leading-none shrink-0`}
        aria-label="Fechar"
      >
        ×
      </button>
    </div>
  );
}
