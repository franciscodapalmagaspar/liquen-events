import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS DUAS RECUSAS — e uma recusa vale tanto como um gesto, se ninguém a desfizer
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um gesto que se acrescenta fica no ficheiro e defende-se sozinho. Uma
 * DECISÃO DE NÃO ANIMAR não deixa rasto nenhum no código: lê-se como um sítio
 * por acabar, e o próximo que passar «acaba-o». Este ficheiro é o rasto.
 *
 * As duas recusas estão escritas por extenso onde vivem — no cabeçalho do
 * `CommandPalette.tsx` (pontos 2 e 3) e no do `NotificationBell.tsx`. Aqui só
 * se prendem, para que desfazê-las custe um vermelho em vez de passar
 * despercebido numa revisão.
 */

const raiz = path.join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");
const ler = (f: string) => fs.readFileSync(path.join(raiz, f), "utf8");

/**
 * O CÓDIGO SEM A PROSA.
 *
 * As razões destas duas recusas estão escritas nos próprios ficheiros, e para
 * as explicar têm de NOMEAR o que recusam — «o `ESTADO` saiu daqui», «não se
 * põe uma `.bo-entrada` no sino». Um teste que procure essas palavras no
 * ficheiro inteiro fica vermelho por causa da explicação da coisa que ele
 * existe para impedir, o que é a maneira mais certa de alguém apagar a
 * explicação para o teste passar. Por isso lê-se só o código.
 */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("a paleta de comandos: o realce da escolha não esbate", () => {
  /**
   * A linha escolhida move-se com o ↓ e o ↑ SEGURADOS, à cadência de repetição
   * do teclado. Com os 120 ms do `ESTADO` sobre `background-color`, isso põe
   * várias linhas a meio de um esbatimento ao mesmo tempo e nenhuma a ler-se
   * como «é esta que o Enter abre». Numa paleta de comandos, a regra de que
   * nenhuma animação atrasa uma tarefa é a única que conta.
   */
  it("as linhas de resultado não trazem o `ESTADO`", () => {
    const codigo = semComentarios(ler("CommandPalette.tsx"));
    expect(codigo, "a constante do toque da linha desapareceu").toContain("TOQUE_DA_LINHA");

    // O `ESTADO` não pode sequer estar importado: se estiver, alguém voltou a
    // pô-lo nalgum sítio deste ficheiro.
    expect(
      codigo,
      "o `ESTADO` (120 ms) voltou ao CommandPalette — ver o ponto 3 do cabeçalho de lá",
    ).not.toMatch(/\bESTADO\b/);
  });

  /**
   * E o que FICA é a resposta ao toque. Sem uma `transition-[scale]` explícita
   * o `PRESSAO` não anima coisa nenhuma: no Tailwind 4 a classe `scale-*` emite
   * a propriedade autónoma `scale`, e é essa a avaria nº 1 que o
   * `ui/movimento.ts` conta por extenso. Tirar o `ESTADO` sem pôr esta linha era
   * apagar o carregar sem dar por isso.
   */
  it("mas o carregar continua coberto — `scale`, e não `transform`", () => {
    const codigo = semComentarios(ler("CommandPalette.tsx"));
    expect(codigo).toContain("motion-safe:transition-[scale]");
    expect(codigo).toContain("motion-safe:duration-[120ms]");
    expect(
      codigo,
      "`transition-[transform]` NÃO cobre a propriedade autónoma `scale` — ver `ui/movimento.ts`",
    ).not.toContain("transition-[transform]");
  });
});

describe("o sininho: números não pulsam", () => {
  /**
   * Hoje não há contador nenhum (o componente é um botão só) — e é precisamente
   * por isso que este teste existe: no dia em que ele aparecer, a tentação é
   * pô-lo a pulsar. Um número a pulsar não indica direcção nem origem; repete-se
   * para sempre e só insiste. E a pulsação já quer dizer outra coisa nesta casa:
   * o ponto do `ui/EmCurso` significa «isto está a acontecer AGORA».
   */
  it("nada no sino chama atenção em ciclo", () => {
    const codigo = semComentarios(ler("NotificationBell.tsx"));
    for (const chamariz of ["animate-pulse", "animate-ping", "animate-bounce"]) {
      expect(
        codigo,
        `o sino passou a ${chamariz} — o movimento indica direcção e origem, não chama atenção`,
      ).not.toContain(chamariz);
    }
  });

  /**
   * E o sino a nascer do nada quando a sondagem responde continua sem entrada,
   * de propósito: o defeito ali é um lugar que não estava reservado na barra, e
   * uma animação por cima de um salto de disposição só o torna mais visível. A
   * razão inteira está no cabeçalho do `NotificationBell.tsx`, com o precedente
   * do rodopio do `ui/Button.tsx`.
   */
  it("e não se maquilha o salto da barra com uma entrada", () => {
    expect(semComentarios(ler("NotificationBell.tsx"))).not.toContain("bo-entrada");
  });
});
