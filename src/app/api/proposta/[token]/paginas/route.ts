import { NextResponse } from "next/server";
import { pdfDoLink, versaoDaChave } from "@/lib/paginas-da-proposta";
import {
  formasDasPaginas,
  PedidoCortado,
  SemVagaParaDocumentos,
  textoDasPaginas,
} from "@/lib/paginas-do-pdf";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { comCpu } from "@/lib/medir-cpu";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Quantas páginas tem o PDF da proposta, a forma de cada uma e o seu texto —
 * o que a página do casal precisa para pôr as imagens no sítio antes de
 * chegarem (nada salta) e para o leitor de ecrã. Ver `PaginasDoPdf.tsx`.
 */
async function GET_semMedida(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = await rateLimit(`proposta-paginas:${clientIp(request)}`, 30, 60_000);
  if (!limited.ok) return new NextResponse(null, { status: 429 });
  const { token } = await params;
  try {
    const pdf = await pdfDoLink(token);
    if (!pdf) return new NextResponse(null, { status: 404 });
    const [formas, textos] = await Promise.all([
      formasDasPaginas(pdf.chave, pdf.obterBytes, { signal: request.signal }),
      textoDasPaginas(pdf.chave, pdf.obterBytes, { signal: request.signal }),
    ]);
    return NextResponse.json(
      {
        v: versaoDaChave(pdf.chave),
        paginas: formas.map((proporcao, i) => ({ proporcao, texto: textos[i] ?? "" })),
      },
      { headers: { "Cache-Control": "private, no-cache", "X-Robots-Tag": "noindex" } },
    );
  } catch (err) {
    // A fila dos documentos — ver a rota de cada página ao lado.
    if (err instanceof PedidoCortado || request.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }
    if (err instanceof SemVagaParaDocumentos) {
      log.warn("proposta: sem vaga para abrir o documento (páginas)");
      return new NextResponse(null, { status: 503, headers: { "Retry-After": "2" } });
    }
    log.error("proposta: páginas do PDF falharam", err);
    return new NextResponse(null, { status: 500 });
  }
}

export const GET = comCpu("proposta-paginas GET", GET_semMedida);
