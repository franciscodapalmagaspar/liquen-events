// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  PastilhaDaImportacao,
  type FotoAImportar,
  type ImportacaoVisivel,
} from "./PastilhaDaImportacao";

afterEach(cleanup);

const fotos = (n: number, state: FotoAImportar["state"] = "pending"): FotoAImportar[] =>
  Array.from({ length: n }, (_, i) => ({
    path: `t/f${i}.jpg`,
    thumb: `https://cdn.test/${i}.jpg`,
    state,
  }));

function montar(job: Partial<ImportacaoVisivel>, loteGrande = 16) {
  const accoes = { onRepetir: vi.fn(), onDescartar: vi.fn(), onParar: vi.fn() };
  render(
    <PastilhaDaImportacao
      job={{ photos: fotos(3), running: true, stopped: false, error: null, ...job }}
      loteGrande={loteGrande}
      {...accoes}
    />,
  );
  return accoes;
}

describe("PastilhaDaImportacao", () => {
  it("a correr: diz quantas vão a caminho e oferece Parar (e só Parar)", () => {
    const { onParar } = montar({});
    expect(screen.getByRole("status").textContent).toBe("A adicionar 3 fotos à proposta…");
    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    expect(onParar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Repetir" })).toBeNull();
  });

  it("a barra só aparece num lote grande, e conta o que já assentou", () => {
    montar({ photos: [...fotos(10, "done"), ...fotos(7)] }, 16);
    const barra = screen.getByRole("progressbar");
    expect(barra.getAttribute("aria-valuemax")).toBe("17");
    expect(barra.getAttribute("aria-valuenow")).toBe("10");
    cleanup();
    montar({ photos: fotos(16) }, 16);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("acabou bem: diz quantas entraram, sem botões", () => {
    montar({ photos: fotos(1, "done"), running: false });
    expect(screen.getByRole("status").textContent).toBe("1 foto adicionada à proposta.");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("acabou com falhas: diz quantas, e Repetir e Descartar chegam a quem os pediu", () => {
    const { onRepetir, onDescartar } = montar({
      photos: [...fotos(2, "done"), ...fotos(1, "failed")],
      running: false,
      error: "A rede caiu.",
    });
    expect(screen.getByRole("status").textContent).toBe("1 foto não entrou na proposta.");
    expect(screen.getByText(/2 entraram\. A rede caiu\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Repetir" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(onRepetir).toHaveBeenCalledTimes(1);
    expect(onDescartar).toHaveBeenCalledTimes(1);
  });

  it("parada a meio: diz que parou, sem a razão do erro", () => {
    montar({ photos: [...fotos(2, "failed")], running: false, stopped: true, error: "x" });
    expect(screen.getByRole("status").textContent).toBe("Parou — 2 fotos ficaram por adicionar.");
    expect(screen.getByText(/Continuam por adicionar/)).toBeTruthy();
  });

  it("mostra no máximo quatro miniaturas, e o resto como +N", () => {
    const { container } = render(
      <PastilhaDaImportacao
        job={{ photos: fotos(9), running: true, stopped: false, error: null }}
        loteGrande={16}
        onRepetir={() => {}}
        onDescartar={() => {}}
        onParar={() => {}}
      />,
    );
    expect(container.querySelectorAll("img")).toHaveLength(4);
    expect(screen.getByText("+5")).toBeTruthy();
  });
});
