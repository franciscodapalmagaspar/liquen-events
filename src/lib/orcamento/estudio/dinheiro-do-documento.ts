/*
 * O dinheiro do documento do estúdio: pôr a base, lê-la, e copiar só os campos
 * que decidem o dinheiro. Saiu do `ProposalStudio.tsx` tal e qual (fase 3 de
 * `docs/ESTRUTURA-DO-CODIGO.md`).
 */

import {
  resolveProposalMoney,
  totalAmountParaBase,
  detectVatMode,
  DEFAULT_VAT_RATE,
  type VatMode,
} from "@/lib/proposal-doc";
import { eur } from "@/lib/money";
import type { StudioDoc } from "./documento-inicial";

/**
 * O modo de IVA em que o estúdio mostra e escreve o total.
 *
 * O `detectVatMode` devolve "incluido" quando não há texto nenhum para ler —
 * é a retrocompatibilidade com propostas antigas só com «3.000,00 €». Mas um
 * documento ACABADO DE COMEÇAR também não tem texto, e caía nessa mesma porta:
 * nascia em «IVA incluído», que é o modo que a casa deixou de usar. A detecção
 * fica onde serve — havendo texto livre, é ele que manda.
 */
export function modoDeIvaDoDocumento(
  d: Pick<StudioDoc, "totalVatMode" | "totalText" | "totalEstimatedText">,
): VatMode {
  const texto = d.totalText || d.totalEstimatedText;
  return d.totalVatMode ?? (texto ? detectVatMode(texto) : "acrescer");
}

/**
 * Põe a BASE (o "Preço final (sem IVA)" do pedido) no documento, respeitando o
 * modo de IVA em vigor.
 *
 * `resolveProposalMoney` lê `totalAmount` como a base em "acrescer" e como o
 * BRUTO em "incluído" — por isso o valor guardado tem de ser derivado, para a
 * base ser sempre o número do pedido nos dois modos.
 */
export function aplicarBase(d: StudioDoc, base: number): StudioDoc {
  const mode = modoDeIvaDoDocumento(d);
  const rate = d.vatRate ?? DEFAULT_VAT_RATE;
  // A conta é a partilhada, e não uma cópia: arredondar a base ANTES de a
  // multiplicar é o que faz base → bruto → base devolver o mesmo número. Feita
  // à mão aqui, uma base com mais de dois decimais perdia um cêntimo em cada
  // ida e volta, e o campo mudava sozinho debaixo dos dedos dela.
  const amount = totalAmountParaBase(base, mode, rate);
  const text = mode === "acrescer" ? `${eur(amount)} + IVA` : eur(amount);
  return d.template === "organizacao"
    ? { ...d, totalAmount: amount, totalVatMode: mode, totalEstimatedText: text }
    : { ...d, totalAmount: amount, totalVatMode: mode, totalText: text };
}

/**
 * A BASE (sem IVA) de um documento, seja qual for o modo.
 *
 * O campo do estúdio mostra SEMPRE a base — é o número que o pedido guarda e o
 * que o rótulo "(sem IVA)" promete. Mas `totalAmount` só é a base em modo
 * "acrescer"; em "incluído" é o BRUTO. Encher o campo com o valor cru mostrava
 * 9963 onde o pedido dizia 8100. Medido.
 */
export function baseDoDoc(d: Partial<StudioDoc>): number | undefined {
  const m = resolveProposalMoney(d as StudioDoc);
  return m.base > 0 ? m.base : undefined;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS CAMPOS QUE DECIDEM O DINHEIRO — E SÓ ESSES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É o conjunto exacto que `totaisDaProposta` lê para desenhar o quadro do PDF:
 * o valor, o modo e a taxa de IVA, os textos de display, as linhas adicionais e
 * a regra com que elas contam, e a percentagem do sinal. Nada mais.
 *
 * Existe para repor o dinheiro de uma proposta ENVIADA sem lhe repor o resto: o
 * texto, as fotografias e os mood boards podem ter sido escritos DEPOIS do
 * envio, são trabalho dela, e nunca estiveram em causa. «Se falhar, não perder
 * trabalho» é a regra da casa, e trocar o documento inteiro para acertar um
 * número era perdê-lo.
 *
 * Os campos são copiados MESMO QUANDO NÃO EXISTEM no documento enviado (fica
 * `undefined`), e é de propósito: uma proposta que seguiu sem `vatRate` não
 * pode ficar com a taxa que o rascunho deste aparelho entretanto ganhou.
 */
const CAMPOS_DO_DINHEIRO = [
  "totalAmount",
  "totalVatMode",
  "vatRate",
  "totalText",
  "totalEstimatedText",
  "budgetExtras",
  "budgetExtrasSomam",
  "depositPercent",
] as const;

export function dinheiroDoDocumento(d: Partial<StudioDoc>): Partial<StudioDoc> {
  const saida: Record<string, unknown> = {};
  const origem = d as unknown as Record<string, unknown>;
  for (const campo of CAMPOS_DO_DINHEIRO) saida[campo] = origem[campo];
  return saida as Partial<StudioDoc>;
}
