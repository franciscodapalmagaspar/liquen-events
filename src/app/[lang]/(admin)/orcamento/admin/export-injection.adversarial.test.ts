import { describe, it, expect } from "vitest";
import { toCsv, quotesToCsvRows } from "./exportar-em-csv";
import type { Quote } from "@/lib/orcamento/types";

// CSV formula injection (CWE-1236): a cell whose text starts with = + - @ (or a
// leading tab/CR) is interpreted as a FORMULA by Excel / Google Sheets / Numbers
// when the exported file is opened. The admin exports client-supplied data
// (name, message, location, guest names), so a malicious lead like
// `=HYPERLINK("http://evil","click")` or `=1+2` would execute in the admin's
// spreadsheet. The cell escaper must neutralise those — WITHOUT corrupting a
// legitimate numeric amount (a negative number must stay a number).

describe("toCsv formula-injection hardening", () => {
  it("neutralises a string cell that starts with a formula trigger", () => {
    // Prefixed with a quote so the spreadsheet treats it as text, not a formula.
    expect(toCsv([["=1+2"]])).toBe("﻿'=1+2");
    expect(toCsv([["=HYPERLINK(1)"]])).toBe("﻿'=HYPERLINK(1)");
    expect(toCsv([["@SUM(A1)"]])).toBe("﻿'@SUM(A1)");
    expect(toCsv([["\tstartsTab"]])).toBe("﻿'\tstartsTab");
  });

  it("still neutralises a formula trigger that ALSO needs structural quoting", () => {
    // A dangerous leading char AND a separator/quote → guarded then wrapped.
    expect(toCsv([["=cmd;go"]])).toBe('﻿"\'=cmd;go"');
  });

  it("does NOT neutralise a legitimate negative NUMBER amount", () => {
    // Numbers are values, not formulas — a treasury export must keep -100 intact.
    expect(toCsv([[-100]])).toBe("﻿-100");
    expect(toCsv([[0, 12300, -5]])).toBe("﻿0;12300;-5");
  });

  it("leaves a normal string untouched (no over-reach)", () => {
    expect(toCsv([["Ana Silva", "Évora"]])).toBe("﻿Ana Silva;Évora");
  });

  it("guards a malicious client name flowing through quotesToCsvRows", () => {
    const quote = {
      id: "LIQ-1",
      name: "=2+5+cmd|' /C calc'!A0",
      email: "a@example.com",
      status: "pendente",
    } as unknown as Quote;
    const csv = toCsv(quotesToCsvRows([quote]));
    // The raw formula must never appear un-prefixed at a cell boundary.
    expect(csv).not.toMatch(/(^|;|")=2\+5\+cmd/);
    expect(csv).toContain("'=2+5+cmd");
  });
});
