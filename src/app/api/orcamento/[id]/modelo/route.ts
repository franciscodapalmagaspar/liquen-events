import { NextRequest, NextResponse } from "next/server";
import { porqueOEmailNaoSegue } from "@/lib/email-do-cliente";
import type { QuoteMessage } from "@/lib/orcamento/types";
import { getQuote, updateQuote } from "@/lib/quotes-store";
import { sendMail, MAIL_TO } from "@/lib/mail";
import { emailAoCliente } from "@/lib/email-assinatura";
import { assinaturaDeQuemEnvia } from "@/lib/email-quem-assina";
import {
  ehModeloAPedido,
  marcadoresDoPedido,
  modeloParaEnvioAPedido,
  MODELOS_A_PEDIDO,
  textoDoCorpo,
} from "@/lib/email-modelos";
import { arrumarLigacao, ROTULO_DA_PROPOSTA } from "@/lib/email-ligacoes";
import { eurDocumento } from "@/lib/money";
import { listProposalsForQuote } from "@/lib/proposals-store";
import { enderecoDaProposta } from "@/lib/proposta-link-curto";
import { isAuthed } from "@/lib/admin-auth";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS MODELOS QUE SÓ SAEM QUANDO ELA MANDA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O ecrã «Modelos de email» prometia, por baixo de três dos quatro modelos,
 * que eles eram enviados sozinhos — «quando o sinal é recebido», «na semana
 * anterior ao evento», «depois do evento». Não eram enviados de todo: o
 * `renderTemplate` não tinha um único chamador de produção.
 *
 * Esta rota é o que eles passam a ter, e é DELIBERADAMENTE menos do que a
 * promessa: um botão. Não há agendador, não há tarefa no `cron`, e o próprio
 * POST só envia quando lhe pedem `enviar: true` — por omissão PRÉ-VISUALIZA.
 *
 * ── PORQUE É QUE NÃO SE AUTOMATIZA ────────────────────────────────────────
 *
 * Um «Falta uma semana para o grande dia» que sai sozinho para um casamento
 * que foi adiado, ou um «Obrigado por nos ter escolhido» a caminho de um casal
 * cujo evento foi cancelado na véspera, não é um email a mais: é a casa a
 * mostrar que não está a olhar. Estes três momentos dependem de coisas que só
 * uma pessoa sabe — se o sinal entrou mesmo, se o evento se mantém, se correu
 * bem. A máquina sabe a data; não sabe o resto.
 *
 * A pré-visualização existe pela mesma razão: ela vê O DESTINATÁRIO e o texto
 * exacto antes de confirmar. Um envio a um cliente não se desfaz.
 */

/** O sinal PAGO deste pedido, somado. Zero quando ainda não entrou nenhum. */
function sinalPago(pagamentos: unknown): number {
  if (!Array.isArray(pagamentos)) return 0;
  return pagamentos.reduce((soma: number, p) => {
    const pagamento = p as { kind?: string; paid?: boolean; amount?: number };
    return pagamento?.kind === "sinal" && pagamento?.paid
      ? soma + (Number(pagamento.amount) || 0)
      : soma;
  }, 0);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const quote = await getQuote(id);
    if (!quote) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const chave = (body as { chave?: unknown } | null)?.chave;
    /**
     * O `enviar` é EXPLÍCITO e só o booleano `true` conta. Sem ele
     * pré-visualiza-se — um pedido malformado, um `fetch` repetido por engano,
     * um cliente antigo: nada disso pode acabar num email na caixa de um
     * cliente. O caminho seguro é o que acontece por omissão.
     */
    const enviar = (body as { enviar?: unknown } | null)?.enviar === true;

    if (!ehModeloAPedido(chave)) {
      /**
       * O «proposta-enviada» é recusado POR NOME, e com a razão à vista: ele
       * anuncia uma proposta e leva o link de aceitação e o PDF em anexo, que
       * só existem no instante em que a proposta é gerada. Mandado à parte,
       * anunciava ao cliente uma proposta que não vinha — ou mandava-lhe o
       * link de uma antiga.
       */
      const erro =
        chave === "proposta-enviada"
          ? "O modelo «Proposta enviada» sai automaticamente com a proposta (é ele o corpo desse " +
            "email) e não pode ser enviado à parte — o link de aceitação e o PDF só existem quando " +
            "a proposta é gerada. Usa o Estúdio de propostas."
          : `Modelo desconhecido. Os que se podem enviar daqui são: ${MODELOS_A_PEDIDO.join(", ")}.`;
      return NextResponse.json({ error: erro }, { status: 400 });
    }

    // O `{link}` destes emails apontava ao PORTAL do cliente, que deixou de
    // existir — achado n.º 37 da auditoria, e decisão dela: «não há portal do
    // cliente e se há não quero que haja». Os modelos da casa não o usam; um
    // modelo dela que o use leva a página da proposta mais recente. Sem
    // proposta, o `{link}` fica vazio e o modelo é recusado com a razão — não
    // sai um email com uma ligação para lado nenhum.
    const ultima = (await listProposalsForQuote(quote.id))[0];
    const linkDaProposta = ultima ? await enderecoDaProposta(ultima.id, quote.id) : "";
    const sinal = sinalPago(quote.payments);

    const preparado = await modeloParaEnvioAPedido(
      chave,
      marcadoresDoPedido(quote, {
        link: linkDaProposta,
        // Vazio quando ainda não entrou sinal nenhum — e é esse vazio que faz
        // o modelo do sinal ser RECUSADO em vez de dizer «recebemos ».
        valor: sinal > 0 ? eurDocumento(sinal) : "",
      }),
      // A língua do PEDIDO (`quote.locale`, gravada quando o formulário
      // público foi submetido) — não a de quem está a carregar no botão. É a
      // mesma fonte que a rota irmã da proposta usa para saber que um casal é
      // inglês. Ausente (pedidos anteriores a este campo) cai no português de
      // sempre, dentro de `modeloParaEnvioAPedido`.
      quote.locale,
    );

    if (!preparado.ok) {
      // A pré-visualização mostra a recusa no sítio (200 com `ok: false`); um
      // envio pedido é que é um pedido que não se pode cumprir (400). Nos dois
      // casos não saiu email nenhum, e a frase diz o que corrigir.
      return enviar
        ? NextResponse.json({ error: preparado.motivo }, { status: 400 })
        : NextResponse.json({
            ok: false,
            motivo: preparado.motivo,
            destinatario: quote.email ?? "",
          });
    }

    if (!enviar) {
      return NextResponse.json({
        ok: true,
        destinatario: quote.email ?? "",
        assunto: preparado.assunto,
        // O TEXTO e não o HTML: é o que ela precisa de ler para decidir, e um
        // `dangerouslySetInnerHTML` no back office por causa de uma
        // pré-visualização era um preço que não se paga.
        texto: preparado.texto,
      });
    }

    /**
     * O link da proposta leva um código, e não se escreve por extenso ao
     * cliente — ver `email-ligacoes.ts`. O texto simples deriva do
     * HTML já arrumado, para as duas versões dizerem o mesmo.
     *
     * Quem assina é quem carregou no botão. Ver `email-assinatura.ts`.
     */
    const corpo = arrumarLigacao(preparado.html, {
      url: linkDaProposta,
      rotulo: ROTULO_DA_PROPOSTA,
    });
    const email = emailAoCliente({
      html: corpo,
      texto: textoDoCorpo(corpo),
      quem: { ...assinaturaDeQuemEnvia(request), destinatario: quote.name },
    });

    /**
     * Um pedido que entrou por TELEFONEMA tem `email: ""` — o formulário
     * público aceita «email ou telefone». O servidor de correio recusa um
     * destinatário vazio, e sem esta guarda o envio atirava e a rota devolvia
     * 500 «erro», que se lê como o correio ter avariado. A mesma regra da
     * proposta e do mensageiro: não se tenta, e diz-se o que falta.
     */
    const temDestinatario = !!quote.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(quote.email);
    if (!temDestinatario) {
      return NextResponse.json({
        ok: true,
        emailed: false,
        assunto: preparado.assunto,
        emailError:
          "Este pedido não tem email de cliente — não foi enviado nada. Acrescenta o email do " +
          "cliente no pedido e volta a tentar.",
      });
    }

    /**
     * O domínio do email do cliente tem de receber correio (pedido dela,
     * 30/10: «não deixe enviar emails que não existem»). Só no envio — a
     * pré-visualização saiu lá em cima e não manda nada. Ver
     * `email-do-cliente.ts`.
     */
    const semDominio = await porqueOEmailNaoSegue(quote.email);
    if (semDominio) {
      return NextResponse.json({ error: semDominio, campo: "email" }, { status: 422 });
    }

    /**
     * ══════════════════════════════════════════════════════════════════════
     * UMA FALHA DE ENVIO NÃO É «ERRO AO PREPARAR O EMAIL»
     * ══════════════════════════════════════════════════════════════════════
     *
     * O `sendMail` ATIRA quando o servidor de correio não coopera: a ligação
     * expira (o `mail.ts` corta aos 8 s), as credenciais são recusadas, a caixa
     * do outro lado está cheia. A excepção subia ao `catch` do fim e a rota
     * respondia 500 «Erro ao preparar o email» — uma frase falsa sobre a única
     * parte que tinha corrido bem, e que a manda procurar o defeito no modelo.
     *
     * E o pior é o que ela faz a seguir: um erro que parece do modelo lê-se
     * como «não saiu nada», e ela carrega outra vez. Num servidor lento — o
     * caso mais provável — o primeiro email pode ter saído na mesma, e o
     * cliente recebe o mesmo «Obrigado por nos ter escolhido» duas vezes.
     *
     * Passa a ser um facto contado na resposta (`emailed: false` + a frase),
     * como já acontece com o SMTP por configurar. O ecrã já sabe escrever
     * «o e-mail não saiu, o cliente não recebeu» no histórico a partir do
     * `emailed`, e nada é gravado — que é a regra desta rota, escrita a seguir.
     */
    let mail = { sent: false };
    let falhaDeEnvio: string | undefined;
    try {
      mail = await sendMail({
        to: quote.email,
        replyTo: MAIL_TO,
        subject: preparado.assunto,
        ...email,
      });
    } catch (e) {
      log.error("modelo: o servidor de correio recusou o envio", e, { id, chave });
      falhaDeEnvio =
        "O servidor de correio não aceitou a mensagem — o cliente NÃO recebeu nada. " +
        "Tenta outra vez daqui a pouco.";
    }

    /**
     * O QUE FICA REGISTADO É O QUE O CLIENTE LEU — E SÓ SE ELE O LEU.
     *
     * O texto vai para o histórico do pedido, o mesmo que o mensageiro
     * escreve, para que meses depois se possa ver o que se disse a quem sem ter
     * de adivinhar por um rótulo. Em TEXTO, que é o que se lê num painel.
     *
     * Ao contrário do mensageiro, um envio falhado NÃO se regista: ali o que se
     * perderia era a escrita dela, que só existia naquela caixa; aqui o texto
     * continua inteiro no modelo, e uma linha no histórico sobre um email que
     * ninguém recebeu é só uma mentira que dura para sempre.
     */
    if (mail.sent) {
      const nova: QuoteMessage = { at: new Date().toISOString(), body: preparado.texto };
      try {
        await updateQuote(id, { messages: [...(quote.messages ?? []), nova] });
      } catch (e) {
        // O email JÁ saiu. Falhar o registo não pode transformar isso num erro
        // que a leve a carregar outra vez e a mandar o mesmo email duas vezes.
        log.error("modelo: o email saiu mas o histórico não ficou gravado", e, { id, chave });
      }
    }

    return NextResponse.json({
      ok: true,
      emailed: mail.sent,
      assunto: preparado.assunto,
      ...(mail.sent
        ? {}
        : {
            emailError:
              falhaDeEnvio ??
              "O envio de email não está configurado neste servidor — o cliente não recebeu nada.",
          }),
    });
  } catch (err) {
    log.error("modelo POST falhou", err, { id });
    return NextResponse.json({ error: "Erro ao preparar o email" }, { status: 500 });
  }
}
