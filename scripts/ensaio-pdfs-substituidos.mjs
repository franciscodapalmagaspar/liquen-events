#!/usr/bin/env node
/**
 * ENSAIO da limpeza nocturna dos PDF de proposta (`src/lib/limpar-pdfs-substituidos.ts`).
 *
 * Faz as MESMAS leituras que a limpeza das quatro da manhã e diz o que sairia,
 * ficheiro a ficheiro, com a soma em MB. Não grava a lista de espera e não
 * apaga nada: só lê o Storage e as tabelas.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/ensaio-pdfs-substituidos.mjs
 *
 * «sai hoje» = já cumpriu os 7 dias na lista de espera e sairia na próxima
 * noite (até 10 por noite). Os outros entram na espera e saem 7 dias depois.
 */
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (
  !(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  console.error("Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(raiz, "src"),
    // `server-only` só existe para o empacotador do Next; aqui é um módulo vazio.
    "server-only": path.join(raiz, "node_modules/next/dist/compiled/server-only/empty.js"),
  },
});
const { limparPdfsSubstituidos } = await jiti.import(
  path.join(raiz, "src/lib/limpar-pdfs-substituidos.ts"),
);
const r = await limparPdfsSubstituidos(new Date(), 120_000, { ensaio: true });
if (!r.acabou || !r.lista) {
  console.error("Uma leitura falhou: a limpeza não apagaria nada esta noite.", r);
  process.exit(2);
}
const mb = (b) => (b / 1048576).toFixed(2);
for (const f of r.lista) {
  console.log(
    `${f.saiaHoje ? "sai hoje " : "em espera"}  ${mb(f.bytes ?? 0).padStart(6)} MB  ${f.criado.slice(0, 10)}  ${f.caminho}`,
  );
}
const hoje = r.lista.filter((f) => f.saiaHoje);
console.log(
  `\n${r.lista.length} PDF, ${mb(r.bytes ?? 0)} MB sairiam` +
    ` (${hoje.length} já cumpriram a espera: ${mb(hoje.reduce((s, f) => s + (f.bytes ?? 0), 0))} MB).`,
);
