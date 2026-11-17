import { describe, it, expect } from "vitest";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { lerOCorpo, corpoLido, documentoCompleto } from "./ler-o-corpo";

const pedir = (corpo: string) =>
  new Request("https://liquen.test/x", { method: "POST", body: corpo });

describe("o corpo do pedido à rota da proposta", () => {
  it("cada tolerância de sempre, aplicada uma vez", () => {
    const p = corpoLido({
      mode: "send",
      mensagem: 42,
      porEmail: "não",
      rascunho: true,
    });
    expect(p.modo).toBe("send");
    // Uma mensagem que não é texto não pára o envio: vale vazia.
    expect(p.mensagem).toBe("");
    // Só um `false` explícito cala o email.
    expect(p.porEmail).toBe(true);
    // O rascunho só existe na pré-visualização.
    expect(p.rascunho).toBe(false);
  });

  it("um corpo nulo é uma pré-visualização sem documento", () => {
    const p = corpoLido(null);
    expect(p).toMatchObject({ modo: "preview", doc: undefined, porEmail: true, rascunho: false });
    expect(documentoCompleto(p.doc)).toEqual({
      ok: false,
      error: "Proposta incompleta: falta o documento.",
    });
  });

  it("a mensagem perde os espaços das pontas, e o modo desconhecido é pré-visualização", () => {
    const p = corpoLido({ mode: "outro", mensagem: "  olá  " });
    expect(p.modo).toBe("preview");
    expect(p.mensagem).toBe("olá");
  });

  it("diz o que falta no documento", () => {
    const d = (o: object) => o as ProposalDoc;
    const erro = (o: object) => {
      const r = documentoCompleto(d(o));
      return r.ok ? null : r.error;
    };
    expect(erro({ ref: "", clientNames: "A" })).toBe("Proposta incompleta: falta a referência.");
    expect(erro({ ref: "", clientNames: "" })).toBe(
      "Proposta incompleta: falta a referência e o nome dos clientes.",
    );
    // Um `doc` que não é objecto responde o que a rota antiga respondia.
    expect(erro("x" as unknown as object)).toBe(
      "Proposta incompleta: falta a referência e o nome dos clientes.",
    );
    const bom = d({ ref: "R", clientNames: "A" });
    expect(documentoCompleto(bom)).toEqual({ ok: true, doc: bom });
  });

  it("a língua: sem campo é português; um valor estranho é português, e guarda-se para o registo", () => {
    for (const [recebido, idioma] of [
      [undefined, "pt"],
      ["en", "en"],
      ["pt", "pt"],
    ] as const) {
      expect(corpoLido({ idioma: recebido })).toMatchObject({ idioma, idiomaDesconhecido: null });
    }
    expect(corpoLido({ idioma: "fr" })).toMatchObject({
      idioma: "pt",
      idiomaDesconhecido: { recebido: "fr" },
    });
    expect(corpoLido({ idioma: null })).toMatchObject({
      idioma: "pt",
      idiomaDesconhecido: { recebido: null },
    });
    // Um valor que nem se converte em texto lê-se sem rebentar: só o aviso o
    // converte, depois do documento (`guardas-baratas.test.ts`).
    expect(() => corpoLido(JSON.parse('{"idioma":{"toString":1}}'))).not.toThrow();
  });

  it("as respostas e os textos só contam com a forma certa — o resto é «não veio»", () => {
    const p = corpoLido({
      corpo: 42,
      assunto: ["x"],
      modelo: 7,
      pdfVisto: 1,
      fotosEmFaltaConfirmadas: "3",
      cortesConfirmados: "sim",
    });
    expect(p).toMatchObject({
      textoDoEmail: null,
      assuntoDoEmail: null,
      modelo: "",
      pdfVisto: null,
      fotosEmFaltaConfirmadas: null,
      cortesConfirmados: false,
    });
    expect(corpoLido({ fotosEmFaltaConfirmadas: Number.NaN }).fotosEmFaltaConfirmadas).toBeNull();
    expect(corpoLido({ fotosEmFaltaConfirmadas: false }).fotosEmFaltaConfirmadas).toBeNull();
    // O «sim» antigo segue tal e qual: quem decide se ainda vale é a pergunta
    // das fotos (`FIM_DO_SIM_ANTIGO`), não a leitura.
    expect(corpoLido({ fotosEmFaltaConfirmadas: true }).fotosEmFaltaConfirmadas).toBe(true);
    const bom = corpoLido({
      corpo: "Olá",
      assunto: "A proposta",
      modelo: "registo-formal",
      pdfVisto: "k",
      fotosEmFaltaConfirmadas: 3,
      cortesConfirmados: true,
    });
    expect(bom).toMatchObject({
      textoDoEmail: "Olá",
      assuntoDoEmail: "A proposta",
      modelo: "registo-formal",
      pdfVisto: "k",
      fotosEmFaltaConfirmadas: 3,
      cortesConfirmados: true,
    });
  });
});

/**
 * Cada campo, lido como a rota ANTIGA o lia (`bfd82ccf`, `route.ts`) — escrito
 * aqui por extenso, para que a leitura não possa mudar sem um teste a dizê-lo:
 *
 *   mode ...................... `body?.mode === "send"`
 *   mensagem .................. `typeof === "string" ? .trim() : ""`
 *   porEmail .................. `body?.porEmail !== false`
 *   rascunho .................. `mode === "preview" && body?.rascunho === true`
 *   modelo .................... `typeof === "string" ? valor : ""`
 *   pdfVisto .................. `typeof === "string"` (e só então se compara)
 *   fotosEmFaltaConfirmadas ... `typeof === "number" && Number.isFinite`; um
 *                               negativo nunca chegava às fotos em falta, que é
 *                               o mesmo que não ter vindo; e `true`, o «sim»
 *                               antigo, até ao fim de 18/11 (`e8a4a94b`)
 *   cortesConfirmados ......... `=== true`
 */
describe("a leitura é a da rota antiga, campo a campo", () => {
  const ESTRANHOS: unknown[] = [
    undefined,
    null,
    0,
    1,
    -1,
    2.5,
    "",
    "x",
    "true",
    true,
    false,
    [],
    {},
  ];

  it.each(ESTRANHOS)("com %j em todos os campos", (v) => {
    const p = corpoLido({
      mode: v,
      mensagem: v,
      porEmail: v,
      rascunho: v,
      modelo: v,
      pdfVisto: v,
      corpo: v,
      assunto: v,
      fotosEmFaltaConfirmadas: v,
      cortesConfirmados: v,
    });
    const ehTexto = typeof v === "string";
    expect(p).toMatchObject({
      modo: "preview",
      mensagem: ehTexto ? (v as string).trim() : "",
      porEmail: v !== false,
      rascunho: v === true,
      modelo: ehTexto ? v : "",
      pdfVisto: ehTexto ? v : null,
      textoDoEmail: ehTexto ? v : null,
      assuntoDoEmail: ehTexto ? v : null,
      fotosEmFaltaConfirmadas:
        typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : v === true ? true : null,
      cortesConfirmados: v === true,
    });
  });

  it("só «send» é um envio", () => {
    expect(corpoLido({ mode: "send" }).modo).toBe("send");
    expect(corpoLido({ mode: "send", rascunho: true }).rascunho).toBe(false);
    for (const m of ["SEND", "preview", 1, true, null])
      expect(corpoLido({ mode: m }).modo).toBe("preview");
  });

  it("um corpo que não é objecto lê-se como vazio", () => {
    for (const cru of [null, 7, "ola", [1, 2], true]) {
      expect(corpoLido(cru)).toMatchObject({ modo: "preview", doc: undefined, porEmail: true });
    }
  });

  it("um corpo que não é JSON vale nulo, como sempre", async () => {
    const p = await lerOCorpo(pedir("{não é json"));
    expect(p.cru).toBeNull();
    expect(p.doc).toBeUndefined();
    expect(p.modo).toBe("preview");
  });
});
