import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O EMAIL COMO IDENTIFICADOR, E A RECUPERAÇÃO DE PALAVRA-PASSE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O que estes testes prendem, por ordem de gravidade se falhar:
 *
 *  1. UMA SESSÃO ABERTA CONTINUA ABERTA. A mudança de identificador não pode
 *     pôr fora quem está a meio de uma proposta — o cookie que ela tem no
 *     browser foi emitido pelo código ANTIGO e tem de continuar a ser aceite.
 *  2. A ligação de recuperação serve UMA vez e morre; expira; e pedir outra
 *     mata a anterior.
 *  3. Uma gravação que não acontece NÃO pode sair daqui como sucesso — nem no
 *     pedido, nem na definição da palavra-passe.
 *  4. O `ADMIN_USERS` MANDA: rodar um hash no ambiente desliga a palavra-passe
 *     que tenha sido definida por aqui. Sem isto, a recuperação era uma porta
 *     das traseiras que sobrevivia a todas as rotações.
 */

// O `app_state` em memória. Mocado (e não o ficheiro verdadeiro) para os testes
// não escreverem no `data/` do projecto e para se poder simular a instalação
// que NÃO consegue gravar.
const estado = vi.hoisted(() => ({
  mapa: new Map<string, unknown>(),
  escritas: 0,
  recusaEscrita: false,
  duradouro: true,
}));

vi.mock("./app-state", () => ({
  // Devolve sempre uma CÓPIA, como o verdadeiro: tanto o Supabase como o
  // ficheiro entregam JSON acabado de desserializar. Um duplo que devolvesse a
  // referência guardada fazia uma escrita RECUSADA parecer aplicada — o
  // contrário exacto do que estes testes existem para provar.
  getState: vi.fn(async (k: string) => {
    const v = estado.mapa.get(k);
    return v === undefined ? null : JSON.parse(JSON.stringify(v));
  }),
  setState: vi.fn(async (k: string, v: unknown) => {
    estado.escritas++;
    if (estado.recusaEscrita) {
      return { gravado: false, duradouro: false, onde: "nenhures", motivo: "escrita-recusada" };
    }
    estado.mapa.set(k, JSON.parse(JSON.stringify(v)));
    return estado.duradouro
      ? { gravado: true, duradouro: true, onde: "servidor" }
      : { gravado: true, duradouro: false, onde: "ficheiro-efemero" };
  }),
  // A leitura com versão e a escrita condicional (o registo das sessões
  // revogadas). A versão é o valor em JSON, como no ficheiro.
  lerEstadoComVersao: vi.fn(async (k: string) => {
    const v = estado.mapa.get(k);
    return v === undefined
      ? { valor: null, versao: null }
      : { valor: JSON.parse(JSON.stringify(v)), versao: JSON.stringify(v) };
  }),
  gravarEstadoSeNaoMudou: vi.fn(async (k: string, v: unknown, versao: string | null) => {
    const atual = estado.mapa.get(k);
    if ((atual === undefined ? null : JSON.stringify(atual)) !== versao) return "conflito";
    if (estado.recusaEscrita) return "falhou";
    estado.mapa.set(k, JSON.parse(JSON.stringify(v)));
    return "gravado";
  }),
}));

import {
  verifyCredentials,
  createSession,
  readSession,
  contaExiste,
  nomeVisivel,
  pedirRecuperacao,
  definirPalavraPasseComToken,
  subKey,
} from "./admin-auth";

const HASH_CATARINA = bcrypt.hashSync("cat-pass-original", 10);
const HASH_RUI = bcrypt.hashSync("rui-pass-original", 10);

const ENV_KEYS = ["ADMIN_USERS", "ADMIN_PASSWORD_HASH", "SESSION_SECRET", "SESSION_VERSION"];
let guardado: Record<string, string | undefined>;

function comContas(users: unknown[]) {
  process.env.ADMIN_USERS = JSON.stringify(users);
}

const CONTAS = [
  { name: "Catarina", email: "catarina@liquen-events.com", passwordHash: HASH_CATARINA },
  { name: "Rui", email: "rui@liquen-events.com", passwordHash: HASH_RUI },
];

beforeEach(() => {
  guardado = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.SESSION_SECRET = "recuperacao-test-secret-1234567890"; // gitleaks:allow — segredo de teste, gerado aqui e sem valor fora daqui
  estado.mapa.clear();
  estado.escritas = 0;
  estado.recusaEscrita = false;
  estado.duradouro = true;
  comContas(CONTAS);
});

afterEach(() => {
  vi.useRealTimers();
  for (const k of ENV_KEYS) {
    if (guardado[k] === undefined) delete process.env[k];
    else process.env[k] = guardado[k];
  }
});

// ───────────────────────────────────────────────────────────────────────────
describe("o email é o identificador de entrada", () => {
  it("entra pelo email e devolve o nome visível para a saudação", async () => {
    expect(await verifyCredentials("catarina@liquen-events.com", "cat-pass-original")).toEqual({
      name: "Catarina",
      email: "catarina@liquen-events.com",
    });
  });

  it("ignora maiúsculas e espaços à volta do endereço", async () => {
    expect(
      await verifyCredentials("  CATARINA@Liquen-Events.com  ", "cat-pass-original"),
    ).toMatchObject({ name: "Catarina" });
  });

  it("não aceita a palavra-passe de outra conta", async () => {
    expect(await verifyCredentials("catarina@liquen-events.com", "rui-pass-original")).toBeNull();
  });

  it("CAMINHO ANTIGO: o nome próprio ainda entra, para ninguém ficar de fora no deploy", async () => {
    // Enquanto o ADMIN_USERS de produção não tiver email em todas as contas,
    // recusar o nome fechava a porta a toda a gente de uma só vez.
    expect(await verifyCredentials("Catarina", "cat-pass-original")).toMatchObject({
      name: "Catarina",
    });
  });

  it("a passkey de uma conta continua a ser reconhecida pelo NOME guardado", async () => {
    // As credenciais dos aparelhos guardam o nome da conta. Se `contaExiste`
    // passasse a exigir o email, todos os aparelhos já registados deixavam de
    // abrir a porta no primeiro deploy.
    expect(contaExiste("Catarina")).toBe(true);
    expect(contaExiste("catarina@liquen-events.com")).toBe(true);
    expect(contaExiste("Intrusa")).toBe(false);
  });

  it("no modo de palavra-passe partilhada, o email vira um nome apresentável", () => {
    expect(nomeVisivel("catarina.martins@liquen-events.com")).toBe("Catarina Martins");
    expect(nomeVisivel("Catarina")).toBe("Catarina");
    expect(nomeVisivel("")).toBe("Equipa");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("uma sessão emitida ANTES desta mudança continua válida", () => {
  it("aceita um cookie assinado com o formato antigo, sem obrigar a entrar de novo", () => {
    // Reconstrói à mão exactamente o que o código anterior punha no cookie:
    // { typ, sub: NOME, exp, v }, assinado com a mesma sub-chave. Se algum dia
    // alguém mexer no corpo assinado ou na chave, é aqui que se descobre —
    // antes de a equipa ser posta fora a meio de uma proposta.
    const payload = {
      typ: "session",
      sub: "Catarina",
      exp: Date.now() + 60_000,
      v: "1",
    };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", subKey("liquen.admin-session.v1"))
      .update(body)
      .digest("base64url");

    expect(readSession(`${body}.${sig}`)).toEqual({ name: "Catarina" });
  });

  it("a sessão continua a guardar o NOME, não o email (saudação e dono das tarefas)", () => {
    expect(readSession(createSession("Catarina"))).toEqual({ name: "Catarina" });
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("recuperação — a ligação", () => {
  it("emite um token para uma conta que existe", async () => {
    const r = await pedirRecuperacao("catarina@liquen-events.com");
    expect(r.estado).toBe("emitido");
  });

  it("um endereço desconhecido não emite nada — MAS grava na mesma", async () => {
    // A escrita simétrica é o que faz a instalação sem gravação responder o
    // mesmo aos dois casos. Se só se gravasse para contas reais, o 503 de
    // «não consegui gravar» aparecia só nos endereços verdadeiros e passava a
    // ser, ele próprio, a lista de quem existe.
    estado.escritas = 0;
    const desconhecida = await pedirRecuperacao("ninguem@exemplo.pt");
    expect(desconhecida.estado).toBe("sem-conta");
    expect(estado.escritas).toBe(1);

    estado.escritas = 0;
    await pedirRecuperacao("catarina@liquen-events.com");
    expect(estado.escritas).toBe(1);
  });

  it("guarda o RESUMO do token e nunca o token", async () => {
    const r = await pedirRecuperacao("catarina@liquen-events.com");
    const guardadoJson = JSON.stringify(estado.mapa.get("admin-recuperacao"));
    expect(r.estado).toBe("emitido");
    if (r.estado !== "emitido") return;
    expect(guardadoJson).not.toContain(r.token);
  });

  it("a ligação serve UMA vez", async () => {
    const r = await pedirRecuperacao("catarina@liquen-events.com");
    if (r.estado !== "emitido") throw new Error("esperava um token");

    expect((await definirPalavraPasseComToken(r.token, "palavra-passe-nova-1")).estado).toBe(
      "definida",
    );
    // A segunda vez já não encontra nada: o pedido foi apagado no mesmo
    // movimento em que a palavra-passe foi escrita.
    expect((await definirPalavraPasseComToken(r.token, "outra-coisa-qualquer")).estado).toBe(
      "ligacao-invalida",
    );
  });

  it("a ligação expira ao fim de 30 minutos", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T09:00:00Z"));
    const r = await pedirRecuperacao("catarina@liquen-events.com");
    if (r.estado !== "emitido") throw new Error("esperava um token");

    vi.setSystemTime(new Date("2026-08-12T09:29:00Z"));
    // Ainda dentro da janela: se falhar aqui, a validade encurtou sem ninguém
    // dizer nada e quem está em campo perde a janela.
    const registoAntes = JSON.parse(JSON.stringify(estado.mapa.get("admin-recuperacao")));
    expect(Object.keys(registoAntes.pedidos)).toHaveLength(1);

    vi.setSystemTime(new Date("2026-08-12T09:31:00Z"));
    expect((await definirPalavraPasseComToken(r.token, "palavra-passe-nova-1")).estado).toBe(
      "ligacao-invalida",
    );
  });

  it("pedir outra ligação invalida a anterior", async () => {
    const primeira = await pedirRecuperacao("catarina@liquen-events.com");
    const segunda = await pedirRecuperacao("catarina@liquen-events.com");
    if (primeira.estado !== "emitido" || segunda.estado !== "emitido") {
      throw new Error("esperava dois tokens");
    }
    expect((await definirPalavraPasseComToken(primeira.token, "palavra-passe-nova-1")).estado).toBe(
      "ligacao-invalida",
    );
    expect((await definirPalavraPasseComToken(segunda.token, "palavra-passe-nova-1")).estado).toBe(
      "definida",
    );
  });

  it("recusa uma palavra-passe curta antes de gravar seja o que for", async () => {
    const r = await pedirRecuperacao("catarina@liquen-events.com");
    if (r.estado !== "emitido") throw new Error("esperava um token");
    expect((await definirPalavraPasseComToken(r.token, "curta")).estado).toBe("fraca");
    // E a ligação NÃO foi gasta: a pessoa corrige e continua.
    expect((await definirPalavraPasseComToken(r.token, "palavra-passe-nova-1")).estado).toBe(
      "definida",
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("recuperação — a palavra-passe nova", () => {
  async function redefinir(nova: string) {
    const r = await pedirRecuperacao("catarina@liquen-events.com");
    if (r.estado !== "emitido") throw new Error("esperava um token");
    return definirPalavraPasseComToken(r.token, nova);
  }

  it("passa a valer, e a anterior deixa de valer", async () => {
    expect((await redefinir("a-minha-frase-nova")).estado).toBe("definida");
    expect(
      await verifyCredentials("catarina@liquen-events.com", "a-minha-frase-nova"),
    ).toMatchObject({ name: "Catarina" });
    expect(await verifyCredentials("catarina@liquen-events.com", "cat-pass-original")).toBeNull();
  });

  it("fecha as sessões que já estavam abertas nessa conta (n.º 6)", async () => {
    const { sessaoValida, esquecerRevogacoesEmMemoria } = await import("./sessoes-revogadas");
    esquecerRevogacoesEmMemoria();
    const antiga = createSession("Catarina");
    const doRui = createSession("Rui");
    expect(await sessaoValida(antiga)).toEqual({ name: "Catarina" });
    await new Promise((r) => setTimeout(r, 2));
    expect((await redefinir("a-minha-frase-nova")).estado).toBe("definida");
    expect(await sessaoValida(antiga)).toBeNull();
    expect(await sessaoValida(doRui)).toEqual({ name: "Rui" });
  });

  it("não toca nas outras contas", async () => {
    await redefinir("a-minha-frase-nova");
    expect(await verifyCredentials("rui@liquen-events.com", "rui-pass-original")).toMatchObject({
      name: "Rui",
    });
    expect(await verifyCredentials("rui@liquen-events.com", "a-minha-frase-nova")).toBeNull();
  });

  it("O AMBIENTE MANDA: rodar o hash no ADMIN_USERS desliga a palavra-passe definida aqui", async () => {
    await redefinir("a-minha-frase-nova");
    // A dona roda a palavra-passe da Catarina no painel da Vercel (por exemplo
    // depois de uma fuga). A definida pela recuperação TEM de morrer com isso —
    // senão sobrevivia a todas as rotações futuras, calada.
    comContas([
      {
        name: "Catarina",
        email: "catarina@liquen-events.com",
        passwordHash: bcrypt.hashSync("rodada-pela-dona", 10),
      },
      CONTAS[1],
    ]);
    expect(await verifyCredentials("catarina@liquen-events.com", "a-minha-frase-nova")).toBeNull();
    expect(await verifyCredentials("catarina@liquen-events.com", "rodada-pela-dona")).toMatchObject(
      { name: "Catarina" },
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("sem sítio onde gravar, ninguém promete nada", () => {
  it("o pedido diz que não conseguiu, em vez de mandar um email que não abre nada", async () => {
    estado.recusaEscrita = true;
    expect((await pedirRecuperacao("catarina@liquen-events.com")).estado).toBe("sem-persistencia");
    // E responde o MESMO a um endereço que não existe: a recusa não pode ser o
    // sinal que distingue os dois casos.
    expect((await pedirRecuperacao("ninguem@exemplo.pt")).estado).toBe("sem-persistencia");
  });

  it("uma escrita que não DURA conta como não gravada (disco efémero da função)", async () => {
    estado.duradouro = false;
    expect((await pedirRecuperacao("catarina@liquen-events.com")).estado).toBe("sem-persistencia");
  });

  it("a definição falhada não diz «pronto» — e a palavra-passe anterior continua a valer", async () => {
    const r = await pedirRecuperacao("catarina@liquen-events.com");
    if (r.estado !== "emitido") throw new Error("esperava um token");
    estado.recusaEscrita = true;
    expect((await definirPalavraPasseComToken(r.token, "a-minha-frase-nova")).estado).toBe(
      "sem-persistencia",
    );
    estado.recusaEscrita = false;
    expect(
      await verifyCredentials("catarina@liquen-events.com", "cat-pass-original"),
    ).toMatchObject({ name: "Catarina" });
  });

  it("sem contas com email, a recuperação diz que não está montada em vez de fingir", async () => {
    comContas([{ name: "Catarina", passwordHash: HASH_CATARINA }]);
    expect((await pedirRecuperacao("catarina@liquen-events.com")).estado).toBe("sem-recuperacao");
  });
});
