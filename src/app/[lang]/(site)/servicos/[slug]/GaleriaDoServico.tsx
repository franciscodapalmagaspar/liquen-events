"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SafeImage from "@/components/SafeImage";
import Reveal from "@/components/motion/Reveal";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { INTERVALO_MS, proximaTroca, type Troca } from "@/lib/galeria-do-servico";

/**
 * «MOMENTOS QUE CRIÁMOS» — A GRELHA QUE VAI TROCANDO, E A LUPA (1/11).
 *
 * Ela, no iPhone, na página de um serviço:
 *   · «temos que alternar as fotos aqui» → «irem trocando sozinhas»;
 *   · «quero que as pessoas, se quiserem ver essas fotos, consigam carregar»
 *     → «tocar abre em grande».
 *
 * A GRELHA. As seis posições de sempre, com o mesmo `Reveal` de entrada. De
 * `INTERVALO_MS` em `INTERVALO_MS` uma posição troca de fotografia (a regra está
 * em `lib/galeria-do-servico.ts`). A que entra põe-se por CIMA, invisível, e só
 * se esbate para a vista depois de o `<img>` ter chegado — nunca se vê um
 * desfoque nem um buraco a meio da troca. Só troca com a grelha no ecrã e o
 * separador à vista, nunca com «reduzir movimento», e nunca com a lupa aberta.
 *
 * A LUPA. Um `<dialog>` aberto com `showModal()`: o browser dá o foco preso, o
 * Esc e a camada por cima de tudo. Passa às fotografias todas da rotação —
 * a deslizar com o dedo (scroll-snap, o gesto nativo) ou com as setas, no ecrã
 * e no teclado. Só se desenham a fotografia à vista e as duas vizinhas.
 *   · `aria-modal` só enquanto está aberta: o scroll suave (`haCamadaPorCima`)
 *     pára com uma camada aberta, e uma `<dialog>` fechada não é `[hidden]`;
 *   · o `overflow` do `<body>` fica preso enquanto está aberta — é essa
 *     mudança que o vigia do Lenis ouve (`SmoothScroll.tsx`).
 */

export interface FotoDoServico {
  src: string;
  blur: string;
}

interface Textos {
  /** O nome da lupa para o leitor de ecrã («Galeria»). */
  galeria: string;
  fechar: string;
  anterior: string;
  seguinte: string;
  /** «de», como em «3 de 18». */
  de: string;
  indisponivel: string;
}

interface Props {
  fotos: FotoDoServico[];
  /** As colunas de cada posição no computador (seis). */
  spans: readonly string[];
  /** O texto alternativo de base; cada fotografia leva o seu número. */
  alt: string;
  textos: Textos;
}

const POSICOES = 6;

/**
 * O texto alternativo da fotografia, pelo seu número no conjunto: quem usa um
 * leitor de ecrã distingue as fotografias em vez de ouvir a mesma frase seis
 * vezes. A legenda de último recurso (`unavailableLabel`) só existe AQUI nesta
 * página: são as fotos do portefólio, o que o visitante veio ver.
 */
function altDe(base: string, fotos: FotoDoServico[], src: string): string {
  return `${base} ${fotos.findIndex((f) => f.src === src) + 1}`;
}

/**
 * A largura a pedir para cada posição, pelas colunas que ocupa no computador
 * (a grelha tem seis): os mosaicos largos não recebem a de 33vw ampliada.
 */
function sizesDe(span: string): string {
  const dvw = span.includes("col-span-4") ? "67vw" : span.includes("col-span-3") ? "50vw" : "33vw";
  return `(max-width: 1024px) 50vw, ${dvw}`;
}

export default function GaleriaDoServico({ fotos, spans, alt, textos }: Props) {
  const blurDe = useCallback(
    (src: string) => fotos.find((f) => f.src === src)?.blur ?? "",
    [fotos],
  );
  const [visiveis, setVisiveis] = useState(() => fotos.slice(0, POSICOES).map((f) => f.src));
  const [fila, setFila] = useState(() => fotos.slice(POSICOES).map((f) => f.src));
  // A troca em curso: a fotografia nova já está montada por cima, invisível.
  const [troca, setTroca] = useState<Troca | null>(null);
  const [chegou, setChegou] = useState(false);
  const [lupa, setLupa] = useState<{ ordem: string[]; inicio: number } | null>(null);

  const grelha = useRef<HTMLDivElement>(null);
  const camada = useRef<HTMLDivElement>(null);
  const ultima = useRef<number | null>(null);
  const aVista = useRef(false);

  // ── A RODA: uma troca de cada vez ──────────────────────────────────────
  // O relógio lê o estado mais recente por aqui, sem se reiniciar a cada troca.
  const estado = useRef({ visiveis, fila, troca, lupa });
  useEffect(() => {
    estado.current = { visiveis, fila, troca, lupa };
  });

  useEffect(() => {
    const el = grelha.current;
    if (!el || fotos.length <= POSICOES || prefersReducedMotion()) return;
    const io = new IntersectionObserver(
      ([e]) => {
        aVista.current = e.isIntersecting;
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    const relogio = window.setInterval(() => {
      const s = estado.current;
      if (!aVista.current || document.visibilityState !== "visible") return;
      if (s.troca || s.lupa) return;
      const t = proximaTroca(s.visiveis, s.fila, ultima.current);
      if (!t) return;
      ultima.current = t.posicao;
      setChegou(false);
      setTroca(t);
    }, INTERVALO_MS);
    return () => {
      io.disconnect();
      window.clearInterval(relogio);
    };
  }, [fotos.length]);

  // A fotografia nova chegou? Só então se esbate para a vista.
  useEffect(() => {
    if (!troca) return;
    const img = camada.current?.querySelector("img");
    if (!img) return;
    let parado = false;
    const pronta = () => {
      if (!parado) requestAnimationFrame(() => !parado && setChegou(true));
    };
    const falhou = () => {
      // Não chegou: desiste desta troca, sem mexer na fila. A próxima tenta outra.
      if (!parado) setTroca(null);
    };
    if (img.complete && img.naturalWidth > 0) pronta();
    else {
      img.addEventListener("load", pronta, { once: true });
      img.addEventListener("error", falhou, { once: true });
    }
    const desiste = window.setTimeout(falhou, 10_000);
    return () => {
      parado = true;
      window.clearTimeout(desiste);
      img.removeEventListener("load", pronta);
      img.removeEventListener("error", falhou);
    };
  }, [troca]);

  // Esbatida a nova, passa a ser ela a fotografia da posição.
  useEffect(() => {
    if (!troca || !chegou) return;
    const fim = window.setTimeout(() => {
      setVisiveis((v) => v.map((src, i) => (i === troca.posicao ? troca.entra : src)));
      setFila(troca.fila);
      // Um fotograma com as duas iguais por baixo e por cima, e só depois sai a
      // camada: a de baixo (já em cache) está desenhada quando a de cima sai.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setTroca(null);
          setChegou(false);
        }),
      );
    }, 700);
    return () => window.clearTimeout(fim);
  }, [troca, chegou]);

  // ── A LUPA ─────────────────────────────────────────────────────────────
  const dialogo = useRef<HTMLDialogElement>(null);
  const faixa = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);
  const quemAbriu = useRef<HTMLButtonElement | null>(null);

  const abrir = (posicao: number, botao: HTMLButtonElement) => {
    quemAbriu.current = botao;
    // A ordem da lupa: as seis à vista, pela ordem da grelha, e depois as que
    // estão de fora. Fica fixa enquanto a lupa está aberta.
    setLupa({ ordem: [...visiveis, ...fila], inicio: posicao });
    setAtual(posicao);
  };

  useEffect(() => {
    const d = dialogo.current;
    if (!lupa || !d) return;
    if (!d.open) d.showModal();
    d.setAttribute("aria-modal", "true");
    const corpo = document.body;
    const antes = corpo.style.overflow;
    corpo.style.overflow = "hidden";
    // Já aberta e medida: põe a faixa na fotografia tocada, sem animar.
    requestAnimationFrame(() => {
      const f = faixa.current;
      if (f) f.scrollLeft = lupa.inicio * f.clientWidth;
    });
    return () => {
      d.removeAttribute("aria-modal");
      corpo.style.overflow = antes;
    };
  }, [lupa]);

  const fechar = () => dialogo.current?.close();
  const aoFechar = () => {
    setLupa(null);
    quemAbriu.current?.focus({ preventScroll: true });
  };

  const ir = (k: number) => {
    const f = faixa.current;
    if (!f || !lupa) return;
    const alvo = Math.max(0, Math.min(lupa.ordem.length - 1, k));
    f.scrollTo({
      left: alvo * f.clientWidth,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  const aoRolar = () => {
    const f = faixa.current;
    if (!f || !f.clientWidth) return;
    setAtual(Math.round(f.scrollLeft / f.clientWidth));
  };

  const aoTeclar = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      ir(atual + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      ir(atual - 1);
    }
  };

  const botaoDaLupa =
    "toque alvo-toque flex h-11 w-11 items-center justify-center border border-white/25 text-white transition-colors duration-elemento hover:bg-white hover:text-noite";

  return (
    <div ref={grelha}>
      <Reveal
        as="div"
        variant="zoom"
        stagger
        // 340 e não 300 nas filas grandes: com 300, o mosaico de quatro
        // colunas num ecrã de 1440 media 960 x 300, ou seja 3,2:1, e mesmo
        // uma fotografia deitada perdia 53% da altura. A 340 são 2,8:1 e a
        // perda cai para 44%. Mais do que isto e as filas passam a empurrar
        // a secção seguinte para fora do ecrã sem se ganhar enquadramento.
        //
        // `overflow-x-clip` (auditoria externa, C1): o `zoom` de entrada
        // começa cada mosaico ampliado, e os da borda passavam o ecrã — a
        // página ganhava scroll horizontal (MEDIDO: 38 px a 1440, 34 a 1280,
        // 27 a 1024). `clip` e não `hidden`: corta só na horizontal e não faz
        // da grelha um contentor de scroll.
        className="grid grid-cols-2 lg:grid-cols-6 gap-px auto-rows-[160px] sm:auto-rows-[220px] lg:auto-rows-[340px] overflow-x-clip"
      >
        {visiveis.map((src, i) => {
          const span = spans[i % spans.length];
          const entra = troca && troca.posicao === i ? troca.entra : null;
          return (
            <button
              key={i}
              type="button"
              onClick={(e) => abrir(i, e.currentTarget)}
              className={`relative block overflow-hidden group cursor-zoom-in ${span}`}
            >
              <SafeImage
                key={src}
                src={src}
                blurDataURL={blurDe(src)}
                placeholder="blur"
                alt={altDe(alt, fotos, src)}
                unavailableLabel={textos.indisponivel}
                fill
                sizes={sizesDe(span)}
                quality={75}
                aparecer
                className="object-cover transition-transform duration-foto-zoom group-hover:scale-[1.03]"
              />
              {entra && (
                <div
                  ref={camada}
                  aria-hidden="true"
                  className={`absolute inset-0 transition-opacity duration-default ease-default ${
                    chegou ? "opacity-100" : "opacity-0"
                  }`}
                >
                  <SafeImage
                    src={entra}
                    alt=""
                    fill
                    sizes={sizesDe(span)}
                    quality={75}
                    aparecer={false}
                    className="object-cover transition-transform duration-foto-zoom group-hover:scale-[1.03]"
                  />
                </div>
              )}
            </button>
          );
        })}
      </Reveal>

      <dialog
        ref={dialogo}
        aria-label={textos.galeria}
        onClose={aoFechar}
        onKeyDown={aoTeclar}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-noite p-0 text-white backdrop:bg-noite"
      >
        {lupa && (
          <div className="relative h-full w-full">
            {/* A faixa rola de lado: tem de se alcançar pelo teclado (axe,
                scrollable-region-focusable), e as setas da lupa já a movem. */}
            <div
              ref={faixa}
              onScroll={aoRolar}
              role="group"
              aria-label={textos.galeria}
              tabIndex={0}
              className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {lupa.ordem.map((src, k) => (
                <div
                  key={src}
                  className="relative h-full w-full shrink-0 snap-center"
                  aria-hidden={k !== atual}
                >
                  {Math.abs(k - atual) <= 1 && (
                    <div className="absolute inset-x-0 top-16 bottom-16">
                      <SafeImage
                        src={src}
                        blurDataURL={blurDe(src)}
                        placeholder="blur"
                        alt={altDe(alt, fotos, src)}
                        unavailableLabel={textos.indisponivel}
                        fill
                        sizes="100vw"
                        quality={75}
                        className="object-contain"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-3 sm:px-6">
              <p
                className="text-[11px] uppercase tracking-[0.2em] text-white/80 tabular-nums"
                aria-live="polite"
              >
                {atual + 1} {textos.de} {lupa.ordem.length}
              </p>
              <button
                type="button"
                onClick={fechar}
                aria-label={textos.fechar}
                className={`pointer-events-auto ${botaoDaLupa}`}
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  ×
                </span>
              </button>
            </div>

            {/* As setas: no telemóvel em baixo, fora da fotografia (o dedo
                desliza, e as setas ficam para quem prefere tocar); no
                computador aos lados, a meia altura. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center gap-3 sm:inset-x-6 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:justify-between">
              <button
                type="button"
                onClick={() => ir(atual - 1)}
                disabled={atual === 0}
                aria-label={textos.anterior}
                className={`pointer-events-auto disabled:opacity-30 ${botaoDaLupa}`}
              >
                <span aria-hidden="true">←</span>
              </button>
              <button
                type="button"
                onClick={() => ir(atual + 1)}
                disabled={atual === lupa.ordem.length - 1}
                aria-label={textos.seguinte}
                className={`pointer-events-auto disabled:opacity-30 ${botaoDaLupa}`}
              >
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
