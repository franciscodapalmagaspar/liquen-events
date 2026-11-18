import {
  useEffect,
  useRef,
  useCallback,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { localizeHref } from "@/lib/i18n/config";
import { navegarPara } from "../navegar";
import type { Quote } from "@/lib/orcamento/types";
import { haQuantoTempo, lerRascunho, oQueMudou, type CamposDoPedido } from "../rascunho-do-pedido";
import { prefetchList } from "../useCachedList";
import { type SeparadorPorDecidir } from "../separador-por-decidir";
import { propostaDaFaseDoPedido, type PropostaLeve } from "../percentagem-do-sinal";
import { type View } from "../nav";
import type { LeituraDoPedido } from "@/lib/orcamento/pedidos/leitura-do-pedido";
import { type EdicaoDoPedido } from "./useEdicaoDoPedido";
import { detailNextAction, type DetailTab } from "./separadores-do-painel";
import { type SeparadorDoPedido } from "@/lib/orcamento/pedidos/proxima-accao";
import { type Avisar } from "../Toast";
import { type RascunhoEncontrado } from "../rascunho-do-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ABRIR UM PEDIDO — da lista, do cliente, da proposta, ou duplicado
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os caminhos que abrem um pedido no painel (ou levam à proposta dele) e o
 * que duplica um pedido. Ler o pedido inteiro antes de o abrir está em
 * `useLeituraDoPedido.ts`.
 *
 * Saiu do corpo do `AdminClient.tsx` (fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`)
 * tal e qual, e é chamado NO MESMO SÍTIO onde o código estava: a ordem dos
 * hooks e dos efeitos do componente não muda. Os nomes ficam os de lá.
 */
export interface EntradasAberturaDoPedido {
  setQuotes: Dispatch<SetStateAction<Quote[]>>;
  setSelected: Dispatch<SetStateAction<Quote | null>>;
  propostasLeves: PropostaLeve[] | undefined;
  abrirPrimeiroDetailTab: (tab: DetailTab) => void;
  separadorPorDecidirRef: RefObject<SeparadorPorDecidir<SeparadorDoPedido> | null>;
  setView: Dispatch<SetStateAction<View>>;
  setPropostaPara: Dispatch<SetStateAction<string | null>>;
  setAAbrir: Dispatch<SetStateAction<{ id: string; nome: string } | null>>;
  toast: Avisar;
  detailOpenerRef: RefObject<HTMLElement | null>;
  locale: "pt" | "en";
  camposDoPedido: (q: Quote) => CamposDoPedido;
  setRascunhoPorRepor: Dispatch<SetStateAction<RascunhoEncontrado | null>>;
  discardGuard: () => boolean;
  comPedidoInteiro: (q: Quote) => Promise<LeituraDoPedido>;
  lembrarRecente: (q: Quote) => void;
  edicao: EdicaoDoPedido;
}

export function useAberturaDoPedido({
  setQuotes,
  setSelected,
  propostasLeves,
  abrirPrimeiroDetailTab,
  separadorPorDecidirRef,
  setView,
  setPropostaPara,
  setAAbrir,
  toast,
  detailOpenerRef,
  locale,
  camposDoPedido,
  setRascunhoPorRepor,
  discardGuard,
  comPedidoInteiro,
  lembrarRecente,
  edicao,
}: EntradasAberturaDoPedido) {
  const {
    setEditPrice,
    setEditNotes,
    setEditStatus,
    setEditAssigned,
    setEditLostReason,
    setEditDate,
    setEditGuests,
    setEditLocation,
    setEditNome,
    setEditEmail,
    setEditTelefone,
    preencherCom,
  } = edicao;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * CARREGAR NUM CLIENTE DA LISTA É IR FAZER-LHE A PROPOSTA — NO ECRÃ TODO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «quando se carrega na página dos pedidos e depois num
   * cliente vai para a parte de fazer a proposta, mas eu quero que […] coloque
   * apenas a página para fazer a proposta do cliente em que se carregou na
   * página toda e não apenas ali de lado, como está na página de fazer
   * propostas».
   *
   * Tinha razão, e o número diz porquê. O painel de detalhe abre-se ao lado da
   * lista e tem tecto próprio (`max-w-3xl`): MEDIDO num Chromium, com a janela
   * a 1440, o estúdio lá dentro tem 712 px de fila. A página inteira dá-lhe os
   * 1600 do `VIEW_WRAP`. É o mesmo estúdio, com mais do dobro do sítio para a
   * coluna onde ela escreve.
   *
   * ── E PORQUE É QUE ISTO NÃO ESTÁ NO `openQuote` ───────────────────────────
   *
   * Há seis portas para abrir um pedido — a lista, o Kanban, o Calendário, os
   * Clientes, o Acompanhamento e a Visão Geral. Só UMA delas é «vou trabalhar
   * nesta proposta»: a lista de Pedidos, que é onde ela escolhe o cliente
   * seguinte. Quem carrega num dia do Calendário quer ver o pedido daquele dia,
   * não ser levado para dentro de um editor — por isso o `openQuote` fica como
   * está, e é só o caminho da lista que muda.
   *
   * (2/11: isto deixou de valer. Ela desfez a decisão do Calendário e depois a
   * das outras portas — todas passam pelo `abrirCliente`, aqui em baixo, e o
   * painel fica só atrás do «Abrir o pedido».)
   *
   * O painel continua a uma tecla de distância: a página tem «Abrir o pedido»
   * ao lado de «Trocar de cliente», e leva ao painel com Produção, Financeiro e
   * as mensagens.
   */
  async function irFazerAProposta(pedido: Quote) {
    if (!discardGuard()) return;
    /**
     * ── A PÁGINA ENTRA JÁ, E O PEDIDO INTEIRO CHEGA POR TRÁS ────────────────
     *
     * A primeira versão disto esperava pelo `comPedidoInteiro` antes de mudar
     * de ecrã, como faz o painel. MEDIDO num Chromium, do clique ao cabeçalho:
     * **1609 ms**. Mil e seiscentos milissegundos a olhar para a lista antes de
     * a animação sequer começar — e nenhuma animação salva uma espera dessas.
     * A regra dela é essa mesma: nenhuma animação pode atrasar uma tarefa.
     *
     * E não é preciso esperar. O ecrã «Fazer proposta» SEMPRE abriu o estúdio
     * sobre o pedido que está na lista — é o que faz desde que existe, pela
     * porta da barra lateral. O que o `comPedidoInteiro` traz a mais são as
     * colecções pesadas (convidados, material) que o PAINEL mostra e o estúdio
     * não. Por isso aqui entra-se já, e a versão completa entra a seguir, sem
     * ninguém à espera dela.
     *
     * ── E A VERSÃO COMPLETA ENTRA SOZINHA ──────────────────────────────────
     *
     * Não é preciso escrevê-la aqui: o `comPedidoInteiro` já põe o pedido
     * inteiro na lista quando chega (`setQuotes`), e o ecrã lê a lista. Uma
     * segunda escrita aqui seria uma segunda verdade sobre o mesmo pedido.
     *
     * Uma leitura que falhe não diz nada, e não é omissão: o ecrã está a
     * funcionar com o pedido da lista, não há nada que ela possa fazer com o
     * aviso, e é o mesmo «melhor esforço» do `recarregarPedido` aqui em cima.
     * Se ela for ao painel, o «Abrir o pedido» tenta outra vez — e aí, sim,
     * uma falha é dita, porque aí o painel PRECISA do pedido inteiro.
     */
    lembrarRecente(pedido);
    setPropostaPara(pedido.id);
    setView("fazer-proposta");

    void comPedidoInteiro(pedido);
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * TODAS AS PORTAS PARA UM CLIENTE PASSAM POR AQUI (2/11)
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Ela, com a captura do painel antigo aberto a partir do Calendário: «já
   * não existe este formato no back office». E depois, perguntada: o painel
   * fica SÓ atrás do «Abrir o pedido» da página da proposta, e um evento JÁ
   * GANHO abre o Dossier do evento.
   *
   * Por isso a regra é uma e vive aqui:
   *   · pedido ganho (`aceite`) → o Dossier (`/orcamento/admin/evento/<id>`,
   *     o mesmo endereço do botão «Dossier» do painel) — é lá que vivem a
   *     produção, os pagamentos, os convidados e o guião, o que se usa depois
   *     de ganhar;
   *   · os outros → a página de fazer a proposta, no ecrã todo
   *     (`irFazerAProposta`).
   *
   * As portas: a Visão Geral (e os Lembretes e a Agenda lá dentro), o
   * Kanban, os Clientes, o Calendário, as Propostas, o Acompanhamento, as
   * Propostas Aceites, a paleta ⌘K e o «Novo pedido». A lista de Pedidos vai
   * SEMPRE à página (ver `abrirDaListaRef`: é por ela que se chega ao painel
   * de um pedido ganho). Fica de fora, de propósito, o «Abrir o pedido» da
   * página — é ESSE o
   * caminho para o painel (o `openQuote`), que guarda o que ainda só existe
   * nele: a data, os convidados, o local, os contactos, o responsável, as notas
   * internas, duplicar/arquivar/apagar.
   */
  function abrirCliente(pedido: Quote) {
    if (pedido.status === "aceite") {
      if (!discardGuard()) return;
      lembrarRecente(pedido);
      // Uma navegação inteira, e não o `useRouter`: o Dossier é outra rota
      // (outra página, com o seu próprio carregamento), e o `useRouter` exige
      // o router da app montado — o que os ~160 testes que montam este
      // ficheiro sem ele não têm. Ver `navegar.ts`.
      navegarPara(localizeHref(`/orcamento/admin/evento/${pedido.id}`, locale));
      return;
    }
    void irFazerAProposta(pedido);
  }

  async function openQuote(pedido: Quote) {
    if (!discardGuard()) return;
    // Remember who opened the detail so focus can return there on close.
    if (typeof document !== "undefined") {
      detailOpenerRef.current = document.activeElement as HTMLElement | null;
    }
    // A vista muda JÁ — quem clicou num pedido no Calendário ou no Kanban vê a
    // resposta ao clique no mesmo instante em que a dava antes. O que espera
    // pelo servidor é só o painel de detalhe.
    setView("pedidos");
    /**
     * ══════════════════════════════════════════════════════════════════════
     * ABRIR UM PEDIDO ERA MUDO — SEIS VEZES
     * ══════════════════════════════════════════════════════════════════════
     *
     * Do inventário: **seis portas para abrir um pedido — a lista, o Kanban, o
     * Calendário, os Clientes, o Acompanhamento e a Visão Geral — e todas
     * mudas.** Toca-se, e não acontece nada visível enquanto o servidor não
     * responder. Num 4G de quinta são segundos, e o gesto seguinte é tocar
     * outra vez.
     *
     * O painel espera de propósito e por boa razão (ver `comPedidoInteiro`:
     * abrir com o resumo apagava listas de convidados). O que não pode é
     * esperar em silêncio.
     *
     * As seis portas passam todas por aqui, portanto o aviso escreve-se uma
     * vez. Fica por cima de todas as vistas, ao lado do
     * `AvisoDeArmazenamento` — porque quem tocou pode ter tocado no
     * Calendário, e é lá que ele tem de aparecer.
     */
    setAAbrir({ id: pedido.id, nome: pedido.name || "este pedido" });
    const r = await comPedidoInteiro(pedido);
    setAAbrir(null);
    if (!r.ok) {
      toast(r.porque, "error");
      return;
    }
    const q = r.quote;
    setSelected(q);
    lembrarRecente(q);
    preencherCom(q);

    /**
     * O que ficou por gravar da última vez que este pedido esteve aberto.
     *
     * Só se oferece quando é MESMO diferente do que o servidor tem agora: se
     * ela gravou entretanto noutro sítio, ou se os valores calharam iguais,
     * uma barra a perguntar seria ruído — e ruído numa barra destas ensina a
     * carregar em «Descartar» sem ler.
     */
    const ficou = lerRascunho(q.id);
    const diferencas = ficou ? oQueMudou(ficou.campos, camposDoPedido(q)) : [];
    setRascunhoPorRepor(
      ficou && diferencas.length > 0
        ? {
            campos: ficou.campos,
            quando: haQuantoTempo(ficou.em, new Date()),
            mudou: diferencas,
          }
        : null,
    );
    // Open on the tools tab that matches where this pedido is in its lifecycle.
    // Pedido NOVO: os separadores visitados do anterior não valem para este.
    const daFase = propostaDaFaseDoPedido(propostasLeves, q.id);
    const target = detailNextAction(q, daFase).tab;
    const abre = target === "gestao" ? "comunicacao" : target;
    abrirPrimeiroDetailTab(abre);
    // A lista leve ainda não chegou: a escolha foi feita às cegas. Pede-se já
    // (é o MESMO pedido do aquecimento em ociosidade, adiantado — não é um a
    // mais) e, quando chegar, volta-se a escolher se ela não mexeu.
    if (daFase === undefined) {
      separadorPorDecidirRef.current = { quoteId: q.id, tab: abre, desde: Date.now() };
      prefetchList("propostas-leves", "/api/propostas?semDoc=1");
    } else {
      separadorPorDecidirRef.current = null;
    }
  }
  // Stable identity for the memoised QuoteCard's onOpen prop. `irFazerAProposta`
  // is a plain function (closes over discardGuard and many setters), so its
  // reference changes every render — passing it directly would defeat QuoteCard's
  // memo. A ref that always points at the latest one keeps behaviour identical
  // while giving the row a callback whose identity never changes.
  //
  // O que está aqui dentro mudou de `openQuote` para `irFazerAProposta`: é ESTA
  // a porta da lista de Pedidos.
  //
  // E fica no `irFazerAProposta` mesmo para um pedido GANHO (o `abrirCliente`
  // mandá-lo-ia ao Dossier): a página da proposta só deixa ESCOLHER pedidos por
  // fazer, e o «Abrir o pedido» dela é o único caminho para o painel — onde se
  // muda a data, os contactos, as notas, ou se corrige o estado. Se a lista
  // também fosse ao Dossier, o painel de um pedido ganho ficava sem porta.
  const abrirDaListaRef = useRef(irFazerAProposta);
  // Keep the ref pointing at the latest closure (updated in an effect, not
  // during render). onOpen fires from a click, which is always after commit, so
  // it reads the current closure.
  useEffect(() => {
    abrirDaListaRef.current = irFazerAProposta;
  });
  const abrirDaLista = useCallback((q: Quote) => abrirDaListaRef.current(q), []);

  // Clone an event's details into a fresh quote (e.g. a returning client).
  // The date is intentionally left blank — it's a new event to schedule.
  async function duplicateQuote(q: Quote) {
    if (!discardGuard()) return;
    try {
      const res = await fetch("/api/orcamento/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: q.name,
          email: q.email,
          phone: q.phone,
          company: q.company,
          category: q.category,
          eventType: q.eventType,
          eventName: q.eventName,
          location: q.location,
          guests: q.guests,
          notes: q.notes,
          referralSource: q.referralSource || "Cliente recorrente",
          status: "em_revisao",
          // Uma cópia: um telefone antigo, gravado antes das regras do país,
          // fica como estava em vez de impedir a cópia (achado n.º 21).
          duplicado: true,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.quote) {
        // A recusa do servidor diz o campo e o que fazer; o genérico só fica
        // para quando não vem razão nenhuma.
        toast(
          typeof data?.error === "string" && data.error
            ? `Não foi possível duplicar o pedido: ${data.error}`
            : "Não foi possível duplicar o pedido",
          "error",
        );
        return;
      }
      setQuotes((prev) => [data.quote, ...prev]);
      setSelected(data.quote);
      setEditPrice("");
      setEditNotes("");
      setEditStatus(data.quote.status);
      setEditAssigned(data.quote.assignedTo ?? "");
      setEditLostReason("");
      setEditDate(data.quote.date ?? "");
      setEditGuests(String(data.quote.guests ?? ""));
      setEditLocation(data.quote.location ?? "");
      setEditNome(data.quote.name ?? "");
      setEditEmail(data.quote.email ?? "");
      setEditTelefone(data.quote.phone ?? "");
      // Pedido NOVO (é uma cópia): recomeça os separadores visitados.
      abrirPrimeiroDetailTab("comunicacao");
      toast("Pedido duplicado — define a nova data", "success");
      if (typeof data.aviso === "string" && data.aviso) toast(data.aviso, "info");
    } catch {
      toast("Não foi possível duplicar o pedido", "error");
    }
  }
  return { abrirCliente, openQuote, abrirDaLista, duplicateQuote };
}
