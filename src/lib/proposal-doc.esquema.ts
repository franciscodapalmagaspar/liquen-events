import { z } from "zod";

/**
 * A forma do documento do estúdio (`proposals.doc`, o `ProposalDoc` de
 * `proposal-doc.ts`) ao SAIR da base de dados — P6 de
 * docs/ESTRUTURA-DOS-DADOS.md, usada por `esquemas-de-leitura.ts`.
 *
 * ESTRUTURAL e solto: os tipos das chaves de topo que o estúdio, o PDF e a
 * proposta online percorrem. Chaves desconhecidas passam — o documento cresceu
 * sem número de versão (53 chaves de topo diferentes a 17/11). Quando uma
 * chave nova do `ProposalDoc` passar a ser percorrida sem guarda, acrescenta-se
 * aqui ao lado.
 */
const numero = z.number().nullish();
const lista = z.array(z.unknown()).nullish();
const objeto = z.record(z.string(), z.unknown()).nullish();

export const documentoLidoSchema = z.looseObject({
  template: z.enum(["decoracao", "organizacao"]).nullish(),
  ref: z.string(),
  clientNames: z.string(),
  eventType: z.string(),
  eventDate: z.string(),
  location: z.string(),
  guests: z.string(),
  // Opcionais porque o `withProposalDefaults` (proposal-doc.ts) já os repõe
  // vazios quando faltam; o que interessa é a forma quando existem.
  serviceGroups: z.array(z.unknown()).nullish(),
  moodBoards: z.array(z.record(z.string(), z.unknown())).nullish(),
  budgetItems: z.array(z.string()).nullish(),
  cronograma: lista,
  budgetItemsEn: lista,
  budgetAmounts: lista,
  budgetCosts: lista,
  budgetScales: lista,
  budgetOpcional: lista,
  budgetRows: lista,
  paletaDela: lista,
  fotosDasPaginas: objeto,
  focoDaCapa: objeto,
  traducoesFeitas: objeto,
  kmDeslocacao: numero,
  carrinhasDeslocacao: numero,
  convidadosPorMesa: numero,
});
