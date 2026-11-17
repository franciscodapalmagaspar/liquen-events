/**
 * A pele da lista de pedidos: as classes dos filtros e a entrada do lote que
 * o «Mostrar mais» acrescenta. (Saíram do `AdminClient.tsx` na fase 7 de
 * `docs/ESTRUTURA-DO-CODIGO.md`, tal e qual. Os números — quantos se desenham
 * de cada vez, quantos se arquivam sem perguntar — são política, não pele, e
 * vivem em `lib/orcamento/pedidos/lotes-da-lista.ts`.)
 */

/**
 * A pele dos seis filtros da lista de pedidos, escrita UMA vez.
 *
 * Era a mesma cadeia copiada seis vezes, e seis cópias de uma pele são seis
 * sítios onde ela se afasta — foi exactamente isso que aconteceu com as
 * alturas da barra de baixo. A `Escolha` leva `variante="nua"` porque a caixa
 * é esta, e não a do formulário.
 */
export const FILTRO_CLASSES =
  "bg-[var(--bo-surface)] border border-[var(--bo-hairline)] rounded-xl px-3 py-2.5 " +
  "text-xs text-[var(--bo-tinta-72)] focus:outline-none focus:border-foreground/25 " +
  // ── NA GRELHA DO TELEMÓVEL, O FILTRO ENCOLHE À CÉLULA ──────────────────────
  // No dedo a `Escolha` é um `<select>` a 16 px, e «Todas as categorias» mais a
  // reserva da seta pedia 207 px numa célula de ~171: a página inteira passava
  // a deslizar 8–16 px para o lado (auditoria do telemóvel, 14/11). O `min-w-0`
  // deixa-o encolher e o texto corta-se dentro do campo; no computador (`lg:`)
  // os filtros são uma fila que embrulha, e cada um volta à largura dele.
  "min-w-0 max-lg:w-full";
/** A caixa da `Escolha` à volta de cada filtro: é ELA que ocupa a célula da
 *  grelha, portanto é ela que tem de poder encolher (ver `FILTRO_CLASSES`). */
export const FILTRO_CAIXA = "min-w-0 max-lg:w-full";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * O LOTE QUE O «MOSTRAR MAIS» ACRESCENTA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * O botão fica onde estava e as linhas novas montavam-se sem gesto nenhum: a
 * única pista de que alguma coisa tinha acontecido era a barra de rolagem a
 * encolher. Carregar num botão e não ver nada acontecer é o defeito que faz
 * carregar segunda vez.
 *
 * ── SÓ O LOTE NOVO, E TODO ELE AO MESMO TEMPO ─────────────────────────────
 *
 * A lista que já lá estava NÃO se reanima — reanimá-la era dizer que também
 * ela acabou de chegar, e é mentira. E o lote novo entra como UM bloco, sem
 * escada: a regra da casa é escada por bloco e nunca por linha, e cinquenta
 * linhas escalonadas seriam exactamente a segunda coisa.
 *
 * ── PORQUE É QUE ISTO É UM `:has()` E NÃO UMA CLASSE NA LINHA ─────────────
 *
 * Porque a linha não é minha. Quem desenha o `<tr>` do computador e o `<li>`
 * do telemóvel é o `ui/TabelaOuCartoes.tsx`, e ele não aceita classe por
 * linha — o que eu escrevo são as CÉLULAS (`COLUNAS_DE_PEDIDOS`) e o CARTÃO
 * (`QuoteCard`). Animar célula a célula dava sete animações por linha e
 * deixava de fora o fio que separa as linhas, que é do `<tr>`/`<li>`:
 * viam-se os fios a aparecer a seco e o conteúdo a acender por dentro deles.
 *
 * Com `:has()` a marca vai onde eu chego (uma célula, o cartão) e a animação
 * vai onde ela pertence (a linha inteira, fio incluído). Uma marca por linha,
 * dois selectores, e o `TabelaOuCartoes` não precisa de saber que isto existe.
 *
 * ── E ISTO NÃO CONTRADIZ O «POR BLOCO, NUNCA POR LINHA» DA PRIMITIVA ──────
 *
 * O `ui/TabelaOuCartoes.tsx` tem hoje a sua própria entrada e uma regra
 * escrita: a classe entra no `<tbody>`/`<ul>`, uma vez, e NUNCA na linha —
 * porque cinquenta linhas a chegar UMA A UMA são a lentidão que o tecto do
 * sexto degrau existe para evitar. É a regra da ESCADA, e aqui não há escada
 * nenhuma: o lote inteiro parte no mesmo fotograma e lê-se como um bloco só.
 * O que se recusa é o desfasamento, não o número de nós que se movem.
 *
 * E as duas entradas nunca correm juntas, porque respondem a coisas
 * diferentes: a da primitiva dispara quando é a MESMA gente noutra ordem
 * (reordenar), e cala-se de propósito quando é OUTRA gente — que é o caso de
 * quem escreve na procura, e também o de acrescentar um lote. É precisamente
 * o buraco que esta deixa: de dentro, a primitiva não distingue «filtrou» de
 * «carregou no Mostrar mais»; de fora, quem carregou no botão sabe.
 *
 * ── E VÊM DE BAIXO, QUE É DE ONDE VÊM MESMO ──────────────────────────────
 *
 * O bloco da lista põe `--bo-entrada-y: 4px` (positivo), e a `@keyframes
 * bo-entrada` lê essa variável: o lote sobe para o lugar em vez de descer. É a
 * distância de omissão da casa, com o sinal trocado — «o movimento indica
 * direcção e origem», e a origem destas linhas é o fim da lista.
 *
 * ── E OS NÚMEROS SÃO OS DA CASA, ESCRITOS À MÃO CONTRA VONTADE ────────────
 *
 * `240ms cubic-bezier(0, 0, 0.2, 1)` é, letra por letra, a `.bo-entrada` do
 * `globals.css`. Repeti-los aqui não é uma escolha: uma variante do Tailwind
 * (aqui, um `[&…]:`) só sabe prefixar UTILITÁRIOS, e `bo-entrada` é uma classe
 * escrita à mão — `[&_tr:has(…)]:bo-entrada` não compila. Ou se declarava um
 * `--animate-*` no `@theme`, que é do `tema.css` e não é meu, ou se escreve o
 * atalho aqui. Fica escrito aqui, e o `entrada-do-painel-do-pedido.test.ts`
 * prende esta linha à regra do `globals.css`: afinar um dos lados põe o outro
 * vermelho.
 *
 * `motion-safe:` porque a guarda da `.bo-entrada` mora dentro da própria
 * classe e este atalho não a herda — sem isto animava para quem pediu para não
 * animar.
 */
export const ENTRADA_DO_LOTE =
  "motion-safe:[&_li:has([data-lote-novo])]:animate-[bo-entrada_240ms_cubic-bezier(0,0,0.2,1)] " +
  "motion-safe:[&_tr:has([data-lote-novo])]:animate-[bo-entrada_240ms_cubic-bezier(0,0,0.2,1)]";
