import { describe, it, expect, vi } from "vitest";

/**
 * «Repor» uma tarefa da Reciclagem cujo pedido já saiu de vez: a base recusa
 * (P5, `tasks_quote_id_fkey`), e a Reciclagem diz porquê (409, «falta aquilo
 * de que depende») em vez de um 500.
 */
const violacao = Object.assign(new Error('violates foreign key constraint "tasks_quote_id_fkey"'), {
  code: "23503",
});
vi.mock("./tasks-store", () => ({
  deleteTask: async () => {},
  listTasksForQuote: async () => [],
  obterTarefa: async () => null,
  reporTarefa: async () => {
    throw violacao;
  },
}));

const { TIPOS, NaoDaParaRepor } = await import("./reciclagem");
const { MENSAGEM_PEDIDO_APAGADO } = await import("./tarefas/pedido-apagado");

describe("Reciclagem: repor uma tarefa cujo pedido já saiu", () => {
  it("responde «não dá para repor» com a frase das tarefas, não um erro interno", async () => {
    const retrato = {
      principal: [
        { id: "t1", title: "x", done: false, priority: "normal", createdAt: "", quoteId: "Q" },
      ],
    };
    const tentativa = TIPOS.tarefa.repor(retrato);
    await expect(tentativa).rejects.toBeInstanceOf(NaoDaParaRepor);
    await expect(tentativa).rejects.toThrow(MENSAGEM_PEDIDO_APAGADO);
  });
});
