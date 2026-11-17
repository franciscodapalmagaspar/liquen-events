"use client";

import { useCallback, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { plural } from "@/lib/plural";
import type { AccaoEmBloco } from "@/lib/temas/listas-de-fotos";
import type { ThemeImage } from "@/lib/theme-types";
import { downloadMany, downloadName } from "../photo-download";
import { guardarBlob, useDescarga } from "../ui/descarregar";
import type { useToast } from "../Toast";

/**
 * Descarregar fotos de uma pasta: uma (pela lupa ou pelo menu) ou as
 * escolhidas, com a contagem na barra da selecção.
 * Saiu do `ThemeFolder` (`Temas.tsx`) tal e qual (júri das fases 7 e 8,
 * ponto 3). Sem efeitos.
 */
export function useDescargasDaPasta({
  images,
  selected,
  nomeDoTema,
  toast,
  alive,
  setEmBloco,
}: {
  images: ThemeImage[];
  selected: Set<string>;
  nomeDoTema: string;
  toast: ReturnType<typeof useToast>["toast"];
  alive: RefObject<boolean>;
  setEmBloco: Dispatch<SetStateAction<AccaoEmBloco | null>>;
}) {
  const [downloading, setDownloading] = useState(false);
  /** Transfere uma foto (a do visualizador ou a de um mosaico). */
  // Uma foto é um original de vários MB: passa pelo `useDescarga`, que conta
  // os bytes à medida que chegam (o visualizador mostra-os no botão).
  const umaFoto = useDescarga();
  const downloadImage = useCallback(
    async (im: ThemeImage, i: number) => {
      try {
        const { blob } = await umaFoto.obter(im.url);
        // O nome é o NOSSO (tema + número), não o do armazenamento.
        guardarBlob(blob, downloadName(im, nomeDoTema, i));
      } catch {
        toast("Não foi possível transferir a foto.", "error");
      }
    },
    [nomeDoTema, toast, umaFoto],
  );

  /** Transfere as fotos selecionadas, uma de cada vez (ver photo-download.ts). */
  const downloadSelected = useCallback(async () => {
    const chosen = images.map((im, i) => ({ im, i })).filter(({ im }) => selected.has(im.path));
    if (chosen.length === 0) return;
    setDownloading(true);
    // O `downloadMany` já contava — e o `() => {}` que estava aqui deitava a
    // conta fora. Quarenta fotos são um a dois minutos: sem isto, o que ela vê
    // é um botão parado.
    setEmBloco({ tipo: "transferir", feito: 0, total: chosen.length });
    const res = await downloadMany(
      chosen.map(({ im, i }) => ({ url: im.url, filename: downloadName(im, nomeDoTema, i) })),
      (p) => {
        if (alive.current) setEmBloco({ tipo: "transferir", feito: p.done, total: p.total });
      },
    );
    if (alive.current) setEmBloco(null);
    setDownloading(false);
    if (res.failed > 0) {
      toast(
        res.failed === res.total
          ? "Não foi possível transferir as fotos."
          : `${res.total - res.failed} de ${res.total} transferidas.`,
        "error",
      );
    } else {
      toast(plural(res.done, "foto transferida", "fotos transferidas"), "success");
    }
  }, [alive, images, nomeDoTema, selected, setEmBloco, toast]);
  return { umaFoto, downloading, downloadImage, downloadSelected };
}
