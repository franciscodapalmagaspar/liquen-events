import "server-only";
import { aquecerDerivadasDaCapa } from "@/lib/derivadas";

/**
 * Etapa 12 do envio, em duas metades (`docs/ESTRUTURA-DO-CODIGO.md`, fase 5):
 * o que o casal vai abrir fica pronto antes de ele chegar.
 *
 * ── A CAPA FABRICADA ENQUANTO O CORREIO SAI ──────────────────────────────
 *
 * «Esta foto demora imenso tempo a carregar.» A derivada de 1200 px da capa
 * era fabricada pela primeira visita — que numa proposta acabada de enviar é
 * a do casal a abrir o email, com um `sharp` a acontecer enquanto eles olham
 * para um rectângulo vazio.
 *
 * Começa ANTES do `sendMail` e espera-se DEPOIS: corre em paralelo com a ida
 * ao servidor de correio, portanto não acrescenta praticamente nada ao envio.
 * Nunca rejeita (o `.catch` vive aqui, e é obrigatório: entre o começo e o
 * `await` há outros `await`, e uma promessa rejeitada sem tratamento nesse
 * intervalo derrubaria o processo). Tem tecto próprio: se passou dele, fica
 * para a visita, como era antes.
 */
export function comecarAAquecerACapa(coverImages: readonly string[] | undefined): Promise<void> {
  return aquecerDerivadasDaCapa(coverImages ?? []).then(
    () => undefined,
    () => undefined,
  );
}

/**
 * A proposta online fica pronta já, DEPOIS da resposta: o primeiro clique do
 * casal no email não espera pelo motor (`proposta-web/guardado.ts`).
 */
export function prepararAPaginaOnline(
  propostaId: string,
  depoisDaResposta: (nome: string, trabalho: () => Promise<void>) => void,
): void {
  depoisDaResposta("a página online não ficou preparada", async () => {
    const { aquecerPropostaWeb } = await import("@/lib/proposta-web/modelo");
    await aquecerPropostaWeb(propostaId);
  });
}
