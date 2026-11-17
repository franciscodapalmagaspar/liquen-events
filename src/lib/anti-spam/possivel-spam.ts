import type { MotivoDeSpam } from "./conteudo";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A MARCA «POSSÍVEL SPAM» — O QUE FICA NO PEDIDO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Decisão de 17/11, depois de uma revisão independente achar pedidos
 * verdadeiros deitados fora com sucesso fingido: só o isco (o campo escondido
 * `website`) descarta. Tudo o resto — o filtro de conteúdo e o envio feito em
 * menos de 3 s — grava o pedido na mesma, com esta marca. A Catarina vê-o na
 * lista como os outros, com uma etiqueta discreta, e decide ela.
 *
 * Vive à parte do `veredito.ts` (que é só do servidor) porque o back office
 * também a lê: o tipo do pedido (`Quote.possivelSpam`) e a etiqueta.
 */

/** Porque é que o pedido levou a marca. */
export type MotivoDePossivelSpam = MotivoDeSpam | "depressa";

export interface PossivelSpam {
  motivo: MotivoDePossivelSpam;
}

const EXPLICACAO: Record<MotivoDePossivelSpam, string> = {
  ligacoes: "muitas ligações a sítios desconhecidos",
  "dominio-de-spam": "ligações a domínios usados quase só por spam",
  "palavras-de-spam": "palavras típicas de spam",
  alfabeto: "mensagem longa noutro alfabeto, com ligações ou palavras suspeitas",
  "ligacao-no-nome": "uma ligação no lugar do nome",
  depressa: "enviado menos de 3 segundos depois de abrir o formulário",
};

/** A frase que explica a marca (no `title` da etiqueta e no e-mail à equipa). */
export function explicarPossivelSpam(marca: PossivelSpam): string {
  return EXPLICACAO[marca.motivo] ?? "sinais de envio automático";
}

/** Lê a marca de um pedido gravado, sem confiar na forma (vem de um jsonb). */
export function lerPossivelSpam(valor: unknown): PossivelSpam | null {
  if (!valor || typeof valor !== "object") return null;
  const motivo = (valor as { motivo?: unknown }).motivo;
  return typeof motivo === "string" && Object.hasOwn(EXPLICACAO, motivo)
    ? { motivo: motivo as MotivoDePossivelSpam }
    : null;
}
