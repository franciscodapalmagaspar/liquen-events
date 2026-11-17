// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { CalendarEvent } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Calendario from "./Calendario";
import Contratos from "./Contratos";
import Fornecedores from "./Fornecedores";
import Material from "./Material";
import Temas from "./Temas";
import type { PedidoDaPaleta } from "./procura-em-tudo";

/**
 * Cada vista serve o pedido da paleta (BO 4) pela navegação que já tinha: o
 * Calendário vai ao dia da marcação e abre o detalhe dela (ou o «Novo no
 * calendário»); as vistas sem detalhe próprio abrem filtradas pelo nome.
 */

const PROVA: CalendarEvent = {
  id: "e9",
  // Num mês que NÃO é o de hoje: o Calendário tem de ir lá.
  date: `${new Date().getFullYear() + 1}-03-12`,
  title: "TESTE Prova do menu",
  kind: "reuniao",
  time: "15:30",
  createdAt: "2026-08-01T09:00:00.000Z",
};

const resposta = (body: unknown) =>
  ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;

let corpoDe: (url: string) => unknown = () => [];

beforeEach(() => {
  __resetListCache();
  corpoDe = () => [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => resposta(corpoDe(String(url)))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const comAvisos = (ui: React.ReactNode) => render(<ToastProvider>{ui}</ToastProvider>);

describe("Calendário", () => {
  it("abre a marcação pedida no dia dela, noutro mês", async () => {
    corpoDe = (u) => (u.startsWith("/api/calendario") ? [PROVA] : []);
    const pedido: PedidoDaPaleta = { id: "e9" };
    comAvisos(<Calendario quotes={[]} onOpen={() => {}} pedidoDaPaleta={pedido} />);
    expect(await screen.findByRole("dialog", { name: /TESTE Prova do menu/ })).toBeTruthy();
  });

  it("«Novo evento» abre o «Novo no calendário» para hoje", async () => {
    comAvisos(<Calendario quotes={[]} onOpen={() => {}} pedidoDaPaleta={{ novo: true }} />);
    expect(await screen.findByRole("dialog", { name: /Adicionar ao calendário/ })).toBeTruthy();
  });

  it("o mesmo pedido não volta a abrir quando a vista remonta", async () => {
    corpoDe = (u) => (u.startsWith("/api/calendario") ? [PROVA] : []);
    const pedido: PedidoDaPaleta = { id: "e9" };
    const { unmount } = comAvisos(
      <Calendario quotes={[]} onOpen={() => {}} pedidoDaPaleta={pedido} />,
    );
    await screen.findByRole("dialog", { name: /TESTE Prova do menu/ });
    unmount();
    comAvisos(<Calendario quotes={[]} onOpen={() => {}} pedidoDaPaleta={pedido} />);
    await screen.findByLabelText(/Mês|calendário/i).catch(() => null);
    expect(screen.queryByRole("dialog", { name: /TESTE Prova do menu/ })).toBeNull();
  });
});

describe("as vistas que abrem filtradas", () => {
  it("Contratos: a procura fica com o nome do cliente", async () => {
    comAvisos(<Contratos pedidoDaPaleta={{ procura: "Ana Marques" }} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Procurar contratos")).toHaveValue("Ana Marques"),
    );
  });

  it("Fornecedores: a procura fica com o nome", async () => {
    corpoDe = (u) =>
      u.startsWith("/api/fornecedores")
        ? [{ id: "s1", name: "Flores do Sado", category: "Florista", createdAt: "" }]
        : [];
    comAvisos(<Fornecedores pedidoDaPaleta={{ procura: "Flores do Sado" }} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Procurar fornecedores")).toHaveValue("Flores do Sado"),
    );
  });

  it("Material: vai ao catálogo e procura lá", async () => {
    corpoDe = (u) =>
      u.startsWith("/api/material")
        ? [
            {
              id: "m1",
              name: "Escadote grande",
              category: "Ferramentas",
              kind: "reutilizavel",
              stock: 1,
            },
          ]
        : [];
    comAvisos(<Material pedidoDaPaleta={{ procura: "Escadote grande" }} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Procurar material")).toHaveValue("Escadote grande"),
    );
  });
});

describe("Temas", () => {
  it("abre a pasta do tema pedido", async () => {
    const T0 = "2026-01-01T00:00:00.000Z";
    corpoDe = (u) => {
      if (u.startsWith("/api/temas/uso")) return { usos: {} };
      if (u.startsWith("/api/temas/t1/imagens")) return { images: [], total: 0 };
      if (u.startsWith("/api/temas"))
        return [
          { id: "t1", name: "Terracotta", notes: "", createdAt: T0, updatedAt: T0, imageCount: 0 },
        ];
      return [];
    };
    comAvisos(<Temas pedidoDaPaleta={{ id: "t1" }} />);
    // A pasta aberta é a que tem o botão de carregar fotos.
    expect(await screen.findByRole("button", { name: "Adicionar fotos" })).toBeTruthy();
  });
});
