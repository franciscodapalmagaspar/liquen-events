"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy, PDFWorker } from "pdfjs-dist";
import { contar } from "./textos-da-pagina";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PDF DESENHADO NO PRÓPRIO BROWSER — SÓ QUANDO AS IMAGENS FALHAM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Desde 22/10 as páginas chegam já desenhadas pelo servidor (ver
 * `PaginasDoPdf.tsx` e `src/lib/paginas-do-pdf.ts`). Isto fica como rede: se a
 * primeira imagem não carregar, a página desenha o PDF aqui, com o pdf.js, e o
 * casal continua a ver a proposta. Só se descarrega nesse caso.
 *
 * Palavras dela (22/10): «a proposta online não tem nada a ver com a proposta
 * PDF que nós fazemos agora… quero que esteja ao mesmo nível». Escolheu que a
 * página MOSTRE O PDF, tal e qual — e logo a seguir: «quero que tornes
 * extremamente rápido quando se carrega no botão… ao carregar aparecer logo».
 *
 * O mesmo nível não se consegue com um segundo desenho em HTML: dois desenhos
 * do mesmo documento acabam sempre a discordar (foi exactamente o que
 * aconteceu). Aqui as páginas SÃO as do PDF — o mesmo ficheiro que segue em
 * anexo no email, servido pela mesma rota do botão «PDF» —, desenhadas pelo
 * pdf.js no próprio browser.
 *
 * ── PORQUE É QUE ABRE DEPRESSA ───────────────────────────────────────────────
 *   · A rota do PDF responde por pedaços (`Accept-Ranges`, ver
 *     `pdf-resposta.ts` e `pdf-do-armazenamento.ts`), e o pdf.js pede só os
 *     pedaços de que precisa (`disableAutoFetch`): a primeira página aparece
 *     sem esperar pelos 5 MB do ficheiro inteiro.
 *   · A primeira página desenha-se logo; as outras só quando se aproximam do
 *     ecrã (um observador, com folga de ecrã e meio).
 *   · O desenho é feito num `worker`, fora da linha principal: a página
 *     continua a rolar enquanto as páginas seguintes são pintadas.
 *   · Até a primeira página chegar, a caixa já tem o tamanho de uma folha
 *     (1123 × 794, a folha do `pdf-editorial`) — nada salta quando chega.
 *
 * Sem registo de nada (ver `zero-rastreio.test.ts`): não se mede quem abriu,
 * nem quando, nem até onde rolou.
 *
 * Se o browser não conseguir (muito antigo, ou a rede caiu), diz-se e fica o
 * botão do PDF, que está logo por baixo.
 */

/** A folha do `pdf-editorial` (A4 deitada, em pontos). */
const FOLHA = { largura: 1123, altura: 794 };
/** Acima disto o telemóvel gasta memória sem se ver diferença. */
const DENSIDADE_MAXIMA = 2;
/** Os pedaços que o pdf.js pede de cada vez. */
const PEDACO = 256 * 1024;

/**
 * O pdf.js, o trabalhador e o PDF partem juntos: o trabalhador descarrega e
 * compila o seu ficheiro em paralelo com o leitor.
 */
type Carga = { promessa: Promise<PDFDocumentProxy>; destruir: () => void };
const cargas = new Map<string, Carga>();

function carregarPdfjs() {
  // A versão «legacy»: a moderna usa `Map.prototype.getOrInsertComputed`, que
  // ainda não existe no Safari do iPhone nem no Chrome de há um ano — as
  // páginas ficavam em branco, sem erro à vista (medido, 22/10).
  return import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return pdfjs;
  });
}
let pdfjsPromessa: ReturnType<typeof carregarPdfjs> | null = null;
let trabalhador: Promise<PDFWorker> | null = null;

function carregar(url: string): Carga {
  const ja = cargas.get(url);
  if (ja) return ja;
  pdfjsPromessa ??= carregarPdfjs();
  trabalhador ??= pdfjsPromessa.then((pdfjs) => new pdfjs.PDFWorker());
  let destruir = () => {};
  const promessa = Promise.all([pdfjsPromessa, trabalhador]).then(([pdfjs, worker]) => {
    const tarefa = pdfjs.getDocument({
      url,
      worker,
      rangeChunkSize: PEDACO,
      disableAutoFetch: true,
    });
    destruir = () => void tarefa.destroy();
    return tarefa.promise;
  });
  const carga = { promessa, destruir: () => destruir() };
  cargas.set(url, carga);
  // Uma carga falhada não fica guardada: voltar à página tenta outra vez.
  promessa.catch(() => cargas.delete(url));
  return carga;
}

export default function PaginasNoBrowser({
  url,
  textos,
}: {
  url: string;
  textos: { aAbrirAProposta: string; paginaDe: string; pdfNaoAbriu: string };
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let cancelado = false;
    // A mesma carga que já partiu quando o ficheiro foi avaliado (ver acima).
    carregar(url)
      .promessa.then((doc) => {
        if (!cancelado) setPdf(doc);
      })
      .catch(() => {
        if (!cancelado) setFalhou(true);
      });
    return () => {
      cancelado = true;
    };
  }, [url]);

  if (falhou) {
    return (
      <p role="status" className="text-foreground/80 text-sm text-center leading-relaxed py-10">
        {textos.pdfNaoAbriu}
      </p>
    );
  }

  if (!pdf) {
    return (
      <div
        role="status"
        className="relative w-full overflow-hidden rounded-sm bg-foreground/[0.06] shadow-sm"
        style={{ aspectRatio: `${FOLHA.largura} / ${FOLHA.altura}` }}
      >
        <span className="absolute inset-0 flex items-center justify-center text-foreground/70 text-xs tracking-[0.2em] uppercase motion-safe:animate-pulse">
          {textos.aAbrirAProposta}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-5">
      {Array.from({ length: pdf.numPages }, (_, i) => (
        <Pagina
          key={i}
          pdf={pdf}
          numero={i + 1}
          rotulo={contar(textos.paginaDe, i + 1, pdf.numPages)}
          logo={i === 0}
        />
      ))}
    </div>
  );
}

function Pagina({
  pdf,
  numero,
  rotulo,
  logo,
}: {
  pdf: PDFDocumentProxy;
  numero: number;
  rotulo: string;
  /** A primeira desenha-se já, sem esperar pelo observador. */
  logo: boolean;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const [proporcao, setProporcao] = useState(FOLHA.largura / FOLHA.altura);
  const [texto, setTexto] = useState("");
  const [pronta, setPronta] = useState(false);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    let cancelado = false;
    let pagina: PDFPageProxy | null = null;
    let tarefa: { cancel: () => void } | null = null;

    const desenhar = async () => {
      pagina = await pdf.getPage(numero);
      if (cancelado || !tela.current || !caixa.current) return;
      const base = pagina.getViewport({ scale: 1 });
      setProporcao(base.width / base.height);
      const densidade = Math.min(window.devicePixelRatio || 1, DENSIDADE_MAXIMA);
      const largura = caixa.current.clientWidth || base.width;
      const escala = (largura / base.width) * densidade;
      const vista = pagina.getViewport({ scale: escala });
      const c = tela.current;
      c.width = Math.floor(vista.width);
      c.height = Math.floor(vista.height);
      const render = pagina.render({ canvas: c, viewport: vista });
      tarefa = render;
      await render.promise;
      if (cancelado) return;
      setPronta(true);
      // O texto da página, para o leitor de ecrã — a tela é só imagem.
      const conteudo = await pagina.getTextContent();
      if (cancelado) return;
      setTexto(
        conteudo.items
          .map((x) => ("str" in x ? x.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      );
    };

    const arrancar = () => void desenhar().catch(() => undefined);

    if (logo || typeof IntersectionObserver === "undefined") {
      arrancar();
      return () => {
        cancelado = true;
        tarefa?.cancel();
      };
    }
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          obs.disconnect();
          arrancar();
        }
      },
      { rootMargin: "150% 0px" },
    );
    obs.observe(el);
    return () => {
      cancelado = true;
      obs.disconnect();
      tarefa?.cancel();
    };
  }, [pdf, numero, logo]);

  return (
    <div
      ref={caixa}
      className={`relative w-full overflow-hidden rounded-sm shadow-sm ${
        pronta ? "" : "bg-foreground/[0.06]"
      }`}
      style={{ aspectRatio: String(proporcao) }}
    >
      <canvas ref={tela} aria-hidden className="block h-full w-full" />
      {/* O nome da página e o texto dela, para o leitor de ecrã — a tela é
          só imagem. */}
      <p className="sr-only">
        {rotulo}
        {texto ? `. ${texto}` : ""}
      </p>
    </div>
  );
}
