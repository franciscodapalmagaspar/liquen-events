import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
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

describe("proxy — só /api e /en", () => {
  it("o matcher deixa de fora as páginas portuguesas (já não há função por visita)", () => {
    expect(config.matcher).toEqual(["/api/:path*", "/en", "/en/:path*"]);
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
