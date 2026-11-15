// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { EstadoDaGravacaoNaBarra } from "./EstadoDaGravacaoNaBarra";
import { textoDaGravacao, type EstadoDaGravacaoNoEcra } from "./ProposalStudio";

afterEach(cleanup);

function props(estado: EstadoDaGravacaoNoEcra, haEstado = true) {
  const texto = textoDaGravacao(estado, new Date(2026, 10, 15, 14, 32));
  return { haEstado, estado, texto, titulo: texto.longo, comMargem: false };
}

/* 2.ª revisão de 15/11: a região trocava `aria-live` polite→assertive no
   instante do alarme — e há leitores que anunciam com o valor antigo. */
describe("EstadoDaGravacaoNaBarra", () => {
  it("duas regiões fixas: o atributo `aria-live` nunca muda, e o alarme cai na `assertive`", () => {
    const { container, rerender } = render(<EstadoDaGravacaoNaBarra {...props("guardado")} />);
    const regioes = () => [...container.querySelectorAll("[data-estado-da-gravacao]")];
    const [educada, urgente] = regioes();
    expect(educada.getAttribute("aria-live")).toBe("polite");
    expect(urgente.getAttribute("aria-live")).toBe("assertive");
    expect(educada.textContent).toMatch(/guardado no servidor/);
    expect(urgente.textContent, "com tudo bem, a dos alarmes está calada").toBe("");

    const mudancas: string[] = [];
    const obs = new MutationObserver((ms) =>
      ms.forEach((m) => m.attributeName === "aria-live" && mudancas.push(m.attributeName)),
    );
    for (const r of regioes()) obs.observe(r, { attributes: true });

    rerender(<EstadoDaGravacaoNaBarra {...props("so-neste-computador")} />);
    expect(regioes(), "as mesmas duas, sem remontar").toEqual([educada, urgente]);
    expect(urgente.textContent).toMatch(/só neste computador/);
    expect(educada.textContent, "o alarme não vai pela educada").toBe("");

    rerender(<EstadoDaGravacaoNaBarra {...props("nao-dura-ao-deploy")} />);
    expect(urgente.textContent).not.toBe("");
    expect(educada.textContent).toBe("");

    rerender(<EstadoDaGravacaoNaBarra {...props("guardado")} />);
    expect(urgente.textContent).toBe("");
    expect(educada.textContent).toMatch(/guardado/);

    obs.takeRecords().forEach((m) => m.attributeName === "aria-live" && mudancas.push("x"));
    obs.disconnect();
    expect(mudancas, "nenhuma região trocou de `aria-live`").toEqual([]);
    expect(educada.getAttribute("aria-live")).toBe("polite");
    expect(urgente.getAttribute("aria-live")).toBe("assertive");
  });

  it("sem estado nenhum, as duas existem e estão vazias", () => {
    const { container } = render(<EstadoDaGravacaoNaBarra {...props("guardado", false)} />);
    const r = [...container.querySelectorAll("[aria-live]")];
    expect(r.map((e) => e.getAttribute("aria-live"))).toEqual(["polite", "assertive"]);
    expect(r.every((e) => e.textContent === "")).toBe(true);
  });
});
