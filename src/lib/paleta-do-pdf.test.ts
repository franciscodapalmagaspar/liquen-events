import { beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { withProposalDefaults, type ProposalDoc } from "@/lib/proposal-doc";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A MESMA PALETA NO PDF, NA PROPOSTA ONLINE E NO «FAZER PROPOSTA»
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Defeito de 13/11 (PR #440): a mesma proposta TESTE dava, no PDF,
 * `#E5B56B #AFA385 #B87134 #516B2C #933357`; na proposta online
 * `E4C07B B3A387 CF843E 526C2B 953559`; e na sugestão do estúdio outras, por
 * outra ordem. A regra era a mesma; os BYTES não — o PDF lia a versão
 * editorial, a online a versão média, o estúdio o que o navegador
 * descodificava.
 *
 * Aqui, para o mesmo conjunto de fotografias (com flores: rosa, laranja,
 * bordeaux, folhagem, linho e madeira), as três têm de dar EXACTAMENTE as
 * mesmas cores, pela mesma ordem. A versão média existe de propósito (com
 * outros bytes, como no armazenamento): quem a ler, discorda do PDF.
 */

vi.setConfig({ testTimeout: 240_000 });

vi.mock("@/lib/app-state", () => ({
  getState: vi.fn(async () => null),
  setState: vi.fn(async () => ({ gravado: true })),
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));

/** Os bytes de cada fotografia como o PDF os desenha (a versão editorial). */
const editorial = new Map<string, Buffer>();
/** A versão média de cada uma (o que a proposta online lia antes). */
const media = new Map<string, Buffer>();
const medidas = new Map<string, { w: number; h: number }>();

vi.mock("@/lib/proposal-doc-render", async (original) => {
  const real = await original<typeof import("@/lib/proposal-doc-render")>();
  return {
    ...real,
    // O que o servidor lê para a paleta: os bytes que o PDF desenha.
    bytesDaFotoNoPdf: vi.fn(async (ref: string) => editorial.get(ref) ?? null),
  };
});
vi.mock("@/lib/proposal-storage", async (original) => {
  const real = await original<typeof import("@/lib/proposal-storage")>();
  return {
    ...real,
    bytesDeImagemPorEndereco: vi.fn(async (url: string) => {
      const ref = [...media.keys()].find((r) => url.includes(encodeURIComponent(r)));
      return ref ? media.get(ref)! : null;
    }),
  };
});

/** As cores que o PDF desenhou na página da paleta, chamada a chamada. */
const doPdf: string[][] = [];
vi.mock("@/lib/pdf-editorial/paleta-das-fotos", async (original) => {
  const real = await original<typeof import("@/lib/pdf-editorial/paleta-das-fotos")>();
  return {
    ...real,
    paletaDasFotos: async (fotos: readonly Buffer[]) => {
      const cores = await real.paletaDasFotos(fotos);
      doPdf.push(cores);
      return cores;
    },
  };
});

const { renderEditorialPdf, conteudoDoEditorial, planoDoEditorial } =
  await import("@/lib/pdf-editorial/montar");
const { montarPropostaWeb } = await import("@/lib/proposta-web/modelo");
const { textosWeb } = await import("@/lib/proposta-web/textos-web");
const { inventarioDeFotos } = await import("@/lib/proposta-fotos");
const { POST } = await import("@/app/api/orcamento/[id]/paleta-do-pdf/route");
const { esquecerGuardados } = await import("@/lib/proposta-web/guardado");

const ref = (n: number) => `TESTE/flores-${n}.jpg`;
const refs = Array.from({ length: 6 }, (_, i) => ref(i));

/**
 * Uma mesa com flores: linho em cima, madeira em baixo, e flores redondas
 * com um degradê (para a redução de cada versão dar píxeis diferentes).
 */
function mesa(i: number): string {
  const flores = ["#D98AA6", "#E08A3C", "#8C2F45", "#E8C46A", "#B07AC0"];
  const circulos = Array.from({ length: 14 }, (_, k) => {
    const x = 120 + ((k * 197 + i * 61) % 1560);
    const y = 420 + ((k * 89 + i * 37) % 520);
    const r = 40 + ((k * 13 + i * 7) % 70);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#g${(k + i) % flores.length})"/>`;
  }).join("");
  const grads = flores
    .map(
      (c, k) =>
        `<radialGradient id="g${k}"><stop offset="0" stop-color="#fff8f0"/><stop offset="0.35" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity="0.85"/></radialGradient>`,
    )
    .join("");
  const folhas = Array.from({ length: 10 }, (_, k) => {
    const x = 80 + ((k * 173 + i * 41) % 1640);
    const y = 520 + ((k * 61 + i * 23) % 420);
    return `<ellipse cx="${x}" cy="${y}" rx="${70 + (k % 3) * 20}" ry="28" fill="#5A7A35" transform="rotate(${(k * 37) % 180} ${x} ${y})"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200">
    <defs>${grads}<linearGradient id="linho" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EDE3D1"/><stop offset="1" stop-color="#D9CBB3"/></linearGradient></defs>
    <rect width="1800" height="1200" fill="url(#linho)"/>
    <rect y="980" width="1800" height="220" fill="#6B4A2E"/>
    ${folhas}${circulos}
  </svg>`;
}

beforeAll(async () => {
  for (const [i, r] of refs.entries()) {
    const bytes = await sharp(Buffer.from(mesa(i)))
      .jpeg({ quality: 82 })
      .toBuffer();
    editorial.set(r, bytes);
    media.set(
      r,
      await sharp(bytes).resize(1024, 1024, { fit: "inside" }).webp({ quality: 75 }).toBuffer(),
    );
    medidas.set(r, { w: 1800, h: 1200 });
  }
});

function documento(): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "TESTE",
    clientNames: "TESTE Ana & TESTE Rui",
    eventType: "Casamento",
    eventDate: "8 de julho de 2028",
    location: "Évora",
    moodBoards: [{ title: "Mesas de Jantar", images: refs }],
    totalText: "3.200,00 € + IVA",
    totalAmount: 3200,
    validUntil: "2026-11-27",
  } as ProposalDoc);
}

/** As cores que o PDF desenha, com os bytes dentro do documento (como no envio). */
async function coresDoPdf(d: ProposalDoc): Promise<string[]> {
  doPdf.length = 0;
  const comBytes = {
    ...d,
    moodBoards: d.moodBoards.map((b) => ({
      ...b,
      images: b.images.map((r) => editorial.get(r)!.toString("base64")),
    })),
  } as ProposalDoc;
  const fontes = { capa: d.coverImages, temas: d.moodBoards.map((b) => b.images), paginas: {} };
  await renderEditorialPdf(comBytes, "pt", {}, { refs: fontes, medidas });
  expect(doPdf).toHaveLength(1);
  return doPdf[0];
}

describe("a paleta é a mesma nos três sítios (13/11)", () => {
  it("a proposta online mostra as cores do PDF, pela ordem do PDF", async () => {
    esquecerGuardados();
    const d = documento();
    const pdf = await coresDoPdf(d);
    // Uma paleta a sério, com flores — senão o teste não prova nada.
    expect(pdf.length).toBeGreaterThanOrEqual(4);

    const c = await conteudoDoEditorial(d, "pt", medidas);
    expect(c.ambiente?.daPaleta.length).toBeGreaterThan(0);
    const assinadas = inventarioDeFotos(d).map((e, i) => ({
      id: e.id,
      marca: `m${i}`,
      miniatura: `https://cdn.teste/mini/${encodeURIComponent(e.ref)}?token=x`,
      media: `https://cdn.teste/media/${encodeURIComponent(e.ref)}?token=x`,
      original: `https://cdn.teste/orig/${encodeURIComponent(e.ref)}?token=x`,
      largura: 1800,
    }));
    const p = await montarPropostaWeb(
      c,
      { id: "TESTE-paleta", doc: d },
      "TOKEN",
      "pt",
      textosWeb("pt"),
      assinadas,
    );
    expect(p.paleta?.cores).toEqual(pdf.slice(0, 5));
  });

  it("a sugestão do estúdio (`paleta-do-pdf`, pelas referências do PDF) é a do PDF", async () => {
    esquecerGuardados();
    const d = documento();
    const pdf = await coresDoPdf(d);
    // As referências que a rota `fotos-do-pdf` devolve ao estúdio.
    const { daPaleta } = await planoDoEditorial(d, "pt", medidas);
    expect(daPaleta?.length).toBeGreaterThan(0);
    const pedido = new Request("http://localhost/api/orcamento/TESTE/paleta-do-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refs: daPaleta }),
    });
    const r = await POST(pedido as never, { params: Promise.resolve({ id: "TESTE" }) });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { cores: string[]; sugestoes: string[] };
    expect(j.cores).toEqual(pdf);
    // As sugestões começam pela paleta, pela mesma ordem.
    expect(j.sugestoes.slice(0, pdf.length)).toEqual(pdf);
  });

  it("a rota recusa o que não é um caminho de fotografia (um `data:`, demasiadas)", async () => {
    const pedir = (refs: unknown) =>
      POST(
        new Request("http://localhost/api/orcamento/TESTE/paleta-do-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refs }),
        }) as never,
        { params: Promise.resolve({ id: "TESTE" }) },
      );
    expect((await pedir(["data:image/jpeg;base64,AAAA"])).status).toBe(400);
    expect((await pedir(Array.from({ length: 13 }, (_, i) => ref(i)))).status).toBe(400);
    expect((await pedir([])).status).toBe(400);
    expect((await pedir("TESTE/a.jpg")).status).toBe(400);
  });
});
