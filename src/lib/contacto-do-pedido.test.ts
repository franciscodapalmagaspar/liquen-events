import { describe, expect, it } from "vitest";
import { normalizarTelefone, sugestaoDeEmail } from "./contacto-do-pedido";

describe("normalizarTelefone — E.164, ou nada", () => {
  it.each([
    ["912345678", "+351912345678"],
    ["912 345 678", "+351912345678"],
    ["912.345.678", "+351912345678"],
    ["+351 912 345 678", "+351912345678"],
    ["00351912345678", "+351912345678"],
    ["(+351) 266-123-456", "+351266123456"],
    ["213456789", "+351213456789"],
    ["+44 7700 900123", "+447700900123"],
    ["0033 6 12 34 56 78", "+33612345678"],
  ])("%s → %s", (bruto, e164) => {
    expect(normalizarTelefone(bruto)).toBe(e164);
  });

  it.each([
    ["", "vazio"],
    ["91234", "curto de mais"],
    ["9123456789", "um dígito a mais"],
    ["812345678", "não começa por 9, 2 ou 3"],
    ["+351 91234567", "+351 com 8 dígitos"],
    ["+351 9123456789", "+351 com 10 dígitos"],
    ["+0 123456789", "indicativo a começar por 0"],
    ["+1234567", "estrangeiro curto de mais"],
    ["ana@exemplo.pt", "um email"],
    ["91234567a", "com letras"],
  ])("%s é recusado (%s)", (bruto) => {
    expect(normalizarTelefone(bruto)).toBeNull();
  });
});

describe("sugestaoDeEmail — o domínio mal escrito", () => {
  it.each([
    ["ana@gmial.com", "ana@gmail.com"],
    ["ana@gmail.con", "ana@gmail.com"],
    ["ana@gnail.com", "ana@gmail.com"],
    ["ana@hotmal.com", "ana@hotmail.com"],
    ["ana@hotmail.ot", "ana@hotmail.pt"],
    ["Ana.Silva@outlok.pt", "Ana.Silva@outlook.pt"],
    ["ana@sapo.ot", "ana@sapo.pt"],
  ])("%s → %s", (email, sugerido) => {
    expect(sugestaoDeEmail(email)).toBe(sugerido);
  });

  it.each(["ana@gmail.com", "ana@liquen-events.com", "ana@empresa.pt", "ana", "", "@gmail.com"])(
    "%s fica como está",
    (email) => {
      expect(sugestaoDeEmail(email)).toBeNull();
    },
  );

  it("o engano ANTES do @ não se adivinha — é para isso a confirmação", () => {
    expect(sugestaoDeEmail("candmcasmento@gmail.com")).toBeNull();
  });
});
