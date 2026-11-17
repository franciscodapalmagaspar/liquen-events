/** Os números que afinam o comportamento do estúdio, cada um com a sua razão. */

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O painel «O que vai sair» aparece a partir daqui.
 *
 * A PERGUNTA MUDOU: NÃO É QUE LARGURA TEM A JANELA, É QUE LARGURA TEM A FILA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto era `(min-width: CORTES.largo)` — uma consulta à JANELA. A regra que
 * aqui estava escrita continua de pé, e é a que evita o defeito que já custou
 * uma vez (a miniatura da página e o painel a aparecerem os DOIS entre 1440 e
 * 1535): há UM número só, e um só sítio a respondê-lo — aqui, com o
 * `PainelDoEstudio` a receber a resposta em vez de a repetir. O número estava
 * certo; a PERGUNTA é que estava errada.
 *
 * Palavras dela, com uma captura do estúdio: «isto no back office está tudo com
 * bugs e todo desformatado».
 *
 * MEDIDO num Chromium, no painel que abre a partir do cartão de um cliente —
 * que é por onde ela lá chega:
 *
 *     janela 1366   a coluna onde ela escreve tem 368 px   legível
 *     janela 1440   a coluna onde ela escreve tem  82 px   ← alargar PIOROU
 *     janela 1600   ...............................136 px
 *     janela 2000   ...............................136 px
 *
 * A conta: o painel de detalhe tem um tecto próprio (`max-w-3xl`) que corta a
 * fila a 712 px, por mais largo que seja o ecrã. As duas colunas laterais são
 * `shrink-0` e pedem, sem negociar, 192 + 24 + 336 + 24 = 576. Sobram 136 para
 * a coluna onde se escreve — e o `min-w-0` dela, que existe para um filho longo
 * não rebentar a caixa, deixa-a descer até lá sem se queixar.
 *
 * A 1440 é ainda pior (82 px) porque é exactamente aí que o painel entra: a
 * janela cresce 74 px e a coluna perde 286.
 *
 * ── O NÚMERO, E DE ONDE VEM ───────────────────────────────────────────────
 *
 * A fila precisa de caber as duas colunas que não encolhem (192 + 336), as
 * duas folgas (24 + 24) e uma coluna de escrita que se leia. O `@min-[26rem]`
 * é o degrau que as grelhas desta coluna usam para passarem a duas colunas —
 * portanto 26rem (416 px) é a largura abaixo da qual ela deixa de fazer o que
 * foi desenhada para fazer. 576 + 416 = 992.
 *
 * Abaixo disso o painel não se monta, e a coluna de escrita fica com a fila
 * inteira. É a mesma decisão de sempre — «quando o painel é desenhado é porque
 * cabe» — mas agora medida onde ele aterra.
 */
export const LARGURA_MINIMA_DA_FILA = 992;
/** Abaixo disto (a caixa do estúdio, não a janela) a barra do envio fica
 *  compacta — uma linha, e o resto numa folha. 40rem, a mesma medida que a
 *  barra já usa para deixar de ocupar a largura toda. */
export const LARGURA_DA_BARRA_INTEIRA = 640;

/**
 * Fotos a preparar/enviar ao mesmo tempo num carregamento. Quatro é o mesmo
 * número que a Biblioteca de Temas usa: chega para a rede nunca ficar parada à
 * espera do processador (nem o contrário) sem encher a ligação da Catarina, que
 * é a mesma por onde ela está a trabalhar.
 */
export const UPLOAD_CONCURRENCY = 4;

/**
 * Quantos passos atrás o Cmd+Z consegue ir.
 *
 * Cada passo é um documento inteiro em memória. Cinquenta chegam de sobra
 * para desfazer um engano — ninguém carrega em Cmd+Z cinquenta vezes seguidas
 * — e mantêm a conta de memória modesta mesmo numa proposta com muitos mood
 * boards (os documentos guardam caminhos de fotos, não bytes).
 */
export const MAX_HISTORICO = 50;

/**
 * Quanto tempo a pergunta do envio tem de estar à vista antes de o «Confirmar»
 * aceitar um clique. Um duplo clique são ~120 ms entre os dois; 400 ms tira o
 * segundo de lá com folga e é menos do que alguém demora a ler a frase.
 */
export const CONFIRMAR_ENVIO_APOS_MS = 400;
