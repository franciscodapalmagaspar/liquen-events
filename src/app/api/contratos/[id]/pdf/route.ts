import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getContract } from "@/lib/contracts-store";
import { renderContractPdf } from "@/lib/contract-pdf";
import { log } from "@/lib/logger";

// pdf-lib precisa do runtime Node.
export const runtime = "nodejs";
// Desenha um PDF. O mesmo raciocínio da proposta, em menor escala.
export const maxDuration = 30;

/**
 * PDF do contrato para o back office — a prova em papel do aceite. Autenticado
 * (mesmo modelo de leitura que /api/contratos): só a equipa acede. Devolve o
 * documento renderizado inline; 404 se o contrato não existir.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const contract = await getContract(id);
    if (!contract) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

    const pdf = await renderContractPdf(contract);
    // A referência vai para um CABEÇALHO: uma aspa ou um CR/LF vindo do
    // `quoteId` fazia o `new NextResponse` atirar, e o contrato saía como 500.
    // Mesmo filtro das rotas irmãs do portal e da proposta.
    const ref = String(contract.quoteId || contract.id).replace(/[^A-Za-z0-9_-]/g, "");
    // Uint8Array (não Buffer) para satisfazer o BodyInit da Response.
    const corpo = new Uint8Array(pdf);
    return new NextResponse(corpo, {
      headers: {
        "Content-Type": "application/pdf",
        // O tamanho à frente deixa o browser contar o que já chegou.
        "Content-Length": String(corpo.byteLength),
        "Content-Disposition": `inline; filename="Contrato-Liquen-${ref}.pdf"`,
        // Nome, email e termos do casal: nada disto fica guardado num cache
        // pelo caminho nem no browser (auditoria 6, n.º 19). As rotas irmãs
        // (mesas, guiões) já o diziam.
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    log.error("contrato PDF GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
