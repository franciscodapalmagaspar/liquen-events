"use client";

import { impressaoDePixeis, ladoReduzido } from "@/lib/impressao-visual";
import type { FotoAPerguntar, RespostaDasGuardadas } from "@/lib/importar-proposta/parecidas";
import type { EspacoNoArmazenamento } from "@/lib/ocupacao-do-armazenamento-regras";

/**
 * A impressão visual de uma fotografia, calculada NO NAVEGADOR (canvas) — a
 * mesma regra do servidor (`impressao-visual.ts`), sobre uma versão de
 * {@link ladoReduzido} px. Só serve para PERGUNTAR ao servidor se já existe
 * uma parecida: nunca entra no índice. ~10–30 ms por foto (a descodificação).
 *
 * `null` quando o navegador não a consegue ler — e aí a foto é tratada como
 * nova, como antes disto existir.
 */
export async function impressaoDoFicheiro(f: Blob): Promise<string | null> {
  let bmp: ImageBitmap | null = null;
  try {
    // A orientação EXIF aplica-se por omissão (como o `rotate()` do servidor).
    bmp = await createImageBitmap(f);
    const { w, h } = ladoReduzido(bmp.width, bmp.height);
    const canvas: OffscreenCanvas | HTMLCanvasElement =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement("canvas"), { width: w, height: h });
    const ctx = canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) return null;
    // A transparência sobre branco, como o `flatten` do servidor.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, w, h);
    return impressaoDePixeis(ctx.getImageData(0, 0, w, h).data, w, h, 4);
  } catch {
    return null;
  } finally {
    bmp?.close();
  }
}

/** Por pergunta: o tecto da rota (60 resumos e 60 impressões). */
const POR_PERGUNTA = 60;

/**
 * Pergunta ao servidor quais destas fotografias já estão guardadas — pelo
 * resumo exacto e pela impressão visual — e quanto espaço sobra até ao
 * travão. Melhor esforço: uma falha devolve respostas vazias e tudo sobe
 * como novo (o servidor ainda apanha, ao receber, a que for a mesma).
 */
export async function perguntarGuardadas(
  fotos: readonly FotoAPerguntar[],
): Promise<{ resposta: RespostaDasGuardadas; espaco: EspacoNoArmazenamento | null }> {
  const resposta: RespostaDasGuardadas = { existentes: {}, parecidas: {} };
  let espaco: EspacoNoArmazenamento | null = null;
  const lotes = Math.max(1, Math.ceil(fotos.length / POR_PERGUNTA));
  for (let i = 0; i < lotes; i++) {
    const lote = fotos.slice(i * POR_PERGUNTA, (i + 1) * POR_PERGUNTA);
    try {
      const res = await fetch("/api/orcamento/fotos-existentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumos: lote.map((f) => f.resumo).filter(Boolean),
          impressoes: lote.filter((f) => f.impressao).map((f) => f.impressao),
          lados: lote.filter((f) => f.impressao).map((f) => f.lado ?? 0),
        }),
      });
      const dados = res.ok ? await res.json().catch(() => null) : null;
      if (dados?.existentes) Object.assign(resposta.existentes, dados.existentes);
      if (dados?.parecidas) Object.assign(resposta.parecidas, dados.parecidas);
      if (dados?.espaco) espaco = dados.espaco as EspacoNoArmazenamento;
    } catch {
      /* não se sabe — sobem, como antes */
    }
  }
  return { resposta, espaco };
}
