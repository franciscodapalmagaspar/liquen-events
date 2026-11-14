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
  // Sem novas tentativas: o prazo é um só para a importação inteira
  // (`PRAZO_MS`, em `perceber.ts`), e uma repetição gastava-o a meio.
  const client = new Anthropic({ maxRetries: 0 });
  return async (pedido, { signal }) => {
    // Streaming (uma resposta longa sem stream bate no tempo do pedido), e o
    // sinal corta a LEITURA do stream também — o `timeout` do SDK não a cobre.
    const stream = client.beta.messages.stream(pedido, { signal });
    const final = await stream.finalMessage();
    return final as unknown as RespostaDoModelo;
  };
}
