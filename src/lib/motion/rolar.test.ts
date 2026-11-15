// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { comportamentoDoRolo, rolarAJanela, rolarAteCaberPorCima, rolarAteVer } from "./rolar";

/**
 * A porta por onde passa todo o rolo animado do back office.
 *
 * O que ela decide é uma coisa só — `"smooth"` ou `"auto"` — e é essa coisa que
 * sete chamadas espalhadas decidiam cada uma por si, todas da mesma maneira
 * errada. Aqui prova-se a decisão; o `rolo-que-respeita-quem-nao-quer-movimento`
 * prova que ninguém a volta a tomar por fora.
 */

let movimentoReduzido = false;

beforeEach(() => {
  movimentoReduzido = false;
  /**
   * `matches` é um GETTER e não um valor — de propósito.
   *
   * O `useReducedMotion` guarda a `MediaQueryList` em cache ao nível do módulo,
   * com a razão escrita lá. Com um valor fixo, o primeiro teste deste ficheiro
   * congelava a resposta para os seguintes, e o caso do movimento reduzido
   * passava a medir o que o primeiro calhou de pedir. É a mesma armadilha (e o
   * mesmo duplo) do `useEntradaAoChegar.test.tsx`.
   */
  vi.stubGlobal(
    "matchMedia",
    (consulta: string) =>
      ({
        get matches() {
          return consulta.includes("prefers-reduced-motion") ? movimentoReduzido : false;
        },
        media: consulta,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("quem pediu para não animar não leva a página a passear", () => {
  it("com a preferência ligada, o rolo é seco", () => {
    movimentoReduzido = true;
    expect(comportamentoDoRolo()).toBe("auto");

    const alvo = document.createElement("div");
    const levar = vi.fn();
    alvo.scrollIntoView = levar;
    rolarAteVer(alvo, { block: "start" });

    expect(levar).toHaveBeenCalledWith({ block: "start", behavior: "auto" });
  });

  it("sem a preferência, o rolo é suave — o gesto não desaparece para os outros", () => {
    // O controlo que impede a correcção preguiçosa: tirar o `"smooth"` a toda a
    // gente também punha o teste de cima verde, e piorava o produto.
    expect(comportamentoDoRolo()).toBe("smooth");

    const alvo = document.createElement("div");
    const levar = vi.fn();
    alvo.scrollIntoView = levar;
    rolarAteVer(alvo, { block: "center" });

    expect(levar).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
  });

  it("o `behavior` de quem chama não existe — a decisão é sempre desta porta", () => {
    // O tipo já o proíbe (`Omit<…, "behavior">`), mas os tipos não correm em
    // produção. Se alguém passar um `behavior` por um `as`, é o daqui que fica.
    movimentoReduzido = true;
    const alvo = document.createElement("div");
    const levar = vi.fn();
    alvo.scrollIntoView = levar;
    rolarAteVer(alvo, { block: "start", behavior: "smooth" } as Parameters<typeof rolarAteVer>[1]);
    expect(levar.mock.calls[0][0].behavior).toBe("auto");
  });

  it("um alvo que não existe, ou sem `scrollIntoView`, não rebenta", () => {
    // As duas guardas que estavam escritas à mão em dois sítios diferentes: o
    // `document.getElementById` devolve `null`, e o jsdom não implementa
    // `scrollIntoView` (o `vitest.setup.ts` põe-lhe um esboço vazio, mas essa é
    // uma rede desta casa e não do ambiente). Metade dos testes de componente
    // do back office montam ecrãs que chamam isto.
    // O esboço vive no PROTÓTIPO; tapa-se com uma propriedade própria.
    const semMetodo = document.createElement("div");
    Object.defineProperty(semMetodo, "scrollIntoView", { value: undefined, configurable: true });
    expect(() => rolarAteVer(null, { block: "start" })).not.toThrow();
    expect(() => rolarAteVer(semMetodo, { block: "start" })).not.toThrow();
  });

  it("a janela segue a mesma regra do elemento", () => {
    const rolar = vi.fn();
    vi.stubGlobal("scrollBy", rolar);
    // `window.scrollBy` e `scrollBy` são o mesmo símbolo no jsdom; o `stubGlobal`
    // chega aos dois.
    rolarAJanela({ top: 120 });
    expect(rolar).toHaveBeenCalledWith({ top: 120, behavior: "smooth" });

    movimentoReduzido = true;
    rolarAJanela({ top: 120 });
    expect(rolar).toHaveBeenLastCalledWith({ top: 120, behavior: "auto" });
  });
});

/**
 * O que nasce por baixo do que se tocou tem de se ver por cima da barra de
 * baixo (auditoria do telemóvel, 14/11: o resumo do dia e a linha de escrever
 * uma tarefa nasciam POR BAIXO dela). O `nearest` do Chromium parava 40 px
 * antes, por isso a conta faz-se aqui.
 */
describe("rolarAteCaberPorCima", () => {
  function alvo(top: number, altura: number, margem = 98) {
    const el = document.createElement("div");
    el.style.scrollMarginBottom = `${margem}px`;
    el.style.scrollMarginTop = "57px"; // o cabeçalho colado, medido a 390 px
    document.body.appendChild(el);
    el.getBoundingClientRect = () =>
      ({ top, bottom: top + altura, height: altura, left: 0, right: 0, width: 0 }) as DOMRect;
    const chamadas: ScrollIntoViewOptions[] = [];
    el.scrollIntoView = (o?: boolean | ScrollIntoViewOptions) => {
      chamadas.push(o as ScrollIntoViewOptions);
    };
    return { el, chamadas };
  }

  beforeEach(() => {
    vi.stubGlobal("innerHeight", 664);
  });

  it("um alvo que acaba por baixo da barra sobe até o fundo assentar por cima dela", () => {
    const { el, chamadas } = alvo(512, 463);
    rolarAteCaberPorCima(el);
    expect(chamadas).toEqual([{ block: "end", behavior: "smooth" }]);
  });

  it("um alvo que já se vê inteiro por cima da barra não mexe a página", () => {
    const { el, chamadas } = alvo(100, 400); // acaba a 500, a barra começa a 566
    rolarAteCaberPorCima(el);
    expect(chamadas).toEqual([]);
  });

  it("um alvo mais alto do que o que sobra encosta o TOPO, que é o que se lê primeiro", () => {
    const { el, chamadas } = alvo(600, 700);
    rolarAteCaberPorCima(el);
    expect(chamadas).toEqual([{ block: "start", behavior: "smooth" }]);
  });

  it("e com movimento reduzido salta, não anima", () => {
    movimentoReduzido = true;
    const { el, chamadas } = alvo(512, 463);
    rolarAteCaberPorCima(el);
    expect(chamadas[0]?.behavior).toBe("auto");
  });
});
