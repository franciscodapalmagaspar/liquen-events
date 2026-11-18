import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A tabela `ligacoes_de_proposta` (P7). O que se prende: a tabela nunca lança,
 * e `undefined` («a tabela não sabe») é a resposta a tudo o que não é uma linha
 * boa — para quem chama ir ao `app_state`, que continua a ser a reserva.
 */
const sbState = vi.hoisted(() => ({
  configurado: true,
  linha: null as unknown,
  erro: null as unknown,
  rpc: { data: true as unknown, error: null as unknown },
  chamadas: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("./logger", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("./supabase", () => ({
  getSupabase: () => {
    if (!sbState.configurado) return null;
    const consulta = {
      select: () => consulta,
      eq: (c: string, v: unknown) => {
        sbState.chamadas.push(`eq ${c}=${String(v)}`);
        return consulta;
      },
      maybeSingle: async () => ({ data: sbState.linha, error: sbState.erro }),
    };
    return {
      from: (t: string) => {
        sbState.chamadas.push(`from ${t}`);
        return consulta;
      },
      rpc: async (nome: string, args: Record<string, unknown>) => {
        sbState.chamadas.push(`rpc ${nome} ${String(args.p_codigo)}`);
        return sbState.rpc;
      },
    };
  },
}));

const { gravarLigacaoNaTabela, lerLigacaoDaTabela, codigoAtualDaTabela } =
  await import("./ligacoes-de-proposta-tabela");

const PROPOSTA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LINHA = {
  codigo: "k7m2q9xdabcd",
  proposal_id: PROPOSTA,
  criada_em: "2026-11-01T00:00:00+00:00",
  expira_em: "2027-01-01T00:00:00+00:00",
  revogada_em: null,
};

beforeEach(() => {
  sbState.configurado = true;
  sbState.linha = null;
  sbState.erro = null;
  sbState.rpc = { data: true, error: null };
  sbState.chamadas = [];
});

describe("lerLigacaoDaTabela", () => {
  it("devolve o código da tabela, já na forma da aplicação", async () => {
    sbState.linha = LINHA;
    expect(await lerLigacaoDaTabela("k7m2q9xdabcd")).toEqual({
      codigo: "k7m2q9xdabcd",
      propostaId: PROPOSTA,
      criadaEm: LINHA.criada_em,
      expiraEm: LINHA.expira_em,
    });
  });

  it("um código que a tabela não tem é «não sei» (undefined), não «não existe»", async () => {
    expect(await lerLigacaoDaTabela("naoexiste123")).toBeUndefined();
  });

  it("uma avaria, uma tabela por criar ou uma linha estragada nunca lançam", async () => {
    sbState.erro = { code: "42P01", message: 'relation "ligacoes_de_proposta" does not exist' };
    expect(await lerLigacaoDaTabela("x")).toBeUndefined();
    sbState.erro = new Error("rede");
    expect(await lerLigacaoDaTabela("x")).toBeUndefined();
    sbState.erro = null;
    sbState.linha = { codigo: 1 };
    expect(await lerLigacaoDaTabela("x")).toBeUndefined();
  });

  it("sem base de dados não pergunta nada", async () => {
    sbState.configurado = false;
    expect(await lerLigacaoDaTabela("x")).toBeUndefined();
    expect(sbState.chamadas).toEqual([]);
  });
});

describe("codigoAtualDaTabela", () => {
  it("procura o código ATUAL da proposta", async () => {
    sbState.linha = LINHA;
    expect((await codigoAtualDaTabela(PROPOSTA))?.codigo).toBe("k7m2q9xdabcd");
    expect(sbState.chamadas).toContain(`eq proposal_id=${PROPOSTA}`);
    expect(sbState.chamadas).toContain("eq atual=true");
  });

  it("um id que não é uuid nem chega à base (seria um erro 22P02)", async () => {
    expect(await codigoAtualDaTabela("prop-1")).toBeUndefined();
    expect(sbState.chamadas).toEqual([]);
  });
});

describe("gravarLigacaoNaTabela", () => {
  const nova = {
    codigo: "k7m2q9xdabcd",
    propostaId: PROPOSTA,
    criadaEm: "2026-11-18T00:00:00.000Z",
    expiraEm: "2027-01-18T00:00:00.000Z",
  };

  it("grava pela função transacional (código + atual numa só transação)", async () => {
    expect(await gravarLigacaoNaTabela(nova)).toBe(true);
    expect(sbState.chamadas).toEqual(["rpc gravar_ligacao_de_proposta k7m2q9xdabcd"]);
  });

  it("uma colisão (false) ou uma avaria dão false, sem lançar", async () => {
    sbState.rpc = { data: false, error: null };
    expect(await gravarLigacaoNaTabela(nova)).toBe(false);
    sbState.rpc = { data: null, error: new Error("em baixo") };
    expect(await gravarLigacaoNaTabela(nova)).toBe(false);
  });

  it("uma proposta sem forma de uuid não tenta (a chave estrangeira recusava)", async () => {
    expect(await gravarLigacaoNaTabela({ ...nova, propostaId: "prop-1" })).toBe(false);
    expect(sbState.chamadas).toEqual([]);
  });
});
