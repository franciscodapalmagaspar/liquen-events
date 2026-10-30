// Registers the jest-dom matchers (toBeInTheDocument, toHaveTextContent, …)
// on Vitest's `expect`. Safe under the default `node` environment too — it only
// extends the assertion library; the DOM-touching matchers are used solely by
// the component tests that opt into jsdom via `// @vitest-environment jsdom`.
import "@testing-library/jest-dom/vitest";

/**
 * `scrollIntoView`, que o jsdom não implementa.
 *
 * O back office leva o utilizador ao sítio em vários caminhos — o índice dos
 * mood boards, o aviso de ortografia, a conferência —, e todos chamam isto. Sem
 * o esboço, o teste rebenta com um `TypeError` dentro de um efeito e o erro que
 * se lê não tem nada a ver com o que se está a medir.
 *
 * Um esboço vazio e não um espião: o que interessa a estes testes é o que
 * acontece A SEGUIR ao salto (o foco, o campo certo), e não que a página tenha
 * mesmo rolado — coisa que num DOM sem disposição não quer dizer nada.
 */
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

/**
 * `ResizeObserver`, que o jsdom também não implementa.
 *
 * Quem o usa aqui é a pílula deslizante do `ui/Segmented`: ela segue o segmento
 * activo quando ele muda de tamanho ou passa para a linha de baixo, e num ecrã
 * estreito isso acontece a sério. Sem o esboço, o teste rebenta com um
 * `ReferenceError` dentro de um efeito — e o erro que se lê não tem nada a ver
 * com o que se está a medir.
 *
 * Um esboço INERTE, e não um espião: o jsdom não tem disposição nenhuma, todos
 * os elementos medem zero, e portanto não há redimensionamento nenhum para
 * observar. O que estes testes medem é o que existe no DOM e o que se anuncia —
 * a posição da pílula mede-se num browser a sério, no passeio do Playwright.
 */
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    // O construtor recebe a função, como o verdadeiro, mesmo não a usando. Sem
    // ele, a análise estática desta casa resolvia `new ResizeObserver(medir)`
    // do `ui/Segmented.tsx` para ESTE esboço — uma classe anónima sem
    // construtor — e acusava «argumento a mais no construtor». Um alerta a
    // apontar para código de produção, nascido de um esboço de teste, é pior do
    // que não ter alerta nenhum: ensina a ignorá-los.
    constructor(_aoMudar: ResizeObserverCallback) {
      void _aoMudar;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

/**
 * A `sessionStorage` de cada teste começa vazia.
 *
 * O estúdio guarda nela o «já vi o PDF final» de cada pedido (ver `pdfVisto`
 * em `ProposalStudio.tsx`), e o jsdom mantém-na entre os testes do mesmo
 * ficheiro: um teste que confirma o PDF deixava o seguinte a começar com o
 * PDF já visto. Os ficheiros já limpam a `localStorage` à mão; esta limpa-se
 * aqui, para nenhum ter de se lembrar.
 */
import { beforeEach } from "vitest";
beforeEach(() => {
  try {
    globalThis.sessionStorage?.clear();
  } catch {
    /* ambiente `node`, sem armazenamento */
  }
});

/**
 * O DNS fica de fora dos testes.
 *
 * Desde 30/10 o domínio do email é conferido em todos os pedidos e à porta de
 * cada envio (`dominioRecebeEmail`, que pergunta ao DNS). Sem este duplo, cada
 * teste de rota que manda um email para «ana@exemplo.pt» perguntava a sério à
 * rede — lento, e com a resposta a depender da máquina: o `exemplo.pt` não
 * tem correio, e o teste passava a falhar por uma razão que não é dele.
 *
 * O duplo diz que sim a tudo, menos ao TLD `.invalid` (RFC 2606, reservado
 * para isto mesmo): um teste que quer o «não» escreve `x@nao-existe.invalid`,
 * ou troca a resposta com `vi.mocked(dominioRecebeEmail)`. Quem testa o DNS a
 * sério (`dominio-do-email.test.ts`) desfaz o duplo com `vi.unmock`.
 */
import { vi } from "vitest";
vi.mock("@/lib/dominio-do-email", () => ({
  dominioRecebeEmail: vi.fn(async (email: string) => !/\.invalid\s*$/i.test(email ?? "")),
  esquecerDominiosVistos: () => {},
}));
