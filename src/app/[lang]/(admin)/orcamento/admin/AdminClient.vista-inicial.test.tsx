// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import AdminClient, { VIEW_COOKIE } from "./AdminClient";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A APLICAÇÃO SALTAVA SOZINHA DE SECÇÃO AO ARRANCAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO por uma auditoria, em separador limpo: a ~1 s aparecia a Visão Geral
 * (desenhada no servidor), a ~2 s a aplicação trocava SOZINHA para a última
 * secção usada e o menu lateral fechava-se. Quem entrou para ver a Visão Geral
 * via-a desaparecer-lhe da frente.
 *
 * A memória estava no `localStorage`, que só existe depois de a página estar
 * desenhada — portanto a escolha dela só podia ser aplicada como uma CORRECÇÃO,
 * à vista. O cookie é a mesma memória por aparelho, mas viaja com o pedido: o
 * servidor desenha logo o que ela quer ver.
 *
 * O que se prende aqui são as duas metades:
 *  · com a secção já decidida, NÃO há restauração nenhuma a acontecer depois;
 *  · sem ela, a ponte do `localStorage` continua a valer — para quem já tinha
 *    uma escolha guardada e ainda não tem cookie.
 */

vi.mock("./lazy", () => {
  const stub = (name: string) => {
    const C = () => <div data-testid={`view-${name}`}>{name} stub</div>;
    C.displayName = `Lazy(${name})`;
    return C;
  };
  /** Um stub com UM campo de texto local: para provar que sobrevive a uma
   *  troca de separador (não voltaria a estar vazio se tivesse desmontado). */
  const stubComCampo = (name: string, rotulo: string) => {
    const C = () => (
      <div data-testid={`view-${name}`}>
        <label>
          {rotulo}
          <input aria-label={rotulo} defaultValue="" />
        </label>
      </div>
    );
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
    ClientMessenger: stubComCampo("client-messenger", "Rascunho da mensagem"),
    EventChecklist: stub("event-checklist"),
    EventMaterial: stub("event-material"),
    EventTimeline: stub("event-timeline"),
    PaymentsPanel: stub("payments-panel"),
    EventCosts: stub("event-costs"),
    GuestList: stub("guest-list"),
    TagsField: stub("tags-field"),
    FollowUpField: stub("follow-up-field"),
    ActivityLog: stub("activity-log"),
    EventTasks: stubComCampo("event-tasks", "Título da tarefa nova"),
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
    vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => [],
    })),
  );
  return render(
    <ToastProvider>
      <AdminClient initialQuotes={[]} userName="Catarina" {...props} />
    </ToastProvider>,
  );
}

/** O título da secção que está no ecrã. */
const seccao = () => screen.getByRole("heading", { level: 1 }).textContent ?? "";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a secção com que o back office abre", () => {
  it("sem memória nenhuma, abre na Visão Geral", async () => {
    montar();
    await waitFor(() => expect(seccao()).toMatch(/Visão Geral/i));
  });

  /**
   * O CASO QUE FECHA O SALTO. Com a secção já decidida pelo servidor, o
   * `localStorage` NÃO pode voltar a mexer no ecrã — mesmo tendo lá uma escolha
   * diferente e mais antiga. Era essa segunda escrita que se via como salto.
   */
  it("com a secção decidida no servidor, o localStorage não lhe mexe", async () => {
    localStorage.setItem("liquen-admin-view", "temas");
    montar({ vistaInicial: "pedidos" });

    await waitFor(() => expect(seccao()).toMatch(/Pedidos/i));
    // E continua lá depois de os efeitos todos correrem: nada a corrigir à vista.
    await new Promise((r) => setTimeout(r, 50));
    expect(seccao()).toMatch(/Pedidos/i);
    expect(seccao()).not.toMatch(/Temas/i);
  });

  /**
   * A PONTE, para quem já tinha uma escolha guardada e ainda não tem cookie.
   * Aqui o salto ainda existe — uma vez —, e a gravação seguinte escreve o
   * cookie que o faz desaparecer para sempre.
   */
  it("sem cookie ainda, a escolha guardada no aparelho continua a valer", async () => {
    localStorage.setItem("liquen-admin-view", "pedidos");
    montar();
    await waitFor(() => expect(seccao()).toMatch(/Pedidos/i));
  });

  it("e a escolha passa a ficar no cookie, que é o que o servidor lê", async () => {
    montar({ vistaInicial: "pedidos" });
    await waitFor(() => expect(document.cookie).toContain(`${VIEW_COOKIE}=pedidos`));
  });
});
