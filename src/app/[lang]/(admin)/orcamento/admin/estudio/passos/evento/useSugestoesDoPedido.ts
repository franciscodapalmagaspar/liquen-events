"use client";

import { lerPartilhado } from "@/lib/leitura-partilhada";
import { useEffect, useState } from "react";
import { DEFAULT_VALID_DAYS } from "@/lib/proposal-doc";
import { useDocumentoDoEstudio } from "../../documento/useDocumentoDoEstudio";

export interface EntradaSugestoesDoPedido {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
}

export function useSugestoesDoPedido({ documento }: EntradaSugestoesDoPedido) {
  const { setDoc } = documento;
  /**
   * O que ela já escreveu antes, para não voltar a escrever.
   *
   * Sai das propostas anteriores em vez de um catálogo à parte: um catálogo
   * precisava de ser mantido, e um catálogo que ninguém mantém fica pior do
   * que não existir. O que ela usou é, por definição, o que ela usa.
   */
  const [sugestoes, setSugestoes] = useState<{ locais: string[] }>({ locais: [] });

  // Sugestões e a validade por omissão. Uma leitura só, ao abrir; se falhar,
  // o estúdio funciona como antes — nenhuma destas coisas é indispensável.
  useEffect(() => {
    let vivo = true;
    Promise.all([
      lerPartilhado("/api/propostas?resumo=1").then((r) => (r.ok ? r.json() : [])),
      lerPartilhado("/api/propostas/preferencias").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([lista, prefs]) => {
        if (!vivo) return;
        const unicos = (vals: unknown[]) =>
          [...new Set(vals.map((v) => String(v ?? "").trim()).filter(Boolean))].sort();
        if (Array.isArray(lista)) {
          setSugestoes({
            locais: unicos(lista.map((p: { location?: string }) => p.location)),
          });
        }
        // A validade só se aplica a um documento que ainda NÃO tem uma: mexer
        // numa proposta já escrita porque a política mudou seria alterar-lhe
        // as condições nas costas de quem a escreveu.
        const dias = Number(prefs?.validUntilDays);
        // A omissão NÃO se escreve: sem dias escritos, a validade sai da regra
        // do evento (`diasDeValidadePeloEvento`), que dá os mesmos 60 quando o
        // evento está longe. Escrevê-la chegava depois de o estúdio abrir e
        // mudava o documento sozinho — e um PDF acabado de ver deixava de ser
        // «o que se viu» (medido no browser, com «Ver o PDF primeiro»).
        if (Number.isFinite(dias) && dias > 0 && dias !== DEFAULT_VALID_DAYS) {
          setDoc((d) => (d.validUntilDays ? d : { ...d, validUntilDays: dias }));
        }
      })
      .catch(() => {
        /* sem sugestões e com a validade de sempre */
      });
    return () => {
      vivo = false;
    };
  }, [setDoc]);

  return { sugestoes };
}
