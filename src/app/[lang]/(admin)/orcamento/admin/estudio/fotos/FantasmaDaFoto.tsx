"use client";

import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";

/**
 * A fotografia que vai na mão, enquanto se arrasta.
 *
 * Sem isto, arrastar de um board para outro é mover um buraco: a célula de
 * origem esvazia-se e não há nada a acompanhar o cursor até ao destino — o que
 * numa página com oito boards quer dizer largar às cegas.
 */
export function FantasmaDaFoto({
  id,
  doc,
  urls,
}: {
  id: string | null;
  doc: StudioDoc;
  urls: Record<string, string>;
}) {
  if (!id) return null;
  const partes = id.split(":");
  if (partes[0] !== "foto") return null;
  const caminho = doc.moodBoards[Number(partes[1])]?.images[Number(partes[2])];
  const url = caminho ? urls[caminho] : undefined;
  return (
    <div className="h-24 w-24 overflow-hidden rounded-lg border border-white/40 bg-[var(--bo-tinta-10)] shadow-[var(--bo-sombra-suspensa)]">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : null}
    </div>
  );
}
