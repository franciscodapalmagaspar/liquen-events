import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CONTRATO DOS PONTOS DE CORTE — três larguras, e só três
 * ════════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. O back office decidiu ter três larguras: `sm` (640), `lg`
 * (1024) e `wide` (1440). Está escrito e justificado no `ui/adaptativo.ts`, e a
 * razão não é gosto: dois sistemas de cortes a competir é como um ecrã acaba
 * com uma tabela a três colunas a 800 px e a duas a 900 px, sem ninguém
 * perceber porquê.
 *
 * Só que uma regra escrita num comentário é uma regra que se cumpre enquanto
 * alguém se lembrar dela. Estava partida em cerca de doze sítios, e as duas
 * consequências eram reais e mediam-se:
 *
 *   · aos 768 px (`md:`, o iPad em retrato) decidiam-se coisas que não deviam —
 *     e foi nessa largura que apareceram os quatro achados Críticos do
 *     `MOBILE-AUDIT.md`;
 *   · aos 1280 px (`xl:`) escondiam-se painéis inteiros — o índice do estúdio,
 *     a pré-visualização dos emails, a lista do dia no calendário —, ou seja,
 *     no portátil dela (1024–1440) faltava interface que já tinha espaço.
 *
 * O QUE ESTE FICHEIRO GARANTE. Que não volta a entrar um. A rede lê o
 * CÓDIGO-FONTE do back office e falha à primeira classe `md:`, `xl:` ou `2xl:`
 * — incluindo as formas `max-md:` e as que vivem em constantes de classes fora
 * do JSX, que é onde a última se tinha escondido (`Temas.tsx`).
 *
 * A pergunta certa quando falta um corte NÃO é «qual é o próximo número». É:
 *  1. isto é sobre a largura da JANELA? então é `sm:` ou `lg:`;
 *  2. é sobre o CONTENTOR (uma gaveta, um cartão, uma coluna)? então é
 *     `flex-wrap` sozinho, `min-[22rem]:` ou `@container`/`@[…]:`;
 *  3. é sobre o PONTEIRO (há teclado? é dedo?) então é `pointer-coarse:` —
 *     e não é uma pergunta sobre largura nenhuma.
 */

const RAIZ = process.cwd();
const BACK_OFFICE = "src/app/[lang]/(admin)/orcamento/admin";

/** Os cortes que este back office não usa, em todas as formas em que se escrevem. */
const PROIBIDOS = new Set(["md", "xl", "2xl", "max-md", "max-xl", "max-2xl"]);

/**
 * ── AS EXCEPÇÕES CONHECIDAS ─────────────────────────────────────────────────
 *
 * Estes ficheiros TÊM cortes proibidos hoje e estão a ser tratados em paralelo,
 * cada um por quem o conhece. A lista existe para esta rede passar já — e
 * apertar sozinha à medida que eles caem: o dia em que um destes ficheiros
 * ficar limpo, apaga-se a linha e ele passa a ser guardado como os outros.
 *
 * Não é um sítio para arrumar dívida nova. Acrescentar um nome aqui é dizer
 * «este ficheiro tem dois sistemas de cortes a competir e vai continuar a ter»,
 * o que é uma decisão consciente e quase nunca a certa.
 *
 * ── E PORQUE É QUE O QUE SE GUARDA É UM TECTO E NÃO O NOME DO FICHEIRO ──────
 *
 * Porque um nome numa lista de excepções perdoa o ficheiro INTEIRO, e daí para
 * a frente ele podia ganhar mais dez cortes sem ninguém dar por isso. O que
 * está guardado é quantos cada um tem HOJE: baixar é sempre bem-vindo (a rede
 * continua verde) e SUBIR põe o teste vermelho com o nome e a linha. À medida
 * que cada um chega a zero, apaga-se a linha e ele passa a ser guardado como
 * todos os outros.
 *
 * (`Clientes.tsx`, `Contratos.tsx` e `Inventario.tsx` estiveram aqui e já
 * saíram — ficaram limpos enquanto isto se escrevia.)
 */
const TECTO_POR_TRATAR = new Map<string, number>([
  // O painel de detalhe do pedido (`xl:grid-cols`, `xl:hidden`, `xl:sticky`) e
  // a palavra «Pesquisar» do atalho (`hidden md:inline`).
  ["AdminClient.tsx", 4],
  // (`ProposalStudio.tsx` esteve aqui com tecto 4 — o par PT/EN da nota do
  // orçamento (`xl:grid`) e a coluna do enquadramento das fotos
  // (`2xl:grid-cols-1` / `2xl:hidden`). Os quatro eram perguntas sobre a coluna
  // de conteúdo disfarçadas de perguntas sobre a janela; passaram a `@container`
  // e o ficheiro chegou a zero.)
  // (`Temas.tsx` esteve aqui com tecto 1 — o `md:grid-cols-5` da grelha de
  // miniaturas, escondido numa constante e não no JSX. A grelha passou a
  // `@container` e ele chegou a zero, portanto a linha saiu.)
  // (`evento/[id]/DossierClient.tsx` esteve aqui com tecto 2 — a coluna lateral
  // do dossier, `xl:grid-cols` + `xl:sticky`. Passou a `lg:` e chegou a zero,
  // portanto a linha saiu e ele passa a ser guardado como todos os outros.)
]);

/**
 * Apaga os comentários SEM ENCOLHER: cada carácter vira um espaço e as mudanças
 * de linha ficam. É o que faz o número de linha do relatório apontar para o
 * sítio verdadeiro — a versão que encolhia mandava procurar duzentas linhas
 * acima. (Copiado do `Fluidez.contrato.test.ts`, pela mesma razão.)
 */
const semComentarios = (src: string) => {
  const branco = (m: string) => m.replace(/[^\n]/g, " ");
  return src.replace(/\/\*[\s\S]*?\*\//g, branco).replace(/(?<!:)\/\/[^\n]*/g, branco);
};

/**
 * Os LITERAIS DE TEXTO do ficheiro, com a posição onde começam.
 *
 * Olhar só para o JSX não chegava: metade das listas de classes desta casa vive
 * numa constante (`const GRELHA = "grid grid-cols-2 …"`) e era exactamente lá
 * que estava o `md:` que ninguém via. E olhar para o ficheiro inteiro dava
 * falsos positivos: `md:` é também uma CHAVE de objecto legítima (os tamanhos
 * do `Card` e do `Button`), e essas não são classes nenhumas.
 */
function literais(fonte: string): { texto: string; inicio: number }[] {
  const fora: { texto: string; inicio: number }[] = [];
  for (let i = 0; i < fonte.length; i++) {
    const aspas = fonte[i];
    if (aspas !== '"' && aspas !== "'" && aspas !== "`") continue;
    let j = i + 1;
    while (j < fonte.length) {
      if (fonte[j] === "\\") j += 2;
      else if (fonte[j] === aspas) break;
      // Uma quebra de linha fecha uma string normal: se chegámos aqui é porque
      // as aspas eram outra coisa (um apóstrofo em prosa, por exemplo).
      else if (aspas !== "`" && fonte[j] === "\n") break;
      else j++;
    }
    if (j < fonte.length && fonte[j] === aspas) {
      fora.push({ texto: fonte.slice(i + 1, j), inicio: i + 1 });
      i = j;
    }
  }
  return fora;
}

/** Separa `lg:hover:bg-x` sem partir os dois pontos de dentro de `[…]`. */
function variantes(classe: string): string[] {
  const partes: string[] = [];
  let actual = "";
  let dentro = 0;
  for (const c of classe) {
    if (c === "[" || c === "(") dentro++;
    else if (c === "]" || c === ")") dentro--;
    if (c === ":" && dentro === 0) {
      partes.push(actual);
      actual = "";
      continue;
    }
    actual += c;
  }
  // A última parte é o utilitário, não uma variante: `max-w-md` fica de fora,
  // que é o que separa um nome de classe de um ponto de corte.
  return partes;
}

/** Os cortes proibidos que este texto usa como VARIANTE. */
const cortesProibidos = (texto: string): string[] =>
  texto
    .split(/\s+/)
    .map((k) => k.replace(/^[`'"]+|[`'"]+$/g, ""))
    .filter(Boolean)
    .flatMap((k) => variantes(k))
    .filter((v) => PROIBIDOS.has(v));

/** Todos os ficheiros de código do back office — testes de fora. */
function ficheiros(): string[] {
  const fora: string[] = [];
  const andar = (rel: string) => {
    for (const e of readdirSync(join(RAIZ, BACK_OFFICE, rel), { withFileTypes: true })) {
      const filho = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) andar(filho);
      else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) fora.push(filho);
    }
  };
  andar("");
  return fora;
}

/** Cada `ficheiro:linha :: corte` encontrado, ficheiro a ficheiro. */
function infraccoes(rel: string): string[] {
  const fonte = semComentarios(readFileSync(join(RAIZ, BACK_OFFICE, rel), "utf8"));
  const fora: string[] = [];
  for (const { texto, inicio } of literais(fonte)) {
    const maus = cortesProibidos(texto);
    if (maus.length === 0) continue;
    const linha = fonte.slice(0, inicio).split("\n").length;
    for (const m of new Set(maus)) fora.push(`${rel}:${linha} :: ${m}:`);
  }
  return fora;
}

describe("contrato dos pontos de corte: o back office tem três larguras, e só três", () => {
  it("nenhum ficheiro novo escreve `md:`, `xl:` ou `2xl:`", () => {
    const encontradas = ficheiros()
      .filter((rel) => !TECTO_POR_TRATAR.has(rel))
      .flatMap((rel) => infraccoes(rel));

    expect(
      encontradas.sort(),
      "estes cortes não existem neste back office (ver `ui/adaptativo.ts`). Se a pergunta é sobre a JANELA usa `sm:`/`lg:`; se é sobre o CONTENTOR usa `flex-wrap`, `min-[22rem]:` ou `@container`; se é sobre o PONTEIRO usa `pointer-coarse:`.",
    ).toEqual([]);
  });

  it("os que faltam tratar só podem melhorar — nunca ganhar cortes novos", () => {
    const acimaDoTecto = [...TECTO_POR_TRATAR]
      .map(([rel, tecto]) => ({ rel, tecto, agora: infraccoes(rel) }))
      .filter(({ tecto, agora }) => agora.length > tecto)
      .flatMap(({ rel, tecto, agora }) => [`${rel}: ${agora.length} > ${tecto}`, ...agora]);

    expect(
      acimaDoTecto,
      "estes ficheiros ainda estão a ser tratados, mas ganharam cortes NOVOS — o tecto é para descer, não para subir",
    ).toEqual([]);
  });

  it("a rede está mesmo armada (não passa por vacuidade)", () => {
    // A falha mais estúpida possível: o varredor deixar de encontrar classes e
    // o teste passar sobre uma lista vazia.
    const todos = ficheiros();
    expect(todos.length, "o varredor deixou de encontrar ficheiros").toBeGreaterThan(50);

    const comClasses = todos.filter((rel) =>
      literais(semComentarios(readFileSync(join(RAIZ, BACK_OFFICE, rel), "utf8"))).some((l) =>
        /\b(sm|lg):/.test(l.texto),
      ),
    );
    expect(
      comClasses.length,
      "o varredor deixou de ver os cortes que a casa USA — se não vê estes, também não veria os outros",
    ).toBeGreaterThan(30);

    // E o classificador sabe distinguir um ponto de corte de um nome de classe.
    expect(cortesProibidos("grid-cols-2 md:grid-cols-4")).toEqual(["md"]);
    expect(cortesProibidos("hidden max-md:hidden 2xl:block")).toEqual(["max-md", "2xl"]);
    expect(cortesProibidos("max-w-md max-w-2xl sm:max-w-xl")).toEqual([]);
    expect(cortesProibidos("lg:grid-cols-4 @[40rem]:grid-cols-4")).toEqual([]);
    expect(cortesProibidos("[&::-webkit-details-marker]:hidden")).toEqual([]);

    // E continua a ver o que ainda lá está: as excepções não estão vazias.
    //
    // ── ISTO ERA UM NÚMERO À MÃO, E O NÚMERO ESTRAGAVA-SE SOZINHO ──────────
    // Era `toBeGreaterThan(2)`: calibrado para os três ficheiros que tinham
    // dívida no dia em que foi escrito. Quando o `Temas.tsx` chegou a zero
    // sobraram dois, e a rede ficou vermelha por o repositório ter MELHORADO.
    // Uma guarda que se parte com o progresso ensina a baixar-lhe o número, e
    // ao fim de duas ou três vezes ninguém sabe o que ela estava a proteger.
    //
    // Passa a exigir que TODAS as entradas ainda tenham infracções, o que faz
    // as duas coisas de uma vez e não pede manutenção nenhuma: se o varredor se
    // partir, todas caem a zero e o teste falha nomeando-as; e quando um
    // ficheiro fica mesmo limpo, o teste diz o nome dele e manda apagar a
    // linha — que é a regra que o comentário do `TECTO_POR_TRATAR` escreve e
    // que até aqui dependia de alguém se lembrar.
    expect(
      [...TECTO_POR_TRATAR.keys()].filter((rel) => infraccoes(rel).length === 0),
      "chegaram a zero: apaga-lhes a linha do TECTO_POR_TRATAR (ou o varredor cegou)",
    ).toEqual([]);
  });
});
