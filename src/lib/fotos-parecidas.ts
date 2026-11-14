import "server-only";
import { createHash } from "crypto";
import sharp from "sharp";
import { gravarEstadoSeNaoMudou, lerEstadoComVersao, listStateByPrefix } from "@/lib/app-state";
import { existe } from "@/lib/fotos-resumo";
import {
  distancias,
  eImpressao,
  impressaoDePixeis,
  LADO_DE_TRABALHO,
  veredicto,
  type Distancias,
  type Veredicto,
} from "@/lib/impressao-visual";
import { PROPOSAL_BUCKET, PROPOSAL_MID_BUCKET } from "@/lib/proposal-assinaturas";
import { fetchProposalThumbBytes } from "@/lib/proposal-storage";
import { getSupabase } from "@/lib/supabase";
import { getTheme } from "@/lib/themes-store";
import {
  THEME_BUCKET,
  THEME_MID_BUCKET,
  caminhoDoRefDeTema,
  ehRefDeTema,
  refDeTema,
} from "@/lib/theme-ref";
import type { ManifestoDeFotografias } from "@/lib/manifesto-de-fotografias";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ÍNDICE DAS FOTOGRAFIAS PELO QUE MOSTRAM (13/11, pedido dele)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O irmão de `fotos-resumo.ts`. Aquele reconhece o mesmo FICHEIRO (SHA-256);
 * este reconhece a mesma FOTOGRAFIA quando o ficheiro mudou — recomprimida
 * pelo PowerPoint, reduzida, passada a PNG, com as margens cortadas — pela
 * impressão visual de `impressao-visual.ts`.
 *
 * ── O índice ───────────────────────────────────────────────────────────────
 *
 * Em `app_state`, sem migração: 64 linhas `foto-visual:<00–3f>`, cada uma um
 * objecto `caminho → impressão` (86 hex). A linha de um caminho é escolhida
 * pelo SHA-1 dele, por isso escrever uma foto é ler e regravar UMA linha
 * pequena (~4 KB com 3 000 fotos), com compare-and-set — dois carregamentos
 * ao mesmo tempo não se apagam um ao outro.
 *
 * Os caminhos são os do resto da casa: `<pedido>/<x>.jpg` (pasta de um
 * pedido) e `tema:<pasta>/<x>.jpg` (Biblioteca). Uma impressão vazia (`""`)
 * quer dizer «tentou-se e não havia miniatura»: conta como vista no
 * preenchimento da noite e nunca é encontrada.
 *
 * ── QUEM ESCREVE (e quem NUNCA escreve) ────────────────────────────────────
 *
 * A impressão que entra no índice é SEMPRE calculada no servidor, sobre os
 * bytes que estão guardados (no carregamento) ou sobre a miniatura guardada
 * (na tarefa da noite). A que o navegador calcula serve para PROCURAR e nunca
 * se escreve — a mesma regra do resumo exacto (revisão do #454): vinda
 * errada, ligava para sempre uma fotografia a outra.
 *
 * ── PROCURAR ───────────────────────────────────────────────────────────────
 *
 * Não há atalho para «as que estão perto» numa distância de Hamming: lê-se o
 * índice todo (uma ida, `like 'foto-visual:%'`, ~250 KB com 3 000 fotos) e
 * compara-se em memória (3 000 comparações por foto: microssegundos). A
 * leitura fica guardada {@link VALIDADE_DO_INDICE_MS} na instância — um lote
 * de 50 fotos do estúdio paga uma leitura, não 50.
 *
 * As regras de quem pode ser devolvido são as de `fotos-resumo.ts`: a pasta
 * DESTE pedido, ou a Biblioteca num tema vivo e com o ficheiro lá; a pasta de
 * OUTRO pedido nunca (apagar esse pedido levava a foto).
 */

export const PREFIXO_DO_INDICE_VISUAL = "foto-visual:";
const LINHAS = 64;
/** Quantas impressões uma pergunta pode trazer (a rota da importação). */
export const MAX_IMPRESSOES_POR_PERGUNTA = 60;
/** Quanto tempo a leitura do índice serve, numa instância. */
export const VALIDADE_DO_INDICE_MS = 5 * 60_000;
/** Quantas candidatas se verificam no Storage, por foto, antes de desistir. */
const CANDIDATAS_A_VERIFICAR = 3;

export function linhaDe(caminho: string): string {
  const n = createHash("sha1").update(caminho).digest()[0] % LINHAS;
  return `${PREFIXO_DO_INDICE_VISUAL}${n.toString(16).padStart(2, "0")}`;
}

type Linha = Record<string, string>;

/** Sem estreitar o tipo (o `ehRefDeTema` é um guarda de tipo). */
const eTema = (c: string): boolean => ehRefDeTema(c);

function linhaValida(v: unknown): Linha {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Linha = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (typeof k === "string" && k && (x === "" || eImpressao(x))) out[k] = x as string;
  }
  return out;
}

/* ── A impressão no servidor ──────────────────────────────────────────────── */

/**
 * A impressão de uns bytes de imagem, no servidor. O `sharp` reduz logo ao
 * descodificar (num JPEG, o «shrink-on-load» lê 1/8 dos píxeis), por isso
 * custa poucos milissegundos mesmo num original de 2 000 px.
 * `null` quando não se consegue ler — nunca lança.
 */
export async function impressaoDosBytes(bytes: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(bytes, { failOn: "none" })
      .rotate()
      .resize(LADO_DE_TRABALHO, LADO_DE_TRABALHO, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 3) return null;
    return impressaoDePixeis(data, info.width, info.height, 3);
  } catch {
    return null;
  }
}

/* ── O índice em memória ─────────────────────────────────────────────────── */

let guardado: { em: number; entradas: Map<string, string> } | null = null;

/** Só para os testes. */
export function esquecerIndiceVisual(): void {
  guardado = null;
}

/** O índice inteiro (caminho → impressão). `null` = não se conseguiu ler. */
export async function lerIndiceVisual(agora = Date.now()): Promise<Map<string, string> | null> {
  if (guardado && agora - guardado.em < VALIDADE_DO_INDICE_MS) return guardado.entradas;
  const { entradas, completa } = await listStateByPrefix<unknown>(
    PREFIXO_DO_INDICE_VISUAL,
    LINHAS * 2,
  );
  if (!completa && entradas.length === 0) return null;
  const mapa = new Map<string, string>();
  for (const e of entradas)
    for (const [k, v] of Object.entries(linhaValida(e.value))) mapa.set(k, v);
  guardado = { em: agora, entradas: mapa };
  return mapa;
}

/**
 * Muda várias entradas de UMA linha, com compare-and-set (até 4 tentativas).
 * `null` como valor tira a entrada. Melhor esforço: devolve se gravou.
 */
async function mudarLinha(
  chave: string,
  mudancas: ReadonlyMap<string, string | null>,
): Promise<boolean> {
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    let lida: { valor: unknown; versao: string | null };
    try {
      lida = await lerEstadoComVersao<unknown>(chave, 4_000);
    } catch {
      return false;
    }
    const linha = linhaValida(lida.valor);
    let mudou = false;
    for (const [k, v] of mudancas) {
      if (v === null) {
        if (k in linha) {
          delete linha[k];
          mudou = true;
        }
      } else if (linha[k] !== v) {
        linha[k] = v;
        mudou = true;
      }
    }
    if (!mudou) return true;
    const r = await gravarEstadoSeNaoMudou(chave, linha, lida.versao);
    if (r === "gravado") return true;
    if (r === "falhou") return false;
  }
  return false;
}

/** Aplica mudanças a várias linhas, agrupadas. Devolve quantas entradas ficaram gravadas. */
async function mudarEntradas(mudancas: ReadonlyMap<string, string | null>): Promise<number> {
  const porLinha = new Map<string, Map<string, string | null>>();
  for (const [k, v] of mudancas) {
    const l = linhaDe(k);
    const m = porLinha.get(l) ?? new Map();
    m.set(k, v);
    porLinha.set(l, m);
  }
  let feitas = 0;
  for (const [l, m] of porLinha) {
    if (await mudarLinha(l, m)) {
      feitas += m.size;
      // A cópia desta instância acompanha o que se escreveu.
      if (guardado) {
        for (const [k, v] of m) {
          if (v === null) guardado.entradas.delete(k);
          else guardado.entradas.set(k, v);
        }
      }
    }
  }
  return feitas;
}

/**
 * Regista a impressão de uma fotografia GUARDADA. Só o servidor chama isto,
 * com uma impressão que ele próprio calculou sobre os bytes guardados.
 * Nunca lança.
 */
export async function registarImpressao(caminho: string, impressao: string | null): Promise<void> {
  if (!caminho || !impressao || !eImpressao(impressao)) return;
  try {
    await mudarEntradas(new Map([[caminho, impressao]]));
  } catch (e) {
    log.warn("fotos-parecidas: impressão não registada", { caminho, erro: String(e) });
  }
}

/* ── Procurar ────────────────────────────────────────────────────────────── */

export interface Parecida {
  /** Onde a fotografia já está: `<pedido>/<x>.jpg` ou `tema:<…>`. */
  caminho: string;
  veredicto: Exclude<Veredicto, "outra">;
  distancias: Distancias;
}

/** Ordem das candidatas: «mesma» primeiro, depois a composição, depois o pormenor. */
function melhorPrimeiro(a: Parecida, b: Parecida): number {
  if (a.veredicto !== b.veredicto) return a.veredicto === "mesma" ? -1 : 1;
  return a.distancias.grossa - b.distancias.grossa || a.distancias.fina - b.distancias.fina;
}

/**
 * As candidatas de UMA impressão, já ordenadas, sem verificar no Storage
 * (puro — testado). `quoteId` nulo = só a Biblioteca conta.
 */
export function candidatasNoIndice(
  impressao: string,
  indice: ReadonlyMap<string, string>,
  quoteId: string | null,
): Parecida[] {
  if (!eImpressao(impressao)) return [];
  const safeId = quoteId ? quoteId.replace(/[^a-zA-Z0-9_-]/g, "") : "";
  const out: Parecida[] = [];
  for (const [caminho, imp] of indice) {
    if (!imp) continue;
    const daBiblioteca = eTema(caminho);
    if (!daBiblioteca && !(safeId && caminho.startsWith(`${safeId}/`))) continue;
    const d = distancias(impressao, imp);
    const v = veredicto(d);
    if (v === "outra") continue;
    out.push({ caminho, veredicto: v, distancias: d });
  }
  return out.sort(melhorPrimeiro);
}

/**
 * Destas impressões (calculadas no navegador OU no servidor — só servem para
 * procurar), qual é a fotografia guardada mais parecida, se houver uma
 * «mesma» ou «talvez»? Só devolve caminhos verificados: o tema está vivo e o
 * ficheiro está lá. Nunca lança; «não sei» devolve vazio.
 */
export async function procurarParecidas(
  impressoes: readonly unknown[],
  quoteId: string | null,
): Promise<Map<string, Parecida>> {
  const saida = new Map<string, Parecida>();
  const pedidas = [...new Set(impressoes.filter(eImpressao))].slice(0, MAX_IMPRESSOES_POR_PERGUNTA);
  if (pedidas.length === 0) return saida;
  let indice: Map<string, string> | null;
  try {
    indice = await lerIndiceVisual();
  } catch {
    return saida;
  }
  if (!indice || indice.size === 0) return saida;

  const temaVivo = new Map<string, Promise<boolean>>();
  const vivo = (pasta: string) => {
    let p = temaVivo.get(pasta);
    if (!p) {
      p = getTheme(pasta)
        .then((t) => !!t && t.arquivado !== true)
        .catch(() => false);
      temaVivo.set(pasta, p);
    }
    return p;
  };
  const verificado = new Map<string, Promise<boolean>>();
  const serve = (caminho: string): Promise<boolean> => {
    let p = verificado.get(caminho);
    if (!p) {
      p = (async () => {
        if (ehRefDeTema(caminho)) {
          const c = caminhoDoRefDeTema(caminho);
          const pasta = c.slice(0, c.indexOf("/"));
          if (!pasta || !(await vivo(pasta))) return false;
          return (await existe(THEME_BUCKET, c)) === true;
        }
        return (await existe(PROPOSAL_BUCKET, caminho)) === true;
      })().catch(() => false);
      verificado.set(caminho, p);
    }
    return p;
  };

  for (const imp of pedidas) {
    const candidatas = candidatasNoIndice(imp, indice, quoteId).slice(0, CANDIDATAS_A_VERIFICAR);
    for (const c of candidatas) {
      if (await serve(c.caminho)) {
        saida.set(imp, c);
        break;
      }
    }
  }
  return saida;
}

/* ── O preenchimento da noite ────────────────────────────────────────────── */

/** O caminho (na forma do índice) de uma entrada do manifesto, ou `null`. */
export function caminhoDaEntrada(chave: string): string | null {
  const i = chave.indexOf("/");
  if (i <= 0) return null;
  const bucket = chave.slice(0, i);
  const resto = chave.slice(i + 1);
  if (!resto || !/\.(jpe?g|png|webp)$/i.test(resto)) return null;
  if (bucket === THEME_BUCKET) return refDeTema(resto);
  if (bucket === PROPOSAL_BUCKET) return resto;
  return null;
}

export interface ResultadoDoPreenchimento {
  /** Fotografias guardadas (originais) que o manifesto conhece. */
  fotos: number;
  /** Quantas já estavam no índice antes desta noite. */
  jaTinham: number;
  /** Quantas se calcularam esta noite. */
  calculadas: number;
  /** Quantas não tinham miniatura nem média (ficam marcadas, sem impressão). */
  semMiniatura: number;
  /** Entradas de fotografias que já não existem, tiradas do índice. */
  esquecidas: number;
  /** Quantas faltam (ficam para a noite seguinte). */
  faltam: number;
  /** Parou pelo tempo ou pelo tecto da noite. */
  parou: "tempo" | "tecto" | null;
}

export interface OpcoesDoPreenchimento {
  /** Tecto de tempo (ms) — a tarefa da noite tem mais que fazer. */
  prazoMs: number;
  /** Tecto de fotografias por noite. */
  maximo?: number;
  /** Quantas de cada vez (lê, calcula, grava). */
  lote?: number;
  /** Para os testes: o relógio e a leitura dos bytes. */
  agora?: () => number;
  lerMiniatura?: (caminho: string) => Promise<Buffer | null>;
}

/** A média de 1 200 px guardada (~100–200 KB), ou `null`. Nunca lança. */
async function lerMediaGuardada(caminho: string): Promise<Buffer | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const daBiblioteca = ehRefDeTema(caminho);
  try {
    const { data, error } = await sb.storage
      .from(daBiblioteca ? THEME_MID_BUCKET : PROPOSAL_MID_BUCKET)
      .download(daBiblioteca ? caminhoDoRefDeTema(caminho) : caminho);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Por omissão: a miniatura de 400 px (dezenas de KB) e, só se faltar, a média
 * de 1 200 px. Nunca o original.
 */
async function lerMiniaturaGuardada(caminho: string): Promise<Buffer | null> {
  return (await fetchProposalThumbBytes(caminho)) ?? (await lerMediaGuardada(caminho));
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS ANTIGAS ENTRAM NO ÍNDICE, AOS LOTES, DE NOITE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Usa o manifesto que a cópia da noite já fez (nenhuma listagem a mais). Para
 * cada original que ainda não está no índice, lê a MINIATURA guardada (400 px,
 * dezenas de KB — nunca o original), calcula a impressão e grava-a. Pára no
 * tecto de tempo ou de fotos; o que faltar fica para a noite seguinte. Com o
 * manifesto completo, tira também do índice o que já não existe.
 *
 * Quando tudo tiver impressão, cada noite só faz as novas que o carregamento
 * não registou (nenhuma, normalmente) — e o custo cai para a leitura do índice.
 */
export async function preencherImpressoes(
  manifesto: Pick<ManifestoDeFotografias, "entradas" | "completo">,
  opcoes: OpcoesDoPreenchimento,
): Promise<ResultadoDoPreenchimento> {
  const agora = opcoes.agora ?? Date.now;
  const inicio = agora();
  const maximo = opcoes.maximo ?? 600;
  const lote = Math.max(1, opcoes.lote ?? 20);
  const ler = opcoes.lerMiniatura ?? lerMiniaturaGuardada;

  // O índice como está AGORA (sem a cópia da instância).
  esquecerIndiceVisual();
  const indice = (await lerIndiceVisual(inicio)) ?? new Map<string, string>();
  const existentes = new Set<string>();
  for (const e of manifesto.entradas) {
    const c = caminhoDaEntrada(e.chave);
    if (c) existentes.add(c);
  }
  const res: ResultadoDoPreenchimento = {
    fotos: existentes.size,
    jaTinham: 0,
    calculadas: 0,
    semMiniatura: 0,
    esquecidas: 0,
    faltam: 0,
    parou: null,
  };

  // O que já não existe sai — só com o manifesto completo (um incompleto faria
  // dar por apagadas fotografias que existem).
  if (manifesto.completo) {
    const mortas = new Map<string, null>();
    for (const k of indice.keys()) if (!existentes.has(k)) mortas.set(k, null);
    if (mortas.size > 0) res.esquecidas = await mudarEntradas(mortas);
  }

  const porFazer: string[] = [];
  for (const c of existentes) {
    if (indice.has(c)) res.jaTinham++;
    else porFazer.push(c);
  }
  // Ordem estável: as mesmas noites retomam onde a anterior parou.
  porFazer.sort();

  let i = 0;
  while (i < porFazer.length) {
    if (res.calculadas + res.semMiniatura >= maximo) {
      res.parou = "tecto";
      break;
    }
    if (agora() - inicio >= opcoes.prazoMs) {
      res.parou = "tempo";
      break;
    }
    const fatia = porFazer.slice(i, i + Math.min(lote, maximo - res.calculadas - res.semMiniatura));
    i += fatia.length;
    const novas = new Map<string, string>();
    for (const c of fatia) {
      const bytes = await ler(c).catch(() => null);
      const imp = bytes ? await impressaoDosBytes(bytes) : null;
      novas.set(c, imp ?? "");
    }
    await mudarEntradas(novas);
    for (const v of novas.values()) {
      if (v) res.calculadas++;
      else res.semMiniatura++;
    }
  }
  res.faltam = porFazer.length - i;
  return res;
}
