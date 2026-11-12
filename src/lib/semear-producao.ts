import { randomBytes, randomUUID } from "crypto";
import { updateQuoteWith } from "./quotes-store";
import { buildProductionPlanItems } from "./production-templates";
import { checklistTemplate } from "./checklist-templates";
import {
  createCalendarEvent,
  chavesDeDatasJaGeradas,
  notaDeDataChaveGerada,
} from "./calendar-store";
import { getProposalByQuote } from "./proposals-store";
import { rotularPontos } from "./orcamento/decoracao";
import { listMaterial } from "./material-store";
import { listLists } from "./material-lists-store";
import { listAllListItems } from "./material-list-items-store";
import { listRules } from "./material-rules-store";
import { gerarChecklist, type ContextoEvento } from "./material-rules";
import { getForQuote, obterOuCriarParaPedido, updateEventMaterial } from "./event-material-store";
import { listItemsOfEvent, addEventItem, removeItemsOfEvent } from "./event-material-items-store";
import { depositPercentOf, hojeNoEstudio } from "./proposal-doc";
import { totaisDaProposta } from "./proposal-budget";
import type { ChecklistItem, CalendarEventKind, Payment, Quote } from "./orcamento/types";
import { prazoDoSaldo } from "./orcamento/cobrancas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANDO UM PEDIDO É GANHO, A PRODUÇÃO ARRANCA PREENCHIDA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Sem isto o separador Produção começava vazio e a equipa reconstruía o mesmo
 * plano à mão de cada vez. Semeia-se do mesmo template que o ecrã usa, para o
 * que o servidor escreve ser igual ao que ela escreveria.
 *
 * ── PORQUE É QUE ISTO MUDOU DE CASA ───────────────────────────────────────
 *
 * Vivia dentro da rota que o CLIENTE chamava ao carregar em «Aceitar proposta»
 * — o botão que a dona da casa mandou tirar, porque um casamento não se fecha
 * num botão. Com o botão fora, a proposta passa a ser aceite pela conversa: o
 * casal responde por email ou por telefone, e alguém marca o pedido como
 * «Ganho» no back office.
 *
 * Se esta lógica tivesse ido abaixo com a rota, marcar «Ganho» à mão deixava a
 * produção vazia — a equipa perdia uma coisa que já tinha, e ninguém ligaria a
 * perda ao botão que desapareceu. Por isso mudou de casa em vez de morrer.
 *
 * ── AS TRÊS PROMESSAS ─────────────────────────────────────────────────────
 *
 *  1. **Idempotente.** A checklist geral só preenche se estiver VAZIA; o plano
 *     de montagem ACRESCENTA só o que falta (ver {@link acrescentarTarefasDeMontagem}).
 *     Marcar «Ganho» duas vezes, ou corrigir o estado para trás e para a
 *     frente, não duplica uma tarefa.
 *  2. **Não pisa trabalho.** Um plano que a equipa já tenha escrito fica
 *     exactamente como está — o que é novo entra a seguir, nunca por cima.
 *  3. **Melhor esforço.** Quem chama trata isto como acessório: gravar o estado
 *     do pedido tem de resultar mesmo que a sementeira falhe. O que se perde é
 *     uma lista pré-preenchida, não o negócio.
 *
 * Fornecedores NÃO são semeados: a proposta não tem uma lista estruturada de
 * categorias que se possa mapear — só linhas em texto livre —, e semear
 * fornecedores a partir daí era adivinhar.
 */
export async function semearProducaoAoGanhar(quoteId: string, quando: string): Promise<void> {
  await updateQuoteWith(quoteId, (quote) => {
    const semeado: string[] = [];
    const makeId = () => randomBytes(4).toString("hex");

    const { plano, acrescentadas } = acrescentarTarefasDeMontagem(quote.productionPlan, makeId);
    let productionPlan = quote.productionPlan;
    if (acrescentadas > 0) {
      productionPlan = plano;
      semeado.push(
        `plano de montagem (${acrescentadas} tarefa${acrescentadas === 1 ? "" : "s"} nova${acrescentadas === 1 ? "" : "s"})`,
      );
    }

    let checklist = quote.checklist;
    if (!checklist?.length) {
      checklist = checklistTemplate(quote.category).map((label) => ({
        id: makeId(),
        label,
        done: false,
      }));
      semeado.push(`checklist do evento (${checklist.length} itens)`);
    }

    // Já tinha tudo: devolve-se o pedido intacto, sem entrada no histórico.
    // Uma linha a dizer «não semeei nada» seria ruído em cada gravação.
    if (semeado.length === 0) return quote;

    return {
      ...quote,
      productionPlan,
      checklist,
      activityLog: [
        ...(quote.activityLog ?? []),
        {
          id: makeId(),
          at: quando,
          kind: "note_added" as const,
          actor: "Sistema",
          summary: `Produção pré-preenchida ao marcar como ganho: ${semeado.join(" · ")}`,
        },
      ],
    };
  });
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PLANO DE MONTAGEM: ACRESCENTAR, NUNCA SUBSTITUIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Decisão da dona da casa (`PROPOSTA-ACEITE.md`): um plano já escrito à mão
 * não se apaga. As tarefas do template que ainda faltam entram no FIM, e só
 * essas — o resto do plano, ordem incluída, fica exactamente como estava.
 *
 * `buildProductionPlanItems` já sabe filtrar pelo `label` já presente
 * (`existingLabels`) — é o mesmo ajudante que o botão "Aplicar plano" da UI
 * usa para reaplicar sem duplicar. Aqui usa-se sempre com esse filtro, nunca
 * "tudo ou nada": um plano vazio e um plano a meio tratam-se da mesma maneira,
 * a diferença é só quantas tarefas já lá estavam.
 *
 * Partilhado entre a sementeira automática (silenciosa, ao marcar «Ganho») e
 * a geração explícita do painel (`gerarEventoAoGanhar`) — as duas têm de
 * produzir exactamente o mesmo resultado, e reaplicar depois de uma já ter
 * corrido não pode encontrar mais nada por acrescentar.
 */
function acrescentarTarefasDeMontagem(
  productionPlan: ChecklistItem[] | undefined,
  makeId: () => string,
): { plano: ChecklistItem[]; acrescentadas: number } {
  const existentes = new Set((productionPlan ?? []).map((i) => i.label));
  const novas = buildProductionPlanItems(makeId, existentes);
  if (novas.length === 0) return { plano: productionPlan ?? [], acrescentadas: 0 };
  return { plano: [...(productionPlan ?? []), ...novas], acrescentadas: novas.length };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS ANTECEDÊNCIAS DE PARTIDA — APROVADAS, NÃO CONFIGURÁVEIS (AINDA)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `PROPOSTA-ACEITE.md` propunha guardá-las em `proposal_settings`, ao lado do
 * preço do combustível, para poderem mudar sem tocar em código. Esse ficheiro
 * (`proposta-definicoes-store.ts`) não está no lote de ficheiros desta tarefa
 * — outro agente pode estar a mexer nele ao mesmo tempo —, por isso ficam
 * aqui como constantes, exactamente com os números que ela aprovou. Tornar
 * isto configurável é trabalho a seguir, não uma correcção.
 *
 * Dias são SEMPRE "antes do evento"; a desmontagem usa um número negativo, o
 * que a coloca depois — a mesma convenção do desenho original.
 */
export const ANTECEDENCIAS_DATAS_CHAVE: Record<
  string,
  { titulo: string; dias: number; kind: CalendarEventKind }
> = {
  reuniao: { titulo: "Reunião de confirmação", dias: 30, kind: "reuniao" },
  flores: { titulo: "Encomenda de flores", dias: 14, kind: "nota" },
  montagem: { titulo: "Montagem", dias: 1, kind: "evento" },
  desmontagem: { titulo: "Desmontagem", dias: -1, kind: "evento" },
};

/** `dataDoEvento` menos `dias` dias, em yyyy-mm-dd. `null` se a data não for válida. */
function antesDoEvento(dataDoEvento: string, dias: number): string | null {
  const d = new Date(`${dataDoEvento}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/**
 * As datas-chave deste pedido que AINDA NÃO foram geradas, com a data já
 * calculada. Puramente de leitura — não escreve nada.
 *
 * ── A DATA OCUPADA NÃO BLOQUEIA NADA ──────────────────────────────────────
 * Decisão da dona da casa: se uma data-chave cai em cima de um dia já
 * ocupado, gera-se na mesma — a mesma doutrina do aviso de data ocupada que
 * já existe (`AvisoDataOcupada.tsx`). Por isso não há aqui verificação
 * nenhuma de choque: quem decide é ela, ao ver o calendário depois.
 */
async function datasChaveEmFalta(
  quote: Pick<Quote, "id" | "date">,
): Promise<{ chave: string; titulo: string; data: string; kind: CalendarEventKind }[]> {
  if (!quote.date) return [];
  const jaGeradas = await chavesDeDatasJaGeradas(quote.id);
  const emFalta: { chave: string; titulo: string; data: string; kind: CalendarEventKind }[] = [];
  for (const [chave, def] of Object.entries(ANTECEDENCIAS_DATAS_CHAVE)) {
    if (jaGeradas.has(chave)) continue;
    const data = antesDoEvento(quote.date, def.dias);
    if (!data) continue;
    emFalta.push({ chave, titulo: def.titulo, data, kind: def.kind });
  }
  return emFalta;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CHECKLIST DE MATERIAL — O MESMO MOTOR QUE O BOTÃO "GERAR" JÁ USA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Espelha `contextoDoPedido` e o `POST` de
 * `src/app/api/orcamento/[id]/material/route.ts` de propósito — essa rota não
 * está no lote de ficheiros desta tarefa, e duplicar aqui o suficiente para
 * gerar ao marcar «Ganho» é o preço de não lhe mexer. As DUAS regras que
 * importam vêm de lá, byte a byte:
 *
 *  1. `obterOuCriarParaPedido` é o que torna isto seguro a chamar duas vezes
 *     — o índice único em `quote_id` apanha a corrida, não uma verificação
 *     à mão aqui.
 *  2. Regenerar preserva o que já foi carregado, marcado em falta, ou tem
 *     nota — e preserva as linhas acrescentadas à MÃO (`origin === "manual"`).
 *     Só as linhas de origem "base"/"regra" são substituídas.
 */
async function contextoDeMaterial(quote: Quote): Promise<ContextoEvento> {
  const proposta = await getProposalByQuote(quote.id);
  return contextoDoEvento(quote, proposta?.doc?.serviceGroups ?? []);
}

/**
 * O que dispara as regras do material — UM sítio para a rota «Gerar» e para o
 * «Ganho» (auditoria de 12/11, n.º 3).
 *
 * Enquanto não há proposta, contam os pontos que o casal marcou no pedido e
 * as notas dele. Quando a proposta tem serviços, conta SÓ a proposta: é o que
 * foi vendido. Antes, os pontos do pedido somavam-se sempre — os noivos
 * tiravam o cocktail, ela tirava-o da proposta, e a lista de material
 * continuava a mandar carregar o material do cocktail, porque o pedido de há
 * três meses ainda o tinha marcado.
 */
export function contextoDoEvento(
  quote: Pick<Quote, "decorPoints" | "notes" | "guests">,
  grupos: readonly { title?: string; items?: readonly { label?: string; desc?: string }[] }[],
): ContextoEvento {
  const servicos = grupos.flatMap((g) =>
    (g.items ?? []).map((i) => `${g.title ?? ""} ${i.label ?? ""}`.trim()).filter(Boolean),
  );
  const daProposta = servicos.length > 0;
  const pontos = daProposta ? [] : rotularPontos(quote.decorPoints ?? [], "pt");
  return {
    servicos: [...servicos, ...pontos],
    texto: [
      daProposta ? "" : (quote.notes ?? ""),
      ...servicos,
      ...pontos,
      ...grupos.flatMap((g) => (g.items ?? []).map((i) => i.desc ?? "")),
    ].join(" \n "),
    pax: quote.guests || 0,
  };
}

/**
 * Quantas linhas a regra de material propõe agora, sem escrever nada — e se
 * este pedido já tem checklist gerada.
 *
 * `jaExiste` importa para {@link PreviaGeracaoDoEvento.haQualquerCoisaAGerar}:
 * ao contrário do calendário/pagamentos/montagem (que só contam o que FALTA),
 * o material regenera-se por SUBSTITUIÇÃO das linhas de origem "base"/"regra"
 * — por isso `linhas` não é "quantas são novas", é "quantas ficarão". Sem
 * `jaExiste`, um pedido já gerado continuava a mostrar "1 item por gerar" para
 * sempre, e o painel nunca dizia "está tudo feito".
 */
async function materialAGerar(quote: Quote): Promise<{ linhas: number; jaExiste: boolean }> {
  const ctx = await contextoDeMaterial(quote);
  const [catalogo, listas, linhasDeLista, regras, anterior] = await Promise.all([
    listMaterial(),
    listLists(),
    listAllListItems(),
    listRules(),
    getForQuote(quote.id),
  ]);
  const linhas = gerarChecklist(ctx, { regras, listas, linhasDeLista, catalogo }).length;
  return { linhas, jaExiste: Boolean(anterior) };
}

/**
 * Gera (ou regenera) a checklist de material deste pedido. Devolve quantas
 * linhas de origem "base"/"regra" ficaram na checklist, e quantas linhas
 * marcadas (carregadas, com nota, em falta) foram preservadas.
 */
async function gerarMaterial(quote: Quote): Promise<{ linhas: number; preservadas: number }> {
  const ctx = await contextoDeMaterial(quote);
  const [catalogo, listas, linhasDeLista, regras] = await Promise.all([
    listMaterial(),
    listLists(),
    listAllListItems(),
    listRules(),
  ]);
  const geradas = gerarChecklist(ctx, { regras, listas, linhasDeLista, catalogo });

  const anterior = await getForQuote(quote.id);
  const anteriores = anterior ? await listItemsOfEvent(anterior.id) : [];
  const marcada = (i: (typeof anteriores)[number]) =>
    Boolean(i.loadedAt || i.note || i.vehicleId || i.returnedAt || i.missing) ||
    typeof i.usedQty === "number";
  const preservar = new Map(anteriores.filter(marcada).map((i) => [i.itemId ?? i.id, i]));
  const manuais = anteriores.filter((i) => i.origin === "manual");

  const jaExistia = Boolean(anterior);
  const evento = await obterOuCriarParaPedido(quote.id);
  if (jaExistia) {
    await removeItemsOfEvent(evento.id);
    await updateEventMaterial(evento.id, { generatedAt: new Date().toISOString() });
  }

  for (const g of geradas) {
    const antes = preservar.get(g.itemId);
    await addEventItem({
      eventId: evento.id,
      itemId: g.itemId,
      name: g.name,
      category: g.category,
      unit: g.unit,
      kind: g.kind,
      qty: g.qty,
      critical: g.critical,
      origin: g.origin,
      originRef: g.originRef,
      originLabel: g.originLabel,
      vehicleId: antes?.vehicleId,
      loadedAt: antes?.loadedAt,
      loadedBy: antes?.loadedBy,
      returnedAt: antes?.returnedAt,
      returnedBy: antes?.returnedBy,
      usedQty: antes?.usedQty,
      note: antes?.note,
      missing: antes?.missing ?? false,
    });
  }
  for (const m of manuais) {
    await addEventItem({ ...m, id: undefined, eventId: evento.id });
  }

  return { linhas: geradas.length, preservadas: preservar.size };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * SINAL E SALDO — O DINHEIRO É O DA PROPOSTA, NUNCA UMA CONTA NOVA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `dinheiroDaProposta` (via `totaisDaProposta`) e `depositPercentOf` são a
 * ÚNICA fonte — os mesmos que o PDF da proposta usou para imprimir "Sinal" e
 * "Saldo" ao casal. Nunca `resolveProposalMoney` sozinho (esse ignora os
 * valores adicionais) e nunca uma soma feita aqui.
 *
 * Idempotente por `kind`: se já existe uma linha `sinal` (ou `saldo`), essa
 * chave não gera outra — escrita ou apagada à mão, `payments` é dela a
 * partir daí. Nunca se marca nada como pago: `paid: false` sempre, porque
 * "entrou dinheiro" é um facto que só ela conhece.
 */
// `prazoDoSaldo` vive em `orcamento/cobrancas.ts` (é puro e o ecrã dos
// Pagamentos também o usa); fica exportado daqui para quem já o importava.
export { prazoDoSaldo } from "./orcamento/cobrancas";

async function pagamentosEmFalta(
  quote: Quote,
  quando: string,
): Promise<{ kind: "sinal" | "saldo"; amount: number; date: string }[]> {
  const proposta = await getProposalByQuote(quote.id);
  if (!proposta?.doc) return [];
  const pct = depositPercentOf(proposta.doc);
  const totais = totaisDaProposta(proposta.doc, pct);
  // Sem total resolvido não há o que gerar — gerar sinal/saldo de zero euros
  // não é "um ponto de partida", é lixo no separador de Pagamentos.
  if (!(totais.aPagar > 0)) return [];

  const existentes = new Set((quote.payments ?? []).map((p) => p.kind));
  const emFalta: { kind: "sinal" | "saldo"; amount: number; date: string }[] = [];
  // O sinal leva a data em que a proposta foi aceite — o momento em que se
  // gera, que é a mesma data que `quando` traz —, lida no dia de LISBOA (era o
  // dia de Greenwich: entre a meia-noite e a uma, no Verão, saía ontem). O
  // saldo leva o prazo do contrato: um mês antes do evento (`prazoDoSaldo`).
  const instante = new Date(quando);
  const diaDoSinal = Number.isNaN(instante.getTime())
    ? quando.slice(0, 10)
    : hojeNoEstudio(instante);
  if (!existentes.has("sinal")) {
    emFalta.push({ kind: "sinal", amount: totais.sinal, date: diaDoSinal });
  }
  if (!existentes.has("saldo")) {
    emFalta.push({
      kind: "saldo",
      amount: totais.saldo,
      date: prazoDoSaldo(quote.date, diaDoSinal),
    });
  }
  return emFalta;
}

/** O que o painel mostra ANTES de gerar — quantas linhas de cada, sem escrever nada. */
export interface PreviaGeracaoDoEvento {
  /** `jaExiste`: verdadeiro se este pedido já tem checklist de material — a
   *  regeneração substitui as linhas de origem "base"/"regra", não acrescenta. */
  material: { linhas: number; jaExiste: boolean };
  montagem: { linhas: number };
  calendario: { linhas: number };
  pagamentos: { linhas: number };
  /** Verdadeiro só quando há pelo menos uma linha nova em algum dos quatro. */
  haQualquerCoisaAGerar: boolean;
}

/**
 * O que o painel mostra ao marcar «Ganho», ANTES de ela carregar em "Gerar":
 * quantas linhas de cada um dos quatro artefactos vão nascer. Não escreve
 * nada — chamar isto duas seguidas dá sempre a mesma resposta.
 */
export async function preverGeracaoDoEvento(quote: Quote): Promise<PreviaGeracaoDoEvento> {
  const [material, montagem, calendario, pagamentos] = await Promise.all([
    materialAGerar(quote),
    Promise.resolve(
      acrescentarTarefasDeMontagem(quote.productionPlan, () => randomUUID()).acrescentadas,
    ),
    datasChaveEmFalta(quote),
    // A prévia usa "agora" como data de sinal hipotética — só para saber
    // QUANTAS linhas faltam; a data real é decidida ao gerar a sério.
    pagamentosEmFalta(quote, new Date().toISOString()),
  ]);
  return {
    material: { linhas: material.linhas, jaExiste: material.jaExiste },
    montagem: { linhas: montagem },
    calendario: { linhas: calendario.length },
    pagamentos: { linhas: pagamentos.length },
    haQualquerCoisaAGerar:
      (!material.jaExiste && material.linhas > 0) ||
      montagem > 0 ||
      calendario.length > 0 ||
      pagamentos.length > 0,
  };
}

/** O que aconteceu de facto ao carregar em "Gerar". */
export interface ResultadoGeracaoDoEvento {
  material: { linhas: number; preservadas: number };
  montagem: { linhas: number };
  calendario: { linhas: number };
  pagamentos: { linhas: number };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * "GERAR" — O BOTÃO DO PAINEL, DEPOIS DE ELA CONFIRMAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As quatro peças nascem daqui: a checklist de material, o plano de montagem
 * (as tarefas que ainda faltavam), as datas-chave e as linhas de sinal/saldo
 * — todas a partir dos serviços da proposta e do total já resolvido.
 *
 * Chamar duas vezes não duplica nada: cada peça tem a sua própria trava —
 * `obterOuCriarParaPedido` para o material, `chavesDeDatasJaGeradas` para o
 * calendário, o `kind` já presente para os pagamentos, e o `label` já
 * presente para o plano de montagem. A segunda chamada encontra tudo isto já
 * lá e não escreve mais nada — não é preciso um registo à parte do que já foi
 * gerado (a proposta original de `PROPOSTA-ACEITE.md` previa uma tabela
 * `event_generation` para isso; sem ela no lote de ficheiros desta tarefa, a
 * idempotência sai de cada peça saber reconhecer o que já é seu).
 */
export async function gerarEventoAoGanhar(
  quote: Quote,
  quando: string,
): Promise<ResultadoGeracaoDoEvento> {
  const material = await gerarMaterial(quote);

  const datas = await datasChaveEmFalta(quote);
  for (const d of datas) {
    await createCalendarEvent({
      date: d.data,
      title: d.titulo,
      kind: d.kind,
      note: notaDeDataChaveGerada(quote.id, d.chave),
    });
  }

  const pagamentosNovos = await pagamentosEmFalta(quote, quando);
  let montagemAcrescentadas = 0;
  {
    // A alteração ao pedido (pagamentos + plano de montagem) vai numa única
    // `updateQuoteWith`: são os dois campos que vivem no PRÓPRIO pedido, e
    // ler-modificar-escrever duas vezes seguidas arrisca a segunda pisar a
    // primeira num pedido que também está a ser gravado noutro separador.
    await updateQuoteWith(quote.id, (actual) => {
      const { plano, acrescentadas } = acrescentarTarefasDeMontagem(actual.productionPlan, () =>
        randomBytes(4).toString("hex"),
      );
      montagemAcrescentadas = acrescentadas;

      // Recalcula em cima do que está GRAVADO agora, não do `quote` lido no
      // início: entre o preview e o "Gerar" pode ter passado tempo, e o que
      // conta para "já existe sinal?" é o que está na loja neste instante.
      const existentes = new Set((actual.payments ?? []).map((p) => p.kind));
      const novasLinhas: Payment[] = pagamentosNovos
        .filter((p) => !existentes.has(p.kind))
        .map((p) => ({
          id: randomBytes(4).toString("hex"),
          kind: p.kind,
          amount: p.amount,
          date: p.date,
          paid: false,
          note: "Gerado automaticamente ao marcar como ganho",
        }));

      if (acrescentadas === 0 && novasLinhas.length === 0) return actual;

      const partes: string[] = [];
      if (acrescentadas > 0) {
        partes.push(
          `plano de montagem (${acrescentadas} tarefa${acrescentadas === 1 ? "" : "s"} nova${acrescentadas === 1 ? "" : "s"})`,
        );
      }
      if (novasLinhas.length > 0) {
        partes.push(
          `pagamentos (${novasLinhas.length} linha${novasLinhas.length === 1 ? "" : "s"})`,
        );
      }

      return {
        ...actual,
        productionPlan: plano,
        payments: [...(actual.payments ?? []), ...novasLinhas],
        activityLog: [
          ...(actual.activityLog ?? []),
          {
            id: randomBytes(4).toString("hex"),
            at: quando,
            kind: "note_added" as const,
            actor: "Sistema",
            summary: `Geração do painel de "Ganho": ${partes.join(" · ")}`,
          },
        ],
      };
    });
  }

  return {
    material,
    montagem: { linhas: montagemAcrescentadas },
    calendario: { linhas: datas.length },
    pagamentos: { linhas: pagamentosNovos.length },
  };
}
