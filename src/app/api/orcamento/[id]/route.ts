import { NextRequest, NextResponse } from "next/server";
import type { Proposal, Quote } from "@/lib/orcamento/types";
import { transicaoDoPedido, type AcontecimentoDoPedido } from "@/lib/orcamento/estado-do-pedido";
import { ehMotivoDeRecusa } from "@/lib/orcamento/desfecho";
import { getQuote, updateQuote } from "@/lib/quotes-store";
import type { ResultadoDoApagamento } from "@/lib/apagar-pedido";
import { NaoDeuParaApagar, enviarComDetalhe, quemApagou } from "@/lib/reciclagem";
import {
  semearProducaoAoGanhar,
  preverGeracaoDoEvento,
  gerarEventoAoGanhar,
} from "@/lib/semear-producao";
import { getProposalByQuote, updateProposal } from "@/lib/proposals-store";
import { desfazerCadeiaDoGanho, nascerContratoDoGanho } from "@/lib/contrato-do-ganho";
import { isAuthed } from "@/lib/admin-auth";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";
import { quoteUpdateSchema, firstError } from "@/lib/validation";
import { eur } from "@/lib/money";
import { log } from "@/lib/logger";
import { canonizar } from "@/lib/proposta-versao";

// The store is server-only and reaches for node:crypto — pin the Node runtime.
export const runtime = "nodejs";

/**
 * O que este PATCH conta como tendo ACONTECIDO ao pedido, comparando o que vem
 * com o que está gravado. `null` quando não aconteceu nada que mude o estado —
 * que é o caso da esmagadora maioria das gravações (uma nota, uma etiqueta, uma
 * linha de pagamento ainda por receber).
 *
 * Vive aqui e não no módulo da decisão de propósito: a decisão é sobre
 * ACONTECIMENTOS, e isto é a tradução de um corpo de HTTP para um deles. Pôr
 * `Partial<Quote>` lá dentro fazia a regra passar a saber o que é um PATCH.
 */
function acontecimentoDoPatch(
  actual: Quote,
  updates: Partial<Quote>,
): { acontecimento: AcontecimentoDoPedido; detalhe?: string } | null {
  // 1) Entrou dinheiro: uma linha marcada como paga que antes não estava.
  if (updates.payments) {
    const jaPagos = new Set((actual.payments ?? []).filter((p) => p.paid).map((p) => p.id));
    const recebido = updates.payments.find((p) => p.paid && !jaPagos.has(p.id));
    if (recebido) {
      return { acontecimento: "pagamento_recebido", detalhe: eur(recebido.amount) };
    }
  }
  // 2) Passou a haver contrato com referência. Apagá-la não desfaz nada — o
  //    estado nunca anda para trás, e um campo limpo por engano não pode
  //    desfechar um casamento no quadro.
  const ref = typeof updates.contractRef === "string" ? updates.contractRef.trim() : "";
  if (ref && ref !== (actual.contractRef ?? "").trim()) {
    return { acontecimento: "contrato_registado", detalhe: ref };
  }
  return null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    // Public endpoint (confirmation page loads by reference id). Authenticated
    // staff get the full record; anyone else gets an explicit allowlist of the
    // event facts the confirmation page renders — never the client's personal
    // data nor internal CRM fields (adminNotes, activityLog, payments, guest
    // list, lost reason…), so an enumerated id can't leak anything sensitive.
    // The id's random suffix has 64 bits of entropy, but rate limiting still
    // slows down brute-force scanning to a crawl for the unauthenticated path.
    if (!isAuthed(request)) {
      sweep();
      const limited = await rateLimit(`orcamento-get:${clientIp(request)}`, 20, 60_000);
      if (!limited.ok) {
        return NextResponse.json(
          { error: "Demasiados pedidos. Tenta novamente dentro de momentos." },
          { status: 429, headers: { "Retry-After": String(limited.retryAfter ?? 60) } },
        );
      }
    }

    const quote = await getQuote(id);
    if (!quote) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }
    if (isAuthed(request)) {
      /**
       * ══════════════════════════════════════════════════════════════════════
       * QUEM RECEBE TEM DE PODER DISTINGUIR ESTA RESPOSTA DA DE BAIXO
       * ══════════════════════════════════════════════════════════════════════
       *
       * Esta rota responde 200 nos dois casos: com sessão devolve o pedido
       * INTEIRO, sem sessão devolve a lista curta e pública lá em baixo — que
       * também leva `id`. São 200 com o mesmo aspecto à distância.
       *
       * O back office passou a ir buscar aqui o pedido completo quando ela abre
       * um pedido da lista (ver `openQuote` em AdminClient). Com a sessão
       * expirada — e ela fica com o separador aberto horas seguidas — a
       * resposta pública passava por completa: o painel abria sem nome, sem
       * contacto, sem pagamentos e sem convidados, e o pedido da lista era
       * substituído por essa versão amputada.
       *
       * Este cabeçalho é a distinção, dita e não adivinhada. Adivinhá-la pela
       * presença de um campo seria uma regra a partir-se sozinha no dia em que
       * a lista pública crescesse um campo.
       */
      return NextResponse.json(quote, { headers: { "x-pedido": "completo" } });
    }
    const safe = {
      id: quote.id,
      submittedAt: quote.submittedAt,
      status: quote.status,
      category: quote.category,
      eventType: quote.eventType,
      eventName: quote.eventName,
      packageTier: quote.packageTier,
      guests: quote.guests,
      date: quote.date,
      location: quote.location,
      addons: (quote.addons ?? []).map(({ id, name, tier }) => ({ id, name, tier })),
      // Sem isto, a página de confirmação mostrava os pontos de decoração
      // enquanto o `sessionStorage` durasse e perdia-os ao recarregar — o
      // casal recarrega a página e metade do que escolheu desapareceu. São
      // dados que a própria pessoa acabou de escrever; o que esta lista
      // protege é o que é INTERNO (preços, notas da equipa), e isto não é.
      decorPoints: quote.decorPoints ?? [],
      // Mesma razão dos pontos de decoração: são respostas que a própria pessoa
      // acabou de dar, e recarregar a página de confirmação não as pode fazer
      // desaparecer. O que esta lista protege é o que é INTERNO — preços, notas
      // da equipa — e isto não é nenhuma dessas coisas.
      ceremonyType: quote.ceremonyType ?? "",
      spaceType: quote.spaceType ?? "",
      dayCoordination: quote.dayCoordination === true,
    };
    return NextResponse.json(safe);
  } catch (err) {
    log.error("orcamento GET id falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  // Parse defensively: a malformed or non-object JSON body must yield a clean
  // 400, not an uncaught throw (this parse sits outside the try below, so an
  // unguarded request.json() would surface as a 500). `null`/numbers/strings
  // also break the `key in body` check further down with a TypeError.
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  const allowed: (keyof Quote)[] = [
    "status",
    "quotedPrice",
    "adminNotes",
    "checklist",
    "productionPlan",
    "payments",
    "timeline",
    "eventSuppliers",
    "tags",
    "followUpAt",
    "guestList",
    "activityLog",
    "assignedTo",
    "lostReason",
    "date",
    "guests",
    "location",
    // Os dados de contacto: um pedido que entrou por telefone não tem email, e
    // sem isto não havia por onde o acrescentar — nem sequer depois de o envio
    // responder «acrescenta o email e reenvia». Ver `quoteUpdateSchema`.
    "name",
    "email",
    "phone",
    "contractRef",
    "archived",
    // As contagens da folha do guião (adultos, crianças, equipa), escritas no
    // ecrã dos Guiões. Faltavam aqui: o PATCH respondia 200 e não gravava nada,
    // e o PDF do guião nunca as via. O esquema já as declarava.
    "folhaDaTimeline",
    // O mapa de mesas (ecrã «Mapa de mesas»). Declarado também no
    // `quoteUpdateSchema` — sem os dois, gravava em silêncio coisa nenhuma.
    "mapaDeMesas",
  ];
  const picked: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      picked[key] = body[key];
    }
  }
  // Append-only path for the activity log (not a Quote key, so picked apart).
  if ("activityLogAppend" in body) {
    picked.activityLogAppend = (body as Record<string, unknown>).activityLogAppend;
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * DE QUE VERSÃO É QUE ESTA LISTA FOI COPIADA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Os painéis do dossier — Pagamentos, Checklist, Timeline, Produção e
   * Custos — copiam a colecção INTEIRA para estado interno quando abrem, e ao
   * gravar mandam-na inteira de volta (ver `COLECCOES_INTEIRAS`). Isso quer
   * dizer que a gravação não é «marca este pagamento como recebido» — é
   * «substitui a lista de pagamentos por esta». Uma cópia de há duas horas
   * escreve por cima de tudo o que entretanto aconteceu.
   *
   * MEDIDO, e sem corrida nenhuma: o painel aberto de manhã no telemóvel, um
   * pagamento dado por recebido no portátil ao meio-dia, e um toque no
   * telemóvel à tarde — o `paid: true` volta a `false` e as linhas novas
   * desaparecem. As duas gravações respondem 200. Ninguém vê nada.
   *
   * O `updated_at` do `Repository` NÃO apanha isto, e é por isso que este
   * guarda tem de existir: o bloqueio optimista relê e volta a tentar, e o que
   * ele volta a aplicar é a MESMA substituição completa. O resultado final é
   * byte a byte igual ao da escrita cega. É a mesma armadilha que o
   * `email-templates-store.ts` já descreve por extenso.
   *
   * A correcção é o ecrã DIZER de onde copiou. Manda em `base` a colecção tal
   * como a leu, e o servidor compara-a com a que tem guardada: se alguém lhe
   * mexeu no meio, recusa com 409 e devolve as duas versões (a resposta da
   * casa — ver `respostaDeConflito`).
   *
   * Comparação por forma CANÓNICA (chaves ordenadas), e não por `JSON.stringify`
   * simples: a mesma lista com as chaves escritas por outra ordem — uma ida e
   * volta pelo `jsonb` do Postgres chega para isso — dava uma colisão falsa, e
   * um aviso que aparece sem razão é um aviso que se aprende a ignorar.
   *
   * `base` NÃO entra no `picked`: não é campo do pedido e nunca é gravado.
   */
  /**
   * O «Anular» de um «Ganho» (ver `desfazerCadeiaDoGanho`). Como a `base`, não
   * é campo do pedido e nunca é gravado.
   */
  const desfazerGanho = (body as Record<string, unknown>).desfazerGanho === true;
  const baseBruta = "base" in body ? (body as Record<string, unknown>).base : undefined;
  const base = (baseBruta && typeof baseBruta === "object" ? baseBruta : {}) as Record<
    string,
    unknown
  >;
  /**
   * As colecções que se mandam INTEIRAS e que, por isso, se podem sobrepor.
   *
   * As três últimas entraram depois, e cada uma tem um par de pessoas por
   * trás — que é a razão de estarem aqui e não a apanhar 200 em silêncio:
   *
   *   · `timeline` — o guião do dia. Ela abre-o no telemóvel na véspera; ele
   *     acrescenta «19:30 Discurso do pai» no portátil. O momento dele
   *     desaparecia no toque seguinte dela, e o guião imprime-se e entrega-se
   *     à equipa na manhã do evento: o que não está no papel não acontece.
   *
   *   · `eventSuppliers` — os custos. Ele escreve o custo real do catering;
   *     ela, com o painel aberto de manhã, muda o estado de outro fornecedor
   *     ao almoço — e manda a lista inteira com o orçado antigo do catering
   *     lá dentro. A margem do evento voltava atrás sem nada no ecrã a dizê-lo.
   *
   *   · `productionPlan` — o plano de atelier, pela mesma razão da checklist:
   *     duas pessoas a riscar tarefas do mesmo plano em telemóveis diferentes.
   */
  const COLECCOES_INTEIRAS = [
    "payments",
    "checklist",
    "productionPlan",
    "guestList",
    "timeline",
    "eventSuppliers",
    // Duas pessoas a arrumar as mesas do mesmo evento: a segunda não pisa a
    // primeira — recebe 409 e o ecrã aplica o gesto por cima do que encontrou.
    "mapaDeMesas",
  ] as const;
  const aConferir = COLECCOES_INTEIRAS.filter((campo) => campo in picked && campo in base);

  /**
   * O texto livre do motivo de perda — não é campo do PEDIDO, é campo da
   * PROPOSTA (`Proposal.lostNote`), e é lá que a análise o vai buscar. `Quote`
   * não tem `lostNote` de propósito: dois sítios a guardar a mesma nota
   * divergem com o tempo, e esta é a mesma separação que já existe do lado das
   * propostas (`lostReason` fechado, `lostNote` livre). Por não ser campo do
   * pedido, não passa pelo `quoteUpdateSchema` — validado à mão, com o mesmo
   * limite que `backup-restore.ts` já reserva para `Proposal.lostNote`.
   */
  const lostNoteBruto = "lostNote" in body ? (body as Record<string, unknown>).lostNote : undefined;
  const lostNote =
    typeof lostNoteBruto === "string" ? lostNoteBruto.trim().slice(0, 2000) : undefined;

  // Allowlist says WHICH fields may change; the schema validates the VALUES
  // (status enum, numeric price, well-formed arrays) so nothing malformed is
  // ever persisted and later breaks exports or revenue calculations.
  const parsed = quoteUpdateSchema.safeParse(picked);
  if (!parsed.success) {
    return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  }
  const { activityLogAppend, ...updates } = parsed.data as Partial<Quote> & {
    activityLogAppend?: Quote["activityLog"];
  };

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * QUEM ESCOLHE O ESTADO À MÃO GANHA SEMPRE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Um arrasto no quadro ou uma escolha na gaveta é uma decisão de uma pessoa,
   * e a automação não a discute — nem sequer para a confirmar. Sem esta linha,
   * marcar um pedido como «Perdido» no mesmo gesto em que se corrige um
   * pagamento fazia a automação escrever «Ganho» por cima. É também a única
   * coisa que garante que `rejeitado` continua a ser exclusivamente humano.
   */
  const estadoEscolhidoAMao = "status" in picked;

  try {
    // Merge appends onto the FRESH stored log, server-side. Clients used to
    // send the whole recomputed array; two tools saving near-simultaneously
    // (e.g. "proposta enviada" + Guardar) would overwrite each other's entries.
    //
    // O registo fresco serve agora para uma segunda coisa: comparar o que vem
    // com o que está, para saber se ACONTECEU alguma coisa que mude o estado.
    const querAppend = !!activityLogAppend && activityLogAppend.length > 0;
    const podeMudarEstado =
      !estadoEscolhidoAMao && ("payments" in picked || "contractRef" in picked);
    const precisaDoActual = querAppend || podeMudarEstado || aConferir.length > 0;
    const current = precisaDoActual ? await getQuote(id) : null;
    if (precisaDoActual && !current) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }

    /**
     * A CONFERÊNCIA DA BASE — ver o comentário longo lá em cima.
     *
     * Só recusa quando o ecrã DIZ de onde copiou e essa base já não é a que
     * está guardada. Um cliente que não mande `base` continua a gravar como
     * sempre gravou: isto acrescenta uma protecção a quem a pede, e não parte
     * nada de quem ainda não a manda.
     */
    if (current && aConferir.length > 0) {
      const igual = (a: unknown, b: unknown) =>
        JSON.stringify(canonizar(a ?? [])) === JSON.stringify(canonizar(b ?? []));
      const mexido = aConferir.filter(
        (campo) => !igual(base[campo], (current as unknown as Record<string, unknown>)[campo]),
      );
      if (mexido.length > 0) {
        log.warn("orcamento PATCH: gravação recusada, a lista mudou por baixo", {
          id,
          campos: mexido,
        });
        return NextResponse.json(
          {
            error:
              "Isto foi alterado noutro sítio depois de este ecrã ter aberto. " +
              "Recarrega para veres o que está guardado — o que escreveste está aqui em baixo.",
            /** O que o servidor tem AGORA, para o ecrã se pôr em dia. */
            current,
            /** O que esta gravação queria escrever, para não se perder na recusa. */
            submetido: picked,
          },
          { status: 409 },
        );
      }
    }

    if (current && querAppend) {
      (updates as Partial<Quote>).activityLog = [
        ...(current.activityLog ?? []),
        ...(activityLogAppend ?? []),
      ].slice(-5000);
    }

    /**
     * ════════════════════════════════════════════════════════════════════════
     * REGISTAR UM PAGAMENTO OU UM CONTRATO É DIZER QUE O TRABALHO É NOSSO
     * ════════════════════════════════════════════════════════════════════════
     *
     * Este PATCH é a porta por onde o painel de Pagamentos grava (manda a lista
     * inteira em `{ payments }`) e por onde a referência do contrato é guardada.
     * Nenhuma das duas coisas mexia no estado: ela dava um sinal por recebido e
     * o pedido continuava em «Proposta enviada».
     *
     * ── O QUE CONTA E O QUE NÃO CONTA ────────────────────────────────────
     *
     * Só um pagamento com `paid: true` que ANTES não estava pago. Uma linha de
     * pagamento por receber é um PLANO — a maioria é criada assim, com o sinal
     * pré-preenchido no momento em que se abre o painel — e um plano não é um
     * negócio ganho. Comparar com o registo gravado é o que separa "acabou de
     * entrar dinheiro" de "esta linha já cá estava e vem outra vez no array".
     *
     * A referência do contrato conta quando passa a existir: escrevê-la é dizer
     * que há contrato assinado com aquele número.
     *
     * Tudo em melhor esforço: guardar um pagamento tem de resultar mesmo que a
     * conta do estado rebente. O que se perde é a cor de uma coluna.
     */
    if (current && podeMudarEstado) {
      try {
        const aconteceu = acontecimentoDoPatch(current, updates);
        const transicao = aconteceu
          ? transicaoDoPedido({
              acontecimento: aconteceu.acontecimento,
              estadoActual: current.status,
              detalhe: aconteceu.detalhe,
            })
          : null;
        if (transicao) {
          (updates as Partial<Quote>).status = transicao.status;
          (updates as Partial<Quote>).activityLog = [
            ...((updates as Partial<Quote>).activityLog ?? current.activityLog ?? []),
            transicao.entrada,
          ].slice(-5000);
        }
      } catch (e) {
        log.error("orcamento PATCH: transição automática de estado falhou", e, { id });
      }
    }

    const updated = await updateQuote(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }

    /**
     * GANHO À MÃO É GANHO À MESMA — E A PRODUÇÃO ARRANCA PREENCHIDA.
     *
     * Isto acontecia quando o cliente carregava em «Aceitar proposta» no link.
     * Esse botão saiu (a resposta do casal passa a ser por email ou telefone),
     * e o aceite passa a ser esta gravação: alguém marca o pedido como «Ganho».
     * Sem esta chamada, a equipa perdia o plano de produção pré-preenchido e
     * ninguém ligaria a perda ao botão que desapareceu.
     *
     * Só quando ESTE pedido põe o estado em «aceite» — pela mão dela ou pela
     * transição automática de um pagamento recebido. Correr em cada gravação de
     * um pedido já ganho era um ler-modificar-escrever a mais por cada tecla.
     *
     * Melhor esforço, e de propósito: o estado já está gravado: se a sementeira
     * falhar, perde-se uma lista pré-preenchida, não o negócio.
     */
    if (updated.status === "aceite" && (updates as Partial<Quote>).status === "aceite") {
      try {
        await semearProducaoAoGanhar(id, new Date().toISOString());
      } catch (e) {
        log.error("orcamento PATCH: sementeira da produção falhou", e, { id });
      }
    }

    /**
     * ════════════════════════════════════════════════════════════════════════
     * A ANÁLISE DE PROPOSTAS LÊ OUTRO LIVRO — E TINHA DE SER ESTA ROTA A
     * ESCREVER LÁ TAMBÉM
     * ════════════════════════════════════════════════════════════════════════
     *
     * O gesto «Já responderam? Ganho / Perdido» faz PATCH e escreve só no
     * PEDIDO. Mas `analise-de-propostas.ts` lê `Proposal.status` e
     * `Proposal.lostReason` — quem marcava «Ganho» deixava a proposta em
     * «enviada» para sempre, a taxa de fecho ficava nula, e os casamentos
     * ganhos contavam como «ainda sem resposta».
     *
     * Propaga-se para a proposta MAIS RECENTE do pedido (a mesma que o portal
     * do cliente mostra — `getProposalByQuote`), em dois momentos:
     *
     *  1. `desfechoConfirmadoAgora` — ESTE PATCH é quem decide o desfecho, à
     *     mão ou pela transição automática de cima. Vai `status` e
     *     `respondedAt`, e — só quando é perdido — o motivo, se já vier.
     *  2. `motivoAcrescentadoDepois` — o segundo passo, opcional, de
     *     `PerguntaDeDesfecho`: o pedido já está «rejeitado» de um PATCH
     *     anterior, e chega só o motivo (ou a nota), sem `status` nenhum no
     *     corpo. Sem isto, o motivo escrito nos botões nunca saía do PEDIDO —
     *     que nem sequer o guarda — e a contagem continuava a ler zero.
     *
     * O motivo só propaga quando é um dos {@link MotivoDeRecusa} fechados
     * (`ehMotivoDeRecusa`): um texto livre escrito noutro sítio (o editor de
     * `AdminClient`) não é uma das cinco palavras que a contagem sabe ler, e
     * escrevê-lo por cima do que lá estivesse teria estragado uma proposta
     * respondida a partir de uma nota que não é a dela.
     *
     * Melhor esforço, como a sementeira acima: o pedido já está gravado — se
     * isto falhar, a análise fica incompleta, não o negócio.
     */
    const estadoDesteGravou = (updates as Partial<Quote>).status;
    const desfechoConfirmadoAgora =
      (estadoDesteGravou === "aceite" || estadoDesteGravou === "rejeitado") &&
      updated.status === estadoDesteGravou;
    const motivoAcrescentadoDepois =
      !desfechoConfirmadoAgora &&
      updated.status === "rejeitado" &&
      (ehMotivoDeRecusa(updates.lostReason) || lostNote !== undefined);

    if (desfechoConfirmadoAgora || motivoAcrescentadoDepois) {
      try {
        const proposta = await getProposalByQuote(id);
        if (proposta) {
          const patchProposta: Partial<Proposal> = {};
          if (desfechoConfirmadoAgora) {
            patchProposta.status = updated.status === "aceite" ? "aceite" : "rejeitada";
            patchProposta.respondedAt = new Date().toISOString();
          }
          if (updated.status === "rejeitado") {
            if (ehMotivoDeRecusa(updates.lostReason)) patchProposta.lostReason = updates.lostReason;
            if (lostNote !== undefined) patchProposta.lostNote = lostNote;
          }
          if (Object.keys(patchProposta).length > 0) {
            await updateProposal(proposta.id, patchProposta);
          }

          /**
           * O contrato nasce quando a equipa marca «Ganho» — por assinar. O
           * porquê inteiro (o lock, o que ele não finge, os termos congelados)
           * está em `nascerContratoDoGanho`, que é a mesma função que o
           * «Aceitar» das Propostas e o botão «Criar contrato» usam.
           */
          if (desfechoConfirmadoAgora && updated.status === "aceite") {
            await nascerContratoDoGanho(id, { ...proposta, ...patchProposta });
          }
        }
      } catch (e) {
        log.error("orcamento PATCH: propagação para a proposta/contrato falhou", e, { id });
      }
    }

    if (desfazerGanho && updated.status !== "aceite") {
      try {
        await desfazerCadeiaDoGanho(id);
      } catch (e) {
        log.error("orcamento PATCH: desfazer o ganho (proposta/contrato) falhou", e, { id });
      }
    }

    return NextResponse.json(updated);
  } catch (err) {
    log.error("orcamento PATCH falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * O PAINEL DE «GANHO»: O QUE VAI NASCER, E SÓ DEPOIS DE ELA CARREGAR EM GERAR
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `PROPOSTA-ACEITE.md`: "Não vou gerar nada sem confirmação... Marcar como
 * aceite mostra um painel com o que vai ser gerado e quantas linhas de cada;
 * ela carrega em gerar." Duas acções no mesmo corpo — `{ acao: "prever" }`
 * NÃO escreve nada; `{ acao: "gerar" }` escreve, e é chamável quantas vezes
 * ela quiser sem duplicar (ver `gerarEventoAoGanhar`).
 *
 * Só faz sentido depois de o pedido estar «aceite» — antes disso não há
 * total resolvido nem faz sentido nenhuma das quatro peças.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const acao = body && typeof body === "object" ? (body as Record<string, unknown>).acao : null;
  if (acao !== "prever" && acao !== "gerar") {
    return NextResponse.json({ error: "acao tem de ser 'prever' ou 'gerar'" }, { status: 400 });
  }

  try {
    const quote = await getQuote(id);
    if (!quote) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }
    if (quote.status !== "aceite") {
      return NextResponse.json(
        { error: "O pedido ainda não está marcado como Ganho" },
        { status: 409 },
      );
    }

    if (acao === "prever") {
      return NextResponse.json(await preverGeracaoDoEvento(quote));
    }

    const resultado = await gerarEventoAoGanhar(quote, new Date().toISOString());
    return NextResponse.json(resultado);
  } catch (err) {
    log.error("orcamento POST (geração ao ganhar) falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * APAGAR PASSA A APAGAR MESMO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Continua a ser distinto do arquivo (`PATCH { archived: true }`), que é
 * reversível e guarda a linha. O que muda é o que «apagar» quer dizer.
 *
 * Isto tirava a linha do pedido e mais nada. As PROPOSTAS ficavam — com o nome
 * do casal, o email e o documento inteiro — porque a chave estrangeira é
 * `on delete set null`: em vez de irem atrás, ficavam órfãs e intactas. As
 * fotografias ficavam no bucket, e o rascunho do estúdio no `app_state`.
 *
 * A política de privacidade PUBLICADA no sítio promete o contrário: «pedidos
 * que não deem origem a contrato são eliminados no prazo máximo de 12 meses».
 * Uma linha apagada com os dados todos no sítio não é um apagamento — é a
 * aparência de um.
 *
 * O comentário que aqui estava dizia que os rascunhos ficavam porque «o
 * proposals-store não expõe um apagamento limpo». Já expõe: o `deleteProposal`
 * está lá. Era uma razão que tinha deixado de ser verdade e ninguém foi
 * corrigir — como o `mostrarTotalAPagar`.
 *
 * ── O QUE CONTINUA A FICAR, E BEM ─────────────────────────────────────────
 *
 * Contratos e facturas são registos fiscais e conservam-se anos. É por isso
 * que a promessa da política fala de pedidos SEM contrato, e é por isso que um
 * pedido com contrato responde 409 em vez de ser apagado a meio: quem quiser
 * tratar desse caso decide-o com a contabilidade à frente, não com um botão.
 *
 * ── E RESPONDE COM O QUE FICOU POR APAGAR ─────────────────────────────────
 *
 * Um apagamento silencioso é indistinguível de um que não aconteceu, que é
 * precisamente o defeito que isto veio corrigir. Se o bucket recusar uma
 * fotografia, isso chega a quem carregou no botão — senão fica um ficheiro com
 * a cara de um casal num sítio que ninguém sabe que ainda existe.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  try {
    // Pela Reciclagem (fase R3b de `docs/TUDO-REVERSIVEL.md`): o pedido fica lá
    // 30 dias, com as propostas, os rascunhos e o material — e a pasta das
    // fotografias espera no Storage. Sem a tabela, é o apagar de sempre.
    const { reciclagem, detalhe } = await enviarComDetalhe("pedido", id, quemApagou(request));
    const r = detalhe as ResultadoDoApagamento;
    return NextResponse.json({ ok: true, contou: r.contou, falhou: r.falhou, reciclagem });
  } catch (err) {
    const r = err instanceof NaoDeuParaApagar ? (err.detalhe as ResultadoDoApagamento) : null;
    if (r?.motivo === "nao-existe") {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }
    if (r?.motivo === "tem-contrato") {
      return NextResponse.json(
        {
          error:
            "Este pedido deu origem a contrato, e um contrato é um registo fiscal " +
            "que tem de ser conservado. Nada foi apagado.",
        },
        { status: 409 },
      );
    }
    if (r) {
      return NextResponse.json(
        { error: "Não consegui apagar este pedido.", falhou: r.falhou },
        { status: 500 },
      );
    }
    log.error("orcamento DELETE falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
