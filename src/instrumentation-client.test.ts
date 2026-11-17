import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * O BACK OFFICE NÃO PODE PEDIR `eval` À CSP.
 *
 * 81 relatórios em 7 dias (`script-src`, `blockedUri: eval`), todos do back
 * office: o Zod 4 sonda `new Function("")` ao criar o primeiro `z.object()`, e
 * a CSP de produção recusa e reporta. A nota inteira está em
 * `instrumentation-client.ts`.
 *
 * Cada caso corre num `node` À PARTE, e não dentro do vitest: o Zod guarda a
 * resposta da sonda e a configuração na primeira vez que é carregado, e o
 * vitest não recarrega o que vem de `node_modules` (o `resetModules` não lhe
 * toca). Num processo novo, a ordem é a do browser: primeiro a instrumentação
 * (ou nada, como antes), depois o Zod.
 *
 * O que se conta é cada chamada ao construtor `Function` — exactamente o que o
 * browser vê como `eval` e a CSP recusa.
 */

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const INSTRUMENTACAO = fileURLToPath(new URL("./instrumentation-client.ts", import.meta.url));

const SONDA = `
const original = globalThis.Function;
let chamadas = 0;
globalThis.Function = new Proxy(original, {
  construct(alvo, args) { chamadas++; return Reflect.construct(alvo, args); },
  apply(alvo, eu, args) { chamadas++; return Reflect.apply(alvo, eu, args); },
});
if (process.env.INSTRUMENTACAO) await import(process.env.INSTRUMENTACAO);
const { z } = await import("zod");
const esquema = z.object({ nome: z.string(), pessoas: z.number().int() });
const valido = esquema.safeParse({ nome: "Teste", pessoas: 80 }).success;
const invalido = esquema.safeParse({ nome: 1 }).success;
console.log(JSON.stringify({ chamadas, valido, invalido, jitless: z.config().jitless ?? null }));
`;

type Resultado = { chamadas: number; valido: boolean; invalido: boolean; jitless: boolean | null };

function correr(comInstrumentacao: boolean): Resultado {
  const saida = execFileSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", SONDA],
    {
      cwd: RAIZ,
      encoding: "utf8",
      env: { ...process.env, INSTRUMENTACAO: comInstrumentacao ? INSTRUMENTACAO : "" },
    },
  );
  return JSON.parse(saida.trim().split("\n").at(-1)!) as Resultado;
}

describe("instrumentation-client × Zod", () => {
  it("o Zod, sozinho, pede `new Function` — é a causa dos relatórios", () => {
    // Se isto deixar de ser verdade (o Zod deixou de sondar), o
    // instrumentation-client.ts pode sair; enquanto for, faz falta.
    expect(correr(false).chamadas).toBeGreaterThan(0);
  });

  it("com a instrumentação carregada primeiro, o Zod nunca chama `Function`", () => {
    const r = correr(true);
    expect(r.chamadas).toBe(0);
    // O Zod lê a configuração no sítio onde a instrumentação a escreve…
    expect(r.jitless).toBe(true);
    // …e continua a validar como antes, só sem o analisador compilado.
    expect(r.valido).toBe(true);
    expect(r.invalido).toBe(false);
  });
});
