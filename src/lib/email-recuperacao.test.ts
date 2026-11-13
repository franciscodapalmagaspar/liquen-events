import { describe, expect, it } from "vitest";
import {
  ASSUNTO_DA_RECUPERACAO,
  horaDeLisboa,
  htmlDaRecuperacao,
  textoDaRecuperacao,
} from "./email-recuperacao";

const dados = {
  logo: "cid:liquen-logo",
  nome: "Catarina Gaspar",
  ligacao: "https://liquen-events.com/orcamento/admin/recuperar?token=abc&x=<y>",
  minutos: 30,
  // 11:16 em Lisboa (inverno, UTC+0).
  pedidoEm: new Date("2026-11-13T11:16:00Z"),
};

describe("o email «Definir uma palavra-passe nova» (13/11)", () => {
  it("trata pelo primeiro nome e diz a HORA a que expira", () => {
    const t = textoDaRecuperacao(dados);
    expect(t).toMatch(/^Olá Catarina,/);
    expect(t).toContain("válida até às 11:46 (30 minutos)");
  });

  it("sem «esperemos que tu» e com a grafia atual", () => {
    const tudo = textoDaRecuperacao(dados) + htmlDaRecuperacao(dados);
    expect(tudo).not.toMatch(/esperemos|actual/);
    expect(tudo).toContain("palavra-passe atual continua a valer");
  });

  it("tem um botão com a ligação, a ligação escrita por baixo, e escapa o HTML", () => {
    const h = htmlDaRecuperacao(dados);
    expect(h).toContain(">Definir a palavra-passe</a>");
    expect(h).toContain('bgcolor="#4d6650"');
    expect(h).not.toContain("<y>");
    expect(h).toContain("token=abc&amp;x=&lt;y&gt;");
    expect(h).toContain('src="cid:liquen-logo"');
  });

  it("o assunto não muda (é por ele que ela o procura)", () => {
    expect(ASSUNTO_DA_RECUPERACAO).toBe("Definir uma palavra-passe nova — Líquen Events");
  });

  it("a hora é a de Lisboa, também no verão", () => {
    expect(horaDeLisboa(new Date("2026-07-01T10:00:00Z"))).toBe("11:00");
  });
});
