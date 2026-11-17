import "server-only";
import type { Truncagens } from "./contrato";
import { log } from "@/lib/logger";
import { paraComRecusa, SEGUE, type Passo } from "./passo";

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
 * Qualquer outra coisa que não um número já chega aqui como `null`
 * (`ler-o-corpo.ts`) e não conta — com UMA exceção, por pouco tempo
 * ({@link FIM_DO_SIM_ANTIGO}).
 */
export function fotosEmFaltaAceites(
  emFalta: number,
  confirmadas: number | true | null,
  agora: number,
): boolean {
  if (emFalta <= 0) return true;
  if (confirmadas === true) return agora < FIM_DO_SIM_ANTIGO;
  return confirmadas !== null && emFalta <= confirmadas;
}

/**
 * ── O «SIM» ANTIGO, ATÉ 18/11/2026 ÀS 23:59 EM LISBOA (2.ª revisão de 17/11) ──
 *
 * Antes da publicação de 17/11 a resposta era `fotosEmFaltaConfirmadas: true`.
 * Um separador do estúdio aberto antes disso continua a mandá-la, e ficava sem
 * conseguir enviar até ela recarregar a página. Até ao fim de 18/11 (hora de
 * Lisboa; em novembro é UTC+0) o booleano vale como dantes; a partir daí, só
 * o número.
 *
 * TIRAR depois de 18/11/2026: apagar esta constante, o ramo do `true` em
 * {@link fotosEmFaltaAceites}, o `true` da leitura (`ler-o-corpo.ts`) e do
 * esquema (`esquema-do-corpo.ts`), e os testes do «sim» antigo.
 */
export const FIM_DO_SIM_ANTIGO = Date.parse("2026-11-19T00:00:00Z");

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
  pedidoId: string,
  missingImages: number,
  confirmadas: number | true | null,
  agora: number,
): Passo {
  if (fotosEmFaltaAceites(missingImages, confirmadas, agora)) return SEGUE;
  log.warn("proposta-doc: envio parado para confirmar as fotos em falta", {
    id: pedidoId,
    emFalta: missingImages,
  });
  return paraComRecusa(409, {
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
  pedidoId: string,
  truncations: Truncagens,
  confirmados: boolean,
): Passo {
  if (truncations.length === 0 || confirmados) return SEGUE;
  log.warn("proposta-doc: envio parado para confirmar o que ficou cortado", {
    id: pedidoId,
    cortado: truncations.map((t) => `${t.where}: -${t.dropped} ${t.unit}`),
  });
  return paraComRecusa(409, {
    error: "O documento sai com conteúdo cortado.",
    // O nome do campo é a pergunta: quem chama esta rota à mão percebe o
    // que lhe falta sem ter de ler o código.
    precisaConfirmarCortes: true,
    truncations,
  });
}

/**
 * Só depois das duas respostas é «segue com fotos a menos»: antes delas, o
 * envio ainda podia parar (revisão de 17/11). Fica registado que foi ela que
 * confirmou.
 */
export function avisarQueSegueComFotosAMenos(pedidoId: string, missingImages: number): void {
  if (missingImages <= 0) return;
  log.warn("proposta-doc: a proposta segue com fotos a menos, confirmado por ela", {
    id: pedidoId,
    emFalta: missingImages,
  });
}
