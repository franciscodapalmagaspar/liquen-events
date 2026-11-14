import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA PÁGINA DE UM PDF INCOMPLETO NÃO SE GUARDA PARA SEMPRE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Auditoria de 13/11: o link do casal serve o PDF mesmo que lhe falte uma
 * fotografia (`servirIncompleto`), e a imagem de cada página ia com
 * `immutable` por um ano. A versão do endereço é a do CONTEÚDO, e não muda
 * quando ela repõe a fotografia — o telemóvel do casal ficava com a página
 * esburacada. Só o PDF completo se guarda para sempre.
 */

const H = vi.hoisted(() => ({ completo: true }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "1.2.3.4",
  rateLimit: async () => ({ ok: true }),
}));
vi.mock("@/lib/proposta-do-link", () => ({
  propostaDoLink: async (t: string) => (t === "bom" ? { proposta: { id: "p1", doc: {} } } : null),
}));
vi.mock("@/lib/proposal-pdf-chave", () => ({ chaveDoPdf: () => "abcdef0123456789abcdef" }));
vi.mock("@/lib/proposta-idioma", () => ({ idiomaDaProposta: () => "pt" }));
vi.mock("@/lib/proposal-pdf-cache", () => ({
  pdfDaPropostaComEstado: async () => ({ pdf: Buffer.from("%PDF"), completo: H.completo }),
  pdfDaPropostaEmCache: async () => Buffer.from("%PDF"),
}));
// O desenho da página em si não interessa aqui — só que lê os bytes do link.
vi.mock("@/lib/paginas-do-pdf", () => ({
  larguraPedida: () => 1200,
  imagemDaPagina: async (_chave: string, obterBytes: () => Promise<Uint8Array>) => {
    await obterBytes();
    return Buffer.from("webp");
  },
}));

const { GET } = await import("./route");
const { esquecerLinksLidos, versaoDaChave } = await import("@/lib/paginas-da-proposta");

const V = versaoDaChave("p1:abcdef0123456789abcdef");
const pedir = () =>
  GET(new Request(`https://liquen.test/api/proposta/bom/pagina/1?v=${V}`), {
    params: Promise.resolve({ token: "bom", n: "1" }),
  });

beforeEach(() => esquecerLinksLidos());

describe("a cache da página do PDF do casal", () => {
  it("completo e com a versão certa: guarda-se para sempre", async () => {
    H.completo = true;
    const res = await pedir();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("immutable");
  });

  it("incompleto: serve-se, mas não se guarda", async () => {
    H.completo = false;
    const res = await pedir();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
  });
});
