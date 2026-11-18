"use client";
import { mesmoValorAoCentimo } from "@/lib/money";
import { useToast } from "../../Toast";
import { parseMoneyText } from "@/lib/proposal-doc";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { eur } from "@/lib/money";
import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import { textoDoTotal } from "@/lib/orcamento/estudio/textos-do-estudio";
import { baseDoDoc } from "@/lib/orcamento/estudio/dinheiro-do-documento";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useAccoesReversiveis } from "../documento/useAccoesReversiveis";
import { useTotalDaProposta } from "../passos/orcamento/useTotalDaProposta";
import { useConfirmacoes } from "../documento/useConfirmacoes";
import { usePassosDoEstudio } from "../passos/usePassosDoEstudio";
import { useEstadoDoEnvio } from "../envio/useEstadoDoEnvio";
import type { Dispatch, SetStateAction } from "react";

export interface EntradaRestaurarVersao {
  confirmacoes: ReturnType<typeof useConfirmacoes>;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  envio: ReturnType<typeof useEstadoDoEnvio>;
  passos: ReturnType<typeof usePassosDoEstudio>;
  reversiveis: ReturnType<typeof useAccoesReversiveis>;
  setRefEdited: Dispatch<SetStateAction<boolean>>;
  toast: ReturnType<typeof useToast>["toast"];
  total: ReturnType<typeof useTotalDaProposta>;
}

export function useRestaurarVersao({
  confirmacoes,
  documento,
  envio,
  passos,
  reversiveis,
  setRefEdited,
  toast,
  total,
}: EntradaRestaurarVersao) {
  const { registarNoHistorico } = confirmacoes;
  const { doc, setDoc } = documento;
  const { corpoDoEmail, setConfirmSend, setCorpoDoEmail, setSent } = envio;
  const { irParaPasso } = passos;
  const { setLimpo } = reversiveis;
  const { persistirPreco, setTotalInput, totalInput } = total;

  /**
   * Repõe no estúdio uma versão que já tinha sido enviada.
   *
   * Passa pela MESMA anulação de dez segundos do "Limpar", e pela mesma razão:
   * o gesto deita fora o que estava no ecrã, e quem carrega só vê o que perdeu
   * depois de carregar. Uma caixa a perguntar "tem a certeza?" seria respondida
   * sem ser lida.
   *
   * Não envia nada. Fica um rascunho igual ao que seguiu naquele dia, para se
   * mexer e voltar a passar pelo Enviar.
   *
   * ── PORQUE É QUE ESTA NÃO GANHOU CAIXA DE CONFIRMAÇÃO ──────────────────
   * É uma das acções que mudam o preço final, e portanto entra na lista das
   * que têm de ser reversíveis e ficar no histórico — e ficam as duas coisas.
   * O que não ganha é a PERGUNTA: a razão está escrita três linhas acima e não
   * mudou. Perguntar antes de repor uma versão que ela acabou de escolher numa
   * lista, pelo nome e pela data, era pedir para confirmar a leitura.
   */
  function restaurarVersao(antiga: ProposalDoc) {
    setLimpo({
      doc,
      total: totalInput,
      segundos: 10,
      motivo: "Versão anterior reposta no rascunho.",
    });
    const reposto = antiga as StudioDoc;
    setDoc(reposto);
    // O campo do total é texto (aceita "1.500" e "1 500 €"), por isso não sai de
    // graça do documento: deriva-se a base do que foi reposto, senão ficava com
    // o número da versão que se acabou de substituir.
    const base = baseDoDoc(reposto);
    setTotalInput(typeof base === "number" && base > 0 ? textoDoTotal(base) : "");
    // E GRAVA-SE no pedido. Escrever no campo do valor já gravava — é a
    // promessa que está escrita ao lado dele, «Há um número só» — e repor uma
    // versão trocava o documento inteiro, valor incluído, sem gravar nada. O
    // estúdio passava a dizer 8.000 e a Gestão do pedido, o Kanban e o dossier
    // continuavam a dizer 9.400 até ela enviar. Duas verdades sobre o mesmo
    // negócio, e a errada era a que aparecia em todos os outros ecrãs.
    // Com a versão REPOSTA, e não com o rascunho que ela acabou de substituir:
    // os adicionais que contam são os da versão. Ver `baseDoEcraParaOPedido`.
    persistirPreco(typeof base === "number" && base > 0 ? base : undefined, { doc: reposto });
    // A referência é composta a partir dos campos ATÉ alguém lhe mexer. Uma
    // versão reposta traz a referência com que seguiu, e recompô-la por cima
    // trocava o número da proposta que o cliente tem em mãos.
    setRefEdited(true);
    setConfirmSend(false);
    setSent(false);
    // Muda de passo como a barra dos passos: sobe ao início do Evento se ele
    // ficou acima (ver «MUDAR DE PASSO SOBE AO TOPO DO PASSO NOVO»).
    irParaPasso("evento");
    // Só se o preço tiver MESMO mudado: repor uma versão com o mesmo valor não
    // é um acontecimento do dinheiro, e uma linha por cada não-mudança ensina a
    // saltar o histórico todo.
    const anterior = parseMoneyText(totalInput);
    const novo = typeof base === "number" && base > 0 ? base : 0;
    if (!mesmoValorAoCentimo(novo, anterior)) {
      registarNoHistorico(
        `Versão anterior reposta no estúdio: preço final de ${eur(anterior)} para ${eur(novo)}.`,
      );
    }
    toast("Versão reposta. Podes anular durante 10 segundos.", "info");
  }

  /**
   * Insere o parágrafo do que mudou (painel Versões) na caixa "Mensagem para
   * o cliente" — NUNCA directamente no email. É a mesma caixa que já viaja
   * com o envio (ver `send`, mais abaixo), por isso não é preciso mais nada
   * para ela poder acompanhar a proposta.
   *
   * Uma caixa vazia recebe o parágrafo tal como está. Uma caixa que já tem
   * algo escrito por ela (uma nota pessoal, por exemplo) NÃO é substituída —
   * o parágrafo entra a seguir, com uma linha em branco pelo meio, para não
   * apagar trabalho.
   */
  function inserirParagrafoDoQueMudou(texto: string) {
    /* A caixa da mensagem saiu do passo 5 (14/10): o parágrafo entra no TEXTO
       do email, que é o que segue — a seguir ao «Olá …,», com uma linha em
       branco de cada lado. Sem texto ainda (o rascunho do email está a vir),
       diz-se e não se escreve por cima de nada. */
    if (!corpoDoEmail.trim()) {
      toast("O email ainda está a ser preparado — tenta daqui a um instante.", "info");
      return;
    }
    const partes = corpoDoEmail.split(/\n\s*\n/);
    const novo = [partes[0], texto, ...partes.slice(1)].join("\n\n");
    setCorpoDoEmail(novo);
    toast("Parágrafo inserido no email para o cliente. Revê antes de enviar.", "info");
  }

  return { inserirParagrafoDoQueMudou, restaurarVersao };
}
