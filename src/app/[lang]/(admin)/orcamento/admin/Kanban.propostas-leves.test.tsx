// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import Kanban from "./Kanban";
import { __resetListCache, prefetchList } from "./useCachedList";

/**
 * 2.ª revisão de 14/11: mover um cartão para «Ganho»/«Perdido» (e anular)
 * muda a proposta no servidor. A lista leve de propostas — de onde a fase do
 * pedido lê o total — tem de se reler DEPOIS de o PATCH acabar, com o pedido
 * aberto ou não. Uma leitura por gesto.
 */

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "LIQ-1",
    name: "Ana e João",
    email: "ana@exemplo.pt",
    phone: "",
    company: "",
    guests: 100,
    date: "2027-06-12",
    location: "Évora",
    notes: "",
    category: "particulares",
    eventType: "casamentos",
    submittedAt: "2026-01-10T10:00:00.000Z",
    status: "cotado",
    ...over,
  }) as unknown as Quote;

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  }) as unknown as Response;

let ordem: string[] = [];
let soltarPatch: (() => void) | null = null;

beforeEach(async () => {
  __resetListCache();
  ordem = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/propostas?semDoc=1") {
        ordem.push("ler-propostas");
        return reply(200, []);
      }
      ordem.push("patch-inicio");
      if (soltarPatch === null) await new Promise<void>((r) => (soltarPatch = r));
      ordem.push("patch-fim");
      const corpo = JSON.parse(String(init?.body ?? "{}"));
      return reply(200, { ...pedido(), status: corpo.status });
    }),
  );
  // A lista leve já está em cache (o aquecimento em ociosidade).
  prefetchList("propostas-leves", "/api/propostas?semDoc=1");
  await waitFor(() => expect(ordem).toEqual(["ler-propostas"]));
  ordem = [];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  soltarPatch = null;
});

describe("Kanban — a lista leve de propostas relê-se depois do PATCH", () => {
  it("mover e anular: uma leitura depois de cada PATCH acabar, nunca antes", async () => {
    render(
      <ToastProvider>
        <Kanban quotes={[pedido()]} onOpen={() => {}} onStatusChange={() => {}} userName="Rita" />
      </ToastProvider>,
    );
    const cartao = screen.getByRole("button", { name: /^Ana e João,/ });
    cartao.focus();
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(ordem).toEqual(["patch-inicio"]));
    soltarPatch!();
    await waitFor(() => expect(ordem).toEqual(["patch-inicio", "patch-fim", "ler-propostas"]));

    await userEvent.click(await screen.findByRole("button", { name: "Anular" }));
    await waitFor(() =>
      expect(ordem).toEqual([
        "patch-inicio",
        "patch-fim",
        "ler-propostas",
        "patch-inicio",
        "patch-fim",
        "ler-propostas",
      ]),
    );
  });
});
