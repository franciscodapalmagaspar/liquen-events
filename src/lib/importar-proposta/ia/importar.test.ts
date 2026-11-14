import { describe, it, expect, vi } from "vitest";
import { importarDocumento } from "./importar";
import {
  MAX_PARTES,
  MODELO,
  partirEmPedacos,
  perceber,
  LeituraFalhou,
  custoEmDolares,
  custoMaximoEmDolares,
  maxTokensPara,
  type ChamarModelo,
  type PedidoAoModelo,
  type RespostaDoModelo,
} from "./perceber";
import {
  leituraCerta,
  leituraComIvaASeis,
  leituraComIvaIncluido,
  propostaComIvaASeis,
  propostaComIvaIncluido,
  propostaDeTeste,
  documentoDeTeste,
} from "./fixtures.testkit";
import { docx } from "../fabricar.testkit";
import { montarDocumento, correccoesIniciais } from "../montar";
import { pedidoParaOClaude } from "./instrucoes";
import { esquemaJson, lerLeitura } from "./esquema";
import { documentoEmTexto } from "../documento-completo";

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
const reservaLivre = async () => ({ ok: true, usadas: 1, maximo: 30, dolares: 0, maxDolares: 5 });

describe("sem chave da API", () => {
  it("cai no importador por regras, diz «sem IA», e dá o pedido para o Claude (custo zero)", async () => {
    const r = await importarDocumento(propostaDeTeste(), { chamar: null });
    expect(r.revisao?.via).toBe("regras");
    expect(r.revisao?.porque).toMatch(/Importação sem IA/);
    // O pedido para o Claude faz-se no navegador, do documento que já vem na revisão.
    expect(r.revisao).not.toHaveProperty("pedidoParaOClaude");
    const pedido = pedidoParaOClaude(documentoEmTexto(r.revisao!.documento));
    expect(pedido).toMatch(/NUNCA INVENTAR/);
    expect(pedido).toMatch(/\[p2\] Ana Teste & Rui Exemplo/);
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
    // O único aviso é o sinal fora das linhas (um «não usado» confirma-se sempre).
    expect(r.revisao?.avisos.map((a) => a.id)).toEqual(["nao-usado:p10:52200"]);
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

  it("valores com IVA: a base de cada linha sai da regra da casa, e a soma das bases é a base da soma (ao cêntimo)", async () => {
    const l = leituraComIvaIncluido();
    l.orcamento.linhas[1].tipo = "normal";
    const r = await importarDocumento(propostaComIvaIncluido(), {
      leituraCarregada: JSON.stringify(l),
    });
    // 25 € com IVA a 23% → 20,33 € cada; mas 50 € com IVA são 40,65 € de base:
    // o cêntimo a mais sai da última linha. Folga zero.
    expect(r.proposta.budgetAmounts).toEqual([20.33, 20.32]);
    expect(r.proposta.totalAmount).toBe(50);
    expect(r.proposta.totalVatMode).toBe("incluido");
    expect(r.revisao?.avisos).toEqual([]);
  });

  it("as linhas opcionais ficam marcadas", async () => {
    const l = leituraCerta();
    l.orcamento.linhas[1].tipo = "opcional";
    const r = await importarDocumento(propostaDeTeste(), { leituraCarregada: JSON.stringify(l) });
    expect(r.proposta.budgetOpcional).toEqual([false, true]);
  });

  it("IVA a 6%: passa para a proposta, e é sempre um aviso de dinheiro", async () => {
    const r = await importarDocumento(propostaComIvaASeis(), {
      leituraCarregada: JSON.stringify(leituraComIvaASeis()),
    });
    expect(r.proposta.vatRate).toBe(0.06);
    expect(r.proposta.totalVatMode).toBe("acrescer");
    const a = r.revisao!.avisos.find((x) => x.id === "iva:taxa-diferente")!;
    expect(a.dinheiro).toBe(true);
    const doc = montarDocumento(r.proposta, correccoesIniciais(r.proposta), new Map(), "t.docx");
    expect(doc.vatRate).toBe(0.06);
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
      reservar: async () => ({
        ok: false,
        motivo: "tecto",
        usadas: 30,
        maximo: 30,
        dolares: 1,
        maxDolares: 5,
      }),
    });
    expect(chamar).not.toHaveBeenCalled();
    expect(r.revisao?.via).toBe("regras");
    expect(r.revisao?.porque).toMatch(/30 de 30/);
    expect(r.revisao?.porque).toMatch(/pedido para o Claude/);
  });

  it("sem contador que se leia, também não chama", async () => {
    const chamar = vi.fn<ChamarModelo>();
    await importarDocumento(propostaDeTeste(), {
      chamar,
      reservar: async () => ({
        ok: false,
        motivo: "sem-contador",
        usadas: null,
        maximo: 30,
        dolares: null,
        maxDolares: 5,
      }),
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
    await expect(perceber(chamar, partirEmPedacos(d))).rejects.toBeInstanceOf(LeituraFalhou);
    await expect(perceber(chamar, partirEmPedacos(d))).rejects.toThrow(
      new RegExp(`o máximo é ${MAX_PARTES}`),
    );
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
    const p = await perceber(chamar, partirEmPedacos(d, 3000));
    expect(p.partes).toBe(n);
    expect(p.leitura.servicos[0].titulo).toBe("Secção TESTE 1");
  });
});

describe("o custo: reservar o pior caso, acertar pelo real (com o recurso)", () => {
  it("reserva DEPOIS de saber as partes, e acerta pelo custo real (somando as iterações)", async () => {
    const usage = {
      input_tokens: 0,
      output_tokens: 0,
      iterations: [
        { type: "message", input_tokens: 1000, output_tokens: 0 },
        { type: "fallback_message", input_tokens: 1000, output_tokens: 1000 },
      ],
    };
    const { chamar } = duplo({ usage });
    const reservar = vi.fn(async () => ({
      ok: true,
      usadas: 1,
      maximo: 30,
      dolares: 0,
      maxDolares: 5,
    }));
    const acertar = vi.fn(async () => true);
    const r = await importarDocumento(propostaDeTeste(), { chamar, reservar, acertar });
    const reservado = (reservar.mock.calls[0] as unknown as [number])[0];
    expect(reservado).toBeCloseTo(custoMaximoEmDolares(partirEmPedacos(documentoDeTeste())), 6);
    // 1000 × 4 $/M (a que recusou) + 1000 × 5 $/M + 1000 × 25 $/M (o recurso, pelo preço de cima).
    expect(r.revisao?.custo?.dolares).toBe(0.034);
    expect(acertar).toHaveBeenCalledWith(reservado, 0.034);
    // A reserva é sempre ≥ ao que se pagou.
    expect(reservado).toBeGreaterThan(0.034);
  });

  it("quando os dólares do mês não chegam, não chama", async () => {
    const chamar = vi.fn<ChamarModelo>();
    const r = await importarDocumento(propostaDeTeste(), {
      chamar,
      reservar: async () => ({
        ok: false,
        motivo: "dolares",
        usadas: 3,
        maximo: 30,
        dolares: 4.9,
        maxDolares: 5,
      }),
    });
    expect(chamar).not.toHaveBeenCalled();
    expect(r.revisao?.porque).toMatch(/dos 5 US\$ do tecto/);
  });

  it("o max_tokens é à medida da parte, nunca 64 000", () => {
    expect(maxTokensPara(1000)).toBeLessThan(8_000);
    expect(maxTokensPara(1_000_000)).toBe(32_000);
  });
});

describe("o tamanho da resposta", () => {
  it("um documento enorme não vai inteiro para o ecrã (e diz-se)", async () => {
    const enorme = docx(
      Array.from({ length: 160 }, (_, i) => `Parágrafo TESTE ${i} ${"x".repeat(10_000)}`),
    );
    const r = await importarDocumento(enorme, { chamar: null });
    expect(r.revisao?.documentoGrandeDemais).toBe(true);
    expect(r.revisao?.documento.unidades).toEqual([]);
    expect(r.revisao?.avisosDaLeitura.join(" ")).toMatch(/grande demais para o mostrar/);
  });
});

describe("o esquema tem limites", () => {
  it("um texto gigante ou linhas a mais não passam", async () => {
    const l = leituraCerta();
    l.servicos[0].itens[0].descricao = "x".repeat(20_001);
    expect(lerLeitura(JSON.stringify(l)).ok).toBe(false);
    const m = leituraCerta();
    m.orcamento.linhas = Array.from({ length: 501 }, () => m.orcamento.linhas[0]);
    expect(lerLeitura(JSON.stringify(m)).ok).toBe(false);
  });

  it("o esquema que segue para a API não leva os limites que ela não aceita", () => {
    expect(JSON.stringify(esquemaJson())).not.toMatch(/maxLength|maxItems/);
  });
});
