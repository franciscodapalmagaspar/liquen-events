import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM DESAFIO, UMA TENTATIVA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O desafio do WebAuthn é um número que só pode servir UMA vez — é isso que o
 * torna um desafio e não uma palavra-passe. Aqui ele vive num cookie assinado
 * com prazo de dois minutos, e as duas rotas apagavam-no só no desfecho FELIZ.
 * A qualquer recusa — assinatura que não bate, credencial desconhecida,
 * aparelho que o servidor não confirma — o cookie ficava no browser, ainda
 * dentro do prazo e ainda aceite: o mesmo número passava a valer para todas as
 * tentativas que coubessem nos dois minutos seguintes. Quem apanhasse uma
 * resposta assinada (um proxy que registe corpos de pedidos, um relatório de
 * erro que leve o `fetch` consigo, o painel do browser de uma máquina
 * partilhada) podia voltar a apresentá-la nessa janela.
 *
 * Gastá-lo em qualquer desfecho não custa nada a quem entra: o cliente pede
 * SEMPRE um desafio novo antes de cada envio (ver `passkeys-cliente.ts`), tanto
 * na entrada como no registo. Uma segunda tentativa é uma cerimónia nova.
 *
 * O que se mede é o `Set-Cookie` que sai, e não o valor lido pela API do Next:
 * um cookie morre pelos ATRIBUTOS da linha (o `Path` com que foi posto, e um
 * prazo já passado), e o valor sozinho não diz se algum deles lá está.
 *
 * A verificação criptográfica está simulada, como nos outros testes destas
 * rotas.
 */

const SEGREDO = "um-segredo-de-testes-com-32-caracteres-ou-mais"; // gitleaks:allow — segredo de teste, sem valor fora daqui
process.env.SESSION_SECRET = SEGREDO;

const wa = vi.hoisted(() => ({ verificado: true as boolean }));

vi.mock("@simplewebauthn/server", () => ({
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: "x" })),
  generateRegistrationOptions: vi.fn(async () => ({ challenge: "x" })),
  verifyAuthenticationResponse: vi.fn(async () => ({
    verified: wa.verificado,
    authenticationInfo: { newCounter: 1 },
  })),
  verifyRegistrationResponse: vi.fn(async () => ({
    verified: wa.verificado,
    registrationInfo: wa.verificado
      ? {
          credential: {
            id: "cred-1",
            publicKey: new Uint8Array([1, 2, 3]),
            counter: 1,
            transports: ["internal"],
          },
        }
      : undefined,
  })),
}));

const store = vi.hoisted(() => ({ credencial: null as Record<string, unknown> | null }));

vi.mock("@/lib/passkeys-store", async (orig) => ({
  ...(await orig<typeof import("@/lib/passkeys-store")>()),
  getPasskey: vi.fn(async () => store.credencial),
  marcarUso: vi.fn(async () => {}),
  listPasskeysFor: vi.fn(async () => []),
  createPasskey: vi.fn(async () => {}),
}));

const { POST: entrarPOST } = await import("./entrada/route");
const { POST: registarPOST } = await import("./registo/route");
const { CHALLENGE_COOKIE, novoDesafio, selarDesafio } = await import("@/lib/passkey-challenge");
const { ADMIN_COOKIE, ADMIN_REAUTH_COOKIE, createSession, criarConfirmacao } =
  await import("@/lib/admin-auth");

const DOMINIO = "liquen.test";
const CONTA = "Catarina";

/**
 * O `Set-Cookie` do desafio, tal como sai para o browser. É a única leitura que
 * serve: o que decide se um cookie morre são os ATRIBUTOS da linha, e a API de
 * cookies do Next mostra o valor sem mostrar o que falta ao lado dele.
 */
function linhaDoDesafio(res: Response): string | undefined {
  return res.headers.getSetCookie().find((l) => l.startsWith(`${CHALLENGE_COOKIE}=`));
}

function apagaMesmo(linha: string | undefined): boolean {
  if (!linha) return false;
  const temCaminho = /;\s*Path=\/(;|$)/i.test(linha);
  const morre = /;\s*Max-Age=0(;|$)/i.test(linha) || /;\s*Expires=Thu, 01 Jan 1970/i.test(linha);
  return temCaminho && morre;
}

function credencial() {
  return {
    id: "cred-1",
    userName: CONTA,
    publicKey: Buffer.from("chave").toString("base64url"),
    counter: 0,
    transports: ["internal"],
    rpId: DOMINIO,
    deviceLabel: "iPhone",
    createdAt: "2026-08-01T10:00:00.000Z",
    lastUsedAt: null,
  };
}

function pedidoDeEntrada(): NextRequest {
  return new NextRequest(`https://${DOMINIO}/api/admin/passkeys/entrada`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: DOMINIO,
      cookie: `${CHALLENGE_COOKIE}=${selarDesafio("entrada", novoDesafio())}`,
    },
    body: JSON.stringify({ response: { id: "cred-1" } }),
  });
}

function pedidoDeRegisto(): NextRequest {
  const desafio = selarDesafio("registo", novoDesafio(), CONTA);
  return new NextRequest(`https://${DOMINIO}/api/admin/passkeys/registo`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: DOMINIO,
      // Com a palavra-passe confirmada há pouco (n.º 5), como no ecrã.
      cookie: `${CHALLENGE_COOKIE}=${desafio}; ${ADMIN_COOKIE}=${createSession(CONTA)}; ${ADMIN_REAUTH_COOKIE}=${criarConfirmacao(CONTA)}`,
    },
    body: JSON.stringify({ response: { id: "cred-1" }, deviceLabel: "iPhone" }),
  });
}

beforeEach(() => {
  wa.verificado = true;
  store.credencial = credencial();
});

describe("entrada — o desafio sai do browser em qualquer desfecho", () => {
  it("depois de entrar, o cookie é MESMO apagado (com Path=/)", async () => {
    const res = await entrarPOST(pedidoDeEntrada());
    expect(res.status).toBe(200);
    const linha = linhaDoDesafio(res);
    expect(apagaMesmo(linha), `Set-Cookie que não apaga nada: ${linha}`).toBe(true);
  });

  it("depois de uma assinatura recusada, o desafio também é gasto", async () => {
    wa.verificado = false;
    const res = await entrarPOST(pedidoDeEntrada());
    expect(res.status).toBe(401);
    const linha = linhaDoDesafio(res);
    expect(apagaMesmo(linha), `desafio ficou vivo para nova tentativa: ${linha}`).toBe(true);
  });

  it("uma credencial desconhecida não deixa o desafio por lá", async () => {
    store.credencial = null;
    const res = await entrarPOST(pedidoDeEntrada());
    expect(res.status).toBe(401);
    expect(apagaMesmo(linhaDoDesafio(res))).toBe(true);
  });
});

describe("registo — o desafio sai do browser em qualquer desfecho", () => {
  it("depois de registar, o cookie é MESMO apagado (com Path=/)", async () => {
    const res = await registarPOST(pedidoDeRegisto());
    expect(res.status).toBe(200);
    const linha = linhaDoDesafio(res);
    expect(apagaMesmo(linha), `Set-Cookie que não apaga nada: ${linha}`).toBe(true);
  });

  it("depois de um aparelho recusado, o desafio também é gasto", async () => {
    wa.verificado = false;
    const res = await registarPOST(pedidoDeRegisto());
    expect(res.status).toBe(400);
    const linha = linhaDoDesafio(res);
    expect(apagaMesmo(linha), `desafio ficou vivo para nova tentativa: ${linha}`).toBe(true);
  });
});
