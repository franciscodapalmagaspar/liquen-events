/**
 * A letra miúda do site, para quem a escreve em `style` (17/11).
 *
 * O token é `--text-miuda`, no `tema.css` (12 px, o chão das páginas
 * públicas). Nas classes usa-se `text-miuda`; no CSS, `var(--text-miuda)`.
 *
 * Esta constante é para os dois sítios que desenham em `style` porque podem
 * aparecer SEM a folha do site: o `AvisoLegal` (que também entra no
 * `global-error`) e o próprio `global-error`. Aí a variável não existe, e vale
 * o valor de reserva — que é o mesmo do token, e um teste
 * (`letra-minima-do-site.contrato.test.ts`) prende os dois um ao outro.
 */
export const LETRA_MIUDA = "var(--text-miuda, 0.75rem)";
