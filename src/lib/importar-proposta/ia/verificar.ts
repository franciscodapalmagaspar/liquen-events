import { DEFAULT_VAT_RATE, resolveProposalMoney } from "../../proposal-doc";
import { eur, round2 } from "../../money";
import { datasDaLinha, semAcentos } from "../heuristicas";
import type { DocumentoCompleto, UnidadeLida } from "../documento-completo";
import type { Leitura, LinhaLida } from "./esquema";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * VERIFICAR — REGRAS FIXAS, SEM IA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A IA percebe o documento; as contas e as provas fazem-se aqui, sempre da
 * mesma maneira, com as regras de dinheiro que a casa já tem
 * (`resolveProposalMoney`, `round2`, `DEFAULT_VAT_RATE`). Seis verificações:
 *
 *  (a) cada citação, e cada texto literal, existe MESMO no documento (a
 *      comparação é normalizada: maiúsculas, espaços, aspas, travessões);
 *      e cada valor está dentro da sua citação;
 *  (b) cada valor em € escrito no documento está numa linha, num total, ou
 *      listado como «não usado» com o motivo;
 *  (c) quantidade × preço = total da linha; as linhas somam o total ao
 *      cêntimo; o total sem IVA e o com IVA batem pela taxa;
 *  (d) todas as imagens têm destino (e só uma capa);
 *  (e) todo o parágrafo com conteúdo está num campo, ou listado como «não
 *      colocado»;
 *  (f) a data é uma data a sério, e está na citação.
 *
 * O que falha a (a) ou a (f) — um valor inventado — SAI da leitura limpa:
 * nunca chega à proposta. O resto fica, com o aviso ao lado. Os avisos que
 * mexem em dinheiro (`dinheiro: true`) têm de ser confirmados por ela antes
 * de a proposta se criar.
 */

export interface Aviso {
  /** Estável entre leituras do mesmo documento (serve de chave à confirmação). */
  id: string;
  texto: string;
  /** Onde vai no ecrã: `evento.data`, `orcamento.linhas.2`, `orcamento.total`, `imagens`… */
  campo: string;
  dinheiro: boolean;
  gravidade: "erro" | "aviso";
}

export interface ValorDoDocumento {
  unidade: string;
  valor: number;
  trecho: string;
  usado: "linha" | "total" | "nao-usado" | null;
  motivo?: string;
}

export interface Contas {
  vatRate: number;
  /** A soma das linhas normais com valor (no modo das linhas), ou null sem valores. */
  somaDasLinhas: number | null;
  linhasSemValor: number;
  /** O modo das linhas CONFIRMADO no documento (sem confirmação: «desconhecido», e os valores não passam). */
  modoDasLinhas: "sem_iva" | "com_iva" | "desconhecido";
  /** O modo do total CONFIRMADO no documento («sem_iva» também quando tem os dois totais). */
  modoDoTotal: "sem_iva" | "com_iva" | "desconhecido";
}

export interface Verificacao {
  leitura: Leitura;
  avisos: Aviso[];
  valores: ValorDoDocumento[];
  naoColocados: { id: string; texto: string; parte: string; motivo: string | null }[];
  contas: Contas;
  /** Quantos valores ou textos inventados saíram da leitura. */
  inventados: number;
}

// ── Normalizar ───────────────────────────────────────────────────────────────

export function normalizar(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[­​-‍﻿]/g, "")
    .replace(/[‘’‚‛´`]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[⏎|]/g, " ")
    .replace(/[\s ]+/g, " ")
    .toLowerCase()
    .trim();
}

/** Uma linha de um texto, sem o marcador de lista da ponta. */
function segmentos(texto: string): string[] {
  return texto
    .split(/\n|⏎/)
    .map((s) =>
      normalizar(s)
        .replace(/^[•·\-*–—▪◦●○■□✓✔>]+\s*/, "")
        .replace(/\s*[:;]$/, ""),
    )
    .filter((s) => s.length > 0);
}

function textoDaUnidade(u: UnidadeLida): string {
  if (u.tipo === "paragrafo") return u.texto;
  if (u.tipo === "linha-de-tabela") return u.celulas.join(" | ");
  return [u.descricao, u.legenda].filter(Boolean).join(" ");
}

function nomeDaParte(d: DocumentoCompleto, parte: string): string {
  return d.partes.find((p) => p.id === parte)?.nome ?? parte;
}

function curto(s: string, n = 90): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

// ── Números ──────────────────────────────────────────────────────────────────

/**
 * Um número INTEIRO à portuguesa, num texto já normalizado: milhares com «.»
 * ou com espaço, decimais com «,». Nunca um bocado de outro número: «740»
 * não é um token de «1.740,00», nem «250» de «1 250,00», nem «7» de «2027».
 */
const TOKEN =
  /(?<![\d.,])(?:\d{1,3}(?:\.\d{3})+|\d{1,3}(?: \d{3})+(?!\d)|\d+)(?:,\d{1,2})?(?!\d|[.,]\d)/g;

export interface Token {
  valor: number;
  ini: number;
  fim: number;
  texto: string;
}

export function tokensDe(normalizado: string): Token[] {
  const out: Token[] = [];
  for (const m of normalizado.matchAll(TOKEN)) {
    const [inteiro, dec = ""] = m[0].split(",");
    const valor = Number(`${inteiro.replace(/[. ]/g, "")}.${dec || "0"}`);
    if (Number.isFinite(valor)) {
      out.push({ valor: round2(valor), ini: m.index!, fim: m.index! + m[0].length, texto: m[0] });
    }
  }
  return out;
}

/** Os valores dos tokens de um texto (normaliza primeiro). */
export function numerosDe(texto: string): number[] {
  return tokensDe(normalizar(texto)).map((t) => t.valor);
}

const CABECA_DE_DINHEIRO = /€|eur\b|euros|pre[cç]o|valor|total|montante|custo|investimento/i;
const EURO_DEPOIS = /^\s?(?:€|eur\b|euros?\b)/;
const EURO_ANTES = /(?:€|eur)\s?$/;

/** Os valores em euros de uma unidade (texto normalizado), com a posição. */
function valoresEmEuros(
  u: UnidadeLida,
  n: string,
  tabelaComDinheiro: boolean,
): { valor: number; trecho: string }[] {
  const out: { valor: number; trecho: string }[] = [];
  for (const t of tokensDe(n)) {
    if (!(t.valor > 0)) continue;
    const euro =
      EURO_DEPOIS.test(n.slice(t.fim, t.fim + 7)) ||
      EURO_ANTES.test(n.slice(Math.max(0, t.ini - 5), t.ini));
    // Numa tabela de preços, as células sem «€» mas com cara de dinheiro.
    const naTabela =
      u.tipo === "linha-de-tabela" &&
      tabelaComDinheiro &&
      u.linha > 0 &&
      /,\d{2}$|\./.test(t.texto) &&
      !/%/.test(n.slice(t.fim, t.fim + 2));
    if (euro || naTabela)
      out.push({ valor: t.valor, trecho: n.slice(Math.max(0, t.ini - 30), t.fim + 6).trim() });
  }
  return out;
}

const COM_IVA =
  /iva\s*inclu|c\/\s*iva|com\s+(?:o\s+)?iva|inclu(?:i|em|indo|ido|idos)\s+(?:o\s+)?iva|iva\s+incl/;
const SEM_IVA =
  /\+\s*iva|mais\s+iva|acresc\w*\s+(?:de\s+|o\s+)*iva|iva\s+a\s+acrescer|s\/\s*iva|sem\s+(?:o\s+)?iva|iva\s+nao\s+inclu|nao\s+inclu\w*\s+(?:o\s+)?iva/;
export function dizComIva(t: string): boolean {
  return COM_IVA.test(semAcentos(t));
}
export function dizSemIva(t: string): boolean {
  return SEM_IVA.test(semAcentos(t));
}

// ── A verificação ────────────────────────────────────────────────────────────

export function verificar(d: DocumentoCompleto, entrada: Leitura): Verificacao {
  const leitura: Leitura = structuredClone(entrada);
  const avisos: Aviso[] = [];
  let inventados = 0;
  const aviso = (a: Aviso) => {
    if (!avisos.some((x) => x.id === a.id)) avisos.push(a);
  };

  const unidades = d.unidades;
  const normDe = new Map(unidades.map((u) => [u.id, normalizar(textoDaUnidade(u))]));
  const tokensDaUnidade = new Map(unidades.map((u) => [u.id, tokensDe(normDe.get(u.id)!)]));
  /** Cada linha do texto está, contígua, dentro de UMA unidade (não a saltar de uma para a outra). */
  const existe = (texto: string): boolean => {
    const ss = segmentos(texto);
    return ss.length > 0 && ss.every((s) => unidades.some((u) => normDe.get(u.id)!.includes(s)));
  };
  const normCitacao = (c: string) =>
    normalizar(c)
      .replace(/^[•·\-*▪◦●○■□✓✔>]+\s*/, "")
      .replace(/\s*[:;]$/, "");
  /** As unidades onde a citação inteira está, contígua, e onde. */
  const ocorrencias = (c: string): { u: UnidadeLida; k: number; fim: number }[] => {
    const x = normCitacao(c);
    if (!x) return [];
    const out: { u: UnidadeLida; k: number; fim: number }[] = [];
    for (const u of unidades) {
      const n = normDe.get(u.id)!;
      for (let k = n.indexOf(x); k >= 0; k = n.indexOf(x, k + 1))
        out.push({ u, k, fim: k + x.length });
    }
    return out;
  };
  const citacaoNumaUnidade = (c: string | null): boolean => Boolean(c && ocorrencias(c).length);
  /**
   * As unidades onde o valor é um token INTEIRO dentro da citação (e a citação
   * está, inteira, nessa unidade). Vazio = o valor não está onde a citação diz.
   */
  const ligar = (valor: number, c: string, comPercentagem = false): string[] => {
    const v = round2(valor);
    const ids = new Set<string>();
    for (const o of ocorrencias(c)) {
      const n = normDe.get(o.u.id)!;
      for (const t of tokensDaUnidade.get(o.u.id)!) {
        if (t.valor !== v || t.ini < o.k || t.fim > o.fim) continue;
        if (comPercentagem && !/^\s?%/.test(n.slice(t.fim, t.fim + 2))) continue;
        ids.add(o.u.id);
      }
    }
    return [...ids];
  };
  /** O que cada campo de dinheiro prende no documento: unidade e valor. */
  const ligacoes: { valor: number; unidades: string[]; usado: "linha" | "total" }[] = [];

  // ── (a) Os textos literais ──
  const literal = (
    valor: string | null,
    campo: string,
    nome: string,
    dinheiro = false,
  ): string | null => {
    if (valor === null || !valor.trim()) return null;
    if (existe(valor)) return valor;
    inventados++;
    aviso({
      id: `inventado:${campo}`,
      campo,
      dinheiro,
      gravidade: "erro",
      texto: `${nome} «${curto(valor)}» não está no documento — ficou de fora.`,
    });
    return null;
  };

  leitura.cliente.nomes = literal(leitura.cliente.nomes, "cliente.nomes", "O nome");
  leitura.cliente.email = literal(leitura.cliente.email, "cliente.email", "O e-mail");
  leitura.cliente.telefone = literal(leitura.cliente.telefone, "cliente.telefone", "O telefone");
  leitura.evento.local = literal(leitura.evento.local, "evento.local", "O local");

  leitura.servicos = leitura.servicos.map((g, gi) => ({
    titulo: literal(g.titulo, `servicos.${gi}`, "O título do grupo"),
    itens: g.itens
      .map((it, ii) => ({
        titulo: literal(it.titulo, `servicos.${gi}.${ii}.titulo`, "O item"),
        descricao: literal(it.descricao, `servicos.${gi}.${ii}.descricao`, "A descrição"),
        subitens: it.subitens
          .map((s, si) => ({
            titulo: literal(s.titulo, `servicos.${gi}.${ii}.${si}.titulo`, "O subitem"),
            descricao: literal(s.descricao, `servicos.${gi}.${ii}.${si}.descricao`, "A descrição"),
          }))
          .filter((s) => s.titulo || s.descricao),
      }))
      .filter((it) => it.titulo || it.descricao || it.subitens.length),
  }));
  leitura.notas = leitura.notas.filter((n, i) => literal(n.texto, `notas.${i}`, "A nota") !== null);

  // ── (a) Os valores citados ──
  type Citado = { valor: number | null; citacao: string | null };
  const numeroCitado = (
    c: Citado,
    campo: string,
    nome: string,
    dinheiro: boolean,
    usado?: "linha" | "total",
  ): Citado => {
    if (c.valor === null) return { valor: null, citacao: c.citacao };
    const falha = (porque: string) => {
      inventados++;
      aviso({
        id: `inventado:${campo}`,
        campo,
        dinheiro,
        gravidade: "erro",
        texto: `${nome} (${dinheiro ? eur(c.valor!) : c.valor}) ${porque} — não foi preenchido.`,
      });
      return { valor: null, citacao: null };
    };
    if (!c.citacao || !c.citacao.trim()) return falha("não diz de onde veio");
    if (!citacaoNumaUnidade(c.citacao))
      return falha(`vem de «${curto(c.citacao, 60)}», que não está no documento`);
    const onde = ligar(c.valor, c.citacao);
    if (!onde.length) return falha(`não está escrito em «${curto(c.citacao, 60)}»`);
    if (usado) ligacoes.push({ valor: round2(c.valor), unidades: onde, usado });
    return c;
  };

  const ev = leitura.evento;
  ev.convidados = numeroCitado(ev.convidados, "evento.convidados", "O número de convidados", false);
  if (ev.tipo.valor !== null) {
    const ok =
      ev.tipo.citacao &&
      citacaoNumaUnidade(ev.tipo.citacao) &&
      semAcentos(ev.tipo.citacao).includes(semAcentos(ev.tipo.valor).split(/\s+/)[0].slice(0, 6));
    if (!ok) {
      inventados++;
      aviso({
        id: "inventado:evento.tipo",
        campo: "evento.tipo",
        dinheiro: false,
        gravidade: "erro",
        texto: `O tipo de evento «${ev.tipo.valor}» não se confirma no documento — ficou por preencher.`,
      });
      ev.tipo = { valor: null, citacao: null };
    }
  }

  // ── (f) A data ──
  if (ev.data.valor !== null) {
    const iso = ev.data.valor;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    const real =
      m &&
      Number(m[1]) >= 2000 &&
      Number(m[1]) <= 2100 &&
      new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toISOString().slice(0, 10) === iso;
    let porque = "";
    if (!real) porque = "não é uma data válida";
    else if (!citacaoNumaUnidade(ev.data.citacao)) porque = "não vem de um sítio do documento";
    else {
      const datas = datasDaLinha(ev.data.citacao!);
      const nums = normalizar(ev.data.citacao!)
        .split(/[^\d]+/)
        .filter(Boolean)
        .map(Number);
      const dia = Number(m![3]);
      const ano = Number(m![1]);
      const bate =
        datas.includes(iso) ||
        (nums.includes(dia) && (nums.includes(ano) || nums.includes(ano % 100)));
      if (!bate) porque = `não está escrita em «${curto(ev.data.citacao!, 60)}»`;
    }
    if (porque) {
      inventados++;
      aviso({
        id: "inventado:evento.data",
        campo: "evento.data",
        dinheiro: false,
        gravidade: "erro",
        texto: `A data ${iso} ${porque} — ficou por preencher.`,
      });
      ev.data = { valor: null, citacao: null };
    }
  }

  // ── O dinheiro ──
  const o = leitura.orcamento;
  // A taxa: o número com «%» colado, e «IVA» na MESMA unidade. Uma taxa que
  // não seja a da casa é sempre um aviso de dinheiro.
  if (o.iva.taxa.valor !== null) {
    const t = o.iva.taxa;
    const onde = t.citacao ? ligar(t.valor!, t.citacao, true) : [];
    const comIva = onde.filter((id) => /\biva\b/.test(normDe.get(id)!));
    if (!comIva.length) {
      inventados++;
      aviso({
        id: "inventado:orcamento.iva",
        campo: "orcamento.iva",
        dinheiro: true,
        gravidade: "erro",
        texto: `A taxa de IVA (${t.valor}%) não está escrita como «${t.valor}%» ao lado da palavra IVA${t.citacao ? ` em «${curto(t.citacao, 60)}»` : ""} — ficou a da casa (${DEFAULT_VAT_RATE * 100}%).`,
      });
      o.iva.taxa = { valor: null, citacao: null };
    }
  }
  const taxaLida = o.iva.taxa.valor;
  let vatRate = DEFAULT_VAT_RATE;
  if (taxaLida !== null) {
    if (taxaLida >= 0 && taxaLida <= 30) {
      vatRate = round2(taxaLida) / 100;
      if (round2(taxaLida) !== round2(DEFAULT_VAT_RATE * 100)) {
        aviso({
          id: "iva:taxa-diferente",
          campo: "orcamento.iva",
          dinheiro: true,
          gravidade: "aviso",
          texto: `O documento usa IVA a ${taxaLida}%, e não a ${DEFAULT_VAT_RATE * 100}% da casa. A proposta nova fica com ${taxaLida}%: confirma que ainda é a taxa certa.`,
        });
      }
    } else {
      aviso({
        id: "iva:taxa-estranha",
        campo: "orcamento.iva",
        dinheiro: true,
        gravidade: "erro",
        texto: `A taxa de IVA lida (${taxaLida}%) não é uma taxa de IVA. Ficou a da casa (${DEFAULT_VAT_RATE * 100}%).`,
      });
    }
  }
  o.totalSemIva = numeroCitado(o.totalSemIva, "orcamento.total", "O total sem IVA", true, "total");
  o.valorDoIva = numeroCitado(o.valorDoIva, "orcamento.total", "O valor do IVA", true, "total");
  o.totalComIva = numeroCitado(o.totalComIva, "orcamento.total", "O total com IVA", true, "total");

  o.linhas = o.linhas.map((l, i): LinhaLida => {
    const campo = `orcamento.linhas.${i}`;
    const nome = l.descricao ? `A linha «${curto(l.descricao, 40)}»` : `A linha ${i + 1}`;
    return {
      descricao: literal(l.descricao, campo, "A linha do orçamento", true),
      quantidade: numeroCitado(l.quantidade, campo, `${nome}: a quantidade`, true),
      precoUnitario: numeroCitado(
        l.precoUnitario,
        campo,
        `${nome}: o preço unitário`,
        true,
        "linha",
      ),
      totalDaLinha: numeroCitado(l.totalDaLinha, campo, `${nome}: o total`, true, "linha"),
      tipo: l.tipo,
    };
  });
  const naoUsadosLigados: { valor: number; unidades: string[]; motivo: string }[] = [];
  o.valoresNaoUsados = o.valoresNaoUsados.filter((v) => {
    const onde = ligar(v.valor, v.citacao);
    if (onde.length) {
      naoUsadosLigados.push({ valor: round2(v.valor), unidades: onde, motivo: v.motivo });
      return true;
    }
    aviso({
      id: `inventado:nao-usado:${round2(v.valor)}`,
      campo: "orcamento",
      dinheiro: true,
      gravidade: "erro",
      texto: `A leitura diz que ${eur(v.valor)} ficou de fora («${curto(v.motivo, 50)}»), mas esse valor não está onde diz.`,
    });
    return false;
  });

  // ── (c) Cada linha, e a soma ──
  const valorDaLinha = (l: LinhaLida): number | null => {
    if (l.totalDaLinha.valor !== null) return l.totalDaLinha.valor;
    if (l.precoUnitario.valor === null) return null;
    const q = l.quantidade.valor ?? 1;
    return round2(q * l.precoUnitario.valor);
  };
  o.linhas.forEach((l, i) => {
    const q = l.quantidade.valor;
    const p = l.precoUnitario.valor;
    const t = l.totalDaLinha.valor;
    if (q !== null && p !== null && t !== null && round2(q * p) !== round2(t)) {
      aviso({
        id: `conta:linha:${i}`,
        campo: `orcamento.linhas.${i}`,
        dinheiro: true,
        gravidade: "erro",
        texto: `A linha «${curto(l.descricao ?? `${i + 1}`, 40)}» diz ${q} × ${eur(p)} = ${eur(t)}, mas ${q} × ${eur(p)} são ${eur(round2(q * p))}.`,
      });
    }
  });
  const normais = o.linhas.filter((l) => l.tipo === "normal");
  const comValor = normais.map(valorDaLinha).filter((v): v is number => v !== null);
  const linhasSemValor = normais.length - comValor.length;
  const soma = comValor.length ? round2(comValor.reduce((a, b) => a + b, 0)) : null;

  const base = o.totalSemIva.valor;
  const bruto = o.totalComIva.valor;
  const ivaEscrito = o.valorDoIva.valor;
  // O total no outro modo, pela regra da casa — nunca uma conta à parte.
  const baseDoBruto = (g: number) =>
    resolveProposalMoney({ totalAmount: g, totalVatMode: "incluido", vatRate }).base;
  const brutoDaBase = (b: number) =>
    resolveProposalMoney({ totalAmount: b, totalVatMode: "acrescer", vatRate }).gross;

  if (base !== null && bruto !== null) {
    const bate = brutoDaBase(base) === round2(bruto) || baseDoBruto(bruto) === round2(base);
    if (!bate) {
      aviso({
        id: "conta:base-e-bruto",
        campo: "orcamento.total",
        dinheiro: true,
        gravidade: "erro",
        texto:
          taxaLida === null
            ? `O total sem IVA (${eur(base)}) e o total com IVA (${eur(bruto)}) não batem com o IVA a ${vatRate * 100}%, e o documento não escreve a taxa (os totais dão ${round2((bruto / base - 1) * 100)}%).`
            : `O total sem IVA (${eur(base)}) e o total com IVA (${eur(bruto)}) não batem com o IVA a ${vatRate * 100}%: ${eur(base)} + IVA são ${eur(brutoDaBase(base))}.`,
      });
    }
  }
  if (
    ivaEscrito !== null &&
    base !== null &&
    bruto !== null &&
    round2(base + ivaEscrito) !== round2(bruto)
  ) {
    aviso({
      id: "conta:iva",
      campo: "orcamento.total",
      dinheiro: true,
      gravidade: "erro",
      texto: `${eur(base)} + IVA de ${eur(ivaEscrito)} são ${eur(round2(base + ivaEscrito))}, mas o documento diz ${eur(bruto)} com IVA.`,
    });
  }

  // ── O modo do IVA: tem de estar ESCRITO, e não pode contradizer o sítio dos valores ──
  type Modo = "sem_iva" | "com_iva" | "desconhecido";
  const dizOutro = (modo: "sem_iva" | "com_iva", id: string) => {
    const n = normDe.get(id)!;
    return modo === "sem_iva" ? dizComIva(n) && !dizSemIva(n) : dizSemIva(n) && !dizComIva(n);
  };
  const contradicao = (modo: "sem_iva" | "com_iva", ids: string[], campo: string, oQue: string) => {
    const mau = ids.find((id) => dizOutro(modo, id));
    if (!mau) return false;
    const u = unidades.find((x) => x.id === mau)!;
    aviso({
      id: `iva:contradicao:${campo}`,
      campo,
      dinheiro: true,
      gravidade: "erro",
      texto: `A leitura pôs ${oQue} ${modo === "sem_iva" ? "SEM IVA" : "COM IVA"}, mas o documento diz «${curto(textoDaUnidade(u), 70)}». Assim ${modo === "sem_iva" ? "o IVA seria cobrado duas vezes" : "o IVA ficava por cobrar"}. O IVA fica por escolher.`,
    });
    return true;
  };
  const modoEscrito = (
    m: { valor: Modo; citacao: string | null },
    campo: string,
    oQue: string,
  ): Modo => {
    if (m.valor === "desconhecido") return "desconhecido";
    const diz = m.valor === "sem_iva" ? dizSemIva : dizComIva;
    if (m.citacao && citacaoNumaUnidade(m.citacao) && diz(normalizar(m.citacao))) return m.valor;
    aviso({
      id: `iva:sem-citacao:${campo}`,
      campo,
      dinheiro: true,
      gravidade: "erro",
      texto: `A leitura diz que ${oQue} ${m.valor === "sem_iva" ? "não têm IVA" : "já têm IVA"}, mas não mostra onde o documento o escreve${m.citacao ? ` («${curto(m.citacao, 50)}» não o diz)` : ""}. O IVA fica por escolher.`,
    });
    return "desconhecido";
  };
  const unidadesDe = (v: { citacao: string | null; valor: number | null }) =>
    v.valor !== null && v.citacao ? ligar(v.valor, v.citacao) : [];

  // O total.
  const contraSem =
    base !== null &&
    contradicao("sem_iva", unidadesDe(o.totalSemIva), "orcamento.total", `o total (${eur(base)})`);
  const contraCom =
    bruto !== null &&
    contradicao("com_iva", unidadesDe(o.totalComIva), "orcamento.total", `o total (${eur(bruto)})`);
  let modoDoTotal: Modo = "desconhecido";
  if (!contraSem && !contraCom) {
    if (base !== null && bruto !== null) modoDoTotal = "sem_iva";
    else if (base !== null || bruto !== null) {
      const escrito = modoEscrito(o.iva.valoresDoTotal, "orcamento.iva", "os valores do total");
      const doCampo: Modo = base !== null ? "sem_iva" : "com_iva";
      if (escrito !== "desconhecido" && escrito !== doCampo) {
        aviso({
          id: "iva:contradicao:campo-do-total",
          campo: "orcamento.total",
          dinheiro: true,
          gravidade: "erro",
          texto: `A leitura pôs o total ${eur((base ?? bruto)!)} como ${base !== null ? "SEM" : "COM"} IVA, mas diz que o total ${escrito === "sem_iva" ? "não tem" : "tem"} IVA. O IVA fica por escolher.`,
        });
      } else if (escrito === doCampo) modoDoTotal = doCampo;
    }
  }
  if ((base !== null || bruto !== null) && modoDoTotal === "desconhecido") {
    aviso({
      id: "iva:total",
      campo: "orcamento.total",
      dinheiro: true,
      gravidade: "erro",
      texto: `Não se confirmou no documento se o total (${eur((base ?? bruto)!)}) inclui IVA. Escolhe abaixo se acresce ou se está incluído.`,
    });
  }

  // As linhas.
  const temValores = o.linhas.some(
    (l) => l.totalDaLinha.valor !== null || l.precoUnitario.valor !== null,
  );
  let modoDasLinhas: Modo = "desconhecido";
  if (temValores) {
    const escrito = modoEscrito(o.iva.valoresDasLinhas, "orcamento", "os valores das linhas");
    const ids = o.linhas.flatMap((l) => [
      ...unidadesDe(l.totalDaLinha),
      ...unidadesDe(l.precoUnitario),
    ]);
    if (
      escrito !== "desconhecido" &&
      !contradicao(escrito, ids, "orcamento", "os valores das linhas")
    ) {
      modoDasLinhas = escrito;
    }
    if (modoDasLinhas === "desconhecido") {
      aviso({
        id: "iva:linhas",
        campo: "orcamento",
        dinheiro: true,
        gravidade: "erro",
        texto:
          "Não se confirmou no documento se os valores das linhas têm IVA. Os valores das linhas NÃO passam para a proposta nova (só as descrições): escreve-os no Fazer proposta.",
      });
    }
  }

  if (soma !== null) {
    // O total a comparar, no modo das linhas; sem modo, o que bater (só para avisar).
    const alvoSem = base ?? (bruto !== null ? baseDoBruto(bruto) : null);
    const alvoCom = bruto ?? (base !== null ? brutoDaBase(base) : null);
    const alvo =
      modoDasLinhas === "sem_iva"
        ? alvoSem
        : modoDasLinhas === "com_iva"
          ? alvoCom
          : alvoSem !== null && soma === alvoSem
            ? alvoSem
            : alvoCom !== null && soma === alvoCom
              ? alvoCom
              : (alvoSem ?? alvoCom);

    if (alvo === null) {
      aviso({
        id: "conta:sem-total",
        campo: "orcamento.total",
        dinheiro: true,
        gravidade: "aviso",
        texto: `O documento não escreve um total. As linhas somam ${eur(soma)}.`,
      });
    } else if (round2(alvo) !== soma) {
      const dif = round2(alvo - soma);
      const quando =
        linhasSemValor > 0
          ? ` (e ${linhasSemValor === 1 ? "há uma linha" : `há ${linhasSemValor} linhas`} sem valor)`
          : "";
      aviso({
        id: "conta:soma",
        campo: "orcamento.total",
        dinheiro: true,
        gravidade: "erro",
        texto:
          dif > 0
            ? `O total do documento diz ${eur(alvo)}, as linhas somam ${eur(soma)}${quando} — falta uma linha de ${eur(dif)}?`
            : `O total do documento diz ${eur(alvo)}, as linhas somam ${eur(soma)}${quando} — há ${eur(-dif)} a mais nas linhas?`,
      });
    } else if (linhasSemValor > 0) {
      aviso({
        id: "conta:linhas-sem-valor",
        campo: "orcamento",
        dinheiro: true,
        gravidade: "aviso",
        texto: `As linhas com valor somam o total, mas ${linhasSemValor === 1 ? "uma linha não tem" : `${linhasSemValor} linhas não têm`} valor. Confirma que estão incluídas.`,
      });
    }
  }

  // ── (b) Cada valor em € do documento tem sítio ──
  const tabelasComDinheiro = new Set(
    unidades
      .filter(
        (u): u is Extract<UnidadeLida, { tipo: "linha-de-tabela" }> => u.tipo === "linha-de-tabela",
      )
      .filter((u) => u.linha === 0 && CABECA_DE_DINHEIRO.test(u.celulas.join(" ")))
      .map((u) => u.tabela),
  );
  // Um valor do documento está «usado» quando um campo o PRENDE nessa unidade
  // (o token inteiro, dentro da citação). Os «não usados» só valem na unidade
  // onde a citação deles está — e cada um é um aviso de dinheiro para ela
  // confirmar: um valor verdadeiro arrumado ali era um valor perdido.
  const valores: ValorDoDocumento[] = [];
  for (const u of unidades) {
    const tabela = u.tipo === "linha-de-tabela" && tabelasComDinheiro.has(u.tabela);
    for (const v of valoresEmEuros(u, normDe.get(u.id)!, tabela)) {
      const campo = ligacoes.find((c) => c.valor === v.valor && c.unidades.includes(u.id));
      const nu = campo
        ? undefined
        : naoUsadosLigados.find((x) => x.valor === v.valor && x.unidades.includes(u.id));
      const usado: ValorDoDocumento["usado"] = campo?.usado ?? (nu ? "nao-usado" : null);
      valores.push({
        unidade: u.id,
        valor: v.valor,
        trecho: v.trecho,
        usado,
        ...(nu ? { motivo: nu.motivo } : {}),
      });
      if (nu) {
        aviso({
          id: `nao-usado:${u.id}:${Math.round(v.valor * 100)}`,
          campo: "orcamento",
          dinheiro: true,
          gravidade: "aviso",
          texto: `O documento tem ${eur(v.valor)} em «${curto(textoDaUnidade(u), 70)}» (${nomeDaParte(d, u.parte)}), que ficou FORA das linhas e do total: «${curto(nu.motivo, 60)}».`,
        });
      } else if (!usado) {
        aviso({
          id: `valor:${u.id}:${Math.round(v.valor * 100)}`,
          campo: "orcamento",
          dinheiro: true,
          gravidade: "erro",
          texto: `O documento tem ${eur(v.valor)} em «${curto(textoDaUnidade(u), 70)}» (${nomeDaParte(d, u.parte)}) e esse valor não está em nenhuma linha nem total.`,
        });
      }
    }
  }

  // ── (d) As imagens ──
  const idsDasImagens = new Set(d.imagens.map((i) => i.id));
  const vistas = new Map<string, number>();
  leitura.imagens = leitura.imagens.filter((im) => {
    if (!idsDasImagens.has(im.id)) {
      aviso({
        id: `imagem:desconhecida:${im.id}`,
        campo: "imagens",
        dinheiro: false,
        gravidade: "aviso",
        texto: `A leitura fala de uma imagem «${im.id}» que não existe no documento — ignorada.`,
      });
      return false;
    }
    vistas.set(im.id, (vistas.get(im.id) ?? 0) + 1);
    return vistas.get(im.id) === 1;
  });
  for (const [id, n] of vistas) {
    if (n > 1) {
      aviso({
        id: `imagem:repetida:${id}`,
        campo: "imagens",
        dinheiro: false,
        gravidade: "aviso",
        texto: `A imagem ${id} tinha ${n} destinos; ficou o primeiro.`,
      });
    }
  }
  const tituloAntesDe = (imagemId: string): string | null => {
    const i = unidades.findIndex((u) => u.tipo === "imagem" && u.imagem === imagemId);
    for (let k = i; k >= 0; k--) {
      const u = unidades[k];
      if (
        u.tipo === "paragrafo" &&
        (u.papel === "titulo" || (u.nivel !== undefined && u.nivel <= 2))
      ) {
        return u.texto;
      }
      if (k < i && u.parte !== unidades[i].parte && d.formato === "pptx") break;
    }
    return null;
  };
  let capas = 0;
  for (const im of leitura.imagens) {
    if (im.destino === "capa" && ++capas > 1) {
      im.destino = "moodboard";
      aviso({
        id: `imagem:capa:${im.id}`,
        campo: "imagens",
        dinheiro: false,
        gravidade: "aviso",
        texto: `Havia mais do que uma capa; a ${im.id} passou para as inspirações.`,
      });
    }
    if (im.tema && !existe(im.tema)) {
      const t = tituloAntesDe(im.id);
      aviso({
        id: `imagem:tema:${im.id}`,
        campo: "imagens",
        dinheiro: false,
        gravidade: "aviso",
        texto: `O tema «${curto(im.tema, 40)}» da imagem ${im.id} não está escrito no documento; ficou ${t ? `«${curto(t, 40)}», o título de onde ela está` : "sem tema"}.`,
      });
      inventados++;
      im.tema = t;
    }
    if (im.capitulo && !existe(im.capitulo)) im.capitulo = null;
  }
  for (const im of d.imagens) {
    if (!vistas.has(im.id)) {
      const u = unidades.find((x) => x.tipo === "imagem" && x.imagem === im.id);
      aviso({
        id: `imagem:sem-destino:${im.id}`,
        campo: "imagens",
        dinheiro: false,
        gravidade: "aviso",
        texto: `A imagem ${im.id}${u ? ` (${nomeDaParte(d, u.parte)})` : ""} não tem destino: fica de fora até a escolheres.`,
      });
    }
  }

  // ── (e) Todo o parágrafo tem sítio ──
  const saidas: string[] = [];
  const meter = (s: string | null | undefined) => {
    if (s) saidas.push(s);
  };
  meter(leitura.cliente.nomes);
  meter(leitura.cliente.email);
  meter(leitura.cliente.telefone);
  meter(ev.local);
  for (const c of [
    ev.data,
    ev.tipo,
    ev.convidados,
    o.iva.taxa,
    o.totalSemIva,
    o.valorDoIva,
    o.totalComIva,
  ]) {
    meter(c.citacao);
  }
  for (const g of leitura.servicos) {
    meter(g.titulo);
    for (const it of g.itens) {
      meter(it.titulo);
      meter(it.descricao);
      for (const s of it.subitens) {
        meter(s.titulo);
        meter(s.descricao);
      }
    }
  }
  for (const l of o.linhas) {
    meter(l.descricao);
    meter(l.quantidade.citacao);
    meter(l.precoUnitario.citacao);
    meter(l.totalDaLinha.citacao);
  }
  for (const v of o.valoresNaoUsados) meter(v.citacao);
  for (const n of leitura.notas) meter(n.texto);
  for (const im of leitura.imagens) {
    meter(im.tema);
    meter(im.capitulo);
  }
  const segs = [...new Set(saidas.flatMap(segmentos))].filter((s) => s.length >= 2);
  const motivoDe = new Map(
    leitura.naoColocados.filter((x) => x.motivo.trim()).map((x) => [x.id, x.motivo]),
  );
  const naoColocados: Verificacao["naoColocados"] = [];
  for (const u of unidades) {
    if (u.tipo === "imagem") continue;
    const n = normDe.get(u.id)!;
    if (!n) continue;
    const coberto = new Uint8Array(n.length);
    for (const s of segs) {
      if (s.includes(n)) {
        coberto.fill(1);
        break;
      }
      let i = n.indexOf(s);
      while (i >= 0) {
        coberto.fill(1, i, i + s.length);
        i = n.indexOf(s, i + 1);
      }
    }
    let total = 0;
    let feitos = 0;
    let resto = "";
    for (let i = 0; i < n.length; i++) {
      if (n[i] === " ") continue;
      total++;
      if (coberto[i]) feitos++;
      else resto += n[i];
    }
    // Colocado: quase todo coberto, ou o que sobra é só um rótulo curto sem
    // números («Total», «Local:», «Data:») ao lado do que foi copiado.
    const colocado =
      total === 0 ||
      feitos / total >= 0.9 ||
      (feitos > 0 && resto.length <= 12 && !/\d/.test(resto));
    if (colocado) continue;
    const motivo = motivoDe.get(u.id) ?? null;
    naoColocados.push({ id: u.id, texto: textoDaUnidade(u), parte: u.parte, motivo });
    if (!motivo) {
      aviso({
        id: `perdido:${u.id}`,
        campo: "documento",
        dinheiro: false,
        gravidade: "aviso",
        texto: `O texto «${curto(textoDaUnidade(u), 80)}» (${nomeDaParte(d, u.parte)}) não foi para nenhum campo da proposta nova.`,
      });
    }
  }

  return {
    leitura,
    avisos,
    valores,
    naoColocados,
    contas: { vatRate, somaDasLinhas: soma, linhasSemValor, modoDasLinhas, modoDoTotal },
    inventados,
  };
}
