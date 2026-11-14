import "server-only";
import { gravarEstadoSeNaoMudou, lerEstadoComVersao } from "@/lib/app-state";
import { hojeNoEstudio } from "@/lib/fuso";
import { round2 } from "@/lib/money";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TRAVÃO: POUCAS LEITURAS COM IA, E POUCOS DÓLARES, POR MÊS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Regra de custo (`.claude/rules/custo.md`): o Francisco não quer pagar nada
 * fora do plano, e «todo o recurso pago por uso tem de ter, no código, um
 * travão». Há DOIS tectos, na mesma linha do `app_state`
 * (`importar-com-ia:AAAA-MM`, no fuso do estúdio):
 *
 *  · {@link MAX_IMPORTACOES_COM_IA_POR_MES} importações;
 *  · {@link MAX_DOLARES_POR_MES} dólares — o que manda de verdade.
 *
 * ── RESERVAR O PIOR CASO, ACERTAR DEPOIS ────────────────────────────────────
 *
 * Antes de chamar reserva-se o MÁXIMO que aquela importação pode custar
 * (`custoMaximoEmDolares`: cada parte com a entrada toda e o `max_tokens`
 * inteiro, a preço de cima). Depois de a resposta chegar, acerta-se para o
 * custo real (`acertarImportacaoComIa`). Se a resposta nunca chegar (prazo,
 * rede), a reserva FICA: não se sabe quanto se gastou, e o travão erra para o
 * lado de gastar menos.
 *
 * O pior caso do mês é, portanto, o tecto em dólares: 5 $ — nunca mais. Uma
 * proposta típica custa ~0,25 $ (e reserva entre 0,4 e 0,9 $); com 5 $
 * fazem-se ~15–20 por mês, e as 30 importações só chegam se forem pequenas.
 *
 * A escrita é condicional (versão): dois pedidos ao mesmo tempo não passam os
 * dois com o último lugar. Uma linha que não se lê — ou que não tem a forma
 * `{ usadas: número, dolares: número }` — trava: sem saber o que já se gastou,
 * o travão não trava.
 */
export const MAX_IMPORTACOES_COM_IA_POR_MES = 30;
export const MAX_DOLARES_POR_MES = 5;

export function chaveDoMes(agora = new Date()): string {
  return `importar-com-ia:${hojeNoEstudio(agora).slice(0, 7)}`;
}

interface Linha {
  usadas: number;
  dolares: number;
}

/** A linha do mês, ou `null` se tem uma forma que não se lê. */
function lerLinha(valor: unknown): Linha | null {
  if (valor === null || valor === undefined) return { usadas: 0, dolares: 0 };
  if (typeof valor !== "object" || Array.isArray(valor)) return null;
  const { usadas, dolares } = valor as Record<string, unknown>;
  if (typeof usadas !== "number" || !Number.isFinite(usadas) || usadas < 0) return null;
  if (typeof dolares !== "number" || !Number.isFinite(dolares) || dolares < 0) return null;
  return { usadas, dolares };
}

export type Reserva =
  | { ok: true; usadas: number; maximo: number; dolares: number; maxDolares: number }
  | {
      ok: false;
      motivo: "tecto" | "dolares" | "sem-contador";
      usadas: number | null;
      maximo: number;
      dolares: number | null;
      maxDolares: number;
    };

export async function reservarImportacaoComIa(
  custoMaximo: number,
  agora = new Date(),
  maximo = MAX_IMPORTACOES_COM_IA_POR_MES,
  maxDolares = MAX_DOLARES_POR_MES,
): Promise<Reserva> {
  const chave = chaveDoMes(agora);
  const semContador = (usadas: number | null = null, dolares: number | null = null): Reserva => ({
    ok: false,
    motivo: "sem-contador",
    usadas,
    maximo,
    dolares,
    maxDolares,
  });
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    let lido: { valor: unknown; versao: string | null };
    try {
      lido = await lerEstadoComVersao<unknown>(chave, 3000);
    } catch {
      return semContador();
    }
    const l = lerLinha(lido.valor);
    if (!l) return semContador();
    if (l.usadas >= maximo) {
      return {
        ok: false,
        motivo: "tecto",
        usadas: l.usadas,
        maximo,
        dolares: l.dolares,
        maxDolares,
      };
    }
    if (round2(l.dolares + custoMaximo) > maxDolares) {
      return {
        ok: false,
        motivo: "dolares",
        usadas: l.usadas,
        maximo,
        dolares: l.dolares,
        maxDolares,
      };
    }
    const nova: Linha = { usadas: l.usadas + 1, dolares: round2(l.dolares + custoMaximo) };
    const r = await gravarEstadoSeNaoMudou(chave, nova, lido.versao);
    if (r === "gravado") return { ok: true, ...nova, maximo, maxDolares };
    if (r === "falhou") return semContador(l.usadas, l.dolares);
  }
  return semContador();
}

/** Troca a reserva pelo custo real. Se não conseguir, a reserva fica (gasta-se menos, nunca mais). */
export async function acertarImportacaoComIa(
  reservado: number,
  real: number,
  agora = new Date(),
): Promise<boolean> {
  const chave = chaveDoMes(agora);
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    let lido: { valor: unknown; versao: string | null };
    try {
      lido = await lerEstadoComVersao<unknown>(chave, 3000);
    } catch {
      return false;
    }
    const l = lerLinha(lido.valor);
    if (!l) return false;
    const nova: Linha = {
      usadas: l.usadas,
      dolares: Math.max(0, round2(l.dolares - reservado + real)),
    };
    const r = await gravarEstadoSeNaoMudou(chave, nova, lido.versao);
    if (r === "gravado") return true;
    if (r === "falhou") return false;
  }
  return false;
}
