import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { log } from "@/lib/logger";
import { comCpu } from "@/lib/medir-cpu";
import {
  MAXIMO_DE_REFS_DA_PALETA,
  paletaDoPdfPelasRefs,
  refDaPaletaAceite,
} from "@/lib/paleta-do-pdf";

// O sharp precisa do runtime Node.
export const runtime = "nodejs";
export const maxDuration = 30;

/** Doze caminhos: chega e sobra. */
const MAXIMO_DO_CORPO = 32 * 1024;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A SUGESTÃO DE CORES DO «FAZER PROPOSTA» — A PALETA DO PDF (13/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O estúdio lia as fotografias no navegador e fazia a conta lá: a regra era a
 * mesma, os bytes não — e a «Sugestão» dava outras cores, por outra ordem, do
 * que o PDF desenhava. Agora pede-as aqui, pelas referências que o motor do
 * PDF escolheu para a paleta (`daPaleta`, que a rota `fotos-do-pdf` devolve),
 * e recebe exactamente as do PDF (`lib/paleta-do-pdf.ts`).
 *
 * As três perguntas da regra 7:
 *   · quantas vezes corre — quando as fotografias da página da paleta mudam
 *     (o estúdio guarda a resposta em memória pelas referências);
 *   · quanto processador — da primeira vez, seis fotografias reduzidas a
 *     160 px e o agrupamento (dezenas de ms); depois, uma leitura do guardado;
 *   · guardado — sim, em `app_state` pela impressão das referências (~300
 *     bytes), partilhado com a proposta online. Não grava nada no estúdio.
 */
async function POST_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  const tamanho = Number(request.headers.get("content-length") ?? 0);
  if (tamanho > MAXIMO_DO_CORPO) {
    return NextResponse.json({ error: "Pedido demasiado grande" }, { status: 413 });
  }
  const body = (await request.json().catch(() => null)) as { refs?: unknown } | null;
  const refs = body?.refs;
  if (
    !Array.isArray(refs) ||
    !refs.length ||
    refs.length > MAXIMO_DE_REFS_DA_PALETA ||
    !refs.every(refDaPaletaAceite)
  ) {
    return NextResponse.json({ error: "Referências inválidas" }, { status: 400 });
  }
  try {
    const { cores, sugestoes } = await paletaDoPdfPelasRefs(refs);
    return NextResponse.json(
      { ok: true, cores, sugestoes },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    log.error("paleta-do-pdf falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// Quanto processador gasta cada pedido — ver `medir-cpu.ts`.
export const POST = comCpu("paleta-do-pdf POST", POST_semMedida);
