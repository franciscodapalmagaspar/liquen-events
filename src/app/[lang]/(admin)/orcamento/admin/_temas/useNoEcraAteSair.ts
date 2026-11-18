"use client";

import { useState } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE SAI NÃO MUDA DE CONTEÚDO A MEIO DA SAÍDA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Três caixas desta vista fechavam A SECO porque quem as desmontava era ESTE
 * ficheiro: a folha de fundir temas, a de copiar fotos e o visualizador. As
 * três já sabem sair (as duas primeiras pelo `FolhaOuDialogo`, a terceira pela
 * `.bo-saida`); o que faltava era alguém segurá-las montadas os 200 ms — e esse
 * alguém é quem tem o estado, ou seja aqui.
 *
 * O `useSaidaDeUmSo` dá o «ainda está a sair». O que ele não resolve é este
 * outro problema, que só aparece quando o pai desmonta: **os dados de que a
 * caixa vive desaparecem no mesmo instante em que ela fecha.** O `aFundir` cai
 * para `null`, a seleção de fotos esvazia-se quando as fotos mudam de tema, o
 * `zoomAt` deixa de ser um índice. Sem isto, o que ficava a apagar-se durante
 * 200 ms era uma folha a dizer «0 fotos selecionadas» — ou um erro, porque a
 * caixa precisa de um tema que já não existe.
 *
 * Então guarda-se o último valor que esteve ABERTO e é esse que se desenha
 * enquanto sai. Devolve `null` quando não há nada para desenhar — fechado E sem
 * saída a correr —, que é o que apaga a caixa da árvore no fim.
 *
 * ── EM ESTADO, AJUSTADO NO DESENHO, E NÃO NUMA REFERÊNCIA ─────────────────
 *
 * A primeira versão disto era um `useRef` escrito durante o desenho. É o mesmo
 * defeito que a `react-hooks/refs` recusa, e recusa com razão: um valor lido no
 * desenho a partir de uma referência é um valor que o React não sabe que
 * existe — não re-desenha por causa dele, e no modo estrito (dois desenhos por
 * commit) a referência já foi escrita uma vez quando a segunda leitura
 * acontece. Ajustar ESTADO durante o desenho é o padrão que o React documenta
 * para reagir a uma prop, e re-desenha sem pintar nada pelo meio.
 *
 * ── E POR ISSO O `valor` TEM DE SER ESTÁVEL ENTRE DESENHOS ────────────────
 *
 * A comparação é por identidade. Um objecto literal montado na chamada
 * (`{origem: aFundir, temas: themes}`) é novo a cada desenho, e isto passava a
 * chamar `setUltimo` para sempre — um ciclo. Quem chama passa portanto valores
 * que já são estáveis: um item de estado, um array de estado, ou um `useMemo`.
 * São duas chamadas quando são dois valores, e não uma com um objecto à volta.
 */
export function useNoEcraAteSair<T>(aberto: boolean, aSair: boolean, valor: T | null): T | null {
  const [ultimo, setUltimo] = useState<T | null>(null);
  if (aberto && valor !== ultimo) setUltimo(valor);
  if (aberto) return valor;
  return aSair ? ultimo : null;
}
