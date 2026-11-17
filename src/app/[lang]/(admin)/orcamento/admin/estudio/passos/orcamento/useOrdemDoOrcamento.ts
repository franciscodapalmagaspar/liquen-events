"use client";
import { useToast } from "../../../Toast";
import { ordemDeSaida, eAOrdemEscrita, aplicarOrdem, ORDEM_EXPLICITA } from "@/lib/proposal-ordem";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { adicionarLinha, linhasDe } from "@/lib/proposal-budget";
import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import { useDocumentoDoEstudio } from "../../documento/useDocumentoDoEstudio";
import { useContasDoOrcamento } from "./useContasDoOrcamento";

export interface EntradaOrdemDoOrcamento {
  contas: ReturnType<typeof useContasDoOrcamento>;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  ordemDosBoards: number[];
  toast: ReturnType<typeof useToast>["toast"];
}

export function useOrdemDoOrcamento({
  contas,
  documento,
  ordemDosBoards,
  toast,
}: EntradaOrdemDoOrcamento) {
  const { ordemDoOrcamento } = contas;
  const { setDoc } = documento;

  /** Alguma das duas listas sai por ordem diferente da que está escrita? */
  const ordemSugerida = !eAOrdemEscrita(ordemDoOrcamento) || !eAOrdemEscrita(ordemDosBoards);

  /**
   * Fixa no documento a ordem que está a ser mostrada.
   *
   * Escreve os arrays já ordenados e acende `ordemExplicita` — a partir daí a
   * sugestão cala-se e a ordem escrita vale sozinha, aqui e no PDF. É o que
   * torna o arrasto possível: enquanto a sugestão mandasse, arrastar um board
   * era pô-lo num sítio e vê-lo voltar na página seguinte.
   *
   * Os preços, os custos, as escalas e as marcas de extra são arrays PARALELOS
   * às linhas — viajam todos com a mesma permutação ou o orçamento trocava os
   * preços de sítio, que é um erro que só se vê quando o cliente pergunta.
   *
   * ── PORQUE É QUE A LISTA NÃO SE ESCREVE AQUI À MÃO ────────────────────────
   * Escrevia-se, e faltava-lhe um: o `budgetOpcional`. A marca de «extra»
   * ficava para trás na permutação, portanto «Arrumar eu» deixava-a na rubrica
   * errada — o PDF imprimia «extra» ao lado da linha que não era, e a versão
   * sem extras ficava cem euros ao lado da verdade. Uma segunda lista dos
   * arrays paralelos é uma lista que se esquece do array seguinte.
   *
   * A lista verdadeira é a de `proposal-budget` (o `PARALELOS` que o
   * `adicionarLinha`/`removerLinha` usam). Não é exportada, mas o TIPO dela é
   * alcançável pela assinatura do `adicionarLinha` — e com o `satisfies` lá em
   * baixo a exigir que estejam cá todas, esquecer uma passa a ser erro de
   * compilação em vez de um extra na linha errada.
   */
  type ArrayParaleloDaLinha = Omit<Parameters<typeof adicionarLinha>[0], "budgetItems">;

  function arrumadoEExplicito(d: StudioDoc): StudioDoc {
    const linhas = linhasDe(d);
    const ordemL = ordemDeSaida(d as ProposalDoc, linhas, (l) => l.item ?? "");
    const ordemB = ordemDeSaida(d as ProposalDoc, d.moodBoards, (b) => b.title ?? "");
    const paralelo = <T>(arr: T[] | undefined) =>
      arr === undefined ? undefined : aplicarOrdem(arr, ordemL);
    // `satisfies` e não uma anotação de tipo: exige que estejam cá TODAS as
    // chaves paralelas, sem trocar o tipo exacto de cada array por um tipo
    // comum — que era o que faria o spread lá em baixo deixar de casar.
    const paralelos = {
      budgetAmounts: paralelo(d.budgetAmounts),
      budgetCosts: paralelo(d.budgetCosts),
      budgetScales: paralelo(d.budgetScales),
      budgetOpcional: paralelo(d.budgetOpcional),
      // A rubrica em inglês vai com a rubrica. Sem esta linha, «Alinhar pelos
      // Serviços» punha a tradução da Cerimónia na linha do Cocktail — e o PDF
      // inglês saía com a rubrica errada, sem nada a assinalá-lo. Foi o
      // `satisfies` daqui de baixo que obrigou a escrevê-la.
      budgetItemsEn: paralelo(d.budgetItemsEn),
      // O artigo do Moloni vai com a linha (5/11) — senão «Arrumar» faturava a
      // Cerimónia como Transporte.
      budgetArtigos: paralelo(d.budgetArtigos),
      // E os subpontos internos (6/11), pela mesma razão.
      budgetSubpontos: paralelo(d.budgetSubpontos),
    } satisfies Record<keyof ArrayParaleloDaLinha, unknown>;
    return {
      ...d,
      ordemExplicita: ORDEM_EXPLICITA,
      budgetItems: aplicarOrdem(d.budgetItems ?? [], ordemL),
      ...paralelos,
      moodBoards: aplicarOrdem(d.moodBoards, ordemB),
    };
  }

  /**
   * Fixa no documento a ordem que está a ser mostrada.
   *
   * AS DUAS LISTAS DE UMA VEZ, sempre. Acender `ordemExplicita` a arrumar só
   * os mood boards congelava o orçamento na ordem por arrumar — ressuscitava
   * a divergência que isto veio fechar, e desta vez sem sugestão nenhuma a
   * corrigi-la.
   */
  function fixarOrdem() {
    setDoc(arrumadoEExplicito);
    // ── O QUE ARRUMOU, E NÃO «PRONTO» ──────────────────────────────────────
    // As duas listas JÁ estão à vista pela ordem de saída (é o que a sugestão
    // faz), portanto o clique não mexe um pixel no ecrã: o que se vê é o aviso
    // desaparecer. «Ordem fixada.» deixava por responder a única pergunta que
    // se faz a seguir — o que é que isto foi arrumar?
    //
    // A conta é das que MUDARAM DE LUGAR, e não das que existem: numa lista de
    // catorze linhas com duas trocadas, «14 linhas arrumadas» seria uma
    // mentira pequena a estragar a confiança no resto dos avisos.
    //
    // As duas listas contam-se em separado porque o gesto arruma SEMPRE as
    // duas (ver `arrumadoEExplicito`) e o botão vive só numa delas — quem
    // carrega no aviso do orçamento tem de saber que os mood boards também
    // andaram.
    const linhas = ordemDoOrcamento.filter((idx, i) => idx !== i).length;
    const paginas = ordemDosBoards.filter((idx, i) => idx !== i).length;
    const partes = [
      linhas > 0 ? `${linhas} ${linhas === 1 ? "linha do orçamento" : "linhas do orçamento"}` : "",
      paginas > 0
        ? `${paginas} ${paginas === 1 ? "página de inspiração" : "páginas de inspiração"}`
        : "",
    ].filter(Boolean);
    const mudaram = linhas + paginas;
    toast(
      partes.length === 0
        ? "Já estava tudo pela ordem dos Serviços. Daqui para a frente manda a ordem que aqui está."
        : `${partes.join(" e ")} ${mudaram === 1 ? "mudou" : "mudaram"} de sítio. Daqui para a frente manda a ordem que aqui está.`,
      "info",
    );
  }

  return { arrumadoEExplicito, fixarOrdem, ordemSugerida };
}
