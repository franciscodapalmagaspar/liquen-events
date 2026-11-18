import { z } from "zod";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PEDIDO E O DOCUMENTO DO ESTÚDIO, LIDOS COM ESQUEMA — EM MODO DE SÓ REGISTAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * P6 de docs/ESTRUTURA-DOS-DADOS.md. A ESCRITA do pedido já é validada
 * (`validation.ts`); a LEITURA era um `as Quote` e um `as ProposalDoc`: um
 * `jsonb` com uma forma inesperada entrava na aplicação e dava um `undefined`
 * silencioso três ecrãs depois.
 *
 * Estes esquemas são ESTRUTURAIS — os tipos de cada chave de topo e das
 * coleções que se percorrem —, e não as regras de negócio da escrita (tetos,
 * comprimentos), que numa leitura só dariam alarmes falsos. Todas as chaves
 * desconhecidas passam (`looseObject`): um documento antigo ou mais novo do que
 * o código não é um erro.
 *
 * MODO DE SÓ REGISTAR: nada é recusado nem alterado — o valor lido segue tal e
 * qual. Uma forma inesperada fica no registo, UMA vez por registo e por forma,
 * com o caminho e o tipo do problema, NUNCA com o valor (são dados de
 * clientes). Recusar vem depois, se o registo ficar limpo, e na rota — nunca
 * no ecrã dela.
 *
 * Medido a 18/11 em produção (só contagens, consulta no P6 do documento): os 47
 * pedidos e os 52 documentos passam. O achado: 25 dos 47 pedidos não têm
 * `priceBreakdown`, que o tipo `Quote` diz obrigatório — por isso aqui é
 * opcional, e o tipo mente (fica registado no documento, não se corrige aqui).
 */

const texto = z.string().nullish();
const numero = z.number().nullish();
const lista = z.array(z.unknown()).nullish();
const objeto = z.record(z.string(), z.unknown()).nullish();

export const pedidoLidoSchema = z.looseObject({
  id: z.string(),
  submittedAt: z.string(),
  status: z.enum(["pendente", "em_revisao", "a_preparar", "cotado", "aceite", "rejeitado"]),
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

export const documentoLidoSchema = z.looseObject({
  template: z.enum(["decoracao", "organizacao"]).nullish(),
  ref: z.string(),
  clientNames: z.string(),
  eventType: z.string(),
  eventDate: z.string(),
  location: z.string(),
  guests: z.string(),
  serviceGroups: z.array(z.unknown()),
  moodBoards: z.array(z.record(z.string(), z.unknown())),
  budgetItems: z.array(z.string()),
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

/** O que fica no registo de uma leitura fora do esquema: caminhos e códigos. */
export function formaDosProblemas(erro: z.ZodError): string[] {
  return [
    ...new Set(erro.issues.map((i) => `${i.path.map(String).join(".") || "(raiz)"}:${i.code}`)),
  ].sort();
}

/** Já registados, para cada forma estragada ir ao registo uma vez por processo. */
const jaRegistados = new Set<string>();
const TECTO_DE_REGISTADOS = 500;

/**
 * Já verificados nesta versão. Uma lista lê todos os pedidos de cada vez, e
 * verificar o mesmo pedido, sem mudanças, em cada pedido HTTP era processador
 * gasto para nada (regra 7). A `versao` é o carimbo de alteração do registo.
 */
const jaVerificados = new Set<string>();
const TECTO_DE_VERIFICADOS = 5000;

/**
 * Verifica `valor` e, se não tiver a forma, regista-o. Nunca lança e nunca
 * muda o valor. Devolve se passou (para os testes; quem lê não precisa).
 */
export function registarSeForaDoEsquema(
  tipo: "pedido" | "documento-do-estudio",
  id: string,
  valor: unknown,
  /** O carimbo de alteração; sem ele verifica-se sempre. */
  versao?: string,
): boolean {
  const visto = versao ? `${tipo}|${id}|${versao}` : null;
  if (visto && jaVerificados.has(visto)) return true;
  const schema = tipo === "pedido" ? pedidoLidoSchema : documentoLidoSchema;
  const r = schema.safeParse(valor);
  if (visto) {
    if (jaVerificados.size >= TECTO_DE_VERIFICADOS) jaVerificados.clear();
    jaVerificados.add(visto);
  }
  if (r.success) return true;
  const problemas = formaDosProblemas(r.error);
  const chave = `${tipo}|${id}|${problemas.join(",")}`;
  if (!jaRegistados.has(chave)) {
    if (jaRegistados.size >= TECTO_DE_REGISTADOS) jaRegistados.clear();
    jaRegistados.add(chave);
    log.warn("leitura fora do esquema (só registo, nada foi recusado)", {
      tipo,
      id,
      problemas: problemas.slice(0, 20).join(" "),
    });
  }
  return false;
}
