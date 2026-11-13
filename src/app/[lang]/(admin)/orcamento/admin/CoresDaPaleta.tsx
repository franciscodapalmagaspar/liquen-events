"use client";

import { useEffect, useRef, useState } from "react";
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
  const [activa, setActiva] = useState<number | null>(null);
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
  const podeJuntar = actuais.length < CORES_DA_PALETA;

  /** Põe `cor` no lugar activo (ou junta-a, se o activo é o «+»). */
  function por(cor: string) {
    if (activa === null) return;
    const novas = [...actuais];
    if (activa >= novas.length) novas.push(cor);
    else novas[activa] = cor;
    // A mesma cor duas vezes não faz paleta: a repetida sai.
    const unicas = novas.filter((c, i) => novas.findIndex((d) => parecidas(c, d)) === i);
    onMudar(unicas, `Cor ${maiusculas(cor)} posta na paleta.`);
    setActiva(Math.min(activa, unicas.length - 1));
  }

  function tirar(i: number) {
    const novas = actuais.filter((_, k) => k !== i);
    onMudar(novas, `Cor ${maiusculas(actuais[i])} tirada da paleta.`);
    setActiva(null);
  }

  return (
    <section aria-labelledby="cores-da-paleta" className="flex flex-col gap-3">
      <div>
        <p id="cores-da-paleta" className="bo-eyebrow">
          Cores da paleta
        </p>
        <p className="mt-1 text-sm text-[var(--bo-text-muted)]">
          {dela
            ? "Escolhidas por vocês. Toca numa cor e depois numa flor das fotografias para a trocar."
            : "Tiradas das flores destas fotografias. Toca numa cor e depois numa flor para a trocar."}
        </p>
      </div>

      <div role="radiogroup" aria-label="Que cor trocar" className="flex flex-wrap gap-2">
        {actuais.map((c, i) => (
          <button
            key={`${c}-${i}`}
            type="button"
            role="radio"
            aria-checked={activa === i}
            aria-label={`Cor ${i + 1}, ${maiusculas(c)}`}
            onClick={() => setActiva(activa === i ? null : i)}
            className={`flex w-14 flex-col items-center gap-1 ${ESTADO} ${PRESSAO}`}
          >
            <span
              aria-hidden="true"
              style={{ backgroundColor: c }}
              className={`h-11 w-11 rounded-md border border-[var(--bo-hairline)] ${
                activa === i
                  ? "ring-2 ring-[var(--bo-accent)] ring-offset-2 ring-offset-[var(--bo-surface)]"
                  : ""
              }`}
            />
            <span className="text-[10px] tabular-nums text-[var(--bo-text-muted)]">
              {maiusculas(c)}
            </span>
          </button>
        ))}
        {podeJuntar && (estado === "lido" || dela) && (
          <button
            type="button"
            role="radio"
            aria-checked={activa === actuais.length}
            aria-label="Juntar uma cor"
            onClick={() => setActiva(activa === actuais.length ? null : actuais.length)}
            className={`flex w-14 flex-col items-center gap-1 ${ESTADO} ${PRESSAO}`}
          >
            <span
              aria-hidden="true"
              className={`flex h-11 w-11 items-center justify-center rounded-md border border-dashed border-[var(--bo-tinta-58)] text-lg text-[var(--bo-text-muted)] ${
                activa === actuais.length
                  ? "ring-2 ring-[var(--bo-accent)] ring-offset-2 ring-offset-[var(--bo-surface)]"
                  : ""
              }`}
            >
              +
            </span>
            <span className="text-[10px] text-[var(--bo-text-muted)]">Juntar</span>
          </button>
        )}
      </div>

      {estado === "a-ler" && !actuais.length && (
        <p className="text-sm text-[var(--bo-text-muted)]">A ler as cores das fotografias…</p>
      )}
      {estado === "falhou" && (
        <p className="text-sm text-[var(--bo-text-muted)]">
          Não deu para ler as cores destas fotografias aqui. O PDF continua a tirá-las sozinho.
        </p>
      )}

      {activa !== null && (
        <div className="flex flex-col gap-3 rounded-lg bg-[var(--bo-tinta-3)] p-3">
          <p className="text-sm text-[var(--bo-text)]">
            {activa < actuais.length
              ? `A trocar a cor ${activa + 1}: toca numa flor de uma fotografia, ou numa sugestão.`
              : "Uma cor nova: toca numa flor de uma fotografia, ou numa sugestão."}
          </p>

          {lidas.length > 0 && (
            <ul aria-label="Fotografias desta página" className="grid grid-cols-3 gap-2">
              {lidas.map((l) => (
                <li key={l.ref}>
                  <ContaGotas lida={l} onCor={por} />
                </li>
              ))}
            </ul>
          )}

          {sugeridas.length > 0 && (
            <div>
              <p className="mb-1 text-caption text-[var(--bo-text-muted)]">Sugestões</p>
              <ul className="flex flex-wrap gap-1.5">
                {sugeridas.map((c) => (
                  <li key={c}>
                    <button
                      type="button"
                      onClick={() => por(c)}
                      aria-label={`Pôr ${maiusculas(c)}`}
                      style={{ backgroundColor: c }}
                      className={`alvo-toque h-8 w-8 rounded-full border border-[var(--bo-hairline)] ${ESTADO} ${PRESSAO}`}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activa < actuais.length && actuais.length > 1 && (
            <Button variant="ghost" size="sm" onClick={() => tirar(activa)} className="self-start">
              Tirar esta cor
            </Button>
          )}
        </div>
      )}

      {dela && (
        <button
          type="button"
          onClick={() => {
            onMudar(null, "A paleta volta às cores automáticas.");
            setActiva(null);
          }}
          className={`alvo-toque self-start text-caption font-medium text-[var(--bo-accent)] underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
        >
          Voltar às automáticas
        </button>
      )}
    </section>
  );
}

/**
 * Uma fotografia onde se toca para tirar a cor. Desenha-se numa tela: tocar
 * lê a cor do sítio exacto (a média de um quadrado de 5 × 5 píxeis, para um
 * grão da fotografia não dar uma cor que não se vê).
 */
function ContaGotas({ lida, onCor }: { lida: Lida; onCor: (cor: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.width = lida.tela.width;
    t.height = lida.tela.height;
    t.getContext("2d")?.drawImage(lida.tela, 0, 0);
  }, [lida]);
  return (
    <canvas
      ref={ref}
      // O conta-gotas é um gesto de dedo/rato; quem usa o teclado tem as
      // sugestões logo por baixo, com as mesmas cores das fotografias.
      aria-hidden="true"
      onClick={(e) => {
        const t = e.currentTarget;
        const caixa = t.getBoundingClientRect();
        const x = Math.round(((e.clientX - caixa.left) / caixa.width) * t.width);
        const y = Math.round(((e.clientY - caixa.top) / caixa.height) * t.height);
        const cor = corNoSitio(lida.tela, x, y);
        if (cor) onCor(cor);
      }}
      style={{ aspectRatio: String(lida.aspeto) }}
      className="block w-full cursor-crosshair rounded-md bg-[var(--bo-tinta-10)] object-cover"
    />
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
