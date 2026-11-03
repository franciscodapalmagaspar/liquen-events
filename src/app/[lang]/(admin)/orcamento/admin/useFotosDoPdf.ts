"use client";

import { useEffect, useState } from "react";
import { stripPendingImages, type ProposalDoc } from "@/lib/proposal-doc";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import type { FotosDoPdf } from "@/lib/pdf-editorial/fotos-do-pdf";

/** Quanto se espera depois do último gesto antes de perguntar. */
// 2,5 s e não 900 ms (3/11): cada pergunta pode descarregar e reduzir
// fotografias no servidor, e a conta da Vercel passou o limite de processador.
const ESPERA_MS = 2500;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUE FOTOGRAFIA O PDF PÕE EM CADA PÁGINA — PERGUNTADO AO PRÓPRIO PDF
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A colaboradora dela viu-o (15/10): as miniaturas mostravam fotografias «que
 * não têm nada a ver» com as do PDF. Os separadores e os painéis escolhe-os o
 * álbum do PDF pelos pixéis de cada ficheiro, que o navegador não sabe; a
 * miniatura adivinhava. Agora pergunta à rota `fotos-do-pdf`, que corre o
 * mesmo plano do PDF sem o desenhar.
 *
 * Pergunta-se ~1 s depois de ela parar de mexer, e só o pedido mais recente
 * conta. Entretanto fica a resposta anterior: as miniaturas não piscam a cada
 * tecla. Uma falha deixa a última resposta boa — nunca uma adivinha.
 */
export function useFotosDoPdf(
  quoteId: string,
  doc: ProposalDoc,
  idioma: IdiomaDaProposta,
): FotosDoPdf | null {
  const [fotos, setFotos] = useState<FotosDoPdf | null>(null);
  const corpo = JSON.stringify({ doc: stripPendingImages(doc), idioma });
  useEffect(() => {
    const pedido = new AbortController();
    const vez = setTimeout(() => {
      fetch(`/api/orcamento/${encodeURIComponent(quoteId)}/fotos-do-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: corpo,
        signal: pedido.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { fotos?: FotosDoPdf } | null) => {
          if (j?.fotos) setFotos(j.fotos);
        })
        .catch(() => {});
    }, ESPERA_MS);
    return () => {
      clearTimeout(vez);
      pedido.abort();
    };
  }, [quoteId, corpo]);
  return fotos;
}
