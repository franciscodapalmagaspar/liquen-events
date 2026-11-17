"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizedThemeName, type ThemeSummary } from "@/lib/theme-types";
import { Button, FolhaOuDialogo } from "./ui";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * JUNTAR DOIS TEMAS NUM SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «"Clássico Intemporal" aparece duas vezes com nomes quase
 * iguais — não tenho como os juntar».
 *
 * Não tinha mesmo. O que existia era «Copiar para…», que leva as fotos
 * SELECIONADAS: para juntar dois temas era preciso abrir a pasta, escolher as
 * 300 fotos à mão, mover, voltar atrás e apagar o tema vazio — e apagar é a
 * única operação irreversível deste ecrã.
 *
 * ── O QUE ISTO É, POR BAIXO ───────────────────────────────────────────────
 *
 * Exactamente o mesmo movimento, feito por lotes e com o servidor a descobrir
 * as fotos sozinho (ver `POST /api/temas/[id]/fundir`). O ciclo vive aqui, e
 * não no servidor, pela mesma razão do «Copiar para…»: um tema pode ter
 * milhares de fotos e a função tem 60 s. Cada volta é atómica e repetível —
 * fechar o separador a meio deixa um tema com menos fotos e outro com mais,
 * que é o que uma fusão a meio é, e continuar é carregar outra vez.
 *
 * ── E O QUE ISTO NÃO FAZ ──────────────────────────────────────────────────
 *
 * Não apaga fotografias, e não apaga o tema. Uma foto que já esteja no destino
 * fica onde está, e um tema que não tenha ficado vazio não sai da lista — o
 * relatório diz porquê. Apagar continua a ser uma decisão dela, no botão que
 * já existe para isso.
 *
 * ── E PORQUE É QUE ISTO É UM `FolhaOuDialogo` ─────────────────────────────
 *
 * Já era meia folha à mão (`items-end sm:items-center`, `rounded-t-2xl`), mas
 * sem pega, sem arrasto e — o que doía — SEM camada de história: num iPhone,
 * deslizar da esquerda é o botão de voltar, e a meio de uma fusão isso saía do
 * back office em vez de fechar a caixa. O primitivo traz as quatro (pega,
 * arrasto, história e as acções coladas em baixo ao alcance do polegar) e leva
 * consigo o `bloqueado`, que é o `&& !running` que estava aqui espalhado.
 */

/** O que aconteceu à fusão inteira — é isto que a lista de temas usa para se
 *  reconciliar sem recarregar tudo. */
export interface ThemeMergeOutcome {
  sourceId: string;
  sourceName: string;
  destId: string;
  destName: string;
  /** Fotos que passaram mesmo para o destino. */
  moved: number;
  /** Já lá estavam com o mesmo nome. Ficaram na origem. */
  existing: number;
  /** Não foi possível levar — continuam na origem. */
  failed: number;
  /** Chegaram ao destino sem miniatura. */
  thumbsMissing: number;
  /** Quantas ficaram na origem no fim. */
  leftBehind: number;
  /** A origem ficou vazia e foi arquivada. */
  archived: boolean;
  /** Ela carregou em «Parar». */
  stopped: boolean;
}

/**
 * Tecto de voltas ao ciclo.
 *
 * Não é um limite de fotos — 400 voltas são 16 000 — é um travão contra um
 * ciclo que não avança: se um dia o servidor devolvesse sempre o mesmo
 * deslocamento, isto pára e reporta em vez de ficar a martelar a rota para
 * sempre.
 */
const MAX_VOLTAS = 400;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Quantas fotos tem o tema, sem mentir — a mesma regra do `ThemeCopyDialog`. */
function countLabel(t: ThemeSummary): string {
  if (t.imageCount === null) return "Fotos indisponíveis";
  if (t.truncated) return `${t.imageCount}+ fotos`;
  return plural(t.imageCount, "foto", "fotos");
}

export default function FundirTemas({
  /**
   * ── E ESTA FOLHA TAMBÉM SAI ─────────────────────────────────────────────
   *
   * O `FolhaOuDialogo` ganhou saída na ronda anterior, mas ela é disparada pela
   * prop `aberto` a cair para falso — e aqui o `aberto` estava ESCRITO a
   * verdadeiro, com o pai a desmontar isto de uma vez. Ou seja: a saída existia
   * e este ecrã não a apanhava, porque nunca havia um fotograma em que o
   * `aberto` fosse falso.
   *
   * Passa a vir de fora. O pai (`Temas.tsx`) fecha no instante do gesto, põe
   * isto a `false` e segura o nó os 200 ms — é ele que tem o estado, portanto é
   * ele que o pode segurar. Por omissão fica `true`, que é o que esta caixa era
   * antes e o que os testes que a montam à mão continuam a querer.
   */
  aberto = true,
  sourceTheme,
  themes,
  onClose,
  onDone,
}: {
  /** Ver a nota na desestruturação: é isto que dá a saída a esta folha. */
  aberto?: boolean;
  /** O tema que desaparece da lista. */
  sourceTheme: ThemeSummary;
  themes: ThemeSummary[];
  onClose: () => void;
  onDone: (outcome: ThemeMergeOutcome) => void;
}) {
  /**
   * Para onde se pode fundir.
   *
   * Fora ficam: o próprio, os ARQUIVADOS (fundir para dentro de uma gaveta
   * fechada é esconder as fotos que se acabou de juntar) e os de FILTRO, que
   * não têm pasta própria — as fotos deles são de outros temas, e a rota
   * recusa-os de qualquer maneira.
   */
  const others = useMemo(
    () => themes.filter((t) => t.id !== sourceTheme.id && !t.arquivado && t.kind !== "filtro"),
    [themes, sourceTheme],
  );

  const [destId, setDestId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopRequested = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Fechar o separador a meio não perde nada, mas deixa a fusão pelo meio — e
  // isso ela tem de saber antes de o fazer. É o mesmo aviso do «Copiar para…».
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  const searchable = others.length > 4;
  const visible = useMemo(() => {
    const needle = normalizedThemeName(search);
    if (!needle) return others;
    return others.filter((t) => normalizedThemeName(t.name).includes(needle));
  }, [others, search]);

  const dest = others.find((t) => t.id === destId) ?? null;
  /** O total para a barra. É um palpite honesto: com `truncated` é um mínimo,
   *  e com a pasta ilegível não há barra nenhuma para desenhar. */
  const total = sourceTheme.imageCount ?? 0;

  async function run() {
    if (!dest || running) return;
    stopRequested.current = false;
    setRunning(true);
    setError(null);
    setProgress({ done: 0, total });

    let offset = 0;
    let moved = 0;
    let existing = 0;
    let failed = 0;
    let thumbsMissing = 0;
    let leftBehind = 0;
    let archived = false;
    let stopped = false;

    for (let volta = 0; volta < MAX_VOLTAS; volta++) {
      if (stopRequested.current || !alive.current) {
        stopped = true;
        break;
      }
      let data: {
        moved?: number;
        existing?: number;
        failed?: number;
        thumbsMissing?: number;
        nextOffset?: number;
        done?: boolean;
        leftBehind?: number;
        archived?: boolean;
        error?: string;
      } | null = null;
      try {
        const res = await fetch(`/api/temas/${sourceTheme.id}/fundir`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destino: dest.id, offset }),
        });
        data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Não foi possível juntar os temas.");
      } catch (e) {
        if (!alive.current) return;
        setRunning(false);
        setProgress(null);
        // Nada se perde: o que já passou está no destino e o resto continua na
        // origem. Fica a razão no ecrã e o botão volta a estar disponível —
        // recomeçar é seguro, porque cada volta é repetível.
        setError(
          e instanceof Error ? e.message : "Não foi possível juntar os temas. Tenta outra vez.",
        );
        return;
      }
      moved += data?.moved ?? 0;
      existing += data?.existing ?? 0;
      failed += data?.failed ?? 0;
      thumbsMissing += data?.thumbsMissing ?? 0;
      leftBehind = data?.leftBehind ?? 0;
      archived = !!data?.archived;
      offset = data?.nextOffset ?? offset;
      if (!alive.current) return;
      setProgress({ done: moved, total: Math.max(total, moved) });
      if (data?.done) break;
    }

    if (!alive.current) return;
    setRunning(false);
    setProgress(null);
    onDone({
      sourceId: sourceTheme.id,
      sourceName: sourceTheme.name,
      destId: dest.id,
      destName: dest.name,
      moved,
      existing,
      failed,
      thumbsMissing,
      leftBehind,
      archived,
      stopped,
    });
  }

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0;

  return (
    <FolhaOuDialogo
      aberto={aberto}
      onFechar={onClose}
      sobretitulo={`Juntar “${sourceTheme.name}” a`}
      titulo={countLabel(sourceTheme)}
      largura="md"
      /* ── PORQUE É QUE ISTO SE TRANCA A MEIO ──────────────────────────────
         Cada volta é atómica e repetível, mas o que fica de uma fusão
         interrompida é um tema com menos fotos e outro com mais — trabalho
         pelo meio, que é a coisa que esta casa promete não perder. Num
         telemóvel isto não é hipotético: o fundo é uma faixa estreita, e o
         gesto de voltar do iPhone faz-se sem se pensar nele. A saída existe e
         é o «Parar» aqui em baixo, que fecha a volta que está a correr em vez
         de a cortar. */
      bloqueado={running}
      accoes={
        <div className="flex w-full flex-col gap-3">
          {/* A consequência por extenso, ANTES de se carregar — e com o que NÃO
              acontece a seguir, que é o que dá coragem para carregar. Fica
              PRESA ao rodapé e não a rolar com a lista: uma frase de
              consequência que se pode não ter visto não é um aviso. */}
          {others.length > 0 && (
            <div>
              <p className="bo-text-muted text-xs leading-relaxed">
                As fotos de “{sourceTheme.name}” passam para “{dest?.name ?? "…"}” e “
                {sourceTheme.name}” fica arquivado. Nenhuma fotografia é apagada, e as propostas já
                feitas não são afetadas.
              </p>
              {total > 400 && (
                <p className="bo-text-muted mt-1 text-xs">
                  São muitas fotos — pode demorar alguns minutos. Deixa este separador aberto.
                </p>
              )}
            </div>
          )}

          {progress && (
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-[var(--bo-text)]">
                  A juntar <strong className="font-medium">{progress.done}</strong>
                  {progress.total > 0 ? ` de ${plural(progress.total, "foto", "fotos")}` : " fotos"}
                  …
                </p>
                {progress.total > 0 && <span className="bo-text-muted text-xs">{pct}%</span>}
              </div>
              <div
                role="progressbar"
                aria-label="Progresso"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bo-tinta-10)]"
              >
                <div
                  className="h-full w-full origin-left rounded-full bg-sage-600 motion-safe:transition-transform motion-safe:duration-elemento motion-safe:ease-out"
                  style={{ transform: `scaleX(${pct / 100})` }}
                />
              </div>
            </div>
          )}

          {error && !running && (
            <div className="rounded-lg border border-[var(--bo-perigo)]/20 bg-[var(--bo-perigo-lavagem)]/40 px-3 py-2">
              <p className="text-sm text-[var(--bo-text)]">{error}</p>
              <p className="bo-text-muted mt-0.5 text-xs">
                O que já passou está em “{dest?.name ?? "…"}”; o resto continua aqui. Podes tentar
                outra vez.
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={
                running
                  ? () => {
                      stopRequested.current = true;
                    }
                  : onClose
              }
            >
              {running ? "Parar" : "Cancelar"}
            </Button>
            <Button
              size="sm"
              variant="primary"
              loading={running}
              disabled={!dest || running}
              onClick={() => void run()}
            >
              Juntar os temas
            </Button>
          </div>
        </div>
      }
    >
      {searchable && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Procurar tema…"
          aria-label="Procurar tema de destino"
          disabled={running}
          className="bo-input mb-3 px-3 py-2 text-sm text-[var(--bo-text)] placeholder-foreground/30"
        />
      )}
      {others.length === 0 ? (
        <p className="bo-text-muted py-6 text-center text-sm">
          Não há outro tema a que juntar este.
        </p>
      ) : visible.length === 0 ? (
        <p className="bo-text-muted py-6 text-center text-sm">
          Nenhum tema com “{search.trim()}” no nome.
        </p>
      ) : (
        <div role="radiogroup" aria-label="Tema que fica" className="flex flex-col gap-1.5">
          {visible.map((t) => {
            const on = t.id === destId;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={running}
                onClick={() => setDestId(t.id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left  disabled:opacity-50 ${
                  on
                    ? "border-sage-600 bg-sage-600/[0.07]"
                    : "border-[var(--bo-hairline-strong)] hover:border-sage-600/40"
                } ${ESTADO} ${PRESSAO}`}
              >
                <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[var(--bo-tinta-6)]">
                  {t.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.coverUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-[var(--bo-text)]">{t.name}</span>
                  <span className="bo-text-muted block text-xs">{countLabel(t)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </FolhaOuDialogo>
  );
}
