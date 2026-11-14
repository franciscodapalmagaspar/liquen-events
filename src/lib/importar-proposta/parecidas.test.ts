import { describe, expect, it } from "vitest";
import {
  carregadasQueValem,
  classificarGuardadas,
  continuaGuardada,
  guardadasComDecisoes,
  porResponder,
  type FotoAPerguntar,
} from "./parecidas";

/**
 * A importação nunca troca uma fotografia por outra sem ser quase certo ou sem
 * ela confirmar: «mesma» entra sozinha; «talvez» fica à espera da resposta
 * dela, e sem resposta é NOVA.
 */

const I = (c: string) => c.repeat(86).slice(0, 86);
const fotos: FotoAPerguntar[] = [
  { caminho: "ppt/media/a.jpg", resumo: "r".repeat(32), impressao: I("1") },
  { caminho: "ppt/media/b.jpg", resumo: null, impressao: I("2") },
  { caminho: "ppt/media/c.png", resumo: null, impressao: I("3") },
  { caminho: "ppt/media/d.jpg", resumo: null, impressao: I("4") },
];
const resposta = {
  existentes: { ["r".repeat(32)]: "tema:t/a.jpg" },
  parecidas: {
    [I("2")]: { caminho: "tema:t/b.jpg", veredicto: "mesma", miniatura: "https://x/b" },
    [I("3")]: { caminho: "tema:t/c.jpg", veredicto: "talvez", miniatura: "https://x/c" },
    [I("4")]: { caminho: "tema:t/d.jpg", veredicto: "outra" },
  },
};

describe("importar: o que já está guardado", () => {
  it("o resumo igual e a «mesma» entram sem perguntar; a «talvez» fica em dúvida", () => {
    const { existentes, duvidas } = classificarGuardadas(fotos, resposta);
    expect([...existentes]).toEqual([
      ["ppt/media/a.jpg", "tema:t/a.jpg"],
      ["ppt/media/b.jpg", "tema:t/b.jpg"],
    ]);
    expect([...duvidas]).toEqual([
      ["ppt/media/c.png", { caminho: "tema:t/c.jpg", miniatura: "https://x/c" }],
    ]);
  });

  it("a zona cinzenta pede confirmação: sem resposta, ou com «É outra», a foto é NOVA", () => {
    const { existentes, duvidas } = classificarGuardadas(fotos, resposta);
    expect(porResponder(duvidas, new Map())).toEqual(["ppt/media/c.png"]);
    expect(guardadasComDecisoes(existentes, duvidas, new Map()).has("ppt/media/c.png")).toBe(false);
    expect(
      guardadasComDecisoes(existentes, duvidas, new Map([["ppt/media/c.png", "outra"]])).has(
        "ppt/media/c.png",
      ),
    ).toBe(false);
    const sim = guardadasComDecisoes(existentes, duvidas, new Map([["ppt/media/c.png", "mesma"]]));
    expect(sim.get("ppt/media/c.png")).toBe("tema:t/c.jpg");
  });

  it("uma resposta estragada não decide nada", () => {
    const { existentes, duvidas } = classificarGuardadas(fotos, {
      existentes: { x: 1 },
      parecidas: { [I("2")]: { caminho: "", veredicto: "mesma" }, [I("3")]: "lixo" },
    });
    expect(existentes.size).toBe(0);
    expect(duvidas.size).toBe(0);
  });

  it("antes de gravar: a escolhida continua se voltar pelo resumo OU pela impressão", () => {
    expect(continuaGuardada("tema:t/c.jpg", fotos[2], resposta)).toBe(true);
    expect(continuaGuardada("tema:t/a.jpg", fotos[0], resposta)).toBe(true);
    expect(continuaGuardada("tema:t/c.jpg", fotos[2], { existentes: {}, parecidas: {} })).toBe(
      false,
    );
  });

  it("numa segunda tentativa, sai o que já não vale: tirada da escolha, ou a guardada que deixou de contar", () => {
    const carregadas = new Map([
      ["a.jpg", "tema:t/a.jpg"], // ela passou a dizer «É outra»
      ["b.jpg", "tema:t/b.jpg"], // continua «É a mesma»
      ["c.jpg", "PED-1/c.jpg"], // subiu nesta importação
      ["d.jpg", "PED-1/d.jpg"], // subiu, mas ela tirou-a da escolha
    ]);
    const escolhidas = new Set(["a.jpg", "b.jpg", "c.jpg"]);
    const guardadas = new Map([["b.jpg", "tema:t/b.jpg"]]);
    expect([...carregadasQueValem(carregadas, escolhidas, guardadas, "PED-1")]).toEqual([
      ["b.jpg", "tema:t/b.jpg"],
      ["c.jpg", "PED-1/c.jpg"],
    ]);
  });
});
