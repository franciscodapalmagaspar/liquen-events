/**
 * O CUSTO DA FRONTEIRA, MEDIDO (regra 7) — `npx vitest bench src/lib/fronteira`.
 *
 * Fora do `vitest run` de propósito: um CI carregado não pode pôr um PR a
 * vermelho por uma pausa do GC. Os números ficam num sítio só —
 * `docs/ESTRUTURA-DO-CODIGO.md`, Parte −1, linha da fase 6 —, e este ficheiro
 * é como se voltam a medir.
 */
import { bench, describe } from "vitest";
import { esquemaDoCorpo } from "@/lib/orcamento/envio/ler-o-corpo";
import { esquemaDoPedidoGuardado } from "./pedido-guardado";

/** Uma proposta grande: 12 grupos de 10 linhas, 10 mood boards de 8 fotos. */
const docGrande = {
  ref: "PO",
  clientNames: "A & B",
  serviceGroups: Array.from({ length: 12 }, (_, g) => ({
    title: `G${g}`,
    items: Array.from({ length: 10 }, (_, i) => ({ label: `L${i}`, desc: "texto ".repeat(20) })),
  })),
  moodBoards: Array.from({ length: 10 }, (_, b) => ({
    title: `B${b}`,
    images: Array.from({ length: 8 }, (_, i) => `temas/${b}/f-${i}.jpg`),
  })),
  budgetItems: Array.from({ length: 20 }, (_, i) => `I${i}`),
  budgetAmounts: Array.from({ length: 20 }, (_, i) => (i % 3 ? i * 100 : null)),
  coverImages: ["c.jpg"],
};

/** Um pedido com histórico (30 linhas). */
const pedido = {
  id: "LIQ-X",
  status: "cotado",
  submittedAt: "2026-01-01T00:00:00.000Z",
  name: "N",
  email: "e@x.pt",
  phone: "1",
  date: "2027-01-01",
  location: "L",
  notes: "",
  activityLog: Array.from({ length: 30 }, () => ({ at: "x", kind: "nota" })),
};

describe("a fronteira", () => {
  bench("o corpo de um envio grande", () => {
    esquemaDoCorpo.safeParse({ mode: "send", doc: docGrande });
  });
  bench("um pedido guardado", () => {
    esquemaDoPedidoGuardado.safeParse(pedido);
  });
  bench("(referência) o JSON do mesmo documento, ida e volta", () => {
    JSON.parse(JSON.stringify(docGrande));
  });
});
