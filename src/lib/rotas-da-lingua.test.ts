import { describe, it, expect } from "vitest";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { modifyRouteRegex } from "next/dist/lib/redirect-status";
import {
  matchHas,
  prepareDestination,
} from "next/dist/shared/lib/router/utils/prepare-destination";
import nextConfig from "../../next.config";
import { REDIRECCIONAMENTOS_DA_LINGUA, REESCRITAS_DA_LINGUA } from "./rotas-da-lingua";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS REGRAS DO NEXT.CONFIG FAZEM O QUE O PROXY FAZIA — MEDIDO COM O MOTOR DELE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A reescrita do caminho nu e o `/pt` → nu saíram do `src/proxy.ts` para o
 * `rewrites()`/`redirects()` do next.config (o porquê está em
 * `rotas-da-lingua.ts`). Uma regra declarativa não se testa chamando uma
 * função: testa-se casando-a como o Next a casa. Por isso aqui não há
 * expressões regulares escritas à mão — as regras passam pelas MESMAS peças
 * que o servidor usa (node_modules/next/dist/server/lib/router-utils/
 * filesystem.js, `buildCustomRoute`, e resolve-routes.js, `handleRoute`):
 * `getPathMatch` com `strict` e `removeUnnamedParams`, o `modifyRouteRegex`
 * que acrescenta a barra final opcional, o `matchHas` do cookie e o
 * `prepareDestination` que monta o destino e a query.
 *
 * E o proxy de antes fica escrito aqui, como referência (`oQueOProxyFazia`):
 * o teste não diz só «a regra dá isto», diz «a regra dá o MESMO que o proxy
 * dava», caminho a caminho. As diferenças que ficaram estão listadas à parte,
 * com nome.
 */

type Regra = {
  source: string;
  destination: string;
  has?: Parameters<typeof matchHas>[2];
  missing?: Parameters<typeof matchHas>[3];
};

const SIG = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfG";
const TOKEN = `eyJ0eXAiOiJwcm9wb3NhbCJ9.${SIG}`;

function pedido(cookie?: string) {
  return { headers: cookie ? { cookie } : {} } as unknown as Parameters<typeof matchHas>[0];
}

/** Uma regra casada como o `buildCustomRoute` do servidor a casa. */
function casar(regra: Regra, tipo: "rewrite" | "redirect", caminho: string, cookie?: string) {
  const match = getPathMatch(regra.source, {
    strict: true,
    removeUnnamedParams: true,
    regexModifier: (r) => modifyRouteRegex(r, tipo === "redirect" ? ["/_next"] : undefined),
  });
  const [pathname, search = ""] = caminho.split("?");
  const query = Object.fromEntries(new URLSearchParams(search));
  let params = match(pathname);
  if (params && (regra.has || regra.missing)) {
    const doCookie = matchHas(pedido(cookie), query, regra.has, regra.missing);
    params = doCookie ? { ...params, ...doCookie } : false;
  }
  if (!params) return null;
  const { parsedDestination } = prepareDestination({
    appendParamsToQuery: tipo === "rewrite",
    destination: regra.destination,
    params,
    query,
  });
  const q = new URLSearchParams(parsedDestination.query as Record<string, string>).toString();
  return parsedDestination.pathname + (q ? `?${q}` : "");
}

/**
 * As reescritas `afterFiles` encadeiam (resolve-routes.js: cada uma vê o
 * caminho que a anterior deixou). Devolve o caminho final, ou `null` quando
 * nenhuma reescreveu.
 */
function reescrita(caminho: string, cookie?: string): string | null {
  let atual = caminho;
  let mudou = false;
  for (const regra of REESCRITAS_DA_LINGUA as Regra[]) {
    const destino = casar(regra, "rewrite", atual, cookie);
    if (destino) {
      atual = destino;
      mudou = true;
    }
  }
  return mudou ? atual : null;
}

function redireccionamento(caminho: string): string | null {
  for (const regra of REDIRECCIONAMENTOS_DA_LINGUA as Regra[]) {
    const destino = casar(regra, "redirect", caminho);
    if (destino) return destino;
  }
  return null;
}

/**
 * O que o `src/proxy.ts` fazia a um caminho nu ANTES desta mudança, transcrito
 * à letra (o `matcher`, o `isNonLocalized` e o ramo da reescrita). Só se usa
 * nos caminhos em que nenhum ficheiro nem rota estática responde primeiro.
 */
function oQueOProxyFazia(caminho: string, cookie?: string): string | null {
  const exclusaoDoMatcher =
    /^\/(?:_next\/static|_next\/image|_img\/|imagens\/|videos\/|logos\/|favicon\.ico|icon\.png|apple-icon\.png|manifest\.webmanifest|sitemap\.xml|robots\.txt)/;
  if (exclusaoDoMatcher.test(caminho)) return null;
  if (caminho.startsWith("/api/")) return null;
  if (
    caminho.startsWith("/_next") ||
    caminho.startsWith("/imagens/") ||
    caminho.startsWith("/logos/") ||
    /\.[a-zA-Z0-9]{1,8}$/.test(caminho)
  )
    return null;
  if (caminho === "/admin") return null; // redireccionamento, não reescrita
  if (caminho === "/pt" || caminho.startsWith("/pt/")) return null;
  if (caminho === "/en" || caminho.startsWith("/en/")) return null;
  const lingua = cookie === "liquen-lang=en" ? "en" : "pt";
  return `/${lingua}${caminho === "/" ? "" : caminho}`;
}

describe("next.config — as regras da língua estão lá, e no sítio certo", () => {
  it("as reescritas são `afterFiles` — nem `beforeFiles` nem a lista simples", async () => {
    const r = await nextConfig.rewrites!();
    // Uma lista simples também seria afterFiles, mas o objeto diz-o por extenso
    // e prende as outras duas fases vazias: uma reescrita do caminho nu em
    // `beforeFiles` passaria à frente de /robots.txt e companhia, e no Vercel
    // não recebe o sufixo RSC (ver rotas-da-lingua.ts, razão 2).
    expect(Array.isArray(r)).toBe(false);
    const fases = r as { beforeFiles: unknown[]; afterFiles: unknown[]; fallback: unknown[] };
    expect(fases.beforeFiles).toEqual([]);
    expect(fases.fallback).toEqual([]);
    expect(fases.afterFiles).toEqual(REESCRITAS_DA_LINGUA);
  });

  it("os redireccionamentos do /pt estão no `redirects()`, depois do do www", async () => {
    const r = await nextConfig.redirects!();
    const sources = r.map((x) => x.source);
    for (const regra of REDIRECCIONAMENTOS_DA_LINGUA) {
      expect(sources).toContain(regra.source);
      expect(regra.permanent, "308, como o proxy dava").toBe(true);
    }
    const www = r.findIndex((x) => x.has?.some((h) => h.type === "host"));
    expect(sources.indexOf("/pt")).toBeGreaterThan(www);
  });
});

describe("reescrita do caminho nu — o mesmo destino que o proxy dava", () => {
  // Caminhos sem «extensão»: aqui a regra e o proxy TÊM de coincidir.
  const caminhos = [
    "/servicos",
    "/sobre",
    "/galeria",
    "/casamentos/estilo",
    "/servicos/nao-existe",
    "/orcamento",
    "/orcamento/admin",
    "/orcamento/admin/login",
    "/s/alentejo",
    "/s/portugal",
    "/pagina-que-nao-existe",
    "/x/y/z",
    "/administracao",
    "/english",
    "/enigma",
    "/ptolomeu",
    "/api",
    "/imagens",
    "/_not-found",
    `/proposta/${TOKEN}`,
    `/portal/${TOKEN}`,
    "/en",
    "/en/servicos",
    `/en/proposta/${TOKEN}`,
    "/pt",
    "/api/health",
    "/api/nao-existe",
    "/_next/nao-existe",
    "/_img/nao-existe",
    "/imagens/nao-existe",
    "/videos/nao-existe",
    "/logos/nao-existe",
  ];
  for (const cookie of [undefined, "liquen-lang=en", "liquen-lang=pt"]) {
    for (const c of caminhos) {
      it(`${c} ${cookie ?? "(sem cookie)"}`, () => {
        expect(reescrita(c, cookie)).toBe(oQueOProxyFazia(c, cookie));
      });
    }
  }

  it("a raiz NÃO é do next.config: fica no proxy (ver o cabeçalho de src/proxy.ts)", () => {
    expect(reescrita("/")).toBeNull();
    expect(reescrita("/", "liquen-lang=en")).toBeNull();
  });

  it("o valor do cookie é exacto: `english` ou `EN` não são inglês", () => {
    expect(reescrita("/servicos", "liquen-lang=english")).toBe("/pt/servicos");
    expect(reescrita("/servicos", "liquen-lang=EN")).toBe("/pt/servicos");
    expect(reescrita("/servicos", "outro=1; liquen-lang=en")).toBe("/en/servicos");
  });

  it("a query segue intacta e o parâmetro `path` não se mete nela", () => {
    expect(reescrita("/servicos?x=1&utm_source=a")).toBe("/pt/servicos?x=1&utm_source=a");
    expect(reescrita("/orcamento/admin?v=temas", "liquen-lang=en")).toBe(
      "/en/orcamento/admin?v=temas",
    );
  });

  it("um caracter codificado chega ao destino tal como veio", () => {
    expect(reescrita("/servicos/a%20b")).toBe("/pt/servicos/a%20b");
  });
});

/**
 * O ponto da assinatura do token — o defeito de uma ligação em cada quatro
 * (ver o comentário do `EXTENSAO_DE_FICHEIRO` em src/proxy.ts). A regra do
 * next.config não olha para pontos, portanto deixa de haver tecto nenhum a
 * acertar: o token chega sempre à rota.
 */
describe("ligações com token assinado", () => {
  it("/proposta/<token> e /portal/<token> chegam ao segmento português", () => {
    expect(reescrita(`/proposta/${TOKEN}`)).toBe(`/pt/proposta/${TOKEN}`);
    expect(reescrita(`/portal/${TOKEN}`)).toBe(`/pt/portal/${TOKEN}`);
  });

  it("e ao inglês, para quem tem o cookie", () => {
    expect(reescrita(`/proposta/${TOKEN}`, "liquen-lang=en")).toBe(`/en/proposta/${TOKEN}`);
  });

  it("o /pt/portal/<token> do `portalPath()` volta ao nu — e daí ao segmento", () => {
    const nu = redireccionamento(`/pt/portal/${TOKEN}`);
    expect(nu).toBe(`/portal/${TOKEN}`);
    expect(reescrita(nu!)).toBe(`/pt/portal/${TOKEN}`);
  });
});

/**
 * No Vercel o pedido RSC da navegação chega às reescritas `afterFiles` com o
 * sufixo já posto (`/servicos.rsc`, `/servicos.segments/_tree.segment.rsc`) —
 * @vercel/next, `modifyRewrites`. A regra TEM de os reescrever, e é por isso
 * que não exclui caminhos com «extensão». Quem um dia lhe acrescentar
 * `(?!.*\.[a-z0-9]{1,8}$)` «para ficar igual ao proxy» parte a navegação de
 * todas as páginas no Vercel — e localmente não se vê nada.
 */
describe("os sufixos RSC do Vercel são reescritos", () => {
  it.each([
    ["/servicos.rsc", "/pt/servicos.rsc"],
    ["/servicos.prefetch.rsc", "/pt/servicos.prefetch.rsc"],
    ["/servicos.segments/_tree.segment.rsc", "/pt/servicos.segments/_tree.segment.rsc"],
    [`/proposta/${TOKEN}.rsc`, `/pt/proposta/${TOKEN}.rsc`],
  ])("%s → %s", (de, para) => {
    expect(reescrita(de)).toBe(para);
  });
});

/**
 * As diferenças que ficaram, com nome. Todas em endereços que não existem, e
 * nenhuma muda o estado (404 antes, 404 depois): um caminho nu com «extensão»
 * passa a ser reescrito como qualquer outro, e para quem tem o cookie `en` o
 * 404 sai em inglês (ver `lingua()` em app/global-not-found.tsx).
 */
describe("as diferenças conhecidas — só em endereços que não existem", () => {
  it.each(["/backup.zip", "/wp-login.php", "/servicos/x.jpg", "/proposta/x.jpg"])(
    "%s passa a ser reescrito (o proxy deixava-o passar como «ficheiro»)",
    (c) => {
      expect(oQueOProxyFazia(c)).toBeNull();
      expect(reescrita(c)).toBe(`/pt${c}`);
    },
  );
});

describe("/pt → endereço nu (308)", () => {
  it.each([
    ["/pt", "/"],
    ["/pt/servicos", "/servicos"],
    ["/pt/servicos?x=1", "/servicos?x=1"],
    ["/pt/sobre", "/sobre"],
    ["/pt/a/b", "/a/b"],
    ["/pt/servicos/a%20b", "/servicos/a%20b"],
  ])("%s → %s", (de, para) => {
    expect(redireccionamento(de)).toBe(para);
  });

  it.each(["/pt/x.jpg", "/ptolomeu", "/servicos", "/en/servicos", "/"])(
    "%s não é redireccionado — como no proxy",
    (c) => {
      expect(redireccionamento(c)).toBeNull();
    },
  );
});
