/**
 * As classes que se repetem pelos passos do estúdio, num sítio só — tal e qual
 * estavam no `ProposalStudio.tsx` (fase 2 de `docs/ESTRUTURA-DO-CODIGO.md`).
 */

export const INPUT_SM = "bo-input min-w-0 px-3 py-2 text-xs text-[var(--bo-text)]";

export const ADD_BTN =
  "alvo-toque !justify-start gap-1 text-xs font-medium text-sage-600 hover:text-[var(--bo-accent-hover)] inline-flex items-center";

export const REMOVE_BTN =
  "alvo-toque text-foreground/30 hover:text-[var(--bo-perigo)] text-base leading-none shrink-0";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM AVISO QUE NÃO PODE SER CORTADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «"9 fotos numa página: cada uma fica peque…" — cortado à
 * direita, no editor de mood boards, por cima da grelha de fotos dessa página».
 *
 * ── Porque é que um parágrafo que quebra saía cortado ─────────────────────
 *
 * Porque `white-space` e `text-overflow` HERDAM-SE. Um `truncate` em qualquer
 * antepassado deste parágrafo — e o cartão de um board tem cabeçalhos, tiras e
 * linhas de resumo que o usam — desce até aqui como `white-space: nowrap` mais
 * `text-overflow: ellipsis`, e o `overflow: hidden` desse antepassado faz o
 * resto. O parágrafo não precisa de ter classe nenhuma para sair com «…»: basta
 * estar debaixo de alguém que a tenha.
 *
 * Por isso a defesa é aqui e é explícita: este parágrafo declara que quebra,
 * seja o que for que lhe esteja por cima. `whitespace-normal` corta a herança
 * do `nowrap`, e o `overflow-wrap: anywhere` garante que uma palavra comprida
 * também não empurra a linha para fora.
 *
 * ── E porque é que é uma constante ────────────────────────────────────────
 *
 * Porque são dois avisos irmãos — «a página está a ficar cheia» e «estas não
 * são impressas» — e o segundo é o mais grave dos dois. Corrigir um e deixar o
 * outro à mercê do mesmo antepassado era resolver metade do problema no sítio
 * onde ele importa menos.
 */
export const AVISO_DO_BOARD =
  // Sem cor: os dois avisos têm cores diferentes, e duas classes `text-*` na
  // mesma string não se resolvem pela ordem em que estão escritas — quem ganha
  // é a que aparece depois na FOLHA DE ESTILO. O aviso vermelho podia sair
  // cinzento sem ninguém perceber porquê.
  "mb-2 text-xs leading-relaxed whitespace-normal [overflow-wrap:anywhere]";

/**
 * O título do mood board (e a sua caixa inglesa) no cabeçalho do cartão: ao
 * lado da pega, da dobra, do cadeado e do «⋯» quando o cartão tem largura
 * para isso; numa linha só sua, por baixo deles, quando não tem.
 */
export const TITULO_DO_BOARD =
  "order-last basis-full min-w-0 @min-[28rem]:order-none @min-[28rem]:basis-0 @min-[28rem]:min-w-[12rem] flex-1";

/** Uma das três portas do começo da Inspiração (Fase 3). */
export const PORTA_DE_COMECO =
  "alvo-toque flex h-full w-full flex-col items-start rounded-2xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-surface)] px-4 py-3.5 text-left hover:border-sage-600/50 hover:bg-[var(--bo-tinta-3)]";
