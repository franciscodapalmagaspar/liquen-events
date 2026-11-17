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

import { gerarLoteDeDerivadas, type PosicaoDoLote, type Retoma } from "./derivadas";
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

    await gerarLoteDeDerivadas("leve");

    // Três fotografias, TRÊS derivadas AVIF cada (400, micro e 1200): nove
    // escritas, três downloads. Eram duas até a de 1200 em AVIF existir — e é
    // o número dos downloads que este passeio guarda, não o das escritas: uma
    // família nova tem de sair do MESMO ficheiro descarregado.
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

  it("numa biblioteca já feita, o relógio também pára a TRAVESSIA das pastas (registos de 10–17/11)", async () => {
    // Trinta temas, já com todas as essenciais: não há blocos de fotografias,
    // só listagens. Antes o relógio só se lia entre blocos, e a travessia
    // corria até ao fim por mais tarde que fosse — a apanha da rotina da manhã
    // passava assim do tecto da função.
    for (let i = 0; i < 30; i += 1) tema(`tema-${String(i).padStart(2, "0")}`, 1);
    await gerarLoteDeDerivadas("essencial");
    st.escritos = [];

    const r = await gerarLoteDeDerivadas("essencial", { tectoMs: 5_000, agora: relogio(2_000) });

    expect(r.fotografiasFeitas).toBe(0);
    // Parou entre pastas, e diz em qual recomeçar.
    expect(r.retoma).toMatchObject({ papel: "essencial", origem: THEME_BUCKET, caminho: "" });
    expect(r.retoma!.pasta > "tema-00").toBe(true);
    expect(r.retoma!.pasta < "tema-29").toBe(true);

    // E a noite seguinte recomeça nessa pasta, sem voltar ao princípio, e
    // chega ao fim.
    const seguinte = await gerarLoteDeDerivadas("essencial", { retoma: r.retoma });
    expect(seguinte.retoma).toBeNull();
    expect(st.escritos).toHaveLength(0);
  });

  it("uma retoma deixada entre pastas gera a primeira fotografia dessa pasta", async () => {
    tema("tema-a", 1);
    tema("tema-b", 2);

    const r = await gerarLoteDeDerivadas("essencial", {
      retoma: { papel: "essencial", origem: THEME_BUCKET, pasta: "tema-b", caminho: "" },
    });

    // Só as duas de `tema-b`: a de `tema-a` fica para a volta seguinte.
    expect(r.fotografiasFeitas).toBe(2);
    expect(st.descarregados.every((c) => c.includes("/tema-b/"))).toBe(true);
  });

  /**
   * Revisão de 17/11, n.º 2: o prazo da rotina deixava de ESPERAR pelo lote,
   * mas o lote continuava em fundo, e a retoma não avançava. Com um sinal, o
   * lote pára entre pastas e entre blocos, e devolve onde parou.
   */
  it("um sinal cancelado pára o lote entre pastas, e diz onde recomeçar", async () => {
    tema("tema-a", 1);
    tema("tema-b", 1);
    tema("tema-c", 1);
    const controlador = new AbortController();
    const posicao: { atual: Retoma | null } = { atual: null };
    const r = await gerarLoteDeDerivadas("essencial", {
      sinal: controlador.signal,
      posicao,
      // O sinal chega depois da primeira pasta: o relógio não serve de nada.
      agora: () => {
        if (st.descarregados.length > 0) controlador.abort();
        return 0;
      },
    });
    expect(r.fotografiasFeitas).toBe(1);
    expect(st.descarregados.every((c) => c.includes("/tema-a/"))).toBe(true);
    expect(r.retoma).toMatchObject({ papel: "essencial", origem: THEME_BUCKET, pasta: "tema-b" });
    // E a posição vai sendo dita, para quem chama saber onde pendurou.
    expect(posicao.atual).toMatchObject({ pasta: "tema-b" });
  });

  it("um sinal já cancelado não começa nada", async () => {
    tema("tema-a", 1);
    const controlador = new AbortController();
    controlador.abort();
    const r = await gerarLoteDeDerivadas("essencial", { sinal: controlador.signal });
    expect(st.descarregados).toHaveLength(0);
    // Sem retoma e sem nada começado, «recomeça do princípio» é `null` — e não
    // uma retoma com `pasta: ""`, que não aponta para pasta nenhuma (2.ª
    // revisão de 17/11).
    expect(r.retoma).toBeNull();
  });

  /**
   * 2.ª revisão de 17/11, n.º 3: cancelado ainda a caminho da retoma, o lote
   * devolvia-a sem as marcas — a `pendurada` e o `saltar` perdiam-se, e uma
   * pasta que pendura nunca chegava a ser saltada.
   */
  it("cancelado antes de chegar à retoma, devolve-a com as marcas", async () => {
    tema("tema-a", 1);
    tema("tema-b", 1);
    for (const marca of [{ pendurada: true }, { saltar: true }]) {
      const retoma: Retoma = {
        papel: "essencial",
        origem: THEME_BUCKET,
        pasta: "tema-b",
        caminho: "",
        ...marca,
      };
      const controlador = new AbortController();
      controlador.abort();
      const r = await gerarLoteDeDerivadas("essencial", { sinal: controlador.signal, retoma });
      expect(r.retoma).toEqual(retoma);
    }
  });

  it("cancelado já na pasta da retoma, antes de a começar, também guarda as marcas", async () => {
    tema("tema-a", 1);
    tema("tema-b", 1);
    const controlador = new AbortController();
    const base = storageFalso();
    st.cliente = {
      storage: {
        ...base.storage,
        from(bucket: string) {
          const b = base.storage.from(bucket);
          return {
            ...b,
            // O sinal chega enquanto se listam as pastas.
            async list(prefixo: string, o?: { limit?: number; offset?: number }) {
              if (prefixo === "") controlador.abort();
              return b.list(prefixo, o);
            },
          };
        },
      },
    };
    const retoma: Retoma = {
      papel: "essencial",
      origem: THEME_BUCKET,
      pasta: "tema-b",
      caminho: "",
      pendurada: true,
    };
    const r = await gerarLoteDeDerivadas("essencial", { sinal: controlador.signal, retoma });
    expect(st.descarregados).toHaveLength(0);
    expect(r.retoma).toEqual(retoma);
  });

  it("diz quando está à espera da listagem das pastas, e conta os passos", async () => {
    tema("tema-a", 2);
    const posicao: PosicaoDoLote = { atual: null };
    const vistos: unknown[] = [];
    const base = storageFalso();
    st.cliente = {
      storage: {
        ...base.storage,
        from(bucket: string) {
          const b = base.storage.from(bucket);
          return {
            ...b,
            async list(prefixo: string, o?: { limit?: number; offset?: number }) {
              if (prefixo === "") vistos.push(posicao.listando);
              return b.list(prefixo, o);
            },
          };
        },
      },
    };
    await gerarLoteDeDerivadas("essencial", { posicao });
    expect(vistos[0]).toEqual({ papel: "essencial", origem: THEME_BUCKET });
    expect(posicao.listando).toBeNull();
    // As listagens, a pasta começada e as duas fotografias.
    expect(posicao.passos).toBeGreaterThanOrEqual(3);
  });

  it("a caminho da retoma, as famílias antes da dela não se listam (revisão independente)", async () => {
    tema("tema-a", 1);
    st.conteudo[PROPOSAL_BUCKET] = new Set(["prop-1/f0.jpg"]);
    const listados: string[] = [];
    const base = storageFalso();
    st.cliente = {
      storage: {
        ...base.storage,
        from(bucket: string) {
          const b = base.storage.from(bucket);
          return {
            ...b,
            async list(prefixo: string, o?: { limit?: number; offset?: number }) {
              if (prefixo === "") listados.push(bucket);
              return b.list(prefixo, o);
            },
          };
        },
      },
    };
    await gerarLoteDeDerivadas("essencial", {
      retoma: { papel: "essencial", origem: PROPOSAL_BUCKET, pasta: "prop-1", caminho: "" },
    });
    expect(listados).toEqual([PROPOSAL_BUCKET]);
    expect(st.descarregados).toEqual([`${PROPOSAL_BUCKET}/prop-1/f0.jpg`]);
  });

  it("uma retoma para saltar a família não lista essa família e segue na seguinte", async () => {
    tema("tema-a", 1);
    st.conteudo[PROPOSAL_BUCKET] = new Set(["prop-1/f0.jpg"]);
    const r = await gerarLoteDeDerivadas("essencial", {
      retoma: {
        papel: "essencial",
        origem: THEME_BUCKET,
        pasta: "",
        caminho: "",
        saltarFamilia: true,
      },
    });
    expect(st.descarregados.some((c) => c.startsWith(`${THEME_BUCKET}/`))).toBe(false);
    expect(st.descarregados).toContain(`${PROPOSAL_BUCKET}/prop-1/f0.jpg`);
    expect(r.retoma).toBeNull();
  });

  it('uma retoma antiga com `pasta: ""` (sem saltar a família) recomeça do princípio', async () => {
    tema("tema-a", 1);
    const r = await gerarLoteDeDerivadas("essencial", {
      retoma: { papel: "essencial", origem: THEME_BUCKET, pasta: "", caminho: "" },
    });
    expect(st.descarregados).toContain(`${THEME_BUCKET}/tema-a/f0.jpg`);
    expect(r.retoma).toBeNull();
  });

  it("uma retoma marcada para SALTAR a pasta começa na seguinte", async () => {
    tema("tema-a", 1);
    tema("tema-b", 1);
    tema("tema-c", 1);
    const r = await gerarLoteDeDerivadas("essencial", {
      retoma: {
        papel: "essencial",
        origem: THEME_BUCKET,
        pasta: "tema-b",
        caminho: "",
        saltar: true,
      },
    });
    expect(
      st.descarregados.some((c) => c.includes("/tema-b/")),
      "voltou à pasta pendurada",
    ).toBe(false);
    expect(st.descarregados.some((c) => c.includes("/tema-c/"))).toBe(true);
    expect(r.retoma).toBeNull();
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

  it("conta como avaria, e não fica à espera do AVIF", async () => {
    tema("tema-a", 1);

    const r = await gerarLoteDeDerivadas("leve");

    // A de 1200 px não é ganho: é o que evita descarregar os 2,6 MB do
    // original. Se andasse com o AVIF, quem quisesse só arranjar a avaria
    // tinha de esperar pelas codificações caras — que é a razão de os dois
    // papéis existirem.
    expect(st.escritos.some((c) => c.startsWith(`${THEME_MID_BUCKET}/`))).toBe(false);
    expect(r.geradas).toBeGreaterThan(0);
  });

  it("uma foto que já a tem não a refaz", async () => {
    tema("tema-a", 1);
    await gerarLoteDeDerivadas("essencial");
    const antes = st.escritos.length;

    await gerarLoteDeDerivadas("essencial");

    expect(st.escritos).toHaveLength(antes);
  });
});
