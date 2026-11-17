/**
 * As duas PORTAS do orquestrador (`atender-o-estudio.ts`, `Porta`): o que cada
 * uma escolhe — a trava, a segunda passagem do desenho, o rascunho. Provado
 * com as etapas espiadas, sem a rota: é a regra que o retrato também prende,
 * mas que tem de sobreviver ao dia em que o retrato encolher (desvio 8).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Quote } from "@/lib/orcamento/types";
import { log } from "@/lib/logger";

const espias = vi.hoisted(() => ({
  travaDoEnvio: vi.fn(),
  travaDoPdfFinal: vi.fn(),
  desenharOPdf: vi.fn(),
}));
vi.mock("./travas-do-envio", () => ({
  travaDoEnvio: espias.travaDoEnvio,
  travaDoPdfFinal: espias.travaDoPdfFinal,
}));
vi.mock("./desenhar-o-pdf", () => ({ desenharOPdf: espias.desenharOPdf }));

import { atenderOEstudio, type Contexto } from "./atender-o-estudio";
import { corpoLido } from "./ler-o-corpo";
import { paraComRecusa, SEGUE } from "./passo";
import { __limparTrincosEmMemoria } from "@/lib/trinco";

const doc = { ref: "PO", clientNames: "Maria & Zé", coverImages: [] };
const contexto = (corpo: unknown): Contexto => ({
  pedidoId: "q1",
  quote: { id: "q1", email: "c@x.pt", status: "pendente" } as Quote,
  corpo: corpoLido(corpo),
  resta: () => 60_000,
  assinatura: () => ({ nome: "", cargo: "" }),
  depoisDaResposta: vi.fn(),
});
/** Um desenho com uma foto em falta: o envio pára na pergunta, logo a seguir. */
const desenhoComUmaFotoEmFalta = {
  relatorio: { pdf: Buffer.from("%PDF"), missingImages: 1, truncations: [] },
  pdfDaMemoria: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  __limparTrincosEmMemoria();
  vi.spyOn(log, "warn").mockImplementation(() => {});
  espias.travaDoEnvio.mockResolvedValue(SEGUE);
  espias.travaDoPdfFinal.mockResolvedValue(SEGUE);
  espias.desenharOPdf.mockResolvedValue(desenhoComUmaFotoEmFalta);
});

describe("a porta da pré-visualização", () => {
  it("o rascunho não trava, sai marcado, e não repete o desenho", async () => {
    await atenderOEstudio(contexto({ mode: "preview", rascunho: true, doc }));
    expect(espias.travaDoPdfFinal).not.toHaveBeenCalled();
    expect(espias.travaDoEnvio).not.toHaveBeenCalled();
    expect(espias.desenharOPdf).toHaveBeenCalledWith(
      expect.objectContaining({ rascunho: true, segundaPassagem: false }),
    );
  });

  it("o PDF final passa pela trava do PDF final — nunca pela do envio", async () => {
    await atenderOEstudio(contexto({ mode: "preview", doc }));
    expect(espias.travaDoPdfFinal).toHaveBeenCalledTimes(1);
    expect(espias.travaDoEnvio).not.toHaveBeenCalled();
    expect(espias.desenharOPdf).toHaveBeenCalledWith(
      expect.objectContaining({ rascunho: false, segundaPassagem: false }),
    );
  });

  it("o que a trava recusa não chega a ser desenhado", async () => {
    espias.travaDoPdfFinal.mockResolvedValue(paraComRecusa(422, { error: "faltam os preços" }));
    const d = await atenderOEstudio(contexto({ mode: "preview", doc }));
    expect(d).toEqual({
      tipo: "recusa",
      recusa: { status: 422, corpo: { error: "faltam os preços" } },
    });
    expect(espias.desenharOPdf).not.toHaveBeenCalled();
  });
});

describe("a porta do envio", () => {
  it("passa pela trava do envio, com a chave do que chegou, e pode repetir o desenho", async () => {
    await atenderOEstudio(contexto({ mode: "send", doc, pdfVisto: "k" }));
    expect(espias.travaDoEnvio).toHaveBeenCalledWith(
      expect.objectContaining({
        pdfVisto: "k",
        porEmail: true,
        chaveDoQueChegou: expect.any(String),
      }),
    );
    expect(espias.travaDoPdfFinal).not.toHaveBeenCalled();
    expect(espias.desenharOPdf).toHaveBeenCalledWith(
      expect.objectContaining({ rascunho: false, segundaPassagem: true }),
    );
  });

  it("nunca desenha um rascunho, mesmo que o corpo o peça", async () => {
    await atenderOEstudio(contexto({ mode: "send", doc, rascunho: true }));
    expect(espias.desenharOPdf).toHaveBeenCalledWith(expect.objectContaining({ rascunho: false }));
  });
});
