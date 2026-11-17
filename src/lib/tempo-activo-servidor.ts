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
 * está limitado pelo tamanho do passo: o cliente reporta de meio em meio
 * minuto, portanto o pior caso é perder meio minuto de uma proposta, num número
 * que se lê em horas. Trocar isto por uma tabela com `update ... set ms = ms +
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
 * Um tecto por envio, para um cliente avariado (ou um relógio que saltou) não
 * conseguir inflacionar a medição.
 *
 * Meia hora é muito acima do passo normal de reporte (meio minuto) e ainda
 * assim é um número que uma pessoa pode mesmo ter trabalhado sem que o
 * navegador reportasse — um separador que esteve a ser usado enquanto a rede
 * estava em baixo, e que descarrega tudo de uma vez quando ela volta.
 */
export const MAXIMO_POR_ENVIO = 30 * 60_000;

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
  // Lido para somar e voltar a gravar: uma leitura falhada LANÇA (a rota
  // apanha e responde sem gravar) em vez de pôr o total a zero por cima do
  // verdadeiro (revisão de 13/11, n.º 10).
  const anterior = (await getState<TempoDaProposta>(chave(quoteId), { ouFalha: true })) ?? {
    ms: 0,
    updatedAt: "",
  };
  const somar = Number.isFinite(ms) && ms > 0 ? Math.min(Math.round(ms), MAXIMO_POR_ENVIO) : 0;

  if (somar === 0) {
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

  const porSeccao = { ...(anterior.porSeccao ?? {}) };
  const nome = (seccao ?? "").trim().slice(0, 40);
  if (nome && (nome in porSeccao || Object.keys(porSeccao).length < MAX_SECCOES)) {
    porSeccao[nome] = (porSeccao[nome] ?? 0) + somar;
  }

  const tempo: TempoDaProposta = {
    ms: anterior.ms + somar,
    ...(Object.keys(porSeccao).length > 0 ? { porSeccao } : {}),
    updatedAt: new Date().toISOString(),
  };
  const persistencia = await setState(chave(quoteId), tempo);
  return { tempo, persistencia };
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
