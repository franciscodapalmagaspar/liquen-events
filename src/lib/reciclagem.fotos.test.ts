import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A RECICLAGEM E O STORAGE (fase R3b de `docs/TUDO-REVERSIVEL.md`)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O servidor local não tem Storage, por isso isto corre com ele simulado. O
 * que se prende:
 *  1. uma foto de um tema vai para `reciclagem/<entrada>/` e volta ao mesmo
 *     caminho; não volta para um tema que já não existe, nem por cima de uma
 *     foto que entretanto voltou;
 *  2. «Apagar de vez» só tira a entrada depois de os ficheiros saírem — se não
 *     saírem, a entrada FICA (é a única lembrança de que há uma pasta);
 *  3. a limpeza dos 30 dias apaga a pasta do tema e a do pedido, só se não
 *     tiverem voltado, e pára no tecto de tempo.
 */

const st = vi.hoisted(() => ({
  entradas: [] as Record<string, unknown>[],
  temas: new Set<string>(),
  pedidos: new Set<string>(),
  guardar: vi.fn(async (_p: string, _d: string) => ({ ok: true })),
  trazer: vi.fn(async (_p: string, _d: string): Promise<"ok" | "existe" | "falhou"> => "ok"),
  largarFoto: vi.fn(async (_p: string, _d: string) => true),
  fotoExiste: vi.fn(async (_p: string): Promise<boolean | null> => false),
  pastaDoTema: vi.fn(async (_id: string) => ({ ok: true, removed: 3 })),
  pastaDoPedido: vi.fn(async (_id: string) => true),
}));

vi.mock("./reciclagem-store", () => ({
  guardarNaReciclagem: async (e: Record<string, unknown>) => {
    st.entradas.push(e);
  },
  listarReciclagem: async () => st.entradas,
  entradasDe: async (origemId: string) => st.entradas.filter((e) => e.origemId === origemId),
  trocarRetrato: async () => null,
  obterDaReciclagem: async (id: string) => st.entradas.find((e) => e.id === id) ?? null,
  tirarDaReciclagem: async (id: string) => {
    st.entradas = st.entradas.filter((e) => e.id !== id);
  },
}));
vi.mock("./themes-store", () => ({
  getTheme: async (id: string) => (st.temas.has(id) ? { id, name: "TESTE Terracota" } : null),
}));
vi.mock("./quotes-store", () => ({
  getQuote: async (id: string) => (st.pedidos.has(id) ? { id } : null),
}));
vi.mock("./theme-materializar", () => ({
  guardarFotoNaReciclagem: st.guardar,
  apagarPastaDaBiblioteca: st.pastaDoTema,
}));
vi.mock("./proposal-storage", () => ({ apagarPastaDoPedido: st.pastaDoPedido }));
vi.mock("./theme-storage", async () => {
  const real = await vi.importActual<typeof import("./theme-storage")>("./theme-storage");
  return {
    ...real,
    trazerFotoDaReciclagem: st.trazer,
    largarFotoDaReciclagem: st.largarFoto,
    fotoExisteNoTema: st.fotoExiste,
  };
});

import {
  apagarDeVez,
  enviarParaAReciclagem,
  limparExpiradas,
  reporDaReciclagem,
} from "./reciclagem";

const FOTO = "t-1/a.jpg";

beforeEach(() => {
  st.entradas = [];
  st.temas = new Set(["t-1"]);
  st.pedidos = new Set();
  vi.clearAllMocks();
});

describe("foto de um tema", () => {
  it("vai para reciclagem/<entrada>/ e volta ao mesmo caminho", async () => {
    const r = await enviarParaAReciclagem("foto-de-tema", FOTO, "Catarina");
    if (!r) throw new Error("devia estar na Reciclagem");
    const guardada = `reciclagem/${r.id}/a.jpg`;
    expect(st.guardar).toHaveBeenCalledWith(FOTO, guardada);
    expect(st.entradas[0]).toMatchObject({ rotulo: "Fotografia de «TESTE Terracota»" });

    await reporDaReciclagem(r.id);
    expect(st.trazer).toHaveBeenCalledWith(FOTO, guardada);
    expect(st.entradas).toEqual([]);
  });

  it("não volta para um tema que já não existe", async () => {
    const r = await enviarParaAReciclagem("foto-de-tema", FOTO);
    st.temas.delete("t-1");
    await expect(reporDaReciclagem((r as { id: string }).id)).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/Repõe primeiro o tema/),
    });
    expect(st.trazer).not.toHaveBeenCalled();
    expect(st.entradas).toHaveLength(1);
  });

  it("não volta por cima de uma foto que entretanto voltou ao tema", async () => {
    const r = await enviarParaAReciclagem("foto-de-tema", FOTO);
    st.fotoExiste.mockResolvedValueOnce(true);
    await expect(reporDaReciclagem((r as { id: string }).id)).rejects.toThrow(
      /já voltou a estar no tema/,
    );
    expect(st.trazer).not.toHaveBeenCalled();
  });

  it("se o Storage não a muda, nada fica na Reciclagem — e diz porquê", async () => {
    st.guardar.mockResolvedValueOnce({ ok: false });
    await expect(enviarParaAReciclagem("foto-de-tema", FOTO)).rejects.toMatchObject({
      status: 502,
    });
    expect(st.entradas).toEqual([]);
  });
});

describe("«Apagar de vez»", () => {
  it("só tira a entrada depois de a foto guardada sair", async () => {
    const r = (await enviarParaAReciclagem("foto-de-tema", FOTO)) as { id: string };
    expect(await apagarDeVez(r.id)).toBe(true);
    expect(st.largarFoto).toHaveBeenCalledWith(FOTO, `reciclagem/${r.id}/a.jpg`);
    expect(st.entradas).toEqual([]);
  });

  it("se a foto guardada não sai, a entrada FICA", async () => {
    const r = (await enviarParaAReciclagem("foto-de-tema", FOTO)) as { id: string };
    st.largarFoto.mockResolvedValueOnce(false);
    await expect(apagarDeVez(r.id)).rejects.toMatchObject({ status: 502 });
    expect(st.entradas).toHaveLength(1);
  });
});

describe("a limpeza dos 30 dias, com ficheiros", () => {
  const velha = (o: Record<string, unknown>) => ({
    rotulo: "x",
    retrato: {},
    ficheiros: [],
    apagadoEm: new Date(Date.now() - 31 * 86_400_000).toISOString(),
    ...o,
  });

  it("apaga a pasta do tema e a do pedido — e a entrada só depois", async () => {
    st.entradas = [
      velha({ id: "e1", tipo: "tema", origemId: "t-9" }),
      velha({ id: "e2", tipo: "pedido", origemId: "LIQ-9" }),
    ];
    expect(await limparExpiradas()).toEqual({ apagadas: 2, ficaram: 0 });
    expect(st.pastaDoTema).toHaveBeenCalledWith("t-9");
    expect(st.pastaDoPedido).toHaveBeenCalledWith("LIQ-9");
    expect(st.entradas).toEqual([]);
  });

  it("não apaga a pasta de um tema ou de um pedido que voltou", async () => {
    st.temas.add("t-9");
    st.pedidos.add("LIQ-9");
    st.entradas = [
      velha({ id: "e1", tipo: "tema", origemId: "t-9" }),
      velha({ id: "e2", tipo: "pedido", origemId: "LIQ-9" }),
    ];
    await limparExpiradas();
    expect(st.pastaDoTema).not.toHaveBeenCalled();
    expect(st.pastaDoPedido).not.toHaveBeenCalled();
  });

  it("a pasta que não sai deixa a entrada para amanhã", async () => {
    st.pastaDoTema.mockResolvedValueOnce({ ok: false, removed: 0 });
    st.entradas = [velha({ id: "e1", tipo: "tema", origemId: "t-9" })];
    expect(await limparExpiradas()).toEqual({ apagadas: 0, ficaram: 1 });
    expect(st.entradas).toHaveLength(1);
  });

  it("pára no tecto de tempo — o resto fica para amanhã", async () => {
    st.entradas = [velha({ id: "e1", tipo: "tema", origemId: "t-9" })];
    expect(await limparExpiradas(new Date(), 50, -1)).toEqual({ apagadas: 0, ficaram: 0 });
    expect(st.entradas).toHaveLength(1);
  });
});
