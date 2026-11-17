import "server-only";
import { z } from "zod";
import { MODELOS_DO_DOCUMENTO, MODOS_DE_IVA } from "@/lib/orcamento/listas-fechadas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DOCUMENTO DA PROPOSTA, À ENTRADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que o estúdio manda para a rota da proposta (`proposta-doc`) e para o
 * rascunho (`proposta-rascunho`): o documento SÓ COM O QUE VARIA. As listas
 * fixas (condições, observações, faseamento…) são postas depois, no servidor,
 * pelo `withProposalDefaults` — por isso aqui são opcionais, e o tipo
 * `ProposalDoc` (que as tem obrigatórias) não serve de esquema à entrada.
 *
 * ── PORQUE É QUE O TIPO NÃO SAI DAQUI (desvio ao §1.7) ────────────────────
 *
 * A regra de ouro é o tipo sair do esquema (`z.infer`). Aqui não pode: o
 * `ProposalDoc` é lido pelo estúdio, que corre no browser, e o zod não pode ir
 * no pacote do browser (a regra de custo da fase 6 de
 * `docs/ESTRUTURA-DO-CODIGO.md`: o que o browser descarrega não engorda).
 * Fica o contrário, preso pelo compilador: `esquemas.test.ts` («o tipo
 * ProposalDoc cabe no esquema») prova que tudo o que o tipo aceita, o esquema
 * também aceita — senão o modo de observar acusaria documentos certos.
 *
 * O esquema é LARGO de propósito: confere o tipo de cada campo que existe, e
 * deixa passar campos que não conhece (`looseObject`). Um campo novo no
 * estúdio não é um desvio; um número onde devia estar texto é.
 */

const texto = z.string();
const textoOpcional = z.string().optional();
const numeroOuNulo = z.number().nullable();

/** Uma fotografia é o caminho no armazenamento (ou um `data:` antigo). */
const fotografia = z.string();

const linhaDeServico = z.looseObject({
  id: textoOpcional,
  label: texto,
  labelEn: textoOpcional,
  desc: textoOpcional,
  descEn: textoOpcional,
});

export const esquemaDoGrupoDeServicos = z.looseObject({
  id: textoOpcional,
  letter: textoOpcional,
  title: texto,
  titleEn: textoOpcional,
  items: z.array(linhaDeServico),
});

export const esquemaDoMoodBoard = z.looseObject({
  title: texto,
  titleEn: textoOpcional,
  subtitulo: textoOpcional,
  subtituloEn: textoOpcional,
  images: z.array(fotografia),
  annotation: textoOpcional,
  annotationEn: textoOpcional,
});

const extraDoOrcamento = z.looseObject({
  label: texto,
  labelEn: textoOpcional,
  valueText: texto,
});

const linhaDoOrcamento = z.looseObject({ item: texto, price: texto });

const listaDeTextos = z.array(z.string());

/** O documento tal como o estúdio o manda (ver o cabeçalho). */
export const esquemaDoDocumentoQueChega = z.looseObject({
  template: z.enum(MODELOS_DO_DOCUMENTO).optional(),
  ref: texto,
  clientNames: texto,
  headerTitle: textoOpcional,
  headerTitleEn: textoOpcional,
  nomeDoFicheiro: textoOpcional,
  capaMesmoAssim: z.boolean().optional(),
  focoDaCapa: z.looseObject({ x: z.number(), y: z.number() }).optional(),
  paletaDela: listaDeTextos.optional(),
  eventType: textoOpcional,
  eventDate: textoOpcional,
  location: textoOpcional,
  kmDeslocacao: z.number().optional(),
  carrinhasDeslocacao: z.number().optional(),
  guests: textoOpcional,
  ceremony: textoOpcional,
  time: textoOpcional,
  servico: textoOpcional,
  servicoEn: textoOpcional,
  weddingPlanners: textoOpcional,
  serviceGroups: z.array(esquemaDoGrupoDeServicos).optional(),
  moodBoards: z.array(esquemaDoMoodBoard).optional(),
  budgetItems: listaDeTextos.optional(),
  budgetItemsEn: z.array(z.string().nullable()).optional(),
  budgetAmounts: z.array(numeroOuNulo).optional(),
  budgetCosts: z.array(numeroOuNulo).optional(),
  budgetOpcional: z.array(z.boolean()).optional(),
  budgetArtigos: z.array(z.string().nullable()).optional(),
  convidadosPorMesa: z.number().optional(),
  fotosDeBiblioteca: listaDeTextos.optional(),
  notasInternas: textoOpcional,
  notasPorSeccao: z.record(z.string(), z.string()).optional(),
  totalLabel: textoOpcional,
  totalLabelEn: textoOpcional,
  totalText: textoOpcional,
  budgetExtras: z.array(extraDoOrcamento).optional(),
  budgetExtrasSomam: z.boolean().optional(),
  budgetRows: z.array(linhaDoOrcamento).optional(),
  totalEstimatedText: textoOpcional,
  budgetNote: textoOpcional,
  budgetNoteEn: textoOpcional,
  totalAmount: z.number().optional(),
  totalVatMode: z.enum(MODOS_DE_IVA).optional(),
  vatRate: z.number().optional(),
  depositPercent: z.number().optional(),
  validUntil: textoOpcional,
  validUntilDays: z.number().optional(),
  coverImages: z.array(fotografia).optional(),
  notasImportantes: listaDeTextos.optional(),
  incluido: listaDeTextos.optional(),
  naoIncluido: listaDeTextos.optional(),
  condicoesGerais: listaDeTextos.optional(),
  observacoesGerais: listaDeTextos.optional(),
  faseamento: listaDeTextos.optional(),
  cancelamento: listaDeTextos.optional(),
});
