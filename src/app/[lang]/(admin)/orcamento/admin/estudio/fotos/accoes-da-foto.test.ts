import { describe, expect, it, vi } from "vitest";
import { accoesDaFoto, ehPrimeiraDestrutiva, type EntradaDasAccoes } from "./accoes-da-foto";

function entrada(extra: Partial<EntradaDasAccoes> = {}): EntradaDasAccoes {
  return {
    podeRecuar: true,
    podeAvancar: true,
    seleccionada: false,
    onRecuar: vi.fn(),
    onAvancar: vi.fn(),
    onAmpliar: vi.fn(),
    onSubstituir: vi.fn(),
    onPrincipal: vi.fn(),
    onSeleccionar: vi.fn(),
    onRemover: vi.fn(),
    ...extra,
  };
}

describe("accoesDaFoto", () => {
  it("sem lugar de destaque, são seis e a de remover fica em último", () => {
    const ids = accoesDaFoto(entrada()).map((a) => a.id);
    expect(ids).toEqual(["recuar", "avancar", "ampliar", "substituir", "seleccionar", "remover"]);
  });

  it("com lugar de destaque, aparece a da fotografia do cartão antes de escolher", () => {
    const ids = accoesDaFoto(entrada({ principal: true })).map((a) => a.id);
    expect(ids.indexOf("principal")).toBe(ids.indexOf("seleccionar") - 1);
    const ligada = accoesDaFoto(entrada({ principal: true })).find((a) => a.id === "principal");
    expect(ligada?.activa).toBe(true);
    expect(ligada?.rotulo).toBe("Deixar de ser a fotografia do cartão");
    const desligada = accoesDaFoto(entrada({ principal: false })).find((a) => a.id === "principal");
    expect(desligada?.rotulo).toBe("Fotografia do cartão (a primeira do tema no PDF)");
  });

  it("as setas desligam-se nas pontas", () => {
    const accoes = accoesDaFoto(entrada({ podeRecuar: false, podeAvancar: false }));
    expect(accoes.find((a) => a.id === "recuar")?.desativada).toBe(true);
    expect(accoes.find((a) => a.id === "avancar")?.desativada).toBe(true);
  });

  it("escolhida, a acção diz que retira da selecção", () => {
    const sel = accoesDaFoto(entrada({ seleccionada: true })).find((a) => a.id === "seleccionar");
    expect(sel?.rotulo).toBe("Retirar da selecção");
    expect(sel?.activa).toBe(true);
  });

  it("cada acção chama a função que lhe foi dada", () => {
    const e = entrada();
    accoesDaFoto(e)
      .find((a) => a.id === "remover")
      ?.onAccao();
    expect(e.onRemover).toHaveBeenCalledOnce();
  });

  it("só a primeira que apaga leva o traço", () => {
    const accoes = accoesDaFoto(entrada());
    const comTraco = accoes.map((_, i) => ehPrimeiraDestrutiva(accoes, i));
    expect(comTraco).toEqual([false, false, false, false, false, true]);
    expect(ehPrimeiraDestrutiva(accoes, 99)).toBe(false);
  });
});
