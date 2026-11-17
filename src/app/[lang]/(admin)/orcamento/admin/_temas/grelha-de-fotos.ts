/**
 * As colunas da grelha de fotografias de um tema.
 * (Saiu do topo do `Temas.tsx` na fase 8 de `docs/ESTRUTURA-DO-CODIGO.md`,
 * tal e qual.)
 */

/**
 * AS COLUNAS DA GRELHA DE FOTOS DE UM TEMA — e porque são DUAS no telemóvel.
 *
 * Medido a 375 px (iPhone SE) com três colunas: cada célula ficava com
 * 97,7×97,7 px, e a 320 px com 79×79. Dentro dessa célula vivem TRÊS botões de
 * 28×28 — ampliar, mover para o início e remover — que onde não há rato estão
 * sempre visíveis (hoje `com-rato:opacity-0`; era um `@media (hover: none)`,
 * que deixava de fora o portátil com ecrã táctil), porque sem passar o rato
 * não há outra forma de lá chegar. Três alvos de 28 px, ou seja dois
 * terços do mínimo de 44, e o × que APAGA a foto é um deles.
 *
 * Pô-los nos 44 px que a casa exige (`.alvo-toque`) não cabia em 98 px: os
 * dois de baixo ficariam a 2 px um do outro e a foto desaparecia debaixo dos
 * botões. Por isso a grelha passa a duas colunas onde o telemóvel é estreito —
 * célula de 150,5 px a 375 e 123 px a 320, com 54 px e 27 px de folga entre os
 * botões de baixo — e volta às três colunas a partir de 26rem (416 px), que é
 * onde a célula (111 px) ainda as comporta.
 *
 * A biblioteca não fica mais curta de percorrer: são as mesmas fotos, maiores.
 * É a mesma decisão que o `COLUNAS` acima já tinha tomado para os cartões.
 *
 * O degrau seguinte passou de cinco colunas para quatro pela mesma conta, um
 * andar acima: num tablet de 640 px as cinco davam células de 105 px, e aí os
 * dois botões de baixo ficavam a 7 px um do outro — abaixo dos 8 px de
 * intervalo mínimo entre alvos. Com quatro são 133,5 px de célula e 37 px de
 * intervalo.
 *
 * ── E PORQUE É QUE OS DEGRAUS MEDEM O CONTENTOR, NÃO A JANELA ─────────────
 *
 * Toda a aritmética acima é sobre a largura da CÉLULA, e a célula não sabe o
 * tamanho do ecrã: sabe o tamanho da zona de largar onde vive. Os dois números
 * andaram juntos enquanto a navegação foi uma gaveta por cima da página — e
 * separaram-se exactamente em `lg`, que é onde ela deixa de ser gaveta e passa
 * a ser uma coluna `sticky` de 256 px em fluxo (`AdminClient.tsx`).
 *
 * A conta a 1024 px de janela: sobram 654 px para esta grelha — 1024 − 256 da
 * barra lateral − 80 do `lg:px-10` da vista − 34 da moldura e do `p-4` da zona
 * de largar. Seis colunas com `gap-2` davam células de 102,3 px, MENOS do que
 * os 111 px que o parágrafo acima fixa como o piso onde os três botões ainda
 * cabem. E num iPad Pro deitado — 1024 px de janela, e dedo — eram três alvos
 * de 44 px dentro de uma célula de 102. Era o caso do `MOBILE-AUDIT.md` («e
 * `sm:` não servia para o resolver») com a barra lateral no papel da gaveta.
 *
 * Por isso os degraus são `@container`: medem a zona de largar, que é o que
 * decide mesmo a célula. Cada limiar é a largura mínima a que aquele número de
 * colunas ainda dá os 111 px — `111·n + 8·(n−1)`, arredondado para cima ao rem
 * par seguinte:
 *
 *     colunas    mínimo    limiar
 *        3       349 px    22rem (352)
 *        4       468 px    30rem (480)
 *        5       587 px    38rem (608)
 *        6       706 px    46rem (736)
 *
 * A zona de largar mede 309 px a 375 de janela, 558 a 640, 654 a 1024 e 1070 a
 * 1440 — ou seja células de 150,5 px (2 colunas), 133,5 (4), 124,4 (5) e 171,7
 * (6). São as mesmas de hoje em todas as larguras onde hoje já estavam certas;
 * só o portátil a 1024 muda, e muda para cima.
 *
 * (O `md:grid-cols-5` que aqui vivia era a última infracção deste ficheiro ao
 * contrato dos cortes. Nunca tinha sido uma pergunta sobre a janela.)
 *
 * ══════════════════════════════════════════════════════════════════════════
 * FASE 07 — A ESCADA DE DEGRAUS PASSA A `auto-fill`, E O PISO DE 2 FICA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `docs/APPLE-TEMAS.md`, ponto 21: «grelha `repeat(auto-fill, minmax(180px,
 * 1fr))`, RÁCIO FIXO 4:3 com `object-fit: cover`, gap de 12».
 *
 * A escada de cinco degraus acima fazia o trabalho de um `auto-fill` à mão —
 * e fazia-o com um número diferente do do documento. `auto-fill` diz a mesma
 * coisa numa linha e nunca desafina: a célula não desce de 180 px, aconteça o
 * que acontecer à zona de largar, e não há degrau nenhum para alguém esquecer
 * de acertar quando a coluna do split view lhe tirar 272 px de largura.
 *
 * ── MAS O PISO DE DUAS COLUNAS NÃO SE DEITA FORA ──────────────────────────
 *
 * `minmax(180px, 1fr)` sozinho dá UMA coluna abaixo de 372 px de contentor —
 * ou seja, uma fotografia por linha nos 309 px que um telemóvel de 375 dá a
 * esta grelha. A decisão medida que este comentário conta (duas colunas, 150,5
 * px de célula, três alvos de 44 px lá dentro) não é uma preferência: é o que
 * torna a pasta percorrível ao dedo. Por isso o `auto-fill` só entra a partir
 * de 24rem (384 px), que é a primeira largura onde ele próprio já dá duas
 * (2 × 180 + 12 = 372); abaixo disso mandam as duas colunas de sempre.
 *
 * A tabela que sai daqui, com o `gap-3` do documento:
 *
 *     zona de largar   colunas   célula
 *     309 (janela 375)    2       148,5
 *     558 (janela 640)    2       273
 *     654 (janela 1024)   3       210
 *     798 (1440, split)   4       190,5
 *    1070 (janela 1440)   5       204,4
 *
 * Menos fotos por linha do que antes, e maiores — é o que 180 px de mínimo
 * quer dizer. O piso dos 111 px continua garantido por construção em toda a
 * gama do `auto-fill`, e à mão nos 240–384 px que sobram (a 240, 114 px).
 */
/**
 * ── O PISO DE ALTURA DA CÉLULA, E PORQUE É QUE O 4:3 O OBRIGOU ────────────
 *
 * A célula era `aspect-square`; a fase 07 do `docs/APPLE-TEMAS.md` põe-na a
 * 4:3. Uma célula 4:3 é 25% MAIS BAIXA do que a quadrada com a mesma largura —
 * e a altura desta célula não é decoração: dentro dela vivem TRÊS alvos de
 * 44 px, um encostado ao topo (o `×`, que APAGA a foto) e dois encostados ao
 * fundo.
 *
 * A conta do que eles precisam, de cima para baixo:
 *
 *     4 (top-1) + 44 + 8 (intervalo mínimo entre alvos) + 44 + 4 (bottom-1)
 *   = 104 px
 *
 * MEDIDO com a grelha nova, à altura de cada janela:
 *
 *     janela   célula          folga entre o alvo de cima e o de baixo
 *      320     121,0 × 90,8    −5,2 px   ← SOBREPOSTOS
 *      375     148,5 × 111,4   +15,4 px
 *      390     156,0 × 117,0   +21,0 px
 *     1024     185,0 × 138,8   +42,8 px
 *     1440     190,5 × 142,9   +46,9 px
 *
 * A 320 px o `×` e o `↑` sobrepunham-se em 5 px, e quem ganha um toque na
 * zona sobreposta é o que vem depois no DOM — o `×`. Ou seja: o dedo ia a
 * «mover para o início» e apagava a fotografia.
 *
 * O piso corrige isso e não desfaz o 4:3: a partir de 138,7 px de célula (que
 * é toda a gama de 375 para cima) o rácio é exactamente 4:3 e este mínimo
 * nunca chega a pegar. Só nos últimos ~55 px antes dos 320 é que a célula fica
 * um pouco mais alta do que 4:3 — e a alternativa ali era dois alvos por cima
 * um do outro. «Onde este documento e a acessibilidade discordarem, ganha a
 * acessibilidade» (`docs/DESIGN-SYSTEM.md`, Parte −1, ponto 5).
 */
export const PISO_DA_CELULA_PX = 104;

export const GRELHA_DE_FOTOS =
  "grid grid-cols-2 gap-3 @min-[24rem]:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]";
