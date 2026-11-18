/**
 * A FORMA de um endereço de email — uma regra só, para a trava do envio
 * (`oQueFaltaParaEnviar`), o estúdio (`ProposalStudio`), o aviso do
 * destinatário (`destinatario-do-envio.ts`), quem manda o email da proposta
 * (`orcamento/envio/mandar-o-email.ts`) e as rotas da mensagem e do modelo. Se
 * discordassem, o envio passava a trava e só depois de gravado se ouvia «o
 * pedido não tem um email válido».
 *
 * O endereço lê-se tal como está gravado, sem aparar: o `destinatario-do-envio`
 * apara antes de perguntar, os outros não (é assim desde antes desta regra, e
 * esta fase não muda respostas — `docs/ESTRUTURA-DO-CODIGO.md`, desvio 11).
 *
 * Só a forma (algo@algo.algo, sem espaços): se o domínio recebe correio é
 * outra pergunta, assíncrona (`email-do-cliente.ts`). Sem servidor — o browser
 * também a lê.
 */
const FORMA_DE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function pareceEmail(v: unknown): v is string {
  return typeof v === "string" && FORMA_DE_EMAIL.test(v);
}
