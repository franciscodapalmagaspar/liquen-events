import { describe, it, expect, vi, beforeEach } from "vitest";
import { log } from "@/lib/logger";
import { __esquecerDesviosDitos } from "@/lib/fronteira/observar";
import { esquemaDoCorpo, observarOCorpo } from "./esquema-do-corpo";
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
 * O esquema e a leitura são dois papéis (ver os cabeçalhos), e só os prende
 * ESTA regra, num sentido só: tudo o que o esquema aceita, a leitura lê tal e
 * qual. Se o esquema se ALARGASSE para lá da leitura, o registo calava-se
 * sobre valores que o envio deita fora. Apertar o esquema (para ver mais no
 * registo) continua livre: não mexe em valor nenhum.
 */
describe("o que o esquema aceita, a leitura lê igual", () => {
  const VALORES: unknown[] = [
    undefined,
    null,
    0,
    3,
    -1,
    2.5,
    "",
    " x ",
    "send",
    "preview",
    "en",
    "pt",
    "fr",
    true,
    false,
    [],
    {},
  ];
  const campos = Object.keys(esquemaDoCorpo.shape).filter((c) => c !== "doc");
  const LIDO_COMO: Record<string, (p: ReturnType<typeof corpoLido>) => unknown> = {
    mode: (p) => p.modo,
    idioma: (p) => p.idioma,
    mensagem: (p) => p.mensagem,
    corpo: (p) => p.textoDoEmail,
    assunto: (p) => p.assuntoDoEmail,
    modelo: (p) => p.modelo,
    cortesConfirmados: (p) => p.cortesConfirmados,
    fotosEmFaltaConfirmadas: (p) => p.fotosEmFaltaConfirmadas,
    porEmail: (p) => p.porEmail,
    rascunho: (p) => p.rascunho,
    pdfVisto: (p) => p.pdfVisto,
  };

  it("cada campo do esquema tem a sua leitura", () => {
    expect(campos.sort()).toEqual(Object.keys(LIDO_COMO).sort());
  });

  it.each(campos)("%s", (campo) => {
    for (const v of VALORES) {
      if (v === undefined) continue;
      const r = esquemaDoCorpo.shape[campo as keyof typeof esquemaDoCorpo.shape].safeParse(v);
      if (!r.success) continue;
      const lido = LIDO_COMO[campo](corpoLido({ [campo]: v }));
      // A mensagem lê-se aparada; o resto, tal e qual.
      expect(lido, `${campo} = ${JSON.stringify(v)}`).toEqual(
        campo === "mensagem" ? String(v).trim() : v === "preview" ? "preview" : v,
      );
    }
  });
});
