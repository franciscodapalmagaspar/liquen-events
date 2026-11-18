import { describe, it, expect } from "vitest";
import { contarPorMotivo, oQueSaiDoAppState } from "./limpeza";
import type { LinhaVarrida } from "./varrer";

const P1 = "11111111-1111-4111-8111-111111111111";
const P_APAGADA = "22222222-2222-4222-8222-222222222222";
const P_RECICLADA = "33333333-3333-4333-8333-333333333333";

const existe = {
  pedidos: new Set(["q1", "q-reciclado"]),
  propostas: new Set([P1, P_RECICLADA]),
};
const AGORA = Date.parse("2026-11-18T03:00:00Z");
const ANTIGA = "2026-11-10T03:00:00Z";
const HA_UMA_HORA = "2026-11-18T02:00:00Z";

const linha = (
  key: string,
  campos: Record<string, unknown> = {},
  versao = ANTIGA,
): LinhaVarrida => ({
  key,
  versao,
  nula: false,
  campos,
});
const lapide = (key: string, versao = ANTIGA): LinhaVarrida => ({
  key,
  versao,
  nula: true,
  campos: {},
});
const saem = (linhas: LinhaVarrida[], tecto = 1000) =>
  Object.fromEntries(
    oQueSaiDoAppState(linhas, existe, AGORA, tecto).saem.map((s) => [s.key, s.motivo]),
  );

describe("o que sai do app_state esta noite", () => {
  it("as lápides saem (de qualquer espaço limpo), os rascunhos de pedidos vivos ficam", () => {
    expect(
      saem([
        lapide("proposal-draft:q1"),
        lapide("envio-de-proposta:q1"),
        linha("proposal-draft:q1--sobreposto"),
        linha("proposal-draft:q1--orcamento-linhas--sobreposto"),
        linha("proposal-draft:q1"),
      ]),
    ).toEqual({ "proposal-draft:q1": "lapide", "envio-de-proposta:q1": "lapide" });
  });

  it("o id do rascunho é o do pedido antes do primeiro `--` (13 vivos contavam como órfãos)", () => {
    expect(
      saem([
        linha("proposal-draft:q1--orcamento-linhas"),
        linha("proposal-draft:q-apagado--orcamento-linhas"),
      ]),
    ).toEqual({ "proposal-draft:q-apagado--orcamento-linhas": "rascunho-sem-pedido" });
  });

  it("rascunhos e envios de pedidos apagados saem — salvo se o pedido está na Reciclagem", () => {
    expect(
      saem([
        linha("proposal-draft:q-apagado"),
        linha("proposal-draft:q-reciclado"),
        linha("envio-de-proposta:q-apagado"),
        linha("envio-de-proposta:q-reciclado"),
        linha("envio-de-proposta:q1"),
      ]),
    ).toEqual({
      "proposal-draft:q-apagado": "rascunho-sem-pedido",
      "envio-de-proposta:q-apagado": "envio-sem-pedido",
    });
  });

  it("um órfão escrito há menos de 24 h fica: pode ter nascido depois de se ler quem existe", () => {
    expect(
      saem([
        linha("proposal-draft:q-novo", {}, HA_UMA_HORA),
        linha("ligacao-proposta:novo", { propostaId: P_APAGADA }, HA_UMA_HORA),
        linha("envio-de-proposta:q-sem-data", {}, "ilegível"),
      ]),
    ).toEqual({});
  });

  it("as ligações de propostas apagadas saem, nos dois sentidos; a do pedido vivo fica", () => {
    expect(
      saem([
        linha("ligacao-proposta:abc", { propostaId: P_APAGADA, pedidoId: "q-apagado" }),
        linha("ligacao-de-proposta:" + P_APAGADA, { codigo: "abc" }),
        linha("ligacao-proposta:def", { propostaId: P1, pedidoId: "q1" }),
        linha("ligacao-de-proposta:" + P1, { codigo: "def" }),
        // A proposta saiu com o pedido para a Reciclagem: o pedido existe.
        linha("ligacao-proposta:ghi", { propostaId: P_APAGADA, pedidoId: "q-reciclado" }),
        linha("ligacao-de-proposta:44444444-4444-4444-8444-444444444444", { codigo: "ghi" }),
        // Sem `propostaId` legível não se sabe de quem é: fica.
        linha("ligacao-proposta:xyz", { outra: 1 }),
      ]),
    ).toEqual({
      "ligacao-proposta:abc": "ligacao-sem-proposta",
      ["ligacao-de-proposta:" + P_APAGADA]: "ligacao-sem-proposta",
    });
  });

  it("a proposta online: sai a de proposta apagada e o retrato expirado; o resto da cache fica", () => {
    expect(
      saem([
        linha(`proposta-web:conteudo:${P_APAGADA}:aaa`),
        linha(`proposta-web:retrato:${P1}:velho`, { validoAte: AGORA - 1 }),
        linha(`proposta-web:retrato:${P1}:novo`, { validoAte: AGORA + 1000 }),
        linha(`proposta-web:conteudo:${P1}:a`, {}, "2026-01-01T00:00:00Z"),
        linha(`proposta-web:conteudo:${P1}:b`, {}, "2026-11-10T00:00:00Z"),
        linha("proposta-web:paleta-do-pdf:refs:zzz"),
      ]),
    ).toEqual({
      [`proposta-web:conteudo:${P_APAGADA}:aaa`]: "proposta-web-sem-proposta",
      [`proposta-web:retrato:${P1}:velho`]: "retrato-expirado",
    });
  });

  it("o tempo activo, e tudo o resto fora dos espaços limpos, nunca sai daqui", () => {
    expect(
      saem([
        linha("tempo-activo:q-apagado"),
        lapide("tempo-activo:q-apagado"),
        lapide("proposal-templates"),
        lapide("foto-resumo:abc"),
      ]),
    ).toEqual({});
  });

  it("o tecto: primeiro o que não tem dados de ninguém, e diz quantas ficam", () => {
    const r = oQueSaiDoAppState(
      [
        linha("proposal-draft:q-apagado"),
        linha("envio-de-proposta:q-apagado"),
        lapide("proposal-draft:q2"),
        lapide("proposal-draft:q3"),
      ],
      existe,
      AGORA,
      3,
    );
    expect(r.saem.map((s) => s.motivo)).toEqual(["lapide", "lapide", "envio-sem-pedido"]);
    expect(r.ficam).toBe(1);
    expect(contarPorMotivo(r.saem)).toEqual({ lapide: 2, "envio-sem-pedido": 1 });
  });

  it("leva a versão lida de cada linha (para o apagar condicional)", () => {
    const [s] = oQueSaiDoAppState(
      [lapide("proposal-draft:q2", "2026-11-17T01:02:03Z")],
      existe,
      AGORA,
      10,
    ).saem;
    expect(s).toEqual({
      key: "proposal-draft:q2",
      versao: "2026-11-17T01:02:03Z",
      nula: true,
      campos: {},
      motivo: "lapide",
    });
  });
});
