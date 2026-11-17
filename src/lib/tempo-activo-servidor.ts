import "server-only";
import { getState, listStateByPrefix, setState, type ResultadoDeEscrita } from "./app-state";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ONDE O TEMPO ACTIVO SE ACUMULA — E PORQUE É NO SERVIDOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A contagem em si é do `tempo-activo.ts`: pura, com relógio injectado, e já
 * testada. O que faltava era um sítio onde os totais SOBREVIVESSEM — e onde a
 * pergunta que motiva tudo isto pudesse ser respondida:
 *
 *     «que boards custam mais tempo?»
 *
 * No `localStorage` essa resposta seria a deste computador. A Catarina começa
 * uma proposta no portátil e acaba-a no tablet; metade do tempo ficaria no
 * aparelho errado, e a soma de meia dúzia de propostas seria a soma do que
 * calhou ser feito nesta máquina. Um número que parece uma medição e não é
 * vale menos do que não ter número nenhum.
 *
 * ── Onde ficam ─────────────────────────────────────────────────────────────
 * Na tabela `app_state`, pela mesma razão que os rascunhos (ver
 * `proposal-drafts.ts`): é uma chave para um valor JSON, cada proposta guarda
 * meia dúzia de números, e não vale um passo manual de SQL numa instalação já
 * a funcionar.
 *
 * ── SOMA-SE, não se substitui ──────────────────────────────────────────────
 * O cliente manda o que passou DESDE O ÚLTIMO ENVIO, e é isso que se acrescenta
 * ao que já cá estava. Se mandasse o total, dois aparelhos abertos na mesma
 * proposta escreviam um por cima do outro e ficava só o do último a falar —
 * exactamente a avaria que trazer isto para o servidor veio resolver.
 *
 * ── O que isto NÃO garante, dito antes de alguém descobrir ─────────────────
 * A soma é um ler-somar-escrever, e o `app_state` não tem incremento atómico.
 * Dois envios que se cruzem no mesmo instante podem perder um deles. O prejuízo
 * está limitado pelo tamanho do passo: o cliente reporta de cinco em cinco
 * minutos (17/11), com todas as secções num só pedido — o mesmo separador
 * nunca cruza envios consigo próprio; o pior caso são dois aparelhos na mesma
 * proposta no mesmo instante, num número que se lê em horas. Trocar isto por uma tabela com `update ... set ms = ms +
 * $1` seria mais correcto e custava uma migração — o sítio dessa decisão é o
 * dia em que estes números começarem a ser usados para faturar, e não hoje.
 */

/** O espaço de nomes dentro do `app_state`. */
export const TEMPO_PREFIX = "tempo-activo:";

const chave = (quoteId: string) => `${TEMPO_PREFIX}${quoteId}`;

/** O tempo acumulado de uma proposta. */
export interface TempoDaProposta {
  /** Milissegundos de trabalho ACTIVO, somados de todos os aparelhos. */
  ms: number;
  /**
   * O mesmo, repartido pela secção do estúdio onde foi gasto.
   *
   * É esta parte que responde a «que boards custam mais tempo?» — o total
   * sozinho diz que uma proposta levou duas horas, não diz em quê. Ausente nas
   * propostas medidas antes de as secções serem reportadas.
   */
  porSeccao?: Record<string, number>;
  /** Quando foi somado pela última vez (ISO). */
  updatedAt: string;
}

/**
 * Um tecto por PEDIDO, para um cliente avariado (ou um relógio que saltou) não
 * conseguir inflacionar a medição.
 *
 * O estúdio envia de cinco em cinco minutos (17/11). Dez minutos é o dobro do
 * passo — folga para um envio que se atrasou — e é o TOTAL somado num pedido,
 * não o de cada secção: com o tecto por secção e até 50 secções por pedido, um
 * pedido chegava a 25 horas (revisão de 17/11). Era meia hora quando o envio
 * era de 30 em 30 s, com uma secção por pedido.
 */
export const MAXIMO_POR_ENVIO = 10 * 60_000;

/** Quantas secções diferentes se guardam por proposta. É um tecto contra um
 *  cliente que inventasse nomes de secção sem fim; o estúdio tem meia dúzia. */
const MAX_SECCOES = 40;

/** O tempo desta proposta, ou `null` se ainda não foi medido nenhum. */
export function getTempoActivo(quoteId: string): Promise<TempoDaProposta | null> {
  return getState<TempoDaProposta>(chave(quoteId));
}

/**
 * Acrescenta um pedaço de tempo activo a uma proposta.
 *
 * `ms` é o que passou DESDE O ÚLTIMO ENVIO deste aparelho — nunca o total. O
 * que não for um número positivo e finito é ignorado em silêncio: um envio
 * inválido não é motivo para responder com erro a um cliente que, no resto,
 * está a trabalhar bem.
 *
 * Devolve o total já com a soma feita, e onde é que ele ficou — quem chama
 * merece saber se isto chegou mesmo ao servidor.
 */
export async function acrescentarTempoActivo(
  quoteId: string,
  ms: number,
  seccao?: string,
): Promise<{ tempo: TempoDaProposta; persistencia: ResultadoDeEscrita | null }> {
  return acrescentarTempoActivoPorSeccao(quoteId, { [seccao ?? ""]: ms });
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * VÁRIAS SECÇÕES NUMA SÓ ESCRITA (17/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O estúdio junta o tempo de cinco minutos e manda-o de uma vez, repartido por
 * secção (`tempo-activo-envio.ts`). Mandava um pedido por secção, ao mesmo
 * tempo — e cada um faz ler-somar-gravar sem trinco: os pedidos liam o mesmo
 * total, e só o último a gravar ficava. Agora é UM pedido e UMA escrita com
 * todas as secções. A chave `""` é o tempo sem secção (conta só no total).
 *
 * O tecto (`MAXIMO_POR_ENVIO`) é do pedido inteiro: as secções somam-se por
 * ordem e cada uma leva só o que ainda sobra. O tempo sem secção e o das
 * secções acima de `MAX_SECCOES` (que só contam no total) também gastam o
 * tecto. Os nomes normalizam-se (`trim`, 40 caracteres) antes de somar, e
 * dois nomes que dão o mesmo juntam-se.
 */
export async function acrescentarTempoActivoPorSeccao(
  quoteId: string,
  pedacos: Record<string, number>,
): Promise<{ tempo: TempoDaProposta; persistencia: ResultadoDeEscrita | null }> {
  // Lido para somar e voltar a gravar: uma leitura falhada LANÇA (a rota
  // apanha e responde sem gravar) em vez de pôr o total a zero por cima do
  // verdadeiro (revisão de 13/11, n.º 10).
  const anterior = (await getState<TempoDaProposta>(chave(quoteId), { ouFalha: true })) ?? {
    ms: 0,
    updatedAt: "",
  };

  const porSeccao = { ...(anterior.porSeccao ?? {}) };
  const somado = somarComTecto(porSeccao, pedacos);

  if (somado === 0) {
    // Nada a somar é nada a escrever: um envio de zero (a página esteve
    // aberta e parada) não tem de gastar uma escrita nem mexer no `updatedAt`.
    return {
      tempo: {
        ms: anterior.ms,
        ...(anterior.porSeccao ? { porSeccao: anterior.porSeccao } : {}),
        updatedAt: anterior.updatedAt || new Date().toISOString(),
      },
      persistencia: null,
    };
  }

  const tempo: TempoDaProposta = {
    ms: anterior.ms + somado,
    ...(Object.keys(porSeccao).length > 0 ? { porSeccao } : {}),
    updatedAt: new Date().toISOString(),
  };
  const persistencia = await setState(chave(quoteId), tempo);
  return { tempo, persistencia };
}

/**
 * Soma um pedido a `porSeccao` (que altera) e devolve o total somado, nunca
 * acima de `MAXIMO_POR_ENVIO`. Ver `acrescentarTempoActivoPorSeccao`.
 */
function somarComTecto(porSeccao: Record<string, number>, pedacos: Record<string, number>): number {
  const normalizados = new Map<string, number>();
  for (const [seccao, ms] of Object.entries(pedacos)) {
    if (!Number.isFinite(ms) || ms <= 0) continue;
    const nome = String(seccao).trim().slice(0, 40);
    normalizados.set(nome, (normalizados.get(nome) ?? 0) + ms);
  }
  let restante = MAXIMO_POR_ENVIO;
  let somado = 0;
  for (const [nome, ms] of normalizados) {
    const somar = Math.min(Math.round(ms), restante);
    if (somar <= 0) continue;
    restante -= somar;
    somado += somar;
    if (nome && (nome in porSeccao || Object.keys(porSeccao).length < MAX_SECCOES)) {
      porSeccao[nome] = (porSeccao[nome] ?? 0) + somar;
    }
  }
  return somado;
}

/**
 * Os tempos de todas as propostas medidas — para a análise que compara umas com
 * as outras.
 *
 * Melhor esforço: sem base de dados devolve um mapa vazio, e quem mostra os
 * números mostra que ainda não há nenhum, em vez de rebentar.
 */
export async function listTemposActivos(): Promise<Record<string, TempoDaProposta>> {
  const saida: Record<string, TempoDaProposta> = {};
  try {
    const { entradas } = await listStateByPrefix<TempoDaProposta>(TEMPO_PREFIX);
    for (const { key, value } of entradas) {
      if (!value || typeof value.ms !== "number") continue;
      saida[key.slice(TEMPO_PREFIX.length)] = value;
    }
  } catch {
    /* sem base de dados — ainda não há medições para mostrar */
  }
  return saida;
}
