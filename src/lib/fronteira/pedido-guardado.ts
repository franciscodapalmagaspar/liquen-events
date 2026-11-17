import "server-only";
import { z } from "zod";
import type { Quote } from "@/lib/orcamento/types";
import { observar } from "./observar";
import { ESTADOS_DO_PEDIDO } from "@/lib/orcamento/listas-fechadas";

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
 *  · as listas (histórico, pagamentos, tarefas…) são listas quando existem;
 *  · e o que a ESCRITA aceita a `null` (`quoteUpdateSchema`, em `validation.ts`:
 *    o «Anular» de um «Ganho» repõe `quotedPrice: null`), a leitura aceita
 *    também — `esquemas.test.ts` cruza os dois esquemas campo a campo.
 *
 * Não se desce ao detalhe de cada item das listas: cada uma tem o seu dono
 * (pagamentos, mapa de mesas…), e a fronteira aqui é a forma do pedido.
 */

const lista = z.array(z.unknown()).optional();
const textoOuNulo = z.string().nullable().optional();

export const esquemaDoPedidoGuardado = z.looseObject({
  id: z.string(),
  status: z.enum(ESTADOS_DO_PEDIDO),
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
  quotedPrice: z.number().nullish(),
  adminNotes: textoOuNulo,
  followUpAt: textoOuNulo,
  contractRef: textoOuNulo,
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
 * A linha da base, como `Quote`. Devolve SEMPRE o objecto original — o
 * esquema só observa (ver `observar.ts`). O id entra no registo para se
 * encontrar o pedido; nada mais dele sai.
 *
 * Confere-se a cada leitura, de propósito: custa pouco (medido em
 * `custo.bench.ts`; o número está no documento, Parte −1, fase 6). Uma memória «já conferi esta versão» poupava isso e
 * cegava o esquema a uma linha reposta com outra forma e o mesmo id; e o
 * registo já não se repete (`observar` diz cada desvio uma vez por processo).
 */
export function lerPedidoGuardado(data: unknown): Quote {
  const id = data && typeof data === "object" ? (data as { id?: unknown }).id : undefined;
  observar(esquemaDoPedidoGuardado, data, "um pedido guardado (quotes.data)", { id });
  return data as Quote;
}
