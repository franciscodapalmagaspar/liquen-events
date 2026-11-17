import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { blobConfigurado, chaveNoBlob } from "@/lib/armazenamento/baldes";
import { conferirUrlEstavel, segredoDosEnderecos } from "@/lib/armazenamento/url-estavel";
import { MAX_VALIDADE_MS, urlDeLeituraDoBlob } from "@/lib/armazenamento/blob";
import { PROPOSAL_BUCKET, PROPOSAL_MID_BUCKET } from "@/lib/proposal-assinaturas";
import { THEME_BUCKET, THEME_MID_BUCKET } from "@/lib/theme-ref";
import { getSupabase } from "@/lib/supabase";

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
 * ── A MEDIDA TEM DE SER VERDADEIRA, MESMO QUE CONTE A MAIS ────────────────
 * (2.ª revisão de 17/11, n.º 1.) A 1.ª revisão reutilizava o MESMO endereço do
 * Blob durante 12 h para quem o pedisse, e contava-o uma vez — mas a Vercel
 * cobra cada entrega a cada navegador, e depois do tecto o endereço guardado
 * continuava a servir. Agora:
 *  - CADA 302 conta o ficheiro inteiro, e passa pelo `travao()` antes de se
 *    assinar (nunca se reutiliza um endereço do Blob para outro pedido);
 *  - o 302 vai com `Cache-Control: private, max-age` até ao fim do destino
 *    (no máximo 24 h, nunca além do prazo do nosso endereço): o MESMO
 *    navegador não volta a pedir, e o que não pede não gasta;
 *  - 30 pedidos por minuto por IP;
 *  - acima do tecto (ou com o Blob a falhar), o original do Supabase se
 *    ainda lá estiver; senão a média de 1200 px do Supabase; senão 503 —
 *    é o travão da regra de custo.
 *
 * Regra 7: corre uma vez por fotografia do Blob vista num navegador e por dia
 * (o resto vem da cache dele); ~1 ms de processador (HMAC + um HMAC do SDK)
 * mais uma escrita no contador; não pode ser feito no build (o destino expira), e o
 * navegador não tem o token para assinar sozinho.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ balde: string; caminho: string[] }> },
) {
  if (!blobConfigurado()) return new NextResponse(null, { status: 404 });
  const limitado = await rateLimit(`ficheiro:${clientIp(request)}`, 30, 60_000);
  if (!limitado.ok) return new NextResponse(null, { status: 429 });

  const { balde, caminho } = await params;
  let partes: string[];
  try {
    partes = (caminho ?? []).map((p) => decodeURIComponent(p));
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  const token = new URL(request.url).searchParams.get("token");
  const ok = conferirUrlEstavel(balde, partes.join("/"), token, segredoDosEnderecos());
  if (!ok.ok) {
    // 403 para a assinatura, 410 para o prazo: o estúdio volta a pedir um novo.
    return new NextResponse(null, { status: ok.motivo === "expirado" ? 410 : 403 });
  }

  // Nunca para lá do prazo do NOSSO endereço (2.ª revisão, n.º 6), nem mais de 24 h.
  let ate = Math.min(ok.expiraEm, Date.now() + MAX_VALIDADE_MS);
  let destino: string;
  try {
    destino = await urlDeLeituraDoBlob(chaveNoBlob(ok.balde, ok.caminho), ate, ok.tamanho);
  } catch {
    // Tecto, contador ilegível ou avaria: o Supabase, se ainda tiver a cópia.
    const doSupabase =
      (await assinarNoSupabase(ok.balde, ok.caminho)) ??
      (await assinarNoSupabase(MEDIA_DE[ok.balde] ?? "", ok.caminho));
    if (!doSupabase) {
      log.warn("ficheiro: sem Blob e sem cópia no Supabase", { balde: ok.balde });
      return new NextResponse(null, { status: 503, headers: { "Retry-After": "3600" } });
    }
    destino = doSupabase;
    ate = Math.min(ate, Date.now() + PRAZO_DO_SUPABASE_S * 1000);
  }
  const segundos = Math.max(0, Math.floor((ate - Date.now()) / 1000) - 60);
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: destino,
      "Cache-Control": `private, max-age=${segundos}`,
      "Referrer-Policy": "no-referrer",
    },
  });
}

/** A derivada de 1200 px de cada balde de originais (fica sempre no Supabase). */
const MEDIA_DE: Record<string, string> = {
  [PROPOSAL_BUCKET]: PROPOSAL_MID_BUCKET,
  [THEME_BUCKET]: THEME_MID_BUCKET,
};

/** Uma hora: o bastante para a página acabar de carregar, sem guardar um endereço velho. */
const PRAZO_DO_SUPABASE_S = 3600;

/** O endereço do Supabase, se o ficheiro ainda lá estiver (o Supabase recusa assinar o que não existe). */
async function assinarNoSupabase(balde: string, caminho: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb || !balde) return null;
  try {
    const { data, error } = await sb.storage
      .from(balde)
      .createSignedUrl(caminho, PRAZO_DO_SUPABASE_S);
    return !error && data?.signedUrl ? data.signedUrl : null;
  } catch {
    return null;
  }
}
