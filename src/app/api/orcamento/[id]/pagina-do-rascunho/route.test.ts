import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * A rota da página do rascunho (A1). O desenho é o do motor do PDF e tem o seu
 * teste (`pagina-so.test.ts`); aqui prende-se a PORTA: quem pode, o que se
 * aceita, que se pede ao motor só a página `n`, e que a mesma página do mesmo
 * rascunho não se desenha duas vezes.
 */
const st = vi.hoisted(() => ({
  authed: true,
  quote: { id: "q1" } as unknown,
  render: vi.fn(async (_doc: unknown, _idioma: string, _o: { soPaginas?: number[] }) => ({
    pdf: Buffer.from("%PDF-1"),
    paginas: 14,
    missingImages: 0,
    truncations: [],
    fotos: {},
  })),
  imagens: new Map<string, Buffer>(),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/quotes-store", () => ({ getQuote: async () => st.quote }));
vi.mock("@/lib/proposal-doc-render", () => ({
  renderStoredEditorialPdfWithReport: st.render,
}));
vi.mock("@/lib/paginas-do-pdf", () => ({
  larguraPedida: (n: number) => (n <= 800 ? 800 : n <= 1200 ? 1200 : 1600),
  // Uma memória de verdade, como a do módulo: a chave e a página.
  imagemDaPagina: async (
    chave: string,
    obter: () => Promise<Uint8Array>,
    n: number,
    largura: number,
  ) => {
    const id = `${chave}:${n}:${largura}`;
    if (!st.imagens.has(id)) {
      await obter();
      st.imagens.set(id, Buffer.from("WEBP"));
    }
    return st.imagens.get(id)!;
  },
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { POST } from "./route";

const pedir = (body: unknown) =>
  POST(
    new Request("http://x/api/orcamento/q1/pagina-do-rascunho", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }) as unknown as NextRequest,
    { params: Promise.resolve({ id: "q1" }) },
  );

const DOC = { clientNames: "TESTE Ana & TESTE Rui", moodBoards: [] };

beforeEach(() => {
  st.authed = true;
  st.quote = { id: "q1" };
  st.render.mockClear();
  st.imagens.clear();
});

describe("POST /api/orcamento/[id]/pagina-do-rascunho", () => {
  it("401 sem sessão — e não desenha nada", async () => {
    st.authed = false;
    const res = await pedir({ doc: DOC, n: 3 });
    expect(res.status).toBe(401);
    expect(st.render).not.toHaveBeenCalled();
  });

  it("400 sem documento, ou com uma página que não é um número inteiro positivo", async () => {
    expect((await pedir({ n: 3 })).status).toBe(400);
    expect((await pedir({ doc: DOC, n: 0 })).status).toBe(400);
    expect((await pedir({ doc: DOC, n: 2.5 })).status).toBe(400);
    expect((await pedir("{nem json")).status).toBe(400);
  });

  it("404 quando o pedido não existe", async () => {
    st.quote = null;
    expect((await pedir({ doc: DOC, n: 3 })).status).toBe(404);
  });

  it("desenha SÓ a página pedida, e devolve-a em WebP com o total de páginas", async () => {
    const res = await pedir({ doc: DOC, n: 3, idioma: "en", largura: 1000 });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("X-Paginas")).toBe("14");
    expect(res.headers.get("Server-Timing")).toMatch(/^desenho;dur=\d+/);
    expect(st.render).toHaveBeenCalledTimes(1);
    const [, idioma, opcoes] = st.render.mock.calls[0];
    expect(idioma).toBe("en");
    expect(opcoes).toEqual({ soPaginas: [3] });
  });

  it("a mesma página do mesmo rascunho vem da memória — não se desenha outra vez", async () => {
    await pedir({ doc: DOC, n: 3 });
    const res = await pedir({ doc: DOC, n: 3 });
    expect(res.status).toBe(200);
    expect(res.headers.get("Server-Timing")).toMatch(/^memoria;/);
    expect(st.render).toHaveBeenCalledTimes(1);
    // Outra página, ou o rascunho mudado, desenha.
    await pedir({ doc: DOC, n: 4 });
    await pedir({ doc: { ...DOC, clientNames: "TESTE Ana & TESTE Rita" }, n: 3 });
    expect(st.render).toHaveBeenCalledTimes(3);
  });

  it("uma língua estranha cai no português", async () => {
    await pedir({ doc: DOC, n: 1, idioma: "xx" });
    expect(st.render.mock.calls[0][1]).toBe("pt");
  });
});
