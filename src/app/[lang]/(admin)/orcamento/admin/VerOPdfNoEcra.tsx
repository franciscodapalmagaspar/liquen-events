"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { FolhaOuDialogo } from "./ui/FolhaOuDialogo";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PDF FINAL, VISTO DENTRO DO ESTÚDIO — NO TELEMÓVEL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela (23/10): «não dá para enviar as propostas… por telemóvel» — e,
 * à pergunta de onde parava: «No "Ver o PDF final"».
 *
 * O envio só desbloqueia depois de ver o PDF final desta versão (14/10). Ver
 * era DESCARREGAR: um `<a download>` com o ficheiro. Num computador o ficheiro
 * vai para as transferências e a página fica; num telemóvel o PDF abre por
 * cima do back office (ou não abre, dentro de uma app), e voltar recarrega o
 * estúdio — o «já vi» vivia só na memória da página e perdia-se. O botão
 * voltava a «Ver o PDF», sem fim.
 *
 * Aqui o PDF desenha-se DENTRO do estúdio, página a página, com o pdf.js (o
 * mesmo que a proposta online usa quando as imagens falham —
 * `PaginasNoBrowser.tsx`). Não se sai da página, e o «Está certo — enviar»
 * fica por baixo das páginas que se acabaram de ver. «Descarregar» continua lá
 * para quem o quiser guardar.
 *
 * A CSP do back office não deixa mostrar um `blob:` PDF numa moldura (ver
 * `guardarNoDisco`), mas o pdf.js lê os bytes e pinta numa tela — isso deixa.
 */

/** A folha do `pdf-editorial` (A4 deitada, em pontos): o lugar reservado. */
const FOLHA = 1123 / 794;
/** Acima disto o telemóvel gasta memória sem se ver diferença. */
const DENSIDADE_MAXIMA = 2;

function carregarPdfjs() {
  // A versão «legacy», como em `PaginasNoBrowser.tsx`: a moderna deixa as
  // páginas em branco no Safari do iPhone.
  return import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return pdfjs;
  });
}

export function VerOPdfNoEcra({
  aberto,
  blob,
  titulo,
  accoes,
  onFechar,
}: {
  aberto: boolean;
  /** O PDF tal como veio do servidor — o mesmo que «Descarregar» guarda. */
  blob: Blob | null;
  titulo: string;
  /** «Está certo — enviar», «Descarregar»… — decide quem abre. */
  accoes: ReactNode;
  onFechar: () => void;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    if (!aberto || !blob) return;
    let cancelado = false;
    let destruir: (() => void) | null = null;
    // Um PDF novo é um componente novo (quem abre dá-lhe `key`): não há
    // estado de um PDF anterior a limpar aqui.
    void (async () => {
      try {
        const [pdfjs, bytes] = await Promise.all([carregarPdfjs(), blob.arrayBuffer()]);
        if (cancelado) return;
        const tarefa = pdfjs.getDocument({ data: new Uint8Array(bytes) });
        destruir = () => void tarefa.destroy();
        const doc = await tarefa.promise;
        if (!cancelado) setPdf(doc);
      } catch {
        if (!cancelado) setFalhou(true);
      }
    })();
    return () => {
      cancelado = true;
      destruir?.();
    };
  }, [aberto, blob]);

  return (
    <FolhaOuDialogo
      aberto={aberto}
      onFechar={onFechar}
      titulo={titulo}
      descricao="Percorre as páginas: é exactamente o que o cliente vai receber."
      largura="largo"
      folhaAlta
      accoes={accoes}
    >
      {falhou ? (
        <p role="status" className="py-8 text-center text-sm text-[var(--bo-text-muted)]">
          O PDF não abriu aqui. Usa «Descarregar» para o ver no telemóvel.
        </p>
      ) : !pdf ? (
        <div
          role="status"
          className="relative w-full overflow-hidden rounded-[var(--bo-raio-miudeza)] bg-[var(--bo-surface-sunken)]"
          style={{ aspectRatio: String(FOLHA) }}
        >
          <span className="absolute inset-0 flex items-center justify-center text-caption text-[var(--bo-text-muted)] motion-safe:animate-pulse">
            A abrir o PDF…
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-3" data-testid="pdf-no-ecra">
          {Array.from({ length: pdf.numPages }, (_, i) => (
            <Pagina
              key={i}
              pdf={pdf}
              numero={i + 1}
              rotulo={`Página ${i + 1} de ${pdf.numPages}`}
              ja={i === 0}
            />
          ))}
        </div>
      )}
    </FolhaOuDialogo>
  );
}

function Pagina({
  pdf,
  numero,
  rotulo,
  ja,
}: {
  pdf: PDFDocumentProxy;
  numero: number;
  rotulo: string;
  /** A primeira desenha-se logo; as outras quando se aproximam do ecrã. */
  ja: boolean;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const [proporcao, setProporcao] = useState(FOLHA);
  const [pronta, setPronta] = useState(false);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    let cancelado = false;
    let tarefa: { cancel: () => void } | null = null;

    const desenhar = async () => {
      const pagina: PDFPageProxy = await pdf.getPage(numero);
      if (cancelado || !tela.current || !caixa.current) return;
      const base = pagina.getViewport({ scale: 1 });
      setProporcao(base.width / base.height);
      const densidade = Math.min(window.devicePixelRatio || 1, DENSIDADE_MAXIMA);
      const largura = caixa.current.clientWidth || base.width;
      const vista = pagina.getViewport({ scale: (largura / base.width) * densidade });
      const c = tela.current;
      c.width = Math.floor(vista.width);
      c.height = Math.floor(vista.height);
      const render = pagina.render({ canvas: c, viewport: vista });
      tarefa = render;
      await render.promise;
      if (!cancelado) setPronta(true);
    };
    const arrancar = () => void desenhar().catch(() => undefined);

    if (ja || typeof IntersectionObserver === "undefined") {
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
  }, [pdf, numero, ja]);

  return (
    <div
      ref={caixa}
      className={`relative w-full overflow-hidden rounded-[var(--bo-raio-miudeza)] ring-1 ring-[var(--bo-hairline)] ${
        pronta ? "" : "bg-[var(--bo-surface-sunken)]"
      }`}
      style={{ aspectRatio: String(proporcao) }}
    >
      <canvas ref={tela} aria-hidden className="block h-full w-full" />
      <p className="sr-only">{rotulo}</p>
    </div>
  );
}
