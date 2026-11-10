import { ANGULOS_DO_FUNDO, BRILHOS_DO_FUNDO } from "@/lib/proposta-web/valores-do-fundo";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { propostaDoLink } from "@/lib/proposta-do-link";
import { inventarioDeFotos, marcaDaRef } from "@/lib/proposta-fotos";
import { derivadaMediaAPedido, miniaturaAPedido } from "@/lib/derivadas";
import { fetchProposalImageBytes } from "@/lib/proposal-storage";
import { preparar } from "@/lib/pdf-editorial/imagens";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { comCpu } from "@/lib/medir-cpu";
import { guardarFotoEditorial, lerFotoEditorialGuardada } from "@/lib/fotos-editoriais-guardadas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O FUNDO «ARRASTADO» DE UMA SECÇÃO DA PROPOSTA ONLINE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O protótipo dela (23/10) põe as secções escuras sobre uma fotografia da
 * proposta em movimento — desfoque direccional a ~14° e escurecida —, como
 * os fundos do PDF. É o MESMO tratamento (`preparar`, com `arrastado`), feito
 * aqui a partir da derivada de 1200 px, e não um `filter: blur()` no browser:
 * um desfoque de ecrã inteiro num telemóvel custa fotogramas a cada rolagem.
 *
 * Mesma porta que a rota da fotografia: só uma fotografia do inventário do
 * documento deste link, nunca um caminho vindo de fora.
 *
 * ── PORQUE PARTE DA MINIATURA (23/10, «melhora mesmo muito a rapidez») ────
 *
 * O `preparar` desfoca a 480 px de largura e só depois amplia: partir da
 * derivada de 1200 px era descarregar e descodificar quase dez vezes mais
 * píxeis para os deitar fora. A miniatura (400 px) dá o mesmo fundo, e chega
 * e descodifica-se num instante. Fica guardada no navegador um ano: o endereço
 * muda com a fotografia (`v`), nunca serve uma velha.
 */

export const runtime = "nodejs";
export const maxDuration = 20;

const LARGURA = 960;
const guardados = new Map<string, Promise<Buffer | null>>();
const MAXIMO_GUARDADOS = 40;

/** O valor da lista mais próximo do pedido, ou o de omissão. */
function maisProximo(v: string | null, lista: readonly number[], omissao: number) {
  const n = v === null ? NaN : Number(v);
  if (!Number.isFinite(n)) return omissao;
  return lista.reduce((melhor, x) => (Math.abs(x - n) < Math.abs(melhor - n) ? x : melhor));
}

async function GET_semMedida(
  request: Request,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const limited = await rateLimit(`proposta-fundo:${clientIp(request)}`, 40, 60_000);
  if (!limited.ok) return new NextResponse(null, { status: 429 });

  let idParaRegisto = "";
  try {
    const proposal = (await propostaDoLink(token))?.proposta;
    idParaRegisto = proposal?.id ?? "";
    if (!proposal?.doc) return new NextResponse(null, { status: 404 });
    const entrada = inventarioDeFotos(proposal.doc).find((e) => e.id === id);
    if (!entrada) return new NextResponse(null, { status: 404 });

    const url = new URL(request.url);
    const brilho = maisProximo(url.searchParams.get("b"), BRILHOS_DO_FUNDO, 0.42);
    const angulo = maisProximo(url.searchParams.get("a"), ANGULOS_DO_FUNDO, -14);
    const chave = `${entrada.ref}|${brilho}|${angulo}`;

    let feito = guardados.get(chave);
    if (!feito) {
      feito = (async () => {
        const doStorage = !entrada.ref.startsWith("data:") && !/^https?:\/\//i.test(entrada.ref);
        /**
         * O fundo já feito, guardado fora da memória (3/11). A memória desta
         * função perde-se a cada instância nova, e cada casal, cada telemóvel
         * da família, voltava a pagar o `sharp` de cada capítulo — foi um dos
         * sítios por onde a conta da Vercel passou o limite de processador. A
         * receita (largura, brilho, ângulo, qualidade) entra na chave.
         */
        const receita = `fundo-v1-${LARGURA}-b${brilho}-a${angulo}-s0.85-q72`;
        if (doStorage) {
          const ja = await lerFotoEditorialGuardada(entrada.ref, receita);
          if (ja) return ja;
        }
        const deStorage = doStorage
          ? ((await miniaturaAPedido(entrada.ref)) ??
            (await derivadaMediaAPedido(entrada.ref)).bytes)
          : null;
        const bytes = deStorage ?? (await fetchProposalImageBytes(entrada.ref));
        if (!bytes) return null;
        const m = await sharp(bytes, { failOn: "none" }).rotate().metadata();
        const w = m.autoOrient?.width ?? m.width ?? LARGURA;
        const h = m.autoOrient?.height ?? m.height ?? LARGURA;
        const H = Math.max(1, Math.round((LARGURA * h) / w));
        const fundo = await preparar(Buffer.from(bytes), LARGURA, H, LARGURA, {
          arrastado: { angulo },
          brilho,
          saturacao: 0.85,
          qualidade: 72,
        });
        if (doStorage && fundo) await guardarFotoEditorial(entrada.ref, receita, fundo);
        return fundo;
      })();
      guardados.set(chave, feito);
      if (guardados.size > MAXIMO_GUARDADOS) guardados.delete(guardados.keys().next().value!);
    }
    const jpeg = await feito;
    if (!jpeg) {
      guardados.delete(chave);
      return new NextResponse(null, { status: 404 });
    }
    const identifica = url.searchParams.get("v") === marcaDaRef(entrada.ref);
    return new NextResponse(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(jpeg.length),
        "Cache-Control": identifica
          ? "private, max-age=31536000, immutable"
          : "private, max-age=300, must-revalidate",
      },
    });
  } catch (err) {
    log.error("proposta fundo GET falhou", err, { proposalId: idParaRegisto, foto: id });
    return new NextResponse(null, { status: 500 });
  }
}

// Quanto processador gasta cada pedido (3/11) — ver `medir-cpu.ts`.
export const GET = comCpu("proposta-fundo GET", GET_semMedida);
