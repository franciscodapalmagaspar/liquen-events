import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getQuote } from "@/lib/quotes-store";
import { listSuppliers } from "@/lib/suppliers-store";
import { eventTagLabel } from "@/lib/orcamento/data";
import { horarioEmPdf } from "@/lib/orcamento/horario-pdf";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O HORÁRIO DE UM DIA, EM PDF, PARA DESCARREGAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Quero que haja uma opção no timeline que seja fazer download. E que fique
 * como a foto que mandei num PDF.»
 *
 * ── PORQUE É QUE ISTO É UMA ROTA E NÃO SE FAZ NO BROWSER ─────────────────
 *
 * Porque a fonte pesa. O desenho do horário é geometria e caberia num ficheiro
 * do lado do cliente, mas escrever um nome português num PDF obriga a embutir
 * uma fonte que os aceite (ver a nota no `horario-pdf.ts`), e a Carlito são
 * umas centenas de kilobytes de base64. Mandá-la para o browser de todas as
 * pessoas que abrem o back office, para o caso de alguém carregar em
 * «Descarregar», era pagar o preço sempre para o usar às vezes.
 *
 * Aqui corre no servidor, que já a tem carregada para os PDF das propostas.
 *
 * ── NÃO É PÚBLICA, E A RAZÃO NÃO É O DESENHO ─────────────────────────────
 *
 * Um horário do dia traz o nome do cliente, a data, o local e o nome de cada
 * pessoa da equipa com a hora a que entra ao serviço. É informação interna
 * inteira. `isAuthed` primeiro, e o id só se resolve depois — uma rota que
 * responde «não existe» a quem não entrou já está a dizer o que existe.
 */
/**
 * ── A LISTA DE FORNECEDORES DO FIM DA FOLHA ────────────────────────────────
 *
 * A folha dela acaba com onze linhas assim:
 *
 *     Decoração e flores – Liquen Events – Catarina Gaspar - 919259820
 *     Catering – Icook – Francisca Carvalho e Silva - 918511227
 *
 * Categoria, quem é, e como se lhe liga. É a informação de que a equipa
 * precisa às sete da manhã quando falta uma carrinha, e é por isso que ela a
 * imprime na mesma folha em vez de a ter no telemóvel.
 *
 * ── O QUE JÁ EXISTIA, E O QUE FALTAVA ────────────────────────────────────
 *
 * O pedido já guarda os fornecedores do evento (`eventSuppliers`): nome,
 * categoria, quanto custa, em que pé está. O que NÃO guarda é o telefone — e
 * faz bem, porque o telefone é do fornecedor e não deste evento; guardá-lo
 * duas vezes era tê-lo desactualizado num dos dois sítios.
 *
 * Por isso o contacto vai buscar-se ao directório pelo `supplierId`. Um
 * fornecedor escrito à mão neste evento, sem ligação ao directório, sai na
 * mesma — com nome e categoria e sem contacto, que é a verdade sobre ele.
 */
async function fornecedoresDoEvento(
  doEvento: readonly { supplierId?: string; name: string; category: string }[],
): Promise<{ categoria: string; nome: string; contacto: string }[]> {
  if (doEvento.length === 0) return [];
  const directorio = new Map((await listSuppliers()).map((f) => [f.id, f]));
  return doEvento.map((f) => {
    const ficha = f.supplierId ? directorio.get(f.supplierId) : undefined;
    return {
      categoria: f.category || "Fornecedor",
      nome: f.name,
      contacto: [ficha?.phone, ficha?.email].filter(Boolean).join(" · "),
    };
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const q = await getQuote(id);
    if (!q) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

    /**
     * O título é o da folha dela: «CASAMENTO J&P 28.06.25».
     *
     * Três peças, e a data no formato curto que ela escreve à mão — dd.mm.aa,
     * e não «sábado, 28 de junho de 2025». Numa folha que anda pelo bolso de
     * dez fornecedores, a data é uma etiqueta e não uma frase.
     */
    const curta = q.date
      ? (() => {
          const [ano, mes, dia] = q.date.split("-");
          return `${dia}.${mes}.${ano.slice(2)}`;
        })()
      : "";
    const titulo = [eventTagLabel(q), q.name, curta].filter(Boolean).join(" ");

    const bytes = await horarioEmPdf({
      titulo: titulo || "Timeline",
      /* ── AS TRÊS CONTAGENS DO TOPO ────────────────────────────────────
         Escritas por ela no ecrã da timeline (`folhaDaTimeline`), ao lado da
         pré-visualização. Os adultos caem para o `guests` do pedido quando ela
         não escreveu nada — o número do pedido é de quando o pedido foi feito
         e o dela é o de véspera, depois das confirmações; é o dela que manda,
         mas o do pedido é melhor do que uma célula vazia.

         As outras duas ficam vazias enquanto ela não as escrever. Um zero
         seria uma afirmação («não vêm crianças») em vez da verdade («ainda não
         está escrito»). */
      adultos: q.folhaDaTimeline?.adultos || (q.guests ? String(q.guests) : ""),
      criancas: q.folhaDaTimeline?.criancas ?? "",
      staff: q.folhaDaTimeline?.staff ?? "",
      momentos: q.timeline ?? [],
      fornecedores: await fornecedoresDoEvento(q.eventSuppliers ?? []),
    });

    // Um horário sem uma única hora legível não dá ficheiro nenhum, e dizê-lo é
    // melhor do que mandar uma folha em branco que parece um defeito.
    if (!bytes) {
      return NextResponse.json(
        { error: "Esta timeline ainda não tem momentos com hora." },
        { status: 409 },
      );
    }

    /**
     * O nome do ficheiro é o que ela vai ver na pasta das transferências daqui
     * a três semanas, portanto diz o que é sem ela ter de o abrir. Sem acentos
     * e sem espaços — um `Content-Disposition` com um «ã» lá dentro chega
     * partido a metade dos browsers, e a metade que o entende não concorda com
     * a outra sobre como.
     */
    const limpo = (q.name ?? "evento")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .toLowerCase();
    const ficheiro = `horario-${limpo || "evento"}${q.date ? `-${q.date}` : ""}.pdf`;

    const corpo = Buffer.from(bytes);
    return new NextResponse(corpo, {
      headers: {
        "Content-Type": "application/pdf",
        // O tamanho à frente deixa o browser contar o que já chegou — é o que
        // faz a barra do back office ser verdadeira em vez de uma estimativa.
        "Content-Length": String(corpo.byteLength),
        "Content-Disposition": `attachment; filename="${ficheiro}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    log.error("horário PDF falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
