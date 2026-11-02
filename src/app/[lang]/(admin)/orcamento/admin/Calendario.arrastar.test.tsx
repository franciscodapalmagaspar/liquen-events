// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Calendario from "./Calendario";
import type { CalendarEvent } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * FASE 09 DO `docs/APPLE-CALENDARIO.md` — ARRASTAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Arrastar uma marcação para outro dia MOVE-a (PATCH só com a data), com
 * «Anular» que a devolve; com `Alt` DUPLICA-a (POST). O que aconteceu é dito
 * ao leitor de ecrã. Se o servidor recusar, a etiqueta volta à origem.
 */

const REUNIAO: CalendarEvent = {
  id: "EV-1",
  date: "2026-01-09",
  title: "Reunião com a Daniela",
  kind: "reuniao",
  createdAt: "2026-01-01T00:00:00.000Z",
};

type Chamada = { url: string; method: string; body: unknown };

function servidor(opcoes: { patchFalha?: boolean } = {}) {
  const chamadas: Chamada[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      chamadas.push({ url, method, body });
      if (method === "GET") return new Response(JSON.stringify([REUNIAO]), { status: 200 });
      if (method === "PATCH") {
        if (opcoes.patchFalha) return new Response(JSON.stringify({ error: "x" }), { status: 409 });
        return new Response(JSON.stringify({ ...REUNIAO, ...(body as object) }), { status: 200 });
      }
      return new Response(JSON.stringify({ ...REUNIAO, id: "EV-2", ...(body as object) }), {
        status: 200,
      });
    }),
  );
  return chamadas;
}

/** Um `DataTransfer` mínimo: o jsdom não traz um. */
function transferencia() {
  const dados = new Map<string, string>();
  return {
    get types() {
      return [...dados.keys()];
    },
    setData: (t: string, v: string) => void dados.set(t, v),
    getData: (t: string) => dados.get(t) ?? "",
    effectAllowed: "all",
    dropEffect: "none",
  };
}

beforeEach(() => {
  __resetListCache();
  window.localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  process.env.TZ = "Europe/Lisbon";
  vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete process.env.TZ;
  vi.unstubAllGlobals();
});

async function montar() {
  render(
    <ToastProvider>
      <Calendario quotes={[]} onOpen={() => {}} />
    </ToastProvider>,
  );
  await waitFor(() =>
    expect(screen.getAllByLabelText(/Reunião com a Daniela/).length).toBeGreaterThan(0),
  );
}

const etiqueta = () => screen.getAllByLabelText(/Reunião com a Daniela/)[0];
const dia = (iso: string) => document.querySelector<HTMLElement>(`[data-dia="${iso}"]`)!;

function arrastarPara(iso: string, altKey = false) {
  const dt = transferencia();
  fireEvent.dragStart(etiqueta(), { dataTransfer: dt });
  // O jsdom não tem `DragEvent`: o `altKey` passado no init perde-se, e por
  // isso vai escrito à mão no evento.
  for (const tipo of ["dragOver", "drop"] as const) {
    const ev = createEvent[tipo](dia(iso), { dataTransfer: dt });
    Object.defineProperty(ev, "altKey", { value: altKey });
    fireEvent(dia(iso), ev);
  }
  return dt;
}

describe("arrastar uma marcação", () => {
  it("a etiqueta de uma marcação arrasta-se", async () => {
    servidor();
    await montar();
    expect(etiqueta().getAttribute("draggable")).toBe("true");
  });

  it("largar noutro dia MOVE-a: PATCH só com a data, e a etiqueta muda de dia", async () => {
    const chamadas = servidor();
    await montar();
    await act(async () => void arrastarPara("2026-01-12"));
    await waitFor(() =>
      expect(chamadas.find((c) => c.method === "PATCH")).toEqual({
        url: "/api/calendario/EV-1",
        method: "PATCH",
        body: { date: "2026-01-12" },
      }),
    );
    await waitFor(() => expect(dia("2026-01-12").textContent).toContain("Reunião com a Daniela"));
    expect(dia("2026-01-09").textContent).not.toContain("Reunião com a Daniela");
    // O «Anular» e a frase para o leitor de ecrã.
    expect(await screen.findByRole("button", { name: "Anular" })).toBeTruthy();
    expect(screen.getByText(/movido de .* para /)).toBeTruthy();
  });

  it("«Anular» move de volta, pelo mesmo caminho", async () => {
    const chamadas = servidor();
    await montar();
    await act(async () => void arrastarPara("2026-01-12"));
    fireEvent.click(await screen.findByRole("button", { name: "Anular" }));
    await waitFor(() =>
      expect(chamadas.filter((c) => c.method === "PATCH").map((c) => c.body)).toEqual([
        { date: "2026-01-12" },
        { date: "2026-01-09" },
      ]),
    );
  });

  it("com Alt, DUPLICA-a (POST no novo dia) e não mexe na original", async () => {
    const chamadas = servidor();
    await montar();
    await act(async () => void arrastarPara("2026-01-12", true));
    await waitFor(() => expect(chamadas.some((c) => c.method === "POST")).toBe(true));
    expect(chamadas.find((c) => c.method === "POST")?.body).toMatchObject({
      title: "Reunião com a Daniela",
      date: "2026-01-12",
    });
    expect(chamadas.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("se o servidor recusar, a etiqueta volta à origem", async () => {
    servidor({ patchFalha: true });
    await montar();
    await act(async () => void arrastarPara("2026-01-12"));
    await waitFor(() => expect(dia("2026-01-09").textContent).toContain("Reunião com a Daniela"));
    expect(dia("2026-01-12").textContent).not.toContain("Reunião com a Daniela");
  });

  it("largar no mesmo dia não faz nada", async () => {
    const chamadas = servidor();
    await montar();
    await act(async () => void arrastarPara("2026-01-09"));
    expect(chamadas.filter((c) => c.method !== "GET")).toEqual([]);
  });
});
