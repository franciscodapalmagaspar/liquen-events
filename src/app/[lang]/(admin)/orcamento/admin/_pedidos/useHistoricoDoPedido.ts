import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import type { Quote, QuoteStatus, ActivityEntry } from "@/lib/orcamento/types";
import { pedidoDaResposta } from "@/lib/orcamento/pedidos/pedido-da-resposta";
import { type NotasAutomaticas } from "@/lib/orcamento/pedidos/notas-automaticas";
import { comPedidoAlterado } from "@/lib/orcamento/pedidos/lista-de-pedidos";
import { seguirOServidor } from "@/lib/orcamento/pedidos/painel-do-pedido";
import { type EdicaoDoPedido } from "./useEdicaoDoPedido";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { type Avisar } from "../Toast";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O HISTÓRICO DO PEDIDO E O QUE O ESTÚDIO DEVOLVE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Acrescentar linhas ao histórico (e dizer quando não chegaram ao servidor) e
 * reflectir no painel o que o estúdio de propostas mudou no pedido. Saiu do
 * corpo do `AdminClient.tsx` (fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`) tal e
 * qual, e é chamado NO MESMO SÍTIO, logo antes do `useGravacaoDoPedido`: a
 * ordem do componente não muda.
 */
export interface EntradasHistoricoDoPedido {
  setQuotes: Dispatch<SetStateAction<Quote[]>>;
  setSelected: Dispatch<SetStateAction<Quote | null>>;
  substituirPedido: (q: Quote) => void;
  toast: Avisar;
  selectedRef: RefObject<Quote | null>;
  escritoNoServidor: RefObject<NotasAutomaticas | null>;
  edicao: EdicaoDoPedido;
}

export function useHistoricoDoPedido({
  setQuotes,
  setSelected,
  substituirPedido,
  toast,
  selectedRef,
  escritoNoServidor,
  edicao,
}: EntradasHistoricoDoPedido) {
  const { setEditStatus, preencherCom } = edicao;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O HISTÓRICO DEIXA DE SE PERDER EM SILÊNCIO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Isto era `if (res.ok) { … }` sem `else`, e um `catch {}` vazio por baixo.
   * Uma linha de histórico que não chegasse ao servidor desaparecia sem uma
   * palavra — e o histórico é o que se lê meses depois para saber o que se
   * disse a quem.
   *
   * O caso caro é o registo de uma CHAMADA: quem acaba de falar ao telefone
   * escreve o que combinou, a caixa limpa-se como se tivesse gravado, e o que
   * foi escrito não existe em lado nenhum. Ver o `ActivityLog`, que agora só
   * limpa a caixa quando isto devolver `true`.
   *
   * O `oQue` importa aqui mais do que noutros sítios: nas chamadas vindas de um
   * `onSent`, a acção principal JÁ correu bem — a proposta seguiu, a mensagem
   * saiu. A frase tem de dizer que o que falhou foi a linha do histórico, e não
   * o envio.
   */
  async function appendActivity(
    quoteId: string,
    entries: ActivityEntry[],
    oQue = "escrever no histórico",
  ): Promise<boolean> {
    if (entries.length === 0) return true;
    let res: Response;
    try {
      // Só as entradas NOVAS — o servidor junta ao histórico mais recente, para
      // que duas ferramentas a gravar em simultâneo nunca se sobrescrevam.
      res = await fetch(`/api/orcamento/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityLogAppend: entries }),
      });
    } catch {
      toast(porqueRebentou(oQue).mensagem, "error");
      return false;
    }
    const corpo = await res.json().catch(() => null);
    if (!res.ok) {
      toast(porqueFalhou(oQue, res, corpo).mensagem, "error");
      return false;
    }
    const updated = pedidoDaResposta(corpo);
    if (updated) {
      substituirPedido(updated);
    }
    return true;
  }

  /**
   * O estúdio gravou o rascunho e o servidor pôs o pedido em «A preparar
   * proposta» (6/11). Muda-se SÓ o estado — o resto da cópia fica como está,
   * pela razão do `onEstadoDoPedido` do estúdio.
   *
   * E o campo de estado do painel segue-o, mas só se ela não lhe tiver mexido:
   * o «Guardar» compara `editStatus` com o estado do pedido, e um campo que
   * ficasse em «Aguardar resposta» passava por uma escolha dela e desfazia o
   * estado novo ao gravar o resto.
   */
  function refletirEstadoDoEstudio(id: string, status: QuoteStatus) {
    setQuotes((prev) => comPedidoAlterado(prev, id, { status }));
    const aberto = selectedRef.current;
    if (aberto?.id === id) {
      const anterior = aberto.status;
      setEditStatus((e) => seguirOServidor(e, anterior, status));
    }
    setSelected((prev) => (prev?.id === id ? { ...prev, status } : prev));
  }

  /**
   * Põe no ecrã o pedido que o «Anular» repôs: a lista, a gaveta, cada campo de
   * edição e a linha de base da gravação automática — como o «Guardar» faz com o
   * que acabou de gravar. Sem isto, os campos ficavam com o valor anulado e o
   * botão voltava a gravá-lo. Os campos e a linha de base só se o pedido
   * reposto ainda for o aberto (ver a nota lá dentro).
   */
  function refletirPedidoReposto(q: Quote) {
    substituirPedido(q);
    // Os campos e a linha de base são do pedido ABERTO: um «Anular» que chega
    // com outro pedido aberto só muda a lista (revisão independente de 17/11 —
    // sem isto, os campos do outro pedido ficavam com os dados deste, e o
    // «Guardar» seguinte gravava-os por cima dele).
    if (selectedRef.current?.id !== q.id) return;
    preencherCom(q);
    escritoNoServidor.current = {
      id: q.id,
      adminNotes: q.adminNotes ?? "",
      lostReason: q.lostReason ?? "",
    };
  }
  return { appendActivity, refletirEstadoDoEstudio, refletirPedidoReposto };
}
