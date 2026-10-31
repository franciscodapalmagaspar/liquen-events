/**
 * ════════════════════════════════════════════════════════════════════════════
 * INÉRCIA DA RODA DO RATO — o "deslizar" dos sítios de estúdio, só no computador
 * ════════════════════════════════════════════════════════════════════════════
 *
 * DESLIGADO POR OMISSÃO. O interruptor está em SmoothScroll.tsx; este ficheiro é
 * só o motor, e não se liga a nada sozinho.
 *
 * O QUE FAZ. Intercepta a roda do rato, guarda um ALVO de scroll e caminha para
 * ele um pedaço por quadro (`AMORTECIMENTO`). A página deixa de saltar de uma
 * vez para onde a roda mandou e passa a deslizar até lá.
 *
 * O QUE NÃO FAZ, DE PROPÓSITO: NÃO TOCA NO TOQUE. Não regista um único ouvinte
 * de `touchstart`/`touchmove`, e por isso no telemóvel este ficheiro é código
 * morto mesmo quando o interruptor está ligado. Não é uma afinação, é o ponto
 * todo — ver o cabeçalho de SmoothScroll.tsx para a razão, que é a queixa
 * original da dona do sítio.
 *
 * PORQUÊ ISTO E NÃO O LENIS. O `lenis` foi removido das dependências de
 * propósito (90553fb) e voltar a pô-lo para depois o deixar desligado seria
 * desfazer essa decisão sem ninguém a ter tomado. Isto faz a parte que interessa
 * — amortecer a roda — em ~1 KB e sem dependência. O AMORTECIMENTO é
 * deliberadamente o mesmo `lerp: 0.1` que o sítio usava, para que os números
 * medidos com o Lenis se leiam na mesma escala. Se depois de ver como se sente
 * a escolha for o Lenis a sério (que também trata de âncoras, `scroll-snap` e
 * casos de bordo que aqui ficam ao nativo), o ponto de troca é uma função:
 * `ligarInerciaDaRoda`.
 */

/** Quanto da distância que falta se percorre em cada quadro. */
export const AMORTECIMENTO = 0.1;

/** Abaixo disto damos o movimento por acabado e devolvemos a página ao nativo. */
const PARAR_ABAIXO_DE_PX = 0.5;

/**
 * Um evento de roda pode vir em pixels, em LINHAS ou em PÁGINAS — e um rato de
 * roda entalada em Windows costuma mandar linhas. Sem esta conversão, um clique
 * de roda desses valia 3 px em vez de ~48 e a página não se mexia.
 */
export function pixelsDaRoda(
  deltaY: number,
  deltaMode: number,
  alturaDaLinha: number,
  alturaDoEcra: number,
): number {
  if (deltaMode === 1) return deltaY * alturaDaLinha; // DOM_DELTA_LINE
  if (deltaMode === 2) return deltaY * alturaDoEcra; // DOM_DELTA_PAGE
  return deltaY; // DOM_DELTA_PIXEL
}

/**
 * O que está debaixo do ponteiro tem scroll próprio? Se tiver, a roda é dele e
 * nós não lhe tocamos — caso contrário um `preventDefault` nosso deixava painéis
 * internos, menus e caixas de código impossíveis de percorrer.
 */
export function temScrollProprio(alvo: Element | null, raiz: Element): boolean {
  let no: Element | null = alvo;
  while (no && no !== raiz) {
    if (no instanceof HTMLElement) {
      const estilo = getComputedStyle(no);
      const corre = estilo.overflowY === "auto" || estilo.overflowY === "scroll";
      if (corre && no.scrollHeight > no.clientHeight) return true;
    }
    no = no.parentElement;
  }
  return false;
}

/**
 * Há alguma camada por cima que já manda no scroll? O menu do telemóvel tranca o
 * corpo (`data-menu-open`) e a lightbox da galeria é um diálogo modal. Em
 * qualquer dos casos a roda não é nossa.
 */
export function haCamadaPorCima(documento: Document): boolean {
  if (documento.body?.dataset.menuOpen === "true") return true;
  /*
   * Só conta um diálogo que ESTÁ ABERTO. A lupa da proposta vive sempre no
   * HTML, escondida (`hidden`), com `aria-modal="true"`. Medido a 31/10: o
   * Lenis via-a como camada aberta, ficava parado desde o primeiro instante, e
   * parado tranca o `<html>` (`overflow: clip`) — com o rato, a proposta não
   * rolava de todo. Um diálogo escondido (ele ou um antepassado com `hidden`)
   * não está por cima de nada.
   */
  for (const d of documento.querySelectorAll<HTMLElement>('[aria-modal="true"]')) {
    if (!d.closest("[hidden]")) return true;
  }
  return false;
}

/**
 * A decisão de acender, isolada das APIs do browser para poder ser testada.
 * As três condições são E, e a ordem é a da barateza: o interruptor primeiro.
 */
export function inerciaDesejada(o: {
  ligada: boolean;
  movimentoReduzido: boolean;
  ponteiroFino: boolean;
}): boolean {
  if (!o.ligada) return false;
  // Quem pediu movimento reduzido pediu-o: nada de deslizes.
  if (o.movimentoReduzido) return false;
  // PONTEIRO FINO = rato ou trackpad. É esta linha que mantém o telemóvel no
  // scroll nativo, no compositor, fora da linha principal.
  return o.ponteiroFino;
}

/**
 * Acende o motor. Devolve a função que o apaga (e que repõe tudo como estava).
 */
export function ligarInerciaDaRoda(janela: Window = window): () => void {
  const documento = janela.document;
  const raiz = documento.documentElement;

  let alvo = janela.scrollY;
  let quadro = 0;
  // Enquanto somos NÓS a escrever o scroll, o ouvinte de `scroll` tem de se
  // calar; senão ressincronizava o alvo com a posição intermédia a cada quadro e
  // o movimento morria à nascença.
  let nossoScroll = false;

  const limite = () => Math.max(0, raiz.scrollHeight - janela.innerHeight);

  const passo = () => {
    quadro = 0;
    const falta = alvo - janela.scrollY;
    if (Math.abs(falta) < PARAR_ABAIXO_DE_PX) {
      nossoScroll = false;
      return;
    }
    nossoScroll = true;
    // `behavior: "instant"` NÃO é decoração. O globals.css tem
    // `html { scroll-behavior: smooth }`, e um `scrollTo` sem behavior herda-o:
    // cada quadro nosso passava a ARRANCAR uma animação suave do browser que o
    // quadro seguinte cancelava, e a página arrastava-se. Medido no sítio a
    // correr, 12 pares, mesma travessia: com a herança, 686 px percorridos;
    // sem ela (instantâneo, com o deslize a ser NOSSO), 5880 px — o mesmo que o
    // nativo. É o passo que tem de ser seco para o movimento ser suave.
    janela.scrollTo({ top: janela.scrollY + falta * AMORTECIMENTO, behavior: "instant" });
    quadro = janela.requestAnimationFrame(passo);
  };

  const naRoda = (e: WheelEvent) => {
    // Ctrl+roda é o zoom do browser. Mexer nisso seria tirar zoom a quem precisa.
    if (e.ctrlKey || e.defaultPrevented) return;
    if (haCamadaPorCima(documento)) return;
    if (temScrollProprio(e.target as Element | null, raiz)) return;

    const dy = pixelsDaRoda(e.deltaY, e.deltaMode, 16, janela.innerHeight);
    if (dy === 0) return;

    e.preventDefault();
    // Se não estávamos a animar, o alvo pode ter ficado velho (âncora, teclado,
    // restauro de posição). Parte-se sempre de onde a página está mesmo.
    if (!quadro && !nossoScroll) alvo = janela.scrollY;
    alvo = Math.min(limite(), Math.max(0, alvo + dy));
    if (!quadro) quadro = janela.requestAnimationFrame(passo);
  };

  // Qualquer scroll que não seja nosso (teclado, âncora, barra lateral, o
  // restauro do Next) manda: o alvo passa a ser onde a página ficou.
  const noScroll = () => {
    if (!nossoScroll) alvo = janela.scrollY;
  };

  // NÃO PASSIVO de propósito — é a única forma de poder chamar `preventDefault`.
  // É também o custo honesto desta opção: com um ouvinte destes registado, o
  // Chrome deixa de poder desviar a roda para o compositor e passa a esperar
  // pela linha principal antes de mexer a página. Medido: sem ele os eventos de
  // roda chegam `cancelable: false` (via rápida); com ele, `cancelable: true`.
  janela.addEventListener("wheel", naRoda, { passive: false });
  janela.addEventListener("scroll", noScroll, { passive: true });

  return () => {
    janela.removeEventListener("wheel", naRoda);
    janela.removeEventListener("scroll", noScroll);
    if (quadro) janela.cancelAnimationFrame(quadro);
    quadro = 0;
    nossoScroll = false;
  };
}
