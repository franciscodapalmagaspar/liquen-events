"use client";

import { useState, type DragEvent, type Dispatch, type SetStateAction } from "react";
import type { CalendarEvent } from "@/lib/orcamento/types";
import { diaPorExtenso } from "@/lib/data-curta";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ARRASTAR UMA MARCAÇÃO PARA OUTRO DIA — fase 09 do `docs/APPLE-CALENDARIO.md`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que a Parte 5 pede, e tudo aqui:
 *   · arrastar uma marcação para outro dia MOVE-a; com `Alt`, DUPLICA-a (o
 *     cursor passa a «copy»);
 *   · o dia de destino realça-se só quando a largada é válida;
 *   · sempre com «Anular» — «Evento movido para 12 de setembro» —, que move
 *     de volta;
 *   · o que aconteceu é dito ao leitor de ecrã (`anuncio`);
 *   · e arrastar nunca é o único caminho: o «Mudar de dia…» do menu usa o
 *     mesmo `mover`.
 *
 * Vive fora do `Calendario.tsx` de propósito: o componente está no limite do
 * que o React Compiler aceita optimizar, e cada fecho a mais lá dentro fazia-o
 * desistir do componente inteiro (o lint avisa). Aqui os fechos são deste
 * gancho, e o calendário só os liga.
 *
 * Optimista: a etiqueta muda de dia logo, e volta à origem se o servidor
 * recusar. O servidor só muda o dia (PATCH em `/api/calendario/[id]`, com o
 * compare-and-set do `updated_at`).
 */

/** O tipo da carga do arrasto: só uma marcação deste calendário o escreve. */
export const CARGA_DA_MARCACAO = "application/x-liquen-marcacao";

type Gravar = (
  oQue: string,
  url: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; corpo: unknown }>;

export function useArrastoDeMarcacoes({
  events,
  setEvents,
  gravar,
  anular,
  duplicarPara,
}: {
  events: readonly CalendarEvent[];
  setEvents: Dispatch<SetStateAction<CalendarEvent[]>>;
  gravar: Gravar;
  anular: (mensagem: string, repor: () => unknown) => void;
  /** Criar uma cópia da marcação noutro dia — o POST de sempre. */
  duplicarPara: (ev: CalendarEvent, dia: string) => void;
}) {
  const [aArrastar, setAArrastar] = useState<string | null>(null);
  const [destino, setDestino] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");

  async function mover(ev: CalendarEvent, para: string, comAnular = true): Promise<boolean> {
    if (para === ev.date) return false;
    const de = ev.date;
    setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, date: para } : e)));
    const { ok, corpo } = await gravar(`mover «${ev.title}»`, `/api/calendario/${ev.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: para }),
    });
    if (!ok) {
      setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, date: de } : e)));
      return false;
    }
    const doServidor = corpo as CalendarEvent | null;
    if (doServidor?.id) {
      setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, ...doServidor } : e)));
    }
    setAnuncio(`${ev.title} movido de ${diaPorExtenso(de)} para ${diaPorExtenso(para)}.`);
    if (comAnular) {
      anular(`Evento movido para ${diaPorExtenso(para)}.`, () =>
        mover({ ...ev, date: para }, de, false),
      );
    }
    return true;
  }

  /** O que uma etiqueta de marcação precisa para poder ser arrastada. */
  function naEtiqueta(ev: CalendarEvent) {
    return {
      onArrastarInicio: (e: DragEvent<HTMLButtonElement>) => {
        e.dataTransfer.setData(CARGA_DA_MARCACAO, ev.id);
        e.dataTransfer.effectAllowed = "copyMove";
        setAArrastar(ev.id);
      },
      onArrastarFim: () => {
        setAArrastar(null);
        setDestino(null);
      },
    };
  }

  /**
   * Há uma marcação no ar? O estado diz-o depois do primeiro desenho; os
   * TIPOS da carga dizem-no logo (e são o que o browser deixa ler durante o
   * `dragover` — o `getData` só funciona na largada).
   */
  const levaMarcacao = (e: DragEvent<HTMLElement>) =>
    !!aArrastar || Array.from(e.dataTransfer?.types ?? []).includes(CARGA_DA_MARCACAO);

  /** O que um dia precisa para receber a largada. */
  function noDia(dia: string) {
    return {
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!levaMarcacao(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = e.altKey ? "copy" : "move";
        if (destino !== dia) setDestino(dia);
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDestino((d) => (d === dia ? null : d));
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        const id = e.dataTransfer?.getData(CARGA_DA_MARCACAO) || aArrastar;
        if (!id) return;
        e.preventDefault();
        const ev = events.find((x) => x.id === id);
        setAArrastar(null);
        setDestino(null);
        if (!ev || ev.date === dia) return;
        if (e.altKey) duplicarPara(ev, dia);
        else void mover(ev, dia);
      },
    };
  }

  return { mover, naEtiqueta, noDia, destino, anuncio };
}
