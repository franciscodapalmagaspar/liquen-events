/**
 * Reposição de uma cópia de segurança — tipos partilhados e a aritmética que
 * não toca em nada (client-safe).
 *
 * Vive à parte de `backup-restore.ts` (que é `server-only`: puxa os stores, o
 * `fs` e o Supabase) para que o diálogo do back office possa importar as formas
 * do plano sem arrastar meio servidor para o bundle do browser — o mesmo corte
 * de `contract-types` / `contracts-store` e `inventory-types` / `inventory-store`.
 *
 * A matemática dos CONTADORES DE NUMERAÇÃO também vive aqui, e de propósito: é
 * a regra mais séria desta funcionalidade (um número de fatura nunca pode ser
 * reemitido) e é pura — logo testável sozinha, sem base de dados nenhuma.
 *
 * NÃO PODE importar nenhum módulo `server-only`.
 */

/** Versão do formato do ficheiro que esta aplicação sabe repor. Tem de bater
 *  certo com o `SCHEMA_VERSION` que a rota de exportação escreve — há um teste
 *  em `src/app/api/backup/restore/coverage.test.ts` que cruza os dois. */
export const BACKUP_SCHEMA_VERSION = 2;

/** Versão mais antiga do formato que ainda se aceita repor. */
export const BACKUP_SCHEMA_MIN_VERSION = 1;

/**
 * A frase que quem repõe tem de escrever à mão. Não é teatro: é o que separa
 * "carreguei sem querer no botão errado" de "eu quero mesmo apagar isto tudo".
 * O ensaio (dry run) NUNCA a pede — só a aplicação real.
 */
export const RESTORE_CONFIRM_PHRASE = "REPOR TUDO";

/** Tecto defensivo de registos num ficheiro, para um JSON gigante não pôr o
 *  servidor a mastigar durante minutos antes de dizer que não. */
export const MAX_RESTORE_ROWS = 500_000;

/** Um aviso mostrado a quem repõe. `critico` = a vermelho, não se pode ignorar. */
export interface RestoreWarning {
  level: "aviso" | "critico";
  message: string;
}

/** O que aconteceria (ou aconteceu) a UM conjunto de dados. */
export interface DatasetPlan {
  key: string;
  label: string;
  table: string;
  /** Registos que o ficheiro traz. */
  incoming: number;
  /** Registos que estão AGORA na base de dados. */
  current: number;
  /** Ids que só existem no ficheiro — entram novos. */
  created: number;
  /** Ids que existem nos dois — o conteúdo actual é escrito por cima. */
  replaced: number;
  /** Ids que só existem na base de dados — DESAPARECEM na reposição. */
  removed: number;
  /** Quantos dos registos actuais são mais recentes do que a cópia. */
  newerThanBackup: number;
  /** Preenchido quando o conjunto NÃO vai ser reposto — com a razão, por extenso. */
  skipped?: string;
  /**
   * A reposição deste conjunto JUNTA e não apaga nada (o índice do Vercel
   * Blob): `removed` é sempre 0 e o ecrã diz «junta, não apaga».
   */
  junta?: boolean;
}

/** O contador de numeração fiscal de um ano, e porque vai ficar no valor que vai ficar. */
export interface CounterPlan {
  year: number;
  /** Valor que vem no ficheiro (null = o ficheiro não fala deste ano). */
  inFile: number | null;
  /** Valor que está agora na base de dados (null = ainda não existe). */
  current: number | null;
  /** Número de sequência mais alto encontrado em faturas já emitidas — no
   *  ficheiro E na base de dados. É este que impede a numeração de recuar. */
  highestIssued: number;
  /** Onde o contador vai ficar. Nunca abaixo de `highestIssued`. */
  willBe: number;
  /** `true` quando o valor do ficheiro teve de ser ELEVADO para não reemitir
   *  números de fatura já usados. */
  raised: boolean;
}

/** O ensaio completo: tudo o que a reposição faria, sem ter feito nada. */
export interface RestorePlan {
  /** Data em que a cópia foi exportada (ISO), tal como vem no ficheiro. */
  exportedAt: string;
  schemaVersion: number;
  /** Idade da cópia em dias (null se a data não for legível). */
  ageDays: number | null;
  /** O registo mais recente que existe AGORA na base de dados (ISO), se houver. */
  newestCurrent: string | null;
  datasets: DatasetPlan[];
  counters: CounterPlan[];
  warnings: RestoreWarning[];
  totals: {
    incoming: number;
    current: number;
    created: number;
    replaced: number;
    removed: number;
    newerThanBackup: number;
  };
  /**
   * Conjuntos cujo estado ACTUAL não se conseguiu ler. Enquanto isto não
   * estiver vazio a reposição é recusada: sem saber o que lá está não há
   * cópia de segurança fiável do estado anterior — e sem essa, isto deixa de
   * ser reversível.
   */
  unreadable: { key: string; label: string; error: string }[];
  /** O aviso das fotos, escrito por extenso para aparecer no ecrã. */
  photosNotice: string;
}

/** Um conjunto que a reposição não conseguiu escrever. Aparece pelo nome. */
export interface DatasetFailure {
  key: string;
  label: string;
  error: string;
}

/** O que a reposição fez mesmo. */
export interface RestoreOutcome {
  key: string;
  label: string;
  deleted: number;
  inserted: number;
}

// ── Numeração fiscal ────────────────────────────────────────────────────────

/**
 * Lê o número de sequência de uma fatura: "FT 2026/0007" → { year: 2026, n: 7 }.
 * Devolve null a tudo o resto (números antigos, à mão, de outro sistema) — o
 * chamador conta esses à parte e diz-lhes o nome em vez de os ignorar calado.
 */
export function parseInvoiceNumber(number: unknown): { year: number; n: number } | null {
  if (typeof number !== "string") return null;
  const m = /^\s*FT\s*(\d{4})\s*\/\s*(\d+)\s*$/i.exec(number);
  if (!m) return null;
  const year = Number(m[1]);
  const n = Number(m[2]);
  if (!Number.isSafeInteger(year) || !Number.isSafeInteger(n) || n < 0) return null;
  return { year, n };
}

/** O número de sequência mais alto por ano, num conjunto de faturas. */
export function highestIssuedByYear(
  invoices: readonly { number?: unknown }[],
): Map<number, number> {
  const out = new Map<number, number>();
  for (const inv of invoices) {
    const parsed = parseInvoiceNumber(inv?.number);
    if (!parsed) continue;
    const seen = out.get(parsed.year) ?? 0;
    if (parsed.n > seen) out.set(parsed.year, parsed.n);
  }
  return out;
}

/**
 * A REGRA MAIS SÉRIA DESTA FUNCIONALIDADE.
 *
 * Repor o contador de numeração com o valor que vem no ficheiro é o caminho
 * óbvio e está errado. Cenário real: a cópia é de há um mês, com o contador de
 * 2026 em 30; desde então emitiram-se faturas até FT 2026/0042 e foram para os
 * clientes. Repor "30" faz a próxima emissão devolver FT 2026/0031 — um número
 * que já saiu desta casa. Num livro fiscal português isso não é um incómodo, é
 * um problema legal (a numeração tem de ser única e estritamente sequencial).
 *
 * Por isso o contador é a ÚNICA coisa que não se substitui: fica na marca de
 * água mais alta de tudo o que se sabe —
 *
 *   max(contador do ficheiro, contador actual, maior nº emitido no ficheiro,
 *       maior nº emitido na base de dados)
 *
 * Reparar que as faturas ACTUAIS contam mesmo quando vão ser apagadas pela
 * reposição: os números delas foram emitidos, existem em papel e em caixas de
 * correio, e apagar a linha não os desemite.
 *
 * O resultado nunca desce. Se descesse, esta função estava errada — e há um
 * teste que a mutila para o provar.
 */
export function planInvoiceCounters(input: {
  /** Contadores que vêm no ficheiro. */
  fileCounters: readonly { year: number; n: number }[];
  /** Faturas que vêm no ficheiro. */
  fileInvoices: readonly { number?: unknown }[];
  /** Contadores que estão agora na base de dados. */
  currentCounters: readonly { year: number; n: number }[];
  /** Faturas que estão agora na base de dados (vão ser apagadas — os números não). */
  currentInvoices: readonly { number?: unknown }[];
}): CounterPlan[] {
  const inFile = new Map(input.fileCounters.map((c) => [c.year, c.n]));
  const current = new Map(input.currentCounters.map((c) => [c.year, c.n]));
  const issuedFile = highestIssuedByYear(input.fileInvoices);
  const issuedCurrent = highestIssuedByYear(input.currentInvoices);

  const years = new Set<number>([
    ...inFile.keys(),
    ...current.keys(),
    ...issuedFile.keys(),
    ...issuedCurrent.keys(),
  ]);

  return [...years]
    .sort((a, b) => a - b)
    .map((year) => {
      const fileValue = inFile.has(year) ? inFile.get(year)! : null;
      const currentValue = current.has(year) ? current.get(year)! : null;
      const highestIssued = Math.max(issuedFile.get(year) ?? 0, issuedCurrent.get(year) ?? 0);
      const willBe = Math.max(fileValue ?? 0, currentValue ?? 0, highestIssued);
      return {
        year,
        inFile: fileValue,
        current: currentValue,
        highestIssued,
        willBe,
        // "Elevado" = o ficheiro sozinho teria feito o contador recuar.
        raised: willBe > (fileValue ?? 0),
      };
    });
}

/** Dias inteiros entre duas datas ISO. `null` quando alguma não é legível. */
export function daysBetween(from: string | null | undefined, to: string): number | null {
  if (!from) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.floor((b - a) / 86_400_000);
}
