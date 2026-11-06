import { idCurto } from "@/lib/id-unico";
import type { ActivityEntry, QuoteStatus } from "./types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ESTADO DO PEDIDO SEGUE O QUE JÁ SE FEZ AO CLIENTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O quadro tinha uma coluna de estado que só mudava quando alguém se lembrava
 * de a arrastar. Entretanto o back office fazia coisas ao pedido — mandava uma
 * mensagem, mandava a proposta, emitia o sinal, dava um pagamento por recebido
 * — e a coluna continuava a dizer a mesma palavra de há três semanas.
 *
 * O caso concreto que fecha o assunto: o sinal emitido e pago, a data
 * reservada, o trabalho GANHO — e o pedido a dizer «Proposta enviada». Quem
 * olha para o quadro para saber o que falta fazer vê um negócio por fechar que
 * já está fechado, e vai atrás dele outra vez.
 *
 * ── PORQUE É QUE ISTO É UM FICHEIRO E NÃO SEIS LINHAS EM SEIS ROTAS ────────
 *
 * A regra («responder põe em Aguardar resposta», «o estado nunca anda para
 * trás») já vivia escrita à mão dentro da rota das mensagens. Copiá-la para a
 * rota das facturas, para a dos recibos, para a do PATCH dos pagamentos, é a
 * forma garantida de ao fim de um ano haver seis regras diferentes — e de a
 * sexta ser a que faz um casamento ganho voltar a «Proposta enviada» porque
 * alguém emitiu lá uma factura.
 *
 * Aqui está a decisão inteira, sem base de dados e sem HTTP, para poder ser
 * lida e testada de uma assentada. Quem chama só diz O QUE ACONTECEU e em que
 * estado o pedido está; o que sai é o estado novo e a linha para o histórico,
 * ou `null` quando não há nada a mudar.
 *
 * ── AS TRÊS REGRAS QUE NÃO SE NEGOCEIAM ───────────────────────────────────
 *
 * 1. O ESTADO NUNCA ANDA PARA TRÁS. Emitir uma factura num pedido já `aceite`
 *    não o põe em `cotado`; mandar uma nota a um casamento fechado não o
 *    desfecha. Um estado que recua sozinho é a maneira mais rápida de a coluna
 *    deixar de merecer confiança — e a partir daí ninguém olha para ela.
 *
 * 2. NÃO HÁ ESTADOS NOVOS SEM ELA OS PEDIR. São os de `QuoteStatus` e mais
 *    nenhum: são os que o Kanban, a lista, o funil, as estatísticas e o
 *    dossier sabem pintar. Um estado novo obriga a ensinar TODOS esses sítios
 *    — e a restrição `quotes_status_chk` da base de dados — ao mesmo tempo.
 *
 *    Esta regra dizia «não há estados novos», e a 6/11 mudou por pedido dela:
 *    «nas propostas, quero que também haja um estado a dizer, a fazer
 *    proposta, ou a preparar proposta». Perguntada onde, escolheu o estado do
 *    PEDIDO. Nasceu `a_preparar` («A preparar proposta»), entre «Aguardar
 *    resposta» e «Proposta enviada»: o estúdio já tem um rascunho deste
 *    pedido, e a proposta ainda não seguiu. Conta como trabalho do nosso lado
 *    (a lista «Fazer proposta», a espera, o «por responder»), nunca como
 *    proposta enviada — o «À espera» do dinheiro continua a ser só `cotado`.
 *
 * 3. `rejeitado` NÃO SE ATINGE NEM SE LARGA SOZINHO. Perder um trabalho é uma
 *    decisão de uma pessoa (ou do próprio cliente, a recusar a proposta pelo
 *    link) e nenhum acontecimento automático a toma nem a desfaz. Por isso
 *    `rejeitado` não está na escada abaixo: está fora dela, e um pedido que lá
 *    esteja fica quieto até alguém o mexer à mão.
 */

/**
 * O que o back office FEZ ao pedido. Não é o estado, é o acontecimento — a
 * tradução de um para o outro é o que este módulo faz, e é a única.
 *
 * Um acontecimento só entra nesta lista quando há um sítio real que o produz.
 * Um caso que NÃO está aqui de propósito: o cliente aceitar a proposta pelo
 * link público. Essa é uma decisão dele, é a única porta para `rejeitado`
 * (recusa) e vive inteira em `src/app/api/proposta/route.ts`.
 *
 * ── `proposta_aceite` É O GESTO DELA, NÃO O DO CLIENTE ─────────────────────
 *
 * Não confundir com o parágrafo acima. `proposta_aceite` é ela a marcar a
 * proposta como aceite no back office — no ecrã «Propostas» ou no
 * «Acompanhamento» —, tipicamente porque o casal respondeu por email ou ao
 * telefone e não pelo link. É o mesmo tecto (`aceite`) que o pagamento e o
 * contrato já davam, pela mesma razão: ninguém marca uma proposta como aceite
 * a um cliente que ainda está a pensar.
 *
 * Nasceu porque essa regra JÁ EXISTIA — escrita à mão dentro do
 * `Propostas.tsx`, num segundo pedido HTTP disparado pelo browser depois do
 * primeiro. Estava certa e estava no sítio errado: só valia naquele ecrã (o
 * «Acompanhamento» mudava o mesmo estado e não mexia no pedido), e num 4G
 * fraco o segundo pedido podia nunca chegar — a proposta ficava aceite e o
 * pedido não. É exactamente a regra 1 do cabeçalho a repetir-se: a mesma
 * decisão escrita em dois sítios acaba a divergir.
 *
 * ── `proposta_em_preparacao` É O ESTÚDIO A GRAVAR UM RASCUNHO ─────────────
 *
 * Quem o produz é o `PUT` de `/api/orcamento/[id]/proposta-rascunho`, e só
 * para o rascunho DO ESTÚDIO (a ferramenta antiga das linhas e a gaveta do
 * resgate não contam: não são uma proposta a ser montada). Ela não tem de se
 * lembrar de arrastar o cartão: começar a proposta já o diz.
 */
export type AcontecimentoDoPedido =
  | "mensagem_enviada"
  | "proposta_em_preparacao"
  | "proposta_enviada"
  | "proposta_aceite"
  | "pagamento_recebido"
  | "contrato_registado";

/**
 * A escada, por ordem. A posição de cada estado é o que decide se uma
 * transição sobe (aplica-se) ou desce (ignora-se).
 *
 * `rejeitado` não está aqui e não é esquecimento — ver a regra 3 no cabeçalho.
 */
export const ORDEM_DOS_ESTADOS = [
  "pendente",
  "em_revisao",
  "a_preparar",
  "cotado",
  "aceite",
] as const satisfies readonly QuoteStatus[];

/**
 * Os rótulos que ela lê no quadro. Vivem aqui porque é aqui que se escreve a
 * linha do histórico: se o histórico dissesse «pendente → cotado» e a coluna
 * dissesse «Novo» e «Proposta enviada», eram duas linguagens para a mesma
 * coisa. Espelham `STATUS_OPTIONS` (AdminClient) e as colunas do Kanban.
 */
export const ROTULO_DO_ESTADO: Record<QuoteStatus, string> = {
  pendente: "Novo",
  em_revisao: "Aguardar resposta",
  a_preparar: "A preparar proposta",
  cotado: "Proposta enviada",
  aceite: "Ganho",
  rejeitado: "Perdido",
};

/**
 * A tabela inteira: acontecimento → estado a que ele dá direito.
 *
 * «Dá direito» e não «põe»: é o TECTO que aquele acontecimento justifica. Se o
 * pedido já estiver acima, fica onde está (regra 1).
 *
 * Houve aqui um `fatura_emitida`, que valia `aceite` («Ganho») pela mesma razão
 * por que `pagamento_recebido` o vale: não se manda uma factura a quem ainda
 * está a pensar. Saiu com a facturação — nada nesta aplicação emite facturas, e
 * um acontecimento que ninguém produz não pertence a esta lista (ver a regra no
 * topo do tipo). As linhas de histórico já escritas por ele não se perdem: são
 * texto livre gravado com `kind: "status_change"`, como todas as outras.
 */
export const ESTADO_APOS: Record<AcontecimentoDoPedido, QuoteStatus> = {
  mensagem_enviada: "em_revisao",
  proposta_em_preparacao: "a_preparar",
  proposta_enviada: "cotado",
  proposta_aceite: "aceite",
  pagamento_recebido: "aceite",
  contrato_registado: "aceite",
};

/**
 * O porquê, em português, para a linha do histórico. Ela vê a coluna mudar
 * sozinha; sem isto, não tem como saber o que a mudou.
 */
const MOTIVO: Record<AcontecimentoDoPedido, string> = {
  mensagem_enviada: "respondemos ao cliente",
  proposta_em_preparacao: "começámos a proposta no estúdio",
  proposta_enviada: "proposta enviada ao cliente",
  proposta_aceite: "proposta dada como aceite",
  pagamento_recebido: "pagamento recebido",
  contrato_registado: "contrato registado",
};

/**
 * Em que degrau da escada está este estado. `null` para `rejeitado`, que está
 * fora dela.
 *
 * Um estado ausente ou desconhecido conta como o degrau ZERO, não como um erro:
 * há pedidos gravados antes de metade destes campos existirem, e uma rota que
 * leia um pedido sem `status` tem de poder avançá-lo na mesma. Recusar seria
 * escolher deixar o quadro errado por causa de um campo em falta.
 */
export function degrauDoEstado(estado: QuoteStatus | null | undefined): number | null {
  if (estado === "rejeitado") return null;
  const i = (ORDEM_DOS_ESTADOS as readonly QuoteStatus[]).indexOf(estado as QuoteStatus);
  return i >= 0 ? i : 0;
}

/**
 * O estado NOVO que este acontecimento justifica, ou `null` quando não há nada
 * a fazer — porque o pedido já lá está, porque já está mais à frente, ou
 * porque está `rejeitado` e isso só uma pessoa desfaz.
 */
export function estadoApos(
  acontecimento: AcontecimentoDoPedido,
  estadoActual: QuoteStatus | null | undefined,
): QuoteStatus | null {
  const actual = degrauDoEstado(estadoActual);
  if (actual === null) return null; // rejeitado: fica quieto
  const destino = ESTADO_APOS[acontecimento];
  const alvo = degrauDoEstado(destino);
  if (alvo === null || alvo <= actual) return null;
  return destino;
}

export interface TransicaoDoPedido {
  /** O estado novo. Nunca é o actual — se fosse, não havia transição. */
  status: QuoteStatus;
  /** A linha já escrita para o `activityLog` do pedido. */
  entrada: ActivityEntry;
}

/**
 * A decisão completa: o estado novo mais a linha do histórico que o explica,
 * ou `null` quando o acontecimento não mexe em nada.
 *
 * `detalhe` é o que torna a linha útil meses depois — o número da factura, o
 * valor recebido, a referência do contrato. Sem ele a entrada diz que houve
 * uma factura; com ele diz QUAL.
 *
 * `at` e `id` são injectáveis para os testes poderem ser determinísticos; em
 * produção ninguém os passa.
 */
export function transicaoDoPedido(pedido: {
  acontecimento: AcontecimentoDoPedido;
  estadoActual: QuoteStatus | null | undefined;
  detalhe?: string;
  at?: string;
  id?: string;
  actor?: string;
}): TransicaoDoPedido | null {
  const destino = estadoApos(pedido.acontecimento, pedido.estadoActual);
  if (!destino) return null;

  // O estado de partida tal como ele vai aparecer na frase. Um pedido sem
  // estado nenhum (registo antigo) parte de «Novo», que é o que ele é.
  const de = ROTULO_DO_ESTADO[pedido.estadoActual as QuoteStatus] ?? ROTULO_DO_ESTADO.pendente;
  const para = ROTULO_DO_ESTADO[destino];
  const motivo = MOTIVO[pedido.acontecimento];
  const detalhe = pedido.detalhe?.trim();

  return {
    status: destino,
    entrada: {
      id: pedido.id ?? idCurto(),
      at: pedido.at ?? new Date().toISOString(),
      // O mesmo `kind` que o arrasto no Kanban e a gaveta usam: para quem lê o
      // histórico isto É uma mudança de estado, e tem de ter o mesmo ícone e a
      // mesma cor. O que a distingue de uma mudança à mão é o `actor`.
      kind: "status_change",
      // «Sistema» é o nome que o resto do back office já usa para o que não foi
      // ninguém (ver o pré-preenchimento da produção no aceite). É por aqui que
      // ela distingue, na mesma lista, o que mudou sozinho do que ela mudou.
      actor: pedido.actor ?? "Sistema",
      summary: `${de} → ${para} · ${motivo}${detalhe ? ` (${detalhe})` : ""}`,
    },
  };
}
