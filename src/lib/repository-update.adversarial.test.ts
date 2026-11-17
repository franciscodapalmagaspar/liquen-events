import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { Repository, FileBackend, type Mapper } from "./repository";
import { mapper as quotesMapper } from "./quotes-store";
import { quoteUpdateSchema } from "./validation";
import type { Quote } from "@/lib/orcamento/types";

/**
 * Adversarial QA — STORE PARTIAL-UPDATE / PATCH semantics (the data-loss class).
 *
 * A prior note flagged the shallow spread in `Repository.update`
 * (`{ ...current, ...updates }`) as a possible data-loss bug: an explicit
 * `undefined` in the patch clobbers a stored field. These tests establish, as
 * executable specification, what the merge actually does and — crucially —
 * whether the in-scope admin PATCH routes can EVER reach the clobber.
 *
 * Verdict encoded here (see the report):
 *   1. The normal partial update (the only shape the admin routes produce)
 *      PRESERVES untouched fields — including nested arrays. No data loss.
 *   2. An explicit `undefined` DOES clear a field. This is NOT a bug to "fix":
 *      it is the deliberate, relied-upon "clear/unlink" mechanism used by the
 *      invoices route (`paidAt: undefined` on un-pay) and message-links-store
 *      (`linkToQuote`/`setArchived` with `undefined`). Stripping `undefined` in
 *      the shared repository would REGRESS those. This test pins that contract
 *      so the decision can't be silently reverted.
 */

// ── A self-contained entity to exercise the generic merge ──────────────────
interface Row {
  id: string;
  name: string;
  qty: number;
  note?: string;
  tags?: string[];
  createdAt: string;
}

const rowMapper: Mapper<Row> = {
  table: "inventory_items",
  fileName: "rows.json",
  getId: (r) => r.id,
  toRow: (r) => ({ id: r.id, name: r.name, qty: r.qty }),
  fromRow: (r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    qty: Number(r.qty ?? 0),
    createdAt: "2026-01-01T00:00:00.000Z",
  }),
};

let dir: string;
let repo: Repository<Row>;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "repo-update-adv-"));
  repo = new Repository<Row>(rowMapper, () => new FileBackend<Row>(rowMapper, dir));
});
afterEach(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
});

const seed = (over: Partial<Row> = {}): Row => ({
  id: "r1",
  name: "Alpha",
  qty: 1,
  note: "keep me",
  tags: ["a", "b"],
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("Repository.update merge — partial update preserves untouched fields", () => {
  it("a scalar-only patch keeps every other field, including nested arrays", async () => {
    await repo.create(seed());
    const updated = await repo.update("r1", { qty: 9 });
    // Untouched fields survive…
    expect(updated).toMatchObject({ id: "r1", name: "Alpha", qty: 9, note: "keep me" });
    // …and the nested array is preserved by reference (no shallow-spread loss).
    expect(updated?.tags).toEqual(["a", "b"]);
    const reread = await repo.get("r1");
    expect(reread).toMatchObject({ name: "Alpha", qty: 9, note: "keep me" });
    expect(reread?.tags).toEqual(["a", "b"]);
  });

  it("omitting a key (the normal partial patch) is a no-op for that field", async () => {
    await repo.create(seed({ note: "original" }));
    // Patch that simply does not mention `note` — how zod `.partial()` output and
    // the routes' `if (key in body)` construction behave for absent fields.
    await repo.update("r1", { name: "Beta" });
    expect((await repo.get("r1"))?.note).toBe("original");
  });
});

describe("Repository.update merge — explicit undefined vs null (deliberate clear semantics)", () => {
  // These pin INTENTIONAL behaviour. The invoices route and message-links-store
  // depend on `undefined` clearing a field; a change that strips undefined in the
  // shared repository would break un-pay / unlink and MUST fail these on purpose.
  it("explicit `undefined` in the patch clears the stored field (relied-upon clear)", async () => {
    await repo.create(seed({ note: "was set" }));
    const updated = await repo.update("r1", { note: undefined });
    expect(updated?.note).toBeUndefined();
    expect(await repo.get("r1")).not.toHaveProperty("note", "was set");
    // Other fields are still untouched — only the explicitly-cleared one changes.
    expect(updated?.name).toBe("Alpha");
    expect(updated?.qty).toBe(1);
  });

  it("explicit `null` persists as a distinct explicit clear (not the same as absent)", async () => {
    await repo.create(seed({ note: "was set" }));
    const updated = await repo.update("r1", { note: null as unknown as undefined });
    expect(updated?.note).toBeNull();
  });
});

// ── End-to-end proof over the REAL in-scope route path (quote PATCH) ────────
// Reconstructs exactly what src/app/api/orcamento/[id]/route.ts does: allowlist
// pick of keys present in the JSON body, then `quoteUpdateSchema.safeParse`,
// then `repo.update`. A JSON body cannot carry `undefined`, and zod `.partial()`
// does not inject `undefined` for absent keys — so the patch that reaches the
// merge only ever contains the fields the client actually sent. This proves the
// admin PATCH cannot wipe untouched fields (price, notes, payments…).
describe("orcamento PATCH path does not clobber untouched quote fields", () => {
  const ALLOWED: (keyof Quote)[] = [
    "status",
    "quotedPrice",
    "adminNotes",
    "payments",
    "date",
    "guests",
    "location",
    "archived",
  ];

  function buildPatch(body: Record<string, unknown>): Partial<Quote> {
    const picked: Record<string, unknown> = {};
    for (const key of ALLOWED) {
      if (key in body) picked[key] = body[key];
    }
    const parsed = quoteUpdateSchema.safeParse(picked);
    if (!parsed.success) throw new Error("schema rejected: " + parsed.error.issues[0]?.message);
    return parsed.data as Partial<Quote>;
  }

  it("a status-only PATCH preserves quotedPrice, adminNotes and the payments array", async () => {
    const qrepo = new Repository<Quote>(
      quotesMapper,
      () => new FileBackend<Quote>(quotesMapper, dir),
    );
    const quote = {
      id: "LIQ-TEST-1",
      submittedAt: "2026-01-01T00:00:00.000Z",
      status: "cotado",
      name: "Ana",
      email: "ana@x.pt",
      quotedPrice: 500,
      adminNotes: "important context — must survive",
      payments: [{ id: "p1", kind: "sinal", amount: 150, date: "2026-01-02", paid: true }],
    } as unknown as Quote;
    await qrepo.create(quote);

    // Client only changes the status — the exact shape the UI sends.
    const patch = buildPatch({ status: "aceite" });
    expect(patch).toEqual({ status: "aceite" }); // zod partial injected no undefined keys

    const updated = await qrepo.update("LIQ-TEST-1", patch);
    expect(updated?.status).toBe("aceite");
    expect(updated?.quotedPrice).toBe(500);
    expect(updated?.adminNotes).toBe("important context — must survive");
    expect(updated?.payments).toEqual([
      { id: "p1", kind: "sinal", amount: 150, date: "2026-01-02", paid: true },
    ]);
  });

  it("an explicit null quotedPrice clears it (intended), leaving other fields intact", async () => {
    const qrepo = new Repository<Quote>(
      quotesMapper,
      () => new FileBackend<Quote>(quotesMapper, dir),
    );
    const quote = {
      id: "LIQ-TEST-2",
      submittedAt: "2026-01-01T00:00:00.000Z",
      status: "cotado",
      name: "Rui",
      email: "rui@x.pt",
      quotedPrice: 999,
      adminNotes: "keep",
    } as unknown as Quote;
    await qrepo.create(quote);

    const patch = buildPatch({ quotedPrice: null });
    const updated = await qrepo.update("LIQ-TEST-2", patch);
    expect(updated?.quotedPrice).toBeNull();
    expect(updated?.adminNotes).toBe("keep");
    expect(updated?.status).toBe("cotado");
  });
});
