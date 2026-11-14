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
  frases: string[],
  ajustar: (l: Leitura) => void,
): { d: DocumentoCompleto; l: Leitura } {
  const d = documentoDeTeste(docx(frases));
  const l = leituraSoDoOrcamento();
  ajustar(l);
  return { d, l };
}

export const CENARIOS: Record<string, () => { d: DocumentoCompleto; l: Leitura; oQue: string }> = {
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
};
