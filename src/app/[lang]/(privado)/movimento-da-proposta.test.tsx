// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { GUIAO_DO_MOVIMENTO } from "./MovimentoDaProposta";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MOVIMENTO NUNCA PODE DEIXAR UMA PROPOSTA EM BRANCO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quero animações pelo PDF todo — quero que aquilo fique
 * espetacularmente bom».
 *
 * O que se guarda aqui não é que seja bonito. É que, quando falhar, falhe do
 * lado certo. Um documento de vinte mil euros que chega em branco porque um
 * guião não correu é a pior coisa que este ficheiro pode permitir — e esta
 * casa já lá foi duas vezes, das duas por um `opacity: 0` à espera de
 * JavaScript.
 *
 * Daí a regra: o estado escondido NÃO EXISTE no CSS. Só aparece quando o
 * guião o põe, elemento a elemento. Nenhum guião, nenhuma classe, nenhum
 * elemento fora do sítio.
 */

const CSS = readFileSync("src/app/globals.css", "utf8");
const BLOCO = CSS.slice(CSS.indexOf("O MOVIMENTO DA PROPOSTA"));

function montar({ calmo = false, semObservador = false } = {}) {
  document.body.innerHTML = `
    <div id="acima" data-sobe style="--sobe:14px"></div>
    <div id="abaixo" data-sobe style="--sobe:12px"></div>`;
  const acima = document.getElementById("acima")!;
  const abaixo = document.getElementById("abaixo")!;
  acima.getBoundingClientRect = () => ({ top: 10 }) as DOMRect;
  abaixo.getBoundingClientRect = () => ({ top: 5000 }) as DOMRect;

  vi.stubGlobal("matchMedia", () => ({ matches: calmo }));
  const observados: Element[] = [];
  let disparar: ((es: unknown[]) => void) | null = null;
  if (semObservador) {
    // @ts-expect-error — a apagar de propósito, como num browser antigo
    delete window.IntersectionObserver;
  } else {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (es: unknown[]) => void) {
          disparar = cb;
        }
        observe(el: Element) {
          observados.push(el);
        }
        unobserve() {}
      },
    );
  }
  Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
  new Function(GUIAO_DO_MOVIMENTO)();
  return { acima, abaixo, observados, disparar: () => disparar };
}

/**
 * O MESMO DOCUMENTO, MAS NO BURACO — antes de o React revelar o jacto que
 * traz a proposta. É o estado real de uma primeira visita: as peças já estão
 * no DOM e não têm forma nenhuma, porque um antepassado está em
 * `display: none`. Todas as caixas são zeros.
 *
 * `revelar()` põe a página com a forma que ela tem depois; `fotograma()`
 * corre um fotograma de animação, que é onde o guião volta a tentar.
 */
function montarEscondido() {
  document.body.innerHTML = `
    <div id="acima" data-sobe style="--sobe:14px"></div>
    <div id="abaixo" data-sobe style="--sobe:12px"></div>`;
  const acima = document.getElementById("acima")!;
  const abaixo = document.getElementById("abaixo")!;
  const escondido = () => ({ top: 0, height: 0 }) as DOMRect;
  acima.getBoundingClientRect = escondido;
  abaixo.getBoundingClientRect = escondido;

  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const observados: Element[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor() {}
      observe(el: Element) {
        observados.push(el);
      }
      unobserve() {}
    },
  );
  let porCorrer: FrameRequestCallback[] = [];
  let pedidos = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    pedidos += 1;
    porCorrer.push(cb);
    return pedidos;
  });
  Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
  new Function(GUIAO_DO_MOVIMENTO)();

  return {
    acima,
    abaixo,
    observados,
    quantosPedidos: () => pedidos,
    revelar() {
      acima.getBoundingClientRect = () => ({ top: 10, height: 120 }) as DOMRect;
      abaixo.getBoundingClientRect = () => ({ top: 5000, height: 300 }) as DOMRect;
    },
    fotograma() {
      const fila = porCorrer;
      porCorrer = [];
      for (const cb of fila) cb(0);
    },
  };
}

/**
 * UM LOTE DO OBSERVADOR — várias peças a cruzar a linha no mesmo instante,
 * que é o que acontece numa fila de um mood board. O `left` de cada uma é o
 * que o observador traz no `boundingClientRect` da entrada, e é por ele que a
 * cascata se ordena.
 */
function montarUmLote(pecas: readonly { papel: string; left: number }[]) {
  document.body.innerHTML = pecas
    .map((p, i) => `<div id="p${i}" data-sobe="${p.papel}"></div>`)
    .join("");
  const els = pecas.map((_, i) => document.getElementById(`p${i}`)!);
  // Todas abaixo da dobra, e com forma — para serem armadas.
  els.forEach((el) => {
    el.getBoundingClientRect = () => ({ top: 5000, height: 300 }) as DOMRect;
  });

  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  let disparar: ((es: unknown[]) => void) | null = null;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (es: unknown[]) => void) {
        disparar = cb;
      }
      observe() {}
      unobserve() {}
    },
  );
  Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
  new Function(GUIAO_DO_MOVIMENTO)();

  return {
    foto: (i: number) => els[i],
    largar() {
      disparar!(
        pecas.map((p, i) => ({
          isIntersecting: true,
          target: els[i],
          boundingClientRect: { left: p.left },
        })),
      );
    },
  };
}

beforeEach(() => {
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("o movimento da proposta", () => {
  it("o CSS NÃO esconde nada por sua conta — o estado escondido pede a classe", () => {
    /**
     * A regra que sustenta tudo o resto. Se `[data-sobe]` sozinho já
     * deslocasse o elemento, um guião que não corresse deixava o documento
     * inteiro fora do sítio — ou pior, com a opacidade a zero, invisível.
     */
    expect(BLOCO).toMatch(/\[data-sobe\]\.por-subir \{/);
    expect(BLOCO, "o atributo sozinho não pode mexer em nada").not.toMatch(
      /\[data-sobe\]\s*\{[^}]*transform/,
    );
  });

  it("e NUNCA toca na opacidade — é assim que se serve um documento em branco", () => {
    // Duas vezes já aconteceu nesta casa, das duas por um `opacity: 0` à
    // espera de JavaScript. A terceira não é aqui.
    const regras = BLOCO.match(/\[data-sobe\][^{]*\{[^}]*\}/g) ?? [];
    expect(regras.length).toBeGreaterThan(0);
    for (const r of regras) expect(r).not.toContain("opacity");
    expect(BLOCO).not.toMatch(/@keyframes prop-entrada[\s\S]*?opacity/);
  });

  it("arma só o que está abaixo da dobra — o que já se vê não salta", () => {
    // Armar um elemento que já está no ecrã fá-lo saltar para baixo e subir
    // outra vez, à frente de quem está a olhar.
    const { acima, abaixo, observados } = montar();
    expect(acima.classList.contains("por-subir"), "este já se via").toBe(false);
    expect(abaixo.classList.contains("por-subir")).toBe(true);
    expect(observados).toEqual([abaixo]);
  });

  it("e larga cada elemento assim que ele chega", () => {
    const { abaixo, disparar } = montar();
    disparar()!([{ isIntersecting: true, target: abaixo }]);
    expect(abaixo.classList.contains("subiu")).toBe(true);
  });

  it("quem pediu menos movimento não leva nada — e nada fica fora do sítio", () => {
    const { acima, abaixo, observados } = montar({ calmo: true });
    expect(acima.classList.contains("por-subir")).toBe(false);
    expect(abaixo.classList.contains("por-subir"), "sai ANTES de armar").toBe(false);
    expect(observados).toEqual([]);
  });

  it("num browser sem `IntersectionObserver`, a proposta fica parada e inteira", () => {
    /**
     * O caso que interessa mesmo: um telemóvel antigo. Nada de movimento, e
     * sobretudo nada escondido à espera de um observador que não existe.
     *
     * ── O QUE ESTE CASO PROVA, E O QUE NÃO PROVA ──────────────────────────
     *
     * Prova o RESULTADO: nenhum elemento fica fora do sítio.
     *
     * NÃO prova a linha `if(!("IntersectionObserver" in window))return`. Tirei-a
     * para ver, e o teste passou na mesma — porque o `try/catch` à volta do
     * guião já apanha o `new IntersectionObserver` a rebentar, e nessa altura
     * ainda não foi armado nada. As duas defesas dão o mesmo fim.
     *
     * Fica escrito para ninguém pensar que este caso guarda a guarda. Ela
     * continua lá por ser mais barata e mais honesta do que uma excepção
     * apanhada — mas quem a tirar não parte nada, e é justo dizê-lo.
     */
    const { acima, abaixo } = montar({ semObservador: true });
    expect(acima.classList.contains("por-subir")).toBe(false);
    expect(abaixo.classList.contains("por-subir")).toBe(false);
  });

  it("mede DEPOIS de a página ter forma — e não no buraco em que ela ainda não tem", () => {
    /**
     * ════════════════════════════════════════════════════════════════════════
     * O DEFEITO QUE FEZ COM QUE NUNCA HOUVESSE MOVIMENTO NENHUM
     * ════════════════════════════════════════════════════════════════════════
     *
     * Palavras dela, a olhar para uma proposta verdadeira: «não há animações
     * nenhumas na proposta online».
     *
     * Não era a régua ser pequena. O guião corria uma vez, no
     * `DOMContentLoaded`, e nesse instante o documento do casal AINDA NÃO
     * ESTÁ NA PÁGINA — vem num jacto posterior ao do layout (está escrito no
     * cabeçalho do `(privado)/layout.tsx`), aterra dentro de um `<div>` com
     * `display: none` e só depois é revelado.
     *
     * MEDIDO num Chromium a 390×844, contra o servidor de PRODUÇÃO, com uma
     * proposta real de 24 fotografias:
     *
     *     no instante em que o guião mede   altura 779 px    tops: 0,0,0,0,0…
     *     depois de a página ser revelada   altura 13 009 px tops: 498,1350,1444…
     *
     * Com toda a gente em `top: 0`, ninguém está abaixo da dobra: armavam-se
     * ZERO de 34 elementos. E o guião não voltava a correr. Nem uma foto, nem
     * um título, nem o total a pagar — em desenvolvimento e em produção, em
     * todas as visitas.
     *
     * A correcção não muda regra nenhuma do desenho: continua a armar só o
     * que está abaixo da dobra, continua a ler tudo antes de escrever. Só
     * espera pelo fotograma em que há alguma coisa para medir.
     */
    const { acima, abaixo, observados, revelar, fotograma } = montarEscondido();

    // No buraco: as peças existem, mas o documento está escondido e ninguém
    // tem forma. Não se arma nada — e sobretudo não se arma ERRADO.
    expect(acima.classList.contains("por-subir"), "nada se arma sem forma").toBe(false);
    expect(abaixo.classList.contains("por-subir"), "nada se arma sem forma").toBe(false);
    expect(observados).toEqual([]);

    // O documento é revelado. É aqui que o guião tem de acordar.
    revelar();
    fotograma();

    expect(
      abaixo.classList.contains("por-subir"),
      "o que está abaixo da dobra tinha de armar",
    ).toBe(true);
    expect(acima.classList.contains("por-subir"), "o que já se via continua quieto").toBe(false);
    expect(observados).toEqual([abaixo]);
  });

  it("desiste ao fim de um tempo, e desistir deixa a proposta inteira", () => {
    /**
     * Uma página que nunca chega a ter forma (um erro no servidor a meio do
     * jacto) não pode deixar um ciclo de fotogramas a rodar para sempre no
     * telemóvel de quem está a ler. Desiste — e desistir é seguro por
     * construção: o estado escondido só existe quando o guião o põe, portanto
     * um guião que desiste deixa o documento exactamente como veio.
     */
    const { acima, abaixo, fotograma, quantosPedidos } = montarEscondido();
    for (let i = 0; i < 400; i++) fotograma();
    expect(quantosPedidos(), "ficou a pedir fotogramas para sempre").toBeLessThan(400);
    expect(acima.classList.contains("por-subir")).toBe(false);
    expect(abaixo.classList.contains("por-subir")).toBe(false);
  });

  it("as fotografias que chegam juntas aterram uma a seguir à outra, da esquerda para a direita", () => {
    /**
     * ════════════════════════════════════════════════════════════════════════
     * A CASCATA
     * ════════════════════════════════════════════════════════════════════════
     *
     * Numa fila de um mood board várias fotografias cruzam a linha no MESMO
     * instante, e o observador entrega-as no mesmo lote. Sem mais nada, subiam
     * as 28 px todas ao mesmo tempo — um bloco a mexer-se em peça única lê-se
     * como a página a saltar.
     *
     * A ordem é a do ECRÃ e não a do documento: as colunas de um mood board
     * são empacotadas por altura (`arrumarPorColunas`), portanto a ordem no
     * HTML não é a ordem em que se vêem. Daí o `left` — que vem no próprio
     * lote do observador, sem se ler nada ao DOM.
     */
    const { largar, foto } = montarUmLote([
      { papel: "foto", left: 200 },
      { papel: "foto", left: 0 },
      { papel: "foto", left: 100 },
    ]);
    largar();
    // Da esquerda para a direita: 0ms, 80ms, 160ms.
    expect(foto(1).style.transitionDelay, "a da esquerda é a primeira").toBe("");
    expect(foto(2).style.transitionDelay).toBe("80ms");
    expect(foto(0).style.transitionDelay, "a da direita é a última").toBe("160ms");
    for (const i of [0, 1, 2]) expect(foto(i).classList.contains("subiu")).toBe(true);
  });

  it("e o passo pára ao quarto — a última de uma fila larga não espera meio segundo", () => {
    const { largar, foto } = montarUmLote(
      [0, 1, 2, 3, 4, 5].map((n) => ({ papel: "foto", left: n * 100 })),
    );
    largar();
    expect(foto(3).style.transitionDelay).toBe("240ms");
    expect(foto(4).style.transitionDelay, "o tecto são 240ms").toBe("240ms");
    expect(foto(5).style.transitionDelay, "o tecto são 240ms").toBe("240ms");
  });

  it("mas o que se LÊ nunca espera pela vez", () => {
    /**
     * Um título ou o total a pagar atrasado de propósito é uma linha que
     * alguém quer ler a chegar tarde. Esses são largados no instante em que
     * chegam, mesmo que venham no mesmo lote que uma fotografia.
     */
    const { largar, foto } = montarUmLote([
      { papel: "foto", left: 0 },
      { papel: "titulo", left: 100 },
      { papel: "total", left: 200 },
    ]);
    largar();
    expect(foto(1).style.transitionDelay, "um título ficou à espera da vez").toBe("");
    expect(foto(2).style.transitionDelay, "o total a pagar ficou à espera da vez").toBe("");
    expect(foto(1).classList.contains("subiu")).toBe(true);
    expect(foto(2).classList.contains("subiu")).toBe(true);
  });

  it("uma avaria no guião não derruba a página", () => {
    document.body.innerHTML = `<div data-sobe></div>`;
    vi.stubGlobal("matchMedia", () => {
      throw new Error("rebentou");
    });
    Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
    expect(() => new Function(GUIAO_DO_MOVIMENTO)()).not.toThrow();
    expect(document.querySelector("[data-sobe]")?.classList.contains("por-subir")).toBe(false);
  });

  it("a entrada do documento acaba em `transform: none`, e é `backwards`", () => {
    /**
     * O visualizador de fotografias desta página é `position: fixed` dentro
     * do documento. Um `transform` que fique pendurado num antepassado passa
     * a ser o bloco de contenção dele, e a lupa deixa de cobrir o ecrã — é a
     * lição do `.view-in`, escrita neste mesmo ficheiro.
     */
    expect(BLOCO).toMatch(/animation: prop-entrada[^;]*backwards/);
    expect(BLOCO).toMatch(/@keyframes prop-entrada \{[\s\S]*?to \{\s*transform: none;/);
    expect(BLOCO, "`forwards` deixava o bloco de contenção montado").not.toMatch(
      /prop-entrada[^;]*forwards/,
    );
  });

  it("a entrada não espera por pano nenhum — nem por um sinal do guião", () => {
    /**
     * ── ISTO JÁ ESTEVE AGARRADO A UM ATRIBUTO ─────────────────────────────
     *
     * Era `html[data-cortina="a-sair"] .prop-folha`: o guião punha o atributo
     * no instante em que DECIDIA levantar a cortina, e a folha entrava com
     * ele.
     *
     * O guião deixou de decidir isso. Quem manda no tempo do pano passou a ser
     * o CSS, numa animação só — ela mandou o ficheiro e sublinhou-a: «fica
     * parado 2 segundos e sobe nos últimos 270 ms». O atributo já não aparece,
     * e uma regra pendurada nele nunca mais correria: a folha da proposta
     * entrava parada, e ninguém dava por isso porque uma animação que não
     * corre não deixa rasto.
     *
     * Passa a esperar pelo mesmo instante que o zoom da capa do sítio espera,
     * escrito uma vez no `:root`. E ganha a propriedade que o `hero-settle` já
     * tinha: num dia em que o JavaScript não corra, isto continua a acontecer.
     */
    // Desde 22/10 a proposta não tem cortina («Sai só na proposta»): a
    // entrada arranca logo, e continua a não depender do guião.
    expect(BLOCO, "a entrada voltou a esperar por uma cortina que já não existe").not.toMatch(
      /\.prop-abertura \{[^}]*--cortina/,
    );
    expect(
      BLOCO.replace(/\/\*[\s\S]*?\*\//g, ""),
      "voltou a estar pendurada num sinal que o guião já não dá",
    ).not.toContain('data-cortina="a-sair"');
  });
});

describe("a escada das distâncias — a do que se LÊ", () => {
  /**
   * ════════════════════════════════════════════════════════════════════════
   * O TEXTO DESCREVIA QUATRO DEGRAUS E O CÓDIGO TINHA UM
   * ════════════════════════════════════════════════════════════════════════
   *
   * O comentário do `globals.css` dizia, com números: bloco 8 px, fotografia
   * 12, secção 14, e o TOTAL A PAGAR 20 — «o único acima de 14». O CSS tinha
   * uma regra só, `translateY(var(--sobe, 12px))`, e o `--sobe` NUNCA foi
   * declarado em lado nenhum. Ou seja: tudo subia 12 px, e o texto mentia.
   *
   * Não se perde outra vez: o que este caso guarda não são os números, é a
   * ESCADA — que os papéis existem, que são distintos, e que a ordem é a que
   * o desenho diz. Mudar um número passa aqui; apagar um degrau não.
   *
   * ── PORQUE É QUE A FOTOGRAFIA SAIU DESTA LISTA ───────────────────────────
   *
   * Estava aqui, entre o bloco e a secção, e este caso exigia-lhe ≤ 14 px. Foi
   * uma decisão dela, com a proposta publicada à frente: «queria que houvesse
   * uma experiência espetacular em animações pelas fotos». Um gesto de 12 px
   * sem escala nenhuma não se vê num telemóvel — e ela tem razão, porque quem
   * abre isto não vem ler um documento, vem ver o trabalho.
   *
   * A regra que esta lista guarda NÃO foi revogada: continua a valer, inteira,
   * para tudo o que se lê. O que mudou é o alcance dela. Os dois papéis
   * fotográficos têm agora o seu próprio caso, já a seguir, com o seu próprio
   * tecto — não é «sem regra», é outra regra.
   */
  const DEGRAUS = ["bloco", "titulo", "seccao", "total"] as const;

  /** A distância de cada papel, lida do CSS. */
  function degraus(): Map<string, number> {
    const out = new Map<string, number>();
    for (const papel of DEGRAUS) {
      const m = new RegExp(
        `\\[data-sobe="${papel}"\\]\\.por-subir \\{[^}]*?translateY\\((\\d+)px\\)`,
      ).exec(BLOCO);
      if (m) out.set(papel, Number(m[1]));
    }
    return out;
  }

  it("os quatro papéis do documento têm o SEU degrau", () => {
    const d = degraus();
    for (const papel of DEGRAUS) {
      expect(
        d.get(papel),
        `o papel «${papel}» ficou sem degrau — volta a subir os 12 px de recurso, ` +
          "como quando isto esteve escrito e por implementar",
      ).toBeGreaterThan(0);
    }
  });

  it("a distância cresce com a importância — e o total é o único acima de 14", () => {
    const d = degraus();
    const ordem = DEGRAUS.map((p) => d.get(p) ?? 0);
    for (let i = 1; i < ordem.length; i++) {
      expect(
        ordem[i],
        `«${DEGRAUS[i]}» (${ordem[i]}px) não sobe mais do que «${DEGRAUS[i - 1]}» (${ordem[i - 1]}px) — ` +
          "a distância é o que diz a importância",
      ).toBeGreaterThan(ordem[i - 1]);
    }
    expect(d.get("total"), "o total a pagar deixou de ser o único acima de 14").toBeGreaterThan(14);
    for (const papel of ["bloco", "titulo", "seccao"] as const) {
      expect(
        d.get(papel),
        `«${papel}» passou os 14 px — a escada perdeu o topo`,
      ).toBeLessThanOrEqual(14);
    }
  });

  it("e continua a ser sempre pequena — isto é para se sentir, não para se ver", () => {
    // A regra da casa está escrita no próprio bloco: «a distância diz a
    // importância, e é sempre pequena». Um degrau grande num documento que
    // alguém está a ler rouba-lhe a linha que está a seguir.
    for (const [papel, px] of degraus()) {
      expect(
        px,
        `«${papel}» sobe ${px}px — é movimento a mais num documento que se lê`,
      ).toBeLessThanOrEqual(24);
    }
  });

  it("e NENHUM papel de leitura cresce — a escala é dos dois papéis fotográficos", () => {
    /**
     * Se um parágrafo ou o total a pagar começasse a crescer para o seu
     * lugar, a distinção que este ficheiro acabou de fazer desaparecia — e um
     * número que alguém confere com o dedo a mudar de tamanho é a última coisa
     * que este documento pode fazer.
     */
    for (const papel of DEGRAUS) {
      const m = new RegExp(`\\[data-sobe="${papel}"\\]\\.por-subir \\{([^}]*)\\}`).exec(BLOCO);
      expect(m?.[1] ?? "", `«${papel}» ganhou escala e é um papel de leitura`).not.toContain(
        "scale(",
      );
    }
  });
});

describe("as fotografias, que saíram da escada", () => {
  /**
   * ════════════════════════════════════════════════════════════════════════
   * «UMA EXPERIÊNCIA ESPETACULAR EM ANIMAÇÕES PELAS FOTOS»
   * ════════════════════════════════════════════════════════════════════════
   *
   * São dois papéis: a `foto` (uma célula da grelha de um mood board) e o
   * `respiro` (a fotografia a toda a largura que abre cada board). O que se
   * guarda aqui é que eles se distinguem do texto e que não passam do ponto —
   * os números exactos podem afinar-se, a forma não.
   */
  const FOTOGRAFICOS = ["foto", "respiro"] as const;

  function gesto(papel: string) {
    const m = new RegExp(`\\[data-sobe="${papel}"\\]\\.por-subir \\{([^}]*)\\}`).exec(BLOCO);
    const corpo = m?.[1] ?? "";
    const sobe = /translateY\((\d+)px\)/.exec(corpo);
    const escala = /scale\(([\d.]+)\)/.exec(corpo);
    return { corpo, sobe: sobe ? Number(sobe[1]) : 0, escala: escala ? Number(escala[1]) : null };
  }

  it("cada um sobe mais do que qualquer coisa que se leia", () => {
    // O topo da escada de leitura é o total a pagar, aos 20 px.
    for (const papel of FOTOGRAFICOS) {
      expect(
        gesto(papel).sobe,
        `«${papel}» voltou ao gesto de um parágrafo — era isto que não se via`,
      ).toBeGreaterThan(20);
    }
  });

  it("e CRESCE até ao seu lugar — é a escala que se vê, não os píxeis", () => {
    for (const papel of FOTOGRAFICOS) {
      const { escala } = gesto(papel);
      expect(escala, `«${papel}» ficou sem escala`).not.toBeNull();
      expect(
        escala!,
        `«${papel}» começa a ${escala} — acima de 1 passa por cima da vizinha do lado`,
      ).toBeLessThan(1);
      expect(
        escala!,
        `«${papel}» a ${escala} já é um salto, não uma chegada`,
      ).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("o respiro é o maior gesto do documento, e a escala dele é a mais contida", () => {
    // A mesma percentagem numa caixa três vezes mais larga são três vezes mais
    // píxeis: a sangria inteira precisa de menos escala, não de mais.
    const f = gesto("foto");
    const r = gesto("respiro");
    expect(r.sobe, "o respiro deixou de ser o separador mais forte").toBeGreaterThan(f.sobe);
    expect(
      r.escala!,
      "a sangria inteira a crescer tanto como uma célula dá um salto",
    ).toBeGreaterThan(f.escala!);
  });

  it("e demoram mais do que o texto — a regra vem DEPOIS da largada, ou não vale", () => {
    /**
     * Empate de especificidade: `[data-sobe]` + duas classes de um lado,
     * `[data-sobe="foto"]` + duas classes do outro. Quem ganha é a ordem no
     * ficheiro. Esta linha mudada de sítio deixava de valer sem dar erro
     * nenhum — a fotografia voltava aos 620 ms e ninguém dava por isso.
     */
    const largada = BLOCO.indexOf("[data-sobe].por-subir.subiu");
    const propria = BLOCO.indexOf('[data-sobe="foto"].por-subir.subiu');
    expect(largada, "a regra da largada desapareceu").toBeGreaterThan(-1);
    expect(propria, "os papéis fotográficos ficaram sem duração própria").toBeGreaterThan(-1);
    expect(
      propria,
      "a duração própria subiu para antes da largada e deixou de valer",
    ).toBeGreaterThan(largada);

    const curta = /\[data-sobe\]\.por-subir\.subiu \{[^}]*?transition: transform (\d+)ms/.exec(
      BLOCO,
    );
    const longa =
      /\[data-sobe="foto"\]\.por-subir\.subiu[^{]*\{[^}]*?transition-duration: (\d+)ms/.exec(BLOCO);
    expect(
      Number(longa?.[1]),
      "um gesto maior feito no mesmo tempo lê-se como um salto",
    ).toBeGreaterThan(Number(curta?.[1]));
  });
});
