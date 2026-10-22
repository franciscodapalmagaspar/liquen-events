// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import AdminClient from "./AdminClient";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CABEÇALHO ACOMPANHA A TROCA DE VISTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quero animações em tudo o que seja para ir de uma coisa à
 * outra, quando se carrega numa coisa e vai-se para outra coisa».
 *
 * O corpo de cada vista entra com a `.view-in` desde sempre — 240 ms, oito
 * píxeis. O título e o subtítulo, que estão na faixa de cima, trocavam no
 * sítio, secos. Lia-se como se só metade do ecrã tivesse mudado: o conteúdo
 * chegava e o nome dele já lá estava.
 *
 * ── PORQUE É QUE AQUI O `key` PODE REMONTAR ───────────────────────────────
 *
 * Noutros sítios desta casa a animação vem de a classe entrar e sair, e há
 * testes a proibir o `key` — nos passos do estúdio e nos separadores do painel,
 * remontar perdia o formulário, o foco e o rascunho.
 *
 * Aqui não há nada disso: o cabeçalho é texto. É por isso que o `key` é a
 * ferramenta certa neste sítio e a errada nos outros, e é isso que este
 * ficheiro prende — que o nó é MESMO substituído, que é o que faz a animação
 * voltar a correr a cada troca.
 */

vi.mock("./Toast", () => ({
  useToast: () => ({ toast: () => {} }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function resposta(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "x-pedido": "completo" }),
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => resposta([])),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** O invólucro do título — o nó que leva a entrada. */
function cabecalho(): HTMLElement {
  const titulo = screen.getByRole("heading", { level: 1 });
  const alvo = titulo.parentElement;
  expect(alvo, "o invólucro do título").toBeTruthy();
  return alvo as HTMLElement;
}

function irPara(nome: RegExp) {
  const barra = screen.getByRole("complementary");
  fireEvent.click(within(barra).getAllByRole("button", { name: nome })[0]);
}

describe("o cabeçalho acompanha a troca de vista", () => {
  it("o título e o subtítulo entram, em vez de trocarem no sítio", async () => {
    render(<AdminClient initialQuotes={[] as Quote[]} userName="Catarina" />);

    const antes = cabecalho();
    // Controlo positivo: a entrada está lá desde o princípio.
    expect(antes.className).toContain("bo-entrada");

    irPara(/Pedidos/);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Pedidos/);
    });

    const depois = cabecalho();
    expect(depois.className).toContain("bo-entrada");
    // E é um nó NOVO: sem isto a classe estaria lá mas a animação nunca
    // recomeçava, e o cabeçalho continuava a trocar no sítio.
    expect(depois).not.toBe(antes);
  });

  /**
   * A distância é a de um rótulo, não a de uma página. A casa reserva o degrau
   * `--bo-percurso-rotulo` para «um item de menu» e o `--bo-percurso-folha`
   * para «um aviso»; o cromado não sai do sítio, muda o nome que ele traz.
   *
   * Os degraus subiram (4 → 10 px e 8 → 18 px) quando o vocabulário passou a
   * ver-se; o que este caso guarda não é o número, é o DEGRAU — o cabeçalho
   * continua a entrar como um rótulo, e não como uma página inteira.
   */
  it("entra à distância de um rótulo, e cala-se com movimento reduzido", async () => {
    const { readFileSync } = await import("node:fs");
    // O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
    // todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
    // o browser os aplica no back office.
    const css =
      readFileSync("src/app/globals.css", "utf8") + readFileSync("src/app/admin.css", "utf8");
    expect(css).toMatch(
      /@keyframes bo-entrada[\s\S]{0,1600}?translateY\(var\(--bo-entrada-y, calc\(-1 \* var\(--bo-percurso-rotulo\)\)\)\)/,
    );
    expect(css).toMatch(/\.bo-entrada\s*\{\s*animation:\s*bo-entrada\s+240ms/);
    expect(css).toMatch(
      /prefers-reduced-motion:\s*reduce\)\s*\{\s*\.bo-entrada\s*\{\s*animation:\s*none/,
    );
  });
});
