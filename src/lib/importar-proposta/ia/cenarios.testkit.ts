import { docx } from "../fabricar.testkit";
import { documentoDeTeste, leituraSoDoOrcamento } from "./fixtures.testkit";
import type { Leitura } from "./esquema";
import type { DocumentoCompleto } from "../documento-completo";

/**
 * As propostas INVENTADAS das revisões do IVA (A, B, B′, C, D, E, E′): cada uma
 * com o documento e a leitura que a IA daria. Servem aos testes e à tabela de
 * avisos do relatório.
 */
const linha = (descricao: string, valor: number, citacao: string) => ({
  descricao,
  quantidade: { valor: null, citacao: null },
  precoUnitario: { valor: null, citacao: null },
  totalDaLinha: { valor, citacao },
  tipo: "normal" as const,
});

function cenario(
  frases: Parameters<typeof docx>[0],
  ajustar: (l: Leitura) => void,
): { d: DocumentoCompleto; l: Leitura; bytes: Uint8Array } {
  const bytes = docx(frases);
  const d = documentoDeTeste(bytes);
  const l = leituraSoDoOrcamento();
  ajustar(l);
  return { d, l, bytes };
}

export const CENARIOS: Record<
  string,
  () => { d: DocumentoCompleto; l: Leitura; bytes: Uint8Array; oQue: string }
> = {
  A: () => ({
    oQue: "«+ IVA» só no total, sem contas",
    ...cenario(
      ["Flores TESTE: 1.000,00 €", "Velas TESTE: 740,00 €", "Total: 1.740,00 € + IVA"],
      (l) => {
        l.orcamento.linhas = [
          linha("Flores TESTE", 1000, "Flores TESTE: 1.000,00 €"),
          linha("Velas TESTE", 740, "Velas TESTE: 740,00 €"),
        ];
        l.orcamento.totalSemIva = { valor: 1740, citacao: "Total: 1.740,00 € + IVA" };
        l.orcamento.iva.valoresDoTotal = { valor: "sem_iva", citacao: "+ IVA" };
      },
    ),
  }),
  B: () => ({
    oQue: "«Os valores não têm IVA incluído», a IA diz «com IVA»",
    ...cenario(
      ["Flores TESTE: 1.740,00 €", "Total: 1.740,00 €", "Os valores não têm IVA incluído."],
      (l) => {
        l.naoColocados = [{ id: "p3", motivo: "IVA" }];
        l.orcamento.linhas = [linha("Flores TESTE", 1740, "Flores TESTE: 1.740,00 €")];
        l.orcamento.totalComIva = { valor: 1740, citacao: "Total: 1.740,00 €" };
        l.orcamento.iva.valoresDoTotal = { valor: "com_iva", citacao: "IVA incluído" };
        l.orcamento.iva.valoresDasLinhas = { valor: "com_iva", citacao: "IVA incluído" };
      },
    ),
  }),
  "B′": () => ({
    oQue: "«Bouquet — 180 €»",
    ...cenario(["Bouquet TESTE — 180,00 €", "Total: 180,00 €"], (l) => {
      l.orcamento.linhas = [linha("Bouquet TESTE", 180, "Bouquet TESTE — 180,00 €")];
      l.orcamento.totalSemIva = { valor: 180, citacao: "Total: 180,00 €" };
    }),
  }),
  C: () => ({
    oQue: "«Subtotal / IVA (23%) / Total»",
    ...cenario(
      [
        "Flores TESTE: 1.000,00 €",
        "Velas TESTE: 740,00 €",
        "Subtotal: 1.740,00 €",
        "IVA (23%): 400,20 €",
        "Total: 2.140,20 €",
      ],
      (l) => {
        l.orcamento.linhas = [
          linha("Flores TESTE", 1000, "Flores TESTE: 1.000,00 €"),
          linha("Velas TESTE", 740, "Velas TESTE: 740,00 €"),
        ];
        l.orcamento.totalSemIva = { valor: 1740, citacao: "Subtotal: 1.740,00 €" };
        l.orcamento.valorDoIva = { valor: 400.2, citacao: "IVA (23%): 400,20 €" };
        l.orcamento.totalComIva = { valor: 2140.2, citacao: "Total: 2.140,20 €" };
      },
    ),
  }),
  D: () => ({
    oQue: "o total repetido, «+ IVA» e «(IVA incluído)»",
    ...cenario(
      [
        "Flores TESTE: 1.740,00 €",
        "Total: 1.740,00 € + IVA",
        "Valor final: 1.740,00 € (IVA incluído)",
      ],
      (l) => {
        l.naoColocados = [{ id: "p3", motivo: "repete o total" }];
        l.orcamento.linhas = [linha("Flores TESTE", 1740, "Flores TESTE: 1.740,00 €")];
        l.orcamento.totalSemIva = { valor: 1740, citacao: "Total: 1.740,00 € + IVA" };
      },
    ),
  }),
  E: () => ({
    oQue: "«1.200 €» sem números claros",
    ...cenario(["Decoração TESTE: 1.200 €", "Total: 1.200 € + IVA"], (l) => {
      l.orcamento.linhas = [linha("Decoração TESTE", 1200, "Decoração TESTE: 1.200 €")];
      l.orcamento.totalSemIva = { valor: 1200, citacao: "Total: 1.200 € + IVA" };
    }),
  }),
  "E′": () => ({
    oQue: "as prestações «(1.475,00 €)»",
    ...cenario(
      [
        "Decoração TESTE: 2.950,00 €",
        "Total: 2.950,00 € + IVA",
        "1.ª prestação (1.475,00 €) na reserva.",
      ],
      (l) => {
        l.orcamento.linhas = [linha("Decoração TESTE", 2950, "Decoração TESTE: 2.950,00 €")];
        l.orcamento.totalSemIva = { valor: 2950, citacao: "Total: 2.950,00 € + IVA" };
        l.notas = [{ tipo: "pagamento", texto: "1.ª prestação (1.475,00 €) na reserva." }];
        l.orcamento.valoresNaoUsados = [
          { valor: 1475, citacao: "1.ª prestação (1.475,00 €)", motivo: "uma prestação" },
        ];
      },
    ),
  }),
  S1b: () => ({
    oQue: "«Decoração 1.000 / Transporte 230 / Total 1.230» (parece um trio de IVA)",
    ...cenario(
      ["Decoração TESTE: 1.000,00 €", "Transporte TESTE: 230,00 €", "Total: 1.230,00 €"],
      (l) => {
        l.orcamento.linhas = [
          linha("Decoração TESTE", 1000, "Decoração TESTE: 1.000,00 €"),
          linha("Transporte TESTE", 230, "Transporte TESTE: 230,00 €"),
        ];
        l.orcamento.totalSemIva = { valor: 1230, citacao: "Total: 1.230,00 €" };
      },
    ),
  }),
  S1c: () => ({
    oQue: "o mesmo, numa tabela",
    ...cenario(
      [
        {
          tabela: [
            ["Serviço", "Valor"],
            ["Decoração TESTE", "1.000,00 €"],
            ["Transporte TESTE", "230,00 €"],
            ["Total", "1.230,00 €"],
          ],
        },
      ],
      (l) => {
        l.naoColocados = [{ id: "l1", motivo: "cabeça" }];
        l.orcamento.linhas = [
          linha("Decoração TESTE", 1000, "Decoração TESTE | 1.000,00 €"),
          linha("Transporte TESTE", 230, "Transporte TESTE | 230,00 €"),
        ];
        l.orcamento.totalSemIva = { valor: 1230, citacao: "Total | 1.230,00 €" };
      },
    ),
  }),
  S2: () => ({
    oQue: "um trio de IVA de outra secção (o catering do parceiro)",
    ...cenario(
      [
        "Flores TESTE: 1.000,00 €",
        "Velas TESTE: 740,00 €",
        "Total: 1.740,00 €",
        "Catering do parceiro: subtotal 1.740,00 €",
        "IVA (23%): 400,20 €",
        "Total do catering: 2.140,20 €",
      ],
      (l) => {
        l.naoColocados = [4, 5, 6].map((n) => ({ id: `p${n}`, motivo: "catering do parceiro" }));
        l.orcamento.linhas = [
          linha("Flores TESTE", 1000, "Flores TESTE: 1.000,00 €"),
          linha("Velas TESTE", 740, "Velas TESTE: 740,00 €"),
        ];
        l.orcamento.totalSemIva = { valor: 1740, citacao: "Total: 1.740,00 €" };
        l.orcamento.valoresNaoUsados = [
          { valor: 1740, citacao: "Catering do parceiro: subtotal 1.740,00 €", motivo: "catering" },
          { valor: 400.2, citacao: "IVA (23%): 400,20 €", motivo: "catering" },
          { valor: 2140.2, citacao: "Total do catering: 2.140,20 €", motivo: "catering" },
        ];
      },
    ),
  }),
  S7b: () => ({
    oQue: "um par de IVA alheio, sem total",
    ...cenario(
      ["Flores TESTE: 100,00 €", "Bolo do parceiro: 100,00 € + IVA (123,00 € c/ IVA)"],
      (l) => {
        l.naoColocados = [{ id: "p2", motivo: "parceiro" }];
        l.orcamento.linhas = [linha("Flores TESTE", 100, "Flores TESTE: 100,00 €")];
        l.orcamento.valoresNaoUsados = [
          { valor: 100, citacao: "Bolo do parceiro: 100,00 €", motivo: "parceiro" },
          { valor: 123, citacao: "123,00 € c/ IVA", motivo: "parceiro" },
        ];
      },
    ),
  }),
  N1: () => ({
    oQue: "as contas sugerem sem IVA, as frases parecem dizer com IVA",
    ...cenario(
      [
        "Flores TESTE: 1.740,00 €",
        "Subtotal: 1.740,00 €",
        "IVA (23%): 400,20 €",
        "Total: 2.140,20 €",
        "Os valores apresentados incluem IVA.",
      ],
      (l) => {
        l.naoColocados = [{ id: "p5", motivo: "IVA" }];
        l.orcamento.linhas = [linha("Flores TESTE", 1740, "Flores TESTE: 1.740,00 €")];
        l.orcamento.totalSemIva = { valor: 1740, citacao: "Subtotal: 1.740,00 €" };
        l.orcamento.valorDoIva = { valor: 400.2, citacao: "IVA (23%): 400,20 €" };
        l.orcamento.totalComIva = { valor: 2140.2, citacao: "Total: 2.140,20 €" };
      },
    ),
  }),
  N2: () => ({
    oQue: "o documento não fala de IVA",
    ...cenario(["Flores TESTE: 500,00 €", "Total: 500,00 €"], (l) => {
      l.orcamento.linhas = [linha("Flores TESTE", 500, "Flores TESTE: 500,00 €")];
      l.orcamento.totalSemIva = { valor: 500, citacao: "Total: 500,00 €" };
    }),
  }),
  N3: () => ({
    oQue: "horas numa tabela de preços («16.30», «19.30») e «1.200 €»",
    ...cenario(
      [
        "Velas TESTE: 45,00 €",
        {
          tabela: [
            ["Hora", "Valor"],
            ["16.30", "1.200 €"],
            ["19.30", "500,00 €"],
          ],
        },
        "Total: 1.745,00 €",
      ],
      (l) => {
        l.naoColocados = [{ id: "l1", motivo: "cabeça" }];
        l.orcamento.linhas = [
          linha("Velas TESTE", 45, "Velas TESTE: 45,00 €"),
          linha("16.30", 1200, "16.30 | 1.200 €"),
          linha("19.30", 500, "19.30 | 500,00 €"),
        ];
        l.orcamento.totalSemIva = { valor: 1745, citacao: "Total: 1.745,00 €" };
      },
    ),
  }),
};
