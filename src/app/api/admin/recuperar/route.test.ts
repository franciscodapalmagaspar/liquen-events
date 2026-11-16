import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A RESPOSTA DO PEDIDO DE RECUPERAÇÃO NÃO PODE DIZER QUEM EXISTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Um formulário que responde «não temos esse email» é um verificador de
 * endereços grátis para quem esteja a montar uma campanha de phishing contra a
 * equipa — e o primeiro passo de quem quer entrar é sempre saber que
 * identificadores são válidos.
 *
 * O que se prende aqui: mesmo código de estado, mesmo corpo, e o email a sair
 * SÓ no caso verdadeiro. Mais o caso que o enunciado exige em separado: sem
 * sítio onde gravar, a rota DIZ que não conseguiu em vez de fingir que enviou.
 */

const rl = vi.hoisted(() => ({
  porChave: new Map<string, { ok: boolean; retryAfter?: number }>(),
  chamadas: [] as string[],
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async (key: string) => {
    rl.chamadas.push(key);
    return rl.porChave.get(key) ?? { ok: true };
  }),
  clientIp: () => "test-ip",
  sweep: () => {},
}));

const correio = vi.hoisted(() => ({
  enviados: [] as { to?: string; subject: string; text?: string }[],
  resultado: { sent: true },
  rebenta: false,
}));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async (args: { to?: string; subject: string; text?: string }) => {
    if (correio.rebenta) throw new Error("SMTP em baixo");
    correio.enviados.push(args);
    return correio.resultado;
  }),
  esc: (v: unknown) => String(v ?? ""),
}));

/**
 * O `after` do Next atira fora de um contexto de pedido, por isso é substituído
 * por um que GUARDA as tarefas em vez de as correr. Não é conveniência: é o que
 * permite provar que o envio do email ficou mesmo DE FORA da resposta — antes
 * de `correrDepois()` nada foi enviado, e é essa a propriedade que fecha o
 * oráculo de tempo. O resto do `next/server` (NextResponse) fica o verdadeiro.
 */
const depois = vi.hoisted(() => ({ tarefas: [] as (() => unknown)[] }));
vi.mock("next/server", async (original) => {
  const real = await original<typeof import("next/server")>();
  return { ...real, after: (fn: () => unknown) => depois.tarefas.push(fn) };
});
async function correrDepois() {
  const pendentes = depois.tarefas.splice(0);
  for (const t of pendentes) await t();
}

const estado = vi.hoisted(() => ({
  mapa: new Map<string, unknown>(),
  recusaEscrita: false,
}));
vi.mock("@/lib/app-state", () => ({
  getState: vi.fn(async (k: string) => {
    const v = estado.mapa.get(k);
    return v === undefined ? null : JSON.parse(JSON.stringify(v));
  }),
  setState: vi.fn(async (k: string, v: unknown) => {
    if (estado.recusaEscrita) {
      return { gravado: false, duradouro: false, onde: "nenhures", motivo: "escrita-recusada" };
    }
    estado.mapa.set(k, JSON.parse(JSON.stringify(v)));
    return { gravado: true, duradouro: true, onde: "servidor" };
  }),
  // A recuperação grava com escrita condicional (n.º 4 de 16/11).
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

import { POST } from "./route";

function pedido(body: unknown): NextRequest {
  return new Request("https://liquen-events.com/api/admin/recuperar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const KEYS = ["ADMIN_USERS", "SESSION_SECRET"];
const guardado: Record<string, string | undefined> = {};

beforeEach(() => {
  rl.porChave.clear();
  rl.chamadas = [];
  depois.tarefas = [];
  correio.enviados = [];
  correio.resultado = { sent: true };
  correio.rebenta = false;
  estado.mapa.clear();
  estado.recusaEscrita = false;
  for (const k of KEYS) guardado[k] = process.env[k];
  process.env.SESSION_SECRET = "recuperar-rota-secret-1234567890"; // gitleaks:allow — segredo de teste, gerado aqui e sem valor fora daqui
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

describe("POST /api/admin/recuperar — a resposta é indistinguível", () => {
  it("conta existente e endereço desconhecido devolvem o MESMO estado e o MESMO corpo", async () => {
    const existe = await POST(pedido({ email: "catarina@liquen-events.com" }));
    const naoExiste = await POST(pedido({ email: "ninguem@exemplo.pt" }));

    expect(existe.status).toBe(200);
    expect(naoExiste.status).toBe(200);
    expect(await existe.json()).toEqual(await naoExiste.json());
  });

  it("o email só sai no caso verdadeiro, e só para o endereço da conta", async () => {
    await POST(pedido({ email: "ninguem@exemplo.pt" }));
    await correrDepois();
    expect(correio.enviados).toHaveLength(0);

    await POST(pedido({ email: "catarina@liquen-events.com" }));
    await correrDepois();
    expect(correio.enviados).toHaveLength(1);
    // O destino vem do ADMIN_USERS, nunca do corpo do pedido.
    expect(correio.enviados[0].to).toBe("catarina@liquen-events.com");
  });

  it("O ENVIO FICA DE FORA DA RESPOSTA — é o que fecha o oráculo de tempo", async () => {
    // Um SMTP a sério leva 0,5–2 s. Enquanto era esperado aqui dentro, a conta
    // que EXISTE respondia um segundo mais devagar do que a que não existe, e
    // essa diferença lê-se com o cronómetro do próprio browser. Se algum dia
    // alguém voltar a pôr um `await` no envio, é este teste que o apanha.
    const res = await POST(pedido({ email: "catarina@liquen-events.com" }));
    expect(res.status).toBe(200);
    expect(correio.enviados).toHaveLength(0);
    expect(depois.tarefas).toHaveLength(1);

    await correrDepois();
    expect(correio.enviados).toHaveLength(1);
  });

  it("a ligação aponta para o domínio do código, não para o Host do pedido", async () => {
    // Montar o endereço a partir do cabeçalho `Host` é o erro clássico desta
    // rota: o email sai para a caixa de correio verdadeira com uma ligação para
    // o servidor de quem atacou, e a pessoa entrega-lhe o token na mão.
    await POST(pedido({ email: "catarina@liquen-events.com" }));
    await correrDepois();
    expect(correio.enviados[0].text).toContain(
      "https://liquen-events.com/orcamento/admin/recuperar?token=",
    );
  });

  it("SMTP por configurar não rebenta nem muda a resposta", async () => {
    correio.resultado = { sent: false };
    const res = await POST(pedido({ email: "catarina@liquen-events.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    // E a tarefa adiada também não pode atirar: fora da resposta não há para
    // onde a excepção subir.
    await expect(correrDepois()).resolves.toBeUndefined();
  });

  it("um servidor de correio em baixo também não muda a resposta", async () => {
    correio.rebenta = true;
    const res = await POST(pedido({ email: "catarina@liquen-events.com" }));
    expect(res.status).toBe(200);
    await expect(correrDepois()).resolves.toBeUndefined();
  });
});

describe("POST /api/admin/recuperar — tectos", () => {
  it("trava por endereço de origem", async () => {
    rl.porChave.set("recuperar-ip:test-ip", { ok: false, retryAfter: 1800 });
    const res = await POST(pedido({ email: "catarina@liquen-events.com" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1800");
    expect(correio.enviados).toHaveLength(0);
  });

  it("trava por conta — e a chave não leva o endereço de origem", async () => {
    rl.porChave.set("recuperar-conta:catarina@liquen-events.com", { ok: false, retryAfter: 600 });
    const res = await POST(pedido({ email: "Catarina@Liquen-Events.com" }));
    expect(res.status).toBe(429);
    expect(rl.chamadas).toContain("recuperar-conta:catarina@liquen-events.com");
    expect(rl.chamadas.every((k) => !k.startsWith("recuperar-conta:test-ip"))).toBe(true);
  });
});

describe("POST /api/admin/recuperar — sem sítio onde gravar, diz-se", () => {
  it("responde 503 em vez de prometer um email que não abriria nada", async () => {
    estado.recusaEscrita = true;
    const res = await POST(pedido({ email: "catarina@liquen-events.com" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("Nada foi enviado") });
    expect(correio.enviados).toHaveLength(0);
  });

  it("e responde o mesmo 503 a um endereço que não existe — a recusa não denuncia ninguém", async () => {
    estado.recusaEscrita = true;
    const existe = await POST(pedido({ email: "catarina@liquen-events.com" }));
    const naoExiste = await POST(pedido({ email: "ninguem@exemplo.pt" }));
    expect(naoExiste.status).toBe(existe.status);
    expect(await naoExiste.json()).toEqual(await existe.json());
  });

  it("sem contas com email configuradas, diz que a recuperação não está montada", async () => {
    process.env.ADMIN_USERS = JSON.stringify([
      { name: "Catarina", passwordHash: bcrypt.hashSync("cat-pass", 10) },
    ]);
    const res = await POST(pedido({ email: "catarina@liquen-events.com" }));
    expect(res.status).toBe(503);
    const { error } = (await res.json()) as { error: string };

    /**
     * ── O QUE ESTE TESTE MEDE MUDOU, E DE PROPÓSITO ──────────────────────
     *
     * Media que a frase continha «não está configurada». Passava — e a frase
     * que passava mandava a pessoa «falar com quem o gere», sendo que quem lê
     * isto É quem o gere: é a dona da empresa, sozinha. Mandou a fotografia
     * do aviso a dizer que não funcionava bem, e o teste verde não a protegeu
     * de nada, porque estava a medir uma palavra em vez de uma utilidade.
     *
     * Agora mede as duas coisas que a mensagem tem MESMO de trazer: uma saída
     * que funciona já, e a razão de a recuperação não estar de pé. Uma frase
     * que perca qualquer delas fica vermelha, mesmo que seja bem escrita.
     */
    expect(error, "a mensagem tem de dizer o que se pode fazer AGORA").toMatch(
      /chave de acesso|palavra-passe/i,
    );
    expect(error, "e porque é que a recuperação não responde").toMatch(/configurar|ligada/i);

    /**
     * E não conta a quem passa o nome da variável que falta. Esta rota
     * responde a qualquer pedido da internet; o detalhe da instalação fica no
     * `log.error`, que só quem gere o servidor lê.
     */
    expect(error, "detalhes da instalação não vão na resposta pública").not.toMatch(
      /ADMIN_USERS|ENTRADA\.md|env/i,
    );
  });
});
