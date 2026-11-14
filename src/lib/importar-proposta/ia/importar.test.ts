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
  juntarLeituras,
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
  escolherIva,
} from "./fixtures.testkit";
import { docx } from "../fabricar.testkit";
import {
  avisoDaSomaGravada,
  correccoesIniciais,
  escolherModoDoIva,
  juntarCorreccoes,
  montarDocumento,
  oQueFalta,
  totalEmTexto,
  totalParaOModo,
  valoresQueVaoSerGravados,
} from "../montar";
import { INSTRUCOES, pedidoParaOClaude } from "./instrucoes";
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
    // O IVA é sempre ela que o escolhe: até lá, nada passa.
    expect(p.ivaPorEscolher).toBe(true);
    expect(p.budgetAmounts).toEqual([null, null]);
    expect(p.linhasEscritas).toEqual([1200, 540]);
    expect(p.totalAmount).toBe(1740);
    expect(p.totalVatMode).toBeNull();
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
    // Ela escolhe «sem IVA» — e o rascunho sai pelo caminho de sempre.
    const { c } = escolherIva(p, "acrescer");
    const doc = montarDocumento(
      p,
      c,
      new Map([["word/media/arco.jpeg", "x/arco.jpg"]]),
      "teste.docx",
    );
    expect(doc.totalAmount).toBe(1740);
    expect(doc.totalVatMode).toBe("acrescer");
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
    const { gravar } = escolherIva(r.proposta, "incluido");
    expect(gravar.budgetAmounts).toEqual([20.33, 20.32]);
    // Com os dois totais no documento, «com IVA» usa o total com IVA.
    expect(gravar.totalAmount).toBe(50);
    expect(gravar.totalVatMode).toBe("incluido");
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
    expect(r.revisao?.contas?.sugestaoDasContas?.modo).toBe("sem_iva");
    const a = r.revisao!.avisos.find((x) => x.id === "iva:taxa-diferente")!;
    expect(a.dinheiro).toBe(true);
    const doc = montarDocumento(
      r.proposta,
      escolherIva(r.proposta, "acrescer").c,
      new Map(),
      "t.docx",
    );
    expect(doc.vatRate).toBe(0.06);
    expect(doc.totalVatMode).toBe("acrescer");
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
    expect(r.proposta.totalAmount).not.toBe(1990);
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

describe("2.ª revisão, 2 — o tecto não liberta a reserva das partes abortadas", () => {
  /** Duas partes: a 1.ª recusa (com uso), a 2.ª fica pendurada até ser parada. */
  const chamarDuas: ChamarModelo = async (p, { signal }) => {
    if (p.messages[0].content.includes("PARTE 1 de")) {
      return {
        stop_reason: "refusal",
        content: [],
        usage: { input_tokens: 2000, output_tokens: 100 },
      };
    }
    return new Promise((_r, rej) =>
      signal.addEventListener("abort", () => rej(new Error("aborted"))),
    );
  };

  it("o erro leva o uso SOMADO das partes que correram, e diz quais pararam sem uso", async () => {
    const e = await perceber(chamarDuas, ["[p1] a", "[p2] b"]).catch((x) => x);
    expect(e).toBeInstanceOf(LeituraFalhou);
    expect(e.motivo).toBe("recusa");
    expect(e.uso).toEqual([{ input_tokens: 2000, output_tokens: 100 }]);
    expect(e.partesSemUso).toEqual([1]);
  });

  it("acerta pelo uso conhecido MAIS a reserva inteira das partes sem uso", async () => {
    const grande = docx(
      Array.from({ length: 40 }, (_, i) => [
        { h: 1 as const, t: `Secção TESTE ${i}` },
        `${"palavra ".repeat(130)}`,
      ]).flat(),
    );
    const pedacos = partirEmPedacos(documentoDeTeste(grande));
    expect(pedacos.length).toBe(2);
    const acertar = vi.fn(async () => true);
    const r = await importarDocumento(grande, {
      chamar: chamarDuas,
      reservar: reservaLivre,
      acertar,
    });
    expect(r.revisao?.via).toBe("regras");
    const esperado =
      Math.round(
        (custoEmDolares([{ input_tokens: 2000, output_tokens: 100 }]) +
          custoMaximoEmDolares([pedacos[1]])) *
          100,
      ) / 100;
    expect(acertar).toHaveBeenCalledWith(custoMaximoEmDolares(pedacos), esperado);
  });
});

describe("2.ª revisão, 7 — a reserva cobre a repetição no recurso, pelo preço do modelo", () => {
  it("reserva o DOBRO (entrada e saída) ao preço mais caro", () => {
    const um = custoMaximoEmDolares(["x".repeat(3500)]);
    const fixo = Math.ceil((INSTRUCOES.length + JSON.stringify(esquemaJson()).length) / 3.5);
    const esperado = (2 * ((fixo + 1000 + 200) * 6.25 + maxTokensPara(3500) * 25)) / 1_000_000;
    expect(um).toBeCloseTo(Math.ceil(esperado * 10_000) / 10_000, 6);
  });

  it("cada iteração conta pelo preço do SEU modelo; um modelo desconhecido pelo mais caro", () => {
    const it = (model: string) => ({
      input_tokens: 0,
      output_tokens: 0,
      iterations: [{ type: "fallback_message", model, input_tokens: 0, output_tokens: 1_000_000 }],
    });
    expect(custoEmDolares([it("claude-opus-5-5")])).toBe(20);
    expect(custoEmDolares([it("claude-opus-4-8")])).toBe(25);
    expect(custoEmDolares([it("claude-desconhecido")])).toBe(25);
  });
});

describe("3.ª revisão — partes que discordam do IVA", () => {
  it("duas partes com modos diferentes dão conflito e o modo fica desconhecido", () => {
    const a = leituraCerta();
    const b = leituraCerta();
    b.orcamento.iva.valoresDoTotal = { valor: "com_iva", citacao: "x" };
    const j = juntarLeituras([a, b]);
    expect(j.leitura.orcamento.iva.valoresDoTotal.valor).toBe("desconhecido");
    expect(j.conflitos.join(" ")).toMatch(/IVA do total/);
  });
});

describe("4.ª revisão, M2 — um conflito do IVA entre partes FICA", () => {
  it("uma parte posterior não apaga o conflito", () => {
    const [a, b, c] = [leituraCerta(), leituraCerta(), leituraCerta()];
    b.orcamento.iva.valoresDoTotal = { valor: "com_iva", citacao: "x" };
    const j = juntarLeituras([a, b, c]);
    expect(j.leitura.orcamento.iva.valoresDoTotal.valor).toBe("desconhecido");
    expect(j.conflitos.join(" ")).toMatch(/IVA do total/);
  });
});

describe("6.ª revisão — as duas vias, a mesma regra do IVA", () => {
  const vias = async () => ({
    regras: await importarDocumento(propostaComIvaIncluido(), { chamar: null }),
    json: await importarDocumento(propostaComIvaIncluido(), {
      leituraCarregada: JSON.stringify(leituraComIvaIncluido()),
    }),
  });

  it("sem IA e com a leitura: o mesmo dinheiro por escolher, as mesmas sugestões, o mesmo que se grava", async () => {
    const { regras, json } = await vias();
    expect(regras.revisao?.via).toBe("regras");
    expect(json.revisao?.via).toBe("json");
    const dinheiro = (r: typeof regras) => ({
      budgetItems: r.proposta.budgetItems,
      budgetAmounts: r.proposta.budgetAmounts,
      linhasEscritas: r.proposta.linhasEscritas,
      totalAmount: r.proposta.totalAmount,
      totalVatMode: r.proposta.totalVatMode,
      ivaPorEscolher: r.proposta.ivaPorEscolher,
      totaisEscritos: r.proposta.totaisEscritos,
    });
    expect(dinheiro(regras)).toEqual(dinheiro(json));
    // A «Base: 40,65 €» não é uma linha.
    expect(regras.proposta.budgetItems).toEqual(["Flores TESTE", "Velas TESTE"]);
    expect(regras.proposta.totalVatMode).toBeNull();
    const sug = (r: typeof regras) => ({
      contas: r.revisao?.contas?.sugestaoDasContas,
      frases: r.revisao?.contas?.sugestaoDasFrases,
      discordancia: r.revisao?.contas?.discordancia,
    });
    expect(sug(regras)).toEqual(sug(json));
    expect(sug(regras).contas?.modo).toBe("com_iva");
    for (const modo of ["acrescer", "incluido"] as const) {
      expect(escolherIva(regras.proposta, modo).gravar).toEqual(
        escolherIva(json.proposta, modo).gravar,
      );
    }
    expect(escolherIva(regras.proposta, "incluido").gravar).toEqual({
      budgetAmounts: [20.33, 20.32],
      totalAmount: 50,
      totalVatMode: "incluido",
    });
  });
});

describe("6.ª revisão — a escolha do IVA e o total", () => {
  const prop = async () =>
    (
      await importarDocumento(propostaComIvaIncluido(), {
        leituraCarregada: JSON.stringify(leituraComIvaIncluido()),
      })
    ).proposta;

  it("escolher o IVA muda o total para o do lado escolhido — se ela não lhe tocou", async () => {
    const p = await prop();
    const c = correccoesIniciais(p);
    expect(escolherModoDoIva(p, c, "incluido").total).toBe("50,00");
    expect(escolherModoDoIva(p, c, "acrescer").total).toBe("40,65");
    // Ela apagou o total à mão: vazio, mas TOCADO — a escolha não o repõe.
    const apagado = { ...c, total: "", totalTocado: true };
    expect(escolherModoDoIva(p, apagado, "incluido").total).toBe("");
    // Ela escreveu outro: fica o dela.
    expect(escolherModoDoIva(p, { ...c, total: "45", totalTocado: true }, "acrescer").total).toBe(
      "45",
    );
  });

  it("o documento tinha total e ela apagou-o: falta escrevê-lo ou confirmar que fica sem", async () => {
    const p = await prop();
    const c = { ...escolherModoDoIva(p, correccoesIniciais(p), "incluido"), total: "" };
    const frase = "o total (o documento tem total — escreve-o ou confirma que fica sem total)";
    expect(oQueFalta(c, p)).toContain(frase);
    expect(oQueFalta({ ...c, semTotalConfirmado: true }, p)).not.toContain(frase);
    expect(valoresQueVaoSerGravados(p, c).totalAmount).toBeNull();
  });

  it("depois da escolha, as linhas que não somam o total gravado são aviso de dinheiro", async () => {
    const p = await prop();
    // «com IVA»: 20,33 + 20,32 = 40,65 = a base de 50 com IVA. Sem aviso.
    expect(avisoDaSomaGravada(p, escolherModoDoIva(p, correccoesIniciais(p), "incluido"))).toBe(
      null,
    );
    // «sem IVA»: as linhas ficam 25 + 25 = 50, e o total gravado é 40,65 + IVA.
    const a = avisoDaSomaGravada(p, escolherModoDoIva(p, correccoesIniciais(p), "acrescer"))!;
    expect(a.dinheiro).toBe(true);
    expect(a.texto).toMatch(/as linhas somam 50,00\s€ — o total é 40,65\s€ sem IVA/);
    // Sem escolha ainda, não há aviso (não há o que comparar).
    expect(avisoDaSomaGravada(p, correccoesIniciais(p))).toBe(null);
  });

  it("recarregar com outra leitura: o total só fica se ela o escreveu à mão", async () => {
    const p = await prop();
    const inicial = correccoesIniciais(p);
    const escolhido = escolherModoDoIva(p, inicial, "acrescer");
    expect(escolhido.total).toBe("40,65");
    // A leitura nova não leu a base: o total «sem IVA» passa a ser o único escrito.
    const l2 = leituraComIvaIncluido();
    l2.orcamento.totalSemIva = { valor: null, citacao: null };
    l2.orcamento.valorDoIva = { valor: null, citacao: null };
    const nova = (
      await importarDocumento(propostaComIvaIncluido(), { leituraCarregada: JSON.stringify(l2) })
    ).proposta;
    // Não tocado: sai da leitura nova, pelo modo que ela escolheu.
    const j = juntarCorreccoes(inicial, escolhido, correccoesIniciais(nova), nova);
    expect(j.totalVatMode).toBe("acrescer");
    expect(j.total).toBe(totalEmTexto(totalParaOModo(nova, "acrescer")));
    expect(j.total).toBe("50,00");
    // Tocado: fica o dela.
    const dela = { ...escolhido, total: "47,00", totalTocado: true };
    const k = juntarCorreccoes(inicial, dela, correccoesIniciais(nova), nova);
    expect(k.total).toBe("47,00");
    expect(k.totalTocado).toBe(true);
  });
});

describe("10.ª revisão — sem IA, a taxa escrita (6 %) também converte as linhas", () => {
  it("«com IVA»: as linhas convertem a 6 % e somam o total ao cêntimo, com o aviso da taxa", async () => {
    const doc = docx([
      { h: 1, t: "Orçamento" },
      "Livros TESTE: 106,00 €",
      "Cadernos TESTE: 106,00 €",
      "Valor sem IVA: 200,00 €",
      "IVA (6%): 12,00 €",
      "Total: 212,00 €",
    ]);
    const r = await importarDocumento(doc, { chamar: null });
    expect(r.revisao?.via).toBe("regras");
    expect(r.proposta.vatRate).toBe(0.06);
    expect(r.proposta.totaisEscritos).toEqual({ sem: 200, com: 212 });
    expect(r.revisao?.contas?.vatRate).toBe(0.06);
    const taxa = r.revisao!.avisos.find((a) => a.id === "iva:taxa-diferente")!;
    expect(taxa.dinheiro).toBe(true);
    expect(taxa.texto).toMatch(/IVA a 6%/);
    const { c, gravar } = escolherIva(r.proposta, "incluido");
    // 106 com IVA a 6 % = 100 sem IVA, cada uma.
    expect(gravar.budgetAmounts).toEqual([100, 100]);
    expect(gravar).toMatchObject({ totalAmount: 212, totalVatMode: "incluido" });
    const doEstudio = montarDocumento(r.proposta, c, new Map(), "x.docx");
    expect(doEstudio.vatRate).toBe(0.06);
    expect(doEstudio.budgetAmounts).toEqual([100, 100]);
    // A soma das linhas convertidas é a base do total, ao cêntimo: sem aviso da soma.
    expect(avisoDaSomaGravada(r.proposta, c)).toBeNull();
  });
});
