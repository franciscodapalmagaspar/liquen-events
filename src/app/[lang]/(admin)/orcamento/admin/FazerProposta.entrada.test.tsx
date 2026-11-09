// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import type { Quote } from "@/lib/orcamento/types";
import FazerProposta from "./FazerProposta";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PÁGINA DA PROPOSTA APRESENTA-SE, E EM TRÊS TEMPOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «que haja uma animação super fluida que coloca a página para
 * fazer a proposta na página toda».
 *
 * A escada é a da casa — `.bo-cena`, 600 ms, degraus de 20 ms, tecto no sexto —
 * e a ORDEM é a de leitura: o aviso de data ocupada, que é a única coisa que
 * pode mudar a decisão, e depois o estúdio.
 *
 * O «Proposta para ‹nome›» era o primeiro degrau, num cartão próprio. Desde
 * 9/11 vive na linha de cima do ESTÚDIO (pedido dela, «está uma confusão
 * brutal»: um cartão, um traço e outra linha antes dos passos) — continua a ser
 * a primeira coisa que se lê, agora dentro do degrau do estúdio.
 *
 * O que este ficheiro prende é essa ordem e essa escada. Uma escada trocada
 * (o estúdio a chegar primeiro) ou desfeita (tudo ao mesmo tempo) passa a
 * falhar aqui.
 */

// O estúdio é pesado, e o que se mede é o EMBRULHO dele, não o que tem dentro.
// O nome do cliente é dado ao estúdio (`cliente`), que o põe na sua linha de
// cima — o duplo mostra-o para se poder ver que chega.
vi.mock("./lazy", () => ({
  ProposalStudio: ({ cliente }: { cliente?: { nome: string } }) => (
    <div data-testid="estudio">Proposta para {cliente?.nome}</div>
  ),
}));

const PEDIDO = {
  id: "LIQ-1",
  name: "Ana e Pedro",
  email: "ana@exemplo.pt",
  status: "pendente",
  date: "2028-05-20",
  submittedAt: "2026-05-01T10:00:00.000Z",
  priceBreakdown: { total: 0 },
} as unknown as Quote;

function desenhar() {
  return render(
    <FazerProposta
      quotes={[PEDIDO]}
      selectedId={PEDIDO.id}
      onSelect={() => {}}
      onNovoPedido={() => {}}
      onSent={() => {}}
      onQuoteUpdated={() => {}}
      onAbrirPedido={() => {}}
    />,
  );
}

afterEach(cleanup);

describe("FazerProposta — a página apresenta-se", () => {
  it("os blocos entram em escada, e pela ordem de leitura", () => {
    desenhar();

    // Controlo positivo: o ecrã do cliente escolhido está mesmo desenhado.
    expect(screen.getByText(/Proposta para/)).toBeTruthy();
    expect(screen.getByTestId("estudio")).toBeTruthy();

    const cenas = [...document.querySelectorAll<HTMLElement>(".bo-cena")];
    expect(cenas.length, "dois blocos em escada").toBe(2);

    // O degrau de cada um, pela ordem em que estão no documento.
    const degraus = cenas.map((el) => el.style.getPropertyValue("--cena") || "0");
    expect(degraus).toEqual(["0", "1"]);

    // E o estúdio é o ÚLTIMO — o aviso de data ocupada chega antes.
    const doEstudio = screen.getByTestId("estudio").closest(".bo-cena");
    expect(doEstudio).toBe(cenas[1]);
  });

  it("o nome do cliente chega ao estúdio, e não há um segundo cartão por cima", () => {
    desenhar();
    expect(screen.getByTestId("estudio").textContent).toContain("Ana e Pedro");
    // Uma só vez no ecrã: o cartão de antes repetia-o por cima do estúdio.
    expect(screen.getAllByText(/Proposta para/)).toHaveLength(1);
  });

  /**
   * A escada só vale se o CSS que ela pede existir e obedecer às duas regras da
   * casa: a banda de apresentação (600–1500 ms) e o desligar com movimento
   * reduzido. Sem isto, uma `.bo-cena` renomeada deixava estes blocos a pedir
   * uma animação que já não existe, e ninguém dava por isso.
   */
  it("a `.bo-cena` existe, está na banda de apresentação e cala-se com movimento reduzido", () => {
    // O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
    // todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
    // o browser os aplica no back office.
    const css =
      readFileSync("src/app/globals.css", "utf8") + readFileSync("src/app/admin.css", "utf8");
    expect(css).toMatch(/@keyframes bo-cena/);
    expect(css).toMatch(/\.bo-cena\s*\{[^}]*animation:\s*bo-cena\s+600ms/);
    expect(css).toMatch(
      /prefers-reduced-motion:\s*reduce[\s\S]{0,400}?\.bo-cena\s*\{\s*animation:\s*none/,
    );
  });
});
