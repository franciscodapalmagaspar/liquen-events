import { idCurto } from "@/lib/id-unico";

/** Small client-side id generator for checklist/payment items. */
export function randomId(): string {
  return idCurto();
}

/**
 * Today's calendar day as a LOCAL `YYYY-MM-DD` key. Never derive "today" from
 * `new Date().toISOString()` — that is UTC, so around midnight it lands on the
 * wrong day for anyone east/west of UTC (e.g. Portugal in summer, UTC+1). Same
 * reasoning as `eventCountdown` below.
 */
export function todayKey(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A chave do dia LOCAL de um instante («aaaa-mm-dd»), como o `todayKey`. */
export function chaveDoDia(instante: string | number | Date): string {
  const d = new Date(instante);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Quantos dias passaram desde um instante até ao dia `hoje` — contados entre
 * DIAS e não entre instantes.
 *
 * `floor((Date.now() − instante) / dia)` mudava de valor à hora a que cada
 * pedido tinha entrado, e não à meia-noite; e lido no desenho (o
 * `react-hooks/purity` apanhava-o em cinco sítios) dava um valor diferente a
 * cada desenho e desfazia os `memo()`. Com o `hoje` vindo de fora, o mesmo dia
 * dá sempre o mesmo número.
 */
export function diasDesde(instante: string, hoje: string = todayKey()): number {
  return diasEntreDias(chaveDoDia(instante), hoje);
}

/** Dias de um dia «aaaa-mm-dd» a outro (negativo se `ate` vem antes). */
export function diasEntreDias(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00`) - Date.parse(`${de}T12:00:00`)) / 86400000);
}

/**
 * Parse money typed by a pt-PT hand into a number of euros.
 *
 * `parseFloat` alone corrupts local habits: "1.500" (thousands dot) becomes
 * 1.5 € and "1500,50" (decimal comma) fails inside `type="number"` inputs.
 * Rules here: comma is the decimal separator; a dot followed by exactly three
 * digits (and not a 1–2-digit decimal tail) is a thousands separator.
 * Returns undefined for an empty or unparseable value.
 */
export function parseMoney(s: string): number | undefined {
  let t = s.replace(/\s|€/g, "");
  if (!t) return undefined;
  const hasComma = t.includes(",");
  const hasDot = t.includes(".");
  if (hasComma && hasDot) {
    // "1.500,50" — dots are thousands, comma is the decimal.
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && /^[1-9]\d{0,2}(,\d{3})+$/.test(t)) {
    // "4,323" / "1,234,567" — vírgulas de milhares, à inglesa. Um valor em
    // euros não tem três casas decimais: «4,323» é 4.323 €, nunca 4,32 €.
    // Foi assim (5/11) que um casamento aceite por 4.323 € + IVA ficou com
    // 4,323 € no «valor combinado» e o painel de Pagamentos pediu 5,32 €.
    // Um zero à frente («0,500») continua a ser decimal: 0,50 €.
    t = t.replace(/,/g, "");
  } else if (hasComma) {
    // "1500,50"
    t = t.replace(",", ".");
  } else if (hasDot && /\.\d{3}(\.|$)/.test(t) && !/\.\d{1,2}$/.test(t)) {
    // "1.500" / "1.234.567" — thousands dots, no decimal part.
    t = t.replace(/\./g, "");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * True only for a strict `YYYY-MM-DD` calendar date. Quote `date`/`endDate` are
 * free-form text (the schema only trims length), so values like "a definir" or
 * a full ISO timestamp can reach the UI. Guarding with this before
 * `new Date(...).toISOString()` prevents a `RangeError` from crashing a whole
 * view (calendar grid, upcoming list…).
 */
export function isDateKey(s: string | undefined | null): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Formatação de euros consolidada em `@/lib/money` (fonte única). Mantemos os
// nomes locais `eur` (sem casas) e `eur2` (2 casas) para os importadores atuais.
export { eur0 as eur, eur as eur2 } from "@/lib/money";

/**
 * How far away an event date is, as a short PT label + a tone for colouring.
 * Returns null when there's no date. `soon` = within a week (and not past).
 */
export function eventCountdown(
  date?: string,
): { label: string; tone: "soon" | "today" | "future" | "past" } | null {
  if (!date) return null;
  // "Today" must be the LOCAL calendar day: the diff below anchors both dates at
  // LOCAL noon, so deriving today from `toISOString()` (a UTC date) mixed offsets
  // and shifted every countdown by a day for viewers east/west of UTC around
  // midnight (e.g. 05:00 in UTC+9, still "yesterday" in UTC, read as Amanhã).
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const ms = new Date(date + "T12:00:00").getTime() - new Date(todayKey + "T12:00:00").getTime();
  const days = Math.round(ms / 86400000);
  // An unparseable date yields NaN days; treat it like "no date" instead of
  // rendering a "faltam NaN meses" label in the UI.
  if (Number.isNaN(days)) return null;
  if (days === 0) return { label: "Hoje", tone: "today" };
  if (days === 1) return { label: "Amanhã", tone: "soon" };
  if (days < 0)
    return { label: `há ${Math.abs(days)} ${Math.abs(days) === 1 ? "dia" : "dias"}`, tone: "past" };
  if (days <= 7) return { label: `faltam ${days} dias`, tone: "soon" };
  if (days <= 30) return { label: `faltam ${days} dias`, tone: "future" };
  const weeks = Math.round(days / 7);
  if (days <= 90) return { label: `faltam ${weeks} semanas`, tone: "future" };
  const months = Math.round(days / 30);
  return { label: `faltam ${months} meses`, tone: "future" };
}
