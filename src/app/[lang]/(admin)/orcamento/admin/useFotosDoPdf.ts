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
 *
 * ── O QUE JÁ VEIO NÃO SE PERGUNTA OUTRA VEZ (4/11) ──────────────────────
 *
 * Ela pediu para cortar o processador da Vercel «mantendo tudo como está».
 * Cada pergunta custa 0,2 a 1 s de processador (medido a 4/11), e repetia-se
 * sem razão: mudar de passo ou de vista e voltar desmontava as miniaturas, e
 * a mesma pergunta, com o rascunho igual, ia outra vez ao servidor. Agora a
 * resposta fica guardada no navegador, pelo rascunho inteiro e pela língua.
 * Rascunho igual é resposta igual: é o mesmo plano do PDF. Mudar uma vírgula
 * muda a chave e volta a perguntar. E ao voltar, as miniaturas certas
 * aparecem logo, em vez de esperarem 2,5 s.
 */
export const FOTOS_GUARDADAS_MAX = 12;
const guardadas = new Map<string, FotosDoPdf>();

function guardar(chave: string, fotos: FotosDoPdf) {
  guardadas.delete(chave);
  guardadas.set(chave, fotos);
  while (guardadas.size > FOTOS_GUARDADAS_MAX) {
    const maisVelha = guardadas.keys().next().value;
    if (maisVelha === undefined) break;
    guardadas.delete(maisVelha);
  }
}

/** Para os testes: cada um começa sem respostas guardadas. */
export function esquecerFotosGuardadas() {
  guardadas.clear();
}

export function useFotosDoPdf(
  quoteId: string,
  doc: ProposalDoc,
  idioma: IdiomaDaProposta,
): FotosDoPdf | null {
  const corpo = JSON.stringify({ doc: stripPendingImages(doc), idioma });
  const chave = `${quoteId}\u0000${corpo}`;
  const [fotos, setFotos] = useState<FotosDoPdf | null>(() => guardadas.get(chave) ?? null);
  useEffect(() => {
    const ja = guardadas.get(chave);
    if (ja) {
      // Já veio para este rascunho: sem pergunta ao servidor.
      guardar(chave, ja);
      const logo = setTimeout(() => setFotos(ja), 0);
      return () => clearTimeout(logo);
    }
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
          if (!j?.fotos) return;
          guardar(chave, j.fotos);
          setFotos(j.fotos);
        })
        .catch(() => {});
    }, ESPERA_MS);
    return () => {
      clearTimeout(vez);
      pedido.abort();
    };
  }, [quoteId, corpo, chave]);
  return fotos;
}
