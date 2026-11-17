/**
 * Corre no browser ANTES de qualquer módulo da aplicação (ver
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
 * instrumentation-client.md`). Fica pequeno de propósito: entra em todas as
 * páginas, as públicas incluídas.
 *
 * ── O `eval` QUE A CSP RECUSAVA NO BACK OFFICE ──────────────────────────────
 *
 * Os registos da Vercel (7 dias até 17/11) contavam 81 relatórios iguais,
 * todos de `/orcamento/admin` (Visão Geral, Pedidos, Pagamentos, «Fazer
 * proposta»…):
 *
 *     violatedDirective: script-src     blockedUri: eval
 *
 * Quem o pede é o Zod 4, que chega ao browser pelo back office
 * (`EmailTemplatesBilingue` → `email-template-vars` → `validation`). Ao criar o
 * primeiro `z.object()`, o Zod sonda se pode compilar um analisador rápido com
 * `new Function("")`, dentro de um `try`. A CSP de produção não tem
 * `'unsafe-eval'` e recusa — o `try` apanha o erro, o Zod segue pelo caminho
 * normal e nada se parte —, mas o browser manda à mesma um relatório a
 * `/api/security/csp-report`. Ou seja: uma chamada paga ao servidor, e um
 * registo que esconde os bloqueios verdadeiros, por cada abertura do back
 * office.
 *
 * A saída não é abrir `'unsafe-eval'`: é dizer ao Zod que não compile
 * (`jitless`). Com isso ele nem chega a sondar — a própria biblioteca escreve,
 * em `zod/v4/core/util.js`, que salta a sonda «under `jitless`: strict CSPs
 * report the caught `new Function`». É o modo em que já estava a correr, na
 * prática, porque a sonda falhava sempre.
 *
 * Porquê aqui e não num `z.config({ jitless: true })` ao lado dos esquemas: a
 * decisão do Zod fica tomada no PRIMEIRO `z.object()` que o browser avalia, e
 * qualquer módulo novo que importe o Zod podia chegar antes. Este ficheiro corre
 * antes de todos.
 *
 * E porquê sem `import "zod"`: isso punha a biblioteca inteira em todas as
 * páginas do site, que não a usam. A configuração global do Zod vive em
 * `globalThis.__zod_globalConfig` (o Zod reaproveita o objecto se já existir);
 * escrevê-la aqui custa zero bytes de Zod. O contrato está preso por
 * `src/instrumentation-client.test.ts`: se uma versão do Zod mudar o sítio, o
 * teste falha antes de os relatórios voltarem.
 *
 * No servidor isto não corre, e o Zod continua a compilar: lá não há CSP.
 */
type ConfiguracaoDoZod = { jitless?: boolean };
const ambiente = globalThis as typeof globalThis & { __zod_globalConfig?: ConfiguracaoDoZod };
(ambiente.__zod_globalConfig ??= {}).jitless = true;

export {};
