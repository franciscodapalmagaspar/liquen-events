// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  AMORTECIMENTO,
  inerciaDesejada,
  pixelsDaRoda,
  temScrollProprio,
  haCamadaPorCima,
  ligarInerciaDaRoda,
} from "@/lib/motion/inercia-roda";

/**
 * A rede à volta da inércia da roda. O que se protege aqui não é a matemática do
 * deslize (essa vê-se, e mediu-se com `e2e/scroll-inercia.mjs`) — é a GUARDA:
 * as condições que mantêm este código longe do telemóvel e longe de quem pediu
 * movimento reduzido. É a guarda que decide se a funcionalidade é segura de
 * ligar, e é a guarda que se parte sem dar por isso.
 */

afterEach(() => {
  document.body.innerHTML = "";
  delete document.body.dataset.menuOpen;
});

describe("a guarda: quando é que a inércia pode sequer acender", () => {
  it("com o interruptor desligado, nada acende — nem em ponteiro fino", () => {
    expect(inerciaDesejada({ ligada: false, movimentoReduzido: false, ponteiroFino: true })).toBe(
      false,
    );
  });

  it("EM PONTEIRO GROSSO NUNCA ACENDE — é esta linha que protege o telemóvel", () => {
    // Se esta expectativa cair, a inércia por JavaScript passa a correr no
    // telemóvel: o scroll sai do compositor e vai para a linha principal, que é
    // exactamente a queixa que deu origem a este trabalho.
    expect(inerciaDesejada({ ligada: true, movimentoReduzido: false, ponteiroFino: false })).toBe(
      false,
    );
  });

  it("com movimento reduzido nunca acende, mesmo em ponteiro fino", () => {
    expect(inerciaDesejada({ ligada: true, movimentoReduzido: true, ponteiroFino: true })).toBe(
      false,
    );
  });

  it("acende só com as três condições ao mesmo tempo", () => {
    expect(inerciaDesejada({ ligada: true, movimentoReduzido: false, ponteiroFino: true })).toBe(
      true,
    );
  });
});

describe("o interruptor que vai no repositório", () => {
  it("está ligado porque ELA o pediu (30/10, «nível estúdio»: o Lenis, só rato e trackpad)", async () => {
    // O contrato era: entra desligado e só a dona do sítio o liga. Ligou-o no
    // pedido «nível estúdio» (o B7.3 do PADRAO-PALUMEN), e vê-o no link de
    // teste antes de ir para o sítio. Desligá-lo é esta linha voltar a `false`
    // — e este teste com ela.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const fonte = readFileSync(
      join(process.cwd(), "src/components/motion/SmoothScroll.tsx"),
      "utf8",
    );
    expect(fonte).toMatch(/const INERCIA_NA_RODA = true;/);
    // E nunca no dedo: a decisão continua a passar pelo ponteiro fino.
    expect(fonte).toMatch(/ponteiroFino: window\.matchMedia\("\(pointer: fine\)"\)\.matches/);
  });
});

describe("conversão do delta da roda", () => {
  it("pixels passam tal e qual", () => {
    expect(pixelsDaRoda(120, 0, 16, 900)).toBe(120);
  });

  it("LINHAS são convertidas — um rato de roda entalada manda linhas, não pixels", () => {
    // Sem esta conversão um clique de roda valia 3 px em vez de 48 e a página
    // parecia não responder.
    expect(pixelsDaRoda(3, 1, 16, 900)).toBe(48);
  });

  it("PÁGINAS são convertidas pela altura do ecrã", () => {
    expect(pixelsDaRoda(1, 2, 16, 900)).toBe(900);
  });
});

describe("o que não é nosso: scroll próprio e camadas por cima", () => {
  it("um painel com overflow e conteúdo a mais fica com a roda", () => {
    document.body.innerHTML = `<div id="painel"><span id="dentro">x</span></div>`;
    const painel = document.getElementById("painel") as HTMLElement;
    const dentro = document.getElementById("dentro") as HTMLElement;
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      overflowY: "auto",
    } as unknown as CSSStyleDeclaration);
    Object.defineProperty(painel, "scrollHeight", { value: 500, configurable: true });
    Object.defineProperty(painel, "clientHeight", { value: 200, configurable: true });
    expect(temScrollProprio(dentro, document.documentElement)).toBe(true);
    vi.restoreAllMocks();
  });

  it("um painel com overflow mas SEM conteúdo a mais não conta", () => {
    document.body.innerHTML = `<div id="painel"><span id="dentro">x</span></div>`;
    const painel = document.getElementById("painel") as HTMLElement;
    const dentro = document.getElementById("dentro") as HTMLElement;
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      overflowY: "auto",
    } as unknown as CSSStyleDeclaration);
    Object.defineProperty(painel, "scrollHeight", { value: 200, configurable: true });
    Object.defineProperty(painel, "clientHeight", { value: 200, configurable: true });
    expect(temScrollProprio(dentro, document.documentElement)).toBe(false);
    vi.restoreAllMocks();
  });

  it("o menu do telemóvel aberto tranca a roda", () => {
    document.body.dataset.menuOpen = "true";
    expect(haCamadaPorCima(document)).toBe(true);
  });

  it("um diálogo modal (a lightbox da galeria) tranca a roda", () => {
    document.body.innerHTML = `<div aria-modal="true"></div>`;
    expect(haCamadaPorCima(document)).toBe(true);
  });

  it("um diálogo modal ESCONDIDO não conta (a lupa da proposta vive sempre no HTML)", () => {
    document.body.innerHTML = `<div class="pw-lb" role="dialog" aria-modal="true" hidden></div>`;
    expect(haCamadaPorCima(document)).toBe(false);
    document.body.innerHTML = `<div hidden><div aria-modal="true"></div></div>`;
    expect(haCamadaPorCima(document)).toBe(false);
  });

  it("sem menu nem diálogo, a roda é nossa", () => {
    expect(haCamadaPorCima(document)).toBe(false);
  });
});

describe("o motor, ligado e desligado", () => {
  /** Uma janela de mentira, com o mínimo que o motor toca. */
  function janelaFalsa() {
    const ouvintes = new Map<string, EventListener>();
    const comportamentos: (string | undefined)[] = [];
    let y = 0;
    const quadros: FrameRequestCallback[] = [];
    // Objecto solto primeiro (o `scrollY` de uma Window é só de leitura, e o
    // motor precisa de o ver a mudar quando lhe chamamos `scrollTo`).
    const bruto = {
      document,
      scrollY: 0,
      innerHeight: 900,
      scrollTo: (o: ScrollToOptions) => {
        comportamentos.push(o.behavior);
        y = o.top as number;
        bruto.scrollY = o.top as number;
      },
      addEventListener: (t: string, f: EventListener) => ouvintes.set(t, f),
      removeEventListener: (t: string) => ouvintes.delete(t),
      requestAnimationFrame: (f: FrameRequestCallback) => {
        quadros.push(f);
        return quadros.length;
      },
      cancelAnimationFrame: () => {},
    };
    return {
      janela: bruto as unknown as Window,
      ouvintes,
      comportamentos,
      correQuadros: (n: number) => {
        for (let i = 0; i < n; i++) {
          const f = quadros.shift();
          if (f) f(0);
        }
      },
      get y() {
        return y;
      },
    };
  }

  it("a roda é impedida e a página desliza para o alvo em vez de saltar", () => {
    Object.defineProperty(document.documentElement, "scrollHeight", {
      value: 10000,
      configurable: true,
    });
    const f = janelaFalsa();
    const apagar = ligarInerciaDaRoda(f.janela);
    const roda = f.ouvintes.get("wheel")!;
    let impedido = false;
    roda({
      deltaY: 1000,
      deltaMode: 0,
      ctrlKey: false,
      defaultPrevented: false,
      target: document.body,
      preventDefault: () => {
        impedido = true;
      },
    } as unknown as Event);

    // O evento é NOSSO: sem isto a página saltava os 1000 px de uma vez.
    expect(impedido).toBe(true);
    // Um quadro só percorre uma fracção do caminho — é isso que é o deslize.
    f.correQuadros(1);
    expect(f.y).toBeCloseTo(1000 * AMORTECIMENTO, 5);
    expect(f.y).toBeLessThan(1000);
    apagar();
  });

  it("cada passo é INSTANTÂNEO — senão herda o scroll-behavior:smooth do sítio", () => {
    // O bug que este teste guarda foi encontrado a medir, não a ler. O
    // globals.css tem `html { scroll-behavior: smooth }`; um `scrollTo(x, y)`
    // sem `behavior` herda-o, e cada quadro nosso passa a ARRANCAR uma animação
    // suave do browser que o quadro seguinte cancela. Resultado medido na
    // travessia de 12 pares: 686 px percorridos em vez de 5880 — a página
    // arrastava-se. O deslize tem de ser nosso; o passo tem de ser seco.
    Object.defineProperty(document.documentElement, "scrollHeight", {
      value: 10000,
      configurable: true,
    });
    const f = janelaFalsa();
    const apagar = ligarInerciaDaRoda(f.janela);
    f.ouvintes.get("wheel")!({
      deltaY: 1000,
      deltaMode: 0,
      ctrlKey: false,
      defaultPrevented: false,
      target: document.body,
      preventDefault: () => {},
    } as unknown as Event);
    f.correQuadros(3);
    expect(f.comportamentos.length).toBeGreaterThan(0);
    expect([...new Set(f.comportamentos)]).toEqual(["instant"]);
    apagar();
  });

  it("apagar tira os dois ouvintes — nada fica pendurado", () => {
    const f = janelaFalsa();
    const apagar = ligarInerciaDaRoda(f.janela);
    expect(f.ouvintes.has("wheel")).toBe(true);
    expect(f.ouvintes.has("scroll")).toBe(true);
    apagar();
    expect(f.ouvintes.has("wheel")).toBe(false);
    expect(f.ouvintes.has("scroll")).toBe(false);
  });

  it("NÃO regista ouvinte de toque nenhum — o telemóvel fica com o nativo", () => {
    // A promessa central desta funcionalidade, em forma de teste. Se um dia
    // alguém acrescentar `touchstart`/`touchmove` aqui, isto fica vermelho.
    const f = janelaFalsa();
    const apagar = ligarInerciaDaRoda(f.janela);
    expect([...f.ouvintes.keys()].sort()).toEqual(["scroll", "wheel"]);
    apagar();
  });

  it("ctrl+roda (o zoom do browser) passa ao lado", () => {
    const f = janelaFalsa();
    const apagar = ligarInerciaDaRoda(f.janela);
    const roda = f.ouvintes.get("wheel")!;
    let impedido = false;
    roda({
      deltaY: 100,
      deltaMode: 0,
      ctrlKey: true,
      defaultPrevented: false,
      target: document.body,
      preventDefault: () => {
        impedido = true;
      },
    } as unknown as Event);
    expect(impedido).toBe(false);
    apagar();
  });
});

/**
 * Quem CHAMA a guarda, não só a guarda.
 *
 * Acrescentado por mim ao rever: os testes acima provam que `inerciaDesejada()`
 * recusa com ponteiro grosso, mas nenhum deles morria se o `SmoothScroll`
 * passasse `ponteiroFino: true` fixo — mutei essa linha e os 18 continuaram
 * verdes. E é a linha mais importante do conjunto: é ela que mantém a inércia
 * FORA dos telemóveis, que é a condição inteira sob a qual isto foi aceite.
 * Medido neste sítio: o Lighthouse móvel dá 668 ms de tempo bloqueado em
 * /clientes, ou seja a linha principal já está com um excesso de 4,5x sobre o
 * alvo — pôr lá um interpolador por quadro seria juntar trabalho onde já falta.
 */
describe("SmoothScroll: quem chama a guarda também é vigiado", () => {
  async function fonte() {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    return readFileSync(join(process.cwd(), "src/components/motion/SmoothScroll.tsx"), "utf8");
  }

  it("pergunta mesmo ao dispositivo se o ponteiro é fino", async () => {
    expect(
      /ponteiroFino:\s*window\.matchMedia\(\s*["\']\(pointer:\s*fine\)["\']\s*\)\.matches/.test(
        await fonte(),
      ),
      "o SmoothScroll deixou de perguntar pelo ponteiro — a inércia passaria a valer no telemóvel",
    ).toBe(true);
  });

  it("pergunta mesmo pelo movimento reduzido", async () => {
    expect(/movimentoReduzido:\s*prefersReducedMotion\(\)/.test(await fonte())).toBe(true);
  });

  it("nenhuma das três condições está fixada a um literal", async () => {
    const f = await fonte();
    for (const campo of ["ligada", "movimentoReduzido", "ponteiroFino"]) {
      expect(
        new RegExp(`${campo}:\\s*(true|false)\\b`).test(f),
        `${campo} está fixado a um literal em vez de ser perguntado`,
      ).toBe(false);
    }
  });
});
