import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthed } from "@/lib/admin-auth";
import { getQuote, updateQuoteWith } from "@/lib/quotes-store";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";
import { emailAoCliente } from "@/lib/email-assinatura";
import { assinaturaDeQuemEnvia } from "@/lib/email-quem-assina";
import { pdfDoMapa } from "@/lib/orcamento/mapa-de-mesas-pdf";
import type { ActivityEntry } from "@/lib/orcamento/types";
import { log } from "@/lib/logger";
import { porqueOEmailNaoSegue } from "@/lib/email-do-cliente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MANDAR O MAPA DE MESAS POR EMAIL — A QUEM ELA ESCOLHER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A escolha dela (14/10): «escolho na hora». O ecrã abre com o email do casal
 * do pedido já escrito, e ela muda-o para a quinta, o catering ou a equipa.
 * Por isso, e ao contrário da mensagem ao cliente (`/mensagem`), o endereço
 * vem do corpo — validado aqui, e só com sessão.
 *
 * O PDF segue em anexo (o mesmo do «Descarregar», `pdfDoMapa`), com a moldura
 * e a assinatura de todo o correio desta casa (`emailAoCliente`).
 *
 * ── E QUANDO O CORREIO NÃO SEGUE ─────────────────────────────────────────
 * Sem SMTP configurado o `sendMail` não atira — devolve `sent: false`. Aqui
 * isso é um 503 com a frase, e não um «enviado»: um mapa que ela julga ter
 * mandado à quinta e que não chegou é exactamente o que se descobre na manhã
 * do casamento. O histórico do pedido só regista o que seguiu mesmo.
 */

const Corpo = z.object({
  para: z.string().trim().max(254).email("Esse email não parece certo."),
  assunto: z.string().trim().min(1, "Falta o assunto.").max(200),
  mensagem: z.string().trim().max(4000).default(""),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  const cru = await request.json().catch(() => null);
  const lido = Corpo.safeParse(cru);
  if (!lido.success) {
    return NextResponse.json(
      { error: lido.error.issues[0]?.message ?? "Corpo inválido" },
      { status: 400 },
    );
  }
  const { para, assunto, mensagem } = lido.data;
  /**
   * O endereço é escrito na hora (a quinta, o catering), e o domínio dele tem
   * de receber correio — pedido dela, 30/10: «não deixe enviar emails que não
   * existem». Um mapa que ela julga ter mandado e que morreu no servidor de
   * correio é o que se descobre na manhã do casamento. Ver
   * `email-do-cliente.ts`.
   */
  const semDominio = await porqueOEmailNaoSegue(para, "para");
  if (semDominio) {
    return NextResponse.json({ error: semDominio, campo: "para" }, { status: 422 });
  }

  try {
    const q = await getQuote(id);
    if (!q) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    const pdf = await pdfDoMapa(q);
    if (!pdf) {
      return NextResponse.json(
        { error: "Este mapa ainda não tem mesas — acrescenta uma antes de o mandar." },
        { status: 409 },
      );
    }

    const texto = mensagem || "Segue em anexo o mapa de mesas.";
    const email = emailAoCliente({
      html: `<p style="font-size:14px;line-height:1.7;color:#2a2620;white-space:pre-wrap">${esc(texto)}</p>`,
      texto,
      quem: { ...assinaturaDeQuemEnvia(request), destinatario: para },
    });

    let enviado: { sent: boolean };
    try {
      enviado = await sendMail({
        to: para,
        replyTo: MAIL_TO,
        subject: assunto,
        html: email.html,
        text: email.text,
        attachments: [
          ...email.attachments,
          {
            filename: pdf.ficheiro,
            content: Buffer.from(pdf.bytes),
            contentType: "application/pdf",
          },
        ],
      });
    } catch (e) {
      log.error("mapa de mesas: o servidor de correio recusou o email", e, { id });
      return NextResponse.json(
        {
          error:
            "O servidor de correio não aceitou o email — não seguiu. Tenta daqui a pouco, ou descarrega o PDF e manda-o tu.",
        },
        { status: 502 },
      );
    }
    if (!enviado.sent) {
      return NextResponse.json(
        {
          error:
            "O envio de email não está configurado neste servidor — o mapa NÃO seguiu. Descarrega o PDF e manda-o por outro lado.",
        },
        { status: 503 },
      );
    }

    // O registo de que seguiu, e para quem — um acrescento, para não pisar
    // quem esteja a escrever no histórico ao mesmo tempo.
    const entrada: ActivityEntry = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      kind: "message_sent",
      summary: `Mapa de mesas enviado por email a ${para}`,
    };
    await updateQuoteWith(id, (atual) => ({
      ...atual,
      activityLog: [...(atual.activityLog ?? []), entrada],
    })).catch((e) => log.error("mapa de mesas: seguiu, mas o histórico não gravou", e, { id }));

    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("mapa de mesas: envio por email falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
