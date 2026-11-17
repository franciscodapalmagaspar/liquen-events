"use client";

import { useEffect, useRef } from "react";
import { lerPartilhado } from "@/lib/leitura-partilhada";
import {
  divergenciaDoEnviado,
  divergenciaJaVista,
  type DivergenciaDoEnviado,
  type EnvioConferido,
} from "@/lib/orcamento/estudio/conferencia-com-o-enviado";
import type { ActivityEntry } from "@/lib/orcamento/types";

interface Entrada {
  quoteId: string;
  /** O histórico do pedido: diz se foi ela a mudar o preço depois do envio. */
  historico: readonly ActivityEntry[] | undefined;
  /** O rascunho local e o do servidor já foram lidos. Antes disso o ecrã está
   *  a meio de ser montado e não há total para comparar. */
  aberturaAssente: boolean;
  /** Enviada NESTA sessão: o ecrã é exactamente o que seguiu. */
  enviadaNestaSessao: boolean;
  /** O total a pagar (com IVA) que o ecrã mostra. */
  aPagar: number;
  /** Onde fica, no `localStorage`, o total que ela decidiu manter. */
  chaveDoVisto: string;
  aoDivergir: (d: DivergenciaDoEnviado) => void;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CONFERÊNCIA COM O QUE SEGUIU PARA O CLIENTE — A MECÂNICA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As regras estão em `lib/orcamento/estudio/conferencia-com-o-enviado.ts`. Aqui
 * fica o QUANDO, e ele é de propósito barato: a LISTA das versões traz o total
 * de cada envio e mais nada. Quando bate certo — o caso normal — não se
 * descarrega documento nenhum.
 *
 * Corre UMA vez por abertura, e essa vez só conta quando a resposta foi lida.
 * Se o efeito se desmonta com a leitura a caminho (o `StrictMode`, ou o preço
 * do pedido a mexer no total), a resposta deita-se fora e a passagem seguinte
 * confere com o total novo — marcar «conferido» à partida fazia com que nenhuma
 * das duas chegasse ao fim.
 */
export function useConferenciaComOEnviado({
  quoteId,
  historico,
  aberturaAssente,
  enviadaNestaSessao,
  aPagar,
  chaveDoVisto,
  aoDivergir,
}: Entrada): void {
  const conferido = useRef(false);

  useEffect(() => {
    if (!aberturaAssente || conferido.current) return;
    if (enviadaNestaSessao) return;
    // Uma proposta a meio de ser escrita não tem total nenhum para comparar.
    if (!(aPagar > 0)) return;
    let vivo = true;
    (async () => {
      let ultima: EnvioConferido | undefined;
      try {
        const r = await lerPartilhado(`/api/orcamento/${quoteId}/versoes`, { cache: "no-store" });
        const dados = r.ok ? ((await r.json()) as { versoes?: EnvioConferido[] } | null) : null;
        ultima = dados?.versoes?.[0];
      } catch {
        /* sem rede: o estúdio abre como sempre abriu, só sem a rede por baixo */
      }
      // Desmontado a meio: a passagem que veio a seguir é que confere.
      if (!vivo) return;
      conferido.current = true;
      const d = divergenciaDoEnviado(ultima, aPagar, historico);
      if (!d || divergenciaJaVista(lerOVisto(chaveDoVisto), d.aPagarAqui)) return;
      aoDivergir(d);
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberturaAssente, enviadaNestaSessao, aPagar, quoteId]);
}

function lerOVisto(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    // Sem `localStorage` a pergunta volta na abertura seguinte. É o lado certo
    // para falhar: repetir uma pergunta custa um clique, calá-la custa o número
    // que o casal recebeu.
    return null;
  }
}
