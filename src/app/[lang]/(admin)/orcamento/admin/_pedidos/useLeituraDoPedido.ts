import { useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import type { Quote } from "@/lib/orcamento/types";
import type { RecentQuote } from "../CommandPalette";
import type { LeituraDoPedido } from "@/lib/orcamento/pedidos/leitura-do-pedido";
import { type EdicaoDoPedido } from "./useEdicaoDoPedido";
import { comPedidoSubstituido } from "@/lib/orcamento/pedidos/lista-de-pedidos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * FECHAR E LER O PEDIDO — o guarda das alterações e a leitura inteira
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Fechar o painel (com a pergunta «tem alterações por guardar?»), ler o
 * pedido inteiro do servidor sem pedir duas vezes o mesmo, e recarregá-lo.
 *
 * Saiu do corpo do `AdminClient.tsx` (fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`)
 * tal e qual, e é chamado NO MESMO SÍTIO onde o código estava: a ordem dos
 * hooks e dos efeitos do componente não muda. Os nomes ficam os de lá.
 */
export interface EntradasLeituraDoPedido {
  setQuotes: Dispatch<SetStateAction<Quote[]>>;
  quotes: Quote[];
  selected: Quote | null;
  setRecentQuotes: Dispatch<SetStateAction<RecentQuote[]>>;
  sairDoPainel: (id: string | null) => void;
  completos: RefObject<Set<string>>;
  absorverDoServidor: (updated: Quote) => void;
  edicao: EdicaoDoPedido;
}

export function useLeituraDoPedido({
  setQuotes,
  quotes,
  selected,
  setRecentQuotes,
  sairDoPainel,
  completos,
  absorverDoServidor,
  edicao,
}: EntradasLeituraDoPedido) {
  const { alteracoesPorConfirmar } = edicao;
  /**
   * Devolve true para prosseguir; havendo alterações por confirmar, pergunta.
   *
   * Pergunta só pelo que AINDA EXIGE UM CLIQUE. O que se escreve já não se
   * descarta — está no servidor, ou vai a caminho dele mal este gesto largue o
   * painel (ver a `chave` da gravação automática). Continuar a perguntar por
   * isso era ensinar-lhe que «Descartar» deita fora o que ela escreveu, quando
   * não deita.
   */
  function discardGuard(): boolean {
    if (!alteracoesPorConfirmar) return true;
    return window.confirm("Tem alterações por guardar neste pedido. Descartar?");
  }
  function closeDetail() {
    if (discardGuard()) sairDoPainel(selected?.id ?? null);
  }

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
    const leitura: Promise<LeituraDoPedido> = lerPedidoInteiro(q).finally(() => {
      // Só a sua: um `recarregarPedido` pode já ter posto outra leitura no lugar.
      if (leiturasEmCurso.current.get(q.id) === leitura) leiturasEmCurso.current.delete(q.id);
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
    setQuotes((prev) => comPedidoSubstituido(prev, inteiro));
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

  /**
   * «Vistos recentemente», escrito num sítio só.
   *
   * Havia UMA porta para abrir um pedido e agora há duas — o painel de detalhe
   * e a página inteira da proposta. Duas cópias desta escrita divergiam no dia
   * em que uma delas ganhasse um campo, e o que se perde é a lista por onde ela
   * volta a encontrar o que estava a fazer.
   */
  function lembrarRecente(q: Quote) {
    try {
      const entry: RecentQuote = { id: q.id, name: q.name, email: q.email, status: q.status };
      const prev: RecentQuote[] = JSON.parse(localStorage.getItem("liquen-recent-quotes") ?? "[]");
      const next = [entry, ...prev.filter((r) => r.id !== q.id)].slice(0, 6);
      localStorage.setItem("liquen-recent-quotes", JSON.stringify(next));
      setRecentQuotes(next);
    } catch {
      /* ignore */
    }
  }
  return { closeDetail, discardGuard, comPedidoInteiro, lembrarRecente, recarregarPedido };
}
