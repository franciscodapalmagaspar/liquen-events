// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import LupaDoMosaico, { type FotoDaLupa } from "./LupaDoMosaico";

/**
 * A lupa da proposta online. Ela, 1/11: «a passagem das fotos está péssima».
 * O que aqui se prende é o que fazia a passagem má e o que não pode voltar:
 *   · a fotografia aparece JÁ com a pequena, e a grande só por cima quando
 *     chega (nunca um ecrã vazio à espera da rede);
 *   · as vizinhas estão montadas antes de o dedo lá chegar — e só elas;
 *   · uma grande que falha deixa a pequena, nunca um ícone partido;
 *   · fechar é imediato, pelo Esc, pelo «Fechar» ou por um toque ao lado.
 */

const t = {
  fechar: "Fechar",
  anterior: "Anterior",
  seguinte: "Seguinte",
  fotografia: "Fotografia",
};
const lista: FotoDaLupa[] = Array.from({ length: 8 }, (_, k) => ({
  pequena: `/p/${k}.avif`,
  grande: `/g/${k}.jpg`,
  forma: 1.5,
}));

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("a lupa do mosaico", () => {
  it("fechada: o diálogo está escondido e não pede fotografia nenhuma", () => {
    const { container } = render(<LupaDoMosaico aberta={null} t={t} aoFechar={() => {}} />);
    expect(container.querySelector(".pw-lb")).toHaveProperty("hidden", true);
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("abre na fotografia tocada, com o contador e o corpo sem rolar", () => {
    render(<LupaDoMosaico aberta={{ lista, i: 3 }} t={t} aoFechar={() => {}} />);
    expect(screen.getByRole("dialog")).not.toHaveProperty("hidden", true);
    expect(screen.getByText("4 / 8")).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement?.textContent).toBe("Fechar");
  });

  it("só as fotografias a duas de distância têm <img> — as vizinhas já pedidas", () => {
    const { container } = render(
      <LupaDoMosaico aberta={{ lista, i: 3 }} t={t} aoFechar={() => {}} />,
    );
    const folhas = Array.from(container.querySelectorAll(".pw-lb-folha"));
    expect(folhas).toHaveLength(8);
    const comFoto = folhas
      .map((f, k) => (f.querySelector("img") ? k : null))
      .filter((k) => k !== null);
    expect(comFoto).toEqual([1, 2, 3, 4, 5]);
  });

  it("a pequena aparece logo; a grande fica invisível até chegar", () => {
    const { container } = render(
      <LupaDoMosaico aberta={{ lista, i: 0 }} t={t} aoFechar={() => {}} />,
    );
    const folha = container.querySelector('[data-k="0"]')!;
    const pequena = folha.querySelector<HTMLImageElement>(".pw-lb-pequena")!;
    const grande = folha.querySelector<HTMLImageElement>(".pw-lb-grande")!;
    expect(pequena.getAttribute("src")).toBe("/p/0.avif");
    expect(grande.classList.contains("pw-on")).toBe(false);
    fireEvent.load(grande);
    expect(grande.classList.contains("pw-on")).toBe(true);
  });

  it("uma grande que falha sai, e fica a pequena", () => {
    const { container } = render(
      <LupaDoMosaico aberta={{ lista, i: 0 }} t={t} aoFechar={() => {}} />,
    );
    const folha = container.querySelector('[data-k="0"]')!;
    fireEvent.error(folha.querySelector(".pw-lb-grande")!);
    expect(folha.querySelector(".pw-lb-grande")).toBeNull();
    expect(folha.querySelector(".pw-lb-pequena")).not.toBeNull();
  });

  it("a caixa tem a forma da fotografia", () => {
    const { container } = render(
      <LupaDoMosaico aberta={{ lista, i: 0 }} t={t} aoFechar={() => {}} />,
    );
    const quadro = container.querySelector<HTMLElement>('[data-k="0"] .pw-lb-quadro')!;
    expect(quadro.classList.contains("pw-lb-medido")).toBe(true);
    expect(quadro.style.getPropertyValue("--pw-lb-r")).toBe("1.5");
  });

  it("as setas e o teclado andam, e param nas pontas", () => {
    render(<LupaDoMosaico aberta={{ lista, i: 0 }} t={t} aoFechar={() => {}} />);
    expect(screen.getByLabelText("Anterior")).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByLabelText("Seguinte"));
    expect(screen.getByText("2 / 8")).toBeTruthy();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getByText("3 / 8")).toBeTruthy();
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(screen.getByText("2 / 8")).toBeTruthy();
  });

  it("fecha pelo Esc, pelo «Fechar» e por um toque ao lado da fotografia — não na fotografia", () => {
    const aoFechar = vi.fn();
    const { container } = render(
      <LupaDoMosaico aberta={{ lista, i: 2 }} t={t} aoFechar={aoFechar} />,
    );
    fireEvent.click(container.querySelector('[data-k="2"] .pw-lb-pequena')!);
    expect(aoFechar).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('[data-k="2"]')!);
    expect(aoFechar).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(aoFechar).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByText("Fechar"));
    expect(aoFechar).toHaveBeenCalledTimes(3);
  });

  it("ao fechar, o corpo volta a rolar", () => {
    const { rerender } = render(
      <LupaDoMosaico aberta={{ lista, i: 0 }} t={t} aoFechar={() => {}} />,
    );
    expect(document.body.style.overflow).toBe("hidden");
    rerender(<LupaDoMosaico aberta={null} t={t} aoFechar={() => {}} />);
    expect(document.body.style.overflow).toBe("");
  });
});
