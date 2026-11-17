import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { semProtegidos } from "@/lib/arquivo-de-pdfs/protegidos";
import { BALDES_DO_BLOB, chaveNoBlob, idDaLoja, type BaldeDoBlob } from "./baldes";
import { modoDoBalde } from "./modos";
import {
  chaveDoIndice,
  indiceDebaixoDe,
  lerDoIndice,
  linhaValida,
  type LinhaDoIndice,
} from "./indice";
import { gravarEstadoSeNaoMudou, lerEstadoComVersao } from "@/lib/app-state";
import {
  BlobAvariado,
  BlobRecusado,
  apagarDoBlob,
  cabecalhoNoBlob,
  lerDoBlob,
  porNoBlob,
} from "./blob";
import { acertarBytes } from "./uso";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MUDANÇA DO SUPABASE PARA O BLOB — aos bocados, e só com prova
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ordem (a mesma da secção «O Blob» do `GASTAR-POUCO-DESDE-O-INICIO.md`):
 * verificar a ligação → `espelho` → copiar → `blob` → verificar → libertar.
 *
 * Cada chamada é CURTA (cabe numa função da Vercel): faz até `n` ficheiros
 * ou até ao prazo, e devolve `proximo` — o último caminho tratado — para a
 * chamada seguinte continuar dali. Percorre o SUPABASE (as listagens dele são
 * de graça para o Blob), pasta a pasta, por ordem.
 *
 * A REGRA QUE NÃO SE DOBRA: do Supabase só sai o que está no Blob COM PROVA.
 *  - `copiar` lê do Supabase, calcula o sha256, escreve no Blob, VOLTA A LER
 *    do Blob e compara tamanho e sha256. Só então escreve a linha do índice
 *    com `v: true`. Uma diferença apaga a cópia do Blob e fica como falha.
 *  - `libertar` só corre com o balde em modo `blob`; só toca no que tem
 *    `v: true` no índice, com o mesmo tamanho e o mesmo MD5 no Supabase (um
 *    original mexido depois da cópia não sai); confirma no Blob, com um HEAD,
 *    que o tamanho é o mesmo; e passa pela lista do que nenhuma limpeza pode
 *    levar (`protegidos.ts`). Só depois apaga — do Supabase, nunca do Blob.
 */

export interface ObjectoNoSupabase {
  caminho: string;
  tamanho: number;
  /** MD5 em hex, quando o eTag o é (envio simples); `null` num envio em partes. */
  md5: string | null;
  criadoEm: string;
  atualizadoEm: string;
  tipo?: string;
  /** O `max-age` do Supabase, em segundos (a cópia no Blob leva o mesmo). */
  cacheSegundos?: number;
}

/** Compara caminhos pasta a pasta (`a/b` vem antes de `a-b/c`?), como o percurso os visita. */
export function compararCaminhos(a: string, b: string): number {
  const pa = a.split("/");
  const pb = b.split("/");
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return pa.length - pb.length;
}

function md5DoEtag(etag: unknown): string | null {
  const s = typeof etag === "string" ? etag.replace(/"/g, "").toLowerCase() : "";
  return /^[0-9a-f]{32}$/.test(s) ? s : null;
}

/**
 * Percorre o balde do Supabase por ordem, a começar DEPOIS de `depois`, e
 * chama `visitar` para cada ficheiro até ele devolver `false` ou o prazo
 * acabar. Devolve se chegou ao fim do balde.
 */
export async function percorrerSupabase(
  sb: SupabaseClient,
  balde: string,
  depois: string | null,
  ateMs: number,
  visitar: (o: ObjectoNoSupabase) => Promise<boolean>,
): Promise<{ fim: boolean; erro?: string }> {
  const raiz = sb.storage.from(balde);
  const pastaAdiantada = (pasta: string) => {
    if (!depois) return false;
    const dp = depois.split("/");
    const fp = pasta.split("/");
    // A pasta acaba antes do cursor: já foi toda vista.
    return compararCaminhos(fp.join("/"), dp.slice(0, fp.length).join("/")) < 0;
  };
  async function andar(pasta: string, fundura: number): Promise<"seguir" | "parar" | "erro"> {
    const entradas: {
      name: string;
      id: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string | null;
      updated_at: string | null;
    }[] = [];
    for (let offset = 0; ; offset += 1000) {
      if (Date.now() > ateMs) return "parar";
      const { data, error } = await raiz.list(pasta, { limit: 1000, offset });
      if (error) return "erro";
      entradas.push(...((data ?? []) as typeof entradas));
      if ((data ?? []).length < 1000) break;
    }
    entradas.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entradas) {
      if (e.name.startsWith(".")) continue;
      const caminho = pasta ? `${pasta}/${e.name}` : e.name;
      if (!e.id) {
        if (fundura <= 0 || pastaAdiantada(caminho)) continue;
        const r = await andar(caminho, fundura - 1);
        if (r !== "seguir") return r;
        continue;
      }
      if (depois && compararCaminhos(caminho, depois) <= 0) continue;
      if (Date.now() > ateMs) return "parar";
      const m = e.metadata ?? {};
      const continuar = await visitar({
        caminho,
        tamanho: Number(m.size ?? 0),
        md5: md5DoEtag(m.eTag),
        criadoEm: e.created_at ?? new Date(0).toISOString(),
        atualizadoEm: e.updated_at ?? e.created_at ?? new Date(0).toISOString(),
        tipo: typeof m.mimetype === "string" ? m.mimetype : undefined,
        cacheSegundos: Number(/max-age=(\d+)/.exec(String(m.cacheControl ?? ""))?.[1]) || undefined,
      });
      if (!continuar) return "parar";
    }
    return "seguir";
  }
  const r = await andar("", 4);
  if (r === "erro") return { fim: false, erro: "listagem do Supabase falhou" };
  return { fim: r === "seguir" };
}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const md5 = (b: Uint8Array) => createHash("md5").update(b).digest("hex");

function cliente(): SupabaseClient {
  const sb = getSupabase();
  if (!sb) throw new Error("Sem Supabase.");
  return sb;
}

/** Verifica que o token abre o store: um HEAD a um caminho que não existe tem de dar «não existe». */
export async function verificarLigacao(): Promise<{
  ligado: boolean;
  loja: string | null;
  motivo?: string;
}> {
  const loja = idDaLoja();
  if (!loja) return { ligado: false, loja: null, motivo: "sem BLOB_READ_WRITE_TOKEN" };
  try {
    await cabecalhoNoBlob(".liquen-ligacao");
    return { ligado: true, loja };
  } catch (e) {
    return {
      ligado: false,
      loja,
      motivo: e instanceof BlobRecusado ? `tecto: ${e.motivo}` : String((e as Error)?.message),
    };
  }
}

export interface ResultadoDoEnsaio {
  balde: BaldeDoBlob;
  noSupabase: { ficheiros: number; bytes: number };
  jaVerificados: { ficheiros: number; bytes: number };
  porCopiar: { ficheiros: number; bytes: number };
  completo: boolean;
}

/** Conta o que se copiaria, SEM escrever nada (nem no Blob, nem no índice). */
export async function ensaio(balde: BaldeDoBlob, prazoMs = 40_000): Promise<ResultadoDoEnsaio> {
  const sb = cliente();
  const { linhas, completa } = await indiceDebaixoDe(balde, "");
  const r: ResultadoDoEnsaio = {
    balde,
    noSupabase: { ficheiros: 0, bytes: 0 },
    jaVerificados: { ficheiros: 0, bytes: 0 },
    porCopiar: { ficheiros: 0, bytes: 0 },
    completo: false,
  };
  const p = await percorrerSupabase(sb, balde, null, Date.now() + prazoMs, async (o) => {
    r.noSupabase.ficheiros++;
    r.noSupabase.bytes += o.tamanho;
    const l = linhas.get(o.caminho);
    if (l?.v && l.t === o.tamanho) {
      r.jaVerificados.ficheiros++;
      r.jaVerificados.bytes += o.tamanho;
    } else {
      r.porCopiar.ficheiros++;
      r.porCopiar.bytes += o.tamanho;
    }
    return true;
  });
  r.completo = p.fim && completa && !p.erro;
  return r;
}

export interface ResultadoDaCopia {
  balde: BaldeDoBlob;
  copiados: number;
  jaEstavam: number;
  falhas: { caminho: string; motivo: string }[];
  bytes: number;
  /** O último caminho tratado; `null` quando o balde acabou. */
  proximo: string | null;
  paradoPeloTecto: boolean;
}

/**
 * Copia até `n` ficheiros do Supabase para o Blob, VERIFICADOS. Não apaga
 * nada do Supabase. Pode correr em qualquer modo (normalmente `espelho`).
 */
export async function copiar(
  balde: BaldeDoBlob,
  opcoes: { n: number; depois: string | null; prazoMs?: number },
): Promise<ResultadoDaCopia> {
  const sb = cliente();
  const n = Math.max(1, Math.min(50, Math.floor(opcoes.n)));
  const r: ResultadoDaCopia = {
    balde,
    copiados: 0,
    jaEstavam: 0,
    falhas: [],
    bytes: 0,
    proximo: opcoes.depois,
    paradoPeloTecto: false,
  };
  let tratados = 0;
  const p = await percorrerSupabase(
    sb,
    balde,
    opcoes.depois,
    Date.now() + (opcoes.prazoMs ?? 40_000),
    async (o) => {
      tratados++;
      r.proximo = o.caminho;
      try {
        const feito = await copiarUm(sb, balde, o);
        if (feito === "ja-estava") r.jaEstavam++;
        else {
          r.copiados++;
          r.bytes += o.tamanho;
        }
      } catch (e) {
        if (e instanceof BlobRecusado) {
          r.paradoPeloTecto = true;
          r.falhas.push({ caminho: o.caminho, motivo: `tecto: ${e.motivo}` });
          return false;
        }
        r.falhas.push({ caminho: o.caminho, motivo: String((e as Error)?.message ?? e) });
      }
      return tratados < n;
    },
  );
  if (p.fim && !r.paradoPeloTecto) {
    r.proximo = null;
    // Fim do balde: acerta-se o contador de bytes pela soma real do índice.
    await acertarTotalDoIndice().catch(() => undefined);
  }
  if (p.erro) r.falhas.push({ caminho: "", motivo: p.erro });
  return r;
}

async function copiarUm(
  sb: SupabaseClient,
  balde: BaldeDoBlob,
  o: ObjectoNoSupabase,
): Promise<"copiado" | "ja-estava"> {
  /**
   * ── COMPARE-AND-SET NO ÍNDICE (revisão de 17/11, n.º 10) ─────────────────
   * Lê-se a linha COM a versão. Entre esta leitura e a escrita no fim, uma
   * escrita em modo `blob` pode pôr no Blob uma versão mais nova do mesmo
   * caminho. Por isso: (1) quando o índice não tem linha, escreve-se no Blob
   * SEM sobrescrever — o que lá aparecer entretanto não é tocado; (2) a linha
   * só se grava se a versão for a mesma que se leu.
   */
  const chaveIdx = chaveDoIndice(balde, o.caminho);
  const lida = await lerEstadoComVersao<unknown>(chaveIdx, 4_000);
  const antes = linhaValida(lida.valor) ? lida.valor : undefined;
  if (antes?.v && antes.t === o.tamanho && (!o.md5 || antes.m === o.md5)) return "ja-estava";

  const { data, error } = await sb.storage.from(balde).download(o.caminho);
  if (error || !data) throw new Error("não se leu do Supabase");
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.byteLength !== o.tamanho) throw new Error("o Supabase deu outro tamanho");
  if (o.md5 && md5(bytes) !== o.md5) throw new Error("o MD5 do Supabase não bate");
  const resumo = sha256(bytes);

  // Já há no Blob uma versão DIFERENTE (escrita lá em modo `blob`): nunca se
  // substitui a mais nova pela do Supabase.
  if (antes?.s && antes.s !== resumo) throw new Error("no Blob há uma versão diferente");

  const chave = chaveNoBlob(balde, o.caminho);
  let escrevemos = false;
  if (!antes) {
    try {
      await porNoBlob(chave, bytes, {
        contentType: o.tipo,
        sobrescrever: false,
        cacheSegundos: o.cacheSegundos,
      });
      escrevemos = true;
    } catch (e) {
      // Já lá está um ficheiro sem linha no índice (uma cópia anterior que
      // caiu a meio, ou uma escrita que chegou agora): não se toca — a
      // releitura abaixo diz se é este.
      if (!(e instanceof BlobAvariado && e.codigo === "ja-existe")) throw e;
    }
  }
  const relido = await lerDoBlob(chave, bytes.byteLength);
  if (!relido || relido.bytes.byteLength !== bytes.byteLength || sha256(relido.bytes) !== resumo) {
    if (escrevemos) await apagarDoBlob([chave], bytes.byteLength).catch(() => undefined);
    throw new Error(
      escrevemos
        ? "a cópia no Blob não bate certo — desfeita"
        : "no Blob há outro conteúdo neste caminho — não se toca",
    );
  }
  const linha: LinhaDoIndice = {
    t: bytes.byteLength,
    m: md5(bytes),
    s: resumo,
    c: o.criadoEm,
    ...(o.tipo ? { ct: o.tipo } : {}),
    ...(o.cacheSegundos ? { cc: o.cacheSegundos } : {}),
    v: true,
    vEm: new Date().toISOString(),
  };
  const r = await gravarEstadoSeNaoMudou(chaveIdx, linha, lida.versao, 4_000);
  if (r !== "gravado") {
    // Conflito: alguém mexeu na linha entretanto — a dele ganha. Falha: sem a
    // linha, o Blob tem um ficheiro que ninguém conhece — desfaz-se, se fomos nós.
    if (r === "falhou" && escrevemos)
      await apagarDoBlob([chave], bytes.byteLength).catch(() => undefined);
    throw new Error(
      r === "conflito"
        ? "o índice mudou durante a cópia — fica o que lá está"
        : "índice não gravado — cópia desfeita",
    );
  }
  return "copiado";
}

/** Repõe o contador de bytes do Blob a partir da soma real do índice dos três baldes. */
async function acertarTotalDoIndice(): Promise<void> {
  let total = 0;
  for (const b of BALDES_DO_BLOB) {
    const { linhas, completa } = await indiceDebaixoDe(b, "");
    if (!completa) return;
    for (const l of linhas.values()) total += l.t;
  }
  await acertarBytes(total);
}

export interface ResultadoDoLibertar {
  balde: BaldeDoBlob;
  apagados: number;
  bytes: number;
  ficam: { caminho: string; motivo: string }[];
  proximo: string | null;
}

/**
 * Apaga do SUPABASE até `n` ficheiros que estão no Blob com prova. Recusa se o
 * balde não estiver em modo `blob` (com o balde noutro modo, as leituras vão
 * ao Supabase — apagar lá era perder a fotografia de vista).
 */
export async function libertar(
  balde: BaldeDoBlob,
  opcoes: { n: number; depois: string | null; prazoMs?: number },
): Promise<ResultadoDoLibertar> {
  if ((await modoDoBalde(balde)) !== "blob") {
    throw new Error(`O balde ${balde} não está em modo blob — não se liberta nada.`);
  }
  const sb = cliente();
  const n = Math.max(1, Math.min(100, Math.floor(opcoes.n)));
  const r: ResultadoDoLibertar = {
    balde,
    apagados: 0,
    bytes: 0,
    ficam: [],
    proximo: opcoes.depois,
  };
  let tratados = 0;
  const p = await percorrerSupabase(
    sb,
    balde,
    opcoes.depois,
    Date.now() + (opcoes.prazoMs ?? 40_000),
    async (o) => {
      tratados++;
      r.proximo = o.caminho;
      const motivo = await porqueFica(balde, o);
      if (motivo) {
        r.ficam.push({ caminho: o.caminho, motivo });
      } else {
        const { data, error } = await sb.storage.from(balde).remove([o.caminho]);
        if (error || !Array.isArray(data) || data.length === 0) {
          r.ficam.push({ caminho: o.caminho, motivo: "o Supabase não confirmou" });
        } else {
          r.apagados++;
          r.bytes += o.tamanho;
        }
      }
      return tratados < n;
    },
  );
  if (p.fim) r.proximo = null;
  if (p.erro) r.ficam.push({ caminho: "", motivo: p.erro });
  return r;
}

/** `null` = pode sair do Supabase. Qualquer dúvida = fica. Exportado para os testes. */
export async function porqueFica(balde: BaldeDoBlob, o: ObjectoNoSupabase): Promise<string | null> {
  if (semProtegidos(balde, [o.caminho]).length === 0) return "protegido";
  let linha: LinhaDoIndice | undefined;
  try {
    linha = (await lerDoIndice(balde, [o.caminho])).get(o.caminho);
  } catch {
    return "índice ilegível";
  }
  if (!linha) return "não está no Blob";
  if (!linha.v || !linha.s) return "cópia não verificada";
  if (linha.t !== o.tamanho) return "tamanho diferente do verificado";
  if (o.md5) {
    if (linha.m !== o.md5) return "o original mudou depois da cópia";
  } else if (!linha.vEm || o.atualizadoEm > linha.vEm) {
    return "o original mudou depois da cópia";
  }
  try {
    const h = await cabecalhoNoBlob(chaveNoBlob(balde, o.caminho));
    if (!h) return "não está no Blob (HEAD)";
    if (h.tamanho !== linha.t) return "tamanho no Blob diferente";
  } catch (e) {
    if (e instanceof BlobRecusado) return `tecto: ${e.motivo}`;
    if (e instanceof BlobAvariado) return "o Blob não respondeu";
    return "o Blob não respondeu";
  }
  return null;
}
