import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * A LISTAGEM DA BIBLIOTECA SÓ MOSTRA FOTOS DA BIBLIOTECA (14/11).
 *
 * A `biblioteca_fotos` guarda também as fotos das propostas (`LIQ-…/…`): o
 * estúdio grava lá a cor, o LQIP e a forma de cada uma. Antes disto, a rota
 * contava-as no `total` (158 a mais em 1 355) e cortava a página COM elas lá
 * dentro; como não se assinam no bucket dos temas, saíam depois do corte — e a
 * página vinha com buracos (pedia-se 60, chegavam menos).
 */

type F = { path: string; pasta: string; updatedAt?: string };
const H = vi.hoisted(() => ({
  fotos: [] as F[],
  /** As fotografias de tema na Reciclagem, pelo caminho de origem. */
  fotosNaReciclagem: new Set<string>(),
  /** Os caminhos cujo ficheiro já não está na pasta (saíram de vez da Reciclagem). */
  foraDaPasta: new Set<string>(),
  /** Com que opções se perguntou à pasta. */
  perguntas: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));
vi.mock("@/lib/biblioteca-fotos-store", () => ({ listFotos: async () => H.fotos }));
vi.mock("@/lib/biblioteca-foto-etiquetas-store", () => ({ listFotoEtiquetas: async () => [] }));
vi.mock("@/lib/reciclagem", () => ({
  oQueOsTemasTemNaReciclagem: async () => ({
    pastas: new Set<string>(),
    fotos: H.fotosNaReciclagem,
  }),
}));
vi.mock("@/lib/proposta-fotos-verificacao", () => ({
  refsQueJaNaoExistem: async (refs: readonly string[], opcoes?: unknown) => {
    H.perguntas.push(opcoes);
    return new Set(refs.filter((r) => H.foraDaPasta.has(r.replace(/^[^:]+:/, ""))));
  },
}));
// O bucket dos temas só assina o que lá existe: um caminho de pedido não.
const assina = async (caminhos: string[]) =>
  new Map(caminhos.filter((c) => !c.startsWith("LIQ-")).map((c) => [c, `https://x/${c}`]));
vi.mock("@/lib/theme-storage", () => ({ signThemePaths: assina, signThemeThumbs: assina }));

const { GET } = await import("./route");

const pedir = async (qs = "") => {
  const r = await GET(new NextRequest(`http://localhost/api/biblioteca/fotos${qs}`));
  return (await r.json()) as { total: number; fotos: { path: string }[] };
};

const HA_UM_DIA = new Date(Date.now() - 86_400_000).toISOString();

beforeEach(() => {
  H.fotosNaReciclagem = new Set();
  H.foraDaPasta = new Set();
  H.perguntas = [];
  // Intercaladas, como na tabela (ordenada por data): tema, pedido, tema, pedido…
  H.fotos = Array.from({ length: 6 }, (_, i) =>
    i % 2 === 0
      ? { path: `0b6f2c1e-tema/${i}.jpg`, pasta: "0b6f2c1e-tema", updatedAt: HA_UM_DIA }
      : { path: `LIQ-MT7CWVWU-C4BFD3877E978CFF/${i}.jpg`, pasta: "LIQ-MT7CWVWU-C4BFD3877E978CFF" },
  );
});

describe("GET /api/biblioteca/fotos", () => {
  it("o total conta só as fotos dos temas, não as das propostas", async () => {
    const r = await pedir();
    expect(r.total).toBe(3);
    expect(r.fotos.every((f) => !f.path.startsWith("LIQ-"))).toBe(true);
  });

  it("uma página pedida vem cheia — as fotos das propostas não abrem buracos", async () => {
    const r = await pedir("?limit=2&offset=0");
    expect(r.fotos.map((f) => f.path)).toEqual(["0b6f2c1e-tema/0.jpg", "0b6f2c1e-tema/2.jpg"]);
    const seguinte = await pedir("?limit=2&offset=2");
    expect(seguinte.fotos.map((f) => f.path)).toEqual(["0b6f2c1e-tema/4.jpg"]);
  });
  /**
   * 14/11: uma foto levada para a Reciclagem sai da pasta, mas a linha dela na
   * tabela fica (é com ela que volta, etiquetas incluídas). A Biblioteca deixa
   * de a mostrar — e volta a mostrá-la quando ela a repõe.
   */
  it("uma foto na Reciclagem não aparece; reposta, volta", async () => {
    H.fotosNaReciclagem = new Set(["0b6f2c1e-tema/2.jpg"]);
    const r = await pedir();
    expect(r.total).toBe(2);
    expect(r.fotos.map((f) => f.path)).toEqual(["0b6f2c1e-tema/0.jpg", "0b6f2c1e-tema/4.jpg"]);
    H.fotosNaReciclagem = new Set();
    expect((await pedir()).total).toBe(3);
  });

  /**
   * Revisão de 14/11, menor n.º 2: aos 30 dias a foto sai DE VEZ da
   * Reciclagem — o ficheiro vai-se, a linha fica (nada se apaga na base). A
   * Biblioteca deixava de a ter na Reciclagem e voltava a contá-la.
   */
  it("uma foto que saiu de vez da Reciclagem não conta nem abre buracos", async () => {
    H.foraDaPasta = new Set(["0b6f2c1e-tema/2.jpg"]);
    const r = await pedir("?limit=2&offset=0");
    expect(r.total).toBe(2);
    expect(r.fotos.map((f) => f.path)).toEqual(["0b6f2c1e-tema/0.jpg", "0b6f2c1e-tema/4.jpg"]);
    // Pergunta com a memória das listagens: nenhuma ida a mais por página.
    expect(H.perguntas).toEqual([{ memoria: true }]);
  });

  it("uma linha mexida há menos de 3 min não se esconde (memória de outra instância)", async () => {
    H.foraDaPasta = new Set(["0b6f2c1e-tema/2.jpg"]);
    H.fotos = H.fotos.map((f) =>
      f.path === "0b6f2c1e-tema/2.jpg" ? { ...f, updatedAt: new Date().toISOString() } : f,
    );
    expect((await pedir()).total).toBe(3);
  });

  it("não pergunta à pasta quando não há fotos de tema na resposta", async () => {
    H.fotos = H.fotos.filter((f) => f.path.startsWith("LIQ-"));
    expect((await pedir()).total).toBe(0);
    expect(H.perguntas).toEqual([]);
  });
});
