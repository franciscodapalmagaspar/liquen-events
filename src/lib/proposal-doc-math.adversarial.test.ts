import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_VALID_DAYS,
  resolveProposalMoney,
  resolveValidUntil,
  withProposalDefaults,
  type ProposalDoc,
} from "./proposal-doc";
import { round2, splitThirtySeventy } from "./money";
vi.mock("@/lib/fotos-editoriais-guardadas", () => ({
  lerFotoEditorialGuardada: async () => null,
  guardarFotoEditorial: async () => undefined,
}));
const { renderEditorialPdf } = await import("./pdf-editorial/montar");

/**
 * ADVERSARIAL QA — proposal DOCUMENT generation math.
 *
 * Focus: the internal-consistency invariants the whole proposal→invoice
 * pipeline leans on (resolveProposalMoney → total → splitThirtySeventy),
 * the validity-date guard, and degenerate documents.
 */

type MoneyInput = Parameters<typeof resolveProposalMoney>[0];
const money = (d: Partial<MoneyInput> = {}) => resolveProposalMoney({ totalText: "", ...d });

describe("resolveValidUntil — fractional day counts (guard consistency)", () => {
  const from = new Date("2026-07-20T00:00:00Z");
  const addDays = (d: Date, days: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x.toISOString().slice(0, 10);
  };

  // BUG: a POSITIVE fraction < 1 passes the `> 0` check but floors to 0 days,
  // yielding a SAME-DAY (0-day) validity — even though an integer 0 correctly
  // falls back to the 30-day default. So `validUntilDays: 0.5` produces a
  // SHORTER validity than `validUntilDays: 0`, which is incoherent (and, via
  // /proposta's end-of-day expiry, gives the client only the day of sending).
  it("floors to zero → must fall back to the default, like an integer 0", () => {
    expect(resolveValidUntil({ validUntilDays: 0.5 }, from)).toBe(
      addDays(from, DEFAULT_VALID_DAYS),
    );
    expect(resolveValidUntil({ validUntilDays: 0.9 }, from)).toBe(
      addDays(from, DEFAULT_VALID_DAYS),
    );
  });

  it("still floors a fractional count that is >= 1 day", () => {
    expect(resolveValidUntil({ validUntilDays: 7.9 }, from)).toBe(addDays(from, 7));
    expect(resolveValidUntil({ validUntilDays: 1.99 }, from)).toBe(addDays(from, 1));
  });

  it("keeps the existing zero / negative behaviour (→ default)", () => {
    expect(resolveValidUntil({ validUntilDays: 0 }, from)).toBe(addDays(from, DEFAULT_VALID_DAYS));
    expect(resolveValidUntil({ validUntilDays: -5 }, from)).toBe(addDays(from, DEFAULT_VALID_DAYS));
  });

  it("a fractional day count NEVER yields an already-expired (before-from) date", () => {
    for (const v of [0.01, 0.5, 0.9, 1.1, 29.9]) {
      const out = resolveValidUntil({ validUntilDays: v }, from);
      expect(out >= from.toISOString().slice(0, 10)).toBe(true);
      // and it is never the same day as `from` unless it legitimately floors to
      // a real >=1 day count (it can't: <1 defaults to 30, >=1 adds >=1 day).
      expect(out).not.toBe(from.toISOString().slice(0, 10));
    }
  });
});

describe("resolveProposalMoney — pipeline invariant with splitThirtySeventy", () => {
  // The route stores `total = money.gross` and invoices via splitThirtySeventy(total).
  // Assert the composed invariant holds for awkward cents in BOTH IVA modes:
  //   base + vat === gross   AND   sinal + saldo === gross (to the cent).
  it("gross is always cent-reconcilable and feeds an exact 30/70 split (both modes)", () => {
    const amounts = [0.01, 0.03, 1, 99.99, 100, 777.77, 3000, 12345.67, 100_000_000];
    for (const amount of amounts) {
      for (const mode of ["acrescer", "incluido"] as const) {
        const m = money({ totalAmount: amount, totalVatMode: mode });
        expect(round2(m.base + m.vat)).toBe(m.gross);
        const { sinal, saldo } = splitThirtySeventy(m.gross);
        expect(round2(sinal + saldo)).toBe(m.gross);
        expect(sinal).toBe(round2(sinal));
        expect(saldo).toBe(round2(saldo));
      }
    }
  });

  it("custom (reduced) IVA rates stay coherent and reconcile through the split", () => {
    for (const vatRate of [0, 0.06, 0.13, 0.23]) {
      const m = money({ totalAmount: 4321.09, totalVatMode: "acrescer", vatRate });
      expect(m.vatRate).toBe(vatRate);
      expect(round2(m.base + m.vat)).toBe(m.gross);
      const { sinal, saldo } = splitThirtySeventy(m.gross);
      expect(round2(sinal + saldo)).toBe(m.gross);
    }
  });
});

describe("proposal document — degenerate inputs do not crash the renderer", () => {
  it("renders a maximally-empty doc (no client, no lines, blank total) as a valid PDF", async () => {
    const doc: ProposalDoc = withProposalDefaults({
      template: "decoracao",
      ref: "",
      clientNames: "",
      eventType: "",
      eventDate: "",
      location: "",
      guests: "",
      serviceGroups: [],
      moodBoards: [],
      budgetItems: [],
      totalLabel: "",
      totalText: "",
      coverImages: [],
    });
    const { bytes } = await renderEditorialPdf(doc);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(500);
  });
});
