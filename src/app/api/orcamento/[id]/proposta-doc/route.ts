import { NextRequest, NextResponse, after } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { assinaturaDeQuemEnvia } from "@/lib/email-quem-assina";
import { log } from "@/lib/logger";
import { comCpu } from "@/lib/medir-cpu";
import { getQuote } from "@/lib/quotes-store";
import { atenderOPedido, type Desfecho } from "@/lib/orcamento/envio/atender-o-pedido";
import { lerOPedido } from "@/lib/orcamento/envio/corpo-do-pedido";
import { relogioDoEnvio } from "@/lib/orcamento/envio/orcamento-de-tempo";
import { linkDaUltimaEnviada } from "@/lib/orcamento/envio/ultima-enviada";

/*
 * A rota da proposta só faz o que é da rota: a sessão, a medida do
 * processador (`comCpu`), LER (o pedido e o corpo) e traduzir o desfecho em
 * HTTP. O que se decide — recusar, desenhar, perguntar, gravar, mandar — vive em
 * `lib/orcamento/envio/` (fase 5 de `docs/ESTRUTURA-DO-CODIGO.md`), e começa
 * em `atender-o-pedido.ts`.
 */

export const runtime = "nodejs";

/** O link da proposta mais recente REALMENTE enviada — ver `ultima-enviada.ts`. */
async function GET_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  try {
    return NextResponse.json({ ok: true, acceptUrl: await linkDaUltimaEnviada(id) });
  } catch (err) {
    log.error("proposta-doc GET falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «NÃO DÁ PARA MANDAR A PROPOSTA PARA O CLIENTE»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta é a rota mais pesada da aplicação inteira: vai buscar ao armazenamento
 * até oitenta fotografias, redimensiona cada uma com o sharp, desenha um PDF de
 * uma dúzia de páginas, guarda a proposta e envia um email com o ficheiro em
 * anexo. E era a ÚNICA das rotas pesadas que não dizia quanto tempo precisa.
 *
 * Sem esta linha, a plataforma dá o mínimo — dez segundos — e mata a função a
 * meio. Do lado dela não aparece um erro que se perceba: aparece um erro
 * qualquer, ou nada, depois de o botão ter ficado a rodar. E o mais cruel é que
 * funciona nos testes e nas propostas pequenas: só falha nas que têm fotografias
 * a sério, que são exactamente as que ela manda aos casais.
 *
 * A comparação diz tudo: a rota que serve o PDF já feito ao cliente pede 20 s,
 * a que faz miniaturas pede 60, e a que faz TUDO isto não pedia nada.
 *
 * 60 s é o tecto do plano e é o valor certo aqui: não torna nada mais lento (só
 * se paga o que se usa), e é a diferença entre uma proposta que sai e uma
 * proposta que morre a meio sem explicação.
 */
export const maxDuration = 60;

/** O desfecho do pedido, em HTTP. */
function emHttp(d: Desfecho): NextResponse {
  switch (d.tipo) {
    case "recusa":
      return NextResponse.json(d.recusa.corpo, { status: d.recusa.status });
    case "pdf":
      return new NextResponse(d.pdf, { headers: d.cabecalhos });
    case "envio":
      return NextResponse.json(d.resposta);
  }
}

/**
 * Corre trabalho depois de a resposta sair. Nunca pode estragar um envio: se
 * falhar, diz-se; se não houver onde o deixar a correr (fora de um pedido), a
 * primeira visita faz o trabalho, como antes.
 */
function depoisDaResposta(trabalho: () => Promise<void>): void {
  try {
    after(async () => {
      try {
        await trabalho();
      } catch (e) {
        log.warn("proposta-doc: a página online não ficou preparada", { erro: String(e) });
      }
    });
  } catch {
    /* sem contexto de pedido: fica para a primeira visita */
  }
}

async function POST_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  const resta = relogioDoEnvio(Date.now());
  try {
    const quote = await getQuote(id);
    if (!quote) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    return emHttp(
      await atenderOPedido({
        pedidoId: id,
        quote,
        pedido: await lerOPedido(request, id),
        resta,
        assinatura: () => assinaturaDeQuemEnvia(request),
        depoisDaResposta,
      }),
    );
  } catch (err) {
    log.error("proposta-doc POST falhou", err);
    // Rota só para administradores autenticados — incluir o motivo real ajuda a
    // equipa (e o suporte) a perceber a causa em vez de um erro genérico opaco.
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Erro ao gerar a proposta: ${detail || "desconhecido"}` },
      { status: 500 },
    );
  }
}

// Quanto processador gasta cada pedido (3/11) — ver `medir-cpu.ts`.
export const GET = comCpu("proposta-doc GET", GET_semMedida);
export const POST = comCpu("proposta-doc POST", POST_semMedida);
