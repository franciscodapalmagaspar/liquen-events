import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withProposalDefaults, type ProposalDoc } from "@/lib/proposal-doc";
import {
  desmontarPdf,
  imagensCitadasPor,
  lerEsqueleto,
  provar,
  remontarPdf,
  RemontagemFalhou,
  sha256,
} from "./desmontar";
import {
  TECTO_BYTES,
  caminhoDaImagem,
  caminhoDoEsqueleto,
  guardarDesmontado,
  medirOcupacao,
  remontarDoArquivo,
  type ClienteDoArquivo,
} from "./guardar";
import { BUCKET_DO_ARQUIVO, eCaminhoProtegido, semProtegidos } from "./protegidos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PDF DESMONTADO: OS MESMOS BYTES, PROVADOS, E AS IMAGENS UMA VEZ SÓ (14/11)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `docs/ARQUIVO-DE-PDFS.md`, fase 2. Os PDF são gerados pelo PRÓPRIO motor
 * (`renderEditorialPdf`), com fotografias fabricadas aqui — nenhuma foto de
 * cliente entra num teste. O armazenamento é um balde em memória.
 */

vi.setConfig({ testTimeout: 240_000 });

vi.mock("@/lib/fotos-editoriais-guardadas", () => ({
  lerFotoEditorialGuardada: async () => null,
  guardarFotoEditorial: async () => undefined,
}));

const { renderEditorialPdf } = await import("@/lib/pdf-editorial/montar");

const CORES = ["#7a8a6a", "#c9a37a", "#5a6a7a", "#8a5a4a", "#4a7a6a", "#a08ab0", "#b0a060"];
let FOTOS: string[] = [];

beforeAll(async () => {
  FOTOS = await Promise.all(
    CORES.map(async (cor, i) => {
      const [w, h] = [
        [900, 600],
        [500, 750],
        [700, 700],
      ][i % 3];
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${cor}"/><stop offset="1" stop-color="#222"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
      return (await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer()).toString("base64");
    }),
  );
});

function docDeTeste(p: Partial<ProposalDoc> = {}): ProposalDoc {
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
    ...p,
  } as ProposalDoc);
}

const criadoEm = new Date("2026-11-14T10:00:00Z");
const gerar = async (d: ProposalDoc) =>
  Buffer.from((await renderEditorialPdf(d, "pt", { criadoEm })).bytes);

/** v1; v2 com outro preço; v3 com fotografias REPETIDAS (a mesma foto em dois temas e na capa). */
let V1: Buffer;
let V2: Buffer;
let V3: Buffer;
beforeAll(async () => {
  V1 = await gerar(docDeTeste());
  V2 = await gerar(docDeTeste({ totalText: "3.450,00 € + IVA", totalAmount: 3450 }));
  V3 = await gerar(
    docDeTeste({
      coverImages: [FOTOS[1]],
      moodBoards: [
        { title: "Decoração Cerimónia", images: [FOTOS[1], FOTOS[2], FOTOS[1]] },
        { title: "Mesas de Jantar", images: [FOTOS[2], FOTOS[1], FOTOS[2]], annotation: "TESTE." },
      ],
    } as Partial<ProposalDoc>),
  );
});

/** Um balde em memória com a forma do cliente do Supabase. */
function baldeEmMemoria(existe = true) {
  const ficheiros = new Map<string, Buffer>();
  const escritas: string[] = [];
  const sb: ClienteDoArquivo = {
    storage: {
      getBucket: async (id) =>
        existe && id === BUCKET_DO_ARQUIVO
          ? { data: { id }, error: null }
          : { data: null, error: { message: "Bucket not found" } },
      from: (bucket) => {
        expect(bucket).toBe(BUCKET_DO_ARQUIVO);
        return {
          list: async (pasta, { limit, offset }) => ({
            data: [...ficheiros]
              .filter(
                ([c]) => c.startsWith(`${pasta}/`) && !c.slice(pasta.length + 1).includes("/"),
              )
              .slice(offset, offset + limit)
              .map(([c, b]) => ({
                id: c,
                name: c.slice(pasta.length + 1),
                metadata: { size: b.length },
              })),
            error: null,
          }),
          upload: async (caminho, corpo, { upsert }) => {
            if (ficheiros.has(caminho) && !upsert)
              return { error: { message: "The resource already exists" } };
            ficheiros.set(caminho, Buffer.from(corpo));
            escritas.push(caminho);
            return { error: null };
          },
          download: async (caminho) => {
            const b = ficheiros.get(caminho);
            return b
              ? {
                  data: {
                    arrayBuffer: async () =>
                      b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer,
                  },
                  error: null,
                }
              : { data: null, error: { message: "Object not found" } };
          },
        };
      },
    },
  };
  return { sb, ficheiros, escritas };
}

const registo = () => ({ info: vi.fn(), warn: vi.fn() });

describe("desmontar e remontar dá os mesmos bytes", () => {
  it.each([
    ["v1", () => V1],
    ["v2 (outro preço)", () => V2],
    ["v3 (fotos repetidas)", () => V3],
  ])("%s: sha256 igual, esqueleto pequeno, quase tudo em imagens", async (_, pdf) => {
    const original = pdf();
    const d = await desmontarPdf(original);
    expect(d.cortes.length).toBeGreaterThan(5);
    expect(await provar(d)).toBe(true);
    const remontado = await remontarPdf(d.esqueleto, (s) => d.imagens.get(s) ?? null);
    expect(remontado.equals(original)).toBe(true);
    const nasImagens = d.cortes.reduce((s, c) => s + c.tamanho, 0);
    // Com fotografias fabricadas (pequenas), as letras pesam mais: ~86 %. Nas reais, 98 %.
    expect(nasImagens / original.length).toBeGreaterThan(0.8);
    expect(d.esqueleto.length).toBeLessThan(80_000);
    // O mesmo PDF dá o mesmo esqueleto (gzip sem data).
    expect((await desmontarPdf(original)).esqueleto.equals(d.esqueleto)).toBe(true);
  });

  it("com fotos repetidas, cada imagem igual guarda-se uma vez", async () => {
    const d = await desmontarPdf(V3);
    expect(d.imagens.size).toBeLessThanOrEqual(d.cortes.length);
    expect(new Set(d.cortes.map((c) => c.sha256)).size).toBe(d.imagens.size);
  });

  it("uma imagem trocada ou em falta nunca dá um PDF: lança", async () => {
    const d = await desmontarPdf(V1);
    const primeira = d.cortes[0].sha256;
    await expect(remontarPdf(d.esqueleto, () => null)).rejects.toBeInstanceOf(RemontagemFalhou);
    await expect(
      remontarPdf(d.esqueleto, (s) => {
        const b = Buffer.from(d.imagens.get(s)!);
        if (s === primeira) b[b.length - 3] ^= 0xff;
        return b;
      }),
    ).rejects.toBeInstanceOf(RemontagemFalhou);
  });

  it("um PDF sem imagens (ou que não é PDF) também se trata: sem cortes, ou recusa", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const vazio = await PDFDocument.create();
    vazio.addPage();
    const b = Buffer.from(await vazio.save());
    const d = await desmontarPdf(b);
    expect(d.cortes).toEqual([]);
    expect(await provar(d)).toBe(true);
    await expect(desmontarPdf(Buffer.from("isto não é um PDF"))).rejects.toThrow();
  });
});

describe("guardar o desmontado ao lado", () => {
  it("prova, guarda as imagens e o esqueleto (o esqueleto em último), e remonta do balde", async () => {
    const { sb, ficheiros, escritas } = baldeEmMemoria();
    const r = await guardarDesmontado(sb, registo(), "prop-1", "chave1", V1);
    expect(r.estado).toBe("guardado");
    expect(escritas.at(-1)).toBe(caminhoDoEsqueleto("prop-1", "chave1"));
    expect(ficheiros.size).toBe(r.imagens - r.imagensJaGuardadas + 1);
    const remontado = await remontarDoArquivo(sb, "prop-1", "chave1", sha256(V1));
    expect(remontado?.equals(V1)).toBe(true);
    // Repetir não escreve nada.
    const n = escritas.length;
    expect((await guardarDesmontado(sb, registo(), "prop-1", "chave1", V1)).estado).toBe(
      "ja-estava",
    );
    expect(escritas.length).toBe(n);
  });

  it("a deduplicação entre PDFs: a v2 só acrescenta o que mudou", async () => {
    const { sb, ficheiros } = baldeEmMemoria();
    const a = await guardarDesmontado(sb, registo(), "prop-1", "v1", V1);
    const b = await guardarDesmontado(sb, registo(), "prop-1", "v2", V2);
    expect(a.estado).toBe("guardado");
    expect(b.estado).toBe("guardado");
    expect(b.imagensJaGuardadas).toBeGreaterThan(0);
    expect(b.bytesNovos).toBeLessThan(V2.length * 0.5);
    const noBalde = [...ficheiros.values()].reduce((s, x) => s + x.length, 0);
    expect(noBalde).toBeLessThan((V1.length + V2.length) * 0.7);
    expect((await medirOcupacao(sb))?.bytes).toBe(noBalde);
    for (const [k, pdf] of [
      ["v1", V1],
      ["v2", V2],
    ] as const) {
      expect((await remontarDoArquivo(sb, "prop-1", k))?.equals(pdf)).toBe(true);
    }
  });

  it("a prova falhada não guarda NADA, e fica registada", async () => {
    const { sb, ficheiros } = baldeEmMemoria();
    const reg = registo();
    const r = await guardarDesmontado(sb, reg, "prop-1", "c", V1, { esperado: "0".repeat(64) });
    expect(r.estado).toBe("prova-falhou");
    expect(ficheiros.size).toBe(0);
    expect(reg.warn).toHaveBeenCalledWith(
      expect.stringMatching(/NÃO deu o sha256/),
      expect.objectContaining({ proposalId: "prop-1" }),
    );
  });

  it("sem o balde (criado à mão), não escreve nada", async () => {
    const { sb, ficheiros } = baldeEmMemoria(false);
    expect((await guardarDesmontado(sb, registo(), "p", "c", V1)).estado).toBe("sem-bucket");
    expect(ficheiros.size).toBe(0);
  });

  it("o tecto: passaria dos 20 MB, não guarda nada e avisa", async () => {
    const { sb, ficheiros } = baldeEmMemoria();
    ficheiros.set("esq/ocupa__x.gz", Buffer.alloc(TECTO_BYTES - 1000));
    const reg = registo();
    const r = await guardarDesmontado(sb, reg, "p", "c", V1);
    expect(r.estado).toBe("tecto");
    expect(ficheiros.size).toBe(1);
    expect(reg.warn).toHaveBeenCalledWith(expect.stringMatching(/tecto/), expect.anything());
  });

  it("o ensaio mede a partilha sem escrever", async () => {
    const { sb, ficheiros } = baldeEmMemoria();
    const ocupacao = (await medirOcupacao(sb))!;
    const a = await guardarDesmontado(sb, registo(), "p", "v1", V1, { ocupacao, ensaio: true });
    const b = await guardarDesmontado(sb, registo(), "p", "v2", V2, { ocupacao, ensaio: true });
    expect(ficheiros.size).toBe(0);
    expect(b.imagensJaGuardadas).toBeGreaterThan(0);
    expect(ocupacao.bytes).toBe(a.bytesNovos + b.bytesNovos);
  });
});

describe("as limpezas da noite não tocam no arquivo", () => {
  it("as imagens e os esqueletos do arquivo estão protegidos; o resto não", () => {
    expect(eCaminhoProtegido(BUCKET_DO_ARQUIVO, caminhoDaImagem("ab".repeat(32)))).toBe(true);
    expect(eCaminhoProtegido(BUCKET_DO_ARQUIVO, caminhoDoEsqueleto("p", "c"))).toBe(true);
    expect(eCaminhoProtegido("proposal-pdfs", "img/x.jpg")).toBe(false);
    expect(
      semProtegidos(BUCKET_DO_ARQUIVO, ["img/a.jpg", "esq/p__c.gz", "outra/coisa.jpg"]),
    ).toEqual(["outra/coisa.jpg"]);
  });

  it("as imagens citadas por esqueletos sabem-se a partir deles", async () => {
    const [a, b] = await Promise.all([desmontarPdf(V1), desmontarPdf(V3)]);
    const citadas = imagensCitadasPor([a.esqueleto, b.esqueleto]);
    for (const c of [...lerEsqueleto(a.esqueleto).cortes, ...lerEsqueleto(b.esqueleto).cortes]) {
      expect(citadas.has(c.sha256)).toBe(true);
    }
  });

  /**
   * Uma limpeza nova que apague ficheiros tem de passar pela lista única. Cada
   * `storage…remove(` destes módulos (os da tarefa da noite, `cron/backup`)
   * tem de vir depois de `semProtegidos` no mesmo ficheiro.
   */
  it.each([
    "limpar-fotos-tratadas.ts",
    "limpar-pdfs-substituidos.ts",
    "juntar-fotos-duplicadas.ts",
    "proposal-storage.ts",
  ])("%s passa os caminhos por semProtegidos antes de apagar", (f) => {
    const src = readFileSync(join(process.cwd(), "src/lib", f), "utf8");
    expect(src).toMatch(/import \{ semProtegidos \} from/);
    expect(src).not.toContain(BUCKET_DO_ARQUIVO);
  });
});
