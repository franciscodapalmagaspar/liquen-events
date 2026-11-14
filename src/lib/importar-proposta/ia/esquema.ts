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

/**
 * ── LIMITES ─────────────────────────────────────────────────────────────────
 *
 * Um JSON carregado à mão (ou uma resposta que enlouqueceu) não pode trazer
 * um texto de 50 MB nem 100 000 linhas de orçamento. Os limites ficam aqui, no
 * zod; a API não aceita `maxLength`/`maxItems` no esquema, e por isso o
 * {@link esquemaJson} tira-os antes de o mandar (verificam-se ao ler).
 */
export const LIMITES = {
  texto: 20_000,
  citacao: 2_000,
  grupos: 200,
  itens: 300,
  subitens: 100,
  linhas: 500,
  notas: 500,
  imagens: 2_000,
  naoColocados: 20_000,
} as const;

const texto = z.string().max(LIMITES.texto).nullable();
const citacao = z.string().max(LIMITES.citacao).nullable();
const comCitacao = <T extends z.ZodType>(valor: T) =>
  z.strictObject({ valor: valor.nullable(), citacao });

export const NumeroCitado = comCitacao(z.number());
export const TextoCitado = comCitacao(z.string().max(LIMITES.citacao));

export const Subitem = z.strictObject({ titulo: texto, descricao: texto });
export const Item = z.strictObject({
  titulo: texto,
  descricao: texto,
  subitens: z.array(Subitem).max(LIMITES.subitens),
});
export const Grupo = z.strictObject({ titulo: texto, itens: z.array(Item).max(LIMITES.itens) });

export const TIPOS_DE_LINHA = ["normal", "opcional", "incluido"] as const;
export const Linha = z.strictObject({
  descricao: texto,
  quantidade: NumeroCitado,
  precoUnitario: NumeroCitado,
  totalDaLinha: NumeroCitado,
  tipo: z.enum(TIPOS_DE_LINHA),
});

export const MODOS_DO_IVA = ["sem_iva", "com_iva", "desconhecido"] as const;
/** O modo de IVA TAMBÉM traz a citação de onde vem («+ IVA», «IVA incluído»). */
export const ModoCitado = z.strictObject({ valor: z.enum(MODOS_DO_IVA), citacao });

export const Leitura = z.strictObject({
  cliente: z.strictObject({ nomes: texto, email: texto, telefone: texto }),
  evento: z.strictObject({
    data: TextoCitado,
    local: texto,
    tipo: TextoCitado,
    convidados: NumeroCitado,
    idioma: z.enum(["pt", "en", "outro"]).nullable(),
  }),
  servicos: z.array(Grupo).max(LIMITES.grupos),
  orcamento: z.strictObject({
    linhas: z.array(Linha).max(LIMITES.linhas),
    iva: z.strictObject({
      /** Em percentagem: 23 = 23 %. A citação tem de ter o «%» e o «IVA». */
      taxa: NumeroCitado,
      valoresDasLinhas: ModoCitado,
      valoresDoTotal: ModoCitado,
    }),
    totalSemIva: NumeroCitado,
    valorDoIva: NumeroCitado,
    totalComIva: NumeroCitado,
    valoresNaoUsados: z
      .array(
        z.strictObject({
          valor: z.number(),
          citacao: z.string().max(LIMITES.citacao),
          motivo: z.string().max(LIMITES.citacao),
        }),
      )
      .max(LIMITES.linhas),
  }),
  notas: z
    .array(
      z.strictObject({
        tipo: z.enum(["condicao", "pagamento", "validade", "nota"]),
        texto: z.string().max(LIMITES.texto),
      }),
    )
    .max(LIMITES.notas),
  imagens: z
    .array(
      z.strictObject({
        id: z.string().max(40),
        destino: z.enum(["capa", "moodboard", "fora"]),
        tema: texto,
        capitulo: texto,
        motivo: texto,
      }),
    )
    .max(LIMITES.imagens),
  naoColocados: z
    .array(z.strictObject({ id: z.string().max(40), motivo: z.string().max(LIMITES.citacao) }))
    .max(LIMITES.naoColocados),
});

export type Leitura = z.infer<typeof Leitura>;
export type LinhaLida = z.infer<typeof Linha>;

/** O JSON schema que segue para a API (`output_config.format`) e no pedido manual. */
export function esquemaJson(): Record<string, unknown> {
  const s = z.toJSONSchema(Leitura) as Record<string, unknown>;
  delete s.$schema;
  return semLimites(s) as Record<string, unknown>;
}

/** Tira o que a saída estruturada da API não aceita (os limites ficam no zod). */
const NAO_ACEITES = new Set([
  "maxLength",
  "minLength",
  "maxItems",
  "minItems",
  "maximum",
  "minimum",
]);
function semLimites(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(semLimites);
  if (x && typeof x === "object") {
    return Object.fromEntries(
      Object.entries(x)
        .filter(([k]) => !NAO_ACEITES.has(k))
        .map(([k, v]) => [k, semLimites(v)]),
    );
  }
  return x;
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
      iva: {
        taxa: { ...nada },
        valoresDasLinhas: { valor: "desconhecido", citacao: null },
        valoresDoTotal: { valor: "desconhecido", citacao: null },
      },
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
