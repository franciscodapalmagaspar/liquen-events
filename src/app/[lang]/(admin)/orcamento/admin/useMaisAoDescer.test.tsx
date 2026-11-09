// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useMaisAoDescer } from "./useMaisAoDescer";

/**
 * «aguentar milhares de temas» (9/11): desenha-se o início da lista, e mais
 * quando a marca do fim se aproxima do ecrã.
 */
let avisar: ((visivel: boolean) => void) | null = null;
class ObservadorFingido {
  constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
    avisar = (v) => cb([{ isIntersecting: v }]);
  }
  observe() {}
  disconnect() {}
}

function Lista({ itens, chave, passo }: { itens: number[]; chave: string; passo?: number }) {
  const { aDesenhar, sentinela, temMais } = useMaisAoDescer(itens, chave, passo);
  return (
    <div>
      <p data-testid="n">{aDesenhar.length}</p>
      {temMais && <div ref={sentinela} />}
    </div>
  );
}

const mil = Array.from({ length: 1000 }, (_, i) => i);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  avisar = null;
});

describe("useMaisAoDescer", () => {
  it("desenha só o primeiro passo, e mais quando a marca se aproxima", () => {
    vi.stubGlobal("IntersectionObserver", ObservadorFingido);
    const { getByTestId } = render(<Lista itens={mil} chave="a" passo={60} />);
    expect(getByTestId("n").textContent).toBe("60");
    act(() => avisar?.(true));
    expect(getByTestId("n").textContent).toBe("120");
  });

  it("mudar a procura (a chave) volta ao início", () => {
    vi.stubGlobal("IntersectionObserver", ObservadorFingido);
    const { getByTestId, rerender } = render(<Lista itens={mil} chave="a" passo={60} />);
    act(() => avisar?.(true));
    expect(getByTestId("n").textContent).toBe("120");
    rerender(<Lista itens={mil} chave="b" passo={60} />);
    expect(getByTestId("n").textContent).toBe("60");
  });

  it("um passo maior (o tema aberto lá em baixo) desenha até ele", () => {
    vi.stubGlobal("IntersectionObserver", ObservadorFingido);
    const { getByTestId, rerender } = render(<Lista itens={mil} chave="a" passo={60} />);
    rerender(<Lista itens={mil} chave="a" passo={520} />);
    expect(getByTestId("n").textContent).toBe("520");
  });

  it("sem IntersectionObserver desenha tudo, como antes", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { getByTestId } = render(<Lista itens={mil} chave="a" passo={60} />);
    expect(getByTestId("n").textContent).toBe("1000");
  });
});
