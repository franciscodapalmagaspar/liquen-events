/**
 * ════════════════════════════════════════════════════════════════════════════
 * PARA ONDE SEGUE A PROPOSTA — DITO NA PERGUNTA DO ENVIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A pergunta antes do envio dizia sempre «Enviar para <email>?», fosse qual
 * fosse o canal escolhido (auditoria de 14/11, n.º 3). Com «WhatsApp» não sai
 * email nenhum — e a última frase que ela lê antes do gesto mais irreversível
 * da casa estava a falar de outro caminho e de outro contacto.
 *
 * Isto devolve os pedaços da frase, com o contacto marcado para se escrever a
 * carregado. Puro, para se poder provar sem desenhar o estúdio.
 */
export type CanalDoEnvio = "email" | "whatsapp" | "ambos";

export interface PedacoDoDestino {
  texto: string;
  /** O contacto (email ou telefone): sai a carregado. */
  contacto?: boolean;
}

export function destinoDoEnvio(
  canal: CanalDoEnvio,
  email: string | null | undefined,
  telefone: string | null | undefined,
): PedacoDoDestino[] {
  const mail = (email ?? "").trim();
  const tel = (telefone ?? "").trim();
  const porEmail: PedacoDoDestino[] = [
    { texto: "por email para " },
    mail ? { texto: mail, contacto: true } : { texto: "o cliente" },
  ];
  // Pelo WhatsApp é ela quem escolhe a conversa (ver «O QUE CADA ESCOLHA FAZ»
  // no estúdio): o telefone do pedido é o que se mostra para ela conferir.
  const porWhatsApp: PedacoDoDestino[] = [
    { texto: "por WhatsApp para " },
    tel ? { texto: tel, contacto: true } : { texto: "o cliente (o pedido não tem telefone)" },
  ];
  const corpo =
    canal === "email"
      ? porEmail
      : canal === "whatsapp"
        ? porWhatsApp
        : [...porEmail, { texto: " e " }, ...porWhatsApp];
  return [{ texto: "Enviar " }, ...corpo];
}
