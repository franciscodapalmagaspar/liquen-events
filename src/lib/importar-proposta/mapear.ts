import {
  MOOD_BOARD_MAX_IMAGES,
  type ServiceGroup,
  type ServiceItem,
  type VatMode,
} from "../proposal-doc";
import {
  lerConvidados,
  lerData,
  lerEmail,
  lerLinhaDeDinheiro,
  lerLocal,
  lerNomes,
  lerTipoDeEvento,
  eFinanceira,
  eCandidataATotal,
  taxasDoIvaEscritas,
  type Confianca,
  type LinhaDeDinheiro,
} from "./heuristicas";
import { eur } from "../money";
import { DEFAULT_VAT_RATE } from "../proposal-doc";
import type { Bloco, ConteudoImportado, Seccao } from "./tipos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DO QUE SE LEU AO QUE O «FAZER PROPOSTA» TEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cada secção do documento antigo vai para um sítio só:
 *
 *  · a CAPA (o 1.º diapositivo, ou o que vem antes do primeiro título no
 *    Word) dá o nome, a data e a fotografia da capa;
 *  · uma secção de SERVIÇOS (pelo título — decoração, cerimónia, mesas… — ou
 *    por ter uma lista) dá um grupo de Serviços, com os pontos;
 *  · as linhas com euros dão o Orçamento, e a que diz «total» dá o total;
 *  · uma secção com FOTOGRAFIAS dá um mood board com o título dela.
 *
 * O texto corrido que não cabe em nenhum campo NÃO se perde e NÃO vai para o
 * PDF: fica nas notas internas (que o PDF nunca desenha), para ela ir buscar.
 *
 * As fotografias saem daqui como caminhos DENTRO DO FICHEIRO. Quem as carrega
 * é o navegador, no fim, e é ele que troca cada caminho pelo do armazenamento
 * (`montar.ts`).
 */

export type CampoImportado =
  | "clientNames"
  | "email"
  | "eventDate"
  | "location"
  | "eventType"
  | "guests"
  | "servicos"
  | "total"
  | "iva"
  | "fotos";

export interface FotoImportada {
  /** O caminho dentro do ficheiro (`ppt/media/image3.jpeg`). */
  caminho: string;
  /** O título da secção onde estava, para a mostrar agrupada. */
  seccao: string;
  destino: "capa" | "moodboard";
}

export interface MoodBoardImportado {
  title: string;
  /** Caminhos dentro do ficheiro. */
  images: string[];
}

/** O que a pré-visualização mostra e ela pode corrigir antes de criar. */
export interface PropostaImportada {
  formato: ConteudoImportado["formato"];
  clientNames: string;
  email: string;
  /** yyyy-mm-dd, ou "" quando não se leu. */
  dataIso: string;
  location: string;
  /** «Casamento»; "" quando não se leu. */
  eventType: string;
  categoria: "particulares" | "empresas" | "";
  /** O id do tipo no formulário de pedidos, ou "". */
  tipoDoPedido: string;
  guests: number | null;
  serviceGroups: ServiceGroup[];
  budgetItems: string[];
  /** Paralelo a `budgetItems`; `null` onde a linha não tinha valor. */
  budgetAmounts: (number | null)[];
  /** Paralelo a `budgetItems`: as linhas opcionais (extra). Só a leitura com IA o preenche. */
  budgetOpcional?: boolean[];
  /** A taxa de IVA do documento, quando não é a da casa. Só a leitura com IA o preenche. */
  vatRate?: number;
  /**
   * O documento não PROVA com contas se os valores têm IVA (`ia/verificar.ts`):
   * ela escolhe no ecrã («sem IVA» / «com IVA», nada pré-escolhido), e só aí
   * os valores das linhas passam — a partir de `linhasEscritas`.
   */
  ivaPorEscolher?: boolean;
  /**
   * Via das regras: as linhas financeiras (total, IVA, sinal, base…) que não
   * entraram como serviço, à vista dela, com «pôr como serviço».
   */
  valoresFinanceiros?: { rotulo: string; valor: number }[];
  /** Via das regras: os valores distintos que podem ser o total. */
  totaisDoDocumento?: number[];
  /** Via das regras: vários totais sem um par pela taxa — ela escolhe o total. */
  totalPorEscolher?: boolean;
  /** Paralelo a `budgetItems`: os valores COMO O DOCUMENTO OS ESCREVE. */
  linhasEscritas?: (number | null)[];
  /** Paralelo a `budgetItems`: as linhas que somam o total (nem opcionais nem incluídas). */
  linhasNormais?: boolean[];
  /** Os totais escritos no documento, sem e com IVA (para a escolha dela). */
  totaisEscritos?: { sem: number | null; com: number | null };
  totalAmount: number | null;
  /** `null` = não se percebeu; ela escolhe. */
  totalVatMode: VatMode | null;
  /** A soma das linhas com valor, para o aviso «não encontrei o total». */
  somaDasLinhas: number;
  moodBoards: MoodBoardImportado[];
  capa: string | null;
  fotos: FotoImportada[];
  notasInternas: string;
  confianca: Record<CampoImportado, Confianca>;
  avisos: string[];
}

const NAO_E_SERVICO =
  /or[cç]amento|investimento|valores|pre[cç]o|custos?\b|condi[cç]|pagamento|contact|sobre n[oó]s|quem somos|a l[ií]quen|obrigad|[ií]ndice|introdu|apresenta[cç]|notas|observa[cç]|cancelamento|validade|faseamento|termos|resumo|inspira[cç]|mood ?board/i;
const E_SERVICO =
  /decora|flor|floral|cerim[oó]nia|copo d|mesa|ilumina|mobili|entrada|\bbar\b|cocktail|igreja|altar|arco|centros?|papelaria|sinal[eé]tica|tecidos|velas|lounge|jardim|bolo|welcome|ramo|bouquet|recep|jantar|lugares|servi[cç]os?|montagem|desmontagem|cen[aá]rio/i;

const MAX_NOTAS = 6000;

function linhasDoBloco(b: Bloco): string[] {
  if (b.tipo === "tabela") return b.linhas.map((l) => l.filter(Boolean).join(" · "));
  return b.texto.split("\n").filter(Boolean);
}

function linhasDaSeccao(s: Seccao): string[] {
  return s.blocos.flatMap(linhasDoBloco);
}

function partirItem(texto: string): ServiceItem {
  const [primeira, ...resto] = texto.split("\n");
  const m = /^(.{2,60}?)\s*[:–—]\s+(.+)$/.exec(primeira);
  const label = (m ? m[1] : primeira).trim();
  const desc = [m ? m[2] : "", ...resto].filter(Boolean).join(" ").trim();
  return { label, desc };
}

function letra(i: number): string {
  return `${String.fromCharCode(97 + (i % 26))})`;
}

export function mapearConteudo(c: ConteudoImportado): PropostaImportada {
  const avisos = [...c.avisos];
  const seccoes = c.seccoes;
  const titulos = seccoes.map((s) => s.titulo).filter(Boolean);
  const linhas = seccoes.flatMap((s) => [s.titulo, ...linhasDaSeccao(s)].filter(Boolean));
  const textoTodo = linhas.join("\n");
  const capaIdx =
    seccoes.length > 0 && (c.formato === "pptx" || seccoes[0].origem === "Início do documento")
      ? 0
      : -1;
  const inicio =
    capaIdx === 0
      ? [seccoes[0].titulo, ...linhasDaSeccao(seccoes[0])].join("\n")
      : (titulos[0] ?? "");

  // ── Os campos do evento ──
  const nomes = lerNomes(titulos, linhas);
  const email = lerEmail(textoTodo);
  const data = lerData(titulos, linhas);
  const local = lerLocal(linhas);
  const convidados = lerConvidados(textoTodo);
  const tipo = lerTipoDeEvento(inicio, textoTodo);

  // ── O dinheiro, de todas as secções, pela ordem ──
  const dinheiro: LinhaDeDinheiro[] = [];
  const jaVisto = new Set<string>();
  for (const l of linhas) {
    const d = lerLinhaDeDinheiro(l);
    if (!d) continue;
    const chave = `${d.rotulo.toLowerCase()}|${d.valor}`;
    if (jaVisto.has(chave)) continue;
    jaVisto.add(chave);
    dinheiro.push(d);
  }
  /**
   * ── O DINHEIRO: SERVIÇOS, LINHAS FINANCEIRAS E O TOTAL ───────────────────
   * Um desenho fechado (8.ª revisão), em vez de um remendo por rótulo:
   *  · uma linha com uma palavra de `PALAVRAS_FINANCEIRAS` nunca é serviço —
   *    fica numa lista à vista dela, com «pôr como serviço»;
   *  · o total sai SÓ das financeiras com «total», «valor com/sem IVA»,
   *    «base» ou «líquido» (`eCandidataATotal`; o Subtotal nunca);
   *  · um valor só: é o total. Vários: se exatamente um par bate pela taxa ao
   *    cêntimo, é o sem e o com IVA (`totalParaOModo` escolhe pelo modo);
   *    senão ela escolhe o total entre eles, sem nada pré-escolhido.
   */
  const financeiras = dinheiro.filter((d) => eFinanceira(d.rotulo));
  const itensComValor = dinheiro.filter((d) => d.rotulo && !eFinanceira(d.rotulo));
  const totaisDoDocumento = [
    ...new Set(financeiras.filter((d) => eCandidataATotal(d.rotulo)).map((d) => d.valor)),
  ].sort((x, y) => x - y);
  // A prova do par usa a taxa ESCRITA no documento, se houver uma só; sem
  // nenhuma, 23 %; com taxas diferentes, não há prova (ela escolhe o total).
  const taxas = taxasDoIvaEscritas(textoTodo);
  const taxaDaProva = taxas.length === 1 ? taxas[0] : taxas.length === 0 ? DEFAULT_VAT_RATE : null;
  const daTaxa = (sem: number, com: number) =>
    taxaDaProva !== null && Math.round(sem * (1 + taxaDaProva) * 100) === Math.round(com * 100);
  const pares: [number, number][] = [];
  for (let i = 0; i < totaisDoDocumento.length; i++) {
    for (let j = i + 1; j < totaisDoDocumento.length; j++) {
      if (daTaxa(totaisDoDocumento[i], totaisDoDocumento[j])) {
        pares.push([totaisDoDocumento[i], totaisDoDocumento[j]]);
      }
    }
  }
  let totaisEscritos: { sem: number | null; com: number | null } | null = null;
  if (totaisDoDocumento.length === 1) {
    totaisEscritos = { sem: totaisDoDocumento[0], com: totaisDoDocumento[0] };
  } else if (totaisDoDocumento.length > 1 && pares.length === 1) {
    totaisEscritos = { sem: pares[0][0], com: pares[0][1] };
  }
  const totalPorEscolher = totaisDoDocumento.length > 1 && !totaisEscritos;
  /**
   * ── O IVA É SEMPRE ELA QUE O ESCOLHE — TAMBÉM NESTA VIA ──────────────────
   * Era lido do texto (`lerModoDoIva`) e vinha pré-escolhido. Quatro rondas
   * de revisão mostraram que nenhuma regra lê bem todas as maneiras de dizer o
   * IVA: tanto nesta via como na leitura com IA, o modo fica por escolher, e
   * o ecrã mostra as mesmas sugestões (`ia/verificar.ts`, `analisarIva`).
   */
  const ivaPorEscolher =
    totaisDoDocumento.length > 0 || itensComValor.length > 0 || financeiras.length > 0;
  const somaDasLinhas = Math.round(itensComValor.reduce((s, d) => s + d.valor, 0) * 100) / 100;
  const linhasComValor = new Set(dinheiro.map((d) => d.linha));

  // ── Os serviços ──
  const serviceGroups: ServiceGroup[] = [];
  const sobras: string[] = [];
  seccoes.forEach((s, i) => {
    if (i === capaIdx) {
      for (const l of linhasDaSeccao(s)) if (l.length > 140) sobras.push(l);
      return;
    }
    const temLista = s.blocos.some((b) => b.tipo === "item");
    const curtos = s.blocos.filter((b) => b.tipo === "paragrafo" && b.texto.length <= 140).length;
    const eServico =
      Boolean(s.titulo) &&
      !NAO_E_SERVICO.test(s.titulo) &&
      (E_SERVICO.test(s.titulo) || temLista || curtos >= 2);
    if (!eServico) {
      for (const l of linhasDaSeccao(s)) if (!linhasComValor.has(l)) sobras.push(l);
      return;
    }
    const items: ServiceItem[] = [];
    for (const b of s.blocos) {
      if (b.tipo === "tabela") {
        for (const linha of b.linhas) {
          const semValor = linha.filter((x) => x && !lerLinhaDeDinheiro(x));
          if (!semValor.length) continue;
          items.push({ label: semValor[0], desc: semValor.slice(1).join(" — ") });
        }
        continue;
      }
      const d = lerLinhaDeDinheiro(b.texto);
      const texto = d ? d.rotulo : b.texto;
      if (!texto) continue;
      if (d && eFinanceira(d.rotulo)) continue;
      if (b.tipo === "item" && b.nivel > 0 && items.length) {
        const ant = items[items.length - 1];
        ant.desc = [ant.desc, texto.replace(/\n/g, " ")].filter(Boolean).join("; ");
        continue;
      }
      if (b.tipo === "paragrafo" && texto.length > 140) {
        sobras.push(b.texto);
        continue;
      }
      items.push(partirItem(texto));
    }
    if (items.length) {
      serviceGroups.push({ letter: letra(serviceGroups.length), title: s.titulo, items });
    }
  });

  // ── As fotografias ──
  const fotos: FotoImportada[] = [];
  const moodBoards: MoodBoardImportado[] = [];
  let capa: string | null = null;
  const juntarFoto = (caminho: string, seccao: string, destino: FotoImportada["destino"]) => {
    if (!fotos.some((f) => f.caminho === caminho)) fotos.push({ caminho, seccao, destino });
  };
  let semTitulo = 0;
  seccoes.forEach((s, i) => {
    if (!s.imagens.length) return;
    let imagens = s.imagens;
    if (i === capaIdx) {
      capa = imagens[0];
      juntarFoto(imagens[0], s.titulo || "Capa", "capa");
      imagens = imagens.slice(1);
      if (!imagens.length) return;
    }
    const titulo = s.titulo || `Inspiração ${++semTitulo}`;
    for (let k = 0; k < imagens.length; k += MOOD_BOARD_MAX_IMAGES) {
      const parte = imagens.slice(k, k + MOOD_BOARD_MAX_IMAGES);
      const n = k / MOOD_BOARD_MAX_IMAGES;
      moodBoards.push({ title: n === 0 ? titulo : `${titulo} (${n + 1})`, images: parte });
    }
    for (const im of imagens) juntarFoto(im, titulo, "moodboard");
  });

  // ── A confiança, e os avisos que ela lê ──
  const confianca: Record<CampoImportado, Confianca> = {
    clientNames: nomes?.confianca ?? "nada",
    email: email?.confianca ?? "nada",
    eventDate: data?.confianca ?? "nada",
    location: local?.confianca ?? "nada",
    eventType: tipo?.confianca ?? "nada",
    guests: convidados?.confianca ?? "nada",
    // Os serviços saem sempre de uma regra (o título ou a forma da secção):
    // nunca passam de «média».
    servicos: serviceGroups.length ? "media" : "nada",
    total: totaisEscritos ? "alta" : totalPorEscolher ? "baixa" : "nada",
    iva: "nada",
    fotos: fotos.length ? "alta" : "nada",
  };

  if (!nomes) avisos.push("Não encontrei o nome do casal ou do cliente. Escreve-o.");
  else if (nomes.confianca === "baixa") {
    avisos.push(`O nome «${nomes.valor}» foi um palpite a partir do texto. Confirma-o.`);
  }
  if (!data) avisos.push("Não encontrei a data do evento.");
  else if (data.valor.outras.length) {
    avisos.push(
      `Há mais do que uma data no documento. Escolhi a primeira; as outras são ${data.valor.outras
        .map(formatarDia)
        .join(", ")}. Confirma a data do evento.`,
    );
  }
  if (local?.confianca === "baixa") {
    avisos.push(`O local «${local.valor}» é um palpite: o documento fala de mais do que um sítio.`);
  }
  if (!totaisDoDocumento.length && itensComValor.length) {
    avisos.push(
      `Não encontrei a linha do total. As linhas com valor somam ${formatarEuros(somaDasLinhas)}. Confirma o total antes de usar.`,
    );
  }
  if (!serviceGroups.length) {
    avisos.push("Não encontrei uma lista de serviços. Os Serviços ficam por preencher no estúdio.");
  }

  // Os valores de cada linha passam quando ELA escolhe se são sem ou com IVA
  // (`valoresQueVaoSerGravados`): até lá vão os escritos, à parte.

  const notas = sobras.join("\n").trim();
  return {
    formato: c.formato,
    clientNames: nomes?.valor ?? "",
    email: email?.valor ?? "",
    dataIso: data?.valor.iso ?? "",
    location: local?.valor ?? "",
    eventType: tipo?.valor.rotulo ?? "",
    categoria: tipo?.valor.categoria ?? "",
    tipoDoPedido: tipo?.valor.tipo ?? "",
    guests: convidados?.valor ?? null,
    serviceGroups,
    budgetItems: itensComValor.map((d) => d.rotulo),
    budgetAmounts: itensComValor.map(() => null),
    totalAmount: totaisEscritos?.sem ?? null,
    totalVatMode: null,
    // Uma só taxa escrita, diferente da da casa: passa a `vatRate` (como na
    // leitura, `ia/preencher.ts`) e converte também as linhas.
    ...(taxas.length === 1 && Math.abs(taxas[0] - DEFAULT_VAT_RATE) > 1e-9
      ? { vatRate: taxas[0] }
      : {}),
    ...(ivaPorEscolher
      ? {
          ivaPorEscolher: true,
          linhasEscritas: itensComValor.map((d) => d.valor),
          linhasNormais: itensComValor.map(() => true),
          ...(totaisEscritos ? { totaisEscritos } : {}),
        }
      : {}),
    ...(financeiras.length
      ? { valoresFinanceiros: financeiras.map((d) => ({ rotulo: d.rotulo, valor: d.valor })) }
      : {}),
    ...(totaisDoDocumento.length ? { totaisDoDocumento } : {}),
    ...(totalPorEscolher ? { totalPorEscolher: true } : {}),
    somaDasLinhas,
    moodBoards,
    capa,
    fotos,
    notasInternas: notas.length > MAX_NOTAS ? `${notas.slice(0, MAX_NOTAS)}…` : notas,
    confianca,
    avisos,
  };
}

const formatarEuros = eur;

function formatarDia(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
