import {
  DEFAULT_VAT_RATE,
  normaliseCoverImages,
  resolveProposalMoney,
  parseMoneyText,
  type MoodBoard,
  type VatMode,
  type withProposalDefaults,
} from "../proposal-doc";
import { dataDoEventoPorExtenso, referenciaDoDocumento } from "../proposal-doc-textos";
import { eur, round2 } from "../money";
import type { PropostaImportada } from "./mapear";
import { valoresSemIvaDasLinhas } from "./ia/linhas";

/**
 * O passo final, no navegador: o que se leu, MAIS o que ela corrigiu na
 * pré-visualização, MAIS os caminhos das fotografias já carregadas → o
 * rascunho do estúdio e o corpo do pedido.
 *
 * Puro e testado à parte: é aqui que um valor errado passaria do ecrã da
 * importação para o «Fazer proposta» sem ninguém dar por isso.
 */

export type DocDoEstudio = Parameters<typeof withProposalDefaults>[0];

/** Os campos que ela pode corrigir antes de criar. */
export interface Correccoes {
  clientNames: string;
  email: string;
  dataIso: string;
  location: string;
  eventType: string;
  guests: string;
  /** O total como ela o escreve («3.200,00»); vazio = sem total. */
  total: string;
  /**
   * O modo do IVA. Só muda por `escolherModoDoIva` (que também acerta o total
   * pelo lado escolhido); nunca por um campo à parte.
   */
  totalVatMode: VatMode | null;
  /** Ela escreveu no campo do total À MÃO (apagar também conta). */
  totalTocado?: boolean;
  /** O documento tinha total e ela confirmou que a proposta fica sem ele. */
  semTotalConfirmado?: boolean;
  /** Via das regras, com vários totais sem par: o que ela escolheu. */
  totalEscolhido?: number;
  /** Via das regras: as linhas financeiras (índices) que ela pôs como serviço. */
  servicosPostos?: number[];
  /** O total veio do «Usar a soma das linhas». */
  somaUsada?: boolean;
}

/**
 * As linhas financeiras que ela pôs como serviço passam a linhas do
 * orçamento (no fim, como as outras, à espera do IVA). Puro: o ecrã, o
 * `valoresQueVaoSerGravados` e o `montarDocumento` vêem as mesmas linhas.
 */
export function comServicosPostos(p: PropostaImportada, c: Correccoes): PropostaImportada {
  const postos = (c.servicosPostos ?? [])
    .map((i) => p.valoresFinanceiros?.[i])
    .filter((x): x is { rotulo: string; valor: number } => Boolean(x));
  if (!postos.length) return p;
  const escritas = p.linhasEscritas ?? p.budgetAmounts;
  return {
    ...p,
    budgetItems: [...p.budgetItems, ...postos.map((x) => x.rotulo)],
    budgetAmounts: [...p.budgetAmounts, ...postos.map(() => null)],
    ...(p.budgetOpcional
      ? { budgetOpcional: [...p.budgetOpcional, ...postos.map(() => false)] }
      : {}),
    ivaPorEscolher: true,
    linhasEscritas: [...escritas, ...postos.map((x) => x.valor)],
    linhasNormais: [...(p.linhasNormais ?? escritas.map(() => true)), ...postos.map(() => true)],
    valoresFinanceiros: p.valoresFinanceiros?.filter((_, i) => !c.servicosPostos?.includes(i)),
    somaDasLinhas: round2(p.somaDasLinhas + postos.reduce((a, x) => a + x.valor, 0)),
  };
}

/** A soma dos SERVIÇOS (as linhas financeiras não entram; as postas como serviço sim). */
export function somaDosServicos(p: PropostaImportada, c: Correccoes): number {
  return comServicosPostos(p, c).somaDasLinhas;
}

/** «Usar a soma das linhas»: o total passa a ser a soma dos serviços. */
export function usarASoma(p: PropostaImportada, c: Correccoes): Correccoes {
  return {
    ...c,
    total: totalEmTexto(somaDosServicos(p, c)),
    totalTocado: true,
    somaUsada: true,
  };
}

/** Via das regras, vários totais sem par: ela escolhe um deles. */
export function escolherTotalDoDocumento(
  p: PropostaImportada,
  c: Correccoes,
  valor: number,
): Correccoes {
  void p;
  return { ...c, total: totalEmTexto(valor), totalEscolhido: valor, somaUsada: false };
}

/**
 * ── A ÚNICA MANEIRA DE ESCOLHER O IVA ─────────────────────────────────────
 * Muda o modo e, se ela não tocou no total à mão, põe o total do lado
 * escolhido (`totalParaOModo`): «com IVA» com os dois totais no documento usa
 * o com IVA. Havia uma segunda escolha (o «O total inclui IVA?» de baixo) que
 * mudava o modo sem trocar o total, e gravava 40,65 € «incluído» em vez de 50.
 */
export function escolherModoDoIva(p: PropostaImportada, c: Correccoes, modo: VatMode): Correccoes {
  return {
    ...c,
    totalVatMode: modo,
    // Com o total escolhido por ela entre vários (`totalPorEscolher`), o IVA
    // não o troca: não há par que diga qual é o sem e qual é o com.
    ...(c.totalTocado || p.totalPorEscolher
      ? {}
      : { total: totalEmTexto(totalParaOModo(p, modo)) }),
  };
}

export function correccoesIniciais(p: PropostaImportada): Correccoes {
  return {
    clientNames: p.clientNames,
    email: p.email,
    dataIso: p.dataIso,
    location: p.location,
    eventType: p.eventType,
    guests: p.guests ? String(p.guests) : "",
    total: totalEmTexto(p.totalAmount),
    totalVatMode: p.totalVatMode,
  };
}

/**
 * Ao reler o documento (com a leitura em JSON), o que ela já corrigiu à mão
 * fica; só os campos que ela NÃO tocou passam a ser os da leitura nova.
 */
export function juntarCorreccoes(
  inicialAntes: Correccoes,
  actual: Correccoes,
  novas: Correccoes,
  nova?: PropostaImportada,
): Correccoes {
  const out = { ...novas };
  for (const k of Object.keys(novas) as (keyof Correccoes)[]) {
    if (k === "total" || k === "totalVatMode") continue;
    if (actual[k] !== inicialAntes[k]) (out as Record<string, unknown>)[k] = actual[k];
  }
  // O total só fica se ela o escreveu à mão. Se veio da escolha do IVA, volta
  // a sair da leitura nova — pelo mesmo modo que ela tinha escolhido.
  if (actual.totalTocado) {
    out.total = actual.total;
    out.totalTocado = true;
  }
  if (actual.semTotalConfirmado) out.semTotalConfirmado = true;
  if (actual.totalVatMode) {
    return nova
      ? escolherModoDoIva(nova, out, actual.totalVatMode)
      : { ...out, totalVatMode: actual.totalVatMode };
  }
  return out;
}

/** O total escrito, em número; `null` quando está vazio ou não se lê. */
export function totalEscrito(texto: string): number | null {
  if (!/\d/.test(texto)) return null;
  // A mesma leitura do resto da casa (`parseMoneyText`).
  const n = parseMoneyText(texto);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** O que ainda impede criar. Vazio = pode criar. */
export function oQueFalta(
  c: Correccoes,
  p?: Pick<PropostaImportada, "ivaPorEscolher" | "totalAmount" | "totalPorEscolher">,
): string[] {
  const falta: string[] = [];
  if (p?.totalPorEscolher && c.totalEscolhido === undefined && !c.totalTocado) {
    falta.push("escolher o total do documento");
  }
  // O IVA é SEMPRE ela que o diz (`ia/verificar.ts`) — mesmo sem total. Uma
  // vez só: a mesma escolha vale para as linhas e para o total.
  const porEscolher = !c.totalVatMode && (p?.ivaPorEscolher || totalEscrito(c.total) !== null);
  // O documento tinha total e o campo ficou vazio: ou ela o escreve, ou diz
  // que a proposta fica mesmo sem total.
  if (p?.totalAmount && !c.total.trim() && !c.semTotalConfirmado) {
    falta.push("o total (o documento tem total — escreve-o ou confirma que fica sem total)");
  }
  if (porEscolher) {
    falta.push(
      p?.ivaPorEscolher
        ? "escolher se os valores do documento têm IVA"
        : "dizer se o total inclui IVA",
    );
  }
  if (!c.clientNames.trim()) falta.push("o nome do cliente");
  if (c.total.trim() && totalEscrito(c.total) === null) falta.push("um total que se leia");
  return falta;
}

/**
 * ── DEPOIS DA ESCOLHA: AS LINHAS SOMAM O TOTAL? ───────────────────────────
 * As linhas convertidas (sem IVA) contra a base do total gravado, ao cêntimo
 * (`resolveProposalMoney`). Se não batem, é um aviso de dinheiro para ela
 * confirmar; o id leva os dois números, para mudar se ela mudar algum.
 */
export function avisoDaSomaGravada(
  p: PropostaImportada,
  c: Correccoes,
): { id: string; texto: string; campo: string; dinheiro: true; gravidade: "erro" } | null {
  if (!c.totalVatMode) return null;
  p = comServicosPostos(p, c);
  const g = valoresQueVaoSerGravados(p, { ...c, servicosPostos: [] });
  if (g.totalAmount === null || !g.totalVatMode) return null;
  const normais = p.linhasNormais ?? g.budgetAmounts.map((_, i) => !p.budgetOpcional?.[i]);
  const vals = g.budgetAmounts.filter((v, i): v is number => v !== null && normais[i] !== false);
  if (!vals.length) return null;
  const soma = round2(vals.reduce((a, b) => a + b, 0));
  const base = resolveProposalMoney({
    totalAmount: g.totalAmount,
    totalVatMode: g.totalVatMode,
    vatRate: p.vatRate ?? DEFAULT_VAT_RATE,
  }).base;
  if (soma === base) return null;
  return {
    id: `soma-depois:${soma}:${base}`,
    campo: "orcamento.total",
    dinheiro: true,
    gravidade: "erro",
    texto: `Com o IVA que escolheste, as linhas somam ${eur(soma)} — o total é ${eur(base)} sem IVA.`,
  };
}

/**
 * Ela usou a soma dos serviços como total, mas o documento tem um total
 * diferente: aviso de dinheiro, para ela confirmar qual vale.
 */
export function avisoDaSomaUsada(
  p: PropostaImportada,
  c: Correccoes,
): { id: string; texto: string; campo: string; dinheiro: true; gravidade: "erro" } | null {
  if (!c.somaUsada) return null;
  const soma = totalEscrito(c.total);
  const doDocumento = p.totaisDoDocumento ?? [];
  if (soma === null || !doDocumento.length || doDocumento.includes(soma)) return null;
  return {
    id: `soma-usada:${soma}:${doDocumento.join("|")}`,
    campo: "orcamento.total",
    dinheiro: true,
    gravidade: "erro",
    texto: `Usaste a soma das linhas (${eur(soma)}), mas o documento tem ${doDocumento.length === 1 ? "um total de" : "os totais"} ${doDocumento.map((v) => eur(v)).join(", ")}.`,
  };
}

/** Os avisos de dinheiro que nascem do que ela faz no ecrã (com ou sem revisão). */
export function avisosDoEcra(p: PropostaImportada, c: Correccoes) {
  return [avisoDaSomaGravada(p, c), avisoDaSomaUsada(p, c)].filter(
    (a): a is NonNullable<typeof a> => a !== null,
  );
}

/**
 * O total escrito que corresponde à escolha dela: com os dois no documento,
 * «sem IVA» usa o sem IVA e «com IVA» o com IVA; com um só, esse.
 */
export function totalParaOModo(p: PropostaImportada, modo: VatMode): number | null {
  const t = p.totaisEscritos;
  if (!t) return p.totalAmount;
  return modo === "acrescer" ? (t.sem ?? t.com) : (t.com ?? t.sem);
}

/** O total em texto, como o campo do ecrã o escreve. */
export function totalEmTexto(n: number | null): string {
  return n ? n.toFixed(2).replace(".", ",") : "";
}

/**
 * ── O QUE VAI SER GRAVADO, NUMA FUNÇÃO SÓ ─────────────────────────────────
 * Os valores sem IVA das linhas, o total e o modo, a partir do que se leu e do
 * que ela escolheu. O ecrã mostra ISTO e o `montarDocumento` grava ISTO: os
 * dois nunca podem discordar.
 */
export function valoresQueVaoSerGravados(
  p: PropostaImportada,
  c: Correccoes,
): { budgetAmounts: (number | null)[]; totalAmount: number | null; totalVatMode: VatMode | null } {
  p = comServicosPostos(p, c);
  const total = totalEscrito(c.total);
  const modo = total !== null ? c.totalVatMode : null;
  const budgetAmounts =
    p.ivaPorEscolher && p.linhasEscritas
      ? c.totalVatMode
        ? valoresSemIvaDasLinhas(
            p.linhasEscritas,
            p.linhasNormais ?? p.linhasEscritas.map(() => true),
            c.totalVatMode,
            p.vatRate ?? DEFAULT_VAT_RATE,
          )
        : p.linhasEscritas.map(() => null)
      : [...p.budgetAmounts];
  return {
    budgetAmounts,
    totalAmount: total !== null && modo ? total : null,
    totalVatMode: total !== null ? modo : null,
  };
}

function hojeEmTexto(hoje: Date): string {
  const d = String(hoje.getDate()).padStart(2, "0");
  const m = String(hoje.getMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${hoje.getFullYear()}`;
}

/** O corpo para `POST /api/orcamento/manual` — o caminho de sempre. */
export function corpoDoPedido(
  p: PropostaImportada,
  c: Correccoes,
  nomeDoFicheiro: string,
  hoje = new Date(),
): Record<string, unknown> {
  const guests = Number.parseInt(c.guests, 10);
  return {
    name: c.clientNames.trim(),
    email: c.email.trim(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(c.dataIso) ? c.dataIso : "",
    location: c.location.trim(),
    guests: Number.isFinite(guests) && guests > 0 ? guests : 0,
    category: p.categoria || null,
    eventType: p.tipoDoPedido || null,
    notes: `Proposta antiga importada de «${nomeDoFicheiro}» a ${hojeEmTexto(hoje)}.`,
  };
}

/**
 * O rascunho do estúdio.
 *
 * @param carregadas caminho dentro do ficheiro → caminho no armazenamento. Uma
 *   fotografia que não está aqui (deixada de fora, ou que falhou) sai do
 *   documento — e um mood board que fique sem fotografias sai também: nada
 *   aparece no PDF que ela não tenha visto aqui.
 */
export function montarDocumento(
  p: PropostaImportada,
  c: Correccoes,
  carregadas: ReadonlyMap<string, string>,
  nomeDoFicheiro: string,
  hoje = new Date(),
): DocDoEstudio {
  const amounts = valoresQueVaoSerGravados(p, c).budgetAmounts;
  p = comServicosPostos(p, c);
  const total = totalEscrito(c.total);
  const modo = total !== null ? c.totalVatMode : null;
  // Os valores das linhas passam pelo que ELA escolheu — a mesma função do ecrã
  // (lá em cima, antes de juntar as linhas postas como serviço, que ela faz).
  const guests = Number.parseInt(c.guests, 10);
  const moodBoards: MoodBoard[] = p.moodBoards
    .map((b) => ({
      title: b.title,
      images: b.images.map((im) => carregadas.get(im)).filter((x): x is string => Boolean(x)),
    }))
    .filter((b) => b.images.length > 0);
  const capa = p.capa ? carregadas.get(p.capa) : undefined;

  const notas = [
    `Proposta importada de «${nomeDoFicheiro}» a ${hojeEmTexto(hoje)}.`,
    p.notasInternas
      ? `Texto do documento original que não ficou em nenhum campo:\n${p.notasInternas}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const doc: DocDoEstudio = {
    template: "decoracao",
    ref: "",
    clientNames: c.clientNames.trim(),
    eventType: c.eventType.trim(),
    eventDate: /^\d{4}-\d{2}-\d{2}$/.test(c.dataIso) ? dataDoEventoPorExtenso(c.dataIso) : "",
    location: c.location.trim(),
    guests: Number.isFinite(guests) && guests > 0 ? `${guests} pax` : "",
    ceremony: "",
    time: "",
    serviceGroups: p.serviceGroups.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i })) })),
    moodBoards,
    cronograma: [],
    budgetItems: [...p.budgetItems],
    ...(amounts.some((v) => v !== null) ? { budgetAmounts: amounts } : {}),
    ...(p.budgetOpcional?.some(Boolean) ? { budgetOpcional: [...p.budgetOpcional] } : {}),
    ...(typeof p.vatRate === "number" ? { vatRate: p.vatRate } : {}),
    budgetExtras: [],
    totalLabel: "Valor Total Decoração",
    totalText:
      total !== null && modo ? (modo === "acrescer" ? `${eur(total)} + IVA` : eur(total)) : "",
    ...(total !== null && modo ? { totalAmount: total, totalVatMode: modo } : {}),
    budgetRows: [],
    totalEstimatedText: "",
    budgetNote: "",
    coverImages: normaliseCoverImages(capa ? [capa] : []),
    notasInternas: notas,
  };
  doc.ref = referenciaDoDocumento(doc);
  return doc;
}
