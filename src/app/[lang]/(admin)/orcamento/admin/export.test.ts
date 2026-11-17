import { describe, it, expect } from "vitest";
import { buildEventIcs } from "./export";
import { toCsv, quotesToCsvRows, paymentsToCsvRows } from "./exportar-em-csv";
import type { Quote } from "@/lib/orcamento/types";

describe("toCsv", () => {
  it("joins cells with ; and rows with CRLF, prefixed by a UTF-8 BOM", () => {
    const out = toCsv([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toBe("﻿a;b\r\nc;d");
  });

  it("quotes cells containing the separator, quotes or newlines", () => {
    const out = toCsv([["plain", "has;semi", 'has"quote', "has\nnewline"]]);
    expect(out).toBe('﻿plain;"has;semi";"has""quote";"has\nnewline"');
  });

  it("renders numbers and empty values", () => {
    expect(toCsv([[1, "", 0]])).toBe("﻿1;;0");
  });
});

describe("quotesToCsvRows", () => {
  const quote = {
    id: "LQ-001",
    submittedAt: "2026-01-15T10:00:00.000Z",
    status: "aceite",
    name: "Maria",
    email: "maria@example.com",
    phone: "910000000",
    company: "ACME",
    nif: "500000000",
    category: "empresas",
    eventType: "conferencias",
    packageTier: "completo",
    guests: 120,
    date: "2026-06-20",
    location: "Lisboa",
    duration: 8,
    quotedPrice: 15000,
    priceBreakdown: { total: 14000 },
  } as unknown as Quote;

  it("returns a header row plus one row per quote", () => {
    const rows = quotesToCsvRows([quote, quote]);
    expect(rows).toHaveLength(3);
    expect(rows[0][0]).toBe("ID");
  });

  it("maps core fields onto the data row", () => {
    const [, row] = quotesToCsvRows([quote]);
    expect(row).toContain("LQ-001");
    expect(row).toContain("Maria");
    expect(row).toContain("maria@example.com");
    expect(row).toContain(120);
    expect(row).toContain(15000);
  });

  it("is safe with missing optional fields", () => {
    const minimal = {
      id: "LQ-002",
      submittedAt: "2026-02-01T10:00:00.000Z",
      status: "pendente",
      name: "Sem Empresa",
      email: "x@y.pt",
      phone: "",
      guests: 0,
    } as unknown as Quote;
    const rows = quotesToCsvRows([minimal]);
    expect(rows).toHaveLength(2);
    // Should not throw and should still produce a valid CSV string.
    expect(typeof toCsv(rows)).toBe("string");
  });
});

describe("buildEventIcs", () => {
  const NOW = new Date("2026-06-10T10:00:00.000Z");
  const quote = {
    id: "LIQ-TEST-0001",
    name: "Ana; Silva, Lda",
    email: "ana@example.com",
    phone: "910000000",
    guests: 80,
    date: "2026-09-12",
    location: "Herdade, Évora",
    category: "particulares",
    eventType: "casamentos",
  } as unknown as Quote;

  it("gera um VEVENT de dia inteiro com DTEND exclusivo (dia seguinte)", () => {
    const ics = buildEventIcs(quote, NOW)!;
    expect(ics).toContain("UID:LIQ-TEST-0001@liquen-events.com");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260912");
    expect(ics).toContain("DTEND;VALUE=DATE:20260913");
    expect(ics).toContain("DTSTAMP:20260610T100000Z");
    // CRLF line endings per RFC 5545; well-formed envelope.
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR")).toBe(true);
  });

  it("eventos multi-dia usam endDate (+1 dia, exclusivo)", () => {
    const ics = buildEventIcs({ ...quote, endDate: "2026-09-14" } as Quote, NOW)!;
    expect(ics).toContain("DTSTART;VALUE=DATE:20260912");
    expect(ics).toContain("DTEND;VALUE=DATE:20260915");
  });

  it("ignora um endDate anterior à data de início", () => {
    const ics = buildEventIcs({ ...quote, endDate: "2026-09-01" } as Quote, NOW)!;
    expect(ics).toContain("DTEND;VALUE=DATE:20260913");
  });

  it("escapa vírgulas e ponto-e-vírgula nos campos de texto (RFC 5545)", () => {
    const ics = buildEventIcs(quote, NOW)!;
    expect(ics).toContain("SUMMARY:Casamentos — Ana\\; Silva\\, Lda");
    expect(ics).toContain("LOCATION:Herdade\\, Évora");
    // Newlines in the description become literal \n sequences.
    expect(ics).toContain("DESCRIPTION:Cliente: Ana\\; Silva\\, Lda\\nTel: 910000000");
  });

  it("devolve null sem data de evento", () => {
    expect(buildEventIcs({ ...quote, date: "" } as Quote, NOW)).toBeNull();
  });
});

describe("paymentsToCsvRows", () => {
  it("flattens payments across quotes, sorted by date, with a header", () => {
    const a = {
      id: "LQ-1",
      name: "A",
      payments: [
        { id: "p2", kind: "saldo", amount: 5000, date: "2026-07-01", paid: false },
        { id: "p1", kind: "sinal", amount: 1000, date: "2026-03-01", paid: true },
      ],
    } as unknown as Quote;
    const b = {
      id: "LQ-2",
      name: "B",
      payments: [{ id: "p3", kind: "pagamento", amount: 2000, date: "2026-05-01", paid: true }],
    } as unknown as Quote;

    const rows = paymentsToCsvRows([a, b]);
    expect(rows[0][0]).toBe("Evento (ID)");
    expect(rows).toHaveLength(4); // header + 3 payments
    // Sorted by date ascending → first data row is the 2026-03-01 sinal.
    expect(rows[1]).toContain("Sinal");
    expect(rows[1]).toContain("Pago");
  });

  it("returns just the header when there are no payments", () => {
    const q = { id: "x", name: "x" } as unknown as Quote;
    expect(paymentsToCsvRows([q])).toHaveLength(1);
  });
});
