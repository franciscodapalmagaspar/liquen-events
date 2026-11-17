import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { blobConfigurado, chaveNoBlob, type BaldeDoBlob } from "@/lib/armazenamento/baldes";
import { conferirUrlEstavel, segredoDosEnderecos } from "@/lib/armazenamento/url-estavel";
import { lerRespostaDoBlob } from "@/lib/armazenamento/blob";
import { comCpu } from "@/lib/medir-cpu";
import { createHash } from "node:crypto";
import { PROPOSAL_BUCKET, PROPOSAL_MID_BUCKET } from "@/lib/proposal-assinaturas";
import { THEME_BUCKET, THEME_MID_BUCKET } from "@/lib/theme-ref";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA FOTOGRAFIA (OU UM PDF) DO BLOB — PASSADA POR NÓS, CONTADA AO BYTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O endereço vem do `balde()` (ver `url-estavel.ts`): leva o balde, o caminho
 * e um `token` assinado com o prazo de sempre (dez anos numa proposta, seis
 * horas na biblioteca). Esta rota confere-o, lê o ficheiro do Blob NO
 * SERVIDOR e devolve-o em fluxo.
 *
 * ── PORQUE É QUE O NAVEGADOR NUNCA RECEBE UM ENDEREÇO DO BLOB ─────────────
 * (3.ª revisão de 17/11, n.º 1.) Um endereço assinado do Blob entregue ao
 * navegador descarrega-se as vezes que se quiser sem passar por nós: o
 * leitor de PDF pede aos pedaços, a cache do navegador expira, alguém copia
 * o `Location` de um 302. O travão não via nada disso — e um travão que não
 * vê não cumpre a regra de custo. Agora cada byte que sai do Blob passa por
 * esta função e conta-se EXACTO (`lerRespostaDoBlob`), com `Range` para os
 * pedaços do leitor de PDF.
 *
 * Os caminhos são imutáveis (um nome novo para cada ficheiro novo — ver
 * `urls-assinados.ts`), por isso a resposta vai com `Cache-Control: private,
 * max-age=31536000, immutable` e um `ETag`: o mesmo navegador não volta a
 * pedir, e um `If-None-Match` responde 304 SEM ir ao Blob.
 *
 * Acima do tecto (ou com o Blob a falhar): redirecciona para o original no
 * Supabase se ainda lá estiver; senão para a média de 1200 px do Supabase;
 * senão 503 — é o travão. Essa saída é a do Supabase, não a do Blob.
 *
 * As três perguntas da regra 7 (custo): corre uma vez por ficheiro do Blob
 * visto num navegador (depois disso, a cache dele); o processador é o de
 * passar bytes em fluxo, sem os guardar em memória; e não pode ser guardado
 * nem feito no navegador, porque o navegador não tem o token — o preço é a
 * Fast Data Transfer da Vercel (o Pro inclui 1 TB por mês) e a Blob Data
 * Transfer. O `comCpu` («ficheiro GET») mede só até a resposta COMEÇAR a sair
 * — conferir, pedir ao Blob, os cabeçalhos — e não o fluxo que corre depois
 * (4.ª revisão, n.º 6).
 *
 * E o que sai da NOSSA origem é tratado como conteúdo não confiável (4.ª
 * revisão, n.º 8): só imagens e PDF com o tipo deles; tudo o resto vai como
 * `application/octet-stream` e em anexo; sempre com `nosniff` e uma CSP
 * `sandbox; default-src 'none'`, para um ficheiro nunca correr como página.
 */
type Contexto = { params: Promise<{ balde: string; caminho: string[] }> };

/** Limite, assinatura e ETag — o que o GET e o HEAD fazem igual. */
async function conferir(
  request: Request,
  { params }: Contexto,
): Promise<
  | { resposta: NextResponse }
  | { resposta: null; ok: { balde: BaldeDoBlob; caminho: string; tamanho: number }; etag: string }
> {
  if (!blobConfigurado()) return { resposta: new NextResponse(null, { status: 404 }) };
  // 300 por minuto por IP (3.ª revisão, n.º 2): uma proposta com muitas
  // fotografias e o escritório inteiro atrás do mesmo IP. O custo é o travão
  // do mês que o protege, não isto.
  const limitado = await rateLimit(`ficheiro:${clientIp(request)}`, 300, 60_000);
  if (!limitado.ok) return { resposta: new NextResponse(null, { status: 429 }) };

  const { balde, caminho } = await params;
  let partes: string[];
  try {
    partes = (caminho ?? []).map((p) => decodeURIComponent(p));
  } catch {
    return { resposta: new NextResponse(null, { status: 404 }) };
  }
  const token = new URL(request.url).searchParams.get("token");
  const ok = conferirUrlEstavel(balde, partes.join("/"), token, segredoDosEnderecos());
  if (!ok.ok) {
    // 403 para a assinatura, 410 para o prazo: o estúdio volta a pedir um novo.
    return {
      resposta: new NextResponse(null, { status: ok.motivo === "expirado" ? 410 : 403 }),
    };
  }
  const etag = `"${createHash("sha256").update(`${ok.balde}/${ok.caminho}`).digest("hex").slice(0, 32)}"`;
  // O mesmo ficheiro, já no navegador: nem se vai ao Blob.
  if (jaTemEste(request, etag)) {
    return {
      resposta: new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": CACHE },
      }),
    };
  }
  return { resposta: null, ok, etag };
}

/** Os cabeçalhos de segurança e de cache de tudo o que sai daqui com bytes. */
function cabecalhosSeguros(tipo: string | null, etag: string): Headers {
  const permitido = tipo && TIPOS_PERMITIDOS.has(tipo.split(";")[0].trim().toLowerCase());
  const h = new Headers({
    "Content-Type": permitido ? tipo! : "application/octet-stream",
    "Cache-Control": CACHE,
    ETag: etag,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
  });
  if (!permitido) h.set("Content-Disposition", "attachment");
  return h;
}

const TIPOS_PERMITIDOS = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "application/pdf",
]);

/** O tipo pelo nome do ficheiro — para o HEAD, que não vai ao Blob. */
function tipoPelaExtensao(caminho: string): string | null {
  const ext = caminho.slice(caminho.lastIndexOf(".") + 1).toLowerCase();
  const tipos: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
    pdf: "application/pdf",
  };
  return tipos[ext] ?? null;
}

async function GET_semMedida(request: Request, contexto: Contexto) {
  const c = await conferir(request, contexto);
  if (c.resposta) return c.resposta;
  const { ok, etag } = c;
  // Um `If-Range` que não bate certo anula o pedaço: manda-se o ficheiro todo.
  const pedaco = request.headers.get("range");
  const seRange = request.headers.get("if-range");
  const pedacoValido = pedaco && (!seRange || seRange.trim() === etag) ? pedaco : null;

  let doBlob: Response | null = null;
  try {
    doBlob = await lerRespostaDoBlob(
      chaveNoBlob(ok.balde, ok.caminho),
      pedacoValido ? { Range: pedacoValido } : {},
      ok.tamanho,
    );
  } catch {
    doBlob = null; // tecto, contador ilegível ou avaria: segue para o Supabase
  }
  // Um pedaço fora do ficheiro (4.ª revisão, n.º 3): a resposta do Blob, tal
  // e qual — nem é avaria, nem vai ao Supabase.
  if (doBlob && doBlob.status === 416) {
    const h = new Headers({
      "Content-Range": doBlob.headers.get("content-range") ?? `bytes */${ok.tamanho}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    });
    return new NextResponse(null, { status: 416, headers: h });
  }
  if (doBlob && doBlob.body) {
    const cabecalhos = cabecalhosSeguros(doBlob.headers.get("content-type"), etag);
    for (const k of ["content-length", "content-range"]) {
      const v = doBlob.headers.get(k);
      if (v) cabecalhos.set(k, v);
    }
    return new NextResponse(doBlob.body, { status: doBlob.status, headers: cabecalhos });
  }

  // Sem Blob: o Supabase, se ainda tiver a cópia (o original, depois a média).
  const doSupabase =
    (await assinarNoSupabase(ok.balde, ok.caminho)) ??
    (await assinarNoSupabase(MEDIA_DE[ok.balde] ?? "", ok.caminho));
  if (!doSupabase) {
    log.warn("ficheiro: sem Blob e sem cópia no Supabase", { balde: ok.balde });
    return new NextResponse(null, { status: 503, headers: { "Retry-After": "3600" } });
  }
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: doSupabase,
      // Só enquanto o endereço do Supabase vale: depois volta a perguntar-se aqui.
      "Cache-Control": `private, max-age=${PRAZO_DO_SUPABASE_S - 60}`,
      "Referrer-Policy": "no-referrer",
    },
  });
}

// Quanto processador gasta cada pedido (3/11) — ver `medir-cpu.ts`. Mede até
// a resposta começar a sair, não o fluxo (ver o cabeçalho deste ficheiro).
export const GET = comCpu("ficheiro GET", GET_semMedida);

/**
 * O HEAD não vai ao Blob (4.ª revisão, n.º 5): sem isto, o Next respondia-lhe
 * com o GET, que descarregava o ficheiro inteiro e o contava. Só a
 * assinatura, o ETag, e o tamanho e o tipo que o próprio endereço já traz.
 */
export async function HEAD(request: Request, contexto: Contexto) {
  const c = await conferir(request, contexto);
  if (c.resposta) return c.resposta;
  const h = cabecalhosSeguros(tipoPelaExtensao(c.ok.caminho), c.etag);
  if (c.ok.tamanho > 0) h.set("Content-Length", String(c.ok.tamanho));
  return new NextResponse(null, { status: 200, headers: h });
}

const CACHE = "private, max-age=31536000, immutable";

function jaTemEste(pedido: Request, etag: string): boolean {
  const lista = pedido.headers.get("if-none-match");
  if (!lista) return false;
  return lista
    .split(",")
    .map((v) => v.trim().replace(/^W\//, ""))
    .some((v) => v === "*" || v === etag);
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
