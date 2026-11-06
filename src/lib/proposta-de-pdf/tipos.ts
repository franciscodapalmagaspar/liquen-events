/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE UM PDF PROPÕE — e porque é que NÃO é um documento
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A Líquen tem anos de propostas feitas à mão, em Word e no Canva, exportadas
 * em PDF. Refazer cada uma no estúdio é uma tarde de trabalho. Este motor lê o
 * PDF e adianta esse trabalho.
 *
 * Não devolve um {@link ProposalDoc}. Devolve uma PROPOSTA de documento, campo
 * a campo, e nunca escreve por cima de nada: quem vier a seguir tem de poder
 * mostrar-lhe «isto veio daqui» e deixá-la aceitar ou recusar linha a linha.
 *
 * ── A REGRA QUE MANDA EM TUDO O RESTO ─────────────────────────────────────
 *
 * Um resultado que PARECE certo e está errado é pior do que um resultado
 * vazio. Uma data trocada ou um preço mal lido não ficam num ecrã: entram numa
 * proposta que segue para um casal, com o nome dele em cima. Por isso:
 *
 *   · um campo que não se consegue ler com confiança FICA VAZIO. Não se
 *     adivinha, não se "aproxima", não se preenche com o valor mais provável;
 *   · todos os campos vazios são DITOS, em {@link RascunhoDePdf.porLer}, com a
 *     razão. Um silêncio é indistinguível de um descuido;
 *   · todo o campo preenchido traz a {@link Origem} — página, texto tal e qual,
 *     e a caixa em pontos onde estava. É isso que permite ao ecrã desenhar o
 *     rectângulo por cima do PDF e dizer de onde veio.
 *
 * Este ficheiro NÃO é `server-only` de propósito: o ecrã que vier a seguir corre
 * no navegador e precisa destes tipos e de {@link documentoDeCampos} para
 * montar o rascunho a partir do que ela ACEITOU — que é sempre um subconjunto
 * do que o motor propôs.
 */

import type { ProposalDoc } from "@/lib/proposal-doc";

/**
 * Quanto se confia num campo lido. Duas gavetas, e não uma percentagem.
 *
 * Uma percentagem seria uma precisão inventada: não há nada por trás que
 * distinga um 0,82 de um 0,79, e o ecrã acabaria a desenhar barras que ninguém
 * sabe ler. O que existe mesmo são duas situações diferentes:
 *
 * · `"alta"` — o RÓTULO estava impresso no documento e o valor estava no sítio
 *   onde o rótulo manda («Data» com a data por baixo, «Valor Total» com o
 *   número à direita). Não há aqui interpretação nenhuma: leu-se o que lá está.
 *
 * · `"media"` — leu-se com uma regra a mais. Ou o rótulo bateu certo mas o
 *   valor foi DERIVADO do texto (o `totalAmount` sai do «7.890,00 € + IVA» que
 *   está impresso, não de um campo próprio), ou o bloco teve de ser remontado a
 *   partir de linhas que a composição partiu.
 *
 * Não existe uma terceira gaveta. O que não chega a "media" não é devolvido: vai
 * para {@link RascunhoDePdf.porLer} com a razão por escrito.
 */
export type Confianca = "alta" | "media";

/** Onde, no PDF, estava o texto de onde saiu um campo. Coordenadas em PONTOS,
 *  com a origem no canto inferior esquerdo da página (é a convenção do PDF, e é
 *  a mesma que o gerador usa). */
export interface Origem {
  /** Página, a contar de 1 — como aparece no leitor de PDF dela. */
  pagina: number;
  /** O texto TAL E QUAL saiu do PDF, antes de qualquer limpeza. É este que o
   *  ecrã mostra ao lado do campo: «isto veio daqui». */
  texto: string;
  x: number;
  /** Base da linha (o PDF conta de baixo para cima). */
  y: number;
  largura: number;
  altura: number;
}

/**
 * Um campo proposto: onde vai, o que lá se põe, quanto se confia, e de onde saiu.
 *
 * `campo` é o CAMINHO dentro do {@link ProposalDoc} — `"eventDate"`,
 * `"serviceGroups[0].items[1].label"`, `"budgetExtras[2].valueText"`. É um
 * caminho e não um objecto aninhado porque o ecrã trabalha campo a campo: cada
 * linha da lista de revisão é um destes, com o seu botão de aceitar. Só depois
 * é que {@link documentoDeCampos} volta a montar o documento com os aceites.
 */
export interface CampoProposto {
  campo: string;
  /** Só estes tipos: o que entra num `ProposalDoc` é texto, número ou booleano.
   *  Listas e objectos nascem dos ÍNDICES no caminho, não de um valor composto —
   *  senão o ecrã não conseguia deixá-la recusar uma linha sem recusar a lista. */
  valor: string | number | boolean;
  confianca: Confianca;
  /** Em pt-PT, a regra que preencheu este campo. É o que o ecrã mostra quando
   *  ela pergunta «porquê?» — e é o que a faz confiar ou desconfiar. */
  porque: string;
  origem: Origem;
}

/** Um campo que o motor PROCUROU e não conseguiu preencher. Existe para que o
 *  vazio seja dito em vez de passar por esquecimento. */
export interface CampoPorLer {
  campo: string;
  /** Porque é que ficou vazio, em pt-PT. */
  porque: string;
}

/**
 * Uma fotografia encontrada dentro do PDF, já passada pelo caminho que valida
 * as fotos de proposta (`proposal-image.ts`).
 *
 * As fotos são metade do valor disto: são os mood boards e as capas das
 * propostas antigas, e voltar a procurá-las nas pastas dela é o trabalho que
 * este motor existe para poupar.
 *
 * `bytes` vem em base64 SEM prefixo `data:`, que é exactamente a forma que o
 * {@link ProposalDoc} usa em `coverImages` e `moodBoards[].images`.
 */
export interface FotoDoPdf {
  /** Identidade pelo CONTEÚDO. A mesma foto desenhada na capa e na contracapa é
   *  uma foto, não duas — e é por aqui que se sabe. */
  chave: string;
  /** JPEG baseline em base64, sem prefixo. */
  bytes: string;
  /** Onde estava desenhada — a primeira vez, se aparece em mais do que um sítio. */
  origem: Omit<Origem, "texto">;
  /** Em quantas páginas aparece. Mais do que uma costuma ser a capa (que o
   *  documento repete na contracapa). */
  vezes: number;
  /**
   * Onde é que esta fotografia parece pertencer, no documento — `"coverImages[0]"`,
   * `"moodBoards[1].images"` — ou `null` quando não se sabe.
   *
   * NÃO é um campo proposto: é uma sugestão de arrumação, e vive aqui e não em
   * {@link CampoProposto} de propósito. Um campo proposto tem um valor que se
   * aceita ou se recusa; isto é só o motor a dizer «esta estava na capa, à
   * esquerda», para o ecrã não obrigar a arrastar catorze fotografias uma a uma
   * quando o sítio de cada uma está escrito na página de onde saiu.
   */
  destino: string | null;
  larguraPx: number;
  alturaPx: number;
}

/** Algo que o motor teve de deixar de fora, e porquê. Nunca é uma frase feita:
 *  o ecrã precisa de poder dizer o número e o sítio. */
export interface Aviso {
  /** Um de: `"pdf-sem-texto"`, `"imagem-ilegivel"`, `"imagem-grande-demais"`,
   *  `"tempo-esgotado"`, `"paginas-de-mais"`, `"formato-desconhecido"`. */
  tipo: string;
  /** Em pt-PT, o que aconteceu. */
  mensagem: string;
  /** Página onde aconteceu, quando faz sentido. */
  pagina?: number;
}

/** O que o motor devolve. Nada aqui é um documento — é tudo material para o
 *  ecrã de revisão. */
export interface RascunhoDePdf {
  /** Os campos propostos, pela ordem em que aparecem no documento. */
  campos: CampoProposto[];
  /** Os campos que ficaram vazios, com a razão. */
  porLer: CampoPorLer[];
  /** As fotografias, já validadas e convertidas. */
  fotos: FotoDoPdf[];
  /** O que correu mal ou teve de ser cortado. */
  avisos: Aviso[];
  medidas: {
    paginas: number;
    /** Pedaços de texto lidos — zero num PDF que é só imagem digitalizada. */
    pedacos: number;
    /** Imagens desenhadas encontradas (antes de descartar logótipos e molduras). */
    imagens: number;
    ms: number;
  };
}

/**
 * Os campos do {@link ProposalDoc} que um PDF NUNCA pode devolver, porque o
 * documento gerado não os imprime — e não os imprime de propósito.
 *
 * Estão aqui, num sítio só, para o ecrã os poder mostrar apagados com a razão
 * ao lado, em vez de os deixar num limbo onde ela não sabe se falhou a leitura
 * ou se nunca houve nada para ler. É a mesma distinção que o gerador já faz
 * entre uma foto EM FALTA (avaria) e uma foto CORTADA (composição).
 */
export const NUNCA_NO_PDF: Readonly<Record<string, string>> = {
  budgetAmounts:
    "os preços por linha nunca são impressos — a folha do orçamento leva a coluna de preço em branco e um único total.",
  budgetCosts: "o que cada linha custa à Líquen nunca sai do back office.",
  budgetScales:
    "a escala de uma linha (por convidado, por mesa) é uma conta interna; o PDF só mostra o resultado.",
  convidadosPorMesa: "quantas pessoas por mesa não é impresso.",
  budgetArtigos:
    "o artigo do Moloni de cada linha é da faturação: o casal não tem nada que o ler.",
  budgetSubpontos:
    "os subpontos de cada linha (com o valor e o artigo de cada um) são só para nós — ela escolheu-o a 6/11; o PDF continua a mostrar a linha como sempre.",
  repartoPorArtigo:
    "a repartição do total pelos artigos do Moloni é da faturação: diz em que artigo se fatura, e o casal não tem nada que a ler.",
  notasInternas: "as notas internas nunca são desenhadas — há um teste no gerador a garanti-lo.",
  notasPorSeccao: "as notas por secção nunca são desenhadas.",
  fotosDeBiblioteca: "a origem das fotos na biblioteca não é impressa.",
  vatRate: "a taxa de IVA não é impressa em lado nenhum; só o «+ IVA» que diz se acresce.",
  headerTitle: "o título de cabeçalho não chega a ser desenhado pelo gerador.",
  traducoesFeitas:
    "o registo de contra que português cada tradução foi escrita é do estúdio: serve para marcar uma caixa inglesa como desactualizada, e não tem nada que dizer numa folha impressa.",
  escolhas:
    "as alternativas que o casal escolhe são de ecrã: vivem na página da proposta e nunca são impressas — uma folha A4 não oferece escolhas, e imprimir «opção A / opção B» no documento que o casal guarda só cria a dúvida de qual das duas ficou.",
};

/**
 * Campos que o NOSSO gerador não imprime, mas que uma folha feita à mão pode
 * trazer — e que por isso não podem estar na lista de cima.
 *
 * `validUntilDays` era o caso: o nosso documento imprime a DATA de validade
 * («válida até 10 de out. de 2026») porque a sabe, e daí a nota de que só se
 * recupera `validUntil`. As propostas escritas em Word dizem o PRAZO — «ESTA
 * PROPOSTA É VÁLIDA POR 60 DIAS» —, que é outro campo do documento e é lido
 * como tal. Transformá-lo numa data obrigava a inventar um dia de envio.
 */
export const SO_NAS_FEITAS_A_MAO: Readonly<Record<string, string>> = {
  validUntilDays:
    "o nosso documento imprime a data de validade e não o prazo; uma folha feita à mão costuma dizer «válida por N dias», e aí é este o campo que se lê.",
};

/* ═══════════════════════════════════════════════════════════════════════════
   DOS CAMPOS DE VOLTA A UM DOCUMENTO
   ═══════════════════════════════════════════════════════════════════════════ */

/** Um passo de um caminho: o nome de uma propriedade, ou um índice de lista. */
type Passo = { chave: string } | { indice: number };

/**
 * Nomes que NUNCA podem ser um passo de um caminho.
 *
 * `documentoDeCampos` escreve por nome de propriedade, e escrever numa
 * propriedade chamada `__proto__` não cria um campo: muda o PROTÓTIPO do
 * objecto — e, com ele, o de todos os objectos do processo que herdem dele.
 * Os campos que chegam a esta função vêm de um ecrã, ou seja, do outro lado da
 * rede, e um caminho é texto que alguém pode escrever à mão.
 *
 * Nenhum campo do `ProposalDoc` se chama assim, portanto não se perde nada.
 */
const NOMES_PROIBIDOS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * A gramática de um caminho, inteira e de uma vez: um nome, opcionalmente
 * seguido de índices, e depois zero ou mais `.nome[índices]`.
 *
 * É uma expressão sobre a string COMPLETA e não um varrimento pedaço a pedaço,
 * porque foi o varrimento que deixou passar `"a..b"` — cada ponto era
 * legítimo visto sozinho, e os dois seguidos não eram vistos por ninguém.
 */
const CAMINHO =
  /^[A-Za-z_][A-Za-z0-9_]*(?:\[\d{1,3}\])*(?:\.[A-Za-z_][A-Za-z0-9_]*(?:\[\d{1,3}\])*)*$/;

/**
 * Parte `"serviceGroups[0].items[1].label"` nos seus passos.
 *
 * Devolve `null` a um caminho que não obedeça à gramática — e quem chama
 * IGNORA esse campo em vez de tentar salvá-lo. Um caminho estranho só pode
 * chegar aqui por duas vias: um erro nosso, ou um payload adulterado a caminho
 * do ecrã. Nos dois casos, escrever às cegas dentro do documento dela era pior
 * do que perder um campo.
 */
export function passosDoCaminho(caminho: string): Passo[] | null {
  if (!caminho || caminho.length > 200 || !CAMINHO.test(caminho)) return null;
  const passos: Passo[] = [];
  for (const m of caminho.matchAll(/([A-Za-z_][A-Za-z0-9_]*)|\[(\d{1,3})\]/g)) {
    if (m[1] !== undefined) {
      if (NOMES_PROIBIDOS.has(m[1])) return null;
      passos.push({ chave: m[1] });
    } else {
      passos.push({ indice: Number(m[2]) });
    }
  }
  return passos.length ? passos : null;
}

/**
 * Monta um documento parcial a partir dos campos ACEITES.
 *
 * É `Partial<ProposalDoc>` e nunca um `ProposalDoc`: o que sai daqui é um
 * rascunho a que faltam sempre coisas, e escondê-lo atrás do tipo cheio faria
 * o estúdio tratá-lo como um documento completo. Quem o for usar passa-o por
 * `withProposalDefaults` — como já faz com o que sai do editor.
 *
 * As listas nascem dos ÍNDICES nos caminhos e ficam DENSAS: se um ecrã aceitar
 * `budgetItems[0]` e `budgetItems[2]` mas recusar o do meio, o resultado tem
 * dois itens e não três com um buraco. Um buraco numa lista de orçamento
 * imprime-se como uma linha em branco no meio das outras — e ninguém escolheu
 * isso; foi só a consequência de ter recusado uma linha.
 */
/** Um nó a meio da montagem: ou um objecto por nome, ou uma lista por índice.
 *  Não é o `ProposalDoc` — é o andaime que se transforma nele no fim. */
type No = Record<string, unknown> | unknown[];

/** Lê e escreve um passo num nó, sem que o tipo se perca pelo caminho. */
function ler(no: No, passo: Passo): unknown {
  return "chave" in passo
    ? (no as Record<string, unknown>)[passo.chave]
    : (no as unknown[])[passo.indice];
}
function escrever(no: No, passo: Passo, valor: unknown): void {
  if ("chave" in passo) (no as Record<string, unknown>)[passo.chave] = valor;
  else (no as unknown[])[passo.indice] = valor;
}

export function documentoDeCampos(campos: readonly CampoProposto[]): Partial<ProposalDoc> {
  const raiz: Record<string, unknown> = {};
  for (const c of campos) {
    const passos = passosDoCaminho(c.campo);
    if (!passos) continue;
    let no: No = raiz;
    for (let i = 0; i < passos.length - 1; i++) {
      // O passo SEGUINTE é que diz o que este tem de conter: um índice pede uma
      // lista, um nome pede um objecto.
      const filho: No = "indice" in passos[i + 1] ? [] : {};
      if (ler(no, passos[i]) === undefined) escrever(no, passos[i], filho);
      no = ler(no, passos[i]) as No;
    }
    escrever(no, passos[passos.length - 1], c.valor);
  }
  return compactar(raiz) as Partial<ProposalDoc>;
}

/** Deita fora os buracos das listas, em profundidade. Ver
 *  {@link documentoDeCampos} para a razão. */
function compactar(v: unknown): unknown {
  if (Array.isArray(v)) return v.filter((x) => x !== undefined && x !== null).map(compactar);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) o[k] = compactar(o[k]);
    return o;
  }
  return v;
}
