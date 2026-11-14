import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE DÓI E O QUE É GANHO NÃO SE SOMAM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel dela dizia «1140 miniaturas em falta, em 683 fotografias». O número
 * é verdadeiro e a frase é falsa: a esmagadora maioria daquelas 1140 eram AVIF,
 * acrescentado depois de as fotografias existirem e que nenhuma podia ter. Uma
 * foto sem AVIF vê-se na mesma — cai no WebP e ninguém dá por isso. Uma foto
 * sem MINIATURA é que puxa o original de dois ou três MB para desenhar um
 * quadrado de 150 px, e é essa a avaria.
 *
 * O que estes testes prendem:
 *
 *  1. a contagem separa as duas, e conta em FOTOGRAFIAS — não em derivadas.
 *     Uma foto sem miniatura e sem micro está mal uma vez, não duas;
 *  2. a geração faz as ESSENCIAIS primeiro, na biblioteca inteira, antes de
 *     tocar num AVIF. Parar a meio tem de deixar as coisas melhores;
 *  3. `gerarLoteDeDerivadas("essencial")` não gera AVIF nenhum — é isso que
 *     deixa arranjar a avaria em dois minutos sem esperar por centenas de
 *     codificações caras.
 */

const st = vi.hoisted(() => ({
  /** Conteúdo por bucket: conjunto de caminhos. */
  conteudo: {} as Record<string, Set<string>>,
  /** Os `upload` feitos, por ordem: é a ordem do trabalho. */
  escritos: [] as string[],
  cliente: null as unknown,
}));

vi.mock("./supabase", () => ({ getSupabase: () => st.cliente }));
vi.mock("./logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
// `sharp` não interessa aqui: o que se está a medir é O QUE se decide gerar e
// por que ordem, não os bytes que saem. Um encoder a sério tornava isto lento
// e não provava nada de novo — o formato tem os seus testes.
vi.mock("sharp", () => {
  const falso = () => ({
    rotate: () => falso(),
    resize: () => falso(),
    webp: () => falso(),
    avif: () => falso(),
    toBuffer: async () => Buffer.from("bytes"),
  });
  return { default: falso };
});

import { contarDerivadasEmFalta, gerarLoteDeDerivadas } from "./derivadas";
import {
  THEME_BUCKET,
  THEME_THUMB_BUCKET,
  THEME_MICRO_BUCKET,
  THEME_AVIF_BUCKET,
  THEME_AVIF_MID_BUCKET,
  THEME_AVIF_MICRO_BUCKET,
  THEME_MID_BUCKET,
} from "./theme-ref";

function storageFalso() {
  return {
    storage: {
      async getBucket() {
        return { data: { name: "existe" }, error: null };
      },
      from(bucket: string) {
        return {
          async list(prefixo: string, opcoes?: { limit?: number; offset?: number }) {
            const todos = [...(st.conteudo[bucket] ?? [])];
            const base = prefixo ? `${prefixo}/` : "";
            const nomes = new Set<string>();
            const entradas: unknown[] = [];
            for (const caminho of todos) {
              if (!caminho.startsWith(base)) continue;
              const resto = caminho.slice(base.length);
              const barra = resto.indexOf("/");
              const nome = barra === -1 ? resto : resto.slice(0, barra);
              if (nomes.has(nome)) continue;
              nomes.add(nome);
              entradas.push(
                barra === -1
                  ? { name: nome, id: `id-${caminho}`, metadata: { size: 10 } }
                  : { name: nome, id: null, metadata: null },
              );
            }
            const inicio = opcoes?.offset ?? 0;
            return { data: entradas.slice(inicio, inicio + (opcoes?.limit ?? 100)), error: null };
          },
          async download() {
            return { data: new Blob([Buffer.from("original")]), error: null };
          },
          async upload(caminho: string) {
            st.escritos.push(`${bucket}/${caminho}`);
            (st.conteudo[bucket] ??= new Set()).add(caminho);
            return { error: null };
          },
        };
      },
    },
  };
}

/** Um tema com `quantas` fotografias e nenhuma derivada. */
function temaSemNada(pasta: string, quantas: number) {
  st.conteudo[THEME_BUCKET] ??= new Set();
  for (let i = 0; i < quantas; i += 1) st.conteudo[THEME_BUCKET].add(`${pasta}/f${i}.jpg`);
}

beforeEach(() => {
  st.conteudo = {};
  st.escritos = [];
  st.cliente = storageFalso();
});

describe("a contagem separa a avaria do ganho", () => {
  it("conta em fotografias, e não soma a miniatura com o micro", async () => {
    temaSemNada("tema-a", 3);

    const c = await contarDerivadasEmFalta();

    expect(c.fotos).toBe(3);
    // Três fotos × TRÊS derivadas de tema = nove em falta ao todo. Foram seis
    // (com as três AVIF) até 14/11: um ficheiro por tamanho.
    expect(c.emFalta).toBe(9);
    // …das quais NOVE são essenciais — a miniatura de 400, o micro de 96 e a
    // de 1200 px, que é a que a página do casal mostra e que durante muito
    // tempo não era fabricada por lote nenhum.
    expect(c.emFaltaEssenciais).toBe(9);
    // E já não há ganho por cobrar: as AVIF ao lado saíram (14/11).
    expect(c.emFaltaLeves).toBe(0);
    // Mas as FOTOGRAFIAS mal são três, e não seis: é este o número que se diz
    // em voz alta, e o que a versão anterior não sabia dizer.
    expect(c.fotosSemMiniatura).toBe(3);
    expect(c.fotosSemVersaoLeve).toBe(0);
  });

  it("uma foto com miniatura, micro e média e sem AVIF está completa (um ficheiro por tamanho)", async () => {
    temaSemNada("tema-a", 2);
    st.conteudo[THEME_THUMB_BUCKET] = new Set(["tema-a/f0.jpg", "tema-a/f1.jpg"]);
    st.conteudo[THEME_MICRO_BUCKET] = new Set(["tema-a/f0.jpg", "tema-a/f1.jpg"]);
    st.conteudo[THEME_MID_BUCKET] = new Set(["tema-a/f0.jpg", "tema-a/f1.jpg"]);

    const c = await contarDerivadasEmFalta();

    expect(c.fotosSemMiniatura).toBe(0);
    expect(c.emFaltaEssenciais).toBe(0);
    // Sem AVIF não falta nada: o tamanho já tem o seu ficheiro (14/11). Até
    // aqui contavam-se seis «leves» em falta, e o lote ia fabricá-las.
    expect(c.fotosSemVersaoLeve).toBe(0);
    expect(c.emFaltaLeves).toBe(0);
    expect(c.emFalta).toBe(0);
    expect(c.linhas).toEqual([]);
  });

  it("uma pasta sem nada em falta não gera linha nenhuma", async () => {
    temaSemNada("tema-a", 1);
    for (const b of [
      THEME_THUMB_BUCKET,
      THEME_MICRO_BUCKET,
      THEME_AVIF_BUCKET,
      THEME_AVIF_MICRO_BUCKET,
      THEME_AVIF_MID_BUCKET,
      THEME_MID_BUCKET,
    ]) {
      st.conteudo[b] = new Set(["tema-a/f0.jpg"]);
    }

    const c = await contarDerivadasEmFalta();

    expect(c.emFalta).toBe(0);
    expect(c.linhas).toEqual([]);
  });

  it("a lista põe à frente o tema com mais fotografias a servir o original", async () => {
    temaSemNada("poucas", 1);
    temaSemNada("muitas", 5);
    const c = await contarDerivadasEmFalta();

    expect(c.linhas[0].pasta).toBe("muitas");
    expect(c.linhas[0].semMiniatura).toBe(5);
    expect(c.linhas[1].pasta).toBe("poucas");
    expect(c.linhas[1].semMiniatura).toBe(1);
  });
});

describe("a geração faz primeiro o que dói", () => {
  it("o lote inteiro (sem papel) não escreve AVIF nenhum: um ficheiro por tamanho", async () => {
    temaSemNada("tema-a", 2);
    temaSemNada("tema-b", 2);
    st.conteudo["proposal-assets"] = new Set(["LIQ-1/p0.jpg"]);

    await gerarLoteDeDerivadas();

    // CONTROLO POSITIVO: o lote correu e fabricou as essenciais todas.
    expect(st.escritos).toHaveLength(4 * 3 + 2);
    expect(st.escritos.filter((c) => c.includes("avif"))).toEqual([]);
  });

  it("`essencial` não escreve um único AVIF", async () => {
    temaSemNada("tema-a", 3);

    const r = await gerarLoteDeDerivadas("essencial");

    expect(st.escritos.filter((c) => c.startsWith("theme-avif"))).toEqual([]);
    // Três fotografias × três essenciais: a miniatura, o micro e a de 1200 px.
    expect(st.escritos).toHaveLength(9);
    expect(r.geradas).toBe(9);
    // Acabou o que era essencial; o AVIF continua por fazer e não é contado
    // como resto desta tarefa.
    expect(r.restantes).toBe(0);
    expect(r.papel).toBe("essencial");
  });

  it("o que sobra depois de um lote diz quantas dessas ainda doem", async () => {
    // O lote deixou de parar às 25 derivadas e passou a parar pelo RELÓGIO —
    // é o relógio que conhece o tecto da função, e o número não conhecia
    // (ver `derivadas.lote.test.ts`). O que este teste mede continua a ser o
    // mesmo: quando o lote pára a meio, o que sobra diz quantas ainda doem.
    temaSemNada("tema-a", 20);

    // Cada leitura do relógio avança 1 s; o tecto são 5 s.
    // O tecto é lido uma vez por BLOCO de seis fotografias — elas vão várias
    // ao mesmo tempo, e abortar um bloco a meio deixava trabalho pago por
    // metade. Com 2 s por leitura e um tecto de 3 s, pára depois do primeiro.
    let t = 0;
    const r = await gerarLoteDeDerivadas("essencial", {
      tectoMs: 3_000,
      agora: () => (t += 2_000),
    });

    expect(r.fotografiasFeitas).toBeGreaterThan(0);
    expect(r.fotografiasFeitas).toBeLessThan(20);
    // Três essenciais por fotografia — a miniatura, o micro e a de 1200 px.
    expect(r.geradas).toBe(r.fotografiasFeitas * 3);
    // E o que sobra diz-se dizendo ONDE se ficou: contar o resto obrigava a
    // varrer a biblioteca toda, que é o que este lote deixou de fazer.
    expect(r.retoma).not.toBeNull();
    expect(r.retoma?.papel).toBe("essencial");
  });
});
