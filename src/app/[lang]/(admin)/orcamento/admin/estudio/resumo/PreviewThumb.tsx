"use client";

import { useState } from "react";
import { useFotoComPlanoB } from "@/lib/useFotoComPlanoB";
import { EsqueletoPorCima } from "../fotos/EsqueletoPorCima";

/** Miniatura só de leitura (sem botão de remover) para o resumo. */
export function PreviewThumb({
  url,
  planoB,
  pendente = false,
}: {
  url?: string;
  /** Para onde cair, do mais leve para o mais pesado. Ver `planoB` no `Thumb`. */
  planoB?: string | readonly (string | undefined)[];
  pendente?: boolean;
}) {
  const { alvo, desistiu: failed, aoFalhar } = useFotoComPlanoB(url, planoB);
  /** A fotografia já está no ecrã — é o que apaga o esqueleto por cima. */
  const [pintada, setPintada] = useState(false);
  // Enquanto não está pintada, esta caixa dizia «Imagem» e mais nada — o mesmo
  // ecrã que uma foto avariada dá. Ver `Thumb` para o porquê de isto importar.
  const aCarregar = !pintada && !failed;
  return (
    <div
      aria-busy={pendente || aCarregar || undefined}
      className={`relative aspect-[4/3] overflow-hidden rounded-lg border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-6)] ${
        pendente ? "opacity-45" : ""
      }`}
    >
      {alvo && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={alvo}
          alt=""
          // Este resumo vive no fim do passo, e as suas duas células estão
          // quase sempre fora do ecrã quando a página abre: `lazy` é o que
          // impede que disputem a ligação com as fotos que ela está a ver.
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          // A `ref` E o `onLoad`, pela razão que o `medir` do `Thumb` explica:
          // uma imagem vinda da cache pode já estar completa quando o `onLoad`
          // é ligado, e aí só a referência a apanha.
          ref={(img) => {
            if (img?.complete && img.naturalWidth > 0) setPintada(true);
          }}
          onLoad={() => setPintada(true)}
          onError={aoFalhar}
        />
      ) : (
        !aCarregar && (
          <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-[0.15em] text-foreground/30">
            Imagem
          </div>
        )
      )}
      <EsqueletoPorCima aCarregar={aCarregar} />
    </div>
  );
}
