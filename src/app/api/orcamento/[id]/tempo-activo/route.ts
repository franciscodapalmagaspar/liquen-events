import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import {
  acrescentarLotesDeTempo,
  acrescentarTempoActivo,
  getTempoActivo,
  type LoteDeTempo,
} from "@/lib/tempo-activo-servidor";

/** Quantos lotes num pedido (um pedido leva os devolvidos mais o novo). */
const MAX_LOTES = 30;
/** O id de um lote: um UUID, ou parecido. */
const ID_VALIDO = /^[A-Za-z0-9-]{8,64}$/;

/** Um `porSeccao` válido, ou `null`. */
function lerPorSeccao(cru: unknown): Record<string, number> | null {
  if (!cru || typeof cru !== "object" || Array.isArray(cru)) return null;
  const entradas = Object.entries(cru as Record<string, unknown>);
  if (
    entradas.length > 50 ||
    entradas.some(([, v]) => typeof v !== "number" || !Number.isFinite(v) || v < 0)
  ) {
    return null;
  }
  return Object.fromEntries(entradas) as Record<string, number>;
}

/** Um lote válido (`{ id?, porSeccao }`), ou `null`. */
function lerLote(cru: unknown): LoteDeTempo | null {
  if (!cru || typeof cru !== "object") return null;
  const { id, porSeccao } = cru as { id?: unknown; porSeccao?: unknown };
  if (id !== undefined && (typeof id !== "string" || !ID_VALIDO.test(id))) return null;
  const p = lerPorSeccao(porSeccao);
  if (!p) return null;
  return { ...(id ? { id: id as string } : {}), porSeccao: p };
}
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
  /**
   * Três formatos (17/11):
   *  · `{ lotes: [{ id, porSeccao }] }` — o de agora: os lotes devolvidos de
   *    envios falhados mais o novo, cada um com o seu id;
   *  · `{ id?, porSeccao }` — um lote só;
   *  · `{ ms, seccao }` — o de antes, que um separador aberto antes da
   *    publicação ainda manda.
   * Todos somam numa só escrita.
   */
  const c = (corpo ?? null) as { lotes?: unknown; porSeccao?: unknown } | null;
  let lotes: LoteDeTempo[] | null = null;
  if (c?.lotes !== undefined) {
    if (!Array.isArray(c.lotes) || c.lotes.length === 0 || c.lotes.length > MAX_LOTES) {
      return NextResponse.json({ error: "Tempo inválido." }, { status: 400 });
    }
    const lidos = c.lotes.map(lerLote);
    if (lidos.some((l) => l === null)) {
      return NextResponse.json({ error: "Tempo inválido." }, { status: 400 });
    }
    lotes = lidos as LoteDeTempo[];
  } else if (c?.porSeccao !== undefined) {
    const lote = lerLote(c);
    if (!lote) return NextResponse.json({ error: "Tempo inválido." }, { status: 400 });
    lotes = [lote];
  }
  const ms = (corpo as { ms?: unknown } | null)?.ms;
  const seccaoCrua = (corpo as { seccao?: unknown } | null)?.seccao;
  const seccao = typeof seccaoCrua === "string" ? seccaoCrua : undefined;

  if (!lotes && (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0)) {
    return NextResponse.json({ error: "Tempo inválido." }, { status: 400 });
  }

  try {
    const { tempo, persistencia } = lotes
      ? await acrescentarLotesDeTempo(id, lotes)
      : await acrescentarTempoActivo(id, ms as number, seccao);

    // Falhar a gravar NÃO é um erro para quem está a trabalhar: o estúdio guarda
    // o pedaço e manda-o no envio seguinte (`guardado: false`), não se perde trabalho nenhum. Fica registado do
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
    // uma medição. O `guardado: false` faz o estúdio guardar o pedaço e
    // mandá-lo no envio seguinte.
    log.warn("tempo-activo: escrita rebentou", { id, erro: String(err) });
    return NextResponse.json({ ok: true, tempo: { ms: 0, updatedAt: null }, guardado: false });
  }
}
