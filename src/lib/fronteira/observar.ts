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
 * ── O QUE UM ESQUEMA DESTES DESCREVE (a mesma regra em todos) ──────────────
 *
 * O que os ecrãs mandam HOJE — com os vazios e os `null` que eles mandam de
 * facto (um «Anular» que repõe `null`, um `""` que limpa um campo). NÃO
 * descreve tudo o que a rota tolera: um valor tolerado que nenhum ecrã manda é
 * exactamente o que o registo deve mostrar (um cliente avariado, um separador
 * antigo). Por isso passar a RECUSAR nunca é trocar a leitura por um
 * `.parse` às cegas: decide-se campo a campo, e as tolerâncias escritas como
 * decisões ficam (a língua estranha cai em português, o modo desconhecido é a
 * pré-visualização — `orcamento/envio/ler-o-corpo.ts`).
 *
 * ── O QUE CUSTA ──────────────────────────────────────────────────────────
 *
 * Conferir é processador, e a regra 7 manda medi-lo: `custo.bench.ts`, nesta
 * pasta (`npx vitest bench src/lib/fronteira`), e os números em
 * `docs/ESTRUTURA-DO-CODIGO.md`, Parte −1, fase 6. E um desvio repetido não pode encher o registo — cada
 * pedido da lista de pedidos passa por aqui a cada leitura. Por isso cada
 * desvio diz-se uma vez por processo POR CASO (o `id` do contexto), até
 * {@link CASOS_POR_DESVIO} casos (mais do que os 46 pedidos da base, a 17/11): a
 * fase seguinte precisa de saber QUAIS
 * linhas não batem, não só que alguma não bate. Tudo com tecto de memória.
 */

/** Quantos desvios diferentes se lembram, por processo. */
const TECTO_DE_DESVIOS_LEMBRADOS = 500;
/** Quantos casos (ids) de um mesmo desvio se dizem, por processo. */
export const CASOS_POR_DESVIO = 64;
/** O que se lembra de um desvio: os casos já ditos (`""` quando o contexto
 *  não tem id), e se já se disse que passou do tecto. */
interface Lembrado {
  casos: Set<string>;
  passouDoTecto: boolean;
}
/** Desvio → o que se lembra dele, do menos para o mais recentemente visto. */
const jaDitos = new Map<string, Lembrado>();

/**
 * O que fazer com este caso deste desvio — e lembra-o:
 *  · `dizer`, a primeira vez que o caso aparece (até {@link CASOS_POR_DESVIO});
 *  · `resumir`, UMA vez, no primeiro caso novo depois do tecto: uma linha diz
 *    que o desvio continua noutros casos, que já não se dizem um a um — o
 *    registo nunca finge que o desvio parou;
 *  · `calar`, no resto.
 * No tecto de desvios lembrados esquece-se o que não se vê há mais tempo
 * (cada visita põe o desvio no fim da fila), nunca todos.
 */
function oQueFazer(assinatura: string, caso: string): "dizer" | "resumir" | "calar" {
  let lembrado = jaDitos.get(assinatura);
  if (lembrado) {
    jaDitos.delete(assinatura);
  } else {
    if (jaDitos.size >= TECTO_DE_DESVIOS_LEMBRADOS) {
      const menosVisto = jaDitos.keys().next().value;
      if (menosVisto !== undefined) jaDitos.delete(menosVisto);
    }
    lembrado = { casos: new Set(), passouDoTecto: false };
  }
  jaDitos.set(assinatura, lembrado);
  if (lembrado.casos.has(caso)) return "calar";
  if (lembrado.casos.size < CASOS_POR_DESVIO) {
    lembrado.casos.add(caso);
    return "dizer";
  }
  if (lembrado.passouDoTecto) return "calar";
  lembrado.passouDoTecto = true;
  return "resumir";
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
  // `moodBoards.*.images.*`), e as repetições também: o mesmo defeito em uma,
  // duas ou dez fotos diferentes é UM desvio,
  // e não quinhentos a esgotar a memória. O registo leva o caminho a sério.
  const normalizados = new Set(
    desvios.map((d) => `${d.campo.replace(/\.\d+(?=\.|$)/g, ".*")}:${d.problema}`),
  );
  const assinatura = `${onde}|${[...normalizados].sort().join(",")}`;
  const caso = typeof contexto.id === "string" ? contexto.id : "";
  const fazer = oQueFazer(assinatura, caso);
  if (fazer === "calar") return false;
  if (fazer === "resumir") {
    log.warn(
      `fronteira: ${onde} — o mesmo desvio em mais de ${CASOS_POR_DESVIO} casos; os seguintes já não se dizem um a um`,
      { desvios },
    );
    return false;
  }
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
