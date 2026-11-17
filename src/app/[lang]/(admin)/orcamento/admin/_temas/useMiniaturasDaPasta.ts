import { type Dispatch, type RefObject, type SetStateAction } from "react";
import type { ThemeImage, ThemeSummary } from "@/lib/theme-types";
import { THEME_PAGE_SIZE } from "@/lib/theme-types";
import { type AccaoDoAviso } from "../Toast";
import { ThumbJob } from "./tipos-da-pasta";
import { plural } from "@/lib/plural";
import { MAX_THUMB_BATCHES, MAX_BAD_BATCHES, MAX_REFRESH_PAGES } from "./tectos-da-pasta";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS MINIATURAS DA PASTA — refazer as que faltam
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Refazer as miniaturas das fotos à vista e o trabalho de fundo que gera
 * as que faltam à pasta inteira, com a barra de progresso e o «Parar».
 *
 * Saiu do corpo do `ThemeFolder`, no `Temas.tsx` (fase 8 de
 * `docs/ESTRUTURA-DO-CODIGO.md`), tal e qual, e é chamado NO MESMO SÍTIO onde o
 * código estava: a ordem dos hooks e dos efeitos da pasta não muda. Os nomes
 * ficam os de lá.
 */
export interface EntradasMiniaturasDaPasta {
  theme: ThemeSummary;
  toast: (message: string, kind?: "success" | "error" | "info", accao?: AccaoDoAviso) => void;
  setImages: Dispatch<SetStateAction<ThemeImage[]>>;
  images: ThemeImage[];
  total: number | null;
  thumbJob: ThumbJob | null;
  setThumbJob: Dispatch<SetStateAction<ThumbJob | null>>;
  alive: RefObject<boolean>;
  stopThumbs: RefObject<boolean>;
}

export function useMiniaturasDaPasta({
  theme,
  toast,
  setImages,
  images,
  total,
  thumbJob,
  setThumbJob,
  alive,
  stopThumbs,
}: EntradasMiniaturasDaPasta) {
  /**
   * Volta a pedir as páginas que estão à vista, para a grelha passar a mostrar
   * as miniaturas acabadas de gerar em vez dos originais.
   *
   * Substitui cada foto pela mesma foto (a chave é o `path`), por isso não
   * mexe na ordem, na seleção, nem no que subiu entretanto. Só as primeiras
   * `MAX_REFRESH_PAGES`: quem tiver aberto mais do que 300 fotos vê o resto
   * aliviado no próximo carregamento da página — e voltar a assinar 4000 URLs
   * para isso seria trocar um problema por outro.
   */
  async function refreshVisibleThumbs(count: number) {
    const pages = Math.min(Math.ceil(count / THEME_PAGE_SIZE), MAX_REFRESH_PAGES);
    const fresh = new Map<string, ThemeImage>();
    for (let p = 0; p < pages; p++) {
      try {
        const res = await fetch(
          `/api/temas/${theme.id}/imagens?offset=${p * THEME_PAGE_SIZE}&limit=${THEME_PAGE_SIZE}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = await res.json();
        for (const im of (Array.isArray(data?.images) ? data.images : []) as ThemeImage[]) {
          if (im?.path) fresh.set(im.path, im);
        }
      } catch {
        return;
      }
    }
    if (!alive.current || fresh.size === 0) return;
    setImages((prev) => prev.map((im) => fresh.get(im.path) ?? im));
    // A cópia local deixa de ser precisa para as que passaram a ter miniatura:
    // a partir daqui a grelha mostra a miniatura do servidor, como qualquer
    // outra foto. (Os URLs de objeto são libertados à saída da pasta.)
  }

  /**
   * GERAR AS MINIATURAS QUE FALTAM.
   *
   * Um pedido por lote, com o cursor que o servidor devolve. Parece
   * complicado e é o que torna isto usável: cada pedido é curto (o ecrã nunca
   * congela), fechar o separador não perde nada (recomeça-se do princípio e o
   * que já está feito é saltado), e o que falha é contado à vista em vez de
   * desaparecer.
   */
  async function runThumbJob() {
    if (thumbJob?.running) return;
    stopThumbs.current = false;
    let cursor = 0;
    let scanned = 0;
    let generated = 0;
    let failedCount = 0;
    let badBatches = 0;
    let complete = false;
    setThumbJob({
      running: true,
      cursor,
      scanned,
      generated,
      failed: failedCount,
      total,
      complete: false,
    });
    try {
      for (let batch = 0; batch < MAX_THUMB_BATCHES; batch++) {
        if (!alive.current || stopThumbs.current) break;
        let data: {
          scanned?: number;
          generated?: number;
          failed?: number;
          nextCursor?: number | null;
          total?: number | null;
        } | null = null;
        try {
          const res = await fetch(`/api/temas/${theme.id}/miniaturas`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cursor }),
          });
          const body = await res.json().catch(() => null);
          if (!res.ok) {
            toast(
              body?.error ||
                "Não foi possível gerar as miniaturas agora. O que já foi feito fica guardado.",
              "error",
            );
            break;
          }
          data = body;
        } catch {
          toast("Erro de ligação ao gerar as miniaturas. Podes continuar mais tarde.", "error");
          break;
        }
        scanned += data?.scanned ?? 0;
        generated += data?.generated ?? 0;
        failedCount += data?.failed ?? 0;
        // Lotes seguidos em que NADA se gerou e tudo falhou = o problema não é
        // a foto, é o Storage. Continuar seria percorrer 4000 fotos a falhar
        // em silêncio, com a barra a andar como se estivesse a fazer algo.
        badBatches = (data?.generated ?? 0) === 0 && (data?.failed ?? 0) > 0 ? badBatches + 1 : 0;
        if (badBatches >= MAX_BAD_BATCHES) {
          toast(
            "As miniaturas não estão a ser criadas. Deixa isto por agora e tenta mais tarde — as fotos não foram tocadas.",
            "error",
          );
          break;
        }
        const next = data?.nextCursor;
        cursor = typeof next === "number" ? next : cursor;
        if (!alive.current) return;
        setThumbJob({
          running: true,
          cursor,
          scanned,
          generated,
          failed: failedCount,
          total: typeof data?.total === "number" ? data.total : total,
          complete: false,
        });
        if (next === null || next === undefined) {
          complete = true;
          break;
        }
      }
    } finally {
      if (alive.current) {
        setThumbJob((j) =>
          j ? { ...j, running: false, scanned, generated, failed: failedCount, complete } : j,
        );
      }
    }
    if (!alive.current) return;
    if (generated > 0) {
      toast(
        `${plural(generated, "miniatura criada", "miniaturas criadas")}. O tema passa a abrir muito mais depressa.`,
        "success",
      );
      await refreshVisibleThumbs(images.length);
    } else if (complete) {
      toast("Já não faltavam miniaturas neste tema.", "info");
    }
  }
  return { runThumbJob };
}
