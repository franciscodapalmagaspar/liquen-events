"use client";

import type { Decisao, Duvida } from "@/lib/importar-proposta/parecidas";
import { Segmented } from "./ui";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «É A MESMA FOTOGRAFIA?» — A ZONA CINZENTA DA IMPORTAÇÃO (13/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma fotografia do ficheiro que se PARECE com uma já guardada, mas sem a
 * certeza de ser a mesma (`impressao-visual.ts`: o mesmo enquadramento com um
 * corte diferente, ou duas fotos da mesma mesa tiradas em rajada). Ninguém
 * decide por ela: mostram-se as duas lado a lado, e ela escolhe.
 *
 *  · «É a mesma» → entra a guardada; não sobe nada, não ocupa espaço.
 *  · «É outra» (ou sem resposta) → sobe como nova, e o servidor não a troca.
 */
export default function ParecidasParaConfirmar({
  duvidas,
  decisoes,
  urls,
  onDecidir,
}: {
  duvidas: ReadonlyMap<string, Duvida>;
  decisoes: ReadonlyMap<string, Decisao>;
  /** caminho no ficheiro → URL do próprio navegador. */
  urls: ReadonlyMap<string, string>;
  onDecidir: (caminho: string, d: Decisao) => void;
}) {
  if (duvidas.size === 0) return null;
  return (
    <div className="mb-4 rounded-xl border border-[var(--bo-hairline)] bg-[var(--bo-surface-sunken)] p-3">
      <p className="mb-3 text-footnote text-[var(--bo-text)]">
        {duvidas.size === 1
          ? "Uma fotografia parece-se com uma que já está guardada."
          : `${duvidas.size} fotografias parecem-se com outras que já estão guardadas.`}{" "}
        <span className="text-[var(--bo-text-muted)]">
          Se for a mesma, usa-se a guardada e não ocupa espaço. Sem resposta, sobe como nova.
        </span>
      </p>
      <ul className="flex flex-col gap-3">
        {[...duvidas].map(([caminho, d]) => {
          const decisao = decisoes.get(caminho);
          return (
            <li key={caminho} className="flex flex-wrap items-center gap-3">
              <div className="grid w-full max-w-[20rem] grid-cols-2 gap-2">
                <figure className="min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL do próprio navegador */}
                  <img
                    src={urls.get(caminho)}
                    alt="Fotografia do ficheiro"
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                  <figcaption className="mt-1 text-caption2 text-[var(--bo-text-muted)]">
                    No ficheiro
                  </figcaption>
                </figure>
                <figure className="min-w-0">
                  {d.miniatura ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL assinado do Storage
                    <img
                      src={d.miniatura}
                      alt="Fotografia já guardada"
                      className="aspect-square w-full rounded-lg object-cover"
                    />
                  ) : (
                    <div className="aspect-square w-full rounded-lg bg-[var(--bo-hairline)]" />
                  )}
                  <figcaption className="mt-1 text-caption2 text-[var(--bo-text-muted)]">
                    Já guardada
                  </figcaption>
                </figure>
              </div>
              <Segmented<Decisao | "">
                ariaLabel="É a mesma fotografia?"
                size="sm"
                value={decisao ?? ""}
                onChange={(v) => {
                  if (v) onDecidir(caminho, v);
                }}
                options={[
                  { value: "mesma", label: "É a mesma" },
                  { value: "outra", label: "É outra" },
                ]}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
