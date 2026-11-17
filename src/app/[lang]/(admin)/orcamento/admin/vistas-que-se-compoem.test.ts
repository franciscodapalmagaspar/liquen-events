import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS VISTAS QUE SE COMPÕEM, E AS QUE ASSENTAM COMO UMA LAJE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O back office tinha duas maneiras de chegar ao ecrã. Umas vistas COMPUNHAM-SE
 * — os blocos entravam em escada, um a seguir ao outro, pela ordem por que se
 * lêem — e outras assentavam de uma vez, como uma laje. A diferença via-se a
 * olho, e a diferença não era uma decisão: era o sítio onde a passagem anterior
 * parou. A `Overview` e as `Propostas` tinham escada; as `Tarefas`, os
 * `Contratos`, o `Material`, os `Temas`, o `StatsDashboard` e as
 * `DefinicoesProposta` não tinham nenhuma.
 *
 * ── PORQUE É QUE ISTO É UM TESTE E NÃO SÓ UMA CLASSE ──────────────────────
 *
 * Porque uma escada partida NÃO SE VÊ a partir do código. O defeito exacto já
 * aconteceu nesta casa uma vez (ver `cascata-dos-pedidos.test.ts`): na Visão
 * Geral a classe caiu DENTRO de um `.map()` e três blocos ficaram com a mesma
 * vez — `0, 2, 2, 2, 3`. Animavam-se os filhos e não o bloco. Quem o apanhou
 * foi o browser, e só porque alguém foi lá olhar.
 *
 * ── O QUE ESTE FICHEIRO PRENDE ───────────────────────────────────────────
 *
 * 1. Que cada uma das seis vistas TEM escada — e que ninguém a tira sem dar
 *    por isso ao arrumar um `className`.
 * 2. Que a escada é POR BLOCO: as vezes começam no zero, contam de um em um e
 *    não se repetem dentro do mesmo ficheiro. Duas vezes iguais são dois
 *    blocos a chegar ao mesmo tempo, que é a laje outra vez em ponto pequeno.
 * 3. Que nenhuma vez nasce dentro de um `.map()`. Uma lista de cinquenta
 *    linhas a entrar uma a uma é exactamente a lentidão que o tecto do sexto
 *    degrau (`--bo-degraus-max: 5`, no `globals.css`) existe para evitar.
 * 4. Que cada `--cena` anda com a classe `bo-cena` e vice-versa: uma vez sem
 *    classe não anima nada, e uma classe sem vez põe o bloco no degrau zero
 *    calado.
 * 5. Que nenhuma vista passa dos quatro blocos. Partir um ecrã em pedaços só
 *    para haver mais degraus é o que faz uma vista ficar agitada.
 *
 * ── O QUE NÃO PRENDE, E DE PROPÓSITO ─────────────────────────────────────
 *
 * Não prende que a animação SE VEJA: isso é o browser, e mede-se num browser.
 * Não prende o gesto — os 600 ms, os 12 px, a curva e o tecto vivem no
 * `globals.css` e são guardados pelo `passo-que-chega.test.ts`. Aqui só se
 * guarda QUEM a usa e COMO a numera.
 * E não prende que os esqueletos de carregamento fiquem de fora: isso lê-se
 * nos comentários de cada ramo, e um teste que o tentasse adivinhar a partir
 * do texto do ficheiro seria um teste sobre a escrita e não sobre o ecrã.
 */

const RAIZ = "src/app/[lang]/(admin)/orcamento/admin";

/** As seis que eram laje, e a que serve de modelo. */
const VISTAS = [
  "Tarefas.tsx",
  "Contratos.tsx",
  "Material.tsx",
  "Temas.tsx",
  "StatsDashboard.tsx",
  "DefinicoesProposta.tsx",
] as const;

/** O modelo — tem escada desde antes desta passagem, e é o controlo positivo. */
const MODELO = "Overview.tsx";

const ler = (ficheiro: string) => readFileSync(`${RAIZ}/${ficheiro}`, "utf8");

/**
 * Comentários fora, com as linhas de pé — a regra da casa (`cascata-dos-pedidos`).
 * Sem isto, uma vista que só FALE da `bo-cena` num comentário contava como
 * uma vista encenada.
 */
function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

/**
 * E o TEXTO fora também, com as aspas de pé.
 *
 * Isto não é zelo: a contagem de parênteses que descobre o `.map()` conta
 * parênteses a sério, e há dezenas de rótulos escritos com eles («Ganho
 * (aceite, com IVA)»). Um parêntese dentro de uma frase desalinhava a conta
 * toda e o teste passava a acusar `.map()` onde não há nenhum.
 */
function semTexto(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, " ");
  return fonte
    .replace(/"(?:[^"\\\n]|\\.)*"/g, (m) => `"${vazio(m.slice(1, -1))}"`)
    .replace(/'(?:[^'\\\n]|\\.)*'/g, (m) => `'${vazio(m.slice(1, -1))}'`);
}

/** As vezes declaradas num ficheiro, pela ordem em que aparecem na fonte. */
function vezes(fonte: string): number[] {
  return [...semComentarios(fonte).matchAll(/"--cena":\s*(\d+)/g)].map((m) => Number(m[1]));
}

/** Quantas vezes a classe é mesmo USADA (comentários já fora). */
function classes(fonte: string): number {
  return [...semComentarios(fonte).matchAll(/\bbo-cena\b/g)].length;
}

/**
 * As vezes que nascem dentro de um `.map()` / `.flatMap()`.
 *
 * Percorre a fonte a contar parênteses e guarda, para cada um que abre, se o
 * que está imediatamente antes dele é um `.map(`. Uma `--cena` encontrada com
 * um desses ainda por fechar está dentro do percurso de uma lista — que é o
 * defeito que a Visão Geral já teve.
 */
function vezesDentroDeMap(fonte: string): number {
  // A própria `"--cena"` é texto entre aspas, e o `semTexto` apagava-a com o
  // resto. Vira marca ANTES de o texto sair, para sobreviver à limpeza.
  const src = semTexto(semComentarios(fonte).replace(/"--cena"/g, "__VEZ__"));
  const pilha: boolean[] = [];
  let dentro = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "(") pilha.push(/\.(?:flatMap|map)\s*$/.test(src.slice(Math.max(0, i - 12), i)));
    else if (c === ")") pilha.pop();
    else if (c === "_" && src.startsWith("__VEZ__", i)) {
      if (pilha.some(Boolean)) dentro++;
      i += 6;
    }
  }
  return dentro;
}

/**
 * Tudo o que está mal numa vista, em português e por ordem de gravidade.
 * Devolve uma lista vazia quando a escada está de pé — é isso que os casos
 * comparam, e é o que faz a mensagem de uma falha dizer logo o que se partiu.
 */
function problemas(fonte: string): string[] {
  const v = vezes(fonte);
  const erros: string[] = [];

  if (v.length === 0) return ["a vista deixou de ter escada: nenhuma `--cena`"];
  if (v.length < 2)
    erros.push(`só há um bloco encenado (${v.join(", ")}) — a escada precisa de dois`);
  if (v.length > 4) erros.push(`${v.length} blocos encenados — o máximo desta casa são quatro`);

  const repetidas = v.length - new Set(v).size;
  if (repetidas > 0) erros.push(`há blocos a partilhar a mesma vez: ${v.join(", ")}`);

  const ordenadas = [...v].sort((a, b) => a - b);
  if (ordenadas[0] !== 0) erros.push(`a escada começa no ${ordenadas[0]} em vez de no princípio`);
  ordenadas.forEach((n, i) => {
    if (n !== i) erros.push(`salto na escada: ${v.join(", ")}`);
  });

  if (classes(fonte) !== v.length)
    erros.push(
      `${classes(fonte)} classes \`bo-cena\` para ${v.length} vezes — ` +
        "uma vez sem classe não anima, e uma classe sem vez fica calada no degrau zero",
    );

  const emMap = vezesDentroDeMap(fonte);
  if (emMap > 0)
    erros.push(`${emMap} vez(es) dentro de um \`.map()\` — a escada é por BLOCO, nunca por linha`);

  return [...new Set(erros)];
}

describe("as seis vistas que deixaram de ser laje", () => {
  it.each(VISTAS)("%s compõe-se à chegada, e os degraus estão por ordem", (ficheiro) => {
    expect(problemas(ler(ficheiro)), `${ficheiro}: a escada partiu-se`).toEqual([]);
  });

  it("e nenhuma delas é a única a saber — todas usam a MESMA classe da casa", () => {
    // Uma vista que copiasse o gesto para uma classe sua passava nos casos de
    // cima e ficava com uma segunda linguagem de movimento na mesma página.
    for (const ficheiro of VISTAS) {
      const src = semComentarios(ler(ficheiro));
      expect(src, `${ficheiro} inventou uma animação sua`).not.toMatch(/@keyframes/);
      expect(src, `${ficheiro} escreveu um atraso à mão`).not.toMatch(/animation-delay:/);
    }
  });
});

/**
 * ── O CONTROLO POSITIVO ───────────────────────────────────────────────────
 *
 * O `Overview.tsx` tem esta escada desde antes desta passagem e não foi tocado
 * aqui. Se ele deixar de passar, o que está partido é a régua e não as vistas —
 * e sem este caso a régua podia estar a medir sempre zero sem ninguém saber.
 */
describe("o controlo positivo: o modelo continua a passar na mesma régua", () => {
  it(`${MODELO} passa em tudo o que se exige às seis`, () => {
    expect(
      problemas(ler(MODELO)),
      "o modelo da casa deixou de passar na sua própria régua",
    ).toEqual([]);
  });
});

/**
 * ── E A VERIFICAÇÃO DO CONTROLO NEGATIVO ──────────────────────────────────
 *
 * Uma régua que nunca acusa nada não guarda nada. Aqui desfaz-se cada uma das
 * maneiras de partir a escada — sobre uma CÓPIA em memória do ficheiro, que o
 * ficheiro em disco fica como está — e confirma-se que a régua fica vermelha
 * por essa razão e não por outra qualquer.
 */
describe("o controlo negativo: a régua fica vermelha quando se desfaz a escada", () => {
  const contratos = ler("Contratos.tsx");

  it("uma vista sem escada nenhuma é acusada", () => {
    const laje = contratos.replace(/\s*style=\{\{ "--cena": \d+ \} as React\.CSSProperties\}/g, "");
    expect(problemas(laje)[0]).toMatch(/deixou de ter escada/);
  });

  it("dois blocos com a mesma vez são acusados", () => {
    const repetida = contratos.replace('"--cena": 2', '"--cena": 1');
    expect(problemas(repetida).join(" · ")).toMatch(/partilhar a mesma vez/);
  });

  it("uma escada que salta é acusada", () => {
    const salto = contratos.replace('"--cena": 2', '"--cena": 7');
    expect(problemas(salto).join(" · ")).toMatch(/salto na escada/);
  });

  it("uma escada que não começa no princípio é acusada", () => {
    const tarde = contratos.replace('"--cena": 0', '"--cena": 4');
    expect(problemas(tarde).join(" · ")).toMatch(/começa no|salto na escada/);
  });

  it("uma vez sem a classe é acusada", () => {
    const muda = contratos.replace("bo-cena mb-6 text-sm", "mb-6 text-sm");
    expect(problemas(muda).join(" · ")).toMatch(/classes `bo-cena`/);
  });

  it("uma vez que caia dentro de um `.map()` é acusada", () => {
    // O defeito exacto da Visão Geral: a classe desce do bloco para a linha.
    const porLinha = contratos.replace(
      "{STATUSES.map((s) => {",
      '{STATUSES.map((s) => { const passo = { "--cena": 9 };',
    );
    expect(problemas(porLinha).join(" · ")).toMatch(/dentro de um `\.map\(\)`/);
  });

  it("e um rótulo com parênteses NÃO é confundido com um `.map()`", () => {
    // A armadilha da conta de parênteses: «Ganho (aceite, com IVA)». Sem o
    // texto de fora, este caso ficava vermelho sem haver defeito nenhum.
    expect(vezesDentroDeMap(ler("StatsDashboard.tsx"))).toBe(0);
  });
});
