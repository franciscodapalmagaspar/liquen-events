import type { Quote, QuoteStatus } from "./types";
import { BASE_OMISSAO, kmEntre, localizar } from "@/lib/geo/portugal";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HÁ QUANTO TEMPO ESTE PEDIDO ESPERA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A lista de pedidos mostrava-os todos iguais, com a mesma etiqueta "Novo", um
 * de ontem ao lado de um de há nove dias. Um casamento não se perde por se
 * responder mal — perde-se por não se responder, e "não se responder" não tem
 * aspeto nenhum num ecrã onde tudo é igual.
 *
 * ── O QUE CONTA COMO ESPERAR ───────────────────────────────────────────────
 * Só quem ainda não teve resposta: `pendente` e `em_revisao`. Um pedido com
 * proposta enviada não está à espera de nós, está à espera dele — e contar-lhe
 * os dias fazia a lista gritar por coisas que já estão feitas.
 *
 * `a_preparar` (6/11) conta como espera: a proposta começou no estúdio mas o
 * casal ainda não recebeu nada, e é precisamente a ele que os dias interessam.
 */

/** Estados em que a bola está do nosso lado. */
export const A_ESPERAR_RESPOSTA: QuoteStatus[] = ["pendente", "em_revisao", "a_preparar"];

/**
 * Dias desde que o pedido entrou, para quem ainda espera resposta.
 * `null` para os que já foram respondidos — esses não estão à espera de nada.
 */
export function diasDeEspera(q: Quote, hoje = new Date()): number | null {
  if (!A_ESPERAR_RESPOSTA.includes(q.status)) return null;
  const entrada = new Date(q.submittedAt).getTime();
  if (Number.isNaN(entrada)) return null;
  const dias = Math.floor((hoje.getTime() - entrada) / 86_400_000);
  return dias < 0 ? 0 : dias;
}

export type TomDeEspera = "calmo" | "aviso" | "urgente";

/**
 * A cor que a espera merece.
 *
 * Os cortes são os que ela pediu: até dois dias é uma resposta normal de quem
 * trabalha; de três a seis já se nota do outro lado; a partir de sete dias o
 * casal já pediu orçamento a mais alguém.
 */
export function tomDeEspera(dias: number): TomDeEspera {
  if (dias <= 2) return "calmo";
  if (dias <= 6) return "aviso";
  return "urgente";
}

/** "hoje", "há 1 dia", "há 4 dias" — sempre a mesma frase. */
export function esperaEmPalavras(dias: number): string {
  // «recebido hoje» e não «hoje»: no cartão do pedido esta pastilha fica ao
  // lado da contagem do evento, e um evento HOJE também diz «Hoje». Eram dois
  // «hoje» no mesmo cartão a dizer coisas diferentes.
  if (dias <= 0) return "recebido hoje";
  if (dias === 1) return "há 1 dia";
  return `há ${dias} dias`;
}

/**
 * Este pedido cheira a casamento à distância?
 *
 * O sinal é a combinação de duas ausências: não há data marcada E não há um
 * sítio reconhecível ("Portugal", em branco, ou um nome que a tabela de
 * geografia não conhece). Quem já escolheu a quinta escreve o nome da quinta;
 * quem está a organizar de fora, muitas vezes de outro país, ainda não tem nem
 * uma coisa nem outra.
 *
 * NÃO é um diagnóstico — é um aviso de que aquele pedido se trabalha de outra
 * maneira: fuso horário, visita impossível, tudo por escrito.
 *
 * Uma das duas ausências sozinha não chega. Datas por marcar há às dezenas em
 * casamentos de Évora, e um local que não reconhecemos é muitas vezes só uma
 * herdade que falta à tabela.
 */
export function provavelDestination(q: Quote): boolean {
  const semData = !q.date || !/^\d{4}-\d{2}-\d{2}$/.test(q.date);
  const semSitio = localizar(q.location) === null;
  return semData && semSitio;
}

export interface Contexto {
  /** A terra ou região reconhecida no local escrito, se houver. */
  regiao: string | null;
  /** Distância à sede, quando dá para a saber. */
  km: number | null;
  /** A distância foi medida sobre uma região inteira, não sobre uma terra. */
  aproximado: boolean;
  destination: boolean;
}

/**
 * Tudo o que a lista precisa de saber sobre ONDE é este pedido.
 *
 * `base` é a sede — o sítio de onde a distância se conta. Tem valor de partida
 * porque esta função é chamada de dentro de uma linha da lista, que não lê as
 * definições da casa: sem base dada, mede-se de Évora, exactamente como se
 * media quando Évora estava escrita à letra aqui dentro.
 */
export function contextoDeLocal(q: Quote, base: string = BASE_OMISSAO): Contexto {
  const l = localizar(q.location);
  return {
    regiao: l?.lugar.nome ?? null,
    km: kmEntre(base, q.location),
    aproximado: Boolean(l?.aproximado),
    destination: provavelDestination(q),
  };
}

/**
 * Ordena a lista por quem espera há mais tempo.
 *
 * Quem já teve resposta desce, seja qual for a idade: a lista serve para
 * despachar o que está por despachar, e uma proposta enviada há três semanas
 * não pertence ao topo dela. Dentro de cada grupo, o mais antigo primeiro.
 */
export function porEspera(a: Quote, b: Quote, hoje = new Date()): number {
  const ea = diasDeEspera(a, hoje);
  const eb = diasDeEspera(b, hoje);
  if (ea === null && eb === null) {
    // Ambos respondidos: o mais recente primeiro, como em qualquer arquivo.
    return +new Date(b.submittedAt) - +new Date(a.submittedAt);
  }
  if (ea === null) return 1;
  if (eb === null) return -1;
  return eb - ea;
}

/** Os meses de evento presentes nesta lista, em "yyyy-mm", por ordem. */
export function mesesDeEvento(quotes: Quote[]): string[] {
  const meses = new Set<string>();
  for (const q of quotes) {
    if (q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date)) meses.add(q.date.slice(0, 7));
  }
  return [...meses].sort();
}

/** As regiões reconhecidas nesta lista, por ordem alfabética. */
export function regioesDe(quotes: Quote[]): string[] {
  const regioes = new Set<string>();
  for (const q of quotes) {
    const l = localizar(q.location);
    if (l) regioes.add(l.lugar.nome);
  }
  return [...regioes].sort((a, b) => a.localeCompare(b, "pt"));
}

/**
 * As empresas nomeadas nos pedidos — na prática, as wedding planners e as
 * agências. É o campo "empresa" do formulário, que é onde uma planner se
 * identifica; não há um campo "planner" separado e inventar um obrigaria a
 * preenchê-lo à mão em todos os pedidos que já existem.
 */
export function plannersDe(quotes: Quote[]): string[] {
  const nomes = new Set<string>();
  for (const q of quotes) {
    const n = q.company?.trim();
    if (n) nomes.add(n);
  }
  return [...nomes].sort((a, b) => a.localeCompare(b, "pt"));
}
