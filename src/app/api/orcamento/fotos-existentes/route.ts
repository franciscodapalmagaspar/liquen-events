import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { MAX_RESUMOS_POR_PERGUNTA, procurarExistentes } from "@/lib/fotos-resumo";
import {
  MAX_IMPRESSOES_POR_PERGUNTA,
  procurarParecidas,
  type Parecida,
} from "@/lib/fotos-parecidas";
import { lerEspaco } from "@/lib/ocupacao-do-armazenamento";
import { signProposalThumbs } from "@/lib/proposal-assinaturas";
import { comCpu } from "@/lib/medir-cpu";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «DESTAS FOTOGRAFIAS, QUAIS JÁ ESTÃO GUARDADAS?» — SEM SUBIR UM BYTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A importação de propostas antigas calcula no navegador o resumo de cada
 * fotografia do ficheiro (`fingerprintBlob`, ~40 ms por foto) e pergunta aqui
 * antes de as preparar e subir. As que já existem na Biblioteca de temas (num
 * tema vivo) voltam com a referência `tema:` e entram na proposta assim — não
 * se preparam, não sobem, não ocupam espaço, e não contam para o tecto.
 *
 * Recebe só resumos (32 hex) e devolve só os conhecidos — nunca o índice todo,
 * e nenhum caminho vindo de fora chega ao Storage. Com `quoteId`, a pasta
 * desse pedido também conta (uma importação retomada).
 *
 * ── AS TRÊS PERGUNTAS DO CUSTO (regra 7) ────────────────────────────────────
 *
 *  · Quantas vezes corre: uma por importação (à mão; dezenas no total).
 *  · Quanto processador: nenhum trabalho pesado — uma leitura `key in (…)` em
 *    `app_state`, e por cada foto encontrada um `getTheme` e um HEAD ao
 *    Storage (zero bytes de saída). Medido por `comCpu`.
 *  · Guardar / build / navegador: o resumo é calculado no navegador; aqui só
 *    se consulta o índice que os carregamentos já mantêm (`fotos-resumo.ts`).
 *
 * ── E PELO QUE MOSTRAM (13/11) ──────────────────────────────────────────────
 *
 * Com `impressoes` (a impressão visual de cada foto, calculada no navegador),
 * responde também `parecidas`: a guardada mais parecida, com o veredicto
 * («mesma» → usa-se; «talvez» → ela compara as duas e escolhe) e a miniatura
 * assinada dela. E `espaco`: quanto sobra até ao travão de 90% do plano.
 * Custo a mais: a leitura do índice visual (64 linhas de `app_state`, ~250 KB
 * com 3 000 fotos, guardada 5 min na instância), comparações em memória, um
 * HEAD por candidata e uma leitura de duas linhas para o espaço.
 */
async function POST_semMedida(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const corpo = (await request.json().catch(() => null)) as {
    resumos?: unknown;
    impressoes?: unknown;
    quoteId?: unknown;
  } | null;
  const resumos = Array.isArray(corpo?.resumos) ? corpo.resumos : null;
  if (!resumos) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  if (resumos.length > MAX_RESUMOS_POR_PERGUNTA) {
    return NextResponse.json(
      { error: `Máximo de ${MAX_RESUMOS_POR_PERGUNTA} fotografias por pergunta.` },
      { status: 400 },
    );
  }
  // As impressões visuais (`impressao-visual.ts`), calculadas no navegador:
  // só servem para PROCURAR — nada daqui entra no índice.
  const impressoes = Array.isArray(corpo?.impressoes) ? corpo.impressoes : [];
  if (impressoes.length > MAX_IMPRESSOES_POR_PERGUNTA) {
    return NextResponse.json(
      { error: `Máximo de ${MAX_IMPRESSOES_POR_PERGUNTA} fotografias por pergunta.` },
      { status: 400 },
    );
  }
  const quoteId = typeof corpo?.quoteId === "string" && corpo.quoteId ? corpo.quoteId : null;
  const [existentes, parecidas, espaco] = await Promise.all([
    procurarExistentes(resumos, quoteId).catch((e) => {
      // Não saber não trava nada: o navegador sobe tudo, como antes.
      log.warn("fotos-existentes: índice ilegível", { erro: String(e) });
      return new Map<string, string>();
    }),
    procurarParecidas(impressoes, quoteId).catch(() => new Map<string, Parecida>()),
    lerEspaco().catch(() => null),
  ]);
  // A miniatura da que já está guardada, para ela comparar lado a lado.
  const miniaturas = await signProposalThumbs([...parecidas.values()].map((p) => p.caminho)).catch(
    () => new Map<string, string>(),
  );
  return NextResponse.json({
    ok: true,
    existentes: Object.fromEntries(existentes),
    parecidas: Object.fromEntries(
      [...parecidas].map(([imp, p]) => [
        imp,
        {
          caminho: p.caminho,
          veredicto: p.veredicto,
          distancias: p.distancias,
          miniatura: miniaturas.get(p.caminho) ?? null,
        },
      ]),
    ),
    espaco,
  });
}

// Quanto processador gasta cada pedido — ver `medir-cpu.ts`.
export const POST = comCpu("fotos-existentes POST", POST_semMedida);
