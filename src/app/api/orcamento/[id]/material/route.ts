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
  obterEventItem,
  removeEventItem,
  updateEventItemWith,
} from "@/lib/event-material-items-store";
import type { EventMaterialItem } from "@/lib/event-material-types";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Uma checklist são centenas de linhas e, ao regenerar, uma escrita por linha
 *  que muda; os 10 s por omissão do alojamento cortavam-na a meio. */
export const maxDuration = 30;

/** Escritas no ar ao mesmo tempo — o mesmo 8 do `removeItemsOfEvent`. */
const EM_PARALELO = 8;

async function emGrupos<T>(itens: readonly T[], fazer: (t: T) => Promise<unknown>) {
  for (let i = 0; i < itens.length; i += EM_PARALELO) {
    await Promise.all(itens.slice(i, i + EM_PARALELO).map(fazer));
  }
}

/** Uma linha onde alguém já fez alguma coisa — do carregar ao devolver. */
function marcada(i: EventMaterialItem): boolean {
  return (
    Boolean(i.loadedAt || i.note || i.vehicleId || i.returnedAt || i.missing) ||
    typeof i.usedQty === "number"
  );
}

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
    // Uma só por evento, mesmo com dois "gerar" ao mesmo tempo (ver
    // `obterOuCriarParaPedido`).
    const evento = await obterOuCriarParaPedido(id);
    const anteriores = anterior ? await listItemsOfEvent(evento.id) : [];

    // ── REGENERAR SEM APAGAR PRIMEIRO (auditoria 6, n.º 10) ───────────────
    //
    // Isto apagava a checklist inteira e voltava a escrevê-la linha a linha.
    // Três avarias de uma vez: um corte a meio (o tempo do alojamento, a rede)
    // deixava a checklist sem as linhas que faltavam; as marcações de uma linha
    // que deixou de ser gerada (uma regra mudou) iam fora — o «em falta»
    // incluído, que é o registo do material perdido; e uma marcação que
    // chegasse de `/marcar` a meio ia parar a um id apagado.
    //
    // Agora a linha que continua a ser gerada é a MESMA linha (o mesmo id):
    // atualizam-se só os campos que vêm das regras, sobre a versão fresca, e
    // as marcações ficam onde estão. As novas entram antes de alguma sair. E
    // só sai, no fim, a linha que já não é gerada e onde ninguém tocou.
    //
    // Emparelhadas por `itemId` — a identidade estável entre gerações. As
    // linhas manuais não têm par na geração e não se tocam.
    const livres = new Map<string, EventMaterialItem[]>();
    for (const l of anteriores) {
      if (l.origin === "manual" || !l.itemId) continue;
      livres.set(l.itemId, [...(livres.get(l.itemId) ?? []), l]);
    }
    const aActualizar: { linha: EventMaterialItem; g: (typeof geradas)[number] }[] = [];
    const novas: (typeof geradas)[number][] = [];
    for (const g of geradas) {
      const linha = livres.get(g.itemId)?.shift();
      if (linha) aActualizar.push({ linha, g });
      else novas.push(g);
    }
    const sobras = [...livres.values()].flat();

    const camposDasRegras = (g: (typeof geradas)[number]) => ({
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
    });

    // 1. As novas — nascem limpas, sem marcas emprestadas de outra linha.
    await emGrupos(novas, (g) =>
      addEventItem({ eventId: evento.id, ...camposDasRegras(g), missing: false }),
    );
    // 2. As que continuam: só os campos das regras mudam, sobre a linha fresca
    //    (uma marcação que chegue entretanto não é escrita por cima).
    await emGrupos(aActualizar, ({ linha, g }) =>
      updateEventItemWith(linha.id, (actual) => ({ ...actual, ...camposDasRegras(g) })),
    );
    // 3. E só agora, com a checklist nova inteira, sai o que já não é gerado —
    //    se ninguém lhe tocou. Relê-se antes: uma marcação pode ter chegado
    //    durante a regeneração. Uma linha marcada fica, com a sua origem.
    let preservadas = 0;
    await emGrupos(sobras, async (l) => {
      const fresca = await obterEventItem(l.id);
      if (!fresca) return;
      if (marcada(fresca)) {
        preservadas++;
        return;
      }
      await removeEventItem(l.id);
    });
    if (anterior) {
      await updateEventMaterial(evento.id, { generatedAt: new Date().toISOString() });
    }
    preservadas += aActualizar.filter(({ linha }) => marcada(linha)).length;
    const manuais = anteriores.filter((i) => i.origin === "manual");

    return NextResponse.json({
      evento,
      itens: await listItemsOfEvent(evento.id),
      preservadas,
      manuais: manuais.length,
    });
  } catch (err) {
    log.error("material do evento POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
