import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { acrescentarTempoActivo, getTempoActivo } from "@/lib/tempo-activo-servidor";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TEMPO ACTIVO DE UMA PROPOSTA — a porta do lado do servidor
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A contagem é feita no navegador (só ele sabe se a página está em foco e se
 * alguém lhe tocou nos últimos sessenta segundos — ver `tempo-activo.ts`).
 * Aqui só se ACUMULA, e é isso que faz a diferença entre «o tempo desta
 * proposta» e «o tempo desta proposta neste computador».
 *
 * O corpo traz o que passou DESDE O ÚLTIMO ENVIO, nunca o total. A razão está
 * no `tempo-activo-servidor.ts`: com totais, dois aparelhos abertos na mesma
 * proposta escreviam um por cima do outro.
 *
 * Admin-only, como tudo o que toca em propostas.
 */

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const tempo = await getTempoActivo(id);
    return NextResponse.json({ ok: true, tempo: tempo ?? { ms: 0, updatedAt: null } });
  } catch (err) {
    // Uma medição não vale um ecrã partido: o armazenamento em baixo saía daqui
    // como 500 anónimo e sem registo. Devolve-se o zero e diz-se que não foi
    // lido — é a mesma política de melhor esforço do POST.
    log.warn("tempo-activo: leitura falhou", { id, erro: String(err) });
    return NextResponse.json({ ok: true, tempo: { ms: 0, updatedAt: null }, lido: false });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;

  const corpo = await request.json().catch(() => null);
  const ms = (corpo as { ms?: unknown } | null)?.ms;
  const seccaoCrua = (corpo as { seccao?: unknown } | null)?.seccao;
  const seccao = typeof seccaoCrua === "string" ? seccaoCrua : undefined;

  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) {
    return NextResponse.json({ error: "Tempo inválido." }, { status: 400 });
  }

  try {
    const { tempo, persistencia } = await acrescentarTempoActivo(id, ms, seccao);

    // Falhar a gravar NÃO é um erro para quem está a trabalhar: perde-se meio
    // minuto de uma medição, não se perde trabalho nenhum. Fica registado do
    // lado do servidor, e a resposta diz a verdade sobre onde o número ficou —
    // sem obrigar o estúdio a interromper nada por causa disto.
    if (persistencia && !persistencia.gravado) {
      log.warn("tempo-activo: não gravado", { id, motivo: persistencia.motivo });
    }

    return NextResponse.json({
      ok: true,
      tempo,
      guardado: persistencia ? persistencia.gravado : true,
    });
  } catch (err) {
    // Mesma política, agora também para o que o armazenamento atira em vez de
    // devolver: um 500 anónimo aqui punha um aviso no estúdio por causa de
    // meio minuto de medição.
    log.warn("tempo-activo: escrita rebentou", { id, erro: String(err) });
    return NextResponse.json({ ok: true, tempo: { ms: 0, updatedAt: null }, guardado: false });
  }
}
