import type { FaseDaFatura, ParcelaDoArtigo } from "./artigos-de-faturacao";
import { refDoArtigo, totalComIvaNoMoloni } from "./artigos-de-faturacao";
import { round2 } from "@/lib/money";

/**
 * O que se pode mostrar e copiar: as duas fases que se faturam, e o TOTAL
 * (100%), que só se copia ou manda por WhatsApp — não é uma fatura no Moloni
 * (pedido do Francisco, 19/11: «um para 100%, para ser enviado por WhatsApp»).
 */
export type ParteDaFatura = FaseDaFatura | "total";

/** O rótulo de cada parte, com a percentagem: «Sinal 30%», «Saldo 70%», «Total 100%». */
export function rotuloDaParte(parte: ParteDaFatura, pct: number): string {
  if (parte === "sinal") return `Sinal ${pct}%`;
  if (parte === "saldo") return `Saldo ${100 - pct}%`;
  return "Total 100%";
}

/**
 * Euros para COLAR no Moloni: sem separador de milhares (um espaço inquebrável
 * no meio do número pode não ser aceite no campo do preço). Só este texto.
 */
const eurParaColar = (n: number): string =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(n || 0);

/** O texto a copiar para o Moloni à mão, quando a ligação não está feita. */
export function textoDaFatura(
  partes: ParcelaDoArtigo[],
  fase: ParteDaFatura,
  pct: number,
  vatRate: number,
  cliente?: { nome?: string; nif?: string },
): string {
  const titulo =
    fase === "sinal"
      ? `Sinal (${pct}%)`
      : fase === "saldo"
        ? `Saldo (${100 - pct}%)`
        : "Total (100%)";
  const total = round2(partes.reduce((s, p) => s + p.valor, 0));
  const nome = cliente?.nome?.trim();
  const nif = cliente?.nif?.replace(/\s/g, "");
  const quem = [nome, nif ? `NIF ${nif}` : ""].filter(Boolean).join(" · ");
  return [
    ...(quem ? [`Cliente: ${quem}`] : []),
    `${titulo} — valores sem IVA (IVA ${Math.round(vatRate * 100)}%):`,
    ...partes.map((p) => `${refDoArtigo(p.artigo)} · ${p.nome}: ${eurParaColar(p.valor)}`),
    `Total sem IVA: ${eurParaColar(total)}`,
    // Para conferir no Moloni de um relance (ele calcula o IVA linha a linha:
    // pode diferir 1 cêntimo).
    `Total com IVA: ${eurParaColar(totalComIvaNoMoloni(partes, vatRate))}`,
  ].join("\n");
}
