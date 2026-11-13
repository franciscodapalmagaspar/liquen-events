import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ÚNICA ESCRITA EM FICHEIRO QUE AINDA NÃO TINHA GUARDA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `repository` recusa gravar em ficheiro quando está em produção
 * (`assertWritableInProd`), e o restauro faz o mesmo. Esta ficheira escrevia
 * alegremente: sem base de dados em produção, `saveSubscription` guardava a
 * subscrição no disco da função e devolvia OK.
 *
 * O PERCURSO QUE ISSO PRODUZ, dito por extenso, porque é o que faz este ficheiro
 * valer a pena: ela liga as notificações no telemóvel, o browser pede
 * autorização, ela dá, o ecrã diz que ficou ligado. O deploy seguinte apaga o
 * disco. A partir daí o telemóvel continua a mostrar as notificações como
 * ACTIVAS — a subscrição existe do lado do browser — e nunca mais chega uma
 * única. Ninguém recebe erro nenhum: um pedido de orçamento entra às três da
 * tarde e fica sem aviso, e a primeira vez que se percebe é quando o cliente
 * pergunta porque é que ninguém respondeu.
 *
 * Melhor não ligar do que ligar por engano. Por isso a escrita passa a ser
 * RECUSADA em produção sem base de dados, com a mesma forma de erro que o
 * `repository` já usa — para o ecrã poder dizer o que se passa em vez de «Erro».
 */

const st = vi.hoisted(() => ({
  cliente: null as unknown,
  lido: "[]",
  escrito: null as string | null,
  enviadas: [] as string[],
  /** O que cada aparelho recebeu: endereço → corpo. */
  corpos: {} as Record<string, string>,
  /** As chaves que foram ao serviço de push. */
  chavesEnviadas: [] as Record<string, unknown>[],
  /** Código HTTP com que o serviço de push recusa a entrega, quando recusa. */
  recusaCom: null as number | null,
}));

vi.mock("./supabase", () => ({ getSupabase: () => st.cliente }));
vi.mock("./logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("fs", () => ({
  promises: {
    readFile: vi.fn(async () => st.lido),
    writeFile: vi.fn(async (_p: string, conteudo: string) => {
      st.escrito = conteudo;
    }),
  },
}));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(
      async (sub: { endpoint: string; keys: Record<string, unknown> }, corpo: string) => {
        st.corpos[sub.endpoint] = corpo;
        st.chavesEnviadas.push(sub.keys);
        if (st.recusaCom !== null) {
          // A forma do erro do `web-push`: o código HTTP vem em `statusCode`.
          throw Object.assign(new Error(`push recusado (${st.recusaCom})`), {
            statusCode: st.recusaCom,
          });
        }
        st.enviadas.push(sub.endpoint);
      },
    ),
  },
}));

import { saveSubscription, removeSubscription, sendPushToAll } from "./push";
import { isPersistenceUnavailable } from "./repository";
import { log } from "./logger";

const SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "BQ".repeat(20), auth: "AZ".repeat(10) },
};

beforeEach(() => {
  st.cliente = null;
  st.lido = "[]";
  st.escrito = null;
  st.enviadas = [];
  st.corpos = {};
  st.chavesEnviadas = [];
  st.recusaCom = null;
  vi.clearAllMocks();
  vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
  vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("em produção sem base de dados, a subscrição é RECUSADA", () => {
  it("não escreve no ficheiro, e diz porquê", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(saveSubscription(SUB)).rejects.toThrow();
    expect(st.escrito).toBeNull();
  });

  it("o erro tem a forma que o resto da casa já reconhece", async () => {
    vi.stubEnv("NODE_ENV", "production");
    // Mesma família do `repository`: é o que deixa a rota responder 503 com uma
    // frase útil em vez de um 500 «Erro».
    await saveSubscription(SUB).then(
      () => expect.unreachable("devia ter recusado"),
      (err) => expect(isPersistenceUnavailable(err)).toBe(true),
    );
  });

  /** Desligar tem de funcionar SEMPRE. Recusar aqui deixava alguém preso a uma
   *  subscrição que não consegue apagar — e não há nada a proteger: o sítio
   *  onde ela estaria já não existe. */
  it("mas desligar não rebenta — e também não escreve nada", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(removeSubscription(SUB.endpoint)).resolves.toBeUndefined();
    expect(st.escrito).toBeNull();
  });

  /** O ficheiro que sobreviveu ao deploy é o do REPOSITÓRIO, com o que lá
   *  estivesse na altura do commit. Mandar notificações para endereços vindos
   *  daí é mandá-las para browsers que já ninguém usa. */
  it("e não se enviam notificações para o que estiver no ficheiro do deploy", async () => {
    vi.stubEnv("NODE_ENV", "production");
    st.lido = JSON.stringify([SUB]);
    const r = await sendPushToAll({ title: "Pedido novo", body: "…" });
    expect(r.sent).toBe(0);
    expect(st.enviadas).toEqual([]);
  });
});

/**
 * Na máquina de alguém o ficheiro é o desenho — é assim que se experimentam as
 * notificações sem montar um Supabase. Fechar isto seria partir o
 * desenvolvimento para resolver um problema de produção.
 */
describe("em desenvolvimento o ficheiro continua a ser um sítio", () => {
  it("guarda a subscrição no ficheiro", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await saveSubscription(SUB);
    expect(st.escrito).toContain(SUB.endpoint);
  });

  it("e envia para quem lá estiver", async () => {
    vi.stubEnv("NODE_ENV", "development");
    st.lido = JSON.stringify([SUB]);
    const r = await sendPushToAll({ title: "Pedido novo", body: "…" });
    expect(r.sent).toBe(1);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA ENTREGA QUE FALHA TEM DE DEIXAR RASTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O envio apanhava TODOS os erros e não fazia nada com eles: só o 404 e o 410
 * levavam a alguma coisa (apagar a subscrição). Uma chave VAPID trocada, um
 * assunto inválido, o serviço de push da Google a responder 403 — tudo isso
 * devolvia `{ sent: 0 }`, exactamente igual a «não havia nada para enviar».
 *
 * O percurso: as chaves são rodadas numa manhã e ninguém volta a receber uma
 * notificação. O painel diz «Sem novidades para notificar agora», o registo não
 * tem uma linha, o Sentry não tem um evento. O sistema inteiro está avariado e
 * a única coisa que se vê é silêncio — que é indistinguível de sossego.
 */
describe("o que falha na entrega é contado e registado", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    st.lido = JSON.stringify([SUB, { ...SUB, endpoint: `${SUB.endpoint}-2` }]);
  });

  it("uma recusa do serviço de push é contada e sai no registo", async () => {
    st.recusaCom = 403;
    const r = await sendPushToAll({ title: "Pedido novo", body: "…" });
    expect(r).toMatchObject({ sent: 0, failed: 2 });
    expect(log.error).toHaveBeenCalled();
  });

  it("o registo não leva o endereço da subscrição, que é uma credencial", async () => {
    // O endpoint de push é uma capacidade: quem o tem manda notificações para
    // aquele aparelho. Não vai para registos que são conservados e reencaminhados.
    st.recusaCom = 403;
    await sendPushToAll({ title: "Pedido novo", body: "…" });
    expect(
      JSON.stringify((log.error as unknown as { mock: { calls: unknown[] } }).mock.calls),
    ).not.toContain(SUB.endpoint);
  });

  it("uma subscrição morta é limpa e NÃO conta como avaria", async () => {
    // 410 é o funcionamento normal: o browser desinstalou-se, apaga-se e segue.
    // Contá-la como falha punha o painel a gritar por causa de nada.
    st.recusaCom = 410;
    const r = await sendPushToAll({ title: "Pedido novo", body: "…" });
    expect(r).toMatchObject({ sent: 0, failed: 0 });
    expect(log.error).not.toHaveBeenCalled();
  });

  it("sem chaves VAPID diz-se qual é a variável que falta", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const r = await sendPushToAll({ title: "Pedido novo", body: "…" });
    expect(r).toMatchObject({ sent: 0 });
    const dito = JSON.stringify((log.warn as unknown as { mock: { calls: unknown[] } }).mock.calls);
    expect(dito).toContain("VAPID");
  });
});

/** Com base de dados nada disto se aplica: é o caminho bom, e é o mesmo em
 *  qualquer ambiente. */
describe("com base de dados configurada", () => {
  it("grava na tabela e nunca toca no ficheiro", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const upsert = vi.fn(async () => ({ error: null }));
    st.cliente = { from: () => ({ upsert }) };
    await saveSubscription(SUB);
    expect(upsert).toHaveBeenCalled();
    expect(st.escrito).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A SUBSCRIÇÃO É DE UMA CONTA (auditoria de 13/11, n.º 7)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As notificações levam nomes de casais e valores. Quem sai da equipa perde a
 * sessão — e tem de perder também o telemóvel a ouvir.
 */
describe("a subscrição é de uma conta", () => {
  const ANA = {
    ...SUB,
    endpoint: `${SUB.endpoint}-ana`,
    keys: { ...SUB.keys, conta: "TESTE Ana" },
  };
  const RUI = {
    ...SUB,
    endpoint: `${SUB.endpoint}-rui`,
    keys: { ...SUB.keys, conta: "TESTE Rui" },
  };
  const ANTIGA = { ...SUB, endpoint: `${SUB.endpoint}-antiga` };

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    // O Rui saiu da equipa: já não está no ADMIN_USERS.
    vi.stubEnv(
      "ADMIN_USERS",
      JSON.stringify([{ name: "TESTE Ana", email: "ana@exemplo.test", passwordHash: "$2a$04$x" }]),
    );
  });

  it("guarda a conta de quem ligou", async () => {
    await saveSubscription(SUB, "TESTE Ana");
    expect(JSON.parse(st.escrito ?? "[]")[0].keys.conta).toBe("TESTE Ana");
  });

  it("quem saiu da equipa não recebe nada, e a subscrição dele é apagada", async () => {
    st.lido = JSON.stringify([ANA, RUI]);
    const r = await sendPushToAll({ title: "Pedido novo", body: "Maria & Zé · 12 000 €" });
    expect(r.sent).toBe(1);
    expect(Object.keys(st.corpos)).toEqual([ANA.endpoint]);
    // A gravação a seguir ao envio já não tem o Rui.
    expect(st.escrito).not.toContain(RUI.endpoint);
  });

  it("uma subscrição antiga, sem conta, recebe só um aviso sem nomes nem valores", async () => {
    st.lido = JSON.stringify([ANTIGA]);
    await sendPushToAll({ title: "Pedido novo", body: "Maria & Zé · 12 000 €" });
    expect(st.corpos[ANTIGA.endpoint]).toBeDefined();
    expect(st.corpos[ANTIGA.endpoint]).not.toContain("Maria");
    expect(st.corpos[ANTIGA.endpoint]).not.toContain("12 000");
  });

  it("a conta não vai para o serviço de push", async () => {
    st.lido = JSON.stringify([ANA]);
    await sendPushToAll({ title: "Pedido novo", body: "…" });
    expect(st.chavesEnviadas[0]).not.toHaveProperty("conta");
  });
});
