import { describe, it, expect, vi } from "vitest";

/**
 * Revisão de 14/11 (2.ª), n.º 5: se o plano da proposta rebentar, não se sabe
 * que páginas existem nem como se chamam. Até aqui contavam-se TODAS as chaves
 * de `fotosDasPaginas` — as órfãs também —, e a frase do travão mostrava a
 * chave crua (`tema:0:3`). Agora conta só o que se sabe nomear (a capa), e o
 * erro fica registado.
 */
const erro = vi.hoisted(() => vi.fn());
vi.mock("./logger", () => ({ log: { error: erro, warn: vi.fn(), info: vi.fn() } }));
vi.mock("./pdf-editorial/plano", () => ({
  planoDaProposta: () => {
    throw new Error("plano partido");
  },
  chavesDasPaginas: () => [],
  lugaresDaPagina: () => null,
}));

const { fotosEscolhidasDoDocumento } = await import("./fotos-escolhidas");

describe("o plano falhou", () => {
  it("só a capa conta, nenhuma chave crua, e o erro fica registado", () => {
    const r = fotosEscolhidasDoDocumento({
      coverImages: ["LIQ-1/capa.jpg"],
      fotosDasPaginas: { "tema:0:3": { fotos: ["LIQ-1/orfa.jpg"] } },
    } as never);
    expect(r).toEqual([{ ref: "LIQ-1/capa.jpg", chave: "capa", pagina: "Capa", lugar: 0 }]);
    expect(JSON.stringify(r)).not.toMatch(/tema:0:3/);
    expect(erro).toHaveBeenCalledTimes(1);
  });
});
