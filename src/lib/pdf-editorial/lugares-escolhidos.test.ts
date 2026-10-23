import { describe, expect, it } from "vitest";
import { enquadrarNoLugar, trocarNoLugar } from "./lugares-escolhidos";

const AUTO6 = ["a", "b", "c", "d", "e", "p"];

describe("trocar a fotografia de um lugar", () => {
  it("na paleta, só o lugar escolhido muda; os outros ficam automáticos e o painel no 6.º", () => {
    const r = trocarNoLugar(undefined, AUTO6, 5, "nova", 6, true);
    expect(r).toEqual({ fotos: ["", "", "", "", "", "nova"] });
    const r2 = trocarNoLugar(r, AUTO6, 1, "outra", 6, true);
    expect(r2.fotos).toEqual(["", "outra", "", "", "", "nova"]);
  });

  it("trocar a foto apaga o enquadramento desse lugar e mantém o dos outros", () => {
    const dela = {
      fotos: ["x", "", "", "", "", "y"],
      focos: [{ x: 0.1, y: 0.1 }, null, null, null, null, { x: 0.9, y: 0.9 }],
    };
    const r = trocarNoLugar(dela, AUTO6, 0, "z", 6, true);
    expect(r.focos?.[0]).toBeNull();
    expect(r.focos?.[5]).toEqual({ x: 0.9, y: 0.9 });
  });

  it("nas outras páginas fica fixado o que se via, como sempre foi", () => {
    expect(trocarNoLugar(undefined, ["s1", "s2"], 0, "n", 2, false)).toEqual({
      fotos: ["n", "s2"],
    });
    expect(trocarNoLugar(undefined, ["s1"], 0, "n", 1, false)).toEqual({ fotos: ["n"] });
  });
});

describe("enquadrar a fotografia de um lugar", () => {
  it("uma foto automática fica fixada nesse lugar, com o enquadramento dela", () => {
    const r = enquadrarNoLugar(undefined, ["s1"], 0, { x: 0.3, y: 0.7 });
    expect(r).toEqual({ fotos: ["s1"], focos: [{ x: 0.3, y: 0.7 }] });
  });

  it("na paleta com escolhas, só o lugar enquadrado muda", () => {
    const dela = { fotos: ["", "", "", "", "", "y"] };
    const r = enquadrarNoLugar(dela, AUTO6, 5, { x: 0.5, y: 0.2 });
    expect(r?.fotos).toEqual(["", "", "", "", "", "p"]);
    expect(r?.focos?.[5]).toEqual({ x: 0.5, y: 0.2 });
  });

  it("voltar ao automático tira o enquadramento; sem nenhum, sai o campo", () => {
    const dela = { fotos: ["s1"], focos: [{ x: 0.3, y: 0.7 }] };
    expect(enquadrarNoLugar(dela, ["s1"], 0, null)).toEqual({ fotos: ["s1"] });
  });

  it("um lugar sem fotografia não se enquadra", () => {
    expect(enquadrarNoLugar(undefined, [null], 0, { x: 0.3, y: 0.7 })).toBeNull();
  });
});
