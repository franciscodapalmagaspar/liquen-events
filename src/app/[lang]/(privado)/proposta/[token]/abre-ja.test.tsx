import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PROPOSTA NÃO MOSTRA ESQUELETO NENHUM ENQUANTO CHEGA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (28/10), com a captura de uma proposta de um casal a abrir: «quando abri
 * a proposta online de um cliente aparece isto no loading antes de abrir a
 * proposta... retira isto imediatamente». O «isto» era o `loading.tsx` desta
 * rota — uma página branca com o logótipo e caixas cinzentas, do desenho
 * antigo, que não tem nada a ver com a proposta que chega a seguir.
 *
 * Sem ele, o browser fica no ecrã de onde se veio (o email) com o indicador
 * de carregamento no separador, e passa directamente para a proposta. A espera
 * é curta: o retrato da página (`proposta-web/retrato.ts`) é uma leitura só,
 * e desde o #301 já não expira com as fotografias de tema.
 *
 * Este teste prende a decisão: nenhum ecrã de espera na rota da proposta, nem
 * nos segmentos por cima dela dentro do ramo privado.
 */

const RAIZ = "src/app/[lang]/(privado)";

describe("a proposta abre sem ecrã de espera (ela, 28/10: «retira isto imediatamente»)", () => {
  it("não há `loading.tsx` na rota da proposta", () => {
    expect(existsSync(join(RAIZ, "proposta/[token]/loading.tsx"))).toBe(false);
  });

  it("nem em nenhum segmento por cima dela, no ramo privado", () => {
    for (const dir of [RAIZ, join(RAIZ, "proposta")]) {
      const ficheiros = readdirSync(dir);
      expect(
        ficheiros.filter((f) => /^loading\.(t|j)sx?$/.test(f)),
        `apareceu um ecrã de espera em ${dir}`,
      ).toEqual([]);
    }
  });
});
