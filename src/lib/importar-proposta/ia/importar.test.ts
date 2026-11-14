import { describe, it, expect, vi } from "vitest";
import { importarDocumento } from "./importar";
import {
  MAX_PARTES,
  MODELO,
  partirEmPedacos,
  perceber,
  LeituraFalhou,
  custoEmDolares,
  type ChamarModelo,
  type PedidoAoModelo,
  type RespostaDoModelo,
} from "./perceber";
import { leituraCerta, propostaDeTeste, documentoDeTeste } from "./fixtures.testkit";
import { docx } from "../fabricar.testkit";
import { montarDocumento, correccoesIniciais } from "../montar";

/** O duplo da API: devolve o que lhe mandarem, e guarda os pedidos. */
function duplo(
  resposta: Partial<RespostaDoModelo> | ((p: PedidoAoModelo) => Partial<RespostaDoModelo>),
) {
  const pedidos: PedidoAoModelo[] = [];
  const chamar: ChamarModelo = async (p) => {
    pedidos.push(p);
    const r = typeof resposta === "function" ? resposta(p) : resposta;
    return {
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(leituraCerta()) }],
      usage: { input_tokens: 3000, output_tokens: 2000, cache_read_input_tokens: 2500 },
      ...r,
    };
  };
  return { chamar, pedidos };
}
const reservaLivre = async () => ({ ok: true, usadas: 1, maximo: 30 });

describe("sem chave da API", () => {
  it("cai no importador por regras, diz «sem IA», e dá o pedido para o Claude (custo zero)", async () => {
    const r = await importarDocumento(propostaDeTeste(), { chamar: null });
    expect(r.revisao?.via).toBe("regras");
    expect(r.revisao?.porque).toMatch(/Importação sem IA/);
    expect(r.revisao?.pedidoParaOClaude).toMatch(/NUNCA INVENTAR/);
    expect(r.revisao?.pedidoParaOClaude).toMatch(/\[p2\] Ana Teste & Rui Exemplo/);
    // E o que as regras leem continua lá.
    expect(r.proposta.clientNames).toBe("Ana Teste & Rui Exemplo");
  });
});

describe("com a IA (duplo, sem chamadas reais)", () => {
  it("o pedido: Opus 5.5, pensamento adaptativo, esforço alto, esquema estrito, recurso de recusa, cache nas instruções", async () => {
    const { chamar, pedidos } = duplo({});
    const r = await importarDocumento(propostaDeTeste(), { chamar, reservar: reservaLivre });
    expect(r.revisao?.via).toBe("ia");
    const p = pedidos[0];
    expect(p.model).toBe(MODELO);
    expect(p.model).toBe("claude-opus-5-5");
    expect(p.thinking).toEqual({ type: "adaptive" });
    expect(p.output_config.effort).toBe("high");
    expect(p.output_config.format.type).toBe("json_schema");
    expect(
      (p.output_config.format.schema as { additionalProperties?: boolean }).additionalProperties,
    ).toBe(false);
    expect(p.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(p.fallbacks).toBe("default");
    expect(p.system[0].cache_control).toEqual({ type: "ephemeral" });
    // As imagens vão pelo id, nunca os bytes.
    expect(JSON.stringify(p.messages)).not.toMatch(/\/9j\/|base64/);
    expect(p.messages[0].content).toMatch(/\[im1\] IMAGEM/);
  });

  it("preenche a proposta pela leitura verificada, com as descrições inteiras e a ordem", async () => {
    const { chamar } = duplo({});
    const r = await importarDocumento(propostaDeTeste(), { chamar, reservar: reservaLivre });
    const p = r.proposta;
    expect(p.clientNames).toBe("Ana Teste & Rui Exemplo");
    expect(p.dataIso).toBe("2027-06-12");
    expect(p.guests).toBe(120);
    expect(p.serviceGroups).toEqual([
      {
        letter: "a)",
        title: "Decoração da Cerimónia",
        items: [
          { label: "Arco de flores", desc: "arco em ferro com flores da época\ncom eucalipto" },
        ],
      },
    ]);
    expect(p.budgetItems).toEqual(["Decoração da cerimónia", "Centros de mesa"]);
    expect(p.budgetAmounts).toEqual([1200, 540]);
    expect(p.totalAmount).toBe(1740);
    expect(p.totalVatMode).toBe("acrescer");
    expect(p.capa).toBe("word/media/capa.jpeg");
    expect(p.moodBoards).toEqual([
      { title: "Decoração da Cerimónia", images: ["word/media/arco.jpeg"] },
    ]);
    expect(p.notasInternas).toMatch(/Validade: Validade da proposta: 30 dias\./);
    expect(r.revisao?.avisos).toEqual([]);
    expect(r.revisao?.custo?.dolares).toBeCloseTo(
      custoEmDolares([{ input_tokens: 3000, output_tokens: 2000, cache_read_input_tokens: 2500 }]),
    );

    // E o rascunho do estúdio sai pelo caminho de sempre.
    const doc = montarDocumento(
      p,
      correccoesIniciais(p),
      new Map([["word/media/arco.jpeg", "x/arco.jpg"]]),
      "teste.docx",
    );
    expect(doc.totalAmount).toBe(1740);
    expect(doc.budgetAmounts).toEqual([1200, 540]);
  });

  it("valores com IVA: a base de cada linha sai da regra da casa, e as opcionais ficam marcadas", async () => {
    const l = leituraCerta();
    l.orcamento.iva.valoresDasLinhas = "com_iva";
    l.orcamento.linhas[1].tipo = "opcional";
    const { chamar } = duplo({ content: [{ type: "text", text: JSON.stringify(l) }] });
    const r = await importarDocumento(propostaDeTeste(), { chamar, reservar: reservaLivre });
    // 1.200 com IVA a 23% → 975,61 de base (round2(1200 / 1,23)).
    expect(r.proposta.budgetAmounts[0]).toBe(975.61);
    expect(r.proposta.budgetOpcional).toEqual([false, true]);
  });

  it.each([
    ["refusal", /recusou/],
    ["max_tokens", /cortada a meio/],
    ["pause_turn", /não acabou como devia/],
  ])("stop_reason «%s»: NÃO preenche com a resposta, cai nas regras e di-lo", async (stop, msg) => {
    const l = leituraCerta();
    l.cliente.nomes = "Nome Que Só A IA Viu";
    const { chamar } = duplo({
      stop_reason: stop,
      content: [{ type: "text", text: JSON.stringify(l) }],
    });
    const r = await importarDocumento(propostaDeTeste(), { chamar, reservar: reservaLivre });
    expect(r.revisao?.via).toBe("regras");
    expect(r.revisao?.porque).toMatch(msg);
    expect(r.revisao?.porque).toMatch(/nada da resposta da IA foi usado/);
    expect(r.proposta.clientNames).not.toBe("Nome Que Só A IA Viu");
  });

  it("um JSON fora do esquema não se usa", async () => {
    const { chamar } = duplo({ content: [{ type: "text", text: '{"cliente": {}}' }] });
    const r = await importarDocumento(propostaDeTeste(), { chamar, reservar: reservaLivre });
    expect(r.revisao?.via).toBe("regras");
    expect(r.revisao?.porque).toMatch(/não serve/);
  });

  it("um erro de rede cai nas regras", async () => {
    const chamar: ChamarModelo = async () => {
      throw new Error("ECONNRESET");
    };
    const r = await importarDocumento(propostaDeTeste(), { chamar, reservar: reservaLivre });
    expect(r.revisao?.via).toBe("regras");
  });

  it("valores inventados pela IA não chegam à proposta", async () => {
    const l = leituraCerta();
    l.orcamento.totalSemIva = { valor: 1990, citacao: "Total | 1.990,00 € + IVA" };
    const { chamar } = duplo({ content: [{ type: "text", text: JSON.stringify(l) }] });
    const r = await importarDocumento(propostaDeTeste(), { chamar, reservar: reservaLivre });
    expect(r.proposta.totalAmount).toBeNull();
    expect(r.revisao?.inventados).toBeGreaterThan(0);
    expect(r.revisao?.avisos.some((a) => a.dinheiro && a.gravidade === "erro")).toBe(true);
  });
});

describe("o travão do mês", () => {
  it("com o tecto gasto não chama a IA, e avisa", async () => {
    const chamar = vi.fn<ChamarModelo>();
    const r = await importarDocumento(propostaDeTeste(), {
      chamar,
      reservar: async () => ({ ok: false, motivo: "tecto", usadas: 30, maximo: 30 }),
    });
    expect(chamar).not.toHaveBeenCalled();
    expect(r.revisao?.via).toBe("regras");
    expect(r.revisao?.porque).toMatch(/30 de 30/);
    expect(r.revisao?.pedidoParaOClaude).toBeTruthy();
  });

  it("sem contador que se leia, também não chama", async () => {
    const chamar = vi.fn<ChamarModelo>();
    await importarDocumento(propostaDeTeste(), {
      chamar,
      reservar: async () => ({ ok: false, motivo: "sem-contador", usadas: null, maximo: 30 }),
    });
    expect(chamar).not.toHaveBeenCalled();
  });
});

describe("a via de custo zero: o JSON carregado por ela", () => {
  it("passa pelo mesmo esquema e pela mesma verificação, sem chamar a API", async () => {
    const chamar = vi.fn<ChamarModelo>();
    const r = await importarDocumento(propostaDeTeste(), {
      chamar,
      leituraCarregada: "```json\n" + JSON.stringify(leituraCerta()) + "\n```",
    });
    expect(chamar).not.toHaveBeenCalled();
    expect(r.revisao?.via).toBe("json");
    expect(r.proposta.totalAmount).toBe(1740);
  });

  it("um JSON carregado com um valor inventado é apanhado como o da API", async () => {
    const l = leituraCerta();
    l.orcamento.linhas[0].totalDaLinha.valor = 1300;
    const r = await importarDocumento(propostaDeTeste(), { leituraCarregada: JSON.stringify(l) });
    expect(r.proposta.budgetAmounts[0]).toBeNull();
    expect(r.revisao?.avisos.map((a) => a.id)).toContain("inventado:orcamento.linhas.0");
  });

  it("um ficheiro que não é a leitura cai nas regras e diz porquê", async () => {
    const r = await importarDocumento(propostaDeTeste(), { leituraCarregada: "olá" });
    expect(r.revisao?.via).toBe("regras");
    expect(r.revisao?.porque).toMatch(/não é JSON válido/);
  });
});

describe("documentos grandes: dividir pelas secções, nunca cortar", () => {
  const grande = () =>
    docx(
      Array.from({ length: 12 }, (_, i) => [
        { h: 1 as const, t: `Secção TESTE ${i + 1}` },
        ...Array.from(
          { length: 8 },
          (_, k) => `Parágrafo ${i + 1}.${k + 1} ${"texto ".repeat(20)}`,
        ),
      ]).flat(),
    );

  it("cada unidade vai inteira, numa parte só, pela ordem", () => {
    const d = documentoDeTeste(grande());
    const pedacos = partirEmPedacos(d, 3000);
    expect(pedacos.length).toBeGreaterThan(1);
    const todos = pedacos.join("\n");
    for (const u of d.unidades) {
      const n = todos.split(`[${u.id}]`).length - 1;
      expect(n, u.id).toBe(1);
    }
    // As partes começam num título de secção.
    for (const p of pedacos.slice(1))
      expect(p).toMatch(/^=== \[corpo\][^\n]*\n\[p\d+\] \(título nível 1/);
  });

  it("acima do máximo de partes não lê só o princípio: recusa e di-lo", async () => {
    const d = documentoDeTeste(
      docx(
        Array.from({ length: 1100 }, (_, i) => [
          { h: 1 as const, t: `S${i}` },
          "x ".repeat(200),
        ]).flat(),
      ),
    );
    const { chamar } = duplo({});
    await expect(perceber(chamar, d)).rejects.toBeInstanceOf(LeituraFalhou);
    await expect(perceber(chamar, d)).rejects.toThrow(new RegExp(`o máximo é ${MAX_PARTES}`));
  });

  it("as partes juntam-se pela ordem", async () => {
    const d = documentoDeTeste(grande());
    let n = 0;
    const { chamar } = duplo(() => {
      n++;
      const l = leituraCerta();
      l.servicos = [{ titulo: `Secção TESTE ${n}`, itens: [] }];
      return { content: [{ type: "text", text: JSON.stringify(l) }] };
    });
    const p = await perceber(chamar, d);
    expect(p.partes).toBe(n);
    expect(p.leitura.servicos[0].titulo).toBe("Secção TESTE 1");
  });
});
