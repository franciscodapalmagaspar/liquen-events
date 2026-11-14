import { DEFAULT_VAT_RATE, parseMoneyText, resolveProposalMoney } from "../../proposal-doc";
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
  modoDasLinhas: "sem_iva" | "com_iva" | "desconhecido";
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

const NUMERO =
  /\d{1,3}(?:[.\s ]\d{3})+(?:,\d{1,2})?(?!\d)|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?(?!\d)|\d+(?:[.,]\d{1,2})?(?!\d)/g;

/** Todos os números de um texto, lidos à portuguesa, com e sem os espaços. */
export function numerosDe(texto: string): number[] {
  const out = new Set<number>();
  for (const m of texto.matchAll(NUMERO)) {
    out.add(round2(parseMoneyText(m[0])));
    for (const p of m[0].split(/[\s ]+/)) if (/\d/.test(p)) out.add(round2(parseMoneyText(p)));
  }
  return [...out];
}

const DINHEIRO = new RegExp(
  String.raw`(?:€|eur\b)\s*(${NUMERO.source})|(${NUMERO.source})\s*(?:€|eur(?:os)?\b)`,
  "gi",
);
const CABECA_DE_DINHEIRO = /€|eur\b|euros|pre[cç]o|valor|total|montante|custo|investimento/i;

/** Os valores em euros escritos numa unidade (e nas tabelas com coluna de preços). */
function valoresEmEuros(
  u: UnidadeLida,
  tabelaComDinheiro: boolean,
): { valor: number; trecho: string }[] {
  const t = textoDaUnidade(u);
  const out: { valor: number; trecho: string }[] = [];
  const vistos = new Set<string>();
  const juntar = (valor: number, trecho: string, onde: number) => {
    const k = `${round2(valor)}@${onde}`;
    if (valor > 0 && !vistos.has(k)) {
      vistos.add(k);
      out.push({ valor: round2(valor), trecho });
    }
  };
  for (const m of t.matchAll(DINHEIRO)) juntar(parseMoneyText(m[1] ?? m[2]), m[0], m.index ?? 0);
  if (u.tipo === "linha-de-tabela" && tabelaComDinheiro && u.linha > 0) {
    u.celulas.forEach((c, i) => {
      const s = c.trim();
      if (/[€]|eur/i.test(s)) return; // já contado acima
      if (
        /^\d{1,3}(?:[.\s ]\d{3})*(?:,\d{2})?$|^\d+(?:,\d{2})$/.test(s) &&
        /,\d{2}$|\d{3}/.test(s)
      ) {
        juntar(parseMoneyText(s), s, 100_000 + i);
      }
    });
  }
  return out;
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
  const palheiro = unidades.map((u) => normDe.get(u.id)!).join(" ");
  const existe = (texto: string): boolean => {
    const ss = segmentos(texto);
    return ss.length > 0 && ss.every((s) => palheiro.includes(s));
  };

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
  const numeroCitado = (c: Citado, campo: string, nome: string, dinheiro: boolean): Citado => {
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
    if (!existe(c.citacao))
      return falha(`vem de «${curto(c.citacao, 60)}», que não está no documento`);
    if (!numerosDe(c.citacao).includes(round2(c.valor))) {
      return falha(`não está escrito em «${curto(c.citacao, 60)}»`);
    }
    return c;
  };

  const ev = leitura.evento;
  ev.convidados = numeroCitado(ev.convidados, "evento.convidados", "O número de convidados", false);
  if (ev.tipo.valor !== null) {
    const ok =
      ev.tipo.citacao &&
      existe(ev.tipo.citacao) &&
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
    else if (!ev.data.citacao || !existe(ev.data.citacao))
      porque = "não vem de um sítio do documento";
    else {
      const datas = datasDaLinha(ev.data.citacao);
      const nums = numerosDe(ev.data.citacao.replace(/[./-]/g, " "));
      const dia = Number(m![3]);
      const ano = Number(m![1]);
      const bate =
        datas.includes(iso) ||
        (nums.includes(dia) && (nums.includes(ano) || nums.includes(ano % 100)));
      if (!bate) porque = `não está escrita em «${curto(ev.data.citacao, 60)}»`;
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
  o.iva.taxa = numeroCitado(o.iva.taxa, "orcamento.iva", "A taxa de IVA", true);
  const taxaLida = o.iva.taxa.valor;
  let vatRate = DEFAULT_VAT_RATE;
  if (taxaLida !== null) {
    if (taxaLida >= 0 && taxaLida <= 30) vatRate = round2(taxaLida) / 100;
    else {
      aviso({
        id: "iva:taxa-estranha",
        campo: "orcamento.iva",
        dinheiro: true,
        gravidade: "erro",
        texto: `A taxa de IVA lida (${taxaLida}%) não é uma taxa de IVA. Ficou a da casa (${DEFAULT_VAT_RATE * 100}%).`,
      });
    }
  }
  o.totalSemIva = numeroCitado(o.totalSemIva, "orcamento.total", "O total sem IVA", true);
  o.valorDoIva = numeroCitado(o.valorDoIva, "orcamento.total", "O valor do IVA", true);
  o.totalComIva = numeroCitado(o.totalComIva, "orcamento.total", "O total com IVA", true);

  o.linhas = o.linhas.map((l, i): LinhaLida => {
    const campo = `orcamento.linhas.${i}`;
    const nome = l.descricao ? `A linha «${curto(l.descricao, 40)}»` : `A linha ${i + 1}`;
    return {
      descricao: literal(l.descricao, campo, "A linha do orçamento", true),
      quantidade: numeroCitado(l.quantidade, campo, `${nome}: a quantidade`, true),
      precoUnitario: numeroCitado(l.precoUnitario, campo, `${nome}: o preço unitário`, true),
      totalDaLinha: numeroCitado(l.totalDaLinha, campo, `${nome}: o total`, true),
      tipo: l.tipo,
    };
  });
  o.valoresNaoUsados = o.valoresNaoUsados.filter((v) => {
    if (existe(v.citacao) && numerosDe(v.citacao).includes(round2(v.valor))) return true;
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

  let modoDasLinhas = o.iva.valoresDasLinhas;
  if (soma !== null) {
    // O total a comparar, no modo das linhas.
    const alvoSem = base ?? (bruto !== null ? baseDoBruto(bruto) : null);
    const alvoCom = bruto ?? (base !== null ? brutoDaBase(base) : null);
    let alvo: number | null = null;
    if (modoDasLinhas === "sem_iva") alvo = alvoSem;
    else if (modoDasLinhas === "com_iva") alvo = alvoCom;
    else if (alvoSem !== null && soma === alvoSem) {
      alvo = alvoSem;
      modoDasLinhas = "sem_iva";
    } else if (alvoCom !== null && soma === alvoCom) {
      alvo = alvoCom;
      modoDasLinhas = "com_iva";
    } else alvo = alvoSem ?? alvoCom;

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
    if (modoDasLinhas === "desconhecido") {
      aviso({
        id: "iva:linhas",
        campo: "orcamento",
        dinheiro: true,
        gravidade: "erro",
        texto:
          "Não se percebeu se os valores das linhas têm IVA ou não. Os valores das linhas não passam até confirmares.",
      });
    }
  }
  if (
    (base !== null || bruto !== null) &&
    o.iva.valoresDoTotal === "desconhecido" &&
    !(base !== null && bruto !== null)
  ) {
    aviso({
      id: "iva:total",
      campo: "orcamento.total",
      dinheiro: true,
      gravidade: "erro",
      texto: `O documento não diz se o total (${eur((base ?? bruto)!)}) inclui IVA. Escolhe abaixo.`,
    });
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
  const usadosEmCampos: { valor: number; citacao: string; usado: "linha" | "total" }[] = [];
  for (const l of o.linhas) {
    for (const c of [l.precoUnitario, l.totalDaLinha]) {
      if (c.valor !== null && c.citacao)
        usadosEmCampos.push({ valor: round2(c.valor), citacao: c.citacao, usado: "linha" });
    }
  }
  for (const c of [o.totalSemIva, o.valorDoIva, o.totalComIva]) {
    if (c.valor !== null && c.citacao)
      usadosEmCampos.push({ valor: round2(c.valor), citacao: c.citacao, usado: "total" });
  }
  const naoUsadosPorConsumir = o.valoresNaoUsados.map((v) => ({
    ...v,
    valor: round2(v.valor),
    gasto: false,
  }));
  const valores: ValorDoDocumento[] = [];
  for (const u of unidades) {
    const tabela = u.tipo === "linha-de-tabela" && tabelasComDinheiro.has(u.tabela);
    for (const v of valoresEmEuros(u, tabela)) {
      const n = normDe.get(u.id)!;
      const naUnidade = (cit: string) => segmentos(cit).some((s) => n.includes(s) || s.includes(n));
      const campo = usadosEmCampos.find((c) => c.valor === v.valor && naUnidade(c.citacao));
      let usado: ValorDoDocumento["usado"] = campo?.usado ?? null;
      let motivo: string | undefined;
      if (!usado) {
        const nu =
          naoUsadosPorConsumir.find(
            (x) => !x.gasto && x.valor === v.valor && naUnidade(x.citacao),
          ) ?? naoUsadosPorConsumir.find((x) => !x.gasto && x.valor === v.valor);
        if (nu) {
          nu.gasto = true;
          usado = "nao-usado";
          motivo = nu.motivo;
        }
      }
      valores.push({
        unidade: u.id,
        valor: v.valor,
        trecho: v.trecho,
        usado,
        ...(motivo ? { motivo } : {}),
      });
      if (!usado) {
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
    contas: { vatRate, somaDasLinhas: soma, linhasSemValor, modoDasLinhas },
    inventados,
  };
}
