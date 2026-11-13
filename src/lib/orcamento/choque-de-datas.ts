import type { Quote, QuoteStatus } from "./types";
import { kmPorEstrada, localizar } from "@/lib/geo/portugal";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUAS COISAS NO MESMO DIA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nos dados de hoje há dois pedidos para 18 de setembro de 2027. Isso não é um
 * erro — é o que acontece quando se recebem pedidos durante meses para datas a
 * dois anos. O erro seria descobri-lo depois de a segunda proposta seguir.
 *
 * Este módulo não decide nada. Diz o que já está marcado naquele dia, e nos
 * dias colados a ele, e a que distância fica. A decisão é dela: dois eventos a
 * 20 km podem fazer-se com a mesma equipa; a 300 km não podem, e é melhor
 * sabê-lo antes de escrever a proposta do que na véspera.
 *
 * ── PORQUE OS DIAS COLADOS CONTAM ──────────────────────────────────────────
 * Um casamento não é um dia, são três: monta-se na véspera, faz-se no dia,
 * desmonta-se no seguinte. Um evento no sábado e outro no domingo partilham a
 * madrugada de desmontagem de um com a montagem do outro. Por isso o aviso
 * cobre a véspera e o dia seguinte, sempre dizendo qual dos três é.
 *
 * ── O QUE CONTA COMO "OCUPADO" ─────────────────────────────────────────────
 * Só o que representa compromisso: proposta ENVIADA (`cotado`) ou negócio
 * GANHO (`aceite`). Um pedido novo que ainda ninguém respondeu não ocupa dia
 * nenhum — se ocupasse, dois pedidos para a mesma data avisavam-se um ao outro
 * e o aviso passava a aparecer sempre, que é a maneira de deixar de ser lido.
 */

/** Estados que representam um dia comprometido. */
const OCUPAM: QuoteStatus[] = ["cotado", "aceite"];

/**
 * Este pedido ocupa os seus dias? A mesma regra serve o aviso de data ocupada e
 * a exportação do calendário (.ics): um pedido perdido, arquivado ou ainda por
 * responder não pode aparecer como «ocupado» no calendário do telemóvel dela.
 */
export function ocupaOsDias(q: Pick<Quote, "status" | "archived">): boolean {
  return !q.archived && OCUPAM.includes(q.status);
}

export type Proximidade = "mesmo-dia" | "vespera" | "dia-seguinte";

export interface Choque {
  /** O outro evento. */
  outro: Quote;
  proximidade: Proximidade;
  /** Distância por estrada entre os dois locais, quando dá para a saber. */
  km: number | null;
  /**
   * A distância foi calculada sobre uma REGIÃO ("Alentejo") e não sobre uma
   * terra? Então é uma ordem de grandeza, e o ecrã tem de o dizer.
   */
  aproximado: boolean;
}

/** Soma dias a uma data "yyyy-mm-dd", devolvendo no mesmo formato. */
function maisDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** "2027-09-18" e nada mais — o campo aceita texto ("a definir"). */
function ehData(v: string | undefined | null): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * Os dias que este pedido ocupa: a data, e a data de fim se for de vários dias.
 * Um evento de sexta a domingo choca com tudo o que lá caia pelo meio.
 */
function diasOcupados(q: Quote): string[] {
  if (!ehData(q.date)) return [];
  if (!ehData(q.endDate) || q.endDate <= q.date) return [q.date];
  const dias: string[] = [];
  // Um limite de sanidade: um "evento" de mais de trinta dias é um engano de
  // escrita, e percorrê-lo dia a dia seria dar-lhe crédito.
  for (let d = q.date, i = 0; d <= q.endDate && i < 30; d = maisDias(d, 1), i += 1) dias.push(d);
  return dias;
}

/**
 * O que já está marcado à volta da data deste pedido.
 *
 * Devolve por ordem de gravidade: primeiro o mesmo dia, depois a véspera e o
 * dia seguinte. Dentro de cada grupo, o mais longe primeiro — porque é o mais
 * difícil de conciliar, e é esse que ela precisa de ver.
 */
export function choquesDeData(alvo: Quote, todos: Quote[]): Choque[] {
  const diasDoAlvo = diasOcupados(alvo);
  if (diasDoAlvo.length === 0) return [];

  const vesperas = new Set(diasDoAlvo.map((d) => maisDias(d, -1)));
  const seguintes = new Set(diasDoAlvo.map((d) => maisDias(d, 1)));
  const proprios = new Set(diasDoAlvo);

  const daquiL = localizar(alvo.location);

  const achados: Choque[] = [];
  for (const outro of todos) {
    if (outro.id === alvo.id) continue;
    if (!ocupaOsDias(outro)) continue;

    const diasDoOutro = diasOcupados(outro);
    if (diasDoOutro.length === 0) continue;

    let proximidade: Proximidade | null = null;
    if (diasDoOutro.some((d) => proprios.has(d))) proximidade = "mesmo-dia";
    else if (diasDoOutro.some((d) => vesperas.has(d))) proximidade = "vespera";
    else if (diasDoOutro.some((d) => seguintes.has(d))) proximidade = "dia-seguinte";
    if (!proximidade) continue;

    const laL = localizar(outro.location);
    const km = daquiL && laL ? kmPorEstrada(daquiL.lugar, laL.lugar) : null;

    achados.push({
      outro,
      proximidade,
      km,
      aproximado: Boolean(daquiL?.aproximado || laL?.aproximado),
    });
  }

  const peso: Record<Proximidade, number> = { "mesmo-dia": 0, vespera: 1, "dia-seguinte": 2 };
  return achados.sort((a, b) => {
    if (peso[a.proximidade] !== peso[b.proximidade])
      return peso[a.proximidade] - peso[b.proximidade];
    // Distância desconhecida ordena-se como longe: é o caso que exige olhar.
    const ka = a.km ?? Number.POSITIVE_INFINITY;
    const kb = b.km ?? Number.POSITIVE_INFINITY;
    return kb - ka;
  });
}

/**
 * Dá para fazer os dois? Uma leitura da distância, não uma regra.
 *
 * Os cortes vêm do que uma equipa com carrinha consegue mesmo: até 60 km é a
 * mesma manhã; até 150 dá com folga e madrugada; acima disso são duas equipas
 * ou duas viagens, e no mesmo dia isso quer dizer que não dá.
 */
export function gravidade(c: Choque): "aviso" | "grave" {
  if (c.proximidade !== "mesmo-dia") return c.km !== null && c.km <= 150 ? "aviso" : "grave";
  if (c.km === null) return "grave";
  return c.km <= 60 ? "aviso" : "grave";
}
