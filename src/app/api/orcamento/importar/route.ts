import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { porqueNaoE } from "@/lib/importar-proposta/extrair";
import { importarDocumento } from "@/lib/importar-proposta/ia/importar";
import { chamarModeloSeHouverChave } from "@/lib/importar-proposta/ia/cliente";
import { acertarImportacaoComIa, reservarImportacaoComIa } from "@/lib/importar-proposta/ia/tecto";
import { FicheiroIlegivel, MAX_BYTES_DA_IMPORTACAO } from "@/lib/importar-proposta/zip";
import { comCpu } from "@/lib/medir-cpu";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * 300 s: a leitura com IA (quando há chave) segue em streaming e uma proposta
 * longa, copiada inteira, leva minutos a escrever. Esperar pela resposta da API
 * não gasta processador (é rede); o que gasta é o XML, que continua a ser o de
 * antes. Sem chave, a rota responde no mesmo tempo de sempre.
 */
export const maxDuration = 300;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LER UMA PROPOSTA ANTIGA (WORD OU POWERPOINT) — SEM GUARDAR NADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela (13/11): a mãe tem propostas feitas em Word e PowerPoint antes do
 * back office. Esta rota lê o ficheiro e devolve o que encontrou — o casal, a
 * data, o local, os serviços, o orçamento, onde estão as fotografias — para o
 * ecrã de importação o mostrar e ela corrigir. NÃO grava nada: nem o ficheiro,
 * nem o pedido, nem o rascunho. Criar o pedido é um segundo passo, dela, pelos
 * caminhos de sempre (`/api/orcamento/manual`, `assets`, `proposta-rascunho`).
 *
 * ── O QUE CHEGA AQUI É SÓ O TEXTO ───────────────────────────────────────────
 *
 * O navegador tira as fotografias do ficheiro antes de o mandar
 * (`emagrecerParaEnvio`): um PowerPoint com fotos passa dos 4,5 MB que o
 * alojamento aceita por pedido. Um ficheiro inteiro pequeno também é aceite —
 * as fotografias são simplesmente ignoradas.
 *
 * ── AS TRÊS PERGUNTAS DO CUSTO (regra 7) ────────────────────────────────────
 *
 *  · Quantas vezes corre: uma por importação, à mão. As propostas antigas são
 *    um arquivo finito — dezenas, não milhares, e uma vez cada.
 *  · Quanto processador: ler o XML de uma proposta — dezenas de milissegundos
 *    para um Word de 20 páginas; o tecto do que se descomprime é 48 MB.
 *  · Guardar / build / navegador: não guarda nada (é uma leitura de uma vez);
 *    as fotografias nunca chegam aqui — ficam no navegador.
 *
 * ── E A LEITURA COM IA (13/11) ──────────────────────────────────────────────
 *
 * Dormente sem `ANTHROPIC_API_KEY` (não existe): sem ela, a importação é a de
 * sempre, e o ecrã diz «importação sem IA». Com ela, no máximo
 * `MAX_IMPORTACOES_COM_IA_POR_MES` por mês E no máximo `MAX_DOLARES_POR_MES`
 * (5 $; o travão em `ia/tecto.ts`, numa linha do `app_state`), a ~0,25 $ cada. E há a via de custo zero: o campo
 * `leitura` traz o JSON que o Claude do plano dele devolveu, e passa pela
 * MESMA verificação. Ver `src/lib/importar-proposta/ia/importar.ts`.
 */

/** O JSON de uma leitura: dezenas de KB numa proposta grande. */
const MAX_BYTES_DA_LEITURA = 2 * 1024 * 1024;

const GRANDE =
  "O texto deste ficheiro é grande demais para importar (mais de 4 MB sem as fotografias).";

async function POST_semMedida(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (declarado > MAX_BYTES_DA_IMPORTACAO + 64 * 1024) {
    return NextResponse.json({ error: GRANDE }, { status: 413 });
  }

  let ficheiro: File | null = null;
  let leitura: string | null = null;
  try {
    const form = await request.formData();
    const f = form.get("ficheiro");
    ficheiro = f instanceof File ? f : null;
    const l = form.get("leitura");
    if (l instanceof File) {
      if (l.size > MAX_BYTES_DA_LEITURA) {
        return NextResponse.json(
          { error: "O ficheiro da leitura é grande demais." },
          { status: 413 },
        );
      }
      leitura = await l.text();
    } else if (typeof l === "string" && l.trim()) {
      if (l.length > MAX_BYTES_DA_LEITURA) {
        return NextResponse.json(
          { error: "O ficheiro da leitura é grande demais." },
          { status: 413 },
        );
      }
      leitura = l;
    }
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }
  if (!ficheiro) {
    return NextResponse.json({ error: "Nenhum ficheiro recebido." }, { status: 400 });
  }
  if (ficheiro.size > MAX_BYTES_DA_IMPORTACAO) {
    return NextResponse.json({ error: GRANDE }, { status: 413 });
  }

  const bytes = new Uint8Array(await ficheiro.arrayBuffer());
  // O tipo confere-se pelos BYTES: o nome e o `type` vêm de quem manda.
  const recusa = porqueNaoE(bytes);
  if (recusa) return NextResponse.json({ error: recusa }, { status: 415 });

  try {
    const agora = new Date();
    const { proposta, revisao } = await importarDocumento(bytes, {
      leituraCarregada: leitura,
      chamar: chamarModeloSeHouverChave(),
      // O mês é o da RESERVA: uma leitura que acaba depois da meia-noite do
      // último dia acerta a linha do mês em que reservou, não a do seguinte.
      reservar: (custoMaximo) => reservarImportacaoComIa(custoMaximo, agora),
      acertar: (reservado, real) => acertarImportacaoComIa(reservado, real, agora),
    });
    if (revisao?.custo) {
      // Só números: nem o texto do documento nem a chave vão para os registos.
      log.info("importar-com-ia", {
        via: revisao.via,
        dolares: revisao.custo.dolares,
        partes: revisao.custo.partes,
        entrada: revisao.custo.uso.reduce((s, u) => s + u.input_tokens, 0),
        saida: revisao.custo.uso.reduce((s, u) => s + u.output_tokens, 0),
      });
    }
    return NextResponse.json({ ok: true, proposta, revisao });
  } catch (err) {
    if (err instanceof FicheiroIlegivel) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    log.error("importar proposta falhou", err, { bytes: bytes.length });
    return NextResponse.json(
      { error: "Não foi possível ler este ficheiro. Experimenta abri-lo e guardá-lo outra vez." },
      { status: 500 },
    );
  }
}

export const POST = comCpu("importar POST", POST_semMedida);
