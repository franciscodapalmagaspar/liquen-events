import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listAllProposals } from "@/lib/proposals-store";
import { jsonWithEtag } from "@/lib/api-cache";
import { log } from "@/lib/logger";
import { opcionaisDe } from "@/lib/orcamento/versoes-da-proposta";
import { totalAPagarDaProposta } from "@/lib/orcamento/proposta-que-conta";
import type { Proposal } from "@/lib/orcamento/types";
import { depositPercentOf, type ProposalDoc } from "@/lib/proposal-doc";
import { comCpu } from "@/lib/medir-cpu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A lista de propostas anteriores, reduzida ao que a escolha precisa.
 *
 * Existe por causa do "Criar a partir de…": para escolher, ela precisa de ver
 * de quem era, quando foi, e o tamanho da coisa. NÃO precisa dos documentos
 * inteiros — que trazem todos os mood boards, todas as condições e as dezenas
 * de caminhos de fotos de cada proposta. Com um ano de trabalho lá dentro, a
 * lista completa passa a ser megabytes descarregados só para desenhar uma
 * lista de nomes. O documento vai buscar-se em `/api/propostas/[id]` quando
 * ela escolher UM.
 */
function resumir(p: Awaited<ReturnType<typeof listAllProposals>>[number]) {
  const doc = p.doc as ProposalDoc | undefined;
  return {
    id: p.id,
    quoteId: p.quoteId,
    clientName: p.clientName,
    createdAt: p.createdAt,
    status: p.status,
    total: p.total,
    // Sem documento não há nada para copiar — uma proposta de linhas antiga
    // aparece na lista mas não pode servir de ponto de partida.
    temDoc: !!doc,
    eventType: doc?.eventType ?? "",
    eventDate: doc?.eventDate ?? "",
    location: doc?.location ?? "",
    guests: doc?.guests ?? "",
    // Para as sugestões de "Local" e "Wedding Planners": o que ela já usou
    // antes é a melhor lista possível, e não obriga a manter um catálogo.
    weddingPlanners: doc?.weddingPlanners ?? "",
    // O «tamanho» da proposta, que é o que diz se vale a pena partir dela.
    grupos: doc?.serviceGroups?.length ?? 0,
    moodBoards: doc?.moodBoards?.length ?? 0,
    linhas: doc?.budgetItems?.length ?? 0,
    fotos:
      (doc?.coverImages ?? []).filter(Boolean).length +
      (doc?.moodBoards ?? []).reduce((n, b) => n + (b.images?.length ?? 0), 0),
  };
}

/**
 * A MESMA proposta, sem o documento — a forma que as LISTAS precisam.
 *
 * Não confundir com `resumir` acima: aquilo é um cartão de escolha para o
 * "Criar a partir de…" (meia dúzia de campos e umas contagens). Isto é a
 * proposta INTEIRA — estado, cliente, totais, validade, seguimento, motivo de
 * recusa, versão escolhida — a que só falta o `doc`. É o que os painéis de
 * Propostas, Acompanhamento e Análise desenham: nenhum deles imprime o
 * documento, e o documento é quase tudo o que se descarrega (mood boards,
 * grupos de serviços, condições, dezenas de caminhos de fotos).
 *
 * Vão três factos DERIVADOS do documento, porque são os únicos que as listas
 * lhe tiram e sem eles a mudança não seria neutra:
 *   · `temDoc`       — uma proposta de linhas antiga não tem documento nenhum.
 *   · `temOpcionais` — a proposta tinha linhas marcadas como extra. É o que o
 *                      Acompanhamento usa para perguntar «qual das versões é
 *                      que eles ficaram?» e a Análise para contar quantas
 *                      aceites tinham extras.
 *   · `pctSinal`     — a percentagem do sinal desta proposta
 *                      (`depositPercentOf`). É a que o cliente aceitou, e os
 *                      ecrãs do back office — o painel de Pagamentos, o dossiê
 *                      — precisam dela para sugerirem o valor certo. Sem isto
 *                      dividiam 30/70 à letra: numa proposta de 50%, o atalho
 *                      oferecia 3.690,00 € onde o combinado eram 6.150,00 €.
 *                      Um número, não o documento — é para isto que serve esta
 *                      forma sem `doc`.
 *   · `totalAPagar` / `subtotalAPagar` — o que o casal tem a pagar, pela versão
 *                      que escolheu (`totalAPagarDaProposta`, a conta da
 *                      faturação). Com a versão base, é menos do que o `total`
 *                      da proposta inteira — e é este que os Pagamentos e as
 *                      Cobranças cobram (auditoria de 13/11, n.º 1).
 *
 * O campo `doc` é OMITIDO, não truncado: um documento pela metade é a espécie
 * de coisa que passa despercebida até alguém desenhar um PDF a partir dele.
 */
function semDocumento(p: Proposal) {
  const { doc, ...resto } = p;
  const aPagar = totalAPagarDaProposta(p);
  return {
    ...resto,
    totalAPagar: aPagar.total,
    subtotalAPagar: aPagar.subtotal,
    temDoc: !!doc,
    temOpcionais: !!doc && opcionaisDe(doc).some(Boolean),
    pctSinal: depositPercentOf(doc),
  };
}

async function GET_semMedida(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const propostas = await listAllProposals();
    const params = new URL(request.url).searchParams;
    if (params.get("resumo") === "1") {
      return jsonWithEtag(request, propostas.map(resumir));
    }
    // Por ADESÃO: sem o parâmetro, a resposta é byte a byte a de sempre. Quem
    // pede a lista sem saber deste modo continua a receber tudo.
    if (params.get("semDoc") === "1") {
      return jsonWithEtag(request, propostas.map(semDocumento));
    }
    return jsonWithEtag(request, propostas);
  } catch (err) {
    log.error("propostas GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// Quanto processador gasta cada pedido (3/11) — ver `medir-cpu.ts`.
export const GET = comCpu("propostas GET", GET_semMedida);
