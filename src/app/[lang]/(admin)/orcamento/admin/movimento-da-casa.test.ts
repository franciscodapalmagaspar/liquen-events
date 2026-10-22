import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ESCADA DE ENTRADA: DEGRAUS DE 20 ms, SEIS, E PÁRA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Da análise medida da Apple: uma escada de atrasos escrita no CSS — 0,20 /
 * 0,22 / 0,24 / 0,26 / 0,28 / 0,30 s. Seis degraus de vinte milissegundos, e
 * pára. O desfasamento existe para o olho ler ORDEM DE LEITURA; ao sexto item
 * essa informação já foi dada, e continuar só acrescenta espera.
 *
 * O que este teste guarda é o TECTO, que é a parte que se perde primeiro. Sem
 * ele, uma lista de trinta linhas põe a última a entrar seis décimos de
 * segundo depois da primeira — e o desfasamento passa a ler-se como lentidão.
 *
 * ── E A CURVA, QUE NÃO É NOVA ─────────────────────────────────────────────
 *
 * A análise pede «uma curva para o sítio inteiro, sem ease-in». Esta casa já
 * tem uma, e o segundo teste guarda que a cascata a usa em vez de trazer a
 * sua: a `--ease-out`, que é também a curva por omissão de todos os
 * utilitários `transition-*` do sítio. Uma cascata com curva própria seria uma
 * segunda linguagem de movimento na mesma página — o mesmo defeito que os
 * quarenta e sete cinzentos eram na cor.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * E DEPOIS PASSOU A HAVER UMA MOLA. ESTE CENSO TEM DE O DIZER.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro dizia, e continuava a dizer depois de deixar de ser verdade,
 * que «a casa continua a ter UMA curva». Um censo que se lê como presente
 * depois de mudar é pior do que não existir: manda quem vem a seguir procurar
 * uma coisa que já não está lá, ou «corrigir» uma que está certa. O que é
 * verdade hoje, ponto por ponto:
 *
 *  1. **A recusa da terceira `cubic-bezier` MANTÉM-SE, e mantém-se inteira.**
 *     A análise propõe a `cubic-bezier(0.4, 0, 0.2, 1)` — simétrica — para o
 *     sítio inteiro. É, letra por letra, a curva de que ~300 transições desta
 *     casa foram tiradas de propósito para convergirem na assinatura. Era uma
 *     segunda DESACELERAÇÃO a fazer o trabalho da primeira, e continua a não
 *     entrar. O terceiro caso aqui em baixo guarda-a.
 *
 *  2. **A cascata continua sem curva própria.** `.bo-cena` usa `--ease-out`, e
 *     o segundo caso guarda-o. Isso não mudou.
 *
 *  3. **MAS o `globals.css` passou a ter um `--bo-mola-chegada`,** e ele é uma
 *     curva de tempo nova. Vale para UMA palavra do vocabulário — a caixa que
 *     o utilizador convocou (`.bo-entrada-folha` e o diálogo `aria-modal`) — e
 *     para mais nenhuma.
 *
 * ── PORQUE É QUE 3 NÃO DESFAZ 1 ───────────────────────────────────────────
 *
 * Não é uma desculpa de vocabulário; são duas diferenças que se verificam:
 *
 *   · **Faz um trabalho que nenhuma das duas faz.** As duas curvas da casa são
 *     monótonas: uma desacelera, a outra acelera, e nenhuma passa do sítio. Uma
 *     chegada que ultrapassa ligeiramente e assenta é a diferença entre
 *     «apareceu» e «chegou» — e uma `cubic-bezier` só o faria com um ponto de
 *     controlo escolhido ao olho fora do intervalo, que é exactamente o tipo de
 *     número que estas rondas vieram tirar.
 *
 *   · **Não foi escrita: foi CALCULADA.** É a `MOLA_CHEGADA` do
 *     `lib/motion/tokens.ts` (rigidez 900, amortecimento 34, ζ = 0,567)
 *     amostrada em 360 ms. Os trinta e um números do `linear()` não se
 *     escolhem um a um; mudar a mola reescreve-os todos, e o
 *     `tokens.coerencia.test.ts` compara os dois lados caracter a caracter.
 *     A casa já tinha uma mola medida — a `MOLA`, do arrasto — e esta é a irmã
 *     dela para o outro problema, não uma curva a competir com a assinatura.
 *
 * O que este ficheiro passa a guardar, por causa disso, é o ÂMBITO: a mola vale
 * para a caixa convocada e não escorrega para o resto do back office.
 */

// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const CSS =
  fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8") +
  fs.readFileSync(path.join(process.cwd(), "src/app/admin.css"), "utf8");

describe("a escada de entrada do back office", () => {
  it("tem degraus de 20 ms — e PÁRA ao sexto", () => {
    expect(CSS).toContain("--bo-degrau: 20ms");
    expect(CSS).toContain("--bo-degraus-max: 5");

    // O tecto tem de estar na CONTA do atraso, e não só declarado num token
    // que ninguém lê. Medido num browser antes de escrever isto:
    // `--cena: 0 → 0s`, `3 → 0,06s`, `5 → 0,1s`, `30 → 0,1s`.
    const bloco = CSS.slice(CSS.indexOf(".bo-cena {"));
    const regra = bloco.slice(0, bloco.indexOf("}"));
    expect(
      regra,
      "o atraso da cascata deixou de ter tecto — uma lista longa volta a entrar em câmara lenta",
    ).toMatch(/min\(var\(--cena, ?0\), ?var\(--bo-degraus-max\)\)/);
    expect(regra).toContain("var(--bo-degrau)");
  });

  it("e usa a curva da casa, em vez de trazer uma sua", () => {
    const bloco = CSS.slice(CSS.indexOf(".bo-cena {"));
    const regra = bloco.slice(0, bloco.indexOf("}"));
    expect(
      regra,
      "a cascata voltou a ter curva própria — a casa tem uma só, `--ease-out`, e é a omissão " +
        "de todos os `transition-*`. Duas curvas na mesma página são duas linguagens de movimento.",
    ).toContain("var(--ease-out)");
    expect(regra, "curva escrita à mão dentro da cascata").not.toMatch(/cubic-bezier/);
  });

  it("e a casa continua a ter UMA curva de assinatura — não a da análise", () => {
    // A análise propõe `cubic-bezier(.4,0,.2,1)`. É, letra por letra, a curva
    // que esta casa recusou por escrito: ~300 transições estavam nela por
    // omissão e foram convergidas para a assinatura. Cheguei a acrescentá-la
    // como token novo; era uma segunda curva a competir com a primeira.
    expect(CSS).toContain("--ease-out: cubic-bezier(0.16, 1, 0.3, 1)");
    expect(
      CSS,
      "voltou a existir um token de curva próprio do back office — a casa tem `--ease-out`",
    ).not.toContain("--bo-curva");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MOLA DA CHEGADA VALE PARA UMA PALAVRA, E NÃO PARA O BACK OFFICE INTEIRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma curva nova é uma dívida enquanto não tiver âmbito escrito. O perigo real
 * não é ela existir — é ela alastrar: daqui a três rondas metade das entradas
 * está com mola, ninguém sabe porquê, e a casa volta a ter duas linguagens de
 * movimento. Estes casos são a cerca.
 */
describe("a mola da chegada tem cerca", () => {
  it("existe, e é um `linear()` — não uma cubic-bezier com um ponto ao olho", () => {
    expect(CSS).toContain("--bo-mola-chegada: linear(");
    // E dura o MESMO que a entrada de toda a gente. Houve uma versão de 360 ms
    // e foi medida a custar fotogramas a 1440×900 com o CPU travado 6× — o
    // percurso e a escala saíam de graça, a duração é que não. A mola foi
    // endurecida até assentar nos 240; a conta está no `lib/motion/tokens.ts`.
    const base = /\.bo-entrada\s*\{\s*animation:\s*bo-entrada (\d+)ms/.exec(CSS);
    expect(base, "a regra `.bo-entrada` desapareceu").not.toBeNull();
    expect(CSS).toContain(`--bo-mola-chegada-ms: ${base![1]}ms`);
  });

  it("e passa mesmo do sítio — senão não é mola nenhuma", () => {
    const m = /--bo-mola-chegada:\s*linear\(([^;]+)\);/.exec(CSS);
    expect(m, "o token da mola desapareceu do globals.css").not.toBeNull();
    const pontos = m![1]
      .replace(/\)\s*$/, "")
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isFinite(x));
    expect(pontos.length, "o `linear()` ficou sem degraus").toBeGreaterThan(20);
    expect(pontos[0], "a mola tem de partir do zero").toBe(0);
    expect(
      pontos[pontos.length - 1],
      "uma curva que não acaba em 1 deixa a caixa fora do sítio",
    ).toBe(1);
    // A ULTRAPASSAGEM, que é a razão de a mola existir. A `MOLA` do ARRASTO
    // tem ζ = 0,95 e passa 0,007% do sítio — invisível. Escrever «mola» e não
    // ter ultrapassagem nenhuma seria não ter mola.
    const pico = Math.max(...pontos);
    expect(pico, "a mola deixou de passar do sítio — é um travão, não uma mola").toBeGreaterThan(
      1.05,
    );
    // E não pode saltitar: acima disto lê-se como brincadeira num painel de
    // trabalho, que é o erro clássico da mola em interfaces.
    expect(pico, "a mola passou a saltitar").toBeLessThan(1.2);
  });

  it("vale para a caixa convocada, e para mais nada", () => {
    // Quem PODE ter mola: a folha do telemóvel e o diálogo modal do computador
    // (que não tem classe própria — vai-se buscar pelo `aria-modal`).
    //
    // Cada APLICAÇÃO da mola (`var(--bo-mola-chegada…)`) tem de estar dentro de
    // uma regra cujo selector nomeie as duas caixas convocadas — e mais
    // ninguém. Olha-se para o selector que abre a regra, e não para a linha, que
    // é multilinha de propósito.
    const usos = [...CSS.matchAll(/var\(--bo-mola-chegada/g)].map((m) => {
      const antes = CSS.slice(0, m.index);
      const abre = antes.lastIndexOf("{");
      const fecha = Math.max(antes.lastIndexOf("}", abre), antes.lastIndexOf("{", abre - 1));
      return antes
        .slice(fecha + 1, abre)
        .replace(/\s+/g, " ")
        .trim();
    });
    expect(usos.length, "a mola deixou de ser aplicada a alguma coisa").toBeGreaterThan(0);
    const fora = usos.filter(
      (sel) =>
        !(
          sel.includes(".bo-entrada-folha") &&
          sel.includes('.bo-entrada[aria-modal="true"]:not(.bo-entrada-fundo)') &&
          // Quem declara o `--bo-entrada-y` no `style` tem geometria própria e
          // fica de fora — é a gaveta do pedido, que é `fixed inset-y-0` e não
          // pode encolher, e o lote novo da lista. A razão está no CSS.
          sel.includes(':not([style*="--bo-entrada-y"])')
        ),
    );
    expect(fora, "a mola escorregou para fora da caixa convocada: " + fora.join(" · ")).toEqual([]);
  });

  it("e a cascata, a troca de vista e a saída continuam sem ela", () => {
    for (const [nome, marca] of [
      ["a cascata de blocos", ".bo-cena {"],
      ["a troca de vista", ".view-in {"],
      ["a saída", ".bo-saida {"],
    ] as const) {
      const i = CSS.indexOf(marca);
      expect(i, `a regra \`${marca}\` desapareceu`).toBeGreaterThan(-1);
      const regra = CSS.slice(i, CSS.indexOf("}", i));
      expect(regra, `${nome} ganhou mola`).not.toContain("--bo-mola-chegada");
    }
    // Uma coluna de números não leva mola, e um bloco de apresentação também
    // não: a mola é para o objecto que o utilizador foi buscar.
  });

  it("e degrada para a curva da casa onde o `linear()` não existe", () => {
    // O `linear()` é de 2023. Fora de um `@supports`, uma declaração inválida
    // derruba a `animation-timing-function` inteira e a caixa fica sem curva
    // nenhuma. Aqui, quem não o entende fica com a entrada de sempre.
    const i = CSS.indexOf("--bo-mola-chegada)");
    expect(i, "a mola deixou de ser aplicada a alguma coisa").toBeGreaterThan(-1);
    const antes = CSS.slice(0, i);
    expect(
      antes.lastIndexOf("@supports (animation-timing-function: linear(0, 1))"),
      "a mola saiu de dentro do `@supports` — num browser antigo a caixa fica sem curva",
    ).toBeGreaterThan(antes.lastIndexOf("\n}"));
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DEGRAU DA ESCADA NÃO SUBIU, E ISSO TAMBÉM É UMA DECISÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Quando o percurso da `.bo-cena` subiu de 12 para 28 px, a pergunta óbvia foi
 * se o degrau de 20 ms devia subir com ele. Não subiu, e a conta é esta:
 *
 *   · o RASTO de uma cascata é `--bo-degraus-max × --bo-degrau` = 5 × 20 =
 *     100 ms, seja de cinco blocos ou de cinquenta. É esse número que decide se
 *     uma lista longa se lê como ordem ou como lentidão, e ele não tem nada que
 *     ver com a distância.
 *   · o que a distância maior mudou foi a LEGIBILIDADE do mesmo desfasamento:
 *     na `--ease-out`, aos 20 ms de diferença dois blocos vizinhos estão
 *     separados por ~2,3 px de percurso a 28 px, contra ~1,0 px a 12 px. O
 *     degrau ficou mais de duas vezes mais visível sem custar um milissegundo.
 *
 * Ou seja: subir o degrau seria pagar espera por uma coisa que a distância já
 * deu de graça. Se algum dia subir, o tecto tem de descer para o rasto ficar
 * nos ~100 ms — e é isso que este caso guarda.
 */
describe("o rasto da cascata não cresce sem se dar por isso", () => {
  it("degrau × tecto continua a caber em 100 ms", () => {
    const degrau = Number(/--bo-degrau:\s*(\d+)ms/.exec(CSS)?.[1]);
    const tecto = Number(/--bo-degraus-max:\s*(\d+)/.exec(CSS)?.[1]);
    expect(Number.isFinite(degrau) && Number.isFinite(tecto)).toBe(true);
    expect(
      degrau * tecto,
      `o rasto da cascata passou a ${degrau * tecto} ms. Se o degrau subiu, o tecto tem de ` +
        "descer: é o RASTO que se lê como lentidão, não o degrau.",
    ).toBeLessThanOrEqual(100);
  });
});
