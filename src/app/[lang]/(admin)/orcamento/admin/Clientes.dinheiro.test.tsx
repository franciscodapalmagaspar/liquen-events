// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import Clientes from "./Clientes";
import { eur0 as eur } from "@/lib/money";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O «GANHO» DE UM CLIENTE NÃO PODE ESTAR ~23% ABAIXO DE «RECEITA CONTRATADA»
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `totalWon`/`totalPipeline` somavam `q.quotedPrice`, o campo «Preço final
 * (SEM IVA)». A «Receita contratada» das Estatísticas, sobre os mesmos
 * pedidos, vem de `computeEventMetrics().contracted`, sempre COM IVA. Um
 * evento aceite a 20.000 € (+ IVA = 24.600 €) aparecia como «Ganho» 20.000 €
 * — 4.600 € a menos, o IVA inteiro.
 *
 * A correcção usa a MESMA cascata do dossier (`contractedAmounts(q).gross`),
 * já aplicada em `Reminders.tsx`, `PaymentsPanel.tsx`, `Overview.tsx`,
 * `StatsDashboard.tsx` e `Kanban.tsx`.
 */

afterEach(cleanup);

/**
 * `getByText` normaliza o espaço a separar milhares do texto do DOM (o
 * `Intl.NumberFormat` de pt-PT usa um espaço insecável, colapsado pela
 * normalização por omissão da testing-library) mas NÃO normaliza a string
 * passada como critério — comparava sempre um lado normalizado com outro que
 * não estava, e nunca batia certo. Um "matcher" função recebe o texto do nó já
 * normalizado; normalizamos o alvo da mesma forma antes de comparar.
 */
const semEspacos = (s: string) => s.replace(/\s+/g, " ").trim();
const porTexto = (alvo: string) => (conteudo: string) => semEspacos(conteudo) === semEspacos(alvo);

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "q1",
    name: "Ana e Rui",
    email: "ana@exemplo.pt",
    phone: "910000000",
    guests: 100,
    status: "cotado",
    submittedAt: "2026-06-01T10:00:00.000Z",
    ...over,
  }) as unknown as Quote;

describe("Clientes — Ganho e Pipeline são sempre com IVA", () => {
  it("um evento aceite a 20.000 € (sem IVA) mostra 24.600 €, não 20.000 €", () => {
    render(
      <Clientes
        quotes={[pedido({ id: "ganho", status: "aceite", quotedPrice: 20000 })]}
        onOpen={() => {}}
      />,
    );
    // 20 000 x 1,23 = 24 600 — a taxa efectiva por omissão do pedido.
    expect(screen.getByText(porTexto(eur(24600)))).toBeInTheDocument();
    expect(screen.queryByText(porTexto(eur(20000)))).toBeNull();
  });

  it("um cliente em pipeline (proposta enviada, ainda não aceite) também soma com IVA", () => {
    render(
      <Clientes
        quotes={[pedido({ id: "pipeline", status: "cotado", quotedPrice: 10000 })]}
        onOpen={() => {}}
      />,
    );
    // 10 000 x 1,23 = 12 300.
    expect(screen.getByText(porTexto(`${eur(12300)} pipeline`))).toBeInTheDocument();
  });
});
