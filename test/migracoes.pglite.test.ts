import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS MIGRAÇÕES NUM POSTGRES A SÉRIO — sem serviço nenhum, sem custo
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Até aqui as migrações e as voltas foram provadas numa base local, à mão, e no
 * CI só havia testes que prendem o TEXTO (P13 de `docs/ESTRUTURA-DOS-DADOS.md`).
 * O PGlite é o Postgres compilado para WebAssembly (npm, grátis, dentro do
 * processo do vitest): arranca em segundos, sem Docker nem rede.
 *
 * O que se prova:
 *  1. o `db/schema.sql` corre numa base vazia, e outra vez por cima (idempotente);
 *  2. cada migração corre por cima do schema, a sua volta desfá-la, e a
 *     migração corre outra vez — sem erro;
 *  3. o que o P5 promete: apagar um pedido leva as tarefas (cascata) e deixa
 *     contratos, faturas e propostas soltos (`set null`);
 *  4. a função do P7b: o último código gravado é o atual, há um só atual por
 *     proposta, e uma colisão não pisa nada;
 *  5. a cópia do P7 corre duas vezes sem duplicar e deixa de fora uma data
 *     impossível.
 *
 * O PGlite é Postgres 18; produção é ≥ 16 (a cópia, com `pg_input_is_valid`,
 * correu lá). Os papéis do Supabase (`anon`, `authenticated`, `service_role`)
 * não existem numa base nova: criam-se antes, porque o schema lhes dá e tira
 * permissões. Custo no CI: ~6 s de arranque do WebAssembly e < 1 s de SQL.
 */

const DB = path.join(process.cwd(), "db");
const ler = (f: string) => fs.readFileSync(path.join(DB, f), "utf8");
const MIGRACOES = "migracoes/";

let db: PGlite;

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(ler("schema.sql"));
}, 60_000);

afterAll(async () => {
  await db?.close();
});

const um = async <T>(sql: string, params: unknown[] = []): Promise<T> =>
  (await db.query<T>(sql, params)).rows[0];

describe("o db/schema.sql", () => {
  it("corre outra vez por cima de si próprio, sem erro", async () => {
    await expect(db.exec(ler("schema.sql"))).resolves.toBeDefined();
  });

  it("deixa as chaves estrangeiras do P5 validadas", async () => {
    const r = await db.query<{ conname: string; convalidated: boolean }>(
      `select conname, convalidated from pg_constraint
        where conname in ('tasks_quote_id_fkey','invoices_quote_id_fkey','contracts_quote_id_fkey')
        order by conname`,
    );
    expect(r.rows).toEqual([
      { conname: "contracts_quote_id_fkey", convalidated: true },
      { conname: "invoices_quote_id_fkey", convalidated: true },
      { conname: "tasks_quote_id_fkey", convalidated: true },
    ]);
  });
});

describe("cada migração, a sua volta, e a migração outra vez", () => {
  const ciclos: [string, string[]][] = [
    [
      "P4",
      [
        "20261117_p4_validar_checks_e_indices.sql",
        "20261117_p4_validar_checks_e_indices.volta.sql",
        "20261117_p4_validar_checks_e_indices.sql",
      ],
    ],
    [
      "P5",
      [
        "20261117_p5_chaves_estrangeiras_para_quotes.sql",
        "20261117_p5_chaves_estrangeiras_para_quotes.volta.sql",
        "20261117_p5_chaves_estrangeiras_para_quotes.sql",
      ],
    ],
    [
      "P7 (com a cópia e o P7b)",
      [
        "20261118_p7_ligacoes_de_proposta.sql",
        "20261118_p7_ligacoes_de_proposta.copia.sql",
        "20261118_p7b_gravar_ligacao_por_proposta.sql",
        "20261118_p7_ligacoes_de_proposta.volta.sql",
        "20261118_p7_ligacoes_de_proposta.sql",
        "20261118_p7_ligacoes_de_proposta.copia.sql",
        "20261118_p7b_gravar_ligacao_por_proposta.sql",
      ],
    ],
  ];
  for (const [nome, ficheiros] of ciclos) {
    it(nome, async () => {
      for (const f of ficheiros) {
        await expect(db.exec(ler(MIGRACOES + f)), f).resolves.toBeDefined();
      }
    });
  }

  it("a volta do P5 tira as chaves, e a migração repõe-nas", async () => {
    await db.exec(ler(`${MIGRACOES}20261117_p5_chaves_estrangeiras_para_quotes.volta.sql`));
    const sem = await um<{ n: number }>(
      "select count(*)::int n from pg_constraint where conname = 'tasks_quote_id_fkey'",
    );
    expect(sem.n).toBe(0);
    await db.exec(ler(`${MIGRACOES}20261117_p5_chaves_estrangeiras_para_quotes.sql`));
    const com = await um<{ n: number }>(
      "select count(*)::int n from pg_constraint where conname = 'tasks_quote_id_fkey'",
    );
    expect(com.n).toBe(1);
  });
});

describe("P5: o que acontece às linhas de um pedido apagado", () => {
  it("as tarefas vão com ele; contratos, faturas e propostas ficam soltos", async () => {
    await db.exec(`
      insert into public.quotes (id, data) values ('Q-P5', '{}');
      insert into public.tasks (title, quote_id) values ('TESTE', 'Q-P5');
      insert into public.contracts (id, quote_id) values ('C-P5', 'Q-P5');
      insert into public.invoices (id, number, quote_id) values ('F-P5', 'FT 1', 'Q-P5');
      insert into public.proposals (id, quote_id)
        values ('11111111-1111-4111-8111-111111111111', 'Q-P5');
      delete from public.quotes where id = 'Q-P5';
    `);
    const r = await um<{
      tarefas: number;
      contrato: string | null;
      fatura: string | null;
      proposta: string | null;
    }>(`
      select
        (select count(*)::int from public.tasks where title = 'TESTE') tarefas,
        (select quote_id from public.contracts where id = 'C-P5') contrato,
        (select quote_id from public.invoices where id = 'F-P5') fatura,
        (select quote_id from public.proposals where id = '11111111-1111-4111-8111-111111111111') proposta
    `);
    expect(r).toEqual({ tarefas: 0, contrato: null, fatura: null, proposta: null });
  });

  it("uma tarefa para um pedido que não existe é recusada pela base (23503)", async () => {
    await expect(
      db.exec("insert into public.tasks (title, quote_id) values ('TESTE', 'Q-NAO-HA')"),
    ).rejects.toMatchObject({ code: "23503" });
  });
});

describe("P7b: gravar_ligacao_de_proposta", () => {
  const PROPOSTA = "22222222-2222-4222-8222-222222222222";
  const gravar = (codigo: string) =>
    um<{ ok: boolean }>(
      "select public.gravar_ligacao_de_proposta($1, $2, now(), now() + interval '30 days') ok",
      [codigo, PROPOSTA],
    );

  beforeAll(async () => {
    await db.exec(`insert into public.proposals (id) values ('${PROPOSTA}')`);
  });

  it("o último gravado é o atual, e há um só atual por proposta", async () => {
    expect((await gravar("aaaa1111bbbb")).ok).toBe(true);
    expect((await gravar("cccc2222dddd")).ok).toBe(true);
    const r = await db.query<{ codigo: string; atual: boolean }>(
      "select codigo, atual from public.ligacoes_de_proposta where proposal_id = $1 order by codigo",
      [PROPOSTA],
    );
    expect(r.rows).toEqual([
      { codigo: "aaaa1111bbbb", atual: false },
      { codigo: "cccc2222dddd", atual: true },
    ]);
  });

  it("um código que já existe devolve false e não muda o atual", async () => {
    expect((await gravar("aaaa1111bbbb")).ok).toBe(false);
    const atual = await um<{ codigo: string }>(
      "select codigo from public.ligacoes_de_proposta where proposal_id = $1 and atual",
      [PROPOSTA],
    );
    expect(atual.codigo).toBe("cccc2222dddd");
  });
});

describe("P7: a cópia do app_state", () => {
  const PROPOSTA = "33333333-3333-4333-8333-333333333333";

  beforeAll(async () => {
    await db.exec(`
      insert into public.proposals (id) values ('${PROPOSTA}');
      insert into public.app_state (key, value) values
        ('ligacao-proposta:k7m2q9xdabcd',
          '{"propostaId": "${PROPOSTA}", "criadaEm": "2026-11-01T00:00:00Z", "expiraEm": "2027-01-01T00:00:00Z"}'),
        ('ligacao-proposta:z9z9z9z9z9z9',
          '{"propostaId": "${PROPOSTA}", "criadaEm": "2026-02-30T00:00:00Z"}'),
        ('ligacao-de-proposta:${PROPOSTA}', '{"codigo": "k7m2q9xdabcd"}');
    `);
  });

  it("corre duas vezes sem duplicar, acerta o atual, e deixa de fora a data impossível", async () => {
    const copia = ler(`${MIGRACOES}20261118_p7_ligacoes_de_proposta.copia.sql`);
    await db.exec(copia);
    await db.exec(copia);
    const r = await db.query<{ codigo: string; atual: boolean }>(
      "select codigo, atual from public.ligacoes_de_proposta where proposal_id = $1",
      [PROPOSTA],
    );
    expect(r.rows).toEqual([{ codigo: "k7m2q9xdabcd", atual: true }]);
  });
});
