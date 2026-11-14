import "server-only";
import { eChaveDeIndiceDeFotos } from "@/lib/indices-de-fotos";
import { getSupabase } from "@/lib/supabase";
import { getState, setState } from "@/lib/app-state";
import { DRAFT_PREFIX, draftKey } from "@/lib/proposal-drafts";
import {
  PROPOSAL_AVIF_MID_BUCKET,
  PROPOSAL_BUCKET,
  PROPOSAL_MID_BUCKET,
  PROPOSAL_THUMB_BUCKET,
  SUFIXO_DA_CAPA_WEB,
} from "@/lib/proposal-assinaturas";
import {
  THEME_AVIF_MID_BUCKET,
  THEME_BUCKET,
  THEME_MID_BUCKET,
  THEME_THUMB_BUCKET,
  caminhoDoRefDeTema,
  ehRefDeTema,
  isThemePath,
  refDeTema,
} from "@/lib/theme-ref";
import type { ManifestoDeFotografias } from "@/lib/manifesto-de-fotografias";
import { TABELAS_COM_CONTEUDO } from "@/lib/limpar-pastas-orfas";
import { lerTodasAsLinhas } from "./ler-todas-as-linhas";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS GUARDADAS DUAS VEZES PASSAM A UMA (13/11, autorizado por ele)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O armazenamento ia em 997 MB de 1 024 (plano gratuito). Medido a 13/11:
 * centenas de cópias com o MESMO conteúdo (mesmo `eTag` e mesmo tamanho) —
 * a mesma fotografia carregada duas vezes para a pasta do mesmo pedido, ou
 * copiada da Biblioteca para a pasta do pedido no tempo em que escolher uma foto
 * da Biblioteca copiava os bytes (antes do `tema:`, ver `theme-ref.ts`).
 *
 * Os bytes de uma fotografia NÃO têm cópia de segurança (`manifesto-de-
 * fotografias.ts`): o que sai daqui não volta. Por isso isto é feito em DUAS
 * noites, à vista em `app_state` ({@link CHAVE}), como as pastas órfãs:
 *
 * ── Fase A (uma noite) ─────────────────────────────────────────────────────
 *   Agrupa as fotografias do manifesto da noite (o mesmo que vai no email —
 *   nenhuma listagem a mais) pelo `eTag` + tamanho, escolhe a cópia que FICA,
 *   reescreve nos rascunhos do estúdio as referências às cópias que saem e
 *   grava o plano — com o valor antigo de cada campo mudado, para se poder
 *   desfazer. Não apaga nada.
 *
 * ── Fase B (≥ {@link ESPERA_HORAS} h depois) ───────────────────────────────
 *   Relê TUDO outra vez. Uma cópia só sai se nenhuma linha de nenhuma tabela
 *   com conteúdo a mencionar (as mesmas de `limpar-pastas-orfas.ts`), se ainda
 *   existir com o mesmo conteúdo, e se a cópia que fica ainda existir. O que
 *   voltou a ser referido entretanto fica. Saem com ela as suas derivadas
 *   (miniatura, média, AVIF, capa), depois de copiadas para o caminho que fica
 *   se lá faltarem — e, se a cópia falhar, refazem-se a pedido
 *   (`miniaturaAPedido`, `derivadaMediaAPedido`), como para qualquer foto antiga.
 *
 * ── O que NUNCA se reescreve, e portanto prende a cópia onde está ──────────
 *
 *   · as PROPOSTAS GRAVADAS (`proposals.doc`). Uma proposta que seguiu não é
 *     reescrita (`proposta-doc/route.ts`), e mudar-lhe um caminho mudava-lhe o
 *     selo da versão (`proposta-versao.ts`: o casal com uma proposta aceite
 *     passava a ver «revista»), a chave do PDF guardado (`chaveDoPdf`: redesenho
 *     e um PDF a mais guardado) e contrariava o selo do contrato. Medido a
 *     13/11: nenhuma cópia candidata é referida só por propostas em rascunho;
 *   · a RECICLAGEM (o retrato do que se repõe);
 *   · qualquer outra linha de qualquer tabela, ou chave de `app_state`, que a
 *     mencione — «não sei o que é» nunca vale «posso apagar»;
 *   · e uma menção dentro de um rascunho que não seja um caminho inteiro (um
 *     endereço, um texto): não se garante a troca, a cópia fica.
 *
 * As únicas chaves que não prendem: o próprio plano e as caches da proposta
 * online (`proposta-web:*`), cuja chave é o conteúdo do documento — um
 * documento reescrito nunca mais as lê.
 *
 * ── Qual fica ──────────────────────────────────────────────────────────────
 *
 *   · com uma cópia na Biblioteca (`theme-assets`, num tema que existe), as
 *     referências passam a `tema:<caminho>` — o mesmo que o estúdio já grava
 *     ao escolher da Biblioteca, protegido por `theme-materializar.ts`;
 *   · as cópias na Biblioteca nunca saem: cada uma é a foto dentro de um TEMA,
 *     e tirá-la tirava a foto desse tema;
 *   · entre pastas de pedidos diferentes NÃO se junta: apagar um pedido leva a
 *     pasta dele (`apagar-pedido.ts`), e uma proposta de outro pedido a apontar
 *     para lá ficava sem fotos;
 *   · dentro da pasta de um pedido fica a cópia presa (se houver) ou a mais
 *     antiga — a pasta é a galeria do pedido no estúdio (`assets/route.ts`), e
 *     a foto tem de lá continuar. Só sai a ÚLTIMA cópia da pasta quando o
 *     rascunho DESSE pedido passa a apontar para a Biblioteca (a galeria
 *     mostra as `tema:` do rascunho).
 *
 * Nada disto lança. Se uma leitura falhar, não se escreve nem se apaga nada; se
 * o tempo acabar, amanhã continua.
 *
 * ── Depois (revisão do #451) ──────────────────────────────────────────────
 *
 *   · as `tema:` que se escrevem aqui são reescritas pelo `moverFotosDaBiblioteca`
 *     (PR #448) quando ela funde temas ou move fotos — teste de ponta a ponta
 *     em `juntar-fotos-duplicadas.mover.test.ts`;
 *   · durante {@link FEITOS_DIAS} dias depois de uma cópia sair, TODAS as
 *     noites se relêem os rascunhos gravados desde a véspera e corrige-se um
 *     que tenha voltado a escrever o caminho apagado ({@link vigiarFeitos});
 *   · na Fase B, antes de cada lote de `remove`, relê-se o que foi gravado
 *     depois da leitura das tabelas (rascunhos e propostas);
 *   · um tema arquivado não serve de destino.
 *
 * Custo: nas noites sem plano a correr e com o último cálculo há menos de
 * {@link INTERVALO_DIAS} dias, nada (o manifesto já existe). Numa Fase A ou B,
 * as 15 tabelas (~5 MB a 13/11) uma vez, e, na B, ~10 chamadas ao Storage por
 * cópia (cópias e remoções dentro do Supabase — zero bytes de saída). A vigia
 * de todas as noites é uma leitura de `app_state` filtrada por prefixo e por
 * `updated_at` — só os rascunhos gravados desde a véspera (normalmente 0 a 5,
 * dezenas de KB) — e só escreve quando encontra um caminho que saiu. A releitura
 * da corrida, na Fase B, são duas leituras do mesmo género por lote de 6.
 */
export const CHAVE = "limpeza:fotos-duplicadas";
export const ESPERA_HORAS = 24;
export const INTERVALO_DIAS = 7;
/** Quanto tempo depois de sair uma cópia se continua a vigiar, todas as
 *  noites, os rascunhos que voltem a escrever o caminho dela. */
export const FEITOS_DIAS = 60;
/** Margem para trás nas leituras «gravado depois de»: uma escrita carimbada
 *  antes da leitura mas confirmada depois dela não pode escapar. */
const MARGEM_MS = 5 * 60_000;
const HORA_MS = 60 * 60_000;
const DIA_MS = 24 * HORA_MS;
const PREFIXO_CACHE_WEB = "proposta-web:";
// Os índices das fotografias (`foto-resumo:`, `foto-visual:`) nomeiam caminhos
// mas não os usam — ver `indices-de-fotos.ts`.
const PROPOSAL_COVER_BUCKET = "proposal-capas";
const THEME_COVER_BUCKET = "theme-capas";
const EM_PARALELO = 6;

/** Uma cópia que sai, e para onde passam as referências a ela. */
export interface CopiaASair {
  caminho: string;
  /** `tema:<caminho>` ou um caminho da MESMA pasta. */
  fica: string;
  bytes: number;
  soma: string;
}

/** Um campo reescrito num rascunho: o que tinha e o que passou a ter. */
export interface Troca {
  chave: string;
  campo: (string | number)[];
  antes: string;
  depois: string;
}

export interface PlanoDeDuplicados {
  versao: 1;
  /** Quando correu a Fase A deste plano (ISO). */
  faseA: string;
  apagar: CopiaASair[];
  trocas: Troca[];
  /** O que já saiu → para onde foi. Uma cópia de segurança reposta com os
   *  caminhos antigos volta a ser corrigida na Fase A seguinte. */
  feitos: Record<string, string>;
  /** Quando saiu cada um dos `feitos` (ISO). A correção de todas as noites
   *  só olha para os de menos de {@link FEITOS_DIAS} dias. */
  feitosEm?: Record<string, string>;
  /** Até onde a correção de todas as noites já viu os rascunhos (ISO): só se
   *  relêem os gravados DEPOIS disto. */
  feitosVistoAte?: string;
  /** Acumulado do que já saiu. */
  saiu: { copias: number; bytes: number };
}

export type Resultado = {
  fase: "nada" | "A" | "espera" | "B" | "a-seco";
  /** Cópias no plano (A, a-seco) ou ainda à espera (B). */
  copias: number;
  bytes: number;
  /** Campos de rascunhos reescritos (A) ou a reescrever (a-seco). */
  trocas: number;
  /** Cópias que ficam por estarem presas (A, a-seco). */
  presas: number;
  apagadas: number;
  bytesApagados: number;
  /**
   * Os caminhos que saíram esta noite (Fase B). A tarefa da noite usa-os para
   * o índice visual não calcular impressões de fotos que já não existem — o
   * manifesto foi lido ANTES desta junção (revisão de 13/11).
   */
  caminhosApagados?: string[];
  acabou: boolean;
  /** Só a seco: o plano inteiro, para se mostrar antes. */
  plano?: PlanoDeDuplicados;
};

type Cliente = NonNullable<ReturnType<typeof getSupabase>>;
type Linha = Record<string, unknown>;
type Foto = { caminho: string; bytes: number; soma: string; em: string };

const zero = (fase: Resultado["fase"], acabou = true): Resultado => ({
  fase,
  copias: 0,
  bytes: 0,
  trocas: 0,
  presas: 0,
  apagadas: 0,
  bytesApagados: 0,
  acabou,
});

// ── O manifesto, agrupado ──────────────────────────────────────────────────

const pastaDe = (c: string) => c.slice(0, c.indexOf("/"));
const ehCaminhoDePedido = (c: string) =>
  /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(jpe?g|png|webp)$/i.test(c);
const porIdade = (a: Foto, b: Foto) =>
  a.em.localeCompare(b.em) || a.caminho.localeCompare(b.caminho);

/** As fotos de cada bucket de originais, com conteúdo conhecido. */
export function fotosDoManifesto(m: ManifestoDeFotografias): {
  proposta: Foto[];
  tema: Foto[];
} {
  const proposta: Foto[] = [];
  const tema: Foto[] = [];
  for (const e of m.entradas) {
    const i = e.chave.indexOf("/");
    const bucket = e.chave.slice(0, i);
    const caminho = e.chave.slice(i + 1);
    if (!e.soma || !(e.bytes > 0)) continue;
    const f = { caminho, bytes: e.bytes, soma: e.soma, em: e.alteradoEm ?? "" };
    // `isThemePath` aceita UM nível: a Reciclagem (`reciclagem/<entrada>/x`)
    // fica de fora por construção — nunca é a que fica nem a que sai.
    if (bucket === THEME_BUCKET && isThemePath(caminho)) tema.push(f);
    if (bucket === PROPOSAL_BUCKET && ehCaminhoDePedido(caminho)) proposta.push(f);
  }
  return { proposta, tema };
}

const conteudoDe = (f: { soma: string; bytes: number }) => `${f.soma}:${f.bytes}`;

// ── Os documentos ──────────────────────────────────────────────────────────

/** Troca as strings EXACTAS, preservando a posição de tudo, e diz onde. */
function trocar(
  v: unknown,
  mapa: Map<string, string>,
  campo: (string | number)[],
  mudados: { campo: (string | number)[]; antes: string; depois: string }[],
): unknown {
  if (typeof v === "string") {
    const novo = mapa.get(v);
    if (novo === undefined) return v;
    mudados.push({ campo, antes: v, depois: novo });
    return novo;
  }
  if (Array.isArray(v)) return v.map((x, i) => trocar(x, mapa, [...campo, i], mudados));
  if (v && typeof v === "object") {
    const saida: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) saida[k] = trocar(x, mapa, [...campo, k], mudados);
    return saida;
  }
  return v;
}

interface Leitura {
  /** O texto de tudo o que PRENDE (tudo menos rascunhos, caches web e o plano). */
  presos: string;
  rascunhos: { chave: string; texto: string; valor: unknown }[];
  temasVivos: Set<string>;
}

async function lerTudo(sb: Cliente): Promise<Leitura | null> {
  const leituras = await Promise.all(TABELAS_COM_CONTEUDO.map((t) => lerTodasAsLinhas(sb, t, "*")));
  if (leituras.some((l) => l.error || !l.data)) return null;
  const partes: string[] = [];
  const rascunhos: Leitura["rascunhos"] = [];
  const temasVivos = new Set<string>();
  TABELAS_COM_CONTEUDO.forEach((t, i) => {
    const linhas = leituras[i].data as Linha[];
    // Um tema ARQUIVADO não serve de destino: está fora de vista, e é o
    // primeiro candidato a sair da Biblioteca.
    if (t === "proposal_themes")
      for (const l of linhas) if (l.arquivado !== true) temasVivos.add(String(l.id ?? ""));
    if (t !== "app_state") {
      partes.push(JSON.stringify(linhas));
      return;
    }
    for (const l of linhas) {
      const chave = String(l.key ?? "");
      if (chave === CHAVE || chave.startsWith(PREFIXO_CACHE_WEB) || eChaveDeIndiceDeFotos(chave))
        continue;
      if (chave.startsWith(DRAFT_PREFIX)) {
        rascunhos.push({ chave, texto: JSON.stringify(l.value ?? null), valor: l.value });
      } else partes.push(JSON.stringify(l));
    }
  });
  return { presos: partes.join("\n"), rascunhos, temasVivos };
}

// ── Fase A: o plano ────────────────────────────────────────────────────────

function calcularPlano(
  m: ManifestoDeFotografias,
  l: Leitura,
  feitos: Record<string, string>,
): { apagar: CopiaASair[]; presas: number; trocasPorChave: Map<string, Map<string, string>> } {
  const { proposta, tema } = fotosDoManifesto(m);
  const daBiblioteca = new Map<string, Foto>();
  for (const t of [...tema].sort(porIdade)) {
    if (!l.temasVivos.has(pastaDe(t.caminho))) continue;
    if (!daBiblioteca.has(conteudoDe(t))) daBiblioteca.set(conteudoDe(t), t);
  }
  const grupos = new Map<string, Foto[]>();
  for (const p of proposta) {
    const k = `${pastaDe(p.caminho)}|${conteudoDe(p)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), p]);
  }

  const apagar: CopiaASair[] = [];
  const trocasPorChave = new Map<string, Map<string, string>>();
  const pedirTroca = (chave: string, de: string, para: string) => {
    const mapa = trocasPorChave.get(chave) ?? new Map<string, string>();
    mapa.set(de, para);
    trocasPorChave.set(chave, mapa);
  };
  let presas = 0;

  for (const copias of grupos.values()) {
    const t = daBiblioteca.get(conteudoDe(copias[0]));
    if (copias.length < 2 && !t) continue;
    copias.sort(porIdade);
    const pasta = pastaDe(copias[0].caminho);
    const presa = (c: Foto) => l.presos.includes(c.caminho);
    const quem = (c: Foto) => l.rascunhos.filter((r) => r.texto.includes(c.caminho));
    const presasAqui = copias.filter(presa);
    presas += presasAqui.length;
    const livres = copias.filter((c) => !presa(c));
    const rascunhoProprio = draftKey(pasta);
    let ficam: Foto[] = presasAqui;
    if (ficam.length === 0) {
      const oProprioPassaABiblioteca =
        !!t && livres.some((c) => quem(c).some((r) => r.chave === rascunhoProprio));
      if (!oProprioPassaABiblioteca) ficam = [copias[0]];
    }
    const fica = t ? refDeTema(t.caminho) : ficam[0]?.caminho;
    if (!fica) continue;
    for (const c of livres) {
      if (ficam.includes(c)) continue;
      for (const r of quem(c)) pedirTroca(r.chave, c.caminho, fica);
      apagar.push({ caminho: c.caminho, fica, bytes: c.bytes, soma: c.soma });
    }
  }

  // Uma cópia de segurança reposta pode trazer caminhos que já saíram: se a
  // foto já não existe e se sabe para onde foi, corrige-se o rascunho.
  const existem = new Set(proposta.map((p) => p.caminho));
  for (const [de, para] of Object.entries(feitos)) {
    if (existem.has(de)) continue;
    for (const r of l.rascunhos) if (r.texto.includes(de)) pedirTroca(r.chave, de, para);
  }
  return { apagar, presas, trocasPorChave };
}

/**
 * Grava um rascunho SÓ se ninguém lhe mexeu desde a leitura: compare-and-set
 * sobre o `updated_at` da linha (o `setState` não tem esta guarda). Relê a
 * linha, aplica as trocas à versão MAIS RECENTE e escreve com
 * `.eq("updated_at", lido)`: zero linhas = outra escrita pelo meio, e esta não
 * se faz (amanhã tenta outra vez).
 *
 * E o `updatedAt` de DENTRO do rascunho passa a ser o de agora: é por ele que
 * a rota do rascunho (`proposta-rascunho/route.ts`, `alguemGravouEntretanto`)
 * percebe que alguém gravou entretanto e junta campo a campo em vez de
 * regravar o documento inteiro do estúdio aberto — com os caminhos antigos.
 * Mantê-lo deixava um separador aberto repor a referência à cópia (revisão de
 * 13/11). E mesmo assim, se a referência antiga voltar, a Fase B vê-a e a
 * cópia fica.
 */
async function reescreverRascunho(
  sb: Cliente,
  chave: string,
  mapa: Map<string, string>,
): Promise<{ ok: boolean; trocas: Troca[]; pendentes: string[] }> {
  const falhou = { ok: false, trocas: [], pendentes: [...mapa.keys()] };
  try {
    const { data, error } = await sb
      .from("app_state")
      .select("key, value, updated_at")
      .eq("key", chave)
      .maybeSingle();
    if (error || !data) return falhou;
    const mudados: { campo: (string | number)[]; antes: string; depois: string }[] = [];
    const novo = trocar((data as Linha).value, mapa, [], mudados);
    const texto = JSON.stringify(novo);
    // O que continuar mencionado depois da troca (dentro de um endereço, de um
    // texto) não se consegue garantir: essa cópia fica.
    const pendentes = [...mapa.keys()].filter((c) => texto.includes(c));
    if (mudados.length === 0) return { ok: true, trocas: [], pendentes };
    const valorNovo =
      novo && typeof novo === "object" && !Array.isArray(novo)
        ? { ...(novo as Linha), updatedAt: new Date().toISOString() }
        : novo;
    const lido = (data as Linha).updated_at;
    const base = sb
      .from("app_state")
      .update({ value: valorNovo, updated_at: new Date().toISOString() })
      .eq("key", chave);
    const guardada = lido == null ? base.is("updated_at", null) : base.eq("updated_at", lido);
    const { data: escritas, error: erro } = await guardada.select("key");
    if (erro || !Array.isArray(escritas) || escritas.length === 0) {
      log.warn("duplicados: rascunho mudou entretanto — fica para outra noite", { chave });
      return falhou;
    }
    return { ok: true, trocas: mudados.map((m) => ({ chave, ...m })), pendentes };
  } catch {
    return falhou;
  }
}

async function faseA(
  sb: Cliente,
  m: ManifestoDeFotografias,
  agora: Date,
  anterior: PlanoDeDuplicados | null,
  aSeco: boolean,
  fim: number,
): Promise<Resultado> {
  const feitos = anterior?.feitos ?? {};
  const leitura = await lerTudo(sb);
  if (!leitura) return zero(aSeco ? "a-seco" : "A", false);
  const { apagar, presas, trocasPorChave } = calcularPlano(m, leitura, feitos);
  const trocasPrevistas = [...trocasPorChave.values()].reduce((n, x) => n + x.size, 0);
  const plano: PlanoDeDuplicados = {
    versao: 1,
    faseA: agora.toISOString(),
    apagar,
    trocas: [],
    feitos,
    ...(anterior?.feitosEm ? { feitosEm: anterior.feitosEm } : {}),
    ...(anterior?.feitosVistoAte ? { feitosVistoAte: anterior.feitosVistoAte } : {}),
    saiu: anterior?.saiu ?? { copias: 0, bytes: 0 },
  };
  const resumo = (fase: Resultado["fase"], trocas: number): Resultado => ({
    ...zero(fase),
    copias: plano.apagar.length,
    bytes: plano.apagar.reduce((n, c) => n + c.bytes, 0),
    trocas,
    presas,
  });
  if (aSeco) return { ...resumo("a-seco", trocasPrevistas), plano };
  if (apagar.length === 0 && trocasPorChave.size === 0) {
    const g = await setState(CHAVE, plano);
    return { ...resumo("A", 0), acabou: g.gravado };
  }

  // O plano grava-se ANTES de mexer em qualquer rascunho: sem ele não há Fase
  // B, e uma escrita sem registo não se desfazia.
  const g1 = await setState(CHAVE, plano);
  if (!g1.gravado || !g1.duradouro) return zero("A", false);

  const naoSai = new Set<string>();
  for (const [chave, mapa] of trocasPorChave) {
    if (Date.now() > fim) {
      for (const c of mapa.keys()) naoSai.add(c);
      continue;
    }
    const r = await reescreverRascunho(sb, chave, mapa);
    plano.trocas.push(...r.trocas);
    for (const c of r.pendentes) naoSai.add(c);
  }
  plano.apagar = plano.apagar.filter((c) => !naoSai.has(c.caminho));
  const g2 = await setState(CHAVE, plano);
  if (!g2.gravado) {
    log.error("duplicados: rascunhos reescritos mas o plano final não gravou", null, {
      trocas: plano.trocas,
    });
    // Sem o plano final a Fase B usa o primeiro, que tem cópias a mais — mas
    // cada uma é reconfirmada lá. Não se apaga nada que esteja mencionado.
  }
  log.info("duplicados: fase A", {
    copias: plano.apagar.length,
    mb: +(plano.apagar.reduce((n, c) => n + c.bytes, 0) / 1048576).toFixed(1),
    trocas: plano.trocas.length,
    presas,
  });
  return { ...resumo("A", plano.trocas.length), acabou: Date.now() <= fim };
}

// ── O que foi gravado depois de uma hora ───────────────────────────────────

/** Rascunhos (chave + valor) gravados depois de `desde`, às páginas. `null` se
 *  a leitura falhou. Pelo `updated_at` da linha: normalmente nenhum ou poucos. */
async function rascunhosDesde(
  sb: Cliente,
  desde: string,
): Promise<{ chave: string; texto: string }[] | null> {
  const saida: { chave: string; texto: string }[] = [];
  try {
    for (let de = 0; de < 20_000; de += 1000) {
      const { data, error } = await sb
        .from("app_state")
        .select("key, value")
        .like("key", `${DRAFT_PREFIX.replace(/([%_\\])/g, "\\$1")}%`)
        .gt("updated_at", desde)
        .order("key", { ascending: true })
        .range(de, de + 999);
      if (error || !data) return null;
      for (const l of data as Linha[])
        saida.push({ chave: String(l.key), texto: JSON.stringify(l.value ?? null) });
      if (data.length < 1000) return saida;
    }
    return null;
  } catch {
    return null;
  }
}

/** O texto de tudo o que se gravou depois de `desde` e pode referir uma cópia:
 *  rascunhos e propostas. `null` se a leitura falhou. */
async function gravadosDesde(sb: Cliente, desde: string): Promise<string | null> {
  const rascunhos = await rascunhosDesde(sb, desde);
  if (!rascunhos) return null;
  try {
    const { data, error } = await sb
      .from("proposals")
      .select("id, doc")
      .gt("updated_at", desde)
      .order("id", { ascending: true })
      .range(0, 999);
    if (error || !data || data.length >= 1000) return null;
    return `${rascunhos.map((r) => r.texto).join("\n")}\n${JSON.stringify(data)}`;
  } catch {
    return null;
  }
}

/**
 * ── A VIGIA DE TODAS AS NOITES ─────────────────────────────────────────────
 *
 * Depois de uma cópia sair, um separador antigo, um rascunho guardado no
 * navegador ou uma cópia de segurança reposta podem voltar a escrever o
 * caminho dela. Enquanto houver cópias saídas há menos de {@link FEITOS_DIAS}
 * dias, todas as noites se relêem os rascunhos gravados desde a última vez
 * (pelo `updated_at` — normalmente nenhum) e, onde aparecer um caminho que
 * saiu, troca-se pelo que ficou, com o mesmo compare-and-set e `updatedAt`
 * novo da Fase A. Devolve se o plano mudou (e tem de se gravar).
 */
async function vigiarFeitos(sb: Cliente, plano: PlanoDeDuplicados, agora: Date): Promise<boolean> {
  const limite = agora.getTime() - FEITOS_DIAS * DIA_MS;
  const recentes = Object.entries(plano.feitos).filter(([c]) => {
    const em = Date.parse(plano.feitosEm?.[c] ?? "");
    return Number.isFinite(em) && em >= limite;
  });
  if (recentes.length === 0 || !plano.feitosVistoAte) return false;
  // O relógio da base de dados, e não o `agora` de quem chama: é com o
  // `updated_at` das linhas que isto se compara.
  const lidoEm = new Date(Date.now() - MARGEM_MS).toISOString();
  const rascunhos = await rascunhosDesde(sb, plano.feitosVistoAte);
  if (!rascunhos) return false;
  let tudoTrocado = true;
  for (const r of rascunhos) {
    const mapa = new Map(recentes.filter(([de]) => r.texto.includes(de)));
    if (mapa.size === 0) continue;
    const feito = await reescreverRascunho(sb, r.chave, mapa);
    plano.trocas.push(...feito.trocas);
    if (!feito.ok) tudoTrocado = false;
    if (feito.trocas.length > 0)
      log.warn("duplicados: um rascunho voltou a escrever um caminho que já saiu — corrigido", {
        chave: r.chave,
        trocas: feito.trocas.length,
      });
  }
  // Só se avança quando tudo ficou trocado: o que falhou relê-se amanhã.
  if (tudoTrocado) plano.feitosVistoAte = lidoEm;
  return true;
}

// ── Fase B: confirmar e apagar ─────────────────────────────────────────────

/** As derivadas de um original da pasta de um pedido, e onde vive a gémea da
 *  cópia que fica. */
function derivadas(
  caminho: string,
  fica: string,
): { de: string; para: string; c: string; p: string }[] {
  const tema = ehRefDeTema(fica);
  const alvo = tema ? caminhoDoRefDeTema(fica) : fica;
  const pares: [string, string][] = [
    [PROPOSAL_THUMB_BUCKET, tema ? THEME_THUMB_BUCKET : PROPOSAL_THUMB_BUCKET],
    [PROPOSAL_MID_BUCKET, tema ? THEME_MID_BUCKET : PROPOSAL_MID_BUCKET],
    [PROPOSAL_AVIF_MID_BUCKET, tema ? THEME_AVIF_MID_BUCKET : PROPOSAL_AVIF_MID_BUCKET],
    [PROPOSAL_COVER_BUCKET, tema ? THEME_COVER_BUCKET : PROPOSAL_COVER_BUCKET],
  ];
  const lista = pares.map(([de, para]) => ({ de, para, c: caminho, p: alvo }));
  lista.push({
    de: PROPOSAL_AVIF_MID_BUCKET,
    para: tema ? THEME_AVIF_MID_BUCKET : PROPOSAL_AVIF_MID_BUCKET,
    c: `${caminho}${SUFIXO_DA_CAPA_WEB}`,
    p: `${alvo}${SUFIXO_DA_CAPA_WEB}`,
  });
  return lista;
}

async function apagarUma(sb: Cliente, c: CopiaASair): Promise<boolean> {
  const ds = derivadas(c.caminho, c.fica);
  // 1. A derivada da que fica: copia-se a desta se lá faltar. Sem `upsert`,
  //    uma que já exista não é tocada (o erro «já existe» é a resposta boa);
  //    uma que falte e não se copie refaz-se a pedido.
  await Promise.all(
    ds.map(async (d) => {
      try {
        await sb.storage.from(d.de).copy(d.c, d.p, { destinationBucket: d.para });
      } catch {
        /* refaz-se a pedido */
      }
    }),
  );
  // 2. O original. Só com ele fora é que as derivadas saem.
  try {
    const { data, error } = await sb.storage.from(PROPOSAL_BUCKET).remove([c.caminho]);
    if (error || !Array.isArray(data) || data.length === 0) return false;
  } catch {
    return false;
  }
  // 3. As derivadas desta cópia: descartáveis, melhor esforço.
  const porBucket = new Map<string, string[]>();
  for (const d of ds) porBucket.set(d.de, [...(porBucket.get(d.de) ?? []), d.c]);
  await Promise.all(
    [...porBucket].map(async ([b, cs]) => {
      try {
        await sb.storage.from(b).remove(cs);
      } catch {
        /* uma derivada órfã não estraga nada */
      }
    }),
  );
  return true;
}

async function faseB(
  sb: Cliente,
  m: ManifestoDeFotografias,
  plano: PlanoDeDuplicados,
  fim: number,
): Promise<Resultado> {
  const lidoEm = new Date(Date.now() - MARGEM_MS).toISOString();
  const leitura = await lerTudo(sb);
  if (!leitura) return { ...zero("B", false), copias: plano.apagar.length };
  const { proposta, tema } = fotosDoManifesto(m);
  const agoraNaProposta = new Map(proposta.map((f) => [f.caminho, f]));
  const naBiblioteca = new Map(tema.map((f) => [f.caminho, f]));
  // Os rascunhos contam aqui como tudo o resto: se um voltou a falar da cópia
  // (ela gravou por cima, uma cópia de segurança reposta), a cópia fica.
  const tudo = `${leitura.presos}\n${leitura.rascunhos.map((r) => r.texto).join("\n")}`;

  const restam: CopiaASair[] = [];
  const prontas: CopiaASair[] = [];
  for (const c of plano.apagar) {
    const aqui = agoraNaProposta.get(c.caminho);
    if (!aqui || conteudoDe(aqui) !== conteudoDe(c)) continue; // já saiu, ou mudou: larga-se
    const alvo = ehRefDeTema(c.fica)
      ? naBiblioteca.get(caminhoDoRefDeTema(c.fica))
      : agoraNaProposta.get(c.fica);
    const alvoVivo =
      !!alvo &&
      conteudoDe(alvo) === conteudoDe(c) &&
      (!ehRefDeTema(c.fica) || leitura.temasVivos.has(pastaDe(caminhoDoRefDeTema(c.fica))));
    if (!alvoVivo || tudo.includes(c.caminho)) continue; // fica — e sai do plano
    prontas.push(c);
  }

  let apagadas = 0;
  let bytesApagados = 0;
  const caminhosApagados: string[] = [];
  for (let i = 0; i < prontas.length; i += EM_PARALELO) {
    if (Date.now() > fim) {
      restam.push(...prontas.slice(i));
      break;
    }
    // A corrida entre a leitura das tabelas e o `remove`: o que foi gravado
    // depois dela (rascunhos e propostas, pelo `updated_at`) relê-se antes de
    // cada lote. Normalmente é nada, e custa duas leituras vazias.
    const recentes = await gravadosDesde(sb, lidoEm);
    if (recentes === null) {
      restam.push(...prontas.slice(i));
      break;
    }
    // Uma que voltou a ser referida entretanto fica — e sai do plano.
    const lote = prontas.slice(i, i + EM_PARALELO).filter((c) => !recentes.includes(c.caminho));
    const feitas = await Promise.all(lote.map((c) => apagarUma(sb, c)));
    lote.forEach((c, j) => {
      if (feitas[j]) {
        apagadas++;
        bytesApagados += c.bytes;
        caminhosApagados.push(c.caminho);
        plano.feitos[c.caminho] = c.fica;
        plano.feitosEm = { ...(plano.feitosEm ?? {}), [c.caminho]: new Date().toISOString() };
      } else restam.push(c);
    });
  }
  plano.apagar = restam;
  // A vigia de todas as noites começa no momento em que estes se leram: um
  // rascunho que volte a escrever um caminho apagado grava DEPOIS disto.
  if (apagadas > 0 && (!plano.feitosVistoAte || plano.feitosVistoAte > lidoEm))
    plano.feitosVistoAte = lidoEm;
  plano.saiu = {
    copias: plano.saiu.copias + apagadas,
    bytes: plano.saiu.bytes + bytesApagados,
  };
  await setState(CHAVE, plano);
  if (apagadas > 0) {
    log.info("duplicados: fotografias repetidas saíram do armazenamento", {
      apagadas,
      mb: +(bytesApagados / 1048576).toFixed(1),
      acumuladoMb: +(plano.saiu.bytes / 1048576).toFixed(1),
      restam: restam.length,
    });
  }
  return {
    ...zero("B", restam.length === 0),
    copias: restam.length,
    bytes: restam.reduce((n, c) => n + c.bytes, 0),
    apagadas,
    bytesApagados,
    caminhosApagados,
  };
}

// ── A porta ────────────────────────────────────────────────────────────────

/**
 * Corre a fase que toca esta noite. `manifesto` é o da tarefa da noite: sem ele
 * completo não se faz nada (uma lista truncada esconde a cópia que fica).
 *
 * `aSeco`: calcula e devolve o plano da Fase A sem escrever nada — é o que a
 * rota só-admin mostra antes.
 */
export async function juntarFotosDuplicadas(
  manifesto: ManifestoDeFotografias | null | undefined,
  agora: Date,
  opcoes: { prazoMs?: number; aSeco?: boolean } = {},
): Promise<Resultado> {
  const aSeco = !!opcoes.aSeco;
  try {
    const sb = getSupabase();
    if (!sb) return zero(aSeco ? "a-seco" : "nada");
    if (!manifesto?.completo) return zero(aSeco ? "a-seco" : "nada", false);
    const fim = Date.now() + (opcoes.prazoMs ?? 20_000);
    const plano = await getState<PlanoDeDuplicados>(CHAVE, { ouFalha: true });
    const valido = plano && plano.versao === 1 && Array.isArray(plano.apagar) ? plano : null;
    if (aSeco) return await faseA(sb, manifesto, agora, valido, true, fim);
    if (valido && (await vigiarFeitos(sb, valido, agora))) await setState(CHAVE, valido);
    const desde = valido ? agora.getTime() - Date.parse(valido.faseA) : Infinity;
    if (valido && valido.apagar.length > 0) {
      if (!(desde >= ESPERA_HORAS * HORA_MS))
        return { ...zero("espera"), copias: valido.apagar.length };
      return await faseB(sb, manifesto, valido, fim);
    }
    if (valido && desde < INTERVALO_DIAS * DIA_MS) return zero("nada");
    return await faseA(sb, manifesto, agora, valido, false, fim);
  } catch (e) {
    log.error("duplicados: falhou (amanhã tenta outra vez)", e);
    return zero(aSeco ? "a-seco" : "nada", false);
  }
}
