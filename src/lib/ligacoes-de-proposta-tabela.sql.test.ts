import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * P7b (18/11): `gravar_ligacao_de_proposta` corre em fila por proposta
 * (`pg_advisory_xact_lock`). Sem a fila, duas gravações ao mesmo tempo para a
 * mesma proposta colidiam no índice único `ligacoes_de_proposta_uma_atual` e a
 * segunda desfazia-se (provado numa base Postgres local, 23505).
 *
 * O CI não tem Postgres; isto prende o texto: a definição que o db/schema.sql
 * cria e a ÚLTIMA migração que redefine a função têm de levar a fila. Um
 * `create or replace` futuro sem ela fica vermelho aqui.
 */
const RAIZ = process.cwd();
const FUNCAO = /create or replace function public\.gravar_ligacao_de_proposta[\s\S]*?\n\$\$;/g;

function definicoes(sql: string): string[] {
  return [...sql.matchAll(FUNCAO)].map((m) => m[0]);
}

describe("gravar_ligacao_de_proposta corre em fila por proposta", () => {
  it("no db/schema.sql", () => {
    const defs = definicoes(readFileSync(path.join(RAIZ, "db", "schema.sql"), "utf-8"));
    expect(defs).toHaveLength(1);
    expect(defs[0]).toMatch(/pg_advisory_xact_lock\(/);
    expect(defs[0]).toContain("p_proposal_id");
  });

  it("na última migração que a redefine", () => {
    const pasta = path.join(RAIZ, "db", "migracoes");
    const comAFuncao = readdirSync(pasta)
      .filter((f) => f.endsWith(".sql") && !f.endsWith(".volta.sql"))
      .sort()
      .map((f) => readFileSync(path.join(pasta, f), "utf-8"))
      .filter((sql) => definicoes(sql).length > 0);
    expect(comAFuncao.length).toBeGreaterThanOrEqual(2);
    const ultima = definicoes(comAFuncao[comAFuncao.length - 1]).at(-1)!;
    expect(ultima).toMatch(/pg_advisory_xact_lock\(/);
  });
});
