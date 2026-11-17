import { describe, it, expect } from "vitest";
import { quotesToCsvRows, paymentsToCsvRows, guestsToCsvRows } from "./exportar-em-csv";
import type { Quote } from "@/lib/orcamento/types";

/**
 * Adversarial coverage for the CSV DATA ROW BUILDERS in exportar-em-csv.ts.
 * Focus: edge cases the existing happy-path suite (export.test.ts) does not
 * exercise — the untested guestsToCsvRows, missing/undefined optional fields,
 * 0-vs-undefined numeric handling, unknown label-map keys, and the invariant
 * that every header lines up column-for-column with its data rows.
 */

describe("quotesToCsvRows — data-integrity edge cases", () => {
  const base = {
    id: "LQ-1",
    submittedAt: "2026-01-15T10:00:00.000Z",
    status: "aceite",
    name: "Maria",
    email: "maria@x.pt",
    phone: "910000000",
  } as unknown as Quote;

  // REAL BUG (regression): an empty/malformed `submittedAt` made the builder emit
  // the literal string "Invalid Date" (from `new Date("").toLocaleString()`) into
  // the "Data submissão" column — garbage in the export. It must be blank instead.
  it('never emits the literal "Invalid Date" for an empty/malformed submittedAt', () => {
    const empty = { ...base, submittedAt: "" } as Quote;
    const malformed = { ...base, submittedAt: "not-a-date" } as Quote;

    expect(quotesToCsvRows([empty])[1][1]).toBe("");
    expect(quotesToCsvRows([malformed])[1][1]).toBe("");
  });

  it("still formats a valid submittedAt (guard does not swallow good data)", () => {
    const cell = quotesToCsvRows([base])[1][1];
    expect(cell).not.toBe("");
    expect(cell).not.toBe("Invalid Date");
  });

  it("header column count equals every data row's column count", () => {
    const minimal = {
      id: "LQ-2",
      submittedAt: "2026-02-01T10:00:00.000Z",
      status: "pendente",
      name: "N",
      email: "e",
      phone: "",
    } as unknown as Quote;
    const [header, ...rows] = quotesToCsvRows([base, minimal]);
    for (const r of rows) expect(r).toHaveLength(header.length);
  });

  it("preserves numeric 0 (guests/duration/estimate/quoted) instead of blanking it", () => {
    const zeroed = {
      ...base,
      guests: 0,
      duration: 0,
      quotedPrice: 0,
      priceBreakdown: { total: 0 },
    } as unknown as Quote;
    const row = quotesToCsvRows([zeroed])[1];
    // guests(11), duration(14), estimate(15), quoted(16) — all must be 0, not "".
    expect(row[11]).toBe(0);
    expect(row[14]).toBe(0);
    expect(row[15]).toBe(0);
    expect(row[16]).toBe(0);
  });

  it("blanks truly-absent optional numbers (no priceBreakdown / quotedPrice / duration)", () => {
    const row = quotesToCsvRows([base])[1];
    expect(row[14]).toBe(""); // duration
    expect(row[15]).toBe(""); // estimate (no priceBreakdown)
    expect(row[16]).toBe(""); // quoted
  });

  it("falls back to the raw status string for an unknown status (never undefined)", () => {
    const weird = { ...base, status: "arquivado_2026" } as unknown as Quote;
    expect(quotesToCsvRows([weird])[1][2]).toBe("arquivado_2026");
  });
});

describe("paymentsToCsvRows — flattening edge cases", () => {
  it("returns just the header when payments is undefined (no crash)", () => {
    const q = { id: "x", name: "x" } as unknown as Quote;
    expect(paymentsToCsvRows([q])).toHaveLength(1);
  });

  it("header column count equals every payment row's column count", () => {
    const q = {
      id: "q1",
      name: "Cliente",
      payments: [{ id: "p", kind: "sinal", amount: 100, date: "2026-01-01", paid: true }],
    } as unknown as Quote;
    const [header, ...rows] = paymentsToCsvRows([q]);
    for (const r of rows) expect(r).toHaveLength(header.length);
  });

  it("preserves a 0 amount instead of blanking it", () => {
    const q = {
      id: "q1",
      name: "C",
      payments: [{ id: "p", kind: "sinal", amount: 0, date: "2026-01-01", paid: false }],
    } as unknown as Quote;
    expect(paymentsToCsvRows([q])[1][3]).toBe(0);
  });

  it("flattens across multiple quotes and sorts by date ascending", () => {
    const a = {
      id: "A",
      name: "A",
      payments: [{ id: "p1", kind: "saldo", amount: 5000, date: "2026-07-01", paid: false }],
    } as unknown as Quote;
    const b = {
      id: "B",
      name: "B",
      payments: [{ id: "p2", kind: "sinal", amount: 1000, date: "2026-03-01", paid: true }],
    } as unknown as Quote;
    const rows = paymentsToCsvRows([a, b]);
    expect(rows).toHaveLength(3); // header + 2 payments
    expect(rows[1][4]).toBe("2026-03-01"); // earlier date first
    expect(rows[2][4]).toBe("2026-07-01");
  });
});

describe("guestsToCsvRows — UNTESTED builder", () => {
  it("returns just the header for an empty / undefined guest list", () => {
    const none = { id: "g", name: "n" } as unknown as Quote;
    const empty = { id: "g", name: "n", guestList: [] } as unknown as Quote;
    expect(guestsToCsvRows(none)).toHaveLength(1);
    expect(guestsToCsvRows(empty)).toHaveLength(1);
  });

  it("header column count equals every guest row's column count", () => {
    const q = {
      id: "g",
      guestList: [{ id: "1", name: "Ana", party: 2, rsvp: "confirmado" }],
    } as unknown as Quote;
    const [header, ...rows] = guestsToCsvRows(q);
    for (const r of rows) expect(r).toHaveLength(header.length);
  });

  it("defaults a missing party to 1 but preserves an explicit 0", () => {
    const q = {
      id: "g",
      guestList: [
        { id: "1", name: "Sem party", rsvp: "confirmado" },
        { id: "2", name: "Zero party", party: 0, rsvp: "confirmado" },
      ],
    } as unknown as Quote;
    const rows = guestsToCsvRows(q);
    expect(rows[1][1]).toBe(1); // undefined party → 1
    expect(rows[2][1]).toBe(0); // explicit 0 preserved
  });

  it("maps known RSVP codes and falls back to the raw code for an unknown one", () => {
    const q = {
      id: "g",
      guestList: [
        { id: "1", name: "A", party: 1, rsvp: "confirmado" },
        { id: "2", name: "B", party: 1, rsvp: "talvez" },
      ],
    } as unknown as Quote;
    const rows = guestsToCsvRows(q);
    expect(rows[1][2]).toBe("Confirmado");
    expect(rows[2][2]).toBe("talvez"); // unknown code, never "undefined"
  });
});
