// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChipDoDia } from "./ChipDoDia";

/**
 * Fase 10 do `docs/APPLE-CALENDARIO.md`, ponto 18: «`Delete` com Anular». Com
 * o foco numa marcação, `Delete` (ou `⌫`) abre a mesma pergunta do clique —
 * a remoção e o «Anular» são os da casa. Um pedido não se apaga daqui.
 */

afterEach(cleanup);

function chip(onApagar?: () => void) {
  render(
    <ChipDoDia
      cor="var(--bo-tinta-72)"
      titulo="Reunião"
      rotulo="Remover Reunião: Reunião"
      dica="Reunião"
      onClick={() => {}}
      onApagar={onApagar}
    />,
  );
  return screen.getByRole("button", { name: /Reunião/ });
}

describe("Delete numa marcação", () => {
  it("Delete e ⌫ pedem para remover", () => {
    const onApagar = vi.fn();
    const b = chip(onApagar);
    fireEvent.keyDown(b, { key: "Delete" });
    fireEvent.keyDown(b, { key: "Backspace" });
    expect(onApagar).toHaveBeenCalledTimes(2);
  });

  it("as outras teclas não", () => {
    const onApagar = vi.fn();
    fireEvent.keyDown(chip(onApagar), { key: "Enter" });
    expect(onApagar).not.toHaveBeenCalled();
  });

  it("sem `onApagar` (um pedido), Delete não faz nada", () => {
    expect(() => fireEvent.keyDown(chip(), { key: "Delete" })).not.toThrow();
  });
});
