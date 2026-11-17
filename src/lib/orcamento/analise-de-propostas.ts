import type { MotivoDeRecusa, Proposal } from "./types";
import { opcionaisDe } from "./versoes-da-proposta";
import { MOTIVOS_DE_RECUSA } from "./listas-fechadas";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE AS PROPOSTAS DIZEM, AO FIM DE UM ANO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * As estatísticas que já existiam contam PEDIDOS: quantos entraram, quantos
 * fecharam, em que meses. Estas contam PROPOSTAS, e respondem a perguntas
 * diferentes — as que se fazem a decidir o que mudar no ano seguinte:
 *
 *   • Perdemos por preço quantas vezes? (a razão de `lostReason` ser uma lista
 *     fechada: texto livre numa coluna que se conta é a maneira de nunca mais
 *     se poder contar)
 *   • Quantas ficam sem resposta nenhuma — que é diferente de serem recusadas
 *   • Os extras vendem-se, quando se oferecem?
 *   • Quanto tempo é que uma resposta demora, na prática
 *
 * ── NÚMEROS PEQUENOS DIZEM-SE PEQUENOS ─────────────────────────────────────
 * Cada resposta traz o número de casos em que assenta. "Perdemos 40% por preço"
 * a partir de cinco propostas é uma frase verdadeira e inútil, e uma
 * percentagem sozinha não deixa ninguém perceber isso.
 *
 * ── NADA DISTO É RASTREIO ──────────────────────────────────────────────────
 * Só se lê o que a equipa escreveu: o estado, o motivo que ela registou, a data
 * em que a proposta saiu e a data em que ela marcou a resposta. Não há nada
 * sobre o que o cliente fez com o email.
 */

export interface Contagem<T extends string> {
  chave: T;
  n: number;
  /** Percentagem do total contado, arredondada ao inteiro. */
  pct: number;
}

export interface AnaliseDePropostas {
  /** Quantas propostas foram enviadas (tudo o que não é rascunho). */
  enviadas: number;
  aceites: number;
  recusadas: number;
  /** Enviadas ou em negociação, ainda sem resposta registada. */
  semResposta: number;
  /** Aceites sobre respondidas — não sobre enviadas. Ver a nota abaixo. */
  taxaDeFecho: number | null;
  /** Em quantas assenta a taxa de fecho. */
  respondidas: number;
  /** Porque é que se perdeu, contado. */
  motivos: Contagem<MotivoDeRecusa>[];
  /** Dias entre o envio e a resposta, mediana. `null` sem respostas datadas. */
  medianaDeResposta: number | null;
  /** Valor médio de uma proposta aceite (bruto). `null` sem aceites. */
  valorMedioGanho: number | null;
  /** Valor médio de uma proposta recusada — o que se perdeu por não fechar. */
  valorMedioPerdido: number | null;
  extras: AnaliseDeExtras | null;
}

export interface AnaliseDeExtras {
  /** Aceites que TINHAM extras assinalados. */
  comExtras: number;
  /** Dessas, quantas ficaram com os extras. */
  levaramExtras: number;
  /** Quantas ficaram pela versão base. */
  ficaramNaBase: number;
  /** Quantas ainda estão por registar — sem elas a percentagem mente. */
  porRegistar: number;
  /** Percentagem das REGISTADAS que levou os extras. `null` sem registos. */
  taxa: number | null;
}

const MOTIVOS: readonly MotivoDeRecusa[] = MOTIVOS_DE_RECUSA;

export const NOME_DO_MOTIVO: Record<MotivoDeRecusa, string> = {
  preco: "Preço",
  data: "Data indisponível",
  "escolheram-outro": "Escolheram outro",
  "sem-resposta": "Nunca responderam",
  outro: "Outro",
};

const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : 0);

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 ? ord[meio] : Math.round(((ord[meio - 1] + ord[meio]) / 2) * 10) / 10;
}

const media = (valores: number[]): number | null =>
  valores.length === 0
    ? null
    : Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100;

/** Dias inteiros entre duas datas ISO. `null` se alguma não se ler. */
function diasEntre(de?: string, ate?: string): number | null {
  if (!de || !ate) return null;
  const a = new Date(de).getTime();
  const b = new Date(ate).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000);
}

export function analisar(propostas: Proposal[]): AnaliseDePropostas {
  // Um rascunho nunca foi proposto a ninguém: contá-lo estragava a taxa de
  // fecho com propostas que o cliente nem sabe que existem.
  const enviadas = propostas.filter((p) => p.status !== "rascunho");
  const aceites = enviadas.filter((p) => p.status === "aceite");
  const recusadas = enviadas.filter((p) => p.status === "rejeitada");
  const respondidas = aceites.length + recusadas.length;

  const contagemDeMotivos = new Map<MotivoDeRecusa, number>();
  for (const p of recusadas) {
    // Uma recusa sem motivo registado conta como "outro" e não desaparece: se
    // as sem motivo não entrassem, a soma dos motivos era menor do que o número
    // de recusas e ninguém percebia porquê.
    const m = p.lostReason && MOTIVOS.includes(p.lostReason) ? p.lostReason : "outro";
    contagemDeMotivos.set(m, (contagemDeMotivos.get(m) ?? 0) + 1);
  }

  const motivos = MOTIVOS.map((chave) => ({
    chave,
    n: contagemDeMotivos.get(chave) ?? 0,
    pct: pct(contagemDeMotivos.get(chave) ?? 0, recusadas.length),
  }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n);

  const tempos = enviadas
    .map((p) => diasEntre(p.sentAt ?? p.createdAt, p.respondedAt))
    .filter((d): d is number => d !== null);

  return {
    enviadas: enviadas.length,
    aceites: aceites.length,
    recusadas: recusadas.length,
    semResposta: enviadas.length - respondidas,
    // Sobre as RESPONDIDAS, e não sobre as enviadas. Uma proposta de há três
    // dias ainda não é uma derrota, e metê-la no denominador fazia a taxa
    // parecer pior sempre que houvesse trabalho recente — que é precisamente
    // quando não se quer um número desanimador.
    taxaDeFecho: respondidas > 0 ? pct(aceites.length, respondidas) : null,
    respondidas,
    motivos,
    medianaDeResposta: mediana(tempos),
    valorMedioGanho: media(aceites.map((p) => p.total).filter((v) => v > 0)),
    valorMedioPerdido: media(recusadas.map((p) => p.total).filter((v) => v > 0)),
    extras: analisarExtras(aceites),
  };
}

/**
 * Os extras vendem-se?
 *
 * `null` quando nunca se ofereceram: uma secção a dizer "0 de 0" ensina a
 * passar os olhos por cima dela.
 */
export function analisarExtras(aceites: Proposal[]): AnaliseDeExtras | null {
  const comExtras = aceites.filter((p) => opcionaisDe(p.doc ?? { budgetItems: [] }).some(Boolean));
  if (comExtras.length === 0) return null;

  const levaramExtras = comExtras.filter((p) => p.versaoEscolhida === "extras").length;
  const ficaramNaBase = comExtras.filter((p) => p.versaoEscolhida === "base").length;
  const registadas = levaramExtras + ficaramNaBase;

  return {
    comExtras: comExtras.length,
    levaramExtras,
    ficaramNaBase,
    porRegistar: comExtras.length - registadas,
    // Sobre as REGISTADAS. As que estão por registar não são um "não": tratá-las
    // como tal dava uma taxa que descia sempre que alguém se esquecia de
    // preencher, e a conclusão seria sobre o preenchimento, não sobre a venda.
    taxa: registadas > 0 ? pct(levaramExtras, registadas) : null,
  };
}
