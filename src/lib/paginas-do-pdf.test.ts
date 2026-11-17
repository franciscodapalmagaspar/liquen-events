import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";

vi.mock("server-only", () => ({}));

import {
  formasDasPaginas,
  imagemDaPagina,
  larguraPedida,
  medidasDaMemoria,
  PedidoCortado,
  PRAZO_DA_VAGA_MS,
  SemVagaParaDocumentos,
  textoDasPaginas,
} from "./paginas-do-pdf";

/**
 * As páginas do PDF desenhadas no servidor — ver `paginas-do-pdf.ts`. Um PDF
 * pequeno feito aqui (com uma letra-padrão, que é o caso das propostas antigas
 * e o que fica sem texto se o pdf.js não encontrar as `standard_fonts`).
 */
async function umPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const letra = await doc.embedFont(StandardFonts.Helvetica);
  for (const t of ["Primeira TESTE", "Segunda TESTE"]) {
    const p = doc.addPage([1123, 794]);
    p.drawText(t, { x: 100, y: 400, size: 60, font: letra });
  }
  return doc.save();
}

describe("as páginas do PDF como imagens", () => {
  it("a largura pedida cai na desenhada mais próxima acima", () => {
    expect(larguraPedida(390)).toBe(800);
    expect(larguraPedida(1000)).toBe(1200);
    expect(larguraPedida(5000)).toBe(1600);
  });

  it("conta as páginas, diz a forma e o texto de cada uma", async () => {
    const bytes = await umPdf();
    const obter = vi.fn(async () => bytes);
    expect(await formasDasPaginas("t1", obter)).toEqual([1123 / 794, 1123 / 794]);
    expect(await textoDasPaginas("t1", obter)).toEqual(["Primeira TESTE", "Segunda TESTE"]);
    // O documento abre-se uma vez só.
    expect(obter).toHaveBeenCalledTimes(1);
  });

  it("desenha a página em WebP na largura pedida, e guarda-a", async () => {
    const obter = vi.fn(umPdf);
    const webp = await imagemDaPagina("t2", obter, 1, 800);
    expect(webp!.subarray(0, 4).toString()).toBe("RIFF");
    expect(webp!.subarray(8, 12).toString()).toBe("WEBP");
    expect(webp!.readUInt32LE(4)).toBeGreaterThan(1000); // não é uma folha vazia
    expect(await imagemDaPagina("t2", obter, 1, 800)).toBe(webp);
    expect(obter).toHaveBeenCalledTimes(1);
  });

  it("uma página que não existe dá null", async () => {
    expect(await imagemDaPagina("t3", umPdf, 3, 800)).toBeNull();
    expect(await imagemDaPagina("t3", umPdf, 0, 800)).toBeNull();
  });

  it("as rotas mandam o desenhador com elas (o `require` do pdf.js não se vê)", () => {
    const config = readFileSync("next.config.ts", "utf8");
    // `*` e não `[token]`: a chave é um padrão, e os parênteses rectos não casam.
    expect(config).toMatch(
      /"\/api\/proposta\/\*\/pagina\/\*": \[\s*"\.\/node_modules\/@napi-rs\/canvas\/\*\*\/\*",\s*"\.\/node_modules\/@napi-rs\/canvas-linux-x64-gnu\/\*\*\/\*",\s*"\.\/node_modules\/pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs"/,
    );
    expect(config).toMatch(
      /"\/api\/proposta\/\*\/paginas": \["\.\/node_modules\/pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs"\]/,
    );
  });
  it("um documento a ser desenhado não é fechado por outro que chega (registos de 16/11)", async () => {
    // «Rendering cancelled, page 1», quatro vezes em 16/11. O estúdio pede
    // várias páginas ao mesmo tempo (a que está a ser editada e as vizinhas),
    // e cada uma é um documento com chave própria. Só ficam TRÊS abertos: o
    // quarto a chegar fechava o mais velho — que ainda estava a ser desenhado —
    // e o pdf.js cancelava esse desenho. O pedido respondia 500.
    const bytes = await umPdf();
    const obter = async () => bytes;
    const pedidos = Array.from({ length: 8 }, (_, i) =>
      imagemDaPagina(`corrida-${i}`, obter, 1 + (i % 2), 800),
    );
    const feitos = await Promise.allSettled(pedidos);
    const recusados = feitos.filter((r) => r.status === "rejected");
    expect(recusados.map((r) => String((r as PromiseRejectedResult).reason))).toEqual([]);
    for (const r of feitos) {
      const webp = (r as PromiseFulfilledResult<Buffer | null>).value;
      expect(webp!.subarray(8, 12).toString()).toBe("WEBP");
    }
  });

  it("e um documento posto de parte enquanto não é usado é fechado (a memória não cresce)", async () => {
    const bytes = await umPdf();
    for (let i = 0; i < 6; i += 1) await formasDasPaginas(`sequencia-${i}`, async () => bytes);
    // O sétimo volta a abrir o primeiro: já não estava guardado.
    const obter = vi.fn(async () => bytes);
    await formasDasPaginas("sequencia-0", obter);
    expect(obter).toHaveBeenCalledTimes(1);
  });

  /**
   * Revisão de 17/11, n.º 8: um documento posto de parte enquanto é usado já
   * não estava no mapa, e não contava para tecto nenhum. Uma rajada de pedidos
   * lentos abria documentos sem fim. Passa a haver um tecto GLOBAL: quem chega
   * a seguir espera que um deles feche.
   */
  it("os documentos postos de parte mas ainda em uso contam para um tecto global", async () => {
    const bytes = await umPdf();
    const portas: (() => void)[] = [];
    const lento = () => new Promise<Uint8Array>((r) => portas.push(() => r(bytes)));
    const pedidos = Array.from({ length: 6 }, (_, i) => formasDasPaginas(`tecto-${i}`, lento));
    await new Promise((r) => setTimeout(r, 20));
    expect(portas).toHaveLength(6);
    const setimo = vi.fn(async () => bytes);
    const ultimo = formasDasPaginas("tecto-6", setimo);
    await new Promise((r) => setTimeout(r, 20));
    expect(setimo, "abriu um sétimo documento com seis vivos").not.toHaveBeenCalled();
    // O primeiro acaba (e, posto de parte, fecha): abre-se lugar para o sétimo.
    portas[0]();
    await pedidos[0];
    await ultimo;
    expect(setimo).toHaveBeenCalledTimes(1);
    for (const abrir of portas) abrir();
    await Promise.all(pedidos);
  });

  it("duas imagens iguais pedidas ao mesmo tempo contam UMA vez para o tecto de memória", async () => {
    const bytes = await umPdf();
    const antes = medidasDaMemoria();
    const [a, b] = await Promise.all([
      imagemDaPagina("dupla", async () => bytes, 1, 800),
      imagemDaPagina("dupla", async () => bytes, 1, 800),
    ]);
    const depois = medidasDaMemoria();
    expect(depois.bytesEmImagens - antes.bytesEmImagens).toBe(a!.length);
    expect(depois.bytesEmImagens, "a conta e a soma real desencontraram-se").toBe(depois.somaReal);
    expect(b).toBe(a);
  });

  /**
   * 2.ª revisão de 17/11, n.º 1: a espera pela vaga não tinha prazo. Seis
   * documentos pendurados seguravam todos os outros pedidos até a função
   * morrer. Agora quem espera desiste aos 15 s, e um pedido cortado sai logo.
   */
  describe("a fila dos documentos tem prazo e larga os pedidos cortados", () => {
    async function encherComPendurados(prefixo: string) {
      const bytes = await umPdf();
      const portas: (() => void)[] = [];
      const pendurado = () => new Promise<Uint8Array>((r) => portas.push(() => r(bytes)));
      const pedidos = Array.from({ length: 6 }, (_, i) =>
        formasDasPaginas(`${prefixo}-${i}`, pendurado),
      );
      await new Promise((r) => setTimeout(r, 20));
      expect(portas).toHaveLength(6);
      return {
        bytes,
        soltarUm() {
          portas.shift()!();
        },
        async soltar() {
          for (const abrir of portas) abrir();
          await Promise.all(pedidos);
        },
      };
    }

    it("quem espera mais do que o prazo recebe «sem vaga» e não abre nada", async () => {
      const cheia = await encherComPendurados("prazo");
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      try {
        const obter = vi.fn(async () => cheia.bytes);
        const espera = formasDasPaginas("prazo-7", obter);
        const resultado = espera.then(
          () => "abriu",
          (e: unknown) => e,
        );
        await vi.advanceTimersByTimeAsync(PRAZO_DA_VAGA_MS - 100);
        expect(obter).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(200);
        expect(await resultado).toBeInstanceOf(SemVagaParaDocumentos);
        expect(obter).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
        await cheia.soltar();
      }
    });

    it("um pedido cortado enquanto espera sai logo da fila", async () => {
      const cheia = await encherComPendurados("cortado");
      try {
        const corte = new AbortController();
        const obter = vi.fn(async () => cheia.bytes);
        const espera = imagemDaPagina("cortado-7", obter, 1, 800, { signal: corte.signal });
        const resultado = espera.then(
          () => "abriu",
          (e: unknown) => e,
        );
        await new Promise((r) => setTimeout(r, 10));
        corte.abort();
        expect(await resultado).toBeInstanceOf(PedidoCortado);
        expect(obter).not.toHaveBeenCalled();
        // E um já cortado nem entra.
        await expect(
          formasDasPaginas("cortado-8", obter, { signal: corte.signal }),
        ).rejects.toBeInstanceOf(PedidoCortado);
      } finally {
        await cheia.soltar();
      }
    });

    it("o corte de um pedido não leva o desenho partilhado de quem ficou", async () => {
      const cheia = await encherComPendurados("partilhado");
      const corte = new AbortController();
      const obter = async () => cheia.bytes;
      const doQueSaiu = imagemDaPagina("partilhado-7", obter, 1, 800, { signal: corte.signal });
      const doQueFicou = imagemDaPagina("partilhado-7", obter, 1, 800);
      await new Promise((r) => setTimeout(r, 10));
      corte.abort();
      await expect(doQueSaiu).rejects.toBeInstanceOf(PedidoCortado);
      await cheia.soltar();
      const webp = await doQueFicou;
      expect(webp!.subarray(8, 12).toString()).toBe("WEBP");
    });

    it("um fecho acorda todos, mas só UM toma o lugar livre (revisão independente de 17/11)", async () => {
      const cheia = await encherComPendurados("manada");
      // Três à espera, cada um com o seu documento.
      const abrir = vi.fn(async () => cheia.bytes);
      const esperam = [7, 8, 9].map((i) => formasDasPaginas(`manada-${i}`, abrir));
      await new Promise((r) => setTimeout(r, 10));
      expect(abrir).not.toHaveBeenCalled();
      // Um dos pendurados acaba: abre-se UM lugar.
      cheia.soltarUm();
      await new Promise((r) => setTimeout(r, 30));
      expect(abrir, "passaram vários pelo mesmo lugar livre").toHaveBeenCalledTimes(1);
      expect(medidasDaMemoria().vivos).toBeLessThanOrEqual(6);
      await cheia.soltar();
      await Promise.all(esperam);
    });

    it("quem se junta ao desenho de outro tem o SEU prazo, não o do primeiro", async () => {
      const cheia = await encherComPendurados("prazo-proprio");
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      let segundo: Promise<unknown>;
      try {
        const obter = async () => cheia.bytes;
        const primeiro = imagemDaPagina("prazo-proprio-7", obter, 1, 800).then(
          () => "abriu",
          (e: unknown) => e,
        );
        await vi.advanceTimersByTimeAsync(PRAZO_DA_VAGA_MS - 200);
        segundo = imagemDaPagina("prazo-proprio-7", obter, 1, 800).then(
          (v) => v,
          (e: unknown) => e,
        );
        await vi.advanceTimersByTimeAsync(400);
        expect(await primeiro).toBeInstanceOf(SemVagaParaDocumentos);
        const estado = await Promise.race([segundo, Promise.resolve("à espera")]);
        expect(estado, "herdou o prazo do primeiro").toBe("à espera");
      } finally {
        vi.useRealTimers();
      }
      await cheia.soltar();
      const webp = (await segundo!) as Buffer;
      expect(webp.subarray(8, 12).toString()).toBe("WEBP");
    });
  });
});
