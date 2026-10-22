"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { contar } from "./textos-da-pagina";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PROPOSTA ONLINE É O PRÓPRIO PDF — E ABRE COMO UMA FOTOGRAFIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela (22/10): «a proposta online não tem nada a ver com a proposta
 * PDF que nós fazemos agora… quero que esteja ao mesmo nível». Escolheu que a
 * página MOSTRE O PDF, tal e qual — e logo a seguir: «quero que tornes
 * extremamente rápido quando se carrega no botão… ao carregar aparecer logo».
 *
 * As páginas SÃO as do PDF que segue em anexo no email, desenhadas uma vez no
 * servidor pelo mesmo pdf.js que as desenharia aqui (ver
 * `src/lib/paginas-do-pdf.ts`, que tem as medições). O telemóvel só recebe
 * imagens, e a primeira está no HTML desde o primeiro byte: o browser pede-a
 * antes de o JavaScript da página sequer chegar.
 *
 *   · A primeira página não espera por nada (nem pelo React): `<img>` com a
 *     prioridade alta, no tamanho de uma folha, para nada saltar quando chega.
 *   · As outras chegam com a contagem (`/paginas`) e pedem-se quando se
 *     aproximam do ecrã (`loading="lazy"`).
 *   · O `srcset` deixa o browser escolher a largura que o ecrã precisa.
 *   · O texto de cada página fica para o leitor de ecrã — a imagem é só imagem.
 *
 * Se as imagens falharem, a página desenha o PDF no próprio browser
 * (`PaginasNoBrowser.tsx`) — que só se descarrega nesse caso.
 *
 * Sem registo de nada (ver `zero-rastreio.test.ts`): não se mede quem abriu,
 * nem quando, nem até onde rolou.
 */

/** A folha do `pdf-editorial` (A4 deitada, em pontos). */
const FOLHA = 1123 / 794;
/** As larguras que o servidor desenha — as mesmas do `paginas-do-pdf.ts`. */
const LARGURAS = [800, 1200, 1600];
/** A coluna da página tem 1024 px no máximo (`max-w-5xl`), com 1 rem de cada lado no telemóvel. */
const TAMANHOS = "(min-width: 1056px) 1024px, calc(100vw - 2rem)";

const PaginasNoBrowser = dynamic(() => import("./PaginasNoBrowser"), { ssr: false });

type Pagina = { proporcao: number; texto: string };

export default function PaginasDoPdf({
  base,
  v,
  textos,
}: {
  /** `/api/proposta/<token>` */
  base: string;
  /** A versão do conteúdo, para as imagens se guardarem no telemóvel. */
  v: string;
  textos: { aAbrirAProposta: string; paginaDe: string; pdfNaoAbriu: string };
}) {
  const [paginas, setPaginas] = useState<Pagina[] | null>(null);
  const [noBrowser, setNoBrowser] = useState(false);
  const primeira = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // A primeira imagem pode ter falhado antes de o React acordar.
    const img = primeira.current;
    if (img?.complete && img.naturalWidth === 0) setNoBrowser(true);

    let cancelado = false;
    fetch(`${base}/paginas`)
      .then((r) => (r.ok ? (r.json() as Promise<{ paginas: Pagina[] }>) : null))
      .then((j) => {
        if (!cancelado && j?.paginas?.length) setPaginas(j.paginas);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [base]);

  if (noBrowser) {
    return <PaginasNoBrowser url={`${base}/pdf`} textos={textos} />;
  }

  const n = paginas?.length ?? 0;
  const imagem = (i: number) => {
    const src = (w: number) => `${base}/pagina/${i}?w=${w}&v=${v}`;
    return { src: src(1200), srcSet: LARGURAS.map((w) => `${src(w)} ${w}w`).join(", ") };
  };

  return (
    <div className="flex flex-col gap-3 sm:gap-5">
      {[0, ...(paginas ? paginas.slice(1).map((_, k) => k + 1) : [])].map((k) => {
        const i = k + 1;
        const p = paginas?.[k];
        return (
          <figure
            key={i}
            className="relative w-full overflow-hidden rounded-sm bg-foreground/[0.06] shadow-sm"
            style={{ aspectRatio: String(p?.proporcao ?? FOLHA) }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a imagem já vem no tamanho certo do servidor; o otimizador do Next não a pode ver (é privada, por token). */}
            <img
              ref={i === 1 ? primeira : undefined}
              {...imagem(i)}
              sizes={TAMANHOS}
              alt={n ? contar(textos.paginaDe, i, n) : textos.aAbrirAProposta}
              loading={i === 1 ? "eager" : "lazy"}
              fetchPriority={i === 1 ? "high" : "auto"}
              decoding="async"
              onError={() => setNoBrowser(true)}
              className="absolute inset-0 block h-full w-full"
            />
            {p?.texto ? <figcaption className="sr-only">{p.texto}</figcaption> : null}
          </figure>
        );
      })}
    </div>
  );
}
