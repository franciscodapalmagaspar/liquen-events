import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * O armazém do tempo activo, com o `app_state` fingido.
 *
 * O que aqui se prende é a regra que faz isto valer a pena: SOMA-SE. Um
 * armazém que substituísse o total tornava dois aparelhos abertos na mesma
 * proposta em «fica o do último a falar» — que é a avaria que trazer isto para
 * o servidor veio resolver.
 */

const gaveta = new Map<string, unknown>();

vi.mock("./app-state", () => ({
  getState: vi.fn(async (k: string) => gaveta.get(k) ?? null),
  setState: vi.fn(async (k: string, v: unknown) => {
    gaveta.set(k, v);
    return { gravado: true, duradouro: true, onde: "supabase" };
  }),
  listStateByPrefix: vi.fn(async (prefixo: string) => ({
    entradas: [...gaveta.entries()]
      .filter(([k]) => k.startsWith(prefixo))
      .map(([key, value]) => ({ key, value })),
    completa: true,
  })),
}));

const {
  acrescentarTempoActivo,
  getTempoActivo,
  listTemposActivos,
  MAXIMO_POR_ENVIO,
  TEMPO_PREFIX,
} = await import("./tempo-activo-servidor");

beforeEach(() => gaveta.clear());

describe("acrescentarTempoActivo", () => {
  it("uma leitura falhada não põe o total a zero por cima do verdadeiro (revisão 13/11, n.º 10)", async () => {
    await acrescentarTempoActivo("LIQ-1", 60_000);
    const { getState, setState } = await import("./app-state");
    const escritas = vi.mocked(setState).mock.calls.length;
    vi.mocked(getState).mockImplementationOnce(async (_k: string, o?: { ouFalha?: boolean }) => {
      if (o?.ouFalha) throw new Error("rede");
      return null;
    });
    await expect(acrescentarTempoActivo("LIQ-1", 30_000)).rejects.toThrow();
    expect(vi.mocked(setState).mock.calls.length).toBe(escritas);
    expect((await getTempoActivo("LIQ-1"))?.ms).toBe(60_000);
  });

  it("SOMA os envios em vez de os substituir", async () => {
    await acrescentarTempoActivo("LIQ-1", 60_000);
    await acrescentarTempoActivo("LIQ-1", 30_000);
    const t = await getTempoActivo("LIQ-1");
    expect(t?.ms).toBe(90_000);
  });

  it("soma o que vem de aparelhos diferentes na mesma proposta", async () => {
    // O portátil e o tablet, cada um a reportar o SEU pedaço.
    await acrescentarTempoActivo("LIQ-1", 45_000);
    await acrescentarTempoActivo("LIQ-1", 45_000);
    expect((await getTempoActivo("LIQ-1"))?.ms).toBe(90_000);
  });

  it("guarda propostas diferentes em gavetas diferentes", async () => {
    await acrescentarTempoActivo("LIQ-1", 10_000);
    await acrescentarTempoActivo("LIQ-2", 20_000);
    expect((await getTempoActivo("LIQ-1"))?.ms).toBe(10_000);
    expect((await getTempoActivo("LIQ-2"))?.ms).toBe(20_000);
  });

  it("reparte por secção, e o total continua a bater certo", async () => {
    await acrescentarTempoActivo("LIQ-1", 60_000, "mood-boards");
    await acrescentarTempoActivo("LIQ-1", 30_000, "servicos");
    await acrescentarTempoActivo("LIQ-1", 30_000, "mood-boards");
    const t = await getTempoActivo("LIQ-1");
    expect(t?.ms).toBe(120_000);
    expect(t?.porSeccao).toEqual({ "mood-boards": 90_000, servicos: 30_000 });
  });

  it("aceita um envio sem secção (a coluna lateral está escondida no telemóvel)", async () => {
    await acrescentarTempoActivo("LIQ-1", 60_000);
    const t = await getTempoActivo("LIQ-1");
    expect(t?.ms).toBe(60_000);
    expect(t?.porSeccao).toBeUndefined();
  });

  it("corta um envio absurdo pelo tecto, em vez de o aceitar", async () => {
    // Um relógio que saltou, ou um cliente avariado. O tecto existe para a
    // medição não poder ser inflacionada por um pedido só.
    await acrescentarTempoActivo("LIQ-1", 999 * 60 * 60_000);
    expect((await getTempoActivo("LIQ-1"))?.ms).toBe(MAXIMO_POR_ENVIO);
  });

  it("ignora o que não é tempo, sem rebentar e sem escrever", async () => {
    for (const mau of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { tempo } = await acrescentarTempoActivo("LIQ-1", mau);
      expect(tempo.ms).toBe(0);
    }
    // Zero a somar é zero a escrever: a gaveta continua vazia.
    expect(gaveta.size).toBe(0);
  });

  it("não deixa um cliente inventar secções sem fim", async () => {
    for (let i = 0; i < 60; i++) await acrescentarTempoActivo("LIQ-1", 1000, `inventada-${i}`);
    const t = await getTempoActivo("LIQ-1");
    // O total conta sempre, mesmo o que não coube na repartição — o tempo
    // trabalhado é verdade, a etiqueta dele é que não cabia.
    expect(t?.ms).toBe(60_000);
    expect(Object.keys(t?.porSeccao ?? {}).length).toBeLessThanOrEqual(40);
  });

  it("guarda o instante da última soma", async () => {
    const { tempo } = await acrescentarTempoActivo("LIQ-1", 1000);
    expect(Date.parse(tempo.updatedAt)).toBeGreaterThan(0);
  });
});

describe("getTempoActivo", () => {
  it("devolve null para uma proposta que ainda não foi medida", async () => {
    expect(await getTempoActivo("LIQ-nunca")).toBeNull();
  });
});

describe("listTemposActivos", () => {
  it("devolve os totais por proposta, sem o prefixo da chave", async () => {
    await acrescentarTempoActivo("LIQ-1", 60_000);
    await acrescentarTempoActivo("LIQ-2", 30_000);
    const todos = await listTemposActivos();
    expect(Object.keys(todos).sort()).toEqual(["LIQ-1", "LIQ-2"]);
    expect(todos["LIQ-1"].ms).toBe(60_000);
    expect(Object.keys(todos).some((k) => k.startsWith(TEMPO_PREFIX))).toBe(false);
  });

  it("é um mapa vazio quando ainda não há medições", async () => {
    expect(await listTemposActivos()).toEqual({});
  });
});
