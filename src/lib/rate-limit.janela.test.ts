import { describe, it, expect, vi, afterEach } from "vitest";
import { rateLimit } from "./rate-limit";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A JANELA TEM DE ACABAR — TAMBÉM QUANDO O TRÁFEGO NÃO PÁRA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O limitador tem duas implementações e elas TÊM de contar a mesma coisa: o de
 * memória marca o fim da janela quando ela abre e não lhe volta a tocar; o
 * distribuído punha o prazo no Redis a CADA toque, o que é outra política com o
 * mesmo nome — enquanto houver pedidos, a chave nunca morre e o contador só
 * sobe. Um tecto que diz «3 por hora» passava a ser «3 e nunca mais», e quem o
 * fechava era quem estava a bater à porta, não quem tinha a chave.
 *
 * O Redis é falsificado aqui com um relógio próprio — INCR, PTTL e PEXPIRE com
 * o comportamento verdadeiro deles — porque o que se está a medir é a POLÍTICA
 * da janela, e essa só se vê com o tempo a andar.
 */

interface Entrada {
  valor: number;
  /** Instante em que a chave morre, ou null enquanto não tiver prazo. */
  expiraEm: number | null;
}

/** Um Upstash de mentira, com relógio à mão. Devolve o `fetch` e o registo. */
function upstashFalso() {
  const chaves = new Map<string, Entrada>();
  const comandos: string[][] = [];
  const relogio = { agora: 0 };

  const viva = (k: string): Entrada | null => {
    const e = chaves.get(k);
    if (!e) return null;
    if (e.expiraEm !== null && relogio.agora >= e.expiraEm) {
      chaves.delete(k);
      return null;
    }
    return e;
  };

  const correr = (cmd: string[]): number => {
    const [nome, chave] = cmd;
    switch (nome) {
      case "INCR": {
        const e = viva(chave);
        if (!e) {
          chaves.set(chave, { valor: 1, expiraEm: null });
          return 1;
        }
        e.valor += 1;
        return e.valor;
      }
      case "PTTL": {
        const e = viva(chave);
        if (!e) return -2;
        if (e.expiraEm === null) return -1;
        return e.expiraEm - relogio.agora;
      }
      case "PEXPIRE": {
        const e = viva(chave);
        if (!e) return 0;
        e.expiraEm = relogio.agora + Number(cmd[2]);
        return 1;
      }
      default:
        return 0;
    }
  };

  const fetchFalso = vi.fn(async (_url: string, init?: RequestInit) => {
    const pedido = JSON.parse(String(init?.body)) as string[][];
    for (const c of pedido) comandos.push(c);
    return { ok: true, json: async () => pedido.map((c) => ({ result: correr(c) })) };
  });

  return { fetchFalso, comandos, relogio };
}

function ligarUpstash(fetchFalso: unknown) {
  process.env.UPSTASH_REDIS_REST_URL = "https://x.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "tok"; // gitleaks:allow — não é segredo nenhum, é um Redis de mentira
  vi.stubGlobal("fetch", fetchFalso);
}

afterEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  vi.unstubAllGlobals();
});

describe("rateLimit distribuído — a janela é FIXA", () => {
  it("o contador reinicia quando a janela passa, mesmo com pedidos sem parar", async () => {
    const { fetchFalso, relogio } = upstashFalso();
    ligarUpstash(fetchFalso);

    const chave = "janela-fixa";
    const bateu = async (t: number) => {
      relogio.agora = t;
      return (await rateLimit(chave, 3, 1000, { global: true })).ok;
    };

    // A janela abre e enche-se: três passam.
    expect(await bateu(0)).toBe(true);
    expect(await bateu(400)).toBe(true);
    expect(await bateu(800)).toBe(true);
    // O quarto dentro da mesma janela é travado, como tem de ser.
    expect(await bateu(900)).toBe(false);

    // E agora o que interessa: passado o prazo, a porta reabre. Se o prazo for
    // renovado a cada toque, este pedido — e todos os que vierem a seguir —
    // continuam travados para sempre.
    expect(
      await bateu(1500),
      "a janela nunca acabou: a chave é eterna enquanto houver tráfego",
    ).toBe(true);
    expect(await bateu(1900)).toBe(true);
  });

  it("o prazo é posto UMA vez por janela, e não a cada pedido", async () => {
    const { fetchFalso, comandos, relogio } = upstashFalso();
    ligarUpstash(fetchFalso);

    const chave = "prazo-uma-vez";
    for (const t of [0, 100, 200, 300]) {
      relogio.agora = t;
      await rateLimit(chave, 10, 1000, { global: true });
    }

    const prazos = comandos.filter((c) => c[0] === "PEXPIRE");
    expect(prazos.length, `PEXPIRE enviado ${prazos.length} vezes`).toBe(1);
  });

  it("o Retry-After é o que FALTA da janela, não a janela inteira", async () => {
    const { fetchFalso, relogio } = upstashFalso();
    ligarUpstash(fetchFalso);

    const chave = "retry-real";
    relogio.agora = 0;
    await rateLimit(chave, 1, 10_000, { global: true });
    relogio.agora = 7_000;
    const travado = await rateLimit(chave, 1, 10_000, { global: true });

    expect(travado.ok).toBe(false);
    // Faltam 3 s. Dizer 10 mandava esperar mais do triplo do necessário.
    expect(travado.retryAfter).toBe(3);
  });
});
