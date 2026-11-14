import { z } from "zod";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FORMA DA LEITURA — A MESMA PARA AS DUAS VIAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Há duas maneiras de chegar a uma leitura destas:
 *
 *  1. pela API da Anthropic, no servidor — só quando houver chave e o tecto do
 *     mês não estiver gasto (`tecto.ts`);
 *  2. de CUSTO ZERO: o Francisco pede-a ao Claude Code do plano dele (ou ao
 *     claude.ai), com o pedido que o ecrã lhe dá a descarregar
 *     (`pedidoParaOClaude`), e carrega o JSON que sai.
 *
 * As duas passam pelo MESMO esquema e pela MESMA verificação (`verificar.ts`):
 * um JSON carregado à mão não é mais de confiança do que um que veio da API.
 *
 * ── CITAÇÕES ────────────────────────────────────────────────────────────────
 *
 * Os textos que vão para a proposta (títulos, descrições, linhas do orçamento,
 * nomes, local) são LITERAIS: o próprio texto é a citação, e verifica-se que
 * está no documento. Os valores que se convertem (a data em yyyy-mm-dd, os
 * convidados, os euros, a taxa de IVA, o tipo de evento) trazem ao lado a
 * citação de onde vieram, e verifica-se que a citação está no documento E que
 * o valor está na citação.
 */

const texto = z.string().nullable();
const comCitacao = <T extends z.ZodType>(valor: T) =>
  z.strictObject({ valor: valor.nullable(), citacao: z.string().nullable() });

export const NumeroCitado = comCitacao(z.number());
export const TextoCitado = comCitacao(z.string());

export const Subitem = z.strictObject({ titulo: texto, descricao: texto });
export const Item = z.strictObject({
  titulo: texto,
  descricao: texto,
  subitens: z.array(Subitem),
});
export const Grupo = z.strictObject({ titulo: texto, itens: z.array(Item) });

export const TIPOS_DE_LINHA = ["normal", "opcional", "incluido"] as const;
export const Linha = z.strictObject({
  descricao: texto,
  quantidade: NumeroCitado,
  precoUnitario: NumeroCitado,
  totalDaLinha: NumeroCitado,
  tipo: z.enum(TIPOS_DE_LINHA),
});

export const MODOS_DO_IVA = ["sem_iva", "com_iva", "desconhecido"] as const;

export const Leitura = z.strictObject({
  cliente: z.strictObject({ nomes: texto, email: texto, telefone: texto }),
  evento: z.strictObject({
    data: TextoCitado,
    local: texto,
    tipo: TextoCitado,
    convidados: NumeroCitado,
    idioma: z.enum(["pt", "en", "outro"]).nullable(),
  }),
  servicos: z.array(Grupo),
  orcamento: z.strictObject({
    linhas: z.array(Linha),
    iva: z.strictObject({
      /** Em percentagem: 23 = 23 %. */
      taxa: NumeroCitado,
      valoresDasLinhas: z.enum(MODOS_DO_IVA),
      valoresDoTotal: z.enum(MODOS_DO_IVA),
    }),
    totalSemIva: NumeroCitado,
    valorDoIva: NumeroCitado,
    totalComIva: NumeroCitado,
    valoresNaoUsados: z.array(
      z.strictObject({ valor: z.number(), citacao: z.string(), motivo: z.string() }),
    ),
  }),
  notas: z.array(
    z.strictObject({
      tipo: z.enum(["condicao", "pagamento", "validade", "nota"]),
      texto: z.string(),
    }),
  ),
  imagens: z.array(
    z.strictObject({
      id: z.string(),
      destino: z.enum(["capa", "moodboard", "fora"]),
      tema: texto,
      capitulo: texto,
      motivo: texto,
    }),
  ),
  naoColocados: z.array(z.strictObject({ id: z.string(), motivo: z.string() })),
});

export type Leitura = z.infer<typeof Leitura>;
export type LinhaLida = z.infer<typeof Linha>;

/** O JSON schema que segue para a API (`output_config.format`) e no pedido manual. */
export function esquemaJson(): Record<string, unknown> {
  const s = z.toJSONSchema(Leitura) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

/** Uma leitura vazia — o ponto de partida para juntar as partes de um documento grande. */
export function leituraVazia(): Leitura {
  const nada = { valor: null, citacao: null };
  return {
    cliente: { nomes: null, email: null, telefone: null },
    evento: {
      data: { ...nada },
      local: null,
      tipo: { ...nada },
      convidados: { ...nada },
      idioma: null,
    },
    servicos: [],
    orcamento: {
      linhas: [],
      iva: { taxa: { ...nada }, valoresDasLinhas: "desconhecido", valoresDoTotal: "desconhecido" },
      totalSemIva: { ...nada },
      valorDoIva: { ...nada },
      totalComIva: { ...nada },
      valoresNaoUsados: [],
    },
    notas: [],
    imagens: [],
    naoColocados: [],
  };
}

/** Lê um JSON (da API ou carregado por ela) e confere-lhe a forma. */
export function lerLeitura(
  bruto: unknown,
): { ok: true; leitura: Leitura } | { ok: false; erro: string } {
  let dados = bruto;
  if (typeof bruto === "string") {
    try {
      dados = JSON.parse(bruto.replace(/^﻿/, "").replace(/^```(?:json)?\s*|\s*```\s*$/g, ""));
    } catch {
      return { ok: false, erro: "O ficheiro da leitura não é JSON válido." };
    }
  }
  const r = Leitura.safeParse(dados);
  if (!r.success) {
    const onde = r.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`)
      .join("; ");
    return { ok: false, erro: `A leitura não tem a forma esperada (${onde}).` };
  }
  return { ok: true, leitura: r.data };
}
