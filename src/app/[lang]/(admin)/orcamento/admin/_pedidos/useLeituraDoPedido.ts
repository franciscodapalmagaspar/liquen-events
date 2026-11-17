"use client";

import { useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { LeituraDoPedido } from "@/lib/orcamento/pedidos/leitura-do-pedido";
import { substituirNaLista } from "@/lib/orcamento/pedidos/lista-de-pedidos";
import type { Quote } from "@/lib/orcamento/types";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";

/**
 * Ler um pedido inteiro do servidor — uma vez por pedido, e sem dois pedidos
 * à rede ao mesmo tempo para o mesmo id. Saiu do `AdminClient.tsx` tal e qual
 * (júri das fases 7 e 8, ponto 3): três funções e uma ref, sem efeitos.
 *
 * `completos` fica no `AdminClient` porque a revalidação da lista também o
 * lê (um pedido completo não volta a ser resumido por cima).
 */
export function useLeituraDoPedido({
  completos,
  quotes,
  setQuotes,
  absorverDoServidor,
}: {
  completos: RefObject<Set<string>>;
  quotes: Quote[];
  setQuotes: Dispatch<SetStateAction<Quote[]>>;
  absorverDoServidor: (q: Quote) => void;
}) {
  /**
   * O PEDIDO INTEIRO, ANTES DE O PAINEL ABRIR.
   *
   * A lista chega em resumo (ver `resumirQuote`), sem convidados, checklist,
   * plano de produção nem cronograma. Aqui vai-se buscar o resto — uma vez por
   * pedido e por sessão.
   *
   * Porque é que se ESPERA em vez de mostrar já e completar por trás: o
   * GuestList, o EventChecklist, o ProductionPlan e o EventTimeline copiam a
   * colecção para estado interno no primeiro render (`useState(quote.guestList
   * ?? [])`) e estão presos por `key` ao id do pedido — não voltam a ler a
   * propriedade quando ela mudar. Abertos com o resumo, ficavam com uma lista
   * VAZIA que a primeira edição gravava por cima da verdadeira. A diferença
   * entre esperar e não esperar é um painel que abre um instante mais tarde
   * contra uma lista de 150 convidados apagada sem ninguém dar por isso.
   *
   * Se a ida ao servidor falhar, NÃO se abre com o resumo — devolve-se null e
   * quem chamou avisa. Uma falha visível é melhor do que um painel que parece
   * completo e não está.
   */
  /**
   * ── DUAS PORTAS PARA O MESMO PEDIDO NÃO PAGAM DUAS VIAGENS ────────────────
   *
   * O `completos` só sabe do que JÁ CHEGOU. Enquanto a leitura está a caminho
   * não sabe nada — e desde que a lista de Pedidos leva ao ecrã da proposta
   * (que lê o pedido por trás) há um segundo gesto possível antes de a primeira
   * resposta chegar: o «Abrir o pedido». Duas leituras iguais do mesmo pedido,
   * a mesma resposta duas vezes, no 4G dela.
   *
   * Quem pede um pedido que já vai a caminho recebe A MESMA promessa.
   */
  const leiturasEmCurso = useRef(new Map<string, Promise<LeituraDoPedido>>());

  async function comPedidoInteiro(q: Quote): Promise<LeituraDoPedido> {
    if (completos.current.has(q.id)) return { ok: true, quote: q };
    const aCaminho = leiturasEmCurso.current.get(q.id);
    if (aCaminho) return aCaminho;
    const leitura = lerPedidoInteiro(q).finally(() => {
      leiturasEmCurso.current.delete(q.id);
    });
    leiturasEmCurso.current.set(q.id, leitura);
    return leitura;
  }

  async function lerPedidoInteiro(q: Quote): Promise<LeituraDoPedido> {
    const oQue = `abrir o pedido de ${q.name || "este cliente"}`;
    let res: Response;
    try {
      res = await fetch(`/api/orcamento/${encodeURIComponent(q.id)}`, {
        cache: "no-store",
      });
    } catch {
      return { ok: false, porque: porqueRebentou(oQue).mensagem };
    }
    if (!res.ok) {
      const corpo = await res.json().catch(() => null);
      return { ok: false, porque: porqueFalhou(oQue, res, corpo).mensagem };
    }
    /**
     * SESSÃO EXPIRADA RESPONDE 200. Esta rota é pública — a página de
     * confirmação do casal lê-a — e sem sessão devolve uma lista curta de
     * factos do evento que TAMBÉM tem `id` e TAMBÉM vem com 200. Aceitá-la
     * era abrir o painel sem nome, sem contacto, sem pagamentos e sem
     * convidados, e ainda substituir o pedido na lista por essa versão.
     *
     * O cabeçalho é a única marca fiável de que veio o pedido inteiro; a
     * rota explica porquê. Sem ele, isto é uma falha — e uma falha visível é
     * melhor do que um painel que parece completo e não está.
     */
    if (res.headers.get("x-pedido") !== "completo") {
      // Este 200 não é um 200: é a sessão caída, e dizer «verifica a ligação»
      // sobre ela mandava-a fazer a única coisa que não resolve nada.
      return {
        ok: false,
        porque: `A sessão expirou — não deu para ${oQue}. Volta a entrar e tenta outra vez.`,
      };
    }
    const inteiro = (await res.json().catch(() => null)) as Quote | null;
    if (!inteiro?.id) {
      return { ok: false, porque: `A resposta veio incompleta — não deu para ${oQue}. Repete.` };
    }
    completos.current.add(inteiro.id);
    setQuotes((prev) => substituirNaLista(prev, inteiro));
    return { ok: true, quote: inteiro };
  }

  /**
   * Voltar a ler o pedido INTEIRO do servidor, ignorando a cache de sessão.
   *
   * O `comPedidoInteiro` guarda o que já leu (`completos`) para não repetir a
   * ida ao servidor a cada abertura. Isso é certo para abrir; é errado depois
   * de uma acção que muda o pedido do lado de LÁ — a geração ao ganhar escreve
   * o plano de montagem e as linhas de sinal e saldo no próprio pedido, e sem
   * esta releitura o painel de Pagamentos ao lado continuava vazio até ela
   * fechar e reabrir a ficha.
   *
   * Melhor esforço: uma leitura que falhe deixa o ecrã como estava. O trabalho
   * foi feito no servidor de qualquer maneira.
   */
  async function recarregarPedido(id: string) {
    const actual = quotes.find((q) => q.id === id);
    if (!actual) return;
    completos.current.delete(id);
    // E a que vai a caminho: é dela que o `comPedidoInteiro` se serviria, e é
    // exactamente a versão desactualizada que isto existe para deitar fora.
    leiturasEmCurso.current.delete(id);
    const r = await comPedidoInteiro(actual);
    if (r.ok) absorverDoServidor(r.quote);
  }

  return { comPedidoInteiro, recarregarPedido };
}
