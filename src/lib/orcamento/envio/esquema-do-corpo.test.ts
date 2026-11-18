import { describe, it, expect, vi, beforeEach } from "vitest";
import { log } from "@/lib/logger";
import { __esquecerDesviosDitos } from "@/lib/fronteira/observar";
import { esquemaDoCorpo, observarOCorpo } from "./esquema-do-corpo";
import { IDIOMAS_DA_PROPOSTA } from "@/lib/orcamento/listas-fechadas";
import { corpoLido } from "./ler-o-corpo";

beforeEach(() => {
  __esquecerDesviosDitos();
  vi.restoreAllMocks();
});

describe("o esquema do corpo, em modo de observar", () => {
  it("o corpo que o estúdio manda passa calado", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    observarOCorpo({ mode: "preview", doc: { ref: "R", clientNames: "A" }, idioma: "pt" }, "q1");
    expect(aviso).not.toHaveBeenCalled();
  });

  it("um corpo estranho é DITO, sem o valor — e nada se recusa", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    const cru = { mode: "send", doc: { ref: "R", clientNames: "Ana Secreta" }, mensagem: 7 };
    observarOCorpo(cru, "q1");
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(aviso.mock.calls[0][1]).toEqual({
      id: "q1",
      desvios: [{ campo: "mensagem", problema: "invalid_type" }],
    });
    expect(JSON.stringify(aviso.mock.calls)).not.toContain("Ana Secreta");
  });
});

/**
 * Campo a campo, com o resto do corpo ausente — o `rascunho` só conta na
 * pré-visualização, e é isso que um corpo sem `mode` é.
 *
 * O esquema e a leitura são dois papéis (ver os cabeçalhos), e só os prende
 * ESTA regra, num sentido só: tudo o que o esquema aceita, a leitura lê tal e
 * qual. Se o esquema se ALARGASSE para lá da leitura, o registo calava-se
 * sobre valores que o envio deita fora. Apertar o esquema (para ver mais no
 * registo) continua livre: não mexe em valor nenhum.
 */
describe("o que o esquema aceita, a leitura lê igual", () => {
  const VALORES: unknown[] = [
    ...IDIOMAS_DA_PROPOSTA,
    ...["es", "fr", "", " x ", "send", "preview", "SEND", "true"],
    ...[0, -0, 3, -1, 2.5, 1e9, Number.MAX_SAFE_INTEGER],
    ...[null, true, false, [], {}, { a: 1 }],
  ];
  const campos = Object.keys(esquemaDoCorpo.shape).filter((c) => c !== "doc");
  type Cru = Record<string, unknown>;
  /** A leitura de uma pré-visualização, e a de um envio (os campos de cada porta). */
  const naPreVisualizacao = (cru: Cru) => {
    const p = corpoLido(cru);
    if (p.modo !== "preview") throw new Error("sem «send», é uma pré-visualização");
    return p;
  };
  const noEnvio = (cru: Cru) => {
    const p = corpoLido({ ...cru, mode: "send" });
    if (p.modo !== "send") throw new Error("com «send», é um envio");
    return p;
  };
  const LIDO_COMO: Record<string, (cru: Cru) => unknown> = {
    mode: (c) => corpoLido(c).modo,
    idioma: (c) => corpoLido(c).idioma,
    corpo: (c) => corpoLido(c).textoDoEmail,
    rascunho: (c) => naPreVisualizacao(c).rascunho,
    mensagem: (c) => noEnvio(c).mensagem,
    assunto: (c) => noEnvio(c).assuntoDoEmail,
    modelo: (c) => noEnvio(c).modelo,
    cortesConfirmados: (c) => noEnvio(c).cortesConfirmados,
    fotosEmFaltaConfirmadas: (c) => noEnvio(c).fotosEmFaltaConfirmadas,
    porEmail: (c) => noEnvio(c).porEmail,
    pdfVisto: (c) => noEnvio(c).pdfVisto,
  };

  it("cada campo do esquema tem a sua leitura", () => {
    expect(campos.sort()).toEqual(Object.keys(LIDO_COMO).sort());
  });

  it.each(campos)("%s", (campo) => {
    for (const v of VALORES) {
      const r = esquemaDoCorpo.shape[campo as keyof typeof esquemaDoCorpo.shape].safeParse(v);
      if (!r.success) continue;
      const lido = LIDO_COMO[campo]({ [campo]: v });
      // A mensagem lê-se aparada; o resto, tal e qual.
      expect(lido, `${campo} = ${JSON.stringify(v)}`).toEqual(
        campo === "mensagem" ? String(v).trim() : v,
      );
    }
  });
});
