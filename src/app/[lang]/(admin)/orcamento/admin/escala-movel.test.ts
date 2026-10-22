import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CHÃO DA LETRA NO TELEMÓVEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, sobre o back office no telemóvel: «está tudo muito feio», e a
 * primeira das quatro queixas é «letra e leitura».
 *
 * Medido a 390×844: 65 nós de texto abaixo de 12 px na Visão Geral e 79 na
 * lista de Pedidos. Os rótulos da barra de baixo — os cinco destinos que ela
 * carrega o dia todo — a 8 px. Os do calendário e as etiquetas de estado a
 * 9 px. Dezenas a 10.
 *
 * ── O QUE ESTE TESTE NÃO É ───────────────────────────────────────────────
 *
 * Não é um sistema novo. A casa JÁ TEM uma escala, em `globals.css`:
 *
 *     caption 12 · label 13 · body 15 · lead 17 · title 20
 *
 * `--bo-fs-caption` (0.75rem = 12 px) é o degrau mais baixo dela. O defeito
 * não foi inventar tamanhos pequenos — foi os ecrãs pedirem `text-[8px]`,
 * `text-[9px]`, `text-[10px]` e `text-[11px]` à mão, POR BAIXO do último
 * degrau, em sítios onde a escala nunca desceu. Este teste afirma que o
 * telemóvel volta a assentar no chão que já existia.
 *
 * ── PORQUÊ AQUI E NÃO EM CADA CHAMADA ────────────────────────────────────
 *
 * São 467 ocorrências espalhadas por ~40 ficheiros. O `globals.css` já resolve
 * exactamente este tipo de problema no mesmo sítio e pela mesma razão — ver o
 * bloco que neutraliza o `uppercase` de ~15 ecrãs em vez de os editar um a um.
 * Uma regra que se lê de uma vez é mais fácil de manter honesta do que 467
 * decisões soltas.
 *
 * Este teste é a rede: se alguém acrescentar um `text-[7px]` amanhã, ou apagar
 * a regra do `globals.css`, cai aqui.
 */

const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");
// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const CSS =
  readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8") +
  readFileSync(join(process.cwd(), "src/app/admin.css"), "utf8");

/** O último degrau da escala da casa. Nada de texto que se leia desce daqui. */
const CHAO_PX = 12;

/** Todos os `.tsx` do back office, incluindo os primitivos de `ui/`. */
function ficheirosDoBackOffice(dir = RAIZ, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) ficheirosDoBackOffice(p, acc);
    else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) acc.push(p);
  }
  return acc;
}

/**
 * O bloco do `globals.css` que levanta a letra no telemóvel.
 *
 * Recorta-se pelo marcador para que a asserção seja sobre ESTA regra e não
 * sobre uma qualquer menção a `text-[9px]` noutro sítio do ficheiro.
 */
function blocoDoChaoMovel(): string {
  const i = CSS.indexOf("CHÃO DA LETRA NO TELEMÓVEL");
  if (i === -1) return "";
  // Até ao fim do `@media` que o contém — o próximo comentário de secção serve
  // de fim, e é o que o ficheiro usa para separar blocos.
  const resto = CSS.slice(i);
  const fim = resto.indexOf("/* ──", 200);
  return fim === -1 ? resto : resto.slice(0, fim);
}

describe("a escala mínima do telemóvel", () => {
  const ficheiros = ficheirosDoBackOffice();

  it("varre ficheiros a sério (a rede não pode estar vazia)", () => {
    expect(ficheiros.length).toBeGreaterThan(30);
  });

  it("levanta ao chão de 12 px TODOS os tamanhos que os ecrãs pedem por baixo dele", () => {
    // Que tamanhos sub-12 é que o back office pede, na verdade?
    const pedidos = new Set<string>();
    for (const f of ficheiros) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/text-\[(\d+)px\]/g)) {
        if (Number(m[1]) < CHAO_PX) pedidos.add(m[0]);
      }
    }
    expect(pedidos.size).toBeGreaterThan(0);

    const bloco = blocoDoChaoMovel();
    expect(bloco, "falta em globals.css o bloco «CHÃO DA LETRA NO TELEMÓVEL»").not.toBe("");

    // No CSS as classes vêm escapadas: `.text-\[9px\]`.
    const emFalta = [...pedidos].filter((c) => {
      const escapada = c.replace("[", "\\[").replace("]", "\\]");
      return !bloco.includes(escapada);
    });
    expect(emFalta, `tamanhos sub-12px sem chão no telemóvel: ${emFalta.join(", ")}`).toEqual([]);
  });

  it("põe o chão no degrau que a casa já tinha, e não num número inventado", () => {
    const bloco = blocoDoChaoMovel();
    // `--bo-fs-caption` é 0.75rem = 12px, o degrau mais baixo da escala
    // documentada. Escrever `12px` à mão aqui seria abrir um segundo sistema.
    expect(bloco).toMatch(/font-size:\s*var\(--bo-fs-caption\)/);
  });

  it("levanta também o `.bo-eyebrow`, que titula quase todas as secções", () => {
    // Não é um utilitário do Tailwind — é uma classe própria fixada em 11 px,
    // e por isso escapava ao varrimento das classes `text-[Npx]` acima. Eram
    // nove títulos de secção por baixo do chão, medidos na Visão Geral.
    expect(blocoDoChaoMovel()).toMatch(/\.bo-eyebrow/);
  });

  it("desaperta o espacejamento largo junto com o tamanho", () => {
    // Levantar 9→12 px mantendo `tracking-[0.25em]` faz «Pedidos ativos»
    // crescer ~42 px e transbordar a coluna. O espacejamento tem de descer no
    // mesmo gesto em que a letra sobe.
    const bloco = blocoDoChaoMovel();
    expect(bloco).toMatch(/letter-spacing:/);
  });

  it("cobre tudo o que serve CARTÕES, e pára onde começa a tabela", () => {
    const bloco = blocoDoChaoMovel();
    /**
     * 1024 e não 640, e a diferença custou uma medição.
     *
     * A 768 px — um iPad em retrato — o defeito estava inteiro: 58 nós abaixo
     * de 12 px na Visão Geral e 66 nos Pedidos, com os mesmos rótulos de 8 px
     * na barra de baixo. Tinha de estar: abaixo de 1024 o `TabelaOuCartoes`
     * serve CARTÕES, e a barra inferior e a gaveta estão lá na mesma. A
     * fronteira certa não é «que largura tem um telemóvel», é «onde é que esta
     * interface muda de forma» — e é o mesmo 1024 do `desktop` no
     * `useAdaptativo`.
     *
     * É a lição que a regra dos 16 px nos campos já tinha aprendido: estava em
     * 640, deixava o iPad a ampliar ao focar, e o comentário que lá ficou diz
     * «a largura nunca foi a pergunta certa».
     */
    expect(bloco).toMatch(/@media\s*\(max-width:\s*1023/);
  });

  it("e o computador fica exactamente como estava", () => {
    // A régua ao contrário: se alguém alargar o chão para lá de 1024, a
    // densidade da tabela do portátil muda sem ninguém pedir.
    expect(blocoDoChaoMovel()).not.toMatch(/@media\s*\(max-width:\s*(1[1-9]|[2-9])\d*/);
  });

  it("é do back office e não pinta o site público", () => {
    expect(blocoDoChaoMovel()).toMatch(/body:is\(\.admin-mode, :has\(\[data-admin-mode\]\)\)/);
  });
});
