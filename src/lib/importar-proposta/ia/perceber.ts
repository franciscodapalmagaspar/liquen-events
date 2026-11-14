import { documentoEmTexto, type DocumentoCompleto, type UnidadeLida } from "../documento-completo";
import { esquemaJson, leituraVazia, lerLeitura, type Leitura } from "./esquema";
import { INSTRUCOES } from "./instrucoes";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PERCEBER: O DOCUMENTO VAI À IA, A PROPOSTA VOLTA EM JSON
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Só o TEXTO segue (as imagens vão pelo id e pela posição, nunca os bytes).
 * O que volta é uma {@link Leitura}, com saída estruturada pelo esquema
 * estrito — e nada do que volta é usado sem passar por `verificar.ts`.
 *
 * ── O QUE NÃO SE ACEITA ─────────────────────────────────────────────────────
 *
 * Uma resposta com `stop_reason` «refusal» (recusa, mesmo depois do modelo de
 * recurso), «max_tokens» (cortada a meio: um JSON cortado podia ainda ter
 * forma, sem metade das linhas do orçamento) ou qualquer outra coisa que não
 * «end_turn», e um JSON que não cumpra o esquema: em todos estes casos a
 * leitura FALHA, e quem chama cai no importador por regras (e di-lo).
 *
 * ── DOCUMENTOS GRANDES: DIVIDIR, NUNCA CORTAR ──────────────────────────────
 *
 * Há um tecto de texto por pedido ({@link MAX_CARACTERES_POR_PARTE}). Um
 * documento maior divide-se pelas SECÇÕES (um diapositivo, ou o que vai de um
 * título ao seguinte), cada parte vai num pedido, e as leituras juntam-se pela
 * ordem. Nenhuma unidade se parte a meio. Acima de {@link MAX_PARTES} partes
 * não se lê com IA de todo — e di-lo —, em vez de se ler só o princípio.
 */

export const MODELO = "claude-opus-5-5";
/** ~8 500 tokens de entrada por pedido (o português dá ~3,5 caracteres por token). */
export const MAX_CARACTERES_POR_PARTE = 30_000;
export const MAX_PARTES = 6;
/**
 * ── O PRAZO DE TUDO: 240 s ──────────────────────────────────────────────────
 *
 * A função da Vercel morre aos 300 s (`maxDuration`): se a resposta chegasse
 * aos 301, a Vercel dava 504, o lugar do tecto ficava gasto e os tokens eram
 * cobrados sem nada a mostrar. O `timeout` do SDK não cobre a leitura do
 * stream; por isso há UM sinal de interrupção com prazo para a importação
 * inteira (todas as partes ao mesmo tempo), e ao chegar ao prazo corta-se,
 * cai-se nas regras e diz-se porquê — com 60 s de folga para o resto da rota.
 */
export const PRAZO_MS = 240_000;

/**
 * O `max_tokens` de cada parte, à medida dela: as descrições copiam-se
 * inteiras (≈ o texto, uma vez e meia por causa do JSON e das citações) mais
 * o pensamento. Nunca os 64 000 de antes, que só serviam para pagar mais.
 */
export function maxTokensPara(caracteres: number): number {
  return Math.min(32_000, 6_000 + Math.ceil(estimarTokens(caracteres) * 1.5));
}

/** Preços do Claude Opus 5.5, em dólares por milhão de tokens. */
export const PRECO = { entrada: 4, saida: 20, escritaNaCache: 5, leituraDaCache: 0.2 } as const;
/**
 * Para o que corre no modelo de RECURSO (`fallbacks: "default"`), que pode
 * ser outro e mais caro: conta-se pelo preço de um Opus anterior, por cima.
 * É também o preço da RESERVA no tecto (`custoMaximoEmDolares`).
 */
export const PRECO_DE_RECURSO = {
  entrada: 5,
  saida: 25,
  escritaNaCache: 6.25,
  leituraDaCache: 0.5,
} as const;

interface UsoBase {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}
export interface Uso extends UsoBase {
  /** Um por modelo que correu nesta resposta, quando o recurso entrou. */
  iterations?: (UsoBase & { type?: string })[] | null;
}

/** A forma mínima de uma resposta da API — a do SDK, sem depender dele aqui. */
export interface RespostaDoModelo {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
  usage: Uso;
}

/** O pedido, como segue para `client.beta.messages.stream`. */
export interface PedidoAoModelo {
  model: string;
  max_tokens: number;
  betas: string[];
  fallbacks: "default";
  thinking: { type: "adaptive" };
  output_config: {
    effort: "high";
    format: { type: "json_schema"; schema: Record<string, unknown> };
  };
  system: { type: "text"; text: string; cache_control: { type: "ephemeral" } }[];
  messages: { role: "user"; content: string }[];
}

/** O duplo dos testes implementa isto; o verdadeiro está em `cliente.ts`. */
export type ChamarModelo = (
  pedido: PedidoAoModelo,
  opcoes: { signal: AbortSignal },
) => Promise<RespostaDoModelo>;

export class LeituraFalhou extends Error {
  constructor(
    message: string,
    readonly motivo: "recusa" | "max_tokens" | "incompleta" | "forma" | "erro" | "grande" | "tempo",
    readonly uso: Uso[] = [],
  ) {
    super(message);
    this.name = "LeituraFalhou";
  }
}

export function pedidoAoModelo(texto: string, parte?: { i: number; n: number }): PedidoAoModelo {
  const cabeca =
    parte && parte.n > 1
      ? `Esta é a PARTE ${parte.i} de ${parte.n} da proposta (as outras vêm noutros pedidos).\n\n`
      : "";
  return {
    model: MODELO,
    max_tokens: maxTokensPara(texto.length),
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: esquemaJson() } },
    system: [{ type: "text", text: INSTRUCOES, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `${cabeca}O DOCUMENTO:\n${texto}` }],
  };
}

// ── Dividir pelas secções ─────────────────────────────────────────────────────

function eInicioDeSeccao(u: UnidadeLida, anterior: UnidadeLida | undefined): boolean {
  if (!anterior) return true;
  if (u.parte !== anterior.parte) return true;
  return u.tipo === "paragrafo" && u.nivel !== undefined && u.nivel <= 2;
}

/** Os pedaços do documento, cada um com texto ≤ ao tecto (salvo uma unidade sozinha maior). */
export function partirEmPedacos(d: DocumentoCompleto, max = MAX_CARACTERES_POR_PARTE): string[] {
  const texto = (us: UnidadeLida[]) => documentoEmTexto({ partes: d.partes, unidades: us });
  const tudo = texto(d.unidades);
  if (tudo.length <= max) return [tudo];

  const seccoes: UnidadeLida[][] = [];
  d.unidades.forEach((u, i) => {
    if (eInicioDeSeccao(u, d.unidades[i - 1])) seccoes.push([]);
    seccoes[seccoes.length - 1].push(u);
  });
  const pedacos: UnidadeLida[][] = [];
  let actual: UnidadeLida[] = [];
  const meter = (us: UnidadeLida[]) => {
    if (actual.length && texto([...actual, ...us]).length > max) {
      pedacos.push(actual);
      actual = [];
    }
    actual.push(...us);
  };
  for (const s of seccoes) {
    if (texto(s).length <= max) meter(s);
    else for (const u of s) meter([u]); // uma secção enorme: unidade a unidade
  }
  if (actual.length) pedacos.push(actual);
  return pedacos.map(texto);
}

// ── Uma chamada ─────────────────────────────────────────────────────────────

async function lerUmaParte(
  chamar: ChamarModelo,
  texto: string,
  parte: { i: number; n: number },
  signal: AbortSignal,
): Promise<{ leitura: Leitura; uso: Uso }> {
  let r: RespostaDoModelo;
  try {
    r = await chamar(pedidoAoModelo(texto, parte), { signal });
  } catch (e) {
    if (signal.aborted) {
      throw new LeituraFalhou(
        `A leitura com IA passou do prazo (${PRAZO_MS / 1000} s) e foi interrompida.`,
        "tempo",
      );
    }
    throw new LeituraFalhou(
      `A leitura com IA não respondeu${e instanceof Error && e.message ? ` (${e.message.slice(0, 160)})` : ""}.`,
      "erro",
    );
  }
  const uso = r.usage;
  if (r.stop_reason === "refusal") {
    throw new LeituraFalhou("A IA recusou ler este documento.", "recusa", [uso]);
  }
  if (r.stop_reason === "max_tokens") {
    throw new LeituraFalhou(
      "A resposta da IA ficou cortada a meio (passou do tamanho máximo).",
      "max_tokens",
      [uso],
    );
  }
  if (r.stop_reason !== "end_turn") {
    throw new LeituraFalhou(
      `A resposta da IA não acabou como devia («${r.stop_reason ?? "sem motivo"}»).`,
      "incompleta",
      [uso],
    );
  }
  const json = r.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
  const lida = lerLeitura(json);
  if (!lida.ok) throw new LeituraFalhou(`A resposta da IA não serve: ${lida.erro}`, "forma", [uso]);
  return { leitura: lida.leitura, uso };
}

// ── Juntar as partes ──────────────────────────────────────────────────────────

type ComValor<T> = { valor: T | null; citacao: string | null };

export function juntarLeituras(leituras: Leitura[]): { leitura: Leitura; conflitos: string[] } {
  const out = leituraVazia();
  const conflitos: string[] = [];
  const escalar = <T>(actual: T | null, novo: T | null, nome: string): T | null => {
    if (novo === null || novo === undefined || novo === "") return actual;
    if (actual === null || actual === undefined || actual === "") return novo;
    if (actual !== novo) {
      conflitos.push(
        `Partes diferentes do documento dizem coisas diferentes sobre ${nome}: «${String(actual)}» e «${String(novo)}». Ficou o primeiro.`,
      );
    }
    return actual;
  };
  const citado = <T>(actual: ComValor<T>, novo: ComValor<T>, nome: string): ComValor<T> => {
    if (novo.valor === null) return actual;
    if (actual.valor === null) return novo;
    escalar(actual.valor, novo.valor, nome);
    return actual;
  };
  for (const l of leituras) {
    out.cliente.nomes = escalar(out.cliente.nomes, l.cliente.nomes, "o nome do cliente");
    out.cliente.email = escalar(out.cliente.email, l.cliente.email, "o e-mail");
    out.cliente.telefone = escalar(out.cliente.telefone, l.cliente.telefone, "o telefone");
    out.evento.data = citado(out.evento.data, l.evento.data, "a data do evento");
    out.evento.local = escalar(out.evento.local, l.evento.local, "o local");
    out.evento.tipo = citado(out.evento.tipo, l.evento.tipo, "o tipo de evento");
    out.evento.convidados = citado(out.evento.convidados, l.evento.convidados, "os convidados");
    out.evento.idioma = escalar(out.evento.idioma, l.evento.idioma, "o idioma");
    out.servicos.push(...l.servicos);
    const o = out.orcamento;
    o.linhas.push(...l.orcamento.linhas);
    o.iva.taxa = citado(o.iva.taxa, l.orcamento.iva.taxa, "a taxa de IVA");
    if (o.iva.valoresDasLinhas.valor === "desconhecido")
      o.iva.valoresDasLinhas = l.orcamento.iva.valoresDasLinhas;
    if (o.iva.valoresDoTotal.valor === "desconhecido")
      o.iva.valoresDoTotal = l.orcamento.iva.valoresDoTotal;
    o.totalSemIva = citado(o.totalSemIva, l.orcamento.totalSemIva, "o total sem IVA");
    o.valorDoIva = citado(o.valorDoIva, l.orcamento.valorDoIva, "o valor do IVA");
    o.totalComIva = citado(o.totalComIva, l.orcamento.totalComIva, "o total com IVA");
    o.valoresNaoUsados.push(...l.orcamento.valoresNaoUsados);
    out.notas.push(...l.notas);
    out.imagens.push(...l.imagens);
    out.naoColocados.push(...l.naoColocados);
  }
  return { leitura: out, conflitos };
}

// ── O passo inteiro ──────────────────────────────────────────────────────────

export interface Percebido {
  leitura: Leitura;
  conflitos: string[];
  uso: Uso[];
  partes: number;
}

export async function perceber(
  chamar: ChamarModelo,
  pedacos: string[],
  opcoes: { prazoMs?: number } = {},
): Promise<Percebido> {
  if (pedacos.length > MAX_PARTES) {
    throw new LeituraFalhou(
      `O documento é grande demais para a leitura com IA (${pedacos.length} partes; o máximo é ${MAX_PARTES}).`,
      "grande",
    );
  }
  const n = pedacos.length;
  // Um prazo para TUDO, e as partes todas ao mesmo tempo. Se uma falha, as
  // outras param logo (não se pagam tokens de uma leitura que não se usa).
  const controlo = new AbortController();
  const relogio = setTimeout(() => controlo.abort(), opcoes.prazoMs ?? PRAZO_MS);
  try {
    const todas = await Promise.all(
      pedacos.map((t, k) =>
        lerUmaParte(chamar, t, { i: k + 1, n }, controlo.signal).catch((e) => {
          controlo.abort();
          throw e;
        }),
      ),
    );
    const { leitura, conflitos } = juntarLeituras(todas.map((x) => x.leitura));
    return { leitura, conflitos, uso: todas.map((x) => x.uso), partes: n };
  } finally {
    clearTimeout(relogio);
  }
}

/** Quanto custou, em dólares, pelos preços de {@link PRECO}. */
export function custoEmDolares(usos: readonly Uso[]): number {
  const de = (u: UsoBase, p: typeof PRECO | typeof PRECO_DE_RECURSO) =>
    (u.input_tokens * p.entrada +
      u.output_tokens * p.saida +
      (u.cache_creation_input_tokens ?? 0) * p.escritaNaCache +
      (u.cache_read_input_tokens ?? 0) * p.leituraDaCache) /
    1_000_000;
  let c = 0;
  for (const u of usos) {
    // Com o recurso, cada modelo que correu vem em `iterations`: somam-se
    // todos (o que recusou também se paga), e o do recurso pelo preço de cima.
    if (u.iterations?.length) {
      for (const it of u.iterations) {
        c += de(it, it.type === "fallback_message" ? PRECO_DE_RECURSO : PRECO);
      }
    } else c += de(u, PRECO);
  }
  return Math.round(c * 10_000) / 10_000;
}

/**
 * O MAIS que uma importação pode custar — o que se reserva no tecto antes de
 * chamar: por parte, a entrada toda a preço de escrita na cache e o
 * `max_tokens` inteiro a preço de saída, pelos preços de cima.
 */
export function custoMaximoEmDolares(pedacos: readonly string[]): number {
  const fixo = estimarTokens(INSTRUCOES.length + JSON.stringify(esquemaJson()).length);
  let c = 0;
  for (const p of pedacos) {
    c +=
      ((fixo + estimarTokens(p.length) + 200) * PRECO_DE_RECURSO.escritaNaCache +
        maxTokensPara(p.length) * PRECO_DE_RECURSO.saida) /
      1_000_000;
  }
  return Math.ceil(c * 10_000) / 10_000;
}

/** Estimativa sem chamar nada: ~3,5 caracteres por token. */
export function estimarTokens(caracteres: number): number {
  return Math.ceil(caracteres / 3.5);
}
