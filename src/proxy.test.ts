import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

function req(path: string, method = "GET"): NextRequest {
  return new NextRequest(new URL(`https://liquen.test${path}`), { method });
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

  it("leaves an unrelated path like /administracao to the normal locale rewrite", () => {
    const res = proxy(req("/administracao"));
    // Rewrite (not a redirect) onto the internal /{lang} segment.
    expect(res.headers.get("location")).toBeNull();
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
describe("proxy — ligações com token assinado", () => {
  // Assinatura verdadeira (43 caracteres base64url) sem `-` nem `_`.
  const SIG = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfG";
  const TOKEN = `eyJ0eXAiOiJwcm9wb3NhbCJ9.${SIG}`;

  it("reescreve /proposta/<token> mesmo quando a assinatura acaba em alfanuméricos", () => {
    const res = proxy(req(`/proposta/${TOKEN}`));
    expect(reescritaPara(res)).toBe(`/pt/proposta/${TOKEN}`);
  });

  it("reescreve /portal/<token> — o destino do 308 de /pt/portal/<token>", () => {
    const res = proxy(req(`/portal/${TOKEN}`));
    expect(reescritaPara(res)).toBe(`/pt/portal/${TOKEN}`);
  });

  it("continua a deixar passar os ficheiros estáticos sem reescrita", () => {
    for (const p of [
      "/sw.js",
      "/offline.html",
      "/llms.txt",
      "/og-liquen-2026.jpg",
      "/email/cabecalho.png",
      "/_img/g/foto-640.webp",
      "/imagens/EW1_1330.jpg",
    ]) {
      expect(reescritaPara(proxy(req(p))), p).toBeNull();
    }
  });
});
