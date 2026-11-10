import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O SERVICE WORKER ESCREVE NO DISCO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `public/sw.js` guarda as miniaturas da biblioteca de temas numa chave SEM o
 * token, para reabrir o seletor deixar de custar 1835 ms e 188 KB. Quem decide
 * o que entra nessa cache é uma expressão regular — e é ela que separa
 * "fotografias de inspiração" de "fotografias de um casamento concreto".
 *
 * Errá-la para o lado permissivo escreve no disco de quem trabalha as fotos de
 * uma proposta, ao lado da data e do local do casamento daquele casal. É a
 * mesma linha que o `sw.js` já traça ao recusar guardar `/portal` e
 * `/proposta`; este ficheiro é o que impede que ela se mova sem ninguém dar
 * por isso.
 *
 * Testa o ficheiro REAL: o `sw.js` não é um módulo (usa `self`), por isso as
 * duas funções são extraídas de lá e executadas. Uma cópia das regras aqui
 * podia divergir do que o browser corre, que é precisamente o que não pode
 * acontecer numa decisão de privacidade.
 */

const FONTE = readFileSync("public/sw.js", "utf-8");

function extrair<T>(nome: string): T {
  const inicio = FONTE.indexOf(`function ${nome}(`);
  expect(inicio, `\`${nome}\` desapareceu de public/sw.js`).toBeGreaterThan(-1);
  // Conta chavetas até fechar a função — o corpo tem literais de expressão
  // regular com chavetas dentro, mas nenhum com chavetas desemparelhadas.
  let profundidade = 0;
  let fim = inicio;
  for (let i = FONTE.indexOf("{", inicio); i < FONTE.length; i++) {
    if (FONTE[i] === "{") profundidade++;
    else if (FONTE[i] === "}") {
      profundidade--;
      if (profundidade === 0) {
        fim = i + 1;
        break;
      }
    }
  }
  return new Function(`${FONTE.slice(inicio, fim)}; return ${nome};`)() as T;
}

const ehFotoDaBiblioteca = extrair<(u: URL) => boolean>("ehFotoDaBiblioteca");
const chaveSemToken = extrair<(u: URL) => string>("chaveSemToken");
const vaiParaODisco = extrair<(r: unknown) => boolean>("vaiParaODisco");
const ehOriginalDaBiblioteca = extrair<(u: URL) => boolean>("ehOriginalDaBiblioteca");

/** Uma resposta com o que interessa aqui: tipo, estado e content-type. */
function resposta(o: { type?: string; ok?: boolean; contentType?: string | null }) {
  return {
    type: o.type ?? "basic",
    ok: o.ok ?? true,
    headers: { get: (n: string) => (n.toLowerCase() === "content-type" ? o.contentType : null) },
  };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DEFEITO QUE DEIXOU OS CARTÕES CINZENTOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A primeira versão guardava qualquer resposta OPACA. Uma opaca tem
 * `status: 0`, cabeçalhos vazios e corpo ilegível: uma fotografia e um 404 são
 * a mesma coisa vistos daqui. Como a chave não tem token e a leitura é
 * cache-first, uma derivada que ainda não existia — ou um token expirado —
 * ficava gravada como FALHA PERMANENTE. Recarregar não resolvia.
 *
 * É o pior tipo de defeito de cache: não se manifesta como lentidão, manifesta-
 * se como fotografias que desaparecem e não voltam.
 */
describe("o que o service worker aceita escrever no disco", () => {
  it("guarda uma fotografia que se conseguiu ler", () => {
    expect(vaiParaODisco(resposta({ ok: true, contentType: "image/jpeg" }))).toBe(true);
  });

  /** O TESTE QUE INTERESSA. */
  it("NUNCA guarda uma resposta opaca — não se sabe se é uma foto ou um 404", () => {
    expect(
      vaiParaODisco(resposta({ type: "opaque", ok: false, contentType: null })),
      "uma opaca voltou a ser escrita no disco: um 404 fica gravado para sempre",
    ).toBe(false);
  });

  it("não guarda um erro que se conseguiu ler", () => {
    expect(vaiParaODisco(resposta({ ok: false, contentType: "text/html" }))).toBe(false);
  });

  /** Um 200 com uma página de erro do Storage não é uma fotografia. */
  it("não guarda o que não é imagem", () => {
    expect(vaiParaODisco(resposta({ ok: true, contentType: "application/json" }))).toBe(false);
    expect(vaiParaODisco(resposta({ ok: true, contentType: null }))).toBe(false);
  });

  it("não rebenta sem resposta nenhuma", () => {
    expect(vaiParaODisco(null)).toBe(false);
    expect(vaiParaODisco(undefined)).toBe(false);
  });

  /**
   * O nome da cache é o que apaga, nos aparelhos dela, o que a v1 já escreveu:
   * o `activate` deita fora todas as caches que não conhece. Sem esta subida,
   * a correcção acima não chega a quem já tem os cartões cinzentos.
   */
  it("o nome da cache das fotos subiu, para limpar o que a v1 gravou", () => {
    expect(FONTE).toContain('CACHE_FOTOS = "liquen-fotos-v2"');
  });
});

const sb = (caminho: string) => new URL(`https://abc.supabase.co${caminho}`);

describe("service worker — o que pode ir para o disco", () => {
  it("guarda as derivadas pequenas da biblioteca de temas", () => {
    expect(ehFotoDaBiblioteca(sb("/storage/v1/object/sign/theme-thumbs/italia/a1.jpg"))).toBe(true);
    expect(ehFotoDaBiblioteca(sb("/storage/v1/object/sign/theme-micro/italia/a1.jpg"))).toBe(true);
    // Um bucket público (se a decisão do Pilar 2 for essa) tem outro verbo no
    // caminho e continua a ser a mesma fotografia.
    expect(ehFotoDaBiblioteca(sb("/storage/v1/object/public/theme-thumbs/italia/a1.jpg"))).toBe(
      true,
    );
  });

  /**
   * O TESTE QUE INTERESSA. Estas são as fotografias de um casamento concreto.
   */
  it("NUNCA guarda fotografias de uma proposta", () => {
    for (const bucket of ["proposal-assets", "proposal-thumbs", "proposal-medias"]) {
      expect(
        ehFotoDaBiblioteca(sb(`/storage/v1/object/sign/${bucket}/LIQ-ABC/capa.jpg`)),
        `${bucket} passou o filtro — as fotos de um casal iriam para o disco`,
      ).toBe(false);
    }
  });

  /**
   * v3 (10/11): medido nos registos do Supabase, as `.png` e `.webp` (9 % da
   * biblioteca) e as derivadas de 1 200 px voltavam a ser descarregadas a
   * cada abertura — o filtro só aceitava `.jpg` de duas gavetas.
   */
  it("guarda também as .png e .webp, as médias e as AVIF da biblioteca", () => {
    for (const p of [
      "/storage/v1/object/sign/theme-thumbs/italia/a1.png",
      "/storage/v1/object/sign/theme-thumbs/italia/a1.webp",
      "/storage/v1/object/sign/theme-medias/italia/a1.jpg",
      "/storage/v1/object/sign/theme-avif/italia/a1.jpg",
      "/storage/v1/object/sign/theme-avif-micro/italia/a1.jpg",
      "/storage/v1/object/sign/theme-avif-medias/italia/a1.jpg",
    ]) {
      expect(ehFotoDaBiblioteca(sb(p)), `${p} ficou de fora`).toBe(true);
    }
  });

  /**
   * Os originais da biblioteca vão para uma gaveta PRÓPRIA (com tecto
   * próprio), e não para a das miniaturas — para ~40 MB de originais nunca
   * empurrarem as miniaturas para fora.
   */
  it("os ORIGINAIS da biblioteca vão para a gaveta deles, não para a das miniaturas", () => {
    const original = sb("/storage/v1/object/sign/theme-assets/italia/a1.jpg");
    expect(ehFotoDaBiblioteca(original)).toBe(false);
    expect(ehOriginalDaBiblioteca(original)).toBe(true);
    expect(ehOriginalDaBiblioteca(sb("/storage/v1/object/sign/theme-assets/italia/a1.png"))).toBe(
      true,
    );
    expect(FONTE).toContain('CACHE_ORIGINAIS = "liquen-originais-v1"');
    expect(FONTE).toMatch(/k !== CACHE_ORIGINAIS/);
  });

  /** O TESTE QUE INTERESSA, outra vez, para a gaveta nova. */
  it("NUNCA guarda originais de uma proposta, nem o que não é imagem", () => {
    for (const p of [
      "/storage/v1/object/sign/proposal-assets/LIQ-ABC/capa.jpg",
      "/storage/v1/object/sign/proposal-medias/LIQ-ABC/capa.jpg",
      "/storage/v1/object/sign/theme-assets-x/italia/a1.jpg",
      "/storage/v1/object/sign/theme-assets/italia/lista.json",
      "/theme-assets/italia/a1.jpg",
    ]) {
      expect(ehOriginalDaBiblioteca(sb(p)), `${p} passou o filtro`).toBe(false);
    }
  });

  /** Um nome de bucket que só COMEÇA por `theme-` não é um dos dois. */
  it("não se deixa enganar por nomes parecidos", () => {
    for (const p of [
      "/storage/v1/object/sign/theme-thumbs-privado/x/a.jpg",
      "/storage/v1/object/sign/outro/theme-thumbs/a.jpg",
      "/storage/v1/object/sign/theme-micros/x/a.jpg",
      // Sem o prefixo do Storage não é o Storage.
      "/theme-thumbs/italia/a1.jpg",
    ]) {
      expect(ehFotoDaBiblioteca(sb(p)), `${p} passou o filtro`).toBe(false);
    }
  });

  it("só ficheiros de imagem", () => {
    expect(ehFotoDaBiblioteca(sb("/storage/v1/object/sign/theme-thumbs/italia/lista.json"))).toBe(
      false,
    );
  });

  describe("a chave", () => {
    /** É isto, e só isto, que faz o token deixar de partir a cache. */
    it("é o caminho SEM os parâmetros — dois tokens dão a mesma chave", () => {
      const a = sb("/storage/v1/object/sign/theme-thumbs/italia/a1.jpg?token=AAA");
      const b = sb("/storage/v1/object/sign/theme-thumbs/italia/a1.jpg?token=BBB&x=1");
      expect(chaveSemToken(a)).toBe(chaveSemToken(b));
      expect(chaveSemToken(a)).toBe(
        "https://abc.supabase.co/storage/v1/object/sign/theme-thumbs/italia/a1.jpg",
      );
    });

    /** Duas fotos diferentes continuam a ser duas entradas. */
    it("não junta fotografias diferentes", () => {
      expect(chaveSemToken(sb("/storage/v1/object/sign/theme-thumbs/italia/a1.jpg"))).not.toBe(
        chaveSemToken(sb("/storage/v1/object/sign/theme-thumbs/italia/a2.jpg")),
      );
    });
  });
});
