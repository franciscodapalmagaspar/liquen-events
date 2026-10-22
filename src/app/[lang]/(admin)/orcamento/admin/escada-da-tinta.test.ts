import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA TINTA, CINCO DEGRAUS — E NENHUM VALOR SOLTO A VOLTAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A análise da Pixelmatters trouxe o achado que arruma os cinzentos do back
 * office: eles não têm paleta nenhuma. Têm uma cor e uma escala de opacidades
 * com o número no nome. Com paleta, cada componente novo obriga a decidir uma
 * cor; com escala, a pergunta passa a ser em que degrau isto está.
 *
 * Antes desta rede havia QUARENTA E SETE grafias de cinzento nos riscos e nos
 * fundos do back office, em 588 chamadas — `[0.015]`, `[0.018]`, `[0.02]`,
 * `[0.025]`, `[0.03]`, `[0.035]`, `[0.04]`… Meio por cento de diferença não é
 * hierarquia; é a mesma decisão tomada outra vez por não haver onde a ir
 * buscar.
 *
 * Este teste é o «onde a ir buscar». Falha quando alguém escreve um cinzento
 * novo à mão, e a mensagem diz qual é o degrau que lhe serve.
 *
 * ── O QUE FICA DE FORA, E PORQUÊ ──────────────────────────────────────────
 *
 * Riscos acima de 18% e fundos acima de 12% não são desta escala: são
 * molduras e enchimentos que se querem VER (o contorno de um campo, uma faixa
 * de aviso). Esses continuam a escolher-se um a um, e este teste não lhes
 * toca. A escala que aqui se guarda é a da tinta quase invisível, que é onde
 * a inconsistência vivia.
 *
 * O TEXTO também fica de fora, e não por esquecimento: num fundo branco os
 * degraus baixos da escala não podem carregar letra nenhuma — 48% de preto
 * sobre branco dá ~3,5:1 e chumba a norma. A escada do texto tem os seus três
 * degraus medidos e o seu próprio teste (`contraste-do-texto.test.ts`).
 */

// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const CSS =
  fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8") +
  fs.readFileSync(path.join(process.cwd(), "src/app/admin.css"), "utf8");
const RAIZ = path.join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");

/**
 * ── A TINTA PASSOU A TER UM CANAL, E ESTA LISTA MUDOU DE FORMA ────────────
 *
 * Os degraus escreviam-se `rgba(13, 13, 13, α)`, cada um com o seu `13, 13,
 * 13` repetido. A fase 03 do sistema de design tirou de lá a cor: há UM canal,
 * `--bo-tinta-rgb`, e os nove degraus derivam dele.
 *
 * Não é arrumação. Era isso que fazia o modo escuro custar nove reescritas em
 * vez de uma — e esquecer UMA delas era ficar com um cinzento claro sobre
 * fundo escuro, num degrau só, sem ninguém dar por isso.
 *
 * O que este teste guarda continua a ser o mesmo: que os degraus existem, que
 * são estes, e que ninguém escreve o valor de um deles à mão noutro sítio. Só
 * que agora também guarda que **derivam todos do mesmo canal** — que é a
 * propriedade nova, e a que interessa.
 */
const CANAL = "--bo-tinta-rgb";

/** Os cinco degraus, e a opacidade exacta de cada um. */
const ESCADA: Record<string, string> = {
  // Riscos e fundos.
  "--bo-tinta-3": "0.03",
  "--bo-tinta-6": "0.06",
  "--bo-tinta-8": "0.08",
  "--bo-tinta-10": "0.1",
  "--bo-tinta-13": "0.13",
  // Texto. São QUATRO e não os seis da análise, e a norma é que decide: sobre
  // branco, 48% de preto dá ~3,5:1 e chumba. O último que passa é o 58.
  "--bo-tinta-58": "0.58",
  "--bo-tinta-64": "0.64",
  "--bo-tinta-72": "0.72",
  "--bo-tinta-82": "0.82",
};

function ficheirosDeEcra(dir: string, saco: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ficheirosDeEcra(p, saco);
    else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) saco.push(p);
  }
  return saco;
}

describe("a escada da tinta do back office", () => {
  it("tem os cinco degraus, com o número do degrau no nome", () => {
    for (const [nome, alfa] of Object.entries(ESCADA)) {
      expect(CSS, `falta o degrau \`${nome}\` no globals.css`).toContain(
        `${nome}: rgb(var(${CANAL}) / ${alfa})`,
      );
    }

    // E o canal existe mesmo, com a tinta do modo claro. Sem esta linha, os
    // nove degraus podiam apontar todos para um nome que não existe — nove
    // cores invisíveis e nenhum erro.
    expect(CSS, `o canal \`${CANAL}\` não está declarado`).toContain(`${CANAL}: 13 13 13`);
  });

  it("e os dois nomes de papel são apelidos de degraus, não valores à parte", () => {
    /**
     * `--bo-hairline` e `--bo-hairline-strong` estão em centenas de chamadas e
     * dizem o que a coisa É. Ficam — mas apontados à ESCADA, senão são dois
     * valores a viver por sua conta outra vez.
     *
     * ── PORQUE É QUE ISTO DEIXOU DE FIXAR O NÚMERO DO DEGRAU ──────────────
     *
     * Estava escrito `--bo-hairline: var(--bo-tinta-8)`, com o oito lá dentro.
     * O que este caso quer dizer é «vem da escada»; o degrau EM QUE ele está é
     * uma decisão de desenho, e mudou quando o chão do painel passou a branco:
     * sem o cinzento por baixo, o fio ficou sozinho a separar as coisas e subiu
     * para os 10%. Um teste que fixa o número obriga a passar por aqui para
     * afinar um tom, e isso ensina a mudar testes em vez de os ler.
     *
     * Quem guarda o «não pode ser fraco» é o `sombras-do-back-office.test.ts`,
     * que é onde essa razão vive: foi por causa do fio que as sombras do
     * conteúdo puderam sair todas.
     */
    for (const apelido of ["--bo-hairline", "--bo-hairline-strong"]) {
      const m = CSS.match(new RegExp(`${apelido}:\\s*var\\(--bo-tinta-(\\d+)\\)`));
      expect(m, `\`${apelido}\` deixou de ser um apelido de um degrau da escada`).not.toBeNull();
      expect(
        ESCADA[`--bo-tinta-${m?.[1]}` as keyof typeof ESCADA],
        `\`${apelido}\` aponta para \`--bo-tinta-${m?.[1]}\`, que não é um degrau da escada`,
      ).toBeDefined();
    }
    expect(CSS).toContain("--bo-text: var(--bo-tinta-82)");
    expect(CSS).toContain("--bo-text-muted: var(--bo-tinta-64)");
    expect(CSS).toContain("--bo-text-faint: var(--bo-tinta-58)");
  });

  it("e nenhum ecrã inventa um cinzento quase invisível fora dela", () => {
    const padrao = /\b(border|bg|divide|ring)-foreground\/(\[[0-9.]+\]|[0-9]+)/g;
    const soltos: string[] = [];

    for (const f of ficheirosDeEcra(RAIZ)) {
      const texto = fs.readFileSync(f, "utf8");
      for (const m of texto.matchAll(padrao)) {
        const [tudo, utilitario, valor] = m;
        const alfa = valor.startsWith("[") ? Number(valor.slice(1, -1)) : Number(valor) / 100;
        const dentroDaEscada = utilitario === "bg" ? alfa <= 0.12 : alfa <= 0.18;
        if (!dentroDaEscada) continue;
        const degrau =
          utilitario === "bg"
            ? alfa <= 0.035
              ? "--bo-tinta-3"
              : alfa <= 0.07
                ? "--bo-tinta-6"
                : "--bo-tinta-10"
            : alfa <= 0.09
              ? "--bo-hairline"
              : "--bo-hairline-strong";
        soltos.push(
          `  ${path.relative(RAIZ, f)}: \`${tudo}\` → \`${utilitario}-[var(${degrau})]\``,
        );
      }
    }

    expect(
      soltos,
      `${soltos.length} cinzento(s) escritos à mão em vez de um degrau da escada.\n` +
        `Cada um destes tem um degrau que lhe serve — a troca é directa:\n` +
        soltos.slice(0, 20).join("\n"),
    ).toEqual([]);
  });

  /**
   * ── E A FAIXA DO TEXTO QUE PASSA A NORMA ──────────────────────────────────
   *
   * Só de 55% para cima, e a fronteira não é arbitrária: abaixo de 58% de preto
   * sobre branco nenhum texto normal passa os 4,5:1 da WCAG 1.4.3. Portanto a
   * faixa acima é a que se pode arrumar mecanicamente — todos os valores lá
   * dentro passam antes e depois, e nenhum perde mais do que três por cento de
   * contraste.
   *
   * A faixa ABAIXO — 592 chamadas quando isto se escreveu — fica de fora de
   * propósito, e é a parte honesta deste teste. Ali estão três coisas
   * misturadas: texto GRANDE (que só precisa de 3:1), ÍCONES e traços (que não
   * são texto e têm a sua própria escada), e falhas verdadeiras. Um degrau
   * escolhido por um script ou escurecia trezentos ícones ou tapava as falhas.
   * Essa faixa quer olhos, e o passeio de contraste é que lhe há-de chegar.
   */
  it("e nenhum ecrã inventa um cinzento de TEXTO acima do chão da norma", () => {
    const padrao = /\btext-foreground\/(\[[0-9.]+\]|[0-9]+)/g;
    const soltos: string[] = [];

    for (const f of ficheirosDeEcra(RAIZ)) {
      const texto = fs.readFileSync(f, "utf8");
      for (const m of texto.matchAll(padrao)) {
        const [tudo, valor] = m;
        const alfa = valor.startsWith("[") ? Number(valor.slice(1, -1)) : Number(valor) / 100;
        if (alfa < 0.55) continue;
        // A fronteira de baixo é 55, e o degrau dela é o 64 — NÃO o 58. O
        // `globals.css` já tem um chão que sobe `/50 … /55` para o
        // `--bo-text-muted`; mandá-los para o `faint` BAIXAVA-os de 5,91:1 para
        // 4,77:1. Passava a norma na mesma, e por isso nenhum teste dava por
        // isso — foi o que quase aconteceu.
        const degrau =
          alfa >= 0.78 ? "--bo-text" : alfa >= 0.7 ? "--bo-tinta-72" : "--bo-text-muted";
        soltos.push(`  ${path.relative(RAIZ, f)}: \`${tudo}\` → \`text-[var(${degrau})]\``);
      }
    }

    expect(
      soltos,
      `${soltos.length} cinzento(s) de texto escritos à mão em vez de um degrau da escada.\n` +
        soltos.slice(0, 20).join("\n"),
    ).toEqual([]);
  });

  /**
   * ── E OS CINZENTOS QUE ESCAPAM AO CHÃO DO `globals.css` ───────────────────
   *
   * O `globals.css` tem um chão que sobe `text-foreground/25 … /55` para os
   * tokens medidos, porque abaixo disso não se passa a norma. Só que o chão é
   * uma LISTA de classes, e uma opacidade que não esteja na lista escapa-lhe:
   * `/15`, `/20`, `/22`, `/28` e `/[0.15]` renderizavam entre 1,3:1 e 2,3:1.
   *
   * Contados: dezassete. Oito eram TEXTO que ela lê — «Guardado no servidor», a
   * razão por que uma proposta se perdeu, os números do calendário, a hora de
   * cada movimento — e foram para o `--bo-text-faint`. Os outros nove não são
   * texto, e por isso ficam:
   *
   *  · dois `aria-hidden` — separadores desenhados, que ninguém lê;
   *  · seis botões de ÍCONE que são de propósito quase invisíveis em repouso e
   *    acendem ao passar o rato — e que já trazem `sem-rato:` a pô-los no
   *    degrau medido onde não há rato, que é onde ela trabalha;
   *  · a lupa dentro do campo de procura, que é decoração de um campo que já
   *    tem rótulo.
   *
   * A lista está PRESA aqui. Um cinzento novo abaixo do chão, em qualquer outro
   * sítio, põe isto vermelho — e quem o escrever tem de dizer porquê.
   */
  it("e os cinzentos abaixo do chão são só os nove que não são texto", () => {
    const CHAO = new Set([25, 30, 35, 40, 45, 50, 55]);
    const CONHECIDOS = [
      "PaymentsPanel.tsx", // aria-hidden
      "ProposalStudio.tsx", // aria-hidden
      "ProductionPlan.tsx", // ícone com `sem-rato:`
      "Tarefas.tsx", // ícone com `sem-rato:` (×2)
      "Fornecedores.tsx", // ícone com `sem-rato:` (×3)
      "AdminClient.tsx", // lupa do campo de procura
    ];
    const padrao = /\btext-foreground\/(\[[0-9.]+\]|[0-9]+)/g;
    const novos: string[] = [];

    for (const f of ficheirosDeEcra(RAIZ)) {
      const nome = path.basename(f);
      const texto = fs.readFileSync(f, "utf8");
      for (const m of texto.matchAll(padrao)) {
        const valor = m[1];
        const alfa = valor.startsWith("[") ? Number(valor.slice(1, -1)) * 100 : Number(valor);
        if (alfa >= 55 || CHAO.has(alfa)) continue;
        if (CONHECIDOS.includes(nome)) continue;
        novos.push(`  ${path.relative(RAIZ, f)}: \`${m[0]}\``);
      }
    }

    expect(
      novos,
      `${novos.length} cinzento(s) abaixo do chão do \`globals.css\` num sítio novo.\n` +
        `Se for TEXTO, sobe para \`text-[var(--bo-text-faint)]\` — abaixo de 58% nada passa a ` +
        `norma. Se for ícone ou desenho, acrescenta o ficheiro à lista deste teste com a razão.\n` +
        novos.join("\n"),
    ).toEqual([]);
  });
});
