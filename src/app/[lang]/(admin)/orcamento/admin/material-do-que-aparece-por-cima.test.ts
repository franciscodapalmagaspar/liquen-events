import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { achatar, racioDeContraste, luminanciaRelativa } from "./contraste-do-texto.test";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MATERIAL DO QUE APARECE POR CIMA — a conta, e não a impressão
 * ════════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. A família das superfícies que aparecem por cima — a lista do
 * `ui/Escolha`, os dois menus, a nota do `?`, o painel dos modelos, a paleta de
 * comandos — passou a material TRANSLÚCIDO. E um material translúcido é o modo
 * mais fácil que há de partir a legibilidade sem dar por isso: o texto deixa de
 * assentar num fundo conhecido e passa a assentar no que quer que esteja por
 * baixo, que num back office com grelhas de fotografias pode ser quase preto.
 *
 * ── O QUE ESTE FICHEIRO GUARDA, E O QUE NÃO GUARDA ─────────────────────────
 *
 * O `contraste-do-texto.test.ts` guarda os tokens de texto contra as quatro
 * superfícies OPACAS da casa. Este guarda a quinta, que é nova e é a única
 * variável: o material. A fórmula é a mesma e vem de lá importada de propósito
 * — duas cópias da conta do WCAG é uma cópia a mais.
 *
 * ── O PIOR CASO É PRETO, E NÃO É EXAGERO ──────────────────────────────────
 *
 * Um material branco a α sobre um fundo de luminância L dá uma superfície tão
 * mais escura quanto mais escuro for o fundo. O mínimo absoluto é preto, e não
 * é um caso imaginário nesta casa: os ecrãs de material e de temas são grelhas
 * de fotografias, e um menu de acções abre-se por cima de uma delas. Uma
 * fotografia de casamento ao fim da tarde, em contraluz, é preta o suficiente.
 *
 * Portanto mede-se contra preto. Se passar aí, passa em qualquer fotografia.
 *
 * ── E O CHÃO DE TINTA QUE ISSO IMPÕE ──────────────────────────────────────
 *
 * A conta (está por extenso no `globals.css`) diz que a α escolhida o degrau
 * `--bo-text-faint` mede 4,38:1 e CHUMBA. A resposta não foi subir a opacidade
 * até ele caber — foi tirá-lo daqui: **o material tem um chão de tinta, e esse
 * chão é o `--bo-text-muted`.** A segunda metade deste ficheiro varre os sete
 * ficheiros a garantir que nada mais fraco lá volta a entrar.
 *
 * De caminho, essa varredura apanhou o que já lá estava e já chumbava ANTES do
 * material: `text-foreground/45` (3,11:1 sobre branco) no ícone do `MoreMenu`,
 * nas dicas dele, no nome do grupo do `Escolha` e em seis sítios da paleta;
 * `text-foreground/40` (2,67:1) nas dicas e nos ícones da paleta. Nenhum deles
 * era decoração — são o nome do grupo, o email do cliente e a descrição da
 * acção.
 */

const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");
// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const CSS =
  readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8") +
  readFileSync(join(process.cwd(), "src/app/admin.css"), "utf8");

/** WCAG 2.1 §1.4.3 — texto normal, nível AA. */
const AA = 4.5;
/** WCAG 2.1 §1.4.11 — o que não é texto: fronteiras, ícones, estados. */
const NAO_TEXTO = 3;
/**
 * A FOLGA que este ficheiro exige por cima de cada mínimo, e a razão de ela
 * existir: um rácio que passa por uma centésima passa hoje e chumba no dia em
 * que alguém mexa um degrau na tinta ou no verde. Cinco por cento é o que
 * separa «passa» de «passou por sorte».
 */
const FOLGA = 1.05;

type RGB = [number, number, number];
const BRANCO: RGB = [255, 255, 255];
const PRETO: RGB = [0, 0, 0];
const TINTA: RGB = [13, 13, 13];

/**
 * O bloco onde os tokens do back office vivem. É o mesmo que o
 * `contraste-do-texto.test.ts` lê, e pela mesma razão: os `--bo-*` não estão no
 * `:root` nem no `@theme`.
 */
const SELECTOR_ADMIN = "body:is(.admin-mode, :has([data-admin-mode]))";
function blocoAdmin(): string {
  const inicio = CSS.indexOf(`${SELECTOR_ADMIN} {`);
  expect(inicio, `desapareceu o bloco \`${SELECTOR_ADMIN}\``).toBeGreaterThan(-1);
  return CSS.slice(inicio, CSS.indexOf("\n}", inicio));
}

/** O valor bruto de um token, tal como está escrito. */
function token(nome: string): string {
  const m = blocoAdmin().match(new RegExp(`${nome}\\s*:\\s*([^;]+);`));
  expect(m, `o token ${nome} desapareceu de ${SELECTOR_ADMIN}`).not.toBeNull();
  return m![1].trim();
}

const hexParaRgb = (h: string): RGB => {
  const s = h.replace("#", "");
  const largo =
    s.length === 3
      ? s
          .split("")
          .map((c) => c + c)
          .join("")
      : s;
  return [0, 2, 4].map((i) => parseInt(largo.slice(i, i + 2), 16)) as RGB;
};

/** `rgba(255, 255, 255, 0.88)` → `{ cor, alpha }`. */
function corComAlpha(valor: string): { cor: RGB; alpha: number } {
  /*
    A tinta desta casa passou a derivar de um canal — `rgb(var(--bo-tinta-rgb)
    / 0.13)` — para o modo escuro trocar uma linha em vez de nove. Sem esta
    leitura, o `parseFloat` de «var(--bo-tinta-rgb)» dava `NaN` e o teste
    dizia «o fio mede NaN:1»: um leitor que não conhece uma forma nova não dá
    erro, dá um número que não é número.
  */
  const comCanal = valor.match(/rgba?\(\s*var\(\s*(--[a-z0-9-]+)\s*\)\s*\/\s*([\d.]+)\s*\)/i);
  if (comCanal) {
    const nums = token(comCanal[1]).match(/\d+/g);
    if (!nums || nums.length < 3)
      throw new Error(`o canal ${comCanal[1]} não tem três componentes`);
    const [r, g, b] = nums.slice(0, 3).map(Number);
    return { cor: [r, g, b], alpha: parseFloat(comCanal[2]) };
  }

  const rgba = valor.match(/rgba?\(([^)]+)\)/);
  if (rgba) {
    const p = rgba[1].split(",").map((x) => parseFloat(x.trim()));
    return { cor: [p[0], p[1], p[2]], alpha: p[3] ?? 1 };
  }
  const hex = valor.match(/#[0-9a-fA-F]{3,8}/);
  if (!hex) throw new Error(`valor de cor que não sei ler: ${valor}`);
  return { cor: hexParaRgb(hex[0]), alpha: 1 };
}

/** O material assente num fundo — o que o olho vê depois de o alpha compor. */
function material(fundo: RGB): RGB {
  const { cor, alpha } = corComAlpha(token("--bo-material"));
  return achatar(cor, alpha, fundo);
}

/** Tinta da casa (`rgba(13,13,13,α)`) assente numa superfície. */
const tintaSobre = (alpha: number, fundo: RGB) => achatar(TINTA, alpha, fundo);

const ACENTO = () => hexParaRgb(token("--bo-accent"));

/** Os sete ficheiros desta ronda — a família do que aparece por cima. */
const FAMILIA = [
  "ui/Escolha.tsx",
  "ui/MenuDeAccoes.tsx",
  "MoreMenu.tsx",
  "ui/Ajuda.tsx",
  "ModelosParciais.tsx",
  "CommandPalette.tsx",
  "ui/FolhaOuDialogo.tsx",
];

/** Tira comentários guardando as quebras — a prosa desta casa cita classes. */
function semComentarios(fonte: string): string {
  const guarda = (t: string) => t.replace(/[^\n]/g, " ");
  return fonte.replace(/\/\*[\s\S]*?\*\//g, guarda).replace(/^[^\S\n]*\/\/.*$/gm, guarda);
}

const fonteDe = (rel: string) => semComentarios(readFileSync(join(RAIZ, rel), "utf8"));

describe("o material é translúcido, e o contraste aguenta-o", () => {
  /**
   * Sem isto, um engano na leitura dos tokens (um `--bo-material` que não
   * existisse, um alpha que viesse `undefined`) fazia a suite passar a medir
   * branco sobre branco e a dar 1:1 — ou a não medir nada de todo.
   */
  it("a rede está mesmo armada (lê os tokens a sério)", () => {
    const { cor, alpha } = corComAlpha(token("--bo-material"));
    expect(cor).toEqual(BRANCO);
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
    // O material sobre preto TEM de ser mais escuro do que sobre branco, senão
    // não é translúcido nenhum e esta suite não está a medir o que julga.
    expect(luminanciaRelativa(material(PRETO))).toBeLessThan(luminanciaRelativa(material(BRANCO)));
    expect(ACENTO()).toHaveLength(3);
  });

  /**
   * ── A REDE ────────────────────────────────────────────────────────────────
   *
   * Cada tinta que assenta no material, contra o material composto sobre o pior
   * fundo (preto) e sobre o melhor (branco). O pior é o que decide.
   *
   * As duas últimas linhas são as PASTILHAS CHEIAS: aí o fundo já não é o
   * material — é o preenchimento opaco —, e por isso não dependem do que está
   * por baixo. É essa a razão de a pastilha ser opaca.
   */
  it("nada do que assenta no material desce abaixo de 4,5:1", () => {
    const acento = ACENTO();
    const casos: { o_que: string; frente: RGB; fundo: RGB }[] = [];

    for (const [nome, fundo] of [
      ["material sobre fotografia PRETA", material(PRETO)],
      ["material sobre painel BRANCO", material(BRANCO)],
    ] as const) {
      casos.push(
        // O corpo dos menus e das listas.
        { o_que: `--bo-tinta-72 · ${nome}`, frente: tintaSobre(0.72, fundo), fundo },
        // O chão de tinta do material: dicas, nomes de grupo, ícones apagados.
        { o_que: `--bo-text-muted (0,64) · ${nome}`, frente: tintaSobre(0.64, fundo), fundo },
        // O visto do `ui/Escolha`, que é o único portador da escolha actual
        // quando a linha não está sob o cursor. Era pintado com o `--bo-accent`
        // e mudou para a tinta: um verde escuro sobre um material que escurece
        // com o fundo desce muito mais depressa do que um cinzento, e era ELE —
        // e não a tinta — que travava a opacidade. A razão por extenso está no
        // `globals.css` e no próprio `ui/Escolha.tsx`.
        { o_que: `o visto, em --bo-text (0,82) · ${nome}`, frente: tintaSobre(0.82, fundo), fundo },
      );
    }

    // As pastilhas cheias — fundo opaco, portanto uma linha só cada.
    casos.push(
      { o_que: "branco sobre a pastilha de acento", frente: BRANCO, fundo: acento },
      {
        o_que: "branco sobre a pastilha destrutiva (#8a3d2f)",
        frente: BRANCO,
        fundo: hexParaRgb("#8a3d2f"),
      },
      {
        o_que: "a dica a branco/85 sobre a pastilha de acento",
        frente: achatar(BRANCO, 0.85, acento),
        fundo: acento,
      },
    );

    const falhas = casos
      .map((c) => ({ ...c, racio: racioDeContraste(c.frente, c.fundo) }))
      .filter((c) => c.racio < AA)
      .map((c) => `${c.o_que}: ${c.racio.toFixed(2)}:1 (mínimo ${AA}:1)`);

    expect(falhas, falhas.join("\n")).toEqual([]);
  });

  /**
   * O ACENTO CONTINUA A TOCAR O MATERIAL — mas só como NÃO-TEXTO.
   *
   * Depois de o visto passar a tinta, o verde ainda assenta na superfície em
   * duas coisas que não são texto: a moldura do campo em foco
   * (`border-color: var(--bo-accent)`) e o ponto de aviso. Essas medem-se pelo
   * 1.4.11, que pede 3:1 — e a diferença entre as duas barras é precisamente o
   * que este ficheiro tem de manter explícito, senão daqui a um mês alguém
   * volta a pôr verde por cima de um rótulo.
   */
  it("o acento sobre o material chega aos 3:1 do não-texto", () => {
    const pior = racioDeContraste(ACENTO(), material(PRETO));
    expect(
      pior,
      `o --bo-accent mede ${pior.toFixed(2)}:1 sobre o pior material — abaixo dos ` +
        `${NAO_TEXTO}:1 que o 1.4.11 pede a uma fronteira ou a um estado`,
    ).toBeGreaterThanOrEqual(NAO_TEXTO * FOLGA);
  });

  /**
   * ── E O VERDE NÃO VOLTA A SER TINTA ──────────────────────────────────────
   *
   * A rede que fecha a decisão de cima. O caso do AA mede o que ESTÁ escrito;
   * isto impede o que se voltaria a escrever: um `text-[var(--bo-accent)]` num
   * dos sete ficheiros põe verde a 4,08:1 numa superfície onde a barra é 4,5.
   *
   * O acento como FUNDO (`bg-`, `hover:bg-`) continua a ser o gesto da casa e
   * não entra aqui — a pastilha é opaca e a conta dela é outra.
   */
  it("nenhum dos sete pinta TEXTO com o acento", () => {
    const verdes: string[] = [];
    for (const rel of FAMILIA) {
      fonteDe(rel)
        .split("\n")
        .forEach((linha, i) => {
          for (const m of linha.matchAll(
            /\b(?:group-)?(?:hover:|active:|focus:|focus-visible:)?text-\[var\(--bo-accent\)\]/g,
          )) {
            verdes.push(`${rel}:${i + 1}  ${m[0]}`);
          }
        });
    }
    expect(
      verdes,
      "o `--bo-accent` mede 4,08:1 sobre o pior material e não chega aos 4,5:1 de " +
        "texto. Ou é tinta (`--bo-text`), ou é o preenchimento de uma pastilha:\n" +
        verdes.join("\n"),
    ).toEqual([]);
  });

  /**
   * ── A FRONTEIRA SOBRE FUNDO CLARO, QUE É O QUE UMA SUPERFÍCIE MAIS
   *    TRANSPARENTE PODIA TER PERDIDO ─────────────────────────────────────
   *
   * Não perdeu, e a razão é aritmética: a superfície é BRANCA, e branco a
   * qualquer α sobre branco continua branco. Quem desenha a fronteira sobre um
   * painel claro é o FIO e a SOMBRA, e nenhum dos dois depende do α.
   *
   * O que se guarda aqui é isso mesmo, medido: que a superfície não se separa
   * do branco sozinha (e portanto ninguém pode argumentar que se separa), e que
   * o fio por cima dela não desce do que hoje mede. Os 3:1 do 1.4.11 não se
   * aplicam à MOLDURA de um menu — aplicam-se aos controlos lá dentro, que são
   * as linhas, e essas têm o seu texto e a sua pastilha. Está por extenso no
   * `globals.css`.
   */
  it("sobre um painel branco a fronteira é o fio, e o fio não enfraquece", () => {
    const superficie = material(BRANCO);
    expect(
      racioDeContraste(superficie, BRANCO),
      "a superfície do material deixou de ser branca — a conta da fronteira muda toda",
    ).toBeCloseTo(1, 3);

    // O `--bo-hairline-strong` é um APELIDO — vale `var(--bo-tinta-13)`. Segue-se
    // a seta até à cor, senão o que se mede é o nome e não o fio.
    const seguir = (nome: string): string => {
      let v = token(nome);
      for (let volta = 0; volta < 4 && /^var\(/.test(v); volta++) {
        v = token(v.replace(/^var\(\s*/, "").replace(/\s*\)$/, ""));
      }
      return v;
    };
    const { cor, alpha } = corComAlpha(seguir("--bo-hairline-strong"));
    // O fundo estende-se por baixo da borda (`background-clip: border-box`),
    // portanto o fio assenta na superfície e não no que está por trás dela.
    const fio = achatar(cor, alpha, superficie);
    const racio = racioDeContraste(fio, BRANCO);
    expect(
      racio,
      `o fio do material mede ${racio.toFixed(3)}:1 sobre branco — era 1,326:1`,
    ).toBeGreaterThanOrEqual(1.32);
  });

  /**
   * A outra metade, e a que impede a correcção de virar excesso de zelo: o
   * material tem de continuar a SER material. Se alguém resolver um problema de
   * contraste empurrando a opacidade para cima, o desfoque deixa de se ver e
   * paga-se um `backdrop-filter` por uma superfície que já é branca.
   *
   * O tecto é 0,92 porque é aí que o `--bo-text-faint` passaria a caber — e é
   * exactamente a decisão que este trabalho recusou: o chão de tinta sobe, a
   * opacidade não.
   */
  it("e continua a ser translúcido — a opacidade não sobe para resolver contraste", () => {
    const { alpha } = corComAlpha(token("--bo-material"));
    expect(alpha, "o material ficou opaco: já não é material, é uma superfície").toBeLessThan(0.92);
  });

  /**
   * ── O PISO, CONTADO E NÃO CRAVADO ────────────────────────────────────────
   *
   * Aqui estava `toBeGreaterThanOrEqual(0.8)`. Um número escrito à mão dá
   * licença enquanto ninguém o recalcula — que é a queixa que este repositório
   * já fez a si próprio a propósito dos comentários de contraste.
   *
   * Passa a ser CONTA: o piso é o α mais translúcido em que o chão de tinta
   * ainda passa AA e o acento ainda passa o 1.4.11, os dois com a `FOLGA`. Se
   * amanhã o chão de tinta subir um degrau, o piso sobe sozinho e este teste
   * apanha o material que ficou para trás.
   */
  it("e não desce abaixo do piso que a própria conta impõe", () => {
    const piso = (() => {
      for (let a = 50; a <= 100; a++) {
        const s = achatar(BRANCO, a / 100, PRETO);
        const tinta = racioDeContraste(tintaSobre(0.64, s), s);
        const acento = racioDeContraste(ACENTO(), s);
        if (tinta >= AA * FOLGA && acento >= NAO_TEXTO * FOLGA) return a / 100;
      }
      throw new Error("nenhuma opacidade satisfaz a conta — os tokens mudaram de forma");
    })();

    const { alpha } = corComAlpha(token("--bo-material"));
    expect(
      alpha,
      `o material está a ${alpha} e o piso medido é ${piso}: abaixo dele o chão de ` +
        "tinta (ou o acento nas fronteiras) deixa de ter folga sobre o mínimo",
    ).toBeGreaterThanOrEqual(piso);
  });
});

describe("o chão de tinta do material", () => {
  /**
   * O degrau mais fraco que passa AA sobre o pior material, contado a partir do
   * CSS e não escrito à mão. É ele que a varredura abaixo usa como limite —
   * assim, mexer no `--bo-material` muda o limite sozinho, em vez de deixar um
   * número velho a dar licença.
   */
  const chao = () => {
    const fundo = material(PRETO);
    for (let a = 40; a <= 100; a++) {
      if (racioDeContraste(tintaSobre(a / 100, fundo), fundo) >= AA) return a / 100;
    }
    throw new Error("nenhum degrau de tinta passa AA sobre este material");
  };

  it("o chão calculado é o `--bo-text-muted`, e o `faint` fica de fora", () => {
    const limite = chao();
    // 0,64 é o `--bo-text-muted`; 0,58 é o `--bo-text-faint`.
    expect(limite).toBeLessThanOrEqual(0.64);
    expect(limite).toBeGreaterThan(0.58);
  });

  /**
   * ── A VARREDURA ──────────────────────────────────────────────────────────
   *
   * `text-foreground/45` e companhia são tinta escrita à mão que não passa por
   * token nenhum, portanto o `contraste-do-texto.test.ts` nunca lhes chegou.
   * Aqui chegam: qualquer alpha abaixo do chão, nos sete ficheiros da família,
   * cai com o ficheiro e a linha.
   *
   * Só os sete, e de propósito: o resto do back office assenta em superfícies
   * opacas e tem a sua própria conta. Alargar isto ao painel inteiro era uma
   * ronda diferente — e uma varredura que falha em cento e cinquenta sítios no
   * dia em que nasce é uma varredura que alguém desliga.
   */
  it("nenhum dos sete ficheiros pinta texto abaixo do chão", () => {
    const limite = chao();
    const faltas: string[] = [];

    for (const rel of FAMILIA) {
      fonteDe(rel)
        .split("\n")
        .forEach((linha, i) => {
          // `text-foreground/45`, `text-white/30`, `text-black/40`…
          for (const m of linha.matchAll(/\btext-(?:foreground|black|white)\/(\d{1,3})\b/g)) {
            const alpha = Number(m[1]) / 100;
            if (alpha < limite) {
              faltas.push(
                `${rel}:${i + 1}  ${m[0]} — ${alpha} está abaixo do chão de ${limite} ` +
                  `que este material impõe`,
              );
            }
          }
          // E o token do degrau que a conta excluiu, pelo nome.
          for (const morto of ["--bo-text-faint", "--bo-tinta-58", "--bo-tinta-50"]) {
            if (linha.includes(morto))
              faltas.push(`${rel}:${i + 1}  ${morto} — chumba no material`);
          }
        });
    }

    expect(
      faltas,
      "tinta abaixo do chão numa superfície translúcida. Sobe um degrau (o " +
        "`--bo-text-muted`), ou tira a tinta da superfície:\n" +
        faltas.join("\n"),
    ).toEqual([]);
  });
});

describe("o desfoque é um número só, e fica fora das animações", () => {
  /**
   * A promessa que faz este trabalho ser reversível: outro agente está a medir
   * o custo do desfoque, e baixar a intensidade tem de ser mudar UM valor — não
   * caçar sete ficheiros. Por isso nenhum dos sete pode escrever desfoque seu.
   *
   * A excepção nomeada é o VÉU: o véu da paleta e o da folha/diálogo desfocam a
   * página INTEIRA por trás da caixa, e isso já existia e é outra decisão (está
   * escrita nos dois ficheiros). O que aqui se proíbe é desfoque na SUPERFÍCIE.
   */
  it("nenhum dos sete escreve a sua própria intensidade de desfoque", () => {
    const intrusos: string[] = [];
    for (const rel of FAMILIA) {
      fonteDe(rel)
        .split("\n")
        .forEach((linha, i) => {
          // O véu tem a sua própria decisão — reconhece-se por vir colado a um
          // fundo escuro de ecrã inteiro na mesma classe.
          const ehVeu = /\binset-0\b/.test(linha);
          for (const m of linha.matchAll(/\bbackdrop-blur(?:-\[[^\]]*\]|-[a-z0-9]+)?\b/g)) {
            if (!ehVeu) intrusos.push(`${rel}:${i + 1}  ${m[0]}`);
          }
        });
    }
    expect(
      intrusos,
      "desfoque escrito à mão numa superfície: usa a `.bo-material-desfoque`, que lê o " +
        "`--bo-material-desfoque` — é esse número que se baixa quando a medição pedir",
    ).toEqual([]);
  });

  it("o `--bo-material-desfoque` é o único manípulo, e a classe lê-o", () => {
    const desfoque = token("--bo-material-desfoque");
    expect(desfoque).toMatch(/^\d+px$/);
    const inicio = CSS.indexOf(".bo-material-desfoque {");
    expect(inicio, "`.bo-material-desfoque` desapareceu do globals.css").toBeGreaterThan(-1);
    const bloco = CSS.slice(inicio, CSS.indexOf("}", inicio));
    expect(bloco).toContain("var(--bo-material-desfoque");
    expect(bloco).toContain("var(--bo-material-saturacao");
    // O prefixo do Safari, que ainda o pede: sem ele o material não existe no
    // browser dela.
    expect(bloco).toContain("-webkit-backdrop-filter");
  });

  /**
   * A regra que o `globals.css` já tinha escrita, e por medição: o
   * `backdrop-filter` NÃO entra numa animação — um desfoque em transição
   * repinta o ecrã inteiro a cada fotograma. Este teste impede que ele lá entre
   * pela porta do lado, numa `transition-*` da própria superfície.
   */
  it("o material não anima o desfoque", () => {
    const inicio = CSS.indexOf(".bo-material {");
    const bloco = CSS.slice(inicio, CSS.indexOf("}", inicio));
    expect(bloco, "a superfície do material ganhou uma transição").not.toContain("transition");

    for (const rel of FAMILIA) {
      expect(fonteDe(rel), `${rel} pôs o \`backdrop-filter\` dentro de uma transição`).not.toMatch(
        /transition-\[[^\]]*backdrop/,
      );
    }
  });

  /**
   * E quem pede menos transparência recebe menos transparência — a irmã do
   * `prefers-reduced-motion`. Custa duas regras, devolve a superfície opaca, e
   * desliga o único trabalho de composição por fotograma desta folha.
   */
  it("respeita o `prefers-reduced-transparency`", () => {
    const inicio = CSS.indexOf("@media (prefers-reduced-transparency: reduce)");
    expect(inicio, "a preferência de menos transparência deixou de ser respeitada").toBeGreaterThan(
      -1,
    );
    const bloco = CSS.slice(
      inicio,
      CSS.indexOf("\n}", CSS.indexOf(".bo-material-desfoque", inicio)),
    );
    expect(bloco).toContain("--bo-material-opaco");
    expect(bloco).toContain("backdrop-filter: none");
  });
});

describe("os cantos são generosos, e a pastilha é concêntrica com a moldura", () => {
  /**
   * O bloco dos raios do `globals.css` colapsa a escala do Tailwind toda em
   * 8 px para o CONTEÚDO, de propósito. O que aparece POR CIMA é outra escala —
   * e a prova de que ela existe é ser maior do que aquela.
   */
  it("o raio do material é bastante maior do que o do conteúdo", () => {
    const conteudo = parseFloat(CSS.match(/--radius-lg:\s*([\d.]+)rem/)![1]);
    const menu = parseFloat(token("--bo-material-raio").match(/([\d.]+)rem/)![1]);
    const grande = parseFloat(token("--bo-material-raio-grande").match(/([\d.]+)rem/)![1]);
    // A régua do conteúdo é o degrau do CONTROLO (`--radius-lg`). Esteve nos
    // 8 px enquanto a escala do back office foi um valor só; a Parte 3.7 do
    // sistema de design devolveu-lhe uma escada concêntrica e ele passou aos
    // 10. O valor exacto é assunto do `raios-do-back-office.test.ts`, que o
    // guarda com a conta toda — aqui o que interessa é a ORDEM, que é o que o
    // nome deste caso diz: o material é mais redondo do que o conteúdo.
    //
    // Prender aqui o número era ter a mesma régua escrita em dois sítios, e
    // foi por isso que este caso chumbou numa mudança que não era dele.
    expect(conteudo, "a régua do conteúdo desapareceu do `--radius-lg`").toBeGreaterThan(0);
    expect(menu).toBeGreaterThan(conteudo);
    expect(grande).toBeGreaterThan(menu);
  });

  /**
   * A regra dos raios concêntricos: uma pastilha desenhada a `folga` da moldura
   * só fica paralela a ela se o raio for `raio − folga`. Escrito como `calc()`
   * e não como um quarto número — mexer no raio da moldura tem de arrastar a
   * pastilha atrás dele, e um número copiado não arrasta nada.
   */
  it("o raio da pastilha é uma conta, e não um quarto número", () => {
    expect(token("--bo-material-raio-pastilha")).toBe(
      "calc(var(--bo-material-raio) - var(--bo-material-folga))",
    );
  });

  /**
   * E a folga tem de estar mesmo aplicada: sem ela a pastilha vai de bordo a
   * bordo e volta a ser uma faixa, que é o desenho que este trabalho veio
   * substituir.
   */
  it("as quatro superfícies com lista aplicam a folga e o raio da pastilha", () => {
    for (const rel of ["ui/Escolha.tsx", "ui/MenuDeAccoes.tsx", "MoreMenu.tsx"]) {
      const fonte = fonteDe(rel);
      expect(fonte, `${rel} perdeu a folga da moldura`).toContain("p-[var(--bo-material-folga)]");
      expect(fonte, `${rel} perdeu o raio da pastilha`).toContain(
        "rounded-[var(--bo-material-raio-pastilha)]",
      );
    }
  });
});

describe("a linha escolhida é uma pastilha CHEIA, e é do verde da casa", () => {
  /**
   * O gesto que as capturas mostram, e a diferença entre uma lista que diz
   * «esta» e uma que diz «esta talvez». Cada uma das quatro superfícies com
   * lista tem de pintar o realce com o acento e inverter o texto.
   */
  it("as quatro listas preenchem o realce com o acento e invertem o texto", () => {
    for (const rel of [
      "ui/Escolha.tsx",
      "ui/MenuDeAccoes.tsx",
      "MoreMenu.tsx",
      "ModelosParciais.tsx",
      "CommandPalette.tsx",
    ]) {
      const fonte = fonteDe(rel);
      expect(fonte, `${rel} deixou de preencher o realce com o acento`).toMatch(
        /(?:bg|hover:bg|active:bg)-\[var\(--bo-accent\)\]/,
      );
      expect(fonte, `${rel} preenche o realce mas não inverte o texto`).toMatch(
        /(?:text|hover:text|active:text)-white/,
      );
    }
  });

  /**
   * ── E NENHUM AZUL ────────────────────────────────────────────────────────
   *
   * A paleta das capturas é do sistema da Apple. O que se copia é o MATERIAL; a
   * cor é desta casa. Um azul de selecção que entre por distracção — e entra,
   * porque é o que está na imagem que se anda a olhar — põe isto vermelho.
   *
   * A conta é em HSL: azul é matiz entre 190° e 260° com saturação que se veja.
   * O verde-musgo da casa fica nos ~127°, longe.
   */
  it("não entrou azul nenhum das capturas", () => {
    const azuis: string[] = [];
    for (const rel of FAMILIA) {
      fonteDe(rel)
        .split("\n")
        .forEach((linha, i) => {
          for (const m of linha.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
            const [r, g, b] = hexParaRgb(m[0]).map((c) => c / 255);
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            if (max - min < 0.08) continue; // cinzento: não tem matiz nenhum
            let h: number;
            if (max === r) h = ((g - b) / (max - min)) % 6;
            else if (max === g) h = (b - r) / (max - min) + 2;
            else h = (r - g) / (max - min) + 4;
            h = (h * 60 + 360) % 360;
            if (h >= 190 && h <= 260)
              azuis.push(`${rel}:${i + 1}  ${m[0]} (matiz ${h.toFixed(0)}°)`);
          }
        });
    }
    expect(
      azuis,
      "o azul das capturas é o acento do sistema da Apple. O desta casa é o " +
        "`--bo-accent`:\n" +
        azuis.join("\n"),
    ).toEqual([]);
  });
});

describe("onde o material PÁRA — a folha e o diálogo ficam opacos", () => {
  /**
   * Uma recusa, e não um esquecimento. Uma folha ocupa 390×743 no telemóvel
   * dela: um `backdrop-filter` sobre essa área é o oposto do que o
   * `globals.css` promete. E uma caixa que existe para TAPAR a página não pode
   * deixá-la passar.
   *
   * O que ela LEVA do material é a geometria — o degrau grande do raio.
   */
  it("a `FolhaOuDialogo` leva o raio grande e não leva o material", () => {
    const fonte = fonteDe("ui/FolhaOuDialogo.tsx");
    expect(fonte, "a folha perdeu o raio grande").toContain(
      "rounded-t-[var(--bo-material-raio-grande)]",
    );
    expect(fonte, "o diálogo perdeu o raio grande").toContain(
      "rounded-[var(--bo-material-raio-grande)]",
    );
    // A CLASSE, e não o nome do token: o `\b` do princípio casava dentro de
    // `--bo-material-raio-grande`, que é precisamente o que este ficheiro DEVE
    // ter. A classe distingue-se por vir sozinha entre aspas ou espaços.
    expect(
      fonte,
      "a folha/diálogo ganhou material translúcido — ver a nota no ficheiro",
    ).not.toMatch(/(?:^|["'`\s])bo-material(?:-desfoque|-grande)?(?=["'`\s])/m);
  });

  /**
   * E a paleta de comandos leva a superfície mas NÃO o desfoque: o véu dela já
   * desfoca o ecrã inteiro, e um segundo `backdrop-filter` volta a amostrar o
   * que o primeiro já compôs.
   */
  it("a `CommandPalette` leva a superfície e recusa o segundo desfoque", () => {
    const fonte = fonteDe("CommandPalette.tsx");
    expect(fonte).toContain("bo-material");
    expect(fonte, "a paleta ganhou um segundo desfoque por cima do véu").not.toContain(
      "bo-material-desfoque",
    );
  });
});
