import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { ehIdiomaDaProposta, IDIOMA_POR_OMISSAO } from "@/lib/proposal-doc-textos";
import { planoDoEditorialDoDocumento } from "@/lib/proposal-doc-render";
import { log } from "@/lib/logger";
import { comCpu } from "@/lib/medir-cpu";

// O sharp precisa do runtime Node.
export const runtime = "nodejs";
export const maxDuration = 30;

/** O rascunho é JSON com caminhos, sem fotografias: chega e sobra. */
const MAXIMO_DO_CORPO = 2 * 1024 * 1024;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUE FOTOGRAFIA VAI PARA CADA PÁGINA DO PDF — PARA AS MINIATURAS DO ESTÚDIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A colaboradora dela: as fotografias das miniaturas de baixo «não têm nada a
 * ver» com as do PDF. A miniatura adivinhava; quem escolhe é o álbum do PDF,
 * pelos pixéis de cada ficheiro. Esta rota corre o MESMO plano do PDF sem o
 * desenhar (`planoDoEditorialDoDocumento`) e devolve, por chave de página, o
 * caminho de cada fotografia em cada lugar — o estúdio pinta essas.
 *
 * Não grava nada: recebe o rascunho como o estúdio o tem, e responde.
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
  const body = (await request.json().catch(() => null)) as {
    doc?: unknown;
    idioma?: unknown;
  } | null;
  const doc = body?.doc as ProposalDoc | undefined;
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.moodBoards)) {
    return NextResponse.json({ error: "Documento inválido" }, { status: 400 });
  }
  const idioma = ehIdiomaDaProposta(body?.idioma) ? body.idioma : IDIOMA_POR_OMISSAO;
  try {
    // `daPaleta`: as fotografias de onde o PDF tira as cores, pela ordem dele —
    // o estúdio pede a paleta por elas (`paleta-do-pdf`), e não faz outra conta.
    const { fotos, daPaleta } = await planoDoEditorialDoDocumento(doc, idioma);
    return NextResponse.json(
      { ok: true, fotos, daPaleta },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    log.error("fotos-do-pdf falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// Quanto processador gasta cada pedido (3/11) — ver `medir-cpu.ts`.
export const POST = comCpu("fotos-do-pdf POST", POST_semMedida);
