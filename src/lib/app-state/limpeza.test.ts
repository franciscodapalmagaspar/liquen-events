import { describe, it, expect } from "vitest";
import { contarPorMotivo, oQueSaiDoAppState, type LinhaLida } from "./limpeza";

const P1 = "11111111-1111-4111-8111-111111111111";
const P_APAGADA = "22222222-2222-4222-8222-222222222222";
const P_RECICLADA = "33333333-3333-4333-8333-333333333333";

const existe = {
  pedidos: new Set(["q1", "q-reciclado"]),
  propostas: new Set([P1, P_RECICLADA]),
};
const AGORA = Date.parse("2026-11-18T03:00:00Z");
const ONTEM = "2026-11-17T03:00:00Z";

const linha = (key: string, value: unknown, versao = ONTEM): LinhaLida => ({ key, value, versao });
const saem = (linhas: LinhaLida[], tecto = 1000) =>
  Object.fromEntries(
    oQueSaiDoAppState(linhas, existe, AGORA, tecto).saem.map((s) => [s.key, s.motivo]),
  );

describe("o que sai do app_state esta noite", () => {
  it("as lápides saem, os rascunhos com trabalho de pedidos vivos ficam", () => {
    expect(
      saem([
        linha("proposal-draft:q1", null),
        linha("proposal-draft:q1--sobreposto", { doc: {}, updatedAt: ONTEM }),
        linha("proposal-draft:q1--orcamento-linhas--sobreposto", { doc: {}, updatedAt: ONTEM }),
        linha("proposal-draft:q1", { doc: {}, updatedAt: ONTEM }),
      ]),
    ).toEqual({ "proposal-draft:q1": "lapide" });
  });

  it("o id do rascunho é o do pedido antes do primeiro `--` (13 vivos contavam como órfãos)", () => {
    expect(
      saem([
        linha("proposal-draft:q1--orcamento-linhas", { doc: {}, updatedAt: ONTEM }),
        linha("proposal-draft:q-apagado--orcamento-linhas", { doc: {}, updatedAt: ONTEM }),
      ]),
    ).toEqual({ "proposal-draft:q-apagado--orcamento-linhas": "rascunho-sem-pedido" });
  });

  it("rascunhos e envios de pedidos apagados saem — salvo se o pedido está na Reciclagem", () => {
    expect(
      saem([
        linha("proposal-draft:q-apagado", { doc: {}, updatedAt: ONTEM }),
        linha("proposal-draft:q-reciclado", { doc: {}, updatedAt: ONTEM }),
        linha("envio-de-proposta:q-apagado", { envios: [] }),
        linha("envio-de-proposta:q-reciclado", { envios: [] }),
        linha("envio-de-proposta:q1", { envios: [] }),
      ]),
    ).toEqual({
      "proposal-draft:q-apagado": "rascunho-sem-pedido",
      "envio-de-proposta:q-apagado": "envio-sem-pedido",
    });
  });

  it("as ligações curtas de propostas apagadas saem, nos dois sentidos", () => {
    expect(
      saem([
        linha("ligacao-proposta:abc", { propostaId: P_APAGADA, pedidoId: "q1" }),
        linha("ligacao-de-proposta:" + P_APAGADA, { codigo: "abc" }),
        linha("ligacao-proposta:def", { propostaId: P1, pedidoId: "q1" }),
        linha("ligacao-de-proposta:" + P1, { codigo: "def" }),
        linha("ligacao-proposta:ghi", { propostaId: P_RECICLADA }),
        // Sem `propostaId` legível não se sabe de quem é: fica.
        linha("ligacao-proposta:xyz", { outra: 1 }),
      ]),
    ).toEqual({
      "ligacao-proposta:abc": "ligacao-sem-proposta",
      ["ligacao-de-proposta:" + P_APAGADA]: "ligacao-sem-proposta",
    });
  });

  it("a proposta online: sai a de proposta apagada e o retrato expirado; a paleta (`refs`) nunca é órfã", () => {
    expect(
      saem([
        linha(`proposta-web:conteudo:${P_APAGADA}:aaa`, {}),
        linha(`proposta-web:retrato:${P1}:velho`, { validoAte: AGORA - 1, json: "{}" }),
        linha(`proposta-web:retrato:${P1}:novo`, { validoAte: AGORA + 1000, json: "{}" }),
        linha("proposta-web:paleta-do-pdf:refs:zzz", []),
      ]),
    ).toEqual({
      [`proposta-web:conteudo:${P_APAGADA}:aaa`]: "proposta-web-sem-proposta",
      [`proposta-web:retrato:${P1}:velho`]: "retrato-expirado",
    });
  });

  it("uma linha substituída há mais de 30 dias pela mesma proposta sai; há menos, fica", () => {
    expect(
      saem([
        linha(`proposta-web:conteudo:${P1}:a`, {}, "2026-09-01T00:00:00Z"),
        linha(`proposta-web:conteudo:${P1}:b`, {}, "2026-10-20T00:00:00Z"),
        linha(`proposta-web:conteudo:${P1}:c`, {}, "2026-11-10T00:00:00Z"),
        linha(`proposta-web:cores:${P1}:d`, {}, "2026-01-01T00:00:00Z"),
      ]),
    ).toEqual({ [`proposta-web:conteudo:${P1}:a`]: "proposta-web-substituida" });
  });

  it("o tempo activo, e tudo o resto, nunca sai daqui", () => {
    expect(
      saem([
        linha("tempo-activo:q-apagado", { ms: 1, updatedAt: ONTEM }),
        linha("proposal-templates", null),
        linha("foto-resumo:abc", null),
      ]),
    ).toEqual({});
  });

  it("o tecto: primeiro o que não tem dados de ninguém, e diz quantas ficam", () => {
    const linhas = [
      linha("proposal-draft:q-apagado", { doc: {}, updatedAt: ONTEM }),
      linha("envio-de-proposta:q-apagado", { envios: [] }),
      linha("proposal-draft:q2", null),
      linha("proposal-draft:q3", null),
    ];
    const r = oQueSaiDoAppState(linhas, existe, AGORA, 3);
    expect(r.saem.map((s) => s.motivo)).toEqual(["lapide", "lapide", "envio-sem-pedido"]);
    expect(r.ficam).toBe(1);
    expect(contarPorMotivo(r.saem)).toEqual({ lapide: 2, "envio-sem-pedido": 1 });
  });

  it("leva a versão lida de cada linha (para o apagar condicional)", () => {
    const [s] = oQueSaiDoAppState(
      [linha("proposal-draft:q2", null, "2026-11-17T01:02:03Z")],
      existe,
      AGORA,
      10,
    ).saem;
    expect(s).toEqual({
      key: "proposal-draft:q2",
      value: null,
      versao: "2026-11-17T01:02:03Z",
      motivo: "lapide",
    });
  });
});
