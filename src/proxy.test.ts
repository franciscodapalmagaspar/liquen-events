import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { proxy, config } from "./proxy";
import { CABECALHO_DA_LINGUA } from "@/lib/lingua-do-pedido";

function req(path: string, method = "GET", headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(`https://liquen.test${path}`), { method, headers });
}

/** O cabeçalho que o proxy pôs no pedido a seguir (null quando não pôs). */
function linguaPassada(res: Response): string | null {
  return res.headers.get(`x-middleware-request-${CABECALHO_DA_LINGUA}`);
}

/** Se o `matcher` do proxy acorda a função para este caminho. */
function corre(caminho: string): boolean {
  return config.matcher.some((m) => getPathMatch(m)(caminho) !== false);
}

/** Para onde é que o proxy reescreveu (null quando não reescreveu). */
function reescritaPara(res: Response): string | null {
  const raw = res.headers.get("x-middleware-rewrite");
  return raw ? new URL(raw).pathname : null;
}

describe("proxy — /admin short link", () => {
  it("redirects /admin → /orcamento/admin (307, so it isn't hard-cached)", () => {
    const res = proxy(req("/admin"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/orcamento/admin");
  });

  it("redirects the trailing-slash variant /admin/ too", () => {
    const res = proxy(req("/admin/"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/orcamento/admin");
  });

  it("does not hijack the /api/admin/* endpoints (handled by the api branch)", () => {
    const res = proxy(req("/api/admin/login", "POST"));
    // No Origin header → CSRF check passes; this must NOT become a /admin redirect.
    expect(res.headers.get("location")).toBeNull();
  });

  it("leaves an unrelated path like /administracao alone — the proxy doesn't even run", () => {
    // A reescrita do caminho nu é do next.config agora (src/lib/rotas-da-lingua.ts,
    // e o teste dela prova que /administracao continua a ir para /{lang}).
    expect(corre("/administracao")).toBe(false);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PROXY SÓ ACORDA ONDE AINDA FAZ ALGUMA COISA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Corria à frente de todas as páginas para reescrever o caminho nu, e no Vercel
 * cada uma dessas passagens é uma invocação de função à frente de uma página
 * que já estava pronta no CDN. A reescrita passou para o next.config; aqui
 * prende-se a lista do que ficou, para ninguém a alargar sem dar por isso.
 *
 * Os testes das LIGAÇÕES COM TOKEN (o ponto da assinatura lido como extensão,
 * uma proposta em cada quatro a abrir o 404) mudaram-se com a reescrita: estão
 * em src/lib/rotas-da-lingua.test.ts, casados com o motor do próprio Next.
 */
describe("proxy — matcher", () => {
  it("acorda só para a raiz, o atalho /admin, o espelho /en e a API", () => {
    expect(config.matcher).toEqual(["/", "/admin", "/en", "/en/:path*", "/api/:path+"]);
  });

  it.each(["/", "/admin", "/en", "/en/servicos", "/en/proposta/x.y", "/api/health", "/api/a/b"])(
    "corre em %s",
    (c) => expect(corre(c)).toBe(true),
  );

  it.each([
    "/servicos",
    "/sobre",
    "/galeria",
    "/orcamento/admin",
    "/proposta/abc.def",
    "/s/alentejo",
    "/pt",
    "/pt/servicos",
    "/api",
    "/english",
    "/robots.txt",
    "/_img/g/foto-640.webp",
  ])("NÃO corre em %s", (c) => expect(corre(c)).toBe(false));
});

describe("proxy — a raiz e o espelho inglês, como sempre", () => {
  it("/ → /pt, ou /en com o cookie, e diz a língua ao 404", () => {
    const pt = proxy(req("/"));
    expect(reescritaPara(pt)).toBe("/pt");
    expect(linguaPassada(pt)).toBe("pt");
    const en = proxy(req("/", "GET", { cookie: "liquen-lang=en" }));
    expect(reescritaPara(en)).toBe("/en");
    expect(linguaPassada(en)).toBe("en");
  });

  it("/en/* serve-se tal como está, com o cabeçalho `en`", () => {
    const res = proxy(req("/en/servicos", "GET", { "sec-fetch-dest": "document" }));
    expect(reescritaPara(res)).toBeNull();
    expect(res.headers.get("location")).toBeNull();
    expect(linguaPassada(res)).toBe("en");
  });

  it("o cookie pegajoso só se escreve numa navegação de documento sem ele", () => {
    const sc = (h: Record<string, string>) =>
      proxy(req("/en/servicos", "GET", h)).headers.get("set-cookie") ?? "";
    expect(sc({ "sec-fetch-dest": "document" })).toMatch(/liquen-lang=en/);
    expect(sc({ "sec-fetch-dest": "document", cookie: "liquen-lang=pt" })).toMatch(/liquen-lang=en/);
    expect(sc({ "sec-fetch-dest": "document", cookie: "liquen-lang=en" })).toBe("");
    expect(sc({ "sec-fetch-dest": "empty", rsc: "1" })).toBe("");
    expect(sc({ rsc: "1" })).toBe("");
  });

  it("/en/<ficheiro> passa sem cabeçalho de língua nem cookie, como passava", () => {
    const res = proxy(req("/en/x.jpg", "GET", { "sec-fetch-dest": "document" }));
    expect(linguaPassada(res)).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("um /en/<token> com ponto NÃO é tratado como ficheiro", () => {
    const SIG = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfG";
    const res = proxy(req(`/en/proposta/eyJ0eXAiOiJwcm9wb3NhbCJ9.${SIG}`));
    expect(linguaPassada(res)).toBe("en");
  });
});
