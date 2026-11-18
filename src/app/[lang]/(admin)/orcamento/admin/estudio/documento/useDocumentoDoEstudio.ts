"use client";
import { useEffect, useRef, useState, useReducer } from "react";
import type { Quote } from "@/lib/orcamento/types";
import {
  initialDoc,
  mapImagePaths,
  type StudioDoc,
} from "@/lib/orcamento/estudio/documento-inicial";
import { escreverODocumento } from "@/lib/orcamento/estudio/escrever-o-documento";

export interface EntradaDocumentoDoEstudio {
  quote: Quote;
}

export function useDocumentoDoEstudio({ quote }: EntradaDocumentoDoEstudio) {
  /**
   * Todas as escritas do documento passam por aqui para as fotos escolhidas das
   * páginas acompanharem o TEMA e não a posição (`realinharChavesDosTemas`,
   * auditoria de 12/11, n.º 1) — ver `escreverODocumento`. Um `useReducer` e
   * não um `useState` embrulhado: o `dispatch` é estável e o React sabe-o.
   */
  const [doc, setDoc] = useReducer(escreverODocumento, quote, initialDoc);
  /**
   * O documento COMO ESTÁ AGORA, para quem volta de uma ida à rede.
   *
   * Uma função `async` guarda o `doc` que existia quando ela CARREGOU no botão.
   * Se a resposta demorar segundos — e a tradução demora —, esse documento já é
   * história: entretanto entraram fotos, saíram fotos, arrumou-se a grelha. Lê-lo
   * para decidir o que dizer, ou pô-lo de volta no estado, é apagar tudo isso.
   *
   * Isto é só para LER (contar, comparar). Quem ESCREVE continua a escrever pela
   * forma funcional do `setDoc`, que é a única que o React garante actualizada.
   */
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  /**
   * Histórico para o Cmd+Z. Guardado num `ref` e não em estado: crescer o
   * histórico não pode redesenhar a página, ou escrever numa caixa de texto
   * passava a redesenhar o formulário inteiro a cada tecla.
   */
  const historicoRef = useRef<StudioDoc[]>([]);
  /** O documento «assente»: o da abertura, ou o da última fotografia. */
  const docAssenteRef = useRef<StudioDoc | null>(null);
  /**
   * Os marcadores provisórios que JÁ se resolveram (o caminho em que a foto
   * assentou, ou `null` se falhou). Um documento reposto pelo ⌘Z ou pelo
   * «Anular» pode trazer marcadores de uma fotografia tirada a meio de um
   * carregamento — e um marcador que já não está em voo nunca mais assenta:
   * as células ficavam a carregar para sempre e o envio preso (revisão de
   * 13/11). Repor passa por aqui.
   */
  const marcadoresResolvidosRef = useRef<Map<string, string | null>>(new Map());
  const semMarcadoresMortos = (d: StudioDoc): StudioDoc =>
    marcadoresResolvidosRef.current.size === 0
      ? d
      : mapImagePaths(d, (p) =>
          marcadoresResolvidosRef.current.has(p)
            ? (marcadoresResolvidosRef.current.get(p) ?? null)
            : p,
        );
  /**
   * Há alguma coisa para desfazer? Isto É estado, ao contrário do histórico:
   * é o que acende e apaga o botão "Desfazer".
   *
   * O botão existe porque o `Cmd+Z` não existe num telemóvel. Enquanto desfazer
   * foi só um atalho de teclado, desfazer era uma coisa que só se podia fazer
   * ao computador — e ela escreve propostas no telemóvel. Custa um redesenho a
   * cada 800 ms (o mesmo instante em que o rascunho é gravado), não a cada
   * tecla, que é a razão de o histórico continuar num `ref`.
   */
  const [podeDesfazer, setPodeDesfazer] = useState(false);

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O QUE ELA JÁ ESCREVEU NÃO É SUBSTITUÍDO PELO RASCUNHO QUE VEM A CAMINHO
   * ════════════════════════════════════════════════════════════════════════
   *
   * O estúdio vai buscar o rascunho ao servidor ao abrir, e o merge chega
   * 100–300 ms depois. Até aqui esse merge era `{ ...d, ...doServidor }` —
   * campo a campo, o servidor ganhava. Se ela começasse a escrever nesse
   * primeiro segundo, o princípio do que escreveu era apagado.
   *
   * MEDIDO: escrever `ABCDEFGHIJKLMNOPQRST` meio segundo depois de o ecrã
   * abrir, oito rondas — SETE perderam texto. Ficaram coisas como
   * `HIJKLMNOPQRST`, `MNOPQRST`, `QRST`. Em quatro caixas diferentes, e uma
   * delas (a «Cerimónia») ficou COMPLETAMENTE vazia. Não há erro nem aviso: a
   * frase fica truncada pela frente e é assim que vai no PDF para o casal.
   *
   * Guarda-se aqui QUE CAMPOS ela tocou desde que o ecrã abriu. O merge
   * continua a trazer tudo o resto do rascunho — as fotos, as condições, as
   * traduções feitas noutro computador — e deixa em paz só aquilo em que ela
   * está com as mãos.
   *
   * Só marcam os caminhos por onde a PESSOA escreve (`patch` e o editor de
   * serviços). Os `setDoc` do sistema — semear os textos fixos, aplicar o
   * preço do pedido, o próprio merge — não marcam nada, de propósito.
   */
  const camposTocadosRef = useRef<Set<string>>(new Set());

  const patch = (p: Partial<StudioDoc>) => {
    for (const chave of Object.keys(p)) camposTocadosRef.current.add(chave);
    setDoc((d) => ({ ...d, ...p }));
  };

  return {
    camposTocadosRef,
    doc,
    docAssenteRef,
    docRef,
    historicoRef,
    marcadoresResolvidosRef,
    patch,
    podeDesfazer,
    semMarcadoresMortos,
    setDoc,
    setPodeDesfazer,
  };
}
