import { defineConfig, devices } from "@playwright/test";
import { ESTADO_ADMIN } from "./e2e/estado-admin";

/**
 * OS PASSEIOS QUE PRECISAM DE UM PEDIDO NA LISTA — com o seu próprio servidor.
 *
 * ── O que estava a acontecer ──────────────────────────────────────────────
 * Doze passeios desta suite NUNCA correram no CI. Não por estarem partidos:
 * porque a lista de pedidos começa VAZIA (o armazém em ficheiro, `data/*.json`,
 * não é versionado) e nenhum deles conseguia criar o pedido de que precisa. O
 * `playwright.config.ts` arranca, em CI, o servidor de PRODUÇÃO
 * (`npm run start`), e o `Repository` recusa TODA a
 * escrita em produção sem Supabase (`assertWritableInProd`,
 * `src/lib/repository.ts` — gravar para um ficheiro efémero seria perder dados
 * em silêncio no próximo deploy). Sem escrita não há pedido; sem pedido não há
 * cartão de cliente, não há estúdio, não há checklist, não há seletor de temas.
 *
 * O resultado era pior do que um vermelho: dez deles SALTAVAM com uma razão
 * plausível («Sem pedidos nesta instalação») e o passo ficava verde. Os outros
 * dois — os do `biblioteca-temas.spec.ts` — falhavam, mas dentro do passo
 * `continue-on-error` do CI, portanto ninguém via.
 *
 * ── A saída, que já existia neste repositório ─────────────────────────────
 * É a mesma das passkeys, dos fluxos de proposta e da ergonomia táctil, e está
 * escrita aqui outra vez em vez de mandar ler outro ficheiro: servidor de
 * DESENVOLVIMENTO próprio, onde o armazém em ficheiro é o comportamento
 * pretendido, e cada passeio CRIA os dados de que precisa (ver
 * `e2e/semear-pedido.ts`). A alternativa — deixá-los a saltar — é a armadilha
 * em que este projecto já caiu: uma suite verde que nunca exercitou nada.
 *
 * ── O que se perde, e porque se aceita ────────────────────────────────────
 * Deixa de se medir o BUILD de produção nestes seis ficheiros. O que eles
 * medem — a ordem dos pedidos ao abrir a biblioteca, a cópia de uma proposta,
 * o rascunho gravado no servidor, o alvo tocável da checklist, o editor com 50
 * linhas — são comportamentos da aplicação, não do empacotamento. O
 * `admin-smoke.spec.ts` e o `admin-views.spec.ts` continuam a passear o back
 * office contra o servidor de produção, que é onde a divisão de pacotes e os
 * chunks preguiçosos se provam.
 *
 * AS DUAS EXCEPÇÕES conhecidas estão documentadas onde doem, as duas no
 * passeio do recarregar offline em `carregamento-movel.spec.ts`:
 *
 *   1. precisa do service worker, e o que só existe em produção é o REGISTO
 *      dele — resolve-se registando o `public/sw.js` de verdade à mão;
 *   2. desde o Next 16.3.3, o `next dev` NÃO HIDRATA uma página devolvida pela
 *      cache do service worker sem rede (medido; `next start` hidrata, e o
 *      16.2.11 em dev também hidratava). Sem hidratação não corre `useEffect`
 *      nenhum, e a metade da promessa que dependia disso passou a ter guarda
 *      próprio contra o servidor de PRODUÇÃO:
 *      `e2e/o-ecra-volta-vivo-sem-rede.spec.ts`.
 *
 * Ver os comentários lá — trazem as medições.
 *
 * Porta própria, para poder correr ao lado das outras suites sem lhes tocar.
 */
const PORT = 3213;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Em série: todos mexem na MESMA lista de pedidos, e a criação está limitada
  // a 5 por minuto por IP (o tecto está certo — quem tem de semear menos são os
  // testes; ver `garantirPedido`).
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // Os 30 s por omissão são de um servidor já construído. Aqui o servidor é o
  // de DESENVOLVIMENTO e compila cada rota à PRIMEIRA visita — o estúdio de
  // propostas e a vista de carregamento são dos maiores pacotes do back office,
  // e cada contexto novo volta a descarregá-los sem minificar. Medido: o
  // primeiro passeio a abrir «Fazer proposta» gastava mais de 15 s só nisso.
  // Um tecto apertado aqui não mede rigor nenhum: transforma o custo de
  // compilar num vermelho que se lê como defeito do produto.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    // Entra uma vez; o resto da passagem herda a sessão. O porquê está no
    // `e2e/sessao-admin.setup.ts`.
    {
      name: "sessao",
      testMatch: ["**/sessao-admin.setup.ts"],
      use: { ...devices["Desktop Chrome"] },
    },
    // Paga a compilação das rotas pesadas uma vez, antes de tudo. A razão está
    // em `e2e/aquecer.setup.ts`; em duas palavras: `next dev` compila à
    // primeira visita, e um clique numa página ainda por hidratar não faz nada
    // e não deixa rasto.
    {
      name: "aquecer",
      testMatch: ["**/aquecer.setup.ts"],
      use: { ...devices["Desktop Chrome"], storageState: ESTADO_ADMIN },
      dependencies: ["sessao"],
    },
    {
      name: "chromium",
      testMatch: [
        "**/biblioteca-temas.spec.ts",
        "**/carregamento-movel.spec.ts",
        "**/fazer-proposta-cliente.spec.ts",
        "**/nav-estudio-marca.spec.ts",
        "**/painel-estudio-marca.spec.ts",
        "**/geometria-dos-alvos.spec.ts",
        "**/tarefas-acessibilidade.spec.ts",
        "**/proposta-rascunho.spec.ts",
        "**/temas.spec.ts",
        "**/guiao-do-dia.spec.ts",
        "**/caca/a02-editor-stress.spec.ts",
        // BO 4: semeia tarefas, uma marcação e dois pedidos «TESTE BO4».
        "**/bo4-procura-lotes-atalhos.spec.ts",
        "**/janelas-a-pedido.spec.ts",
      ],
      use: { ...devices["Desktop Chrome"], storageState: ESTADO_ADMIN },
      dependencies: ["aquecer"],
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      SESSION_SECRET: "e2e-dados-session-secret-not-for-production-use",
      // O mesmo hash de desenvolvimento que o CI já usa para a palavra-passe
      // pública "liquen2026" (ver ci.yml) — sem ele não há entrada no back
      // office e não há nada para medir.
      ADMIN_PASSWORD_HASH: "$2b$10$eSAkm9hz/JUpFYWRdPrA9.YJP.Gjry2IwVwgZa3hjvHcvV/r27n7u",
    },
  },
});
