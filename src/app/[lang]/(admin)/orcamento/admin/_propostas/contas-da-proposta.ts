import type { Proposal, ProposalStatus } from "@/lib/orcamento/types";

/**
 * Quando a proposta seguiu — ou, numa por enviar, quando foi gerada. É por
 * aqui que a lista se ordena: palavras dela, «se eu quiser ver as propostas
 * que já mandei não consigo», e a lista estava por ordem alfabética do cliente.
 */
export const quandoDe = (p: Proposal) => p.sentAt || p.createdAt;

export const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    useGrouping: "always",
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);
/** O valor de UMA proposta, com cêntimos — achado n.º 11: a coluna dizia
 *  «5473 €» de uma proposta de 5.473,40 €. Os totais dos cartões de cima
 *  continuam arredondados (são uma ordem de grandeza, não um número a
 *  conferir). */
export const eurCentimos = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    useGrouping: "always",
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);

export const STATUS_META: Record<ProposalStatus, { label: string; color: string }> = {
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
export function rubricasDe(p: Proposal): number | null {
  // O documento manda quando existe: uma proposta do estúdio tem sempre
  // `lineItems: []`, e cair para elas dava o zero de sempre.
  const n = p.doc ? (p.doc.budgetItems?.length ?? 0) : (p.lineItems?.length ?? 0);
  return n > 0 ? n : null;
}

export function expiryInfo(
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
