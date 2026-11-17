import { readFileSync } from "node:fs";
import { STATUS_OPTIONS } from "./_pedidos/estado-do-pedido";
import { describe, expect, it } from "vitest";
import { GLOSSARY, LIFECYCLE } from "./glossario-data";

/**
 * Adversarial / map-closing coverage for the back-office help data
 * (`glossario-data.ts`).
 *
 * This module is *pure, client-safe data* whose whole job is to mirror what
 * the operator sees on screen (see the "Regra de ouro" in the module header).
 * The value here is INVARIANT-locking, not exercising code paths: a duplicate
 * term silently drops a row (React renders on `key={it.term}`), an empty
 * definition renders a blank `<dd>`, and — most importantly — a request status
 * label that has no glossary entry leaves a newcomer with an unexplained badge.
 *
 * These tests pin those invariants so a future edit that breaks the
 * glossary↔UI mapping fails loudly instead of shipping a confusing help panel.
 */

describe("GLOSSARY — internal integrity", () => {
  it("has no duplicate terms (React renders on key={term})", () => {
    const terms = GLOSSARY.map((e) => e.term);
    expect(new Set(terms).size).toBe(terms.length);
  });

  it("every entry has a non-empty, trimmed term", () => {
    for (const e of GLOSSARY) {
      expect(e.term).toBeTruthy();
      expect(e.term).toBe(e.term.trim());
    }
  });

  it("every entry has a non-empty definition (no blank <dd>)", () => {
    for (const e of GLOSSARY) {
      expect(e.def.trim().length).toBeGreaterThan(0);
      // A real definition, not a placeholder — guards a truncated/stub entry.
      expect(e.def.trim().length).toBeGreaterThan(15);
    }
  });
});

describe("LIFECYCLE — internal integrity", () => {
  it("has no duplicate steps (React renders on key={step})", () => {
    const steps = LIFECYCLE.map((s) => s.step);
    expect(new Set(steps).size).toBe(steps.length);
  });

  it("every step has a non-empty name and description", () => {
    expect(LIFECYCLE.length).toBeGreaterThan(0);
    for (const s of LIFECYCLE) {
      expect(s.step.trim().length).toBeGreaterThan(0);
      expect(s.desc.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("map-closing: every request status label is explained in the glossary", () => {
  // Cross-check against the REAL source of truth (STATUS_OPTIONS) rather than
  // a hand-copied list, so renaming a status label without updating the
  // glossary turns this red. It used to be read from the TEXT of AdminClient,
  // where it was trapped and unexported; since phase 7 of the code structure it
  // lives in `_pedidos/estado-do-pedido.tsx` and is imported for real.
  const statusLabels = STATUS_OPTIONS.map((o) => o.label);

  it("finds all six QuoteStatus labels in AdminClient (guards the regex)", () => {
    expect(statusLabels).toEqual([
      "Novo",
      "Aguardar resposta",
      "A preparar proposta",
      "Proposta enviada",
      "Ganho",
      "Perdido",
    ]);
  });

  it("has a glossary entry for each status label", () => {
    const terms = new Set(GLOSSARY.map((e) => e.term));
    for (const label of statusLabels) {
      expect(terms.has(label), `glossary is missing an entry for status "${label}"`).toBe(true);
    }
  });
});

describe("module boundary (client-safe)", () => {
  const src = readFileSync(new URL("./glossario-data.ts", import.meta.url), "utf8");

  it("does not import any server-only *-store module", () => {
    expect(src).not.toMatch(/from\s+["'][^"']*-store["']/);
    expect(src).not.toMatch(/["']server-only["']/);
  });
});
