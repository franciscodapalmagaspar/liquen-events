"use client";

import { MoodBoard } from "@/lib/proposal-doc";
import { useEstudio } from "../../contexto";

export function ResumoDoBoardDobrado({ b }: { b: MoodBoard }) {
  const {
    fotos: { assetUrls },
  } = useEstudio();
  return (
    <div className="flex items-center gap-2">
      <p className="shrink-0 text-[11px] text-foreground/45">
        {b.images.length === 0
          ? "sem fotos"
          : b.images.length === 1
            ? "1 foto"
            : `${b.images.length} fotos`}
      </p>
      <div className="flex min-w-0 gap-1 overflow-hidden">
        {b.images.slice(0, 8).map((path, ii) => (
          <span
            key={ii}
            className="h-9 w-9 shrink-0 overflow-hidden rounded border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-6)]"
          >
            {assetUrls[path] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={assetUrls[path]}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}
