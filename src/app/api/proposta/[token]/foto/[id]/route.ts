import { NextResponse } from "next/server";
import { propostaDoLink } from "@/lib/proposta-do-link";
import { inventarioDeFotos, marcaDaRef } from "@/lib/proposta-fotos";
import { derivadaMediaAPedido } from "@/lib/derivadas";
import { fetchProposalImageBytes } from "@/lib/proposal-storage";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { comCpu } from "@/lib/medir-cpu";
import { CDN_DO_LINK_DO_CASAL } from "@/lib/cdn-do-link-do-casal";

export const runtime = "nodejs";
/** Um `sharp` sobre uma fotografia de 2200 px anda pelos 300–800 ms. */
export const maxDuration = 20;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA FOTOGRAFIA DA PROPOSTA, NO TAMANHO QUE O ECRÃ PEDE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a olhar para a galeria no telemóvel: «essas imagens parecem
 * estar desfocadas, ou com pouca qualidade».
 *
 * MEDIDO: a grelha pedia a miniatura de 400 px, e num iPhone a fotografia
 * ocupa ~343 pontos com TRÊS pixéis por ponto — ~1030 pixéis. Uma imagem de
 * 400 esticada duas vezes e meia. Servir o original resolvia a nitidez e punha
 * 120 MB numa página com 46 fotografias.
 *
 * Esta rota serve a derivada intermédia (1200 px, ~200 KB), fabricada à
 * primeira visita e guardada a seguir. O `srcset` da galeria é que decide
 * quando a pede — ver `Inspiracao.tsx`.
 *
 * ── PORQUE É QUE ISTO EXISTE E NÃO SE ASSINA O CAMINHO ───────────────────
 *
 * Porque uma derivada pode NÃO EXISTIR ainda, e um endereço assinado para um
 * ficheiro que não está lá responde 404. Dentro de um `srcset` isso não cai
 * para o candidato seguinte — dá uma imagem partida, que é exactamente o que
 * acabámos de tirar da página. Uma rota responde SEMPRE alguma coisa: a
 * derivada, ou o original.
 *
 * ── E A REGRA DE SEMPRE: NENHUM CAMINHO VEM DE FORA ──────────────────────
 *
 * O parâmetro é o `id` OPACO da fotografia dentro deste documento (`b0f2`), o
 * mesmo que o `/fotos` já usa. O caminho real sai do `doc` que o token abre.
 * Uma rota que aceitasse caminhos serviria, com o token de um casal, qualquer
 * ficheiro da Biblioteca de Temas — que é o activo do estúdio inteiro.
 */
async function GET_semMedida(
  request: Request,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;

  // Cada volta pode custar um `sharp`. Sessenta por minuto é folga para uma
  // galeria de quarenta e seis a abrir de uma vez, e fecha a porta a um ciclo.
  const limited = await rateLimit(`proposta-foto:${clientIp(request)}`, 60, 60_000);
  if (!limited.ok) return new NextResponse(null, { status: 429 });

  let idParaRegisto = "";
  try {
    const proposal = (await propostaDoLink(token))?.proposta;
    idParaRegisto = proposal?.id ?? "";
    if (!proposal?.doc) return new NextResponse(null, { status: 404 });

    const entrada = inventarioDeFotos(proposal.doc).find((e) => e.id === id);
    if (!entrada) return new NextResponse(null, { status: 404 });

    const { bytes } =
      // Uma foto com os bytes lá dentro (`data:`) ou um endereço de fora não
      // passam pelo Storage: para essas o `fetchProposalImageBytes` é o único
      // caminho, e não há derivada a fabricar.
      entrada.ref.startsWith("data:") || /^https?:\/\//i.test(entrada.ref)
        ? { bytes: null }
        : await derivadaMediaAPedido(entrada.ref);

    /**
     * Sem derivada, serve-se o ORIGINAL.
     *
     * É mais pesado e é a resposta certa: o `srcset` já escolheu este endereço
     * porque o ecrã precisa de pixéis, e devolver um 404 aqui punha uma imagem
     * partida no meio do mood board. Pesado vale mais do que partido.
     */
    const finais = bytes ?? (await fetchProposalImageBytes(entrada.ref));
    if (!finais) return new NextResponse(null, { status: 404 });

    /**
     * ── O ENDEREÇO DIZ QUAL FOTOGRAFIA É, OU NÃO PROMETE UM DIA ───────────
     *
     * O `id` é POSICIONAL (`b0f2` é «a terceira do primeiro mood board») e o
     * mesmo link salta para a revisão mais recente (o `maisRecente`, em
     * `proposta-do-link.ts`). Portanto o mesmo endereço, amanhã, pode ser
     * outra fotografia — e guardá-lo um dia no telemóvel do casal mostrava-lhe
     * a antiga depois de ela rever o board.
     *
     * Quem desenha põe agora a `marca` no endereço (ver `endereco-da-foto.ts`).
     * Se ela bate certo com a fotografia que este documento tem AGORA neste
     * lugar, o endereço identifica-a de facto, e o dia de cache é honesto: uma
     * fotografia revista é um endereço novo, que o navegador não tem.
     *
     * Se não vier, ou não bater, não se sabe de que fotografia o endereço
     * falava — cinco minutos, que é o que se pode prometer sem mentir. A
     * fotografia sai à mesma: um endereço sem marca continua a funcionar.
     */
    const marcaPedida = new URL(request.url).searchParams.get("v");
    const identifica = marcaPedida !== null && marcaPedida === marcaDaRef(entrada.ref);

    return new NextResponse(new Uint8Array(finais), {
      headers: {
        // As derivadas saem em WebP desde a Fase 1 da biblioteca (ver `FORMATO`
        // em `derivadas.ts`). Um «image/jpeg» aqui era um cabeçalho a mentir
        // sobre os bytes — e um cabeçalho que mente sobre uma imagem é como o
        // navegador acaba a desenhar um ícone partido.
        "Content-Type": bytes ? "image/webp" : "application/octet-stream",
        "Content-Length": String(finais.length),
        /**
         * `private` e não `public`: isto é a fotografia do casamento de um
         * casal, servida por um link privado. Um cache partilhado de fora (o
         * proxy de uma empresa, outra CDN) não a pode guardar para servir a
         * quem pedir o mesmo caminho — é a mesma regra da página e do PDF. A
         * CDN da própria Vercel é outra conversa: ver o cabeçalho a seguir.
         *
         * E NUNCA `immutable`, mesmo com a marca certa: os bytes deste
         * endereço mudam uma vez, e de propósito. À primeira visita a derivada
         * ainda não existe e serve-se o ORIGINAL; ela é fabricada e guardada
         * nessa mesma volta, e a partir daí o mesmo endereço serve o WebP, que
         * é dez vezes mais leve. `immutable` prendia o casal ao ficheiro
         * pesado — a promessa que dava jeito era exactamente a errada.
         */
        "Cache-Control": identifica
          ? "private, max-age=86400, must-revalidate"
          : "private, max-age=300, must-revalidate",
        /**
         * ── A CDN DA VERCEL, SÓ PARA A DERIVADA IDENTIFICADA (16/11) ───────
         * Cada pedido aqui pode custar um `sharp` e uma leitura do Storage.
         * Quando os bytes são a DERIVADA WebP (não o original, que muda para
         * a derivada na visita seguinte) e a marca identifica a fotografia,
         * o endereço é estável: guarda-se uma hora na CDN da Vercel (não mais:
         * a CDN não sabe quando um link é cortado — `cdn-do-link-do-casal.ts`). A chave da
         * CDN é o endereço inteiro, com o token do link — não serve a quem
         * não o tem — e o browser continua a ver só o `private` de cima.
         * O original nunca vai para a CDN.
         */
        ...(identifica && bytes ? { "Vercel-CDN-Cache-Control": CDN_DO_LINK_DO_CASAL } : {}),
      },
    });
  } catch (err) {
    log.error("proposta foto GET falhou", err, { proposalId: idParaRegisto, foto: id });
    return new NextResponse(null, { status: 500 });
  }
}

export const GET = comCpu("proposta-foto GET", GET_semMedida);
