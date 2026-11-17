import { describe, it, expect } from "vitest";
import { construirFechos, relatorio, idDoFecho, DIAS_ACEITES } from "./conversoes-fecho";
import type { Quote, Proposal } from "@/lib/orcamento/types";

/**
 * O erro que estes testes existem para impedir é sempre o mesmo: um número
 * errado a chegar à Meta. Um valor com IVA infla o retorno em 23% e leva-a a
 * licitar mais alto do que o negócio aguenta; um envio repetido duplica a
 * receita; um evento fora da janela é recusado em silêncio e a conversão
 * desaparece sem ninguém dar por isso.
 */

const AGORA = Date.parse("2026-03-10T12:00:00.000Z");
const dias = (n: number) => new Date(AGORA - n * 86_400_000).toISOString();

function pedido(over: Partial<Quote> = {}): Quote {
  return {
    id: "ABC123XY",
    status: "aceite",
    submittedAt: dias(60),
    lastUpdated: dias(2),
    name: "Ana Silva",
    email: "ana@exemplo.pt",
    phone: "919259820",
    metaClick: "fbp=fb.1.1700000000000.111;fbc=fb.1.1700000000000.CLIQUE",
    // Houve «Aceitar»: o formulário só manda o `leadEventId` com consentimento.
    leadEventId: "evt-consentido",
    // `quotedPrice` é o campo "Preço final (SEM IVA)" do ecrã de administração,
    // ou seja já é líquido (ver contractedAmounts em lib/orcamento/dossier.ts).
    // 20 000 € líquidos correspondem a 24 600 € a receber com IVA a 23%.
    quotedPrice: 20_000,
    ...over,
  } as unknown as Quote;
}

/** Nem proposta nem contrato: o valor vem do que estiver gravado no pedido. */
const semProposta = () => null as Proposal | null;
const semContrato = () => undefined;

describe("construir os fechos", () => {
  // Auditoria legal (17/11), achado da revisão: um pedido gravado antes da
  // correção podia ter o clique sem consentimento (sem `leadEventId`).
  it("um pedido sem consentimento (sem leadEventId) não leva o clique à Meta", () => {
    const r = construirFechos(
      [pedido({ leadEventId: "" })],
      semProposta,
      semContrato,
      new Set(),
      AGORA,
    );
    expect(r.eventos).toHaveLength(0);
    expect(r.excluidos[0]).toMatchObject({ ref: "ABC123XY", motivo: "sem-identificador" });
  });

  it("um casamento fechado dentro da janela gera evento", () => {
    const r = construirFechos([pedido()], semProposta, semContrato, new Set(), AGORA);
    expect(r.examinados).toBe(1);
    expect(r.eventos).toHaveLength(1);
    expect(r.eventos[0].nome).toBe("Purchase");
    expect(r.eventos[0].fonte).toBe("system_generated");
    expect(r.eventos[0].pessoa.fbc).toBe("fb.1.1700000000000.CLIQUE");
  });

  it("o valor vai SEM IVA", () => {
    // O que se envia é a RECEITA, não o dinheiro que passa pela conta. Enviar
    // o bruto faria a Meta pensar que o negócio rende 23% mais do que rende, e
    // licitar em cima disso. Com proposta gravada o líquido é o `subtotal`;
    // sem ela é o `quotedPrice`, que já está sem IVA.
    const semP = construirFechos([pedido()], semProposta, semContrato, new Set(), AGORA);
    expect(semP.eventos[0].valor).toBeCloseTo(20_000, 0);

    const comProposta = () =>
      ({ total: 24_600, subtotal: 20_000, vat: 4_600, vatRate: 0.23 }) as unknown as Proposal;
    const comP = construirFechos([pedido()], comProposta, semContrato, new Set(), AGORA);
    expect(comP.eventos[0].valor).toBeCloseTo(20_000, 0);
    expect(comP.eventos[0].valor).not.toBeCloseTo(24_600, 0);
  });

  it("um pedido sem identificador da Meta não gera evento, e é o caso normal", () => {
    const r = construirFechos(
      [pedido({ metaClick: "" })],
      semProposta,
      semContrato,
      new Set(),
      AGORA,
    );
    expect(r.eventos).toHaveLength(0);
    expect(r.excluidos[0].motivo).toBe("sem-identificador");
  });

  it("um identificador ilegível é distinguido de não haver identificador", () => {
    const r = construirFechos(
      [pedido({ metaClick: "lixo sem forma nenhuma" })],
      semProposta,
      semContrato,
      new Set(),
      AGORA,
    );
    expect(r.excluidos[0].motivo).toBe("identificador-ilegivel");
  });

  it("um fecho mais velho do que a janela é excluído, com a razão", () => {
    const velho = pedido({ lastUpdated: dias(DIAS_ACEITES + 1) });
    const r = construirFechos([velho], semProposta, semContrato, new Set(), AGORA);
    expect(r.eventos).toHaveLength(0);
    expect(r.excluidos[0].motivo).toBe("fora-da-janela");
    expect(r.excluidos[0].detalhe).toContain(String(DIAS_ACEITES));
  });

  it("um fecho exactamente no limite da janela ainda passa", () => {
    const r = construirFechos(
      [pedido({ lastUpdated: dias(DIAS_ACEITES) })],
      semProposta,
      semContrato,
      new Set(),
      AGORA,
    );
    expect(r.eventos).toHaveLength(1);
  });

  it("um pedido sem valor não gera evento", () => {
    const r = construirFechos(
      [pedido({ quotedPrice: 0 } as Partial<Quote>)],
      semProposta,
      semContrato,
      new Set(),
      AGORA,
    );
    expect(r.eventos).toHaveLength(0);
    expect(r.excluidos[0].motivo).toBe("sem-valor");
  });

  it("um pedido já enviado NÃO é enviado outra vez", () => {
    // Esta rota corre com frequência de propósito. Sem esta guarda, cada
    // corrida somaria a mesma receita outra vez.
    const r = construirFechos([pedido()], semProposta, semContrato, new Set(["ABC123XY"]), AGORA);
    expect(r.eventos).toHaveLength(0);
    expect(r.excluidos[0].motivo).toBe("ja-enviado");
  });

  it("só os pedidos aceites contam, e os arquivados não", () => {
    const r = construirFechos(
      [
        pedido({ id: "P1", status: "pendente" } as Partial<Quote>),
        pedido({ id: "P2", archived: true } as Partial<Quote>),
        pedido({ id: "P3" }),
      ],
      semProposta,
      semContrato,
      new Set(),
      AGORA,
    );
    expect(r.examinados).toBe(1);
    expect(r.eventos).toHaveLength(1);
  });

  it("a data de aceitação do contrato ganha à última alteração", () => {
    // É a data com significado legal do fecho. Sem isto, corrigir um campo
    // qualquer do pedido em Junho faria um casamento fechado em Janeiro voltar
    // a caber na janela e ser enviado com a data errada.
    const r = construirFechos(
      [pedido({ lastUpdated: dias(1) })],
      semProposta,
      () => dias(DIAS_ACEITES + 5),
      new Set(),
      AGORA,
    );
    expect(r.eventos).toHaveLength(0);
    expect(r.excluidos[0].motivo).toBe("fora-da-janela");
  });

  it("o event_time nunca vai no futuro", () => {
    // Um relógio adiantado numa máquina qualquer faria a Meta recusar o evento.
    const r = construirFechos(
      [pedido({ lastUpdated: new Date(AGORA + 86_400_000).toISOString() })],
      semProposta,
      semContrato,
      new Set(),
      AGORA,
    );
    expect(r.eventos[0].quando).toBeLessThanOrEqual(Math.floor(AGORA / 1000));
  });
});

describe("idDoFecho", () => {
  it("é ESTÁVEL para a mesma referência", () => {
    // É o que impede que uma segunda corrida da rota conte o mesmo casamento
    // como conversão nova.
    expect(idDoFecho("ABC123XY")).toBe(idDoFecho("ABC123XY"));
  });

  it("é diferente entre referências diferentes", () => {
    expect(idDoFecho("ABC123XY")).not.toBe(idDoFecho("ZZZ999QQ"));
  });

  it("aguenta uma referência com caracteres estranhos", () => {
    expect(idDoFecho("a/b c#d!ефг")).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("relatório", () => {
  it("diz quantos foram examinados, não só quantos saem", () => {
    // Um relatório que devolve três eventos quando havia dez negócios
    // fechados, sem dizer nada, levaria alguém a concluir que a publicidade
    // só trouxe três.
    const r = construirFechos(
      [pedido({ id: "P1" }), pedido({ id: "P2", metaClick: "" })],
      semProposta,
      semContrato,
      new Set(),
      AGORA,
    );
    const texto = relatorio(r, 20_000);
    expect(texto).toContain("Casamentos fechados examinados: 2");
    expect(texto).toContain("Eventos a enviar: 1");
    expect(texto).toContain("20000.00 €");
    expect(texto).toContain("sem-identificador");
  });
});
