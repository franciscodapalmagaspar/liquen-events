import type { ProposalDoc } from "@/lib/proposal-doc";
import { precosDe } from "@/lib/proposal-budget";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE MUDA QUANDO OS 125 PASSAM A 140
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Metade das linhas de um orçamento de casamento não é um preço, é uma
 * multiplicação: os arranjos são por mesa, os menus e as cadeiras são por
 * pessoa, o arco é um. Quando o número de convidados mexe — e mexe sempre, às
 * vezes na véspera — refazer essas contas à mão é onde entra o erro que
 * ninguém vê, porque o resultado continua a parecer um preço.
 *
 * ── O TOTAL CONTINUA A SER O QUE JÁ ERA ────────────────────────────────────
 * A escala não cria um campo novo no PDF nem muda a forma do documento: o
 * resultado da multiplicação é escrito em `budgetAmounts[i]`, o MESMO sítio de
 * sempre. Tudo o que já lê preços — a soma, o desvio do total, a margem, o
 * resumo — continua a ler o mesmo, sem saber que aquele número foi calculado.
 *
 * Isso é deliberado: a alternativa era ensinar meia dúzia de módulos a
 * perguntar "isto é fixo ou por pessoa?", e cada um que se esquecesse passava a
 * somar mal em silêncio.
 *
 * ── A FÓRMULA APARECE ──────────────────────────────────────────────────────
 * "13 mesas × 45 €" ao lado do número. Um total que muda sozinho e não explica
 * porquê é um total em que se deixa de confiar à primeira surpresa.
 */

export type TipoDeEscala = "fixa" | "por-convidado" | "por-mesa";

export interface Escala {
  tipo: TipoDeEscala;
  /** O preço de cada pessoa ou de cada mesa. Ignorado quando é fixa. */
  unitario: number;
}

/** Quantas pessoas cabem numa mesa, quando ela não disser outra coisa. */
export const CONVIDADOS_POR_MESA_OMISSAO = 10;

/** As escalas, sempre com o mesmo comprimento que as linhas. */
export function escalasDe(
  doc: Pick<ProposalDoc, "budgetItems" | "budgetScales">,
): (Escala | null)[] {
  const n = doc.budgetItems?.length ?? 0;
  const guardadas = doc.budgetScales ?? [];
  return Array.from({ length: n }, (_, i) => {
    const e = guardadas[i];
    if (!e || typeof e !== "object") return null;
    const tipo = e.tipo;
    if (tipo !== "por-convidado" && tipo !== "por-mesa") return null;
    const unitario = typeof e.unitario === "number" && Number.isFinite(e.unitario) ? e.unitario : 0;
    return { tipo, unitario };
  });
}

/**
 * Quantas mesas são precisas para tanta gente.
 *
 * Arredonda para CIMA: onze pessoas com mesas de dez são duas mesas, e a
 * segunda leva arranjo na mesma. Arredondar para baixo era orçamentar um
 * casamento onde alguém fica de pé.
 */
export function mesasPara(convidados: number, porMesa = CONVIDADOS_POR_MESA_OMISSAO): number {
  const cabem = porMesa > 0 ? porMesa : CONVIDADOS_POR_MESA_OMISSAO;
  if (convidados <= 0) return 0;
  return Math.ceil(convidados / cabem);
}

/** Quantas unidades esta linha multiplica: pessoas, mesas, ou uma vez só. */
export function unidadesDe(escala: Escala | null, convidados: number, porMesa: number): number {
  if (!escala) return 1;
  if (escala.tipo === "por-convidado") return Math.max(0, convidados);
  if (escala.tipo === "por-mesa") return mesasPara(convidados, porMesa);
  return 1;
}

/** O total de uma linha escalonável. `null` para as fixas — essas têm o preço
 *  escrito à mão e não se mexe nele. */
export function totalDaLinha(
  escala: Escala | null,
  convidados: number,
  porMesa: number,
): number | null {
  if (!escala) return null;
  const unidades = unidadesDe(escala, convidados, porMesa);
  return Math.round(escala.unitario * unidades * 100) / 100;
}

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    useGrouping: "always",
    style: "currency",
    currency: "EUR",
  }).format(n || 0);

/** "13 mesas × 45 €", "125 pessoas × 12 €". Vazio para as linhas fixas. */
export function formulaDaLinha(escala: Escala | null, convidados: number, porMesa: number): string {
  if (!escala) return "";
  const unidades = unidadesDe(escala, convidados, porMesa);
  const nome =
    escala.tipo === "por-mesa"
      ? unidades === 1
        ? "mesa"
        : "mesas"
      : unidades === 1
        ? "pessoa"
        : "pessoas";
  return `${unidades} ${nome} × ${eur(escala.unitario)}`;
}

/**
 * Recalcula os preços das linhas escalonáveis para este número de convidados.
 *
 * As linhas FIXAS não são tocadas — nem sequer normalizadas —, porque o preço
 * delas é uma decisão escrita à mão e reescrevê-lo seria apagá-la.
 */
export function recalcular<
  T extends Pick<
    ProposalDoc,
    "budgetItems" | "budgetAmounts" | "budgetScales" | "convidadosPorMesa"
  >,
>(doc: T, convidados: number): T {
  const escalas = escalasDe(doc);
  if (escalas.every((e) => e === null)) return doc;

  const porMesa = doc.convidadosPorMesa ?? CONVIDADOS_POR_MESA_OMISSAO;
  const precos = precosDe(doc);
  return {
    ...doc,
    budgetAmounts: precos.map((p, i) => totalDaLinha(escalas[i], convidados, porMesa) ?? p),
  };
}

/** O número de convidados que se lê do documento ("125 pax" → 125). */
export function convidadosDoDoc(doc: Pick<ProposalDoc, "guests">): number {
  const m = /(\d[\d\s.]*)/.exec(doc.guests ?? "");
  if (!m) return 0;
  const n = Number(m[1].replace(/[\s.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
