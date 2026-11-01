import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  EASE_OUT,
  EASE_IN,
  MOLA,
  MOLA_CHEGADA,
  CHEGADA_MS,
  molaEmLinear,
  DUR_MICRO_MS,
  DUR_ELEMENTO_MS,
  DUR_VISTA_MS,
  REVEAL_MS,
  REVEAL_S,
  STAGGER_S,
  STAGGER_MS,
  STAGGER_CAP,
  WORD_STAGGER_MS,
  WORD_STAGGER_CAP,
  SENTENCE_GAP_MS,
  staggerMs,
  wordStaggerMs,
  wordCascadeEndMs,
  PHOTO_REVEAL_FULL_S,
  PHOTO_REVEAL_LARGE_S,
  PHOTO_REVEAL_TILE_S,
} from "./tokens";

/**
 * A COERÊNCIA DO MOVIMENTO, COM DENTES.
 *
 * O que faz um sítio parecer fluido não é uma animação boa: é as animações
 * obedecerem todas à mesma regra. A regra existe (`--ease-out` no globals.css),
 * mas o que a garantia tinha era boa vontade — a curva estava copiada à mão em
 * quatro ficheiros de JS e vinte e um sítios do CSS, e nada ligava as cópias.
 * Já divergiu uma vez, em silêncio: o comentário do Reveal descrevia uma curva
 * que a constante ao lado dele não usava.
 *
 * Estes testes ligam as cópias. Alterar um dos lados sozinho — a variável CSS,
 * a ficha JS, ou reintroduzir um literal numa primitiva — fica vermelho aqui, e
 * não fica invisível até alguém reparar que dois blocos vizinhos desaceleram de
 * maneiras diferentes.
 */

const lerFonte = (relativo: string) =>
  readFileSync(fileURLToPath(new URL(relativo, import.meta.url)), "utf8");

/** Normaliza um valor CSS para comparar por conteúdo e não por espaços. */
const norm = (v: string) => v.replace(/\s+/g, "").toLowerCase();

/** Tira comentários (de linha e de bloco) — prosa não é código. */
const semComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("ficha de movimento ↔ globals.css", () => {
  // As duas folhas: o `@theme` saiu para o `tema.css` (ver o cabeçalho dele).
  const css = lerFonte("../../app/globals.css") + lerFonte("../../app/tema.css");

  it("EASE_OUT é, caracter a caracter, a mesma curva que `--ease-out` no CSS", () => {
    const m = /--ease-out:\s*([^;]+);/.exec(css);
    expect(m, "o `--ease-out` desapareceu do :root do globals.css").not.toBeNull();
    // Se alguém afinar a curva de assinatura no CSS e não aqui (ou o
    // contrário), o sítio passa a ter DUAS desacelerações: o CSS numa, e tudo o
    // que o JS escreve em `element.style.transition` na outra.
    expect(norm(m![1])).toBe(norm(EASE_OUT));
  });

  it("a curva de assinatura é uma desaceleração de verdade (acaba devagar)", () => {
    // Guarda contra uma troca distraída por uma curva simétrica (`ease`,
    // `cubic-bezier(0.4,0,0.2,1)`): o segundo ponto de controlo tem de estar
    // praticamente no fim para o movimento assentar em vez de parar de repente.
    const n = /cubic-bezier\(([^)]+)\)/.exec(EASE_OUT);
    expect(n).not.toBeNull();
    const [x1, , x2, y2] = n![1].split(",").map((v) => parseFloat(v));
    expect(x1).toBeLessThan(0.35); // arranca depressa
    expect(x2).toBeLessThan(0.5); // e já está quase parada bem antes do fim
    expect(y2).toBe(1);
  });

  /**
   * ── A MOLA DA CHEGADA: DOIS SÍTIOS, UM VALOR ─────────────────────────────
   *
   * Os trinta e um números do `--bo-mola-chegada` não se escrevem: calculam-se
   * a partir da `MOLA_CHEGADA`. Este caso REGENERA-OS e compara-os com os que
   * estão no CSS, exactamente como os dois casos das curvas aqui em cima — se
   * alguém afinar a mola num dos lados, o outro fica vermelho em vez de ficar a
   * animar por uma mola que já não é aquela.
   *
   * É também a razão por que isto não conta como «uma terceira curva escrita à
   * mão»: não há nenhuma mão. Ver o argumento inteiro no
   * `movimento-da-casa.test.ts`.
   */
  it("a mola da chegada no CSS é a `MOLA_CHEGADA` amostrada, e não outra coisa", () => {
    const m = /--bo-mola-chegada:\s*(linear\([^;]+\));/.exec(css);
    expect(m, "o `--bo-mola-chegada` desapareceu do :root do globals.css").not.toBeNull();
    expect(norm(m![1])).toBe(norm(molaEmLinear()));
    const d = /--bo-mola-chegada-ms:\s*(\d+)ms/.exec(css);
    expect(d, "a duração da mola desapareceu do CSS").not.toBeNull();
    expect(Number(d![1])).toBe(CHEGADA_MS);
  });

  it("e é uma mola de CHEGADA, não a do arrasto — as duas têm trabalhos opostos", () => {
    // O amortecimento é o que as separa, e é medível. A do ARRASTO assenta e
    // fica (ζ ≈ 0,95, ultrapassagem de 0,007%); usá-la numa chegada era
    // escrever «mola» e não ter mola nenhuma. A da CHEGADA passa do sítio de
    // propósito, e é isso que se lê como «chegou» em vez de «apareceu».
    const zeta = (m: { rigidez: number; amortecimento: number; massa: number }) =>
      m.amortecimento / (2 * Math.sqrt(m.rigidez * m.massa));
    expect(zeta(MOLA), "a mola do arrasto começou a oscilar").toBeGreaterThan(0.9);
    expect(zeta(MOLA_CHEGADA), "a mola da chegada deixou de passar do sítio").toBeLessThan(0.75);
    expect(zeta(MOLA_CHEGADA), "a mola da chegada passou a saltitar").toBeGreaterThan(0.4);
  });

  it("EASE_IN é, caracter a caracter, a mesma curva que `--ease-in` no CSS", () => {
    const m = /--ease-in:\s*([^;]+);/.exec(css);
    expect(m, "o `--ease-in` desapareceu do :root do globals.css").not.toBeNull();
    expect(norm(m![1])).toBe(norm(EASE_IN));
  });

  it("a curva de saída é mesmo uma ACELERAÇÃO — o contrário da de entrada", () => {
    // O erro fácil aqui é copiar a de entrada e trocar-lhe o nome: as duas
    // ficam a chamar-se coisas diferentes e a fazer a mesma coisa, e a saída
    // passa a ler-se como se a coisa ainda pudesse voltar atrás.
    const n = /cubic-bezier\(([^)]+)\)/.exec(EASE_IN);
    expect(n).not.toBeNull();
    const [x1, y1, , y2] = n![1].split(",").map((v) => parseFloat(v));
    expect(y1).toBe(0); // hesita no arranque
    expect(x1).toBeGreaterThan(0.2); // e hesita mesmo, não só um instante
    expect(y2).toBe(1); // e sai a acelerar até ao fim
  });

  it("a escala dos tempos é a mesma no CSS e na ficha", () => {
    /**
     * ── O PREFIXO MUDOU, E O TESTE NÃO O TERIA APANHADO ──────────────────
     *
     * Estava `--duration-*`. O Tailwind v4 lê os utilitários `duration-*` do
     * espaço `--transition-duration-*`, e só desse — COMPILADO para confirmar,
     * com dois tokens irmãos no mesmo ficheiro:
     *
     *     --duration-alfa            →  .duration-alfa    NENHUMA REGRA
     *     --transition-duration-beta →  .duration-beta     { … }
     *
     * As variáveis chegavam ao `:root` com os valores certos e as três classes
     * eram zero. Catorze chamadas no back office a correr aos 150 ms por
     * omissão, sem ninguém dar por isso.
     *
     * E este teste passava, porque comparava o NÚMERO no `@theme` com o número
     * na ficha — os dois estavam certos. O que ninguém comparava era o nome do
     * token com o nome que o Tailwind procura. Um teste pode ligar as duas
     * pontas certas e não reparar que o fio não chega a lado nenhum.
     */
    // Os `--transition-duration-*` vivem no `@theme` (é lá que o Tailwind os lê
    // e faz `duration-elemento`); a ficha serve quem escreve `style.transition` à
    // mão. Dois sítios, um valor — como já acontece com a curva.
    const pares: [string, number][] = [
      ["micro", DUR_MICRO_MS],
      ["elemento", DUR_ELEMENTO_MS],
      ["vista", DUR_VISTA_MS],
    ];
    for (const [nome, ms] of pares) {
      const m = new RegExp(`--transition-duration-${nome}:\\s*([0-9]+)ms;`).exec(css);
      expect(
        m,
        `o \`--transition-duration-${nome}\` desapareceu do @theme do globals.css`,
      ).not.toBeNull();
      expect(Number(m![1]), `--transition-duration-${nome}`).toBe(ms);
    }
  });

  it("os três degraus estão por ordem, e nenhum passa dos 400ms", () => {
    // O tecto é dela: «nada acima de 400ms». A excepção — a entrada de uma
    // fotografia ao scroll — não é um degrau desta escala, é a escala própria
    // das fotografias (`PHOTO_REVEAL_*`), e por isso não é medida aqui.
    expect(DUR_MICRO_MS).toBeLessThan(DUR_ELEMENTO_MS);
    expect(DUR_ELEMENTO_MS).toBeLessThan(DUR_VISTA_MS);
    expect(DUR_VISTA_MS).toBeLessThanOrEqual(400);
  });
});

describe("as primitivas de movimento leem a ficha, não uma cópia", () => {
  // Todos os ficheiros que ESCREVEM movimento a partir de JS. Um literal
  // `cubic-bezier(...)` aqui dentro é uma cópia nova da curva de assinatura — a
  // avaria que estes testes existem para apanhar.
  const primitivas = ["../../components/motion/Reveal.tsx", "../../components/AnimateIn.tsx"];

  it.each(primitivas)("%s não escreve nenhuma curva à mão", (ficheiro) => {
    const src = semComentarios(lerFonte(ficheiro));
    expect(src).not.toMatch(/cubic-bezier\(/);
  });

  it.each(primitivas)("%s importa a curva de @/lib/motion/tokens", (ficheiro) => {
    const src = semComentarios(lerFonte(ficheiro));
    expect(src).toMatch(/from\s+"@\/lib\/motion\/tokens"/);
  });

  it("Reveal e AnimateIn revelam com a MESMA duração (a ficha, não um número solto)", () => {
    // Já eram os dois 0,75 s — mas por coincidência, cada um com o seu literal.
    // Duas entradas do mesmo gesto na mesma página com durações diferentes é
    // exactamente o que se lê como desleixo.
    for (const f of ["../../components/motion/Reveal.tsx", "../../components/AnimateIn.tsx"]) {
      const src = semComentarios(lerFonte(f));
      expect(src, f).toMatch(/REVEAL_S/);
      // e nenhum `0.75s` escrito à mão a fazer de conta que é a mesma coisa
      expect(src, f).not.toMatch(/0\.75s/);
    }
  });
});

describe("valores da ficha", () => {
  it("segundos e milissegundos descrevem o mesmo tempo", () => {
    expect(REVEAL_S).toBeCloseTo(REVEAL_MS / 1000, 10);
  });

  it("a cascata resolve-se depressa: 6 elementos ficam abaixo de 1,5 s no total", () => {
    // Uma cascata é para se ler como composta, não para se esperar por ela. Com
    // 6 elementos (o maior `stagger` do sítio hoje), o último tem de estar
    // acabado bem dentro do tempo em que alguém ainda está a olhar.
    const totalS = STAGGER_S * 5 + REVEAL_S;
    expect(totalS).toBeLessThan(1.5);
  });

  it("segundos e milissegundos do passo descrevem o mesmo tempo", () => {
    expect(STAGGER_MS).toBeCloseTo(STAGGER_S * 1000, 10);
  });
});

describe("o tecto da cascata — nenhuma lista castiga quem chega ao fim", () => {
  it("uma cascata de blocos nunca tem mais rasto do que STAGGER_CAP passos", () => {
    // ESTA é a propriedade que interessa, e é sobre a lista INTEIRA, não sobre
    // um elemento: seja de 5 elementos ou de 500, o último nunca arranca depois
    // de `STAGGER_CAP × STAGGER_MS`. Sem tecto isto era uma multiplicação sem
    // limite — a parede de logótipos chegava a 756 ms de rasto.
    const tectoMs = STAGGER_CAP * STAGGER_MS;
    for (const n of [1, 5, 19, 50, 500]) {
      const ultimo = staggerMs(n - 1);
      expect(ultimo, `cascata de ${n}`).toBeLessThanOrEqual(tectoMs);
    }
    expect(tectoMs).toBeLessThanOrEqual(400);
  });

  it("antes do tecto, o passo é regular (não é um tecto disfarçado de nada)", () => {
    // Se o tecto fosse 0 ou 1, o teste acima passava e a cascata desaparecia.
    expect(staggerMs(0)).toBe(0);
    expect(staggerMs(1)).toBe(STAGGER_MS);
    expect(staggerMs(2)).toBe(2 * STAGGER_MS);
    expect(STAGGER_CAP).toBeGreaterThanOrEqual(3);
  });

  it("as palavras têm o seu próprio tecto, e um passo mais curto que os blocos", () => {
    // Palavras contíguas não podem ter a cadência de blocos separados, ou uma
    // frase deixa de se ler como uma frase.
    expect(WORD_STAGGER_MS).toBeLessThan(STAGGER_MS);
    const tectoPalavraMs = WORD_STAGGER_CAP * WORD_STAGGER_MS;
    for (const n of [3, 10, 40]) {
      expect(wordStaggerMs(n - 1), `título de ${n} palavras`).toBeLessThanOrEqual(tectoPalavraMs);
    }
  });
});

describe("encadear duas metades de uma frase", () => {
  // A conta que estava escrita à mão no /sobre, para comparar contra.
  const contaAntiga = (texto: string, passo: number) =>
    texto.split(/\s+/).length * passo + SENTENCE_GAP_MS;

  it("enquanto o tecto não morde, dá exactamente o mesmo instante de antes", () => {
    // Prova de que a reorganização NÃO afinou nada: as frases reais do /sobre,
    // nas duas línguas, arrancam no mesmo milissegundo em que arrancavam.
    for (const frase of [
      "Não decoramos apenas espaços.",
      "We don't just decorate spaces.",
      "Uma frase de seis palavras aqui",
    ]) {
      expect(wordCascadeEndMs(frase), frase).toBe(contaAntiga(frase, WORD_STAGGER_MS));
    }
  });

  it("num título longo, o tecto morde e a segunda metade não fica à espera", () => {
    const longa = Array.from({ length: 20 }, (_, i) => `palavra${i}`).join(" ");
    expect(wordCascadeEndMs(longa)).toBeLessThan(contaAntiga(longa, WORD_STAGGER_MS));
    expect(wordCascadeEndMs(longa)).toBeLessThanOrEqual(
      (WORD_STAGGER_CAP + 1) * WORD_STAGGER_MS + SENTENCE_GAP_MS,
    );
  });

  it("texto vazio não inventa atraso nenhum", () => {
    expect(wordCascadeEndMs("   ")).toBe(0);
  });
});

describe("a escala de revelação de fotografia", () => {
  it("é uma escala a sério: maior a foto, mais tempo", () => {
    // Não é um número por página — são degraus ordenados por tamanho da foto.
    expect(PHOTO_REVEAL_FULL_S).toBeGreaterThan(PHOTO_REVEAL_LARGE_S);
    expect(PHOTO_REVEAL_LARGE_S).toBeGreaterThan(PHOTO_REVEAL_TILE_S);
  });

  it("o degrau mais pequeno é a duração de entrada do resto do sítio", () => {
    // Um mosaico é só mais um bloco a entrar; não precisa de tempo próprio.
    expect(PHOTO_REVEAL_TILE_S).toBe(REVEAL_S);
  });
});

describe("as páginas não voltam a escrever tempos à mão", () => {
  // Os ficheiros já convertidos. (O `ConfirmacaoClient` ainda tem atrasos à
  // mão — está descrito no relatório, não convertido, e por isso não está aqui:
  // um teste que falhasse por trabalho por fazer não teria dentes nenhuns.)
  const paginas = [
    "../../app/[lang]/(site)/page.tsx",
    "../../app/[lang]/(site)/sobre/page.tsx",
    "../../app/[lang]/(site)/clientes/page.tsx",
    "../../app/[lang]/(site)/contacto/page.tsx",
    "../../app/[lang]/(site)/servicos/page.tsx",
    "../../app/[lang]/(site)/servicos/[slug]/page.tsx",
    "../../app/[lang]/(site)/legal/LegalDocView.tsx",
  ];

  it.each(paginas)("%s não tem `delay={…}` com aritmética à mão", (ficheiro) => {
    const src = semComentarios(lerFonte(ficheiro));
    // Apanha `delay={110}`, `delay={i * 55}`, `delay={Math.min(i, 4) * 40}`.
    const maus = [...src.matchAll(/delay=\{([^}]*)\}/g)]
      .map((m) => m[1].trim())
      .filter((expr) => /\d/.test(expr) && !/^(staggerMs|wordCascadeEndMs)\(/.test(expr));
    expect(maus).toEqual([]);
  });

  it.each(paginas)("%s não fixa a duração de um <Reveal> num número solto", (ficheiro) => {
    const src = semComentarios(lerFonte(ficheiro));
    const maus = [...src.matchAll(/duration=\{([^}]*)\}/g)]
      .map((m) => m[1].trim())
      .filter((expr) => /^[\d.]+$/.test(expr));
    expect(maus).toEqual([]);
  });

  it.each(paginas)("%s não redefine o passo do stagger do <Reveal>", (ficheiro) => {
    const src = semComentarios(lerFonte(ficheiro));
    expect(src).not.toMatch(/stagger=\{[\d.]+\}/);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O NOME DO TOKEN TEM DE SER O NOME QUE O TAILWIND PROCURA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro já ligava as duas pontas — o número no `@theme` e o número na
 * ficha de JS — e as duas estavam certas. Mesmo assim, as três classes
 * `duration-micro`, `duration-elemento` e `duration-vista` não geravam regra
 * nenhuma, e catorze chamadas no back office corriam aos 150 ms por omissão.
 *
 * A causa: os tokens estavam declarados como `--duration-*`, e o Tailwind v4 lê
 * os utilitários `duration-*` do espaço `--transition-duration-*`. COMPILADO
 * para confirmar, com dois tokens irmãos no mesmo ficheiro:
 *
 *     --duration-alfa            →  .duration-alfa    NENHUMA REGRA
 *     --transition-duration-beta →  .duration-beta     { transition-duration: … }
 *
 * O que faltava era esta rede. Um teste pode ligar duas pontas certas e não
 * reparar que o fio não chega a lado nenhum — e no Tailwind v4 isso não dá erro
 * de compilação nem aviso do lint: não gera regra e cala-se.
 */
describe("o espaço de nomes dos tempos", () => {
  // As duas folhas: o `@theme` saiu para o `tema.css` (ver o cabeçalho dele).
  const css = lerFonte("../../app/globals.css") + lerFonte("../../app/tema.css");

  it("declara os tempos onde o Tailwind os lê, e não ao lado", () => {
    for (const nome of ["micro", "elemento", "vista", "toque"]) {
      expect(
        css,
        `\`--transition-duration-${nome}\` em falta: a classe \`duration-${nome}\` ` +
          `não gera regra nenhuma e cai nos 150 ms por omissão, em silêncio`,
      ).toMatch(new RegExp(`--transition-duration-${nome}:\\s*[0-9]+ms;`));
    }
  });

  it("e não deixa lá ficar a forma antiga, que não faz nada", () => {
    // `--duration-micro:` com o prefixo errado voltaria a compilar para zero
    // regras. A âncora tem de ser o início da declaração, senão apanha a forma
    // certa (`--transition-duration-micro`) por estar contida nela.
    for (const nome of ["micro", "elemento", "vista", "toque"]) {
      expect(css, `\`--duration-${nome}\` voltou — essa forma não gera regra`).not.toMatch(
        new RegExp(`(^|[^-])--duration-${nome}:`, "m"),
      );
    }
  });
});
