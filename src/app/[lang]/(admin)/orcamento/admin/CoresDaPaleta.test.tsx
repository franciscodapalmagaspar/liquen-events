// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CoresDaPaleta from "./CoresDaPaleta";

/**
 * As cores da paleta no «Fazer proposta» (13/11). O conta-gotas precisa de um
 * navegador a sério (tela e `createImageBitmap`); aqui prova-se o resto: as
 * cores dela aparecem, trocam-se, tiram-se, e voltam às automáticas — e, sem
 * conseguir ler as fotografias, o ecrã di-lo em vez de ficar à espera.
 */

afterEach(cleanup);

const fotos = [{ ref: "TESTE/a.jpg", url: "https://exemplo.invalid/a.jpg" }];

describe("as cores da paleta, escolhidas por ela", () => {
  it("mostra as cores dela, pela ordem, com o código", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("sem rede"))),
    );
    render(<CoresDaPaleta fotos={fotos} cores={["#D98AA6", "#A48CC9"]} onMudar={() => {}} />);
    expect(screen.getByRole("radio", { name: "Cor 1, #D98AA6" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Cor 2, #A48CC9" })).toBeTruthy();
    expect(screen.getByText(/Escolhidas por vocês/)).toBeTruthy();
  });

  it("«Tirar esta cor» tira-a, com a frase do Anular", () => {
    const onMudar = vi.fn();
    render(<CoresDaPaleta fotos={[]} cores={["#D98AA6", "#A48CC9"]} onMudar={onMudar} />);
    fireEvent.click(screen.getByRole("radio", { name: "Cor 1, #D98AA6" }));
    fireEvent.click(screen.getByRole("button", { name: "Tirar esta cor" }));
    expect(onMudar).toHaveBeenCalledWith(["#A48CC9"], "Cor #D98AA6 tirada da paleta.");
  });

  it("«Voltar às automáticas» devolve a paleta ao sistema", () => {
    const onMudar = vi.fn();
    render(<CoresDaPaleta fotos={[]} cores={["#D98AA6"]} onMudar={onMudar} />);
    fireEvent.click(screen.getByRole("button", { name: "Voltar às automáticas" }));
    expect(onMudar).toHaveBeenCalledWith(null, "A paleta volta às cores automáticas.");
  });

  it("sem conseguir ler as fotografias, di-lo — e o PDF continua a tirá-las sozinho", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("sem rede"))),
    );
    vi.stubGlobal("createImageBitmap", vi.fn());
    render(<CoresDaPaleta fotos={fotos} cores={null} onMudar={() => {}} />);
    expect(await screen.findByText(/Não deu para ler as cores destas fotografias/)).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
