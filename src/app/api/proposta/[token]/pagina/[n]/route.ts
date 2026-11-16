import { NextResponse } from "next/server";
import { pdfDoLink, versaoDaChave } from "@/lib/paginas-da-proposta";
import { imagemDaPagina, larguraPedida } from "@/lib/paginas-do-pdf";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { comCpu } from "@/lib/medir-cpu";

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
 *
 * E só se o PDF veio COMPLETO. Um PDF a que falte uma fotografia serve-se na
 * mesma (o casal vale mais do que um 503), mas a versão é a do conteúdo, e não
 * muda quando ela repõe a fotografia: a página com o buraco ficava um ano no
 * telemóvel do casal (auditoria de 13/11).
 *
 * ── E NA CDN DA VERCEL, PELAS MESMAS DUAS CONDIÇÕES (16/11) ─────────────
 * Cada pedido aqui abre o PDF e desenha uma página — é das rotas que mais
 * processador gastam. Com a versão certa e o PDF completo, o endereço diz
 * exactamente que bytes são, para sempre (uma revisão muda o `?v=`); por isso
 * `Vercel-CDN-Cache-Control` guarda-a um ano na CDN e o pedido seguinte nem
 * acorda a função. O browser continua a ver só o `Cache-Control` (`private`):
 * a Vercel consome o cabeçalho dela e não o passa. A chave da CDN é o
 * endereço inteiro, com o token — só quem já tem o link chega lá.
 * Sem a versão certa ou com o PDF incompleto, nada se guarda, como antes.
 */
async function GET_semMedida(
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
    const certa = url.searchParams.get("v") === versaoDaChave(pdf.chave) && pdf.completo();
    return new NextResponse(new Uint8Array(imagem), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(imagem.length),
        "Cache-Control": certa ? "private, max-age=31536000, immutable" : "private, no-cache",
        ...(certa ? { "Vercel-CDN-Cache-Control": "max-age=31536000" } : {}),
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (err) {
    log.error("proposta: página do PDF falhou", err, { pagina: numero });
    return new NextResponse(null, { status: 500 });
  }
}

export const GET = comCpu("proposta-pagina GET", GET_semMedida);
