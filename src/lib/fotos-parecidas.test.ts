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
vi.mock("@/lib/biblioteca-fotos-store", () => ({ formasDeCaminhos: async () => new Map() }));
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
    const e = M.entradaDoIndice(a, 2200);
    const indice = new Map([
      ["outro/x.jpg", e],
      ["tema:casamentos/y.jpg", e],
      ["este/z.jpg", e],
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
      ["tema:t/b.jpg", M.entradaDoIndice(b, 2200)],
      ["tema:t/a.jpg", M.entradaDoIndice(a, 2200)],
    ]);
    const c = M.candidatasNoIndice(a, indice, null);
    expect(c[0]).toMatchObject({ caminho: "tema:t/a.jpg", veredicto: "mesma" });
    expect(c.find((x) => x.caminho === "tema:t/b.jpg")).toBeUndefined();
  });

  it("procurar só devolve o que está vivo: tema arquivado ou ficheiro em falta não serve", async () => {
    const a = await imp(2);
    await M.registarImpressao("tema:arquivado/a.jpg", a, 2200);
    await M.registarImpressao("tema:vivo/a.jpg", a, 2200);
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
      lerMiniatura: async () => "nao-existe",
    });
    expect(r).toMatchObject({ semMiniatura: 3, calculadas: 0, faltam: 0 });
    const ind = await M.lerIndiceVisual();
    expect(ind?.size).toBe(3);
    expect(M.candidatasNoIndice(await imp(1), ind!, null)).toEqual([]);
  });

  it("uma leitura que FALHA (rede) não marca nada: volta a ser tentada na noite seguinte", async () => {
    const r1 = await M.preencherImpressoes(manifesto(3), {
      prazoMs: 60_000,
      lerMiniatura: async () => null,
    });
    expect(r1).toMatchObject({ falharam: 3, semMiniatura: 0, calculadas: 0, faltam: 3 });
    expect((await M.lerIndiceVisual())?.size).toBe(0);
    const ler = vi.fn(miniatura);
    const r2 = await M.preencherImpressoes(manifesto(3), { prazoMs: 60_000, lerMiniatura: ler });
    expect(r2).toMatchObject({ calculadas: 3, faltam: 0 });
    expect(ler).toHaveBeenCalledTimes(3);
  });

  it("grava o lado maior da fotografia (das medidas guardadas)", async () => {
    await M.preencherImpressoes(manifesto(2), {
      prazoMs: 60_000,
      lerMiniatura: miniatura,
      lerLados: async (cs) => new Map(cs.map((c) => [c, 2200])),
    });
    const ind = await M.lerIndiceVisual();
    for (const v of ind!.values()) expect(M.lerEntrada(v)?.lado).toBe(2200);
  });

  it("o que a junção apagou DEPOIS do manifesto não se calcula e sai do índice", async () => {
    await M.registarImpressao("tema:tema0/f0000.jpg", await imp(4), 2200);
    const ler = vi.fn(miniatura);
    const r = await M.preencherImpressoes(manifesto(3), {
      prazoMs: 60_000,
      lerMiniatura: ler,
      apagadosDepois: ["tema:tema0/f0000.jpg", "tema:tema1/f0001.jpg"],
    });
    expect(ler).toHaveBeenCalledTimes(1);
    expect(r.esquecidas).toBe(1);
    const ind = await M.lerIndiceVisual();
    expect([...ind!.keys()]).toEqual(["tema:tema2/f0002.jpg"]);
  });

  it("com o manifesto completo, tira do índice o que já não existe", async () => {
    await M.registarImpressao("tema:velho/x.jpg", await imp(3), 2200);
    const r = await M.preencherImpressoes(manifesto(2), {
      prazoMs: 60_000,
      lerMiniatura: miniatura,
    });
    expect(r.esquecidas).toBe(1);
    const ind = await M.lerIndiceVisual();
    expect(ind?.has("tema:velho/x.jpg")).toBe(false);
  });

  it("com o manifesto INCOMPLETO, não tira nada", async () => {
    await M.registarImpressao("tema:velho/x.jpg", await imp(3), 2200);
    const r = await M.preencherImpressoes(
      { ...manifesto(2), completo: false },
      { prazoMs: 60_000, lerMiniatura: miniatura },
    );
    expect(r.esquecidas).toBe(0);
  });
});

describe("uma fotografia pequena nunca substitui uma maior (revisão de 13/11)", () => {
  it("guardada mais pequena do que a nova precisa: nem é candidata", async () => {
    const a = await imp(5);
    const indice = new Map([["tema:t/pequena.jpg", M.entradaDoIndice(a, 900)]]);
    expect(M.candidatasNoIndice(a, indice, null, 1800)).toEqual([]);
    // Uma guardada do tamanho pedido serve.
    const grande = new Map([["tema:t/grande.jpg", M.entradaDoIndice(a, 2200)]]);
    expect(M.candidatasNoIndice(a, grande, null, 1800)[0]?.veredicto).toBe("mesma");
  });

  it("guardada de lado desconhecido: no máximo «talvez» (ela compara)", async () => {
    const a = await imp(5);
    const indice = new Map([["tema:t/x.jpg", M.entradaDoIndice(a, 0)]]);
    expect(M.candidatasNoIndice(a, indice, null, 1800)[0]?.veredicto).toBe("talvez");
  });
});

describe("as chaves do índice são índices, não menções", () => {
  it("o prefixo está na lista que as limpezas da noite ignoram", async () => {
    const { PREFIXOS_DE_INDICE_DE_FOTOS } = await import("./indices-de-fotos");
    expect(PREFIXOS_DE_INDICE_DE_FOTOS).toContain(M.PREFIXO_DO_INDICE_VISUAL);
  });
});

describe("o que entra no índice", () => {
  it("só impressões bem formadas — nada mais se escreve", async () => {
    await M.registarImpressao("tema:t/a.jpg", "isto-nao-e-uma-impressao", 2200);
    await M.registarImpressao("tema:t/b.jpg", null, 2200);
    expect((await M.lerIndiceVisual())?.size).toBe(0);
  });
});
