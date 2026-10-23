import { beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { withProposalDefaults, type ProposalDoc } from "@/lib/proposal-doc";
import { fotosDoEditorial, renderEditorialPdf, type Medida } from "./montar";
import { chavesDasPaginas, planoDaProposta } from "./plano";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A MINIATURA MOSTRA AS FOTOGRAFIAS QUE O PDF USA — E AS QUE ELA ESCOLHEU
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A colaboradora dela: as fotografias das miniaturas «não têm nada a ver» com as
 * do PDF. Este teste desenha o PDF a sério, com fotografias de TAMANHOS
 * DIFERENTES (é o tamanho que decide os separadores e os painéis), e exige que
 * o plano sem desenho — o que o estúdio pede para as miniaturas — dê, página a
 * página, exactamente as mesmas fotografias.
 *
 * As fotografias são fabricadas aqui — nenhuma foto de cliente entra num teste.
 */

vi.setConfig({ testTimeout: 240_000 });

/** Formas e tamanhos variados: deitadas, ao alto, quadradas, grandes e pequenas. */
const FORMAS: [number, number][] = [
  [600, 400],
  [400, 600],
  [900, 600],
  [500, 500],
  [300, 450],
  [1200, 800],
  [640, 480],
  [480, 720],
  [800, 600],
  [700, 1000],
  [1000, 700],
  [360, 540],
  [960, 640],
  [450, 300],
  [520, 780],
  [1100, 733],
];
const ref = (i: number) => `TESTE/foto-${i}.jpg`;
const b64 = new Map<string, string>();
const medidas = new Map<string, Medida>();

beforeAll(async () => {
  for (const [i, [w, h]] of FORMAS.entries()) {
    const cor = `#${(0x405060 + i * 0x0a0b0c).toString(16).slice(-6)}`;
    const bytes = await sharp({ create: { width: w, height: h, channels: 3, background: cor } })
      .jpeg({ quality: 60 })
      .toBuffer();
    b64.set(ref(i), bytes.toString("base64"));
    medidas.set(ref(i), { w, h });
  }
});

const refs = (de: number, n: number) => Array.from({ length: n }, (_, k) => ref(de + k));

/** O documento com CAMINHOS, como o estúdio o tem. */
function comCaminhos(p: Partial<ProposalDoc> = {}): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "TESTE",
    clientNames: "TESTE Ana & TESTE Rui",
    eventType: "Casamento",
    eventDate: "8 de julho de 2028",
    location: "Évora",
    coverImages: [ref(1)],
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração",
        items: [{ label: "Decoração Cerimónia" }, { label: "Decoração Cocktail" }],
      },
    ],
    moodBoards: [
      { title: "Decoração Cerimónia", images: refs(2, 3) },
      { title: "Decor Cocktail", images: refs(5, 4) },
      { title: "Mesas de Jantar", images: refs(9, 5) },
    ],
    budgetItems: ["Decoração Cerimónia", "Decoração Cocktail"],
    totalText: "3.200,00 € + IVA",
    totalAmount: 3200,
    totalVatMode: "acrescer",
    vatRate: 0.23,
    validUntil: "2026-11-27",
    ...p,
  } as ProposalDoc);
}

/**
 * O mesmo documento como o desenho o recebe: os bytes no lugar dos caminhos
 * (o que `resolveImages` faz), e os caminhos à parte, no mesmo lugar.
 */
function paraDesenhar(d: ProposalDoc) {
  const bytes = (r: string | null | undefined) => (r ? (b64.get(r) ?? "") : "");
  const paginas = Object.fromEntries(
    Object.entries(d.fotosDasPaginas ?? {}).map(([k, e]) => [k, e.fotos]),
  );
  return {
    doc: {
      ...d,
      coverImages: d.coverImages.map(bytes),
      moodBoards: d.moodBoards.map((b) => ({ ...b, images: b.images.map(bytes) })),
      fotosDasPaginas: Object.fromEntries(
        Object.entries(d.fotosDasPaginas ?? {}).map(([k, e]) => [
          k,
          { ...e, fotos: e.fotos.map(bytes) },
        ]),
      ),
    } as ProposalDoc,
    refs: {
      capa: d.coverImages,
      temas: d.moodBoards.map((b) => b.images),
      paginas,
    },
  };
}

async function asDuas(d: ProposalDoc) {
  const r = paraDesenhar(d);
  const desenhado = await renderEditorialPdf(r.doc, "pt", {}, { refs: r.refs, medidas });
  const plano = await fotosDoEditorial(d, "pt", medidas);
  return { desenhado: desenhado.fotos, plano };
}

describe("as fotografias de cada página: o plano é o PDF", () => {
  it("página a página, as mesmas fotografias nos mesmos lugares", async () => {
    const { desenhado, plano } = await asDuas(comCaminhos());
    expect(plano).toEqual(desenhado);
    // E há fotografia nos lugares que a pedem.
    expect(desenhado.indice[0].ref).toMatch(/^TESTE\//);
    expect(desenhado.total.length).toBe(1);
    // A paleta: cinco quadradas e o painel, no sexto lugar.
    expect(desenhado.ambiente.length).toBe(6);
  });

  it("as chaves das páginas são as do plano do estúdio, pela mesma ordem", async () => {
    const d = comCaminhos();
    const { desenhado } = await asDuas(d);
    expect(Object.keys(desenhado)).toEqual(chavesDasPaginas(planoDaProposta(d)));
  });

  it("o separador NÃO é «as duas primeiras do capítulo» (o que a miniatura mostrava)", async () => {
    const d = comCaminhos();
    const { desenhado } = await asDuas(d);
    const chave = chavesDasPaginas(planoDaProposta(d)).find((k) => k.startsWith("separador:"))!;
    const primeiras = d.moodBoards[0].images.slice(0, 2);
    expect(desenhado[chave].map((f) => f.ref)).not.toEqual(primeiras);
  });
});

describe("a fotografia que ela escolhe é a que sai", () => {
  it("o separador com UMA foto escolhida: a emoldurada e o fundo, essa", async () => {
    const d0 = comCaminhos();
    const chave = chavesDasPaginas(planoDaProposta(d0)).find((k) => k.startsWith("separador:"))!;
    const d = comCaminhos({ fotosDasPaginas: { [chave]: { fotos: [ref(13)] } } });
    const { desenhado, plano } = await asDuas(d);
    expect(desenhado[chave].map((f) => f.ref)).toEqual([ref(13)]);
    expect(plano).toEqual(desenhado);
  });

  it("um separador com DUAS escolhidas, e uma foto que não está em tema nenhum", async () => {
    const d0 = comCaminhos();
    const chave = chavesDasPaginas(planoDaProposta(d0)).find((k) => k.startsWith("separador:"))!;
    const d = comCaminhos({
      fotosDasPaginas: {
        [chave]: { fotos: [ref(0), ref(15)] },
        indice: { fotos: [ref(0)], focos: [{ x: 0.2, y: 0.8 }] },
      },
    });
    const { desenhado, plano } = await asDuas(d);
    expect(desenhado[chave].map((f) => f.ref)).toEqual([ref(0), ref(15)]);
    expect(desenhado.indice).toEqual([{ ref: ref(0), foco: { x: 0.2, y: 0.8 } }]);
    expect(plano).toEqual(desenhado);
  });

  it("uma escolhida que já não existe volta ao automático", async () => {
    const d = comCaminhos({ fotosDasPaginas: { indice: { fotos: ["TESTE/apagada.jpg"] } } });
    const sem = await fotosDoEditorial(comCaminhos(), "pt", medidas);
    const com = await fotosDoEditorial(d, "pt", medidas);
    expect(com.indice).toEqual(sem.indice);
  });
});
