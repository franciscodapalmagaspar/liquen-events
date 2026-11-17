// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";
import { CORE_NAV, MORE_NAV, NAV } from "./nav";
import { fonteComposta, fonteDe } from "./fonte-do-admin.testkit";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A COLUNA MOSTRA TUDO — «retira o mais e deixa tudo à vista»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A barra lateral tinha um grupo dobrável chamado «Mais» (as reticências) com
 * cinco destinos lá dentro — Propostas Aceites, Material, Temas, Estatísticas e
 * Definições —, fechado por omissão. A ideia era que quem chega visse uma lista
 * curta; o problema é que quem chega a este back office é sempre a mesma
 * pessoa, e ela sabe de cor o que quer. A dobra dava-lhe um toque a mais para
 * cinco destinos e um sítio onde procurar o que ela já sabia que existia.
 *
 * ── O QUE ISTO PRENDE, E PORQUÊ CADA COISA ────────────────────────────────
 *
 * Não chega afirmar «não há botão Mais»: apagar o `<summary>` e deixar os
 * cinco destinos escondidos por CSS passaria nesse caso e não resolveria nada.
 * Por isso o caso principal conta os destinos e alcança cada um deles SEM
 * carregar em nada pelo caminho.
 *
 * E prende o ESTADO que ficava para trás. Um grupo que já não existe não pode
 * deixar um `moreNavOpen` no ficheiro, nem uma dependência dele na lista do
 * efeito que mede o filete do destino activo — uma dependência a mais não dá
 * erro nenhum, só volta a correr por uma razão que já não há, e é assim que
 * um ficheiro grande acumula estado morto que ninguém se atreve a apagar.
 *
 * ── O QUE NÃO ESTÁ AQUI ───────────────────────────────────────────────────
 *
 * Onde o filete PÁRA. Ele mede-se (`offsetTop`/`offsetHeight`) e no jsdom não
 * há disposição nenhuma — `offsetParent` é sempre nulo e as medidas são zero.
 * Isso mede-se num browser, e já está medido: `e2e/admin-views.spec.ts`, «a
 * marca do destino activo», com `expect.poll` sobre a posição em que ele
 * assenta.
 */

/**
 * O duplo do `./lazy` — por PROCURAÇÃO, e não uma lista escrita à mão.
 *
 * Este caso monta o back office INTEIRO e percorre a coluna toda, portanto
 * qualquer vista pode ser pedida. Uma lista à mão desactualiza-se em silêncio:
 * a primeira versão deste ficheiro esqueceu o `FechosMeta` (que a vista das
 * Definições traz dentro) e rebentou com «No "FechosMeta" export is defined on
 * the "./lazy" mock» — um erro que não tem nada que ver com o que se mede.
 *
 * O `Proxy` devolve um duplo para o nome que lhe pedirem, e o `WARM_ORDER` (que
 * é um valor e não um componente) fica de fora à mão.
 */
vi.mock("./lazy", () => {
  const duplos = new Map<string, () => React.ReactElement>();
  return new Proxy({} as Record<string, unknown>, {
    get(_alvo, nome) {
      if (typeof nome !== "string" || nome === "then" || nome === "__esModule") return undefined;
      if (nome === "WARM_ORDER") return [];
      if (!duplos.has(nome)) {
        const C = () => <div data-testid={`view-${nome}`}>{nome} stub</div>;
        C.displayName = `Lazy(${nome})`;
        duplos.set(nome, C);
      }
      return duplos.get(nome);
    },
    has: () => true,
  });
});

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));


/** Comentários fora: a prosa desta casa cita o que foi apagado, de propósito. */
function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

// Os comentários saem ficheiro a ficheiro, ANTES de colar: um `/*` dentro de
// uma string de um ficheiro não pode engolir o ficheiro seguinte.
const CODIGO = fonteDe("AdminClient.tsx", semComentarios);

const pedido = (): Quote =>
  ({
    id: "LQ-001",
    submittedAt: "2026-05-01T10:00:00.000Z",
    lastUpdated: "2026-05-01T10:00:00.000Z",
    status: "pendente",
    name: "Ana Marques",
    email: "ana@example.com",
    category: "particulares",
    eventType: "casamentos",
    date: "2026-09-20",
    location: "Évora",
    guests: 80,
  }) as Quote;

function montar() {
  render(
    <ToastProvider>
      <AdminClient initialQuotes={[pedido()]} userName="Catarina" />
    </ToastProvider>,
  );
  return screen.getByRole("complementary");
}

/** O rótulo de um destino, tal como o menu o escreve. */
const rotulo = (id: string) => NAV.find((n) => n.id === id)!.label;

/**
 * Os rótulos dos destinos desenhados na coluna, PELA ORDEM em que lá estão.
 *
 * Lê-se o `<span class="truncate">` de cada botão e não o nome acessível: o
 * «Pedidos» traz atrás o contador dos que faltam responder («Pedidos 1 por
 * responder»), e um `getByRole` com o rótulo exacto não o encontrava. Foi assim
 * que a primeira versão deste caso acusou a coluna de ter perdido um destino
 * que estava lá à frente dela.
 */
function destinosDaColuna(barra: HTMLElement): string[] {
  return [...barra.querySelectorAll("button span.truncate")]
    .map((s) => s.textContent?.trim() ?? "")
    .filter(Boolean);
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, headers: new Headers(), json: async () => [] })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a barra lateral já não dobra nada", () => {
  it("os onze destinos do menu estão no ecrã, sem carregar em nada", () => {
    const esperados = [...CORE_NAV, ...MORE_NAV].map(rotulo);
    // Ordem incluída: os do dia primeiro, o resto do outro lado do fio.
    expect(destinosDaColuna(montar())).toEqual(esperados);
    // E o instrumento está mesmo a contar alguma coisa: se o `NAV` encolher
    // para dois destinos, este caso deixa de provar o que diz que prova.
    expect(esperados.length).toBeGreaterThanOrEqual(10);
  });

  it("e nenhum deles aparece duas vezes", () => {
    // A maneira mais fácil de «mostrar tudo» sem pensar: desenhar a lista
    // completa e esquecer a que já lá estava. Ninguém dá por isso num ecrã
    // alto — e num ecrã baixo é uma coluna que rola para o mesmo sítio.
    const desenhados = destinosDaColuna(montar());
    expect(desenhados.length - new Set(desenhados).size, "destinos desenhados duas vezes").toBe(0);
  });

  it("não há botão «Mais» nenhum na coluna", () => {
    const barra = within(montar());
    expect(barra.queryByRole("button", { name: /^Mais$/ })).toBeNull();
  });

  it("um destino que era secundário abre-se ao primeiro toque", () => {
    // O caso que a dobra custava: chegar aos Temas eram DOIS toques.
    const barra = within(montar());
    fireEvent.click(barra.getByRole("button", { name: rotulo("temas") }));
    expect(screen.getByRole("heading", { level: 1, name: "Temas" })).toBeInTheDocument();
    expect(screen.getByTestId("view-Temas")).toBeInTheDocument();
  });

  it("e continua a marcar o destino activo, incluindo um dos que estavam lá dentro", () => {
    // É o `aria-current="page"` que o filete procura para saber onde assentar.
    // Onde ele PÁRA mede-se num browser (`e2e/admin-views.spec.ts`); que há um
    // destino marcado, e um só, mede-se aqui.
    const barra = within(montar());
    fireEvent.click(barra.getByRole("button", { name: rotulo("estatisticas") }));
    const marcados = barra
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-current") === "page");
    expect(marcados).toHaveLength(1);
    expect(marcados[0].textContent).toContain(rotulo("estatisticas"));
  });
});

describe("e o estado do grupo não ficou pendurado", () => {
  it("o `moreNavOpen` desapareceu do ficheiro", () => {
    expect(CODIGO, "sobrou estado de um grupo que já não existe").not.toMatch(/moreNavOpen/);
    expect(CODIGO, "sobrou a abertura automática do grupo").not.toMatch(/activeInMore/);
  });

  it("e a chave do filete continua a não o pedir", () => {
    /**
     * ── A MEDIDA MUDOU DE SÍTIO, A AFIRMAÇÃO NÃO ──────────────────────────
     *
     * Este caso lia as dependências do efeito que media o filete AQUI. Essa
     * cópia saiu: a barra lateral passou a chamar o `ui/useMarcaQueAnda.ts`, o
     * mesmo gancho do índice do estúdio e do painel «O que vai sair». O que
     * eram as dependências do efeito é hoje a `chave` que se lhe passa, e a
     * afirmação é a mesma: ela pede o destino activo e a gaveta, e mais nada.
     * Uma razão a mais para remedir não dá erro nenhum — só volta a correr por
     * uma razão que já não há, e é por isso que precisa de teste: não se vê.
     */
    expect(CODIGO, "a barra lateral voltou a ter uma cópia da medida").not.toMatch(
      /const activo = coluna\.querySelector/,
    );
    const chamada = CODIGO.match(/useMarcaQueAnda\(([\s\S]*?)\);/);
    expect(chamada, "a barra lateral deixou de chamar o gancho da marca").not.toBeNull();
    const argumentos = chamada![1].split(",").map((a) => a.trim());
    expect(argumentos[0], "o gancho deixou de medir dentro da coluna dos destinos").toBe(
      "colunaDosDestinos",
    );
    expect(argumentos[1], "o gancho deixou de procurar o destino marcado").toContain(
      'aria-current="page"',
    );
    const chave = argumentos[2] ?? "";
    expect(chave).toContain("view");
    expect(chave).toContain("navOpen");
    expect(chave, "sobrou a dobra na chave que manda remedir").not.toContain("moreNavOpen");
  });

  it("num ecrã baixo a gaveta rola INTEIRA, com os destinos antes da conta", () => {
    // Era o `<nav>` que rolava, preso entre o logótipo e o rodapé da conta, para
    // o «Sair» ficar sempre no mesmo sítio. MEDIDO num iPhone 14 com as barras
    // do Safari (390×664, auditoria de 14/11): o `<nav>` ficava com 243 px para
    // 533 de destinos, viam-se 4 dos 10, e a lista acabava num fio que parecia
    // o fim. Os destinos são o que ela vem cá buscar; o rodapé vem a seguir a
    // eles, no mesmo rolo, e num ecrã alto continua colado ao fundo (`mt-auto`).
    // O passeio que o mede é o `e2e/o-iphone-com-barras.spec.ts`.
    // Lê-se a GAVETA, e só ela: o `MenuLateral` com o `RodapeDoMenu` colado no
    // sítio onde é chamado. Na fonte junta do AdminClient o primeiro «Mais
    // destinos» é o ⋯ da barra de baixo (`BarraDeDestinos`), e a ordem entre
    // ficheiros é a alfabética — não diz nada sobre a ordem na gaveta.
    const GAVETA = fonteComposta("_casca/MenuLateral.tsx", semComentarios);
    expect(GAVETA, "o rodapé da conta deixou de ser colado na gaveta").toContain(
      'className="mt-auto shrink-0 px-2.5 pb-5 pt-3',
    );
    const nav = GAVETA.match(/<nav\b[\s\S]{0,300}?aria-label="Mais destinos"[\s\S]{0,300}?className="([^"]+)"/);
    expect(nav, "a lista de destinos da gaveta mudou de forma").not.toBeNull();
    expect(nav![1]).not.toContain("overflow-y-auto");
    expect(nav![1]).not.toContain("flex-1");
    const gaveta = GAVETA.split("\n").find((l) => l.includes("fixed top-0") && l.includes("w-64"));
    expect(gaveta).toContain("overflow-y-auto");
    expect(gaveta).toContain("h-dvh");
    const destinos = GAVETA.indexOf('aria-label="Mais destinos"');
    const conta = GAVETA.indexOf('className="mt-auto shrink-0 px-2.5 pb-5 pt-3');
    expect(destinos, "a lista de destinos saiu da gaveta").toBeGreaterThan(-1);
    expect(conta, "o rodapé da conta deixou de se colar ao fundo").toBeGreaterThan(0);
    expect(conta, "o rodapé da conta passou para antes dos destinos").toBeGreaterThan(destinos);
  });
});
