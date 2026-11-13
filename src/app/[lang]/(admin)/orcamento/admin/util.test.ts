import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomId, eur, eur2, eventCountdown, isDateKey, parseMoney, todayKey } from "./util";

/**
 * Adversarial coverage for the admin shared-helper module `util.ts`.
 *
 * These helpers back many admin screens, so we hammer boundaries, malformed
 * input, locale/timezone edges and rounding rather than happy paths.
 *
 * pt-PT currency strings separate the amount from "€" with a non-breaking
 * space (U+00A0). Normalise all whitespace before comparing so the assertions
 * stay readable and robust across ICU builds.
 */
const norm = (s: string): string => s.replace(/\s/g, " ");

describe("randomId", () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O DEFEITO QUE ESTES TESTES DOCUMENTAVAM ESTÁ RESOLVIDO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Este bloco fixava a implementação antiga —
   * `Math.random().toString(36).slice(2, 10)` — e um dos testes chamava-se
   * «PINNED (edge): Math.random() === 0 yields an EMPTY id», com a nota de que
   * ficava assim "to avoid altering the id algorithm".
   *
   * O algoritmo foi alterado, por outra razão: o CodeQL assinalou o
   * `Math.random()` a gerar identificadores. O `randomId` passou a chamar o
   * `idCurto()` (ver `src/lib/id-unico.ts`), e com isso **os dois defeitos que
   * estavam pendentes desapareceram**: já não há id vazio, nem ids de
   * comprimento variável conforme a sorte da fracção.
   *
   * Por isso estes testes deixaram de fixar a aritmética do `Math.random` e
   * passaram a fixar o que a função PROMETE a quem a usa.
   */
  it("devolve sempre uma string não vazia", () => {
    for (let i = 0; i < 500; i++) {
      const id = randomId();
      expect(typeof id).toBe("string");
      expect(id, "um id vazio colide com todos os outros ids vazios").not.toBe("");
    }
  });

  it("é curto e usa só o alfabeto seguro para um `id` de HTML", () => {
    for (let i = 0; i < 200; i++) {
      const id = randomId();
      expect(id.length).toBeLessThanOrEqual(10);
      expect(id).toMatch(/^[0-9a-z]+$/);
    }
  });

  /** É para isto que serve: distinguir itens de uma lista uns dos outros. */
  it("não se repete", () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 2000; i++) vistos.add(randomId());
    expect(vistos.size).toBe(2000);
  });

  /**
   * A prova de que o defeito antigo não pode voltar por uma porta lateral: nem
   * com o `Math.random` preso a zero — que era o caso que dava "" — o id sai
   * vazio, porque o `Math.random` deixou de estar no caminho.
   */
  it("não depende do Math.random", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const a = randomId();
    const b = randomId();
    expect(a).not.toBe("");
    expect(a).not.toBe(b);
  });
});

describe("eur (0-decimal formatter, re-exported from money.eur0)", () => {
  it("formats whole euros with no decimal part", () => {
    expect(norm(eur(50))).toBe("50 €");
    expect(norm(eur(0))).toBe("0 €");
  });

  it("rounds to the nearest whole euro (half rounds up)", () => {
    expect(norm(eur(1.5))).toBe("2 €");
    expect(norm(eur(1.4))).toBe("1 €");
    expect(norm(eur(0.4))).toBe("0 €");
  });

  it("coerces falsy/NaN/undefined amounts to 0 (via `n || 0`)", () => {
    expect(norm(eur(NaN))).toBe("0 €");
    expect(norm(eur(undefined as unknown as number))).toBe("0 €");
    expect(norm(eur(null as unknown as number))).toBe("0 €");
    expect(norm(eur(0))).toBe("0 €");
  });

  it("keeps the sign for negative amounts", () => {
    expect(norm(eur(-50))).toContain("-50");
    expect(norm(eur(-50))).toContain("€");
  });

  it("handles huge magnitudes without throwing", () => {
    const out = norm(eur(1_000_000_000));
    expect(out).toContain("€");
    // no decimal comma in the 0-decimal formatter
    expect(out).not.toContain(",");
  });

  it("NOTE: `n || 0` maps -0 and even a legitimate 0 the same — and would also swallow a real 0 total (documented, intended by money.ts)", () => {
    expect(norm(eur(-0))).toBe("0 €");
  });
});

describe("eur2 (2-decimal formatter, re-exported from money.eur)", () => {
  it("always shows two decimal places with a comma separator", () => {
    expect(norm(eur2(50))).toBe("50,00 €");
    expect(norm(eur2(1.5))).toBe("1,50 €");
    expect(norm(eur2(0))).toBe("0,00 €");
  });

  it("coerces NaN/undefined/null to 0,00", () => {
    expect(norm(eur2(NaN))).toBe("0,00 €");
    expect(norm(eur2(undefined as unknown as number))).toBe("0,00 €");
    expect(norm(eur2(null as unknown as number))).toBe("0,00 €");
  });

  it("keeps the sign for negatives and stays 2dp", () => {
    expect(norm(eur2(-50))).toBe("-50,00 €");
  });

  it("differs from the 0-decimal `eur` for the same amount (guards the eur/eur2 alias swap)", () => {
    // util re-maps money.eur0 -> `eur` and money.eur -> `eur2`; this pins the
    // swap so a future re-export edit that flips them is caught.
    expect(norm(eur(1.5))).toBe("2 €"); // 0 decimals
    expect(norm(eur2(1.5))).toBe("1,50 €"); // 2 decimals
    expect(eur(1.5)).not.toBe(eur2(1.5));
  });
});

describe("eventCountdown", () => {
  // Pin the clock so `new Date()` / toISOString() are deterministic. Env TZ may
  // vary, but the helper compares LOCAL-noon to LOCAL-noon and Math.round()s
  // whole days, so day counts are stable regardless of DST/offset.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T09:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // helper: date N days from the pinned "today" (2026-07-20)
  const dayOffset = (n: number): string => {
    const d = new Date("2026-07-20T12:00:00.000Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  it("returns null when no date is given", () => {
    expect(eventCountdown()).toBeNull();
    expect(eventCountdown(undefined)).toBeNull();
    expect(eventCountdown("")).toBeNull();
  });

  it("labels the event day itself as Hoje/today", () => {
    expect(eventCountdown("2026-07-20")).toEqual({ label: "Hoje", tone: "today" });
  });

  it("labels tomorrow as Amanhã/soon", () => {
    expect(eventCountdown(dayOffset(1))).toEqual({ label: "Amanhã", tone: "soon" });
  });

  it("uses 'faltam N dias'/soon for 2..7 days out", () => {
    expect(eventCountdown(dayOffset(2))).toEqual({ label: "faltam 2 dias", tone: "soon" });
    expect(eventCountdown(dayOffset(7))).toEqual({ label: "faltam 7 dias", tone: "soon" });
  });

  it("switches soon -> future at the 8-day boundary (still 'dias')", () => {
    expect(eventCountdown(dayOffset(8))).toEqual({ label: "faltam 8 dias", tone: "future" });
    expect(eventCountdown(dayOffset(30))).toEqual({ label: "faltam 30 dias", tone: "future" });
  });

  it("switches 'dias' -> 'semanas' after 30 days, always plural (never 'semana')", () => {
    // 31 days -> round(31/7) = 4 weeks (min in this branch is 4, so never singular)
    expect(eventCountdown(dayOffset(31))).toEqual({ label: "faltam 4 semanas", tone: "future" });
    expect(eventCountdown(dayOffset(90))).toEqual({ label: "faltam 13 semanas", tone: "future" });
  });

  it("switches 'semanas' -> 'meses' after 90 days, always plural (never 'mês')", () => {
    // 91 days -> round(91/30) = 3 months (min in this branch is 3)
    expect(eventCountdown(dayOffset(91))).toEqual({ label: "faltam 3 meses", tone: "future" });
    expect(eventCountdown(dayOffset(365))).toEqual({ label: "faltam 12 meses", tone: "future" });
  });

  it("handles very-far-future dates", () => {
    const r = eventCountdown(dayOffset(1000));
    expect(r?.tone).toBe("future");
    expect(r?.label).toBe("faltam 3 anos");
  });

  it("passa de 'meses' a 'anos' acima de 24 meses (o «faltam 884 meses» de um pedido de 2099)", () => {
    expect(eventCountdown(dayOffset(720))).toEqual({ label: "faltam 24 meses", tone: "future" });
    expect(eventCountdown(dayOffset(750))).toEqual({ label: "faltam 2 anos", tone: "future" });
    expect(eventCountdown(dayOffset(26_507))).toEqual({ label: "faltam 73 anos", tone: "future" });
  });

  it("uses singular 'dia' for exactly one day past", () => {
    expect(eventCountdown(dayOffset(-1))).toEqual({ label: "há 1 dia", tone: "past" });
  });

  it("uses plural 'dias' for multiple days past", () => {
    expect(eventCountdown(dayOffset(-2))).toEqual({ label: "há 2 dias", tone: "past" });
    expect(eventCountdown(dayOffset(-400))).toEqual({ label: "há 400 dias", tone: "past" });
  });

  it("counts whole days regardless of the time component in 'today' (noon anchoring)", () => {
    // Move the clock late in the UTC day; the event is still 'tomorrow'.
    vi.setSystemTime(new Date("2026-07-20T23:30:00.000Z"));
    expect(eventCountdown("2026-07-21")).toEqual({ label: "Amanhã", tone: "soon" });
  });

  it("BUG-GUARD: malformed date strings return null (not 'faltam NaN meses')", () => {
    expect(eventCountdown("nao-e-data")).toBeNull();
    expect(eventCountdown("2026-13-99")).toBeNull();
    expect(eventCountdown("garbage")).toBeNull();
  });

  it("BUG-GUARD: a full ISO datetime (has its own time part) is rejected as null, not NaN", () => {
    // `date + "T12:00:00"` -> "...T15:30:00ZT12:00:00" -> Invalid Date -> NaN.
    expect(eventCountdown("2026-08-20T15:30:00Z")).toBeNull();
  });
});

describe("parseMoney", () => {
  it("parses plain integers and dot-decimals", () => {
    expect(parseMoney("1500")).toBe(1500);
    expect(parseMoney("12.5")).toBe(12.5);
    expect(parseMoney("12.50")).toBe(12.5);
  });

  it("BUG-GUARD: pt-PT thousands dot — '1.500' is 1500 €, never 1.5 €", () => {
    // parseFloat("1.500") === 1.5 silently corrupted quoted prices/payments.
    expect(parseMoney("1.500")).toBe(1500);
    expect(parseMoney("12.500")).toBe(12500);
    expect(parseMoney("1.234.567")).toBe(1234567);
  });

  it("BUG-GUARD (5/11): uma vírgula seguida de três algarismos é de milhares — '4,323' é 4323 €", () => {
    // Um casamento aceite por 4.323 € + IVA ficou com 4,323 € no «valor
    // combinado», e o painel de Pagamentos pedia 5,32 €.
    expect(parseMoney("4,323")).toBe(4323);
    expect(parseMoney("12,500")).toBe(12500);
    expect(parseMoney("1,234,567")).toBe(1234567);
    // Com um zero à frente continua a ser decimal.
    expect(parseMoney("0,500")).toBe(0.5);
  });

  it("accepts the pt-PT decimal comma", () => {
    expect(parseMoney("1500,50")).toBe(1500.5);
    expect(parseMoney("0,99")).toBe(0.99);
  });

  it("handles mixed thousands+decimal ('1.500,50')", () => {
    expect(parseMoney("1.500,50")).toBe(1500.5);
  });

  it("tolerates spaces and the € sign", () => {
    expect(parseMoney(" 1 500,50 € ")).toBe(1500.5);
    expect(parseMoney("€1500")).toBe(1500);
  });

  it("returns undefined for empty or garbage", () => {
    expect(parseMoney("")).toBeUndefined();
    expect(parseMoney("   ")).toBeUndefined();
    expect(parseMoney("abc")).toBeUndefined();
    expect(parseMoney("1,2,3")).toBeUndefined();
  });
});

describe("isDateKey", () => {
  it("accepts a strict YYYY-MM-DD calendar date", () => {
    expect(isDateKey("2026-07-22")).toBe(true);
    expect(isDateKey("2026-01-01")).toBe(true);
  });

  it("rejects free-form text the schema allows (the calendar-crash guard)", () => {
    // These are exactly the values that reach `new Date(x).toISOString()` and
    // used to throw a RangeError out of the calendar's `byDay` memo.
    expect(isDateKey("a definir")).toBe(false);
    expect(isDateKey("brevemente")).toBe(false);
    expect(isDateKey("")).toBe(false);
  });

  it("rejects undefined/null (narrows the optional Quote.date type)", () => {
    expect(isDateKey(undefined)).toBe(false);
    expect(isDateKey(null)).toBe(false);
  });

  it("rejects a full ISO datetime and other near-misses", () => {
    expect(isDateKey("2026-07-22T12:00:00Z")).toBe(false);
    expect(isDateKey("2026-7-2")).toBe(false);
    expect(isDateKey("22-07-2026")).toBe(false);
  });
});

describe("todayKey", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns today's LOCAL date as YYYY-MM-DD, not the UTC one", () => {
    // 23:30 UTC on the 22nd is already the 23rd in any positive-offset zone.
    // The old `new Date().toISOString().slice(0,10)` returned the UTC day and
    // shifted "today"/overdue by one near midnight; todayKey uses local parts.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T23:30:00.000Z"));
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const expected = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    expect(todayKey()).toBe(expected);
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("is itself a valid date key", () => {
    expect(isDateKey(todayKey())).toBe(true);
  });
});

describe("module boundary (client-safe)", () => {
  const src = readFileSync(new URL("./util.ts", import.meta.url), "utf8");

  it("does not import any server-only *-store module", () => {
    expect(src).not.toMatch(/from\s+["'][^"']*-store["']/);
    expect(src).not.toMatch(/["']server-only["']/);
  });

  it("sources euro formatting from the single money helper", () => {
    expect(src).toMatch(/from\s+["']@\/lib\/money["']/);
  });
});

describe("diasDesde / diasEntreDias", () => {
  it("contam entre DIAS: o mesmo dia dá zero, seja a que hora for", async () => {
    const { diasDesde, diasEntreDias } = await import("./util");
    expect(diasDesde("2026-10-09T00:05:00", "2026-10-09")).toBe(0);
    expect(diasDesde("2026-10-09T23:55:00", "2026-10-09")).toBe(0);
    expect(diasDesde("2026-10-07T23:55:00", "2026-10-09")).toBe(2);
    expect(diasEntreDias("2026-10-09", "2026-10-23")).toBe(14);
    expect(diasEntreDias("2026-10-09", "2026-10-08")).toBe(-1);
  });

  it("atravessam a mudança da hora sem perder um dia", async () => {
    const { diasEntreDias } = await import("./util");
    expect(diasEntreDias("2026-10-24", "2026-10-26")).toBe(2);
    expect(diasEntreDias("2026-03-28", "2026-03-30")).toBe(2);
  });
});
