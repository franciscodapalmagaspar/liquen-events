// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { destinoDaAncora } from "./SmoothScroll";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("SmoothScroll — as âncoras da própria página", () => {
  it("devolve o destino de uma âncora (também quando se clica num filho do link)", () => {
    document.body.innerHTML = `<a href="#servicos"><span>Serviços</span></a><section id="servicos"></section>`;
    const span = document.querySelector("span")!;
    expect(destinoDaAncora(span)).toBe(document.getElementById("servicos"));
  });

  it("a ligação de saltar para o conteúdo fica nativa", () => {
    document.body.innerHTML = `<a href="#conteudo">Saltar</a><main id="conteudo"></main>`;
    expect(destinoDaAncora(document.querySelector("a"))).toBeNull();
  });

  it("um destino que não existe, ou um link para outra página, ficam com o browser", () => {
    document.body.innerHTML = `<a id="a" href="#nada">x</a><a id="b" href="/galeria">y</a>`;
    expect(destinoDaAncora(document.getElementById("a"))).toBeNull();
    expect(destinoDaAncora(document.getElementById("b"))).toBeNull();
    expect(destinoDaAncora(null)).toBeNull();
  });
});
