import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ESTADOS_DO_PEDIDO } from "./estado-do-pedido";

/**
 * Os estados do pedido vivem numa lista só (`ESTADOS_DO_PEDIDO`), e a base de
 * dados tem a sua própria (`quotes_status_chk`). As duas têm de dizer o mesmo:
 * um estado que a aplicação conhece e a base recusa dá erro ao gravar (foi o
 * que aconteceu com o `a_preparar`, 6/11).
 */
describe("os estados do pedido batem com o CHECK da base de dados", () => {
  it("quotes_status_chk no db/schema.sql aceita exatamente ESTADOS_DO_PEDIDO", () => {
    const sql = readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf-8");
    const blocos = [
      ...sql.matchAll(/add constraint quotes_status_chk\s+check \(status in \(([^)]*)\)\)/g),
    ];
    expect(blocos.length).toBeGreaterThan(0);
    const daBase = blocos
      .at(-1)![1]
      .match(/'([a-z_]+)'/g)!
      .map((v) => v.slice(1, -1));
    expect([...daBase].sort()).toEqual([...ESTADOS_DO_PEDIDO].sort());
  });
});
