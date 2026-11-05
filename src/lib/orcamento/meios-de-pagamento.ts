/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS MEIOS DE PAGAMENTO, E COMO SE RECONHECEM NO QUE ELA ESCREVEU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (5/11): «aparece lá os meios de pagamento. Eu quero que tu coloques o
 * ícone de cada meio de pagamento para ficar mais profissional.»
 *
 * O método de um pagamento é TEXTO LIVRE (`Payment.note`): os habituais vêm
 * sugeridos, mas ela pode escrever o que quiser. Por isso o ícone sai de
 * reconhecer o texto, e não de um campo novo — os pagamentos já registados
 * ganham o ícone sem se lhes mexer.
 *
 * O que não se reconhece leva o ícone genérico (carteira): dentro de um grupo,
 * ou todos têm ícone ou nenhum tem (`docs/DESIGN-SYSTEM.md`, §8).
 */

export type MeioDePagamento =
  | "mbway"
  | "transferencia"
  | "numerario"
  | "multibanco"
  | "cheque"
  | "outro";

/** Os habituais, pela ordem em que aparecem como sugestão. */
export const MEIOS_HABITUAIS: { meio: Exclude<MeioDePagamento, "outro">; nome: string }[] = [
  { meio: "mbway", nome: "MB Way" },
  { meio: "transferencia", nome: "Transferência" },
  { meio: "numerario", nome: "Numerário" },
  { meio: "multibanco", nome: "Multibanco" },
  { meio: "cheque", nome: "Cheque" },
];

/** Sem acentos, minúsculas, sem espaços: «MB Way» e «mbway» são o mesmo. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s._-]+/g, "");
}

/**
 * O meio de pagamento que o texto nomeia, ou `null` se não há texto nenhum
 * (a linha mostra só o traço).
 */
export function meioDoTexto(texto: string | undefined | null): MeioDePagamento | null {
  const t = normalizar(texto ?? "");
  if (!t) return null;
  // MB Way antes do Multibanco: «MB Way» também começa por «mb».
  if (t.includes("mbway")) return "mbway";
  // Multibanco antes da transferência: «multibanco» tem «iban» lá dentro.
  if (t.includes("multibanco") || t.startsWith("mb") || t.includes("referencia") || t === "atm") {
    return "multibanco";
  }
  if (t.includes("transf") || t.includes("iban") || t.includes("bancaria")) return "transferencia";
  if (t.includes("numerario") || t.includes("dinheiro") || t.includes("cash")) return "numerario";
  if (t.includes("cheque")) return "cheque";
  return "outro";
}
