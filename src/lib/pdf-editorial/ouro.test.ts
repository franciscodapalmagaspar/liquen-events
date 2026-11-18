import { createHash } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { withProposalDefaults, type ProposalDoc } from "@/lib/proposal-doc";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O TESTE DE OURO DO PDF (fase 0 de `docs/ESTRUTURA-DO-CODIGO.md`, 17/11)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O `determinismo.test.ts` prova que duas gerações do mesmo documento dão os
 * mesmos bytes ENTRE SI. Não prova que dão os mesmos bytes que ONTEM: um
 * espaço, uma cor ou uma letra mudados no desenho continuavam verdes lá.
 *
 * Aqui o `sha256` de três PDFs fica PRESO. O sha256 é dos bytes inteiros, por
 * isso cobre tudo o que se desenha — páginas, texto, fotografias, letras,
 * índice, propriedades. As fases de arrumação do código não mudam um byte do
 * PDF (o desenho é dela e não se mexe sem a aprovação dela); se uma mudar,
 * isto fica vermelho e a fase não entra.
 *
 * Quando ELA aprovar uma mudança ao desenho, o número novo escreve-se aqui no
 * mesmo PR, com a razão no PR. Nunca para «pôr verde».
 *
 * As fotografias são fabricadas — nenhuma foto de cliente entra num teste.
 *
 * ── PORQUE SÓ EM LINUX x64 ────────────────────────────────────────────────
 *
 * As fotografias passam pelo `sharp` (libvips + mozjpeg), e os bytes de um
 * JPEG dependem da biblioteca compilada para a máquina. O CI e a Vercel são
 * Linux x64, e é lá que o número foi tirado; noutra máquina o teste salta,
 * em vez de ficar vermelho por uma razão que não é o desenho.
 *
 * ── E QUANDO SOBE UMA DEPENDÊNCIA QUE ESCREVE OS BYTES ────────────────────
 *
 * Pela mesma razão, subir o `sharp` (ou o libvips que ele traz, mesmo sem o
 * `sharp` mudar), o `pdf-lib`, o `@pdf-lib/fontkit` ou uma letra embutida pode
 * mudar os três números sem mudar um pixel do desenho — e não só pelas
 * fotografias fabricadas aqui: o próprio PDF passa cada fotografia pelo
 * `sharp`. Nesse PR, e só nesse, os números novos escrevem-se aqui depois de
 * ver as páginas lado a lado (antes e depois) e de dizer no PR que não há
 * diferença à vista. Num PR que não mexa em nenhuma delas (nem no
 * `package-lock.json`), um número diferente é o desenho que mudou.
 */

vi.setConfig({ testTimeout: 180_000 });

vi.mock("@/lib/fotos-editoriais-guardadas", () => ({
  lerFotoEditorialGuardada: async () => null,
  guardarFotoEditorial: async () => undefined,
}));

const { renderEditorialPdf } = await import("./montar");

const CORES = ["#7a8a6a", "#c9a37a", "#5a6a7a", "#8a5a4a", "#4a7a6a", "#a08ab0", "#b0a060"];
let FOTOS: string[] = [];

beforeAll(async () => {
  // Só o relógio: as datas «de hoje» (validade, rodapé) ficam sempre as
  // mesmas, e os temporizadores continuam a ser os verdadeiros.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T10:00:00Z"));
  FOTOS = await Promise.all(
    CORES.map(async (cor, i) => {
      const [w, h] = [
        [900, 600],
        [500, 750],
        [700, 700],
      ][i % 3];
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${cor}"/><stop offset="1" stop-color="#222"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
      const b = await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
      return b.toString("base64");
    }),
  );
});

afterAll(() => {
  vi.useRealTimers();
});

/** Um casamento, em português, com dois temas. */
function casamento(): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "TESTE",
    clientNames: "TESTE Ana Sousa & TESTE Rui Matos",
    eventType: "Casamento",
    eventDate: "8 de julho de 2028",
    location: "Évora · Exterior",
    guests: "50 a 100",
    ceremony: "Civil",
    coverImages: [FOTOS[0]],
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração Floral e Decoração",
        items: [{ label: "Decoração Cerimónia" }, { label: "Decoração Mesas Jantar" }],
      },
    ],
    moodBoards: [
      { title: "Decoração Cerimónia", images: FOTOS.slice(1, 4) },
      { title: "Mesas de Jantar", images: FOTOS.slice(3), annotation: "TESTE nota." },
    ],
    budgetItems: ["Decoração Cerimónia", "Decoração Mesas Jantar"],
    totalLabel: "Valor Total Decoração",
    totalText: "3.200,00 € + IVA",
    totalAmount: 3200,
    totalVatMode: "acrescer",
    vatRate: 0.23,
    depositPercent: 30,
    validUntil: "2026-11-27",
  } as ProposalDoc);
}

/** Um evento que não é casamento, em inglês, com IVA incluído. */
function aniversario(): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "TESTE-2",
    clientNames: "TESTE Marta Lopes",
    eventType: "Aniversário",
    eventDate: "3 de março de 2028",
    location: "Lisboa · Interior",
    guests: "80 pax",
    ceremony: "",
    coverImages: [FOTOS[2], FOTOS[5]],
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração",
        items: [{ label: "Mesa principal", desc: "TESTE flores da estação" }, { label: "Entrada" }],
      },
    ],
    moodBoards: [{ title: "Mesa principal", images: FOTOS.slice(0, 5) }],
    budgetItems: ["Mesa principal", "Entrada"],
    totalLabel: "Valor Total Decoração",
    totalText: "1.845,00 €",
    totalAmount: 1845,
    totalVatMode: "incluido",
    vatRate: 0.23,
    depositPercent: 50,
    validUntil: "2026-12-01",
  } as ProposalDoc);
}

/** Um casamento com adicionais que somam, três temas, e em rascunho. */
function casamentoComAdicionais(): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "TESTE-3",
    clientNames: "TESTE Inês & TESTE Tomás",
    eventType: "Casamento",
    eventDate: "19 de setembro de 2027",
    location: "Sintra · Interior e exterior",
    guests: "150 a 200",
    ceremony: "Religiosa",
    coverImages: [FOTOS[4]],
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração Floral e Decoração",
        items: [
          { label: "Decoração Cerimónia" },
          { label: "Cocktail" },
          { label: "Decoração Mesas Jantar" },
        ],
      },
    ],
    moodBoards: [
      { title: "Decoração Cerimónia", images: FOTOS.slice(0, 3) },
      { title: "Cocktail", images: FOTOS.slice(2, 5) },
      { title: "Mesas de Jantar", images: FOTOS.slice(4), annotation: "TESTE nota longa." },
    ],
    budgetItems: ["Decoração Cerimónia", "Cocktail", "Decoração Mesas Jantar"],
    budgetExtras: [
      { label: "Deslocação da equipa Líquen", valueText: "140,00 € + IVA" },
      { label: "Montagem nocturna", valueText: "a definir" },
    ],
    budgetExtrasSomam: true,
    totalLabel: "Valor Total Decoração",
    totalText: "3.000,00 € + IVA",
    totalAmount: 3000,
    totalVatMode: "acrescer",
    vatRate: 0.23,
    depositPercent: 30,
    validUntil: "2026-11-30",
  } as ProposalDoc);
}

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const criadoEm = new Date("2026-11-17T10:00:00Z");
const ondeFoiMedido = process.platform === "linux" && process.arch === "x64";

describe.runIf(ondeFoiMedido)("o PDF não muda nem um byte (teste de ouro)", () => {
  it("casamento, em português", async () => {
    const r = await renderEditorialPdf(casamento(), "pt", { criadoEm });
    expect(r.undrawnImages).toBe(0);
    expect({ paginas: r.paginas, sha256: sha(r.bytes) }).toEqual(OURO.casamento);
  });

  it("aniversário, em inglês, com IVA incluído", async () => {
    const r = await renderEditorialPdf(aniversario(), "en", { criadoEm });
    expect(r.undrawnImages).toBe(0);
    expect({ paginas: r.paginas, sha256: sha(r.bytes) }).toEqual(OURO.aniversario);
  });

  it("casamento com adicionais que somam, em rascunho", async () => {
    const r = await renderEditorialPdf(casamentoComAdicionais(), "pt", {
      criadoEm,
      rascunho: true,
    });
    expect(r.undrawnImages).toBe(0);
    expect({ paginas: r.paginas, sha256: sha(r.bytes) }).toEqual(OURO.comAdicionais);
  });
});

/** Medido a 17/11 sobre `main` (1f15511d), Linux x64. */
const OURO = {
  casamento: {
    paginas: 16,
    sha256: "16e3db1747b9280ca0c4601a4c8ff22114854f80f568cc3f431a144aaf6aeb22",
  },
  aniversario: {
    paginas: 14,
    sha256: "7cf60c579ba2c4a96ecc28a0adcfa88d6689e2271eda9406e71ea4b05926fc8e",
  },
  comAdicionais: {
    paginas: 18,
    sha256: "dd2c192abc98a57b5d0332340c4f76a8b716cb39fa601939ff22831e0b991aaf",
  },
};
