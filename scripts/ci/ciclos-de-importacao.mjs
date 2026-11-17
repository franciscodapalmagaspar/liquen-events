#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════════
 * NENHUM CICLO DE IMPORTAÇÃO NOVO (fase 0 de `docs/ESTRUTURA-DO-CODIGO.md`)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Partir os ficheiros grandes tem um risco real, e é este: uma função que sai
 * para `lib/` e continua a importar alguma coisa do componente de onde saiu.
 * Fica um ciclo, e um ciclo de valores é o que faz um módulo chegar a
 * `undefined` no arranque, sem erro nenhum na compilação.
 *
 * O `madge` lê o grafo (a configuração está no `.madgerc`: só VALORES — os
 * `import type` apagam-se na compilação e não partem nada). Os três ciclos que
 * já existiam passam todos por um `import()` dinâmico e não fecham no arranque
 * (§2.5 do documento); ficam na lista de baixo. Um ciclo que não esteja nela
 * põe o CI vermelho. Um da lista que desapareça pede para sair da lista —
 * a lista só pode encolher.
 *
 * Custo: corre no CI do GitHub (~15 s, mais o `npx` a trazer o `madge`), não
 * na Vercel nem no Supabase.
 */
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Os ciclos de hoje (17/11), cada um pela ordem em que o `madge` o escreve. */
export const CICLOS_CONHECIDOS = [
  "app/[lang]/(admin)/orcamento/admin/lazy.tsx > app/[lang]/(admin)/orcamento/admin/FazerProposta.tsx",
  "lib/admin-auth.ts > lib/sessoes-revogadas.ts",
  "lib/proposta-web/modelo.ts > lib/proposta-web/retrato.ts",
];

/**
 * Compara os ciclos encontrados com os conhecidos.
 *
 * `cego` é o caso em que o `madge` não viu ciclo NENHUM, nem os conhecidos:
 * é muito mais provável que tenha deixado de ler o grafo (um `tsconfig` que
 * não resolve, ficheiros saltados) do que os três terem desaparecido juntos.
 * Uma varredura tem de provar que varre; se um dia os três se resolverem
 * mesmo, a lista fica vazia e isto deixa de se aplicar.
 *
 * @param {string[][]} encontrados a saída `--json` do `madge --circular`
 * @param {string[]} conhecidos
 */
export function compararCiclos(encontrados, conhecidos = CICLOS_CONHECIDOS) {
  const vistos = encontrados.map((c) => c.join(" > "));
  return {
    novos: vistos.filter((c) => !conhecidos.includes(c)),
    resolvidos: conhecidos.filter((c) => !vistos.includes(c)),
    cego: conhecidos.length > 0 && vistos.length === 0,
  };
}

/**
 * A lista de ciclos que o `madge` devolveu, ou `null` se não devolveu uma.
 *
 * Um `npx` que nem arranca deixa `stdout` a `null`, e `JSON.parse(null)` dá
 * `null` sem atirar: a pergunta é se veio uma LISTA de listas, não se o texto
 * se leu.
 *
 * @param {{ error?: unknown, stdout?: string | null }} r o resultado do `spawnSync`
 * @returns {string[][] | null}
 */
export function lerCiclosDoMadge(r) {
  if (r.error || typeof r.stdout !== "string") return null;
  let lido;
  try {
    lido = JSON.parse(r.stdout);
  } catch {
    return null;
  }
  return Array.isArray(lido) && lido.every((c) => Array.isArray(c)) ? lido : null;
}

function principal() {
  // O `madge` sai com 1 sempre que encontra um ciclo, conhecido ou não: quem
  // decide é a comparação, não o código de saída dele. O tecto de tempo é
  // para um registo de pacotes que pendure o `npx`: sem ele, o job ficava
  // parado até ao limite do GitHub em vez de falhar com uma frase.
  const r = spawnSync(
    "npx",
    ["--yes", "madge@8.0.0", "--circular", "--json", "--no-spinner", "src"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 180_000 },
  );
  const encontrados = lerCiclosDoMadge(r);
  if (!encontrados) {
    console.error("O madge não devolveu a lista de ciclos:\n", r.stdout, r.stderr, r.error ?? "");
    process.exit(1);
  }
  const { novos, resolvidos, cego } = compararCiclos(encontrados);
  if (cego) {
    console.error(
      "O madge não encontrou ciclo nenhum, nem os conhecidos: é mais provável que tenha deixado de ler o grafo. " +
        "Se os conhecidos se resolveram mesmo, esvazia CICLOS_CONHECIDOS.",
    );
    process.exit(1);
  }
  if (resolvidos.length) {
    console.log("Estes ciclos já não existem — tira-os de CICLOS_CONHECIDOS:");
    for (const c of resolvidos) console.log(`  · ${c}`);
  }
  if (novos.length) {
    console.error("Ciclos de importação NOVOS (só valores):");
    for (const c of novos) console.error(`  ✗ ${c}`);
    console.error(
      "\nUm ciclo novo parte-se, não se acrescenta à lista: quem saiu para `lib/` não importa de volta o componente.",
    );
    process.exit(1);
  }
  console.log(`✓ nenhum ciclo novo (${CICLOS_CONHECIDOS.length - resolvidos.length} conhecidos)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) principal();
