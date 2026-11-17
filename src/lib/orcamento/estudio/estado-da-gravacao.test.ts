import { describe, expect, it } from "vitest";
import {
  estadoNoEcra,
  haQueMostrar,
  GRAVACAO_INICIAL,
  transicaoDaGravacao,
  type AccaoDaGravacao,
  type EstadoDaGravacao,
} from "./estado-da-gravacao";

const correr = (...accoes: AccaoDaGravacao[]): EstadoDaGravacao =>
  accoes.reduce(transicaoDaGravacao, GRAVACAO_INICIAL);

describe("a máquina da gravação do estúdio", () => {
  it.each<[string, AccaoDaGravacao[], Partial<EstadoDaGravacao>]>([
    ["começa guardada, sem nada a caminho", [], GRAVACAO_INICIAL],
    ["uma gravação a caminho conta-se", [{ tipo: "partiu" }], { aCaminho: 1 }],
    [
      "duas sobrepostas (a de saída e a do debounce) contam-se as duas",
      [{ tipo: "partiu" }, { tipo: "partiu" }, { tipo: "voltou" }],
      { aCaminho: 1 },
    ],
    [
      "a contagem nunca desce abaixo de zero",
      [{ tipo: "voltou" }, { tipo: "voltou" }],
      { aCaminho: 0 },
    ],
    [
      "não chegar ao servidor fica dito, com o porquê",
      [{ tipo: "ficou-so-aqui", porque: "sem tabela" }],
      { destino: { onde: "so-neste-computador", porque: "sem tabela" } },
    ],
    [
      "e chegar a seguir apaga-o",
      [{ tipo: "ficou-so-aqui", porque: "x" }, { tipo: "chegou-ao-servidor" }],
      { destino: { onde: "servidor" } },
    ],
    [
      "o porquê é sempre o da última falha",
      [
        { tipo: "ficou-so-aqui", porque: "a sessão" },
        { tipo: "ficou-so-aqui", porque: "a rede" },
      ],
      { destino: { onde: "so-neste-computador", porque: "a rede" } },
    ],
    [
      "um sítio que não dura fica dito, com a frase do servidor",
      [{ tipo: "nao-dura", aviso: "liga a base" }],
      { duracao: { dura: false, aviso: "liga a base" } },
    ],
    [
      "e volta a durar quando o servidor o diz",
      [{ tipo: "nao-dura" }, { tipo: "dura" }],
      { duracao: { dura: true } },
    ],
  ])("%s", (_, accoes, esperado) => {
    expect(correr(...accoes)).toMatchObject(esperado);
  });

  it("devolve o MESMO estado quando nada muda (o React não volta a desenhar)", () => {
    const s = GRAVACAO_INICIAL;
    expect(transicaoDaGravacao(s, { tipo: "voltou" })).toBe(s);
    expect(transicaoDaGravacao(s, { tipo: "chegou-ao-servidor" })).toBe(s);
    expect(transicaoDaGravacao(s, { tipo: "dura" })).toBe(s);
  });

  it("uma falha nova é sempre um objecto novo (o aviso pode ter mudado)", () => {
    const a = correr({ tipo: "ficou-so-aqui", porque: "x" });
    const b = transicaoDaGravacao(a, { tipo: "ficou-so-aqui", porque: "x" });
    expect(b).not.toBe(a);
    expect(b.destino).not.toBe(a.destino);
  });
});

describe("o que o indicador diz", () => {
  const so = correr({ tipo: "ficou-so-aqui" });
  const naoDura = correr({ tipo: "nao-dura" });
  const ambos = correr({ tipo: "ficou-so-aqui" }, { tipo: "nao-dura" });

  it.each<[string, boolean, EstadoDaGravacao, string]>([
    ["tudo assente", false, GRAVACAO_INICIAL, "guardado"],
    ["há alterações à espera do debounce", true, GRAVACAO_INICIAL, "a-guardar"],
    ["há uma gravação a caminho", false, correr({ tipo: "partiu" }), "a-guardar"],
    ["a guardar ganha a tudo, mesmo a uma falha", true, ambos, "a-guardar"],
    ["só neste computador", false, so, "so-neste-computador"],
    ["não dura ao deploy", false, naoDura, "nao-dura-ao-deploy"],
    ["não chegar é pior do que não durar", false, ambos, "so-neste-computador"],
  ])("%s", (_, porGravar, g, esperado) => {
    expect(estadoNoEcra(porGravar, g)).toBe(esperado);
  });
});

describe("o indicador tem alguma coisa a dizer?", () => {
  const quando = new Date(0);
  it.each<[string, Date | null, boolean, EstadoDaGravacao, boolean]>([
    ["nada ainda: abriu e não mexeu", null, false, GRAVACAO_INICIAL, false],
    ["já gravou", quando, false, GRAVACAO_INICIAL, true],
    ["há alterações por gravar", null, true, GRAVACAO_INICIAL, true],
    ["um alarme sem gravação nesta sessão", null, false, correr({ tipo: "ficou-so-aqui" }), true],
    ["o deploy apaga", null, false, correr({ tipo: "nao-dura" }), true],
    // Igual ao de antes da máquina: uma gravação a caminho, sozinha, não acende.
    ["só uma gravação a caminho", null, false, correr({ tipo: "partiu" }), false],
  ])("%s", (_, gravadoEm, porGravar, g, esperado) => {
    expect(haQueMostrar(gravadoEm, porGravar, g)).toBe(esperado);
  });
});
