import "server-only";
import type { z } from "zod";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FRONTEIRA EM MODO DE OBSERVAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `docs/ESTRUTURA-DO-CODIGO.md`, §1.7 e fases 5 e 6: o que entra (o corpo de
 * um pedido, uma linha da base) passa a ter um esquema. Mas há pedidos com
 * meses, gravados por versões do estúdio que já não existem, e um esquema que
 * recusasse o que hoje funciona partia exactamente o que ela usa todos os dias.
 *
 * Por isso o primeiro passo é OLHAR: o esquema confere, e o que não bate fica
 * no registo — o sítio e o tipo do desvio, nunca o valor (são nomes, emails e
 * moradas de clientes). Os dados seguem tal e qual, como seguiam. Só depois de
 * uma semana sem registos é que um esquema passa a recusar (fase 5, «Prova»).
 *
 * ── O QUE CUSTA ──────────────────────────────────────────────────────────
 *
 * Conferir é processador, e a regra 7 manda medi-lo: ver o teste de custo em
 * `observar.test.ts`. E um desvio repetido não pode encher o registo — cada
 * pedido da lista de pedidos passa por aqui a cada leitura —, por isso cada
 * desvio diferente diz-se UMA vez por processo, com um tecto de memória.
 */

/** Quantos desvios diferentes se lembram, por processo. */
const TECTO_DE_DESVIOS_LEMBRADOS = 500;
const jaDitos = new Set<string>();

/** Um desvio, sem o valor: o caminho do campo e o tipo do problema. */
export interface Desvio {
  campo: string;
  problema: string;
}

/** Os desvios de um `safeParse` falhado, prontos a registar. */
export function desviosDe(erro: z.ZodError): Desvio[] {
  return erro.issues.slice(0, 20).map((i) => ({
    campo: i.path.map(String).join(".") || "(raiz)",
    problema: i.code,
  }));
}

/**
 * Confere `valor` contra `esquema` e diz o que não bate, sem mudar nada.
 *
 * Devolve `true` quando bate. Quem chama continua a usar o valor ORIGINAL
 * (não o que o zod devolve): o esquema descarta o que não conhece, e um
 * campo novo que o esquema ainda não tenha não pode desaparecer pelo caminho.
 *
 * @param onde nome estável do sítio (entra na mensagem e na deduplicação)
 * @param contexto o que ajuda a encontrar o caso — um id, nunca dados pessoais
 */
export function observar(
  esquema: z.ZodType,
  valor: unknown,
  onde: string,
  contexto: Record<string, unknown> = {},
): boolean {
  const r = esquema.safeParse(valor);
  if (r.success) return true;
  const desvios = desviosDe(r.error);
  const assinatura = `${onde}|${desvios.map((d) => `${d.campo}:${d.problema}`).join(",")}`;
  if (jaDitos.has(assinatura)) return false;
  if (jaDitos.size >= TECTO_DE_DESVIOS_LEMBRADOS) jaDitos.clear();
  jaDitos.add(assinatura);
  log.warn(`fronteira: ${onde} não bate com o esquema (modo de observar, segue tal e qual)`, {
    ...contexto,
    desvios,
  });
  return false;
}

/** Para os testes: esquece os desvios já ditos. */
export function __esquecerDesviosDitos(): void {
  jaDitos.clear();
}
