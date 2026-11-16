import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { createRequire } from "node:module";
import { config, proxy } from "./proxy";
import { REDIRECIONAMENTOS_DA_LINGUA, REESCRITAS_DA_LINGUA } from "./lib/rotas-da-lingua";

function req(path: string, method = "GET"): NextRequest {
  return new NextRequest(new URL(`https://liquen.test${path}`), { method });
}

/**
 * O que as regras de `rotas-da-lingua.ts` fazem a um caminho, com o mesmo
 * casador de caminhos do Next: «308 /destino», «307 /destino», o destino
 * reescrito, ou `null` (nenhuma regra: serve-se como está). Não vê o disco —
 * os ficheiros estáticos e as rotas fixas ganham às reescritas `afterFiles`
 * ANTES de elas correrem, e isso é do Next, não destas regras.
 */
function encaminhar(caminho: string, cookieEn = false): string | null {
  const casar = (source: string) =>
    getPathMatch(source, { removeUnnamedParams: true, strict: true })(caminho);
  const preencher = (destino: string, p: Record<string, unknown>) => {
    const v = p.caminho;
    const texto = Array.isArray(v) ? v.join("/") : typeof v === "string" ? v : "";
    return destino.replace(/:caminho\*?/, texto).replace(/(.)\/$/, "$1");
  };
  for (const r of REDIRECIONAMENTOS_DA_LINGUA) {
    const p = casar(r.source);
    if (p) return `${r.permanent ? 308 : 307} ${preencher(r.destination, p)}`;
  }
  for (const r of REESCRITAS_DA_LINGUA) {
    if (r.has && !cookieEn) continue;
    const p = casar(r.source);
    if (p) return preencher(r.destination, p);
  }
  return null;
}

describe("rotas da língua — sem função por visita (10/11)", () => {
  it("um caminho nu vai para /pt, ou /en com o cookie", () => {
    expect(encaminhar("/")).toBe("/pt");
    expect(encaminhar("/servicos")).toBe("/pt/servicos");
    expect(encaminhar("/orcamento/admin")).toBe("/pt/orcamento/admin");
    expect(encaminhar("/", true)).toBe("/en");
    expect(encaminhar("/servicos", true)).toBe("/en/servicos");
  });

  it("o /pt interno nunca é público; /admin é o atalho da equipa", () => {
    expect(encaminhar("/pt")).toBe("308 /");
    expect(encaminhar("/pt/galeria")).toBe("308 /galeria");
    expect(encaminhar("/admin")).toBe("307 /orcamento/admin");
  });

  it("deixa como estão o /en, o /api e o /_next (rotas que já existem)", () => {
    for (const c of ["/en", "/en/servicos", "/api/orcamento/123", "/api", "/_next/data/x.json"]) {
      expect(encaminhar(c), c).toBeNull();
    }
  });

  it("não confunde segmentos que só começam pelas mesmas letras", () => {
    expect(encaminhar("/entrar")).toBe("/pt/entrar");
    expect(encaminhar("/apis")).toBe("/pt/apis");
    expect(encaminhar("/ptx")).toBe("/pt/ptx");
    expect(encaminhar("/administracao")).toBe("/pt/administracao");
  });
});

/** Para onde é que o proxy reescreveu (null quando não reescreveu). */
function reescritaPara(res: Response): string | null {
  const raw = res.headers.get("x-middleware-rewrite");
  return raw ? new URL(raw).pathname : null;
}

/**
 * O `matcher` passado pelo MESMO compilador que o Next usa no build
 * (`getMiddlewareMatchers`), e casado como o servidor casa: `true` se o proxy
 * corre neste caminho.
 */
// Os tipos do Next não exportam esta função (o JS exporta): lê-se pelo require.
const { getMiddlewareMatchers } = createRequire(import.meta.url)(
  "next/dist/build/analysis/get-page-static-info",
) as {
  getMiddlewareMatchers: (m: unknown, c: { basePath: string }) => { regexp: string }[];
};
const MATCHERS = getMiddlewareMatchers(config.matcher, { basePath: "" }).map(
  (m: { regexp: string }) => new RegExp(m.regexp),
);
function casaComOMatcher(caminho: string): boolean {
  return MATCHERS.some((r: RegExp) => r.test(caminho));
}

describe("proxy — as leituras públicas ficam de fora (16/11)", () => {
  it("as leituras do link do casal não passam pelo proxy", () => {
    const T = "eyJwIjoiYWJjIn0.QmFzZTY0VXJsU2Vt";
    for (const c of [
      `/api/proposta/${T}/pagina/3`,
      `/api/proposta/${T}/foto/b0f2`,
      `/api/proposta/${T}/fundo/c0`,
      `/api/proposta/${T}/paginas`,
      "/api/vitals",
      "/api/health",
      "/api/erro-do-site",
      "/api/security/csp-report",
    ]) {
      expect(casaComOMatcher(c), c).toBe(false);
    }
  });

  it("o resto de /api continua a passar — o CSRF da escolha e do PDF incluído", () => {
    const T = "eyJwIjoiYWJjIn0.QmFzZTY0VXJsU2Vt";
    for (const c of [
      `/api/proposta/${T}/escolha`,
      `/api/proposta/${T}/pdf`,
      `/api/proposta/${T}/fotos`,
      "/api/cron/backup",
      "/api/cron/reminders",
      "/api/admin/login",
      "/api/orcamento/123",
      "/api/vitalsx",
      "/api/healthcheck",
      "/api/security/outra",
      "/api/proposta/paginas",
    ]) {
      expect(casaComOMatcher(c), c).toBe(true);
    }
  });

  it("e quando passa, o CSRF da escolha continua a recusar outra origem", async () => {
    const r = new NextRequest(new URL("https://liquen.test/api/proposta/T.x/escolha"), {
      method: "POST",
      headers: { origin: "https://mau.example", host: "liquen.test" },
    });
    const res = await proxy(r);
    expect(res.status).toBe(403);
  });
});

describe("proxy — só /api e /en", () => {
  it("o matcher deixa de fora as páginas portuguesas (já não há função por visita)", () => {
    const passa = casaComOMatcher;
    for (const c of ["/", "/servicos", "/galeria", "/proposta/abc.def", "/orcamento/admin"]) {
      expect(passa(c), c).toBe(false);
    }
    for (const c of ["/en", "/en/servicos", "/api", "/api/orcamento/123"]) {
      expect(passa(c), c).toBe(true);
    }
  });

  it("não sequestra os /api/admin/* (é o ramo da api)", async () => {
    const res = await proxy(req("/api/admin/login", "POST"));
    expect(res.headers.get("location")).toBeNull();
    expect(reescritaPara(res)).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PONTO DO TOKEN NÃO É UMA EXTENSÃO DE FICHEIRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As duas ligações que se enviam ao cliente — a de aceitar a proposta e a do
 * portal — são caminhos NUS, e por isso dependem inteiramente da reescrita
 * para o segmento interno `/{lang}/…`:
 *
 *   acceptUrl = `${SITE.url}/proposta/<token>`   (api/orcamento/[id]/proposta)
 *   portalPath()  devolve `/pt/portal/<token>`, que o proxy 308-redirecciona
 *                 para o `/portal/<token>` nu — e o nu volta a passar por aqui
 *
 * E um token é `<corpo>.<assinatura>`: a assinatura é o HMAC-SHA256 em
 * base64url, 43 caracteres do alfabeto `[A-Za-z0-9_-]`. Quando calha não ter
 * `-` nem `_` — MEDIDO: 535 em 2000 assinaturas, 26,8% —, o caminho acaba em
 * ponto seguido de alfanuméricos e o `isNonLocalized` lê-o como um ficheiro
 * estático. Sem reescrita, `/proposta/<token>` já não casa com
 * `[lang]/(privado)/proposta/[token]`: cai no apanha-tudo e o casal recebe a
 * página de 404 em vez da proposta.
 *
 * Uma em cada quatro propostas enviadas. Não falha sempre, e é por isso que
 * ninguém tinha percebido o que era: "às vezes o link não abre".
 */
describe("rotas da língua — ligações com token assinado", () => {
  // Assinatura verdadeira (43 caracteres base64url) sem `-` nem `_`.
  const SIG = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfG";
  const TOKEN = `eyJ0eXAiOiJwcm9wb3NhbCJ9.${SIG}`;

  it("reescreve /proposta/<token> mesmo quando a assinatura acaba em alfanuméricos", () => {
    expect(encaminhar(`/proposta/${TOKEN}`)).toBe(`/pt/proposta/${TOKEN}`);
  });

  it("reescreve /portal/<token> — o destino do 308 de /pt/portal/<token>", () => {
    expect(encaminhar(`/pt/portal/${TOKEN}`)).toBe(`308 /portal/${TOKEN}`);
    expect(encaminhar(`/portal/${TOKEN}`)).toBe(`/pt/portal/${TOKEN}`);
  });
});
