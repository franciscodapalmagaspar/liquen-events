"use client";
import { useCallback, useRef } from "react";
import { camposMudados, mesmoValor } from "@/lib/rascunho-juntar";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import { gravarRascunhoNoServidor, type ResultadoDaGravacao } from "@/lib/orcamento/estudio/gravar";
import { ehObjecto } from "@/lib/orcamento/estudio/eh-objecto";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useEstadoDoRascunho } from "./useEstadoDoRascunho";

export interface EntradaGravarNoServidor {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  onEstadoDoPedido: ((status: QuoteStatus) => void) | undefined;
  quote: Quote;
  rascunho: ReturnType<typeof useEstadoDoRascunho>;
}

export function useGravarNoServidor({
  documento,
  onEstadoDoPedido,
  quote,
  rascunho,
}: EntradaGravarNoServidor) {
  const { setDoc } = documento;
  const {
    docDoServidor,
    marcarGuardadoNoServidor,
    marcarQueDura,
    partiuUmaGravacao,
    registarNaoDura,
    registarSoLocal,
    serverStamp,
    voltouUmaGravacao,
  } = rascunho;

  /**
   * Manda o rascunho ao servidor e ARRUMA a verdade que voltar: o carimbo, o
   * indicador, o aviso. Está num sítio só porque são dois os caminhos que
   * gravam — o debounce de cada alteração e o resgate da abertura — e um deles
   * a esquecer-se de dizer que falhou é exactamente o problema que isto veio
   * resolver.
   */
  const gravarUmaVez = useCallback(
    async (docGravavel: unknown): Promise<ResultadoDaGravacao> => {
      partiuUmaGravacao();
      try {
        // O que mudou desde a última conversa com o servidor — é isto que lhe
        // deixa juntar esta gravação com a de outra pessoa campo a campo, em
        // vez de a última escrita levar o documento inteiro (achado n.º 6).
        const enviado = ehObjecto(docGravavel) ? docGravavel : null;
        const desde = docDoServidor.current;
        const r = await gravarRascunhoNoServidor(quote.id, {
          doc: docGravavel,
          baseUpdatedAt: serverStamp.current,
          ...(enviado && desde ? camposMudados(desde, enviado) : {}),
        });
        if (r.estado === "guardado") {
          if (r.updatedAt) serverStamp.current = r.updatedAt;
          docDoServidor.current = r.doc ?? enviado;
          // O que veio da outra pessoa vai para o ecrã — mas só nos campos em
          // que esta não mexeu entretanto (a gravação demora; ela pode ter
          // continuado a escrever).
          const junto = r.doc;
          if (junto && enviado) {
            setDoc((d) => {
              const atual = d as unknown as Record<string, unknown>;
              const novo: Record<string, unknown> = { ...atual };
              let mudou = false;
              for (const k of new Set([...Object.keys(junto), ...Object.keys(enviado)])) {
                if (mesmoValor(junto[k], enviado[k])) continue;
                if (!mesmoValor(atual[k], enviado[k])) continue;
                // Nunca se APAGA um campo do ecrã por causa de uma junção: o
                // documento do estúdio tem a forma inteira, e um campo que lhe
                // falte (os Serviços, por exemplo) deita abaixo o editor que o
                // desenha. Vindo vazio do servidor, fica o que está.
                if (junto[k] === undefined) continue;
                novo[k] = junto[k];
                mudou = true;
              }
              return mudou ? (novo as unknown as StudioDoc) : d;
            });
          }
          marcarGuardadoNoServidor();
          if (r.estadoDoPedido) onEstadoDoPedido?.(r.estadoDoPedido);
          // Só um `false` EXPLÍCITO alarma — ver `duradouro`. Um servidor que
          // não diga nada é tratado como sempre foi.
          if (r.duradouro === false) registarNaoDura(r.aviso);
          else marcarQueDura();
        } else {
          registarSoLocal(r.porque, r.sessaoExpirada);
        }
        return r;
      } finally {
        voltouUmaGravacao();
      }
    },
    [
      quote.id,
      marcarGuardadoNoServidor,
      registarSoLocal,
      registarNaoDura,
      marcarQueDura,
      onEstadoDoPedido,
      partiuUmaGravacao,
      voltouUmaGravacao,
    ],
  );

  /**
   * ── UMA GRAVAÇÃO DE CADA VEZ, E SEMPRE A MAIS RECENTE ────────────────────
   *
   * Auditoria de 13/11 (estúdio, n.ºs 1 e 2). Com a rede lenta, a gravação dos
   * 800 ms seguinte partia antes de a anterior voltar: as duas levavam o MESMO
   * carimbo (`serverStamp`), e o servidor via a segunda como «alterada por
   * outra pessoa» — aviso falso, gaveta de resgate estragada. E se a mais
   * antiga chegasse depois da nova, era ela que ficava a valer: ao reabrir,
   * perdiam-se as últimas alterações.
   *
   * Agora há uma fila: uma gravação só parte quando a anterior voltou (e com
   * o carimbo que ela trouxe). Quando chega a vez, vai o documento MAIS RECENTE
   * que foi pedido — as versões intermédias não interessam a ninguém —, e as
   * que ficaram pelo caminho recebem o resultado dessa.
   */
  const filaDaGravacao = useRef<Promise<unknown> | null>(null);
  const porEnviar = useRef<{ doc: unknown } | null>(null);
  const ultimoResultado = useRef<ResultadoDaGravacao | null>(null);
  const enviarParaServidor = useCallback(
    (docGravavel: unknown): Promise<ResultadoDaGravacao> => {
      porEnviar.current = { doc: docGravavel };
      const umaVez = async (): Promise<ResultadoDaGravacao> => {
        const pedido = porEnviar.current;
        // Uma gravação anterior já levou este documento (ou um mais recente).
        if (!pedido) return ultimoResultado.current ?? { estado: "so-local" };
        porEnviar.current = null;
        const r = await gravarUmaVez(pedido.doc);
        ultimoResultado.current = r;
        return r;
      };
      // Sem nada em voo, parte JÁ (sem esperar um passo da fila): a gravação
      // de quando o ecrã fecha tem de sair enquanto o ecrã fecha.
      const anterior = filaDaGravacao.current;
      const vez = anterior ? anterior.then(umaVez) : umaVez();
      const naFila = vez.catch(() => {});
      filaDaGravacao.current = naFila;
      void naFila.then(() => {
        if (filaDaGravacao.current === naFila) filaDaGravacao.current = null;
      });
      return vez;
    },
    [gravarUmaVez],
  );

  return { enviarParaServidor };
}
