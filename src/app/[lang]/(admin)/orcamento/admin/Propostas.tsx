"use client";

import { asPropostasMudaram } from "./percentagem-do-sinal";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Proposal, ProposalStatus, Quote } from "@/lib/orcamento/types";
import { SkeletonList } from "./Skeleton";
import { useToast } from "./Toast";
import { MenuDeAccoes, TabelaOuCartoes, type AccaoDeItem } from "./ui";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { Button, Card, EmptyState, PerguntaDestrutiva, Segmented } from "./ui";
import type { SegmentedOption } from "./ui";
import { useCachedList } from "./useCachedList";
import { metaFor, tintaDoRotulo } from "./status-meta";
import { porqueFalhou, porqueRebentou, type Falha } from "@/lib/porque-falhou";
import {
  lugaresNoCliente,
  etiquetaDoLugar,
  explicacaoDoLugar,
  type LugarNoCliente,
} from "@/lib/orcamento/propostas-do-mesmo-cliente";
import { casaComAProcura } from "@/lib/procura";
import { contasDosPedidos } from "@/lib/orcamento/dinheiro-dos-pedidos";
import { dataCurta } from "@/lib/data-curta";
import { useAccoesDaPropostaEnviada } from "./accoesDaPropostaEnviada";
import { useAnular } from "./ui/anular";
import { useDepoisDeApagar } from "./ui/depois-de-apagar";
import { reporEstadoDoPedido } from "./anular-estado";

/**
 * Quando a proposta seguiu — ou, numa por enviar, quando foi gerada. É por
 * aqui que a lista se ordena: palavras dela, «se eu quiser ver as propostas
 * que já mandei não consigo», e a lista estava por ordem alfabética do cliente.
 */
const quandoDe = (p: Proposal) => p.sentAt || p.createdAt;

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);
/** O valor de UMA proposta, com cêntimos — achado n.º 11: a coluna dizia
 *  «5473 €» de uma proposta de 5.473,40 €. Os totais dos cartões de cima
 *  continuam arredondados (são uma ordem de grandeza, não um número a
 *  conferir). */
const eurCentimos = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);

const STATUS_META: Record<ProposalStatus, { label: string; color: string }> = {
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * «GERADA, POR ENVIAR» — E PORQUE É QUE ISTO DEIXOU DE SER «RASCUNHO»
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Este estado passou a existir MESMO na base de dados. A proposta que o
   * estúdio gera fica guardada antes de o email sair (é o que impede as
   * propostas duplicadas), e quando o correio não a aceita — SMTP em baixo,
   * contacto errado — fica assim: um documento feito, gravado, que ninguém
   * recebeu. Antes ficava «Enviada» e ela esperava por uma resposta que não
   * podia chegar.
   *
   * A palavra é «Gerada, por enviar» e não «Rascunho»: rascunho é uma coisa por
   * acabar, e esta está acabada — só não saiu. E é ÂMBAR, a mesma cor com que
   * este ecrã já avisa: é a única linha da lista que pede alguma coisa dela
   * hoje.
   */
  rascunho: { label: "Gerada, por enviar", color: "#a9781f" },
  enviada: { label: "Enviada", color: "#9aa36a" },
  em_negociacao: { label: "Em negociação", color: "#7d8a55" },
  aceite: { label: "Aceite", color: "#525a2f" },
  rejeitada: { label: "Recusada", color: "#5a5a55" },
};

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTAS RUBRICAS DE ORÇAMENTO TEM ESTA PROPOSTA — E PORQUE É QUE NÃO ERA ISTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A coluna desenhava `p.lineItems.length` e dizia SEMPRE 0.
 *
 * As `lineItems` são do FORMATO ANTIGO: a tabela de descrição/quantidade/preço
 * do `ProposalBuilder`, que a rota `/api/orcamento/[id]/proposta` grava e que o
 * portal do cliente ainda desenha. Esse formato não morreu — continua atrás de
 * um link no painel do pedido — mas deixou de ser o que se usa.
 *
 * A proposta que ela faz hoje sai do ESTÚDIO, e essa rota
 * (`/api/orcamento/[id]/proposta-doc`) grava `lineItems: []` à nascença: o
 * detalhe não cabe em três colunas, vive no documento — as rubricas em
 * `doc.budgetItems`, os grupos de serviços em `doc.serviceGroups`, os preços no
 * array paralelo `doc.budgetAmounts`. O `[]` não é um esquecimento: é a mesma
 * decisão que faz a página do cliente esconder o cabeçalho da tabela de linhas
 * quando não há linhas (ver `proposta/[token]/page.tsx`). O que faltava era
 * alguém dizer isso à coluna.
 *
 * ── O QUE SE CONTA, E O QUE NÃO SE CONTA ─────────────────────────────────
 *
 * Contam-se RUBRICAS DE ORÇAMENTO — as linhas do quadro «Orçamento Proposto».
 * É o mesmo objecto nos dois formatos (uma linha de dinheiro), por isso o
 * número é comparável entre uma proposta de 2025 e uma de hoje.
 *
 * NÃO se somam os grupos de serviços. Uma proposta de referência tem 40
 * rubricas e 1 grupo; 41 não é o tamanho de nada, e «1» responderia a uma
 * pergunta que ninguém fez nesta coluna. Quem quiser o outro número tem-no no
 * «Criar a partir de…», que mostra grupos e linhas lado a lado, com nome.
 *
 * Devolve `null` quando não há nada para contar — e aí a célula escreve «—» em
 * vez de «0». Um zero numa coluna de números convida a comparar («esta tem 0,
 * aquela tem 40»), e o que se passa é outra coisa: aquela proposta não tem
 * orçamento detalhado nenhum para contar.
 *
 * ── DE ONDE VÊM OS DADOS, E PORQUE É QUE ESTE ECRÃ FICOU DE FORA DA MUDANÇA
 * PARA A ROTA LEVE ────────────────────────────────────────────────────────
 *
 * Isto lê o `doc`, e esta lista pede `/api/propostas` INTEIRO. Há uma forma
 * leve da mesma rota (`?semDoc=1`, chave "propostas-leves") que omite o
 * documento de propósito, e a Acompanhamento e a Análise já passaram para
 * ela: nenhuma das duas lia mais do que `opcionaisDe(doc)`, e a rota leve já
 * calcula exactamente isso em `temOpcionais`.
 *
 * Este ecrã é diferente: a coluna «Rubricas» lê `doc.budgetItems.length`, e
 * não há nenhum facto derivado equivalente na forma leve (só `temDoc`,
 * `temOpcionais` e `pctSinal` viajam sem o documento). Mudar para lá dava
 * sempre «—» em toda a proposta do estúdio, que é o formato de hoje: não é
 * bem «nada rebenta», é a coluna deixar de dizer o que diz agora. O teste
 * "a coluna conta o que está mesmo no documento" prende precisamente essa
 * contagem, e é ele que confirma que este ecrã não pode fazer a mesma
 * mudança sem primeiro a rota leve aprender a levar a contagem consigo.
 */
function rubricasDe(p: Proposal): number | null {
  // O documento manda quando existe: uma proposta do estúdio tem sempre
  // `lineItems: []`, e cair para elas dava o zero de sempre.
  const n = p.doc ? (p.doc.budgetItems?.length ?? 0) : (p.lineItems?.length ?? 0);
  return n > 0 ? n : null;
}

function expiryInfo(
  validUntil?: string,
): { label: string; tone: "ok" | "soon" | "expired" } | null {
  if (!validUntil) return null;
  const days = Math.round((new Date(validUntil + "T12:00:00").getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: "Prazo terminado", tone: "expired" };
  if (days === 0) return { label: "Termina hoje", tone: "soon" };
  if (days === 1) return { label: "Termina amanhã", tone: "soon" };
  if (days <= 5) return { label: `Termina em ${days} dias`, tone: "soon" };
  return { label: `Válida mais ${days} dias`, tone: "ok" };
}

/**
 * Uma linha da lista, memoizada.
 *
 * Sem isto, marcar UMA proposta como aceite (que muda `actionBusy`) voltava a
 * desenhar as 202 linhas — e mudar de filtro custava, medido, um evento de
 * 104 ms (uma tarefa longa de 89 ms). A linha só depende da proposta, do pedido
 * ligado e de estar ocupada.
 */
/** O estado da proposta. Partilhado pela tabela e pelo cartão de propósito: as
 *  duas formas têm de dizer exactamente a mesma coisa. */
function EstadoChip({ p }: { p: Proposal }) {
  const meta = metaFor(STATUS_META, p.status);
  return (
    <span
      className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]"
      style={{ background: `${meta.color}1f`, color: tintaDoRotulo(meta.color) }}
    >
      {meta.label}
    </span>
  );
}

/** "Expira em 3 dias" / "Expirada". Nada quando não há validade definida. */
function ValidadeChip({ p }: { p: Proposal }) {
  const exp = expiryInfo(p.validUntil);
  if (!exp) return null;
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${
        exp.tone === "expired"
          ? "bg-[var(--bo-perigo)]/10 text-[var(--bo-perigo)]"
          : exp.tone === "soon"
            ? "bg-[var(--bo-aviso-tom)]/12 text-[var(--bo-aviso)]"
            : "bg-[var(--bo-tinta-6)] text-foreground/45"
      }`}
    >
      {exp.label}
    </span>
  );
}

/**
 * ── «MELANIE E SEBASTIEN» APARECE DUAS VEZES ──────────────────────────────
 *
 * A-01 da auditoria. A lista continua a mostrar TUDO o que mostrava — cada
 * proposta é um documento com o seu valor, o seu estado e a sua validade, e
 * esconder uma atrás da outra tirava-lhe da vista a que estava a expirar.
 *
 * O que muda é que cada linha passa a saber que não está sozinha. É essa a
 * pergunta que ela faz quando vê o mesmo nome duas vezes: *é um engano meu, ou
 * são mesmo duas propostas?*
 *
 * O tom é neutro de propósito — não é um aviso, é um facto. Um cliente com
 * três propostas não tem nada de errado; o que estava errado era não se saber.
 */
function LugarDoCliente({ lugar }: { lugar: LugarNoCliente }) {
  return (
    <span
      className="ml-1.5 inline-flex shrink-0 items-center rounded-full bg-[var(--bo-tinta-6)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--bo-text-muted)] align-middle"
      title={explicacaoDoLugar(lugar)}
    >
      {etiquetaDoLugar(lugar)}
    </span>
  );
}

interface Props {
  quotes?: Quote[];
  onOpenQuote?: (q: Quote) => void;
  /** Lets the parent sync its quote state when accepting a proposal also moves the pedido. */
  onQuoteUpdated?: (q: Quote) => void;
  /** Quem está a trabalhar — vai como `actor` na entrada do histórico do pedido. */
  userName?: string;
  /**
   * A procura com que o ecrã abre — o «Ver em Propostas» do Fazer proposta
   * traz o nome que ela procurou lá, em vez de a deixar na lista inteira.
   */
  procuraInicial?: string;
}

export default function Propostas({
  quotes,
  onOpenQuote,
  onQuoteUpdated,
  userName,
  procuraInicial = "",
}: Props) {
  const { toast } = useToast();
  const anular = useAnular();
  // Apagar deixa a proposta 30 dias na Reciclagem (R3b), com «Anular».
  const depoisDeApagar = useDepoisDeApagar();
  const {
    accoesDe: accoesDaEnviada,
    botaoDe: botaoDaEnviada,
    folha: folhaDoEmail,
  } = useAccoesDaPropostaEnviada();
  const [procura, setProcura] = useState(procuraInicial);
  // A mesma procura de outra vista, quando ela volta cá com outro nome.
  useEffect(() => setProcura(procuraInicial), [procuraInicial]);
  const procuraAdiada = useDeferredValue(procura);
  const {
    data: proposals = [],
    setData: setProposals,
    loading,
    error: loadError,
    refresh: retryLoad,
  } = useCachedList<Proposal[]>("propostas", "/api/propostas");
  const [filter, setFilter] = useState<ProposalStatus | "all">("all");
  // O chip acende-se já; a lista (202 linhas) é reconstruída a seguir, em
  // prioridade baixa. Medido: sem isto, um clique no filtro era um evento de
  // 104 ms — acima do limiar em que um clique deixa de parecer instantâneo.
  const deferredFilter = useDeferredValue(filter);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  /**
   * A proposta à espera de resposta à pergunta de a apagar.
   *
   * Guarda-se o `id` e o nome do cliente: é o nome que vai na pergunta, e numa
   * lista de dezenas de propostas é a única coisa que diz em qual linha ela
   * tocou.
   */
  const [aApagar, setAApagar] = useState<{ id: string; nome: string } | null>(null);

  // Índice id→pedido: evita um varrimento linear de todos os pedidos por cada
  // linha da lista (e dentro de `updateStatus`).
  const quotesById = useMemo(() => {
    const m = new Map<string, Quote>();
    for (const q of quotes ?? []) m.set(q.id, q);
    return m;
  }, [quotes]);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * «NÃO FOI POSSÍVEL ATUALIZAR A PROPOSTA» ERA A MESMA FRASE PARA SEIS COISAS
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Aceitar uma proposta é o gesto mais consequente deste ecrã — move o pedido,
   * fecha o negócio, e não se desfaz. Falhava com uma frase que servia à rede
   * em baixo, à sessão expirada, à proposta apagada por outra pessoa e ao
   * servidor em baixo por igual, e a única saída que oferecia («Tenta
   * novamente») não pode funcionar em três desses casos.
   *
   * Ao contrário do Quadro, aqui NÃO há actualização optimista: a linha só muda
   * depois de o servidor confirmar. Por isso a frase não tem de falar de nada
   * que tenha recuado no ecrã — não recuou nada.
   */
  async function updateStatus(id: string, status: ProposalStatus) {
    setActionBusy(id);
    // Pela ref, e não pelo `proposals` do fecho: o `confirmAndUpdate` que
    // chama isto é estável (não muda de identidade), e por isso guarda o
    // `updateStatus` do PRIMEIRO desenho — com a lista ainda vazia. Lida daí,
    // a proposta «antes» não existia e o «Anular» nunca aparecia.
    const antes = latest.current.proposals.find((p) => p.id === id);
    const nome = antes?.clientName ?? "esta proposta";
    // O pedido como estava ANTES — o «Aceitar» move-o para Ganho, e o «Anular»
    // tem de o pôr de volta onde estava.
    const pedidoAntes = antes ? latest.current.quotesById.get(antes.quoteId)?.status : undefined;
    const oQue = `marcar a proposta de «${nome}» como ${STATUS_META[status].label.toLowerCase()}`;
    try {
      const res = await fetch(`/api/propostas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // `actor` não é da proposta: é só para a linha do histórico do PEDIDO,
        // que este gesto move. O servidor não sabe quem está sentado do outro
        // lado — a sessão do back office é uma só e não tem nome.
        body: JSON.stringify({ status, respondedAt: new Date().toISOString(), actor: userName }),
      });
      if (!res.ok) {
        toast(porqueFalhou(oQue, res, await res.json().catch(() => null)).mensagem, "error");
        return;
      }
      // A lista leve (fase do pedido, Pagamentos, Cobranças) relê-se uma vez.
      asPropostasMudaram();
      /**
       * ── O PEDIDO JÁ VEM MOVIDO ────────────────────────────────────────────
       *
       * Aqui estavam trinta linhas que faziam um SEGUNDO pedido HTTP para pôr
       * o pedido em «Ganho» depois de a proposta ficar aceite. A regra estava
       * certa e estava no sítio errado, por duas razões:
       *
       *  · só valia NESTE ecrã. O «Acompanhamento» muda o mesmo estado da mesma
       *    proposta e não mexia no pedido — e marcar uma proposta como ENVIADA,
       *    aqui ou lá, também não. Foi assim que uma auditoria em produção
       *    encontrou a Margarida Serra com duas propostas enviadas por email e o
       *    pedido dela ainda na coluna «Novo»;
       *  · e eram dois pedidos pela rede num back office que se usa em quintas,
       *    num 4G fraco. Se o segundo não chegava, a proposta ficava aceite e o
       *    pedido ficava para trás.
       *
       * A decisão passou para o servidor, dentro do próprio PATCH (ver
       * `api/propostas/[id]/route.ts`), que é a porta por onde os dois ecrãs e a
       * API passam. O que vem de volta é a proposta com o pedido JÁ GRAVADO ao
       * lado — uma ida à rede, e a mesma verdade nos dois sítios.
       *
       * O `pedido` sai do objecto antes de a proposta entrar no estado: a lista
       * guarda propostas, e um campo a mais que ninguém lê é um campo que um dia
       * alguém volta a gravar sem querer.
       */
      const { pedido, ...updated } = (await res.json()) as Proposal & { pedido?: Quote };
      setProposals((prev) => prev.map((p) => (p.id === id ? updated : p)));
      if (pedido) onQuoteUpdated?.(pedido);

      /**
       * ── E VOLTA ATRÁS ───────────────────────────────────────────────────
       * Palavras dela: «tem que haver no site todo, em tudo aquilo que se
       * faz, uma forma de voltar atrás». «Anular» repõe a proposta como
       * estava e, se o «Aceitar» pôs o pedido em Ganho, põe-no de volta —
       * levando o contrato pendente que isso criou (ver `anular-estado.ts`).
       */
      if (antes && (status === "aceite" || status === "rejeitada")) {
        anular(
          status === "aceite"
            ? `Proposta de ${updated.clientName} aceite.`
            : "Proposta marcada como recusada.",
          async () => {
            if (pedido && pedidoAntes && pedidoAntes !== pedido.status) {
              const reposto = await reporEstadoDoPedido({
                quoteId: antes.quoteId,
                de: pedidoAntes,
                para: pedido.status,
                actor: userName,
                semReler: true,
              });
              if (reposto) onQuoteUpdated?.(reposto);
            }
            const r = await fetch(`/api/propostas/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: antes.status,
                respondedAt: antes.respondedAt ?? "",
                actor: userName,
              }),
            });
            if (!r.ok) throw new Error("Não foi possível repor a proposta.");
            asPropostasMudaram();
            const { pedido: _p, ...reposta } = (await r.json()) as Proposal & { pedido?: Quote };
            void _p;
            setProposals((prev) => prev.map((x) => (x.id === id ? reposta : x)));
          },
        );
      }
    } catch {
      toast(porqueRebentou(oQue).mensagem, "error");
    } finally {
      setActionBusy(null);
    }
  }

  // A lista actual e o `onOpenQuote` do pai, numa ref: os manipuladores que
  // vão parar às 202 linhas memoizadas têm de manter a mesma identidade, senão
  // o `memo()` falha sempre e não poupa nada.
  const latest = useRef({ proposals, onOpenQuote, quotesById });
  useEffect(() => {
    latest.current = { proposals, onOpenQuote, quotesById };
  });

  const handleOpenQuote = useCallback((q: Quote) => latest.current.onOpenQuote?.(q), []);

  // Aceitar/recusar é uma ação de negócio consequente (aceitar é irreversível e
  // move o pedido). Pedimos confirmação antes de avançar.
  const confirmAndUpdate = useCallback(
    (id: string, status: ProposalStatus) => {
      const p = latest.current.proposals.find((x) => x.id === id);
      const name = p?.clientName ?? "este cliente";
      const message =
        status === "aceite"
          ? `Marcar a proposta de ${name} como ACEITE?\n\nO pedido associado passa também a "Ganho". Podes anular logo a seguir.`
          : `Marcar a proposta de ${name} como recusada?`;
      if (typeof window !== "undefined" && !window.confirm(message)) return;
      void updateStatus(id, status);
    },
    // updateStatus fecha sobre o estado actual via setters; a lista chega pela
    // ref, por isso este callback nunca muda de identidade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /**
   * Apagar uma proposta da lista. Pede confirmação (é irreversível) e repõe a
   * proposta se o servidor recusar, para nunca desaparecer sem ter sido
   * guardado.
   *
   * A LINHA QUE VOLTA À LISTA TEM DE APARECER NA FRASE. A remoção é optimista:
   * a linha sai da lista no instante do clique e, quando o servidor recusa,
   * reaparece onde estava. Quem estava a olhar vê uma linha que tinha apagado
   * voltar sozinha, e o aviso — «Não foi possível apagar a proposta» — nem
   * dizia de quem era, nem que aquela ressurreição era a reversão. Numa lista
   * com dezenas de propostas, isso lê-se como um defeito do ecrã.
   */
  const deleteProposal = useCallback(
    async (id: string) => {
      const snapshot = latest.current.proposals;
      const p = snapshot.find((x) => x.id === id);
      const name = p?.clientName ?? "esta proposta";
      setActionBusy(id);
      setProposals((prev) => prev.filter((x) => x.id !== id));
      const oQue = `apagar a proposta de «${name}»`;
      const reverter = (falha: Falha) => {
        setProposals(snapshot);
        toast(`${falha.mensagem} A proposta voltou à lista.`, "error");
      };
      let res: Response;
      try {
        res = await fetch(`/api/propostas/${id}`, { method: "DELETE" });
      } catch {
        reverter(porqueRebentou(oQue));
        setActionBusy(null);
        return;
      }
      const corpo = await res.json().catch(() => null);
      if (!res.ok) reverter(porqueFalhou(oQue, res, corpo));
      else {
        asPropostasMudaram();
        depoisDeApagar(corpo, "Proposta apagada.", () => void retryLoad());
      }
      setActionBusy(null);
    },
    [setProposals, toast, depoisDeApagar, retryLoad],
  );

  /**
   * Contado sobre TODAS as propostas, e não sobre as filtradas.
   *
   * Se fosse sobre a lista visível, filtrar por «Aceites» transformava «2.ª de
   * 3» em «1.ª de 1» — o número passava a descrever o filtro em vez de
   * descrever o cliente, e desaparecia exactamente quando ela está a comparar
   * duas propostas do mesmo casal.
   */
  const lugares = useMemo(() => lugaresNoCliente(proposals), [proposals]);

  /**
   * ── A MAIS RECENTE PRIMEIRO ───────────────────────────────────────────────
   *
   * Havia aqui uma ordem pensada à mão (por enviar, depois as enviadas pela
   * validade) — e a tabela anulava-a, porque abria ordenada por cliente. Na
   * prática a lista era alfabética, e ela não encontrava a proposta que tinha
   * mandado ontem. Passa a ser a data em que seguiu, a mais recente em cima,
   * que é a pergunta que se faz a este ecrã. As por enviar e as que expiram
   * continuam a ter o seu aviso lá em cima.
   */
  const filtered = useMemo(() => {
    const t = procuraAdiada.trim().toLowerCase();
    return (
      deferredFilter === "all" ? proposals : proposals.filter((p) => p.status === deferredFilter)
    )
      .filter((p) => casaComAProcura(t, [p.clientName, p.clientEmail, p.quoteId]))
      .slice()
      .sort((a, b) => +new Date(quandoDe(b)) - +new Date(quandoDe(a)));
  }, [proposals, deferredFilter, procuraAdiada]);

  const stats = useMemo(() => {
    // Re-sending a proposal for the same couple creates a NEW row (a revision),
    // so a single deal can appear several times. Counting every row would
    // triple-count "valor enviado" and skew the accept-rate. Dedupe to the
    // latest proposal per quote before computing KPIs. (Rows without a quoteId
    // — e.g. legacy — fall back to their own id so they still count once.)
    const latestByQuote = new Map<string, (typeof proposals)[number]>();
    for (const p of proposals) {
      const key = p.quoteId || `id:${p.id}`;
      const cur = latestByQuote.get(key);
      if (!cur || +new Date(p.createdAt) > +new Date(cur.createdAt)) latestByQuote.set(key, p);
    }
    const unique = [...latestByQuote.values()];
    // Geradas mas por enviar: o email não saiu, o cliente não recebeu nada.
    const porEnviarLista = unique.filter((p) => p.status === "rascunho");
    const porEnviar = porEnviarLista.length;
    /**
     * ── O DINHEIRO É O DOS PEDIDOS, COMO NA VISÃO GERAL ─────────────────────
     * Pedido dela (14/10): «num sítio diz uma coisa noutro diz outra». Este
     * ecrã somava as PROPOSTAS pelo estado delas (e o «enviado» juntava as
     * aceites); a Visão Geral somava os PEDIDOS pelo estado que ela lhes deu.
     * Ela escolheu: manda o estado do pedido. As contas são as de
     * `dinheiro-dos-pedidos.ts`, as mesmas da Visão Geral, das Estatísticas,
     * do Kanban e dos Clientes — com estas propostas para a taxa de IVA.
     */
    const contas = contasDosPedidos(quotes ?? [], proposals);
    // Quantos PEDIDOS distintos têm proposta. É o denominador de tudo o que
    // está aqui em cima, e passou a estar no ecrã — ver a nota dos KPIs.
    return {
      aEspera: contas.aEspera.valor,
      totalWon: contas.ganho.valor,
      acceptRate: contas.taxaDeFecho,
      pending: contas.aEspera.n,
      porEnviar,
      porEnviarLista,
      pedidos: unique.length,
    };
  }, [proposals, quotes]);
  const { aEspera, totalWon, acceptRate, pending, porEnviar, porEnviarLista, pedidos } = stats;
  /** O pedido de uma proposta, se este ecrã souber abri-lo. */
  const pedidoDa = (p: Proposal) => (onOpenQuote ? quotesById.get(p.quoteId) : undefined);
  const soUmPorEnviar = porEnviarLista.length === 1 ? pedidoDa(porEnviarLista[0]) : undefined;

  const filterOptions: SegmentedOption<ProposalStatus | "all">[] = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of proposals) counts[p.status] = (counts[p.status] ?? 0) + 1;
    return [
      { value: "all", label: `Todas · ${proposals.length}` },
      // O chip de «Gerada, por enviar» ficava de fora porque o estado não era
      // persistido no servidor (os rascunhos viviam só no browser) e aparecia
      // sempre a 0. Passou a ser: é assim que fica uma proposta cujo email não
      // saiu, e é o primeiro sítio onde ela vai querer filtrar.
      ...(Object.keys(STATUS_META) as ProposalStatus[]).map((s) => ({
        value: s,
        label: `${STATUS_META[s].label} · ${counts[s] ?? 0}`,
      })),
    ];
  }, [proposals]);

  if (loading) return <SkeletonList rows={5} />;

  if (loadError) {
    return (
      <Card padding="md" className="flex flex-col items-center gap-4 text-center py-10">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bo-perigo)]/10 text-[var(--bo-perigo)]">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <p className="text-[var(--bo-text)] text-sm font-medium">
            Não foi possível carregar as propostas
          </p>
          <p className="text-foreground/50 text-xs mt-1">
            Verifica a ligação à internet e tenta novamente.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={retryLoad}>
          Tentar novamente
        </Button>
      </Card>
    );
  }

  /**
   * As acções de uma proposta, como DADOS — a forma é do `MenuDeAccoes`, que
   * sabe se as pode esconder no hover ou se as tem de mostrar sempre.
   *
   * Antes eram quatro botões de texto soltos em cada linha: no computador
   * enchiam a linha de ruído e roubavam largura ao que interessa; no telemóvel
   * embrulhavam para a linha de baixo, com "Apagar" a acabar ao lado de
   * "Aceitar".
   */
  const paraAccoes = (p: Proposal) => ({
    id: p.id,
    quoteId: p.quoteId,
    temDoc: !!p.doc,
    enviada: !!p.sentAt,
    titulo: `${p.clientName}${p.sentAt ? ` · enviada ${dataCurta(p.sentAt)}` : ""}`,
  });
  const accoesDa = (p: Proposal): AccaoDeItem[] => {
    // Primeiro, VER o que seguiu — a pergunta que este ecrã não sabia responder.
    const lista: AccaoDeItem[] = accoesDaEnviada(paraAccoes(p));
    if (p.status === "enviada") {
      lista.push({
        id: "aceitar",
        rotulo: "Aceitar",
        desativada: actionBusy === p.id,
        onAccao: () => confirmAndUpdate(p.id, "aceite"),
      });
      lista.push({
        id: "recusar",
        rotulo: "Recusar",
        desativada: actionBusy === p.id,
        onAccao: () => confirmAndUpdate(p.id, "rejeitada"),
      });
    }
    const pedido = quotesById.get(p.quoteId);
    if (pedido && onOpenQuote) {
      lista.push({ id: "pedido", rotulo: "Ver pedido", onAccao: () => handleOpenQuote(pedido) });
    }
    lista.push({
      id: "apagar",
      rotulo: "Apagar",
      destrutiva: true,
      desativada: actionBusy === p.id,
      onAccao: () => setAApagar({ id: p.id, nome: p.clientName }),
    });
    return lista;
  };

  return (
    <div className="flex flex-col gap-6">
      {/* One calm line saying what this screen is for */}
      <p
        style={{ "--cena": 0 } as React.CSSProperties}
        className="bo-cena text-sm leading-relaxed text-[var(--bo-text-muted)]"
      >
        Aqui vês as propostas que enviaste aos clientes e acompanhas quais foram aceites. Em{" "}
        <strong className="font-medium text-[var(--bo-text)]">
          Ver o que foi enviado para o cliente
        </strong>
        , em cada proposta, abres o PDF, o link e o email que o cliente recebeu.
      </p>

      {/*
        ══════════════════════════════════════════════════════════════════════
        OS NÚMEROS DE CIMA CONTAM PEDIDOS. A LISTA DE BAIXO CONTA PROPOSTAS.
        ══════════════════════════════════════════════════════════════════════

        Rever e reenviar é o funcionamento normal: duas propostas para o mesmo
        casal. E este ecrã dizia, ao mesmo tempo e sem uma palavra a explicar,
        «2 Propostas», «Todas · 2», «1 proposta enviada aguarda resposta» e
        «15 375 € enviados». Os dois últimos são deduplicados por pedido
        (`latestByQuote`); os dois primeiros não eram. Nenhum estava errado —
        mas estavam lado a lado, do mesmo tamanho, e não havia como conciliá-los
        a olho. Quem somasse ficava com o dobro do dinheiro que saiu de casa.

        As duas contagens FICAM, porque são duas perguntas diferentes e as duas
        interessam: «quantos clientes estão à espera de mim» (o pedido) e
        «quantos documentos fiz» (a proposta). O que muda é que cada uma passa a
        dizer o que é.

        Aqui em cima manda o PEDIDO, e é a população certa para este bloco: quem
        olha para os quatro números quer saber quanto dinheiro está lá fora e
        quantos negócios estão em jogo — e uma proposta revista não é dinheiro a
        dobrar nem um cliente a mais. Por isso o primeiro cartão deixou de ser
        «Propostas» (todas as linhas) e passou a ser «Pedidos com proposta», da
        mesma população dos outros três e dos dois avisos.

        A linha que os concilia está logo a seguir aos avisos, à entrada da
        lista — que é onde o outro número aparece.
      */}
      <div style={{ "--cena": 1 } as React.CSSProperties} className="bo-cena flex flex-col gap-2">
        <p className="bo-eyebrow text-foreground/40">
          Por pedido · conta o estado que deste ao pedido, como na Visão Geral
        </p>
        {/* ══════════════════════════════════════════════════════════════════
            UM NÚMERO MANDA, OS OUTROS TRÊS ACOMPANHAM
            ══════════════════════════════════════════════════════════════════

            Eram quatro cartões com o MESMO peso — `clamp(20px, 2.2vw, 28px)`
            nos quatro — e dois deles pintados de verde, sem que a cor
            distinguisse coisa nenhuma: o verde caía no «Pedidos com proposta»
            e no «Valor já ganho», que não são da mesma família. É o mesmo
            defeito que a Visão Geral tinha e que o padrão 08 já lá corrigiu.

            O herói deste ecrã é o VALOR JÁ GANHO. A pergunta a que este ecrã
            responde é «as propostas que enviei estão a dar dinheiro?», e é esse
            o número que a responde — não a contagem de pedidos, que é
            arrumação, nem a percentagem, que é a mesma resposta dita de uma
            maneira em que ela já disse não confiar.

            A cor sai dos cartões e o tamanho fica com o trabalho: 48 px contra
            22 é uma diferença que se lê antes de se ler o rótulo. O verde volta
            a ser só do herói — «cor só na acção», que é a regra que os dois
            cartões pintados estavam a gastar à toa. */}
        <div className="flex flex-col gap-3">
          <Card padding="sm" className="flex flex-col gap-2">
            <p
              className="font-light leading-none tabular-nums text-sage-600"
              style={{ fontSize: "clamp(32px, 4.6vw, 48px)" }}
            >
              {eur(totalWon)}
            </p>
            <p className="bo-eyebrow text-foreground/45">Valor já ganho</p>
          </Card>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              // «À espera de resposta» substituiu o «Valor enviado aos
              // clientes» (14/10): esse juntava o que já fora ganho, e não
              // batia com nenhum número da Visão Geral. Este é o MESMO número
              // que lá se chama «À espera» — os pedidos em «Proposta enviada».
              { v: eur(aEspera), l: "À espera de resposta" },
              // Dos pedidos que ganhaste, perdeste ou têm resposta pendente.
              { v: `${acceptRate}%`, l: "Propostas aceites" },
              { v: String(pedidos), l: "Pedidos com proposta" },
            ].map((k) => (
              <Card key={k.l} padding="sm" className="flex flex-col gap-1.5">
                <p
                  className="font-light leading-none tabular-nums text-[var(--bo-text)]"
                  style={{ fontSize: "clamp(19px, 2vw, 22px)" }}
                >
                  {k.v}
                </p>
                <p className="bo-eyebrow text-foreground/45">{k.l}</p>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/*
        O AVISO QUE VEM PRIMEIRO: as que nem sequer saíram.

        Uma proposta à espera de resposta é o funcionamento normal do negócio.
        Uma proposta gerada que ficou em casa é trabalho feito e parado — e era
        invisível, porque o ecrã dizia «Enviada» sobre ela. Fica acima do outro
        aviso, e é vermelho e não âmbar: aqui não se espera por ninguém, falta
        fazer uma coisa.
      */}
      {porEnviar > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--bo-perigo)]/25 bg-[var(--bo-perigo)]/[0.06] px-4 py-3">
          <svg
            className="mt-0.5 shrink-0 text-[var(--bo-perigo)]"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M3 5h18v14H3z" />
            <path d="m3 6 9 7 9-7" />
          </svg>
          <p className="text-[var(--bo-perigo)] text-sm leading-snug">
            <strong className="font-semibold">
              {porEnviar} proposta{porEnviar !== 1 ? "s" : ""} gerada
              {porEnviar !== 1 ? "s" : ""} mas por enviar
            </strong>{" "}
            — o email não saiu e o cliente não recebeu nada. Abre o pedido e envia outra vez: é a
            mesma proposta, não se cria outra.{" "}
            {/* Achado n.º 11: o aviso mandava abrir o pedido e não levava lá. */}
            {soUmPorEnviar ? (
              <button
                type="button"
                onClick={() => handleOpenQuote(soUmPorEnviar)}
                className={`alvo-toque font-semibold underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
              >
                Abrir o pedido
              </button>
            ) : porEnviar > 1 ? (
              <button
                type="button"
                onClick={() => setFilter("rascunho")}
                className={`alvo-toque font-semibold underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
              >
                Ver as {porEnviar}
              </button>
            ) : null}
          </p>
        </div>
      )}

      {/* Pending alert */}
      {pending > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--bo-aviso-tom)]/25 bg-[var(--bo-aviso-tom)]/[0.06] px-4 py-3">
          <svg
            className="shrink-0 text-[var(--bo-aviso)]"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <p className="text-[var(--bo-aviso)] text-sm leading-snug">
            <strong className="font-semibold">
              {pending} proposta{pending !== 1 ? "s" : ""} enviada{pending !== 1 ? "s" : ""}
            </strong>{" "}
            {pending !== 1 ? "aguardam" : "aguarda"} resposta do cliente.
          </p>
        </div>
      )}

      {/* Filter */}
      <div style={{ "--cena": 2 } as React.CSSProperties} className="bo-cena flex flex-col gap-2">
        <input
          type="search"
          value={procura}
          onChange={(e) => setProcura(e.target.value)}
          placeholder="Procurar por cliente, email ou pedido…"
          aria-label="Procurar propostas"
          className="bo-input w-full max-w-md px-3 py-2.5 text-sm text-[var(--bo-tinta-72)]"
        />
        <div className="max-w-full overflow-x-auto pb-1 -mb-1">
          <Segmented
            ariaLabel="Filtrar propostas por estado"
            size="sm"
            quebra="rolar"
            value={filter}
            onChange={setFilter}
            options={filterOptions}
          />
        </div>
        {/*
          A LINHA QUE CONCILIA AS DUAS CONTAGENS.

          O filtro conta LINHAS («Todas · 2»), os cartões e os avisos contam
          PEDIDOS. Sem esta frase, o mesmo ecrã tinha um 2 e um 1 sem relação
          visível, e a leitura natural — somar, ou desconfiar de um deles — era
          a errada nas duas direcções.

          Só aparece quando os dois números DIFEREM: com uma proposta por
          pedido, explicar uma diferença que não existe é ruído em todas as
          visitas para servir a poucas.
        */}
        {proposals.length !== pedidos && (
          <p className="text-xs leading-snug text-foreground/45">
            {proposals.length} propostas para {pedidos} pedido{pedidos !== 1 ? "s" : ""} — rever e
            reenviar cria uma linha nova, e a lista mostra-as todas. Os números e os avisos acima
            contam cada pedido uma vez, pela proposta mais recente.
          </p>
        )}
      </div>

      {/* List */}
      <Card
        padding="none"
        style={{ "--cena": 3 } as React.CSSProperties}
        className="bo-cena overflow-hidden"
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon={
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M9 13h6M9 17h6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            title={
              procuraAdiada.trim()
                ? "Nenhuma proposta com esse nome"
                : deferredFilter !== "all"
                  ? "Nenhuma proposta neste estado"
                  : "Sem propostas ainda"
            }
            description={
              procuraAdiada.trim()
                ? "Tenta outro nome, email ou número do pedido."
                : deferredFilter !== "all"
                  ? "Muda de filtro para ver as restantes."
                  : "As propostas enviadas a partir de um pedido aparecem aqui."
            }
          />
        ) : (
          <div className="p-3 sm:p-4">
            <TabelaOuCartoes
              itens={filtered}
              chaveDe={(p) => p.id}
              legenda="Propostas"
              ordemInicial={{ chave: "enviada", ascendente: false }}
              // Achado n.º 11: clicar numa linha não fazia nada. Abre o pedido —
              // é de lá que se revê, reenvia ou acompanha a proposta.
              aoAbrir={
                onOpenQuote
                  ? (p) => {
                      const pedido = quotesById.get(p.quoteId);
                      if (pedido) handleOpenQuote(pedido);
                    }
                  : undefined
              }
              colunas={[
                {
                  chave: "cliente",
                  cabecalho: "Cliente",
                  ordenar: (a, b) => a.clientName.localeCompare(b.clientName, "pt"),
                  celula: (p) => {
                    const lugar = lugares.get(p.id);
                    return (
                      <span className="block">
                        <span className="block text-[var(--bo-text)]">
                          <span className="truncate align-middle">{p.clientName}</span>
                          {lugar && <LugarDoCliente lugar={lugar} />}
                        </span>
                        <span className="bo-text-muted block truncate text-xs">
                          {p.clientEmail}
                        </span>
                      </span>
                    );
                  },
                },
                {
                  chave: "enviada",
                  cabecalho: "Enviada",
                  ordenar: (a, b) => +new Date(quandoDe(a)) - +new Date(quandoDe(b)),
                  celula: (p) =>
                    p.sentAt ? (
                      <span className="tabular-nums">{dataCurta(p.sentAt)}</span>
                    ) : (
                      <span className="text-[var(--bo-text-muted)]">por enviar</span>
                    ),
                },
                { chave: "estado", cabecalho: "Estado", celula: (p) => <EstadoChip p={p} /> },
                { chave: "validade", cabecalho: "Validade", celula: (p) => <ValidadeChip p={p} /> },
                {
                  // Contexto útil, mas não é por isto que se procura uma
                  // proposta: só aparece quando há mesmo espaço.
                  //
                  // O cabeçalho diz O QUE conta (ver `rubricasDe`). Chamava-se
                  // «Itens» — que podia ser linhas de orçamento, serviços ou
                  // fotografias — e contava um campo que hoje está sempre
                  // vazio.
                  chave: "rubricas",
                  cabecalho: "Rubricas",
                  soLargo: true,
                  alinharADireita: true,
                  celula: (p) => {
                    const n = rubricasDe(p);
                    return n === null ? (
                      <span className="text-foreground/30" title="Sem orçamento detalhado">
                        —
                      </span>
                    ) : (
                      <span className="tabular-nums">{n}</span>
                    );
                  },
                },
                {
                  chave: "valor",
                  // Com IVA — é o que o casal paga. Os Pedidos mostram o mesmo
                  // pedido sem IVA, e diz-se dos dois lados (achado n.º 29).
                  cabecalho: "Valor c/ IVA",
                  alinharADireita: true,
                  ordenar: (a, b) => a.total - b.total,
                  celula: (p) => (
                    <span className="font-semibold tabular-nums text-[var(--bo-text)]">
                      {eurCentimos(p.total)}
                    </span>
                  ),
                },
                {
                  // À VISTA, e não só no menu: ver o que seguiu é a pergunta
                  // que este ecrã existe para responder (ver o cabeçalho de
                  // `accoesDaPropostaEnviada.tsx`).
                  chave: "seguiu",
                  interactiva: true,
                  cabecalho: "",
                  alinharADireita: true,
                  celula: (p) => botaoDaEnviada(paraAccoes(p)),
                },
                {
                  chave: "accoes",
                  interactiva: true,
                  cabecalho: "",
                  largura: "w-12",
                  alinharADireita: true,
                  // O menu vive DENTRO da linha clicável: sem isto, escolher
                  // «Apagar» também abria o pedido por baixo.
                  celula: (p) => (
                    <span onClick={(e) => e.stopPropagation()}>
                      <MenuDeAccoes
                        sobre={p.clientName}
                        accoes={accoesDa(p)}
                        soltasNoEcraGrande={0}
                      />
                    </span>
                  ),
                },
              ]}
              // O cartão traz o seu botão (ver em baixo): um `<button>` à volta
              // dele inteiro punha o menu das acções dentro de outro botão.
              semMoldura
              cartao={(p) => {
                // O cartão mostra QUATRO coisas — cliente, estado, validade e
                // valor. A tabela mostra seis; aqui as outras duas custavam a
                // legibilidade das que decidem.
                const pedido = pedidoDa(p);
                const resumo = (
                  <>
                    <span className="block text-sm font-medium text-[var(--bo-text)]">
                      <span className="truncate align-middle">{p.clientName}</span>
                      {lugares.get(p.id) && <LugarDoCliente lugar={lugares.get(p.id)!} />}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <EstadoChip p={p} />
                      <ValidadeChip p={p} />
                    </span>
                    <span className="mt-1 block text-xs tabular-nums text-[var(--bo-text-muted)]">
                      {p.sentAt ? `Enviada ${dataCurta(p.sentAt)}` : "Por enviar"}
                    </span>
                  </>
                );
                const linha = (
                  <div className="flex items-start gap-3 p-3.5">
                    {pedido ? (
                      <button
                        type="button"
                        onClick={() => handleOpenQuote(pedido)}
                        className={`alvo-toque block min-w-0 flex-1 text-left ${ESTADO} ${PRESSAO}`}
                      >
                        {resumo}
                      </button>
                    ) : (
                      <div className="min-w-0 flex-1">{resumo}</div>
                    )}
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-sm font-semibold tabular-nums text-[var(--bo-text)]">
                        {eurCentimos(p.total)}
                        <span className="ml-1 text-[11px] font-normal text-[var(--bo-text-muted)]">
                          c/ IVA
                        </span>
                      </span>
                      <MenuDeAccoes sobre={p.clientName} accoes={accoesDa(p)} />
                    </div>
                  </div>
                );
                const botao = botaoDaEnviada(paraAccoes(p), { largo: true });
                return botao ? (
                  <div>
                    {linha}
                    <div className="px-3.5 pb-3.5">{botao}</div>
                  </div>
                ) : (
                  linha
                );
              }}
            />
          </div>
        )}
      </Card>

      {/* ── A PERGUNTA É A DA CASA ──────────────────────────────────────────
          Folha inferior no telemóvel, ao pé do polegar; diálogo centrado no
          computador; e o verbo repetido no botão em vez de «OK». */}
      {folhaDoEmail}

      <PerguntaDestrutiva
        aberto={!!aApagar}
        onFechar={() => setAApagar(null)}
        titulo={`Apagar a proposta de ${aApagar?.nome ?? ""}?`}
        aviso="Fica 30 dias na Reciclagem, de onde pode voltar."
        rotuloConfirmar="Apagar a proposta"
        // Fecha primeiro e só depois age: a lista é optimista — a linha sai
        // logo e volta se o servidor recusar, com a frase a dizer de quem era.
        onConfirmar={() => {
          const alvo = aApagar;
          setAApagar(null);
          if (alvo) void deleteProposal(alvo.id);
        }}
      />
    </div>
  );
}
