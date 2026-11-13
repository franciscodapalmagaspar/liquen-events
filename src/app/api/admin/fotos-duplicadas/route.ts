import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { construirManifesto } from "@/lib/manifesto-de-fotografias";
import { juntarFotosDuplicadas } from "@/lib/juntar-fotos-duplicadas";
import { log } from "@/lib/logger";
import { comCpu } from "@/lib/medir-cpu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PLANO DAS FOTOGRAFIAS REPETIDAS, A SECO (13/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Mostra o que a tarefa da noite faria na próxima Fase A
 * (`juntar-fotos-duplicadas.ts`): as cópias que sairiam, para onde passariam
 * as referências, os MB, e quantas ficam presas — SEM ESCREVER NADA. É o que
 * se mostra antes de deixar a noite fazê-lo.
 *
 * Só com sessão: a resposta são caminhos de fotografias de casais. Só lê, e é
 * chamada à mão: uma listagem dos dois baldes de originais (a mesma do
 * manifesto da noite, ~150 listagens, ~2 MB) e uma leitura das 15 tabelas
 * (~5 MB). Nada se guarda.
 */
async function GET_semMedida(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const manifesto = await construirManifesto();
    const r = await juntarFotosDuplicadas(manifesto, new Date(), { aSeco: true, prazoMs: 40_000 });
    return NextResponse.json(
      { ...r, mb: +(r.bytes / 1048576).toFixed(1), manifestoCompleto: manifesto.completo },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (err) {
    log.error("fotos-duplicadas: plano a seco falhou", err);
    return NextResponse.json({ error: "Não consegui calcular o plano." }, { status: 500 });
  }
}

// Quanto processador gasta cada pedido — ver `medir-cpu.ts`.
export const GET = comCpu("fotos-duplicadas GET", GET_semMedida);
