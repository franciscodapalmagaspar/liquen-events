import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * A ENTRADA POR PASSKEY — a rota que abre a porta.
 *
 * A verificação criptográfica é do `@simplewebauthn/server` e está provada do
 * lado dele; mocká-la aqui é de propósito, para que o que fica exercido sejam
 * as barreiras QUE SÃO NOSSAS e que, se caírem, caem em silêncio:
 *
 *   • o domínio guardado com a credencial tem de bater certo com o actual;
 *   • uma conta removida do ADMIN_USERS deixa de poder entrar, mesmo com o
 *     aparelho registado — é a única coisa que faz a saída de alguém valer;
 *   • um contador que não avança é sinal de clone e fecha a porta;
 *   • todas as recusas dizem a MESMA coisa, para não confirmarem que ids existem.
 *
 * E, no fim, o que se ganha quando tudo bate certo: a sessão assinada.
 */

const SEGREDO = "um-segredo-de-testes-com-32-caracteres-ou-mais";
process.env.SESSION_SECRET = SEGREDO;

const wa = vi.hoisted(() => ({
  verificado: true as boolean,
  novoContador: 1 as number,
  atirar: null as unknown,
}));

vi.mock("@simplewebauthn/server", () => ({
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: "x", rpId: "liquen.test" })),
  verifyAuthenticationResponse: vi.fn(async () => {
    if (wa.atirar) throw wa.atirar;
    return {
      verified: wa.verificado,
      authenticationInfo: { newCounter: wa.novoContador },
    };
  }),
}));

const store = vi.hoisted(() => ({
  credencial: null as Record<string, unknown> | null,
  usos: [] as Array<{ id: string; counter: number }>,
}));

vi.mock("@/lib/passkeys-store", async (orig) => ({
  ...(await orig<typeof import("@/lib/passkeys-store")>()),
  getPasskey: vi.fn(async () => store.credencial),
  marcarUso: vi.fn(async (id: string, counter: number) => {
    store.usos.push({ id, counter });
  }),
}));

const contas = vi.hoisted(() => ({
  existe: true,
  perguntados: [] as string[],
  passkeyVale: "vale" as "vale" | "antiga" | "indisponivel",
  passkeyPerguntada: [] as Array<[string, string]>,
}));
vi.mock("@/lib/admin-auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/admin-auth")>()),
  // O NOME passa à frente e fica GUARDADO. Um duplo que o deitasse fora
  // respondia a uma pergunta que ninguém tinha feito: a barreira aqui não é
  // «alguma conta existe», é «existe A CONTA DESTA CREDENCIAL». Sem isto, uma
  // guarda que perguntasse pelo id do aparelho — ou por um nome fixo — passava
  // este teste na mesma, e tirar alguém do ADMIN_USERS deixava de fechar nada.
  contaExiste: (nome: string) => {
    contas.perguntados.push(nome);
    return contas.existe;
  },
  passkeyAindaVale: async (nome: string, criadaEm: string) => {
    contas.passkeyPerguntada.push([nome, criadaEm]);
    return contas.passkeyVale;
  },
}));

const { POST, GET } = await import("./route");
const { ADMIN_COOKIE } = await import("@/lib/admin-auth");
const { CHALLENGE_COOKIE, novoDesafio, selarDesafio } = await import("@/lib/passkey-challenge");

const DOMINIO = "liquen.test";

function credencial(over: Record<string, unknown> = {}) {
  return {
    id: "cred-1",
    userName: "Catarina",
    // Chave falsa: a verificação está mockada, e o que se exercita são as
    // barreiras à volta dela.
    publicKey: Buffer.from("chave").toString("base64url"),
    counter: 0,
    transports: ["internal"],
    rpId: DOMINIO,
    deviceLabel: "iPhone",
    createdAt: "2026-08-01T10:00:00.000Z",
    lastUsedAt: null,
    ...over,
  };
}

/** Pedido com o desafio já selado no cookie — o estado normal do segundo passo. */
function pedido(comDesafio = true, id = "cred-1") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (comDesafio) {
    headers.cookie = `${CHALLENGE_COOKIE}=${selarDesafio("entrada", novoDesafio())}`;
  }
  return new NextRequest(`https://${DOMINIO}/api/admin/passkeys/entrada`, {
    method: "POST",
    headers: { ...headers, host: DOMINIO },
    body: JSON.stringify({ response: { id } }),
  });
}

const RECUSA = "Não foi possível entrar com este dispositivo.";

beforeEach(() => {
  wa.verificado = true;
  wa.novoContador = 1;
  wa.atirar = null;
  store.credencial = credencial();
  store.usos = [];
  contas.existe = true;
  contas.perguntados = [];
  contas.passkeyVale = "vale";
  contas.passkeyPerguntada = [];
});

describe("GET — o desafio", () => {
  it("responde sem sessão nenhuma e sela o desafio num cookie", async () => {
    const res = await GET(
      new NextRequest(`https://${DOMINIO}/api/admin/passkeys/entrada`, {
        headers: { host: DOMINIO },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.cookies.get(CHALLENGE_COOKIE)?.value).toBeTruthy();
  });
});

describe("POST — as barreiras", () => {
  it("sem desafio selado não se vai a lado nenhum", async () => {
    const res = await POST(pedido(false));
    expect(res.status).toBe(400);
  });

  it("credencial desconhecida é recusada", async () => {
    store.credencial = null;
    const res = await POST(pedido());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe(RECUSA);
  });

  it("credencial registada NOUTRO domínio é recusada", async () => {
    // É isto que torna seguro derivar o domínio do cabeçalho `Host`: um host
    // forjado produz um domínio para o qual a credencial não bate certo.
    store.credencial = credencial({ rpId: "outro-sitio.com" });
    const res = await POST(pedido());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe(RECUSA);
  });

  it("conta removida do ADMIN_USERS deixa de entrar, mesmo com o aparelho registado", async () => {
    contas.existe = false;
    const res = await POST(pedido());
    expect(res.status).toBe(401);
    expect(res.cookies.get(ADMIN_COOKIE)?.value).toBeFalsy();
    // E perguntou pela conta CERTA: a que está presa à credencial guardada, e
    // não ao id do aparelho que veio no pedido (que quem bate à porta escolhe).
    expect(
      contas.perguntados,
      "a barreira tem de perguntar pelo `userName` da credencial guardada",
    ).toEqual(["Catarina"]);
  });

  it("uma passkey registada antes de uma recuperação de palavra-passe já não entra", async () => {
    contas.passkeyVale = "antiga";
    const res = await POST(pedido());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe(RECUSA);
    expect(res.cookies.get(ADMIN_COOKIE)?.value).toBeFalsy();
    // Perguntou pela conta e pela data DA CREDENCIAL GUARDADA.
    expect(contas.passkeyPerguntada).toEqual([["Catarina", "2026-08-01T10:00:00.000Z"]]);
  });

  it("sem conseguir confirmar a tempo, não entra — mas diz que é isso, e não credenciais erradas", async () => {
    contas.passkeyVale = "indisponivel";
    const res = await POST(pedido());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(
      "Não foi possível confirmar agora. Tenta outra vez ou entra com a palavra-passe.",
    );
    expect(res.cookies.get(ADMIN_COOKIE)?.value).toBeFalsy();
  });

  it("assinatura inválida é recusada", async () => {
    wa.verificado = false;
    const res = await POST(pedido());
    expect(res.status).toBe(401);
  });

  it("uma excepção da verificação não passa a 500 — fecha fechado", async () => {
    wa.atirar = new Error("origem errada");
    const res = await POST(pedido());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe(RECUSA);
  });

  it("contador que não avança (possível clone) fecha a porta", async () => {
    store.credencial = credencial({ counter: 5 });
    wa.novoContador = 5;
    const res = await POST(pedido());
    expect(res.status).toBe(401);
    expect(res.cookies.get(ADMIN_COOKIE)?.value).toBeFalsy();
    expect(store.usos, "gravou uma utilização de uma entrada recusada").toEqual([]);
  });

  it("um autenticador que nunca conta (0 → 0) entra à mesma", async () => {
    store.credencial = credencial({ counter: 0 });
    wa.novoContador = 0;
    const res = await POST(pedido());
    expect(res.status).toBe(200);
  });

  it("todas as recusas dizem exactamente o mesmo", async () => {
    const mensagens: string[] = [];

    store.credencial = null;
    mensagens.push((await (await POST(pedido())).json()).error);

    store.credencial = credencial({ rpId: "outro.com" });
    mensagens.push((await (await POST(pedido())).json()).error);

    store.credencial = credencial();
    contas.existe = false;
    mensagens.push((await (await POST(pedido())).json()).error);

    expect(new Set(mensagens).size, `mensagens diferentes: ${mensagens.join(" | ")}`).toBe(1);
  });
});

describe("POST — quando tudo bate certo", () => {
  it("abre a sessão, grava o contador e limpa o desafio", async () => {
    store.credencial = credencial({ counter: 3 });
    wa.novoContador = 4;

    const res = await POST(pedido());
    expect(res.status).toBe(200);

    // A sessão vai assinada e é lida pelo mesmo módulo que a emitiu.
    const cookie = res.cookies.get(ADMIN_COOKIE);
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);
    const { readSession } = await import("@/lib/admin-auth");
    expect(readSession(cookie!.value)?.name).toBe("Catarina");

    expect(store.usos).toEqual([{ id: "cred-1", counter: 4 }]);

    // O desafio cumpriu o que tinha a fazer; não fica no browser.
    expect(res.cookies.get(CHALLENGE_COOKIE)?.value).toBeFalsy();
  });

  it("a sessão vem com o nome da CREDENCIAL, não com nada vindo do cliente", async () => {
    // O corpo do pedido só traz o id. Se algum dia alguém acrescentar um campo
    // de nome e o passar à sessão, este teste cai.
    store.credencial = credencial({ userName: "Rui" });
    const res = await POST(pedido());
    const { readSession } = await import("@/lib/admin-auth");
    expect(readSession(res.cookies.get(ADMIN_COOKIE)!.value)?.name).toBe("Rui");
  });
});
