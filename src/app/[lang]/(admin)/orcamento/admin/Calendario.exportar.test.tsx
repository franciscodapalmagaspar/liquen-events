// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Calendario from "./Calendario";

/**
 * N.º 8 da auditoria de 13/11: o «Exportar calendário…» punha no .ics TODOS os
 * pedidos com data — os perdidos e os ainda por responder também. No calendário
 * do telemóvel dela, esses dias apareciam ocupados.
 */

const resposta = (body: unknown) =>
  ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;

const pedido = (id: string, name: string, status: Quote["status"], extra = {}): Quote =>
  ({
    id,
    name,
    email: "a@b.pt",
    guests: 80,
    status,
    date: "2027-06-12",
    submittedAt: "2026-06-01T10:00:00.000Z",
    ...extra,
  }) as unknown as Quote;

let blobs: Blob[] = [];

beforeEach(() => {
  __resetListCache();
  blobs = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => resposta([])),
  );
  URL.createObjectURL = vi.fn((b: Blob) => {
    blobs.push(b);
    return "blob:ics";
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Calendario — a exportação .ics", () => {
  it("n.º 8: só exporta os dias ocupados — nem perdidos, nem por responder, nem arquivados", async () => {
    render(
      <ToastProvider>
        <Calendario
          quotes={[
            pedido("q1", "Ganho Ana", "aceite"),
            pedido("q2", "Enviada Bia", "cotado"),
            pedido("q3", "Perdido Carla", "rejeitado"),
            pedido("q4", "Novo Duarte", "pendente"),
            pedido("q5", "Arquivado Eva", "aceite", { archived: true }),
          ]}
          onOpen={() => {}}
        />
      </ToastProvider>,
    );
    const [menu] = screen.getAllByRole("button", { name: "Acções de o calendário" });
    fireEvent.click(menu);
    fireEvent.click(await screen.findByRole("menuitem", { name: /Exportar calendário/ }));

    await waitFor(() => expect(blobs).toHaveLength(1));
    const ics = await blobs[0].text();
    expect(ics).toContain("Ganho Ana");
    expect(ics).toContain("Enviada Bia");
    expect(ics).not.toContain("Perdido Carla");
    expect(ics).not.toContain("Novo Duarte");
    expect(ics).not.toContain("Arquivado Eva");
  });
});
