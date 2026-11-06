// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import FazerProposta from "./FazerProposta";

/**
 * A LISTA DE «PARA QUEM É A PROPOSTA».
 *
 * Três queixas de um telemóvel a 390 px, e um teste por cada uma:
 *
 *  1. os estados e o alerta de data andavam à direita do nome, misturados, e
 *     «Aguardar resposta» encostado à margem lia-se como um botão;
 *  2. «Data ocupada» — a informação com mais dinheiro em jogo — era a etiqueta
 *     mais apagada da lista;
 *  3. novos, enviados e perdidos apareciam todos na mesma lista.
 *
 * O que estes testes prendem é o comportamento, não o desenho: onde é que a
 * etiqueta está NA ORDEM DO CARTÃO, e quem é que a fila de estados deixa ver.
 */

// O estúdio é pesado e não entra em nenhum destes testes (só é desenhado depois
// de escolher o cliente). Fica de fora para o ficheiro correr em milissegundos.
vi.mock("./lazy", () => ({ ProposalStudio: () => null }));

let n = 0;
function pedido(over: Partial<Quote> = {}): Quote {
  n += 1;
  return {
    id: `LQ-${n}`,
    submittedAt: "2026-01-01T10:00:00.000Z",
    lastUpdated: "2026-01-01T10:00:00.000Z",
    status: "pendente" as QuoteStatus,
    name: `Casal ${n}`,
    email: `c${n}@exemplo.pt`,
    phone: "910000000",
    category: "particulares",
    eventType: "casamentos",
    eventName: "Casamento",
    date: "2027-09-18",
    endDate: "",
    location: "Évora",
    locationType: "pequena_cidade",
    guests: 120,
    duration: 8,
    isMultiDay: false,
    packageTier: "completo",
    addons: [],
    budgetRange: "15k_30k",
    urgency: "standard",
    notes: "",
    referralSource: "",
    acceptTerms: true,
    acceptMarketing: false,
    ...over,
  } as Quote;
}

function desenhar(quotes: Quote[]) {
  return render(
    <FazerProposta
      quotes={quotes}
      selectedId={null}
      onSelect={() => {}}
      onNovoPedido={() => {}}
      onSent={() => {}}
      onQuoteUpdated={() => {}}
      onAbrirPedido={() => {}}
    />,
  );
}

/** O cartão (o botão) de um pedido, pelo nome do cliente. */
function cartao(nome: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(nome) });
}

afterEach(cleanup);

describe("lista de pedidos — as etiquetas", () => {
  it("põe o estado antes do nome, e não ao lado dele", () => {
    desenhar([pedido({ name: "Marta e Gonçalo", status: "pendente" })]);

    const texto = cartao("Marta e Gonçalo").textContent ?? "";
    expect(texto.indexOf("Novo")).toBeGreaterThanOrEqual(0);
    expect(texto.indexOf("Novo"), "o estado tem de vir antes do nome no cartão").toBeLessThan(
      texto.indexOf("Marta e Gonçalo"),
    );
  });

  it("põe «Data ocupada» à frente de tudo, incluindo do estado", () => {
    // Dois eventos no mesmo dia — é o que faz nascer o alerta.
    const quotes = [
      pedido({ name: "Marta e Gonçalo", date: "2027-09-18", status: "pendente" }),
      pedido({ name: "Rita e João", date: "2027-09-18", status: "aceite" }),
    ];
    desenhar(quotes);

    const texto = cartao("Marta e Gonçalo").textContent ?? "";
    expect(texto).toContain("Data ocupada");
    expect(
      texto.indexOf("Data ocupada"),
      "«Data ocupada» é a primeira coisa do cartão",
    ).toBeLessThan(texto.indexOf("Novo"));
    expect(texto.indexOf("Data ocupada")).toBeLessThan(texto.indexOf("Marta e Gonçalo"));
  });

  it("não inventa «Data ocupada» quando as datas não se tocam", () => {
    desenhar([
      pedido({ name: "Marta e Gonçalo", date: "2027-09-18" }),
      pedido({ name: "Rita e João", date: "2027-11-30" }),
    ]);
    expect(cartao("Marta e Gonçalo").textContent).not.toContain("Data ocupada");
  });
});

/**
 * SÓ OS NOVOS.
 *
 * Palavras dela, com a lista à frente: «quero que aqui o sistema retire as
 * propostas que já foram feitas e fique apenas as que ainda não se fizeram» — e
 * depois, com um «Aguardar resposta» na captura: «mesmo para as que estão a
 * aguardar resposta retira do fazer proposta».
 */
describe("a lista mostra só os pedidos novos", () => {
  const quotes = () => [
    pedido({ name: "Ana e Pedro", status: "pendente", date: "2027-03-01" }),
    pedido({ name: "Marta e Rui", status: "em_revisao", date: "2027-03-15" }),
    pedido({ name: "Rita e João", status: "cotado", date: "2027-04-01" }),
    pedido({ name: "Inês e Tiago", status: "aceite", date: "2027-04-15" }),
    pedido({ name: "Sofia e Luís", status: "rejeitado", date: "2027-05-01" }),
  ];

  function desenharCom(over: Partial<Parameters<typeof FazerProposta>[0]> = {}) {
    return render(
      <FazerProposta
        quotes={quotes()}
        selectedId={null}
        onSelect={() => {}}
        onNovoPedido={() => {}}
        onSent={() => {}}
        onQuoteUpdated={() => {}}
        onAbrirPedido={() => {}}
        {...over}
      />,
    );
  }

  it("só os novos estão; a aguardar resposta, enviados, ganhos e perdidos não", () => {
    desenhar(quotes());
    expect(screen.getByRole("button", { name: /Ana e Pedro/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Marta e Rui/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Rita e João/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Inês e Tiago/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Sofia e Luís/ })).toBeNull();
  });

  /**
   * O estado novo de 6/11. Gravar o rascunho no estúdio põe o pedido «A
   * preparar proposta» — e o casal não pode sair desta lista no instante em
   * que ela lhe começa a proposta. Fica, com a pastilha a dizê-lo, e conta.
   */
  it("o que está a preparar fica na lista, com a pastilha, e conta no «à espera»", () => {
    desenhar([...quotes(), pedido({ name: "Beatriz e Nuno", status: "a_preparar" })]);
    const c = cartao("Beatriz e Nuno");
    expect(c.textContent).toContain("A preparar proposta");
    expect(screen.getByText("2 pedidos à espera.")).toBeTruthy();
  });

  it("não há fila de filtros: com um estado só, não havia nada para escolher", () => {
    desenhar(quotes());
    expect(screen.queryByRole("group", { name: "Filtrar por estado" })).toBeNull();
  });

  it("o «à espera» do topo conta só os novos", () => {
    desenhar([...quotes(), pedido({ name: "Beatriz e Nuno", status: "pendente" })]);
    expect(screen.getByText("2 pedidos à espera.")).toBeTruthy();
  });

  /**
   * O estado não volta sozinho a «Novo» quando o cliente responde — por isso a
   * procura não se cala sobre quem está a aguardar resposta, e o botão é o
   * caminho daqui para lhe fazer a proposta.
   */
  it("procurar quem aguarda resposta diz porquê, e deixa fazer a proposta na mesma", async () => {
    const u = userEvent.setup();
    const escolher = vi.fn();
    desenharCom({ onSelect: escolher });
    await u.type(screen.getByRole("searchbox", { name: "Procurar cliente" }), "Marta");
    expect(await screen.findByText("Marta e Rui está a aguardar resposta")).toBeTruthy();
    expect(screen.queryByText("Ninguém com esse nome")).toBeNull();
    await u.click(screen.getByRole("button", { name: "Fazer a proposta na mesma" }));
    // Abre ESSE pedido no estúdio (os ids nascem a cada `quotes()`, por isso
    // compara-se pelo que a lista lhe deu: um só, e com a forma de um id).
    expect(escolher).toHaveBeenCalledTimes(1);
    expect(String(escolher.mock.calls[0][0])).toMatch(/^LQ-\d+$/);
  });

  /**
   * Procurar um casal que já tem proposta dava «Ninguém com esse nome» — e o
   * casal existe. Diz-se onde está, e leva-se lá.
   */
  it("procurar quem já tem proposta diz onde está, e leva a Propostas", async () => {
    const u = userEvent.setup();
    const irParaPropostas = vi.fn();
    desenharCom({ onIrParaPropostas: irParaPropostas });
    await u.type(screen.getByRole("searchbox", { name: "Procurar cliente" }), "Rita");
    expect(await screen.findByText("Rita e João já tem proposta")).toBeTruthy();
    expect(screen.getByText(/Está em «Proposta enviada»/)).toBeTruthy();
    expect(screen.queryByText("Ninguém com esse nome")).toBeNull();
    await u.click(screen.getByRole("button", { name: "Ver em Propostas" }));
    expect(irParaPropostas).toHaveBeenCalledTimes(1);
  });
});
