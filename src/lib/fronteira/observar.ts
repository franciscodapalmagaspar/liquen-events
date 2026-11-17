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
 * pedido da lista de pedidos passa por aqui a cada leitura. Por isso cada
 * desvio diz-se uma vez por processo POR CASO (o `id` do contexto), até
 * {@link CASOS_POR_DESVIO} casos: a fase seguinte precisa de saber QUAIS
 * linhas não batem, não só que alguma não bate. Tudo com tecto de memória.
 */

/** Quantos desvios diferentes se lembram, por processo. */
const TECTO_DE_DESVIOS_LEMBRADOS = 500;
/** Quantos casos (ids) de um mesmo desvio se dizem, por processo. */
export const CASOS_POR_DESVIO = 20;
/** Desvio → os casos já ditos (`""` quando o contexto não tem id). */
const jaDitos = new Map<string, Set<string>>();

/** Diz se este caso deste desvio ainda não foi dito — e lembra-o. */
function aindaPorDizer(assinatura: string, caso: string): boolean {
  let casos = jaDitos.get(assinatura);
  if (!casos) {
    if (jaDitos.size >= TECTO_DE_DESVIOS_LEMBRADOS) jaDitos.clear();
    casos = new Set();
    jaDitos.set(assinatura, casos);
  }
  if (casos.has(caso) || casos.size >= CASOS_POR_DESVIO) return false;
  casos.add(caso);
  return true;
}

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
  // Os índices das listas saem da assinatura (`moodBoards.3.images.2` →
  // `moodBoards.*.images.*`): o mesmo defeito em fotos diferentes é UM desvio,
  // e não quinhentos a esgotar a memória. O registo leva o caminho a sério.
  const assinatura = `${onde}|${desvios
    .map((d) => `${d.campo.replace(/\.\d+(?=\.|$)/g, ".*")}:${d.problema}`)
    .join(",")}`;
  const caso = typeof contexto.id === "string" ? contexto.id : "";
  if (!aindaPorDizer(assinatura, caso)) return false;
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
