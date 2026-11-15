import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NENHUM CAMPO PEDE AO IPHONE QUE AMPLIE A PÁGINA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O Safari do iOS amplia a página quando um campo com letra abaixo de 16 px
 * recebe o foco, e não a desfaz. A casa resolve isto UMA vez, no `globals.css`:
 * sob `(pointer: coarse)`, `input, textarea, select { font-size: 16px }`.
 *
 * Essa regra não tem camada, e por isso ganha aos utilitários normais do
 * Tailwind (que vivem em `@layer utilities`). Mas NÃO ganha a um utilitário com
 * `!`: numa cascata com camadas, um `!important` dentro de uma camada vence um
 * `!important` fora dela, e vence de certeza uma regra sem `!`. Foi assim que
 * três campos ficaram a 12 e 14 px no telemóvel (auditoria de 14/11): o corpo
 * dos modelos de email (`!text-xs`, nas duas versões) e o título de cada grupo
 * de serviços (`!text-sm`) — o campo mais escrito do estúdio.
 *
 * A regra deste ficheiro: um `!text-…` pequeno no back office leva sempre o
 * `pointer-coarse:!text-base` ao lado, na mesma cadeia.
 */

const RAIZ = "src/app/[lang]/(admin)";
const PEQUENO =
  /(^|[\s"'`])!text-(xs|sm|\[(?:[0-9]|1[0-5])(?:\.\d+)?px\]|\[0?\.\d+rem\])(?=[\s"'`]|$)/;

function ficheiros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return ficheiros(p);
    return /\.tsx$/.test(n) && !/\.test\.tsx$/.test(n) ? [p] : [];
  });
}

/** As cadeias (entre aspas ou crases) que trazem um `!text-` pequeno. */
function cadeiasComLetraForcada(fonte: string): string[] {
  const cadeias = fonte.match(/"[^"\n]*"|`[^`]*`/g) ?? [];
  return cadeias.filter((c) => PEQUENO.test(c));
}

describe("nenhum campo pede ao iPhone que amplie a página", () => {
  it("a regra apanha os três que lá estavam (controlo positivo)", () => {
    expect(
      cadeiasComLetraForcada("className={`${inputCls} w-full font-mono !text-xs`}"),
    ).toHaveLength(1);
    expect(cadeiasComLetraForcada('className="flex-1 !text-sm font-semibold"')).toHaveLength(1);
    expect(cadeiasComLetraForcada('className="!text-[13px]"')).toHaveLength(1);
    expect(cadeiasComLetraForcada('className="!text-base"')).toHaveLength(0);
    expect(cadeiasComLetraForcada('className="!text-[18px]"')).toHaveLength(0);
  });

  it("cada `!text-` pequeno do back office traz o `pointer-coarse:!text-base` ao lado", () => {
    const culpados: string[] = [];
    for (const f of ficheiros(RAIZ)) {
      for (const c of cadeiasComLetraForcada(readFileSync(f, "utf8"))) {
        if (!c.includes("pointer-coarse:!text-base")) culpados.push(`${f}: ${c.slice(0, 120)}`);
      }
    }
    expect(culpados).toEqual([]);
  });
});
