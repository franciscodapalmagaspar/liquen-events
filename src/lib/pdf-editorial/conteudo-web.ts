/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CONTEÚDO DA PROPOSTA, SECÇÃO A SECÇÃO — O MESMO DO PDF, SEM DESENHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela de 23/10: a proposta online passa a ser uma página web própria
 * (o protótipo «V5»), «gerada a partir dos MESMOS dados do editor». A maneira
 * de a página nunca discordar do PDF é não ter regras próprias: o `montar.ts`
 * corre o mesmo motor e, ao lado das páginas que desenha, devolve isto — os
 * textos já na língua, os valores já formatados (as contas são as de
 * `totaisDaProposta`, sem nenhuma nova) e as fotografias que o álbum escolheu
 * para cada sítio, com as escolhas e os enquadramentos dela.
 *
 * As fotografias vão pelo CAMINHO no armazenamento (`ref`): quem desenha a
 * página traduz para um endereço público, com a guarda do link do casal.
 */

/** Uma fotografia, pela referência no armazenamento. */
export interface FotoWeb {
  ref: string;
  /** Largura ÷ altura (o mosaico decide altas e largas por aqui). */
  aspecto: number;
  /** O enquadramento escolhido à mão, em fracções (`object-position`). */
  foco?: { x: number; y: number };
}

export interface FactoWeb {
  rotulo: string;
  valor: string;
}

/** Um ponto de uma lista de condições (o mesmo `Peca` do PDF). */
export type PecaWeb =
  | { tipo: "h3"; texto: string }
  | { tipo: "item"; texto: string; forte?: string };

export interface TemaWeb {
  titulo: string;
  subtitulo: string;
  nota: string;
  /** Todas as fotografias do tema, pela ordem dela (a ★ à frente). */
  fotos: FotoWeb[];
}

export interface CapituloWeb {
  /** 1, 2, 3… */
  numero: number;
  /** «Cocktail» num casamento; o título do mood board fora dele. */
  nome: string;
  /** O subtítulo do primeiro tema que o tem. */
  linha: string;
  /** A nota do primeiro tema que a tem. */
  nota: string;
  /** As do separador do PDF: a nítida e o fundo. */
  fotos: FotoWeb[];
  temas: TemaWeb[];
}

export interface InvestimentoWeb {
  /** «Total a pagar» / «Total estimado». */
  rotulo: string;
  /** «7.287,75 €». */
  valor: string;
  /** «com IVA incluído», quando o há. */
  nota?: string;
  /** A escada: subtotal, extras, sem IVA, IVA. */
  linhas: { rotulo: string; valor: string; forte?: boolean }[];
  /** Sinal e saldo, com a percentagem à parte (a página mostra-a em grande). */
  marcos: { percentagem: number; valor: string; texto: string }[];
  rodape: string[];
  /** As linhas do orçamento (os serviços), pela ordem do PDF. */
  servicos: { nome: string; marca?: string; preco?: string }[];
  foto: FotoWeb | null;
}

export interface CondicoesWeb {
  titulo: string;
  pecas: PecaWeb[];
}

export interface ConteudoWeb {
  casamento: boolean;
  /** «Decoramos eventos, eternizamos memórias.», na língua. */
  lema: string;
  organizacao: boolean;
  capa: {
    sobretitulo: string;
    nomes: string;
    /** Tipo · data · local, cada um à parte. */
    partes: string[];
    fundo: FotoWeb | null;
  };
  proposta: {
    sobretitulo: string;
    titulo: string;
    factos: FactoWeb[];
    nota: string;
    foto: FotoWeb | null;
  };
  servicos: {
    titulo: string;
    itens: { nome: string; descricao: string; foto: FotoWeb | null }[];
  } | null;
  ambiente: {
    sobretitulo: string;
    titulo: string;
    subtitulo: string;
    /** A fila (até 5) e o painel, como no PDF. */
    fila: FotoWeb[];
    painel: FotoWeb | null;
    /** As referências de onde saem as cores (as das mesas), pela ordem. */
    daPaleta: string[];
  } | null;
  capitulos: CapituloWeb[];
  citacao: { sobretitulo: string; frase: string; assinatura: string; foto: FotoWeb } | null;
  investimento: InvestimentoWeb | null;
  /** O cronograma (modelo Organização), quando o há. */
  cronograma: CondicoesWeb | null;
  condicoes: CondicoesWeb[];
  /** A faixa das condições do PDF (a primeira página delas). */
  fotoDasCondicoes: FotoWeb | null;
  fecho: {
    sobretitulo: string;
    agradecimento: string;
    /** A data de validade, por extenso, na língua. */
    validade: string;
    fundo: FotoWeb | null;
  };
}
