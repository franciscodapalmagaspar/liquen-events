import { NextRequest, NextResponse } from "next/server";
import { porqueOEmailNaoSegue } from "@/lib/email-do-cliente";
import type { QuoteMessage } from "@/lib/orcamento/types";
import { transicaoDoPedido } from "@/lib/orcamento/estado-do-pedido";
import { getQuote, updateQuote } from "@/lib/quotes-store";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";
import { emailAoCliente } from "@/lib/email-assinatura";
import { assinaturaDeQuemEnvia } from "@/lib/email-quem-assina";
import { isAuthed } from "@/lib/admin-auth";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

function authorized(request: NextRequest): boolean {
  return isAuthed(request);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ASSUNTO SEGUE A LÍNGUA DO PEDIDO, NÃO SÓ O CORPO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O corpo desta mensagem é sempre o que ela escreveu — não se traduz, é dela.
 * Mas a LINHA DE ASSUNTO era escrita à mão, sempre em português, mesmo quando
 * o resto do email (e o pedido) é inglês. Era a mesma avaria dos modelos
 * automáticos, só que aqui não há "modelo" nenhum a recusar: é uma linha fixa,
 * e a correcção é tê-la nas duas línguas.
 *
 * A língua vem de `quote.locale`, gravada quando o formulário público foi
 * submetido — ausente nos pedidos anteriores a esse campo, e por isso cai no
 * português de sempre.
 */
function assuntoDaMensagem(locale: string | undefined, id: string): string {
  return locale === "en"
    ? `Líquen Events — about your enquiry (${id})`
    : `Líquen Events — sobre o seu pedido (${id})`;
}

// Reply to the client by email, from within the dashboard.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const quote = await getQuote(id);
    if (!quote) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    // JSON malformado é pedido errado, não avaria. Sem isto o `request.json()`
    // atirava, o `catch` lá em baixo devolvia 500 e o painel dizia «erro ao
    // enviar» — que se lê como o correio ter avariado e leva a reenviar a
    // mensagem. Mesmo padrão do PATCH de `/api/orcamento/[id]`.
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
    }
    const escrita = String(body.message ?? "").trim();
    if (!escrita) {
      return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
    }
    /**
     * O domínio do email do cliente tem de receber correio (pedido dela,
     * 30/10: «não deixe enviar emails que não existem»). Recusa-se ANTES de
     * registar e de mandar: a mensagem fica na caixa
     * dela, e volta a seguir quando o email estiver certo — ver `email-do-cliente.ts`.
     */
    const semDominio = await porqueOEmailNaoSegue(quote.email);
    if (semDominio) {
      return NextResponse.json({ error: semDominio, campo: "email" }, { status: 422 });
    }

    /**
     * ════════════════════════════════════════════════════════════════════════
     * O `{nome}` RESOLVE-SE NO ENVIO, E NÃO NO CLIQUE DO MODELO
     * ════════════════════════════════════════════════════════════════════════
     *
     * O painel substituía o `{nome}` no instante em que ela carregava num
     * modelo de resposta rápida — e mais lado nenhum. Só que o MESMO back
     * office tem um ecrã «Modelos de email» que lhe ensina, com botões que o
     * inserem, que `{nome}` é um campo de fusão. Quem aprende isso ali
     * escreve-o também aqui, à mão, e o cliente recebia «Olá {nome},» — a
     * assinatura de um software mal montado, num email pessoal.
     *
     * ── PORQUE AQUI, E NÃO UM AVISO NO ECRÃ ───────────────────────────────
     *
     * Avisar punha-a a resolver à mão um problema que a máquina sabe resolver,
     * e só funcionava enquanto ela lesse o aviso. Aqui é o ÚNICO ponto por onde
     * a mensagem passa inteira, venha do modelo, da caixa, ou de uma versão
     * futura do ecrã — e é o mesmo sítio que a GRAVA no histórico, o que faz
     * com que o que fica registado seja o que o cliente leu. Se a substituição
     * vivesse só no ecrã, a conversa gravada e a conversa acontecida
     * divergiam.
     *
     * O primeiro nome, como no ecrã: é assim que se trata alguém numa mensagem
     * («Olá Ana,»), e não pelo nome completo.
     *
     * ── SEM NOME NO PEDIDO, SAI O MARCADOR *E* O BURACO QUE ELE DEIXA ──────
     *
     * Os pedidos que entram por telefonema podem não ter nome. Tirar só o
     * `{nome}` resolvia metade do problema e deixava a outra à vista: o modelo
     * de resposta rápida começa por «Olá {nome},» e o cliente lia
     *
     *     Olá , obrigada pelo seu contacto!
     *
     * — que não é melhor do que o marcador cru, é só um erro diferente, e é o
     * que estava a acontecer (o teste desta rota media apenas que o `{nome}`
     * desaparecia). Tira-se o espaço que precede o marcador, e quando ele abre
     * a linha tira-se também a pontuação que ficaria pendurada:
     *
     *     «Olá {nome}, obrigada!»   → «Olá, obrigada!»
     *     «{nome}, bom dia»         → «bom dia»
     *     «Falamos com {nome} logo» → «Falamos com logo»  (o espaço não se soma)
     *
     * Com nome, nada disto corre: é a substituição simples de sempre.
     */
    const primeiroNome =
      String(quote.name ?? "")
        .trim()
        .split(/\s+/)[0] ?? "";
    const message = primeiroNome
      ? escrita.replace(/\{nome\}/g, primeiroNome)
      : escrita
          // O marcador a ABRIR uma linha leva consigo a vírgula (ou os dois
          // pontos) que ficaria a começar a frase.
          .replace(/^[ \t]*\{nome\}[ \t]*[,;:]?[ \t]*/gm, "")
          // No meio de uma frase, sai com o espaço que o precede — senão
          // «Olá {nome},» deixava «Olá ,».
          .replace(/[ \t]*\{nome\}/g, "");

    // O corpo é só o que ESTA mensagem tem de particular: a moldura e a
    // assinatura vêm do `emailAoCliente`, que é a mesma para todo o correio que
    // sai daqui para fora. O rodapé escrito à mão que aqui estava era uma de
    // cinco cópias da mesma linha.
    // Quem assina é quem escreveu — este é o mais pessoal do correio que sai
    // daqui. O nome do cliente vai para a protecção, não para o email.
    const email = emailAoCliente({
      html: `<p style="font-size:14px;line-height:1.7;color:#2a2620;white-space:pre-wrap">${esc(message)}</p>`,
      texto: message,
      quem: { ...assinaturaDeQuemEnvia(request), destinatario: quote.name },
    });

    /**
     * ════════════════════════════════════════════════════════════════════════
     * UM PEDIDO SEM EMAIL NÃO PODE ENGOLIR A MENSAGEM
     * ════════════════════════════════════════════════════════════════════════
     *
     * Um pedido criado a partir de um TELEFONEMA tem `email: ""` — o «Novo
     * pedido» só exige o nome, e o formulário público aceita «email OU
     * telefone». Com o endereço vazio, o servidor de correio recusa («No
     * recipients defined»), o envio atirava, e a rota devolvia 500 «Erro ao
     * enviar a mensagem» — sem nunca dizer que o que faltava era o email.
     *
     * E o pior não era o erro: a gravação vinha DEPOIS do envio, portanto a
     * mensagem nunca chegava a ser guardada. Ela escrevia, carregava em
     * Enviar, e o histórico do pedido continuava vazio — sem forma nenhuma de
     * registar que já tinha respondido, nem que fosse por telefone.
     *
     * Passa a ser como no envio da proposta, que já resolvia isto: sem
     * destinatário válido não se tenta enviar, a mensagem é GRAVADA na mesma
     * (é o registo de que ela respondeu), e a resposta diz porque é que o
     * email não saiu. O ecrã já sabe mostrar essa frase.
     *
     * ════════════════════════════════════════════════════════════════════════
     * E O MESMO VALE QUANDO É O CORREIO QUE FALHA
     * ════════════════════════════════════════════════════════════════════════
     *
     * A guarda acima só cobria o destinatário VAZIO. Com um endereço bom e o
     * servidor de correio em baixo — uma ligação que expira (o `mail.ts` corta
     * aos 8 s), credenciais recusadas, uma caixa cheia do outro lado — o
     * `sendMail` ATIRA, a excepção subia ao `catch` do fim, a rota respondia
     * 500 «Erro ao enviar a mensagem», e o `updateQuote` lá em baixo nunca
     * chegava a correr.
     *
     * Ou seja: exactamente o defeito que se tinha corrigido, a entrar pela
     * porta do lado. Ela escrevia a resposta, carregava em Enviar, via «erro
     * ao enviar» — e o histórico do pedido continuava vazio. O texto que ela
     * escreveu só existia naquela caixa, e desaparecia com ela.
     *
     * Uma falha de envio deixa portanto de ser uma excepção: é um facto que se
     * conta na resposta (`emailed: false` + a frase), como já acontece na
     * geração da proposta. A mensagem é gravada NOS DOIS casos — é o registo
     * de que ela respondeu, e é ele que lhe permite decidir se telefona.
     */
    const temDestinatario = !!quote.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(quote.email);
    let mail = { sent: false };
    let emailError: string | undefined;
    if (!temDestinatario) {
      emailError =
        "Este pedido não tem email — a mensagem ficou registada, mas não foi enviada. " +
        "Acrescenta o email do cliente para lhe poderes escrever daqui.";
    } else {
      try {
        mail = await sendMail({
          to: quote.email,
          replyTo: MAIL_TO,
          subject: assuntoDaMensagem(quote.locale, id),
          ...email,
        });
        if (!mail.sent) {
          emailError =
            "O envio de email não está configurado neste servidor — a mensagem ficou " +
            "registada, mas o cliente não a recebeu.";
        }
      } catch (e) {
        log.error("mensagem: a mensagem foi registada mas o email não saiu", e, { id });
        emailError =
          "A mensagem ficou registada, mas o servidor de correio não a aceitou — o cliente " +
          "NÃO a recebeu. Tenta outra vez daqui a pouco, ou fala com ele por telefone.";
      }
    }

    const newMessage: QuoteMessage = { at: new Date().toISOString(), body: message };
    const messages = [...(quote.messages ?? []), newMessage];

    /**
     * ════════════════════════════════════════════════════════════════════════
     * RESPONDER MUDA O ESTADO — A BOLA PASSA PARA O LADO DE LÁ
     * ════════════════════════════════════════════════════════════════════════
     *
     * Enviar uma mensagem só acrescentava uma linha ao histórico. O pedido
     * ficava em «Novo» na lista, indistinguível de um que tinha acabado de
     * chegar e ao qual ninguém tinha tocado — e a única forma de saber que já
     * se tinha respondido era abrir o pedido e ler o histórico.
     *
     * Passa a subir para `em_revisao`, que é o estado agora rotulado
     * **«Aguardar resposta»**: já respondemos, falta o cliente responder.
     *
     * ── PORQUE É QUE SÓ SOBE DE «pendente» ────────────────────────────────
     *
     * Um pedido que já tem proposta enviada (`cotado`), que já foi ganho
     * (`aceite`) ou perdido (`rejeitado`) NÃO volta para trás por causa de uma
     * mensagem. Mandar uma nota a um casamento já fechado não o desfecha — e um
     * estado que anda para trás sozinho é a maneira mais rápida de ela deixar de
     * confiar na coluna.
     *
     * Um pedido que já esteja em «Aguardar resposta» também não muda: já lá
     * está, e reescrever o mesmo valor só serviria para mexer no `lastUpdated`.
     *
     * ── PORQUE É QUE A REGRA JÁ NÃO ESTÁ ESCRITA AQUI ─────────────────────
     *
     * Era uma linha (`quote.status === "pendente"`) e estava certa. Mas passou
     * a haver mais meia dúzia de sítios que também têm de mexer no estado —
     * emitir uma factura, registar um pagamento, guardar o contrato — e cada um
     * a escrever a sua versão da regra é como se chega a seis regras
     * diferentes, sendo a sexta a que faz um casamento ganho voltar atrás.
     *
     * A decisão mudou-se inteira para `@/lib/orcamento/estado-do-pedido`, com
     * testes próprios. O comportamento aqui é exactamente o mesmo, mais uma
     * coisa que faltava: a mudança passa a deixar uma LINHA NO HISTÓRICO. Sem
     * ela, ela via a coluna mudar sozinha e não tinha onde ir ver porquê.
     */
    const transicao = transicaoDoPedido({
      acontecimento: "mensagem_enviada",
      estadoActual: quote.status,
    });
    const updated = await updateQuote(id, {
      messages,
      ...(transicao
        ? {
            status: transicao.status,
            activityLog: [...(quote.activityLog ?? []), transicao.entrada],
          }
        : {}),
    });

    return NextResponse.json({
      ok: true,
      emailed: mail.sent,
      ...(emailError ? { emailError } : {}),
      quote: updated,
    });
  } catch (err) {
    log.error("mensagem POST falhou", err);
    return NextResponse.json({ error: "Erro ao enviar a mensagem" }, { status: 500 });
  }
}
