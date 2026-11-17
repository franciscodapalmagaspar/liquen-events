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
  acrescentarLotesDeTempo,
  acrescentarTempoActivo,
  acrescentarTempoActivoPorSeccao,
  IDS_GUARDADOS,
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

/**
 * 17/11: o estúdio mandava um pedido por secção ao mesmo tempo, e cada um faz
 * ler-somar-gravar sem trinco — ficava só o último. Agora vai tudo numa
 * escrita.
 */
describe("acrescentarTempoActivoPorSeccao", () => {
  it("três secções numa só escrita: nada se perde", async () => {
    const { setState } = await import("./app-state");
    await acrescentarTempoActivo("LIQ-9", 10_000, "capa");
    const antes = vi.mocked(setState).mock.calls.length;
    await acrescentarTempoActivoPorSeccao("LIQ-9", {
      capa: 60_000,
      "mood-boards": 90_000,
      orcamento: 30_000,
      "": 5_000,
    });
    expect(vi.mocked(setState).mock.calls.length - antes).toBe(1);
    const t = await getTempoActivo("LIQ-9");
    expect(t?.ms).toBe(10_000 + 60_000 + 90_000 + 30_000 + 5_000);
    expect(t?.porSeccao).toEqual({ capa: 70_000, "mood-boards": 90_000, orcamento: 30_000 });
  });

  it("o tecto é do PEDIDO inteiro, não de cada secção (revisão de 17/11)", async () => {
    // Antes: tecto por secção × 50 secções = 25 horas num pedido.
    const muitas = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`s${i}`, MAXIMO_POR_ENVIO]),
    );
    await acrescentarTempoActivoPorSeccao("LIQ-9", muitas);
    const t = await getTempoActivo("LIQ-9");
    expect(t?.ms).toBe(MAXIMO_POR_ENVIO);
    expect(Object.values(t?.porSeccao ?? {}).reduce((a, b) => a + b, 0)).toBe(MAXIMO_POR_ENVIO);
  });

  it("cada secção leva o que sobra do tecto; o tempo sem secção também o gasta", async () => {
    await acrescentarTempoActivoPorSeccao("LIQ-9", {
      "": MAXIMO_POR_ENVIO - 60_000,
      capa: 120_000,
      x: -3,
      y: Number.NaN,
    });
    const t = await getTempoActivo("LIQ-9");
    expect(t?.ms).toBe(MAXIMO_POR_ENVIO);
    expect(t?.porSeccao).toEqual({ capa: 60_000 });
  });

  it("as chaves normalizam-se com trim, e dois nomes iguais juntam-se", async () => {
    await acrescentarTempoActivoPorSeccao("LIQ-9", { " capa ": 30_000, capa: 20_000, "  ": 5_000 });
    const t = await getTempoActivo("LIQ-9");
    expect(t?.ms).toBe(55_000);
    expect(t?.porSeccao).toEqual({ capa: 50_000 });
  });

  it("as secções acima de MAX_SECCOES contam no total, dentro do tecto", async () => {
    const quarenta = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`s${i}`, 1_000]));
    await acrescentarTempoActivoPorSeccao("LIQ-9", quarenta);
    await acrescentarTempoActivoPorSeccao("LIQ-9", { nova: MAXIMO_POR_ENVIO * 3 });
    const t = await getTempoActivo("LIQ-9");
    expect(t?.ms).toBe(40_000 + MAXIMO_POR_ENVIO);
    expect(t?.porSeccao?.nova).toBeUndefined();
  });
});

/**
 * 17/11: o servidor pode gravar e o browser ler uma falha (a escrita acaba
 * depois de o pedido desistir, a resposta perde-se com o ecrã a bloquear). O
 * lote volta a sair com o mesmo id, e o servidor não o soma outra vez.
 */
describe("acrescentarLotesDeTempo — o mesmo lote soma uma só vez", () => {
  it("o mesmo lote enviado duas vezes soma uma só vez", async () => {
    const lote = { id: "3f6c1a52-0000-4000-8000-000000000001", porSeccao: { capa: 60_000 } };
    await acrescentarLotesDeTempo("LIQ-7", [lote]);
    const { setState } = await import("./app-state");
    const escritas = vi.mocked(setState).mock.calls.length;
    const segunda = await acrescentarLotesDeTempo("LIQ-7", [lote]);
    expect(segunda.persistencia).toBeNull(); // nada a escrever, e não é uma falha
    expect(vi.mocked(setState).mock.calls.length).toBe(escritas);
    const t = await getTempoActivo("LIQ-7");
    expect(t?.ms).toBe(60_000);
    expect(t?.porSeccao).toEqual({ capa: 60_000 });
  });

  it("o devolvido e o novo no mesmo pedido: só o novo soma", async () => {
    const velho = { id: "id-velho-0001", porSeccao: { capa: 60_000 } };
    const novo = { id: "id-novo-00001", porSeccao: { capa: 30_000 } };
    await acrescentarLotesDeTempo("LIQ-7", [velho]);
    await acrescentarLotesDeTempo("LIQ-7", [velho, novo]);
    expect((await getTempoActivo("LIQ-7"))?.ms).toBe(90_000);
  });

  it("guarda só os últimos ids, e as respostas não os levam", async () => {
    let ultima;
    for (let i = 0; i < IDS_GUARDADOS + 5; i++) {
      ultima = await acrescentarLotesDeTempo("LIQ-7", [
        { id: `id-lote-${String(i).padStart(4, "0")}`, porSeccao: { capa: 1_000 } },
      ]);
    }
    const guardado = gaveta.get(`${TEMPO_PREFIX}LIQ-7`) as { ids: string[] };
    expect(guardado.ids).toHaveLength(IDS_GUARDADOS);
    expect(guardado.ids.at(-1)).toBe(`id-lote-${String(IDS_GUARDADOS + 4).padStart(4, "0")}`);
    expect(ultima?.tempo).not.toHaveProperty("ids");
    expect(await getTempoActivo("LIQ-7")).not.toHaveProperty("ids");
    expect((await listTemposActivos())["LIQ-7"]).not.toHaveProperty("ids");
  });

  it("sem id (o formato antigo), soma sempre, como antes", async () => {
    await acrescentarLotesDeTempo("LIQ-7", [{ porSeccao: { capa: 1_000 } }]);
    await acrescentarLotesDeTempo("LIQ-7", [{ porSeccao: { capa: 1_000 } }]);
    await acrescentarTempoActivo("LIQ-7", 1_000, "capa");
    expect((await getTempoActivo("LIQ-7"))?.ms).toBe(3_000);
  });
});
