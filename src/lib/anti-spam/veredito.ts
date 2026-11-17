import "server-only";
import { motivoDeSpam, type MotivoDeSpam, type TextoDoPedido } from "./conteudo";
import { lerSelo, type LeituraDoSelo } from "./selo";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O VEREDITO DO ANTI-SPAM — AS TRÊS CAMADAS JUNTAS, NUM SÍTIO SÓ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `docs/LEGAL-FORMULARIO.md`, ponto 4 (o mesmo filtro da Palumen), sem
 * captcha e sem nada que a pessoa veja:
 *
 *   1. o isco — o campo escondido `website` (já existia nos três formulários
 *      e na rota; a rota continua a vê-lo ANTES de ler o pedido);
 *   2. a armadilha de tempo — o selo HMAC (`selo.ts`);
 *   3. o filtro de conteúdo (`conteudo.ts`).
 *
 * Quando é spam, a rota FINGE sucesso: a resposta é igual à de um envio
 * verdadeiro, mas nada se grava e nada se envia — o robô não aprende o que o
 * apanhou. O motivo só vai para o registo.
 *
 * O limite por ligação (5 por minuto por IP, no Upstash) já existia antes
 * disto e não mudou (`/api/orcamento`, o `rateLimit` global, no Upstash).
 */

export type MotivoDoVeredito = MotivoDeSpam | "selo-invalido" | "depressa";

export interface Veredito {
  spam: boolean;
  motivo: MotivoDoVeredito | null;
  /** O que o selo disse — vai para o registo, também quando passa. */
  selo: LeituraDoSelo["estado"];
}

export function vereditoDoPedido(
  { selo, texto }: { selo: unknown; texto: TextoDoPedido },
  agora = Date.now(),
): Veredito {
  const leitura = lerSelo(selo, agora);
  if (leitura.estado === "invalido")
    return { spam: true, motivo: "selo-invalido", selo: leitura.estado };
  if (leitura.estado === "depressa")
    return { spam: true, motivo: "depressa", selo: leitura.estado };
  // «sem-selo» e «sem-segredo» passam a esta camada: ver o cabeçalho de `selo.ts`.
  const motivo = motivoDeSpam(texto);
  return { spam: motivo !== null, motivo, selo: leitura.estado };
}
