import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { limparCachesAoSair } from "./limpar-caches-ao-sair";

/**
 * «SAIR» LEVA CONSIGO O QUE O SERVICE WORKER GUARDOU DO BACK OFFICE
 * (auditoria de 16/11, n.º 6).
 *
 * O `sw.js` guarda o invólucro da vista de carregamento (para abrir sem rede) e
 * as fotografias da biblioteca de temas. Depois de «Sair», nada disso pode
 * ficar no aparelho: quem pegar nele a seguir não tem sessão e não deve ver o
 * que lá ficou. O site público continua guardado — é dele o modo sem rede.
 *
 * Os dois lados fazem a limpeza: o service worker, quando a página lhe pede, e
 * a própria página, directamente (há browsers onde a página não tem service
 * worker a controlá-la, e um pedido por mensagem pode não chegar).
 */

/** Uma Cache Storage de mentira, com o mínimo que os dois lados usam. */
function cacheStorageFalsa(conteudo: Record<string, string[]>) {
  const gavetas = new Map<string, Map<string, Request>>();
  for (const [nome, urls] of Object.entries(conteudo)) {
    gavetas.set(nome, new Map(urls.map((u) => [u, new Request(u)])));
  }
  const api = {
    keys: vi.fn(async () => [...gavetas.keys()]),
    delete: vi.fn(async (nome: string) => gavetas.delete(nome)),
    open: vi.fn(async (nome: string) => {
      if (!gavetas.has(nome)) gavetas.set(nome, new Map());
      const g = gavetas.get(nome)!;
      return {
        keys: async () => [...g.values()],
        delete: async (r: Request | string) => g.delete(typeof r === "string" ? r : r.url),
      };
    }),
  };
  const estado = () => Object.fromEntries([...gavetas].map(([n, g]) => [n, [...g.keys()].sort()]));
  return { api, estado };
}

const ORIGEM = "https://liquen-events.com";
const CONTEUDO = {
  "liquen-cache-v5": [
    `${ORIGEM}/`,
    `${ORIGEM}/offline.html`,
    `${ORIGEM}/servicos`,
    `${ORIGEM}/orcamento/admin/carregamento/LQ-1`,
    `${ORIGEM}/en/orcamento/admin/carregamento/LQ-2`,
  ],
  "liquen-fotos-v2": [`https://x.supabase.co/storage/v1/object/sign/theme-thumbs/a.jpg`],
  "liquen-originais-v1": [`https://x.supabase.co/storage/v1/object/sign/theme-assets/a.jpg`],
};
// As fotografias da biblioteca FICAM (revisão de 16/11, n.º 4): não
// identificam ninguém, e voltar a descarregá-las gasta a saída do plano
// gratuito do Supabase. Sai só o que é página do back office.
const ESPERADO = {
  "liquen-cache-v5": [`${ORIGEM}/`, `${ORIGEM}/offline.html`, `${ORIGEM}/servicos`],
  "liquen-fotos-v2": CONTEUDO["liquen-fotos-v2"],
  "liquen-originais-v1": CONTEUDO["liquen-originais-v1"],
};

// ── O lado do service worker ───────────────────────────────────────────────
const fonte = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

function corpo(nome: string): string {
  const at = fonte.indexOf(`function ${nome}(`);
  if (at < 0) throw new Error(`${nome} desapareceu do sw.js`);
  const inicio = fonte.lastIndexOf("\n", at) + 1;
  let profundidade = 0;
  let fim = at;
  for (let i = fonte.indexOf("{", at); i < fonte.length; i++) {
    if (fonte[i] === "{") profundidade++;
    else if (fonte[i] === "}") {
      profundidade--;
      if (profundidade === 0) {
        fim = i + 1;
        break;
      }
    }
  }
  return fonte.slice(inicio, fim);
}

function constante(nome: string): string {
  const m = fonte.match(new RegExp(`const ${nome} = "([^"]+)";`));
  if (!m) throw new Error(`${nome} desapareceu do sw.js`);
  return m[1];
}

describe("o service worker, ao «Sair»", () => {
  it("apaga as páginas do back office, e deixa o site público e as fotografias", async () => {
    const { api, estado } = cacheStorageFalsa(CONTEUDO);
    const limpar = new Function(
      "caches",
      "CACHE",
      "CACHE_FOTOS",
      "CACHE_ORIGINAIS",
      `${corpo("ehDoBackOffice")}\n${corpo("limparCachesDoBackOffice")}\nreturn limparCachesDoBackOffice;`,
    )(
      api,
      constante("CACHE"),
      constante("CACHE_FOTOS"),
      constante("CACHE_ORIGINAIS"),
    ) as () => Promise<void>;
    await limpar();
    expect(estado()).toEqual(ESPERADO);
  });

  it("ouve o pedido da página", () => {
    expect(fonte).toMatch(/addEventListener\("message"/);
    expect(fonte).toContain('"limpar-back-office"');
  });
});

// ── O lado da página ───────────────────────────────────────────────────────
describe("a página, ao «Sair»", () => {
  it("pede ao service worker E limpa directamente", async () => {
    const { api, estado } = cacheStorageFalsa(CONTEUDO);
    const postMessage = vi.fn();
    await limparCachesAoSair({ caches: api, controlador: { postMessage } });
    expect(postMessage).toHaveBeenCalledWith({ tipo: "limpar-back-office" });
    expect(estado()).toEqual(ESPERADO);
  });

  it("sem service worker e sem Cache Storage, não rebenta", async () => {
    await expect(limparCachesAoSair({ caches: undefined, controlador: null })).resolves.toBe(
      undefined,
    );
  });

  it("uma Cache Storage que rebenta não impede a saída", async () => {
    const api = {
      keys: vi.fn(async () => {
        throw new Error("quota");
      }),
      delete: vi.fn(),
      open: vi.fn(),
    };
    await expect(limparCachesAoSair({ caches: api, controlador: null })).resolves.toBe(undefined);
  });

  it("uma limpeza que não acaba não prende a saída mais do que o tecto", async () => {
    const api = {
      keys: vi.fn(() => new Promise<string[]>(() => {})),
      delete: vi.fn(),
      open: vi.fn(),
    };
    const t0 = Date.now();
    await limparCachesAoSair({ caches: api, controlador: null, tectoMs: 50 });
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
