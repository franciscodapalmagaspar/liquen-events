import { describe, it, expect } from "vitest";
import { oQueFaltaParaEnviar } from "@/lib/proposal-progress";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { TRAVAM_NO_SERVIDOR, TRAVAM_O_PDF_FINAL } from "./travas-do-envio";

/**
 * As listas de travas da rota (`travas-do-envio.ts`) são ids que a REGRA
 * (`oQueFaltaParaEnviar`) emite. Nada no tipo os prende — `Impedimento.id` é
 * texto —, por isso prende-os este teste, pelo comportamento: em documentos
 * feitos para cada falta, a regra tem de emitir CADA id das listas, a travar.
 * Um id renomeado na regra, ou mal escrito aqui, deixava a rota a deixar
 * passar em silêncio o que o estúdio trava.
 */
describe("as travas da rota são ids que a regra emite", () => {
  it("cada id das duas listas sai da regra, a travar", () => {
    const base = {
      template: "decoracao",
      ref: "R",
      clientNames: "A",
      eventDate: "3 de julho de 2027",
      serviceGroups: [],
      moodBoards: [],
      budgetItems: ["A"],
      budgetAmounts: [100],
      budgetArtigos: ["flores"],
      totalAmount: 100,
      totalVatMode: "acrescer",
      coverImages: [],
    };
    const casos: [Record<string, unknown>, Record<string, unknown>?][] = [
      [
        {
          ref: "",
          clientNames: "",
          totalAmount: 0,
          eventDate: "",
          validUntil: "2020-01-01",
          condicoesGerais: [],
        },
      ],
      [{ budgetItems: [] }],
      [{ budgetAmounts: [null], budgetArtigos: [null] }],
      [{ budgetAmounts: [50] }],
      [
        { fotosDasPaginas: { indice: { fotos: ["tema:x/y.jpg"] } } },
        {
          fotosEscolhidasQueFaltam: [
            { ref: "tema:x/y.jpg", pagina: "Cerimónia", tema: "Natal", naReciclagem: true },
          ],
        },
      ],
      [
        {
          moodBoards: Array.from({ length: 85 }, (_, i) => ({ title: `Tema ${i}`, images: [] })),
          fotosDasPaginas: Object.fromEntries(
            Array.from({ length: 85 }, (_, i) => [`tema:${i}`, { fotos: [`TESTE/t${i}.jpg`] }]),
          ),
        },
      ],
    ];
    const emitidos = new Set<string>();
    for (const [doc, ctx] of casos) {
      const faltas = oQueFaltaParaEnviar({ ...base, ...doc } as unknown as ProposalDoc, 0, {
        idioma: "pt",
        canal: "email",
        emailDoCliente: "",
        pdfVisto: false,
        ...ctx,
      });
      for (const f of faltas) if (f.trava) emitidos.add(f.id);
    }
    for (const id of [...TRAVAM_NO_SERVIDOR, ...TRAVAM_O_PDF_FINAL]) {
      expect(emitidos, `a regra não emite «${id}»`).toContain(id);
    }
  });
});
