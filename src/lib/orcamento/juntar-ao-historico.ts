import type { Quote } from "./types";

type Historico = NonNullable<Quote["activityLog"]>;

/** Quantas linhas o histórico de um pedido guarda (as mais recentes). */
export const HISTORICO_MAXIMO = 5000;

/**
 * Junta linhas novas ao histórico de um pedido — UMA vez cada.
 *
 * O «Guardar» do painel repete o PATCH quando a resposta não chega (rede lenta,
 * o tecto de tempo): o servidor pode já o ter aplicado, e a repetição trazia as
 * mesmas linhas outra vez. Cada linha tem um `id`; uma que já lá está não entra
 * de novo (revisão de 17/11). As linhas sem `id` (de clientes antigos) entram
 * sempre, como antes.
 */
export function juntarAoHistorico(actual: Historico | undefined, novas: Historico): Historico {
  const jaLa = new Set((actual ?? []).map((e) => e.id).filter(Boolean));
  const entram = novas.filter((e) => !e.id || !jaLa.has(e.id));
  return [...(actual ?? []), ...entram].slice(-HISTORICO_MAXIMO);
}
