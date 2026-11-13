import { describe, it, expect } from "vitest";
import { planearImportacao, dividirLinha, lerNumero, lerTipo, chaveDeNome } from "./material-csv";
import type { MaterialItem } from "./material-types";

/**
 * O CSV é a porta por onde entra o inventário todo de uma vez.
 *
 * O que se fixa aqui é o que evita o desastre silencioso: uma linha mal lida
 * escreve stock errado em centenas de itens, e ninguém dá por isso até estar a
 * carregar a carrinha. Por isso o interpretador NUNCA escreve — devolve um
 * plano — e estes testes prendem o plano, não a escrita.
 */

const item = (over: Partial<MaterialItem> = {}): MaterialItem => ({
  id: "i1",
  name: "Fita-cola americana",
  category: "Consumíveis",
  kind: "consumivel",
  unit: "rolo",
  stock: 4,
  minStock: 2,
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("dividirLinha", () => {
  it("não parte um campo entre aspas por causa de uma vírgula", () => {
    // A regressão: as notas levam vírgulas ("portão estreito, levar o
    // pequeno") e um split ingénuo empurrava metade da frase para a coluna
    // seguinte, sem se queixar.
    expect(
      dividirLinha('Escadote,Ferramentas,unidade,r,1,,"portão estreito, levar o pequeno"'),
    ).toEqual([
      "Escadote",
      "Ferramentas",
      "unidade",
      "r",
      "1",
      "",
      "portão estreito, levar o pequeno",
    ]);
  });

  it("aceita ponto e vírgula, que é o que o Excel português exporta", () => {
    expect(dividirLinha("Escadote;Ferramentas;unidade")).toEqual([
      "Escadote",
      "Ferramentas",
      "unidade",
    ]);
  });
});

describe("lerNumero", () => {
  it("lê «1.200» como mil e duzentos, à portuguesa (achado n.º 16)", () => {
    expect(lerNumero("1.200")).toBe(1200);
    expect(lerNumero("1.234.567")).toBe(1234567);
    expect(lerNumero("12.5")).toBe(12.5);
    expect(lerNumero("0.500")).toBe(0.5);
  });

  it("lê números escritos por gente", () => {
    expect(lerNumero("12")).toBe(12);
    expect(lerNumero("12,5")).toBe(12.5);
    expect(lerNumero("12.5")).toBe(12.5);
    expect(lerNumero("1.234,5")).toBe(1234.5);
    expect(lerNumero("1,234.5")).toBe(1234.5);
  });

  it("vazio é nulo, e nulo não é zero", () => {
    // A distinção que interessa: uma célula em branco quer dizer "não mexas
    // neste valor", não "põe a zero". Colapsá-las zerava o stock de quem
    // deixou a coluna vazia.
    expect(lerNumero("")).toBeNull();
    expect(lerNumero("  ")).toBeNull();
    expect(lerNumero("abc")).toBeNull();
    expect(lerNumero("-3")).toBeNull();
  });
});

describe("lerTipo", () => {
  it("percebe consumível escrito de várias maneiras", () => {
    expect(lerTipo("consumivel")).toBe("consumivel");
    expect(lerTipo("Consumível")).toBe("consumivel");
    expect(lerTipo("C")).toBe("consumivel");
  });

  it("na dúvida é reutilizável — o que TEM de voltar", () => {
    // O erro seguro: marcar por engano um consumível como reutilizável faz
    // aparecer uma linha a mais na checklist de regresso. Ao contrário, um
    // escadote classificado como consumível desaparecia do controlo de
    // regresso e ninguém dava pela falta dele.
    expect(lerTipo("")).toBe("reutilizavel");
    expect(lerTipo("qualquer coisa")).toBe("reutilizavel");
  });
});

describe("chaveDeNome", () => {
  it("emparelha o mesmo item escrito de maneiras diferentes", () => {
    expect(chaveDeNome("Fita-Cola  Dupla ")).toBe(chaveDeNome("fita cola dupla"));
    expect(chaveDeNome("Extensão")).toBe(chaveDeNome("extensao"));
  });
});

describe("planearImportacao", () => {
  it("separa o que é novo do que atualiza, pelo nome", () => {
    const plano = planearImportacao(
      [
        "nome,categoria,unidade,tipo,stock,minimo,notas",
        "Fita-cola Americana,Consumíveis,rolo,consumivel,10,3,",
        "Escadote 3 degraus,Ferramentas,unidade,reutilizavel,1,,",
      ].join("\n"),
      [item()],
    );

    expect(plano.novos).toBe(1);
    expect(plano.atualizados).toBe(1);
    expect(plano.erros).toBe(0);

    const atualiza = plano.linhas.find((l) => l.estado === "atualiza")!;
    expect(atualiza.alvoId).toBe("i1");
    // O ecrã mostra "4 → 10", e para isso precisa do antes.
    expect(atualiza.antes).toEqual({ stock: 4, minStock: 2 });
    expect(atualiza.item?.stock).toBe(10);
  });

  it("uma célula vazia mantém o valor que já lá estava", () => {
    const plano = planearImportacao(["nome,stock,minimo", "Fita-cola americana,,"].join("\n"), [
      item({ stock: 4, minStock: 2 }),
    ]);
    const l = plano.linhas[0];
    expect(l.estado).toBe("atualiza");
    expect(l.item?.stock).toBe(4);
    expect(l.item?.minStock).toBe(2);
  });

  it("recusa a linha com categoria desconhecida, em vez de a inventar", () => {
    // Silenciosamente cair para "Ferramentas" enterrava o engano: a pessoa
    // escreveu "Decoraçao" à espera de outra coisa e só descobria mais tarde.
    const plano = planearImportacao(["nome,categoria", "Jarra,Decoração"].join("\n"), []);
    expect(plano.erros).toBe(1);
    expect(plano.linhas[0].erro).toContain("Decoração");
  });

  it("apanha o mesmo nome duas vezes no ficheiro, e diz em que linha estava", () => {
    // Importar as duas deixava o stock pelo valor da última, sem ninguém saber
    // que houve duas.
    const plano = planearImportacao(["nome,stock", "Escadote,1", "escadote ,5"].join("\n"), []);
    expect(plano.novos).toBe(1);
    expect(plano.erros).toBe(1);
    expect(plano.linhas[1].erro).toContain("linha 2");
  });

  it("aceita o cabeçalho por qualquer ordem, e ignora colunas que não conhece", () => {
    const plano = planearImportacao(
      ["stock,nome,cor,categoria", "7,Luvas,azul,Segurança"].join("\n"),
      [],
    );
    expect(plano.linhas[0].item).toMatchObject({
      name: "Luvas",
      category: "Segurança",
      stock: 7,
    });
  });

  it("linha sem nome é erro, não um item sem nome", () => {
    const plano = planearImportacao(["nome,stock", ",5"].join("\n"), []);
    expect(plano.erros).toBe(1);
    expect(plano.linhas[0].erro).toBe("Sem nome.");
  });

  it("ficheiro vazio não rebenta nem inventa linhas", () => {
    expect(planearImportacao("", [])).toEqual({ linhas: [], novos: 0, atualizados: 0, erros: 0 });
    expect(planearImportacao("\n\n  \n", []).linhas).toEqual([]);
  });

  it("linhas em branco pelo meio são saltadas, sem deslocar a contagem", () => {
    const plano = planearImportacao(["nome,stock", "", "Luvas,2", "", "Panos,3"].join("\n"), []);
    expect(plano.novos).toBe(2);
    // O número da linha é o do ficheiro, para bater certo com o Excel.
    expect(plano.linhas.map((l) => l.linha)).toEqual([3, 5]);
  });
});
