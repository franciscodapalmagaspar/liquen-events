// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote } from "@/lib/orcamento/types";
import { porqueNaoLeu } from "@/lib/porque-nao-leu";
import { ToastProvider } from "./Toast";
import Kanban from "./Kanban";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CINCO CAIXAS VAZIAS E NEM UMA PALAVRA SOBRE O ESTADO DO QUADRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Do inventário: o quadro inteiro vazio mostrava cinco colunas com «Arrasta
 * para aqui» e mais nada. Quem abre o back office pela primeira vez — ou quem
 * arrumou a época toda no arquivo — via cinco instruções para um gesto que não
 * tem objecto nenhum, e nenhuma explicação.
 *
 * Um vazio bom faz três coisas: diz que está vazio, diz PORQUÊ, e põe a acção
 * ali. E, antes das três, tem de ter a certeza de que está mesmo vazio: uma
 * leitura que não voltou não sabe afirmar que não há pedidos (ver
 * `src/lib/porque-nao-leu.ts`).
 */

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "LIQ-1",
    name: "Ana e João",
    guests: 100,
    category: "particulares",
    eventType: "casamentos",
    submittedAt: "2026-01-10T10:00:00.000Z",
    status: "cotado",
    quotedPrice: 1000,
    ...over,
  }) as unknown as Quote;

function desenhar(props: Partial<React.ComponentProps<typeof Kanban>> = {}) {
  return render(
    <ToastProvider>
      <Kanban quotes={[]} onOpen={vi.fn()} onStatusChange={vi.fn()} {...props} />
    </ToastProvider>,
  );
}

afterEach(cleanup);

describe("o quadro inteiro vazio", () => {
  it("diz que está vazio, porquê, e o que fazer — em vez de cinco «Arrasta para aqui»", async () => {
    const onNovoPedido = vi.fn();
    desenhar({ onNovoPedido });

    expect(screen.getByText("O quadro ainda não tem pedidos")).toBeTruthy();
    // O PORQUÊ: o que são as cinco colunas e como é que um pedido lá entra.
    expect(screen.getByText(/as fases por que um pedido passa/i)).toBeTruthy();

    // A instrução impossível saiu: com o quadro todo vazio não há nada para
    // arrastar, e era ela que tapava o estado do quadro.
    expect(screen.queryByText("Arrasta para aqui")).toBeNull();

    // E a acção está DENTRO do vazio.
    await userEvent.click(screen.getByRole("button", { name: "Criar o primeiro pedido" }));
    expect(onNovoPedido).toHaveBeenCalledTimes(1);
  });

  it("com tudo arquivado não dá as boas-vindas — diz onde é que o trabalho está", async () => {
    const onVerArquivados = vi.fn();
    desenhar({ arquivados: 3, onVerArquivados, onNovoPedido: vi.fn() });

    expect(screen.getByText("O quadro está vazio — está tudo arquivado")).toBeTruthy();
    expect(screen.getByText(/Os 3 que existem estão arquivados/)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Ver os 3 arquivados" }));
    expect(onVerArquivados).toHaveBeenCalledTimes(1);
  });

  /**
   * O TESTE QUE INTERESSA MAIS: uma leitura falhada não afirma que não há nada.
   *
   * Sem isto, a base de dados em baixo desenhava «O quadro ainda não tem
   * pedidos» e «Ganho: 0 €» — duas afirmações sobre o negócio dela que ninguém
   * chegou a verificar.
   */
  it("uma leitura falhada não diz que não há pedidos, nem soma zeros", () => {
    const falha = porqueNaoLeu("", { status: 500 }, { error: "Falta correr o db/schema.sql" });
    desenhar({ falhaDeLeitura: falha, aoTentarDeNovo: vi.fn(), onNovoPedido: vi.fn() });

    expect(screen.getByText("Não foi possível ler os pedidos")).toBeTruthy();
    expect(screen.getByText(/Falta correr o db\/schema\.sql/)).toBeTruthy();

    expect(screen.queryByText("O quadro ainda não tem pedidos")).toBeNull();
    expect(screen.queryByRole("button", { name: "Criar o primeiro pedido" })).toBeNull();
    // Os quatro números do topo eram zeros calculados sobre uma lista que nunca
    // chegou. Um travessão é o que se sabe.
    expect(screen.getAllByText("—").length).toBe(4);
  });

  it("com a sessão caída não oferece um «Tentar de novo» que dá o mesmo 401", () => {
    desenhar({ falhaDeLeitura: porqueNaoLeu("", { status: 401 }), aoTentarDeNovo: vi.fn() });

    expect(screen.getByText(/A sessão expirou/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
  });

  it("com cartões no quadro nada muda: a coluna vazia continua a convidar", () => {
    desenhar({ quotes: [pedido()] });

    expect(screen.queryByText("O quadro ainda não tem pedidos")).toBeNull();
    // Cinco colunas ficam vazias (seis desde «A preparar proposta», 6/11), e
    // essas têm mesmo onde receber um cartão.
    expect(screen.getAllByText("Arrasta para aqui").length).toBe(5);
  });
});
