import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getQuote, updateQuoteWith } from "@/lib/quotes-store";
import { listProposalsForQuote } from "@/lib/proposals-store";
import { getProposalDraft } from "@/lib/proposal-drafts";
import { depositPercentOf, type ProposalDoc } from "@/lib/proposal-doc";
import {
  aceiteComLinhasDoEstudio,
  docDaFaturacao,
  faturacaoPorArtigo,
  parcelasDaFatura,
  type DocParaFaturar,
} from "@/lib/orcamento/artigos-de-faturacao";
import type { Proposal } from "@/lib/orcamento/types";
import {
  configDoMoloni,
  criarRascunhoDeFatura,
  ErroDoMoloni,
  variaveisEmFalta,
} from "@/lib/moloni";
import { comCpu } from "@/lib/medir-cpu";
import { randomUUID } from "node:crypto";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «CRIAR NO MOLONI» — O RASCUNHO DA FATURA DO SINAL OU DO SALDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (5/11): «isso passa já tudo para o Moloni, mas não o faz. Apenas fica
 * como rascunho. Depois é só chegarmos lá e aceitarmos e verificarmos se está
 * tudo bem.»
 *
 * As contas fazem-se AQUI, no servidor, a partir da proposta aceite — nunca a
 * partir do que o browser manda. O browser só diz qual das fases.
 *
 * ── Custo (regra 7) ──────────────────────────────────────────────────────
 * Quantas vezes: uma por gesto (duas por cliente, no fim). Processador: o de
 * ler o pedido e as propostas, mais ~9 pedidos ao Moloni que são espera de
 * rede. Não se guarda nada no armazenamento além do id do rascunho no pedido.
 */
/**
 * A proposta de que sai a fatura, e de onde vêm os valores de cada serviço.
 *
 * Por esta ordem: a ACEITE (com as linhas do estúdio quando ela as preencheu
 * depois de aceitar — ver `aceiteComLinhasDoEstudio`); senão o rascunho do
 * estúdio (a que ela está a fazer); senão a última enviada. Só a aceite deixa
 * faturar; as outras mostram os valores e dizem porquê.
 */
async function propostaDeFaturacao(id: string, propostas: Proposal[]) {
  const aceite = propostas.find((p) => p.status === "aceite");
  const rascunho = await getProposalDraft(id).catch(() => null);
  const doEstudio =
    rascunho?.doc && typeof rascunho.doc === "object" && !Array.isArray(rascunho.doc)
      ? (rascunho.doc as ProposalDoc)
      : null;
  if (aceite?.doc) {
    const {
      doc,
      doEstudio: usouEstudio,
      porqueNao,
    } = aceiteComLinhasDoEstudio(aceite.doc as DocParaFaturar, doEstudio, aceite.versaoEscolhida);
    return {
      id: aceite.id as string | null,
      estado: "aceite" as const,
      versaoEscolhida: aceite.versaoEscolhida ?? null,
      doc: doc as ProposalDoc,
      linhasDoEstudio: usouEstudio,
      // Porque é que as linhas do estúdio NÃO se usaram (a versão aceite não
      // bate com elas, ou não fecham) — para o cartão e o 422 o dizerem.
      porqueNaoUsouEstudio: porqueNao ?? null,
    };
  }
  if (doEstudio) {
    return {
      id: null,
      estado: "rascunho" as const,
      versaoEscolhida: null,
      doc: doEstudio,
      linhasDoEstudio: true,
      porqueNaoUsouEstudio: null,
    };
  }
  const ultima = propostas.find((p) => p.doc && p.status !== "rejeitada");
  if (ultima?.doc) {
    return {
      id: ultima.id as string | null,
      estado: "enviada" as const,
      versaoEscolhida: null,
      doc: ultima.doc as ProposalDoc,
      linhasDoEstudio: false,
      porqueNaoUsouEstudio: null,
    };
  }
  return null;
}

async function POST_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }
  const faseCrua: unknown = body.fase;
  if (faseCrua !== "sinal" && faseCrua !== "saldo") {
    return NextResponse.json({ error: "Fase inválida" }, { status: 400 });
  }
  const fase: "sinal" | "saldo" = faseCrua;
  const actor = typeof body.actor === "string" ? body.actor.trim().slice(0, 80) : "";

  const quote = await getQuote(id);
  if (!quote) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  // «Anular» a marca de «passada à mão». Só essa: um rascunho criado pela API
  // existe no Moloni, e apagar o registo dele aqui só esconderia que existe.
  if (body.desmarcar === true) {
    let naoEManual = false;
    const gravado = await updateQuoteWith(id, (q) => {
      naoEManual = false;
      const e = q.faturasMoloni?.[fase];
      if (!e) return q;
      if (!e.manual || e.documentId || e.aCriarDesde) {
        naoEManual = true;
        return q;
      }
      const fats = { ...(q.faturasMoloni ?? {}) };
      delete fats[fase];
      return {
        ...q,
        faturasMoloni: fats,
        activityLog: [
          ...(q.activityLog ?? []),
          {
            id: randomUUID(),
            at: new Date().toISOString(),
            kind: "note_added" as const,
            ...(actor ? { actor } : {}),
            summary: `Anulada a marca «${fase === "sinal" ? "sinal" : "saldo"} passado ao Moloni».`,
          },
        ],
      };
    });
    if (!gravado) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    if (naoEManual) {
      return NextResponse.json(
        { error: "Só se anula uma fase marcada à mão.", codigo: "nao-e-manual" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  // Um rascunho por fase. Um segundo só se ela o pedir expressamente — dois
  // rascunhos iguais no Moloni é o caminho para faturar o sinal duas vezes.
  // (Lido aqui para responder depressa; a garantia é a marca, mais abaixo.)
  const anterior = quote.faturasMoloni?.[fase];
  const jaLaEsta = (e?: { documentId?: number; manual?: boolean }) =>
    !!(e?.documentId || e?.manual);
  if (jaLaEsta(anterior) && body.denovo !== true) {
    return NextResponse.json(
      {
        error: anterior?.manual
          ? `A fatura ${fase === "sinal" ? "do sinal" : "do saldo"} já foi passada ao Moloni à mão.`
          : `Já foi criado um rascunho ${fase === "sinal" ? "do sinal" : "do saldo"} no Moloni.`,
        codigo: "ja-existe",
        anterior,
      },
      { status: 409 },
    );
  }

  const propostas = await listProposalsForQuote(id);
  const fonte = await propostaDeFaturacao(id, propostas);
  if (fonte?.estado !== "aceite") {
    return NextResponse.json(
      { error: "Este cliente ainda não tem uma proposta aceite.", codigo: "sem-proposta" },
      { status: 422 },
    );
  }
  const doc = fonte.doc;
  const f = faturacaoPorArtigo(doc, fonte.versaoEscolhida ?? undefined);
  if (!f.fecha) {
    return NextResponse.json(
      {
        error: "A proposta ainda não está dividida por artigos.",
        codigo: "nao-fecha",
        porque: [
          ...f.porqueNaoFecha,
          ...(fonte.porqueNaoUsouEstudio ? [fonte.porqueNaoUsouEstudio] : []),
        ],
      },
      { status: 422 },
    );
  }

  const pct = depositPercentOf(doc);
  const partes = parcelasDaFatura(f, fase, pct);
  const qual = fase === "sinal" ? `do sinal (${pct}%)` : `do saldo (${100 - pct}%)`;
  const valorSemIva = Math.round(partes.reduce((s, p) => s + p.valor, 0) * 100) / 100;

  // ── À MÃO: SEM A API ─────────────────────────────────────────────────────
  // Ela passou a fatura ao Moloni com o «Copiar» do cartão. Aqui só se regista
  // que já lá está — para ninguém a passar outra vez. Não se fala com o Moloni.
  if (body.manual === true) {
    const em = new Date().toISOString();
    let recusaManual = false;
    const gravado = await updateQuoteWith(id, (q) => {
      recusaManual = false;
      const e = q.faturasMoloni?.[fase];
      const aCriarAgora = !!e?.aCriarDesde && Date.now() - Date.parse(e.aCriarDesde) < 2 * 60_000;
      if (aCriarAgora || (jaLaEsta(e) && body.denovo !== true)) {
        recusaManual = true;
        return q;
      }
      const anteriores = [...(e?.anteriores ?? []), ...(e?.documentId ? [e.documentId] : [])];
      return {
        ...q,
        faturasMoloni: {
          ...(q.faturasMoloni ?? {}),
          [fase]: {
            em,
            valorSemIva,
            manual: true,
            ...(actor ? { por: actor } : {}),
            ...(anteriores.length ? { anteriores } : {}),
          },
        },
        activityLog: [
          ...(q.activityLog ?? []),
          {
            id: randomUUID(),
            at: em,
            kind: "note_added" as const,
            ...(actor ? { actor } : {}),
            summary: `Fatura ${qual} passada ao Moloni à mão — ${valorSemIva
              .toFixed(2)
              .replace(".", ",")} € sem IVA.`,
          },
        ],
      };
    });
    if (!gravado) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    if (recusaManual) {
      return NextResponse.json(
        { error: "Esta fase já está marcada como passada ao Moloni.", codigo: "ja-existe" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, manual: true, valorSemIva, em });
  }

  const cfg = configDoMoloni();
  if (!cfg) {
    return NextResponse.json(
      {
        error: "A ligação ao Moloni ainda não está configurada na Vercel.",
        codigo: "sem-config",
        faltam: variaveisEmFalta(),
      },
      { status: 503 },
    );
  }

  const evento = [doc.eventType, doc.eventDate].filter(Boolean).join(" ") || quote.name || id;

  // ── A MARCA, ANTES DE FALAR COM O MOLONI ─────────────────────────────────
  // Escrita sobre o pedido acabado de ler (`updateQuoteWith`), e só a primeira
  // de duas chamadas simultâneas a consegue pôr. A outra recebe 409.
  const agora = Date.now();
  let recusa: "a-criar" | "ja-existe" | null = null;
  const marcado = await updateQuoteWith(id, (q) => {
    recusa = null;
    const e = q.faturasMoloni?.[fase];
    if (e?.aCriarDesde && agora - Date.parse(e.aCriarDesde) < 2 * 60_000) {
      recusa = "a-criar";
      return q;
    }
    if (jaLaEsta(e) && body.denovo !== true) {
      recusa = "ja-existe";
      return q;
    }
    return {
      ...q,
      faturasMoloni: {
        ...(q.faturasMoloni ?? {}),
        [fase]: {
          ...(e ?? { em: new Date(agora).toISOString() }),
          aCriarDesde: new Date(agora).toISOString(),
        },
      },
    };
  });
  if (!marcado) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  if (recusa) {
    return NextResponse.json(
      {
        error:
          recusa === "a-criar"
            ? "Este rascunho já está a ser criado neste momento. Espera uns segundos."
            : `Já foi criado um rascunho ${fase === "sinal" ? "do sinal" : "do saldo"} no Moloni.`,
        codigo: recusa,
      },
      { status: 409 },
    );
  }
  /** Tira a marca, deixando o que lá estava (um rascunho anterior, se havia). */
  const tirarAMarca = () =>
    updateQuoteWith(id, (q) => {
      const e = q.faturasMoloni?.[fase];
      if (!e) return q;
      const { aCriarDesde: _m, ...resto } = e;
      void _m;
      const fats = { ...(q.faturasMoloni ?? {}) };
      if (resto.documentId || resto.manual) fats[fase] = resto;
      else delete fats[fase];
      return { ...q, faturasMoloni: fats };
    }).catch((e) => log.error("moloni: não foi possível tirar a marca", e, { quoteId: id, fase }));

  let r: { documentId: number; valorSemIva: number };
  try {
    r = await criarRascunhoDeFatura(cfg, {
      fase,
      pct,
      vatRate: f.vatRate,
      partes,
      cliente: { nif: quote.nif, nome: (quote.company || quote.name || "").trim() },
      referencia: quote.contractRef || id,
      evento,
    });
  } catch (e) {
    await tirarAMarca();
    if (e instanceof ErroDoMoloni) {
      return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: 502 });
    }
    log.error("moloni: o rascunho falhou", e, { quoteId: id, fase });
    return NextResponse.json({ error: "Erro interno ao falar com o Moloni." }, { status: 500 });
  }

  const em = new Date().toISOString();
  try {
    await updateQuoteWith(id, (q) => {
      const e = q.faturasMoloni?.[fase];
      const anteriores = [...(e?.anteriores ?? []), ...(e?.documentId ? [e.documentId] : [])];
      return {
        ...q,
        faturasMoloni: {
          ...(q.faturasMoloni ?? {}),
          [fase]: {
            documentId: r.documentId,
            em,
            valorSemIva: r.valorSemIva,
            ...(actor ? { por: actor } : {}),
            ...(anteriores.length ? { anteriores } : {}),
          },
        },
        activityLog: [
          ...(q.activityLog ?? []),
          {
            id: randomUUID(),
            at: em,
            kind: "note_added" as const,
            ...(actor ? { actor } : {}),
            summary: `Rascunho da fatura ${qual} criado no Moloni — ${partes.length} ${
              partes.length === 1 ? "artigo" : "artigos"
            }, ${r.valorSemIva.toFixed(2).replace(".", ",")} € sem IVA. Falta confirmá-lo no Moloni.`,
          },
        ],
      };
    });
  } catch (e) {
    // O rascunho EXISTE no Moloni; só não ficou registado aqui. Diz-se, para
    // ninguém carregar outra vez a pensar que não foi.
    log.error("moloni: rascunho criado mas não registado no pedido", e, { quoteId: id, fase });
    return NextResponse.json({
      ok: true,
      documentId: r.documentId,
      valorSemIva: r.valorSemIva,
      em,
      aviso:
        "O rascunho foi criado no Moloni, mas não ficou registado aqui. Não o cries outra vez.",
    });
  }
  return NextResponse.json({ ok: true, documentId: r.documentId, valorSemIva: r.valorSemIva, em });
}

export const POST = comCpu("moloni rascunho", POST_semMedida);

/**
 * O que o cartão de faturação precisa para se desenhar: a proposta (só os
 * campos do dinheiro e dos artigos), os rascunhos já criados e se a ligação
 * está configurada. Lido quando o cartão abre — nunca em polling.
 *
 * ── QUAL PROPOSTA (6/11) ──────────────────────────────────────────────────
 * Ela: «estou a fazer uma proposta e já coloco os valores dos serviços e os
 * artigos do Moloni, mas depois quando vou aos pagamentos nem aparece nada do
 * Moloni». O cartão só lia a ACEITE. Passa a ler, por esta ordem: a aceite; o
 * rascunho do estúdio (a que ela está a fazer); a última enviada. Faturar —
 * criar o rascunho no Moloni ou marcar «já está» — continua a pedir a aceite
 * (o POST não mudou); antes disso o cartão mostra os valores e diz porquê.
 */
async function GET_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  const [quote, propostas] = await Promise.all([getQuote(id), listProposalsForQuote(id)]);
  if (!quote) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  const fonte = await propostaDeFaturacao(id, propostas);
  const proposta = fonte ? { ...fonte, doc: docDaFaturacao(fonte.doc) } : null;
  return NextResponse.json({
    configurado: configDoMoloni() !== null,
    faturas: quote.faturasMoloni ?? {},
    proposta,
  });
}

export const GET = comCpu("moloni faturação GET", GET_semMedida);
