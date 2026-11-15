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
  /** O que o armazenamento diz que já não existe (com a memória de 3 min). */
  faltam: new Set<string>(),
  perguntas: [] as unknown[],
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/quotes-store", () => ({ getQuote: async () => st.quote }));
vi.mock("@/lib/proposal-doc-render", () => ({
  renderStoredEditorialPdfWithReport: st.render,
  fotosQueSeSabeQueFaltam: async (_doc: unknown, opcoes: unknown) => {
    st.perguntas.push(opcoes);
    return new Set(st.faltam);
  },
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

const pedir = (body: unknown, qs = "") =>
  POST(
    new Request(`http://x/api/orcamento/q1/pagina-do-rascunho${qs}`, {
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
  st.faltam = new Set();
  st.perguntas = [];
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
    // Com memória das listagens: cada página desenhada perguntava de novo ao
    // armazenamento que fotos já não existem (revisão de 14/11, 2.ª, n.º 1).
    // E as que faltam são as da chave, passadas ao motor (menor n.º 4).
    expect(opcoes).toEqual({ soPaginas: [3], memoria: true, faltam: new Set() });
    expect(st.perguntas).toEqual([{ memoria: true }]);
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

  /**
   * Revisão de 14/11, menor n.º 4: repor uma foto da Reciclagem (ou levá-la)
   * não muda o rascunho — e a página já desenhada continuava a vir da memória.
   */
  it("levar ou repor uma foto muda a chave: a página desenha-se outra vez", async () => {
    await pedir({ doc: DOC, n: 3 });
    st.faltam = new Set(["tema:t/foi.jpg"]);
    const levada = await pedir({ doc: DOC, n: 3 });
    expect(levada.headers.get("Server-Timing")).toMatch(/^desenho;/);
    expect(st.render).toHaveBeenCalledTimes(2);
    expect(st.render.mock.calls[1][2]).toMatchObject({ faltam: new Set(["tema:t/foi.jpg"]) });
    // Reposta: volta a ser a primeira — essa já estava desenhada.
    st.faltam = new Set();
    const reposta = await pedir({ doc: DOC, n: 3 });
    expect(reposta.headers.get("Server-Timing")).toMatch(/^memoria;/);
    expect(st.render).toHaveBeenCalledTimes(2);
  });

  it("uma língua estranha cai no português", async () => {
    await pedir({ doc: DOC, n: 1, idioma: "xx" });
    expect(st.render.mock.calls[0][1]).toBe("pt");
  });

  /**
   * 3.ª revisão de 14/11, importante n.º 2: os pedidos dos 3 min seguintes a
   * uma foto mudar trazem `desde` (o instante da mudança) — podem cair em
   * qualquer instância, com a listagem de antes guardada. A memória só serve
   * uma listagem começada depois dele; sem `desde`, aceita a memória.
   */
  it("`desde` passa à pergunta das fotos que faltam; sem ele (ou inválido), só a memória", async () => {
    await pedir({ doc: DOC, n: 3 }, "?desde=1763130000000");
    await pedir({ doc: DOC, n: 3 });
    await pedir({ doc: DOC, n: 3 }, "?desde=abc");
    await pedir({ doc: DOC, n: 3 }, "?fresco=1");
    expect(st.perguntas).toEqual([
      { memoria: true, desde: 1763130000000 },
      { memoria: true },
      { memoria: true },
      { memoria: true },
    ]);
  });

  it("a resposta fresca muda a chave: a página guardada sem a foto não volta", async () => {
    st.faltam = new Set(["t/a.jpg"]);
    await pedir({ doc: DOC, n: 3 });
    expect(st.render).toHaveBeenCalledTimes(1);
    // A foto voltou (noutra instância): a pergunta fresca já a vê.
    st.faltam = new Set();
    await pedir({ doc: DOC, n: 3 }, `?desde=${Date.now()}`);
    expect(st.render).toHaveBeenCalledTimes(2);
  });
});
