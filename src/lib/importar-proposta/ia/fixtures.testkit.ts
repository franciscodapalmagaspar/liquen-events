import { docx } from "../fabricar.testkit";
import { lerTextosDoZip } from "../zip-node";
import { lerDocxCompleto, type DocumentoCompleto } from "../documento-completo";
import type { Leitura } from "./esquema";

/**
 * Uma proposta INVENTADA (dados TESTE) e a leitura certa dela — o ponto de
 * partida dos testes da verificação: cada teste estraga uma coisa e vê se a
 * regra a apanha.
 */
export function propostaDeTeste(): Uint8Array {
  return docx([
    "Proposta de Decoração — Casamento",
    "Ana Teste & Rui Exemplo",
    "Data: 12 de junho de 2027",
    "Local: Quinta do Teste, Sintra",
    "120 convidados",
    { img: "capa.jpeg" },
    { h: 1, t: "Decoração da Cerimónia" },
    { li: "Arco de flores: arco em ferro com flores da época" },
    { li: "com eucalipto", nivel: 1 },
    { img: "arco.jpeg" },
    { h: 1, t: "Orçamento" },
    {
      tabela: [
        ["Descrição", "Valor"],
        ["Decoração da cerimónia", "1.200,00 €"],
        ["Centros de mesa", "12 x 45,00 € = 540,00 €"],
        ["Total", "1.740,00 € + IVA"],
      ],
    },
    "Sinal de 30%: 522,00 €",
    "Validade da proposta: 30 dias.",
  ]);
}

export function documentoDeTeste(bytes = propostaDeTeste()): DocumentoCompleto {
  return lerDocxCompleto(lerTextosDoZip(bytes));
}

const nada = { valor: null, citacao: null };

export function leituraCerta(): Leitura {
  return {
    cliente: { nomes: "Ana Teste & Rui Exemplo", email: null, telefone: null },
    evento: {
      data: { valor: "2027-06-12", citacao: "Data: 12 de junho de 2027" },
      local: "Quinta do Teste, Sintra",
      tipo: { valor: "Casamento", citacao: "Proposta de Decoração — Casamento" },
      convidados: { valor: 120, citacao: "120 convidados" },
      idioma: "pt",
    },
    servicos: [
      {
        titulo: "Decoração da Cerimónia",
        itens: [
          {
            titulo: "Arco de flores",
            descricao: "arco em ferro com flores da época",
            subitens: [{ titulo: "com eucalipto", descricao: null }],
          },
        ],
      },
    ],
    orcamento: {
      linhas: [
        {
          descricao: "Decoração da cerimónia",
          quantidade: { ...nada },
          precoUnitario: { ...nada },
          totalDaLinha: { valor: 1200, citacao: "Decoração da cerimónia | 1.200,00 €" },
          tipo: "normal",
        },
        {
          descricao: "Centros de mesa",
          quantidade: { valor: 12, citacao: "12 x 45,00 €" },
          precoUnitario: { valor: 45, citacao: "12 x 45,00 €" },
          totalDaLinha: { valor: 540, citacao: "= 540,00 €" },
          tipo: "normal",
        },
      ],
      iva: { taxa: { ...nada }, valoresDasLinhas: "sem_iva", valoresDoTotal: "sem_iva" },
      totalSemIva: { valor: 1740, citacao: "Total | 1.740,00 € + IVA" },
      valorDoIva: { ...nada },
      totalComIva: { ...nada },
      valoresNaoUsados: [
        { valor: 522, citacao: "Sinal de 30%: 522,00 €", motivo: "é o sinal, não uma linha" },
      ],
    },
    notas: [
      { tipo: "pagamento", texto: "Sinal de 30%: 522,00 €" },
      { tipo: "validade", texto: "Validade da proposta: 30 dias." },
    ],
    imagens: [
      { id: "im1", destino: "capa", tema: null, capitulo: null, motivo: null },
      {
        id: "im2",
        destino: "moodboard",
        tema: "Decoração da Cerimónia",
        capitulo: "Decoração da Cerimónia",
        motivo: null,
      },
    ],
    naoColocados: [
      { id: "p9", motivo: "título da secção do orçamento" },
      { id: "l1", motivo: "cabeçalho da tabela" },
    ],
  };
}
