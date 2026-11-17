"use client";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FILA DAS FOTOGRAFIAS PESADAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma célula sem miniatura puxa o ORIGINAL. Medido no estúdio de propostas, num
 * telemóvel a 1,6 Mbps com 24 células: **24 originais pedidos ao mesmo tempo,
 * 1099 KB cada, e a grelha que está no ecrã só completa aos 67,6 s**. Não é que
 * sejam lentas uma a uma: é que são vinte e quatro a repartir o mesmo canal, e
 * por isso acabam TODAS no fim em vez de acabarem umas primeiro. Com a fila, os
 * mesmos ficheiros: 13,3 MB em vez de 26,4, e a grelha visível aos 49,4 s.
 *
 * O `loading="lazy"` não trava nada disto: está medido na Biblioteca de Temas
 * que o navegador pediu as 60 na mesma. Quem trava é isto — deixa passar
 * `LIMITE_DE_PESADAS` de cada vez, pela ordem em que as células pedem vez, que é
 * a ordem da grelha e portanto a ordem por que ela olha.
 *
 * ── PORQUE É QUE VIVE FORA DO REACT ───────────────────────────────────────
 * O canal também é um só. Duas grelhas abertas ao mesmo tempo não têm o dobro
 * da linha, e um estado por componente daria a cada uma o seu tecto. Aqui é
 * módulo, e portanto é um tecto para o separador inteiro.
 *
 * ── DE ONDE VEIO ──────────────────────────────────────────────────────────
 * Do `Temas.tsx`/`ThemePicker.tsx`, onde este desenho está provado (a primeira
 * foto da Biblioteca passou de 26 s para 1,4 s). Sai para um ficheiro próprio
 * porque o estúdio de propostas precisava exactamente do mesmo, e uma terceira
 * cópia seria a terceira oportunidade de só uma delas ser corrigida.
 */

/**
 * Quantos originais em voo ao mesmo tempo.
 *
 * Três, o mesmo número da Biblioteca: com um só, uma foto encravada para a
 * grelha toda; com muitos, volta-se ao problema de repartir o canal. Três dá
 * margem de erro e continua a acabar a primeira depressa.
 */
const LIMITE_DE_PESADAS = 3;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O RELÓGIO CONTA O DOWNLOAD. NUNCA CONTA A ESPERA.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Se um download ficar pendurado — nem carrega nem falha, que é o que uma rede
 * móvel a cair faz — a vaga tem de voltar à fila; uma foto encravada não pode
 * fechar a grelha toda. Mas uma célula que ainda NEM COMEÇOU a descarregar não
 * está encravada: está à espera da vez, e o relógio dela não pode andar.
 *
 * Por isso o temporizador é armado aqui dentro, no instante em que a vaga é
 * CONCEDIDA (ver `despachar`), e não no instante em que a célula a pede. Estava
 * do lado do componente, montado num `useEffect` à volta do pedido, e essa é
 * exactamente a forma de o confundir: bastava alguém mover o `setTimeout` para
 * fora do arranque para o tecto passar a expirar em cima de quem nunca chegou a
 * gastar um byte. A invariante é da fila; passa a viver na fila, e há um caso a
 * fixá-la.
 *
 * ── PORQUE É QUE 30 s ERA CURTO DE MAIS ──────────────────────────────────
 *
 * A aritmética, com os números que este ficheiro já mede: 1,6 Mbps são
 * 200 KB/s. Um original pesa 1099 KB.
 *
 *   · três a repartir o canal  →  66,7 KB/s cada  →  **16,5 s** por foto;
 *   · vinte e quatro (sem fila) →  8,3 KB/s cada  →  **34,0 s**, que é o número
 *     medido lá em cima para a primeira fotografia.
 *
 * Ou seja: o tecto antigo cortava ABAIXO de um download que o próprio ficheiro
 * media em 34 s. Um limite mais curto do que o pior caso medido não trava
 * pedidos pendurados — larga vagas a downloads sãos, e o quarto arranca por
 * cima do terceiro que ainda vai a meio. O tecto de três vira quatro, cinco,
 * seis, e a fila deixa de valer o que vale.
 *
 * 60 s: o dobro dos 33,3 s que os mesmos 1099 KB custam numa rede a METADE da
 * velocidade medida (0,8 Mbps, três a repartir), e continua a devolver dentro
 * de um minuto a vaga de um pedido que ficou mesmo pendurado.
 */
export const ESPERA_MAXIMA_MS = 60_000;

interface Vez {
  arrancar: () => void;
  arrancou: boolean;
  largada: boolean;
  /** Armado na CONCESSÃO da vaga, nunca no pedido. Ver acima. */
  relogio: ReturnType<typeof setTimeout> | null;
}

const aEsperar: Vez[] = [];
/** As que estão mesmo a descarregar. Um conjunto e não um contador: é dele que
 *  sai o `size` (nunca pode ficar negativo) e são deles os relógios a desarmar. */
const emVoo = new Set<Vez>();

function largarVez(vez: Vez): void {
  if (vez.largada) return;
  vez.largada = true;
  if (vez.relogio !== null) {
    clearTimeout(vez.relogio);
    vez.relogio = null;
  }
  if (vez.arrancou) {
    emVoo.delete(vez);
    despachar();
    return;
  }
  const i = aEsperar.indexOf(vez);
  if (i >= 0) aEsperar.splice(i, 1);
}

function despachar() {
  while (emVoo.size < LIMITE_DE_PESADAS && aEsperar.length > 0) {
    const vez = aEsperar.shift();
    if (!vez || vez.largada) continue;
    vez.arrancou = true;
    emVoo.add(vez);
    // O relógio arranca AQUI, e é este o ponto inteiro deste módulo: a partir
    // de agora conta tempo de DOWNLOAD. Antes disto a célula estava em fila, e
    // estar em fila não é estar a falhar.
    vez.relogio = setTimeout(() => largarVez(vez), ESPERA_MAXIMA_MS);
    vez.arrancar();
  }
}

/**
 * Pede vez para descarregar um original. Devolve a função de LARGAR a vez —
 * serve para os dois casos (acabou / desistiu) e é idempotente, porque a
 * desmontagem de uma célula e o `onLoad` da sua imagem chegam os dois.
 */
export function pedirVezDeImagemPesada(arrancar: () => void): () => void {
  const vez: Vez = { arrancar, arrancou: false, largada: false, relogio: null };
  aEsperar.push(vez);
  despachar();
  return () => largarVez(vez);
}

/** Só para os testes: a fila é de módulo e sobrevive entre casos. */
export function limparFilaDeImagens(): void {
  for (const vez of emVoo) if (vez.relogio !== null) clearTimeout(vez.relogio);
  aEsperar.length = 0;
  emVoo.clear();
}
