#!/usr/bin/env node
/**
 * Regenera `src/lib/db/tipos-da-base.ts` a partir da base de dados VIVA
 * (docs/ESTRUTURA-DOS-DADOS.md, P1). Corre-se à mão, na máquina de quem
 * aplicou uma migração — nunca no CI, que não tem (nem deve ter) chave.
 *
 *   SUPABASE_PROJECT_REF=<ref> npm run tipos:base
 *
 * Precisa da CLI do Supabase instalada e com sessão iniciada (`supabase
 * login`, ou SUPABASE_ACCESS_TOKEN no ambiente). Nenhuma chave passa por este
 * ficheiro nem por nenhum outro do repositório: a CLI lê a sua.
 *
 * Só lê o esquema (não os dados). Depois de correr, `npx vitest run
 * src/lib/db` diz se o `db/schema.sql` e os tipos contam a mesma história.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

const ref = process.env.SUPABASE_PROJECT_REF;
if (!ref || !/^[a-z0-9]{10,40}$/.test(ref)) {
  console.error("Falta SUPABASE_PROJECT_REF (a referência do projeto, no painel do Supabase).");
  process.exit(1);
}

const gerado = spawnSync(
  "supabase",
  ["gen", "types", "typescript", "--project-id", ref, "--schema", "public"],
  { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
);
if (gerado.error) {
  console.error(
    "Não encontrei a CLI do Supabase (`supabase`). Instala-a e corre `supabase login`.",
  );
  process.exit(1);
}
if (gerado.status !== 0 || !gerado.stdout.includes("export type Database")) {
  console.error("A CLI do Supabase não gerou os tipos:\n" + gerado.stderr);
  process.exit(gerado.status || 1);
}

const destino = path.join(process.cwd(), "src", "lib", "db", "tipos-da-base.ts");
writeFileSync(destino, gerado.stdout);
const formatado = spawnSync("npx", ["prettier", "--write", destino], { stdio: "inherit" });
process.exit(formatado.status ?? 0);
