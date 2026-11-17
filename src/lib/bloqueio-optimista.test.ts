import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ConflictError,
  MENSAGEM_DE_CONFLITO,
  Repository,
  SupabaseBackend,
  isConflictError,
  type Backend,
  type Mapper,
} from "./repository";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ESCREVER POR CIMA DO TRABALHO DE OUTRA PESSOA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A perda que ninguém vê acontecer. Duas pessoas abrem a mesma factura, uma
 * marca-a como paga, a outra corrige a nota — e a segunda gravação, que leu a
 * linha ANTES da primeira, reescreve a linha inteira com o estado velho. A
 * factura volta a "emitida" sem que nada falhe, sem aviso, sem registo.
 *
 * O `Repository` já sabe impedir isto: compara-e-escreve sobre o `updated_at`.
 * Só que a comparação só acontece quando o mapper declara `touch: true` — e a
 * maior parte das tabelas não declarava. Sem isso o `update` é um
 * ler-fundir-escrever cego e as três tentativas do `updateWith` nunca chegam a
 * disparar, porque o `ConflictError` nunca é lançado.
 *
 * Estes testes prendem as duas metades, porque uma sem a outra parte tudo:
 *   · QUEM COMPARA — o mapper declara `touch`;
 *   · QUEM ESCREVE — a coluna `updated_at` existe mesmo em `db/schema.sql`.
 * Ligar a comparação numa tabela sem a coluna faria TODAS as escritas dessa
 * tabela falharem, o que é pior do que o problema que se está a resolver.
 */

// ── Fake mínimo do cliente Supabase, com várias tabelas ───────────────────
// Cópia deliberada do que `repository.test.ts` já usa: um duplo de teste
// partilhado entre ficheiros ficaria a ser mantido por ninguém, e o que aqui
// interessa é o comportamento do `update ... where updated_at = ?`, que são
// vinte linhas.
function criarSupabaseFalso(): SupabaseClient {
  const store = new Map<string, Record<string, unknown>[]>();

  class Query {
    private op: "select" | "insert" | "update" | "delete" = "select";
    private payload: Record<string, unknown> | null = null;
    private filters: [string, unknown, "eq" | "is"][] = [];
    private single = false;
    private returning = false;
    constructor(private table: string) {}

    select() {
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
    order() {
      return this;
    }
    limit() {
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
      return this.filters.every(([c, v, op]) => (op === "is" ? (r[c] ?? null) === v : r[c] === v));
    }
    private exec() {
      if (this.op === "insert") {
        store.set(this.table, [...this.rows(), { ...this.payload }]);
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
      const rows = this.rows().filter((r) => this.matches(r));
      if (this.single) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }

    then<R>(onF: (v: { data: unknown; error: null }) => R): Promise<R> {
      return Promise.resolve(this.exec()).then(onF);
    }
  }

  return { from: (table: string) => new Query(table) } as unknown as SupabaseClient;
}

/**
 * Os mappers são de tipos diferentes (`Mapper<Invoice>`, `Mapper<Task>`, …) e o
 * que aqui se exercita é a maquinaria genérica por baixo deles, igual para
 * todos. Um objecto de campos soltos é a forma honesta de dizer isso.
 */
type MapperQualquer = Mapper<Record<string, unknown>>;

/**
 * Uma tabela que passou a ter bloqueio optimista, e os dois campos que duas
 * pessoas diferentes mexem ao mesmo tempo no ecrã. São campos DIFERENTES de
 * propósito: é esse o caso que a compare-and-set salva por inteiro — sem ela,
 * a gravação de A repõe o campo de B pelo valor velho que A tinha lido.
 */
interface Caso {
  nome: string;
  carregar: () => Promise<{ mapper: MapperQualquer }>;
  campoA: [string, unknown];
  campoB: [string, unknown];
}

const carregarMapper = (importar: Promise<unknown>) =>
  importar as Promise<{ mapper: MapperQualquer }>;

const CASOS: Caso[] = [
  {
    nome: "proposals — o documento que seguiu para o casal",
    carregar: () => carregarMapper(import("./proposals-store")),
    campoA: ["notes", "Notas revistas pela Ana"],
    campoB: ["status", "aceite"],
  },
  {
    nome: "invoices — o livro fiscal",
    carregar: () => carregarMapper(import("./invoices-store")),
    campoA: ["note", "Pago por transferência"],
    campoB: ["status", "paga"],
  },
  {
    nome: "contracts — a prova do aceite",
    carregar: () => carregarMapper(import("./contracts-store")),
    campoA: ["acceptedName", "Ana Silva"],
    campoB: ["status", "aceite"],
  },
  {
    nome: "tasks",
    carregar: () => carregarMapper(import("./tasks-store")),
    campoA: ["title", "Ligar à quinta"],
    campoB: ["done", true],
  },
  {
    nome: "suppliers",
    carregar: () => carregarMapper(import("./suppliers-store")),
    campoA: ["phone", "910000000"],
    campoB: ["notes", "Responde depressa"],
  },
  {
    nome: "material_list_items",
    carregar: () => carregarMapper(import("./material-list-items-store")),
    campoA: ["qty", 7],
    campoB: ["critical", true],
  },
  {
    nome: "event_material_items — dois telemóveis na mesma checklist",
    carregar: () => carregarMapper(import("./event-material-items-store")),
    campoA: ["loadedBy", "Rui"],
    campoB: ["missing", true],
  },
  {
    nome: "biblioteca_etiquetas",
    carregar: () => carregarMapper(import("./biblioteca-etiquetas-store")),
    campoA: ["nome", "terracotta"],
    campoB: ["ordem", 90],
  },
];

/** A linha mínima que qualquer `fromRow` sabe ler: só o id, o resto por omissão. */
function entidadeVazia(mapper: MapperQualquer, id: string): Record<string, unknown> {
  return mapper.fromRow({ id });
}

describe.each(CASOS)("bloqueio optimista — $nome", (caso) => {
  it("o mapper declara touch (sem isso não há comparação nenhuma)", async () => {
    const { mapper } = await caso.carregar();
    expect(mapper.touch).toBe(true);
  });

  it("duas escritas concorrentes: a segunda NÃO apaga a primeira em silêncio", async () => {
    const { mapper } = await caso.carregar();
    const sb = criarSupabaseFalso();
    const ana = new SupabaseBackend(mapper, sb);
    const rui = new SupabaseBackend(mapper, sb);
    await ana.insert(entidadeVazia(mapper, "x1"));

    // As duas pessoas abrem o mesmo registo.
    const lidoPelaAna = (await ana.get("x1"))!;
    const lidoPeloRui = (await rui.get("x1"))!;

    // O Rui grava primeiro.
    const [campoB, valorB] = caso.campoB;
    await rui.persist("x1", { ...lidoPeloRui, [campoB]: valorB }, lidoPeloRui);

    // A Ana grava por cima de uma leitura que já não é a actual. Tem de ser
    // RECUSADA — aceitá-la repunha o campo do Rui no valor velho.
    const [campoA, valorA] = caso.campoA;
    await expect(
      ana.persist("x1", { ...lidoPelaAna, [campoA]: valorA }, lidoPelaAna),
    ).rejects.toBeInstanceOf(ConflictError);

    // E o que o Rui escreveu continua lá.
    expect((await rui.get("x1"))![campoB]).toEqual(valorB);
  });

  it("a repetição optimista resolve o caso normal: sobrevivem as duas alterações", async () => {
    const { mapper } = await caso.carregar();
    const sb = criarSupabaseFalso();
    const real = new SupabaseBackend(mapper, sb);
    const intruso = new SupabaseBackend(mapper, sb);
    await real.insert(entidadeVazia(mapper, "x1"));

    const [campoA, valorA] = caso.campoA;
    const [campoB, valorB] = caso.campoB;

    // Uma escrita entra entre o `get` e o `persist` do `updateWith` — a janela
    // clássica da actualização perdida.
    let injectado = false;
    const embrulhado: Backend<Record<string, unknown>> = {
      list: () => real.list(),
      get: (id) => real.get(id),
      query: (c, v, p) => (real as Backend<Record<string, unknown>>).query(c, v, p),
      insert: (e) => real.insert(e),
      remove: (id) => real.remove(id),
      persist: async (id, merged, cas) => {
        if (!injectado) {
          injectado = true;
          const actual = (await intruso.get(id))!;
          await intruso.persist(id, { ...actual, [campoB]: valorB }, actual);
        }
        return real.persist(id, merged, cas);
      },
    };

    const repo = new Repository(mapper, () => embrulhado);
    const resultado = (await repo.update("x1", { [campoA]: valorA }))!;

    // O patch foi reaplicado sobre o estado fresco: nada se perdeu.
    expect(resultado[campoA]).toEqual(valorA);
    expect(resultado[campoB]).toEqual(valorB);
    const relido = (await real.get("x1"))!;
    expect(relido[campoA]).toEqual(valorA);
    expect(relido[campoB]).toEqual(valorB);
  });
});

// ── Os dois lados da protecção têm de existir ao mesmo tempo ──────────────
// Comparar sobre uma coluna que a base não tem não protege nada: faz TODAS as
// escritas da tabela falharem (`column ... does not exist`). Este teste lê o
// `db/schema.sql` a sério e prende a coluna a quem a compara.
describe("cada tabela com touch tem mesmo a coluna updated_at em db/schema.sql", () => {
  const MAPPERS_COM_TOUCH = [
    "./quotes-store",
    "./proposals-store",
    "./invoices-store",
    "./contracts-store",
    "./tasks-store",
    "./suppliers-store",
    "./inventory-store",
    "./material-store",
    "./material-lists-store",
    "./material-list-items-store",
    "./material-rules-store",
    "./event-material-store",
    "./event-material-items-store",
      "./biblioteca-fotos-store",
    "./biblioteca-etiquetas-store",
    "./overview-settings-store",
    "./themes-store",
    "./servicos-catalogo-store",
  ];

  it.each(MAPPERS_COM_TOUCH)("%s", async (modulo) => {
    const { mapper } = (await import(modulo)) as { mapper: MapperQualquer };
    if (!mapper.touch) return; // este teste só fala das que comparam

    const sql = await fs.readFile(path.join(process.cwd(), "db", "schema.sql"), "utf-8");
    const tabela = mapper.table;

    // Ou a coluna nasce com a tabela…
    const criacao = new RegExp(
      `create table if not exists public\\.${tabela}\\s*\\(([\\s\\S]*?)\\n\\);`,
      "i",
    ).exec(sql);
    const nasceCom = !!criacao && /\bupdated_at\b/.test(criacao[1]);
    // …ou chega por migração idempotente a uma instalação que já existia.
    const porMigracao = new RegExp(
      `alter table public\\.${tabela}\\s+add column if not exists\\s+updated_at`,
      "i",
    ).test(sql);

    expect(
      nasceCom || porMigracao,
      `${tabela} compara sobre updated_at mas db/schema.sql não garante a coluna`,
    ).toBe(true);
  });
});

// ── Uma colisão não pode acabar em silêncio nem em erro cru ───────────────
describe("o que chega a quem chama quando a repetição não resolve", () => {
  const mapper: Mapper<{ id: string; nome: string }> = {
    table: "widgets",
    fileName: "widgets.json",
    getId: (w) => w.id,
    toRow: (w) => ({ id: w.id, nome: w.nome }),
    fromRow: (r) => ({ id: String(r.id), nome: String(r.nome ?? "") }),
    touch: true,
  };

  /** Um backend em que alguém escreve SEMPRE primeiro: o conflito é perpétuo. */
  function repoSempreEmConflito() {
    const sb = criarSupabaseFalso();
    const real = new SupabaseBackend(mapper, sb);
    const intruso = new SupabaseBackend(mapper, sb);
    let n = 0;
    const embrulhado: Backend<{ id: string; nome: string }> = {
      list: () => real.list(),
      get: (id) => real.get(id),
      query: (c, v, p) => (real as Backend<{ id: string; nome: string }>).query(c, v, p),
      insert: (e) => real.insert(e),
      remove: (id) => real.remove(id),
      persist: async (id, merged, cas) => {
        const actual = (await intruso.get(id))!;
        await intruso.persist(id, { ...actual, nome: `intruso-${++n}` }, actual);
        return real.persist(id, merged, cas);
      },
    };
    return { real, repo: new Repository(mapper, () => embrulhado) };
  }

  it("atira ConflictError com a versão do servidor e o que se tentou gravar", async () => {
    const { repo, real } = repoSempreEmConflito();
    await real.insert({ id: "w1", nome: "original" });

    const err = await repo.update("w1", { nome: "meu texto" }).catch((e) => e);

    expect(isConflictError(err)).toBe(true);
    expect(err).toBeInstanceOf(ConflictError);
    // A versão do servidor, para o ecrã poder mostrar as duas lado a lado.
    expect((err as ConflictError).current).toMatchObject({ id: "w1" });
    expect(String((err as ConflictError).current?.nome)).toMatch(/^intruso-/);
    // E o que a pessoa escreveu, que não pode desaparecer da resposta.
    expect((err as ConflictError).attempted).toMatchObject({ nome: "meu texto" });
    expect((err as ConflictError).table).toBe("widgets");
  });

  it("a mensagem é dizível a uma pessoa, não um código", () => {
    expect(MENSAGEM_DE_CONFLITO).toMatch(/outra pessoa/i);
    expect(MENSAGEM_DE_CONFLITO).not.toMatch(/stale|CAS|updated_at|ConflictError/);
  });

  it("isConflictError reconhece o erro mesmo vindo de outra cópia do módulo", () => {
    // Em Next o mesmo módulo pode existir em mais do que um bundle; um
    // `instanceof` sozinho falharia e a colisão voltava a sair como 500.
    expect(isConflictError(Object.assign(new Error("x"), { name: "ConflictError" }))).toBe(true);
    expect(isConflictError(new Error("qualquer outra coisa"))).toBe(false);
    expect(isConflictError(null)).toBe(false);
  });

  it("não perde o que a pessoa escreveu: o texto dela viaja dentro do erro", async () => {
    const { repo, real } = repoSempreEmConflito();
    await real.insert({ id: "w1", nome: "original" });
    const err = (await repo
      .update("w1", { nome: "três horas de trabalho" })
      .catch((e) => e)) as ConflictError;
    expect(JSON.stringify(err.attempted)).toContain("três horas de trabalho");
  });
});
