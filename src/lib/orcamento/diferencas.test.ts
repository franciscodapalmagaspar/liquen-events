import { describe, it, expect } from "vitest";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { diferencas, resumo } from "./diferencas";

const doc = (over: Partial<ProposalDoc>): ProposalDoc => over as ProposalDoc;

/** As frases todas, juntas, que é como elas aparecem no ecrã. */
const frases = (a: ProposalDoc, b: ProposalDoc) => diferencas(a, b).map((m) => m.texto);

describe("o total", () => {
  it("vem primeiro, porque é o que se pergunta primeiro", () => {
    const m = diferencas(
      doc({ totalAmount: 8000, budgetItems: ["Flores"], budgetAmounts: [1000] }),
      doc({ totalAmount: 9500, budgetItems: ["Flores"], budgetAmounts: [2500] }),
    );
    expect(m[0].onde).toBe("Total");
    expect(m[0].texto).toContain("8\u00A0000");
    expect(m[0].texto).toContain("9\u00A0500");
  });

  it("cêntimos de arredondamento não são uma alteração", () => {
    // Recalcular a escala por convidados escreve 1234.5600000000001 onde estava
    // 1234.56. Anunciar isso como "o total mudou" é mentir à cara dela.
    const m = diferencas(doc({ totalAmount: 1234.56 }), doc({ totalAmount: 1234.5600000001 }));
    expect(m).toEqual([]);
  });
});

describe("as linhas do orçamento", () => {
  it("distingue entrar, sair e mudar de preço", () => {
    const antes = doc({
      budgetItems: ["Flores", "Wedding Coordinator", "Iluminação"],
      budgetAmounts: [800, 1200, 400],
    });
    const depois = doc({
      budgetItems: ["Flores", "Iluminação", "Arco"],
      budgetAmounts: [950, 400, 300],
    });
    const t = frases(antes, depois);
    expect(t.some((x) => x.includes("Flores") && x.includes("800") && x.includes("950"))).toBe(
      true,
    );
    expect(t.some((x) => x.startsWith('Entrou "Arco"'))).toBe(true);
    expect(t.some((x) => x === 'Saiu "Wedding Coordinator"')).toBe(true);
    // A que não mexeu não aparece: uma lista que repete o que ficou igual
    // obriga a lê-la toda para descobrir o que mudou.
    expect(t.some((x) => x.includes("Iluminação"))).toBe(false);
  });

  it("um preço que aparece não se conta como um preço que muda", () => {
    const t = frases(
      doc({ budgetItems: ["Flores"], budgetAmounts: [] }),
      doc({ budgetItems: ["Flores"], budgetAmounts: [800] }),
    );
    // Sem o `€` literal: o `Intl` põe um espaço INSEPARÁVEL antes do símbolo, e
    // uma comparação com o espaço normal falha por uma diferença invisível.
    expect(t).toHaveLength(1);
    expect(t[0]).toContain("passou a ter preço");
    expect(t[0]).toContain("800,00");
  });

  it("um preço que desaparece diz quanto era", () => {
    const t = frases(
      doc({ budgetItems: ["Flores"], budgetAmounts: [800] }),
      doc({ budgetItems: ["Flores"], budgetAmounts: [] }),
    );
    expect(t[0]).toContain("ficou sem preço");
    expect(t[0]).toContain("800");
  });

  it("mudar só a caixa do nome não é entrar e sair", () => {
    const t = frases(
      doc({ budgetItems: ["flores"], budgetAmounts: [800] }),
      doc({ budgetItems: ["Flores"], budgetAmounts: [800] }),
    );
    expect(t).toEqual([]);
  });

  it("uma linha repetida não se anuncia duas vezes", () => {
    // Duas linhas "Extras" com preços diferentes davam, com a comparação por
    // nome, um "entrou" e um "saiu" para a mesma coisa.
    const t = frases(
      doc({ budgetItems: ["Extras", "Extras"], budgetAmounts: [100, 200] }),
      doc({ budgetItems: ["Extras", "Extras"], budgetAmounts: [100, 200] }),
    );
    expect(t).toEqual([]);
  });

  it("linhas em branco não contam", () => {
    const t = frases(
      doc({ budgetItems: ["Flores", "  "], budgetAmounts: [800] }),
      doc({ budgetItems: ["Flores"], budgetAmounts: [800] }),
    );
    expect(t).toEqual([]);
  });
});

describe("os grupos de serviços", () => {
  it("diz o que entrou e o que saiu, sem se enganar com acentos", () => {
    const antes = doc({
      serviceGroups: [
        { title: "Decoração Cerimónia", items: [] },
        { title: "Organização", items: [] },
      ],
    });
    const depois = doc({
      serviceGroups: [
        { title: "decoracao cerimonia", items: [] },
        { title: "Mesa dos noivos", items: [] },
      ],
    });
    const t = frases(antes, depois);
    expect(t).toContain('Entrou o grupo "Mesa dos noivos"');
    expect(t).toContain('Saiu o grupo "Organização"');
    expect(t.some((x) => x.toLowerCase().includes("cerim"))).toBe(false);
  });
});

describe("o evento", () => {
  it("conta a data, o local, os convidados e os nomes", () => {
    const t = frases(
      doc({
        eventDate: "3 de julho de 2027",
        location: "Évora",
        guests: "150 pax",
        clientNames: "Ana e João",
      }),
      doc({
        eventDate: "10 de julho de 2027",
        location: "Estremoz",
        guests: "180 pax",
        clientNames: "Ana e João",
      }),
    );
    expect(t).toHaveLength(3);
    expect(t[0]).toBe('A data passou de "3 de julho de 2027" para "10 de julho de 2027"');
    expect(t.some((x) => x.includes("Estremoz"))).toBe(true);
    expect(t.some((x) => x.includes("180 pax"))).toBe(true);
  });

  it("um campo que se preenche pela primeira vez lê-se como tal", () => {
    const t = frases(doc({ location: "" }), doc({ location: "Évora" }));
    expect(t).toEqual(['O local passou a ser "Évora"']);
  });

  it("um campo que se esvazia diz o que lá estava", () => {
    const t = frases(doc({ location: "Évora" }), doc({ location: "" }));
    expect(t[0]).toContain("ficou por preencher");
    expect(t[0]).toContain("Évora");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «ESTA VERSÃO ESTÁ IGUAL À ÚLTIMA ENVIADA» — COM TUDO TROCADO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O percurso que isto prende, em bloco: ela troca as três fotos do mood board
 * e as duas de capa, acrescenta «Wedding Coordinator 1.500 €», baixa a
 * validade de 30 para 5 dias e o sinal de 30% para 50%. O painel Versões dizia,
 * a verde, «Esta versão está igual à última enviada» — e ela enviava a segunda
 * a acreditar que era a primeira.
 */
describe("o percurso completo: tudo trocado", () => {
  const antes = doc({
    totalAmount: 10_000,
    totalVatMode: "acrescer",
    moodBoards: [{ title: "Cerimónia", images: ["a.jpg", "b.jpg", "c.jpg"] }],
    coverImages: ["capa-e.jpg", "capa-d.jpg"],
    budgetExtras: [],
    validUntilDays: 30,
    depositPercent: 30,
  });
  const depois = doc({
    totalAmount: 10_000,
    totalVatMode: "acrescer",
    moodBoards: [{ title: "Cerimónia", images: ["x.jpg", "y.jpg", "z.jpg"] }],
    coverImages: ["capa-nova-e.jpg", "capa-nova-d.jpg"],
    budgetExtras: [{ label: "Wedding Coordinator", valueText: "1.500,00 €" }],
    validUntilDays: 5,
    depositPercent: 50,
  });

  it("não diz que está igual", () => {
    expect(diferencas(antes, depois)).not.toEqual([]);
  });

  it("conta as fotos do mood board", () => {
    expect(
      frases(antes, depois).some((t) => /mood board/i.test(t) && t.includes("Cerimónia")),
    ).toBe(true);
  });

  it("conta as fotos de capa", () => {
    expect(frases(antes, depois).some((t) => /capa/i.test(t))).toBe(true);
  });

  it("conta o valor adicional que entrou, com o valor", () => {
    const t = frases(antes, depois);
    expect(t.some((x) => x.includes("Wedding Coordinator") && x.includes("1.500,00 €"))).toBe(true);
  });

  it("conta a validade", () => {
    expect(frases(antes, depois)).toContain("A validade passou de 30 para 5 dias");
  });

  it("conta a percentagem do sinal", () => {
    expect(frases(antes, depois)).toContain("O sinal passou de 30% para 50%");
  });
});

describe("o modo de IVA", () => {
  /**
   * O cliente paga o mesmo — e a frase dizia que o total tinha subido 2.300 €.
   *
   * O estúdio guarda SEMPRE a mesma base ao trocar de modo: em "acrescer" o
   * `totalAmount` é a base, em "incluído" é a base já com o IVA. Comparar o
   * número cru fazia de uma mudança de apresentação um aumento de preço.
   */
  it("trocar de modo com a mesma base não é um aumento de preço", () => {
    const t = frases(
      doc({ totalAmount: 10_000, totalVatMode: "acrescer", vatRate: 0.23 }),
      doc({ totalAmount: 12_300, totalVatMode: "incluido", vatRate: 0.23 }),
    );
    expect(t.some((x) => x.startsWith("O total passou de"))).toBe(false);
  });

  it("mas diz que a apresentação mudou — não fica calado", () => {
    const t = frases(
      doc({ totalAmount: 10_000, totalVatMode: "acrescer", vatRate: 0.23 }),
      doc({ totalAmount: 12_300, totalVatMode: "incluido", vatRate: 0.23 }),
    );
    expect(t.some((x) => /IVA/.test(x))).toBe(true);
  });

  it("uma subida a sério continua a ser dita, seja qual for o modo", () => {
    const t = frases(
      doc({ totalAmount: 10_000, totalVatMode: "acrescer", vatRate: 0.23 }),
      doc({ totalAmount: 11_000, totalVatMode: "acrescer", vatRate: 0.23 }),
    );
    expect(t[0]).toContain("O total passou de");
  });
});

describe("os valores adicionais", () => {
  it("distingue entrar, sair e mudar de valor", () => {
    const t = frases(
      doc({
        budgetExtras: [
          { label: "Deslocação da equipa Líquen", valueText: "896,00 €" },
          { label: "Tecidos suspensos", valueText: "450,00 €" },
        ],
      }),
      doc({
        budgetExtras: [
          { label: "Deslocação da equipa Líquen", valueText: "1.200,00 €" },
          { label: "Wedding Coordinator", valueText: "1.500,00 €" },
        ],
      }),
    );
    expect(t.some((x) => x.includes("Deslocação") && x.includes("1.200,00 €"))).toBe(true);
    expect(t.some((x) => x.includes("Wedding Coordinator"))).toBe(true);
    expect(t.some((x) => x.includes("Tecidos suspensos"))).toBe(true);
  });
});

describe("as fotos", () => {
  it("um mood board que entra diz-se pelo nome", () => {
    const t = frases(
      doc({ moodBoards: [] }),
      doc({ moodBoards: [{ title: "Cerimónia", images: ["a.jpg"] }] }),
    );
    expect(t).toEqual(['Entrou o mood board "Cerimónia" com 1 foto']);
  });

  it("um mood board que fica mas troca de fotos diz quantas", () => {
    const t = frases(
      doc({ moodBoards: [{ title: "Jantar", images: ["a.jpg", "b.jpg"] }] }),
      doc({ moodBoards: [{ title: "Jantar", images: ["a.jpg", "c.jpg", "d.jpg"] }] }),
    );
    expect(t).toHaveLength(1);
    expect(t[0]).toContain("Jantar");
    expect(t[0]).toMatch(/2 (fotos )?entraram|entraram 2/i);
  });

  it("a mesma foto na mesma posição não é uma alteração", () => {
    const t = frases(
      doc({ moodBoards: [{ title: "Jantar", images: ["a.jpg"] }], coverImages: ["c.jpg", ""] }),
      doc({ moodBoards: [{ title: "Jantar", images: ["a.jpg"] }], coverImages: ["c.jpg", ""] }),
    );
    expect(t).toEqual([]);
  });

  it("as capas dizem de que lado", () => {
    const t = frases(
      doc({ coverImages: ["velha-e.jpg", "d.jpg"] }),
      doc({ coverImages: ["nova-e.jpg", "d.jpg"] }),
    );
    expect(t).toHaveLength(1);
    expect(t[0]).toContain("esquerda");
  });
});

describe("as condições e os prazos", () => {
  it("um ponto acrescentado às condições gerais aparece", () => {
    const t = frases(
      doc({ condicoesGerais: ["Aos valores acresce o IVA."] }),
      doc({ condicoesGerais: ["Aos valores acresce o IVA.", "O pagamento é a 30 dias."] }),
    );
    expect(t.some((x) => /Condições Gerais/i.test(x))).toBe(true);
  });

  it("uma data de validade explícita lê-se como data", () => {
    const t = frases(doc({ validUntil: "2026-09-01" }), doc({ validUntil: "2026-07-15" }));
    expect(t.some((x) => x.includes("2026-07-15"))).toBe(true);
  });

  it("um documento sem sinal escrito vale a percentagem da casa, e não muda nada", () => {
    // Um documento antigo não tem `depositPercent`. Dizer que «o sinal passou
    // de nada para 30%» seria inventar uma alteração que ninguém fez.
    const t = frases(doc({}), doc({ depositPercent: 30 }));
    expect(t).toEqual([]);
  });
});

describe("o que NÃO se compara", () => {
  it("custos e notas internas mudam sem gerar frase nenhuma", () => {
    // Não é esquecimento: são reais, mas não fazem parte do que ela tem de
    // explicar ao telefone, e enchiam a lista por cima do que faz.
    const t = frases(
      doc({
        budgetItems: ["Flores"],
        budgetAmounts: [800],
        budgetCosts: [300],
        notasInternas: "a",
      }),
      doc({
        budgetItems: ["Flores"],
        budgetAmounts: [800],
        budgetCosts: [500],
        notasInternas: "b",
      }),
    );
    expect(t).toEqual([]);
  });
});

describe("o resumo", () => {
  it("quando o dinheiro mudou, é do dinheiro que fala", () => {
    const m = diferencas(
      doc({ totalAmount: 8000, budgetItems: ["a"], budgetAmounts: [1] }),
      doc({ totalAmount: 9000, budgetItems: ["b"], budgetAmounts: [2] }),
    );
    expect(resumo(m)).toContain("9\u00A0000");
  });

  it("uma alteração só lê-se por extenso", () => {
    const m = diferencas(doc({ location: "Évora" }), doc({ location: "Estremoz" }));
    expect(resumo(m)).toBe('O local passou de "Évora" para "Estremoz"');
  });

  it("várias alterações contam-se", () => {
    const m = diferencas(
      doc({ location: "Évora", guests: "150 pax" }),
      doc({ location: "Estremoz", guests: "180 pax" }),
    );
    expect(resumo(m)).toBe("2 alterações");
  });

  it("duas versões iguais dizem-no", () => {
    expect(resumo([])).toBe("Sem alterações");
  });
});
