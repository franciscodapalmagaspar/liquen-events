/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS MEDIDAS DA DERIVADA DE 1200 px, NUM SÍTIO SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A mesma fotografia pode ser fabricada por DOIS caminhos:
 *
 *   · no navegador, quando ela a carrega no estúdio (`image-worker.ts`) — do
 *     mesmo canvas que já fez a miniatura, portanto de graça;
 *   · no servidor, pelo lote das derivadas ou à primeira visita
 *     (`lib/derivadas.ts`), com um download, um `sharp` e um upload.
 *
 * Os dois têm de produzir a MESMA imagem. Com os números escritos duas vezes,
 * a mesma fotografia sai diferente conforme o caminho por onde foi feita — e
 * ninguém repara, porque as duas versões são plausíveis vistas à parte.
 *
 * Este ficheiro não importa nada: é lido pelo trabalhador do browser (que não
 * pode ver DOM nem `sharp`) e pelo servidor, e é por isso que só tem números.
 *
 * ── Porque 1200 e porque 80 ──────────────────────────────────────────────
 *
 * 1200 px porque cobre os dois casos que interessam sem servir o original: um
 * telemóvel de 390 pontos com três pixéis por ponto pede ~1030, e um
 * computador com ecrã de retina em três colunas pede ~680. O original
 * (2200 px, ~2,6 MB) fica para a lupa, que é o único sítio onde os pixéis
 * todos valem os bytes.
 *
 * Qualidade 80 e não 78: esta é a que o casal vê em grande no telemóvel, e os
 * dois pontos custam ~15 KB numa imagem que já pesa 200.
 */

/** O lado maior, em pixels. */
export const MEDIA_LADO = 1200;

/** A qualidade, de 0 a 100. No browser lê-se como 0,80 — ver `MID_QUALITY`. */
export const MEDIA_QUALIDADE = 80;

/**
 * ── E A MINIATURA DE 400 px ──────────────────────────────────────────────
 *
 * O lado e a qualidade da MINIATURA, lidos pelo lote das derivadas e pela
 * geração a pedido (`lib/derivadas.ts`) e pela rota que gera as miniaturas
 * em falta de UM tema (`/api/temas/[id]/miniaturas`). Essa rota tinha os
 * seus próprios números (400 e q72) e o lote q78: a mesma fotografia saía
 * com duas qualidades conforme o botão por onde a miniatura foi feita. Vive
 * aqui, e não no `derivadas.ts`, pela razão do topo deste ficheiro: só
 * números, sem `sharp` nem Storage atrás — a rota importa a constante e não
 * o módulo inteiro do lote.
 *
 * O `scripts/derivadas-em-falta.mjs` não consegue importar TypeScript e
 * repete o 400/78 à mão, com a origem escrita ao lado.
 */
export const MINIATURA = { lado: 400, qualidade: 78 } as const;

/**
 * O lado maior da AVIF grande da capa da proposta online (`derivadas.ts`,
 * `fabricarCapaWebEmAvif`). Aqui, e não lá, para a página saber a largura real
 * dela sem importar o `sharp` (`proposta-web/modelo.ts`).
 */
export const CAPA_WEB_LADO = 2000;
