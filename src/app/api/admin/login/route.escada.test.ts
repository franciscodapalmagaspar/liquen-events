import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A ESCADA DO BLOQUEIO, E A FRASE QUE NÃO DISTINGUE NADA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Duas coisas, e as duas se falharem não dão erro nenhum — passam a dar
 * informação a quem tenta entrar:
 *
 *  1. «esta conta não existe» e «a palavra-passe está errada» têm de sair
 *     iguais: mesma frase, mesmo código de estado. Saber que o endereço é bom
 *     vale mais a quem tenta do que uma tentativa;
 *  2. o bloqueio por conta tem de SUBIR com a insistência (5 → 30 → 60
 *     minutos) e nunca fechar a porta a quem sabe a palavra-passe.
 *
 * O limitador é substituído por um que conta a sério, com o tecto e a janela
 * que a rota lhe passar — assim o que se mede é a POLÍTICA da rota e não o
 * módulo do limitador (que tem os seus próprios testes).
 *
 * O endereço de origem muda a cada pedido de propósito: é o que um ataque a
 * sério faz (endereços são baratos), e é exactamente por isso que o contador
 * por conta existe. Com um endereço fixo, o tecto de 8/minuto disparava
 * primeiro e escondia a escada.
 */
const rl = vi.hoisted(() => ({ contagens: new Map<string, number>(), ip: 0 }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async (key: string, limit: number, windowMs: number) => {
    const n = (rl.contagens.get(key) ?? 0) + 1;
    rl.contagens.set(key, n);
    return n > limit ? { ok: false, retryAfter: Math.ceil(windowMs / 1000) } : { ok: true };
  }),
  // Só pergunta, sem contar.
  limiteEsgotado: vi.fn(async (key: string, limit: number) =>
    (rl.contagens.get(key) ?? 0) >= limit ? { ok: false, retryAfter: 3600 } : { ok: true },
  ),
  clientIp: () => `ip-${rl.ip++}`,
  sweep: () => {},
}));

// Sem ida ao armazenamento: a entrada lê as palavras-passe redefinidas, e aqui
// não há nenhuma.
vi.mock("@/lib/app-state", () => ({
  getState: vi.fn(async () => null),
  setState: vi.fn(async () => ({ gravado: true, duradouro: true, onde: "servidor" })),
}));

import { POST } from "./route";
import { ADMIN_COOKIE } from "@/lib/admin-auth";

function entrar(body: unknown): NextRequest {
  return new Request("https://liquen-events.com/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const KEYS = ["ADMIN_USERS", "ADMIN_PASSWORD_HASH", "ADMIN_TOTP_SECRET", "SESSION_SECRET"];
const guardado: Record<string, string | undefined> = {};

beforeEach(() => {
  rl.contagens.clear();
  rl.ip = 0;
  for (const k of KEYS) guardado[k] = process.env[k];
  delete process.env.ADMIN_PASSWORD_HASH;
  delete process.env.ADMIN_TOTP_SECRET;
  process.env.SESSION_SECRET = "escada-test-secret-1234567890"; // gitleaks:allow — segredo de teste, gerado aqui e sem valor fora daqui
  process.env.ADMIN_USERS = JSON.stringify([
    {
      name: "Catarina",
      email: "catarina@liquen-events.com",
      passwordHash: bcrypt.hashSync("cat-pass", 10),
    },
  ]);
});
afterEach(() => {
  for (const k of KEYS) {
    if (guardado[k] === undefined) delete process.env[k];
    else process.env[k] = guardado[k];
  }
});

describe("a recusa não distingue «não existe» de «palavra-passe errada»", () => {
  it("mesma frase e mesmo código de estado nos dois casos", async () => {
    const errada = await POST(
      entrar({ email: "catarina@liquen-events.com", password: "nao-e-esta" }),
    );
    const inexistente = await POST(entrar({ email: "ninguem@exemplo.pt", password: "nao-e-esta" }));

    expect(errada.status).toBe(401);
    expect(inexistente.status).toBe(401);
    expect(await errada.json()).toEqual(await inexistente.json());
    expect(errada.cookies.get(ADMIN_COOKIE)).toBeUndefined();
    expect(inexistente.cookies.get(ADMIN_COOKIE)).toBeUndefined();
  });

  it("a frase do 429 também é a mesma nos três degraus", async () => {
    // O que muda entre degraus é o Retry-After, que é informação de serviço.
    // A FRASE não pode mudar: dizer «estás no terceiro degrau» é dizer quantas
    // tentativas já foram feitas nesta conta, que não é assunto de quem pergunta.
    const frases = new Set<string>();
    for (let i = 0; i < 21; i++) {
      const res = await POST(entrar({ email: "alvo@exemplo.pt", password: `tentativa-${i}` }));
      if (res.status === 429) frases.add((await res.json()).error);
    }
    expect(frases.size).toBe(1);
  }, 60_000);
});

describe("o bloqueio por conta SOBE com a insistência", () => {
  it("5 falhas → 5 minutos, 10 → 30 minutos, 20 → 1 hora", async () => {
    const conta = "alvo@exemplo.pt";
    const esperas: (string | null)[] = [];
    for (let i = 1; i <= 21; i++) {
      const res = await POST(entrar({ email: conta, password: `tentativa-${i}` }));
      esperas.push(res.status === 429 ? res.headers.get("Retry-After") : null);
    }

    // As cinco primeiras passam como recusa normal — quem se engana a escrever
    // não pode levar com uma parede à segunda tentativa.
    expect(esperas.slice(0, 5)).toEqual([null, null, null, null, null]);
    // A 6.ª bate no primeiro degrau.
    expect(esperas[5]).toBe("300");
    // Insistir empurra para o segundo (a 11.ª) e para o terceiro (a 21.ª).
    expect(esperas[10]).toBe("1800");
    expect(esperas[20]).toBe("3600");
  }, 60_000);

  it("os dois primeiros degraus não fecham a porta a quem sabe a palavra-passe", async () => {
    // 10 falhas (dois degraus): um estranho a gastar o contador não deixa a
    // Catarina de fora numa manhã de montagem.
    for (let i = 0; i < 10; i++) {
      await POST(entrar({ email: "catarina@liquen-events.com", password: `errada-${i}` }));
    }
    const res = await POST(entrar({ email: "catarina@liquen-events.com", password: "cat-pass" }));
    expect(res.status).toBe(200);
    expect(res.cookies.get(ADMIN_COOKIE)?.value).toBeTruthy();
  }, 60_000);

  it("o terceiro (20 falhas numa hora) fecha mesmo — decisão dela, 10/11", async () => {
    // Quem tenta palpites de muitos endereços era parado nos errados mas
    // entrava com o certo. Agora, nessa hora, nem o certo: ela entra pela
    // chave de acesso ou pela recuperação, que não passam por aqui.
    for (let i = 0; i < 20; i++) {
      await POST(entrar({ email: "catarina@liquen-events.com", password: `errada-${i}` }));
    }
    const res = await POST(entrar({ email: "catarina@liquen-events.com", password: "cat-pass" }));
    expect(res.status).toBe(429);
    expect(res.cookies.get(ADMIN_COOKIE)?.value).toBeFalsy();
  }, 60_000);

  it("os degraus são POR CONTA: uma conta bloqueada não bloqueia a do lado", async () => {
    for (let i = 0; i < 10; i++) {
      await POST(entrar({ email: "alvo@exemplo.pt", password: `errada-${i}` }));
    }
    const outra = await POST(entrar({ email: "catarina@liquen-events.com", password: "cat-pass" }));
    expect(outra.status).toBe(200);
  }, 60_000);

  it("as maiúsculas do endereço não compram uma escada nova", async () => {
    for (let i = 0; i < 6; i++) {
      await POST(entrar({ email: "ALVO@Exemplo.pt", password: `errada-${i}` }));
    }
    const res = await POST(entrar({ email: "alvo@exemplo.pt", password: "outra" }));
    expect(res.status).toBe(429);
  }, 60_000);
});

describe("o corpo antigo (`name`) continua a ser aceite", () => {
  it("um separador aberto antes do deploy não passa a receber «credenciais incorretas»", async () => {
    const res = await POST(entrar({ name: "Catarina", password: "cat-pass" }));
    expect(res.status).toBe(200);
  });
});
