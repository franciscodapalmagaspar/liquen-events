import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA COR DE TEXTO QUE SÓ APARECE QUANDO ALGO CORRE MAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O DEFEITO. O vermelho mais usado do back office era o `#b5654a`: 101 usos,
 * 56 deles como TEXTO, quase todos em mensagens de erro — `role="alert"`,
 * `{erro && …}`, `idErro`, `r.urgent`. Contraste MEDIDO pela fórmula WCAG:
 *
 *     #b5654a sobre branco   4,26 : 1
 *     #b5654a sobre #f7f7f8  3,98 : 1      ← o chão novo do back office
 *
 * O mínimo para texto pequeno é 4,5. E essas mensagens estão a `text-[10px]` e
 * `text-[11px]` — o texto MAIS PEQUENO da aplicação. Ou seja: a frase que diz
 * «isto correu mal» era a mais difícil de ler de todo o produto.
 *
 * ── PORQUE É QUE O TESTE DE CONTRASTE QUE JÁ EXISTIA NÃO O APANHOU ────────
 *
 * O `e2e/contraste-do-back-office.spec.ts` é sério: percorre `body *`, compõe
 * as opacidades contra o fundo real, aplica a dispensa do texto grande e exige
 * 4,5. Mas só mede O QUE ESTÁ NO ECRÃ quando corre — e uma mensagem de erro só
 * é desenhada quando há erro. Um passeio pelo caminho feliz nunca a desenha.
 *
 * É a mesma família de defeito que o `cores-que-existem.test.ts` descreve no
 * seu cabeçalho: «não se vê a ler o código, vê-se no ecrã, e só se o botão
 * estiver no estado certo». A cura é a mesma — verificação mecânica, a partir
 * da fonte, independente de o estado ser alcançável.
 *
 * ── O QUE ESTE TESTE FAZ ─────────────────────────────────────────────────
 *
 * Lê todos os `text-[#rrggbb]` escritos nos ecrãs do back office e calcula o
 * contraste contra as DUAS superfícies onde esse texto pode assentar: o cartão
 * branco e o chão `#f7f7f8`. Exige 4,5 nas duas.
 *
 * Não mede opacidades (`text-[#xxx]/60`): essas dependem do que está por baixo
 * e são o território do passeio, que as compõe a sério. Aqui guarda-se o caso
 * que o passeio não alcança — a cor sólida de um estado raro.
 */

const SUPERFICIES: Record<string, string> = {
  "cartão branco": "#ffffff",
  "chão do back office": "#f7f7f8",
};

/**
 * ── A TINTA QUE NÃO ASSENTA NUMA SUPERFÍCIE DA CASA ────────────────────────
 *
 * Quase todo o texto do back office assenta no cartão ou no chão, e é contra
 * esses dois que faz sentido medi-lo. Há um token que não: o
 * `--bo-sobre-acento` é branco porque existe para ir POR CIMA do acento — o
 * número dentro de um disco cheio, o rótulo dentro de um botão primário.
 * Medido contra o cartão branco dá 1,00:1, e o guarda chumbava um desenho
 * correcto por estar a olhar para o fundo errado.
 *
 * ── PORQUE É QUE ISTO É UM PAR NOMEADO E NÃO UMA LEITURA DA LINHA ──────────
 *
 * A primeira tentativa foi ler a linha: se ela trouxesse `bg-[var(--bo-…)]`,
 * media-se contra esse fundo. Parecia mais geral e era pior — MEDIDO, abriu
 * quatro buracos de uma vez, porque uma linha de Tailwind não é um elemento:
 * o fundo que lá está pode ser uma lavagem com alfa, pode ser de um `hover:`,
 * pode ser de outro nó. O `--bo-perigo` passou a ser medido contra si próprio
 * (1,00:1) e o menu de acções ficou a chumbar por uma razão inventada.
 *
 * Um par NOMEADO diz uma coisa verdadeira e só uma: esta tinta vive naquele
 * fundo. E não abre porta nenhuma — quem puser `--bo-sobre-acento` num cartão
 * branco continua a ter branco sobre branco, e continua a ser um defeito; o
 * que o guarda deixa de fazer é acusá-lo no sítio onde ele está certo.
 */
const SOBRE: Record<string, string> = {
  "--bo-sobre-acento": "--bo-accent",
  // A tinta dos botões e filtros SELECCIONADOS (achado n.º 14: eram
  // `text-white`, que no escuro ficava branco sobre o verde-claro, 1,13:1).
  "--bo-sobre-seleccao": "--bo-seleccao",
};

/** WCAG 2.x, luminância relativa. */
function luminancia(hex: string): number {
  const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function contraste(a: string, b: string): number {
  const [alto, baixo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (alto + 0.05) / (baixo + 0.05);
}

/**
 * As cores sólidas escritas como cor de TEXTO, com o ficheiro e a linha.
 *
 * Só `text-[#…]` sem opacidade: com `/60` o que se vê depende do fundo, e isso
 * mede-se no browser, não aqui.
 */
/**
 * ── E AGORA TAMBÉM AS QUE ESTÃO ESCRITAS COMO TOKEN ───────────────────────
 *
 * Este teste nasceu a ler `text-[#rrggbb]` do código-fonte, e estava certo
 * enquanto as cores eram literais. A fase 03 do sistema de design trocou-as
 * por `text-[var(--bo-perigo)]` — e no dia dessa troca este teste não teria
 * chumbado: teria passado a MEDIR MENOS, em silêncio, até não medir nada.
 *
 * É a pior avaria que um teste pode ter, e esta casa já a apanhou duas vezes
 * esta semana noutros sítios. Um teste que deixa de ver o que guardava é pior
 * do que não existir, porque continua a dizer que está tudo bem.
 *
 * A cura é resolver o token: lê-se o valor do `globals.css` e mede-se ESSE. Os
 * tokens de cor desta casa são hexadecimais literais de propósito — está
 * escrito por extenso ao lado do `--bo-accent` — precisamente para poderem ser
 * lidos assim.
 *
 * Um `var(--x)` cujo token não se encontre é reportado, e não ignorado: um
 * nome mal escrito não gera erro nenhum no CSS, e seria uma cor de texto a
 * desaparecer do ecrã sem ninguém dar por isso.
 */
function declaracoes(): Map<string, string> {
  // O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
  // todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
  // o browser os aplica no back office.
  const css =
    readFileSync("src/app/globals.css", "utf8") + readFileSync("src/app/admin.css", "utf8");
  const mapa = new Map<string, string>();
  // A PRIMEIRA definição de cada token é a do modo claro; o bloco
  // `light-dark()` vem depois. É o modo claro que este teste mede, porque as
  // duas superfícies aqui em cima são as do modo claro. (O escuro mede-se no
  // browser, em `e2e/o-modo-escuro-existe.spec.ts`.)
  for (const m of css.matchAll(/(--bo-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    if (!mapa.has(m[1])) mapa.set(m[1], m[2].trim());
  }
  return mapa;
}

/**
 * Segue a cadeia de um token até dar num valor com cor, e devolve-o composto
 * sobre a superfície indicada.
 *
 * Há três formas nesta casa, e as três têm de ser tratadas:
 *
 *   · `#rrggbb` — directo;
 *   · `var(--outro)` — os nomes de PAPEL (`--bo-text-muted` aponta para
 *     `--bo-tinta-64`), que o comentário do `globals.css` chama «apelidos»;
 *   · `rgb(var(--bo-tinta-rgb) / 0.64)` — a tinta com alfa, que é o que quase
 *     todo o texto secundário desta casa é.
 *
 * A terceira é a que interessa e a que a primeira versão deste resolvedor não
 * sabia ler. Uma cor com alfa NÃO tem contraste próprio: tem o contraste do
 * que se vê depois de assentar no fundo. É por isso que se compõe aqui, e é
 * exactamente a conta que o `globals.css` diz ter feito para escrever «5,91:1»
 * ao lado do `--bo-text-muted`.
 */
function resolver(valor: string, sobre: string, tokens: Map<string, string>): string | null {
  for (let volta = 0; volta < 6; volta += 1) {
    const v = valor.trim();

    const hex = /^#[0-9a-fA-F]{6}$/.exec(v);
    if (hex) return v.toLowerCase();

    const alias = /^var\((--bo-[a-z0-9-]+)\)$/.exec(v);
    if (alias) {
      const seguinte = tokens.get(alias[1]);
      if (!seguinte) return null;
      valor = seguinte;
      continue;
    }

    const comAlfa = /^rgb\(\s*var\((--bo-[a-z0-9-]+)\)\s*\/\s*([\d.]+)\s*\)$/.exec(v);
    if (comAlfa) {
      const canais = tokens.get(comAlfa[1]);
      const nums = canais?.match(/\d+/g);
      if (!nums || nums.length < 3) return null;
      return compor(nums.slice(0, 3).map(Number), Number(comAlfa[2]), sobre);
    }

    return null;
  }
  return null;
}

/** `α·frente + (1−α)·fundo`, canal a canal. */
function compor(frente: number[], alfa: number, fundo: string): string {
  const atras = [1, 3, 5].map((i) => parseInt(fundo.slice(i, i + 2), 16));
  const canais = frente.map((c, i) => Math.round(alfa * c + (1 - alfa) * atras[i]));
  return "#" + canais.map((c) => c.toString(16).padStart(2, "0")).join("");
}

function coresDeTexto(): { cor: string; onde: string }[] {
  const ficheiros = execSync(
    "grep -rl --include=*.tsx -e 'text-\\[' src/app/'[lang]'/'(admin)' || true",
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.includes(".test."));

  const achados: { cor: string; onde: string }[] = [];
  for (const ficheiro of ficheiros) {
    readFileSync(ficheiro, "utf8")
      .split("\n")
      .forEach((linha, i) => {
        const onde = `${ficheiro.replace(/^.*admin\//, "")}:${i + 1}`;

        for (const m of linha.matchAll(/\btext-\[(#[0-9a-fA-F]{6})\](?!\/)/g)) {
          achados.push({ cor: m[1].toLowerCase(), onde });
        }

        // O token fica pelo NOME: cada superfície resolve-o por si, porque uma
        // cor com alfa compõe-se de maneira diferente sobre cada uma.
        for (const m of linha.matchAll(/\btext-\[var\((--bo-[a-z0-9-]+)\)\](?!\/)/g)) {
          achados.push({ cor: m[1], onde });
        }
      });
  }
  return achados;
}

const TOKENS = declaracoes();

describe("o contraste das cores escritas à mão", () => {
  /**
   * ── A GUARDA DA GUARDA ──────────────────────────────────────────────────
   *
   * Este teste mede o que ENCONTRA. Se um dia a leitura se partir — a pasta
   * muda de nome, o `grep` deixa de casar, a sintaxe das classes muda — ele
   * não chumba: encontra zero cores, não acha defeito nenhum, e fica verde
   * para sempre a guardar coisa nenhuma.
   *
   * Já esteve a um passo disso. Nasceu a ler só `text-[#rrggbb]` e via 36
   * cores; a migração da fase 03 trocou quase todas por `text-[var(--bo-…)]`,
   * e sem esta ronda teria continuado verde a medir os 36 que sobraram.
   *
   * Resolvidos os tokens, mede 1024 — 28 vezes mais do que alguma vez mediu,
   * porque também apanhou os `var(--bo-text)` e companhia que já lá estavam
   * desde sempre e que ele nunca tinha visto.
   *
   * O número aqui é um CHÃO generoso, não uma contagem: serve para apanhar o
   * dia em que isto cair para uma dezena, não para chatear quem apagar um
   * ficheiro.
   */
  it("mede mesmo alguma coisa — e não uma dezena", () => {
    const achadas = coresDeTexto();
    expect(
      achadas.length,
      "a leitura das cores partiu-se: este teste está a guardar quase nada",
    ).toBeGreaterThan(400);

    // E a maioria tem de vir de TOKENS: se voltasse a ver só literais, era
    // sinal de que a resolução de `var()` deixou de funcionar.
    const porToken = achadas.filter((a) => a.cor.startsWith("--bo-")).length;
    expect(porToken, "deixou de resolver tokens — só vê literais").toBeGreaterThan(300);
  });

  it("nenhuma cor de texto do back office fica abaixo dos 4,5:1", () => {
    const fracos: string[] = [];
    const vistas = new Set<string>();
    for (const { cor, onde } of coresDeTexto()) {
      // Uma tinta com fundo nomeado mede-se lá, e só lá.
      const nomeDoFundo = SOBRE[cor];
      const fundoNomeado = nomeDoFundo ? resolver(`var(${nomeDoFundo})`, "#ffffff", TOKENS) : null;
      const superficies: [string, string][] = fundoNomeado
        ? [[`o acento (${nomeDoFundo})`, fundoNomeado]]
        : Object.entries(SUPERFICIES);
      for (const [nome, fundo] of superficies) {
        let efectiva = cor;
        if (cor.startsWith("--bo-")) {
          const declarado = TOKENS.get(cor);
          const resolvida = declarado ? resolver(declarado, fundo, TOKENS) : null;
          if (!resolvida) {
            // Um token que não resolve NÃO se cala. Um nome mal escrito não dá
            // erro nenhum no CSS — dá uma cor de texto que desaparece.
            const chaveMa = `${cor}·sem-valor`;
            if (!vistas.has(chaveMa)) {
              vistas.add(chaveMa);
              fracos.push(`${cor} não resolve para cor nenhuma  (ex.: ${onde})`);
            }
            break;
          }
          efectiva = resolvida;
        }
        const r = contraste(efectiva, fundo);
        // Arredonda-se para cima uma casa: 4,499 não é um defeito, é o mesmo
        // número escrito de outra maneira.
        if (r + 0.01 >= 4.5) continue;
        const chave = `${cor}·${nome}`;
        if (vistas.has(chave)) continue;
        vistas.add(chave);
        fracos.push(`${cor} (${efectiva}) sobre ${nome} = ${r.toFixed(2)}:1  (ex.: ${onde})`);
      }
    }
    expect(fracos).toEqual([]);
  });

  it("e há um vermelho só para dizer que algo correu mal", () => {
    // Eram CINCO — #b5654a, #8a2a22, #a03a1a, #a03123, #c0392b — e qual deles
    // aparecia dependia do ficheiro onde se estava. A mesma coisa dita em cinco
    // cores não é uma paleta: é um descuido repetido.
    const antigos = ["#b5654a", "#a03a1a", "#a03123", "#c0392b"];
    const presentes = execSync(
      `grep -rl --include=*.tsx ${antigos.map((c) => `-e '${c}'`).join(" ")} ` +
        "src/app/'[lang]'/'(admin)' || true",
      { encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter(Boolean)
      .filter((f) => !f.includes(".test."));
    expect(presentes).toEqual([]);
  });
});
