import { describe, it, expect, vi, beforeEach } from "vitest";
import { log } from "@/lib/logger";
import { __esquecerDesviosDitos } from "@/lib/fronteira/observar";
import { MAX_PROPOSAL_DOC_BYTES } from "@/lib/proposal-doc";
import { MAXIMO_CORPO_ESCRITO } from "@/lib/email-corpo-escrito";
import { corpoLido } from "./ler-o-corpo";
import { guardasBaratas } from "./guardas-baratas";

/** Um corpo com UM desvio ao esquema (`mensagem` em número): se for observado, diz-se. */
const comDesvio = (o: Record<string, unknown>) =>
  corpoLido({ mode: "send", mensagem: 7, doc: { ref: "R", clientNames: "A" }, ...o });

let aviso: ReturnType<typeof vi.spyOn>;
const observado = () =>
  aviso.mock.calls.some((c: unknown[]) => String(c[0]).startsWith("fronteira:"));
const idiomaDito = () =>
  aviso.mock.calls.some((c: unknown[]) => String(c[0]).includes("idioma desconhecido"));

beforeEach(() => {
  __esquecerDesviosDitos();
  vi.restoreAllMocks();
  aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
});

describe("as guardas baratas, pela ordem", () => {
  it("o que passa segue com o documento e a chave, e SÓ ENTÃO vai ao registo", () => {
    const r = guardasBaratas("q1", comDesvio({}));
    expect(r.segue).toBe(true);
    expect(r.segue && r.valor.doc.ref).toBe("R");
    expect(r.segue && r.valor.chaveDoQueChegou).toMatch(/\S/);
    expect(observado()).toBe(true);
  });

  it("o texto do email grande demais é 400, e não vai ao registo", () => {
    const r = guardasBaratas("q1", comDesvio({ corpo: "a".repeat(MAXIMO_CORPO_ESCRITO + 1) }));
    expect(r).toMatchObject({
      segue: false,
      desfecho: { tipo: "recusa", recusa: { status: 400 } },
    });
    expect(observado()).toBe(false);
  });

  it("o documento incompleto é 400, não diz a língua e não vai ao registo", () => {
    const r = guardasBaratas("q1", comDesvio({ doc: { ref: "R" }, idioma: "fr" }));
    expect(r).toMatchObject({
      segue: false,
      desfecho: { recusa: { corpo: { error: "Proposta incompleta: falta o nome dos clientes." } } },
    });
    expect(idiomaDito()).toBe(false);
    expect(observado()).toBe(false);
  });

  it("o documento grande demais é 413 — a língua já se disse, o registo não", () => {
    const enorme = { ref: "R", clientNames: "A", notes: "x".repeat(MAX_PROPOSAL_DOC_BYTES) };
    const r = guardasBaratas("q1", comDesvio({ doc: enorme, idioma: "fr" }));
    expect(r).toMatchObject({
      segue: false,
      desfecho: { tipo: "recusa", recusa: { status: 413 } },
    });
    expect(idiomaDito()).toBe(true);
    expect(observado()).toBe(false);
  });

  it("a língua estranha diz-se uma vez, com o valor; sem o campo, nada", () => {
    guardasBaratas("q1", comDesvio({ idioma: "fr" }));
    expect(aviso).toHaveBeenCalledWith(
      "proposta-doc: idioma desconhecido, a desenhar em português",
      {
        id: "q1",
        recebido: "fr",
      },
    );
    aviso.mockClear();
    guardasBaratas("q1", corpoLido({ mode: "send", doc: { ref: "R", clientNames: "A" } }));
    expect(aviso).not.toHaveBeenCalled();
  });
});
