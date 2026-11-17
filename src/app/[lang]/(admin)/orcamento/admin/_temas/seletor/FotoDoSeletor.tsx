"use client";

import { useEffect, useRef, useState } from "react";
import { type ThemeImage } from "@/lib/theme-types";
import { Button } from "../../ui";
import { criarFilaDeImagens } from "../../fila-de-imagens";

/**
 * A célula de uma fotografia no seletor de temas do estúdio, a sua fila de
 * originais, e a pré-visualização em grande.
 * (Saiu do `ThemePicker.tsx` na fase 8 de `docs/ESTRUTURA-DO-CODIGO.md`,
 * tal e qual.)
 */

/**
 * AS COLUNAS DA GRELHA DE FOTOS — a régua é a ZONA, não a janela.
 *
 * Uma constante e não duas cadeias soltas porque são DUAS grelhas: a das fotos
 * e o esqueleto que a precede. Com formas diferentes, o conteúdo saltava de
 * sítio no instante em que as fotos chegavam — e foi assim que estiveram, uma a
 * três colunas e outra a duas.
 *
 * A razão de ser `@min-[26rem]:` e um `minmax` está escrita por extenso na
 * grelha, onde estão as medidas.
 */
export const GRELHA_DE_FOTOS =
  "grid-cols-2 @min-[26rem]:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]";

/**
 * QUANTOS ORIGINAIS SE DESCARREGAM AO MESMO TEMPO nesta grelha.
 *
 * Uma foto sem miniatura (tudo o que foi carregado antes de elas existirem)
 * obriga a puxar o original: ~2,6 MB para desenhar uma célula de 150 px.
 * Medido em Chromium sobre HTTP/2, 60 fotos, 50 Mbit/s partilhados: com os 60
 * pedidos ao mesmo tempo — que é o que o browser faz, e o `loading="lazy"` não
 * trava — a PRIMEIRA foto aparece aos 26 351 ms, porque os 60 downloads
 * repartem o canal e acabam todos no fim. Com um tecto de 3 em voo, a primeira
 * aparece aos 1405 ms e a última não chega mais tarde do que chegava.
 *
 * Às fotos COM miniatura não se põe tecto nenhum: são ~25 KB, e medir mostrou
 * que aí um tecto só atrasa (1019 ms contra 350 ms para as 60).
 *
 * O número é o mesmo da Biblioteca de Temas (`Temas.tsx`), e o código da fila
 * também: os dois usam `criarFilaDeImagens` (`fila-de-imagens.ts`, um módulo
 * pequeno — este diálogo não arrasta o ecrã da biblioteca para o seu pacote).
 * O tecto é só deste diálogo — ver `FILA_DO_SELETOR`.
 */
export const HEAVY_IMAGE_CONCURRENCY = 3;

/** Células da primeira dobra: carregam já e com prioridade (o diálogo mostra
 *  5 colunas, portanto duas linhas). */
export const ABOVE_FOLD = 10;

/** Se um download ficar pendurado, a vez volta ao fim deste tempo. */
export const HEAVY_SLOT_TIMEOUT_MS = 30_000;

/**
 * A fila dos originais deste diálogo. O código é o da `fila-de-imagens.ts` (era
 * uma cópia à mão, até à fase 8 de `docs/ESTRUTURA-DO-CODIGO.md`); o tecto de 3
 * continua a ser SÓ deste diálogo, à parte das outras grelhas, com o relógio do lado da célula
 * (`HEAVY_SLOT_TIMEOUT_MS`), exactamente como antes. Juntá-la à fila partilhada
 * muda quantos originais descarregam ao mesmo tempo, e espera pela aprovação
 * dela — ver o cabeçalho de `criarFilaDeImagens`.
 */
export const FILA_DO_SELETOR = criarFilaDeImagens({
  limite: HEAVY_IMAGE_CONCURRENCY,
  esperaMaximaMs: null,
});

/** Pede vez para descarregar um original; devolve a função de a largar
 *  (acabou ou desistiu — é idempotente). */
export const queueHeavyImage = FILA_DO_SELETOR.pedirVez;

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * A miniatura de uma célula da grelha.
 *
 * Mostra `thumbUrl` e cai no original quando ela não existe — é o caso das
 * fotos carregadas ANTES de as miniaturas existirem, e continua a ser o caso
 * se a miniatura tiver desaparecido do bucket (é derivada e dispensável; o
 * original é que é o ativo). O `onError` é a segunda rede: um URL assinado
 * para um objeto que já lá não está falha no browser, e sem isto ficava uma
 * célula partida no meio de uma grelha que funciona.
 */
export function Photo({ image, priority }: { image: ThemeImage; priority?: boolean }) {
  /** A miniatura falhou (foi apagada do bucket): fica o original. */
  const [thumbBroken, setThumbBroken] = useState(false);
  /** A fila deu a vez a esta célula. */
  const [turn, setTurn] = useState(false);
  /** A fotografia já chegou — é o que dispara o fade por cima do LQIP. */
  const [pintada, setPintada] = useState(false);
  /** Sem miniatura, esta célula puxa ~2,6 MB: espera pela vez. */
  const heavy = !image.thumbUrl || thumbBroken;
  const release = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!heavy) return;
    let timer = 0;
    const free = queueHeavyImage(() => {
      setTurn(true);
      timer = window.setTimeout(() => release.current?.(), HEAVY_SLOT_TIMEOUT_MS);
    });
    release.current = () => {
      window.clearTimeout(timer);
      free();
    };
    return () => {
      release.current?.();
      release.current = null;
    };
  }, [heavy, image.url]);

  // Sem vez, sem `src`: um `src` posto é um download começado, e é isso mesmo
  // que a fila existe para espaçar.
  const src = heavy ? (turn ? image.url : undefined) : image.thumbUrl;

  const finished = () => {
    release.current?.();
    release.current = null;
  };

  return (
    /**
     * O LQIP É O FUNDO DA CÉLULA, e a fotografia entra por cima.
     *
     * Não é um segundo `<img>`: um `background-image` com um `data:` URI não é
     * um pedido, não entra na fila de descarregamentos e está PINTADO no
     * instante em que este elemento existe — que é o instante em que o JSON
     * chega. Medido na linha de base: era aqui que se ficava 1032 a 2192 ms a
     * olhar para uma caixa cinzenta.
     *
     * Sem `lqip` (fotos anteriores à migração) fica o fundo neutro de sempre.
     */
    <div
      className="h-full w-full bg-[var(--bo-tinta-6)] bg-cover bg-center"
      style={image.lqip ? { backgroundImage: `url("${image.lqip}")` } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading={heavy || priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        onLoad={() => {
          finished();
          setPintada(true);
        }}
        onError={() => {
          finished();
          if (!heavy) setThumbBroken(true);
        }}
        /* 200 ms de fade, e NUNCA um corte seco: a fotografia final entra por
           cima da sua própria versão desfocada, que já lá está e já tem a cor
           certa. `motion-safe` porque quem pede menos movimento não quer um
           fade — quer a imagem. */
        className={`h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-elemento ${
          pintada || !image.lqip ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

/**
 * A foto em grande, por cima da grelha.
 *
 * Uma miniatura de 400 px não distingue duas mesas de terracota — aqui puxa-se
 * o ORIGINAL, que é justamente a foto que vai para a proposta. Fica dentro do
 * diálogo (e da armadilha de foco), com ← → a passar de foto e Esc a voltar.
 */
export function Preview({
  image,
  index,
  count,
  selected,
  used,
  canSelect,
  onToggle,
  onStep,
  onClose,
}: {
  image: ThemeImage;
  index: number;
  count: number;
  selected: boolean;
  used: boolean;
  canSelect: boolean;
  onToggle: () => void;
  onStep: (dir: -1 | 1) => void;
  onClose: () => void;
}) {
  const firstRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  return (
    <div
      role="group"
      aria-label={`Foto ${index + 1} de ${count} em grande`}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onStep(-1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onStep(1);
        }
      }}
      /* ── UMA VISTA A SUBSTITUIR OUTRA DENTRO DO MESMO CROMADO ──────────
         Carregar numa foto tapava a grelha de um fotograma para o outro: o
         mosaico estava lá e, no seguinte, esta chapa branca por cima dele.
         Não é uma caixa a APARECER por cima da página (essa é a
         `.bo-entrada`) — o cromado do diálogo fica onde está e o que muda é
         o conteúdo dentro dele, que é precisamente o que a `.view-in` da
         casa diz: 240 ms, oito píxeis, a curva de quem apresenta.

         E é `backwards` e não `both`, do lado do CSS, de propósito: não
         deixa `transform` nenhum pendurado no fim. Um `transform`
         persistente aqui criava um bloco de contenção e partia qualquer
         `position: fixed` que viesse a nascer lá dentro — a mesma lição que
         está escrita ao pé da regra no `globals.css`. */
      className="view-in absolute inset-0 z-10 flex flex-col bg-[var(--bo-surface)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--bo-hairline)] px-5 py-3">
        <p className="bo-text-muted text-xs">
          Foto {index + 1} de {count}
          {used ? " · já nesta proposta" : ""}
        </p>
        <Button ref={firstRef} size="sm" variant="ghost" onClick={onClose}>
          Voltar à grelha
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--bo-tinta-6)] p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt=""
          decoding="async"
          // É a foto que ela pediu para ver: passa à frente do que a grelha
          // esteja a descarregar por trás.
          fetchPriority="high"
          className="max-h-full max-w-full object-contain"
        />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-[var(--bo-hairline)] px-5 py-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => onStep(-1)} disabled={index === 0}>
            ← Anterior
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onStep(1)}
            disabled={index === count - 1}
          >
            Seguinte →
          </Button>
        </div>
        <Button
          size="sm"
          variant={selected ? "secondary" : "primary"}
          onClick={onToggle}
          disabled={!canSelect}
        >
          {selected ? "Retirar da seleção" : "Escolher esta foto"}
        </Button>
      </div>
    </div>
  );
}
