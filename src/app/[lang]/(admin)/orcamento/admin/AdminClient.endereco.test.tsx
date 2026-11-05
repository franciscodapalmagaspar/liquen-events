// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import AdminClient, { PARAM_VISTA } from "./AdminClient";
import { VIEWS, vistaValida } from "./nav";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BACK OFFICE INTEIRO TINHA UM ENDEREÇO SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Achado F-05 de uma auditoria em produção: dezoito secções e
 * `/orcamento/admin` para todas. Os favoritos não serviam, não se mandava um
 * link a ninguém, o botão «voltar» saía da aplicação em vez de recuar uma
 * secção, e dois separadores em secções diferentes era impossível.
 *
 * O que se prende aqui é o contrato do endereço:
 *
 *   secção → endereço     trocar de secção escreve `?v=`, SEM empilhar
 *   nenhuma → alguma      quem entra a seco fica com o endereço completo
 *   e de mãos limpas      o estado de quem já estava na história fica intacto
 *
 * A quarta metade — o endereço a ganhar ao cookie no PRIMEIRO desenho — vive no
 * servidor (`page.tsx`) e está guardada em `pagina-do-endereco.test.ts`.
 */

vi.mock("./lazy", () => {
  const stub = (name: string) => {
    const C = () => <div data-testid={`view-${name}`}>{name} stub</div>;
    C.displayName = `Lazy(${name})`;
    return C;
  };
  return {
    Overview: stub("overview"),
    Kanban: stub("kanban"),
    Clientes: stub("clientes"),
    Calendario: stub("calendario"),
    Propostas: stub("propostas"),
    Tarefas: stub("tarefas"),
    Fornecedores: stub("fornecedores"),
    StatsDashboard: stub("estatisticas"),
    EmailTemplates: stub("modelos-email"),
    Contratos: stub("contratos"),
    Temas: stub("temas"),
    Inventario: stub("inventario"),
    ProposalStudio: stub("proposal-studio"),
    ProductionPlan: stub("production-plan"),
    ClientMessenger: stub("client-messenger"),
    EventChecklist: stub("event-checklist"),
    EventMaterial: stub("event-material"),
    EventTimeline: stub("event-timeline"),
    PaymentsPanel: stub("payments-panel"),
    EventCosts: stub("event-costs"),
    GuestList: stub("guest-list"),
    TagsField: stub("tags-field"),
    FollowUpField: stub("follow-up-field"),
    ActivityLog: stub("activity-log"),
    EventTasks: stub("event-tasks"),
  };
});

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

function montar(props: Record<string, unknown> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => [] })),
  );
  return render(
    <ToastProvider>
      <AdminClient initialQuotes={[]} userName="Catarina" {...props} />
    </ToastProvider>,
  );
}

const seccao = () => screen.getByRole("heading", { level: 1 }).textContent ?? "";
const noEndereco = () => new URLSearchParams(window.location.search).get(PARAM_VISTA);

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/orcamento/admin");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a secção vive no endereço", () => {
  it("quem entra a seco fica com o endereço completo", async () => {
    montar({ vistaInicial: "pedidos" });
    await waitFor(() => expect(noEndereco()).toBe("pedidos"));
  });

  /**
   * `replaceState` e não `pushState` no primeiro desenho: completar o endereço
   * de quem entrou por `/orcamento/admin` a seco não é uma navegação dela, e
   * uma entrada falsa fazia o «voltar» não sair de onde está à primeira.
   */
  it("e completá-lo NÃO põe uma entrada falsa no histórico", async () => {
    const antes = window.history.length;
    montar({ vistaInicial: "pedidos" });
    await waitFor(() => expect(noEndereco()).toBe("pedidos"));
    expect(window.history.length).toBe(antes);
  });

  it("trocar de secção escreve-a no endereço", async () => {
    montar({ vistaInicial: "overview" });
    await waitFor(() => expect(noEndereco()).toBe("overview"));

    await userEvent.click(screen.getAllByRole("button", { name: /Propostas/i })[0]);
    await waitFor(() => expect(noEndereco()).toBe("propostas"));
    // E o ecrã mudou mesmo — senão isto provava só que o endereço mente bem.
    expect(seccao()).toMatch(/Propostas/i);
  });

  /**
   * ── O QUE ESTE BLOCO DECIDIU NÃO FAZER, E PORQUÊ ──────────────────────────
   *
   * O «voltar» NÃO passa a andar pelas secções, e não é esquecimento: o gesto
   * já tem dono. O `useCamadaDeHistoria` põe uma entrada MARCADA por cada
   * camada aberta para que o deslizar da esquerda no iPhone feche o que está
   * aberto em vez de sair — foi o primeiro dos oito bloqueios do registo do
   * audit.
   *
   * A primeira versão disto empilhava (`pushState`) e escutava o `popstate`.
   * Chumbou dois testes do painel de detalhe: as entradas sem marca entravam no
   * meio das marcadas, e o `back()` ADIADO de uma camada fechada aterrava no
   * teste seguinte e trocava a secção sozinha. O mesmo aconteceria no telemóvel
   * dela.
   *
   * Os dois que se seguem prendem a decisão: substituir, nunca empilhar; e
   * deixar em paz o estado de quem já lá estava.
   */
  it("trocar de secção NÃO empilha entradas no histórico", async () => {
    montar({ vistaInicial: "overview" });
    await waitFor(() => expect(noEndereco()).toBe("overview"));
    const antes = window.history.length;

    await userEvent.click(screen.getAllByRole("button", { name: /Propostas/i })[0]);
    await waitFor(() => expect(noEndereco()).toBe("propostas"));

    expect(window.history.length).toBe(antes);
  });

  /**
   * A marca da camada vive no `history.state`. Escrever `null` ali — que é o
   * que um `replaceState(null, …)` distraído faz — apaga-a, e a camada aberta
   * conclui que foi consumida e fecha-se sozinha. É o acidente que o
   * `useCamadaDeHistoria` descreve vindo do router do Next, e eu quase o
   * repeti.
   */
  it("e não apaga o estado de quem já estava na história", async () => {
    const marca = { liquenCamada: 2, outra: "coisa" };
    window.history.replaceState(marca, "", "/orcamento/admin");

    montar({ vistaInicial: "overview" });
    await waitFor(() => expect(noEndereco()).toBe("overview"));
    expect(window.history.state).toMatchObject(marca);

    await userEvent.click(screen.getAllByRole("button", { name: /Propostas/i })[0]);
    await waitFor(() => expect(noEndereco()).toBe("propostas"));
    expect(window.history.state).toMatchObject(marca);
  });
});

/**
 * A lista de vistas passou a ser um valor porque o endereço e o cookie precisam
 * de a validar em tempo de execução. O `Record<View, true>` de que ela sai
 * OBRIGA a que estejam lá todas — mas só em compilação, e um `as` distraído
 * desliga isso. Estes dois prendem-no também aqui.
 */
describe("as vistas como valor", () => {
  it("cobre as secções que o menu mostra e as que ele esconde", () => {
    // `modelos-email` existe, desenha-se, e está FORA do `NAV` de propósito.
    // Validar contra o menu recusava-a — era esse o defeito.
    expect(VIEWS).toContain("modelos-email");
    expect(VIEWS).toContain("overview");
    expect(VIEWS.length).toBeGreaterThanOrEqual(18);
    expect(new Set(VIEWS).size).toBe(VIEWS.length);
  });

  it("deixa passar o que é vista e recusa o resto", () => {
    for (const v of VIEWS) expect(vistaValida(v)).toBe(v);
    for (const lixo of [
      "",
      "  ",
      "toString",
      "constructor",
      "__proto__",
      "Pedidos",
      null,
      undefined,
    ])
      expect(vistaValida(lixo)).toBeUndefined();
  });
});
