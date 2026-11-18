// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { Glass, SEM_VIDRO } from "./Glass";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O VIDRO MONTA-SE E — SOBRETUDO — DESMONTA-SE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A refracção não se prova aqui: precisa de `canvas` e de um motor Chromium, e
 * o `jsdom` não tem nenhum dos dois. Está provada onde se pode ver, com a
 * grelha por trás (ver a nota no `docs/LIQUID-GLASS.md`).
 *
 * O que se prova aqui é o que um teste de unidade apanha melhor do que um olho:
 * que o `destroy()` corre. Cada `attach()` pendura um `<filter>` no `<defs>` do
 * documento, e uma vista que abre e fecha vinte vezes sem desmontar deixa vinte
 * lá dentro. Ninguém VÊ isso — vê-se o vigésimo primeiro vidro a custar o dobro
 * a desenhar, três semanas depois, sem nada que ligue uma coisa à outra.
 *
 * E o `jsdom` cai sempre no caminho alternativo (não há `backdrop-filter` com
 * `url()` fora do Chromium), que é o mesmo que o Safari e o Firefox percorrem —
 * portanto este ficheiro guarda também esse.
 *
 * O motor chega por `import()` (para não viajar no arranque das páginas
 * públicas), e por isso as afirmações sobre o que ele fez esperam por ele.
 */

/** Um `matchMedia` que responde que sim às consultas dadas, e que não ao resto. */
function preferencias(sim: string[]) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: sim.includes(q),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a superfície de vidro", () => {
  it("marca-se como alternativa onde o motor não pode entrar", async () => {
    /* Safari e Firefox ignoram a declaração INTEIRA quando ela traz um filtro
       SVG — não degrada sozinha, some. O `data-lg-fallback` é o que deixa o CSS
       dar mais corpo ao rebordo onde o material não chegou. */
    const { container } = render(
      <Glass superficie="barra">
        <p>3 fotos selecionadas</p>
      </Glass>,
    );
    const el = container.querySelector<HTMLElement>(".lg")!;
    expect(el).not.toBeNull();
    await waitFor(() => expect(el.dataset.lgFallback).toBe("true"));
    expect(el.style.backdropFilter).toContain("blur(");
  });

  it("desmontar limpa o que montar sujou", async () => {
    const { container, unmount } = render(<Glass superficie="painel">olá</Glass>);
    const el = container.querySelector<HTMLElement>(".lg")!;
    await waitFor(() => expect(el.style.backdropFilter).not.toBe(""));

    /* O elemento é arrancado do documento pelo React, portanto guarda-se antes.
       O que se afirma é sobre o que o `destroy()` fez — e não sobre o React ter
       deitado a árvore fora, que faria este teste passar sozinho. */
    unmount();
    expect(el.style.backdropFilter).toBe("");
    expect(el.dataset.lgFallback).toBeUndefined();
  });

  it("guarda as classes de quem a usa, e junta a sua", () => {
    /* A `lg` é o que o `globals.css` procura para desenhar o rebordo, e é o que o
       `specular()` acende. Uma `className` que a substituísse deixava a barra
       com vidro e sem reflexo — e isso não dá erro nenhum, só fica feio. */
    const { container } = render(
      <Glass superficie="barra" className="rounded-2xl px-4">
        olá
      </Glass>,
    );
    const el = container.querySelector<HTMLElement>(".lg")!;
    expect(el.className).toContain("rounded-2xl");
    expect(el.className).toContain("px-4");
  });

  it("desenha o elemento que lhe pedirem", () => {
    const { container } = render(
      <Glass superficie="barra" as="nav">
        olá
      </Glass>,
    );
    expect(container.querySelector("nav.lg")).not.toBeNull();
  });

  it("passa os atributos de quem a usa (a barra de cookies é uma região com nome)", () => {
    const { container } = render(
      <Glass superficie="painel" role="region" aria-label="Aviso de cookies" style={{ bottom: 12 }}>
        olá
      </Glass>,
    );
    const el = container.querySelector<HTMLElement>(".lg")!;
    expect(el.getAttribute("role")).toBe("region");
    expect(el.getAttribute("aria-label")).toBe("Aviso de cookies");
    expect(el.style.bottom).toBe("12px");
  });

  it("não se monta a quem pediu menos transparência, mais contraste ou cores forçadas", async () => {
    /* É o «Reduzir transparência» da Apple: o material sai e fica a tinta
       opaca. O CSS repete a regra; aqui prova-se que o motor nem é chamado. */
    preferencias([SEM_VIDRO]);
    const { container } = render(<Glass superficie="painel">olá</Glass>);
    const el = container.querySelector<HTMLElement>(".lg")!;
    await new Promise((r) => setTimeout(r, 30));
    expect(el.style.backdropFilter).toBe("");
    expect(el.dataset.lgFallback).toBeUndefined();
  });

  it("com `quando`, só se monta onde a condição se cumpre", async () => {
    preferencias([]);
    const { container } = render(
      <Glass superficie="painel" quando="(pointer: fine)">
        olá
      </Glass>,
    );
    const el = container.querySelector<HTMLElement>(".lg")!;
    await new Promise((r) => setTimeout(r, 30));
    expect(el.style.backdropFilter).toBe("");
    cleanup();

    preferencias(["(pointer: fine)"]);
    const outro = render(
      <Glass superficie="painel" quando="(pointer: fine)">
        olá
      </Glass>,
    );
    const el2 = outro.container.querySelector<HTMLElement>(".lg")!;
    await waitFor(() => expect(el2.style.backdropFilter).toContain("blur("));
  });

  it("desmontar antes de o motor chegar não deixa vidro nenhum para trás", async () => {
    const { container, unmount } = render(<Glass superficie="painel">olá</Glass>);
    const el = container.querySelector<HTMLElement>(".lg")!;
    unmount();
    await new Promise((r) => setTimeout(r, 30));
    expect(el.style.backdropFilter).toBe("");
    expect(el.dataset.lgFallback).toBeUndefined();
  });

  it("um elemento parado ganha posição para o rebordo, mesmo sem motor", () => {
    /* O rebordo é um `::after` com `inset: 0`: sem ancestral posicionado,
       desenhava-se à volta de OUTRA caixa da página. */
    preferencias([SEM_VIDRO]);
    const { container } = render(<Glass superficie="barra">olá</Glass>);
    const el = container.querySelector<HTMLElement>(".lg")!;
    expect(el.style.position).toBe("relative");
  });

  it("com `ativo={false}` não se monta — e desmonta-se quando passa a falso", async () => {
    const { container, rerender } = render(<Glass superficie="painel">olá</Glass>);
    const el = container.querySelector<HTMLElement>(".lg")!;
    await waitFor(() => expect(el.style.backdropFilter).not.toBe(""));
    rerender(
      <Glass superficie="painel" ativo={false}>
        olá
      </Glass>,
    );
    expect(el.style.backdropFilter).toBe("");
    expect(el.dataset.lgFallback).toBeUndefined();
  });

  it("com `soComMotor`, onde o motor não pode entrar não há desfoque de recurso", async () => {
    /* O jsdom é como o Safari: `suportado()` diz que não. O recurso seria um
       `blur(12px)` — exactamente o desfoque fixo que se tirou da barra de
       cookies por custo. Ali fica a tinta. */
    const { container } = render(
      <Glass superficie="painel" soComMotor>
        olá
      </Glass>,
    );
    const el = container.querySelector<HTMLElement>(".lg")!;
    await new Promise((r) => setTimeout(r, 30));
    expect(el.style.backdropFilter).toBe("");
    expect(el.dataset.lgFallback).toBeUndefined();
  });
});
