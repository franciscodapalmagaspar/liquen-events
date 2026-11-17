import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA ACÇÃO ESCONDIDA NO HOVER SÓ EXISTE ONDE HÁ HOVER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O back office tem dezenas de acções de linha que só aparecem ao passar o
 * rato. É um desenho bom — mantém as listas calmas — e tem exactamente uma
 * condição: que haja rato. Onde não há, a acção tem de estar visível, senão
 * não é discreta: não existe.
 *
 * ── O QUE ISTO GUARDA, E PORQUÊ EM VEZ DE UM TESTE DE COMPONENTE ────────────
 * A regra vive numa classe de CSS, e o jsdom não avalia media queries sobre
 * classes. Um teste de componente por ecrã afirmaria onze vezes a mesma coisa
 * e continuaria a deixar passar o décimo segundo ecrã — que foi precisamente o
 * que aconteceu: o `EventTasks` foi escrito sem escapatória nenhuma e ninguém
 * deu por isso até se medir com um dedo. Isto lê o código todo de uma vez, que
 * é a única forma de a regra não voltar a ter uma excepção por distracção.
 *
 * As duas medições que lhe deram origem, ambas a 768×1024 COM DEDO — um iPad
 * em retrato, que é largo e não tem rato nenhum:
 *   · Fornecedores 4 de 36 alvos visíveis (e os 4 eram estrelas de fichas já
 *     preferidas, que nem sequer passavam pela regra)
 *   · Tarefas 0 de 40, Inventário 0 de 20, dossier 0 de 86
 */

const DIR = "src/app/[lang]/(admin)/orcamento/admin";

function ficheiros(dir: string, saida: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) ficheiros(p, saida);
    else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) saida.push(p);
  }
  return saida;
}

/**
 * Cada `className` do ficheiro, com a etiqueta a que pertence.
 *
 * Lê a EXPRESSÃO inteira e não linha a linha: a classe base e a variante
 * escondida vivem muitas vezes em ramos diferentes do mesmo template literal
 * (`opacity-100` na cabeça, `com-rato:opacity-0` num dos ramos), e um teste
 * linha a linha acusava isso como defeito.
 */
function classes(src: string): { tag: string; cls: string }[] {
  const saida: { tag: string; cls: string }[] = [];
  const re = /className=/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const abre = src.lastIndexOf("<", m.index);
    const tag = /^<\s*([A-Za-z][\w.]*)/.exec(src.slice(abre, abre + 40))?.[1] ?? "";
    const i = m.index + m[0].length;
    let cls: string;
    if (src[i] === '"') {
      cls = src.slice(i + 1, src.indexOf('"', i + 1));
    } else if (src[i] === "{") {
      let d = 0;
      let j = i;
      for (; j < src.length; j++) {
        if (src[j] === "{") d++;
        else if (src[j] === "}" && --d === 0) break;
      }
      cls = src.slice(i + 1, j);
    } else continue;
    saida.push({ tag, cls });
  }
  return saida;
}

/** Só o que se carrega. Um rótulo revelado no hover é enfeite, não é acção. */
const INTERACTIVO = /^(button|a|Button)$/;
/** "Aparece ao passar por cima" — incluindo os grupos com nome (`/foto`). */
const REVELA = /group-hover(\/[\w-]+)?:opacity-100/;
/** Uma saída para quem não tem rato, qualquer que seja a forma de a escrever. */
const FUGA = /com-rato:|@media\(hover:none\)|pointer-coarse:opacity-100/;
/** O defeito com nome: a saída presa à LARGURA da janela. */
const POR_LARGURA = /\b(sm|md|lg|xl|2xl):opacity-0\b/;

/**
 * O que ainda falta, e está com outra pessoa.
 *
 * Esteve aqui o `ProposalStudio.tsx`, pelo «Remover imagem» da miniatura. Esse
 * botão saiu para `estudio/fotos/Thumb.tsx` (fase 2 de
 * `docs/ESTRUTURA-DO-CODIGO.md`) e já tem a saída para o dedo (`com-rato:`), por
 * isso a lista ficou vazia — e este teste passa a prender todos, sem excepção.
 */
const POR_CORRIGIR: string[] = [];

describe("as acções escondidas no hover", () => {
  const todos = ficheiros(DIR).flatMap((f) =>
    classes(readFileSync(f, "utf8")).map((c) => ({ ...c, f })),
  );

  it("nenhuma se esconde pela LARGURA da janela — a pergunta é sobre o ponteiro", () => {
    const maus = todos
      .filter((c) => INTERACTIVO.test(c.tag) && POR_LARGURA.test(c.cls))
      .map((c) => c.f);
    // 768 px passa dos 640 do `sm:` sem ganhar rato nenhum: era assim que um
    // iPad em retrato ficava sem UMA das 182 acções de linha do back office.
    expect([...new Set(maus)]).toEqual([]);
  });

  it("todas têm uma saída para quem não tem rato", () => {
    const maus = [
      ...new Set(
        todos
          .filter((c) => INTERACTIVO.test(c.tag) && REVELA.test(c.cls) && !FUGA.test(c.cls))
          .map((c) => c.f),
      ),
    ];
    expect(maus.filter((f) => !POR_CORRIGIR.includes(f))).toEqual([]);
  });
});
