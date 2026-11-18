import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * P7 (18/11): os códigos curtos passam a viver na tabela `ligacoes_de_proposta`
 * e, até ao tempo (4), também no `app_state`. O que se prende aqui:
 *
 *  1. um código novo é escrito nos DOIS sítios;
 *  2. a leitura vem da tabela, e do `app_state` quando a tabela não sabe;
 *  3. o código a reaproveitar é o MAIS RECENTE que ainda abre, entre o atual
 *     da tabela e o inverso do `app_state` — qualquer um deles pode ter ficado
 *     para trás quando uma das duas escritas falhou.
 */
const gaveta = new Map<string, unknown>();
const tabela = vi.hoisted(() => ({
  linhas: new Map<
    string,
    { codigo: string; propostaId: string; criadaEm: string; expiraEm?: string; revogadaEm?: string }
  >(),
  atual: new Map<string, string>(),
  gravadas: [] as string[],
}));

vi.mock("./app-state", () => ({
  getState: vi.fn(async (chave: string) => gaveta.get(chave) ?? null),
  setState: vi.fn(async (chave: string, valor: unknown) => {
    gaveta.set(chave, valor);
    return { gravado: true, duradouro: true, onde: "teste" };
  }),
}));
vi.mock("./proposals-store", () => ({
  getProposal: vi.fn(async (id: string) => ({ id, doc: { clientNames: "Ana & João" } })),
}));
vi.mock("./ligacoes-de-proposta-tabela", () => ({
  gravarLigacaoNaTabela: vi.fn(
    async (l: { codigo: string; propostaId: string; criadaEm: string; expiraEm: string }) => {
      tabela.gravadas.push(l.codigo);
      tabela.linhas.set(l.codigo, l);
      tabela.atual.set(l.propostaId, l.codigo);
      return true;
    },
  ),
  lerLigacaoDaTabela: vi.fn(async (codigo: string) => tabela.linhas.get(codigo)),
  codigoAtualDaTabela: vi.fn(async (propostaId: string) => {
    const c = tabela.atual.get(propostaId);
    return c ? tabela.linhas.get(c) : undefined;
  }),
}));

const { criarLigacaoCurta, lerLigacaoCurta, enderecoDaProposta } =
  await import("./proposta-link-curto");

const PROPOSTA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000);

beforeEach(() => {
  gaveta.clear();
  tabela.linhas.clear();
  tabela.atual.clear();
  tabela.gravadas.length = 0;
});

describe("os códigos curtos na tabela (P7)", () => {
  it("um código novo fica nos dois sítios: tabela e app_state", async () => {
    const codigo = await criarLigacaoCurta(PROPOSTA, "LIQ-1", daqui(30));
    expect(codigo).toBeTruthy();
    expect(tabela.gravadas).toEqual([codigo]);
    expect(gaveta.get(`ligacao-proposta:${codigo}`)).toMatchObject({ propostaId: PROPOSTA });
    expect(gaveta.get(`ligacao-de-proposta:${PROPOSTA}`)).toEqual({ codigo });
  });

  it("lê da tabela: um código só na tabela abre", async () => {
    tabela.linhas.set("k7m2q9xdabcd", {
      codigo: "k7m2q9xdabcd",
      propostaId: PROPOSTA,
      criadaEm: "2026-11-01T00:00:00Z",
      expiraEm: daqui(10).toISOString(),
    });
    expect(await lerLigacaoCurta("k7m2q9xdabcd")).toEqual({
      propostaId: PROPOSTA,
      criadaEm: "2026-11-01T00:00:00Z",
    });
  });

  it("um código que a tabela não tem (ainda não copiado) abre pelo app_state", async () => {
    gaveta.set("ligacao-proposta:njwwrj4m7tyz6x62", {
      propostaId: PROPOSTA,
      pedidoId: "LIQ-1",
      criadaEm: "2026-10-01T00:00:00Z",
      expiraEm: daqui(10).toISOString(),
    });
    expect((await lerLigacaoCurta("njwwrj4m7tyz6x62"))?.propostaId).toBe(PROPOSTA);
  });

  it("um código expirado na tabela não abre, mesmo que o app_state diga outra coisa", async () => {
    tabela.linhas.set("k7m2q9xdabcd", {
      codigo: "k7m2q9xdabcd",
      propostaId: PROPOSTA,
      criadaEm: "2026-01-01T00:00:00Z",
      expiraEm: daqui(-1).toISOString(),
    });
    gaveta.set("ligacao-proposta:k7m2q9xdabcd", {
      propostaId: PROPOSTA,
      criadaEm: "2026-01-01T00:00:00Z",
      expiraEm: daqui(10).toISOString(),
    });
    expect(await lerLigacaoCurta("k7m2q9xdabcd")).toBeNull();
  });

  it("o próximo envio reaproveita o código atual da tabela", async () => {
    tabela.linhas.set("k7m2q9xdabcd", {
      codigo: "k7m2q9xdabcd",
      propostaId: PROPOSTA,
      criadaEm: "2026-11-01T00:00:00Z",
      expiraEm: daqui(10).toISOString(),
    });
    tabela.atual.set(PROPOSTA, "k7m2q9xdabcd");
    expect(await enderecoDaProposta(PROPOSTA, "LIQ-1")).toMatch(
      /\/proposta\/ana-e-joao-k7m2q9xdabcd$/,
    );
    expect(tabela.gravadas).toEqual([]);
  });

  it("se o atual da tabela expirou, vale o do app_state (cunhado antes da tabela)", async () => {
    tabela.linhas.set("velho0000000", {
      codigo: "velho0000000",
      propostaId: PROPOSTA,
      criadaEm: "2026-01-01T00:00:00Z",
      expiraEm: daqui(-1).toISOString(),
    });
    tabela.atual.set(PROPOSTA, "velho0000000");
    gaveta.set(`ligacao-de-proposta:${PROPOSTA}`, { codigo: "novo00000000" });
    gaveta.set("ligacao-proposta:novo00000000", {
      propostaId: PROPOSTA,
      criadaEm: "2026-11-17T00:00:00Z",
      expiraEm: daqui(30).toISOString(),
    });
    expect(await enderecoDaProposta(PROPOSTA, "LIQ-1")).toMatch(/-novo00000000$/);
  });

  it("até ao tempo (4), o inverso do app_state manda: a tabela pode ter ficado para trás", async () => {
    // A gravação na tabela falhou quando se cunhou o código novo: a tabela
    // ainda tem o antigo (válido) como atual; o app_state tem o novo.
    tabela.linhas.set("antigo000000", {
      codigo: "antigo000000",
      propostaId: PROPOSTA,
      criadaEm: "2026-11-01T00:00:00Z",
      expiraEm: daqui(10).toISOString(),
    });
    tabela.atual.set(PROPOSTA, "antigo000000");
    gaveta.set(`ligacao-de-proposta:${PROPOSTA}`, { codigo: "recente00000" });
    gaveta.set("ligacao-proposta:recente00000", {
      propostaId: PROPOSTA,
      criadaEm: "2026-11-17T00:00:00Z",
      expiraEm: daqui(30).toISOString(),
    });
    expect(await enderecoDaProposta(PROPOSTA, "LIQ-1")).toMatch(/-recente00000$/);
  });

  it("e o contrário: se o inverso do app_state ficou para trás, vale o atual da tabela", async () => {
    // O `setState` do inverso falhou quando se cunhou o código novo: o
    // app_state ainda aponta para o antigo (válido); a tabela já tem o novo.
    gaveta.set(`ligacao-de-proposta:${PROPOSTA}`, { codigo: "antigo000000" });
    gaveta.set("ligacao-proposta:antigo000000", {
      propostaId: PROPOSTA,
      criadaEm: "2026-11-01T00:00:00Z",
      expiraEm: daqui(10).toISOString(),
    });
    tabela.linhas.set("recente00000", {
      codigo: "recente00000",
      propostaId: PROPOSTA,
      criadaEm: "2026-11-17T00:00:00Z",
      expiraEm: daqui(30).toISOString(),
    });
    tabela.atual.set(PROPOSTA, "recente00000");
    expect(await enderecoDaProposta(PROPOSTA, "LIQ-1")).toMatch(/-recente00000$/);
  });
});
