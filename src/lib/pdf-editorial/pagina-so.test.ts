import { beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { withProposalDefaults, type ProposalDoc } from "@/lib/proposal-doc";
import { formasDasPaginas, textoDasPaginas } from "@/lib/paginas-do-pdf";
import { renderEditorialPdf, type Medida } from "./montar";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UMA PÁGINA SÓ É A MESMA PÁGINA DO PDF INTEIRO (A1, 2/11)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O estúdio mostra ao lado do formulário a página real que está a ser editada,
 * desenhada sozinha (`soPaginas`) para chegar em ~1 s em vez dos 5–12 do PDF
 * inteiro. A promessa é que é a MESMA página — as mesmas fotografias, o mesmo
 * texto, o mesmo número no rodapé —, e não uma parecida. Este teste desenha as
 * duas coisas e compara-as. (À mão, num Chromium, compararam-se também os
 * píxeis de cinco páginas: iguais.)
 *
 * As fotografias são fabricadas aqui — nenhuma foto de cliente entra num teste.
 */

vi.setConfig({ testTimeout: 240_000 });

const FORMAS: [number, number][] = [
  [2400, 1600],
  [1200, 1800],
  [1600, 1067],
  [900, 600],
  [2000, 3000],
  [1500, 1000],
  [800, 1200],
  [2200, 1467],
  [1300, 867],
  [1000, 1500],
  [2600, 1733],
  [700, 1050],
];
const ref = (i: number) => `TESTE/foto-${i}.jpg`;
const b64 = new Map<string, string>();
const medidas = new Map<string, Medida>();

beforeAll(async () => {
  for (const [i, [w, h]] of FORMAS.entries()) {
    const cor = `#${(0x506070 + i * 0x0b0a09).toString(16).slice(-6)}`;
    const bytes = await sharp({ create: { width: w, height: h, channels: 3, background: cor } })
      .jpeg({ quality: 60 })
      .toBuffer();
    b64.set(ref(i), bytes.toString("base64"));
    medidas.set(ref(i), { w, h });
  }
});

const refs = (de: number, n: number) => Array.from({ length: n }, (_, k) => ref(de + k));

function desenhar(soPaginas?: number[]) {
  const d = withProposalDefaults({
    template: "decoracao",
    ref: "TESTE",
    clientNames: "TESTE Ana & TESTE Rui",
    eventType: "Casamento",
    eventDate: "8 de julho de 2028",
    location: "Évora",
    coverImages: [ref(0)],
    serviceGroups: [
      { letter: "a)", title: "Decoração", items: [{ label: "Decoração Cerimónia" }] },
    ],
    moodBoards: [
      { title: "Decoração Cerimónia", images: refs(1, 4) },
      { title: "Mesas de Jantar", images: refs(5, 6) },
    ],
    budgetItems: ["Decoração Cerimónia"],
    totalText: "3.200,00 € + IVA",
    totalAmount: 3200,
    totalVatMode: "acrescer",
    vatRate: 0.23,
    validUntil: "2026-11-27",
  } as ProposalDoc);
  const bytes = (r: string | null | undefined) => (r ? (b64.get(r) ?? "") : "");
  return renderEditorialPdf(
    {
      ...d,
      coverImages: d.coverImages.map(bytes),
      moodBoards: d.moodBoards.map((b) => ({ ...b, images: b.images.map(bytes) })),
    } as ProposalDoc,
    "pt",
    soPaginas ? { soPaginas } : {},
    {
      refs: { capa: d.coverImages, temas: d.moodBoards.map((b) => b.images), paginas: {} },
      medidas,
    },
  );
}

describe("`soPaginas`: a página sozinha é a do PDF inteiro", () => {
  it("o mesmo texto, a mesma forma e as mesmas fotografias, página a página", async () => {
    const inteiro = await desenhar();
    const textos = await textoDasPaginas("teste:inteiro", async () => inteiro.bytes);
    const formas = await formasDasPaginas("teste:inteiro", async () => inteiro.bytes);
    expect(inteiro.paginas).toBe(textos.length);

    // A capa, uma do meio (os temas) e a última — três sítios diferentes do plano.
    for (const n of [1, Math.ceil(inteiro.paginas / 2), inteiro.paginas]) {
      const uma = await desenhar([n]);
      const chave = `teste:so-${n}`;
      const [texto] = await textoDasPaginas(chave, async () => uma.bytes);
      const [forma] = await formasDasPaginas(chave, async () => uma.bytes);
      expect((await formasDasPaginas(chave, async () => uma.bytes)).length).toBe(1);
      expect(texto).toBe(textos[n - 1]);
      expect(forma).toBeCloseTo(formas[n - 1], 6);
      // O plano corre inteiro: as fotografias e o total de páginas são os do PDF.
      expect(uma.fotos).toEqual(inteiro.fotos);
      expect(uma.paginas).toBe(inteiro.paginas);
    }
  });
});
