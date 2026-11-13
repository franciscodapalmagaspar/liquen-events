"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  LADO,
  deHex,
  escolher,
  hex,
  paraOklab,
  pontosDaFoto,
  sugestoes,
  type Ponto,
} from "@/lib/paleta-cores";
import { CORES_DA_PALETA } from "@/lib/proposal-doc";
import { Button } from "./ui";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS CORES DA PALETA, ESCOLHIDAS POR ELA — COM UM CONTA-GOTAS NAS FLORES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um cliente disse (13/11): «as paletas não batem com as cores das flores nem
 * das fotografias que se apresentam». E o Francisco: «as cores das flores têm
 * muito a ver com as cores das paletas».
 *
 * As automáticas já saem das flores das fotografias desta página
 * (`lib/paleta-cores.ts`, a MESMA regra do PDF). Mas quem conhece as flores é
 * ela — por isso aqui:
 *
 *   · toca numa das cinco cores para a escolher;
 *   · depois toca numa FLOR de uma das fotografias (o conta-gotas) — essa cor,
 *     exactamente, passa a estar na paleta —, ou numa das sugestões;
 *   · «Tirar» tira-a; «Voltar às automáticas» devolve a paleta ao sistema.
 *
 * Cada toque aplica-se logo, com «Anular» (quem grava é o estúdio), e a página
 * ao lado é o PDF real: vê-se lá o que o casal vai ver.
 *
 * As fotografias lêem-se no navegador (`fetch` → `createImageBitmap`): nada
 * vai ao servidor, nada se grava no armazenamento.
 */

type Foto = { ref: string; url?: string };

/** O lado maior a que cada fotografia se desenha para o conta-gotas. */
const LADO_DO_CONTA_GOTAS = 480;

type Lida = { ref: string; tela: HTMLCanvasElement; aspeto: number };

export default function CoresDaPaleta({
  fotos,
  cores,
  onMudar,
}: {
  /** As fotografias desta página (o painel e a fila), como o PDF as põe. */
  fotos: readonly Foto[];
  /** As que ELA escolheu, ou `null` (as automáticas). */
  cores: readonly string[] | null;
  /** `null` = voltar às automáticas. `frase` é a do «Anular». */
  onMudar: (cores: string[] | null, frase: string) => void;
}) {
  const [activa, setActivaCru] = useState<number | null>(null);
  /** A cor do seletor, antes de ela carregar em «Pôr». */
  const [rascunho, setRascunho] = useState<string | null>(null);
  /** A cor debaixo do dedo/rato, mostrada no lugar activo antes de se escolher. */
  const [previa, setPrevia] = useState<string | null>(null);
  const setActiva = (i: number | null) => {
    setActivaCru(i);
    setRascunho(null);
    setPrevia(null);
  };
  const idDoTitulo = useId();
  // O que se leu das fotografias, com a chave delas: fotografias novas são
  // «a ler» até a leitura delas chegar (sem pôr estado dentro do efeito).
  const [leitura, setLeitura] = useState<{
    chave: string;
    lidas: Lida[];
    automaticas: string[];
    sugeridas: string[];
    estado: "lido" | "falhou";
  } | null>(null);

  const chave = fotos.map((f) => `${f.ref}|${f.url ?? ""}`).join("\n");
  useEffect(() => {
    let vivo = true;
    (async () => {
      const resultado = await Promise.all(fotos.map((f) => lerFoto(f)));
      if (!vivo) return;
      const boas = resultado.filter((r): r is { lida: Lida; pontos: Ponto[] } => !!r);
      const pontos = boas.flatMap((r) => r.pontos);
      setLeitura({
        chave,
        lidas: boas.map((r) => r.lida),
        automaticas: escolher(pontos),
        sugeridas: sugestoes(pontos, 12),
        estado: boas.length ? "lido" : "falhou",
      });
    })().catch(() => {
      if (vivo) setLeitura({ chave, lidas: [], automaticas: [], sugeridas: [], estado: "falhou" });
    });
    return () => {
      vivo = false;
    };
    // `chave` resume `fotos`: as mesmas fotografias não se voltam a ler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  const lida = leitura?.chave === chave ? leitura : null;
  const estado = lida?.estado ?? "a-ler";
  const lidas = lida?.lidas ?? [];
  const automaticas = lida?.automaticas ?? [];
  const sugeridas = lida?.sugeridas ?? [];

  const dela = cores !== null;
  const actuais = dela ? [...cores] : automaticas;

  /** Põe `cor` no lugar activo (ou junta-a, se o activo é o «+»). */
  function por(cor: string) {
    if (activa === null) return;
    const novas = [...actuais];
    if (activa >= novas.length) novas.push(cor);
    else novas[activa] = cor;
    // A mesma cor duas vezes não faz paleta: a repetida sai.
    const unicas = novas.filter((c, i) => novas.findIndex((d) => parecidas(c, d)) === i);
    onMudar(unicas, `Cor ${maiusculas(cor)} posta na paleta.`);
    // Segue para a cor seguinte, como quem escolhe as cinco de seguida; na
    // última, fecha.
    const seguinte = Math.min(activa, unicas.length - 1) + 1;
    setActiva(seguinte < CORES_DA_PALETA && seguinte <= unicas.length ? seguinte : null);
  }

  function tirar(i: number) {
    const novas = actuais.filter((_, k) => k !== i);
    onMudar(novas, `Cor ${maiusculas(actuais[i])} tirada da paleta.`);
    setActiva(null);
  }

  /** A cor que se vê no lugar activo: a que está debaixo do dedo, ou a dela. */
  const corDoLugar = (i: number) => (i === activa && previa ? previa : actuais[i]);
  const aTrocar = activa !== null;

  return (
    <section aria-labelledby={idDoTitulo} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <p id={idDoTitulo} className="bo-eyebrow">
            Cores da paleta
          </p>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              dela
                ? "bg-sage-600/12 text-[var(--bo-accent)]"
                : "bg-[var(--bo-tinta-6)] text-[var(--bo-text-muted)]"
            }`}
          >
            {dela ? "Escolhidas por vocês" : "Sugestão"}
          </span>
        </div>
        {dela ? (
          <button
            type="button"
            onClick={() => {
              onMudar(null, "A paleta volta às cores sugeridas.");
              setActiva(null);
            }}
            className={`alvo-toque text-caption font-medium text-[var(--bo-text-muted)] underline underline-offset-2 hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
          >
            Voltar à sugestão
          </button>
        ) : null}
      </div>

      <p className="-mt-2 text-sm leading-relaxed text-[var(--bo-text-muted)]">
        {dela
          ? "São estas que saem no PDF e na proposta online. Toca numa cor para a trocar."
          : "Tiradas das flores das fotografias da página. Toca numa cor para a trocar por uma flor, ou fica com estas."}
      </p>

      {/* A faixa: como a página do PDF a desenha — retângulos altos, o código
          por baixo. O que se vê aqui é o que o casal vê. */}
      <div
        role="radiogroup"
        aria-label="Que cor trocar"
        className="grid grid-cols-5 gap-2 sm:gap-3"
      >
        {Array.from({ length: CORES_DA_PALETA }, (_, i) => {
          const c = corDoLugar(i);
          const activo = activa === i;
          if (!c) {
            const juntar = i === actuais.length && (estado === "lido" || dela);
            return juntar ? (
              <button
                key={`vazio-${i}`}
                type="button"
                role="radio"
                aria-checked={activo}
                aria-label="Juntar uma cor"
                onClick={() => setActiva(activo ? null : i)}
                className={`flex flex-col gap-1.5 text-left ${ESTADO} ${PRESSAO}`}
              >
                <span
                  aria-hidden="true"
                  className={`flex aspect-[103/180] w-full items-center justify-center rounded-md border border-dashed border-[var(--bo-tinta-58)] text-xl text-[var(--bo-text-muted)] ${
                    activo
                      ? "ring-2 ring-[var(--bo-accent)] ring-offset-2 ring-offset-[var(--bo-surface)]"
                      : ""
                  }`}
                >
                  +
                </span>
                <span className="text-[10px] tracking-[0.08em] text-[var(--bo-text-muted)]">
                  JUNTAR
                </span>
              </button>
            ) : (
              <span
                key={`vazio-${i}`}
                aria-hidden="true"
                className="aspect-[103/180] w-full rounded-md bg-[var(--bo-tinta-3)]"
              />
            );
          }
          return (
            <button
              key={`cor-${i}`}
              type="button"
              role="radio"
              aria-checked={activo}
              aria-label={`Cor ${i + 1}, ${maiusculas(actuais[i])}`}
              onClick={() => setActiva(activo ? null : i)}
              className={`group flex min-w-0 flex-col gap-1.5 text-left ${ESTADO} ${PRESSAO}`}
            >
              <span
                aria-hidden="true"
                style={{ backgroundColor: c }}
                className={`aspect-[103/180] w-full rounded-md border border-[var(--bo-hairline)] shadow-[var(--bo-sombra-repouso)] ${ESTADO} ${
                  activo
                    ? "ring-2 ring-[var(--bo-accent)] ring-offset-2 ring-offset-[var(--bo-surface)]"
                    : // As outras NUNCA se esbatem: uma cor esbatida é outra
                      // cor, e é a cor exacta que ela está a comparar.
                      "group-hover:shadow-[var(--bo-sombra-erguida)]"
                }`}
              />
              <span className="truncate text-[10px] tabular-nums tracking-[0.08em] text-[var(--bo-text-muted)]">
                {maiusculas(c)}
              </span>
            </button>
          );
        })}
      </div>

      {!dela && automaticas.length > 0 && !aTrocar && (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() => onMudar([...automaticas], "Paleta escolhida.")}
        >
          Ficar com estas
        </Button>
      )}

      {estado === "a-ler" && !actuais.length && (
        <p className="text-sm text-[var(--bo-text-muted)]">A ler as cores das fotografias…</p>
      )}
      {estado === "falhou" && (
        <p className="text-sm text-[var(--bo-text-muted)]">
          Não deu para ler as fotografias aqui — escolhe as cores no seletor. Sem escolha, o PDF
          tira-as sozinho das flores.
        </p>
      )}

      {aTrocar && (
        <div className="flex flex-col gap-4 rounded-xl border border-[var(--bo-hairline)] bg-[var(--bo-surface)] p-3 shadow-[var(--bo-sombra-suspensa)] sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-[var(--bo-text)]">
              {activa < actuais.length ? `A trocar a cor ${activa + 1}` : "Uma cor nova"}
              <span className="block text-caption font-normal text-[var(--bo-text-muted)]">
                Passa por cima de uma flor e toca para a escolher.
              </span>
            </p>
            <Button variant="ghost" size="sm" onClick={() => setActiva(null)}>
              Feito
            </Button>
          </div>

          {lidas.length > 0 && (
            // Em mosaico (colunas), cada fotografia na sua forma, sem buracos.
            <ul aria-label="Fotografias da página" className="columns-2 gap-2 sm:columns-3">
              {lidas.map((l) => (
                <li key={l.ref} className="mb-2 break-inside-avoid">
                  <ContaGotas lida={l} onCor={por} onPrevia={setPrevia} />
                </li>
              ))}
            </ul>
          )}

          {sugeridas.length > 0 && (
            <div>
              <p className="mb-1.5 text-caption text-[var(--bo-text-muted)]">
                Sugestões das fotografias
              </p>
              <ul className="flex flex-wrap gap-2">
                {sugeridas.map((c) => (
                  <li key={c}>
                    <button
                      type="button"
                      onClick={() => por(c)}
                      onPointerEnter={() => setPrevia(c)}
                      onPointerLeave={() => setPrevia(null)}
                      aria-label={`Pôr ${maiusculas(c)}`}
                      title={maiusculas(c)}
                      style={{ backgroundColor: c }}
                      className={`alvo-toque h-8 w-8 rounded-full border border-[var(--bo-hairline)] shadow-[var(--bo-sombra-repouso)] ${ESTADO} ${PRESSAO}`}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--bo-hairline)] pt-3">
            {/* Qualquer cor: o seletor do próprio aparelho, e um botão para a
                pôr — mexer no seletor não grava a cada passo (seriam dezenas
                de «Anular»). */}
            <label className="flex items-center gap-2 text-sm text-[var(--bo-text)]">
              <input
                type="color"
                value={rascunho ?? actuais[activa] ?? "#C8B8A6"}
                onChange={(e) => {
                  const c = e.target.value.toUpperCase();
                  setRascunho(c);
                  setPrevia(c);
                }}
                className="h-9 w-12 cursor-pointer rounded-md border border-[var(--bo-hairline)] bg-transparent"
              />
              Outra cor
            </label>
            {rascunho && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  por(rascunho);
                  setRascunho(null);
                }}
              >
                Pôr {maiusculas(rascunho)}
              </Button>
            )}
            {activa < actuais.length && actuais.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => tirar(activa)} className="ml-auto">
                Tirar esta cor
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Uma fotografia onde se toca para tirar a cor — com uma LUPA: ao passar o
 * rato (ou o dedo) por cima, um círculo com a cor exacta segue o ponteiro, e a
 * cor aparece logo no lugar da paleta que se está a trocar (`onPrevia`).
 * Tocar (largar) escolhe-a. A cor é a média de um quadrado de 5 × 5 píxeis,
 * para um grão da fotografia não dar uma cor que não se vê.
 *
 * No dedo, a lupa fica ACIMA do ponto (o dedo tapava-a), e a fotografia não
 * deixa a página deslizar enquanto se escolhe (`touch-action: none`) — só
 * existe enquanto se está a trocar uma cor.
 */
function ContaGotas({
  lida,
  onCor,
  onPrevia,
}: {
  lida: Lida;
  onCor: (cor: string) => void;
  onPrevia: (cor: string | null) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [lupa, setLupa] = useState<{ x: number; y: number; cor: string; dedo: boolean } | null>(
    null,
  );
  useEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.width = lida.tela.width;
    t.height = lida.tela.height;
    t.getContext("2d")?.drawImage(lida.tela, 0, 0);
  }, [lida]);

  const ler = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const t = e.currentTarget;
    const caixa = t.getBoundingClientRect();
    const fx = (e.clientX - caixa.left) / caixa.width;
    const fy = (e.clientY - caixa.top) / caixa.height;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
    const cor = corNoSitio(lida.tela, Math.round(fx * t.width), Math.round(fy * t.height));
    return cor ? { x: fx * 100, y: fy * 100, cor, dedo: e.pointerType !== "mouse" } : null;
  };

  return (
    <div className="relative">
      <canvas
        ref={ref}
        // O conta-gotas é um gesto de dedo/rato; quem usa o teclado tem as
        // sugestões e o seletor de cor logo por baixo.
        aria-hidden="true"
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") e.currentTarget.setPointerCapture(e.pointerId);
          const l = ler(e);
          setLupa(l);
          onPrevia(l?.cor ?? null);
        }}
        onPointerMove={(e) => {
          const l = ler(e);
          setLupa(l);
          onPrevia(l?.cor ?? null);
        }}
        onPointerUp={(e) => {
          const l = ler(e);
          setLupa(null);
          onPrevia(null);
          if (l) onCor(l.cor);
        }}
        onPointerLeave={() => {
          setLupa(null);
          onPrevia(null);
        }}
        onPointerCancel={() => {
          setLupa(null);
          onPrevia(null);
        }}
        style={{ aspectRatio: String(lida.aspeto), touchAction: "none" }}
        className="block w-full cursor-crosshair rounded-lg bg-[var(--bo-tinta-10)]"
      />
      {lupa && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute flex flex-col items-center gap-1"
          style={{
            left: `${lupa.x}%`,
            top: `${lupa.y}%`,
            // O círculo fica por cima do ponto: com o dedo, bem acima dele.
            transform: `translate(-50%, ${lupa.dedo ? "-130%" : "-115%"})`,
          }}
        >
          <span
            className="h-11 w-11 rounded-full border-[3px] border-[var(--bo-surface)] shadow-[var(--bo-sombra-suspensa)]"
            style={{ backgroundColor: lupa.cor }}
          />
          <span className="rounded bg-[var(--bo-surface)] px-1.5 py-0.5 text-[10px] tabular-nums tracking-[0.06em] text-[var(--bo-text)] shadow-[var(--bo-sombra-repouso)]">
            {lupa.cor}
          </span>
        </span>
      )}
    </div>
  );
}

/** A média de um quadrado de 5 × 5 à volta de (x, y). */
function corNoSitio(tela: HTMLCanvasElement, x: number, y: number): string | null {
  const ctx = tela.getContext("2d");
  if (!ctx) return null;
  const x0 = Math.max(0, Math.min(tela.width - 5, x - 2));
  const y0 = Math.max(0, Math.min(tela.height - 5, y - 2));
  const { data } = ctx.getImageData(x0, y0, 5, 5);
  const soma = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    soma[0] += data[i];
    soma[1] += data[i + 1];
    soma[2] += data[i + 2];
  }
  const n = data.length / 4;
  return hex([Math.round(soma[0] / n), Math.round(soma[1] / n), Math.round(soma[2] / n)]);
}

/** Lê uma fotografia: a tela do conta-gotas e os pontos da regra automática. */
async function lerFoto(f: Foto): Promise<{ lida: Lida; pontos: Ponto[] } | null> {
  if (!f.url || typeof createImageBitmap !== "function") return null;
  try {
    const r = await fetch(f.url);
    if (!r.ok) return null;
    const imagem = await createImageBitmap(await r.blob());
    const desenhar = (lado: number) => {
      const k = Math.min(1, lado / Math.max(imagem.width, imagem.height));
      const t = document.createElement("canvas");
      t.width = Math.max(1, Math.round(imagem.width * k));
      t.height = Math.max(1, Math.round(imagem.height * k));
      const ctx = t.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(imagem, 0, 0, t.width, t.height);
      return { t, ctx };
    };
    const grande = desenhar(LADO_DO_CONTA_GOTAS);
    const pequena = desenhar(LADO);
    imagem.close();
    if (!grande || !pequena) return null;
    const { data } = pequena.ctx.getImageData(0, 0, pequena.t.width, pequena.t.height);
    return {
      lida: { ref: f.ref, tela: grande.t, aspeto: grande.t.width / grande.t.height },
      pontos: pontosDaFoto(data, pequena.t.width, pequena.t.height, 4),
    };
  } catch {
    return null;
  }
}

const maiusculas = (c: string) => c.toUpperCase();

/** Duas cores praticamente iguais (o mesmo toque duas vezes). */
function parecidas(a: string, b: string): boolean {
  const x = paraOklab(deHex(a));
  const y = paraOklab(deHex(b));
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 0.02;
}
