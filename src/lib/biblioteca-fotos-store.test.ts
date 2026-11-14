import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseBackend } from "./repository";
import { mapper } from "./biblioteca-fotos-store";

/**
 * A Biblioteca lê a `biblioteca_fotos` INTEIRA a cada página. A coluna `urls`
 * (a cache dos endereços assinados da página do casal, até ~1,7 KB por linha)
 * não pode vir nessa leitura: seriam quilobytes por linha de saída do Supabase,
 * pagos no plano gratuito, por uma coisa que a lista não usa (revisão de 14/11).
 */

/** Um cliente que só regista as colunas pedidas e responde vazio. */
function clienteQueRegista() {
  const pedidas: string[] = [];
  const cadeia = (): unknown =>
    new Proxy(
      {},
      {
        get(_alvo, nome) {
          if (nome === "then") {
            return (ok: (v: unknown) => void) => ok({ data: [], error: null, status: 200 });
          }
          if (nome === "maybeSingle") {
            return () => ({
              then: (ok: (v: unknown) => void) => ok({ data: null, error: null, status: 200 }),
            });
          }
          return (...args: unknown[]) => {
            if (nome === "select") pedidas.push(String(args[0]));
            return cadeia();
          };
        },
      },
    );
  const sb = { from: () => cadeia() } as unknown as SupabaseClient;
  return { sb, pedidas };
}

const colunas = (s: string) => s.split(",").map((c) => c.trim());

describe("a lista da Biblioteca nunca pede a coluna `urls`", () => {
  it("list, get e where pedem colunas escritas, sem `*` e sem `urls`", async () => {
    const { sb, pedidas } = clienteQueRegista();
    const backend = new SupabaseBackend(mapper, sb);
    await backend.list();
    await backend.get("tema/x.jpg");
    await backend.query("pasta", "tema");
    expect(pedidas.length).toBe(3);
    for (const p of pedidas) {
      expect(p).not.toBe("*");
      expect(colunas(p)).not.toContain("urls");
      // O carimbo do compare-and-set vem sempre — e uma vez só.
      expect(colunas(p).filter((c) => c === "updated_at")).toHaveLength(1);
    }
  });

  it("tudo o que o mapper grava e lê está na lista de colunas", () => {
    const pedidas = colunas(mapper.selectColumns ?? "*");
    const escritas = Object.keys(mapper.toRow({ path: "t/x.jpg", pasta: "t" } as never));
    for (const c of escritas) expect(pedidas, `falta «${c}»`).toContain(c);
    expect(pedidas).toContain("pasta");
  });
});
