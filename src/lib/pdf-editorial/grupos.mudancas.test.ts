import { describe, expect, it } from "vitest";
import { eDasMesas, grupoNoCasamento, type Grupo } from "./grupos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUE TEMAS MUDARAM DE CAPÍTULO COM A AUDITORIA DE 14/11 — sem surpresas
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Os dois defeitos corrigidos em `grupos.ts` («Mesa dos noivos» nos
 * Complementos; um «Arco» sozinho a abrir «Cerimónia») mexem nas regras de
 * todos os temas. Este teste percorre os nomes de temas que existem nos testes
 * e nas fixtures do repositório (`title: "…"` com palavras de algum grupo),
 * corre-os pela regra de ANTES (copiada aqui, congelada) e pela de agora, e
 * prende a lista dos que mudam. Se um dia esta lista crescer, foi uma regra
 * que mexeu em mais do que dizia.
 *
 * Cada nome é visto em dois casamentos: sozinho (a proposta só tem esse tema)
 * e ao lado de uma «Decoração Cerimónia».
 */

const NOMES = [
  "Decoração Cerimónia",
  "Aisle",
  "Altar",
  "Altar e corredor",
  "Arco de abóboras",
  "Arco floral",
  "Arco cerimonial",
  "Bar",
  "Bar (cópia)",
  "Bar de gin",
  "Bistro",
  "Bolo",
  "Bouquets",
  "Buffet",
  "CERIMONIA",
  "Cerimónia",
  "Cerimónia (cópia)",
  "Cerimónia ao pôr do sol",
  "Cerimónia na igreja",
  "Cocktail",
  "Complementos",
  "Complementos dos Noivos",
  "Corredor",
  "Corredor Nupcial",
  "Corredor nupcial",
  "DECORACAO  CERIMONIA",
  "Decor Cocktail",
  "Decor Floral Mesa Bolo",
  "Decoracao Cerimonia",
  "Decoração Cocktail",
  "Decoração Floral da Cerimónia",
  "Decoração Floral · Cerimónia e Espaço",
  "Decoração Jantar",
  "Decoração Seating Plan",
  "Decoração Seatting Plan",
  "Decoração da Cerimónia",
  "Decoração de Cerimónia",
  "Decoração do Jantar",
  "Decoração e Decor Floral Jantar",
  "Decoração e Decor Floral Mesas Jantar",
  "Flores da mesa",
  "Inspiração da Cerimónia",
  "Jantar",
  "Lapelas",
  "Lapelas Noivo",
  "Luzes",
  "Luzes e Lounge",
  "Mesa",
  "Mesa da cerimónia",
  "Mesa de doces da avó",
  "Mesa do bolo",
  "Mesa do jantar",
  "Mesa dos noivos",
  "Mesas",
  "Mesas de Jantar",
  "Mesas de jantar",
  "Mesas dos Convidados",
  "Ramo de Noiva",
  "Ramo da noiva",
  "Seating Plan",
  "Vasos de barro",
];

/** A regra de ANTES de 14/11, congelada (`grupos.ts` em origin/main, 07827965). */
const antes = (() => {
  const REGRAS: [Grupo, string[]][] = [
    ["cerimonia", ["cerimonia", "altar", "corredor", "igreja", "ceremony", "aisle", "arco"]],
    [
      "complementos",
      ["complemento", "ramo", "lapela", "bouquet", "boutonniere", "convite", "noiva", "noivo"],
    ],
    [
      "cocktail",
      ["cocktail", "welcome", "boas-vindas", "aperitivo", "seating", "seatting", "bar", "bistro"],
    ],
    ["jantar", ["jantar", "dinner", "banquete", "bolo", "cake", "mesa", "table", "centro"]],
  ];
  const palavras = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter(Boolean);
  const e = (p: string, c: string) => p === c || p === `${c}s` || p === `${c}es`;
  const tem = (ps: string[], cs: string[]) => ps.some((p) => cs.some((c) => e(p, c)));
  const grupo = (t: string): Grupo => {
    for (const [g, cs] of REGRAS) if (tem(palavras(t), cs)) return g;
    return "ambiente";
  };
  const cocktailMesmo = (t: string) =>
    grupo(t) === "cocktail" &&
    tem(palavras(t), ["cocktail", "welcome", "boas-vindas", "aperitivo"]);
  const noCasamento = (t: string, todos: string[]): Grupo => {
    const g = grupo(t);
    if (g !== "cocktail" || todos.some(cocktailMesmo)) return g;
    return tem(palavras(t), ["seating", "seatting"]) ? "jantar" : "ambiente";
  };
  const dasMesas = (t: string) =>
    grupo(t) !== "cerimonia" &&
    (tem(palavras(t), ["buffet", "bufete", "bufet"]) || grupo(t) === "jantar");
  return { noCasamento, dasMesas };
})();

const CERIMONIA = "Decoração Cerimónia";

function mudancas() {
  const linhas: string[] = [];
  for (const n of NOMES) {
    const sozinho = [antes.noCasamento(n, [n]), grupoNoCasamento({ title: n }, [{ title: n }])];
    const comCer = [
      antes.noCasamento(n, [n, CERIMONIA]),
      grupoNoCasamento({ title: n }, [{ title: n }, { title: CERIMONIA }]),
    ];
    const mesas = [antes.dasMesas(n), eDasMesas(n)];
    if (sozinho[0] !== sozinho[1] || comCer[0] !== comCer[1] || mesas[0] !== mesas[1]) {
      linhas.push(
        `${n} | sozinho ${sozinho.join("→")} | com cerimónia ${comCer.join("→")} | mesas ${mesas.join("→")}`,
      );
    }
  }
  return linhas;
}

describe("os nomes de temas dos testes e fixtures: quais mudam de capítulo (14/11)", () => {
  it("só os do arco/corredor sem cerimónia e a «Mesa dos noivos»", () => {
    expect(mudancas()).toEqual([
      "Aisle | sozinho cerimonia→ambiente | com cerimónia cerimonia→cerimonia | mesas false→false",
      "Arco de abóboras | sozinho cerimonia→ambiente | com cerimónia cerimonia→cerimonia | mesas false→false",
      "Arco floral | sozinho cerimonia→ambiente | com cerimónia cerimonia→cerimonia | mesas false→false",
      "Corredor | sozinho cerimonia→ambiente | com cerimónia cerimonia→cerimonia | mesas false→false",
      "Corredor Nupcial | sozinho cerimonia→ambiente | com cerimónia cerimonia→cerimonia | mesas false→false",
      "Corredor nupcial | sozinho cerimonia→ambiente | com cerimónia cerimonia→cerimonia | mesas false→false",
      "Mesa dos noivos | sozinho complementos→jantar | com cerimónia complementos→jantar | mesas false→true",
    ]);
  });
});
