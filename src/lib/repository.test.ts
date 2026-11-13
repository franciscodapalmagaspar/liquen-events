import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Repository,
  FileBackend,
  SupabaseBackend,
  ConflictError,
  type Mapper,
  type Backend,
} from "./repository";

// A self-contained entity to exercise the generic machinery.
interface Widget {
  id: string;
  name: string;
  qty: number;
  createdAt: string;
  updatedAt?: string;
}

const widgetMapper: Mapper<Widget> = {
  table: "widgets",
  fileName: "widgets.json",
  getId: (w) => w.id,
  toRow: (w) => ({ id: w.id, name: w.name, qty: w.qty }),
  fromRow: (r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    qty: Number(r.qty ?? 0),
    createdAt: String(r.created_at ?? "2026-01-01T00:00:00.000Z"),
  }),
  order: { column: "name", ascending: true },
  fileCompare: (a, b) => a.name.localeCompare(b.name),
  touch: true,
  beforeUpdate: (w) => ({ ...w, updatedAt: "touched" }),
};

const widget = (over: Partial<Widget> = {}): Widget => ({
  id: "w1",
  name: "Alpha",
  qty: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

// ── Shared CRUD contract, run against both backends ───────────────────────
function crudSuite(name: string, makeRepo: () => Promise<Repository<Widget>> | Repository<Widget>) {
  describe(`Repository over ${name}`, () => {
    let repo: Repository<Widget>;
    beforeEach(async () => {
      repo = await makeRepo();
    });

    it("creates and reads back an entity", async () => {
      await repo.create(widget({ id: "w1", name: "Alpha", qty: 3 }));
      const got = await repo.get("w1");
      expect(got?.name).toBe("Alpha");
      expect(got?.qty).toBe(3);
    });

    it("returns null for a missing id", async () => {
      expect(await repo.get("nope")).toBeNull();
    });

    it("lists entities in the configured order", async () => {
      await repo.create(widget({ id: "b", name: "Charlie" }));
      await repo.create(widget({ id: "a", name: "Alpha" }));
      await repo.create(widget({ id: "c", name: "Bravo" }));
      const names = (await repo.list()).map((w) => w.name);
      expect(names).toEqual(["Alpha", "Bravo", "Charlie"]);
    });

    it("merges updates and applies beforeUpdate", async () => {
      await repo.create(widget({ id: "w1", name: "Alpha", qty: 1 }));
      const updated = await repo.update("w1", { qty: 9 });
      expect(updated).toMatchObject({ id: "w1", name: "Alpha", qty: 9, updatedAt: "touched" });
      const reread = await repo.get("w1");
      expect(reread?.qty).toBe(9);
    });

    it("returns null when updating a missing entity", async () => {
      expect(await repo.update("ghost", { qty: 5 })).toBeNull();
    });

    it("filters with where()", async () => {
      await repo.create(widget({ id: "a", name: "Alpha", qty: 1 }));
      await repo.create(widget({ id: "b", name: "Bravo", qty: 2 }));
      const res = await repo.where("qty", 2, (w) => w.qty === 2);
      expect(res.map((w) => w.id)).toEqual(["b"]);
    });

    it("removes an entity", async () => {
      await repo.create(widget({ id: "w1" }));
      await repo.remove("w1");
      expect(await repo.get("w1")).toBeNull();
    });
  });
}

// File backend — real temp directory.
let tmpDir: string;
crudSuite("FileBackend", async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "repo-test-"));
  return new Repository<Widget>(widgetMapper, () => new FileBackend<Widget>(widgetMapper, tmpDir));
});
afterEach(async () => {
  if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

// ── Minimal in-memory fake of the Supabase client ─────────────────────────
function createFakeSupabase() {
  const store = new Map<string, Record<string, unknown>[]>();

  // A structural thenable: `await` only needs a `then` method, no interface.
  class Query {
    private op: "select" | "insert" | "update" | "delete" = "select";
    private payload: Record<string, unknown> | null = null;
    private filters: [string, unknown, "eq" | "is"][] = [];
    private single = false;
    private returning = false;
    private orderBy: { col: string; asc: boolean } | null = null;
    private lim: number | null = null;
    private desde = 0;
    constructor(private table: string) {}

    select() {
      // After update/insert, .select() means "return the affected rows"
      // (PostgREST returning), not a new select operation.
      if (this.op !== "select") this.returning = true;
      return this;
    }
    insert(row: Record<string, unknown>) {
      this.op = "insert";
      this.payload = row;
      return this;
    }
    update(row: Record<string, unknown>) {
      this.op = "update";
      this.payload = row;
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }
    eq(col: string, val: unknown) {
      this.filters.push([col, val, "eq"]);
      return this;
    }
    is(col: string, val: unknown) {
      this.filters.push([col, val, "is"]);
      return this;
    }
    order(col: string, opts: { ascending: boolean }) {
      this.orderBy = { col, asc: opts.ascending };
      return this;
    }
    limit(n: number) {
      this.lim = n;
      return this;
    }
    // Leitura por páginas (o `list()` lê tudo assim — auditoria de 13/11).
    range(de: number, ate: number) {
      this.desde = de;
      this.lim = ate - de + 1;
      return this;
    }
    maybeSingle() {
      this.single = true;
      return this;
    }

    private rows() {
      return store.get(this.table) ?? [];
    }
    private matches(r: Record<string, unknown>) {
      // `is` compares SQL-style null (JS null OR missing column).
      return this.filters.every(([c, v, op]) => (op === "is" ? (r[c] ?? null) === v : r[c] === v));
    }
    private exec() {
      if (this.op === "insert") {
        const row = { created_at: new Date().toISOString(), ...this.payload };
        store.set(this.table, [...this.rows(), row]);
        return { data: null, error: null };
      }
      if (this.op === "update") {
        const hit: Record<string, unknown>[] = [];
        for (const r of this.rows())
          if (this.matches(r)) {
            Object.assign(r, this.payload);
            hit.push(r);
          }
        return { data: this.returning ? hit : null, error: null };
      }
      if (this.op === "delete") {
        store.set(
          this.table,
          this.rows().filter((r) => !this.matches(r)),
        );
        return { data: null, error: null };
      }
      // select
      let rows = this.rows().filter((r) => this.matches(r));
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        rows = [...rows].sort(
          (a, b) => String(a[col]).localeCompare(String(b[col])) * (asc ? 1 : -1),
        );
      }
      if (this.single) return { data: rows[0] ?? null, error: null };
      if (this.lim !== null) rows = rows.slice(this.desde, this.desde + this.lim);
      return { data: rows, error: null };
    }

    then<R>(onF: (v: { data: unknown; error: null }) => R): Promise<R> {
      return Promise.resolve(this.exec()).then(onF);
    }
  }

  return { from: (table: string) => new Query(table) } as unknown as SupabaseClient;
}

crudSuite("SupabaseBackend (fake client)", () => {
  const sb = createFakeSupabase();
  return new Repository<Widget>(widgetMapper, () => new SupabaseBackend<Widget>(widgetMapper, sb));
});

// Backend interface conformance is what the suite proves; this references the
// type so an accidental signature drift would fail to compile.
const _conformance: (b: Backend<Widget>) => void = () => {};
void _conformance;

// ── Optimistic locking (CAS on updated_at, Supabase backend) ───────────────
describe("optimistic locking", () => {
  it("persist throws ConflictError when the row changed since the read", async () => {
    const sb = createFakeSupabase();
    const backend = new SupabaseBackend<Widget>(widgetMapper, sb);
    await backend.insert(widget({ id: "w1", qty: 1 }));

    const stale = await backend.get("w1");
    // A concurrent writer lands first (bumps updated_at)…
    const fresh = await backend.get("w1");
    await backend.persist("w1", widget({ id: "w1", qty: 2 }), fresh!);
    // …so persisting on top of the stale read must refuse to clobber it.
    await expect(
      backend.persist("w1", widget({ id: "w1", qty: 3 }), stale!),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("updateWith retries after a mid-flight concurrent write and reapplies mutate on the fresh state", async () => {
    const sb = createFakeSupabase();
    const real = new SupabaseBackend<Widget>(widgetMapper, sb);
    const interloper = new SupabaseBackend<Widget>(widgetMapper, sb);
    await real.insert(widget({ id: "w1", name: "Alpha", qty: 1 }));

    // Wrap the backend so a concurrent write sneaks in between updateWith's
    // read and its first persist — the classic lost-update window.
    let injected = false;
    const wrapped: Backend<Widget> = {
      list: () => real.list(),
      get: (id) => real.get(id),
      query: (c, v, p) => (real as Backend<Widget>).query(c, v, p),
      insert: (e) => real.insert(e),
      remove: (id) => real.remove(id),
      persist: async (id, merged, cas) => {
        if (!injected) {
          injected = true;
          const cur = await interloper.get(id);
          await interloper.persist(id, { ...cur!, name: "Interloped" }, cur!);
        }
        return real.persist(id, merged, cas);
      },
    };

    const repo = new Repository<Widget>(widgetMapper, () => wrapped);
    const result = await repo.updateWith("w1", (c) => ({ ...c, qty: c.qty + 1 }));

    // The mutate was reapplied on the post-conflict state: both the concurrent
    // name change AND the increment survive — nothing was lost.
    expect(result).toMatchObject({ name: "Interloped", qty: 2 });
    const reread = await real.get("w1");
    expect(reread).toMatchObject({ name: "Interloped", qty: 2 });
  });
});

// ── Per-store mapper round-trips (camelCase ↔ snake_case) ─────────────────
describe("store mappers round-trip through toRow → DB → fromRow", () => {
  it("tasks", async () => {
    const { mapper } = await import("./tasks-store");
    const row = {
      ...mapper.toRow({
        id: "t1",
        title: "Ligar ao cliente",
        done: false,
        priority: "alta",
        dueDate: "2026-06-01",
        quoteId: "Q1",
        clientName: "Ana",
        assignee: "Rui",
        area: "comercial",
        createdAt: "2026-01-01T00:00:00.000Z",
      } as any),
      created_at: "2026-01-01T00:00:00.000Z",
    };
    expect(mapper.fromRow(row)).toEqual({
      id: "t1",
      title: "Ligar ao cliente",
      done: false,
      priority: "alta",
      dueDate: "2026-06-01",
      quoteId: "Q1",
      clientName: "Ana",
      assignee: "Rui",
      area: "comercial",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("suppliers", async () => {
    const { mapper } = await import("./suppliers-store");
    const supplier = {
      id: "s1",
      name: "Floristaria",
      category: "Flores",
      email: "f@x.pt",
      phone: "910000000",
      location: "Lisboa",
      notes: "Rápidos",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const row = { ...mapper.toRow(supplier as any), created_at: supplier.createdAt };
    expect(mapper.fromRow(row)).toEqual(supplier);
  });

  it("calendar events", async () => {
    const { mapper } = await import("./calendar-store");
    const event = {
      id: "c1",
      date: "2026-07-04",
      title: "Casamento",
      kind: "evento" as const,
      time: "16:00",
      note: "Quinta",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const row = { ...mapper.toRow(event as any), created_at: event.createdAt };
    expect(mapper.fromRow(row)).toEqual(event);
  });

  it("quotes (jsonb blob)", async () => {
    const { mapper } = await import("./quotes-store");
    const quote = { id: "Q1", status: "pendente", name: "Ana", email: "a@x.pt" } as any;
    const row = mapper.toRow(quote);
    expect(row).toMatchObject({ id: "Q1", status: "pendente", name: "Ana", email: "a@x.pt" });
    expect(mapper.fromRow(row)).toEqual(quote);
  });

  it("proposals", async () => {
    const { mapper } = await import("./proposals-store");
    const proposal = {
      id: "prop1",
      quoteId: "Q1",
      clientName: "Ana",
      clientEmail: "ana@x.pt",
      currency: "EUR",
      lineItems: [{ description: "Decoração", qty: 2, unitPrice: 500 }],
      vatRate: 0.23,
      subtotal: 1000,
      vat: 230,
      total: 1230,
      validUntil: "2026-08-01",
      notes: "Nota",
      status: "enviada" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      sentAt: "2026-01-02T00:00:00.000Z",
      respondedAt: "2026-01-03T00:00:00.000Z",
    };
    // toRow deliberately omits created_at (DB-defaulted) — mirror the DB adding it.
    const row = { ...mapper.toRow(proposal as any), created_at: proposal.createdAt };
    expect(mapper.fromRow(row)).toEqual(proposal);
  });

  it("proposals: empty optionals round-trip to undefined (not null)", async () => {
    const { mapper } = await import("./proposals-store");
    const row = {
      ...mapper.toRow({
        id: "prop2",
        quoteId: "Q1",
        clientName: "Ana",
        clientEmail: "ana@x.pt",
        currency: "EUR",
        lineItems: [],
        vatRate: 0.23,
        subtotal: 0,
        vat: 0,
        total: 0,
        validUntil: "",
        notes: "",
        status: "rascunho",
        createdAt: "2026-01-01T00:00:00.000Z",
      } as any),
      created_at: "2026-01-01T00:00:00.000Z",
    };
    const back = mapper.fromRow(row);
    expect(back.validUntil).toBeUndefined();
    expect(back.notes).toBeUndefined();
    expect(back.sentAt).toBeUndefined();
    expect(back.respondedAt).toBeUndefined();
  });

  it("contracts", async () => {
    const { mapper } = await import("./contracts-store");
    const contract = {
      id: "c1",
      quoteId: "Q1",
      proposalId: "prop1",
      clientName: "Ana",
      clientEmail: "ana@x.pt",
      termsVersion: "v1",
      termsSnapshot: "Os termos acordados…",
      status: "aceite" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      acceptedAt: "2026-01-01T10:00:00.000Z",
      acceptedName: "Ana",
      acceptedIp: "1.2.3.4",
    };
    expect(mapper.fromRow(mapper.toRow(contract as any))).toEqual(contract);
  });

  it("inventory items", async () => {
    const { mapper } = await import("./inventory-store");
    const item = {
      id: "it1",
      name: "Vaso de vidro",
      category: "Vasos e Jarras",
      quantity: 12,
      unit: "un",
      condition: "bom" as const,
      location: "Armazém A",
      notes: "Frágil",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(mapper.fromRow(mapper.toRow(item as any))).toEqual(item);
  });
});

// ── FileBackend refuses writes in production (assertWritableInProd) ─────────
// The file fallback is DEV-only: in production it means Supabase is unconfigured
// and a write would land in an ephemeral file that vanishes on redeploy (silent
// data loss reported as success). The backend must refuse writes loudly while
// keeping reads working.
describe("FileBackend.assertWritableInProd", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "repo-prod-"));
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("refuses insert/persist/remove in production but still allows reads", async () => {
    // Seed a row while NOT in production so reads have something to return.
    const dev = new FileBackend<Widget>(widgetMapper, dir);
    await dev.insert(widget({ id: "w1", name: "Alpha" }));

    vi.stubEnv("NODE_ENV", "production");
    const prod = new FileBackend<Widget>(widgetMapper, dir);

    const msg = /Persistence unavailable/;
    await expect(prod.insert(widget({ id: "w2" }))).rejects.toThrow(msg);
    await expect(prod.persist("w1", widget({ id: "w1", name: "Beta" }))).rejects.toThrow(msg);
    await expect(prod.remove("w1")).rejects.toThrow(msg);

    // Reads keep working, and no mutation leaked through.
    expect((await prod.get("w1"))?.name).toBe("Alpha");
    expect((await prod.list()).map((w) => w.id)).toEqual(["w1"]);
  });

  it("allows writes when NODE_ENV is not production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const dev = new FileBackend<Widget>(widgetMapper, dir);
    await expect(dev.insert(widget({ id: "w9" }))).resolves.toBeUndefined();
    expect((await dev.get("w9"))?.id).toBe("w9");
  });
});

// ── Paridade do backend de ficheiro com o do Supabase ──────────────────────
// O caminho de ficheiro é o que corre quando não há Supabase configurado. Uma
// guarda que só exista de um dos lados não é uma diferença de desempenho: é uma
// protecção que desaparece consoante a variável de ambiente que estiver posta.
// Estes testes prendem as três que faltavam.
describe("FileBackend: paridade das guardas com o Supabase", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "repo-parity-"));
  });
  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("recusa um id repetido, como a chave primária do Postgres (23505)", async () => {
    const backend = new FileBackend<Widget>(widgetMapper, dir);
    await backend.insert(widget({ id: "w1", name: "Alpha" }));

    // A forma do erro é a que `isUniqueViolation` reconhece — é por ela que
    // `saveOverviewField` e `createContractIfAbsent` distinguem um conflito de
    // uma avaria, e essa distinção não pode mudar com o backend.
    const { isUniqueViolation } = await import("./invoices-store");
    const err = await backend.insert(widget({ id: "w1", name: "Bravo" })).catch((e) => e);
    expect(isUniqueViolation(err)).toBe(true);

    // E o duplicado não entrou: continua a haver UMA linha, a primeira.
    const all = await backend.list();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Alpha");
  });

  it("persist recusa escrever por cima de uma leitura já ultrapassada (ConflictError)", async () => {
    const backend = new FileBackend<Widget>(widgetMapper, dir);
    await backend.insert(widget({ id: "w1", qty: 1 }));

    const stale = await backend.get("w1");
    // Alguém escreve primeiro, a partir de uma leitura fresca…
    const fresh = await backend.get("w1");
    await backend.persist("w1", widget({ id: "w1", name: "Winner", qty: 2 }), fresh!);

    // …e a escrita assente na leitura antiga tem de ser recusada, não aceite.
    await expect(
      backend.persist("w1", widget({ id: "w1", name: "Clobber", qty: 3 }), stale!),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await backend.get("w1"))?.name).toBe("Winner");
  });

  it("updateWith não perde a escrita concorrente (o mesmo que o Supabase já garantia)", async () => {
    // Cópia exacta do cenário do teste do backend Supabase acima: uma escrita
    // entra entre o `get` e o `persist` do `updateWith`. Ali sobrevivem as duas
    // alterações; aqui tem de acontecer o mesmo.
    const real = new FileBackend<Widget>(widgetMapper, dir);
    await real.insert(widget({ id: "w1", name: "Alpha", qty: 1 }));

    let injected = false;
    const wrapped: Backend<Widget> = {
      list: () => real.list(),
      get: (id) => real.get(id),
      query: (c, v, p) => real.query(c, v, p),
      insert: (e) => real.insert(e),
      remove: (id) => real.remove(id),
      persist: async (id, merged, cas) => {
        if (!injected) {
          injected = true;
          const cur = await real.get(id);
          await real.persist(id, { ...cur!, name: "Interloped" }, cur!);
        }
        return real.persist(id, merged, cas);
      },
    };

    const repo = new Repository<Widget>(widgetMapper, () => wrapped);
    const result = await repo.updateWith("w1", (c) => ({ ...c, qty: c.qty + 1 }));

    expect(result).toMatchObject({ name: "Interloped", qty: 2 });
    expect(await real.get("w1")).toMatchObject({ name: "Interloped", qty: 2 });
  });
});

// ── A fila de escrita tem de ser partilhada por todas as operações ─────────
// `createRepository` escolhia o backend a cada chamada E construía-o a cada
// chamada. Como a fila de serialização vive na instância, cada operação ficava
// com uma fila só sua — ou seja, sem fila nenhuma. Duas criações em simultâneo
// liam ambas o mesmo array e a segunda escrita apagava a primeira.
describe("createRepository: um só FileBackend por repositório", () => {
  let dir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "repo-cwd-"));
    await fs.mkdir(path.join(dir, "data"), { recursive: true });
    // `createRepository` ancora-se em process.cwd()/data.
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(dir);
    vi.stubEnv("NODE_ENV", "development");
    // Sem Supabase configurado é o backend de ficheiro que corre — que é o que
    // este teste mede. Explícito, para não depender do .env de quem o corre.
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  });
  afterEach(async () => {
    cwdSpy.mockRestore();
    vi.unstubAllEnvs();
    if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("serializa criações concorrentes sem perder nenhuma", async () => {
    const { createRepository } = await import("./repository");
    const repo = createRepository<Widget>(widgetMapper);

    await Promise.all([
      repo.create(widget({ id: "a", name: "Alpha" })),
      repo.create(widget({ id: "b", name: "Bravo" })),
      repo.create(widget({ id: "c", name: "Charlie" })),
    ]);

    expect((await repo.list()).map((w) => w.id).sort()).toEqual(["a", "b", "c"]);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A TABELA CUJA CHAVE NÃO SE CHAMA `id`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Onze das doze tabelas têm `id` como chave primária, e o backend do Supabase
 * tinha esse nome escrito à mão em quatro sítios. A décima segunda —
 * `biblioteca_fotos` — tem `path text primary key` e nenhuma coluna `id`.
 *
 * O defeito era invisível aqui e total em produção: o backend de FICHEIRO usa
 * o `getId` do mapper e funcionava; o do Supabase perguntava `where id = <o
 * caminho>` a uma tabela sem `id`, o Postgres respondia «column does not
 * exist», e o tratamento de erros traduzia isso para «a funcionalidade não
 * está instalada». Etiquetar uma foto respondia 503, e a LQIP e a cor de cada
 * fotografia nunca chegavam a ser gravadas — em silêncio.
 *
 * Este teste corre contra o cliente falso, que compara colunas como o Postgres
 * compara: uma linha sem `id` não é encontrada por `where id = …`.
 */
interface Ficheiro {
  path: string;
  cor: string;
}

const ficheiroMapper: Mapper<Ficheiro> = {
  table: "ficheiros",
  fileName: "ficheiros.json",
  getId: (f) => f.path,
  idColumn: "path",
  // Repare-se: NÃO há coluna `id` nenhuma, tal como na tabela verdadeira.
  toRow: (f) => ({ path: f.path, cor: f.cor }),
  fromRow: (r) => ({ path: String(r.path), cor: String(r.cor ?? "") }),
};

describe("um mapper cuja chave vive noutra coluna", () => {
  it("lê, escreve e apaga pela coluna que o mapper declara", async () => {
    const sb = createFakeSupabase();
    const repo = new Repository<Ficheiro>(
      ficheiroMapper,
      () => new SupabaseBackend<Ficheiro>(ficheiroMapper, sb),
    );

    await repo.create({ path: "tema-a/foto.jpg", cor: "#3d5a40" });

    // Isto é o que estava partido: `get` procurava por `id`.
    expect((await repo.get("tema-a/foto.jpg"))?.cor).toBe("#3d5a40");

    await repo.update("tema-a/foto.jpg", { cor: "#f0ece4" });
    expect((await repo.get("tema-a/foto.jpg"))?.cor).toBe("#f0ece4");

    await repo.remove("tema-a/foto.jpg");
    expect(await repo.get("tema-a/foto.jpg")).toBeNull();
  });

  /**
   * A regra, e não o caso: um mapper que não escreve coluna `id` TEM de dizer
   * qual é a sua. Sem isto, a próxima tabela com chave própria repete o defeito
   * — e repete-o só em produção.
   */
  it("o mapper das fotos da biblioteca declara a coluna da sua chave", async () => {
    const { mapper } = await import("./biblioteca-fotos-store");
    const linha = mapper.toRow({
      path: "tema-a/foto.jpg",
      createdAt: "2026-01-01T00:00:00.000Z",
    } as Parameters<typeof mapper.toRow>[0]);
    expect(
      "id" in linha || mapper.idColumn,
      "um mapper sem coluna `id` tem de declarar `idColumn`",
    ).toBeTruthy();
    expect(mapper.idColumn).toBe("path");
  });
});
