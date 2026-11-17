"use client";

import { useEffect, useRef, useState } from "react";
import type { ThemeImage } from "@/lib/theme-types";
import { criarFilaDeImagens } from "../fila-de-imagens";

/**
 * A célula de uma fotografia na grelha de um tema, e a fila dos originais.
 * (Saiu do topo do `Temas.tsx` na fase 8 de `docs/ESTRUTURA-DO-CODIGO.md`,
 * tal e qual.)
 */

/** Quantas fotos saltadas mostram miniatura no relatório. As restantes
 *  aparecem só pelo nome: desenhar 150 pré-visualizações de fotos que NÃO
 *  foram adicionadas custaria mais do que a informação vale. */
export const SKIPPED_PREVIEWS = 12;

/**
 * QUANTOS ORIGINAIS A GRELHA DESCARREGA AO MESMO TEMPO — o número que decide
 * se a primeira foto aparece a 1 segundo ou aos 26.
 *
 * Isto só se aplica às fotos SEM miniatura (a biblioteca anterior às
 * miniaturas). Uma célula dessas puxa o original: ~2,6 MB para desenhar 150 px.
 *
 * Medido em Chromium, HTTP/2 (é o que o Storage fala), 60 fotos, 50 Mbit/s
 * partilhados, TTFB de 60 ms — mediana de 2 corridas:
 *
 *   como estava (60 pedidos ao mesmo tempo) → 1ª foto aos 26 351 ms
 *   tecto de 6 em voo                       → 1ª foto aos  2 634 ms
 *   tecto de 3 em voo                       → 1ª foto aos  1 405 ms
 *   tecto de 2 em voo                       → 1ª foto aos    928 ms
 *
 * A última foto chega ao mesmo tempo em todos (~26 s): o canal está cheio de
 * qualquer maneira. O que muda é a ORDEM — sem tecto, os 60 downloads
 * repartem o canal e acabam todos no fim, ou seja, a foto que está no ecrã
 * espera pelas 59 que não estão.
 *
 * Três e não dois: a mesma medição a 300 Mbit/s (fibra) mostra que um tecto de
 * 2 deixa de encher o canal — a última foto passa de 5316 ms (como estava)
 * para 5389 ms, enquanto com 3 fica em 4936 ms. Com 3, a primeira foto aparece
 * aos 297 ms a 300 Mbit/s e aos 1405 ms a 50 Mbit/s, e a última NUNCA chega
 * depois do que chegava.
 *
 * As fotos COM miniatura não passam por aqui: são ~25 KB e medir mostrou que
 * pôr-lhes um tecto PIORA (60 × 25 KB em ondas de 6 = 1019 ms contra 350 ms
 * sem tecto). O que é caro é o byte, não o pedido.
 */
export const HEAVY_IMAGE_CONCURRENCY = 3;

/** Quantas células entram na primeira dobra — carregam já, e com prioridade.
 *  Doze cobre duas linhas em ecrã largo (a grelha faz 6 colunas). */
export const ABOVE_FOLD = 12;

/** Um URL de objeto para a foto local, ou `undefined` onde o navegador não
 *  saiba fazê-los (é o caso do jsdom, nos testes). */
export function objectUrl(file: File): string | undefined {
  try {
    return typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(file)
      : undefined;
  } catch {
    return undefined;
  }
}

export function revokeUrl(url?: string) {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* nada a fazer — o URL já não existe */
  }
}

/**
 * A FILA DOS ORIGINAIS.
 *
 * Uma célula que não tem miniatura puxa o original (~2,6 MB). Deixar o browser
 * pedir os 60 ao mesmo tempo — que é o que ele faz, e o `loading="lazy"` não
 * trava: medido, pediu os 60 na mesma — reparte o canal por todos e faz com
 * que TODOS acabem no fim. Esta fila deixa passar `HEAVY_IMAGE_CONCURRENCY` de
 * cada vez, pela ordem da grelha, que é a ordem por que ela olha.
 *
 * Vive fora do componente porque o canal também é um só: duas grelhas abertas
 * não têm o dobro da linha. É deliberadamente simples — sem estado partilhado
 * a manter, sem React: uma foto pede vez, e larga-a quando acaba (ou quando a
 * célula sai do ecrã).
 *
 * ── O CÓDIGO É O DA `fila-de-imagens.ts`; O TECTO CONTINUA A SER DESTA GRELHA ─
 * Era uma cópia à mão do mecanismo, até à fase 8 de
 * `docs/ESTRUTURA-DO-CODIGO.md`. Passou a ser uma instância da fábrica de lá,
 * com o seu tecto de 3 à parte das outras grelhas e o relógio do lado da célula
 * (`HEAVY_SLOT_TIMEOUT_MS`) — exactamente como antes. Juntá-la à fila
 * partilhada muda quantos originais descarregam ao mesmo tempo no separador, e
 * espera pela aprovação dela (ver o cabeçalho de `criarFilaDeImagens`).
 */
export const FILA_DA_BIBLIOTECA = criarFilaDeImagens({
  limite: HEAVY_IMAGE_CONCURRENCY,
  esperaMaximaMs: null,
});

/** Pede vez para descarregar um original; devolve a função de a largar
 *  (acabou ou desistiu — é idempotente). */
export const queueHeavyImage = FILA_DA_BIBLIOTECA.pedirVez;

/** Se um download ficar pendurado (nem carrega nem falha), a vez volta ao fim
 *  deste tempo: uma foto encravada não pode fechar a grelha toda. */
export const HEAVY_SLOT_TIMEOUT_MS = 30_000;

/**
 * A miniatura de uma foto na grelha.
 *
 * Mostra, por esta ordem: a foto LOCAL (quando acabou de ser carregada nesta
 * sessão — já está no computador dela, não se vai buscar nada), a miniatura, e
 * só depois o original. As fotos carregadas ANTES de as miniaturas existirem
 * não têm nenhuma, e é o original que aparece — é para essas que existe o
 * botão "Gerar miniaturas em falta".
 *
 * O `onError` é a segunda rede: um URL assinado para um objeto que já lá não
 * está falha no browser, e sem isto ficava uma célula partida numa grelha
 * inteira que funciona.
 */
export function Photo({
  image,
  alt,
  priority,
  localSrc,
}: {
  image: ThemeImage;
  alt: string;
  /** Está na primeira dobra: não espera por nada. */
  priority?: boolean;
  /** URL de objeto da foto que está no disco dela (carregada agora). */
  localSrc?: string;
}) {
  /** A imagem BARATA desta célula: a cópia local ou a miniatura (~25 KB). */
  const light = localSrc || image.thumbUrl;
  /** A barata falhou — miniatura apagada do bucket, ou cópia local já
   *  libertada. Fica só o original, e esse entra na fila como qualquer outro. */
  const [lightBroken, setLightBroken] = useState(false);
  /** A fila deu a vez a esta célula. */
  const [turn, setTurn] = useState(false);
  /** A fotografia já chegou — é o que dispara o fade por cima do LQIP. */
  const [pintada, setPintada] = useState(false);
  /** Sem imagem barata, esta célula vai puxar ~2,6 MB: espera pela vez. */
  const heavy = !light || lightBroken;
  const release = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!heavy) return;
    let timer = 0;
    const free = queueHeavyImage(() => {
      setTurn(true);
      // Rede de segurança: um pedido que nunca termina não pode ficar com a
      // vez para sempre.
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
    // `image.url` entra nas dependências para uma foto reassinada voltar a
    // pedir vez em vez de ficar com um URL expirado.
  }, [heavy, image.url]);

  // Uma célula à espera de vez fica SEM `src` (e não com `src=""`, que é um
  // pedido à própria página). É a única forma de a fila valer alguma coisa: um
  // `src` posto é um download começado.
  const src = heavy ? (turn ? image.url : undefined) : light;

  const finished = () => {
    release.current?.();
    release.current = null;
  };

  return (
    /* O LQIP É O FUNDO DA CÉLULA — mesma regra do seletor de temas, e pela
       mesma razão: um `background-image` com um `data:` URI não é um pedido,
       não entra na fila de descarregamentos, e está pintado no instante em que
       este elemento existe.
       Aqui há uma diferença: a célula pode já ter `localSrc` — a miniatura que
       acabou de ser feita no browser, ainda em memória, de uma foto carregada
       há segundos. Essa aparece na hora e não precisa de placeholder nenhum. */
    <div
      className="h-full w-full bg-[var(--bo-tinta-6)] bg-cover bg-center"
      style={image.lqip && !localSrc ? { backgroundImage: `url("${image.lqip}")` } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        // As pesadas são geridas pela fila — pô-las também em `lazy` fazia uma
        // célula fora do ecrã ficar com a vez sem chegar a pedir nada.
        loading={heavy || priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        onLoad={() => {
          finished();
          setPintada(true);
        }}
        onError={() => {
          finished();
          if (!heavy) setLightBroken(true);
        }}
        className={`h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-elemento ${
          pintada || localSrc || !image.lqip ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

/**
 * A miniatura de uma foto SALTADA, desenhada do ficheiro que está no
 * computador dela.
 *
 * Custo zero de rede: o `File` já está em memória (é o mesmo que o "Adicionar
 * mesmo assim" vai usar). O URL de objeto é criado uma vez e registado para
 * ser libertado à saída da pasta, como todos os outros deste ecrã.
 */
export function SkippedThumb({
  file,
  track,
}: {
  file: File;
  track: (file: File) => string | undefined;
}) {
  const [src] = useState(() => track(file));
  if (!src) return <div className="bo-skeleton h-full w-full" aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" decoding="async" className="h-full w-full object-cover" />;
}
