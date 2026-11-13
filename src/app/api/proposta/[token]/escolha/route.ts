import { NextResponse } from "next/server";
import { propostaDoLink } from "@/lib/proposta-do-link";
import { updateQuoteWith } from "@/lib/quotes-store";
import { comResposta, respostaAceitavel } from "@/lib/proposta-escolhas";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ESCOLHA DO CASAL — A ÚNICA COISA QUE O LADO DE LÁ ESCREVE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Onde eu tiver dado alternativas ao casal, eles escolhem ali. A escolha volta
 * ao back office e aparece na ficha do evento.»
 *
 * ── O QUE ESTA ROTA NÃO É ─────────────────────────────────────────────────
 *
 * NÃO é o botão de aceitar, e não pode vir a sê-lo. Aquele foi apagado a
 * pedido dela — «um casamento não se fecha num botão» — e há um teste que
 * recusa o ficheiro `src/app/api/proposta/route.ts` de volta. Isto grava uma
 * PREFERÊNCIA entre alternativas que ela própria escreveu: não muda o estado
 * do pedido, não muda o preço, não gera contrato, não manda email.
 *
 * NÃO é medição. Grava-se o que escolheram e a data em que carregaram — nada
 * sobre quando abriram, quanto tempo estiveram, ou quantas vezes voltaram
 * atrás. Uma resposta nova SUBSTITUI a anterior (ver `comResposta`): um
 * histórico de indecisões seria, na prática, o registo de comportamento que
 * ela proibiu.
 *
 * ── O MODELO DE CONFIANÇA ─────────────────────────────────────────────────
 *
 * O token HMAC é a autorização, como no PDF e nas fotografias da mesma pasta.
 * E o corpo do pedido decide MUITO POUCO: o par (escolha, opção) tem de existir
 * numa escolha PRONTA do documento que o token abre (`respostaAceitavel`).
 * Quem tem o link não pode inventar uma pergunta, escrever texto livre na ficha
 * do evento, nem responder a uma escolha que ela ainda está a escrever.
 *
 * O pedido escrito é o do TOKEN, e nunca um identificador vindo do corpo:
 * mesmo com um par válido, ninguém escreve na ficha de outro casal.
 *
 * 404 para tudo o que falhe a resolução — token inválido, expirado, proposta
 * apagada, proposta sem documento. Nunca 401 nem 403: um link privado não pode
 * revelar, pela resposta, se um identificador existe.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  /**
   * O token vive meses na caixa de correio do casal e é reencaminhável. Uma
   * escolha é um gesto humano — dez por minuto é muito mais do que duas pessoas
   * indecisas no sofá conseguem, e continua a fechar a porta a um ciclo que
   * escrevesse na base de dados sem parar.
   */
  const limited = await rateLimit(`proposta-escolha:${clientIp(request)}`, 10, 60_000);
  if (!limited.ok) return new NextResponse(null, { status: 429 });

  /** Só para o registo do `catch`. */
  let idParaRegisto = "";
  try {
    const corpo = await request.json().catch(() => null);
    if (!corpo || typeof corpo !== "object") {
      return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
    }

    const proposta = (await propostaDoLink(token))?.proposta;
    idParaRegisto = proposta?.id ?? "";
    if (!proposta?.doc) return new NextResponse(null, { status: 404 });

    const { escolhaId, opcaoId } = corpo as { escolhaId?: unknown; opcaoId?: unknown };
    if (!respostaAceitavel(proposta.doc.escolhas, escolhaId, opcaoId)) {
      // 400 e não 404: o link é bom, o que não bate certo é a resposta — e
      // quem chega aqui com um par inválido é código nosso desactualizado
      // (a página aberta antes de ela reescrever as opções), não um intruso.
      return NextResponse.json({ error: "Essa escolha já não existe." }, { status: 400 });
    }

    const quoteId = (proposta.quoteId ?? "").trim();
    if (!quoteId) return new NextResponse(null, { status: 404 });
    /**
     * Ler-mudar-gravar sobre o pedido ACABADO DE LER, com o bloqueio
     * optimista do repositório (auditoria de 13/11). Com um `getQuote` e um
     * `updateQuote` separados, duas escolhas quase ao mesmo tempo (os dois no
     * sofá, cada um no seu telemóvel) partiam da mesma lista, e a segunda
     * gravação apagava a primeira.
     */
    const resposta = {
      escolhaId: escolhaId as string,
      opcaoId: opcaoId as string,
      em: new Date().toISOString(),
    };
    const gravado = await updateQuoteWith(quoteId, (atual) => ({
      ...atual,
      escolhasDoCasal: comResposta(atual.escolhasDoCasal, resposta),
    }));
    if (!gravado) return new NextResponse(null, { status: 404 });

    /**
     * A resposta é `{ ok: true }` e mais nada.
     *
     * Devolver a lista de escolhas do pedido seria dar, a quem tem o link, o
     * histórico de decisões do casal — e não é preciso: a página já sabe o que
     * acabou de carregar. Uma resposta que diz só «chegou» é a mais pequena que
     * cumpre o que o ecrã precisa.
     */
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    log.error("proposta escolha POST falhou", err, { proposalId: idParaRegisto });
    return new NextResponse(null, { status: 500 });
  }
}
