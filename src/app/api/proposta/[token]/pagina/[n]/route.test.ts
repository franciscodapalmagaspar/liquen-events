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

const H = vi.hoisted(() => ({
  completo: true,
  sinal: undefined as AbortSignal | undefined,
  erro: null as Error | null,
}));

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
  SemVagaParaDocumentos: class SemVagaParaDocumentos extends Error {},
  PedidoCortado: class PedidoCortado extends Error {},
  larguraPedida: () => 1200,
  imagemDaPagina: async (
    _chave: string,
    obterBytes: () => Promise<Uint8Array>,
    _n: number,
    _l: number,
    opcoes?: { signal?: AbortSignal },
  ) => {
    H.sinal = opcoes?.signal;
    if (H.erro) throw H.erro;
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
    // E a CDN da Vercel guarda-a UMA HORA (17/11: não sabe quando um link é cortado); o browser continua a ver `private`.
    expect(res.headers.get("Vercel-CDN-Cache-Control")).toBe("max-age=3600");
    expect(res.headers.get("Cache-Control")).toMatch(/^private,/);
  });

  it("com uma versão antiga ou sem versão: nada na CDN", async () => {
    H.completo = true;
    for (const qs of ["?v=antiga", ""]) {
      esquecerLinksLidos();
      const res = await GET(new Request(`https://liquen.test/api/proposta/bom/pagina/1${qs}`), {
        params: Promise.resolve({ token: "bom", n: "1" }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
      expect(res.headers.get("Vercel-CDN-Cache-Control")).toBeNull();
    }
  });

  it("incompleto: serve-se, mas não se guarda", async () => {
    H.completo = false;
    const res = await pedir();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(res.headers.get("Vercel-CDN-Cache-Control")).toBeNull();
  });

  it("a fila dos documentos recebe o sinal do pedido; cheia dá 503, cortado 499 (2.ª revisão de 17/11)", async () => {
    const { SemVagaParaDocumentos, PedidoCortado } = await import("@/lib/paginas-do-pdf");
    const { log } = await import("@/lib/logger");
    vi.mocked(log.error).mockClear();
    H.completo = true;
    expect((await pedir()).status).toBe(200);
    expect(H.sinal).toBeInstanceOf(AbortSignal);
    try {
      H.erro = new SemVagaParaDocumentos();
      const cheia = await pedir();
      expect(cheia.status).toBe(503);
      expect(cheia.headers.get("Retry-After")).toBe("2");
      H.erro = new PedidoCortado();
      expect((await pedir()).status).toBe(499);
      expect(log.error).not.toHaveBeenCalled();
    } finally {
      H.erro = null;
    }
  });
});
