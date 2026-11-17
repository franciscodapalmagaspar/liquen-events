import { describe, it, expect } from "vitest";
import { arrumarNomeDeTema, arrumosDeNomes, nomePrecisaDeArrumo } from "./tema-nome";

describe("arrumarNomeDeTema", () => {
  it("põe em caixa de título o que está em minúsculas", () => {
    // Os casos reais da biblioteca de hoje.
    expect(arrumarNomeDeTema("bouquets campestres")).toBe("Bouquets Campestres");
    expect(arrumarNomeDeTema("lapelas")).toBe("Lapelas");
  });

  it("deixa as preposições em minúsculas no meio, mas não no início", () => {
    expect(arrumarNomeDeTema("bouquets branco e amarelo")).toBe("Bouquets Branco e Amarelo");
    expect(arrumarNomeDeTema("decor corredor e altar igreja")).toBe(
      "Decor Corredor e Altar Igreja",
    );
    // No início é palavra do nome, não ligação.
    expect(arrumarNomeDeTema("de manhã")).toBe("De Manhã");
  });

  it("devolve os acentos que faltam", () => {
    expect(arrumarNomeDeTema("Cerimonia Simbólica")).toBe("Cerimónia Simbólica");
    expect(arrumarNomeDeTema("Classico intemporal")).toBe("Clássico Intemporal");
  });

  it("corrige o «Seatings Plans», que põe o plural na palavra errada", () => {
    expect(arrumarNomeDeTema("Seatings Plans")).toBe("Seating Plans");
    expect(arrumarNomeDeTema("seatings plans")).toBe("Seating Plans");
    expect(arrumarNomeDeTema("SEATINGS PLANS")).toBe("Seating Plans");
  });

  it("colapsa os espaços a mais, incluindo o do fim que ninguém vê", () => {
    expect(arrumarNomeDeTema("  Bouquets   Campestres ")).toBe("Bouquets Campestres");
  });

  it("não mexe no que já está bem", () => {
    for (const bom of ["Bouquets Branco e Amarelo", "Seating Plans", "Entrada Igrejas"]) {
      expect(arrumarNomeDeTema(bom)).toBe(bom);
    }
  });

  it("mantém as siglas em capitulares", () => {
    expect(arrumarNomeDeTema("mesa de dj")).toBe("Mesa de DJ");
  });

  it("aguenta o vazio e o lixo sem rebentar", () => {
    expect(arrumarNomeDeTema("")).toBe("");
    expect(arrumarNomeDeTema("   ")).toBe("");
    expect(arrumarNomeDeTema(undefined as unknown as string)).toBe("");
  });

  it("é idempotente: arrumar o arrumado não mexe mais", () => {
    for (const nome of ["bouquets campestres", "Cerimonia Simbólica", "Seatings Plans"]) {
      const uma = arrumarNomeDeTema(nome);
      expect(arrumarNomeDeTema(uma)).toBe(uma);
    }
  });
});

describe("nomePrecisaDeArrumo", () => {
  it("só diz que sim quando há mesmo o que propor", () => {
    expect(nomePrecisaDeArrumo("bouquets campestres")).toBe(true);
    expect(nomePrecisaDeArrumo("Bouquets Campestres")).toBe(false);
    expect(nomePrecisaDeArrumo("")).toBe(false);
  });
});

describe("arrumosDeNomes", () => {
  it("mostra o antes e o depois, e cala-se sobre o que já está bem", () => {
    const r = arrumosDeNomes([
      "bouquets campestres",
      "Bouquets Branco e Amarelo",
      "Seatings Plans",
      "Cerimonia Simbólica",
    ]);
    expect(r).toEqual([
      { antes: "bouquets campestres", depois: "Bouquets Campestres" },
      { antes: "Seatings Plans", depois: "Seating Plans" },
      { antes: "Cerimonia Simbólica", depois: "Cerimónia Simbólica" },
    ]);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PONTUAÇÃO QUE FICOU TORTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O nome real da biblioteca dela, com três defeitos numa linha: um espaço a
 * seguir ao parêntese aberto, um parêntese fechado a mais, e um `0` onde devia
 * estar um `o`. É o que sai de escrever um nome no telemóvel, com pressa, no
 * meio de um evento — e depois nunca mais se volta a esse campo.
 */
describe("nomes escritos com pressa", () => {
  it("O NOME DELA: «Clássico Intemporal ( Branco/dourad0))»", () => {
    expect(arrumarNomeDeTema("Clássico Intemporal ( Branco/dourad0))")).toBe(
      "Clássico Intemporal (Branco/Dourado)",
    );
  });

  it("o espaço encostado por dentro do parêntese sai", () => {
    expect(arrumarNomeDeTema("Boho ( verão )")).toBe("Boho (Verão)");
  });

  it("um fecha-parêntese a mais cai", () => {
    expect(arrumarNomeDeTema("Praia (areia))")).toBe("Praia (Areia)");
  });

  /**
   * Fechar um parêntese que ela não abriu era pôr no nome dela uma coisa que
   * ela não escreveu — e um nome é escolha de quem o escreve.
   */
  it("um parêntese que falta NÃO se inventa", () => {
    expect(arrumarNomeDeTema("Praia (areia")).toBe("Praia (Areia");
  });

  it("a barra separa palavras, e as duas levam maiúscula", () => {
    expect(arrumarNomeDeTema("branco/verde")).toBe("Branco/Verde");
  });
});

/**
 * O zero é o gémeo visual do «o». A regra é apertada de propósito: o risco
 * aqui é estragar um nome legítimo, e o teste é sobretudo do que ela NÃO toca.
 */
describe("o zero no lugar do «o»", () => {
  it("«dourad0» é «dourado»", () => {
    expect(arrumarNomeDeTema("dourad0")).toBe("Dourado");
  });

  it("«Mesa 1» fica como está — o número é a palavra toda", () => {
    expect(arrumarNomeDeTema("Mesa 1")).toBe("Mesa 1");
  });

  it("«Tema 0» fica como está", () => {
    expect(arrumarNomeDeTema("Tema 0")).toBe("Tema 0");
  });

  it("uma palavra curta com um zero não se adivinha", () => {
    expect(arrumarNomeDeTema("G0")).toBe("G0");
  });

  it("dois dígitos não são um engano de tecla", () => {
    expect(arrumarNomeDeTema("Top10")).toBe("Top10");
  });
});
