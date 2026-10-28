import "server-only";
import { chaveDoGuardado, guardadoOuCalculado } from "./guardado";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ONDE RECORTAR UMA FOTOGRAFIA QUE ELA NÃO ENQUADROU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (28/10): «há aqui muitas fotos que parece que estão comidas… porque
 * devia estar na vertical ou na horizontal». No telemóvel, a capa, a citação
 * e os cartões dos serviços são espaços AO ALTO, e uma foto deitada mostra só
 * uma faixa dela. O PDF recorta pela atenção do `sharp` (o sítio com mais
 * detalhe e cor — `imagens.ts`); a página recortava sempre pelo CENTRO, e o
 * centro de uma mesa comprida é muitas vezes uma toalha.
 *
 * Aqui pergunta-se ao mesmo `sharp`, sobre a miniatura (400 px), onde está o
 * que interessa, e a página recorta por esse ponto (`object-position`).
 * Calcula-se uma vez por proposta e fica guardado (`guardado.ts`) — nenhuma
 * visita volta a fazer esta conta. Uma foto que ela enquadrou à mão não passa
 * por aqui: o foco dela manda.
 */

export interface PontoDeInteresse {
  /** 0–1 da largura. */
  x: number;
  /** 0–1 da altura. */
  y: number;
}

/**
 * O ponto, a partir do que o `sharp` diz depois de recortar com a estratégia
 * de atenção. `attentionX/Y` vêm em pixéis da imagem já redimensionada (antes
 * do recorte): divide-se por essas medidas. `null` quando não veio nada.
 */
export function pontoDaAtencao(
  info: { attentionX?: number; attentionY?: number },
  largura: number,
  altura: number,
): PontoDeInteresse | null {
  if (
    typeof info.attentionX !== "number" ||
    typeof info.attentionY !== "number" ||
    !(largura > 0) ||
    !(altura > 0)
  )
    return null;
  const limitar = (v: number) => Math.min(1, Math.max(0, v));
  return {
    x: Math.round(limitar(info.attentionX / largura) * 1000) / 1000,
    y: Math.round(limitar(info.attentionY / altura) * 1000) / 1000,
  };
}

async function pontoDeUmaFoto(url: string): Promise<PontoDeInteresse | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const bytes = Buffer.from(await r.arrayBuffer());
    const { default: sharp } = await import("sharp");
    const meta = await sharp(bytes).rotate().metadata();
    const w = meta.autoOrient?.width ?? meta.width ?? 0;
    const h = meta.autoOrient?.height ?? meta.height ?? 0;
    if (!w || !h) return null;
    // Um recorte estreito e alto à escala 1: o `sharp` procura o ponto nas
    // duas direcções, e a escala 1 deixa ler as coordenadas na imagem toda.
    const { info } = await sharp(bytes)
      .rotate()
      .resize(Math.max(1, Math.round(Math.min(w, h * 0.4))), h, {
        fit: "cover",
        position: "attention",
      })
      .toBuffer({ resolveWithObject: true });
    return pontoDaAtencao(info as { attentionX?: number; attentionY?: number }, w, h);
  } catch {
    return null;
  }
}

/**
 * Os pontos de interesse das fotografias dadas (`ref` → endereço da
 * miniatura), quatro de cada vez. Nunca lança: sem ponto, a página recorta
 * pelo centro, como sempre.
 */
export async function pontosDeInteresse(
  proposalId: string,
  fotos: readonly { ref: string; url: string }[],
): Promise<Map<string, PontoDeInteresse>> {
  if (fotos.length === 0) return new Map();
  const refs = [...new Set(fotos.map((f) => f.ref))].sort();
  try {
    const guardados = await guardadoOuCalculado(
      chaveDoGuardado("pontos", proposalId, ...refs),
      async () => {
        const saida: Record<string, PontoDeInteresse> = {};
        const fila = [...fotos];
        await Promise.all(
          Array.from({ length: 4 }, async () => {
            for (let f = fila.shift(); f; f = fila.shift()) {
              if (saida[f.ref]) continue;
              const p = await pontoDeUmaFoto(f.url);
              if (p) saida[f.ref] = p;
            }
          }),
        );
        return saida;
      },
      // Nenhum ponto (armazenamento em baixo): não fica guardado.
      (r) => Object.keys(r).length > 0,
    );
    return new Map(Object.entries(guardados));
  } catch (e) {
    log.warn("proposta online: os pontos de interesse não se calcularam", { erro: e });
    return new Map();
  }
}
