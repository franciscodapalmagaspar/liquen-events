import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «A PREPARAR PROPOSTA» A CADA AUTOSAVE — E UMA ESCRITA SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela (6/11): gravar o rascunho no estúdio põe o pedido em «A preparar
 * proposta». O autosave corre a cada pausa na escrita, por isso o que estes
 * testes prendem é o CUSTO tanto como a regra: no caso normal (o pedido já lá
 * está, ou já seguiu) lê-se uma coluna e não se escreve nada; escreve-se o
 * pedido UMA vez, quando o estado muda; e uma escrita recusada (a migração por
 * correr) não volta a ser tentada a cada tecla.
 */

const st = vi.hoisted(() => ({
  /** O estado que a leitura barata devolve. `undefined` = o pedido não existe. */
  estado: "pendente" as string | null | undefined,
  falhaNaLeitura: false,
  falhaNaEscrita: false,
  lido: vi.fn(),
  gravado: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/quotes-store", () => ({
  getQuoteStatus: vi.fn(async (id: string) => {
    st.lido(id);
    if (st.falhaNaLeitura) throw new Error("base em baixo");
    return st.estado;
  }),
  updateQuoteWith: vi.fn(async (id: string, mutate: (q: Quote) => Quote) => {
    const actual = { id, status: st.estado, activityLog: [] } as unknown as Quote;
    const novo = mutate(actual);
    if (st.falhaNaEscrita) {
      // O que o Supabase faz com a restrição antiga: recusa o valor novo.
      throw Object.assign(new Error("violates check constraint"), { code: "23514" });
    }
    st.gravado(id, novo);
    st.estado = novo.status;
    return novo;
  }),
}));

import {
  esquecerFalhasDePreparacao,
  marcarPropostaEmPreparacao,
} from "./estado-do-pedido-servidor";

beforeEach(() => {
  st.estado = "pendente";
  st.falhaNaLeitura = false;
  st.falhaNaEscrita = false;
  vi.clearAllMocks();
  esquecerFalhasDePreparacao();
});

describe("marcarPropostaEmPreparacao", () => {
  it("um pedido novo passa a «A preparar proposta», com a linha no histórico", async () => {
    expect(await marcarPropostaEmPreparacao("q-1")).toBe("a_preparar");
    expect(st.gravado).toHaveBeenCalledTimes(1);
    const [, gravado] = st.gravado.mock.calls[0] as [string, Quote];
    expect(gravado.status).toBe("a_preparar");
    expect(gravado.activityLog?.at(-1)?.summary).toBe(
      "Novo → A preparar proposta · começámos a proposta no estúdio",
    );
    expect(gravado.activityLog?.at(-1)?.actor).toBe("Sistema");
  });

  it("um pedido a aguardar resposta também", async () => {
    st.estado = "em_revisao";
    expect(await marcarPropostaEmPreparacao("q-1")).toBe("a_preparar");
  });

  it("dez autosaves seguidos escrevem o pedido UMA vez", async () => {
    for (let i = 0; i < 10; i++) await marcarPropostaEmPreparacao("q-1");
    expect(st.lido).toHaveBeenCalledTimes(10);
    expect(st.gravado).toHaveBeenCalledTimes(1);
  });

  it.each<QuoteStatus>(["a_preparar", "cotado", "aceite", "rejeitado"])(
    "um pedido em `%s` não recua nem é reescrito — lê-se uma coluna e mais nada",
    async (estado) => {
      st.estado = estado;
      expect(await marcarPropostaEmPreparacao("q-1")).toBeNull();
      expect(st.lido).toHaveBeenCalledTimes(1);
      expect(st.gravado).not.toHaveBeenCalled();
    },
  );

  it("um pedido que não existe não se escreve", async () => {
    st.estado = undefined;
    expect(await marcarPropostaEmPreparacao("q-x")).toBeNull();
    expect(st.gravado).not.toHaveBeenCalled();
  });

  it("sem id não pergunta nada a ninguém", async () => {
    expect(await marcarPropostaEmPreparacao(undefined)).toBeNull();
    expect(st.lido).not.toHaveBeenCalled();
  });

  it("uma leitura falhada não atira — o rascunho já está gravado", async () => {
    st.falhaNaLeitura = true;
    await expect(marcarPropostaEmPreparacao("q-1")).resolves.toBeNull();
  });

  /**
   * A migração da restrição por correr: a base recusa `a_preparar`. Sem a
   * pausa, cada tecla voltava a pedir uma escrita que vai falhar.
   */
  it("uma escrita recusada não atira, e não se repete a cada tecla", async () => {
    st.falhaNaEscrita = true;
    const t0 = Date.parse("2026-11-06T10:00:00Z");
    await expect(marcarPropostaEmPreparacao("q-1", t0)).resolves.toBeNull();
    await marcarPropostaEmPreparacao("q-1", t0 + 5_000);
    await marcarPropostaEmPreparacao("q-1", t0 + 60_000);
    // Só a primeira chegou a ler: as outras duas caíram na pausa.
    expect(st.lido).toHaveBeenCalledTimes(1);

    // Passada a pausa, volta a tentar — e, com a migração corrida, passa.
    st.falhaNaEscrita = false;
    expect(await marcarPropostaEmPreparacao("q-1", t0 + 11 * 60_000)).toBe("a_preparar");
  });

  it("a pausa é por pedido: a falha de um não cala os outros", async () => {
    st.falhaNaEscrita = true;
    await marcarPropostaEmPreparacao("q-1");
    st.falhaNaEscrita = false;
    expect(await marcarPropostaEmPreparacao("q-2")).toBe("a_preparar");
  });
});
