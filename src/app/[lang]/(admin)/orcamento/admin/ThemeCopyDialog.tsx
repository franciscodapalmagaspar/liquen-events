"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ImagemComPlanoB from "./ImagemComPlanoB";
import {
  MAX_THEME_COPY_BATCH,
  THEME_COPY_CHUNK,
  normalizedThemeName,
  type ThemeCopyMode,
  type ThemeSummary,
} from "@/lib/theme-types";
import { Button, FolhaOuDialogo } from "./ui";
/* A escala de movimento da casa — ver `ui/movimento.ts`. `ESTADO` são os 120 ms
   do degrau `micro`; `PRESSAO` o toque a 20 ms; `PROGRESSO` os 250 ms do degrau
   `elemento`, que é o degrau de «uma coisa a mover-se» e não de um estado a
   mudar. As três trazem `motion-safe:` — o `globals.css` não tem rede global. */
import { ESTADO, PRESSAO, PROGRESSO } from "./ui/movimento";

/**
 * LEVAR AS FOTOS SELECIONADAS PARA OUTRO TEMA — copiar ou mover.
 *
 * Porquê um DIÁLOGO e não outra coisa:
 *
 *  · NÃO por arrasto. Não é gosto, é o código: a grelha JÁ usa arrastar para
 *    reordenar (`dragFrom`/`dragOver` → `persistOrder`). Um segundo significado
 *    para o mesmo gesto seria ambíguo em cada arrasto — e os cartões dos temas
 *    nem sequer estão no ecrã quando a pasta de um tema está aberta.
 *  · NÃO um menu suspenso. Não tem onde caber o que decide a escolha: quantas
 *    fotos tem o destino, a capa para o reconhecer, copiar-ou-mover com frases
 *    de consequência diferentes, a barra de progresso e o que correu mal.
 *  · SIM um diálogo, porque já existe um igual: o `ThemePicker` do estúdio de
 *    propostas é exatamente este gesto ("escolher um tema"). Mesma forma, mesmo
 *    `useFocusTrap`, mesmo modelo mental.
 *
 * E, num telemóvel, uma FOLHA INFERIOR — o `FolhaOuDialogo`, gémeo a gémeo com
 * o `FundirTemas`. Já era meia folha à mão, sem pega, sem arrasto e sem camada
 * de história: a meio de uma cópia, o gesto de voltar do iPhone saía do back
 * office em vez de fechar a caixa. O `bloqueado` do primitivo é o `&& !running`
 * que estava aqui espalhado por três sítios.
 *
 * COPIAR e MOVER, as duas. Copiar é o pedido literal e o caso de uso real — um
 * tema é uma ETIQUETA, não uma gaveta exclusiva: uma mesa de terracota
 * fotografada em Itália pertence aos dois temas. Mover existe por causa de um
 * erro que este ecrã torna provável: largar uma pasta de 300 fotos no tema que
 * estava aberto (`MAX_DROP_FILES = 5000`, e o arrasto percorre pastas
 * inteiras). Sem "Mover", corrigir isso é copiar 300 e depois APAGAR 300 — a
 * única operação irreversível do ecrã, 300 vezes. Mover é reversível: move-se
 * de volta.
 *
 * ⚠️ VOCABULÁRIO: nesta casa "Transferir" já é o botão de DESCARREGAR, na mesma
 * barra de seleção. A palavra está proibida aqui.
 */

/** O que aconteceu ao lote todo — é isto que o ecrã da pasta usa para
 *  reconciliar a grelha e para desenhar o relatório. */
export interface ThemeCopyOutcome {
  mode: ThemeCopyMode;
  destId: string;
  destName: string;
  /** As que ficaram MESMO no destino (e, ao mover, saíram daqui). */
  copied: string[];
  /** As que já lá estavam. Não é um erro e não pode aparecer a vermelho. */
  existing: string[];
  /** As que não foi possível levar — continuam aqui, intactas. */
  failed: string[];
  /** As que o "Parar" apanhou antes de saírem: nem foram tentadas, e continuam
   *  aqui. Sem elas no relatório, quem chama não tem como distinguir "não a
   *  levei" de "esqueci-me dela" — e a seleção de que ela precisa para retomar
   *  desaparecia. */
  untouched: string[];
  /** Chegaram ao destino sem miniatura: o tema de destino passa a puxar
   *  originais (medido: 164 MB por página de 60, contra 1,78 MB). */
  thumbsMissing: number;
  /** Ela carregou em "Parar" — as que faltavam nem foram tentadas. */
  stopped: boolean;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Quantas fotos tem o destino, sem mentir: `null` = pasta ilegível,
 *  `truncated` = a contagem é um MÍNIMO. */
function countLabel(t: ThemeSummary): string {
  if (t.imageCount === null) return "Fotos indisponíveis";
  if (t.truncated) return `${t.imageCount}+ fotos`;
  return plural(t.imageCount, "foto", "fotos");
}

export default function ThemeCopyDialog({
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
  /**
   * ── E ABRE NO GESTO QUE A TROUXE ───────────────────────────────────────
   *
   * Esta folha tem duas portas: «Copiar para…» na barra da selecção e «Mover
   * para…» no menu da fotografia. Abria SEMPRE em «Copiar», e o menu prometia
   * mover: quem escolhia «Mover para…», escolhia o destino e carregava no
   * botão do fundo COPIAVA — a fotografia ficava nos dois temas, e o engano só
   * se via ao voltar à pasta de origem. É o pai que sabe por que porta se
   * entrou, portanto é ele que diz. Por omissão fica «copiar», que é o que a
   * barra da selecção sempre quis.
   *
   * Só o modo INICIAL: os dois botões continuam lá para trocar, e quem chega
   * por «Mover» lê a frase da consequência de «Mover» antes de carregar.
   */
  modoInicial = "copiar",
  sourceTheme,
  themes,
  paths,
  onClose,
  onDone,
}: {
  /** Ver a nota na desestruturação: é isto que dá a saída a esta folha. */
  aberto?: boolean;
  /** Ver a nota na desestruturação: a porta por onde se entrou. */
  modoInicial?: ThemeCopyMode;
  sourceTheme: ThemeSummary;
  /** Todos os temas conhecidos (o de origem é filtrado aqui). */
  themes: ThemeSummary[];
  /** Caminhos das fotos selecionadas, pela ordem da grelha. */
  paths: string[];
  onClose: () => void;
  onDone: (outcome: ThemeCopyOutcome) => void;
}) {
  const others = useMemo(
    () => themes.filter((t) => t.id !== sourceTheme.id),
    [themes, sourceTheme],
  );

  const [destId, setDestId] = useState<string | null>(others[0]?.id ?? null);
  const [mode, setMode] = useState<ThemeCopyMode>(modoInicial);
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

  // Um lote de 300 fotos são ~15 pedidos: fechar o separador a meio deixa
  // metade movida. Não se perde nada (cada lote é atómico e repetível), mas é
  // confuso — o browser mostra o seu próprio aviso.
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  // O campo de procura só aparece com lista que chegue para o justificar — a
  // mesma regra (e a mesma normalização) da lista de temas.
  const searchable = others.length > 4;
  const visible = useMemo(() => {
    const needle = normalizedThemeName(search);
    if (!needle) return others;
    return others.filter((t) => normalizedThemeName(t.name).includes(needle));
  }, [others, search]);

  const dest = others.find((t) => t.id === destId) ?? null;

  /**
   * Corre o lote em pedaços de `THEME_COPY_CHUNK`.
   *
   * Cada pedido é independente e REPETÍVEL: o nome do ficheiro é preservado, por
   * isso repetir devolve "já lá estavam" em vez de duplicar. É por isso que
   * parar a meio (ou a ligação cair) não estraga nada — e é por isso que não há
   * `window.confirm` por cima deste diálogo: o diálogo é a confirmação, e mover
   * desfaz-se movendo de volta.
   */
  async function run() {
    if (!dest || running || paths.length === 0) return;
    stopRequested.current = false;
    setRunning(true);
    setError(null);
    setProgress({ done: 0, total: paths.length });

    const copied: string[] = [];
    const existing: string[] = [];
    const failed: string[] = [];
    const untouched: string[] = [];
    let thumbsMissing = 0;
    let stopped = false;
    let firstError: string | null = null;

    for (let i = 0; i < paths.length; i += THEME_COPY_CHUNK) {
      if (stopRequested.current || !alive.current) {
        stopped = true;
        // O que ficou por tentar tem de sair daqui com nome. É este o
        // conjunto que continua selecionado do outro lado, e sem ele retomar
        // um lote de 300 parado aos 20 era voltar a escolher 280 à mão.
        untouched.push(...paths.slice(i));
        break;
      }
      const chunk = paths.slice(i, i + THEME_COPY_CHUNK);
      try {
        const res = await fetch(`/api/temas/${sourceTheme.id}/imagens/copiar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths: chunk, destino: dest.id, modo: mode }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Não foi possível levar as fotos.");
        for (const c of Array.isArray(data?.copied) ? data.copied : []) {
          if (typeof c?.from === "string") copied.push(c.from);
        }
        existing.push(...(Array.isArray(data?.existing) ? data.existing : []));
        failed.push(...(Array.isArray(data?.failed) ? data.failed : []));
        thumbsMissing += typeof data?.thumbsMissing === "number" ? data.thumbsMissing : 0;
      } catch (e) {
        // O lote que falha inteiro conta como falha das suas fotos: elas
        // continuam na origem e ficam selecionadas para se poder repetir.
        if (!firstError) firstError = e instanceof Error ? e.message : "Falha ao levar as fotos.";
        failed.push(...chunk);
      }
      if (!alive.current) return;
      setProgress({ done: Math.min(i + THEME_COPY_CHUNK, paths.length), total: paths.length });
    }

    if (!alive.current) return;
    setRunning(false);
    setProgress(null);
    // Nada aconteceu de todo: fica no diálogo com a razão à vista, em vez de
    // fechar e mandar procurar um aviso passageiro.
    if (copied.length === 0 && existing.length === 0 && !stopped) {
      setError(firstError ?? "Não foi possível levar as fotos.");
      return;
    }
    onDone({
      mode,
      destId: dest.id,
      destName: dest.name,
      copied,
      existing,
      failed,
      untouched,
      thumbsMissing,
      stopped,
    });
  }

  const count = paths.length;
  const pct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <FolhaOuDialogo
      aberto={aberto}
      onFechar={onClose}
      sobretitulo={`De “${sourceTheme.name}”`}
      titulo={plural(count, "foto selecionada", "fotos selecionadas")}
      largura="md"
      /* A meio, fechar não é uma opção — a mesma razão do `FundirTemas`: cada
         lote é atómico, mas o que fica de uma cópia interrompida é metade das
         fotos aqui e metade ali. Num telemóvel o fundo é uma faixa estreita e o
         gesto de voltar do iPhone faz-se sem se pensar nele. A saída é o
         «Parar», que fecha o lote a correr em vez de o cortar. */
      bloqueado={running}
      accoes={
        <div className="flex w-full flex-col gap-3">
          {/* Copiar ou mover, com a consequência escrita por extenso. Presa ao
              rodapé e não a rolar com a lista: a frase que diz o que vai
              acontecer tem de estar à vista quando se carrega no botão. */}
          {others.length > 0 && (
            <div>
              <div
                className="flex flex-wrap items-center gap-2"
                role="radiogroup"
                aria-label="O que fazer"
              >
                {(["copiar", "mover"] as const).map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant={mode === m ? "subtle" : "ghost"}
                    role="radio"
                    aria-checked={mode === m}
                    disabled={running}
                    onClick={() => setMode(m)}
                  >
                    {m === "copiar" ? "Copiar" : "Mover"}
                  </Button>
                ))}
              </div>
              <p className="bo-text-muted mt-2 text-xs leading-relaxed">
                {mode === "copiar" ? (
                  <>
                    {plural(count, "foto vai", "fotos vão")} também para “{dest?.name ?? "…"}”.{" "}
                    {count === 1 ? "Continua" : "Continuam"} aqui.
                  </>
                ) : (
                  <>
                    {plural(count, "foto passa", "fotos passam")} para “{dest?.name ?? "…"}” e{" "}
                    {count === 1 ? "sai" : "saem"} de “{sourceTheme.name}”. As propostas já feitas
                    não são afetadas.
                  </>
                )}
              </p>
              {count > MAX_THEME_COPY_BATCH * 12 && (
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
                  {mode === "copiar" ? "A copiar" : "A mover"}{" "}
                  <strong className="font-medium">{progress.done}</strong> de{" "}
                  {plural(progress.total, "foto", "fotos")}…
                </p>
                <span className="bo-text-muted text-xs">{pct}%</span>
              </div>
              <div
                role="progressbar"
                aria-label="Progresso"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bo-tinta-10)]"
              >
                {/* 250 ms, e antes eram 150 sem ninguém os ter escolhido: estava aqui
                    `motion-safe:duration-elemento`, e essa classe não gera regra
                    NENHUMA — o Tailwind v4 lê os `duration-*` do espaço
                    `--transition-duration-*` e o token da casa vivia em
                    `--duration-*`. A barra caía no `--default-transition-duration`.
                    O `PROGRESSO` é o mesmo tempo pretendido (o degrau `elemento`),
                    só que agora escrito num literal que o Tailwind compila mesmo. */}
                <div
                  className={`h-full w-full origin-left rounded-full bg-sage-600 ${PROGRESSO}`}
                  style={{ transform: `scaleX(${pct / 100})` }}
                />
              </div>
            </div>
          )}

          {error && !running && (
            <div className="rounded-lg border border-[var(--bo-perigo)]/20 bg-[var(--bo-perigo-lavagem)]/40 px-3 py-2">
              <p className="text-sm text-[var(--bo-text)]">{error}</p>
              <p className="bo-text-muted mt-0.5 text-xs">
                As fotos não saíram deste tema. Podes tentar outra vez.
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
              variant={mode === "mover" ? "danger" : "primary"}
              loading={running}
              disabled={!dest || running || count === 0}
              onClick={() => void run()}
            >
              {mode === "copiar" ? "Copiar" : "Mover"} {plural(count, "foto", "fotos")}
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
          Não há outro tema para onde levar estas fotos. Cria um em <strong>Temas</strong>.
        </p>
      ) : visible.length === 0 ? (
        <p className="bo-text-muted py-6 text-center text-sm">
          Nenhum tema com “{search.trim()}” no nome.
        </p>
      ) : (
        <div role="radiogroup" aria-label="Tema de destino" className="flex flex-col gap-1.5">
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
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left ${ESTADO} ${PRESSAO} disabled:opacity-50 ${
                  on
                    ? "border-sage-600 bg-sage-600/[0.07]"
                    : "border-[var(--bo-hairline-strong)] hover:border-sage-600/40"
                }`}
              >
                <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[var(--bo-tinta-6)]">
                  {/* Com o plano B, como os cartões: a miniatura da capa pode
                      não existir, e sem recurso ficava uma imagem partida. */}
                  {t.coverUrl && (
                    <ImagemComPlanoB
                      src={t.coverUrl}
                      avif={t.coverAvif}
                      planoB={t.coverFallbackUrl}
                      lqip={t.coverLqip}
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
