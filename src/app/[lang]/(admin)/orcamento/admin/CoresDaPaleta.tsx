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
  // O lugar que se está a trocar, preso às fotografias de agora: se elas
  // mudarem (outra fotografia na página), a troca acaba — senão um «Pôr»
  // gravava por cima de uma paleta que já não é a que se vê.
  const [seleccao, setSeleccao] = useState<{ chave: string; i: number } | null>(null);
  /** A cor do seletor, antes de ela carregar em «Pôr». */
  const [rascunho, setRascunho] = useState<string | null>(null);
  /** A cor debaixo do dedo/rato, mostrada no lugar activo antes de se escolher. */
  const [previa, setPrevia] = useState<string | null>(null);
  const setActiva = (i: number | null) => {
    setSeleccao(i === null ? null : { chave, i });
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

  // Duas chaves (resumidas: sem copiar um `data:` de vários MB a cada render). A da TROCA é só das referências: os endereços assinados
  // mudam pouco depois de se abrir a proposta, e isso não é «outras
  // fotografias» — a troca não se fecha. A da LEITURA inclui o endereço: os
  // endereços chegam DEPOIS das referências (ou renovam-se, ou passam da
  // miniatura à versão média), e cada um desses é uma leitura nova — senão
  // ficava «não deu para ler» para sempre, ou a ler o recorte da miniatura.
  const chave = fotos.map((f) => `${f.ref.slice(0, 200)}|${f.ref.length}`).join("\n");
  const chaveDaLeitura = fotos
    .map((f) => `${f.ref.slice(0, 200)}|${(f.url ?? "").length}|${(f.url ?? "").slice(-80)}`)
    .join("\n");
  useEffect(() => {
    let vivo = true;
    (async () => {
      const resultado = await Promise.all(fotos.map((f) => lerFotoGuardada(f)));
      if (!vivo) return;
      const boas = resultado.filter((r): r is { lida: Lida; pontos: Ponto[] } => !!r);
      const pontos = boas.flatMap((r) => r.pontos);
      setLeitura({
        chave: chaveDaLeitura,
        lidas: boas.map((r) => r.lida),
        automaticas: escolher(pontos),
        sugeridas: sugestoes(pontos, 12),
        estado: boas.length ? "lido" : "falhou",
      });
    })().catch(() => {
      if (vivo)
        setLeitura({
          chave: chaveDaLeitura,
          lidas: [],
          automaticas: [],
          sugeridas: [],
          estado: "falhou",
        });
    });
    return () => {
      vivo = false;
    };
    // `chaveDaLeitura` resume `fotos`: as mesmas não se voltam a ler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaLeitura]);

  const lida = leitura?.chave === chaveDaLeitura ? leitura : null;
  const estado = lida?.estado ?? "a-ler";
  const lidas = lida?.lidas ?? [];
  const automaticas = lida?.automaticas ?? [];
  const sugeridas = lida?.sugeridas ?? [];

  const dela = cores !== null;
  const actuais = dela ? [...cores] : automaticas;
  // Fora do intervalo (um «Anular» vindo de fora encurtou a paleta) é como
  // não haver troca nenhuma.
  const activa =
    seleccao &&
    seleccao.chave === chave &&
    seleccao.i <= actuais.length &&
    seleccao.i < CORES_DA_PALETA
      ? seleccao.i
      : null;
  // Pode-se juntar uma cor sempre que já não se está à espera da leitura —
  // também quando ela FALHOU: aí o seletor é o caminho.
  const podeJuntar = actuais.length < CORES_DA_PALETA && (estado !== "a-ler" || dela);

  /** Põe `cor` no lugar activo (ou junta-a, se o activo é o «+»). */
  function por(cor: string) {
    if (activa === null) return;
    // Sem paleta dela e sem a sugestão lida, não há sobre o quê gravar: um
    // «Pôr» agora deixava a paleta com uma cor só.
    if (!dela && estado === "a-ler") return;
    // A mesma cor duas vezes não faz paleta: sai a ANTIGA parecida, e a nova
    // fica onde ela a pôs — nunca desaparece o que se acabou de escolher.
    const outras = actuais.filter((c, k) => k !== activa && !parecidas(c, cor));
    const lugar = Math.min(
      activa - actuais.slice(0, activa).filter((c) => parecidas(c, cor)).length,
      outras.length,
    );
    const novas = [...outras.slice(0, lugar), cor, ...outras.slice(lugar)].slice(
      0,
      CORES_DA_PALETA,
    );
    onMudar(novas, `Cor ${maiusculas(cor)} posta na paleta.`);
    // Segue para a cor seguinte, como quem escolhe as cinco de seguida; na
    // última, fecha.
    const seguinte = lugar + 1;
    setActiva(seguinte < CORES_DA_PALETA && seguinte <= novas.length ? seguinte : null);
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
                ? "bg-sage-600/10 text-[var(--bo-accent)]"
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
          : estado === "falhou"
            ? "Escolhe as cores com o «+». Sem escolha, o PDF tira-as sozinho das flores das fotografias."
            : "Tiradas das flores das fotografias da página. Toca numa cor para a trocar por uma flor, ou fica com estas."}
      </p>

      {/* A faixa: como a página do PDF a desenha — retângulos altos, o código
          por baixo. O que se vê aqui é o que o casal vê. */}
      <div role="group" aria-label="As cores da paleta" className="grid grid-cols-5 gap-2 sm:gap-3">
        {Array.from({ length: CORES_DA_PALETA }, (_, i) => {
          const c = corDoLugar(i);
          const activo = activa === i;
          if (!c) {
            const juntar = i === actuais.length && podeJuntar;
            return juntar ? (
              <button
                key={`vazio-${i}`}
                type="button"
                aria-pressed={activo}
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
              aria-pressed={activo}
              aria-label={
                i < actuais.length
                  ? `Cor ${i + 1}, ${maiusculas(actuais[i])}`
                  : `Juntar uma cor, ${maiusculas(c)}`
              }
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
          Não deu para ler as fotografias aqui (a ligação ou o ficheiro). As cores escolhem-se na
          mesma, com o seletor do «+».
        </p>
      )}

      {aTrocar && (
        <div className="flex flex-col gap-4 rounded-xl border border-[var(--bo-hairline)] bg-[var(--bo-surface)] p-3 shadow-[var(--bo-sombra-suspensa)] sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-[var(--bo-text)]">
              {activa < actuais.length ? `A trocar a cor ${activa + 1}` : "Uma cor nova"}
              <span className="block text-caption font-normal text-[var(--bo-text-muted)]">
                Passa por cima de uma flor e toca para a escolher. No telemóvel, toca e segura para
                afinar com a lupa.
              </span>
            </p>
            <Button variant="ghost" size="sm" onClick={() => setActiva(null)}>
              Feito
            </Button>
          </div>

          {lidas.length > 0 && (
            // Em mosaico (colunas), cada fotografia na sua forma, sem buracos.
            <ul aria-label="Fotografias da página" className="columns-2 gap-2 sm:columns-3">
              {lidas.map((l, k) => (
                <li key={`${l.ref}-${k}`} className="mb-2 break-inside-avoid">
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
 * No dedo, a lupa fica ACIMA do ponto (o dedo tapava-a). Um toque curto
 * escolhe; deslizar desliza a página; tocar e segurar (300 ms) deixa arrastar
 * a lupa pela fotografia para afinar — e largar escolhe.
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

  // Onde o dedo pousou: um TOQUE curto (andou menos de 10 px) escolhe a cor;
  // deslizar desliza a página (`pan-y`), sem gravar nada. E um toque LONGO
  // (300 ms parado) entra em «apontar»: a página deixa de deslizar, a lupa
  // segue o dedo para afinar o sítio, e largar escolhe — é para isso que a
  // lupa existe.
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const apontar = useRef(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pararRelogio = () => {
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = null;
  };
  useEffect(() => {
    const t = ref.current;
    if (!t) return;
    // Não passivo de propósito: em «apontar», é isto que segura a página.
    const segurar = (e: TouchEvent) => {
      if (apontar.current && e.cancelable) e.preventDefault();
    };
    t.addEventListener("touchmove", segurar, { passive: false });
    return () => {
      t.removeEventListener("touchmove", segurar);
      pararRelogio();
    };
  }, []);
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
          inicio.current = { x: e.clientX, y: e.clientY };
          apontar.current = false;
          pararRelogio();
          if (e.pointerType !== "mouse") {
            relogio.current = setTimeout(() => {
              apontar.current = true;
            }, 300);
          }
          const l = ler(e);
          setLupa(l);
          onPrevia(l?.cor ?? null);
        }}
        onPointerMove={(e) => {
          // Andou antes do toque longo: é deslizar, não apontar.
          const de = inicio.current;
          if (de && !apontar.current && Math.hypot(e.clientX - de.x, e.clientY - de.y) >= 10)
            pararRelogio();
          const l = ler(e);
          setLupa(l);
          onPrevia(l?.cor ?? null);
        }}
        onPointerUp={(e) => {
          const l = ler(e);
          const de = inicio.current;
          inicio.current = null;
          setLupa(null);
          onPrevia(null);
          const andou = de ? Math.hypot(e.clientX - de.x, e.clientY - de.y) : 0;
          const apontava = apontar.current;
          apontar.current = false;
          pararRelogio();
          if (l && (e.pointerType === "mouse" || apontava || andou < 10)) onCor(l.cor);
        }}
        onPointerLeave={() => {
          setLupa(null);
          onPrevia(null);
        }}
        onPointerCancel={() => {
          inicio.current = null;
          apontar.current = false;
          pararRelogio();
          setLupa(null);
          onPrevia(null);
        }}
        // Segurar não abre o menu do sistema nem selecciona (Android e iPhone).
        onContextMenu={(e) => e.preventDefault()}
        style={{
          aspectRatio: String(lida.aspeto),
          touchAction: "pan-y pinch-zoom",
          WebkitTouchCallout: "none",
          userSelect: "none",
        }}
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
  const w = Math.min(5, tela.width);
  const h = Math.min(5, tela.height);
  const x0 = Math.max(0, Math.min(tela.width - w, x - 2));
  const y0 = Math.max(0, Math.min(tela.height - h, y - 2));
  const { data } = ctx.getImageData(x0, y0, w, h);
  const soma = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    soma[0] += data[i];
    soma[1] += data[i + 1];
    soma[2] += data[i + 2];
  }
  const n = data.length / 4;
  return hex([Math.round(soma[0] / n), Math.round(soma[1] / n), Math.round(soma[2] / n)]);
}

type Leitura = { lida: Lida; pontos: Ponto[] } | null;

/**
 * As fotografias já lidas, pelo endereço — o estúdio mostra as cores em dois
 * sítios (a secção e o «Mudar fotografia»), e a mesma fotografia não se
 * descarrega nem se descodifica duas vezes. Poucas: são as seis de uma página.
 */
const jaLidas = new Map<string, Promise<Leitura>>();
function lerFotoGuardada(f: Foto): Promise<Leitura> {
  const url = f.url;
  if (!url) return Promise.resolve(null);
  // Pelo ENDEREÇO: um endereço novo (renovado, ou a versão média em vez da
  // miniatura, ou uma fotografia substituída) é uma leitura nova. Um `data:`
  // resume-se pelo tamanho e pelo fim.
  const chave = url.startsWith("data:") ? `${url.length}|${url.slice(-80)}` : url;
  const ja = jaLidas.get(chave);
  if (ja) return ja.then((l) => (l ? { ...l, lida: { ...l.lida, ref: f.ref } } : null));
  const nova = lerFoto(f);
  jaLidas.set(chave, nova);
  // Uma que falhou pode dar à próxima: não fica guardada.
  void nova.then((l) => {
    if (!l) jaLidas.delete(chave);
  });
  if (jaLidas.size > 24) jaLidas.delete(jaLidas.keys().next().value!);
  return nova;
}

/** Quanto se espera por uma fotografia antes de desistir dela. */
const ESPERA_MS = 15_000;

/** Lê uma fotografia: a tela do conta-gotas e os pontos da regra automática. */
async function lerFoto(f: Foto): Promise<Leitura> {
  if (!f.url || typeof createImageBitmap !== "function") return null;
  try {
    const r = await fetch(f.url, {
      signal:
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(ESPERA_MS)
          : undefined,
    });
    if (!r.ok) return null;
    const imagem = await createImageBitmap(await r.blob());
    try {
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
      if (!grande || !pequena) return null;
      const { data } = pequena.ctx.getImageData(0, 0, pequena.t.width, pequena.t.height);
      return {
        lida: { ref: f.ref, tela: grande.t, aspeto: grande.t.width / grande.t.height },
        pontos: pontosDaFoto(data, pequena.t.width, pequena.t.height, 4),
      };
    } finally {
      imagem.close();
    }
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
