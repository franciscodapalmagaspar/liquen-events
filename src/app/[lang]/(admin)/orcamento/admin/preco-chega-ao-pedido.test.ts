// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mandarPrecoAoPedido } from "@/lib/orcamento/estudio/gravar";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PREÇO DA PROPOSTA TEM DE CHEGAR AO PEDIDO — OU DIZER QUE NÃO CHEGOU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O defeito 2.3 da auditoria da casa, e a queixa mais repetida da dona do
 * negócio: «o valor enviado para o cliente tem de ser o valor que fica na
 * proposta». O Estúdio e o PDF mostravam 9.500 €; o cartão do pedido, a margem,
 * as Estatísticas e as facturas ficavam em 8.000 €.
 *
 * A causa era um `catch` vazio com o comentário «a gravação seguinte volta a
 * tentar». Não há gravação seguinte: a chamada só parte quando alguém MEXE no
 * valor. Uma piscadela de rede na única vez que ela escreve o preço, e ninguém
 * volta a tentar nada — nem ninguém avisa.
 *
 * Aqui prova-se o que passou a acontecer: repete, não repete o que não vale a
 * pena repetir, e quando desiste devolve a verdade em vez de a engolir.
 */

const original = globalThis.fetch;

/** Uma resposta de `fetch` com o mínimo que o ajudante lê. */
function resposta(status: number, corpo: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  } as unknown as Response;
}

beforeEach(() => {
  // Sem esperas verdadeiras: a pausa entre tentativas é de propósito crescente
  // e não é isso que aqui se mede.
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
    fn();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = original;
});

describe("o preço da proposta a caminho do pedido", () => {
  it("uma ligação que pisca não perde o valor — repete e grava", async () => {
    const chamadas: string[] = [];
    globalThis.fetch = vi.fn(async () => {
      chamadas.push("tentativa");
      if (chamadas.length < 3) throw new Error("rede em baixo");
      return resposta(200, { id: "q1", quotedPrice: 9500 });
    }) as unknown as typeof fetch;

    const r = await mandarPrecoAoPedido("q1", 9500);

    expect(chamadas.length, "desistiu antes de esgotar as tentativas").toBe(3);
    expect(r.estado).toBe("gravado");
    if (r.estado === "gravado") expect(r.quote?.quotedPrice).toBe(9500);
  });

  it("quando nem à terceira chega, DIZ — em vez de engolir", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("rede em baixo");
    }) as unknown as typeof fetch;

    const r = await mandarPrecoAoPedido("q1", 9500);

    expect(r.estado, "o silêncio é que era o defeito").toBe("falhou");
    if (r.estado === "falhou") {
      expect(r.valeTentarDeNovo, "sem rede, tentar outra vez pode funcionar").toBe(true);
    }
  });

  it("um 4xx não se repete — e não oferece um botão que não pode funcionar", async () => {
    let vezes = 0;
    globalThis.fetch = vi.fn(async () => {
      vezes += 1;
      return resposta(401, { error: "Não autorizado" });
    }) as unknown as typeof fetch;

    const r = await mandarPrecoAoPedido("q1", 9500);

    expect(vezes, "repetir um 401 dá exactamente o mesmo 401").toBe(1);
    expect(r.estado).toBe("falhou");
    if (r.estado === "falhou") {
      expect(r.valeTentarDeNovo).toBe(false);
      expect(r.porque, "a frase do servidor vale mais do que «algo correu mal»").toBe(
        "Não autorizado",
      );
    }
  });

  it("um 500 repete-se — é o caso que a repetição existe para apanhar", async () => {
    let vezes = 0;
    globalThis.fetch = vi.fn(async () => {
      vezes += 1;
      return resposta(500, { error: "Erro interno" });
    }) as unknown as typeof fetch;

    await mandarPrecoAoPedido("q1", 9500);

    expect(vezes).toBeGreaterThan(1);
  });

  it("apagar o preço chega ao servidor como `null`, e não desaparece", async () => {
    let corpo: unknown = null;
    globalThis.fetch = vi.fn(async (_url: unknown, init: unknown) => {
      corpo = JSON.parse((init as { body: string }).body);
      return resposta(200, { id: "q1" });
    }) as unknown as typeof fetch;

    await mandarPrecoAoPedido("q1", null);

    // `undefined` desaparecia no JSON e o merge parcial mantinha o valor antigo.
    expect(corpo).toEqual({ quotedPrice: null });
  });

  it("um 200 com corpo ilegível é um 200 — não se levanta alarme sobre trabalho são", async () => {
    globalThis.fetch = vi.fn(async () => resposta(200, undefined)) as unknown as typeof fetch;

    const r = await mandarPrecoAoPedido("q1", 9500);
    // Gravou: o estado vem do 200, não de se ter conseguido ler o corpo. O que
    // falta é só o `quote` para propagar — e um alarme vermelho por cima de
    // trabalho são ensinava-a a ignorar o alarme quando ele for verdade.
    expect(r.estado).toBe("gravado");
    if (r.estado === "gravado") expect(r.quote).toBeUndefined();
  });
});
