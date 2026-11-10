import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getQuote } from "@/lib/quotes-store";
import { estadoDaEntrega } from "@/lib/email-devolvido";
import { comCpu } from "@/lib/medir-cpu";
import { listarEnvios } from "@/lib/envios-de-proposta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O email do último envio deste pedido voltou para trás? (9/11 — ver
 * `lib/email-devolvido.ts`). Só lê a caixa quando houve um envio nos últimos
 * dias; o resto responde sem rede.
 */
async function GET_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  const quote = await getQuote(id);
  if (!quote) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  const envios = await listarEnvios(id).catch(() => []);
  const r = await estadoDaEntrega(quote, envios);
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}

export const GET = comCpu("entrega GET", GET_semMedida);
