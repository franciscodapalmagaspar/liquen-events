import { describe, it, expect } from "vitest";
import type { QuoteStatus } from "./types";
import {
  ESTADO_APOS,
  ORDEM_DOS_ESTADOS,
  ROTULO_DO_ESTADO,
  degrauDoEstado,
  estadoApos,
  transicaoDoPedido,
  type AcontecimentoDoPedido,
} from "./estado-do-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTES TESTES GUARDAM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Não os valores — a REGRA. Que o estado segue o que foi feito ao cliente, que
 * nunca anda para trás, que não inventa palavras novas, e que `rejeitado` é
 * uma decisão de uma pessoa e mais ninguém lhe toca.
 *
 * A tabela abaixo é a especificação inteira, escrita uma vez. Se um dia se
 * acrescentar um acontecimento e ninguém decidir a que estado dá direito, o
 * teste da cobertura no fim do ficheiro chumba — em vez de o acontecimento
 * novo passar despercebido e não mexer em nada.
 */
const TODOS: AcontecimentoDoPedido[] = [
  "mensagem_enviada",
  // O estúdio a gravar o rascunho da proposta (6/11, pedido dela).
  "proposta_em_preparacao",
  "proposta_enviada",
  // Ela a marcar a proposta como aceite no back office — não o cliente pelo
  // link público, que é outra porta e vive noutro sítio. Mesmo tecto do
  // pagamento e do contrato, e pela mesma razão: ninguém marca uma proposta
  // como aceite a um casal que ainda está a pensar.
  "proposta_aceite",
  "pagamento_recebido",
  "contrato_registado",
];

const AGORA = "2026-08-11T09:00:00.000Z";
const opcoes = { at: AGORA, id: "fixo" };

describe("a escada dos estados", () => {
  it("é a ordem por que o negócio anda, e não inclui `rejeitado`", () => {
    expect([...ORDEM_DOS_ESTADOS]).toEqual([
      "pendente",
      "em_revisao",
      "a_preparar",
      "cotado",
      "aceite",
    ]);
    expect(ORDEM_DOS_ESTADOS).not.toContain("rejeitado");
  });

  it("dá o degrau de cada estado, e nenhum para `rejeitado`", () => {
    expect(degrauDoEstado("pendente")).toBe(0);
    expect(degrauDoEstado("em_revisao")).toBe(1);
    expect(degrauDoEstado("a_preparar")).toBe(2);
    expect(degrauDoEstado("cotado")).toBe(3);
    expect(degrauDoEstado("aceite")).toBe(4);
    expect(degrauDoEstado("rejeitado")).toBeNull();
  });

  /**
   * Há pedidos gravados antes de metade dos campos de hoje existirem, e rotas
   * que só leem parte do registo. Um estado em falta não pode fazer a regra
   * recusar-se a decidir — parte-se do princípio de que está no início, que é
   * o que ele é.
   */
  it("um pedido sem estado nenhum conta como estando no princípio", () => {
    expect(degrauDoEstado(undefined)).toBe(0);
    expect(degrauDoEstado(null)).toBe(0);
    expect(estadoApos("proposta_enviada", undefined)).toBe("cotado");
  });
});

describe("cada acontecimento leva o pedido ao seu estado", () => {
  it("responder ao cliente põe um pedido novo a aguardar resposta", () => {
    expect(estadoApos("mensagem_enviada", "pendente")).toBe("em_revisao");
  });

  /**
   * O pedido dela de 6/11: «quero que também haja um estado a dizer, a fazer
   * proposta, ou a preparar proposta». Começar a proposta no estúdio já o diz
   * — de um pedido novo ou de um que está a aguardar resposta.
   */
  it("gravar o rascunho no estúdio põe-no em «A preparar proposta»", () => {
    expect(estadoApos("proposta_em_preparacao", "pendente")).toBe("a_preparar");
    expect(estadoApos("proposta_em_preparacao", "em_revisao")).toBe("a_preparar");
    expect(estadoApos("proposta_em_preparacao", undefined)).toBe("a_preparar");
  });

  it("enviar a proposta põe-no em «Proposta enviada»", () => {
    expect(estadoApos("proposta_enviada", "pendente")).toBe("cotado");
    expect(estadoApos("proposta_enviada", "em_revisao")).toBe("cotado");
    expect(estadoApos("proposta_enviada", "a_preparar")).toBe("cotado");
  });

  /**
   * Os três acontecimentos do fecho dizem a mesma coisa: o trabalho é nosso.
   * Ninguém transfere um sinal — nem marca uma proposta como aceite — a quem
   * ainda está a pensar.
   */
  it("aceitar a proposta, receber um pagamento ou registar o contrato dão o pedido por ganho", () => {
    for (const acontecimento of [
      "proposta_aceite",
      "pagamento_recebido",
      "contrato_registado",
    ] as const) {
      expect(estadoApos(acontecimento, "pendente")).toBe("aceite");
      expect(estadoApos(acontecimento, "em_revisao")).toBe("aceite");
      expect(estadoApos(acontecimento, "a_preparar")).toBe("aceite");
      expect(estadoApos(acontecimento, "cotado")).toBe("aceite");
    }
  });

  it("nunca inventa um estado que o resto do back office não saiba pintar", () => {
    const conhecidos: QuoteStatus[] = [
      "pendente",
      "em_revisao",
      "a_preparar",
      "cotado",
      "aceite",
      "rejeitado",
    ];
    for (const acontecimento of TODOS) {
      expect(conhecidos).toContain(ESTADO_APOS[acontecimento]);
    }
  });

  it("nenhum acontecimento chega a `rejeitado` — perder um trabalho é uma decisão de uma pessoa", () => {
    for (const acontecimento of TODOS) {
      expect(ESTADO_APOS[acontecimento]).not.toBe("rejeitado");
      for (const estado of ORDEM_DOS_ESTADOS) {
        expect(estadoApos(acontecimento, estado)).not.toBe("rejeitado");
      }
    }
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O NÃO-RECUO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A regra que sustenta todas as outras. Um estado que anda para trás sozinho é
 * a maneira mais rápida de a coluna deixar de merecer confiança — e a partir do
 * dia em que ela deixa de confiar na coluna, o quadro inteiro passa a ser
 * decoração.
 */
describe("o estado nunca anda para trás", () => {
  it("registar um pagamento num pedido já ganho não o põe outra vez em «Proposta enviada»", () => {
    expect(estadoApos("pagamento_recebido", "aceite")).toBeNull();
  });

  it("mandar uma nota a um casamento já fechado não o desfecha", () => {
    expect(estadoApos("mensagem_enviada", "cotado")).toBeNull();
    expect(estadoApos("mensagem_enviada", "aceite")).toBeNull();
  });

  it("enviar uma proposta nova a um cliente que já aceitou não desfaz o aceite", () => {
    // Acontece a sério: a proposta é revista depois do aceite (ver a nota sobre
    // isso no cálculo do saldo). Rever o documento não desfaz o negócio.
    expect(estadoApos("proposta_enviada", "aceite")).toBeNull();
  });

  /**
   * O autosave do estúdio corre a cada pausa na escrita. Rever a proposta de um
   * casamento já enviado — ou já ganho — não o pode pôr outra vez «a preparar».
   */
  it("gravar um rascunho de uma proposta já enviada, ganha ou perdida não mexe no pedido", () => {
    expect(estadoApos("proposta_em_preparacao", "cotado")).toBeNull();
    expect(estadoApos("proposta_em_preparacao", "aceite")).toBeNull();
    expect(estadoApos("proposta_em_preparacao", "rejeitado")).toBeNull();
  });

  it("responder ao cliente enquanto a proposta se prepara não a tira de «A preparar proposta»", () => {
    expect(estadoApos("mensagem_enviada", "a_preparar")).toBeNull();
  });

  it("não reescreve o estado de quem já lá está", () => {
    expect(estadoApos("proposta_em_preparacao", "a_preparar")).toBeNull();
    expect(estadoApos("mensagem_enviada", "em_revisao")).toBeNull();
    expect(estadoApos("proposta_enviada", "cotado")).toBeNull();
    expect(estadoApos("pagamento_recebido", "aceite")).toBeNull();
  });

  /** A varredura completa: nenhum par (acontecimento, estado) desce a escada. */
  it("nenhuma combinação possível desce um degrau que seja", () => {
    for (const acontecimento of TODOS) {
      for (const estado of ORDEM_DOS_ESTADOS) {
        const destino = estadoApos(acontecimento, estado);
        if (destino === null) continue;
        expect(degrauDoEstado(destino)!).toBeGreaterThan(degrauDoEstado(estado)!);
      }
    }
  });
});

describe("um pedido perdido fica quieto", () => {
  /**
   * `rejeitado` está fora da escada de propósito. Uma factura de cancelamento
   * num trabalho perdido é uma coisa que acontece — e não pode ressuscitar o
   * negócio no quadro. Quem o perdeu foi uma pessoa; quem o reabre também.
   */
  it("nenhum acontecimento tira um pedido de «Perdido»", () => {
    for (const acontecimento of TODOS) {
      expect(estadoApos(acontecimento, "rejeitado")).toBeNull();
      expect(transicaoDoPedido({ acontecimento, estadoActual: "rejeitado" })).toBeNull();
    }
  });
});

describe("a linha que fica no histórico", () => {
  /**
   * Ela vê a coluna mudar sozinha. Sem esta linha, não tem como saber o que a
   * mudou — e uma coluna que muda sem explicação é pior do que uma parada.
   */
  it("diz de onde veio, para onde foi e o que a causou", () => {
    const t = transicaoDoPedido({
      acontecimento: "pagamento_recebido",
      estadoActual: "cotado",
      detalhe: "sinal · 3 690,00 €",
      ...opcoes,
    });
    expect(t).not.toBeNull();
    expect(t!.status).toBe("aceite");
    expect(t!.entrada.summary).toBe(
      "Proposta enviada → Ganho · pagamento recebido (sinal · 3 690,00 €)",
    );
  });

  it("usa os rótulos do quadro e não os nomes internos dos campos", () => {
    // Se o histórico dissesse «pendente → cotado» e a coluna dissesse «Novo» e
    // «Proposta enviada», eram duas linguagens para a mesma coisa.
    const t = transicaoDoPedido({
      acontecimento: "proposta_enviada",
      estadoActual: "pendente",
      ...opcoes,
    });
    expect(t!.entrada.summary).toContain(ROTULO_DO_ESTADO.pendente);
    expect(t!.entrada.summary).toContain(ROTULO_DO_ESTADO.cotado);
    expect(t!.entrada.summary).not.toContain("cotado");
  });

  it("aguenta não haver detalhe nenhum sem deixar parênteses vazios", () => {
    const t = transicaoDoPedido({
      acontecimento: "mensagem_enviada",
      estadoActual: "pendente",
      ...opcoes,
    });
    expect(t!.entrada.summary).toBe("Novo → Aguardar resposta · respondemos ao cliente");
    expect(t!.entrada.summary).not.toContain("()");
  });

  it("um detalhe só com espaços não conta como detalhe", () => {
    const t = transicaoDoPedido({
      acontecimento: "pagamento_recebido",
      estadoActual: "cotado",
      detalhe: "   ",
      ...opcoes,
    });
    expect(t!.entrada.summary).not.toContain("(");
  });

  it("é assinada pelo «Sistema», para se distinguir do que ela mudou à mão", () => {
    const t = transicaoDoPedido({
      acontecimento: "pagamento_recebido",
      estadoActual: "cotado",
      ...opcoes,
    });
    expect(t!.entrada.actor).toBe("Sistema");
  });

  it("é uma mudança de estado como as outras, para ter o mesmo ícone na lista", () => {
    const t = transicaoDoPedido({
      acontecimento: "pagamento_recebido",
      estadoActual: "cotado",
      ...opcoes,
    });
    expect(t!.entrada.kind).toBe("status_change");
  });

  it("a linha do estúdio diz que a proposta começou, com os rótulos do quadro", () => {
    const t = transicaoDoPedido({
      acontecimento: "proposta_em_preparacao",
      estadoActual: "em_revisao",
      ...opcoes,
    });
    expect(t!.status).toBe("a_preparar");
    expect(t!.entrada.summary).toBe(
      "Aguardar resposta → A preparar proposta · começámos a proposta no estúdio",
    );
  });

  it("um pedido sem estado nenhum parte de «Novo» na frase", () => {
    const t = transicaoDoPedido({
      acontecimento: "proposta_enviada",
      estadoActual: undefined,
      ...opcoes,
    });
    expect(t!.entrada.summary).toBe("Novo → Proposta enviada · proposta enviada ao cliente");
  });

  it("traz um identificador e uma hora próprios quando não lhos dão", () => {
    const t = transicaoDoPedido({ acontecimento: "pagamento_recebido", estadoActual: "pendente" });
    expect(t!.entrada.id).toBeTruthy();
    expect(Number.isNaN(Date.parse(t!.entrada.at))).toBe(false);
  });

  it("não escreve linha nenhuma quando não há mudança nenhuma a explicar", () => {
    // Uma entrada «Ganho → Ganho» no histórico seria ruído a esconder o que
    // interessa — e a lista dela já é longa.
    expect(
      transicaoDoPedido({ acontecimento: "pagamento_recebido", estadoActual: "aceite" }),
    ).toBeNull();
  });
});

describe("a tabela está completa", () => {
  it("todo o acontecimento declarado tem um estado decidido e um motivo escrito", () => {
    for (const acontecimento of TODOS) {
      expect(ESTADO_APOS[acontecimento], `falta decidir o estado de ${acontecimento}`).toBeTruthy();
      const t = transicaoDoPedido({ acontecimento, estadoActual: "pendente", ...opcoes });
      expect(t, `${acontecimento} não avança um pedido novo`).not.toBeNull();
      // O motivo é a parte da frase depois do «·» — nunca pode sair vazia.
      expect(t!.entrada.summary.split("·")[1]?.trim()).toBeTruthy();
    }
  });

  it("a lista de acontecimentos do teste cobre a do módulo", () => {
    expect(TODOS.sort()).toEqual((Object.keys(ESTADO_APOS) as AcontecimentoDoPedido[]).sort());
  });
});
