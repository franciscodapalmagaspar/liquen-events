/**
 * O orquestrador sozinho, sem a rota nem o Next (fase 5): recebe o pedido e
 * o corpo já lidos e devolve um `Desfecho` com tipo. A rota inteira está
 * provada nos retratos de `route.caracterizacao.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Quote } from "@/lib/orcamento/types";
import { log } from "@/lib/logger";

vi.mock("@/lib/proposal-doc-render", () => ({
  renderStoredEditorialPdfWithReport: vi.fn(async () => ({
    pdf: Buffer.from("%PDF"),
    missingImages: 0,
    truncations: [],
  })),
}));
vi.mock("@/lib/proposta-fotos-verificacao", () => ({ fotosEscolhidasQueFaltam: async () => [] }));

import { atenderOEstudio, type Contexto } from "./atender-o-estudio";
import { corpoLido } from "./ler-o-corpo";
import { __limparTrincosEmMemoria, fecharTrinco } from "@/lib/trinco";
import { esvaziarPdfsFinais } from "@/lib/proposal-preview-cache";

const doc = {
  template: "decoracao",
  ref: "PO",
  clientNames: "Maria & Zé",
  eventDate: "3 de julho de 2027",
  serviceGroups: [],
  moodBoards: [],
  budgetItems: ["Decoração"],
  budgetAmounts: [3000],
  budgetArtigos: ["flores"],
  totalAmount: 3000,
  totalVatMode: "acrescer",
  coverImages: [],
};
const contexto = (corpo: unknown): Contexto => ({
  pedidoId: "q1",
  quote: { id: "q1", email: "c@x.pt", status: "pendente" } as Quote,
  corpo: corpoLido(corpo),
  resta: () => 60_000,
  agora: () => new Date(),
  assinatura: () => ({ nome: "", cargo: "" }),
  depoisDaResposta: vi.fn(),
});

beforeEach(() => {
  __limparTrincosEmMemoria();
  esvaziarPdfsFinais();
  vi.spyOn(log, "warn").mockImplementation(() => {});
});

describe("atenderOEstudio", () => {
  it("a pré-visualização devolve o PDF e os cabeçalhos — sem trinco", async () => {
    await fecharTrinco("envio-da-proposta:q1", 60_000); // um envio a decorrer não a trava
    const d = await atenderOEstudio(contexto({ mode: "preview", doc }));
    expect(d.tipo).toBe("pdf");
    if (d.tipo === "pdf") {
      expect(d.cabecalhos["Content-Type"]).toBe("application/pdf");
      expect(d.cabecalhos["X-Chave-Do-Pdf"]).toMatch(/\S/);
    }
  });

  it("um envio com outro a decorrer é uma recusa 409 «a ser enviada»", async () => {
    await fecharTrinco("envio-da-proposta:q1", 60_000);
    const d = await atenderOEstudio(contexto({ mode: "send", doc }));
    expect(d).toMatchObject({ tipo: "recusa", recusa: { status: 409, corpo: { aEnviar: true } } });
  });

  it("um documento incompleto é uma recusa 400 que diz o que falta — e solta o trinco", async () => {
    const d = await atenderOEstudio(contexto({ mode: "send", doc: { ...doc, ref: "" } }));
    expect(d).toEqual({
      tipo: "recusa",
      recusa: { status: 400, corpo: { error: "Proposta incompleta: falta a referência." } },
    });
    expect((await fecharTrinco("envio-da-proposta:q1", 60_000)).ok).toBe(true);
  });

  it("um envio sem o PDF visto pára na trava, antes de desenhar", async () => {
    const d = await atenderOEstudio(contexto({ mode: "send", doc }));
    expect(d).toMatchObject({ tipo: "recusa", recusa: { status: 422 } });
  });
});
