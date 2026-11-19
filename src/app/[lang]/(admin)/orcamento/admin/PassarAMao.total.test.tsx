// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Faturacao } from "@/lib/orcamento/artigos-de-faturacao";
import { ToastProvider } from "./Toast";
import { CartaoDoTotal } from "./PassarAMao";

/**
 * O cartão «Total 100%» (pedido do Francisco, 19/11): ao lado do Sinal e do
 * Saldo, com os valores por serviço, «Copiar tudo» e «Enviar por WhatsApp» —
 * e SEM nada que crie ou marque uma fatura no Moloni.
 */

const f = {
  fecha: true,
  porqueNaoFecha: [],
  base: 1000,
  bruto: 1230,
  vatRate: 0.23,
  repartido: 1000,
  falta: 0,
  artigos: [
    { artigo: "decoracao", nome: "Decoração", valor: 700 },
    { artigo: "flores", nome: "Flores", valor: 300 },
  ],
} as unknown as Faturacao;

afterEach(cleanup);

describe("o cartão do Total 100%", () => {
  it("mostra o total sem e com IVA, e cada serviço por inteiro", () => {
    render(
      <ToastProvider>
        <CartaoDoTotal f={f} pct={30} cliente="Cliente de teste" nif="123456789" />
      </ToastProvider>,
    );
    expect(screen.getByText("Total 100%")).toBeTruthy();
    expect(screen.getByText(/Com IVA:/).textContent).toMatch(/1\s?230,00/);
    expect(screen.getByRole("button", { name: /Copiar o valor de Decoração/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Copiar o valor de Flores/ })).toBeTruthy();
  });

  it("tem «Copiar tudo» e WhatsApp, e nenhum botão do Moloni", () => {
    render(
      <ToastProvider>
        <CartaoDoTotal f={f} pct={30} />
      </ToastProvider>,
    );
    expect(screen.getByRole("button", { name: "Copiar tudo: Total 100%" })).toBeTruthy();
    expect(screen.getByText(/Enviar por WhatsApp/)).toBeTruthy();
    expect(screen.queryByText(/Já está no Moloni/)).toBeNull();
    expect(screen.queryByText(/Criar rascunho/)).toBeNull();
  });
});
