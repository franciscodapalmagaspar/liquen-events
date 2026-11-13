// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import ProductionPlan from "./ProductionPlan";
import EventTimeline from "./EventTimeline";
import EventCosts from "./EventCosts";
import GuestList from "./GuestList";
import TagsField from "./TagsField";
import FollowUpField from "./FollowUpField";
import type {
  ChecklistItem,
  EventSupplier,
  Guest,
  Quote,
  TimelineItem,
} from "@/lib/orcamento/types";
import { PRODUCTION_PHASE_SEP } from "@/lib/production-templates";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * R2a — «ANULAR» EM CADA LISTA DA GAVETA DO PEDIDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Tem que haver no site todo, em tudo aquilo que se faz, uma forma de voltar
 * atrás» (10/10, `docs/TUDO-REVERSIVEL.md`). Cada lista da gaveta grava à sua
 * maneira; o «Anular» é o mesmo em todas (`ui/anular.ts`) e é o gesto ao
 * contrário, gravado como os outros — com a `base` onde a lista a tem.
 */

function reply(status: number, body: unknown = { ok: true }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

/** Os corpos dos PATCH, pela ordem; os GET respondem uma lista vazia. */
let patches: Record<string, unknown>[] = [];
function servidor(respostaPatch: (n: number) => Response = () => reply(200)) {
  patches = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") return reply(200, []);
      patches.push(JSON.parse(String(init?.body ?? "{}")));
      return respostaPatch(patches.length);
    }),
  );
}

const comAviso = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Plano de produção", () => {
  const rotulo = (t: string) => `Sourcing${PRODUCTION_PHASE_SEP}${t}`;
  const PLANO: ChecklistItem[] = [
    { id: "p1", label: rotulo("Encomendar flores"), done: false },
    { id: "p2", label: rotulo("Confirmar vasos"), done: false },
    { id: "p3", label: rotulo("Levar escadote"), done: false },
  ];

  it("remover anula-se, e a tarefa volta ao sítio onde estava", async () => {
    servidor();
    const user = userEvent.setup();
    comAviso(
      <ProductionPlan quote={{ id: "q1", productionPlan: PLANO } as Quote} onChange={() => {}} />,
    );
    await user.click(screen.getAllByRole("button", { name: "Remover tarefa" })[1]);
    expect(await screen.findByText(/«Confirmar vasos» saiu do plano/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Anular" }));
    await waitFor(() => expect(patches.length).toBe(2));
    expect((patches[1].productionPlan as ChecklistItem[]).map((i) => i.id)).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
    expect(await screen.findByText("Anulado.")).toBeTruthy();
  });

  it("quando o plano mudou noutro sítio, o «Anular» não diz «Anulado.»", async () => {
    servidor((n) => (n === 1 ? reply(200) : reply(409, { current: { productionPlan: PLANO } })));
    const user = userEvent.setup();
    comAviso(
      <ProductionPlan quote={{ id: "q1", productionPlan: PLANO } as Quote} onChange={() => {}} />,
    );
    await user.click(screen.getAllByRole("button", { name: "Remover tarefa" })[0]);
    await screen.findByText(/saiu do plano/);
    await user.click(screen.getByRole("button", { name: "Anular" }));
    await waitFor(() => expect(patches.length).toBe(2));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Anulado.")).toBeNull();
  });
});

describe("Guião", () => {
  const GUIAO: TimelineItem[] = [
    { id: "t1", time: "16:00", title: "Cerimónia" },
    { id: "t2", time: "18:00", title: "Jantar" },
  ];

  it("remover um momento anula-se", async () => {
    servidor();
    const user = userEvent.setup();
    comAviso(<EventTimeline quote={{ id: "q1", timeline: GUIAO } as Quote} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Remover 16:00 Cerimónia" }));
    expect(await screen.findByText(/«16:00 Cerimónia» saiu da timeline/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Anular" }));
    await waitFor(() => expect(patches.length).toBe(2));
    expect((patches[1].timeline as TimelineItem[]).map((i) => i.id)).toEqual(["t1", "t2"]);
  });
});

describe("Custos do evento", () => {
  const CUSTOS: EventSupplier[] = [
    { id: "s1", name: "Florista", category: "Flores", estimatedCost: 900, status: "contactado" },
  ];

  it("mudar o estado anula-se com o estado de antes", async () => {
    servidor();
    const user = userEvent.setup();
    comAviso(
      <EventCosts quote={{ id: "q1", eventSuppliers: CUSTOS } as Quote} onChange={() => {}} />,
    );
    await user.click(await screen.findByRole("button", { name: /Contactado/i }));
    await waitFor(() => expect(patches.length).toBe(1));
    expect((patches[0].eventSuppliers as EventSupplier[])[0].status).toBe("confirmado");
    await user.click(await screen.findByRole("button", { name: "Anular" }));
    await waitFor(() => expect(patches.length).toBe(2));
    expect((patches[1].eventSuppliers as EventSupplier[])[0].status).toBe("contactado");
  });

  it("remover anula-se", async () => {
    servidor();
    const user = userEvent.setup();
    comAviso(
      <EventCosts quote={{ id: "q1", eventSuppliers: CUSTOS } as Quote} onChange={() => {}} />,
    );
    await user.click(await screen.findByRole("button", { name: "Remover" }));
    expect(await screen.findByText(/«Florista» saiu dos custos/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Anular" }));
    await waitFor(() => expect(patches.length).toBe(2));
    expect((patches[1].eventSuppliers as EventSupplier[]).map((s) => s.id)).toEqual(["s1"]);
  });
});

describe("Convidados", () => {
  const LISTA: Guest[] = [
    { id: "g1", name: "Família Silva", party: 4, rsvp: "pendente" },
    { id: "g2", name: "Família Costa", party: 2, rsvp: "confirmado" },
  ];

  it("passa a mandar a base, e remover anula-se para o mesmo sítio", async () => {
    servidor();
    const user = userEvent.setup();
    comAviso(<GuestList quote={{ id: "q1", guestList: LISTA } as Quote} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Remover Família Silva" }));
    await waitFor(() => expect(patches.length).toBe(1));
    expect((patches[0].base as { guestList: Guest[] }).guestList.map((g) => g.id)).toEqual([
      "g1",
      "g2",
    ]);
    await user.click(await screen.findByRole("button", { name: "Anular" }));
    await waitFor(() => expect(patches.length).toBe(2));
    expect((patches[1].guestList as Guest[]).map((g) => g.id)).toEqual(["g1", "g2"]);
  });

  it("um 409 adopta a lista do servidor e di-lo — não pisa a da colega", async () => {
    const dela: Guest[] = [{ id: "g9", name: "Família Dela", party: 3, rsvp: "pendente" }];
    servidor(() => reply(409, { current: { guestList: dela } }));
    const user = userEvent.setup();
    comAviso(<GuestList quote={{ id: "q1", guestList: LISTA } as Quote} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Remover Família Silva" }));
    expect(await screen.findByText(/alterada noutro sítio/)).toBeTruthy();
    expect(screen.getByText("Família Dela")).toBeTruthy();
  });
});

describe("Etiquetas e seguimento", () => {
  it("tirar uma etiqueta anula-se", async () => {
    servidor();
    const user = userEvent.setup();
    comAviso(
      <TagsField
        quote={{ id: "q1", name: "Ana", tags: ["VIP", "Quinta"] } as Quote}
        suggestions={[]}
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Remover etiqueta VIP" }));
    await user.click(await screen.findByRole("button", { name: "Anular" }));
    await waitFor(() => expect(patches.length).toBe(2));
    expect(patches[1].tags).toEqual(["Quinta", "VIP"]);
  });

  it("um atalho de seguimento anula-se para a data de antes", async () => {
    servidor();
    const user = userEvent.setup();
    comAviso(
      <FollowUpField
        quote={{ id: "q1", name: "Ana", followUpAt: "2099-01-10" } as Quote}
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "+3 dias" }));
    await user.click(await screen.findByRole("button", { name: "Anular" }));
    await waitFor(() => expect(patches.length).toBe(2));
    expect(patches[1].followUpAt).toBe("2099-01-10");
  });
});
