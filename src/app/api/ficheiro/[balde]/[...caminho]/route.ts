import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { blobConfigurado, chaveNoBlob } from "@/lib/armazenamento/baldes";
import { conferirUrlEstavel } from "@/lib/armazenamento/url-estavel";
import { BlobRecusado, MAX_VALIDADE_MS, urlDeLeituraDoBlob } from "@/lib/armazenamento/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA FOTOGRAFIA DO BLOB, PELO ENDEREÇO QUE NÃO EXPIRA ANTES DO TEMPO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O endereço vem do `balde()` (ver `url-estavel.ts`): leva o balde, o caminho
 * e um `token` assinado com o prazo de sempre (dez anos numa proposta, seis
 * horas na biblioteca). Esta rota confere-o e REDIRECCIONA para um endereço
 * do Blob acabado de assinar. Os bytes vão do Blob ao navegador sem passar por
 * aqui — esta função só escreve um cabeçalho.
 *
 * É também aqui que cada leitura do navegador conta para o tecto do mês
 * (`urlDeLeituraDoBlob`): uma operação simples e o tamanho do ficheiro, que é
 * o pior caso (sem cache nenhuma). Passado o tecto, responde 503 e a
 * fotografia não aparece — é o travão que a regra de custo manda ter.
 *
 * O redireccionamento fica na cache do navegador até perto do fim do endereço
 * de destino, por isso ver a mesma fotografia outra vez não volta aqui.
 *
 * Regra 7: corre uma vez por fotografia do Blob vista num navegador (o resto
 * vem da cache dele); ~1 ms de processador (HMAC + um HMAC do SDK) mais uma
 * escrita no contador; não pode ser feito no build (o destino expira), e o
 * navegador não tem o token para assinar sozinho.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ balde: string; caminho: string[] }> },
) {
  if (!blobConfigurado()) return new NextResponse(null, { status: 404 });
  const limitado = await rateLimit(`ficheiro:${clientIp(request)}`, 600, 60_000);
  if (!limitado.ok) return new NextResponse(null, { status: 429 });

  const { balde, caminho } = await params;
  let partes: string[];
  try {
    partes = (caminho ?? []).map((p) => decodeURIComponent(p));
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  const token = new URL(request.url).searchParams.get("token");
  const ok = conferirUrlEstavel(
    balde,
    partes.join("/"),
    token,
    process.env.BLOB_READ_WRITE_TOKEN?.trim() ?? "",
  );
  if (!ok.ok) {
    // 403 para a assinatura, 410 para o prazo: o estúdio volta a pedir um novo.
    return new NextResponse(null, { status: ok.motivo === "expirado" ? 410 : 403 });
  }

  // O destino vale até ao fim do dia seguinte, ou até ao prazo do nosso, o que vier primeiro.
  const ate = Math.min(ok.expiraEm, Date.now() + MAX_VALIDADE_MS);
  let destino: string;
  try {
    destino = await urlDeLeituraDoBlob(chaveNoBlob(ok.balde, ok.caminho), ate, ok.tamanho);
  } catch (e) {
    if (e instanceof BlobRecusado) {
      return new NextResponse(null, { status: 503, headers: { "Retry-After": "86400" } });
    }
    log.warn("ficheiro: não se assinou o destino", { balde: ok.balde });
    return new NextResponse(null, { status: 502 });
  }
  const segundos = Math.max(0, Math.floor((ate - Date.now()) / 1000) - 600);
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: destino,
      "Cache-Control": `private, max-age=${segundos}`,
      "Referrer-Policy": "no-referrer",
    },
  });
}
