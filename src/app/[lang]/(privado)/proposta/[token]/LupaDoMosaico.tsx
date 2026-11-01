"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LUPA DO MOSAICO — a passagem de uma fotografia para a outra
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela, no iPhone (1/11): «a passagem das fotos aqui na proposta online está
 * péssima». E estava, por três razões que se viam:
 *
 *   1. trocava-se o `src` de um só `<img>`: o dedo não arrastava nada, e a
 *      fotografia seguinte só aparecia — de repente — quando o ficheiro
 *      grande acabava de chegar pela rede (no 4G, segundos);
 *   2. nenhuma vizinha estava pedida antes de ser precisa;
 *   3. o fundo era 96 % opaco, e a barra e o mosaico viam-se por trás.
 *
 * Agora é o gesto da app Fotografias:
 *
 *   · uma FITA horizontal com `scroll-snap`: a fotografia segue o dedo com a
 *     física do próprio sistema, e assenta na seguinte. As setas e o teclado
 *     deslizam a mesma fita — um só movimento, venha de onde vier;
 *   · cada fotografia nasce com a PEQUENA que já estava no mosaico (está na
 *     cache: aparece no instante do toque) e a grande assenta por cima,
 *     num fundido, quando chegar. As duas são `object-contain` na mesma
 *     caixa, por isso estão sempre registadas uma sobre a outra;
 *   · só as fotografias a duas de distância têm `<img>`: as de ao lado já
 *     estão pedidas antes de o dedo lá chegar, e uma proposta com 46 não pede
 *     46 ficheiros grandes de uma vez;
 *   · arrastar para BAIXO fecha (a fotografia acompanha o dedo e o fundo
 *     esbate-se), como em qualquer galeria do telemóvel;
 *   · o contador «3 / 18» diz onde se está — sem ele, a fita não tem fim à
 *     vista.
 *
 * Fechar é uma tarefa, e por isso é imediato (como no `Inspiracao.tsx`): o
 * diálogo sai no mesmo instante do gesto, e o foco volta à célula.
 *
 * Com movimento reduzido: sem fundidos nem deslizes — a fita salta.
 */

export type FotoDaLupa = {
  grande: string;
  pequena: string;
  /**
   * Largura a dividir pela altura, lida na do mosaico. Com ela a caixa tem o
   * tamanho exacto da fotografia, e um toque ao lado dela fecha a lupa.
   */
  forma?: number;
};

/** Quantas fotografias de cada lado têm `<img>` montado. */
const VIZINHAS = 2;
/** O arrasto para baixo que fecha, em px. */
const FECHA_A = 110;
/** Antes disto o dedo ainda não disse para onde vai. */
const DECIDE_A = 10;

function reduzMovimento() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function LupaDoMosaico({
  aberta,
  t,
  aoFechar,
}: {
  aberta: { lista: FotoDaLupa[]; i: number } | null;
  t: { fechar: string; anterior: string; seguinte: string; fotografia: string };
  aoFechar: () => void;
}) {
  const dialogo = useRef<HTMLDivElement>(null);
  const fita = useRef<HTMLDivElement>(null);
  const veu = useRef<HTMLDivElement>(null);
  const botaoFechar = useRef<HTMLButtonElement>(null);
  const [i, setI] = useState(aberta?.i ?? 0);
  /** Para onde as setas mandaram a fita, enquanto ela ainda lá não chegou. */
  const destino = useRef<number | null>(null);
  const lista = aberta?.lista ?? [];
  const n = lista.length;

  // Cada vez que abre, começa na fotografia tocada — durante o desenho, para
  // não haver um fotograma com o índice da última vez.
  const [abertaVista, setAbertaVista] = useState(aberta);
  if (abertaVista !== aberta) {
    setAbertaVista(aberta);
    if (aberta) setI(aberta.i);
  }

  /** A fita posta na fotografia tocada ANTES de se pintar seja o que for. */
  useLayoutEffect(() => {
    const f = fita.current;
    if (!aberta || !f) return;
    destino.current = null;
    f.scrollLeft = aberta.i * f.clientWidth;
  }, [aberta]);

  const irPara = useCallback(
    (k: number) => {
      const f = fita.current;
      if (!f || k < 0 || k >= n) return;
      destino.current = k;
      if (typeof f.scrollTo === "function" && f.clientWidth > 0) {
        f.scrollTo({ left: k * f.clientWidth, behavior: reduzMovimento() ? "auto" : "smooth" });
      } else {
        setI(k);
      }
    },
    [n],
  );

  const andar = useCallback((passo: number) => irPara((destino.current ?? i) + passo), [irPara, i]);

  // O índice vem da fita: muda a meio do caminho, como numa galeria nativa.
  useEffect(() => {
    const f = fita.current;
    if (!aberta || !f) return;
    let pedido = 0;
    const aoRolar = () => {
      cancelAnimationFrame(pedido);
      pedido = requestAnimationFrame(() => {
        const w = f.clientWidth;
        if (w <= 0) return;
        const k = Math.max(0, Math.min(n - 1, Math.round(f.scrollLeft / w)));
        if (destino.current === null || Math.abs(f.scrollLeft - destino.current * w) < 2) {
          destino.current = null;
          setI(k);
        }
      });
    };
    // Rodar o telemóvel muda a largura: a fita volta a assentar na mesma.
    const aoMudarDeTamanho = () => {
      destino.current = null;
      f.scrollLeft = Math.round(f.scrollLeft / Math.max(1, f.clientWidth)) * f.clientWidth;
    };
    f.addEventListener("scroll", aoRolar, { passive: true });
    window.addEventListener("resize", aoMudarDeTamanho);
    return () => {
      cancelAnimationFrame(pedido);
      f.removeEventListener("scroll", aoRolar);
      window.removeEventListener("resize", aoMudarDeTamanho);
    };
  }, [aberta, n]);

  // Teclado, o corpo sem rolar, o foco no «Fechar» e preso no diálogo.
  useEffect(() => {
    if (!aberta) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    botaoFechar.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        aoFechar();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        andar(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        andar(-1);
      } else if (e.key === "Tab") {
        const focaveis = dialogo.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
        if (!focaveis || focaveis.length === 0) return;
        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primeiro.focus();
        }
      }
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.body.style.overflow = antes;
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberta, andar, aoFechar]);

  /**
   * ── ARRASTAR PARA BAIXO FECHA ─────────────────────────────────────────────
   *
   * A fita é `touch-action: pan-x`: o browser só trata do gesto lateral, e o
   * vertical fica para aqui. Escreve-se direito no estilo, sem estado: são
   * sessenta mudanças por segundo, e um desenho do React por cada uma era o
   * contrário de suave.
   */
  const toque = useRef<{ x: number; y: number; eixo: "x" | "y" | null } | null>(null);
  const quadroAtual = () =>
    fita.current?.querySelector<HTMLElement>(`[data-k="${i}"] .pw-lb-quadro`) ?? null;
  const largarArrasto = (fechar: boolean) => {
    const q = quadroAtual();
    const v = veu.current;
    if (fechar) {
      aoFechar();
    } else if (q) {
      q.classList.add("pw-lb-volta");
      q.style.transform = "";
      q.addEventListener("transitionend", () => q.classList.remove("pw-lb-volta"), { once: true });
    }
    if (v) v.style.opacity = "";
    if (fechar && q) q.style.transform = "";
  };

  return (
    <div
      ref={dialogo}
      className={`pw-lb${aberta ? " pw-on" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={t.fotografia}
      hidden={!aberta}
      onClick={(e) => {
        const alvo = e.target as HTMLElement;
        // Um toque FORA da fotografia fecha; na fotografia não faz nada.
        if (alvo === e.currentTarget || alvo.classList.contains("pw-lb-folha")) aoFechar();
      }}
    >
      <div ref={veu} aria-hidden className="pw-lb-veu" />
      {aberta && (
        <>
          <div
            ref={fita}
            className="pw-lb-fita"
            onTouchStart={(e) => {
              const p = e.touches[0];
              toque.current =
                p && e.touches.length === 1 ? { x: p.clientX, y: p.clientY, eixo: null } : null;
            }}
            onTouchMove={(e) => {
              const ini = toque.current;
              const p = e.touches[0];
              if (!ini || !p) return;
              const dx = p.clientX - ini.x;
              const dy = p.clientY - ini.y;
              if (!ini.eixo) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) < DECIDE_A) return;
                ini.eixo = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
              }
              if (ini.eixo !== "y") return;
              const desce = Math.max(0, dy);
              const q = quadroAtual();
              if (q)
                q.style.transform = `translate3d(0, ${desce}px, 0) scale(${1 - Math.min(desce, 600) / 2400})`;
              if (veu.current) veu.current.style.opacity = `${1 - Math.min(desce, 400) / 600}`;
            }}
            onTouchEnd={(e) => {
              const ini = toque.current;
              toque.current = null;
              const p = e.changedTouches[0];
              if (!ini || ini.eixo !== "y" || !p) return;
              largarArrasto(p.clientY - ini.y > FECHA_A);
            }}
            onTouchCancel={() => {
              if (toque.current?.eixo === "y") largarArrasto(false);
              toque.current = null;
            }}
          >
            {lista.map((foto, k) => (
              <div key={k} data-k={k} className="pw-lb-folha" aria-hidden={k !== i}>
                {Math.abs(k - i) <= VIZINHAS && <Fotografia foto={foto} aVista={k === i} />}
              </div>
            ))}
          </div>

          <div className="pw-lb-topo">
            <span className="pw-lb-n" aria-live="polite">
              {i + 1} / {n}
            </span>
            <button ref={botaoFechar} type="button" className="pw-x" onClick={aoFechar}>
              {t.fechar}
            </button>
          </div>
          <button
            type="button"
            className="pw-p"
            aria-label={t.anterior}
            disabled={i === 0}
            onClick={() => andar(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="pw-nx"
            aria-label={t.seguinte}
            disabled={i === n - 1}
            onClick={() => andar(1)}
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Uma folha da fita: a pequena por baixo, a grande por cima quando chegar.
 * Se a grande falhar, fica a pequena — nunca um ícone partido.
 */
function Fotografia({ foto, aVista }: { foto: FotoDaLupa; aVista: boolean }) {
  const [chegou, setChegou] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const mesma = foto.grande === foto.pequena;
  const medida = foto.forma && Number.isFinite(foto.forma) && foto.forma > 0;
  return (
    <div
      className={`pw-lb-quadro${medida ? " pw-lb-medido" : ""}`}
      style={medida ? ({ "--pw-lb-r": foto.forma } as CSSProperties) : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a do mosaico, já na cache */}
      <img src={foto.pequena} alt="" draggable={false} className="pw-lb-pequena" />
      {!mesma && !falhou && (
        // eslint-disable-next-line @next/next/no-img-element -- o ficheiro grande, assinado
        <img
          src={foto.grande}
          alt=""
          draggable={false}
          decoding="async"
          fetchPriority={aVista ? "high" : "low"}
          className={`pw-lb-grande${chegou ? " pw-on" : ""}`}
          onLoad={() => setChegou(true)}
          onError={() => setFalhou(true)}
        />
      )}
    </div>
  );
}
