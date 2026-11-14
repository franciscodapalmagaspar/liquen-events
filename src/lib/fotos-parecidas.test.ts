import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

/**
 * O índice visual (`fotos-parecidas.ts`): quem pode ser devolvido, e o
 * preenchimento da noite aos lotes, com tecto de tempo e de fotos.
 * O `app_state` é um mapa em memória com o mesmo compare-and-set.
 */

const estado = new Map<string, { valor: unknown; versao: string }>();
let relogio = 0;
vi.mock("@/lib/app-state", () => ({
  listStateByPrefix: async (prefix: string) => ({
    entradas: [...estado]
      .filter(([k]) => k.startsWith(prefix))
      .map(([key, v]) => ({ key, value: v.valor })),
    completa: true,
  }),
  lerEstadoComVersao: async (key: string) => {
    const v = estado.get(key);
    return { valor: v?.valor ?? null, versao: v?.versao ?? null };
  },
  gravarEstadoSeNaoMudou: async (key: string, valor: unknown, versao: string | null) => {
    const v = estado.get(key);
    if ((v?.versao ?? null) !== versao) return "conflito";
    estado.set(key, { valor: JSON.parse(JSON.stringify(valor)), versao: String(++relogio) });
    return "gravado";
  },
}));
const existe = vi.fn(async () => true as boolean | null);
vi.mock("@/lib/fotos-resumo", () => ({ existe: (...a: unknown[]) => existe(...(a as [])) }));
const getTheme = vi.fn(async (id: string) => ({ id, arquivado: false }) as unknown);
vi.mock("@/lib/themes-store", () => ({ getTheme: (id: string) => getTheme(id) }));
vi.mock("@/lib/proposal-storage", () => ({ fetchProposalThumbBytes: async () => null }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => null }));

const M = await import("./fotos-parecidas");
const { impressaoDePixeis } = await import("./impressao-visual");

/** Uma impressão de uma imagem fabricada (degradés com uma semente). */
async function imp(semente: number): Promise<string> {
  const w = 96;
  const h = 72;
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const v = Math.sin((x * (semente + 1)) / 9) * Math.cos((y * (semente + 2)) / 7);
      px[o] = 128 + 100 * v;
      px[o + 1] = 128 + 80 * Math.sin((x + y + semente) / 11);
      px[o + 2] = 128 - 90 * v;
    }
  return impressaoDePixeis(px, w, h, 3);
}

beforeEach(() => {
  estado.clear();
  relogio = 0;
  existe.mockClear();
  existe.mockImplementation(async () => true);
  getTheme.mockClear();
  M.esquecerIndiceVisual();
});

describe("quem pode ser devolvido", () => {
  it("a Biblioteca e a pasta DESTE pedido; a pasta de outro pedido nunca", async () => {
    const a = await imp(1);
    const indice = new Map([
      ["outro/x.jpg", a],
      ["tema:casamentos/y.jpg", a],
      ["este/z.jpg", a],
    ]);
    const deste = M.candidatasNoIndice(a, indice, "este").map((c) => c.caminho);
    expect(deste).toContain("tema:casamentos/y.jpg");
    expect(deste).toContain("este/z.jpg");
    expect(deste).not.toContain("outro/x.jpg");
    // Sem pedido (a importação, antes de o criar): só a Biblioteca.
    expect(M.candidatasNoIndice(a, indice, null).map((c) => c.caminho)).toEqual([
      "tema:casamentos/y.jpg",
    ]);
  });

  it("uma fotografia diferente não é candidata; a «mesma» vem antes da «talvez»", async () => {
    const a = await imp(1);
    const b = await imp(7);
    const indice = new Map([
      ["tema:t/b.jpg", b],
      ["tema:t/a.jpg", a],
    ]);
    const c = M.candidatasNoIndice(a, indice, null);
    expect(c[0]).toMatchObject({ caminho: "tema:t/a.jpg", veredicto: "mesma" });
    expect(c.find((x) => x.caminho === "tema:t/b.jpg")).toBeUndefined();
  });

  it("procurar só devolve o que está vivo: tema arquivado ou ficheiro em falta não serve", async () => {
    const a = await imp(2);
    await M.registarImpressao("tema:arquivado/a.jpg", a);
    await M.registarImpressao("tema:vivo/a.jpg", a);
    getTheme.mockImplementation(async (id: string) => ({ id, arquivado: id === "arquivado" }));
    const r = await M.procurarParecidas([a], null);
    expect(r.get(a)?.caminho).toBe("tema:vivo/a.jpg");
    existe.mockImplementation(async () => false);
    M.esquecerIndiceVisual();
    expect((await M.procurarParecidas([a], null)).size).toBe(0);
  });
});

describe("o preenchimento da noite", () => {
  const manifesto = (n: number) => ({
    completo: true,
    entradas: Array.from({ length: n }, (_, i) => ({
      chave: `theme-assets/tema${i % 3}/f${String(i).padStart(4, "0")}.jpg`,
      bytes: 1,
    })),
  });
  const miniatura = async () =>
    sharp({ create: { width: 40, height: 30, channels: 3, background: "#884422" } })
      .jpeg()
      .toBuffer();

  it("avança aos lotes, pára no tecto de fotos, e a noite seguinte continua de onde parou", async () => {
    const ler = vi.fn(miniatura);
    const r1 = await M.preencherImpressoes(manifesto(25), {
      prazoMs: 60_000,
      maximo: 10,
      lote: 4,
      lerMiniatura: ler,
    });
    expect(r1).toMatchObject({ fotos: 25, calculadas: 10, faltam: 15, parou: "tecto" });
    expect(ler).toHaveBeenCalledTimes(10);
    const r2 = await M.preencherImpressoes(manifesto(25), {
      prazoMs: 60_000,
      maximo: 10,
      lote: 4,
      lerMiniatura: ler,
    });
    expect(r2).toMatchObject({ jaTinham: 10, calculadas: 10, faltam: 5 });
    const r3 = await M.preencherImpressoes(manifesto(25), {
      prazoMs: 60_000,
      maximo: 10,
      lerMiniatura: ler,
    });
    expect(r3).toMatchObject({ jaTinham: 20, calculadas: 5, faltam: 0, parou: null });
    // Coberto: a noite seguinte não lê nada.
    ler.mockClear();
    const r4 = await M.preencherImpressoes(manifesto(25), { prazoMs: 60_000, lerMiniatura: ler });
    expect(r4).toMatchObject({ jaTinham: 25, calculadas: 0 });
    expect(ler).not.toHaveBeenCalled();
  });

  it("pára no tecto de TEMPO", async () => {
    let t = 0;
    const r = await M.preencherImpressoes(manifesto(30), {
      prazoMs: 1_000,
      lote: 5,
      agora: () => t,
      lerMiniatura: async () => {
        t += 150; // cada miniatura «demora» 150 ms
        return miniatura();
      },
    });
    expect(r.parou).toBe("tempo");
    expect(r.calculadas).toBe(10); // dois lotes de 5: o 3.º já não começa
    expect(r.faltam).toBe(20);
  });

  it("uma sem miniatura fica marcada (não volta a ser lida) e nunca é encontrada", async () => {
    const r = await M.preencherImpressoes(manifesto(3), {
      prazoMs: 60_000,
      lerMiniatura: async () => null,
    });
    expect(r).toMatchObject({ semMiniatura: 3, calculadas: 0, faltam: 0 });
    const ind = await M.lerIndiceVisual();
    expect(ind?.size).toBe(3);
    expect(M.candidatasNoIndice(await imp(1), ind!, null)).toEqual([]);
  });

  it("com o manifesto completo, tira do índice o que já não existe", async () => {
    await M.registarImpressao("tema:velho/x.jpg", await imp(3));
    const r = await M.preencherImpressoes(manifesto(2), {
      prazoMs: 60_000,
      lerMiniatura: miniatura,
    });
    expect(r.esquecidas).toBe(1);
    const ind = await M.lerIndiceVisual();
    expect(ind?.has("tema:velho/x.jpg")).toBe(false);
  });

  it("com o manifesto INCOMPLETO, não tira nada", async () => {
    await M.registarImpressao("tema:velho/x.jpg", await imp(3));
    const r = await M.preencherImpressoes(
      { ...manifesto(2), completo: false },
      { prazoMs: 60_000, lerMiniatura: miniatura },
    );
    expect(r.esquecidas).toBe(0);
  });
});

describe("o que entra no índice", () => {
  it("só impressões bem formadas — nada mais se escreve", async () => {
    await M.registarImpressao("tema:t/a.jpg", "isto-nao-e-uma-impressao");
    await M.registarImpressao("tema:t/b.jpg", null);
    expect((await M.lerIndiceVisual())?.size).toBe(0);
  });
});
