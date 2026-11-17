import "server-only";
import type { Truncagens } from "./contrato";
import { log } from "@/lib/logger";
import { recusa } from "./recusa";
import type { Recusa } from "./contrato";

/**
 * Etapa 6 do envio (`docs/ESTRUTURA-DO-CODIGO.md`, fase 5): as duas perguntas
 * que o servidor faz com o PDF já desenhado, a proposta ainda por gravar e o
 * email ainda por sair — o último instante em que voltar atrás não custa nada.
 *
 * 409 e não 400: o pedido está bem formado e o servidor fez o trabalho todo —
 * o que falta é uma decisão de quem envia. É o código que o estúdio distingue
 * de uma avaria (ver `porqueFalhouOEnvio`).
 */

/**
 * A resposta «envia assim mesmo» às fotos em falta (17/11) é o NÚMERO de fotos
 * que ela viu a faltar. Vale enquanto o PDF do envio não tiver MAIS em falta do
 * que esse: um «sim» a 3 não pode mandar um documento com 9 (revisão de 17/11).
 * Um booleano, ou qualquer outra coisa que não um número, já chega aqui como
 * `null` (`ler-o-corpo.ts`) — e não conta.
 */
export function fotosEmFaltaAceites(emFalta: number, confirmadas: number | null): boolean {
  if (emFalta <= 0) return true;
  return confirmadas !== null && emFalta <= confirmadas;
}

/**
 * ════════════════════════════════════════════════════════════════════════
 * FOTOS A MENOS: UMA PERGUNTA ANTES DE SEGUIR, NÃO UM AVISO DEPOIS (17/11)
 * ════════════════════════════════════════════════════════════════════════
 *
 * Registos de 12/11: «proposta-doc: a proposta segue com fotos a menos»,
 * nove em falta, e o casal recebeu-a assim. O aviso do estúdio chegava
 * DENTRO da resposta do envio — com o email já na caixa do casal.
 *
 * A decisão dela continua de pé: o envio NÃO se recusa («recusar seria
 * pior — ela fica sem nada e sem perceber porquê»). O que muda é a ordem:
 * como nos cortes, aqui em baixo, o servidor pára e PERGUNTA, com a
 * proposta ainda por gravar e o email ainda por sair. Ela volta atrás e
 * troca as fotos, ou responde «envia assim mesmo» (`fotosEmFaltaConfirmadas`)
 * e segue — sabendo.
 */
export function perguntaDasFotos(
  id: string,
  missingImages: number,
  confirmadas: number | null,
): Recusa | null {
  if (fotosEmFaltaAceites(missingImages, confirmadas)) return null;
  log.warn("proposta-doc: envio parado para confirmar as fotos em falta", {
    id,
    emFalta: missingImages,
  });
  return recusa(409, {
    error:
      missingImages === 1
        ? "Falta 1 fotografia no documento."
        : `Faltam ${missingImages} fotografias no documento.`,
    precisaConfirmarFotos: true,
    missingImages,
  });
}

/**
 * ══════════════════════════════════════════════════════════════════════
 * O QUE FICOU CORTADO É UMA PERGUNTA ANTES DE SEGUIR, NÃO UM AVISO DEPOIS
 * ══════════════════════════════════════════════════════════════════════
 *
 * O relatório de truncagens já existia e já viajava — mas no ENVIO chegava
 * ao estúdio DENTRO da resposta, ou seja depois de o email ter saído. Ela
 * lia «o nome do casal não cabe na capa» com o casal já a ter a proposta na
 * caixa de correio, e o nome cortado a acabar num «&» solto.
 *
 * ── PORQUE É QUE NÃO RECUSA ──────────────────────────────────────────
 *
 * Porque uma truncagem pode ser deliberada — uma legenda comprida de
 * propósito, um mood board com mais fotos do que a página leva. A regra
 * dela é a de sempre: «uma proposta que não sai é pior do que uma proposta
 * com um aviso», e «recusar seria pior — ela fica sem nada e sem perceber
 * porquê». Por isso isto não é uma porta fechada: é uma pergunta com
 * resposta. O estúdio mostra o que ficou de fora e reenvia com
 * `cortesConfirmados` (só `true` conta).
 */
export function perguntaDosCortes(
  id: string,
  truncations: Truncagens,
  confirmados: boolean,
): Recusa | null {
  if (truncations.length === 0 || confirmados) return null;
  log.warn("proposta-doc: envio parado para confirmar o que ficou cortado", {
    id,
    cortado: truncations.map((t) => `${t.where}: -${t.dropped} ${t.unit}`),
  });
  return recusa(409, {
    error: "O documento sai com conteúdo cortado.",
    // O nome do campo é a pergunta: quem chama esta rota à mão percebe o
    // que lhe falta sem ter de ler o código.
    precisaConfirmarCortes: true,
    truncations,
  });
}

/**
 * Os cabeçalhos da PRÉ-VISUALIZAÇÃO — o corpo é o PDF, e é por aqui que o
 * estúdio sabe o que o documento não leva.
 */
export function cabecalhosDaPreVisualizacao(p: {
  idioma: string;
  rascunho: boolean;
  missingImages: number;
  truncations: Truncagens;
  chaveDoQueChegou: string;
  pdfDaMemoria: boolean;
}): Record<string, string> {
  const en = p.idioma === "en";
  return {
    "Content-Type": "application/pdf",
    // O nome do ficheiro segue a língua pedida. Quem descarrega pelo
    // estúdio nem chega a ver este nome (o botão escolhe o seu), mas quem
    // chamar a rota à mão fica com dois PDF distinguíveis na pasta em vez
    // de `proposta-preview (1).pdf`.
    "Content-Disposition": `inline; filename="${en ? "proposal-preview" : "proposta-preview"}${
      p.rascunho ? (en ? "-draft" : "-rascunho") : ""
    }.pdf"`,
    // Quantas fotos não entraram. O gerador salta a que não resolve, por
    // isso sem este cabeçalho o PDF sai com fotos a menos e o estúdio não
    // tem como saber. É lido em ProposalStudio para avisar antes de enviar.
    "X-Fotos-Em-Falta": String(p.missingImages),
    // O que o DESENHO deixou de fora (a sétima foto de um mood board, a
    // terceira linha do "Local"…) — a mesma perda, por outro caminho.
    // Vai em base64 porque o corpo desta resposta é o PDF e um cabeçalho
    // HTTP não transporta com segurança os acentos dos nomes dos campos.
    "X-Conteudo-Cortado": Buffer.from(JSON.stringify(p.truncations), "utf8").toString("base64"),
    // A chave do que se está a ver — só no PDF FINAL. O rascunho não
    // conta como visto: é o PDF que ainda não pode seguir.
    ...(p.rascunho ? {} : { "X-Chave-Do-Pdf": p.chaveDoQueChegou }),
    ...(p.pdfDaMemoria ? { "X-Pdf-Da-Memoria": "1" } : {}),
  };
}
