import type { MaterialItem, MaterialKind } from "@/lib/material-types";
import { MATERIAL_CATEGORIES } from "@/lib/material-types";

/*
 * O formulário de um item do catálogo de material (o estado, o vazio, e as
 * duas conversões de e para o pedido) — saiu do `Material.tsx` tal e qual,
 * para o ficheiro caber no tecto da catraca (`test/tamanho-dos-ficheiros.test.ts`).
 */

export interface FormState {
  name: string;
  category: string;
  kind: MaterialKind;
  unit: string;
  stock: string;
  minStock: string;
  notes: string;
}

export const EMPTY_FORM: FormState = {
  name: "",
  category: MATERIAL_CATEGORIES[0],
  kind: "reutilizavel",
  unit: "unidade",
  stock: "1",
  minStock: "",
  notes: "",
};

export function fromItem(i: MaterialItem): FormState {
  return {
    name: i.name,
    category: i.category,
    kind: i.kind,
    unit: i.unit ?? "",
    stock: String(i.stock),
    minStock: typeof i.minStock === "number" ? String(i.minStock) : "",
    notes: i.notes ?? "",
  };
}

export function toPayload(f: FormState) {
  const min = f.minStock.trim();
  return {
    name: f.name.trim(),
    category: f.category,
    kind: f.kind,
    unit: f.unit.trim(),
    stock: Math.max(0, Number(f.stock.replace(",", ".")) || 0),
    // Vazio vai como `null` — a instrução "não vigies este item" — e não como
    // 0, que seria "avisa-me quando houver menos do que nenhum".
    minStock: min === "" ? null : Math.max(0, Number(min.replace(",", ".")) || 0),
    notes: f.notes.trim(),
  };
}
