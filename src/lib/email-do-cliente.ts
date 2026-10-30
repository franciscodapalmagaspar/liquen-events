import "server-only";
import { dominioRecebeEmail } from "./dominio-do-email";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ANTES DE ENVIAR: O DOMÍNIO DO EMAIL RECEBE CORREIO?
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (30/10): «quero que o sistema detete e não deixe enviar emails que não
 * existem». A caixa (o que está antes do @) ficou de fora por decisão dela
 * («esquece isto»); o DOMÍNIO, que já se conferia no pedido completo do site,
 * passa a conferir-se também aqui, à porta de cada envio do back office — a
 * proposta, o estúdio, a mensagem, os modelos e o mapa de mesas.
 *
 * Porque à porta do envio, e não só ao gravar: há pedidos de antes desta
 * regra, e um pedido gravado com «gmial.con» seguia para o servidor de
 * correio, que o aceitava e o deixava morrer lá. Do lado dela, o ecrã dizia
 * «enviado». Recusar ANTES de gravar e de mandar é o que faz o ecrã dizer a
 * verdade: não foi nada, e porquê.
 *
 * A regra é a do `dominioRecebeEmail`: só recusa quando o DNS diz mesmo que
 * não; na dúvida (DNS lento ou em baixo) deixa seguir. E é assíncrona, por isso
 * vive aqui e não no `oQueFaltaParaEnviar` — que é síncrono, corre no browser
 * e continua a ser a única lista do que trava o envio por falta de conteúdo.
 */

/** O que está depois do @, em minúsculas («gmial.con»). */
export function dominioDoEmail(email: string): string {
  const e = (email ?? "").trim();
  return e.slice(e.lastIndexOf("@") + 1).toLowerCase();
}

/**
 * A frase que se mostra quando o domínio não recebe correio, ou `null` quando
 * pode seguir (incluindo quando não há email nenhum — isso é outra regra, de
 * cada rota).
 *
 * `quem`: «cliente» é o email do pedido, que se corrige no pedido; «para» é um
 * endereço escrito na hora (o mapa de mesas vai para a quinta, o catering…).
 */
export async function porqueOEmailNaoSegue(
  email: string | null | undefined,
  quem: "cliente" | "para" = "cliente",
): Promise<string | null> {
  const e = (email ?? "").trim();
  if (!e || e.lastIndexOf("@") < 1 || !dominioDoEmail(e)) return null;
  if (await dominioRecebeEmail(e)) return null;
  const dominio = dominioDoEmail(e);
  return quem === "cliente"
    ? `O email do cliente não parece existir (o domínio «${dominio}» não recebe email). Corrija-o no pedido antes de enviar.`
    : `O email «${e}» não parece existir (o domínio «${dominio}» não recebe email). Confira-o antes de enviar.`;
}
