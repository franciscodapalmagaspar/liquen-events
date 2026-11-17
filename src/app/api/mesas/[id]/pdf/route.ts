import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getQuote } from "@/lib/quotes-store";
import { log } from "@/lib/logger";
import { pdfDoMapa } from "@/lib/orcamento/mapa-de-mesas-pdf";
import { comCpu } from "@/lib/medir-cpu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MAPA DE MESAS EM PDF — DESCARREGAR E IMPRIMIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O desenho da sala e a lista por mesa (`mapa-de-mesas-pdf.ts`). Corre no
 * servidor pela razão do horário: a fonte que aceita qualquer nome pesa, e já
 * cá está.
 *
 * Só com sessão, e o id só se resolve depois: o mapa traz o nome de cada
 * convidado e onde se senta.
 *
 * `?ver=1` devolve-o `inline` em vez de `attachment` — é o «Imprimir», que o
 * abre num separador para o diálogo de impressão do browser.
 */
async function GET_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const q = await getQuote(id);
    if (!q) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    const pdf = await pdfDoMapa(q);
    if (!pdf) {
      return NextResponse.json(
        { error: "Este mapa ainda não tem mesas — acrescenta uma antes de imprimir." },
        { status: 409 },
      );
    }
    const ver = new URL(request.url).searchParams.get("ver") === "1";
    const corpo = Buffer.from(pdf.bytes);
    return new NextResponse(corpo, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(corpo.byteLength),
        "Content-Disposition": `${ver ? "inline" : "attachment"}; filename="${pdf.ficheiro}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    log.error("mapa de mesas PDF falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export const GET = comCpu("mesas-pdf GET", GET_semMedida);
