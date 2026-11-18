"use client";
import { useConferirComOEnviado } from "./useConferirComOEnviado";

import { type DivergenciaDoEnviado } from "@/lib/orcamento/estudio/conferencia-com-o-enviado";
import { useEffect, useState } from "react";
import { useToast } from "../../Toast";

import type { ProposalDoc } from "@/lib/proposal-doc";
import { eur } from "@/lib/money";
import type { Quote } from "@/lib/orcamento/types";
import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import { textoDoTotal } from "@/lib/orcamento/estudio/textos-do-estudio";
import { baseDoDoc, dinheiroDoDocumento } from "@/lib/orcamento/estudio/dinheiro-do-documento";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useAccoesReversiveis } from "../documento/useAccoesReversiveis";
import { useTotalDaProposta } from "../passos/orcamento/useTotalDaProposta";
import { useConfirmacoes } from "../documento/useConfirmacoes";

export interface EntradaConferenciaComOEnviado {
  DRAFT_KEY: string;
  aberturaAssente: boolean;
  confirmacoes: ReturnType<typeof useConfirmacoes>;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  quote: Quote;
  reversiveis: ReturnType<typeof useAccoesReversiveis>;
  sent: boolean;
  toast: ReturnType<typeof useToast>["toast"];
  total: ReturnType<typeof useTotalDaProposta>;
}

export function useConferenciaComOEnviado({
  DRAFT_KEY,
  aberturaAssente,
  confirmacoes,
  documento,
  quote,
  reversiveis,
  sent,
  toast,
  total,
}: EntradaConferenciaComOEnviado) {
  const { registarNoHistorico } = confirmacoes;
  const { doc, setDoc } = documento;
  const { setLimpo } = reversiveis;
  const { persistirPreco, setTotalInput, totais, totalInput } = total;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O QUE SEGUIU PARA O CLIENTE, E O QUE ESTE APARELHO TEM
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela, com três pontos de exclamação: «eu quero igual o valor!!!
   * até eu alterar por mim!». O PDF que o casal tem em mãos dizia 13.257,85 € a
   * pagar; a proposta reabria a dizer 15.090,55 €.
   *
   * As contas que faziam o número mexer sozinho estão corrigidas (ver os três
   * blocos «AQUI ESTAVA O VALOR A CRESCER SOZINHO» e o merge do rascunho do
   * servidor). Isto é a REDE por baixo delas: o estúdio nunca olhava para o
   * documento que SEGUIU. O que reabria era o rascunho deste aparelho com o
   * «Preço final» do pedido por cima — dois números que ninguém obriga a
   * continuar iguais ao terceiro, o que o casal recebeu.
   *
   * Agora, ao abrir, compara-se com a última proposta ENVIADA. Havendo
   * diferença, ela aparece ESCRITA, com os dois números lado a lado, antes de
   * qualquer decisão.
   *
   * ── PORQUE É QUE NÃO SE REPÕE SOZINHO ────────────────────────────────────
   *
   * Porque duas coisas legítimas produzem exactamente a mesma diferença, e o
   * código não as distingue:
   *
   *   · o valor mexeu sozinho — e repor o enviado é o que ela quer;
   *   · ela CORRIGIU o preço de propósito depois do envio, na Gestão do pedido
   *     ou aqui, para a proposta seguinte — e repor o enviado apagava-lhe a
   *     correcção sem uma palavra.
   *
   * Escolher por ela seria acertar em metade dos casos e destruir trabalho na
   * outra metade, em silêncio nos dois. O que a rede garante é que nenhum dos
   * dois números ganha sem ela saber: estão os dois no ecrã, com as datas, e o
   * botão de repor é dela.
   */
  const [divergenciaDoEnviado, setDivergenciaDoEnviado] = useState<DivergenciaDoEnviado | null>(
    null,
  );
  /** A ir buscar o documento que seguiu, para o repor. */
  const [aReporOEnviado, setAReporOEnviado] = useState(false);
  /** A conferência com o enviado corre UMA vez por abertura. */

  /**
   * ════════════════════════════════════════════════════════════════════════
   * A CONFERÊNCIA COM O QUE SEGUIU PARA O CLIENTE
   * ════════════════════════════════════════════════════════════════════════
   *
   * Ver o bloco `divergenciaDoEnviado`, que conta o porquê. Aqui é a mecânica,
   * e ela é de propósito barata: a LISTA das versões traz o total de cada
   * envio (`total`, o bruto que ia no PDF) e mais nada. Quando bate certo — que
   * é o caso normal — não se descarrega documento nenhum.
   *
   * `versoes[0]` é a mais recente: a rota devolve da mais nova para a mais
   * velha, e está escrito lá.
   */
  const chaveDoEnviadoVisto = `${DRAFT_KEY}:enviado-visto`;

  useConferirComOEnviado({
    quoteId: quote.id,
    historico: quote.activityLog,
    aberturaAssente,
    // Enviar NESTA sessão põe no ecrã exactamente o documento que seguiu — não
    // há nada para conferir, e a lista de versões ainda nem o conhece.
    enviadaNestaSessao: sent,
    aPagar: totais.aPagar,
    chaveDoVisto: chaveDoEnviadoVisto,
    aoDivergir: setDivergenciaDoEnviado,
  });

  /**
   * Repõe no ecrã os VALORES que seguiram para o cliente — e só os valores.
   *
   * O texto, as fotografias e os mood boards ficam exactamente como estão: são
   * trabalho dela, podem ser posteriores ao envio, e nunca estiveram em causa.
   * O que volta é o conjunto de campos que decide o dinheiro — o mesmo que
   * `totaisDaProposta` lê para desenhar o quadro do PDF.
   *
   * Reversível durante dez segundos, como todas as outras acções que mexem no
   * preço, e com uma linha no histórico do pedido pela mesma razão: um valor
   * que muda, visto três semanas depois, tem de ter onde se explicar.
   */
  async function reporOsValoresEnviados() {
    const d = divergenciaDoEnviado;
    if (!d || aReporOEnviado) return;
    setAReporOEnviado(true);
    try {
      const res = await fetch(`/api/orcamento/${quote.id}/versoes?doc=${d.versaoId}`, {
        cache: "no-store",
      });
      const dados = (await res.json().catch(() => null)) as { doc?: ProposalDoc } | null;
      if (!res.ok || !dados?.doc) {
        throw new Error(
          "Não foi possível ir buscar a proposta que seguiu para o cliente. A ligação falhou ou a versão já não está no servidor — tenta outra vez daqui a pouco, ou fala com quem gere a instalação. Nada mudou no que está no ecrã.",
        );
      }
      const enviado = dados.doc as StudioDoc;
      setLimpo({
        doc,
        total: totalInput,
        segundos: 10,
        motivo: `Valores repostos como seguiram para o cliente — total a pagar de ${eur(d.aPagarAqui)} para ${eur(d.aPagarEnviado)}.`,
      });
      setDoc((dd) => ({ ...dd, ...dinheiroDoDocumento(enviado) }));
      const base = baseDoDoc(enviado);
      setTotalInput(typeof base === "number" && base > 0 ? textoDoTotal(base) : "");
      // Com o documento ENVIADO, e não com o que estava no ecrã — ver
      // `baseDoEcraParaOPedido`. É isto que volta a pôr o «Preço final» do
      // pedido de acordo com o que o casal recebeu.
      persistirPreco(typeof base === "number" && base > 0 ? base : undefined, { doc: enviado });
      registarNoHistorico(
        `Valores repostos no estúdio como seguiram para o cliente: total a pagar de ${eur(d.aPagarAqui)} para ${eur(d.aPagarEnviado)}.`,
      );
      /**
       * ── E O «ANULAR» TEM DE FICAR ANULADO ────────────────────────────────
       *
       * A reposição é reversível durante dez segundos. Se ela a anular, o ecrã
       * volta a `aPagarAqui` — e, sem esta linha, a abertura seguinte via outra
       * vez uma divergência que ninguém tinha decidido e repunha de novo. Ela
       * ficava a lutar com o ecrã, e a anulação não valia nada.
       *
       * Guardar `aPagarAqui` (o valor de ANTES) diz exactamente isto: «se
       * acabares neste número, é porque o escolheste». Se não anular, o ecrã
       * fica no valor enviado e não há divergência nenhuma para conferir.
       */
      try {
        localStorage.setItem(chaveDoEnviadoVisto, String(d.aPagarAqui));
      } catch {
        /* sem `localStorage` a reposição vale na mesma; o que se perde é a
           memória de ela a ter anulado */
      }
      setDivergenciaDoEnviado(null);
      toast(
        "Os valores voltaram ao que seguiu para o cliente. Podes anular durante 10 segundos.",
        "success",
      );
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "Não foi possível repor os valores enviados.",
        "error",
      );
    } finally {
      setAReporOEnviado(false);
    }
  }

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O VALOR QUE SE MEXEU SOZINHO VOLTA SOZINHO — SEM PERGUNTAR NADA
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «eu quero que o valor enviado para o cliente seja o valor
   * que fica na proposta e não quero depois se eu for à proposta no back
   * office já esteja outro valor naquele pedido. ISTO É SIMPLES, O VALOR NÃO
   * ALTERA CASO EU NÃO MUDO».
   *
   * Antes isto punha os dois números no ecrã e esperava por ela. A razão
   * escrita era boa — duas causas diferentes dão a mesma diferença — mas a
   * conclusão estava errada, e ela disse-o: nos dois casos QUEM DECIDE JÁ
   * DECIDIU. Se mudou o preço, mudou-o de propósito e isso está no histórico.
   * Se não mudou, o número que vale é o que o casal tem em mãos, e perguntar
   * é fazê-la escolher entre um valor certo e um valor avariado.
   *
   * Portanto: `elaMudou === false` repõe, e a pergunta só sobrevive no caso em
   * que responder por ela apagava trabalho dela.
   *
   * O que ela vê continua a ser tudo: o aviso do que aconteceu, o valor velho
   * e o novo, dez segundos para anular e uma linha no histórico do pedido.
   * Nada disto é silencioso — é só uma coisa a menos para decidir.
   */
  useEffect(() => {
    if (!divergenciaDoEnviado || divergenciaDoEnviado.elaMudou) return;
    if (aReporOEnviado) return;
    void reporOsValoresEnviados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divergenciaDoEnviado]);

  /** Fica o que está neste aparelho — e a pergunta não se repete enquanto o
   *  número não voltar a mexer. */
  function manterOsValoresDesteAparelho() {
    const d = divergenciaDoEnviado;
    if (!d) return;
    try {
      localStorage.setItem(chaveDoEnviadoVisto, String(d.aPagarAqui));
    } catch {
      /* sem `localStorage` a pergunta volta na abertura seguinte */
    }
    setDivergenciaDoEnviado(null);
  }

  return {
    aReporOEnviado,
    divergenciaDoEnviado,
    manterOsValoresDesteAparelho,
    reporOsValoresEnviados,
  };
}
