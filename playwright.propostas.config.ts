import { defineConfig, devices } from "@playwright/test";
import { ESTADO_ADMIN } from "./e2e/estado-admin";

/**
 * OS DOIS FLUXOS DE FAZER UMA PROPOSTA — com o seu próprio servidor.
 *
 * ── Porque é que não corre com os outros ──────────────────────────────────
 * A mesma razão das passkeys, e vale a pena repeti-la aqui em vez de mandar
 * ler outro ficheiro: o `playwright.config.ts` arranca, em CI, o servidor de
 * PRODUÇÃO, e o `Repository` recusa escritas em produção quando o Supabase não
 * está configurado (ver `repository.ts` — escrever para um ficheiro efémero
 * seria perder dados em silêncio no próximo deploy). Estes passeios CRIAM um
 * pedido e guardam um modelo; contra o servidor de produção do CI, nada disso
 * chegaria a gravar.
 *
 * A saída fácil era pô-los a saltar quando a gravação é recusada. Seria uma
 * suite verde que nunca exercitou nada — exactamente a armadilha em que este
 * projecto já caiu antes. Correm contra um servidor de desenvolvimento, onde o
 * armazém em ficheiro é o comportamento pretendido.
 *
 * O que se perde: não se prova o comportamento do BUILD de produção. Aceita-se,
 * porque o que aqui se prova é uma REGRA DE NEGÓCIO — que a proposta copiada
 * não leva nada do casal anterior — e essa não muda entre builds.
 *
 * Porta própria, para poder correr ao lado das outras suites sem lhes tocar.
 */
const PORT = 3211;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "**/proposta-fluxos.spec.ts",
    "**/moodboards-arrasto.spec.ts",
    // O total da barra de baixo em 1440/768/390 (auditoria de 14/11, n.º 1 e 2).
    "**/o-total-nunca-sai.spec.ts",
    "**/sessao-admin.setup.ts",
  ],
  // Em série: os dois passeios criam pedidos e mexem na mesma lista.
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
      SESSION_SECRET: "e2e-propostas-session-secret-not-for-production-use",
    },
  },
});
