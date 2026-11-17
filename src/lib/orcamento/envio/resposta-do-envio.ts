import type { RelatorioDoPdf } from "@/lib/proposal-preview-cache";
import type { DepoisDoEmail } from "./depois-do-email";
import type { ProposalGravada } from "./gravar-a-proposta";
import type { DesfechoDoEmail } from "./mandar-o-email";

/**
 * Etapa 13, a última (`docs/ESTRUTURA-DO-CODIGO.md`, fase 5): o que o envio
 * conta ao estúdio. Pura. A ordem dos campos é a de sempre — está presa no
 * retrato de `route.caracterizacao.test.ts`, porque é texto que viaja.
 */
export function respostaDoEnvio(r: {
  propostaId: string;
  acceptUrl: string;
  desfecho: DesfechoDoEmail;
  depois: DepoisDoEmail;
  gravada: Extract<ProposalGravada, { ok: true }>;
  relatorio: Pick<RelatorioDoPdf, "missingImages" | "truncations" | "pdf">;
  pdfDaMemoria: boolean;
}): Record<string, unknown> {
  const { desfecho, depois, gravada } = r;
  return {
    ok: true,
    id: r.propostaId,
    emailed: desfecho.emailed,
    emailError: desfecho.emailError,
    /* «Não saiu email» tem duas causas muito diferentes, e o ecrã tem de as
       separar: uma é uma avaria (o `emailError`), a outra é a escolha dela.
       Sem esta linha, escolher «só WhatsApp» dava um aviso cor de laranja a
       dizer que alguma coisa correu mal. */
    ...(desfecho.semEmailPorEscolha ? { semEmailPorEscolha: true } : {}),
    /**
     * O estado em que a proposta FICOU. Vai na resposta porque é a resposta a
     * «e agora, o que é que ela vê no quadro?»: com o email fora, é
     * `rascunho` — «Gerada, por enviar» — e não «Enviada, à espera de
     * resposta». Quem chamar esta rota à mão fica a saber o mesmo.
     */
    estado: depois.estado,
    ...(depois.estadoError ? { estadoError: depois.estadoError } : {}),
    ...(depois.copiaError ? { copiaError: depois.copiaError } : {}),
    ...(depois.pedidoError ? { pedidoError: depois.pedidoError } : {}),
    /**
     * O link de aceitação, só quando a proposta seguiu mesmo (`estado ===
     * "enviada"`) — para o botão «Copiar resumo» poder usá-lo já, sem um
     * segundo pedido. `null` no caminho "gravada mas sem email": esse link
     * nunca chegou ao casal. E no caminho do WhatsApp (achado n.º 4) é ESTE o
     * link que ela manda.
     */
    acceptUrl: depois.estado === "enviada" ? r.acceptUrl : null,
    // `missingImages` VAI TAMBÉM NO ENVIO, não só na pré-visualização: os
    // passos do estúdio são clicáveis, e dá para ir do Conteúdo direito ao
    // Enviar sem passar por lá — a proposta seguia com fotos a menos, em
    // silêncio. `truncations` pelo mesmo motivo: é a mesma perda vista do
    // outro lado.
    missingImages: r.relatorio.missingImages,
    truncations: r.relatorio.truncations,
    // Quanto pesou este documento. O estúdio guarda-o com o tempo que a
    // geração demorou, e é dessas medições que sai a estimativa que aparece
    // antes do botão. No envio o PDF não passa pelo browser, e sem esta linha
    // o envio não ensinava nada à estimativa.
    pdfBytes: r.relatorio.pdf.byteLength,
    ...(r.pdfDaMemoria ? { pdfDaMemoria: r.pdfDaMemoria } : {}),
    // Só viaja quando NÃO foi guardado: uma resposta normal não ganha nada
    // com um `docSaved:true` a mais, e quem falha tem de sair pelo nome.
    ...(gravada.docSaved ? {} : { docSaved: gravada.docSaved, docError: gravada.docError }),
  };
}
