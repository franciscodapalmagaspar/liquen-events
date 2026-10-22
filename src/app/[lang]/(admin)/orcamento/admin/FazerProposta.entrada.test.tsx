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
 * e a ORDEM é a de leitura: primeiro «Proposta para ‹nome›», que responde a
 * «para quem é isto»; depois o aviso de data ocupada, que é a única coisa que
 * pode mudar a decisão; e só então o estúdio.
 *
 * O que este ficheiro prende é essa ordem e essa escada. Uma escada trocada
 * (o estúdio a chegar primeiro) ou desfeita (tudo ao mesmo tempo) passa a
 * falhar aqui.
 */

// O estúdio é pesado, e o que se mede é o EMBRULHO dele, não o que tem dentro.
vi.mock("./lazy", () => ({ ProposalStudio: () => <div data-testid="estudio" /> }));

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
  it("os três blocos entram em escada, e pela ordem de leitura", () => {
    desenhar();

    // Controlo positivo: o ecrã do cliente escolhido está mesmo desenhado.
    expect(screen.getByText(/Proposta para/)).toBeTruthy();
    expect(screen.getByTestId("estudio")).toBeTruthy();

    const cenas = [...document.querySelectorAll<HTMLElement>(".bo-cena")];
    expect(cenas.length, "três blocos em escada").toBe(3);

    // O degrau de cada um, pela ordem em que estão no documento.
    const degraus = cenas.map((el) => el.style.getPropertyValue("--cena") || "0");
    expect(degraus).toEqual(["0", "1", "2"]);

    // E o estúdio é o ÚLTIMO — a escada existe para o nome chegar primeiro.
    const doEstudio = screen.getByTestId("estudio").closest(".bo-cena");
    expect(doEstudio).toBe(cenas[2]);
  });

  it("o cabeçalho «Proposta para» é o primeiro degrau", () => {
    desenhar();
    const cabecalho = screen.getByText(/Proposta para/).closest(".bo-cena");
    expect(cabecalho).toBeTruthy();
    expect((cabecalho as HTMLElement).style.getPropertyValue("--cena") || "0").toBe("0");
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
