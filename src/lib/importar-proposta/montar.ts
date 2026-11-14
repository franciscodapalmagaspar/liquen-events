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
import type { CandidataAoTotal, LinhaDoDocumento, PropostaImportada } from "./mapear";
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
  /** O modo do IVA dos valores do documento. Só muda por `escolherModoDoIva`. */
  totalVatMode: VatMode | null;
  /** Ela escreveu no campo do total À MÃO (apagar também conta). */
  totalTocado?: boolean;
  /** O documento tinha total e ela confirmou que a proposta fica sem ele. */
  semTotalConfirmado?: boolean;
  /**
   * A candidata ao total que ela escolheu (o `id`), «outro» (escreveu outro
   * valor) ou «soma» (usou a soma das linhas). Sem isto, o Criar espera.
   */
  totalEscolhido?: string;
  /** Via das regras: o interruptor dela, linha a linha (`LinhaDoDocumento.chave`). */
  servicoDaLinha?: Record<string, boolean>;
  /** O total veio do «Usar a soma das linhas». */
  somaUsada?: boolean;
  /** A taxa do IVA, em %, como ela a escreve («23», «6»). */
  taxa?: string;
  /** Ela confirmou a taxa sugerida pelo documento (ou escreveu a sua). */
  taxaConfirmada?: boolean;
}

/** Um aviso de dinheiro que nasce da conferência (com ou sem revisão). */
export interface AvisoDoEcra {
  id: string;
  texto: string;
  campo: string;
  dinheiro: true;
  gravidade: "erro";
}

const percentagem = (taxa: number) => String(Math.round(taxa * 10000) / 100).replace(".", ",");

/**
 * A taxa do IVA que vale: a do campo dela, entre 0 e 30 %. A do documento é só
 * a sugestão com que o campo começa (`correccoesIniciais`). Um campo que não
 * se lê («50», «abc», vazio) dá `null` — NUNCA cai em silêncio para 23 %:
 * `oQueFalta` pede «uma taxa entre 0 e 30%» e nada se converte nem grava.
 * (Sem campo nenhum — correcções antigas — vale a da casa.)
 */
export function taxaDe(c: Pick<Correccoes, "taxa">): number | null {
  if (c.taxa === undefined) return DEFAULT_VAT_RATE;
  const t = c.taxa.replace("%", "").replace(",", ".").trim();
  const n = Number(t);
  return t && Number.isFinite(n) && n >= 0 && n <= 30 ? Math.round(n * 100) / 10000 : null;
}

/** A taxa sugerida pelo documento, quando não é 23 % (as duas vias). */
export function taxaSugeridaDe(p: PropostaImportada): number | undefined {
  const t = p.taxaSugerida ?? p.vatRate;
  return t !== undefined && Math.abs(t - DEFAULT_VAT_RATE) > 1e-9 ? t : undefined;
}

/** A linha é um serviço? A escolha dela, senão a sugestão da heurística. */
export function eServico(l: LinhaDoDocumento, c: Pick<Correccoes, "servicoDaLinha">): boolean {
  // Um desconto nunca passa a serviço (seria +X € em vez de −X €): fica fora,
  // com o aviso «põe à mão», e não tem interruptor no ecrã.
  if (l.desconto) return false;
  return c.servicoDaLinha?.[l.chave] ?? l.servico;
}

/**
 * A proposta como ela a conferiu: na via das regras, as linhas do orçamento
 * são as que ELA deixou como serviço. Puro: o ecrã, o
 * `valoresQueVaoSerGravados` e o `montarDocumento` vêem as mesmas linhas.
 */
export function propostaConferida(p: PropostaImportada, c: Correccoes): PropostaImportada {
  if (!p.linhasDoDocumento) return p;
  const linhas = p.linhasDoDocumento.filter((l) => eServico(l, c));
  return {
    ...p,
    budgetItems: linhas.map((l) => l.rotulo),
    budgetAmounts: linhas.map(() => null),
    ...(linhas.some((l) => l.opcional)
      ? { budgetOpcional: linhas.map((l) => Boolean(l.opcional)) }
      : { budgetOpcional: undefined }),
    linhasEscritas: linhas.map((l) => l.valor),
    linhasNormais: linhas.map((l) => !l.opcional),
    somaDasLinhas: round2(linhas.filter((l) => !l.opcional).reduce((a, l) => a + l.valor, 0)),
  };
}

/** A soma dos SERVIÇOS (os que ela deixou como serviço; os opcionais não). */
export function somaDosServicos(p: PropostaImportada, c: Correccoes): number {
  return propostaConferida(p, c).somaDasLinhas;
}

/** «Usar a soma das linhas»: o total passa a ser a soma dos serviços. */
export function usarASoma(p: PropostaImportada, c: Correccoes): Correccoes {
  return {
    ...c,
    total: totalEmTexto(somaDosServicos(p, c)),
    totalTocado: true,
    totalEscolhido: "soma",
    somaUsada: true,
  };
}

/**
 * ── O TOTAL: TODAS AS CANDIDATAS, ORDENADAS, NADA ESCOLHIDO ──────────────
 * O par pela taxa (uma a × (1 + taxa) = outra, ao cêntimo) e o IVA que ela
 * escolheu só ORDENAM a lista e marcam a sugestão: «sem IVA» sugere o lado
 * sem do par, «com IVA» o lado com. Nunca escolhem.
 */
export function candidatasOrdenadas(
  p: PropostaImportada,
  c: Correccoes,
): (CandidataAoTotal & { sugerida: boolean })[] {
  const cands = p.candidatasAoTotal ?? [];
  const taxa = taxaDe(c);
  const valores = [...new Set(cands.map((x) => x.valor))].sort((a, b) => a - b);
  const pares: [number, number][] = [];
  for (let i = 0; taxa !== null && i < valores.length; i++) {
    for (let j = i + 1; j < valores.length; j++) {
      if (Math.round(valores[i] * (1 + taxa) * 100) === Math.round(valores[j] * 100)) {
        pares.push([valores[i], valores[j]]);
      }
    }
  }
  const par = pares.length === 1 ? pares[0] : null;
  const sugerido = par && c.totalVatMode ? (c.totalVatMode === "acrescer" ? par[0] : par[1]) : null;
  const peso = (x: CandidataAoTotal) =>
    x.valor === sugerido ? 0 : par && par.includes(x.valor) ? 1 : x.derivada ? 3 : 2;
  return cands
    .map((x, i) => ({ ...x, sugerida: x.valor === sugerido, i }))
    .sort((a, b) => peso(a) - peso(b) || a.i - b.i)
    .map(({ i: _i, ...x }) => x);
}

/** Ela escolhe uma candidata ao total (ou «outro valor», com `id` «outro»). */
export function escolherTotal(p: PropostaImportada, c: Correccoes, id: string): Correccoes {
  const cand = p.candidatasAoTotal?.find((x) => x.id === id);
  return {
    ...c,
    totalEscolhido: cand ? id : "outro",
    total: cand ? totalEmTexto(cand.valor) : c.totalEscolhido === "outro" ? c.total : "",
    totalTocado: !cand,
    somaUsada: false,
  };
}

/**
 * ── A ÚNICA MANEIRA DE ESCOLHER O IVA ─────────────────────────────────────
 * Muda só o modo. O total é escolhido à parte, por ela (`escolherTotal`).
 */
export function escolherModoDoIva(p: PropostaImportada, c: Correccoes, modo: VatMode): Correccoes {
  void p;
  return { ...c, totalVatMode: modo };
}

export function correccoesIniciais(p: PropostaImportada): Correccoes {
  const sugerida = taxaSugeridaDe(p);
  const escolhe = Boolean(p.candidatasAoTotal?.length);
  return {
    clientNames: p.clientNames,
    email: p.email,
    dataIso: p.dataIso,
    location: p.location,
    eventType: p.eventType,
    guests: p.guests ? String(p.guests) : "",
    // Com candidatas, nada vem escolhido: o campo fica vazio até ela escolher.
    total: escolhe ? "" : totalEmTexto(p.totalAmount),
    totalVatMode: p.totalVatMode,
    taxa: percentagem(sugerida ?? DEFAULT_VAT_RATE),
  };
}

/** Os campos da conferência dela: ficam todos ao reler o documento. */
const DA_CONFERENCIA = [
  "total",
  "totalVatMode",
  "totalTocado",
  "semTotalConfirmado",
  "totalEscolhido",
  "servicoDaLinha",
  "somaUsada",
  "taxa",
  "taxaConfirmada",
] as const;

/**
 * Ao reler o documento (com a leitura em JSON), o que ela já corrigiu fica:
 * os campos do evento que ela tocou e TODA a conferência do dinheiro. Uma
 * candidata escolhida que a leitura nova não tem passa a «outro valor», com
 * o mesmo total.
 */
export function juntarCorreccoes(
  inicialAntes: Correccoes,
  actual: Correccoes,
  novas: Correccoes,
  nova?: PropostaImportada,
): Correccoes {
  const out: Correccoes = { ...novas };
  const conferencia = new Set<string>(DA_CONFERENCIA);
  for (const k of Object.keys(novas) as (keyof Correccoes)[]) {
    if (conferencia.has(k)) continue;
    if (actual[k] !== inicialAntes[k]) (out as unknown as Record<string, unknown>)[k] = actual[k];
  }
  for (const k of DA_CONFERENCIA) {
    if (k === "total" || k === "taxa") continue;
    if (actual[k] !== undefined && actual[k] !== null) {
      (out as unknown as Record<string, unknown>)[k] = actual[k];
    }
  }
  if (actual.totalEscolhido !== undefined || actual.totalTocado) out.total = actual.total;
  if (actual.taxaConfirmada || actual.taxa !== inicialAntes.taxa) out.taxa = actual.taxa;
  if (
    out.totalEscolhido &&
    !["outro", "soma"].includes(out.totalEscolhido) &&
    nova &&
    !nova.candidatasAoTotal?.some(
      (x) => x.id === out.totalEscolhido && totalEmTexto(x.valor) === out.total,
    )
  ) {
    out.totalEscolhido = "outro";
    out.totalTocado = true;
  }
  return out;
}

/** O total escrito, em número; `null` quando está vazio ou não se lê. */
export function totalEscrito(texto: string): number | null {
  if (!/\d/.test(texto) || eNegativo(texto)) return null;
  // A mesma leitura do resto da casa (`parseMoneyText`).
  const n = parseMoneyText(texto);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** «-3000», «− 3000», «(3000)»: um total negativo — erro, nunca 3000. */
export function eNegativo(texto: string): boolean {
  return /^\s*[-−–]|^\s*\(.*\)\s*$/.test(texto);
}

/** O que ainda impede criar. Vazio = pode criar. */
export function oQueFalta(
  c: Correccoes,
  p?: Pick<
    PropostaImportada,
    "ivaPorEscolher" | "totalAmount" | "candidatasAoTotal" | "taxaSugerida" | "vatRate"
  >,
): string[] {
  const falta: string[] = [];
  const temCandidatas = Boolean(p?.candidatasAoTotal?.length);
  const escolheu = c.totalEscolhido !== undefined || c.totalTocado || c.semTotalConfirmado;
  if (temCandidatas && !escolheu) falta.push("escolher o total");
  // O IVA é SEMPRE ela que o diz — mesmo sem total. Uma vez só.
  const porEscolher = !c.totalVatMode && (p?.ivaPorEscolher || totalEscrito(c.total) !== null);
  // O documento tinha total e o campo ficou vazio: ou ela o escreve, ou diz
  // que a proposta fica mesmo sem total.
  if ((temCandidatas ? escolheu : Boolean(p?.totalAmount)) && !c.total.trim()) {
    if (!c.semTotalConfirmado) {
      falta.push("o total (o documento tem total — escreve-o ou confirma que fica sem total)");
    }
  }
  if (porEscolher) {
    falta.push(
      p?.ivaPorEscolher
        ? "escolher se os valores do documento têm IVA"
        : "dizer se o total inclui IVA",
    );
  }
  // A taxa só se pede quando há dinheiro — e então o campo está à vista
  // (`ImportarProposta`: com IVA a escolher, total, linhas, ou sugestão).
  const haDinheiro = Boolean(p?.ivaPorEscolher) || totalEscrito(c.total) !== null;
  if (haDinheiro && taxaDe(c) === null) falta.push("uma taxa entre 0 e 30%");
  const sugerida = p ? (p.taxaSugerida ?? p.vatRate) : undefined;
  if (
    haDinheiro &&
    sugerida !== undefined &&
    Math.abs(sugerida - DEFAULT_VAT_RATE) > 1e-9 &&
    !c.taxaConfirmada
  ) {
    falta.push(`confirmar a taxa do IVA (o documento sugere ${percentagem(sugerida)}%)`);
  }
  if (!c.clientNames.trim()) falta.push("o nome do cliente");
  if (eNegativo(c.total)) falta.push("o total não pode ser negativo");
  else if (c.total.trim() && totalEscrito(c.total) === null) falta.push("um total que se leia");
  return falta;
}

/**
 * ── DEPOIS DA ESCOLHA: AS LINHAS SOMAM O TOTAL? ───────────────────────────
 * As linhas convertidas (sem IVA) contra a base do total gravado, ao cêntimo
 * (`resolveProposalMoney`). Se não batem, é um aviso de dinheiro — e, na via
 * das regras, sugere o interruptor da linha suspeita (a que tem a diferença).
 */
export function avisoDaSomaGravada(p: PropostaImportada, c: Correccoes): AvisoDoEcra | null {
  if (!c.totalVatMode) return null;
  const pc = propostaConferida(p, c);
  const g = valoresQueVaoSerGravados(p, c);
  if (g.totalAmount === null || !g.totalVatMode) return null;
  const normais = pc.linhasNormais ?? g.budgetAmounts.map((_, i) => !pc.budgetOpcional?.[i]);
  const vals = g.budgetAmounts.filter((v, i): v is number => v !== null && normais[i] !== false);
  if (!vals.length) return null;
  const soma = round2(vals.reduce((a, b) => a + b, 0));
  const taxa = taxaDe(c);
  if (taxa === null) return null;
  const base = resolveProposalMoney({
    totalAmount: g.totalAmount,
    totalVatMode: g.totalVatMode,
    vatRate: taxa,
  }).base;
  if (soma === base) return null;
  // A linha suspeita: a que, sem IVA, vale a diferença.
  const semIva = (v: number) => (c.totalVatMode === "incluido" ? round2(v / (1 + taxa)) : v);
  const perto = (a: number, b: number) => Math.abs(a - b) <= 0.01;
  const linhas = p.linhasDoDocumento ?? [];
  const aMais = linhas.find(
    (l) => eServico(l, c) && !l.opcional && perto(semIva(l.valor), soma - base),
  );
  const aMenos = linhas.find((l) => !eServico(l, c) && perto(semIva(l.valor), base - soma));
  const dica = aMais
    ? ` Talvez «${aMais.rotulo}» não seja um serviço.`
    : aMenos
      ? ` Talvez «${aMenos.rotulo}» seja um serviço.`
      : "";
  return {
    id: `soma-depois:${soma}:${base}`,
    campo: "orcamento.total",
    dinheiro: true,
    gravidade: "erro",
    texto: `Com o IVA que escolheste, as linhas somam ${eur(soma)} — o total é ${eur(base)} sem IVA.${dica}`,
  };
}

/**
 * Ela usou a soma dos serviços como total, mas o documento tem um total
 * diferente: aviso de dinheiro, para ela confirmar qual vale.
 */
export function avisoDaSomaUsada(p: PropostaImportada, c: Correccoes): AvisoDoEcra | null {
  if (!c.somaUsada) return null;
  const soma = totalEscrito(c.total);
  const doDocumento = [...new Set((p.candidatasAoTotal ?? []).map((x) => x.valor))];
  if (soma === null || !doDocumento.length || doDocumento.includes(soma)) return null;
  return {
    id: `soma-usada:${soma}:${doDocumento.join("|")}`,
    campo: "orcamento.total",
    dinheiro: true,
    gravidade: "erro",
    texto: `Usaste a soma das linhas (${eur(soma)}), mas o documento tem ${doDocumento.length === 1 ? "um total de" : "os totais"} ${doDocumento.map((v) => eur(v)).join(", ")}.`,
  };
}

/**
 * Via das regras: um desconto não entra no orçamento (as linhas não levam
 * valores negativos) — aviso de dinheiro, como o da leitura (`ia/verificar.ts`).
 */
export function avisosDosDescontos(p: PropostaImportada, c?: Correccoes): AvisoDoEcra[] {
  return (p.linhasDoDocumento ?? []).flatMap((l) =>
    l.desconto && !(c && eServico(l, c))
      ? [
          {
            id: `desconto-regras:${l.chave}`,
            campo: "orcamento.total",
            dinheiro: true as const,
            gravidade: "erro" as const,
            texto: `«${l.rotulo}»: desconto de ${eur(l.valor)} — põe à mão no Fazer proposta.`,
          },
        ]
      : [],
  );
}

/** Os avisos de dinheiro que nascem do que ela faz no ecrã (com ou sem revisão). */
export function avisosDoEcra(p: PropostaImportada, c: Correccoes): AvisoDoEcra[] {
  return [...avisosDosDescontos(p, c), avisoDaSomaGravada(p, c), avisoDaSomaUsada(p, c)].filter(
    (a): a is AvisoDoEcra => a !== null,
  );
}

/** O total em texto, como o campo do ecrã o escreve. */
export function totalEmTexto(n: number | null): string {
  return n ? n.toFixed(2).replace(".", ",") : "";
}

/**
 * ── O QUE VAI SER GRAVADO, NUMA FUNÇÃO SÓ ─────────────────────────────────
 * Os valores sem IVA das linhas, o total e o modo, a partir do que se leu e do
 * que ela conferiu. O ecrã mostra ISTO e o `montarDocumento` grava ISTO: os
 * dois nunca podem discordar.
 */
export function valoresQueVaoSerGravados(
  p: PropostaImportada,
  c: Correccoes,
): { budgetAmounts: (number | null)[]; totalAmount: number | null; totalVatMode: VatMode | null } {
  p = propostaConferida(p, c);
  const taxa = taxaDe(c);
  const total = totalEscrito(c.total);
  const modo = total !== null ? c.totalVatMode : null;
  const budgetAmounts =
    p.ivaPorEscolher && p.linhasEscritas
      ? c.totalVatMode && taxa !== null
        ? valoresSemIvaDasLinhas(
            p.linhasEscritas,
            p.linhasNormais ?? p.linhasEscritas.map(() => true),
            c.totalVatMode,
            taxa,
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
  p = propostaConferida(p, c);
  const taxa = taxaDe(c);
  // `oQueFalta` não deixa chegar aqui com uma taxa que não se lê.
  if (taxa === null) throw new Error("A taxa do IVA não se lê: corrige-a antes de criar.");
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
    ...(Math.abs(taxa - DEFAULT_VAT_RATE) > 1e-9 ? { vatRate: taxa } : {}),
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
