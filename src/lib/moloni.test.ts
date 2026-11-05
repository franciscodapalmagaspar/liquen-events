import { describe, expect, it, vi } from "vitest";
import {
  configDoMoloni,
  corpoDoFormulario,
  criarRascunhoDeFatura,
  ErroDoMoloni,
  estadoDaLigacao,
  variaveisEmFalta,
  type ConfigMoloni,
} from "./moloni";

/**
 * A LIGAÇÃO AO MOLONI, CONTRA UM MOLONI DE MENTIRA.
 *
 * Nenhum teste fala com o Moloni verdadeiro: as respostas são as que a
 * documentação oficial descreve (https://www.moloni.pt/dev/). A ligação
 * verdadeira só se prova com as credenciais dela, na Vercel.
 */

const CFG: ConfigMoloni = {
  clientId: "dev",
  clientSecret: "segredo",
  username: "teste@exemplo.pt",
  password: "pw",
  companyId: 5,
};

const IVA23 = [{ tax_id: 1, value: 23, order: 0, cumulative: 0 }];
/** Os artigos como estão no Moloni dela (capturas de 5/11), procurados pelo CÓDIGO. */
const PRODUTOS: Record<
  string,
  { product_id: number; name: string; reference: string; taxes: typeof IVA23 }[]
> = {
  "EXE.11": [{ product_id: 11, name: "Material", reference: "EXE.11", taxes: IVA23 }],
  // A pesquisa por «EXE.2» também devolve o EXE.20 — só a referência EXACTA conta.
  "EXE.2": [
    { product_id: 12, name: "Flores e Elementos de Decoração", reference: "EXE.2", taxes: IVA23 },
    { product_id: 99, name: "Outro artigo", reference: "EXE.20", taxes: IVA23 },
  ],
  "EXE.4": [{ product_id: 13, name: "Serviço", reference: "EXE.4", taxes: IVA23 }],
  "EXE.5": [{ product_id: 14, name: "Transporte", reference: "EXE.5", taxes: IVA23 }],
  "EXE.6": [{ product_id: 15, name: "Alojamento", reference: "EXE.6", taxes: IVA23 }],
  "EXE.10": [{ product_id: 16, name: "Wedding Coordinator", reference: "EXE.10", taxes: IVA23 }],
};

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status });
}

/** Um Moloni de mentira que regista o que lhe pedem. */
function moloniFalso(sobre: Partial<Record<string, (p: URLSearchParams) => Response>> = {}) {
  const pedidos: { metodo: string; corpo: URLSearchParams; url: string }[] = [];
  const buscar = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/grant/")) return json({ access_token: "tok", expires_in: 3600 });
    const metodo = u.replace("https://api.moloni.pt/v1/", "").split("/?")[0];
    const corpo = new URLSearchParams(String(init?.body ?? ""));
    pedidos.push({ metodo, corpo, url: u });
    if (sobre[metodo]) return sobre[metodo]!(corpo);
    if (metodo === "products/getBySearch") return json(PRODUTOS[corpo.get("search") ?? ""] ?? []);
    if (metodo === "customers/getBySearch")
      return json([{ customer_id: 7, name: "TESTE Cliente", vat: "PT123456789" }]);
    if (metodo === "documentSets/getAll")
      return json([
        { document_set_id: 3, name: "A", active_by_default: 0 },
        { document_set_id: 4, name: "B", active_by_default: 1 },
      ]);
    if (metodo === "companies/getAll") return json([{ company_id: 5, name: "TESTE Lda" }]);
    if (metodo === "invoices/insert") return json({ valid: 1, document_id: 4242 });
    return json({}, 404);
  });
  return { buscar: buscar as unknown as typeof fetch, pedidos };
}

const PEDIDO = {
  fase: "sinal" as const,
  pct: 30,
  vatRate: 0.23,
  partes: [
    { artigo: "flores" as const, nome: "Flores e Elementos de Decoração", valor: 1800 },
    { artigo: "transporte" as const, nome: "Transporte", valor: 450 },
  ],
  cliente: { nif: "123 456 789", nome: "TESTE Cliente" },
  referencia: "2026-001",
  evento: "Casamento 12/06/2027",
};

describe("configDoMoloni", () => {
  it("sem as cinco variáveis não há ligação, e diz quais faltam", () => {
    expect(configDoMoloni({})).toBeNull();
    expect(variaveisEmFalta({ MOLONI_CLIENT_ID: "x" })).toEqual([
      "MOLONI_CLIENT_SECRET",
      "MOLONI_USERNAME",
      "MOLONI_PASSWORD",
      "MOLONI_COMPANY_ID",
    ]);
    const cfg = configDoMoloni({
      MOLONI_CLIENT_ID: "a",
      MOLONI_CLIENT_SECRET: "b",
      MOLONI_USERNAME: "c",
      MOLONI_PASSWORD: "d",
      MOLONI_COMPANY_ID: "12",
    });
    expect(cfg).toMatchObject({ companyId: 12, documentSetId: undefined });
  });
});

describe("corpoDoFormulario", () => {
  it("escreve arrays e objectos como o PHP os lê", () => {
    const c = corpoDoFormulario({ a: 1, products: [{ product_id: 2, taxes: [{ tax_id: 3 }] }] });
    expect(c.get("a")).toBe("1");
    expect(c.get("products[0][product_id]")).toBe("2");
    expect(c.get("products[0][taxes][0][tax_id]")).toBe("3");
  });
});

describe("criarRascunhoDeFatura", () => {
  it("cria um RASCUNHO com uma linha por artigo, o cliente pelo NIF e a série por omissão", async () => {
    const { buscar, pedidos } = moloniFalso();
    const r = await criarRascunhoDeFatura(CFG, PEDIDO, buscar, new Date("2026-11-05T12:00:00Z"));
    expect(r).toEqual({ documentId: 4242, valorSemIva: 2250 });
    const insert = pedidos.find((p) => p.metodo === "invoices/insert")!;
    expect(insert.corpo.get("status")).toBe("0");
    expect(insert.corpo.get("company_id")).toBe("5");
    expect(insert.corpo.get("customer_id")).toBe("7");
    expect(insert.corpo.get("document_set_id")).toBe("4");
    expect(insert.corpo.get("date")).toBe("2026-11-05");
    expect(insert.corpo.get("our_reference")).toBe("2026-001");
    // O EXE.2, e não o EXE.20 que a pesquisa também devolveu.
    expect(insert.corpo.get("products[0][product_id]")).toBe("12");
    expect(insert.corpo.get("products[0][price]")).toBe("1800");
    expect(insert.corpo.get("products[0][qty]")).toBe("1");
    expect(insert.corpo.get("products[0][taxes][0][tax_id]")).toBe("1");
    expect(insert.corpo.get("products[0][summary]")).toBe("Sinal 30% · Casamento 12/06/2027");
    expect(insert.corpo.get("products[1][product_id]")).toBe("14");
    // O token vai no endereço, nunca no corpo; a palavra-passe nunca sai do pedido de token.
    expect(insert.url).toContain("access_token=tok");
    expect(insert.corpo.toString()).not.toContain("pw");
  });

  it("um artigo que não existe com aquele código pára tudo e diz o que encontrou", async () => {
    const { buscar, pedidos } = moloniFalso({
      "products/getBySearch": (c) =>
        json(
          c.get("search") === "EXE.5"
            ? [{ product_id: 20, name: "Transportes", reference: "EXE.55", taxes: IVA23 }]
            : PRODUTOS[c.get("search")!],
        ),
    });
    const erro = await criarRascunhoDeFatura(CFG, PEDIDO, buscar).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDoMoloni);
    expect(erro.codigo).toBe("artigo");
    expect(erro.message).toMatch(
      /«Transporte» \(código EXE\.5\) não está no Moloni com esse código \(encontrei: Transportes \(EXE\.55\)\)/,
    );
    expect(pedidos.some((p) => p.metodo === "invoices/insert")).toBe(false);
  });

  it("um artigo com outro IVA no Moloni não fatura", async () => {
    const { buscar, pedidos } = moloniFalso({
      "products/getBySearch": (c) =>
        json(
          c.get("search") === "EXE.5"
            ? [
                {
                  product_id: 14,
                  name: "Transporte",
                  reference: "EXE.5",
                  taxes: [{ tax_id: 2, value: 6 }],
                },
              ]
            : PRODUTOS[c.get("search")!],
        ),
    });
    const erro = await criarRascunhoDeFatura(CFG, PEDIDO, buscar).catch((e) => e);
    expect(erro.codigo).toBe("iva");
    expect(erro.message).toMatch(/IVA de 6% no Moloni, e a proposta é a 23%/);
    expect(pedidos.some((p) => p.metodo === "invoices/insert")).toBe(false);
  });

  it("sem cliente com aquele NIF, não cria nada nem inventa um cliente", async () => {
    const { buscar, pedidos } = moloniFalso({ "customers/getBySearch": () => json([]) });
    const erro = await criarRascunhoDeFatura(CFG, PEDIDO, buscar).catch((e) => e);
    expect(erro.codigo).toBe("cliente");
    expect(erro.message).toMatch(/NIF 123456789/);
    expect(
      pedidos.some((p) => p.metodo === "customers/insert" || p.metodo === "invoices/insert"),
    ).toBe(false);
  });

  it("sem NIF, procura pelo nome e exige um só", async () => {
    const { buscar } = moloniFalso({
      "customers/getBySearch": () =>
        json([
          { customer_id: 1, name: "TESTE Cliente" },
          { customer_id: 2, name: "Teste Cliente" },
        ]),
    });
    const erro = await criarRascunhoDeFatura(
      CFG,
      { ...PEDIDO, cliente: { nome: "TESTE Cliente" } },
      buscar,
    ).catch((e) => e);
    expect(erro.message).toMatch(/Há 2 clientes no Moloni chamados/);
  });

  it("credenciais erradas dizem-se por palavras", async () => {
    const buscar = vi.fn(async () =>
      json({ error: "invalid_grant" }, 400),
    ) as unknown as typeof fetch;
    const erro = await criarRascunhoDeFatura(CFG, PEDIDO, buscar).catch((e) => e);
    expect(erro.codigo).toBe("autenticacao");
    expect(erro.message).not.toContain("segredo");
  });

  it("uma resposta que não é uma lista (erros com HTTP 200) pára com palavras, sem rebentar", async () => {
    const { buscar, pedidos } = moloniFalso({
      "products/getBySearch": () => json({ 0: { code: 2, description: "company_id" } }),
    });
    const erro = await criarRascunhoDeFatura(CFG, PEDIDO, buscar).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDoMoloni);
    expect(erro.message).toMatch(/respondeu de forma inesperada/);
    expect(pedidos.some((p) => p.metodo === "invoices/insert")).toBe(false);
  });

  it("um «valid: 0» do Moloni é um erro, não um rascunho", async () => {
    const { buscar } = moloniFalso({ "invoices/insert": () => json({ valid: 0 }) });
    const erro = await criarRascunhoDeFatura(CFG, PEDIDO, buscar).catch((e) => e);
    expect(erro.codigo).toBe("moloni");
  });
});

describe("estadoDaLigacao", () => {
  it("diz a empresa e, artigo a artigo, se o encontrou e com que IVA", async () => {
    const { buscar } = moloniFalso();
    const e = await estadoDaLigacao(CFG, buscar);
    expect(e.empresa).toBe("TESTE Lda");
    expect(e.artigos.every((a) => a.encontrado)).toBe(true);
    expect(e.artigos[0]).toMatchObject({ nome: "Material", iva: 23 });
    expect(e.artigos.map((a) => a.nome)).toEqual([
      "Material",
      "Flores e Elementos de Decoração",
      "Serviço",
      "Transporte",
      "Alojamento",
      "Wedding Coordinator",
    ]);
  });
});
