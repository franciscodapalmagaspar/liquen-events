import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const propostaDoLink = vi.fn();
vi.mock("@/lib/proposta-do-link", () => ({ propostaDoLink: (t: string) => propostaDoLink(t) }));
vi.mock("@/lib/proposal-pdf-chave", () => ({ chaveDoPdf: () => "abcdef0123456789abcdef" }));
vi.mock("@/lib/proposta-idioma", () => ({ idiomaDaProposta: () => "pt" }));
const linksCortadosEm = vi.fn(async (): Promise<number | null> => null);
vi.mock("@/lib/links-cortados", () => ({
  linksCortadosEm: (p: string) => linksCortadosEm(p),
}));

import { esquecerLinksLidos, pdfDoLink } from "./paginas-da-proposta";

/**
 * Cada página da proposta é um pedido; o link resolve-se uma vez por minuto e
 * não uma vez por página — ver `pdfDoLink`.
 */
describe("o link das páginas", () => {
  beforeEach(() => {
    esquecerLinksLidos();
    propostaDoLink.mockReset();
    linksCortadosEm.mockReset();
    linksCortadosEm.mockResolvedValue(null);
  });

  it("resolve-se uma vez para as várias páginas do mesmo casal", async () => {
    propostaDoLink.mockResolvedValue({ proposta: { id: "p1", doc: {} } });
    const [a, b, c] = await Promise.all([pdfDoLink("t"), pdfDoLink("t"), pdfDoLink("t")]);
    expect(propostaDoLink).toHaveBeenCalledTimes(1);
    expect(a?.chave).toBe("p1:abcdef0123456789abcdef");
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("um link sem documento dá null, e uma falha não fica guardada", async () => {
    propostaDoLink.mockResolvedValueOnce(null);
    expect(await pdfDoLink("x")).toBeNull();
    propostaDoLink.mockRejectedValueOnce(new Error("rede"));
    await expect(pdfDoLink("y")).rejects.toThrow();
    propostaDoLink.mockResolvedValueOnce({ proposta: { id: "p2", doc: {} } });
    expect((await pdfDoLink("y"))?.chave).toMatch(/^p2:/);
  });

  it("um link cortado deixa de dar páginas JÁ, e não passado um minuto (13/11)", async () => {
    vi.useFakeTimers();
    try {
      propostaDoLink.mockResolvedValue({ proposta: { id: "p1", quoteId: "LIQ-1", doc: {} } });
      expect(await pdfDoLink("t")).not.toBeNull();
      // Dez segundos depois, ela corta os links do pedido…
      vi.advanceTimersByTime(10_000);
      linksCortadosEm.mockResolvedValue(Date.now());
      propostaDoLink.mockResolvedValue(null);
      vi.advanceTimersByTime(1_000);
      // …e a página seguinte já não sai.
      expect(await pdfDoLink("t")).toBeNull();
      expect(linksCortadosEm).toHaveBeenCalledWith("LIQ-1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("um corte ANTERIOR à leitura não a desfaz (o link novo, emitido depois, abre)", async () => {
    linksCortadosEm.mockResolvedValue(Date.now() - 60_000);
    propostaDoLink.mockResolvedValue({ proposta: { id: "p1", quoteId: "LIQ-1", doc: {} } });
    const a = await pdfDoLink("t");
    expect(await pdfDoLink("t")).toBe(a);
    expect(propostaDoLink).toHaveBeenCalledTimes(1);
  });

  it("passado um minuto, volta a perguntar (um link cortado deixa de abrir)", async () => {
    vi.useFakeTimers();
    try {
      propostaDoLink.mockResolvedValue({ proposta: { id: "p1", doc: {} } });
      await pdfDoLink("t");
      vi.advanceTimersByTime(61_000);
      propostaDoLink.mockResolvedValue(null);
      expect(await pdfDoLink("t")).toBeNull();
      expect(propostaDoLink).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
