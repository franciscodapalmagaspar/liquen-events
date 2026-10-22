// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import MolaAoLargar from "./MolaAoLargar";
import { CHEGADA_MS, molaEmLinear } from "@/lib/motion/tokens";

/**
 * «Botões e cartões com mola» (22/10). Prende-se: o botão `.toque` volta com a
 * mola da casa ao largar o dedo; nada ao largar fora dele; nada com movimento
 * reduzido; e só se anima `scale` (composto).
 */

let reduzido = false;
const animate = vi.fn();

beforeEach(() => {
  reduzido = false;
  animate.mockReset();
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q.includes("reduce") ? reduzido : false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  HTMLElement.prototype.animate = animate as unknown as HTMLElement["animate"];
});

afterEach(cleanup);

function montar() {
  render(
    <>
      <MolaAoLargar />
      <button className="toque">Pedir orçamento</button>
      <button>Outro</button>
    </>,
  );
}

describe("o botão volta com mola ao largar", () => {
  it("carregar e largar no mesmo botão anima o scale com a mola da casa", () => {
    montar();
    const b = screen.getByRole("button", { name: "Pedir orçamento" });
    fireEvent.pointerDown(b);
    fireEvent.pointerUp(b);
    expect(animate).toHaveBeenCalledTimes(1);
    const [quadros, opcoes] = animate.mock.calls[0];
    expect(quadros).toEqual([{ scale: "0.97" }, { scale: "1" }]);
    expect(opcoes).toEqual({ duration: CHEGADA_MS, easing: molaEmLinear() });
  });

  it("largar fora do botão que se carregou não anima", () => {
    montar();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Pedir orçamento" }));
    fireEvent.pointerUp(screen.getByRole("button", { name: "Outro" }));
    expect(animate).not.toHaveBeenCalled();
  });

  it("um botão sem `.toque` não anima", () => {
    montar();
    const b = screen.getByRole("button", { name: "Outro" });
    fireEvent.pointerDown(b);
    fireEvent.pointerUp(b);
    expect(animate).not.toHaveBeenCalled();
  });

  it("com movimento reduzido não anima", () => {
    reduzido = true;
    montar();
    const b = screen.getByRole("button", { name: "Pedir orçamento" });
    fireEvent.pointerDown(b);
    fireEvent.pointerUp(b);
    expect(animate).not.toHaveBeenCalled();
  });

  it("vive no cromado do sítio", () => {
    const cromado = readFileSync(
      path.join(process.cwd(), "src/components/CromadoDoSitio.tsx"),
      "utf8",
    );
    expect(cromado).toMatch(/<MolaAoLargar \/>/);
  });
});
