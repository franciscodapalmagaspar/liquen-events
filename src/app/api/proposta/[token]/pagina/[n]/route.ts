import { NextResponse } from "next/server";
import { pdfDoLink, versaoDaChave } from "@/lib/paginas-da-proposta";
import { imagemDaPagina, larguraPedida } from "@/lib/paginas-do-pdf";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
/** Abrir o PDF a frio (do armazenamento, ou desenhá-lo) e depois a página. */
export const maxDuration = 60;

/**
 * UMA PÁGINA DO PDF DA PROPOSTA, COMO IMAGEM — ver `paginas-do-pdf.ts`.
 *
 * O mesmo modelo de confiança da rota do PDF ao lado: o token é a
 * autorização, e uma página é menos do que o ficheiro inteiro que esse mesmo
 * token já descarrega. 404 para tudo o que falhe.
 *
 * `?v=` é a versão do conteúdo: com ela certa a imagem guarda-se no telemóvel
 * para sempre (`immutable`), porque uma revisão muda o endereço. Sem ela, ou
 * com uma antiga, serve-se a de agora e não se guarda.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; n: string }> },
) {
  // Uma proposta tem umas 25 páginas, e cada uma pode vir em duas larguras.
  const limited = await rateLimit(`proposta-pagina:${clientIp(request)}`, 240, 60_000);
  if (!limited.ok) return new NextResponse(null, { status: 429 });

  const { token, n } = await params;
  const numero = Number(n);
  if (!Number.isInteger(numero) || numero < 1 || numero > 500) {
    return new NextResponse(null, { status: 404 });
  }
  const url = new URL(request.url);
  const largura = larguraPedida(Number(url.searchParams.get("w")) || 1200);

  try {
    const pdf = await pdfDoLink(token);
    if (!pdf) return new NextResponse(null, { status: 404 });
    const imagem = await imagemDaPagina(pdf.chave, pdf.obterBytes, numero, largura);
    if (!imagem) return new NextResponse(null, { status: 404 });
    const certa = url.searchParams.get("v") === versaoDaChave(pdf.chave);
    return new NextResponse(new Uint8Array(imagem), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(imagem.length),
        "Cache-Control": certa ? "private, max-age=31536000, immutable" : "private, no-cache",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (err) {
    log.error("proposta: página do PDF falhou", err, { pagina: numero });
    return new NextResponse(null, { status: 500 });
  }
}
