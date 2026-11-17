import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { blobConfigurado, chaveNoBlob } from "@/lib/armazenamento/baldes";
import { conferirUrlEstavel } from "@/lib/armazenamento/url-estavel";
import { urlDoNavegadorNoBlob } from "@/lib/armazenamento/blob";
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
 * É também aqui que as leituras do navegador contam para o tecto do mês, UMA
 * vez por ficheiro e por janela de 12 h (`urlDoNavegadorNoBlob`; revisão de
 * 17/11, n.º 1): repetir o mesmo endereço mil vezes não gasta mais nada.
 *
 * Passado o tecto (ou com o Blob a falhar), a fotografia vem do SUPABASE se
 * ainda lá estiver — é o que a migração promete. Só sem cópia nenhuma é que
 * responde 503 e a fotografia não aparece: é o travão da regra de custo.
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
  const limitado = await rateLimit(`ficheiro:${clientIp(request)}`, 120, 60_000);
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

  let destino: string;
  let ate: number;
  try {
    const r = await urlDoNavegadorNoBlob(chaveNoBlob(ok.balde, ok.caminho), ok.tamanho);
    destino = r.url;
    ate = r.ate;
  } catch {
    // Tecto, contador ilegível ou avaria: o Supabase, se ainda tiver a cópia.
    const doSupabase = await assinarNoSupabase(ok.balde, ok.caminho);
    if (!doSupabase) {
      log.warn("ficheiro: sem Blob e sem cópia no Supabase", { balde: ok.balde });
      return new NextResponse(null, { status: 503, headers: { "Retry-After": "3600" } });
    }
    destino = doSupabase;
    ate = Date.now() + PRAZO_DO_SUPABASE_S * 1000;
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

/** Uma hora: o bastante para a página acabar de carregar, sem guardar um endereço velho. */
const PRAZO_DO_SUPABASE_S = 3600;

/** O endereço do Supabase, se o ficheiro ainda lá estiver (o Supabase recusa assinar o que não existe). */
async function assinarNoSupabase(balde: string, caminho: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.storage
      .from(balde)
      .createSignedUrl(caminho, PRAZO_DO_SUPABASE_S);
    return !error && data?.signedUrl ? data.signedUrl : null;
  } catch {
    return null;
  }
}
