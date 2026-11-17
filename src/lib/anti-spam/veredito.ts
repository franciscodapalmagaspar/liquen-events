import "server-only";
import { motivoDeSpam, type TextoDoPedido } from "./conteudo";
import type { PossivelSpam } from "./possivel-spam";
import { lerSelo, type LeituraDoSelo } from "./selo";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O VEREDITO DO ANTI-SPAM — AS CAMADAS JUNTAS, NUM SÍTIO SÓ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `docs/LEGAL-FORMULARIO.md`, ponto 4 (o mesmo filtro da Palumen), sem
 * captcha e sem nada que a pessoa veja:
 *
 *   1. o isco — o campo escondido `website`. É a ÚNICA camada que descarta
 *      (sucesso fingido, nada se grava), e a rota vê-o antes de ler o pedido;
 *   2. a armadilha de tempo — o selo HMAC (`selo.ts`);
 *   3. o filtro de conteúdo (`conteudo.ts`).
 *
 * ── AS CAMADAS 2 E 3 NUNCA DEITAM UM PEDIDO FORA (decisão de 17/11) ───────
 * O documento manda fingir sucesso também aqui. Uma revisão independente
 * achou pedidos VERDADEIROS perdidos assim — o cliente lia «enviado» e a
 * Catarina nunca recebia nada. Por isso este veredito não sabe dizer
 * «descarta»: devolve só a marca «possível spam» (`possivel-spam.ts`). O
 * pedido grava-se, a equipa é avisada com «[possível spam]» no assunto, e o
 * cliente recebe a confirmação de sempre (se for um robô, vai para um endereço
 * falso; se for uma pessoa, chega-lhe).
 *
 *   · um selo `invalido` conta como `sem-selo`: rodar o `SESSION_SECRET`
 *     invalida os selos das páginas abertas, e isso não pode perder pedidos;
 *   · um `depressa` marca. Os formulários esperam pelos 3 s antes de enviar
 *     (`useSeloDoFormulario`), portanto a uma pessoa não devia acontecer.
 *
 * O limite por ligação (5 por minuto por IP, no Upstash) já existia antes
 * disto e não mudou.
 */

export interface Veredito {
  /** `null` = sem sinais. Senão, a marca que se grava no pedido. */
  possivelSpam: PossivelSpam | null;
  /** O que o selo disse — vai para o registo, também quando passa. */
  selo: LeituraDoSelo["estado"];
}

export function vereditoDoPedido(
  { selo, texto }: { selo: unknown; texto: TextoDoPedido },
  agora = Date.now(),
): Veredito {
  const leitura = lerSelo(selo, agora);
  const motivo = motivoDeSpam(texto) ?? (leitura.estado === "depressa" ? "depressa" : null);
  return { possivelSpam: motivo ? { motivo } : null, selo: leitura.estado };
}
