import { defineConfig, devices } from "@playwright/test";
import { ESTADO_ADMIN } from "./e2e/estado-admin";

/**
 * A ERGONOMIA TÁCTIL DO BACK OFFICE — com o seu próprio servidor.
 *
 * ── Porque é que saiu do servidor de produção ─────────────────────────────
 * Estes passeios precisam de UM PEDIDO na lista: um deles abre o estúdio a
 * partir de um cartão de cliente, e o outro mede as vistas com conteúdo
 * verdadeiro em vez das folhas vazias (que são as que menos se vêem no dia a
 * dia). O `playwright.config.ts` arranca, em CI, o servidor de PRODUÇÃO, e o
 * `Repository` recusa escritas em produção quando o Supabase não está
 * configurado (ver `repository.ts` — gravar para um ficheiro efémero seria
 * perder dados em silêncio no próximo deploy). O pedido que o teste cria
 * nunca chegava a existir: o `POST /api/orcamento` respondia 500, a lista
 * ficava vazia, e a falha aparecia trinta linhas mais à frente com a cara de
 * outra coisa — «main li button» não encontrado.
 *
 * É a mesma razão das passkeys e dos fluxos de proposta, e os dois já correm
 * assim. Aqui está escrita outra vez em vez de mandar ler outro ficheiro,
 * porque foi precisamente a suposição de que «isto grava» que fez perder uma
 * ida ao CI.
 *
 * ── O que se perde, e porque se aceita ────────────────────────────────────
 * Deixa de se medir o BUILD de produção. O que estes passeios medem são
 * tamanhos de alvo, corpo de letra, margens e o que está desenhado no ecrã —
 * tudo do Tailwind, que é idêntico nos dois modos. O que o build de produção
 * mudaria (minificação, divisão de pacotes) não mexe em nenhuma destas
 * medidas.
 *
 * A saída fácil era pôr os testes a saltar quando a lista está vazia. Seria
 * uma suite verde que nunca chega ao estúdio — exactamente a armadilha em que
 * este projecto já caiu antes.
 *
 * Porta própria, para poder correr ao lado das outras suites sem lhes tocar.
 */
const PORT = 3212;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "**/admin-mobile.spec.ts",
    "**/o-iphone-com-barras.spec.ts",
    "**/sessao-admin.setup.ts",
  ],
  // Em série: os passeios criam pedidos e mexem na mesma lista.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    { name: "sessao", testMatch: /sessao-admin\.setup\.ts/, use: { ...devices["Desktop Chrome"] } },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: ESTADO_ADMIN },
      dependencies: ["sessao"],
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      SESSION_SECRET: "e2e-movel-session-secret-not-for-production-use",
      // O mesmo hash de desenvolvimento que o CI já usa para a palavra-passe
      // pública "liquen2026" (ver ci.yml) — sem ele não há entrada no back
      // office e não há nada para medir.
      ADMIN_PASSWORD_HASH: "$2b$10$eSAkm9hz/JUpFYWRdPrA9.YJP.Gjry2IwVwgZa3hjvHcvV/r27n7u",
    },
  },
});
