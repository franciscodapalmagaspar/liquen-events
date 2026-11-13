import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Auditoria de 13/11, n.º 6: «Sair» e a recuperação da palavra-passe não
 * fechavam as sessões que já existiam (até 30 dias). Agora fecham.
 *
 * O `app_state` é o verdadeiro; a tabela é um duplo em memória do Supabase,
 * para se poder simular uma base pendurada e duas escritas cruzadas.
 */
type Linha = { key: string; value: unknown; updated_at: string | null };
const H = vi.hoisted(() => ({
  tabela: new Map<string, { key: string; value: unknown; updated_at: string | null }>(),
  leituras: 0,
  pendurado: false,
  /** Atraso de cada operação, para as escritas se poderem cruzar. */
  atrasoMs: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("./logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("./supabase", () => {
  const esperar = () =>
    H.pendurado
      ? new Promise<never>(() => {})
      : new Promise<void>((r) => (H.atrasoMs ? setTimeout(r, H.atrasoMs) : r()));
  const copia = <T>(v: T): T => (v === undefined ? v : structuredClone(v));
  const tabela = () => ({
    select: () => {
      const filtros: [string, unknown][] = [];
      const b = {
        eq(c: string, v: unknown) {
          filtros.push([c, v]);
          return b;
        },
        async maybeSingle() {
          H.leituras++;
          await esperar();
          const key = filtros.find(([c]) => c === "key")?.[1] as string;
          const l = H.tabela.get(key);
          return { data: l ? copia(l) : null, error: null };
        },
      };
      return b;
    },
    async insert(row: Linha) {
      await esperar();
      if (H.tabela.has(row.key)) return { error: { code: "23505" } };
      H.tabela.set(row.key, copia(row));
      return { error: null };
    },
    upsert: async (row: Linha) => {
      await esperar();
      H.tabela.set(row.key, copia(row));
      return { error: null };
    },
    update(row: Partial<Linha>) {
      const filtros: [string, unknown][] = [];
      const b = {
        eq(c: string, v: unknown) {
          filtros.push([c, v]);
          return b;
        },
        is(c: string, v: unknown) {
          filtros.push([c, v]);
          return b;
        },
        async select() {
          await esperar();
          const key = filtros.find(([c]) => c === "key")?.[1] as string;
          const l = H.tabela.get(key);
          const ok = !!l && filtros.every(([c, v]) => (l as Record<string, unknown>)[c] === v);
          if (!ok) return { data: [], error: null };
          H.tabela.set(key, { ...l!, ...copia(row) } as Linha);
          return { data: [{ key }], error: null };
        },
      };
      return b;
    },
  });
  return { getSupabase: () => ({ from: tabela }) };
});

import { createSession } from "./admin-auth";
import {
  CHAVE_DAS_SESSOES_REVOGADAS,
  MAX_TERMINADAS,
  esquecerRevogacoesEmMemoria,
  revogarSessoesDaConta,
  sessaoValida,
  terminarSessao,
} from "./sessoes-revogadas";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret-please-change-1234567890");
  vi.stubEnv("ADMIN_USERS", "");
  H.tabela.clear();
  H.leituras = 0;
  H.pendurado = false;
  H.atrasoMs = 0;
  esquecerRevogacoesEmMemoria();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("sessões que deixam de valer antes do prazo", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T10:00:00Z"));
  });

  it("«Sair» termina ESTA sessão — uma cópia do cookie deixa de valer; as outras não", async () => {
    const esta = createSession("TESTE Ana");
    const outra = createSession("TESTE Ana", 1000 * 60 * 60 * 12);
    expect(await sessaoValida(esta)).toEqual({ name: "TESTE Ana" });

    await terminarSessao(esta);
    expect(await sessaoValida(esta)).toBeNull();
    expect(await sessaoValida(outra)).toEqual({ name: "TESTE Ana" });

    // Outra instância, sem nada em memória, lê o mesmo do registo.
    esquecerRevogacoesEmMemoria();
    expect(await sessaoValida(esta)).toBeNull();
  });

  it("redefinir a palavra-passe fecha TODAS as sessões anteriores dessa conta, e só dessa", async () => {
    const ana1 = createSession("TESTE Ana");
    const ana2 = createSession("TESTE Ana");
    const rui = createSession("TESTE Rui");

    vi.setSystemTime(new Date("2026-11-13T10:05:00Z"));
    await revogarSessoesDaConta("TESTE Ana");
    expect(await sessaoValida(ana1)).toBeNull();
    expect(await sessaoValida(ana2)).toBeNull();
    expect(await sessaoValida(rui)).toEqual({ name: "TESTE Rui" });

    // A entrada a seguir, com a palavra-passe nova, vale.
    vi.setSystemTime(new Date("2026-11-13T10:06:00Z"));
    const nova = createSession("TESTE Ana");
    expect(await sessaoValida(nova)).toEqual({ name: "TESTE Ana" });
  });

  it("não lê a base de dados a cada pedido: uma leitura por minuto, no máximo", async () => {
    const t = createSession("TESTE Ana");
    for (let i = 0; i < 20; i++) await sessaoValida(t);
    expect(H.leituras).toBe(1);
    vi.setSystemTime(new Date("2026-11-13T10:01:01Z"));
    await sessaoValida(t);
    expect(H.leituras).toBe(2);
  });
});

describe("revisão de 13/11", () => {
  it("1 — com a base pendurada, o pedido não fica preso: tecto curto, uma leitura partilhada, e a falha fica em memória", async () => {
    const t = createSession("TESTE Ana");
    H.pendurado = true;
    const inicio = Date.now();
    // Dez pedidos ao mesmo tempo: UMA leitura no ar, partilhada.
    const r = await Promise.all(Array.from({ length: 10 }, () => sessaoValida(t)));
    const demorou = Date.now() - inicio;
    // Abre em falha: a sessão vale.
    expect(r.every((x) => x?.name === "TESTE Ana")).toBe(true);
    expect(demorou).toBeLessThan(3_000);
    expect(H.leituras).toBe(1);
    // Logo a seguir, a falha ainda está em memória: nem se pergunta.
    await sessaoValida(t);
    expect(H.leituras).toBe(1);
  }, 10_000);

  it("2 — dois «Sair» ao mesmo tempo ficam AMBOS no registo", async () => {
    H.atrasoMs = 5;
    const a = createSession("TESTE Ana");
    const b = createSession("TESTE Rui");
    const [ra, rb] = await Promise.all([terminarSessao(a), terminarSessao(b)]);
    expect(ra).toBe(true);
    expect(rb).toBe(true);
    esquecerRevogacoesEmMemoria();
    expect(await sessaoValida(a)).toBeNull();
    expect(await sessaoValida(b)).toBeNull();
  }, 10_000);

  it("3 — acima do tecto saem só as expiradas, nunca uma que ainda vale", async () => {
    const agora = Date.now();
    const terminadas: Record<string, number> = {};
    for (let i = 0; i < MAX_TERMINADAS + 50; i++) terminadas[`valida-${i}`] = agora + 86_400_000;
    for (let i = 0; i < 20; i++) terminadas[`expirada-${i}`] = agora - 1_000;
    H.tabela.set(CHAVE_DAS_SESSOES_REVOGADAS, {
      key: CHAVE_DAS_SESSOES_REVOGADAS,
      value: { desde: {}, terminadas },
      updated_at: "2026-11-13T09:00:00.000Z",
    });
    await terminarSessao(createSession("TESTE Ana"));
    const guardado = H.tabela.get(CHAVE_DAS_SESSOES_REVOGADAS)!.value as {
      terminadas: Record<string, number>;
    };
    const chaves = Object.keys(guardado.terminadas);
    expect(chaves.filter((k) => k.startsWith("valida-"))).toHaveLength(MAX_TERMINADAS + 50);
    expect(chaves.filter((k) => k.startsWith("expirada-"))).toHaveLength(0);
    expect(chaves).toHaveLength(MAX_TERMINADAS + 51);
  });
});
