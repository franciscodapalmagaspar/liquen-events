import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/supabase";
import {
  aquecerPdfsEmFalta,
  contarPorAquecer,
  ORCAMENTO_AVULSO_MS,
  TECTO_POR_CHAMADA,
} from "@/lib/aquecimento-de-pdf";
import { log } from "@/lib/logger";
import { comCpu } from "@/lib/medir-cpu";

// O desenho de um PDF traz o `pdf-lib` e o `sharp` atrás.
export const runtime = "nodejs";
/**
 * O tecto do plano, e a razão de o orçamento ser 50 s e não 60.
 *
 * Um desenho de uma proposta de 80 fotografias chega aos 20 s (medido, em
 * `custo-do-pdf.ts`). O `ORCAMENTO_AVULSO_MS` deixa dez segundos de margem
 * entre o último desenho e a morte da função — é aí que a memória do que
 * correu bem é gravada, e perdê-la era repetir amanhã o trabalho de hoje.
 */
export const maxDuration = 60;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AQUECER OS PDF DAS PROPOSTAS JÁ ENVIADAS — contar (GET) e aquecer (POST)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quero que a rapidez não seja só nas futuras, mas também nas
 * que já enviei. Caso as pessoas vão ver as propostas outra vez no email mas
 * já esteja muito mais rápido.»
 *
 * O motor já existia e está no `aquecimento-de-pdf.ts`, com a explicação toda
 * de porquê e com que cuidados. O que faltava era ISTO: alguém que o chamasse.
 * O `TECTO_POR_CHAMADA` e o `ORCAMENTO_AVULSO_MS` estavam escritos desde o
 * commit que os criou e nunca tiveram um único chamador.
 *
 * ── PORQUE É QUE A NOITE NÃO CHEGA ────────────────────────────────────────
 *
 * O aquecimento viaja dentro da cópia de segurança das quatro da manhã e faz
 * SEIS propostas por noite — não por preguiça, mas porque a cópia é a razão de
 * ser daquele trabalho e já gastou metade do relógio quando isto arranca.
 *
 * Com oitenta propostas por aquecer, seis por noite são duas semanas. Duas
 * semanas em que um casal que reabra um link antigo continua a pagar o desenho
 * inteiro atrás de um botão calado. Ela pediu isto para AGORA.
 *
 * Esta rota tem a função inteira para si: oito propostas por chamada, e a
 * varredura do back office chama-a em cadeia enquanto ela tiver o separador
 * aberto. Oitenta propostas passam de duas semanas para uns quinze minutos.
 *
 * ── CONTAR E AQUECER SÃO VERBOS DIFERENTES ────────────────────────────────
 *
 * A mesma regra da rota das derivadas, e pela mesma razão: **o GET não escreve
 * nada**. Ver quantas faltam tem de ser uma coisa que se faz sem medo. Um
 * botão que conta e desenha ao mesmo tempo é um botão em que se hesita.
 *
 * E o GET não fala com o armazenamento: faz contas sobre a lista das propostas
 * e a memória do aquecimento. Ver `contarPorAquecer`, incluindo porque é que o
 * número que ele dá é um TECTO e porque é que enganar-se para cima é o lado
 * certo de se enganar.
 */
async function GET_semMedida(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Armazenamento indisponível." }, { status: 503 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await contarPorAquecer()) });
  } catch (e) {
    log.error("aquecimento-pdf: contagem falhou", e);
    return NextResponse.json({ error: "Não consegui contar as propostas." }, { status: 500 });
  }
}

/**
 * Aquece UM lote e diz quantas ficaram. Quem chama repete até `restantes` dar
 * zero — é o que a varredura do back office faz.
 *
 * ── PORQUE É QUE ISTO NUNCA DEVOLVE 500 POR UMA PROPOSTA QUE REBENTOU ─────
 *
 * Porque uma proposta que não desenha não é uma avaria desta rota. O motor
 * apanha cada falha, marca-a, e segue para a seguinte — uma fotografia que
 * desapareceu do armazenamento não pode parar o aquecimento das outras
 * setenta e nove. O 500 fica para o que impede o trabalho INTEIRO.
 */
async function POST_semMedida(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Armazenamento indisponível." }, { status: 503 });
  }
  try {
    /**
     * `decorridoMs = 0`: esta chamada não vem atrás de trabalho nenhum.
     *
     * É a diferença inteira entre esta rota e a noite. Lá, o aquecimento
     * recebe o tempo que a cópia de segurança já gastou e trabalha com o que
     * sobra; aqui o relógio começa em zero.
     */
    const resumo = await aquecerPdfsEmFalta(0, {
      orcamentoMs: ORCAMENTO_AVULSO_MS,
      tecto: TECTO_POR_CHAMADA,
    });
    log.info("aquecimento-pdf: lote a pedido", { ...resumo });
    return NextResponse.json({ ok: true, ...resumo });
  } catch (e) {
    log.error("aquecimento-pdf: lote falhou", e);
    return NextResponse.json({ error: "Não consegui aquecer as propostas." }, { status: 500 });
  }
}

// Quanto processador gasta cada pedido (3/11) — ver `medir-cpu.ts`.
export const GET = comCpu("aquecimento-pdf GET", GET_semMedida);
export const POST = comCpu("aquecimento-pdf POST", POST_semMedida);
