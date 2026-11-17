import "server-only";
import { z } from "zod";
import { esquemaDoDocumentoQueChega } from "@/lib/fronteira/documento-da-proposta";
import { observar } from "@/lib/fronteira/observar";
import { IDIOMAS_DA_PROPOSTA } from "@/lib/orcamento/listas-fechadas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ESQUEMA DO CORPO DO ESTÚDIO — SÓ PARA O REGISTO (fase 6, modo de observar)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Diz o que o estúdio manda HOJE, e serve para UMA coisa: dizer no registo o
 * que não bate ({@link observarOCorpo}). NÃO decide valores — quem lê o corpo
 * é `ler-o-corpo.ts`, com as tolerâncias de sempre escritas à mão. Os dois
 * estão separados de propósito: apertar uma regra aqui para ver o que aparece
 * no registo não pode mudar o que o envio faz. Quando o modo de observar
 * acabar, recusar decide-se campo a campo, numa guarda própria.
 *
 * O que os prende um ao outro é um teste (`esquema-do-corpo.test.ts`): tudo o
 * que este esquema aceita, a leitura lê tal e qual — senão o registo calava-se
 * sobre um valor que a leitura deita fora.
 */

/**
 * O corpo que o estúdio manda HOJE. Largo (`looseObject`): um campo a mais
 * não é um desvio.
 */
export const esquemaDoCorpo = z.looseObject({
  /** O que não se reconhece vale a pré-visualização — nunca um envio. */
  mode: z.enum(["preview", "send"]),
  doc: esquemaDoDocumentoQueChega,
  /** O que não se reconhece cai em português, e diz-se (`guardas-baratas.ts`). */
  idioma: z.enum(IDIOMAS_DA_PROPOSTA).optional(),
  /** A mensagem pessoal do passo «Enviar» — OPCIONAL A SÉRIO: vazia, só com
   *  espaços ou de um tipo que não é texto, o email sai como saía antes de
   *  esta caixa existir. Um envio nunca pára pela nota de acompanhamento. */
  mensagem: z.string().optional(),
  /** O corpo do email reescrito por quem envia (`email-da-proposta.ts`).
   *  Ausente em todos os pedidos anteriores a esta caixa existir. */
  corpo: z.string().optional(),
  /** A linha de assunto que o ecrã de envio mostrou. Só conta com `corpo`. */
  assunto: z.string().optional(),
  /** A chave do modelo de que o corpo partiu («registo-formal»), para a
   *  CÓPIA do envio. Não escolhe texto nenhum: o texto é o `corpo`. */
  modelo: z.string().optional(),
  /** «Já vi o que fica cortado, envia à mesma» (`perguntas-antes-do-envio.ts`).
   *  Só `true` conta: qualquer outra coisa é «ainda não respondeu». */
  cortesConfirmados: z.boolean().optional(),
  /** «Já sei que faltam N fotografias, envia à mesma». É o NÚMERO que ela viu:
   *  um PDF com mais em falta do que esse pergunta outra vez. */
  fotosEmFaltaConfirmadas: z.number().nonnegative().optional(),
  /**
   * ── POR ONDE É QUE A PROPOSTA SEGUE ────────────────────────────────
   *
   * «Quero que seja possível escolher enviar apenas para o email, apenas
   * para o WhatsApp, ou para os dois.» Só o EMAIL passa por aqui: o WhatsApp
   * abre-se no telemóvel dela. Por isso o servidor tem uma pergunta só:
   * **sai email?**
   *
   * Ausente ou qualquer coisa que não seja `false` significa SIM, e é
   * deliberado: os pedidos anteriores a esta escolha não trazem o campo, e
   * nenhum pode deixar de enviar por causa disso (`canal.test.ts`).
   */
  porEmail: z.boolean().optional(),
  /** Só na pré-visualização: o PDF sai marcado «RASCUNHO» (B1). */
  rascunho: z.boolean().optional(),
  /** Só no envio: a chave do PDF final visto e confirmado — a que a
   *  pré-visualização devolveu em `X-Chave-Do-Pdf`. */
  pdfVisto: z.string().optional(),
});

/** O sítio, tal como aparece no registo e na deduplicação. */
export const ONDE_O_CORPO_E_OBSERVADO = "o corpo do POST proposta-doc";

/**
 * Confere o corpo CRU contra o esquema, e diz o que não bate. Nunca recusa
 * nada. Quem decide QUANDO se chama é `guardas-baratas.ts`.
 */
export function observarOCorpo(cru: unknown, pedidoId: string): void {
  observar(esquemaDoCorpo, cru, ONDE_O_CORPO_E_OBSERVADO, { id: pedidoId });
}
