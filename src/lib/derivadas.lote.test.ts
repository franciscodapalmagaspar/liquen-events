import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O LOTE TEM DE CABER NUMA FUNÇÃO — E NÃO PODE PAGAR TUDO DUAS VEZES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel ficou parado em «A gerar as versões leves — 0 de 765», e ela disse
 * que não funciona. Não era o ecrã: era o servidor a não chegar ao fim do
 * primeiro lote.
 *
 * Duas contas, ambas de REDE — o `sharp` não tem culpa nenhuma (medido: 25
 * codificações AVIF a esforço 4 são ~9,7 s no total):
 *
 *  1. **O original era descarregado uma vez por DERIVADA.** Uma fotografia que
 *     precisa do AVIF grande e do AVIF micro descarregava os mesmos ~2 MB duas
 *     vezes. Nas 389 fotografias dela são ~1,5 GB a atravessar a função para
 *     fazer trabalho que precisava de ~780 MB.
 *  2. **Cada lote varria a biblioteca inteira outra vez.** Uma listagem por
 *     pasta e por bucket, do princípio, em CADA um dos ~31 lotes — centenas de
 *     idas ao Storage antes de a primeira imagem ser gerada.
 *
 * Somadas, o lote não cabia nos 60 s da função. Morria, e o que ela via era uma
 * barra a zero.
 *
 * O que estes testes prendem:
 *
 *  1. uma fotografia é descarregada UMA vez, faça ela uma derivada ou quatro;
 *  2. o bucket confirma-se uma vez por lote, não uma vez por derivada;
 *  3. o lote pára pelo RELÓGIO e não por um número fixo — é o relógio que
 *     conhece o tecto da função, e é ele que muda quando a rede está má;
 *  4. mesmo com o tempo esgotado faz sempre pelo menos uma, porque um lote que
 *     devolve zero pára o ciclo de quem chama e a geração nunca acabaria;
 *  5. o que falta é dito também em FOTOGRAFIAS, que é a unidade dos botões.
 */

const st = vi.hoisted(() => ({
  conteudo: {} as Record<string, Set<string>>,
  descarregados: [] as string[],
  bucketsConfirmados: [] as string[],
  escritos: [] as string[],
  cliente: null as unknown,
}));

vi.mock("./supabase", () => ({ getSupabase: () => st.cliente }));
vi.mock("./logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("./theme-storage", () => ({
  garantirBucketDeDerivadas: async (bucket: string) => {
    st.bucketsConfirmados.push(bucket);
    return true;
  },
}));
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

import { gerarLoteDeDerivadas } from "./derivadas";
import { THEME_BUCKET, THEME_MID_BUCKET } from "./theme-ref";
import { PROPOSAL_BUCKET, PROPOSAL_MID_BUCKET } from "./proposal-storage";

function storageFalso() {
  return {
    storage: {
      async getBucket() {
        return { data: { name: "existe" }, error: null };
      },
      from(bucket: string) {
        return {
          async list(prefixo: string, opcoes?: { limit?: number; offset?: number }) {
            const base = prefixo ? `${prefixo}/` : "";
            const nomes = new Set<string>();
            const entradas: unknown[] = [];
            for (const caminho of st.conteudo[bucket] ?? []) {
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
          async download(caminho: string) {
            st.descarregados.push(`${bucket}/${caminho}`);
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

function tema(pasta: string, quantas: number) {
  st.conteudo[THEME_BUCKET] ??= new Set();
  for (let i = 0; i < quantas; i += 1) st.conteudo[THEME_BUCKET].add(`${pasta}/f${i}.jpg`);
}

/** Um relógio que anda `passo` ms a cada leitura — sem temporizadores falsos. */
function relogio(passo: number) {
  let t = 0;
  return () => {
    t += passo;
    return t;
  };
}

beforeEach(() => {
  st.conteudo = {};
  st.descarregados = [];
  st.bucketsConfirmados = [];
  st.escritos = [];
  st.cliente = storageFalso();
});

describe("um lote de derivadas", () => {
  it("descarrega a fotografia UMA vez, e não uma vez por derivada", async () => {
    tema("tema-a", 3);

    await gerarLoteDeDerivadas("essencial");

    // Três fotografias, TRÊS derivadas cada (400, micro e 1200): nove
    // escritas, três downloads. É o número dos downloads que este passeio
    // guarda, não o das escritas: cada família tem de sair do MESMO ficheiro
    // descarregado. (Eram as três AVIF «leves» até 14/11.)
    expect(st.escritos).toHaveLength(9);
    expect(st.descarregados).toHaveLength(3);
    expect(new Set(st.descarregados).size).toBe(3);
  });

  it("confirma cada bucket uma vez por lote, e não uma vez por fotografia", async () => {
    tema("tema-a", 5);

    await gerarLoteDeDerivadas("essencial");

    // Três buckets essenciais — a miniatura, o micro e a de 1200 px. Sem
    // memória eram três por fotografia: quinze.
    expect(st.bucketsConfirmados).toHaveLength(3);
    expect(new Set(st.bucketsConfirmados).size).toBe(3);
  });

  it("pára pelo relógio, e diz o que ficou por fazer", async () => {
    tema("tema-a", 20);

    // O tecto é lido uma vez por BLOCO de seis, e não por fotografia — as
    // fotografias vão várias ao mesmo tempo, e abortar um bloco a meio deixava
    // trabalho pago por metade. Com o relógio a andar 2 s por leitura e um
    // tecto de 3 s, o lote pára depois do primeiro bloco.
    const r = await gerarLoteDeDerivadas("essencial", { tectoMs: 3_000, agora: relogio(2_000) });

    expect(r.fotografiasFeitas).toBeGreaterThan(0);
    expect(r.fotografiasFeitas).toBeLessThan(20);
    // E diz ONDE ficou, para o lote seguinte começar aí em vez de voltar à
    // primeira pasta da biblioteca. É isto que faz o trabalho ser linear em
    // vez de crescer ao quadrado.
    expect(r.retoma).toEqual({
      papel: "essencial",
      origem: THEME_BUCKET,
      pasta: "tema-a",
      caminho: expect.any(String),
    });
  });

  it("o lote seguinte começa onde o anterior parou, e não do princípio", async () => {
    tema("tema-a", 12);

    const um = await gerarLoteDeDerivadas("essencial", { tectoMs: 1_000, agora: relogio(2_000) });
    expect(um.retoma).not.toBeNull();
    const feitosNoPrimeiro = st.escritos.length;
    st.descarregados = [];

    const dois = await gerarLoteDeDerivadas("essencial", {
      tectoMs: 1_000,
      agora: relogio(2_000),
      retoma: um.retoma,
    });

    // Nenhuma fotografia é tocada duas vezes: os lotes são disjuntos, e é por
    // isso que quem chama pode SOMAR o que cada um fez.
    expect(dois.fotografiasFeitas).toBeGreaterThan(0);
    expect(st.escritos.length).toBe(feitosNoPrimeiro + dois.geradas);
    expect(new Set(st.descarregados).size).toBe(dois.fotografiasFeitas);
  });

  it("uma retoma que já não existe recomeça do princípio, em vez de dizer que acabou", async () => {
    // A pasta foi apagada, ou o tema mudou de nome entre dois lotes. Sem isto,
    // o lote devolvia «acabou» sobre uma biblioteca por fazer, e a geração
    // parava em silêncio a meio.
    tema("tema-a", 2);

    const r = await gerarLoteDeDerivadas("essencial", {
      retoma: {
        papel: "essencial",
        origem: THEME_BUCKET,
        pasta: "tema-que-nao-existe",
        caminho: "x.jpg",
      },
    });

    expect(r.fotografiasFeitas).toBe(2);
    expect(r.retoma).toBeNull();
  });

  it("com o tempo já esgotado faz sempre uma — senão a geração nunca acabava", async () => {
    tema("tema-a", 10);

    // O relógio já vai à frente do tecto na primeira leitura.
    const r = await gerarLoteDeDerivadas("essencial", { tectoMs: 0, agora: relogio(10_000) });

    // Quem chama pára o ciclo quando um lote devolve zero geradas. Um lote que
    // nunca gera nada por já estar atrasado seria uma geração que não avança.
    // Um BLOCO é o mínimo, e não uma fotografia: é a unidade em que o tecto
    // se lê agora, porque as fotografias vão várias ao mesmo tempo e abortar um
    // bloco a meio deixava trabalho pago por metade.
    expect(r.fotografiasFeitas).toBe(6);
    expect(r.geradas).toBe(18);
    // E há por onde continuar — senão isto era uma geração que não avança.
    expect(r.retoma).not.toBeNull();
  });

  it("uma fotografia a que só falta metade das derivadas não regenera a outra metade", async () => {
    tema("tema-a", 2);
    await gerarLoteDeDerivadas("essencial");
    const antes = st.escritos.length;
    st.descarregados = [];

    // Segunda passagem: já não falta nada de essencial.
    const r = await gerarLoteDeDerivadas("essencial");

    expect(st.escritos).toHaveLength(antes);
    expect(st.descarregados).toHaveLength(0);
    expect(r.geradas).toBe(0);
    expect(r.fotografiasRestantes).toBe(0);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A VERSÃO QUE A PÁGINA DO CASAL MOSTRA NÃO ERA FABRICADA POR NINGUÉM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A proposta pede a derivada de 1200 px — é a que o `srcset` escolhe num
 * telemóvel, onde a fotografia ocupa ~343 pontos a três pixéis por ponto. As
 * miniaturas de 400 px servem as GRELHAS do back office; nunca serviram esta.
 *
 * E o lote só sabia fabricar as de 400 px e as de 96. A de 1200 nascia uma a
 * uma, à primeira vez que alguém olhava para a fotografia — pela rota, com o
 * download, o `sharp` e o upload todos dentro do pedido, e o casal à espera.
 *
 * Portanto o botão «Gerar as miniaturas» podia correr até ao fim e deixar a
 * proposta exactamente tão lenta como estava: fabricava tudo menos aquilo de
 * que aquela página precisa.
 */
describe("a versão de 1200 px, que é a que a proposta mostra", () => {
  it("é fabricada pelo lote, e não só quando alguém olha", async () => {
    tema("tema-a", 1);

    await gerarLoteDeDerivadas("essencial");

    expect(st.escritos.some((c) => c.startsWith(`${THEME_MID_BUCKET}/`))).toBe(true);
  });

  it("também nas fotografias das propostas", async () => {
    st.conteudo[PROPOSAL_BUCKET] ??= new Set();
    st.conteudo[PROPOSAL_BUCKET].add("ped-1/f0.jpg");

    await gerarLoteDeDerivadas("essencial");

    expect(st.escritos).toContain(`${PROPOSAL_MID_BUCKET}/ped-1/f0.jpg`);
  });

  it("o papel `leve` já não tem nada para fazer: não há AVIF ao lado (14/11)", async () => {
    tema("tema-a", 1);

    const r = await gerarLoteDeDerivadas("leve");

    // Até 14/11 isto fabricava as três AVIF da fotografia. Um ficheiro por
    // tamanho: a passagem `leve` fica vazia, e não escreve nem descarrega.
    expect(st.escritos).toEqual([]);
    expect(st.descarregados).toEqual([]);
    expect(r.geradas).toBe(0);
  });

  it("uma foto que já a tem não a refaz", async () => {
    tema("tema-a", 1);
    await gerarLoteDeDerivadas("essencial");
    const antes = st.escritos.length;

    await gerarLoteDeDerivadas("essencial");

    expect(st.escritos).toHaveLength(antes);
  });
});
