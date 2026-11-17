import { describe, it, expect } from "vitest";
import { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream, type PDFObject } from "pdf-lib";
import { renderContractPdf } from "./contract-pdf";
import { DEFAULT_TERMS, DEFAULT_TERMS_EN, termosPara, termsToPlainText } from "./contract-terms";
import type { Contract } from "./contract-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CONTRATO EM INGLÊS — E O PORTUGUÊS A MANDAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela: «o contrato quer que exista também em inglês». A proposta, o
 * email, o portal e o PDF já eram bilingues; os Termos & Condições eram a
 * única peça que não, e um casal estrangeiro aceitava um documento legal que
 * não lia.
 *
 * O que se prende aqui não é a tradução — é o que a torna segura:
 *
 *  1. os NÚMEROS dos pontos são os mesmos nas duas línguas, senão a
 *     substituição da percentagem do sinal parte-se em silêncio;
 *  2. o texto inglês DIZ que a versão portuguesa prevalece;
 *  3. a folha inglesa não tem uma única palavra portuguesa da moldura — nem o
 *     contrário.
 */

// CP1252 no bloco 0x80–0x9F, como no `contract-pdf.datas.test.ts`.
const CP1252_ALTO: Record<number, string> = {
  0x91: "‘",
  0x92: "’",
  0x93: "“",
  0x94: "”",
  0x96: "–",
  0x97: "—",
  0x85: "…",
  0xa0: " ",
};

/** Todo o texto impresso no documento. Ver a nota longa em `contract-pdf.datas.test.ts`. */
async function textoDoPdf(bytes: Uint8Array | Buffer): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  let saida = "";
  for (let i = 0; i < pdf.getPageCount(); i += 1) {
    const pagina = pdf.getPage(i);
    const ctx = pagina.node.context;
    const contents = pagina.node.Contents();
    const partes: (PDFObject | undefined)[] =
      contents instanceof PDFArray ? contents.asArray() : [contents];
    let ops = "";
    for (const parte of partes) {
      const stream = ctx.lookup(parte);
      if (stream instanceof PDFRawStream) {
        ops += Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
      }
    }
    for (const m of ops.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) {
      for (let k = 0; k + 2 <= m[1].length; k += 2) {
        const b = parseInt(m[1].slice(k, k + 2), 16);
        saida += b >= 0x80 && b <= 0x9f ? (CP1252_ALTO[b] ?? "?") : String.fromCharCode(b);
      }
      saida += "\n";
    }
  }
  return saida;
}

function contrato(over: Partial<Contract> = {}): Contract {
  return {
    id: "c-1",
    quoteId: "LIQ-9",
    proposalId: "p-1",
    clientName: "Anna & Tom",
    clientEmail: "anna@example.com",
    termsVersion: "2026-08",
    termsSnapshot: termsToPlainText(termosPara(30, over.idioma ?? "pt")),
    status: "aceite",
    createdAt: "2026-07-01T10:00:00.000Z",
    acceptedAt: "2026-07-02T14:32:00.000Z",
    registadoPor: "Catarina Gaspar",
    registadoComo: "Signed on paper, 12/05",
    ...over,
  };
}

describe("os dois textos são o mesmo contrato", () => {
  it("têm os mesmos pontos, pela mesma ordem e com os mesmos números", () => {
    // Não é simetria: o resto do produto fala de «ponto 3» (o sinal) e «ponto
    // 4» (o cancelamento), e o `termosPara` faz a substituição da percentagem
    // por `heading.startsWith("3.")`. Uma numeração diferente em inglês
    // partia-a em silêncio.
    const numero = (h: string) => h.split(".")[0];
    expect(DEFAULT_TERMS_EN.map((s) => numero(s.heading))).toEqual(
      DEFAULT_TERMS.map((s) => numero(s.heading)),
    );
  });

  it("nenhuma secção inglesa ficou por traduzir", () => {
    for (const s of DEFAULT_TERMS_EN) {
      expect(s.body.length, s.heading).toBeGreaterThan(80);
      // As palavras portuguesas que denunciariam uma secção copiada.
      expect(s.body, s.heading).not.toMatch(/\b(Estúdio|cliente compromete|valores|prazo)\b/);
    }
  });
});

/**
 * ── A CLÁUSULA QUE TORNA A TRADUÇÃO SEGURA ────────────────────────────────
 *
 * Os termos foram escritos em português, com o advogado dela, e há números
 * negociados lá dentro. Uma tradução é sempre uma leitura, e numa divergência
 * a leitura que vale tem de ser UMA — senão o contrato tem duas respostas para
 * a mesma pergunta.
 */
describe("a versão portuguesa prevalece, e está escrito", () => {
  it("o ponto 9 inglês di-lo com todas as letras", () => {
    const nove = DEFAULT_TERMS_EN.find((s) => s.heading.startsWith("9."))!;
    expect(nove.body).toMatch(/Portuguese version prevails/i);
    expect(nove.body).toMatch(/governed by Portuguese law/i);
  });

  it("e sai impresso na folha inglesa", async () => {
    // Uma cláusula que fica no ficheiro e não chega ao papel não protege nada.
    const texto = await textoDoPdf(await renderContractPdf(contrato({ idioma: "en" })));
    expect(texto).toContain("the Portuguese version prevails");
  });
});

describe("a percentagem do sinal acompanha nas duas línguas", () => {
  it("a 50%, o ponto 3 inglês diz 50 e 50", () => {
    const tres = termosPara(50, "en").find((s) => s.heading.startsWith("3."))!;
    expect(tres.body).toContain("deposit of 50%");
    expect(tres.body).toContain("remaining 50%");
  });

  it("e o ponto 4 inglês também", () => {
    const quatro = termosPara(50, "en").find((s) => s.heading.startsWith("4."))!;
    expect(quatro.body).toContain("The 50% deposit is intended");
  });

  it("mas o 70% da indemnização NÃO se mexe — é outro número", () => {
    // Negociado com o advogado dela, e não acompanha o sinal. É a mesma regra
    // do lado português, e a razão de o `termosPara` compor as frases à mão
    // em vez de correr um `replace` por «30%».
    const quatro = termosPara(50, "en").find((s) => s.heading.startsWith("4."))!;
    expect(quatro.body).toContain("70% of the total amount stipulated");
  });

  it("por omissão continua a ser português", () => {
    expect(termosPara(30)[0].heading).toBe("1. Objeto");
  });
});

describe("a folha inglesa é inglesa de cima a baixo", () => {
  it("a moldura também — não são termos ingleses numa folha portuguesa", async () => {
    const texto = await textoDoPdf(await renderContractPdf(contrato({ idioma: "en" })));
    for (const palavra of ["CONTRACT", "BETWEEN", "TERMS AND CONDITIONS", "REFERENCE"]) {
      expect(texto, palavra).toContain(palavra);
    }
    for (const portuguesa of ["CONTRATO", "ENTRE", "TERMOS E CONDIÇÕES", "REFERÊNCIA"]) {
      expect(texto, portuguesa).not.toContain(portuguesa);
    }
  });

  it("o aceite registado diz-se em inglês, e continua a não dizer «electrónico»", async () => {
    // A regra que não se pode estragar: um aceite registado pela casa nunca se
    // disfarça de assinatura electrónica, em nenhuma das línguas.
    const texto = await textoDoPdf(await renderContractPdf(contrato({ idioma: "en" })));
    expect(texto).toContain("ACCEPTANCE ON RECORD");
    expect(texto).toContain("Acceptance confirmed by Catarina Gaspar");
    expect(texto).toContain("How: Signed on paper, 12/05");
    expect(texto).not.toMatch(/electronically/i);
  });

  it("a data sai em inglês — e no dia de Portugal, não no do servidor", async () => {
    // O fuso é o de Lisboa nas duas línguas: um aceite às 23:32 de 2 de julho
    // é do dia 3 em Lisboa, e é essa a data que vincula.
    const texto = await textoDoPdf(
      await renderContractPdf(contrato({ idioma: "en", acceptedAt: "2026-07-02T23:32:00.000Z" })),
    );
    expect(texto).toContain("03 July 2026");
    expect(texto).not.toContain("02 July 2026");
  });

  it("o aceite ELECTRÓNICO inglês diz o que tem de dizer", async () => {
    const texto = await textoDoPdf(
      await renderContractPdf(
        contrato({
          idioma: "en",
          registadoPor: undefined,
          registadoComo: undefined,
          acceptedName: "Anna Smith",
          acceptedIp: "203.0.113.7",
        }),
      ),
    );
    expect(texto).toContain("ELECTRONIC ACCEPTANCE");
    expect(texto).toContain("Accepted electronically by Anna Smith");
    expect(texto).toContain("203.0.113.7");
  });

  it("o contrato pendente inglês explica que ainda é uma minuta", async () => {
    const texto = await textoDoPdf(
      await renderContractPdf(
        contrato({ idioma: "en", status: "pendente", acceptedAt: undefined }),
      ),
    );
    expect(texto).toContain("ACCEPTANCE PENDING");
    expect(texto).toMatch(/serves only as a draft/i);
  });
});

describe("os contratos que já existem não mudam de língua", () => {
  it("sem `idioma`, a folha continua portuguesa — como sempre foi", async () => {
    // Ausente lê-se como português, nunca como «não se sabe, escolhe tu».
    const texto = await textoDoPdf(await renderContractPdf(contrato()));
    expect(texto).toContain("CONTRATO");
    expect(texto).toContain("ACEITE REGISTADO");
    expect(texto).not.toContain("CONTRACT");
  });

  it("com `idioma: \"pt\"` é exactamente o mesmo documento", async () => {
    const semCampo = await textoDoPdf(await renderContractPdf(contrato()));
    const comPt = await textoDoPdf(await renderContractPdf(contrato({ idioma: "pt" })));
    expect(comPt).toBe(semCampo);
  });
});
