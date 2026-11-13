import { bytesComprimidos, lerDirectorio, type EntradaZip } from "./zip";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS SAEM DO FICHEIRO NO NAVEGADOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O ficheiro original nunca é guardado nem enviado inteiro: o navegador tira-lhe
 * as fotografias, mostra-as, e só as que ela escolher sobem — reduzidas pelo
 * caminho de sempre do estúdio (`image-prep` → `/api/orcamento/[id]/assets`).
 *
 * O `DecompressionStream("deflate-raw")` é o descompressor do próprio
 * navegador (Chrome 103+, Safari 16.4+, Firefox 113+). Tem tecto, como o do
 * servidor: uma «fotografia» que descomprime para 1 GB pára aos
 * {@link MAX_BYTES_POR_FOTO}.
 */

/** Um PowerPoint de 300 MB já não é uma proposta: é um arquivo de fotos. */
export const MAX_BYTES_DO_FICHEIRO = 300 * 1024 * 1024;
/** Por fotografia, já descomprimida. */
export const MAX_BYTES_POR_FOTO = 40 * 1024 * 1024;
/**
 * Quantas fotografias sobem por importação, no máximo.
 *
 * O armazenamento é o plano gratuito do Supabase (1 GB) e ia em 928 MB a
 * 10/11 — sobram ~70 MB, e o pedido dela é ficar «MUITO abaixo». Cada
 * fotografia ocupa 0,6–1,3 MB depois de reduzida pelo caminho do estúdio (a de
 * 2200 px, a média de 1200 e a miniatura de 400): 8 fotografias são ~5–10 MB.
 * Com 24 (o tecto de antes) eram 15–30 MB, e 2 a 4 importações acabavam o
 * espaço. Oito chegam para a capa e uma ou duas por secção; o resto junta-se
 * depois no estúdio, se ela quiser, foto a foto.
 */
export const MAX_FOTOS_POR_IMPORTACAO = 8;

/** O mínimo que se precisa de saber de cada fotografia para a escolher. */
export interface FotoParaEscolher {
  caminho: string;
  seccao: string;
  destino: "capa" | "moodboard";
}

/**
 * As fotografias ligadas por omissão: a capa primeiro, e depois as primeiras
 * de cada secção À VEZ (a 1.ª de cada uma, depois a 2.ª de cada uma…), até ao
 * tecto. Pegar simplesmente nas oito primeiras do ficheiro dava oito da mesma
 * secção e nenhuma das outras.
 *
 * @param fotos       pela ordem do documento (o que o servidor devolveu).
 * @param disponiveis os caminhos que o navegador conseguiu ler.
 */
export function escolhaPorOmissao(
  fotos: readonly FotoParaEscolher[],
  disponiveis: ReadonlySet<string>,
  maximo = MAX_FOTOS_POR_IMPORTACAO,
): string[] {
  const usaveis = fotos.filter((f) => disponiveis.has(f.caminho));
  const escolhidas: string[] = [];
  for (const f of usaveis) {
    if (f.destino === "capa" && escolhidas.length < maximo) escolhidas.push(f.caminho);
  }
  const porSeccao = new Map<string, string[]>();
  for (const f of usaveis) {
    if (f.destino === "capa") continue;
    const lista = porSeccao.get(f.seccao) ?? [];
    lista.push(f.caminho);
    porSeccao.set(f.seccao, lista);
  }
  const listas = [...porSeccao.values()];
  for (let volta = 0; escolhidas.length < maximo; volta++) {
    let houve = false;
    for (const l of listas) {
      if (volta < l.length) {
        houve = true;
        if (escolhidas.length < maximo) escolhidas.push(l[volta]);
      }
    }
    if (!houve) break;
  }
  return escolhidas;
}

/**
 * Liga ou desliga uma fotografia — e nunca deixa passar do tecto. Devolve
 * `null` quando a pedida seria a (máximo + 1).ª: o ecrã diz porquê.
 */
export function alternarFoto(
  escolhidas: ReadonlySet<string>,
  caminho: string,
  maximo = MAX_FOTOS_POR_IMPORTACAO,
): Set<string> | null {
  const n = new Set(escolhidas);
  if (n.has(caminho)) {
    n.delete(caminho);
    return n;
  }
  if (n.size >= maximo) return null;
  n.add(caminho);
  return n;
}

/** As que sobem, pela ordem do documento — e nunca mais do que o tecto. */
export function fotosASubir<T extends { caminho: string }>(
  fotos: readonly T[],
  escolhidas: ReadonlySet<string>,
  maximo = MAX_FOTOS_POR_IMPORTACAO,
): T[] {
  return fotos.filter((f) => escolhidas.has(f.caminho)).slice(0, maximo);
}
/** Abaixo disto (lado mais curto) é um logótipo ou um ícone, não uma foto. */
export const LADO_MINIMO = 300;

const TIPOS: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** O tipo de imagem que o estúdio aceita, pelo nome; `null` para EMF, WMF, TIFF, SVG… */
export function tipoDaImagem(caminho: string): string | null {
  const ext = /\.([a-z0-9]+)$/i.exec(caminho)?.[1]?.toLowerCase() ?? "";
  return TIPOS[ext] ?? null;
}

/** Largura e altura pelo cabeçalho do PNG ou do JPEG, sem descodificar. */
export function dimensoesDoCabecalho(b: Uint8Array): { w: number; h: number } | null {
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { w: v.getUint32(16), h: v.getUint32(20) };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const m = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      // SOF0..SOF15, menos DHT (C4), JPG (C8) e DAC (CC).
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      }
      if (len < 2) return null;
      i += 2 + len;
    }
  }
  return null;
}

export type Inflar = (cru: Uint8Array, maximo: number) => Promise<Uint8Array>;

export const inflarNoNavegador: Inflar = async (cru, maximo) => {
  const fluxo = new Blob([cru as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const leitor = fluxo.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > maximo) {
      await leitor.cancel().catch(() => {});
      throw new Error("grande demais");
    }
    partes.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of partes) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

export type MotivoDeFora = "formato" | "pequena" | "ilegivel";

export interface FotoDoFicheiro {
  caminho: string;
  ficheiro: File;
  largura?: number;
  altura?: number;
}

export interface FotosLidas {
  fotos: FotoDoFicheiro[];
  /** As que ficaram de fora, e porquê. */
  deFora: { caminho: string; motivo: MotivoDeFora }[];
}

/**
 * Tira do ficheiro original as imagens pedidas (pela ordem pedida), já como
 * `File` com o tipo certo. Os logótipos e ícones, os formatos que o PDF não
 * imprime e as entradas estragadas ficam de fora — e diz-se quais.
 */
export async function fotosDoFicheiro(
  bytes: Uint8Array,
  caminhos: readonly string[],
  inflar: Inflar = inflarNoNavegador,
): Promise<FotosLidas> {
  const porNome = new Map<string, EntradaZip>();
  for (const e of lerDirectorio(bytes)) porNome.set(e.nome, e);
  const fotos: FotoDoFicheiro[] = [];
  const deFora: FotosLidas["deFora"] = [];
  for (const caminho of caminhos) {
    const e = porNome.get(caminho);
    const tipo = tipoDaImagem(caminho);
    if (!tipo) {
      deFora.push({ caminho, motivo: "formato" });
      continue;
    }
    if (!e || e.tamanhoReal > MAX_BYTES_POR_FOTO) {
      deFora.push({ caminho, motivo: "ilegivel" });
      continue;
    }
    let dados: Uint8Array;
    try {
      const cru = bytesComprimidos(bytes, e);
      dados =
        e.metodo === 0
          ? cru.slice()
          : e.metodo === 8
            ? await inflar(cru, MAX_BYTES_POR_FOTO)
            : new Uint8Array();
    } catch {
      deFora.push({ caminho, motivo: "ilegivel" });
      continue;
    }
    if (!dados.length) {
      deFora.push({ caminho, motivo: "ilegivel" });
      continue;
    }
    const dim = dimensoesDoCabecalho(dados);
    if (dim && Math.min(dim.w, dim.h) < LADO_MINIMO) {
      deFora.push({ caminho, motivo: "pequena" });
      continue;
    }
    const nome = caminho.split("/").pop() || "foto.jpg";
    fotos.push({
      caminho,
      ficheiro: new File([dados as BlobPart], nome, { type: tipo }),
      ...(dim ? { largura: dim.w, altura: dim.h } : {}),
    });
  }
  return { fotos, deFora };
}
