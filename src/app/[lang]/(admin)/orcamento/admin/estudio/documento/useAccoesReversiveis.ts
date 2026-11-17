"use client";
import { useState } from "react";
import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";

export function useAccoesReversiveis() {
  /**
   * O rascunho que o "Limpar" deitou fora, à espera de ser resgatado.
   *
   * Dez segundos e um botão, em vez de uma caixa de confirmação. A caixa
   * pergunta ANTES, quando ela ainda não viu o que ia perder, e a resposta
   * certa é quase sempre "sim" — por isso carrega-se sem ler. A anulação
   * pergunta DEPOIS, quando o ecrã já mostra o estrago.
   */
  const [limpo, setLimpo] = useState<{
    doc: StudioDoc;
    total: string;
    segundos: number;
    /** O que aconteceu, para o aviso poder dizê-lo. O "Limpar" não é o único
     *  gesto que deita fora o que estava no ecrã: repor uma versão antiga
     *  também, e um aviso a dizer "rascunho limpo" depois de um restauro
     *  mandava procurar um problema que não houve. */
    motivo: string;
    /**
     * Os mapas das fotografias, quando o gesto também os esvaziou (o
     * «Limpar»). Sem eles, «Anular» devolvia o documento com as fotos a
     * cinzento («não veio») e sem a origem das da biblioteca (auditoria de
     * 13/11, estúdio n.º 11).
     */
    fotos?: {
      urls: Record<string, string>;
      originais: Record<string, string>;
      medias: Record<string, string>;
      cores: Record<string, string>;
      origens: Record<string, string>;
    };
  } | null>(null);
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * UMA ACÇÃO QUE MEXE NO DINHEIRO PERGUNTA COM OS DOIS NÚMEROS À VISTA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela sobre o «Usar X €»: «é um botão perigoso». E era: um clique
   * substituía o preço final da proposta — o número de que saem a fatura, o
   * sinal e o saldo — sem dizer o que ia sair dali para fora. O rótulo mostrava
   * o valor NOVO; o valor que se perdia não estava escrito em lado nenhum.
   *
   * A pergunta traz os DOIS: «Substituir 2.460,00 € por 2.535,00 €?». É a única
   * forma de a resposta ser uma decisão em vez de um reflexo — e é diferente de
   * um «tem a certeza?», que se responde sem ler porque não acrescenta
   * informação nenhuma.
   *
   * Depois de aplicada, a anulação de dez segundos (a mesma do «Limpar») fica
   * disponível: a confirmação protege de carregar por engano, a anulação
   * protege de confirmar por engano.
   */
  const [confirmacaoDeDinheiro, setConfirmacaoDeDinheiro] = useState<{
    /** O que aparece na pergunta, já composto. */
    pergunta: string;
    /** O que fica no histórico do pedido quando for aplicada. */
    registo: string;
    /** O que a anulação dirá que foi desfeito. */
    motivo: string;
    /**
     * O documento no instante em que a pergunta foi feita.
     *
     * A pergunta guarda o gesto que a vai aplicar, e esse gesto foi composto
     * com os números desse instante. Se entretanto se escrever no formulário,
     * «substituir 2.460,00 € por 2.535,00 €» passa a falar de um documento que
     * já não existe — e aplicá-la escrevia por cima do que se acabou de
     * escrever. Por isso a pergunta só se DESENHA enquanto o documento for este
     * (ver a marcação); caducada, desaparece, e volta a perguntar-se se for
     * preciso. Comparado por identidade porque o documento é imutável: cada
     * alteração devolve um objecto novo.
     */
    docNoMomento: StudioDoc;
    aplicar: () => void;
  } | null>(null);
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O QUE SE APAGA E NÃO VOLTA: OU UMA PERGUNTA QUE CONTA, OU UM «ANULAR»
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A regra desta casa, escrita de uma vez para não ser decidida gesto a gesto:
   *
   *  · PERGUNTA-SE o que é RARO E CARO. Uma página de inspiração leva consigo
   *    as fotografias todas que se escolheram para ela, uma a uma, e uma folha
   *    do PDF; uma fase do cronograma leva as tarefas todas que lhe estão
   *    dentro. Fazem-se poucas vezes por proposta e refazê-las é meia hora. A
   *    pergunta NOMEIA a coisa, CONTA o que vai com ela e diz a consequência —
   *    nunca «Tens a certeza?», que não acrescenta informação nenhuma e por
   *    isso se responde sem ler.
   *
   *  · OFERECE-SE ANULAR o que é FREQUENTE E BARATO de refazer. Uma linha de
   *    orçamento, uma tarefa do cronograma, uma fotografia de uma grelha: são
   *    os gestos de que uma tarde de trabalho é feita, e uma caixa a perguntar
   *    em cada um é um editor que ninguém usa. Faz-se, e fica o «Anular» dos
   *    dez segundos (ver `limpo`) a dizer o que saiu.
   *
   * Uma coisa OU a outra, nunca as duas — a excepção está escrita em
   * `confirmacaoDeDinheiro` e vale só para o dinheiro, onde a pergunta protege
   * de carregar por engano e a anulação de confirmar por engano.
   *
   * E nada disto atrasa o que não é destrutivo: uma página em branco, uma fase
   * sem título nem tarefas, uma linha por escrever — saem sem pergunta nenhuma
   * e sem barra nenhuma. Perguntar por nada ensina a responder sem ler.
   *
   * ── PORQUE É QUE A PERGUNTA SE DESENHA ONDE O DEDO CARREGOU ───────────────
   * Ao contrário da do dinheiro, que vive no topo do estúdio de propósito: as
   * acções do dinheiro estão espalhadas por três secções e uma pergunta que
   * aparecesse cada vez noutro sítio responder-se-ia sem se procurar o que ela
   * diz. Estas são o contrário — com oito páginas escritas, o topo do estúdio
   * está a metros do «×» que se carregou, e uma pergunta fora do ecrã é um
   * botão que não fez nada. Portanto fica dentro do cartão, encostada ao gesto.
   *
   * `chave` é o que decide ONDE se desenha (`board:2`, `fase:0`), e o
   * `docNoMomento` é a mesma cautela da pergunta do dinheiro: a frase foi
   * composta com os números daquele instante, e se o documento mudar por baixo
   * dela deixa de falar do que está no ecrã. Caducada, desaparece.
   */
  const [aRemover, setARemover] = useState<{
    chave: string;
    pergunta: string;
    docNoMomento: StudioDoc;
    aplicar: () => void;
  } | null>(null);

  return {
    aRemover,
    confirmacaoDeDinheiro,
    limpo,
    setARemover,
    setConfirmacaoDeDinheiro,
    setLimpo,
  };
}
