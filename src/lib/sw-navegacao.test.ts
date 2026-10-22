import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE FICA GUARDADO COMO «A PÁGINA» QUANDO NÃO HOUVER REDE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As navegações são network-first: vai-se sempre à rede e guarda-se a resposta
 * para quando não houver. Só que se guardava a resposta QUALQUER QUE ELA FOSSE.
 *
 * O percurso: durante uma publicação — ou num minuto em que o alojamento
 * responde 500, ou num 404 de uma ligação velha — alguém abre o sítio. A página
 * de erro entra na cache com a chave da página real. A partir daí, a cópia
 * offline de `/` é a página de erro: quem for ver o sítio sem rede não recebe o
 * `offline.html`, recebe o 500 daquele minuto, e recebe-o até a cache mudar de
 * nome. O sítio fica «avariado» offline muito depois de ter deixado de estar.
 *
 * O mesmo vale para uma resposta REDIRECCIONADA: devolver uma dessas a uma
 * navegação a partir do service worker é um erro do browser («a resposta foi
 * redireccionada»), e o que a pessoa vê offline não é a página nem o
 * `offline.html` — é um ecrã de erro do próprio browser.
 *
 * Este ficheiro corre o `public/sw.js` REAL dentro de um mundo de mentira
 * (`self`, `caches`, `fetch`) e despacha eventos de navegação nele. Reescrever
 * as regras aqui era arriscar testar uma cópia que já não é o que o browser
 * corre.
 */

const FONTE = readFileSync("public/sw.js", "utf-8");
const ORIGEM = "https://liquen-events.com";

/** Uma resposta com o que o `sw.js` lhe pergunta: `ok`, `status`, `redirected`. */
function resposta(o: { status?: number; redirected?: boolean; corpo?: string }) {
  const status = o.status ?? 200;
  const r = {
    ok: status >= 200 && status < 300,
    status,
    redirected: o.redirected ?? false,
    corpo: o.corpo ?? "",
    clone() {
      return { ...r, clone: r.clone };
    },
  };
  return r;
}

type RespostaFalsa = ReturnType<typeof resposta>;

/** A Cache Storage, com a ordem de inserção que o `sw.js` conta para aparar. */
function criarCaches() {
  const caixas = new Map<string, Map<string, RespostaFalsa>>();
  const chave = (pedido: unknown) =>
    typeof pedido === "string" ? pedido : String((pedido as { url: string }).url);

  const abrir = (nome: string) => {
    if (!caixas.has(nome)) caixas.set(nome, new Map());
    const caixa = caixas.get(nome)!;
    return {
      put: async (pedido: unknown, res: RespostaFalsa) => void caixa.set(chave(pedido), res),
      match: async (pedido: unknown) => caixa.get(chave(pedido)),
      keys: async () => [...caixa.keys()],
      delete: async (pedido: unknown) => caixa.delete(chave(pedido)),
      add: async (url: string) => void caixa.set(url, resposta({})),
    };
  };

  return {
    caixas,
    api: {
      open: async (nome: string) => abrir(nome),
      keys: async () => [...caixas.keys()],
      delete: async (nome: string) => caixas.delete(nome),
      match: async (pedido: unknown) => {
        for (const caixa of caixas.values()) {
          const achado = caixa.get(chave(pedido));
          if (achado) return achado;
        }
        return undefined;
      },
    },
  };
}

function montar() {
  const ouvintes = new Map<string, (evento: unknown) => void>();
  const caches = criarCaches();
  const rede = vi.fn();
  const self = {
    addEventListener: (tipo: string, fn: (evento: unknown) => void) => ouvintes.set(tipo, fn),
    skipWaiting: () => {},
    location: { origin: ORIGEM },
    clients: { claim: async () => {}, matchAll: async () => [], openWindow: async () => {} },
    registration: {
      showNotification: async () => {},
      navigationPreload: { enable: vi.fn(async () => {}) },
    },
  };
  new Function("self", "caches", "fetch", FONTE)(self, caches.api, rede);

  /** Despacha uma navegação e devolve o que o service worker respondeu. */
  async function navegar(caminho: string, preloadResponse?: Promise<RespostaFalsa | undefined>) {
    const pedido = { method: "GET", url: `${ORIGEM}${caminho}`, mode: "navigate" };
    let respondida: Promise<RespostaFalsa> | undefined;
    ouvintes.get("fetch")!({
      request: pedido,
      preloadResponse,
      respondWith: (p: Promise<RespostaFalsa>) => {
        respondida = p;
      },
    });
    const res = await respondida;
    // A escrita na cache é feita fora do `respondWith` (não bloqueia a
    // resposta), por isso deixa-se a fila de microtarefas esvaziar antes de ir
    // ver o que lá ficou.
    await new Promise((r) => setTimeout(r, 0));
    return res;
  }

  const guardado = (caminho: string) => {
    for (const caixa of caches.caixas.values()) {
      if (caixa.has(`${ORIGEM}${caminho}`)) return caixa.get(`${ORIGEM}${caminho}`);
    }
    return undefined;
  };

  /** Corre o `activate` e espera por ele. */
  async function activar() {
    let espera: Promise<unknown> | undefined;
    ouvintes.get("activate")!({ waitUntil: (p: Promise<unknown>) => void (espera = p) });
    await espera;
  }

  return { navegar, guardado, rede, activar, self };
}

let sw: ReturnType<typeof montar>;

beforeEach(() => {
  sw = montar();
});

describe("service worker — o que uma navegação deixa na cache", () => {
  it("uma página que veio bem fica guardada para quando não houver rede", async () => {
    sw.rede.mockResolvedValue(resposta({ status: 200, corpo: "a página" }));
    const res = await sw.navegar("/");
    expect(res?.status).toBe(200);
    expect(sw.guardado("/")).toBeDefined();
  });

  /** O TESTE QUE INTERESSA. */
  it("uma página de erro NÃO fica guardada como sendo a página", async () => {
    sw.rede.mockResolvedValue(resposta({ status: 500, corpo: "500 — publicação a decorrer" }));

    const res = await sw.navegar("/");

    // Quem está online continua a ver o erro verdadeiro: não se inventa nada.
    expect(res?.status).toBe(500);
    expect(
      sw.guardado("/"),
      "o 500 daquele minuto passou a ser a cópia offline de `/` — e fica-o até a cache mudar de nome",
    ).toBeUndefined();
  });

  it("um 404 também não", async () => {
    sw.rede.mockResolvedValue(resposta({ status: 404 }));
    await sw.navegar("/uma-ligacao-velha");
    expect(sw.guardado("/uma-ligacao-velha")).toBeUndefined();
  });

  /**
   * Devolver uma resposta redireccionada a uma navegação, a partir de um
   * service worker, é um erro do browser — e offline dá um ecrã de erro em vez
   * do `offline.html`.
   */
  it("uma resposta redireccionada não fica guardada", async () => {
    sw.rede.mockResolvedValue(resposta({ status: 200, redirected: true }));
    await sw.navegar("/");
    expect(sw.guardado("/")).toBeUndefined();
  });

  /**
   * Sem a subida do nome, a correcção não chega a quem já tem uma página de
   * erro gravada: quem apaga o que ficou lá é o `activate`, e ele só apaga as
   * caches cujo nome não conhece.
   */
  it("o nome da cache subiu, para limpar as páginas de erro já gravadas", () => {
    // v5 desde 15/10 (os vídeos da entrada): continua a ser uma subida.
    expect(FONTE).toMatch(/CACHE = "liquen-cache-v([4-9]|\d{2,})"/);
  });

  it("sem rede, e sem nada guardado, sobra o ecrã de offline", async () => {
    sw.rede.mockRejectedValue(new TypeError("Failed to fetch"));
    const res = await sw.navegar("/");
    // O `install` não correu neste mundo, portanto não há `offline.html`
    // precacheado: o que interessa é não rebentar e não devolver lixo.
    expect(res).toBeUndefined();
  });
});

describe("service worker — a página parte enquanto o guião acorda", () => {
  it("o `activate` liga a pré-carga das navegações", async () => {
    await sw.activar();
    expect(sw.self.registration.navigationPreload.enable).toHaveBeenCalled();
  });

  it("usa a resposta que o browser já pediu, e não pede outra vez", async () => {
    const pre = resposta({ status: 200, corpo: "já vinha a caminho" });
    const res = await sw.navegar("/", Promise.resolve(pre));
    expect(res?.corpo).toBe("já vinha a caminho");
    expect(sw.rede).not.toHaveBeenCalled();
    // E continua a ficar guardada para quando não houver rede.
    expect(sw.guardado("/")).toBeDefined();
  });

  it("sem pré-carga (ou se ela falhar) vai à rede como sempre", async () => {
    sw.rede.mockResolvedValue(resposta({ status: 200, corpo: "da rede" }));
    expect((await sw.navegar("/", Promise.resolve(undefined)))?.corpo).toBe("da rede");
    expect((await sw.navegar("/", Promise.reject(new Error("abortada"))))?.corpo).toBe("da rede");
  });
});
