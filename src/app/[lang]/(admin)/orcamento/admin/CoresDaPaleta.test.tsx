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
    expect(screen.getByRole("button", { name: "Cor 1, #D98AA6" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cor 2, #A48CC9" })).toBeTruthy();
    expect(screen.getByText(/Escolhidas por vocês/)).toBeTruthy();
  });

  it("«Tirar esta cor» tira-a, com a frase do Anular", () => {
    const onMudar = vi.fn();
    render(<CoresDaPaleta fotos={[]} cores={["#D98AA6", "#A48CC9"]} onMudar={onMudar} />);
    fireEvent.click(screen.getByRole("button", { name: "Cor 1, #D98AA6" }));
    fireEvent.click(screen.getByRole("button", { name: "Tirar esta cor" }));
    expect(onMudar).toHaveBeenCalledWith(["#A48CC9"], "Cor #D98AA6 tirada da paleta.");
  });

  it("«Outra cor»: qualquer cor, e só grava ao carregar em «Pôr»", () => {
    const onMudar = vi.fn();
    render(<CoresDaPaleta fotos={[]} cores={["#D98AA6", "#A48CC9"]} onMudar={onMudar} />);
    fireEvent.click(screen.getByRole("button", { name: "Cor 2, #A48CC9" }));
    fireEvent.change(screen.getByLabelText("Outra cor"), { target: { value: "#2f6b4f" } });
    expect(onMudar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Pôr #2F6B4F" }));
    expect(onMudar).toHaveBeenCalledWith(["#D98AA6", "#2F6B4F"], "Cor #2F6B4F posta na paleta.");
  });

  it("«Voltar à sugestão» devolve a paleta às cores das flores", () => {
    const onMudar = vi.fn();
    render(<CoresDaPaleta fotos={[]} cores={["#D98AA6"]} onMudar={onMudar} />);
    fireEvent.click(screen.getByRole("button", { name: "Voltar à sugestão" }));
    expect(onMudar).toHaveBeenCalledWith(null, "A paleta volta às cores sugeridas.");
  });

  it("sem conseguir ler as fotografias, di-lo — e o PDF continua a tirá-las sozinho", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("sem rede"))),
    );
    vi.stubGlobal("createImageBitmap", vi.fn());
    render(<CoresDaPaleta fotos={fotos} cores={null} onMudar={() => {}} />);
    expect(await screen.findByText(/Não deu para ler as fotografias aqui/)).toBeTruthy();
    vi.unstubAllGlobals();
  });

  /* ── Os erros que a revisão de 13/11 encontrou — cada um com o seu teste ── */

  it("«Juntar uma cor» com uma cor à espera não rebenta (era `actuais[i]` indefinido)", () => {
    const onMudar = vi.fn();
    render(<CoresDaPaleta fotos={[]} cores={["#D98AA6"]} onMudar={onMudar} />);
    fireEvent.click(screen.getByRole("button", { name: "Juntar uma cor" }));
    // Mexer no seletor põe a cor «à espera» no lugar do «+».
    fireEvent.change(screen.getByLabelText("Outra cor"), { target: { value: "#2f6b4f" } });
    expect(screen.getByRole("button", { name: "Juntar uma cor, #2F6B4F" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pôr #2F6B4F" }));
    expect(onMudar).toHaveBeenCalledWith(["#D98AA6", "#2F6B4F"], "Cor #2F6B4F posta na paleta.");
  });

  it("sem conseguir ler as fotografias, continua a dar para escolher cores (o «+»)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("sem rede"))),
    );
    vi.stubGlobal("createImageBitmap", vi.fn());
    render(<CoresDaPaleta fotos={fotos} cores={null} onMudar={() => {}} />);
    expect(await screen.findByRole("button", { name: "Juntar uma cor" })).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("pôr uma cor parecida com outra: fica a NOVA, onde ela a pôs; sai a antiga", () => {
    const onMudar = vi.fn();
    render(
      <CoresDaPaleta fotos={[]} cores={["#D98AA6", "#A48CC9", "#2F6B4F"]} onMudar={onMudar} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cor 3, #2F6B4F" }));
    // Quase igual à cor 1 (a antiga sai, a nova fica no lugar 3 → passa a 2.º).
    fireEvent.change(screen.getByLabelText("Outra cor"), { target: { value: "#d98aa7" } });
    fireEvent.click(screen.getByRole("button", { name: "Pôr #D98AA7" }));
    expect(onMudar).toHaveBeenCalledWith(["#A48CC9", "#D98AA7"], "Cor #D98AA7 posta na paleta.");
  });

  it("o endereço da fotografia chega DEPOIS (a proposta a abrir): lê-se quando chega", async () => {
    const buscar = vi.fn(() => Promise.reject(new Error("sem rede")));
    vi.stubGlobal("fetch", buscar);
    vi.stubGlobal("createImageBitmap", vi.fn());
    const { rerender } = render(
      <CoresDaPaleta fotos={[{ ref: "TESTE/a.jpg" }]} cores={null} onMudar={() => {}} />,
    );
    await screen.findByText(/Não deu para ler as fotografias aqui/);
    expect(buscar).not.toHaveBeenCalled();
    rerender(
      <CoresDaPaleta
        fotos={[{ ref: "TESTE/a.jpg", url: "https://exemplo.invalid/a-media.jpg" }]}
        cores={null}
        onMudar={() => {}}
      />,
    );
    await vi.waitFor(() => expect(buscar).toHaveBeenCalledTimes(1));
    vi.unstubAllGlobals();
  });
});
