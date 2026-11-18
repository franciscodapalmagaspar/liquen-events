import "server-only";
import { esc } from "@/lib/mail";
import { enderecoDoPdfDaProposta } from "@/lib/proposta-link-curto";
import type { textosDoEmailDaProposta } from "@/lib/email-proposta-textos";

type TextosDoEmail = ReturnType<typeof textosDoEmailDaProposta>;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PDF TEM DE SE VER NO CORPO, E NÃO SÓ LÁ NO FUNDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «dá para colocar o pdf da proposta mais visível no email?».
 *
 * O ficheiro segue em anexo, mas quem manda no sítio onde o anexo aparece é
 * o leitor de correio, não nós: no Gmail do telemóvel dela cai DEPOIS da
 * assinatura, do banner e de tudo — é preciso rolar o email inteiro para o
 * encontrar, e o corpo só o menciona de passagem numa frase.
 *
 * O que se pode pôr onde se vê é um caminho PRÓPRIO para o mesmo documento,
 * dentro do corpo e antes da assinatura. As duas portas abrem com a mesma
 * chave (ver `enderecoDoPdfDaProposta`), portanto não se emite ligação
 * nenhuma nova nem se gere uma segunda validade.
 *
 * Vai nos TRÊS caminhos do envio — o corpo escrito no ecrã, o modelo
 * guardado e o de recurso —, porque o anexo também vai nos três e o defeito
 * não era de nenhum deles em particular.
 *
 * O nome do ficheiro está escrito no cartão de propósito: é assim que o
 * casal reconhece, na caixa de correio, que o anexo lá em baixo e este
 * botão são o mesmo documento.
 *
 * ── DOIS BOTÕES IGUAIS NÃO SÃO DUAS ACÇÕES ───────────────────────────────
 *
 * «Quero algo mais bonito e minimalista.» Desenhei o cartão sozinho e ficou
 * bem; só ao desenhar o EMAIL INTEIRO é que se viu o problema — e não era o
 * cartão.
 *
 * Eram dois rectângulos verdes do mesmo tamanho, um por cima do outro, a
 * dizer «Ver a proposta →» e «Abrir a proposta →». Fazem coisas diferentes
 * — o primeiro leva à página onde o casal responde, o segundo abre o PDF —
 * e não havia como saber qual era qual sem ler as duas com atenção. Duas
 * coisas com o mesmo peso não são uma hierarquia: são uma escolha que se
 * empurra para quem lê.
 *
 * Um botão cheio, e um link. O botão é o que se quer que aconteça: ir à
 * página, ler, responder. O PDF é o outro caminho para o mesmo documento —
 * continua à vista, no corpo, acima da assinatura, que era toda a razão por
 * que este bloco existe (antes só ia em anexo, e quem arquivasse a mensagem
 * decidia milhares de euros a olhar para um total).
 *
 * ── E CONTINUA A CABER NO POLEGAR ───────────────────────────────────────
 *
 * O link é `inline-block` com 12 px em cima e em baixo: 44 px de alvo,
 * contando a entrelinha de 20. Minimalismo não é encolher o que se toca —
 * era esse o defeito de origem deste bloco, com um botão de 37 px.
 *
 * Em tabelas e estilos em linha, que é o que sobrevive ao Outlook.
 */
export function cartaoDoPdf(
  acceptUrl: string,
  t: TextosDoEmail,
  nomeDoAnexo: string,
): { html: string; texto: string[] } {
  const linkDoPdf = enderecoDoPdfDaProposta(acceptUrl);
  const html = `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:32px 0 0;border-collapse:collapse">
          <tr><td style="border-top:1px solid #e6dfd2;padding-top:20px">
            <a href="${linkDoPdf}" style="display:inline-block;padding:12px 0;font-size:16px;line-height:20px;color:#4c6350;text-decoration:underline;text-underline-offset:3px">${esc(t.anexoBotao)}</a>
            <p style="margin:0;font-size:11px;line-height:1.5;color:#a49c8e;word-break:break-word">${esc(nomeDoAnexo)}</p>
          </td></tr>
        </table>`;
  /** O mesmo, para quem lê o email em texto simples. */
  // Em texto simples a seta do botão não diz nada; quem lê assim precisa do
  // NOME da coisa, que é o que a etiqueta é.
  const texto = ["", `${t.anexoEtiqueta}: ${linkDoPdf}`];
  return { html, texto };
}
