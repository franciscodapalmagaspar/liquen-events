import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { isAuthed } from "@/lib/admin-auth";
import { getQuote } from "@/lib/quotes-store";
import { MAX_PROPOSAL_DOC_BYTES, type ProposalDoc } from "@/lib/proposal-doc";
import { renderStoredEditorialPdfWithReport } from "@/lib/proposal-doc-render";
import { imagemDaPagina, larguraPedida } from "@/lib/paginas-do-pdf";
import {
  ehIdiomaDaProposta,
  IDIOMA_POR_OMISSAO,
  type IdiomaDaProposta,
} from "@/lib/proposal-doc-textos";
import { log } from "@/lib/logger";

// O `sharp`, o pdf-lib e o pdf.js precisam do runtime de Node.
export const runtime = "nodejs";
// Uma página: medido entre 0,3 e 0,7 s com as fotografias já em memória. A
// primeira de uma proposta ainda tem de ir buscar as fotografias ao
// armazenamento — o mesmo tecto da pré-visualização inteira chega e sobra.
export const maxDuration = 60;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PÁGINA DO RASCUNHO, COMO VAI SAIR — A1 do `docs/FAZER-PROPOSTA-MELHORIAS.md`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela: «quero ver a página real ao lado do formulário». E escolheu (2/11)
 * «Só a página, mais rápido»: em vez do PDF inteiro (5–12 s), a página que
 * está a ser editada, em ~1 s.
 *
 * ── PORQUE É QUE É A MESMA PÁGINA E NÃO UMA PARECIDA ─────────────────────
 *
 * É o MESMO motor do PDF (`renderEditorialPdf`, com `soPaginas`): o plano
 * corre inteiro — as fotografias, o índice e o número da página saem os do PDF
 * — e só se salta o desenho das outras. Medido numa proposta de 18 páginas: as
 * cinco páginas experimentadas saíram iguais píxel a píxel às do PDF inteiro,
 * e o `pagina-do-rascunho.test.ts` do motor prende-o.
 *
 * ── O QUE RECEBE E O QUE DEVOLVE ────────────────────────────────────────
 *
 * `POST` com `{ doc, idioma, n, largura }` — o rascunho tal como está no
 * estúdio (sem as fotografias a caminho: `stripPendingImages`, como a
 * pré-visualização). Devolve a página `n` em WebP, com:
 *   · `X-Paginas` — quantas páginas tem o PDF inteiro;
 *   · `Server-Timing` — quanto custou desenhar (para se medir a sério).
 * Nada se grava: é um rascunho.
 *
 * ── E A MEMÓRIA ─────────────────────────────────────────────────────────
 *
 * A chave é o rascunho inteiro, a língua e a página. Pedir outra vez a mesma
 * página do mesmo rascunho (voltar atrás, abrir em ecrã inteiro) não desenha
 * nada: o `imagemDaPagina` guarda a imagem, com o seu tecto de memória.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;

  const texto = await request.text();
  if (texto.length > MAX_PROPOSAL_DOC_BYTES) {
    return NextResponse.json({ error: "O rascunho é demasiado grande." }, { status: 413 });
  }
  let body: { doc?: unknown; idioma?: unknown; n?: unknown; largura?: unknown } | null;
  try {
    body = JSON.parse(texto);
  } catch {
    body = null;
  }
  const doc = body?.doc;
  const n = Number(body?.n);
  if (!doc || typeof doc !== "object" || !Number.isInteger(n) || n < 1 || n > 500) {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const idioma: IdiomaDaProposta = ehIdiomaDaProposta(body?.idioma)
    ? body.idioma
    : IDIOMA_POR_OMISSAO;
  const largura = larguraPedida(Number(body?.largura) || 800);

  try {
    if (!(await getQuote(id))) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }
    const chave = `rascunho:${createHash("sha256")
      .update(`${idioma}\u0000${n}\u0000${JSON.stringify(doc)}`)
      .digest("hex")}`;
    const comecou = Date.now();
    let paginas: number | null = null;
    let desenhou = false;
    const imagem = await imagemDaPagina(
      chave,
      async () => {
        desenhou = true;
        const r = await renderStoredEditorialPdfWithReport(doc as ProposalDoc, idioma, {
          soPaginas: [n],
        });
        paginas = r.paginas;
        return r.pdf;
      },
      // O PDF devolvido tem SÓ a página pedida: é a primeira dele.
      1,
      largura,
    );
    const ms = Date.now() - comecou;
    const cabecalhos: Record<string, string> = {
      "Cache-Control": "private, no-store",
      "Server-Timing": `${desenhou ? "desenho" : "memoria"};dur=${ms}`,
    };
    if (paginas !== null) cabecalhos["X-Paginas"] = String(paginas);
    if (!imagem) {
      // Pediu-se uma página que este rascunho não tem (apagou-se um tema, por
      // exemplo): o painel recua para a última que existe.
      return NextResponse.json(
        { error: "Esta página já não existe.", paginas },
        { status: 404, headers: cabecalhos },
      );
    }
    return new NextResponse(new Uint8Array(imagem), {
      status: 200,
      headers: { ...cabecalhos, "Content-Type": "image/webp" },
    });
  } catch (err) {
    log.error("pagina-do-rascunho", err, { id, n });
    return NextResponse.json(
      { error: "Não foi possível desenhar a página agora." },
      { status: 500 },
    );
  }
}
