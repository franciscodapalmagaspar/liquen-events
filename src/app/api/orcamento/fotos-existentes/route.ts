import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { MAX_RESUMOS_POR_PERGUNTA, procurarExistentes } from "@/lib/fotos-resumo";
import { comCpu } from "@/lib/medir-cpu";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «DESTAS FOTOGRAFIAS, QUAIS JÁ ESTÃO GUARDADAS?» — SEM SUBIR UM BYTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A importação de propostas antigas calcula no navegador o resumo de cada
 * fotografia do ficheiro (`fingerprintBlob`, ~40 ms por foto) e pergunta aqui
 * antes de as preparar e subir. As que já existem na Biblioteca de temas (num
 * tema vivo) voltam com a referência `tema:` e entram na proposta assim — não
 * se preparam, não sobem, não ocupam espaço, e não contam para o tecto.
 *
 * Recebe só resumos (32 hex) e devolve só os conhecidos — nunca o índice todo,
 * e nenhum caminho vindo de fora chega ao Storage. Com `quoteId`, a pasta
 * desse pedido também conta (uma importação retomada).
 *
 * ── AS TRÊS PERGUNTAS DO CUSTO (regra 7) ────────────────────────────────────
 *
 *  · Quantas vezes corre: uma por importação (à mão; dezenas no total).
 *  · Quanto processador: nenhum trabalho pesado — uma leitura `key in (…)` em
 *    `app_state`, e por cada foto encontrada um `getTheme` e um HEAD ao
 *    Storage (zero bytes de saída). Medido por `comCpu`.
 *  · Guardar / build / navegador: o resumo é calculado no navegador; aqui só
 *    se consulta o índice que os carregamentos já mantêm (`fotos-resumo.ts`).
 */
async function POST_semMedida(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const corpo = (await request.json().catch(() => null)) as {
    resumos?: unknown;
    quoteId?: unknown;
  } | null;
  const resumos = Array.isArray(corpo?.resumos) ? corpo.resumos : null;
  if (!resumos) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  if (resumos.length > MAX_RESUMOS_POR_PERGUNTA) {
    return NextResponse.json(
      { error: `Máximo de ${MAX_RESUMOS_POR_PERGUNTA} fotografias por pergunta.` },
      { status: 400 },
    );
  }
  const quoteId = typeof corpo?.quoteId === "string" && corpo.quoteId ? corpo.quoteId : null;
  try {
    const achados = await procurarExistentes(resumos, quoteId);
    return NextResponse.json({ ok: true, existentes: Object.fromEntries(achados) });
  } catch (e) {
    // Não saber não trava nada: o navegador sobe tudo, como antes.
    log.warn("fotos-existentes: índice ilegível", { erro: String(e) });
    return NextResponse.json({ ok: true, existentes: {} });
  }
}

// Quanto processador gasta cada pedido — ver `medir-cpu.ts`.
export const POST = comCpu("fotos-existentes POST", POST_semMedida);
