import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A TABELA DOS PEDIDOS NÃO PODE SER MAIS LARGA DO QUE A CAIXA A 1440
 *
 * Numa `<table>` de largura automática, o `truncate` numa célula não limita a
 * coluna: o texto inteiro, sem quebra, passa a ser a largura MÍNIMA dela.
 * MEDIDO a 1440×900 na passagem de 9 de outubro: um local comprido deu à
 * coluna 479 px e à tabela 1457 px numa caixa de 1358 — «Pax» cortado e
 * «À espera» escondido atrás de um deslizar, num ecrã de computador.
 *
 * O jsdom não faz layout; o que se guarda aqui é a CAUSA: a célula do local
 * tem um tecto (o degrau de 240 px da escala de larguras, DESIGN-SYSTEM §9.9)
 * e o texto inteiro no `title`, que é a «tooltip de expansão» do mesmo §9.9.
 */
const FONTE = readFileSync(
  join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin/AdminClient.tsx"),
  "utf8",
);

describe("a coluna Local da tabela dos pedidos", () => {
  const inicio = FONTE.indexOf('chave: "local"');
  const bloco = FONTE.slice(inicio, FONTE.indexOf('chave: "pax"', inicio));

  it("tem um tecto de largura", () => {
    expect(inicio).toBeGreaterThan(-1);
    expect(bloco).toContain("max-w-60 truncate");
  });

  it("mostra o local inteiro ao passar por cima", () => {
    expect(bloco).toContain("title={q.location");
  });
});
