/**
 * Dossier do Evento — modelo de domínio *puro* e *client-safe*.
 *
 * De propósito NÃO importa `server-only` nem nenhum `*-store.ts`:
 * é partilhado pela página servidor (que agrega os dados) e pelos componentes de
 * cliente (cabeçalho, métricas, stepper), tal como `money.ts`. Toda a matemática
 * do cockpit vive aqui — uma fonte única, testável sem montar React nem tocar na
 * base de dados.
 *
 * Regra de ouro: nunca chamar `Date.now()`/`new Date()` no topo do módulo. As
 * funções que precisam do "hoje" aceitam-no por parâmetro (injectável nos
 * testes); o valor por omissão só é lido dentro da função, no momento da chamada.
 */
import type { Quote, Proposal } from "./types";
import { round2 } from "@/lib/money";
import { depositPercentOf } from "@/lib/proposal-doc";

/**
 * Contrato (aceitação de T&C) reduzido aos campos que o Dossier mostra. Espelha
 * `contract-types` mas mantém a fronteira: a página passa só isto.
 */
export interface DossierContract {
  status: "pendente" | "aceite";
  acceptedAt?: string; // ISO — presente quando aceite
  acceptedName?: string;
  termsVersion?: string;
}

/**
 * Tudo o que a página servidor agrega e entrega ao cliente — apenas dados
 * serializáveis (sem funções, sem instâncias de classe).
 */
export interface DossierData {
  quote: Quote;
  proposal: Proposal | null;
  contract: DossierContract | null;
}

/**
 * As fases do ciclo de vida de um evento, da mais atrasada à mais avançada.
 * `perdido` é um estado terminal lateral (negócio caído em qualquer ponto).
 */
export type EventStage =
  | "lead"
  | "proposta_enviada"
  | "aceite"
  | "sinal_pago"
  | "em_producao"
  | "semana_evento"
  | "concluido"
  | "perdido";

/** Ordem canónica das fases "felizes" para o stepper (perdido fica de fora). */
export const STAGE_ORDER: EventStage[] = [
  "lead",
  "proposta_enviada",
  "aceite",
  "sinal_pago",
  "em_producao",
  "semana_evento",
  "concluido",
];

/** Rótulos PT (AO90) curtos para cada fase. */
export const STAGE_LABELS: Record<EventStage, string> = {
  lead: "Lead",
  proposta_enviada: "Proposta enviada",
  aceite: "Aceite",
  sinal_pago: "Sinal pago",
  em_producao: "Em produção",
  semana_evento: "Semana do evento",
  concluido: "Concluído",
  perdido: "Perdido",
};

/**
 * Dias até à data do evento (negativo = já passou; null = sem data).
 * Ancorado ao meio-dia dos dois lados para o dia nunca "saltar" por fuso.
 */
export function countdownDays(
  date: string | undefined | null,
  today: Date = new Date(),
): number | null {
  if (!date) return null;
  const eventNoon = Date.parse(date.length <= 10 ? `${date}T12:00:00` : date);
  if (Number.isNaN(eventNoon)) return null;
  const todayNoon = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    12,
    0,
    0,
    0,
  ).getTime();
  return Math.round((eventNoon - todayNoon) / 86_400_000);
}

/**
 * Taxa de IVA efetiva do pedido — derivada do breakdown (iva/subtotal) quando
 * existe, senão a taxa normal portuguesa (23%), a mesma que o motor de preços usa.
 */
export function effectiveVatRate(quote: Quote): number {
  const pb = quote.priceBreakdown;
  if (pb && pb.subtotal > 0 && Number.isFinite(pb.iva)) return pb.iva / pb.subtotal;
  return 0.23;
}

/** Valor contratado decomposto em sem IVA / IVA / com IVA. */
export interface ContractedAmounts {
  net: number; // sem IVA
  iva: number; // valor do IVA
  gross: number; // com IVA — o que o cliente paga
}

/**
 * Valor contratado, decomposto nas três parcelas de IVA. Fonte, por ordem:
 * proposta > preço cotado (`quotedPrice`) > estimativa (`priceBreakdown`).
 *
 * A proposta e o `priceBreakdown` já guardam sem IVA (subtotal) + IVA + com IVA
 * (total). O `quotedPrice` é o campo "Preço final (sem IVA)", logo SEM IVA — o
 * valor com IVA é derivado à taxa efetiva do pedido. Isto corrige o "em falta" e
 * a margem, que antes comparavam um total sem IVA com pagamentos/custos com IVA
 * (erro de ~23% nos negócios de preço manual).
 */
export function contractedAmounts(quote: Quote, proposal?: Proposal | null): ContractedAmounts {
  /**
   * ── O IVA SAI SEMPRE POR SUBTRACÇÃO ──────────────────────────────────────
   * `net + iva` tem de dar `gross` ao cêntimo, venha o total de onde vier.
   * Enquanto o IVA era lido do campo `proposal.vat`, bastava uma proposta cujo
   * trio gravado não fechasse (uma linha migrada, um valor corrigido à mão na
   * base de dados) para o dossier mostrar três números que não somam — e o
   * «em falta» é calculado a partir deles.
   *
   * ── E O LÍQUIDO A ZERO ───────────────────────────────────────────────────
   * As linhas de `proposals` anteriores à coluna `subtotal` lêem-se como 0
   * (ver `proposals-store.fromRow`), e `??` não apanha um zero. O dossier
   * dizia então que um casamento de 12.300 € valia 0 € sem IVA e 12.300 € de
   * IVA. A margem do evento, que compara líquidos, saía a menos o preço todo:
   * um casamento lucrativo aparecia com prejuízo igual aos custos. Um zero num
   * campo que devia trazer o líquido é um campo POR PREENCHER, não um preço
   * de zero euros — a proposta tem total, portanto tem base.
   */
  if (proposal && proposal.total != null && proposal.total > 0) {
    const gross = round2(proposal.total);
    const taxa =
      typeof proposal.vatRate === "number" && proposal.vatRate > 0 ? proposal.vatRate : 0.23;
    const net = proposal.subtotal > 0 ? round2(proposal.subtotal) : round2(gross / (1 + taxa));
    return { net, iva: round2(gross - net), gross };
  }
  if (quote.quotedPrice != null) {
    const net = round2(quote.quotedPrice);
    const gross = round2(net * (1 + effectiveVatRate(quote)));
    return { net, iva: round2(gross - net), gross };
  }
  const pb = quote.priceBreakdown;
  if (pb) {
    const gross = round2(pb.total);
    const net = round2(pb.subtotal);
    return { net, iva: round2(gross - net), gross };
  }
  return { net: 0, iva: 0, gross: 0 };
}

/**
 * Valor contratado, sempre COM IVA — a mesma base do dinheiro com que ele é
 * confrontado (pagamentos, faturas e custos de fornecedor são todos com IVA).
 *
 * Delega em `contractedAmounts` de propósito, em vez de repetir a cascata
 * `proposta ?? preço cotado ?? estimativa`: os três sítios onde o total pode
 * estar gravado NÃO estão na mesma unidade. `proposal.total` e
 * `priceBreakdown.total` são brutos; o `quote.quotedPrice` é o campo "Preço
 * final (sem IVA)" do ecrã, logo líquido. A cascata crua devolvia ora um ora
 * outro e o limiar de "está pago" caía ~23% no ramo do meio: um casamento
 * fechado por 20 000 € + IVA (24 600 € a receber) dava-se por concluído com
 * 20 000 € pagos e 4 600 € por cobrar — e a margem do evento, receita líquida
 * contra custos brutos, saía inflacionada na mesma proporção.
 */
function contractedTotal(d: DossierData): number {
  return contractedAmounts(d.quote, d.proposal).gross;
}

/**
 * Dinheiro RECEBIDO neste evento: a soma das linhas de `quote.payments` dadas
 * por recebidas.
 *
 * Isto já foi uma conta com duas fontes. Enquanto a casa emitia facturas, o
 * mesmo euro podia estar escrito em dois sítios — a linha de pagamento e a
 * factura marcada como paga — e a conta confrontava-os espécie a espécie
 * (sinal/saldo/avulso), ficando com o maior de cada lado para não somar o mesmo
 * dinheiro duas vezes nem perder a metade que só existia de um lado.
 *
 * A facturação saiu daqui (passou a ser feita noutro sítio) e com ela saiu o
 * livro. Sobra UMA fonte, que é a que ela alimenta à mão e sempre alimentou: o
 * registo de pagamentos. A conta é agora a soma directa — e é de propósito que
 * não guarda vestígios da anterior: uma comparação com um lado que já não
 * existe daria sempre o mesmo resultado e só enganava quem a lesse.
 *
 * Arredonda aos cêntimos no fim para um desvio de vírgula flutuante nunca
 * deixar um evento integralmente pago aquém do total contratado.
 */
export function paidTotal(quote: Quote): number {
  return round2((quote.payments ?? []).reduce((s, p) => s + (p.paid ? p.amount : 0), 0));
}

/**
 * Máquina de estados do Dossier. Calcula os booleanos e escolhe a fase mais
 * avançada alcançada (primeira coincidência ganha, topo = mais avançado).
 * A implementação segue à letra a tabela do plano.
 */
export function deriveStage(d: DossierData, today: Date = new Date()): EventStage {
  const { quote, proposal, contract } = d;

  const perdido = quote.status === "rejeitado" || proposal?.status === "rejeitada";

  // Ancorado ao FIM do dia do evento: a tarde do próprio dia continua a ser
  // "hoje" (countdownDays === 0), não "já passou". Só a partir da meia-noite
  // seguinte é que `eventPassed` fica verdadeiro — mantendo-o coerente com o
  // contador (que só vira negativo no dia seguinte).
  // `quote.date` costuma ser "yyyy-mm-dd", mas a rota manual/importação não proíbe
  // um ISO completo com componente horária. Tomamos sempre a porção da DATA (10
  // primeiros carateres) e ancoramos ao fim desse dia, tal como `countdownDays`
  // normaliza os dois formatos — assim um datetime já não produz NaN nem deixa um
  // evento passado preso uma fase atrás.
  const eventDayEnd = quote.date ? Date.parse(`${quote.date.slice(0, 10)}T23:59:59`) : NaN;
  const eventPassed = !Number.isNaN(eventDayEnd) && eventDayEnd < today.getTime();

  const contracted = contractedTotal(d);
  const pago = paidTotal(quote);

  // Sinal e saldo lêem o registo de pagamentos, que é o único sítio onde o
  // dinheiro recebido está escrito desde que a facturação saiu daqui. O
  // critério não mudou: uma linha da espécie certa dada por recebida.
  //
  // A rede de segurança do saldo continua a ser a que mais importa — há quem
  // nunca rotule a última parcela como «saldo». Um evento já realizado e
  // integralmente pago mas com as parcelas todas rotuladas «pagamento» ficaria
  // preso em `em_producao` para sempre e acumulava no quadro, ano após ano.
  const saldoPago =
    (quote.payments ?? []).some((p) => p.kind === "saldo" && p.paid && p.amount > 0) ||
    (contracted > 0 && pago >= round2(contracted));

  const sinalPago = (quote.payments ?? []).some(
    (p) => p.kind === "sinal" && p.paid && p.amount > 0,
  );

  // `quote.status === "aceite"` conta como aceite mesmo sem proposta/contrato:
  // a rota manual permite marcar um negócio como ganho diretamente (reserva
  // offline), tal como `deriveRequestLifecycle` do stepper já reconhece. Sem
  // isto, um pedido ganho à mão aparecia como `lead`, contradizendo o stepper.
  //
  // O nº de contrato (`contractRef`) e o registo "proposta enviada" no
  // `activityLog` são os sinais que SÓ o Quote traz e que o stepper do back
  // office sempre usou. Passaram para aqui quando o stepper deixou de ter
  // derivação própria e passou a ser uma vista desta máquina de estados: sem
  // eles, um contrato assinado à mão (nº preenchido no painel Financeiro) ou uma
  // proposta enviada por e-mail recuavam o pedido uma ou duas fases.
  const contratoAceite =
    !!contract?.acceptedAt ||
    proposal?.status === "aceite" ||
    quote.status === "aceite" ||
    !!quote.contractRef;

  const propostaEnviada =
    (!!proposal && proposal.status !== "rascunho") ||
    quote.status === "cotado" ||
    (quote.activityLog ?? []).some((a) => a.kind === "proposal_sent");

  const cd = countdownDays(quote.date, today);

  if (perdido) return "perdido";
  if (eventPassed && saldoPago) return "concluido";
  if (!eventPassed && cd !== null && cd <= 7 && contratoAceite) return "semana_evento";
  if (contratoAceite && sinalPago) return "em_producao";
  if (sinalPago) return "sinal_pago";
  if (contratoAceite) return "aceite";
  if (propostaEnviada) return "proposta_enviada";
  return "lead";
}

export interface EventMetrics {
  contracted: number;
  /** Valor contratado com IVA (o que o cliente paga) — corrige o `quotedPrice`
   *  sem IVA para a mesma base dos pagamentos. Usar isto no "em falta". */
  contractedGross: number;
  contractedNet: number; // sem IVA
  contractedIva: number; // valor do IVA
  /**
   * Dinheiro recebido, do registo de pagamentos (ver `paidTotal`).
   *
   * Substitui os antigos `ledgerPaid` (soma das facturas pagas), `ledgerIssued`
   * (soma das facturas emitidas) e `informalPaid` (soma dos pagamentos). Os dois
   * primeiros morreram com o livro de facturas; o terceiro só se chamava
   * «informal» por oposição ao livro, e sem livro é simplesmente o recebido.
   */
  paid: number;
  /**
   * Fracção do contratado que já entrou — `paid / contractedGross`.
   *
   * ATENÇÃO ao que este número passou a querer dizer: era a percentagem
   * FACTURADA E COBRADA (lia só facturas com estado «paga») e é agora a
   * percentagem REGISTADA COMO RECEBIDA. Para um evento cujo dinheiro sempre
   * foi registado no painel de Pagamentos dá o mesmo; para um que só tivesse
   * facturas marcadas como pagas e nenhuma linha de pagamento, passa a 0% até
   * o recebimento ser registado. Por isso o ecrã que o mostra (MetricStrip)
   * diz agora «% Recebido» e não «% Pago».
   */
  pctPaid: number;
  /** Custos de fornecedor COM IVA — é assim que eles são registados. */
  supplierCosts: number;
  /** Os mesmos custos SEM IVA — a base em que a margem se calcula. */
  supplierCostsNet: number;
  /**
   * ════════════════════════════════════════════════════════════════════════
   * A MARGEM É LÍQUIDA CONTRA LÍQUIDA — E ANTES NÃO ERA
   * ════════════════════════════════════════════════════════════════════════
   *
   * Era `contratado com IVA − custos com IVA`. As duas parcelas estavam na
   * mesma unidade, o que parece bastar, e não basta: o IVA não é receita nem
   * é custo. Entra do cliente e sai para o Estado, e a diferença entre dois
   * brutos é a margem verdadeira MULTIPLICADA por 1,23.
   *
   * Num casamento de 20.000 € de base com 12.000 € de custos, a margem real
   * são 8.000 € e o quadro dizia 9.840 €. É um lucro que não existe, em cima
   * do qual se decide baixar um preço.
   *
   * Também deixava dois ecrãs a discordarem sobre o mesmo evento: o painel
   * de custos (EventCosts) já comparava líquidos e dizia 8.000 €, enquanto o
   * quadro de rentabilidade (StatsDashboard), que lê este campo, dizia 9.840.
   */
  margin: number;
  countdownDays: number | null;
  rsvpConfirmed: number;
  rsvpTotal: number;
}

/**
 * Métricas do cockpit — todas com IVA (rotular "c/ IVA" onde forem mostradas).
 * `quote.payments` é a verdade para Recebido / % Recebido: é o único registo de
 * dinheiro que esta aplicação guarda desde que a facturação saiu daqui.
 */
export function computeEventMetrics(d: DossierData, today: Date = new Date()): EventMetrics {
  const { quote } = d;

  const contracted = contractedTotal(d);
  const amounts = contractedAmounts(quote, d.proposal);
  const paid = paidTotal(quote);
  const pctPaid = contracted > 0 ? paid / contracted : 0;

  const supplierCosts = round2(
    (quote.eventSuppliers ?? []).reduce((s, e) => s + (e.actualCost ?? e.estimatedCost ?? 0), 0),
  );
  // Os custos de fornecedor são registados COM IVA (ver `EventSupplier`), e o
  // IVA suportado é dedutível — não é custo. Passa-se a líquido à mesma taxa a
  // que a receita foi facturada, que é a única taxa que este evento conhece.
  const vatRate = amounts.gross > 0 && amounts.net > 0 ? amounts.gross / amounts.net - 1 : 0.23;
  const supplierCostsNet = round2(supplierCosts / (1 + vatRate));
  const margin = round2(amounts.net - supplierCostsNet);

  const guests = quote.guestList ?? [];
  const rsvpTotal = guests.reduce((s, g) => s + (g.party || 0), 0);
  const rsvpConfirmed = guests.reduce(
    (s, g) => s + (g.rsvp === "confirmado" ? g.party || 0 : 0),
    0,
  );

  return {
    contracted,
    contractedGross: amounts.gross,
    contractedNet: amounts.net,
    contractedIva: amounts.iva,
    paid,
    pctPaid,
    supplierCosts,
    supplierCostsNet,
    margin,
    countdownDays: countdownDays(quote.date, today),
    rsvpConfirmed,
    rsvpTotal,
  };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A RECONCILIAÇÃO FINANCEIRA SAIU DAQUI — E PORQUÊ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Havia aqui um `reconcileFinance` e, nos dois ecrãs do dinheiro (a Zona
 * Financeira do dossiê e o painel de Pagamentos), um aviso âmbar que dizia
 * «Pagamentos registados (X) não batem com faturas pagas (Y)».
 *
 * Reconciliar é confrontar DUAS contagens do mesmo dinheiro. Eram elas o
 * registo de pagamentos e o livro de facturas. O livro saiu — a casa passou a
 * facturar noutro sítio — e sobrou uma contagem só.
 *
 * Manter a função era mantê-la a comparar os pagamentos com zero: o aviso
 * passaria a acender-se em TODOS os eventos com dinheiro recebido, a dizer que
 * as facturas pagas somam 0,00 €. Um alarme que está sempre aceso não é um
 * alarme — é ruído por cima do número certo, e ensina a ignorar o sítio onde um
 * dia pode aparecer um aviso a sério.
 *
 * Por isso não ficou uma versão amputada: ficou nada, e o recebido passou a ser
 * um número só (`paidTotal`). Se um dia voltar a haver uma segunda contagem —
 * um ficheiro do programa de facturação, um extracto bancário — a reconciliação
 * volta a fazer sentido e escreve-se contra ESSA fonte, não contra o fantasma
 * desta.
 */
export type NextActionKind =
  | "proposta"
  | "sinal"
  | "saldo"
  | "producao"
  | "runsheet"
  | "arquivar"
  | "none";

export interface NextAction {
  label: string;
  hint: string;
  kind: NextActionKind;
}

/**
 * A próxima ação sugerida para o cabeçalho — deriva da fase e, quando útil, do
 * estado financeiro (ex.: na semana do evento distingue "falta liquidar o saldo"
 * de "tudo pago, prepare o run sheet").
 *
 * Não recebe o "hoje": a fase já vem decidida (é `deriveStage` que olha para o
 * calendário) e o resto é dinheiro, que não muda com o dia. A regra do topo do
 * módulo vale nos dois sentidos — quem precisa do relógio pede-o, quem não
 * precisa não finge precisar.
 */
export function nextAction(stage: EventStage, d: DossierData): NextAction {
  // A percentagem do sinal é a da PROPOSTA aceite, não os 30% da casa escritos
  // à mão: é a percentagem que o cliente aceitou e a que o painel de Pagamentos
  // sugere. Sem proposta vale a percentagem por omissão, que é exactamente o
  // que estas frases sempre disseram.
  const pctSinal = depositPercentOf(d.proposal?.doc);
  switch (stage) {
    case "lead":
      return {
        label: "Criar proposta",
        hint: "Ainda sem proposta enviada — desenha e envia a proposta.",
        kind: "proposta",
      };
    case "proposta_enviada":
      // Mandava «Abrir portal do cliente». O portal saiu (achado n.º 37,
      // decisão dela); quando o casal aceita, o pedido muda sozinho. O que
      // fica a fazer é acompanhar — e reenviar, se for preciso, é na zona da
      // comunicação, como a proposta.
      return {
        label: "Acompanhar a proposta",
        hint: "Proposta enviada — a aguardar a resposta do casal. Quando aceitar, o pedido muda sozinho.",
        kind: "proposta",
      };
    case "aceite":
      // Já não manda «Emitir fatura de sinal»: a factura é emitida noutro
      // sítio e este ecrã não sabe nada dela. O que ele sabe — e o que faz a
      // fase avançar — é se o sinal foi RECEBIDO e registado.
      return {
        label: `Registar o sinal (${pctSinal}%)`,
        hint: "Contrato aceite — falta receber o sinal para arrancar.",
        kind: "sinal",
      };
    case "sinal_pago":
      return {
        label: "Iniciar produção",
        hint: "Sinal pago — dá início ao plano de produção do evento.",
        kind: "producao",
      };
    case "em_producao":
      return {
        label: "Gerir produção",
        hint: "Em produção — acompanha tarefas, fornecedores e cronograma.",
        kind: "producao",
      };
    case "semana_evento": {
      /**
       * O que falta receber lê-se do MESMO sítio de onde `deriveStage` tira o
       * `saldoPago` logo acima — o ecrã não pode chegar à semana do evento por
       * uma conta e mandar cobrar por outra.
       *
       * O erro que isto evita continua a valer: um casamento de 12.300 €
       * integralmente recebido e registado não pode dizer, na semana do evento,
       * «Liquidar o saldo (70%)» e pedir 8.610 € a um casal que já os
       * transferiu.
       */
      const contratado = contractedTotal(d);
      const liquidado = contratado > 0 && paidTotal(d.quote) >= round2(contratado);
      if (!liquidado) {
        return {
          label: `Liquidar o saldo (${100 - pctSinal}%)`,
          hint: "Evento esta semana — falta liquidar o saldo antes do dia.",
          kind: "saldo",
        };
      }
      return {
        label: "Preparar run sheet",
        hint: "Tudo pago — finaliza o cronograma do dia.",
        kind: "runsheet",
      };
    }
    case "concluido":
      return {
        label: "Arquivar evento",
        hint: "Evento concluído e liquidado — podes arquivar.",
        kind: "arquivar",
      };
    case "perdido":
      return {
        label: "Negócio perdido",
        hint: "Sem próxima ação — negócio marcado como perdido.",
        kind: "none",
      };
  }
}
