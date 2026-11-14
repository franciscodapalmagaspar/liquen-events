import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ChamarModelo, RespostaDoModelo } from "./perceber";

/**
 * O cliente verdadeiro da API — DORMENTE sem chave.
 *
 * A regra de custo (`.claude/rules/custo.md`): a IA só se paga dentro do que
 * vem no plano dele; uma chave de API, se um dia existir, tem tecto de gasto
 * na consola, e o código funciona sem ela. Sem `ANTHROPIC_API_KEY`, isto
 * devolve `null` e o importador segue pelas regras (ou pelo JSON que ela
 * carrega, de custo zero). A chave nunca se lê para mais nada, nem se regista.
 */
export function chamarModeloSeHouverChave(): ChamarModelo | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  // Uma tentativa a mais nos erros passageiros; nada de ficar a repetir.
  const client = new Anthropic({ maxRetries: 1, timeout: 280_000 });
  return async (pedido) => {
    // Streaming: uma resposta longa sem stream bate no tempo máximo do pedido.
    const stream = client.beta.messages.stream(pedido);
    const final = await stream.finalMessage();
    return final as unknown as RespostaDoModelo;
  };
}
