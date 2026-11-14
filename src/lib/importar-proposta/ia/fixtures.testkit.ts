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
      iva: {
        taxa: { ...nada },
        valoresDasLinhas: { valor: "sem_iva", citacao: "Total | 1.740,00 € + IVA" },
        valoresDoTotal: { valor: "sem_iva", citacao: "1.740,00 € + IVA" },
      },
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

/** Uma leitura vazia, para os testes que só olham para o orçamento. */
export function leituraSoDoOrcamento(): Leitura {
  const l = leituraCerta();
  l.cliente = { nomes: null, email: null, telefone: null };
  l.evento = {
    data: { ...nada },
    local: null,
    tipo: { ...nada },
    convidados: { ...nada },
    idioma: null,
  };
  l.servicos = [];
  l.notas = [];
  l.imagens = [];
  l.naoColocados = [];
  l.orcamento.linhas = [];
  l.orcamento.valoresNaoUsados = [];
  l.orcamento.totalSemIva = { ...nada };
  l.orcamento.totalComIva = { ...nada };
  l.orcamento.iva.valoresDasLinhas = { valor: "desconhecido", citacao: null };
  l.orcamento.iva.valoresDoTotal = { valor: "desconhecido", citacao: null };
  return l;
}

const linha = (descricao: string, valor: number, citacao: string) => ({
  descricao,
  quantidade: { ...nada },
  precoUnitario: { ...nada },
  totalDaLinha: { valor, citacao },
  tipo: "normal" as const,
});

/** Uma proposta INVENTADA com o IVA INCLUÍDO (duas linhas de 25 € com IVA). */
export function propostaComIvaIncluido(): Uint8Array {
  return docx([
    { h: 1, t: "Orçamento" },
    "Flores TESTE: 25,00 €",
    "Velas TESTE: 25,00 €",
    "Total: 50,00 € (IVA incluído)",
  ]);
}
export function leituraComIvaIncluido(): Leitura {
  const l = leituraSoDoOrcamento();
  l.naoColocados = [{ id: "p1", motivo: "título" }];
  l.orcamento.linhas = [
    linha("Flores TESTE", 25, "Flores TESTE: 25,00 €"),
    linha("Velas TESTE", 25, "Velas TESTE: 25,00 €"),
  ];
  l.orcamento.totalComIva = { valor: 50, citacao: "Total: 50,00 € (IVA incluído)" };
  l.orcamento.iva.valoresDasLinhas = { valor: "com_iva", citacao: "IVA incluído" };
  l.orcamento.iva.valoresDoTotal = { valor: "com_iva", citacao: "50,00 € (IVA incluído)" };
  return l;
}

/** Uma proposta INVENTADA com IVA a 6 %. */
export function propostaComIvaASeis(): Uint8Array {
  return docx([
    { h: 1, t: "Orçamento" },
    "Livros TESTE: 100,00 €",
    "Total: 100,00 € + IVA",
    "IVA à taxa de 6%.",
  ]);
}
export function leituraComIvaASeis(): Leitura {
  const l = leituraSoDoOrcamento();
  l.naoColocados = [{ id: "p1", motivo: "título" }];
  l.orcamento.linhas = [linha("Livros TESTE", 100, "Livros TESTE: 100,00 €")];
  l.orcamento.totalSemIva = { valor: 100, citacao: "Total: 100,00 € + IVA" };
  l.orcamento.iva.taxa = { valor: 6, citacao: "IVA à taxa de 6%." };
  l.orcamento.iva.valoresDasLinhas = { valor: "sem_iva", citacao: "100,00 € + IVA" };
  l.orcamento.iva.valoresDoTotal = { valor: "sem_iva", citacao: "100,00 € + IVA" };
  return l;
}
