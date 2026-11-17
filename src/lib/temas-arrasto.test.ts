import { describe, expect, it } from "vitest";
import {
  SPRING_LOADING_MS,
  TIPO_DE_CARGA,
  destinoValido,
  escreverCarga,
  fotosQueViajam,
  fraseDeMovimentoFalhado,
  fraseDoMovimento,
  fraseDoRegresso,
  lerCarga,
  trazFotos,
} from "./temas-arrasto";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE VIAJA NUM ARRASTO DE FOTOGRAFIAS — fase 08 do `docs/APPLE-TEMAS.md`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O gesto mede-se num browser; o que se prende aqui são as decisões que o
 * desenho não pode mudar sem alguém dar por isso.
 */

/** Um `DataTransfer` de mentira — o do jsdom não guarda dados. */
function transferencia(inicial: Record<string, string> = {}): DataTransfer {
  const dados = new Map(Object.entries(inicial));
  return {
    get types() {
      return [...dados.keys()];
    },
    setData: (tipo: string, valor: string) => dados.set(tipo, valor),
    getData: (tipo: string) => dados.get(tipo) ?? "",
  } as unknown as DataTransfer;
}

describe("quantas fotografias viajam", () => {
  const grelha = ["a", "b", "c", "d"];

  it("uma foto FORA da selecção viaja sozinha — e não desfaz a selecção", () => {
    expect(fotosQueViajam("c", new Set(["a", "b"]), grelha)).toEqual(["c"]);
  });

  it("uma foto DENTRO da selecção leva a selecção inteira", () => {
    expect(fotosQueViajam("a", new Set(["a", "d"]), grelha)).toEqual(["a", "d"]);
  });

  it("e leva-a pela ordem da GRELHA, não pela ordem em que ela clicou", () => {
    // A selecção é um `Set`, e um `Set` guarda a ordem de INSERÇÃO. Sem o
    // filtro sobre a grelha, o relatório do servidor e o crachá liam-se por
    // uma ordem que não é a que está no ecrã.
    expect(fotosQueViajam("d", new Set(["d", "b", "a"]), grelha)).toEqual(["a", "b", "d"]);
  });

  it("uma selecção que já não está na grelha não transforma o arrasto em nada", () => {
    // Fotos removidas noutro separador: o gesto que ela fez foi pegar numa
    // foto, e é essa que vai.
    expect(fotosQueViajam("c", new Set(["c", "zz"]), ["zz"])).toEqual(["zz"]);
    expect(fotosQueViajam("c", new Set(["c"]), [])).toEqual(["c"]);
  });
});

describe("que destinos aceitam a carga", () => {
  it("um tema DIFERENTE aceita", () => {
    expect(destinoValido({ origem: "t1", paths: ["a"] }, "t2")).toBe(true);
  });

  it("o próprio tema NÃO — largar as fotos onde já estão não é uma operação", () => {
    expect(destinoValido({ origem: "t1", paths: ["a"] }, "t1")).toBe(false);
  });

  it("sem carga, ou com um lote vazio, não há destino nenhum", () => {
    expect(destinoValido(null, "t2")).toBe(false);
    expect(destinoValido({ origem: "t1", paths: [] }, "t2")).toBe(false);
  });
});

describe("a carga escrita e lida", () => {
  it("vai e volta inteira", () => {
    const dt = transferencia();
    escreverCarga(dt, { origem: "t1", paths: ["a", "b"] });
    expect(lerCarga(dt)).toEqual({ origem: "t1", paths: ["a", "b"] });
  });

  it("viaja num tipo PRÓPRIO, e não no `text/plain` que a reordenação usa", () => {
    // A mesma grelha escreve o índice de origem em `text/plain` para reordenar
    // dentro do tema. Se as duas cargas partilhassem canal, um texto arrastado
    // do browser passava por um lote de fotografias.
    const dt = transferencia({ "text/plain": "3" });
    escreverCarga(dt, { origem: "t1", paths: ["a"] });
    expect(dt.types).toContain(TIPO_DE_CARGA);
    expect(lerCarga(transferencia({ "text/plain": "3" }))).toBeNull();
  });

  it("o `dragover` responde pelo TIPO, que é a única coisa que ele deixa ver", () => {
    const dt = transferencia();
    expect(trazFotos(dt)).toBe(false);
    escreverCarga(dt, { origem: "t1", paths: ["a"] });
    expect(trazFotos(dt)).toBe(true);
  });

  it("lixo, carga vazia ou sem `dataTransfer` dão `null` em vez de rebentar", () => {
    expect(lerCarga(null)).toBeNull();
    expect(lerCarga(transferencia({ [TIPO_DE_CARGA]: "não é JSON" }))).toBeNull();
    expect(lerCarga(transferencia({ [TIPO_DE_CARGA]: '{"origem":"t1","paths":[]}' }))).toBeNull();
    expect(lerCarga(transferencia({ [TIPO_DE_CARGA]: '{"paths":["a"]}' }))).toBeNull();
    expect(trazFotos(null)).toBe(false);
    // E escrever num `dataTransfer` que não existe não deita o arrasto abaixo.
    expect(() => escreverCarga(null, { origem: "t1", paths: ["a"] })).not.toThrow();
  });
});

describe('o que o `role="status"` anuncia', () => {
  it("diz o número, o verbo e o destino — a frase da Parte 4, à letra", () => {
    expect(fraseDoMovimento(3, "Bouquets Campestres")).toBe(
      "3 fotografias movidas para «Bouquets Campestres».",
    );
  });

  it("uma só não se diz no plural", () => {
    expect(fraseDoMovimento(1, "Itália")).toBe("1 fotografia movida para «Itália».");
  });

  it("uma falha diz onde as fotografias ficaram, e não só que falhou", () => {
    expect(fraseDeMovimentoFalhado(2, "Itália")).toBe(
      "Não foi possível mover 2 fotografias para «Itália». Continuam onde estavam.",
    );
  });

  it("o «Anular» anuncia o RESULTADO, não o nome da acção", () => {
    expect(fraseDoRegresso(2, "Terracotta")).toBe("2 fotografias de volta a «Terracotta».");
  });
});

describe("o spring loading", () => {
  it("é um segundo — abaixo disso, atravessar a lista abre os temas do caminho", () => {
    expect(SPRING_LOADING_MS).toBe(1000);
  });
});
