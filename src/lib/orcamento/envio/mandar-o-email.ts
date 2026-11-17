import "server-only";
import { sendMail, MAIL_TO } from "@/lib/mail";
import { log } from "@/lib/logger";
import { FOLGA_DO_EMAIL_MS } from "./orcamento-de-tempo";
import type { EmailDaProposta } from "./email-da-proposta";

/**
 * Etapa 11 do envio (`docs/ESTRUTURA-DO-CODIGO.md`, fase 5): o correio sai —
 * ou não sai, e diz-se porquê.
 *
 * A proposta JÁ foi guardada antes disto. O envio do email é um passo
 * separado: se falhar (SMTP em baixo, credenciais erradas, email do cliente
 * inválido) NÃO pode deitar abaixo a geração inteira com um 500 — senão o
 * utilizador vê "erro", tenta de novo e cria propostas duplicadas. Falhar no
 * email devolve 200 com emailed:false + motivo, para a UI explicar o que
 * aconteceu.
 */
export interface ResultadoDoEmail {
  emailed: boolean;
  emailError?: string;
  /** Não saiu email porque ela ESCOLHEU que não saísse — e não porque falhou. */
  semEmailPorEscolha: boolean;
}

export interface ParaMandar {
  /** O id do PEDIDO. */
  pedidoId: string;
  propostaId: string;
  para: string | undefined;
  /** `false` só quando ela escolheu o WhatsApp (`ler-o-corpo.ts`). */
  porEmail: boolean;
  /** O email inteiro, já com a moldura da casa (`email-da-proposta.ts`). */
  escrito: EmailDaProposta;
  pdf: Buffer;
  /** Quantos ms sobram do orçamento do pedido, agora. */
  resta: () => number;
}

export async function mandarOEmail(p: ParaMandar): Promise<ResultadoDoEmail> {
  const temDestinatario = !!p.para && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.para);
  if (!p.porEmail) {
    /* Sem `emailError`: a diferença entre «não saiu» e «não saiu por culpa
       de alguma coisa» é a diferença entre um ecrã calmo e um ecrã que
       parece avariado. A proposta fica gravada e o link do casal nasce à
       mesma — é ele que vai no WhatsApp. */
    log.info("proposta-doc: envio sem email, por escolha de quem enviou", {
      id: p.pedidoId,
      proposta: p.propostaId,
    });
    return { emailed: false, semEmailPorEscolha: true };
  }
  if (!temDestinatario) {
    return {
      emailed: false,
      emailError: "O pedido não tem um email de cliente válido.",
      semEmailPorEscolha: false,
    };
  }
  if (p.resta() < FOLGA_DO_EMAIL_MS) {
    log.warn("proposta-doc: sem tempo para o email, não se começa", {
      id: p.pedidoId,
      restaMs: p.resta(),
    });
    return {
      emailed: false,
      emailError:
        "O documento demorou mais do que o costume e o email não chegou a sair. A proposta ficou gravada: carregue outra vez em enviar.",
      semEmailPorEscolha: false,
    };
  }
  const { email } = p.escrito;
  try {
    const mail = await sendMail({
      to: p.para as string,
      replyTo: MAIL_TO,
      // Sem o identificador interno — a mesma decisão da rota irmã
      // (`orcamento/[id]/proposta`), onde está escrita por extenso: o
      // `randomUUID()` da nossa base não é referência de ninguém.
      subject: p.escrito.assunto,
      html: email.html,
      text: email.text,
      // O PDF junta-se aos anexos da assinatura; substituí-los deixava o
      // logótipo de fora e o `cid:` do HTML sem destino.
      attachments: [
        ...email.attachments,
        {
          // O nome do anexo também é a língua da proposta: ela manda as duas
          // versões (a portuguesa aos pais, a inglesa ao casal) e com o mesmo
          // nome a segunda fica «Proposta-Liquen-q1 (1).pdf» na pasta de quem
          // as receba, sem forma de saber qual é qual sem abrir as duas.
          // O NOME é o do casal e o da data do evento, e não o
          // identificador interno do pedido: é este ficheiro que fica na
          // pasta de transferências deles e que é reencaminhado aos pais.
          filename: p.escrito.nomeDoAnexo,
          content: p.pdf,
          contentType: "application/pdf",
        },
      ],
    });
    return mail.sent
      ? { emailed: true, semEmailPorEscolha: false }
      : {
          emailed: false,
          emailError: "Envio de email não configurado.",
          semEmailPorEscolha: false,
        };
  } catch (e) {
    log.error("proposta-doc: envio de email falhou", e, { id: p.pedidoId });
    return {
      emailed: false,
      emailError: "A proposta foi guardada, mas o email ao cliente falhou.",
      semEmailPorEscolha: false,
    };
  }
}
