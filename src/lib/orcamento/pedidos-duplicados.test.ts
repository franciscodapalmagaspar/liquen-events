import { describe, expect, it } from "vitest";
import {
  motivoDoDuplicado,
  nomeComparavel,
  possiveisDuplicados,
  separar,
  telefoneComparavel,
} from "./pedidos-duplicados";

/** D1 (docs/FAZER-PROPOSTA-MELHORIAS.md): as três regras dela e as duas proibições. */

const base = { email: "", phone: "", name: "", date: "" };

describe("nomes parecidos", () => {
  it("ignora maiúsculas, acentos e nomes do meio (o caso da Ana)", () => {
    expect(nomeComparavel("Ana Serra Lobo")).toBe("ana lobo");
    expect(nomeComparavel("Ana lobo")).toBe("ana lobo");
    expect(nomeComparavel("  JOÃO  de Sá ")).toBe("joao sa");
    expect(nomeComparavel("")).toBeNull();
  });
  it("o telefone compara-se sem o indicativo", () => {
    expect(telefoneComparavel("+351 912 345 678")).toBe("912345678");
    expect(telefoneComparavel("912345678")).toBe("912345678");
    expect(telefoneComparavel("123")).toBeNull();
  });
});

describe("quando dois pedidos parecem o mesmo", () => {
  it("a mesma data e o mesmo primeiro e último nome", () => {
    expect(
      motivoDoDuplicado(
        { ...base, name: "Ana Serra Lobo", date: "2026-11-06" },
        { ...base, name: "Ana lobo", date: "2026-11-06" },
      ),
    ).toBe("nome-e-data");
  });
  it("o nome sem a data não chega (há muitas Anas)", () => {
    expect(
      motivoDoDuplicado(
        { ...base, name: "Ana Lobo", date: "2026-11-06" },
        { ...base, name: "Ana Lobo", date: "2027-05-01" },
      ),
    ).toBeNull();
  });
  it("o mesmo email, sem olhar a maiúsculas", () => {
    expect(
      motivoDoDuplicado(
        { ...base, email: "Ana@Exemplo.pt" },
        { ...base, email: "ana@exemplo.pt " },
      ),
    ).toBe("email");
  });
  it("o mesmo telefone", () => {
    expect(
      motivoDoDuplicado({ ...base, phone: "+351912345678" }, { ...base, phone: "912 345 678" }),
    ).toBe("telefone");
  });
});

describe("a lista", () => {
  const ana1 = { id: "a", ...base, name: "Ana Serra Lobo", date: "2026-11-06" };
  const ana2 = { id: "b", ...base, name: "Ana lobo", date: "2026-11-06" };
  const outro = { id: "c", ...base, name: "Rui Costa", date: "2026-11-06" };

  it("marca os dois, um a apontar para o outro", () => {
    const m = possiveisDuplicados([ana1, ana2, outro]);
    expect(m.get("a")).toEqual([{ id: "b", motivo: "nome-e-data" }]);
    expect(m.get("b")).toEqual([{ id: "a", motivo: "nome-e-data" }]);
    expect(m.has("c")).toBe(false);
  });
  it("«não são o mesmo» tira a etiqueta e não volta, dito em qualquer dos dois", () => {
    expect(possiveisDuplicados([{ ...ana1, naoDuplicados: ["b"] }, ana2]).size).toBe(0);
    expect(possiveisDuplicados([ana1, { ...ana2, naoDuplicados: ["a"] }]).size).toBe(0);
  });
  it("um arquivado não entra", () => {
    expect(possiveisDuplicados([ana1, { ...ana2, archived: true }]).size).toBe(0);
  });
  it("separar não repete", () => {
    expect(separar({ naoDuplicados: ["b"] }, "b")).toEqual(["b"]);
    expect(separar({}, "b")).toEqual(["b"]);
  });
});
