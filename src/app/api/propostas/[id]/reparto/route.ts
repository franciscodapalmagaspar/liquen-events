import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { updateProposalWith } from "@/lib/proposals-store";
import { isConflictError } from "@/lib/repository";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { ARTIGOS, docDaFaturacao, type ArtigoId } from "@/lib/orcamento/artigos-de-faturacao";
import { round2 } from "@/lib/money";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A REPARTIÇÃO POR ARTIGO DE UMA PROPOSTA — E SÓ ELA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As propostas já aceites não voltam ao estúdio para se repartir o total: o
 * cartão «Faturação no Moloni» reparte-o ali mesmo, e grava por aqui.
 *
 * Escreve UM campo do documento e nada mais: `repartoPorArtigo`. Fica fora do
 * PDF, da página e do selo da versão aceite (`NUNCA_NO_PDF`) — repartir depois
 * do aceite não é mexer no que o casal aceitou.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const cru = body?.reparto;
  if (!cru || typeof cru !== "object" || Array.isArray(cru)) {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }
  const reparto: Partial<Record<ArtigoId, number>> = {};
  for (const [k, v] of Object.entries(cru as Record<string, unknown>)) {
    const a = ARTIGOS.find((x) => x.id === k);
    if (!a) return NextResponse.json({ error: "Artigo inválido" }, { status: 400 });
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 10_000_000) {
      return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
    }
    if (v > 0) reparto[a.id] = round2(v);
  }
  try {
    // Sobre o documento ACABADO DE LER, e só este campo: o que o estúdio (ou
    // outro gesto) gravou entretanto sobrevive.
    const gravada = await updateProposalWith(id, (p) =>
      p.doc ? { ...p, doc: { ...(p.doc as ProposalDoc), repartoPorArtigo: reparto } } : p,
    );
    if (!gravada?.doc) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, doc: docDaFaturacao(gravada.doc as ProposalDoc) });
  } catch (e) {
    if (isConflictError(e)) {
      return NextResponse.json(
        { error: "A proposta estava a ser gravada noutro sítio. Tenta outra vez." },
        { status: 409 },
      );
    }
    log.error("propostas reparto PATCH falhou", e, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
