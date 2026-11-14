import { describe, expect, it } from "vitest";
import { SEPARADOR_A_DECIDIR_MS, separadorQuandoAPropostaChega } from "./separador-por-decidir";

/**
 * Revisão de 14/11: abrir um pedido antes de a lista leve de propostas chegar
 * escolhia o separador sem a proposta, e nunca mais o corrigia.
 */
describe("separadorQuandoAPropostaChega", () => {
  const porDecidir = { quoteId: "q1", tab: "comunicacao" as const, desde: 1000 };

  it("corrige o separador quando a proposta chega e ela não mexeu", () => {
    expect(
      separadorQuandoAPropostaChega(
        porDecidir,
        { quoteId: "q1", tab: "comunicacao", em: 1500 },
        "financeiro",
      ),
    ).toBe("financeiro");
  });

  it("não salta se ela já mudou de separador", () => {
    expect(
      separadorQuandoAPropostaChega(
        porDecidir,
        { quoteId: "q1", tab: "producao", em: 1500 },
        "financeiro",
      ),
    ).toBeNull();
  });

  it("não salta se ela já abriu outro pedido", () => {
    expect(
      separadorQuandoAPropostaChega(
        porDecidir,
        { quoteId: "q2", tab: "comunicacao", em: 1500 },
        "financeiro",
      ),
    ).toBeNull();
  });

  it("não salta passado o prazo (pode estar a escrever)", () => {
    expect(
      separadorQuandoAPropostaChega(
        porDecidir,
        { quoteId: "q1", tab: "comunicacao", em: 1000 + SEPARADOR_A_DECIDIR_MS + 1 },
        "financeiro",
      ),
    ).toBeNull();
  });

  it("fica onde está quando a escolha não muda", () => {
    expect(
      separadorQuandoAPropostaChega(
        porDecidir,
        { quoteId: "q1", tab: "comunicacao", em: 1500 },
        "comunicacao",
      ),
    ).toBeNull();
  });
});
