import { describe, expect, it } from "vitest";
import {
  normalizarTelefone,
  paisDoNumero,
  separarTelefone,
  sugestaoDeEmail,
} from "./contacto-do-pedido";

describe("normalizarTelefone — E.164, ou nada", () => {
  it.each([
    ["912345678", "+351912345678"],
    ["912 345 678", "+351912345678"],
    ["912.345.678", "+351912345678"],
    ["+351 912 345 678", "+351912345678"],
    ["00351912345678", "+351912345678"],
    ["(+351) 266-123-456", "+351266123456"],
    ["213456789", "+351213456789"],
    ["+44 20 7946 0958", "+442079460958"],
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
    ["912345678a", "com uma letra no fim (a biblioteca, sozinha, aceitava-o)"],
    ["912 345 678 ext. 2", "com extensão"],
    ["+351 912 345 678 +1", "com um + a meio"],
    ["+44 7700 900123", "a gama de números de ficção do Reino Unido (07700 900…)"],
  ])("%s é recusado (%s)", (bruto) => {
    expect(normalizarTelefone(bruto)).toBeNull();
  });
});

/**
 * Ela (30/10): «quero que o sistema detete e não deixe enviar […] números de
 * telefone seja qual país for». O país escolhido na bandeira decide as regras
 * de um número escrito sem «+»; um «+» à frente sobrepõe-se à bandeira.
 */
describe("normalizarTelefone — as regras de cada país", () => {
  it.each([
    ["612 345 678", "ES", "+34612345678"],
    ["06 12 34 56 78", "FR", "+33612345678"],
    ["07911 123456", "GB", "+447911123456"],
    ["11 91234-5678", "BR", "+5511912345678"],
    ["(201) 555-0123", "US", "+12015550123"],
    ["078 123 45 67", "CH", "+41781234567"],
    ["01512 3456789", "DE", "+4915123456789"],
    ["312 345 6789", "IT", "+393123456789"],
    ["923 123 456", "AO", "+244923123456"],
    ["991 23 45", "CV", "+2389912345"],
  ])("%s com a bandeira %s → %s", (bruto, pais, e164) => {
    expect(normalizarTelefone(bruto, pais)).toBe(e164);
  });

  it.each([
    ["51234567", "ES", "um dígito a menos"],
    ["06 12 34 56", "FR", "dois dígitos a menos"],
    ["07911 12345", "GB", "um dígito a menos"],
    ["11 1234-567", "BR", "sem o 9 do móvel e curto"],
    ["555 0123", "US", "sem o indicativo de área"],
    ["078 123 45", "CH", "curto"],
    ["0151 23", "DE", "curto"],
    ["312", "IT", "curto"],
    ["823 123 456", "AO", "não começa por um prefixo de Angola"],
    ["991 23", "CV", "curto"],
  ])("%s com a bandeira %s é recusado (%s)", (bruto, pais) => {
    expect(normalizarTelefone(bruto, pais)).toBeNull();
  });

  it("um número português com a bandeira do Reino Unido não passa", () => {
    expect(normalizarTelefone("912345678", "GB")).toBeNull();
  });

  it("o «+» do número sobrepõe-se à bandeira escolhida", () => {
    expect(normalizarTelefone("+351 912 345 678", "GB")).toBe("+351912345678");
    expect(normalizarTelefone("+55 11 91234-5678", "PT")).toBe("+5511912345678");
    expect(normalizarTelefone("0034 612 345 678", "FR")).toBe("+34612345678");
  });

  it("sem bandeira, é Portugal; uma bandeira que não existe também", () => {
    expect(normalizarTelefone("912345678")).toBe("+351912345678");
    expect(normalizarTelefone("912345678", "XX")).toBe("+351912345678");
  });
});

describe("paisDoNumero — a bandeira muda sozinha ao colar um «+»", () => {
  it("um número completo dá o país e o número nacional", () => {
    expect(paisDoNumero("+55 11 91234-5678")).toEqual({ pais: "BR", numero: "(11) 91234-5678" });
    expect(paisDoNumero("0033 6 12 34 56 78")).toEqual({ pais: "FR", numero: "06 12 34 56 78" });
  });

  it("um indicativo completo, ainda sem número, já dá o país (o principal, se for partilhado)", () => {
    expect(paisDoNumero("+44")).toEqual({ pais: "GB", numero: "" });
    expect(paisDoNumero("+351")).toEqual({ pais: "PT", numero: "" });
    expect(paisDoNumero("+1")).toEqual({ pais: "US", numero: "" });
  });

  it("num indicativo partilhado, o número completo acerta o país", () => {
    expect(paisDoNumero("+1 416 555 0123")?.pais).toBe("CA");
  });

  it("um indicativo a meio, ou que não é de país nenhum, não muda nada", () => {
    expect(paisDoNumero("+4")).toBeNull();
    expect(paisDoNumero("+800 1234 5678")).toBeNull();
    expect(paisDoNumero("912345678")).toBeNull();
  });
});

describe("separarTelefone — um telefone gravado, aberto no campo", () => {
  it("um E.164 sai com o país e no formato do país", () => {
    expect(separarTelefone("+351912345678")).toEqual({ pais: "PT", numero: "912 345 678" });
  });

  it("um número antigo sem «+» é português", () => {
    expect(separarTelefone("912345678")).toEqual({ pais: "PT", numero: "912 345 678" });
  });

  it("um número antigo que não se percebe fica como estava", () => {
    expect(separarTelefone("91 234 56 78 ext")).toEqual({ pais: "PT", numero: "91 234 56 78 ext" });
    expect(separarTelefone("")).toEqual({ pais: "PT", numero: "" });
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
