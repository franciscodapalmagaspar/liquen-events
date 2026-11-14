"use client";

import { useEffect, useState } from "react";
import { dataCurta } from "@/lib/data-curta";
import { MenuDeAccoes, SectionCard } from "./ui";
import { useAccoesDaPropostaEnviada } from "./accoesDaPropostaEnviada";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «PROPOSTAS ENVIADAS», NO PEDIDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «se eu quiser ver as propostas que já mandei não consigo». No
 * pedido, as versões só existiam dentro do estúdio, no passo «Enviar», e sem o
 * PDF — e o estúdio abre no rascunho. Este cartão fica no painel do pedido, ao
 * pé de tudo o resto do cliente, com cada proposta que seguiu e as mesmas
 * acções da lista de Propostas: o PDF que seguiu, o link do casal e o email.
 *
 * Os dados são os de `/api/orcamento/[id]/versoes` — a mesma lista do estúdio,
 * para as duas não poderem contar versões diferentes. Sem nenhuma, o cartão
 * não aparece: um pedido novo não precisa de uma caixa a dizer «nada».
 */

interface Versao {
  id: string;
  enviadaEm: string;
  total: number;
  estado: string;
}

const ESTADO: Record<string, string> = {
  enviada: "Enviada",
  em_negociacao: "Em negociação",
  aceite: "Aceite",
  rejeitada: "Recusada",
  rascunho: "Por enviar",
};

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    useGrouping: "always",
    style: "currency",
    currency: "EUR",
  }).format(n || 0);

export default function PropostasDoPedido({ quoteId }: { quoteId: string }) {
  const [versoes, setVersoes] = useState<Versao[] | null>(null);
  const { accoesDe, botaoDe, folha } = useAccoesDaPropostaEnviada();

  useEffect(() => {
    let vivo = true;
    fetch(`/api/orcamento/${encodeURIComponent(quoteId)}/versoes`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { versoes?: Versao[] } | null) => {
        if (vivo) setVersoes(j?.versoes ?? []);
      })
      .catch(() => {
        if (vivo) setVersoes([]);
      });
    return () => {
      vivo = false;
    };
  }, [quoteId]);

  if (!versoes || versoes.length === 0) return null;

  const paraAccoes = (v: Versao, i: number) => {
    const enviada = v.estado !== "rascunho";
    return {
      id: v.id,
      quoteId,
      temDoc: true,
      enviada,
      titulo: `Versão ${versoes.length - i}${enviada ? ` · enviada ${dataCurta(v.enviadaEm)}` : ""}`,
    };
  };

  return (
    <>
      <SectionCard eyebrow="Propostas enviadas" padding="md">
        <ul className="flex flex-col divide-y divide-[var(--bo-hairline)]">
          {versoes.map((v, i) => {
            const enviada = v.estado !== "rascunho";
            return (
              <li key={v.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--bo-text)]">
                    Versão {versoes.length - i}
                    <span className="text-[var(--bo-text-muted)]">
                      {" · "}
                      {enviada ? `enviada ${dataCurta(v.enviadaEm)}` : "por enviar"}
                    </span>
                  </p>
                  <p className="text-xs tabular-nums text-[var(--bo-text-muted)]">
                    {eur(v.total)} c/ IVA · {ESTADO[v.estado] ?? v.estado}
                  </p>
                </div>
                {botaoDe(paraAccoes(v, i))}
                <MenuDeAccoes
                  sobre={`versão ${versoes.length - i}`}
                  accoes={accoesDe(paraAccoes(v, i))}
                />
              </li>
            );
          })}
        </ul>
      </SectionCard>
      {folha}
    </>
  );
}
