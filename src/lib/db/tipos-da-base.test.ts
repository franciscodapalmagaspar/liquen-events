import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { diferencasEntre, esquemaDoSql, esquemaDosTipos } from "../../../test/comparar-esquemas";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O schema.sql E OS TIPOS GERADOS CONTAM A MESMA HISTÓRIA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `tipos-da-base.ts` gera-se da base de dados VIVA (ferramenta
 * `generate_typescript_types` do Supabase, ou `supabase gen types typescript
 * --project-id <projeto>`); nunca se edita à mão. `db/schema.sql` escreve-se à
 * mão. Se discordam, ou há uma migração por aplicar, ou a base mudou sem o
 * ficheiro — e o código, que confia num deles, está errado sobre o outro.
 *
 * Sem rede: o CI não tem a chave do Supabase, e não deve ter. Quem prende os
 * tipos à base viva é regenerá-los; este teste prende o resto.
 */

/**
 * O QUE HOJE DISCORDA, E PORQUÊ. A lista tem de bater EXATAMENTE com o que o
 * teste encontra: uma divergência nova fica vermelha, e uma resolvida também
 * (sai da lista no mesmo PR que a resolve).
 */
const DIVERGENCIAS_CONHECIDAS: Record<string, string> = {
  // Vazia desde 18/11: as quatro colunas do painel de detalhe das tarefas
  // (db/migracoes/20261117_tarefas_painel_de_detalhe.sql) foram aplicadas em
  // produção, e os tipos regenerados da base viva já as trazem.
};

async function ler(...partes: string[]): Promise<string> {
  return fs.readFile(path.join(process.cwd(), ...partes), "utf-8");
}

describe("db/schema.sql ↔ src/lib/db/tipos-da-base.ts", () => {
  it("só discordam onde está escrito porquê", async () => {
    const ficheiro = esquemaDoSql(await ler("db", "schema.sql"));
    const base = esquemaDosTipos(await ler("src", "lib", "db", "tipos-da-base.ts"));
    expect(diferencasEntre(ficheiro, base)).toEqual(Object.keys(DIVERGENCIAS_CONHECIDAS).sort());
  });

  it("as duas descrições têm as mesmas 31 tabelas", async () => {
    const ficheiro = esquemaDoSql(await ler("db", "schema.sql"));
    const base = esquemaDosTipos(await ler("src", "lib", "db", "tipos-da-base.ts"));
    expect([...ficheiro.keys()].sort()).toEqual([...base.keys()].sort());
    // Exato: uma tabela nova (ou apagada) muda este número no mesmo PR.
    expect(base.size).toBe(31);
  });
});

// ── O leitor, provado em pequeno ────────────────────────────────────────────

const TIPOS = `
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
export type Database = {
  public: {
    Tables: {
      coisas: {
        Row: { id: string; nota: string | null; n: number; dados: Json | null; ok: boolean }
        Insert: { id: string }
        Update: { id?: string }
        Relationships: []
      }
    }
  }
}`;

describe("comparar-esquemas", () => {
  const sql = (corpo: string, depois = "") =>
    `create table if not exists public.coisas (\n${corpo}\n);\n${depois}`;
  const igual = sql(
    [
      "  id   text primary key,",
      "  nota text, -- um comentário, com vírgula",
      "  n    numeric(10, 2) not null default 0,",
      "  dados jsonb,",
      "  ok   boolean not null default false",
    ].join("\n"),
  );

  it("o mesmo esquema nos dois lados não dá diferenças", () => {
    expect(diferencasEntre(esquemaDoSql(igual), esquemaDosTipos(TIPOS))).toEqual([]);
  });

  it("apanha a coluna acrescentada por `alter table` que a base não tem", () => {
    const comMais = igual + "alter table public.coisas add column if not exists extra text;";
    expect(diferencasEntre(esquemaDoSql(comMais), esquemaDosTipos(TIPOS))).toEqual([
      "coisas.extra: existe no schema.sql e não na base",
    ]);
  });

  it("apanha a coluna que a base tem e o ficheiro não", () => {
    const semOk = igual.replace(",\n  ok   boolean not null default false", "");
    expect(diferencasEntre(esquemaDoSql(semOk), esquemaDosTipos(TIPOS))).toEqual([
      "coisas.ok: existe na base e não no schema.sql",
    ]);
  });

  it("apanha o tipo e a anulabilidade trocados", () => {
    const trocado = igual.replace("n    numeric(10, 2) not null", "n    text");
    expect(diferencasEntre(esquemaDoSql(trocado), esquemaDosTipos(TIPOS))).toEqual([
      "coisas.n: anulável no schema.sql, not null na base",
      "coisas.n: tipo string no schema.sql, number na base",
    ]);
  });

  it("`primary key (col)` ao nível da tabela torna a coluna not null", () => {
    const pkDeTabela = igual.replace("id   text primary key,", "id   text,\n  primary key (id),");
    expect(diferencasEntre(esquemaDoSql(pkDeTabela), esquemaDosTipos(TIPOS))).toEqual([]);
  });

  it("apanha a tabela que só existe de um lado", () => {
    const outra = igual + "\ncreate table if not exists public.outra (\n  id text primary key\n);";
    expect(diferencasEntre(esquemaDoSql(outra), esquemaDosTipos(TIPOS))).toEqual([
      "outra: existe no schema.sql e não na base",
    ]);
  });

  it("lê várias cláusulas num `alter table`, o `set/drop not null` e as listas", () => {
    const sql =
      igual +
      "alter table public.coisas add column if not exists a text[], add column if not exists b int;\n" +
      "alter table public.coisas alter column nota set not null;\n";
    const lido = esquemaDoSql(sql).get("coisas");
    expect(lido?.get("a")).toMatchObject({ tipo: "string[]", anulavel: true });
    expect(lido?.get("b")).toMatchObject({ tipo: "number", anulavel: true });
    expect(lido?.get("nota")).toMatchObject({ anulavel: false });
  });

  it("um tipo SQL que não conhece é um erro, não um `string` por omissão", () => {
    expect(() => esquemaDoSql(sql("  id interval primary key"))).toThrow(/interval/);
  });

  // O que muda colunas de outra maneira o leitor não segue: diz-se que é ELE
  // que não sabe, em vez de inventar uma divergência (ou de a esconder).
  it.each([
    ["drop column", "alter table public.coisas drop column nota;"],
    ["rename", "alter table public.coisas rename column nota to notas;"],
    ["alter column … type", "alter table public.coisas alter column n type integer;"],
  ])("`%s` é um erro do leitor, dito como tal", (_nome, alteracao) => {
    expect(() => esquemaDoSql(igual + alteracao)).toThrow(/não sabe ler/);
  });
});
