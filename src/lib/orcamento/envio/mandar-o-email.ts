import "server-only";
import { sendMail, MAIL_TO } from "@/lib/mail";
import { log } from "@/lib/logger";
import { pareceEmail } from "@/lib/parece-email";
import { FOLGA_DO_EMAIL_MS } from "./orcamento-de-tempo";
import type { EmailDaProposta } from "./email-da-proposta";
import type { BytesDoPdf } from "./envio-da-proposta";

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
export type SaidaDoEmail =
  /** O correio saiu. */
  | { tipo: "saiu" }
  /** Não saiu porque ela ESCOLHEU o WhatsApp — e não porque falhou. */
  | { tipo: "porEscolha" }
  /** Não saiu, por avaria: a frase diz porquê. */
  | { tipo: "naoSaiu"; erro: string };

export interface ParaMandar {
  /** O id do PEDIDO. */
  pedidoId: string;
  propostaId: string;
  para: string | undefined;
  /** `false` só quando ela escolheu o WhatsApp (`ler-o-corpo.ts`). */
  porEmail: boolean;
  /** O email inteiro, já com a moldura da casa (`email-da-proposta.ts`). */
  email: EmailDaProposta;
  pdf: BytesDoPdf;
  /** Quantos ms sobram do orçamento do pedido, agora. */
  resta: () => number;
}

export async function mandarOEmail(p: ParaMandar): Promise<SaidaDoEmail> {
  // A forma do endereço é a regra da trava do envio (`pareceEmail`).
  const para = pareceEmail(p.para) ? p.para : null;
  if (!p.porEmail) {
    /* Sem `emailError`: a diferença entre «não saiu» e «não saiu por culpa
       de alguma coisa» é a diferença entre um ecrã calmo e um ecrã que
       parece avariado. A proposta fica gravada e o link do casal nasce à
       mesma — é ele que vai no WhatsApp. */
    log.info("proposta-doc: envio sem email, por escolha de quem enviou", {
      id: p.pedidoId,
      proposta: p.propostaId,
    });
    return { tipo: "porEscolha" };
  }
  if (para === null) {
    return { tipo: "naoSaiu", erro: "O pedido não tem um email de cliente válido." };
  }
  if (p.resta() < FOLGA_DO_EMAIL_MS) {
    log.warn("proposta-doc: sem tempo para o email, não se começa", {
      id: p.pedidoId,
      restaMs: p.resta(),
    });
    return {
      tipo: "naoSaiu",
      erro: "O documento demorou mais do que o costume e o email não chegou a sair. A proposta ficou gravada: carregue outra vez em enviar.",
    };
  }
  const { emoldurado } = p.email;
  try {
    const mail = await sendMail({
      to: para,
      replyTo: MAIL_TO,
      // Sem o identificador interno — a mesma decisão da rota irmã
      // (`orcamento/[id]/proposta`), onde está escrita por extenso: o
      // `randomUUID()` da nossa base não é referência de ninguém.
      subject: p.email.assunto,
      html: emoldurado.html,
      text: emoldurado.text,
      // O PDF junta-se aos anexos da assinatura; substituí-los deixava o
      // logótipo de fora e o `cid:` do HTML sem destino.
      attachments: [
        ...emoldurado.attachments,
        {
          // O nome do anexo também é a língua da proposta: ela manda as duas
          // versões (a portuguesa aos pais, a inglesa ao casal) e com o mesmo
          // nome a segunda fica «Proposta-Liquen-q1 (1).pdf» na pasta de quem
          // as receba, sem forma de saber qual é qual sem abrir as duas.
          // O NOME é o do casal e o da data do evento, e não o
          // identificador interno do pedido: é este ficheiro que fica na
          // pasta de transferências deles e que é reencaminhado aos pais.
          filename: p.email.nomeDoAnexo,
          content: p.pdf,
          contentType: "application/pdf",
        },
      ],
    });
    return mail.sent
      ? { tipo: "saiu" }
      : { tipo: "naoSaiu", erro: "Envio de email não configurado." };
  } catch (e) {
    log.error("proposta-doc: envio de email falhou", e, { id: p.pedidoId });
    return { tipo: "naoSaiu", erro: "A proposta foi guardada, mas o email ao cliente falhou." };
  }
}
