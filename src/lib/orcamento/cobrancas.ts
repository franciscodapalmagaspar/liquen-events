import type { Payment, Proposal, Quote } from "./types";
import { contractedAmounts, paidTotal } from "./dossier";
import { SINAL_POR_OMISSAO, eur, round2, splitSinal } from "@/lib/money";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS COBRANÇAS — O QUE CADA CLIENTE ACEITE JÁ PAGOU, E O QUE FALTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (5/11): «uma área só para gerir pagamentos de clientes, só para os que já
 * aceitaram, e agora temos de organizar o que já foi pago, o que não foi». E
 * escolheu o QUADRO POR FASES: cada cliente atravessa três colunas —
 * «Sinal por receber» → «Saldo por receber» → «Tudo pago» — e os atrasados vêm
 * ao topo de cada coluna.
 *
 * Tudo aqui é puro (sem rede, sem relógio): o ecrã passa os pedidos, a lista
 * leve das propostas e o dia de hoje.
 *
 * ── DE ONDE VEM CADA NÚMERO ─────────────────────────────────────────────────
 *  · O TOTAL é o da proposta ACEITE (o que o cliente aceitou). Sem aceite —
 *    um «Ganho» marcado à mão —, o valor contratado do pedido
 *    (`contractedAmounts`: «Preço final» + IVA, ou a estimativa). É a mesma
 *    regra do painel de Pagamentos (`percentagem-do-sinal.ts`).
 *  · O PAGO é a soma das linhas dadas por recebidas (`paidTotal`) — o mesmo
 *    número do painel.
 *  · O SINAL é a percentagem da proposta aceite (30% por omissão).
 *  · O PRAZO é o da linha prevista (por receber) desse pagamento, quando há —
 *    é o que o «Ganho» semeia (`semear-producao.ts`): o sinal no dia do aceite,
 *    o saldo um mês antes do evento. Sem linha, o saldo conta um mês antes do
 *    evento (`prazoDoSaldo`) e o sinal fica sem data.
 */

/** O que esta conta precisa de cada proposta da lista leve. */
export interface PropostaParaCobrar {
  quoteId?: string;
  status?: string;
  total?: number;
  subtotal?: number;
  vatRate?: number;
  pctSinal?: number;
}

export type FaseDaCobranca = "sinal" | "saldo" | "pago";

export interface ProximoPagamento {
  tipo: "sinal" | "saldo";
  /** O que falta deste pagamento (o sinal já pago em parte desconta). */
  valor: number;
  /** «aaaa-mm-dd», ou `null` quando não há prazo conhecido. */
  prazo: string | null;
}

export interface Cobranca {
  quoteId: string;
  nome: string;
  telefone?: string;
  /** A data do evento («aaaa-mm-dd»), quando se lê. */
  dataDoEvento: string | null;
  total: number;
  /** O total saiu da proposta aceite (`true`) ou do pedido (`false`). */
  daPropostaAceite: boolean;
  pago: number;
  emFalta: number;
  pctSinal: number;
  sinal: number;
  fase: FaseDaCobranca;
  proximo: ProximoPagamento | null;
  /** O prazo do próximo pagamento já passou. */
  atraso: boolean;
  /** Dias até ao prazo (negativo = dias de atraso); `null` sem prazo. */
  diasParaOPrazo: number | null;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Folga para o arredondamento: meio euro não deixa um cliente «por pagar». */
const FOLGA = 0.5;

/**
 * O último dia para liquidar o saldo: um mês de calendário antes do evento.
 *
 * Achado n.º 8 da auditoria: o saldo nascia com a data do PRÓPRIO dia do
 * casamento. A proposta diz «70% 1 mês antes» e o contrato «é liquidado até 1
 * mês antes da data do evento» — e o lembrete diário, que avisa a 7 dias,
 * chegava na semana do casamento.
 *
 * O dia do mês é o mesmo, e encosta ao fim do mês quando esse dia não existe
 * (31 de Março → 28 ou 29 de Fevereiro). Nunca antes do dia do sinal: um
 * casamento marcado a três semanas não tem um saldo «vencido» à nascença.
 * Sem data de evento (ou com uma ilegível), fica a que lá estava.
 */
export function prazoDoSaldo(dataDoEvento: string, diaDoSinal: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataDoEvento ?? "");
  if (!m) return dataDoEvento;
  let [ano, mes] = [Number(m[1]), Number(m[2]) - 1];
  const dia = Number(m[3]);
  if (mes === 0) {
    ano -= 1;
    mes = 11;
  } else {
    mes -= 1;
  }
  const ultimoDoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const prazo = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(Math.min(dia, ultimoDoMes)).padStart(2, "0")}`;
  return prazo < diaDoSinal ? diaDoSinal : prazo;
}

/** Dias de `de` até `ate` (ambos «aaaa-mm-dd»), pelo calendário. */
function diasEntre(de: string, ate: string): number {
  const [a, b] = [de, ate].map((d) => {
    const [y, mo, da] = d.split("-").map(Number);
    return Date.UTC(y, mo - 1, da);
  });
  return Math.round((b - a) / 86_400_000);
}

/** A proposta ACEITE do pedido (a lista chega da mais nova para a mais velha). */
function aceiteDe(propostas: readonly PropostaParaCobrar[], quoteId: string) {
  return propostas.find((p) => p?.quoteId === quoteId && p.status === "aceite") ?? null;
}

/** A data prevista da primeira linha POR RECEBER deste tipo, se houver. */
function prazoDaLinha(q: Quote, tipo: "sinal" | "saldo"): string | null {
  const datas = (q.payments ?? [])
    .filter((p) => !p.paid && p.kind === tipo && typeof p.date === "string" && DIA.test(p.date))
    .map((p) => p.date)
    .sort();
  return datas[0] ?? null;
}

/** A cobrança de um pedido aceite. */
export function cobrancaDoPedido(
  q: Quote,
  propostas: readonly PropostaParaCobrar[],
  hoje: string,
): Cobranca {
  const aceite = aceiteDe(propostas, q.id);
  const daPropostaAceite =
    !!aceite &&
    typeof aceite.total === "number" &&
    Number.isFinite(aceite.total) &&
    aceite.total > 0;
  const total = round2(
    daPropostaAceite
      ? (aceite!.total as number)
      : contractedAmounts(q, null as Proposal | null).gross,
  );
  const pct =
    typeof aceite?.pctSinal === "number" && aceite.pctSinal >= 1 && aceite.pctSinal <= 99
      ? Math.round(aceite.pctSinal)
      : SINAL_POR_OMISSAO;
  const { sinal } = splitSinal(total, pct);
  const pago = paidTotal(q);
  const emFalta = round2(Math.max(0, total - pago));

  const fase: FaseDaCobranca =
    total > 0 && pago >= total - FOLGA
      ? "pago"
      : pago >= sinal - FOLGA && total > 0
        ? "saldo"
        : "sinal";

  const dataDoEvento =
    typeof q.date === "string" && DIA.test(q.date.slice(0, 10)) ? q.date.slice(0, 10) : null;

  let proximo: ProximoPagamento | null = null;
  if (fase === "sinal" && total > 0) {
    proximo = {
      tipo: "sinal",
      valor: round2(Math.max(0, sinal - pago)),
      prazo: prazoDaLinha(q, "sinal"),
    };
  } else if (fase === "saldo") {
    proximo = {
      tipo: "saldo",
      valor: emFalta,
      prazo:
        prazoDaLinha(q, "saldo") ??
        (dataDoEvento ? prazoDoSaldo(dataDoEvento, "0000-00-00") : null),
    };
  }

  const diasParaOPrazo = proximo?.prazo ? diasEntre(hoje, proximo.prazo) : null;

  return {
    quoteId: q.id,
    nome: q.name,
    telefone: q.phone,
    dataDoEvento,
    total,
    daPropostaAceite,
    pago,
    emFalta,
    pctSinal: pct,
    sinal,
    fase,
    proximo,
    atraso: diasParaOPrazo !== null && diasParaOPrazo < 0,
    diasParaOPrazo,
  };
}

/** Os pedidos que entram na área: aceites e não arquivados. */
export function entraNasCobrancas(q: Quote): boolean {
  return q.status === "aceite" && !q.archived;
}

/**
 * Ordem dentro de cada coluna: os atrasados primeiro (o mais atrasado à
 * cabeça), depois pelo prazo mais próximo, e os sem prazo pela data do evento.
 */
function ordem(a: Cobranca, b: Cobranca): number {
  if (a.atraso !== b.atraso) return a.atraso ? -1 : 1;
  const pa = a.proximo?.prazo ?? null;
  const pb = b.proximo?.prazo ?? null;
  if (pa && pb && pa !== pb) return pa < pb ? -1 : 1;
  if (pa && !pb) return -1;
  if (!pa && pb) return 1;
  const ea = a.dataDoEvento ?? "9999-12-31";
  const eb = b.dataDoEvento ?? "9999-12-31";
  if (ea !== eb) return ea < eb ? -1 : 1;
  return a.nome.localeCompare(b.nome, "pt");
}

export interface QuadroDeCobrancas {
  sinal: Cobranca[];
  saldo: Cobranca[];
  pago: Cobranca[];
  /** O que falta receber de todos. */
  porReceber: number;
  /** O que falta dos que estão em atraso, e quantos são. */
  emAtraso: { valor: number; clientes: number };
  /** O que já entrou, de todos. */
  recebido: number;
}

/** O quadro inteiro: as três colunas, já ordenadas, e os três totais do topo. */
export function quadroDeCobrancas(
  quotes: readonly Quote[],
  propostas: readonly PropostaParaCobrar[],
  hoje: string,
): QuadroDeCobrancas {
  const todas = quotes.filter(entraNasCobrancas).map((q) => cobrancaDoPedido(q, propostas, hoje));
  const col = (f: FaseDaCobranca) => todas.filter((c) => c.fase === f).sort(ordem);
  const atrasadas = todas.filter((c) => c.atraso);
  return {
    sinal: col("sinal"),
    saldo: col("saldo"),
    // Os pagos: o evento mais recente primeiro (é o que se acabou de fechar).
    pago: todas
      .filter((c) => c.fase === "pago")
      .sort((a, b) => (b.dataDoEvento ?? "").localeCompare(a.dataDoEvento ?? "")),
    porReceber: round2(todas.reduce((s, c) => s + c.emFalta, 0)),
    emAtraso: {
      valor: round2(atrasadas.reduce((s, c) => s + (c.proximo?.valor ?? 0), 0)),
      clientes: atrasadas.length,
    },
    recebido: round2(todas.reduce((s, c) => s + c.pago, 0)),
  };
}

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** «12 de julho». */
export function diaPorExtenso(dia: string): string {
  const [, m, d] = dia.split("-").map(Number);
  return `${d} de ${MESES[m - 1]}`;
}

/**
 * A mensagem do «Lembrar», pronta a colar no WhatsApp ou no email. NUNCA é
 * enviada sozinha: quem a envia é a pessoa (regra da casa — nada sai para um
 * cliente sem alguém carregar em enviar).
 *
 * Não leva IBAN nem número de MB Way: esses dados não estão guardados em sítio
 * nenhum, e inventá-los numa mensagem de dinheiro é o pior erro possível.
 */
export function mensagemDeLembrete(c: Cobranca, hoje: string): string | null {
  const p = c.proximo;
  if (!p || p.valor <= 0) return null;
  const nomes = c.nome.trim();
  const qual = p.tipo === "sinal" ? `o sinal de ${c.pctSinal}%` : "o saldo";
  const quando = p.prazo
    ? p.prazo < hoje
      ? `, que estava previsto para ${diaPorExtenso(p.prazo)}`
      : p.prazo === hoje
        ? ", previsto para hoje"
        : `, previsto para ${diaPorExtenso(p.prazo)}`
    : "";
  return [
    `Olá${nomes ? ` ${nomes}` : ""}! Espero que esteja tudo bem.`,
    "",
    `Passo só para lembrar ${qual} da vossa proposta, no valor de ${eur(p.valor)}${quando}.`,
    "",
    "Se já trataram disto, por favor ignorem esta mensagem. Qualquer dúvida, estamos por aqui.",
    "",
    "Obrigada!",
    "Líquen Events",
  ].join("\n");
}

// ════════════════════════════════════════════════════════════════════════════
// O FLUXO DE TRABALHO (5/11, segunda volta): «quero mesmo que isto esteja um
// workflow, um design, uma forma de trabalhar incrível».
// ════════════════════════════════════════════════════════════════════════════

/** Precisa de alguém agora: está em atraso, ou vence nos próximos sete dias. */
export function precisaDeMim(c: Cobranca): boolean {
  if (c.fase === "pago" || !c.proximo) return false;
  return c.atraso || (c.diasParaOPrazo !== null && c.diasParaOPrazo <= 7);
}

/** O começo do resumo que o «Lembrar» escreve no histórico do pedido. */
export const PREFIXO_DO_LEMBRETE = "Lembrete de pagamento preparado";

/**
 * Há quantos dias foi preparado o último lembrete deste pedido, ou `null` se
 * nunca foi. É o que impede a mesma pessoa (ou outra) de lembrar o mesmo
 * cliente duas vezes na mesma semana sem saber.
 */
export function diasDesdeOLembrete(q: Quote, hoje: string): number | null {
  const datas = (q.activityLog ?? [])
    .filter((e) => e.kind === "message_sent" && e.summary?.startsWith(PREFIXO_DO_LEMBRETE))
    .map((e) => (typeof e.at === "string" ? e.at.slice(0, 10) : ""))
    .filter((d) => DIA.test(d))
    .sort();
  const ultimo = datas[datas.length - 1];
  return ultimo ? Math.max(0, diasEntre(ultimo, hoje)) : null;
}

/**
 * A lista de pagamentos depois de «Recebido» no próximo pagamento do cartão.
 *
 * Se o «Ganho» deixou uma linha PREVISTA desse pagamento (por receber), é ela
 * que passa a recebida — com o valor que falta, a data de hoje e o meio —, para
 * não ficar uma prevista órfã ao lado de uma recebida. Sem linha prevista,
 * acrescenta-se uma nova. Nunca se mexe nas outras linhas.
 *
 * Se entrou só uma PARTE da prevista, a diferença continua prevista, com o
 * prazo que tinha: o resto não desaparece do quadro nem perde o dia.
 */
export function comORecebido(
  q: Quote,
  c: Cobranca,
  o: { valor: number; dia: string; meio?: string; novoId: string },
): Payment[] {
  const lista = [...(q.payments ?? [])];
  const tipo = c.proximo?.tipo ?? "pagamento";
  const valor = round2(o.valor);
  const meio = o.meio?.trim() || undefined;
  const i = lista.findIndex((p) => !p.paid && p.kind === tipo);
  if (i >= 0) {
    const antes = lista[i];
    const resto = round2(antes.amount - valor);
    lista[i] = {
      ...antes,
      amount: valor,
      date: o.dia,
      paid: true,
      ...(meio ? { note: meio } : {}),
    };
    if (resto > 0) lista.splice(i + 1, 0, { ...antes, id: o.novoId, amount: resto });
    return lista;
  }
  lista.push({
    id: o.novoId,
    kind: tipo,
    amount: valor,
    date: o.dia,
    paid: true,
    ...(meio ? { note: meio } : {}),
  });
  return lista;
}

/** Um mês da previsão: «aaaa-mm» e o que se espera receber nele. */
export interface MesDaPrevisao {
  mes: string;
  valor: number;
}

/**
 * O que se espera receber em cada um dos próximos `meses` meses, pelo prazo de
 * cada próximo pagamento. O que está em atraso ou sem prazo conta no mês de
 * hoje — é dinheiro que já devia ter entrado. Depois do próximo pagamento de um
 * cliente em fase de sinal, vem o saldo dele: entra no mês do seu prazo (um mês
 * antes do evento), para a previsão não esquecer o dinheiro maior.
 */
export function previsaoDeEntradas(
  quadro: QuadroDeCobrancas,
  hoje: string,
  meses = 6,
): MesDaPrevisao[] {
  const mesDeHoje = hoje.slice(0, 7);
  const lista: MesDaPrevisao[] = [];
  const [ano, mes] = mesDeHoje.split("-").map(Number);
  for (let k = 0; k < meses; k++) {
    const d = new Date(Date.UTC(ano, mes - 1 + k, 1));
    lista.push({ mes: d.toISOString().slice(0, 7), valor: 0 });
  }
  const somar = (dia: string | null, valor: number) => {
    if (valor <= 0) return;
    const m = !dia || dia < hoje ? mesDeHoje : dia.slice(0, 7);
    const alvo = lista.find((x) => x.mes === m);
    if (alvo) alvo.valor = round2(alvo.valor + valor);
  };
  for (const c of [...quadro.sinal, ...quadro.saldo]) {
    if (!c.proximo) continue;
    somar(c.proximo.prazo, c.proximo.valor);
    if (c.proximo.tipo === "sinal") {
      const saldo = round2(c.emFalta - c.proximo.valor);
      const prazo = c.dataDoEvento ? prazoDoSaldo(c.dataDoEvento, "0000-00-00") : null;
      somar(prazo, saldo);
    }
  }
  return lista;
}

const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** «nov» (ou «jan 2028» quando muda de ano face a `hoje`). */
export function mesCurto(mes: string, hoje: string): string {
  const [a, m] = mes.split("-").map(Number);
  const nome = MESES_CURTOS[m - 1];
  return String(a) === hoje.slice(0, 4) ? nome : `${nome} ${a}`;
}
