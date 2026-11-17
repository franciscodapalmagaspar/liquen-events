import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { ASSINATURA_NOME, emailAoCliente } from "@/lib/email-assinatura";
import { valoresDoPedidoReal } from "@/lib/email-modelos-previsualizacao";
import { textoDoCorpo, desmoldurar, prepararModelo } from "@/lib/email-modelos";
import { VALORES_DE_EXEMPLO } from "@/lib/email-template-vars";
import type { IdiomaDoModelo } from "@/lib/email-templates-store";
import { log } from "@/lib/logger";
import { MAIL_TO, sendMail } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MANDAR UM TESTE A SI PRÓPRIA, ANTES DE O USAR A SÉRIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A pré-visualização mostra o corpo dentro de um `iframe`. O que ela não
 * mostra — nem pode — é o que só existe depois de o email passar pelo correio:
 * a moldura e a assinatura da casa (que trazem imagens por `cid:`), como o
 * assunto fica na lista de mensagens, o que o Gmail decide encolher, e se o
 * texto simples se lê. Esse teste faz-se de uma maneira só: mandando um.
 *
 * ── AS TRÊS TRANCAS ───────────────────────────────────────────────────────
 *
 * 1. O ASSUNTO LEVA «[TESTE]» À FRENTE, sempre e sem forma de o tirar. Se um
 *    destes emails alguma vez aterrar onde não devia, quem o abre percebe no
 *    primeiro segundo que não é um email de trabalho.
 * 2. O DESTINO POR OMISSÃO É A CASA (`MAIL_TO`). Escrever outro endereço é
 *    possível — ela pode querer ver como fica no telemóvel pessoal — mas é um
 *    gesto explícito, não o que acontece por distracção.
 * 3. NUNCA PARA O CLIENTE DO PEDIDO QUE SE ESTÁ A PRÉ-VISUALIZAR. É o único
 *    engano que este ecrã torna possível: escolhe-se um pedido real para ver
 *    os dados reais, e o endereço do casal está ali à mão. Um «teste» que
 *    chegasse ao casal com o texto a meio de ser escrito era o pior resultado
 *    desta funcionalidade inteira. Recusa-se, e diz-se porquê.
 *
 * O corpo vem do EDITOR e não do que está gravado — testar antes de publicar é
 * o ponto todo.
 */

const enderecoValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const iguais = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const corpo = await request.json().catch(() => null);
    const nome = String(corpo?.nome ?? "Modelo").slice(0, 120);
    const subject = String(corpo?.subject ?? "")
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, 300);
    const body = String(corpo?.body ?? "").slice(0, 20_000);
    const idioma: IdiomaDoModelo = corpo?.idioma === "en" ? "en" : "pt";
    const pedidoId = String(corpo?.pedido ?? "").trim();
    if (!subject || !body.trim()) {
      return NextResponse.json(
        { error: "Escreve o assunto e a mensagem primeiro." },
        { status: 400 },
      );
    }

    // Os valores: de um pedido a sério quando ela escolheu um, senão os do
    // catálogo. Um teste com dados de exemplo continua a valer para ver a
    // moldura e a assinatura.
    let valores: Record<string, string> = { ...VALORES_DE_EXEMPLO };
    let emailDoCliente = "";
    if (pedidoId) {
      const dados = await valoresDoPedidoReal(pedidoId, idioma);
      if (!dados) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
      valores = dados.valores;
      emailDoCliente = dados.emailDoCliente;
    }
    // O `{{remetente_nome}}` de um teste é quem assina a casa. Vem daqui e não
    // do pedido — ver o cabeçalho de `email-template-vars.ts`.
    valores.remetente_nome = valores.remetente_nome || ASSINATURA_NOME;

    const paraPedido = String(corpo?.para ?? "").trim();
    const para = paraPedido || MAIL_TO;
    if (!enderecoValido(para)) {
      return NextResponse.json({ error: "Esse endereço não parece um email." }, { status: 400 });
    }
    if (emailDoCliente && iguais(para, emailDoCliente)) {
      return NextResponse.json(
        {
          error:
            "Esse é o endereço do cliente deste pedido. Um teste não vai para o cliente — " +
            "escreve o teu, ou deixa em branco para ir para a caixa da Líquen.",
        },
        { status: 400 },
      );
    }

    const pronto = prepararModelo(
      { key: "teste", name: nome, subject, body, updatedAt: "" },
      valores,
    );
    if (!pronto.ok) return NextResponse.json({ error: pronto.motivo }, { status: 400 });

    const html = desmoldurar(pronto.html);
    // Com o rodapé legal, como o cliente o recebe (17/11).
    const email = emailAoCliente({
      html,
      texto: textoDoCorpo(html),
      rodapeLegal: { lingua: idioma, finalidade: "proposta" },
    });
    const { sent } = await sendMail({
      to: para,
      // O prefixo não é opcional nem configurável. Ver a tranca 1.
      subject: `[TESTE] ${pronto.assunto}`,
      html: email.html,
      text: email.text,
      attachments: email.attachments,
    });
    if (!sent) {
      return NextResponse.json(
        { error: "O correio não está configurado neste servidor — nada foi enviado." },
        { status: 503 },
      );
    }
    log.info("modelos de email: teste enviado", { para, idioma, pedido: pedidoId || "(exemplo)" });
    return NextResponse.json({ ok: true, para });
  } catch (err) {
    log.error("email-templates teste falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
