// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NewQuoteModal from "./NewQuoteModal";
import { ToastProvider } from "./Toast";

/** Achado n.º 31: «Criar pedido» desligado sem dizer porquê, e o Enter não
 *  fazia nada. */
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const abrir = () => {
  const onCreated = vi.fn();
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ quote: { id: "LIQ-1", name: "Ana" } }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  render(
    <ToastProvider>
      <NewQuoteModal open onClose={vi.fn()} onCreated={onCreated} existingQuotes={[]} />
    </ToastProvider>,
  );
  return { onCreated, fetchMock };
};

describe("Novo pedido", () => {
  it("sem nome, «Criar pedido» diz porquê em vez de ficar só cinzento", async () => {
    const { fetchMock } = abrir();
    const user = userEvent.setup();
    const criar = screen.getByRole("button", { name: /Criar pedido/ });
    expect(criar).not.toBeDisabled();
    await user.click(criar);
    expect(await screen.findByText(/Escreve o nome do cliente/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("o Enter num campo cria o pedido", async () => {
    const { onCreated, fetchMock } = abrir();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome/), "Ana{Enter}");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });
});

/**
 * OS CONTACTOS TÊM DE EXISTIR (pedido dela, 30/10: «não deixe enviar emails
 * que não existem ou números de telefone seja qual país for»).
 */
describe("Novo pedido — o email e o telefone", () => {
  it("um telefone que não existe fica no campo, com o erro, e não se cria nada", async () => {
    const { fetchMock } = abrir();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome/), "Ana");
    await user.type(screen.getByLabelText(/^Telefone/), "91234");
    await user.click(screen.getByRole("button", { name: /Criar pedido/ }));
    expect(await screen.findByText("Este número não é válido para Portugal (+351).")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("um telefone válido segue em E.164", async () => {
    const { fetchMock } = abrir();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome/), "Ana");
    await user.type(screen.getByLabelText(/^Telefone/), "912 345 678");
    await user.click(screen.getByRole("button", { name: /Criar pedido/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const corpo = JSON.parse(
      String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    ) as { phone: string };
    expect(corpo.phone).toBe("+351912345678");
  });

  it("a recusa do servidor ao email aparece debaixo do email", async () => {
    const frase =
      "Este email não parece existir: confira o que está depois do @ (por exemplo, gmail.com).";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ error: frase, campo: "email" }) })),
    );
    render(
      <ToastProvider>
        <NewQuoteModal open onClose={vi.fn()} onCreated={vi.fn()} existingQuotes={[]} />
      </ToastProvider>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome/), "Ana");
    await user.type(screen.getByLabelText(/^E-mail/), "ana@gmial.con");
    await user.click(screen.getByRole("button", { name: /Criar pedido/ }));
    await waitFor(() =>
      expect(screen.getByLabelText(/^E-mail/)).toHaveAttribute("aria-invalid", "true"),
    );
    expect(screen.getAllByText(frase).length).toBeGreaterThan(0);
  });
});
