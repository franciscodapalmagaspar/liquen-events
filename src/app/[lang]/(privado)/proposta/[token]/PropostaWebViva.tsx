"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE MEXE NA PROPOSTA ONLINE — o `<script>` do protótipo, em React
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O mesmo que o protótipo faz, e nada mais:
 *   · as entradas `.pw-rv` (opacidade e 28 px), ao chegarem ao ecrã;
 *   · a barra escura que aparece depois da capa: o logótipo ao meio e as
 *     âncoras dos dois lados (o «Quero avançar» saiu a 23/10, a pedido dela);
 *   · a lupa do mosaico: setas, Esc, deslizar;
 *   · «Copiar» o email e o telefone, com o aviso «Copiado».
 *
 * E duas guardas que o protótipo não tinha:
 *   · a barra, a lupa e o aviso vão num PORTAL para o `<body>`: a página vive
 *     dentro do invólucro animado do layout (`.prop-abertura`), e um `fixed`
 *     dentro de um bloco com `transform` deixa de ser medido pelo ecrã
 *     (`nada-fixo-preso-numa-seccao.test.ts`);
 *   · NENHUMA fotografia fica partida: uma que falha cai para o ficheiro
 *     grande (`data-grande`), e se também falhar fica o borrão da célula, sem
 *     ícone — o LEIA-ME dela: «não podem bloquear a página».
 *
 * As entradas só se armam depois de o JavaScript chegar (`pw-vivo`), e o que
 * já está no ecrã nesse instante aparece logo — a página nunca nasce em branco.
 * Com movimento reduzido, o CSS já desliga tudo.
 */

/** Um pixel transparente: o `<img>` fica, o borrão por baixo vê-se. */
const VAZIO = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

function salvarImagem(img: HTMLImageElement) {
  const grande = img.dataset.grande;
  if (grande && img.getAttribute("src") !== grande && img.dataset.tentou !== "1") {
    img.dataset.tentou = "1";
    img.removeAttribute("srcset");
    img.parentElement?.querySelectorAll("source").forEach((s) => s.remove());
    img.src = grande;
    return;
  }
  if (img.src !== VAZIO) {
    img.removeAttribute("srcset");
    img.src = VAZIO;
  }
}

export default function PropostaWebViva({
  t,
  ancoras,
  fontes = "",
  lang,
}: {
  fontes?: string;
  lang: string;
  /** Só os textos de que isto precisa — um componente cliente não recebe funções. */
  t: {
    fechar: string;
    anterior: string;
    seguinte: string;
    fotografia: string;
    copiado: string;
  };
  ancoras: { href: string; nome: string }[];
}) {
  const marca = useRef<HTMLSpanElement>(null);
  const [montado, setMontado] = useState(false);
  const [barra, setBarra] = useState(false);
  const [lupa, setLupa] = useState<{ lista: string[]; i: number } | null>(null);
  const [aviso, setAviso] = useState(false);
  const fechar = useRef<HTMLButtonElement>(null);
  const deOnde = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const raiz = marca.current?.closest<HTMLElement>("[data-pw-raiz]");
    if (!raiz) return;
    setMontado(true);

    // ── As entradas: o que já está à vista aparece JÁ, o resto ao chegar ──
    const altura = window.innerHeight;
    const entradas = Array.from(raiz.querySelectorAll<HTMLElement>(".pw-rv"));
    for (const el of entradas) {
      const r = el.getBoundingClientRect();
      if (r.top < altura && r.bottom > 0) el.classList.add("pw-on");
    }
    raiz.classList.add("pw-vivo");
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("pw-on");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.15 },
    );
    entradas.filter((el) => !el.classList.contains("pw-on")).forEach((el) => io.observe(el));

    // ── A barra: só depois da capa ──
    const capa = raiz.querySelector("#top");
    const ioCapa = capa
      ? new IntersectionObserver((es) => setBarra(!es[0].isIntersecting), { threshold: 0.05 })
      : null;
    if (capa) ioCapa!.observe(capa);

    // ── As fotografias que falham (também as que já falharam antes disto) ──
    const aoFalhar = (e: Event) => {
      if (e.target instanceof HTMLImageElement) salvarImagem(e.target);
    };
    raiz.addEventListener("error", aoFalhar, true);
    raiz.querySelectorAll("img").forEach((img) => {
      if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) salvarImagem(img);
    });

    // ── A lupa e o «Copiar», por delegação ──
    const aoClicar = (e: MouseEvent) => {
      const alvo = e.target as HTMLElement;
      const copiar = alvo.closest<HTMLElement>("[data-copy]");
      if (copiar) {
        const v = copiar.dataset.copy ?? "";
        const ok = () => {
          setAviso(true);
          window.setTimeout(() => setAviso(false), 1600);
        };
        const reserva = () => {
          const a = document.createElement("textarea");
          a.value = v;
          document.body.appendChild(a);
          a.select();
          try {
            document.execCommand("copy");
            ok();
          } catch {
            /* sem cópia: o texto continua à vista para copiar à mão */
          }
          a.remove();
        };
        try {
          navigator.clipboard.writeText(v).then(ok, reserva);
        } catch {
          reserva();
        }
        return;
      }
      const figura = alvo.closest<HTMLElement>("[data-g] figure:not(.pw-txt)");
      if (!figura) return;
      const img = figura.querySelector<HTMLImageElement>("img");
      if (!img) return;
      const todas = Array.from(
        raiz.querySelectorAll<HTMLImageElement>("[data-g] figure:not(.pw-txt) img"),
      );
      const lista = todas.map((i) => i.dataset.grande || i.currentSrc || i.src);
      deOnde.current = figura;
      setLupa({ lista, i: Math.max(0, todas.indexOf(img)) });
    };
    raiz.addEventListener("click", aoClicar);
    // A célula do mosaico é um botão: Enter ou espaço abrem a lupa.
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const figura = (e.target as HTMLElement).closest?.("[data-g] figure:not(.pw-txt)");
      if (!figura || figura !== e.target) return;
      e.preventDefault();
      (figura as HTMLElement).click();
    };
    raiz.addEventListener("keydown", aoTeclar);
    return () => {
      raiz.removeEventListener("keydown", aoTeclar);
      io.disconnect();
      ioCapa?.disconnect();
      raiz.removeEventListener("error", aoFalhar, true);
      raiz.removeEventListener("click", aoClicar);
    };
  }, []);

  const mover = useCallback(
    (passo: number) =>
      setLupa((l) => (l ? { ...l, i: (l.i + passo + l.lista.length) % l.lista.length } : l)),
    [],
  );
  const fecharLupa = useCallback(() => {
    setLupa(null);
    deOnde.current?.focus?.();
  }, []);

  // A lupa aberta: teclado, o corpo sem rolar, o foco no «Fechar».
  useEffect(() => {
    if (!lupa) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    fechar.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fecharLupa();
      if (e.key === "ArrowRight") mover(1);
      if (e.key === "ArrowLeft") mover(-1);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.body.style.overflow = antes;
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [lupa, mover, fecharLupa]);

  const inicio = useRef(0);

  return (
    <>
      <span ref={marca} hidden />
      {montado &&
        createPortal(
          <div className={`pw pw-camada ${fontes}`} lang={lang}>
            <nav className={`pw-nav${barra ? " pw-on" : ""}`} aria-hidden={!barra} inert={!barra}>
              {/* O logótipo ao meio e as âncoras dos dois lados (ela, 23/10:
                  «retira o quero avançar e coloca o logo da liquen a meio»). */}
              <ul className="pw-nav-l">
                {ancoras.slice(0, Math.ceil(ancoras.length / 2)).map((a) => (
                  <li key={a.href}>
                    <a href={a.href}>{a.nome}</a>
                  </li>
                ))}
              </ul>
              {/* eslint-disable-next-line @next/next/no-img-element -- o logótipo, servido pelo site */}
              <img src="/logo-liquen-proposta.png" alt="Líquen Events" />
              <ul className="pw-nav-r">
                {ancoras.slice(Math.ceil(ancoras.length / 2)).map((a) => (
                  <li key={a.href}>
                    <a href={a.href}>{a.nome}</a>
                  </li>
                ))}
              </ul>
            </nav>
            <div
              className={`pw-lb${lupa ? " pw-on" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-label={t.fotografia}
              hidden={!lupa}
              onClick={(e) => {
                if (e.target === e.currentTarget) fecharLupa();
              }}
              onTouchStart={(e) => {
                inicio.current = e.touches[0].clientX;
              }}
              onTouchEnd={(e) => {
                const d = e.changedTouches[0].clientX - inicio.current;
                if (Math.abs(d) > 50) mover(d < 0 ? 1 : -1);
              }}
            >
              <button ref={fechar} type="button" className="pw-x" onClick={fecharLupa}>
                {t.fechar}
              </button>
              <button
                type="button"
                className="pw-p"
                aria-label={t.anterior}
                onClick={(e) => {
                  e.stopPropagation();
                  mover(-1);
                }}
              >
                ‹
              </button>
              {lupa && (
                // eslint-disable-next-line @next/next/no-img-element -- o ficheiro grande, assinado
                <img src={lupa.lista[lupa.i]} alt="" />
              )}
              <button
                type="button"
                className="pw-nx"
                aria-label={t.seguinte}
                onClick={(e) => {
                  e.stopPropagation();
                  mover(1);
                }}
              >
                ›
              </button>
            </div>
            <div className={`pw-toast${aviso ? " pw-on" : ""}`} role="status">
              {aviso ? t.copiado : ""}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
