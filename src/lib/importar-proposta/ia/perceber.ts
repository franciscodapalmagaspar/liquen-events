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
/** ~17 000 tokens de entrada por pedido (o português dá ~3,5 caracteres por token). */
export const MAX_CARACTERES_POR_PARTE = 60_000;
export const MAX_PARTES = 6;
/** As descrições copiam-se inteiras: a saída pode ser quase tão grande como a entrada. */
export const MAX_TOKENS = 64_000;

/** Preços do Claude Opus 5.5, em dólares por milhão de tokens. */
export const PRECO = { entrada: 4, saida: 20, escritaNaCache: 5, leituraDaCache: 0.2 } as const;

export interface Uso {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
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
export type ChamarModelo = (pedido: PedidoAoModelo) => Promise<RespostaDoModelo>;

export class LeituraFalhou extends Error {
  constructor(
    message: string,
    readonly motivo: "recusa" | "max_tokens" | "incompleta" | "forma" | "erro" | "grande",
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
    max_tokens: MAX_TOKENS,
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
): Promise<{ leitura: Leitura; uso: Uso }> {
  let r: RespostaDoModelo;
  try {
    r = await chamar(pedidoAoModelo(texto, parte));
  } catch (e) {
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
    if (o.iva.valoresDasLinhas === "desconhecido")
      o.iva.valoresDasLinhas = l.orcamento.iva.valoresDasLinhas;
    if (o.iva.valoresDoTotal === "desconhecido")
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

export async function perceber(chamar: ChamarModelo, d: DocumentoCompleto): Promise<Percebido> {
  const pedacos = partirEmPedacos(d);
  if (pedacos.length > MAX_PARTES) {
    throw new LeituraFalhou(
      `O documento é grande demais para a leitura com IA (${pedacos.length} partes; o máximo é ${MAX_PARTES}).`,
      "grande",
    );
  }
  const n = pedacos.length;
  // A primeira sozinha (escreve as instruções na cache), as outras ao mesmo
  // tempo (lêem-nas da cache).
  const primeira = await lerUmaParte(chamar, pedacos[0], { i: 1, n });
  const resto = await Promise.all(
    pedacos.slice(1).map((t, k) => lerUmaParte(chamar, t, { i: k + 2, n })),
  );
  const todas = [primeira, ...resto];
  const { leitura, conflitos } = juntarLeituras(todas.map((x) => x.leitura));
  return { leitura, conflitos, uso: todas.map((x) => x.uso), partes: n };
}

/** Quanto custou, em dólares, pelos preços de {@link PRECO}. */
export function custoEmDolares(usos: readonly Uso[]): number {
  let c = 0;
  for (const u of usos) {
    c +=
      (u.input_tokens * PRECO.entrada +
        u.output_tokens * PRECO.saida +
        (u.cache_creation_input_tokens ?? 0) * PRECO.escritaNaCache +
        (u.cache_read_input_tokens ?? 0) * PRECO.leituraDaCache) /
      1_000_000;
  }
  return Math.round(c * 10_000) / 10_000;
}

/** Estimativa sem chamar nada: ~3,5 caracteres por token. */
export function estimarTokens(caracteres: number): number {
  return Math.ceil(caracteres / 3.5);
}
