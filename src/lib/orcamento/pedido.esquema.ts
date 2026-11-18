import { z } from "zod";
import { ESTADOS_DO_PEDIDO } from "./estado-do-pedido";

/**
 * A forma do pedido (`quotes.data`) ao SAIR da base de dados — P6 de
 * docs/ESTRUTURA-DOS-DADOS.md, usada por `esquemas-de-leitura.ts`.
 *
 * ESTRUTURAL: os tipos das chaves de topo e das coleções que se percorrem, não
 * as regras de negócio da escrita (`validation.ts`), que numa leitura só dariam
 * alarmes falsos. Chaves desconhecidas passam. `priceBreakdown` é opcional:
 * 25 dos 47 pedidos de produção não o têm (18/11), embora o tipo `Quote` o
 * diga obrigatório.
 */
const texto = z.string().nullish();
const numero = z.number().nullish();
const lista = z.array(z.unknown()).nullish();
const objeto = z.record(z.string(), z.unknown()).nullish();

export const pedidoLidoSchema = z.looseObject({
  id: z.string(),
  submittedAt: z.string(),
  status: z.enum(ESTADOS_DO_PEDIDO),
  priceBreakdown: objeto,
  name: texto,
  email: texto,
  lastUpdated: texto,
  adminNotes: texto,
  followUpAt: texto,
  contractRef: texto,
  quotedPrice: numero,
  messages: lista,
  checklist: lista,
  productionPlan: lista,
  payments: z.array(z.looseObject({ amount: z.number() })).nullish(),
  timeline: lista,
  eventSuppliers: lista,
  tags: z.array(z.string()).nullish(),
  guestList: lista,
  activityLog: lista,
  naoDuplicados: lista,
  escolhasDoCasal: lista,
  mapaDeMesas: objeto,
  folhaDaTimeline: objeto,
  faturasMoloni: objeto,
  possivelSpam: objeto,
});
