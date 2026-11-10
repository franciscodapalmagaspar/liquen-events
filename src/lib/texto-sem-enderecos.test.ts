import { describe, expect, it } from "vitest";
import { semEnderecos } from "./texto-sem-enderecos";

describe("semEnderecos — o que volta ao visitante no email", () => {
  it("tira ligações e domínios", () => {
    expect(semEnderecos("Ana — confirme o pagamento em exemplo.tld")).toBe(
      "Ana — confirme o pagamento em …",
    );
    expect(semEnderecos("ver https://x.y/pagar?a=1 já")).toBe("ver … já");
    expect(semEnderecos("www.coisa.pt")).toBe("…");
  });

  it("deixa nomes, locais e eventos de verdade como estão", () => {
    for (const t of [
      "TESTE Sofia & Tiago",
      "Quinta de S. Pedro, Évora",
      "Casamento da Ana e do João",
      "Sr. Rui Gonçalves-Melo",
      "Monte da Oliveirinha (Arraiolos)",
    ]) {
      expect(semEnderecos(t)).toBe(t);
    }
  });
});
