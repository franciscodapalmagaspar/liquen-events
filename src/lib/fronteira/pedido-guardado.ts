import "server-only";
import { z } from "zod";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import { observar } from "./observar";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PEDIDO COMO ESTÁ GUARDADO (`quotes.data`)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Fase 6 de `docs/ESTRUTURA-DO-CODIGO.md`, ponto 1: a leitura do
 * `quotes-store` deixava de ser `r.data as Quote` às cegas. Em MODO DE
 * OBSERVAR: o pedido sai tal e qual, e o que não bate fica no registo.
 *
 * ── MEDIDO NA BASE, A 17/11 (só tipos, nenhum valor) ─────────────────────
 *
 * Dos 46 pedidos, só 22 a 23 trazem os campos do formulário do site
 * (`priceBreakdown`, `urgency`, `packageTier`, `duration`…): os outros
 * nasceram à mão ou importados, e não os têm. O tipo `Quote` diz que são
 * obrigatórios — e para metade dos pedidos é falso. Um esquema copiado do tipo
 * acusaria 24 pedidos que funcionam todos os dias. Por isso este esquema é o
 * CONTORNO que a base mostra:
 *
 *  · sempre presentes (46 de 46): `id`, `status`, `submittedAt`, `name`,
 *    `email`, `phone`, `date`, `location`, `notes` — todos texto;
 *  · `status` só com os seis estados do tipo (a base tem quatro deles);
 *  · `category`, `eventType`, `budgetRange`, `assignedTo`, `lostReason`
 *    aparecem a `null`; `guests` aparece como número e, num pedido, como texto;
 *  · as listas (histórico, pagamentos, tarefas…) são listas quando existem.
 *
 * Não se desce ao detalhe de cada item das listas: cada uma tem o seu dono
 * (pagamentos, mapa de mesas…), e a fronteira aqui é a forma do pedido.
 */

const ESTADOS = [
  "pendente",
  "em_revisao",
  "a_preparar",
  "cotado",
  "aceite",
  "rejeitado",
] as const satisfies readonly QuoteStatus[];

/** Prova, ao compilar, que a lista acima tem TODOS os estados do tipo. */
type FaltaUmEstado = Exclude<QuoteStatus, (typeof ESTADOS)[number]>;
const _todosOsEstados: FaltaUmEstado extends never ? true : false = true;
void _todosOsEstados;

const lista = z.array(z.unknown()).optional();
const textoOuNulo = z.string().nullable().optional();

export const esquemaDoPedidoGuardado = z.looseObject({
  id: z.string(),
  status: z.enum(ESTADOS),
  submittedAt: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  date: z.string(),
  location: z.string(),
  notes: z.string(),
  category: textoOuNulo,
  eventType: textoOuNulo,
  budgetRange: textoOuNulo,
  assignedTo: textoOuNulo,
  lostReason: textoOuNulo,
  guests: z.union([z.number(), z.string()]).nullable().optional(),
  quotedPrice: z.number().optional(),
  archived: z.boolean().optional(),
  priceBreakdown: z.looseObject({}).optional(),
  mapaDeMesas: z.looseObject({}).optional(),
  tags: z.array(z.string()).optional(),
  naoDuplicados: z.array(z.string()).optional(),
  activityLog: lista,
  messages: lista,
  checklist: lista,
  productionPlan: lista,
  payments: lista,
  timeline: lista,
  eventSuppliers: lista,
  guestList: lista,
  escolhasDoCasal: lista,
  addons: lista,
});

/**
 * As versões de pedidos já conferidas neste processo (`id|lastUpdated`).
 *
 * A lista de pedidos é lida por treze sítios (a página do back office, as
 * tarefas da noite, os guiões…), e um pedido que já bateu não muda de forma
 * enquanto não for gravado outra vez — e gravar muda o `lastUpdated`. Conferir
 * só a versão nova tira o esquema do caminho quente: medido, 5 µs por pedido,
 * mas pagos por cada pedido em cada leitura. Com tecto, como os desvios.
 */
const TECTO_DE_VERSOES_CONFERIDAS = 2_000;
const conferidas = new Set<string>();

/**
 * A linha da base, como `Quote`. Devolve SEMPRE o objecto original — o
 * esquema só observa (ver `observar.ts`). O id entra no registo para se
 * encontrar o pedido; nada mais dele sai.
 */
export function lerPedidoGuardado(data: unknown): Quote {
  const linha = (data && typeof data === "object" ? data : {}) as {
    id?: unknown;
    lastUpdated?: unknown;
  };
  const id = typeof linha.id === "string" ? linha.id : undefined;
  const versao = id ? `${id}|${String(linha.lastUpdated ?? "")}` : null;
  if (versao && conferidas.has(versao)) return data as Quote;
  observar(esquemaDoPedidoGuardado, data, "um pedido guardado (quotes.data)", { id });
  if (versao) {
    if (conferidas.size >= TECTO_DE_VERSOES_CONFERIDAS) conferidas.clear();
    conferidas.add(versao);
  }
  return data as Quote;
}

/** Para os testes: esquece as versões já conferidas. */
export function __esquecerVersoesConferidas(): void {
  conferidas.clear();
}
