import { describe, expect, it, vi, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  distancias,
  eImpressao,
  impressaoDePixeis,
  LIMITES,
  veredicto,
  type Veredicto,
} from "./impressao-visual";
import { impressaoDosBytes } from "./fotos-parecidas";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RECONHECER UMA FOTOGRAFIA PELO QUE MOSTRA — com fotografias REAIS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * As fotos são as do site (`public/imagens`), públicas. Os pares «diferentes»
 * foram escolhidos na medição de 13/11 por serem os MAIS parecidos do corpus
 * (1 057 fotos, 1,1 milhões de pares): duas fotos em rajada, a versão a cores
 * e a preto e branco do mesmo momento, duas mesas postas quase iguais.
 *
 * A impressão «do índice» é a do servidor (`impressaoDosBytes`) sobre a
 * MINIATURA de 400 px guardada (é o que a tarefa da noite lê); a «da
 * pergunta» é a do navegador, aproximada com outro núcleo de redução.
 */

vi.setConfig({ testTimeout: 60_000 });

const foto = (nome: string) => readFileSync(path.join(process.cwd(), "public/imagens", nome));

/** O caminho de uma foto guardada: preparada a 2 200 px q0,82 → miniatura 400 px q0,72. */
async function doIndice(b: Buffer): Promise<string> {
  const guardada = await sharp(b)
    .rotate()
    .resize(2200, 2200, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  const mini = await sharp(guardada)
    .resize(400, 400, { fit: "inside" })
    .jpeg({ quality: 72 })
    .toBuffer();
  const imp = await impressaoDosBytes(mini);
  expect(eImpressao(imp)).toBe(true);
  return imp!;
}

/** O navegador: reduz com outro núcleo (o canvas não é o `sharp`). */
async function daPergunta(b: Buffer): Promise<string> {
  const { data, info } = await sharp(b)
    .rotate()
    .resize(128, 128, { fit: "inside", kernel: "linear" })
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return impressaoDePixeis(data, info.width, info.height, 3);
}

async function comparar(pergunta: Buffer, guardada: Buffer): Promise<Veredicto> {
  return veredicto(distancias(await daPergunta(pergunta), await doIndice(guardada)));
}

const FOTOS = [
  "stephanie-mizio-16.jpg",
  "J&A-10.jpg",
  "PJ-0277.jpg",
  "Natalia e Jonathan-167.jpg",
  "galeria-outubro-01.jpg",
  "marianaejoao-1166.jpg",
];

describe("a mesma fotografia, noutro ficheiro, é «a mesma» — sem perguntar", () => {
  const casos: [string, (b: Buffer) => Promise<Buffer>][] = [
    ["recomprimida (q40)", (b) => sharp(b).jpeg({ quality: 40 }).toBuffer()],
    [
      "reduzida a 800 px, q60 (o PowerPoint)",
      (b) => sharp(b).resize(800, 800, { fit: "inside" }).jpeg({ quality: 60 }).toBuffer(),
    ],
    ["passada a PNG", (b) => sharp(b).resize(1000, 1000, { fit: "inside" }).png().toBuffer()],
  ];
  for (const [nome, mudar] of casos) {
    it(nome, async () => {
      for (const f of FOTOS) {
        const b = foto(f);
        expect(await comparar(await mudar(b), b), f).toBe("mesma");
      }
    });
  }
});

describe("cortada ou com margens: reconhecida — e, sem certeza, PERGUNTA-SE", () => {
  it("um corte de 3% em cada lado nunca é «outra»", async () => {
    for (const f of FOTOS) {
      const b = foto(f);
      const m = await sharp(b).metadata();
      const W = m.width!;
      const H = m.height!;
      const cortada = await sharp(b)
        .extract({
          left: Math.round(W * 0.03),
          top: Math.round(H * 0.03),
          width: Math.round(W * 0.94),
          height: Math.round(H * 0.94),
        })
        .jpeg({ quality: 75 })
        .toBuffer();
      expect(await comparar(cortada, b), f).not.toBe("outra");
    }
  });

  it("uma faixa branca à volta (a caixa do diapositivo) nunca é «outra»", async () => {
    for (const f of FOTOS) {
      const b = foto(f);
      const m = await sharp(b).metadata();
      const e = Math.round(Math.min(m.width!, m.height!) * 0.05);
      const comMargem = await sharp(b)
        .extend({ top: e, bottom: e, left: e, right: e, background: "#ffffff" })
        .jpeg({ quality: 80 })
        .toBuffer();
      expect(await comparar(comMargem, b), f).not.toBe("outra");
    }
  });
});

describe("duas fotografias DIFERENTES, muito parecidas, nunca são «a mesma»", () => {
  const pares: [string, string, string][] = [
    ["duas fotos em rajada (o mesmo beijo)", "stephanie-mizio-765.jpg", "stephanie-mizio-766.jpg"],
    ["a mesma mesa, um passo ao lado", "EW1_1393.jpg", "EW1_1394.jpg"],
    ["a cores e a preto e branco", "stephanie-mizio-405.jpg", "stephanie-mizio-406.jpg"],
    ["o mesmo casal, outra pose", "marianaejoao-1328.jpg", "marianaejoao-1331.jpg"],
  ];
  for (const [nome, a, b] of pares) {
    it(nome, async () => {
      expect(await comparar(foto(a), foto(b))).not.toBe("mesma");
      expect(await comparar(foto(b), foto(a))).not.toBe("mesma");
    });
  }
});

describe("a regra das fronteiras", () => {
  it("a zona cinzenta pede confirmação: a composição parecida sem o pormenor igual é «talvez»", () => {
    expect(veredicto({ grossa: 2, fina: 40, cor: 0 })).toBe("talvez");
    expect(veredicto({ grossa: LIMITES.grossaTalvez, fina: 100, cor: 0 })).toBe("talvez");
    // A mesma composição com outra cor (a cores / preto e branco): pergunta-se.
    expect(veredicto({ grossa: 0, fina: 0, cor: 40 })).toBe("talvez");
    expect(veredicto({ grossa: LIMITES.grossaTalvez + 2, fina: 0, cor: 0 })).toBe("outra");
    expect(veredicto({ grossa: 0, fina: 4, cor: 1 })).toBe("mesma");
  });

  it("uma impressão mal formada nunca encontra nada", () => {
    expect(veredicto(distancias("abc", "abc"))).toBe("outra");
  });
});

beforeAll(() => {
  // As fotos têm de existir: sem elas o teste não prova nada.
  for (const f of FOTOS) expect(foto(f).length).toBeGreaterThan(1000);
});
