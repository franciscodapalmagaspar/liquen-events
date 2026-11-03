// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { esquecerVarreduraDeAquecimento, varrerAquecimentoEmFundo } from "./varrer-aquecimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O AQUECIMENTO ENCADEIA, E SABE PARAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O defeito que isto veio fechar: o aquecimento nocturno faz seis propostas
 * por noite, e com oitenta na fila são duas semanas em que um casal que reabra
 * um link antigo paga o desenho inteiro atrás de um botão calado.
 *
 * O que estes casos guardam é o que distingue isto de um ciclo a gastar
 * servidor. Encadeia enquanto há trabalho E há progresso, e pára às razões
 * certas — com uma que não é óbvia e que era a mais fácil de errar: uma função
 * que ficou sem RELÓGIO não é uma fila que acabou.
 */

const relogioReal = globalThis.setTimeout;

/** Um `setTimeout` que dispara já — a varredura espera 45 s e 10 s entre lotes. */
function semEsperas() {
  vi.stubGlobal("setTimeout", ((fn: () => void) =>
    relogioReal(fn, 0)) as unknown as typeof setTimeout);
}

function respostas(lista: unknown[]) {
  const chamadas: { url: string; metodo?: string }[] = [];
  const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
    chamadas.push({ url, metodo: init?.method });
    const proxima = lista[chamadas.length - 1];
    if (proxima === "falha-http") return { ok: false, json: async () => ({}) } as Response;
    return { ok: true, json: async () => proxima } as Response;
  });
  vi.stubGlobal("fetch", fetchFalso);
  return { chamadas, fetchFalso };
}

const deixarCorrer = () => new Promise((r) => relogioReal(r, 60));

beforeEach(() => {
  esquecerVarreduraDeAquecimento();
  semEsperas();
});
afterEach(() => {
  vi.unstubAllGlobals();
  esquecerVarreduraDeAquecimento();
});

describe("a varredura do aquecimento", () => {
  it("encadeia lotes enquanto houver propostas por aquecer", async () => {
    const { chamadas } = respostas([
      { ok: true, aquecidas: 8, restantes: 16 },
      { ok: true, aquecidas: 8, restantes: 8 },
      { ok: true, aquecidas: 8, restantes: 0 },
    ]);
    varrerAquecimentoEmFundo();
    await deixarCorrer();
    expect(chamadas).toHaveLength(3);
    expect(chamadas[0].url).toBe("/api/admin/aquecimento-pdf");
    // POST e não GET: o GET é o que CONTA, e contar não aquece nada.
    expect(chamadas[0].metodo).toBe("POST");
  });

  it("pára quando não falta nenhuma — e não pede mais um lote por hábito", async () => {
    const { chamadas } = respostas([{ ok: true, aquecidas: 3, restantes: 0 }]);
    varrerAquecimentoEmFundo();
    await deixarCorrer();
    expect(chamadas).toHaveLength(1);
  });

  it("pára quando um lote não aqueceu nada — o seguinte também não aqueceria", async () => {
    // O caso das que já desistiram ou estão a cumprir a espera de sete dias:
    // há `restantes`, mas nenhuma delas é para fazer hoje. Insistir era um
    // ciclo silencioso a gastar servidor.
    const { chamadas } = respostas([
      { ok: true, aquecidas: 0, restantes: 12 },
      { ok: true, aquecidas: 8, restantes: 4 },
    ]);
    varrerAquecimentoEmFundo();
    await deixarCorrer();
    expect(chamadas).toHaveLength(1);
  });

  it("mas uma função SEM RELÓGIO não é uma fila que acabou — essa continua", async () => {
    /**
     * A distinção que era a mais fácil de errar, e a que faz a varredura valer
     * a pena numa fila grande.
     *
     * `semTempo` quer dizer que a função bateu no tecto do orçamento a meio do
     * trabalho — não que não haja trabalho. O lote seguinte arranca com a
     * função inteira outra vez e continua de onde este parou. Tratá-lo como
     * «não aqueceu nada» era desistir a meio de uma fila que ainda anda, e
     * exactamente nas propostas mais pesadas, que são as que mais precisam.
     */
    const { chamadas } = respostas([
      { ok: true, aquecidas: 0, semTempo: true, restantes: 30 },
      { ok: true, aquecidas: 8, restantes: 22 },
      { ok: true, aquecidas: 8, restantes: 0 },
    ]);
    varrerAquecimentoEmFundo();
    await deixarCorrer();
    expect(chamadas).toHaveLength(3);
  });

  it("uma resposta que não é `ok` pára tudo, em silêncio", async () => {
    // 401 (a sessão caiu) e 503 (sem armazenamento) são estados, não falhas de
    // rede: repeti-los era pedir a uma sessão morta que voltasse a morrer.
    const { chamadas } = respostas(["falha-http", { ok: true, aquecidas: 8, restantes: 8 }]);
    varrerAquecimentoEmFundo();
    await deixarCorrer();
    expect(chamadas).toHaveLength(1);
  });

  it("uma falha de rede não estraga nada e não aparece no ecrã dela", async () => {
    // Regra 4 da varredura irmã: isto é manutenção que ela não pediu neste
    // instante. A próxima entrada no back office volta a tentar.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("sem rede");
      }),
    );
    expect(() => varrerAquecimentoEmFundo()).not.toThrow();
    await deixarCorrer();
  });

  it("dois ecrãs abertos não dão duas varreduras", async () => {
    const { chamadas } = respostas([
      { ok: true, aquecidas: 8, restantes: 8 },
      { ok: true, aquecidas: 8, restantes: 0 },
    ]);
    varrerAquecimentoEmFundo();
    varrerAquecimentoEmFundo();
    await deixarCorrer();
    expect(chamadas).toHaveLength(2);
  });

  it("interromper a varredura pára a cadeia", async () => {
    const { chamadas } = respostas([
      { ok: true, aquecidas: 8, restantes: 80 },
      { ok: true, aquecidas: 8, restantes: 72 },
    ]);
    const parar = varrerAquecimentoEmFundo();
    parar();
    await deixarCorrer();
    expect(chamadas).toHaveLength(0);
  });

  it("tem um tecto de lotes: um servidor a contar mal não a põe a pedir para sempre", async () => {
    // Cada lote diz que aqueceu e que ainda faltam muitas — para sempre. Sem o
    // tecto, isto era um ciclo infinito no browser dela.
    const fetchFalso = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, aquecidas: 8, restantes: 999 }),
    }));
    vi.stubGlobal("fetch", fetchFalso as unknown as typeof fetch);
    varrerAquecimentoEmFundo();
    await deixarCorrer();
    expect(fetchFalso.mock.calls.length).toBeGreaterThan(0);
    expect(fetchFalso.mock.calls.length).toBeLessThanOrEqual(20);
  });
});

describe("uma varredura que viu tudo feito espera 12 h (3/11)", () => {
  /**
   * A 2/11 a conta da Vercel passou o limite de processador. O primeiro lote
   * de cada abertura do back office lia todas as propostas inteiras só para
   * concluir que não faltava nada. Agora, se acabou com tudo feito, este
   * navegador não volta a perguntar durante 12 h; se ficou trabalho, a
   * abertura seguinte continua.
   */
  it("acabou com tudo aquecido: a abertura seguinte não pede nada", async () => {
    const { chamadas } = respostas([{ ok: true, aquecidas: 0, restantes: 0 }]);
    varrerAquecimentoEmFundo();
    await deixarCorrer();
    expect(chamadas).toHaveLength(1);
    varrerAquecimentoEmFundo();
    await deixarCorrer();
    expect(chamadas, "voltou a ler as propostas todas logo a seguir").toHaveLength(1);
  });

  it("ficou trabalho (falha a meio): a abertura seguinte continua", async () => {
    const { chamadas } = respostas(["falha-http", { ok: true, aquecidas: 2, restantes: 0 }]);
    varrerAquecimentoEmFundo();
    await deixarCorrer();
    expect(chamadas).toHaveLength(1);
    varrerAquecimentoEmFundo();
    await deixarCorrer();
    expect(chamadas).toHaveLength(2);
  });
});
