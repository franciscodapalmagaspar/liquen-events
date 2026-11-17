import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { focoAutomaticoDaCapa } from "@/lib/proposal-doc-render";
import { log } from "@/lib/logger";
import { comCpu } from "@/lib/medir-cpu";

// O sharp precisa do runtime Node.
export const runtime = "nodejs";

/**
 * O recorte que o PDF faria sozinho da fotografia da capa — para o estúdio o
 * mostrar igual, antes de o PDF existir.
 *
 * Palavras dela: «não ficou com o carro». O estúdio mostrava o meio da
 * fotografia e o PDF recortava pela «atenção» do sharp. Com isto, a caixa da
 * capa mostra a escolha do PDF, e ela arrasta a partir daí se não gostar.
 */
async function GET_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  const caminho = request.nextUrl.searchParams.get("caminho") ?? "";
  // Um caminho de armazenamento, e nada mais: sem `..`, sem esquemas, curto.
  if (!caminho || caminho.length > 300 || caminho.includes("..") || /^[a-z]+:/i.test(caminho)) {
    return NextResponse.json({ error: "Caminho inválido" }, { status: 400 });
  }
  try {
    const foco = await focoAutomaticoDaCapa(caminho);
    if (!foco) return NextResponse.json({ error: "Fotografia não encontrada" }, { status: 404 });
    return NextResponse.json(
      { ok: true, foco },
      // O mesmo caminho dá sempre o mesmo recorte: a fotografia não muda de
      // bytes depois de carregada.
      { headers: { "Cache-Control": "private, max-age=86400" } },
    );
  } catch (err) {
    log.error("foco-da-capa falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export const GET = comCpu("foco-da-capa GET", GET_semMedida);
