"use client";
import { modoDeIvaDoDocumento } from "@/lib/orcamento/estudio/dinheiro-do-documento";

import { type ResultadoDoEcra, useInscricaoNoRegisto } from "../../registo-de-gravacoes";
import { resumoDaPropostaParaCopiar } from "@/lib/email-proposta-textos";
import { camposDoEventoNaLingua } from "@/lib/proposal-doc-textos";
import { eurDocumento, montanteNaLingua } from "@/lib/money";
import { useSomarOTotal } from "../passos/orcamento/useSomarOTotal";
import { useContasDoOrcamento } from "../passos/orcamento/useContasDoOrcamento";
import { useMemo } from "react";
import { ordemDeSaida } from "@/lib/proposal-ordem";
import { type ProposalDoc } from "@/lib/proposal-doc";
import { usePaginasDaProposta } from "../pdf/usePaginasDaProposta";
import { useAnular } from "../../ui/anular";
import { useRepeticoesDasFotos } from "../fotos/useRepeticoesDasFotos";
import { useOrdemDoOrcamento } from "../passos/orcamento/useOrdemDoOrcamento";
import { useLinhasDoOrcamento } from "../passos/orcamento/useLinhasDoOrcamento";
import { useTotalAcompanhaOPedido } from "../passos/orcamento/useTotalAcompanhaOPedido";
import { eCasamento } from "@/lib/proposal-evento";
import { useDesfazer } from "../documento/useDesfazer";
import { useBarraDoEstudio } from "../barra/useBarraDoEstudio";
import { useConfirmacoes } from "../documento/useConfirmacoes";
import { type ActivityEntry } from "@/lib/orcamento/types";
import { randomId } from "../../util";
import { useRestaurarVersao } from "../versoes/useRestaurarVersao";
import { useLimparORascunho } from "../documento/useLimparORascunho";

import type { useNucleoDoEstudio } from "./useNucleoDoEstudio";
import type { useRascunhoGuardaSozinho } from "./useRascunhoGuardaSozinho";

export function useConteudoDoEstudio({
  avisos,
  camposPorConfirmar,
  chavesDoRascunho,
  documento,
  envio,
  escolha,
  fotos,
  guardar,
  passos,
  pedido,
  rascunho,
  referencia,
  reversiveis,
  tempoNaProposta,
  total,
  traducoes,
}: Pick<
  ReturnType<typeof useNucleoDoEstudio> & ReturnType<typeof useRascunhoGuardaSozinho>,
  | "avisos"
  | "camposPorConfirmar"
  | "chavesDoRascunho"
  | "documento"
  | "envio"
  | "escolha"
  | "fotos"
  | "guardar"
  | "passos"
  | "pedido"
  | "rascunho"
  | "referencia"
  | "reversiveis"
  | "tempoNaProposta"
  | "total"
  | "traducoes"
>) {
  const { doc, setDoc } = documento;
  const { quote } = pedido;
  const {
    aGravarNoServidor,
    docDoServidorRef,
    flushDraftRef,
    hydratedRef,
    porGravar,
    serverStampRef,
    soNesteComputador,
    warnedOverwriteRef,
  } = rascunho;
  const { idiomaDoPdf } = traducoes;
  const { composeTotalText, totais } = total;
  const { linkDaProposta, setPdfVisto } = envio;
  const { toast } = avisos;
  const { guardarAgora } = guardar;
  const { setRefEdited } = referencia;
  const { DRAFT_KEY, SIDE_KEY } = chavesDoRascunho;

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O ESTÚDIO NO REGISTO DO BACK OFFICE
   * ════════════════════════════════════════════════════════════════════════
   *
   * A inscrição é feita À MÃO, e não pelo hook partilhado
   * (`useGravacaoAutomatica`), porque este ecrã ainda tem a sua própria cópia
   * da máquina de gravar — reescrevê-la agora era mexer no ficheiro onde a
   * perda de trabalho já foi cara, para ganhar arrumação e arriscar o resto.
   * A inscrição não precisa de esperar por essa migração: são três linhas que
   * põem o estúdio dentro do gesto único, e no dia em que a máquina migrar,
   * isto sai daqui sem deixar buraco.
   *
   * O nome é o que ELA lhe chama: «Proposta de Rita & Tomás». Nunca o nome do
   * ecrã — a pergunta ao fechar o separador tem de dizer QUE proposta é que
   * está em risco, não que componente é que está montado.
   */
  const nomeNoRegisto = doc.clientNames?.trim()
    ? `Proposta de ${doc.clientNames.trim()}`
    : `Proposta do pedido ${quote.id}`;
  const oRegistoFalaPorMim = useInscricaoNoRegisto({
    nome: nomeNoRegisto,
    porGravar: porGravar || aGravarNoServidor > 0 || !!soNesteComputador,
    gravarJa: async (): Promise<ResultadoDoEcra> => {
      const r = await flushDraftRef.current();
      // A cópia local é feita SEMPRE (é síncrona e não depende de rede), por
      // isso o desfecho de uma recusa do servidor aqui é «só neste
      // computador» e nunca «não ficou guardado»: o trabalho existe, mas só
      // neste portátil — que é precisamente a diferença que fez perder uma
      // proposta inteira.
      return r.estado === "guardado"
        ? { estado: "guardado" }
        : { estado: "so-neste-computador", porque: r.porque };
    },
  });
  /**
   * O resumo para o botão «Copiar resumo» — três ou quatro linhas prontas a
   * colar no WhatsApp. Os números são os de `totais` (`totaisDaProposta`),
   * que é o MESMO bloco que a barra do fundo e o passo «Enviar» já mostram;
   * não há aqui uma segunda conta.
   *
   * `eurDocumento` + `montanteNaLingua`: o mesmo par que o gerador do PDF usa
   * para escrever o dinheiro na língua do documento (ver `money.ts`) — para o
   * valor aqui não discordar do valor que o documento em anexo mostra.
   */
  const resumoComLink = (link: string | undefined) =>
    resumoDaPropostaParaCopiar(
      {
        clientNames: doc.clientNames ?? "",
        eventDate: camposDoEventoNaLingua(doc, idiomaDoPdf).eventDate ?? "",
        aPagar: montanteNaLingua(eurDocumento(totais.aPagar), idiomaDoPdf),
        link,
      },
      idiomaDoPdf,
    );
  const resumoParaCopiar = resumoComLink(linkDaProposta ?? undefined);
  const somaDoTotal = useSomarOTotal({ camposPorConfirmar, documento, total });

  const contas = useContasDoOrcamento({ documento });
  const { chaveDosCapitulos } = contas;
  const chaveDosTitulosDosBoards = JSON.stringify(doc.moodBoards.map((b) => b.title ?? ""));
  const ordemDosBoards = useMemo(
    () => ordemDeSaida(doc as ProposalDoc, doc.moodBoards, (b) => b.title ?? ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave diz o que decide
    [chaveDosTitulosDosBoards, chaveDosCapitulos, doc.ordemExplicita],
  );
  const paginasDaProposta = usePaginasDaProposta({
    documento,
    fotos,
    quote,
    tempoNaProposta,
    traducoes,
  });
  /**
   * ── A FOTOGRAFIA DE UMA PÁGINA DO PDF, ESCOLHIDA POR ELA ──────────────────
   *
   * Pedido dela (15/10): «queremos ser nós a meter as fotos… em qualquer sítio
   * do PDF». A folha abre da miniatura da página (a vista de conjunto). Cada
   * toque aplica-se logo, com «Anular»; o que fica gravado é
   * `fotosDasPaginas[chave]`. A capa continua a ser a «Fotografia da capa».
   */
  const anular = useAnular();
  const repeticoes = useRepeticoesDasFotos({ documento, escolha, fotos, quote });
  const ordem = useOrdemDoOrcamento({ contas, documento, ordemDosBoards, toast });
  const linhas = useLinhasDoOrcamento({ contas, documento, reversiveis, somaDoTotal, total });
  useTotalAcompanhaOPedido({ documento, hydratedRef, quote, total });

  function setTemplate(t: "decoracao" | "organizacao") {
    setDoc((d) => {
      // Recompõe o texto de display do total para o campo do template ativo, para
      // que o PDF nunca fique com o total em branco após uma troca de template.
      const mode = modoDeIvaDoDocumento(d);
      const text = composeTotalText(d.totalAmount, mode);
      return {
        ...d,
        template: t,
        // «de Casamento» só num casamento: este título sai na página que o
        // cliente abre (o PDF não o usa).
        headerTitle:
          t === "organizacao"
            ? eCasamento(d.eventType)
              ? "Proposta de orçamento para Organização de Casamento"
              : "Proposta de orçamento para Organização do Evento"
            : undefined,
        ...(t === "organizacao" ? { totalEstimatedText: text } : { totalText: text }),
      };
    });
  }
  const accaoDeDesfazer = useDesfazer({
    documento,
    guardarAgora,
    oRegistoFalaPorMim,
    toast,
    total,
  });
  const barra = useBarraDoEstudio({
    aGravarNoServidor,
    oRegistoFalaPorMim,
    passos,
    porGravar,
    reversiveis,
    soNesteComputador,
  });
  const confirmacoes = useConfirmacoes({ documento, fotos, quote, reversiveis, toast, total });

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O QUE MEXE EM DINHEIRO FICA ESCRITO NO HISTÓRICO DO PEDIDO
   * ════════════════════════════════════════════════════════════════════════
   *
   * O mesmo sítio onde já ficam o estado, os pagamentos e as propostas
   * enviadas — o `activityLog` que o `ActivityLog.tsx` desenha. Nada de um
   * registo novo só para o estúdio: dois históricos sobre o mesmo negócio são
   * dois sítios onde procurar, e o segundo é sempre o que ninguém abre.
   *
   * `activityLogAppend` e não `activityLog`: o servidor junta a entrada ao
   * registo FRESCO (ver a rota `PATCH /api/orcamento/[id]`). Mandar o array
   * inteiro fazia duas ferramentas a gravar ao mesmo tempo apagarem as
   * entradas uma da outra.
   *
   * `price_set` porque é disso que se trata em todas elas: o número que muda é
   * o preço final do pedido. Falhar não interrompe nada — perde-se uma linha
   * de histórico, não o trabalho. A resposta NÃO é propagada com
   * `onQuoteUpdated`: pode cruzar-se com a gravação do preço (que tem o seu
   * próprio travão de 600 ms) e devolver um valor já velho.
   */
  /**
   * Marcar (ou desmarcar) «Vi a proposta e está tudo certo». Marcar deixa a
   * linha no histórico do pedido — quem verificou fica dito ali, ao lado do
   * envio que se segue. Falhar a linha não impede nada.
   */
  function confirmarPdfVisto(confirmado: boolean) {
    setPdfVisto((v) => (v ? { ...v, confirmado } : v));
    if (!confirmado) return;
    const entrada: ActivityEntry = {
      id: randomId(),
      at: new Date().toISOString(),
      kind: "proposal_reviewed",
      summary: `PDF final verificado antes de enviar (${idiomaDoPdf === "en" ? "inglês" : "português"})`,
    };
    void fetch(`/api/orcamento/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityLogAppend: [entrada] }),
    }).catch(() => {
      /* sem rede: a confirmação vale na mesma, fica é sem linha no histórico */
    });
  }
  const versoesAntigas = useRestaurarVersao({
    confirmacoes,
    documento,
    envio,
    passos,
    reversiveis,
    setRefEdited,
    toast,
    total,
  });
  const limpeza = useLimparORascunho({
    DRAFT_KEY,
    SIDE_KEY,
    camposPorConfirmar,
    confirmacoes,
    docDoServidorRef,
    documento,
    envio,
    fotos,
    passos,
    quote,
    reversiveis,
    serverStampRef,
    setRefEdited,
    toast,
    total,
    warnedOverwriteRef,
  });

  return {
    oRegistoFalaPorMim,
    somaDoTotal,
    contas,
    paginasDaProposta,
    anular,
    repeticoes,
    ordem,
    linhas,
    accaoDeDesfazer,
    barra,
    confirmacoes,
    versoesAntigas,
    limpeza,
    resumo: { resumoComLink, resumoParaCopiar },
    ordenacao: { ordemDosBoards },
    accoesDoDocumento: { setTemplate, confirmarPdfVisto },
  };
}
