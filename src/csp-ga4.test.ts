import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import { permiteOrigem } from "./lib/csp-imagens";

/**
 * O GA4 TEM DE CHEGAR ÀS ESTATÍSTICAS DEPOIS DE «ACEITAR».
 *
 * Os registos da Vercel (7 dias até 17/11) contavam 80 recusas da CSP de
 * produção, todas iguais:
 *
 *     violatedDirective: connect-src
 *     blockedUri: https://region1.analytics.google.com/g/collect?…&gcs=G111…
 *
 * `gcs=G111` é o consentimento DADO: eram as visitas de quem aceitou os
 * cookies, perdidas na porta. O GA4 manda o `/g/collect` para o servidor da
 * região de quem visita, e a política só tinha o `analytics.google.com` exacto.
 *
 * O teste lê a política que o `next.config.ts` serve EM PRODUÇÃO (em
 * desenvolvimento a `connect-src` é aberta, e não provaria nada) e pergunta-lhe
 * com o `permiteOrigem` — a MESMA correspondência de hosts que o diagnóstico de
 * fotografias usa, e não uma segunda cópia dela.
 */

async function connectSrc(): Promise<string> {
  const grupos = await nextConfig.headers!();
  const publica = grupos
    .find((g) => g.source === "/:path*")!
    .headers.find((h) => h.key === "Content-Security-Policy")!.value;
  const diretiva = publica
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith("connect-src "));
  expect(diretiva, "a CSP de produção tem de ter connect-src").toBeTruthy();
  return diretiva!;
}

const permite = permiteOrigem;

describe("CSP de produção × GA4", () => {
  beforeEach(() => vi.stubEnv("NODE_ENV", "production"));
  afterEach(() => vi.unstubAllEnvs());

  it("deixa passar o /g/collect da região europeia (o que os registos mostravam recusado)", async () => {
    const fontes = await connectSrc();
    expect(
      permite(fontes, "https://region1.analytics.google.com/g/collect?v=2&tid=G-TESTE&gcs=G111"),
    ).toBe(true);
  });

  it("e continua a deixar passar os endereços do GA4 que já passavam", async () => {
    const fontes = await connectSrc();
    for (const endereco of [
      "https://analytics.google.com/g/collect",
      "https://www.google-analytics.com/g/collect",
      "https://region1.google-analytics.com/g/collect",
      "https://stats.g.doubleclick.net/g/collect",
      "https://www.googletagmanager.com/gtag/js",
    ]) {
      expect(permite(fontes, endereco), endereco).toBe(true);
    }
  });

  it("não abre mais do que o GA4 precisa", async () => {
    const fontes = await connectSrc();
    // Nenhum curinga sobre a google.com inteira, nem sobre outra coisa que
    // não sejam os dois ramos do GA4 que a documentação da Google nomeia.
    const curingas = fontes
      .split(/\s+/)
      .filter((f) => f.includes("*") && /google|doubleclick/.test(f));
    expect(curingas.sort()).toEqual([
      "https://*.analytics.google.com",
      "https://*.google-analytics.com",
    ]);
    for (const endereco of [
      "https://mail.google.com/",
      "https://qualquer.google.com/",
      "https://analytics.google.com.exemplo.pt/",
      "https://exemplo-google-analytics.com/",
    ]) {
      expect(permite(fontes, endereco), endereco).toBe(false);
    }
  });
});
