import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getQuote } from "@/lib/quotes-store";
import { getProposalByQuote } from "@/lib/proposals-store";
import { contextoDoEvento } from "@/lib/semear-producao";
import { listMaterial } from "@/lib/material-store";
import { listLists } from "@/lib/material-lists-store";
import { listAllListItems } from "@/lib/material-list-items-store";
import { listRules } from "@/lib/material-rules-store";
import { gerarChecklist, type ContextoEvento } from "@/lib/material-rules";
import {
  getForQuote,
  obterOuCriarParaPedido,
  updateEventMaterial,
} from "@/lib/event-material-store";
import {
  listItemsOfEvent,
  addEventItem,
  removeItemsOfEvent,
} from "@/lib/event-material-items-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O que a proposta diz, na forma que o motor de regras percebe.
 *
 * Os serviços vivem no DOCUMENTO da proposta (`proposal.doc`), escrito no
 * estúdio — não no pedido. O pedido só traz o que o casal preencheu, e é aí
 * que está o número de convidados e os pontos de decoração que marcaram.
 * Ambos contam: uma proposta ainda por escrever não pode impedir a checklist
 * de existir com os essenciais.
 */
async function contextoDoPedido(quoteId: string): Promise<ContextoEvento | null> {
  const [quote, proposta] = await Promise.all([getQuote(quoteId), getProposalByQuote(quoteId)]);
  if (!quote) return null;

  // A regra vive num sítio só (`contextoDoEvento`): com proposta, conta só a
  // proposta — o que ela tirou não volta a pedir material.
  return contextoDoEvento(quote, proposta?.doc?.serviceGroups ?? []);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const evento = await getForQuote(id);
    if (!evento) return NextResponse.json({ evento: null, itens: [] });
    return NextResponse.json({ evento, itens: await listItemsOfEvent(evento.id) });
  } catch (err) {
    log.error("material do evento GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * Gera (ou regenera) a checklist deste evento.
 *
 * ── O QUE A REGENERAÇÃO NÃO PODE DESTRUIR ─────────────────────────────────
 * Regenerar depois de já se ter carregado meia carrinha não pode apagar as
 * marcações. Por isso o que já está CARREGADO, o que foi acrescentado À MÃO e
 * as notas escritas são preservados; o resto é substituído pela geração nova.
 *
 * A alternativa — apagar tudo e gerar de novo — é simples de escrever e perde
 * trabalho real de quem estava no armazém. Ninguém confia numa lista que
 * apaga o que já marcou.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const ctx = await contextoDoPedido(id);
    if (!ctx) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

    const [catalogo, listas, linhasDeLista, regras] = await Promise.all([
      listMaterial(),
      listLists(),
      listAllListItems(),
      listRules(),
    ]);

    const geradas = gerarChecklist(ctx, { regras, listas, linhasDeLista, catalogo });

    const anterior = await getForQuote(id);
    const anteriores = anterior ? await listItemsOfEvent(anterior.id) : [];
    // Guardado por `itemId` porque é a identidade estável entre gerações; as
    // linhas manuais não têm par na geração e vão à parte.
    //
    // A DEVOLUÇÃO CONTA TANTO COMO A CARGA. Isto só olhava para o começo da
    // vida da linha (carregada, com nota, numa carrinha) e deixava de fora o
    // fim dela: voltou, quem a recebeu, quanto se gastou, o que não apareceu.
    // Uma linha «em falta» ou com consumo apontado mas nunca carregada nem
    // sequer passava aqui — e a marcação dela não existe em mais lado nenhum.
    const marcada = (i: (typeof anteriores)[number]) =>
      Boolean(i.loadedAt || i.note || i.vehicleId || i.returnedAt || i.missing) ||
      typeof i.usedQty === "number";
    const preservar = new Map(anteriores.filter(marcada).map((i) => [i.itemId ?? i.id, i]));
    const manuais = anteriores.filter((i) => i.origin === "manual");

    // Uma só por evento, mesmo com dois "gerar" ao mesmo tempo (ver
    // `obterOuCriarParaPedido`).
    const jaExistia = Boolean(anterior);
    const evento = await obterOuCriarParaPedido(id);
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
        // O que a pessoa fez continua lá — do carregar ao devolver.
        vehicleId: antes?.vehicleId,
        loadedAt: antes?.loadedAt,
        loadedBy: antes?.loadedBy,
        returnedAt: antes?.returnedAt,
        returnedBy: antes?.returnedBy,
        usedQty: antes?.usedQty,
        note: antes?.note,
        // Só uma linha SEM passado nasce sem falhas; `false` fixo apagava o que
        // ficou por voltar do evento.
        missing: antes?.missing ?? false,
      });
    }

    for (const m of manuais) {
      await addEventItem({ ...m, id: undefined, eventId: evento.id });
    }

    return NextResponse.json({
      evento,
      itens: await listItemsOfEvent(evento.id),
      preservadas: preservar.size,
      manuais: manuais.length,
    });
  } catch (err) {
    log.error("material do evento POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
