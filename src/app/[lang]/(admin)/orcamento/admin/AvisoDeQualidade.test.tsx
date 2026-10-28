// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { useAvisoDeQualidade } from "./AvisoDeQualidade";

/**
 * Ela (28/10): «quando tentamos colocar uma foto, [o sistema] diga que aquela
 * foto vai ficar com uma qualidade péssima… que avise mesmo». E «Avisa, não
 * bloqueia».
 */

const medidas = new Map<string, { width: number; height: number }>();
beforeEach(() => {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async (f: File) => ({
      ...(medidas.get(f.name) ?? { width: 4000, height: 3000 }),
      close() {},
    })),
  );
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  medidas.clear();
});

const ficheiro = (nome: string, w: number, h: number) => {
  medidas.set(nome, { width: w, height: h });
  return new File(["x"], nome, { type: "image/jpeg" });
};

function Banco({ files, onFim }: { files: File[]; onFim: (f: File[]) => void }) {
  const aviso = useAvisoDeQualidade();
  const [a, setA] = useState(false);
  return (
    <>
      <button
        onClick={async () => {
          setA(true);
          onFim(await aviso.filtrarFicheiros(files, "tema"));
        }}
        disabled={a}
      >
        carregar
      </button>
      {aviso.dialogo}
    </>
  );
}

describe("o aviso ao pôr uma foto", () => {
  it("fotos boas entram sem pergunta nenhuma", async () => {
    const onFim = vi.fn();
    render(<Banco files={[ficheiro("boa.jpg", 3000, 4000)]} onFim={onFim} />);
    await userEvent.click(screen.getByText("carregar"));
    await vi.waitFor(() => expect(onFim).toHaveBeenCalled());
    expect(onFim.mock.calls[0][0].map((f: File) => f.name)).toEqual(["boa.jpg"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uma do Pinterest abre o aviso com o porquê; «Escolher outra» deixa-a de fora", async () => {
    const onFim = vi.fn();
    render(
      <Banco
        files={[ficheiro("boa.jpg", 3000, 4000), ficheiro("pin.jpg", 736, 1104)]}
        onFim={onFim}
      />,
    );
    await userEvent.click(screen.getByText("carregar"));
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("Esta foto vai ficar com má qualidade");
    expect(dialogo).toHaveTextContent("pin.jpg");
    expect(dialogo).toHaveTextContent(/Pinterest/);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Escolher outra" }));
    });
    await vi.waitFor(() => expect(onFim).toHaveBeenCalled());
    expect(onFim.mock.calls[0][0].map((f: File) => f.name)).toEqual(["boa.jpg"]);
  });

  it("«Usar na mesma» deixa entrar todas", async () => {
    const onFim = vi.fn();
    render(<Banco files={[ficheiro("pequena.jpg", 600, 400)]} onFim={onFim} />);
    await userEvent.click(screen.getByText("carregar"));
    await screen.findByRole("dialog");
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Usar na mesma" }));
    });
    await vi.waitFor(() => expect(onFim).toHaveBeenCalled());
    expect(onFim.mock.calls[0][0]).toHaveLength(1);
  });

  it("sem saber medir (browser sem createImageBitmap), não se pergunta nada", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const onFim = vi.fn();
    render(<Banco files={[ficheiro("pin.jpg", 736, 1104)]} onFim={onFim} />);
    await userEvent.click(screen.getByText("carregar"));
    await vi.waitFor(() => expect(onFim).toHaveBeenCalled());
    expect(onFim.mock.calls[0][0]).toHaveLength(1);
  });
});
