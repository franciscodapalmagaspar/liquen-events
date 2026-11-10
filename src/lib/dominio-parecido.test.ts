import { describe, expect, it } from "vitest";
import { distancia, dominiosConhecidos, sugerirEmail } from "./dominio-parecido";

describe("sugerirEmail — um domínio quase igual a um conhecido", () => {
  it("o caso dela (9/11): addecco.com quando a casa já conhece adecco.com", () => {
    expect(sugerirEmail("Vanessa.Rodrigues@addecco.com", ["adecco.com"])).toBe(
      "Vanessa.Rodrigues@adecco.com",
    );
  });

  it("os enganos de dedo nos domínios comuns", () => {
    expect(sugerirEmail("teste@gmial.com")).toBe("teste@gmail.com");
    expect(sugerirEmail("teste@gmail.con")).toBe("teste@gmail.com");
    expect(sugerirEmail("teste@hotmial.com")).toBe("teste@hotmail.com");
    expect(sugerirEmail("teste@sapo.ptt")).toBe("teste@sapo.pt");
  });

  it("um domínio certo, ou que não se parece com nenhum, não sugere nada", () => {
    expect(sugerirEmail("teste@gmail.com")).toBeNull();
    expect(sugerirEmail("teste@adecco.com", ["adecco.com"])).toBeNull();
    expect(sugerirEmail("teste@empresa-nova.pt")).toBeNull();
    expect(sugerirEmail("")).toBeNull();
    expect(sugerirEmail("sem-arroba")).toBeNull();
  });

  it("um domínio que já é de um cliente nunca é engano", () => {
    // live.pt está a uma letra de live.com.pt? Não — mas «me.pt» está a uma de «me.com»? Não.
    // O que interessa: se a casa conhece «gmai.com» (um cliente real), não se corrige.
    expect(sugerirEmail("teste@gmai.com", ["gmai.com"])).toBeNull();
  });

  it("a troca de duas letras vizinhas conta como uma", () => {
    expect(distancia("gmial", "gmail")).toBe(1);
    expect(distancia("addecco", "adecco")).toBe(1);
  });
});

describe("dominiosConhecidos — os domínios dos outros pedidos", () => {
  it("tira o do pedido aberto, para o próprio engano não passar a conhecido", () => {
    const emails = ["a@adecco.com", "b@addecco.com", "c@gmail.com"];
    expect(dominiosConhecidos(emails, "b@addecco.com")).toEqual(["adecco.com", "gmail.com"]);
  });

  it("e assim o engano é apanhado", () => {
    const emails = ["a@adecco.com", "b@addecco.com"];
    expect(sugerirEmail("b@addecco.com", dominiosConhecidos(emails, "b@addecco.com"))).toBe(
      "b@adecco.com",
    );
  });
});
