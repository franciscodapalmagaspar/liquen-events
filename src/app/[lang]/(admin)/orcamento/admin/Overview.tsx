"use client";

import { Children, useCallback, useMemo, useState, useEffect, useRef, memo } from "react";
import { quandoGravado } from "@/lib/quando-gravado";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import Reminders from "./Reminders";
import Agenda from "./Agenda";
import { eur0 as eur } from "@/lib/money";
import Hoje from "./Hoje";
import { metaFor, tintaDoRotulo } from "./status-meta";
import { todayKey } from "./util";
import { useRelogio } from "./relogio";
import { useEntradaAoChegar } from "./ui/useEntradaAoChegar";
import { ESTADO, PRESSAO, PROGRESSO } from "./ui/movimento";
import { useGaveta } from "./ui/gaveta";
import { useInscricaoNoRegisto, type ResultadoDoEcra } from "./registo-de-gravacoes";
import { useAnular } from "./ui/anular";
import PerguntaDeDesfecho from "./PerguntaDeDesfecho";
import { DIAS_ATE_PERGUNTAR, aEsperaDeResposta, totalPendurado } from "@/lib/orcamento/desfecho";
import {
  propostasPorPedido,
  valorDoPedido,
  type PropostaParaContas,
} from "@/lib/orcamento/dinheiro-dos-pedidos";
import { A_ESPERAR_RESPOSTA, esperaEmPalavras } from "@/lib/orcamento/espera";
import { contaComoEvento } from "@/lib/orcamento/hoje";
import type { LeituraFalhada } from "@/lib/porque-nao-leu";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { fraccaoDaBarra } from "@/lib/fraccao-da-barra";

/**
 * A chave `YYYY-MM-DD` LOCAL de um dia qualquer — a regra do `todayKey()` do
 * `util.ts` aplicada a uma data que não é hoje. `toISOString()` é UTC, e à
 * meia-noite e meia de Verão em Portugal devolve o dia ANTERIOR: a janela
 * «próximos 7 dias» abria e fechava um dia fora do sítio.
 */
const chaveLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Memoised so editing the revenue goal or the team notes (local Overview state)
// doesn't re-render these two heavier panels every keystroke — their props
// (quotes, onOpen) don't change during that typing, so memo lets them bail out.
const MemoReminders = memo(Reminders);
const MemoAgenda = memo(Agenda);

const STATUS_META: Record<QuoteStatus, { label: string; color: string }> = {
  pendente: { label: "Novo", color: "#8a8a82" },
  em_revisao: { label: "Aguardar resposta", color: "#9aa36a" },
  // A cor que já existia entre estas duas (a «Em negociação» das Propostas):
  // um estado novo não traz um tom novo para a casa medir — ver `status-meta.ts`.
  a_preparar: { label: "A preparar proposta", color: "#7d8a55" },
  cotado: { label: "Proposta enviada", color: "#7c854b" },
  aceite: { label: "Ganho", color: "#525a2f" },
  rejeitado: { label: "Perdido", color: "#5a5a55" },
};

// Order the pipeline reads as a funnel: new leads → qualified → quoted → won.
const FUNNEL: { id: QuoteStatus; label: string }[] = [
  { id: "pendente", label: "Novo" },
  { id: "em_revisao", label: "Aguardar resposta" },
  { id: "a_preparar", label: "A preparar proposta" },
  { id: "cotado", label: "Proposta enviada" },
  { id: "aceite", label: "Ganho" },
];

// Shared keyboard focus ring — moss on the white back-office surface. Kept in one
// place so every interactive card/button in the dashboard picks up the same
// visible focus state (WCAG 2.4.7).
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bo-marca)]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? "Outro";
}

/**
 * «há 3min», «há 2h», «ontem».
 *
 * O `agora` VEM DE FORA (do {@link useRelogio}) e não de um `Date.now()` aqui
 * dentro. Era daqui que saía o defeito: esta função era chamada durante o
 * desenho, no servidor e no browser, e os dois caíam em minutos diferentes —
 * «Hydration failed because the server rendered text didn't match the client»,
 * com `+ há 3min` / `- há 2min` no registo. Ver o cabeçalho do `relogio.ts`.
 */
function timeAgo(iso: string, agora: number): string {
  const diff = agora - new Date(iso).getTime();
  const h = diff / 36e5;
  if (h < 1) return `há ${Math.max(1, Math.round(diff / 6e4))}min`;
  if (h < 24) return `há ${Math.round(h)}h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d}d`;
}

/**
 * A idade de um pedido, desenhada só no browser.
 *
 * Antes de hidratar não há hora nenhuma (é o que impede o desencontro), e no
 * lugar do texto fica um espaço inquebrável: a linha guarda a altura que vai
 * ocupar, portanto nada salta quando o valor chega — o que acontece no mesmo
 * instante em que a página ganha vida.
 */
function TempoDesde({ iso, className }: { iso: string; className?: string }) {
  const agora = useRelogio();
  return <span className={className}>{agora === null ? " " : timeAgo(iso, agora)}</span>;
}

/** A small ▲/▼ delta pill comparing this month to last. */
function Delta({ now, prev }: { now: number; prev: number }) {
  // Sem nada no mês anterior não há percentagem que diga alguma coisa: «↑100%»
  // a partir de zero era uma conta inventada (de 0 para 500 € e de 0 para
  // 50 000 € davam o mesmo número). Sem base, não há seta.
  if (prev === 0) return null;
  const up = now >= prev;
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct === 0) return null;
  return (
    <span
      aria-label={`${up ? "a subir" : "a descer"} ${Math.abs(pct)}% face ao mês anterior`}
      className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${
        up ? "text-sage-600" : "text-[var(--bo-aviso)]"
      }`}
    >
      <svg
        width="9"
        height="9"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        {up ? (
          <path
            d="M6 9.5V2.5M6 2.5L2.5 6M6 2.5L9.5 6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M6 2.5V9.5M6 9.5L2.5 6M6 9.5L9.5 6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      {Math.abs(pct)}%
    </span>
  );
}

/**
 * ── Meta de receita e Notas da equipa: gravadas NO SERVIDOR ───────────────
 *
 * Antes viviam as duas no `localStorage`. O ecrã dizia "Notas partilhadas com
 * a equipa" e "Guardado automaticamente" e as duas frases eram falsas: o texto
 * ficava no browser daquele computador, não aparecia no telemóvel dela e
 * desaparecia com o histórico — sem aviso nenhum. Agora vão para
 * `/api/visao-geral`, como qualquer outro dado do back office.
 *
 * Continuam em componentes próprios, com `memo()`, pelo mesmo motivo de
 * sempre: o que se escreve é estado DELES, por isso escrever não volta a
 * desenhar o painel inteiro (os cinco KPI, o funil, o pulso financeiro,
 * "Precisam de atenção", "Atividade recente").
 */
const OVERVIEW_API = "/api/visao-geral";

type CampoId = "notas" | "meta";

interface Campo {
  id: CampoId;
  value: string;
  /** Sobe a cada gravação aceite; é sobre ela que o servidor faz compare-and-set. */
  revision: number;
  updatedAt: string;
}

type Snapshot = Record<CampoId, Campo>;

const CAMPOS: CampoId[] = ["notas", "meta"];

/** Onde o texto vivia antes — no browser, e só nele. */
const CHAVE_ANTIGA: Record<CampoId, string> = {
  notas: "liquen-team-notes",
  meta: "liquen-meta-receita",
};

/**
 * Depois de migrado, o valor antigo é ARQUIVADO em vez de apagado.
 *
 * Apagar assim que o servidor confirma seria o mais limpo, mas este ecrã
 * existe porque alguém perdeu texto sem dar por isso; deixar uma cópia local
 * intacta durante a passagem custa uns KB e não custa nada a ninguém.
 */
const chaveArquivo = (id: CampoId) => `${CHAVE_ANTIGA[id]}--copia-local`;

function lerLocal(chave: string): string {
  try {
    return localStorage.getItem(chave) ?? "";
  } catch {
    return "";
  }
}

/** Só é chamado DEPOIS de o servidor confirmar que já tem o texto. */
function arquivarLocal(id: CampoId, valor: string): void {
  try {
    localStorage.setItem(chaveArquivo(id), valor);
    localStorage.removeItem(CHAVE_ANTIGA[id]);
  } catch {
    // Um browser sem storage não impede nada: a verdade está no servidor.
  }
}

/** Estado de gravação de UM campo. Nunca há um estado mudo. */
type Estado =
  | { tipo: "em-dia" }
  | { tipo: "a-guardar" }
  | { tipo: "guardado"; quando: string }
  | { tipo: "erro"; mensagem: string; texto: string }
  | { tipo: "conflito"; servidor: Campo; meu: string; origem: "servidor" | "browser" };

type Conflito = Extract<Estado, { tipo: "conflito" }>;

/** Hoje só a hora; ontem e mais atrás, com o dia. Ver `quando-gravado` —
 *  a meta e as notas guardadas ontem diziam «14:32» e pareciam de agora. */
const horaCurta = (iso: string): string => quandoGravado(iso);

function motivo(err: unknown): string {
  // Um `fetch` que nem chega ao servidor rejeita com TypeError e uma mensagem
  // de programador ("Failed to fetch"); essa não vai para o ecrã dela.
  if (err instanceof Error && err.name !== "TypeError" && err.message) return err.message;
  return "Não foi possível chegar ao servidor — verifica a ligação.";
}

/**
 * Lê os dois campos do servidor, grava-os e traz o que estava no browser.
 *
 * ── Edição em simultâneo (dois dispositivos, duas pessoas) ────────────────
 * Cada gravação diz ao servidor sobre que revisão foi escrita. Se entretanto
 * alguém gravou, o servidor responde 409 com a versão dele e a nossa NÃO é
 * escrita: mostram-se as duas lado a lado e a escolha é de quem está a ler.
 * O último a gravar ganhar seria mais simples — e apagaria texto sem ninguém
 * dar por isso, que é o defeito que este ecrã tinha.
 *
 * ── O que estava no browser ───────────────────────────────────────────────
 * Ao carregar, comparamos a chave antiga do `localStorage` com o servidor:
 *   · iguais            → a passagem já foi feita; arquiva-se a chave antiga;
 *   · servidor vazio    → o browser é a única cópia: sobe sozinha (e só depois
 *                         de confirmada é que a chave antiga é arquivada);
 *   · os dois com texto → ninguém decide por ela: é o mesmo aviso de conflito.
 */
function usePainelEquipa() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [carga, setCarga] = useState<"a-carregar" | "pronto" | "erro">("a-carregar");
  const [estado, setEstado] = useState<Record<CampoId, Estado>>({
    notas: { tipo: "em-dia" },
    meta: { tipo: "em-dia" },
  });

  // A revisão actual tem de estar à mão no momento da gravação, sem depender
  // do render anterior — daí o ref a acompanhar o estado.
  const snapRef = useRef<Snapshot | null>(null);

  const marcar = useCallback((id: CampoId, e: Estado) => {
    setEstado((prev) => ({ ...prev, [id]: e }));
  }, []);

  const aplicar = useCallback((campo: Campo) => {
    const base = snapRef.current;
    if (!base) return;
    const proximo = { ...base, [campo.id]: campo };
    snapRef.current = proximo;
    setSnapshot(proximo);
  }, []);

  const guardar = useCallback(
    async (id: CampoId, value: string): Promise<boolean> => {
      const base = snapRef.current?.[id];
      if (!base) {
        marcar(id, {
          tipo: "erro",
          mensagem: "Ainda não foi possível ler o que está guardado no servidor.",
          texto: value,
        });
        return false;
      }
      marcar(id, { tipo: "a-guardar" });
      try {
        const res = await fetch(OVERVIEW_API, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, value, baseRevision: base.revision }),
        });
        if (res.status === 409) {
          const corpo = (await res.json().catch(() => null)) as { current?: Campo } | null;
          const servidor = corpo?.current ?? base;
          aplicar(servidor);
          marcar(id, { tipo: "conflito", servidor, meu: value, origem: "servidor" });
          return false;
        }
        if (!res.ok) {
          const corpo = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(
            typeof corpo?.error === "string" && corpo.error
              ? corpo.error
              : `O servidor respondeu ${res.status}.`,
          );
        }
        const guardado = (await res.json()) as Campo;
        aplicar(guardado);
        marcar(id, { tipo: "guardado", quando: horaCurta(guardado.updatedAt) });
        return true;
      } catch (err) {
        marcar(id, { tipo: "erro", mensagem: motivo(err), texto: value });
        return false;
      }
    },
    [aplicar, marcar],
  );

  // Não marca "a-carregar" à entrada: no arranque já é esse o estado inicial, e
  // fazê-lo aqui seria um setState síncrono dentro do efeito. Quem repete a
  // leitura a partir de um botão passa por `recarregar`, que o marca.
  const carregar = useCallback(async (): Promise<Snapshot | null> => {
    try {
      const res = await fetch(OVERVIEW_API, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const snap = (await res.json()) as Snapshot;
      snapRef.current = snap;
      setSnapshot(snap);
      setCarga("pronto");
      return snap;
    } catch {
      setCarga("erro");
      return null;
    }
  }, []);

  const migrar = useCallback(
    (snap: Snapshot) => {
      for (const id of CAMPOS) {
        const antigo = lerLocal(CHAVE_ANTIGA[id]).trim();
        if (!antigo) continue;
        const servidor = (snap[id]?.value ?? "").trim();
        if (servidor === antigo) {
          arquivarLocal(id, antigo);
          continue;
        }
        if (!servidor) {
          void guardar(id, antigo).then((ok) => {
            if (ok) arquivarLocal(id, antigo);
          });
          continue;
        }
        marcar(id, { tipo: "conflito", servidor: snap[id], meu: antigo, origem: "browser" });
      }
    },
    [guardar, marcar],
  );

  useEffect(() => {
    let vivo = true;
    // O estado só é escrito DEPOIS do `await fetch`, dentro de `carregar` — é a
    // sincronização com um sistema externo (o servidor) que o efeito existe
    // para fazer, não uma cascata de renders. Mesma isenção, e pelo mesmo
    // motivo, que o `useCachedList` das outras vistas.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar().then((snap) => {
      if (vivo && snap) migrar(snap);
    });
    return () => {
      vivo = false;
    };
  }, [carregar, migrar]);

  const resolver = useCallback(
    async (id: CampoId, conflito: Conflito, escolha: "meu" | "servidor") => {
      if (escolha === "servidor") {
        // Fica a versão do servidor. A do browser não se evapora: vai para o
        // arquivo, onde continua legível se ela mudar de ideias.
        if (conflito.origem === "browser") arquivarLocal(id, conflito.meu);
        marcar(id, { tipo: "em-dia" });
        return;
      }
      // Grava por cima, mas já sobre a revisão nova — o texto do servidor
      // acabou de ser mostrado, por isso a substituição é uma decisão dela.
      const ok = await guardar(id, conflito.meu);
      if (ok && conflito.origem === "browser") arquivarLocal(id, conflito.meu);
    },
    [guardar, marcar],
  );

  const recarregar = useCallback(() => {
    setCarga("a-carregar");
    void carregar().then((snap) => {
      if (snap) migrar(snap);
    });
  }, [carregar, migrar]);

  return { snapshot, carga, estado, guardar, resolver, recarregar };
}

/** Aviso de duas versões do mesmo texto. Mostra AS DUAS e não escolhe nenhuma. */
function AvisoConflito({
  conflito,
  rotulo,
  onEscolher,
}: {
  conflito: Conflito;
  rotulo: string;
  onEscolher: (escolha: "meu" | "servidor") => void;
}) {
  const doBrowser = conflito.origem === "browser";
  return (
    <div
      role="alert"
      className="mt-3 rounded-xl border border-[var(--bo-perigo)]/30 bg-[var(--bo-perigo)]/[0.06] p-3 text-left"
    >
      <p className="text-[var(--bo-perigo)] text-xs font-semibold leading-snug">
        {doBrowser
          ? `Havia ${rotulo} guardadas só neste browser, diferentes das que estão no servidor. Nada foi apagado.`
          : `${rotulo} foram alteradas noutro dispositivo. O que escreveste NÃO foi gravado.`}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 mt-2.5">
        <div>
          <p className="text-foreground/35 text-[9px] tracking-[0.15em] uppercase mb-1">
            {doBrowser ? "Neste browser" : "O que escreveste"}
          </p>
          <p className="text-[var(--bo-tinta-72)] text-xs whitespace-pre-wrap break-words max-h-32 overflow-y-auto bg-[var(--bo-surface)]/60 rounded-lg p-2">
            {conflito.meu || "(vazio)"}
          </p>
        </div>
        <div>
          <p className="text-foreground/35 text-[9px] tracking-[0.15em] uppercase mb-1">
            No servidor
          </p>
          <p className="text-[var(--bo-tinta-72)] text-xs whitespace-pre-wrap break-words max-h-32 overflow-y-auto bg-[var(--bo-surface)]/60 rounded-lg p-2">
            {conflito.servidor.value || "(vazio)"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-2.5">
        <button
          onClick={() => onEscolher("meu")}
          className={`px-3 py-1.5 rounded-full bg-[var(--bo-seleccao)] text-[var(--bo-sobre-seleccao)] text-[10px] tracking-[0.12em] uppercase ${FOCUS_RING} ${ESTADO} ${PRESSAO}`}
        >
          {doBrowser ? "Guardar as deste browser" : "Guardar a minha por cima"}
        </button>
        <button
          onClick={() => onEscolher("servidor")}
          className={`px-3 py-1.5 rounded-lg border border-[var(--bo-hairline-strong)] text-[var(--bo-text-muted)] text-[10px] tracking-[0.12em] uppercase ${FOCUS_RING} ${ESTADO} ${PRESSAO}`}
        >
          Ficar com a do servidor
        </button>
      </div>
    </div>
  );
}

/**
 * A legenda de estado. Antes dizia sempre "Guardado automaticamente" — mesmo
 * quando nada tinha sido guardado. Agora diz o que se passa, e uma falha é
 * `role="alert"`, com o texto por gravar guardado no próprio estado para o
 * "Tentar de novo" não depender do que ainda está no ecrã.
 */
function LinhaEstado({
  estado,
  porGravar,
  onTentarDeNovo,
}: {
  estado: Estado;
  porGravar: boolean;
  onTentarDeNovo: (texto: string) => void;
}) {
  if (estado.tipo === "erro") {
    const texto = estado.texto;
    /* ── E ESTA NÃO ENTRA. É A ÚNICA ────────────────────────────────────────
       As outras mensagens de `role="alert"` da casa entram com a `.bo-entrada`
       — quatro píxeis, distância de rótulo, porque aparecem uma vez por baixo
       do campo que as provocou (ver o `AvisoDeRecusa` do `AdminLogin.tsx`).

       Esta vive noutro sítio: é a legenda de estado de uma nota que está a ser
       ESCRITA, e a gravação é automática. Enquanto o servidor não responder,
       cada tentativa repõe este mesmo ramo — «a guardar…», erro, «a guardar…»,
       erro — e uma entrada a cada passagem não é uma entrada, é um pisca-pisca
       por cima do texto que ela está a escrever. O movimento indica direcção e
       origem; aqui não havia direcção nenhuma a indicar, e a origem é a mesma
       de há dez segundos.

       Fica escrito para não voltar a ser lido como um esquecimento: é uma
       decisão, e o dia em que a gravação deixar de ser automática é o dia em
       que ela se revê. */
    return (
      <span role="alert" className="text-[var(--bo-perigo)] text-[10px] leading-snug">
        Não foi possível guardar — o texto está só neste ecrã. {estado.mensagem}{" "}
        <button
          onClick={() => onTentarDeNovo(texto)}
          className={`underline font-semibold rounded ${FOCUS_RING} ${ESTADO} ${PRESSAO}`}
        >
          Tentar de novo
        </button>
      </span>
    );
  }
  if (estado.tipo === "conflito") {
    return <span className="text-[var(--bo-perigo)] text-[10px]">Duas versões por resolver.</span>;
  }
  if (porGravar) return <span className="text-foreground/40 text-[10px]">Por guardar…</span>;
  if (estado.tipo === "a-guardar")
    return <span className="text-foreground/40 text-[10px]">A guardar…</span>;
  if (estado.tipo === "guardado")
    return (
      <span className="text-sage-600 text-[10px]">
        Guardado no servidor{estado.quando ? ` às ${estado.quando}` : ""}
      </span>
    );
  return <span className="text-[var(--bo-text-faint)] text-[10px]">Guardado no servidor</span>;
}

/** A leitura falhou: dizê-lo é obrigatório — um "Sem notas." seria outra mentira. */
function AvisoLeitura({ onRecarregar }: { onRecarregar: () => void }) {
  return (
    <p role="alert" className="text-[var(--bo-perigo)] text-xs leading-relaxed">
      Não foi possível ler o que está guardado no servidor.{" "}
      <button
        onClick={onRecarregar}
        className={`underline font-semibold rounded ${FOCUS_RING} ${ESTADO} ${PRESSAO}`}
      >
        Tentar de novo
      </button>
    </p>
  );
}

interface CampoProps {
  campo: Campo | undefined;
  estado: Estado;
  carga: "a-carregar" | "pronto" | "erro";
  onGuardar: (valor: string) => Promise<boolean>;
  onResolver: (conflito: Conflito, escolha: "meu" | "servidor") => void;
  onRecarregar: () => void;
}

const MetaReceita = memo(function MetaReceita({
  wonThisMonth,
  campo,
  estado,
  carga,
  onGuardar,
  onResolver,
  onRecarregar,
}: CampoProps & { wonThisMonth: number }) {
  const guardada = Number(campo?.value ?? "");
  const goal = Number.isFinite(guardada) && guardada > 0 ? guardada : 0;
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("");

  async function saveGoal() {
    const v = parseFloat(goalInput.replace(/[^\d.]/g, "")) || 0;
    // O editor só fecha quando o servidor confirma: fechá-lo antes seria a
    // mesma promessa vazia de antes.
    if (await onGuardar(v > 0 ? String(v) : "")) setEditingGoal(false);
  }

  return (
    <div className="bo-card p-4">
      {/* ── `gap-3`: O TÍTULO E A ACÇÃO ESTAVAM COLADOS ────────────────────
          MEDIDO num telemóvel, com toque emulado: a 375 px sobrava **1 px**
          entre o fim do título e o princípio do botão; a 320 px sobravam
          **0 px**. Lia-se «…este mêsDefinir meta», uma frase só, sem se
          perceber onde acaba a legenda e começa a coisa em que se toca.

          Um `justify-between` sem `gap` não separa nada: só empurra os dois
          para os extremos, e quando o título cresce até lá, encostam. O
          título é longo por uma boa razão (o «(com IVA)» a seguir aqui em
          baixo), e o botão muda de palavra («Definir»/«Editar»), portanto o
          encosto não é um acidente de um texto — é o estado normal desta
          linha num ecrã estreito.

          Com `gap-3` o título cede primeiro (quebra linha, que já fazia a
          320 px) e ficam sempre 12 px entre os dois. No computador não muda
          nada: aí sobram mais de 200 px e o `gap` nunca chega a apertar. */}
      <div className="flex items-center justify-between gap-3 mb-3">
        {/* A meta mede-se contra o mesmo «Ganho» da fila de cima, que passou a
            ser com IVA. Dizê-lo aqui é o que impede a barra de parecer mais
            fácil de encher sem nada ter mudado do lado do negócio. */}
        <h3 className="bo-eyebrow">Meta de receita (com IVA) — este mês</h3>
        {!editingGoal && carga !== "erro" && (
          <button
            onClick={() => {
              setGoalInput(goal > 0 ? String(goal) : "");
              setEditingGoal(true);
            }}
            // `shrink-0` para que quem quebra linha seja o TÍTULO e não a
            // acção: sem ele, o `gap-3` acima tirava os 12 px ao botão e
            // «Definir meta» partia-se em duas linhas («Definir» / «meta»),
            // que é o mesmo defeito de legibilidade noutro sítio. O título é
            // uma legenda e quebra bem; o rótulo do botão são duas palavras
            // que se lêem de uma vez.
            className={`alvo-toque shrink-0 text-foreground/40 text-[10px] tracking-[0.12em] uppercase hover:text-sage-600 ${ESTADO} ${PRESSAO} rounded ${FOCUS_RING}`}
          >
            {goal > 0 ? "Editar meta" : "Definir meta"}
          </button>
        )}
      </div>

      {carga === "erro" ? (
        <AvisoLeitura onRecarregar={onRecarregar} />
      ) : editingGoal ? (
        <div>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="number"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveGoal();
                if (e.key === "Escape") setEditingGoal(false);
              }}
              placeholder="Ex: 15000"
              aria-label="Meta de receita deste mês"
              className="bo-input flex-1 px-3 py-2 text-sm text-[var(--bo-tinta-72)]"
            />
            <button
              onClick={() => void saveGoal()}
              disabled={estado.tipo === "a-guardar"}
              className={`px-4 py-2 bg-[var(--bo-seleccao)] text-[var(--bo-sobre-seleccao)] text-[10px] tracking-[0.15em] uppercase rounded-full hover:bg-[var(--bo-seleccao-hover)] whitespace-nowrap disabled:opacity-50 ${ESTADO} ${PRESSAO}`}
            >
              {estado.tipo === "a-guardar" ? "A guardar…" : "Guardar"}
            </button>
            <button
              onClick={() => setEditingGoal(false)}
              className={`text-foreground/35 text-[10px] uppercase tracking-[0.1em] hover:text-[var(--bo-text-muted)] px-1 ${ESTADO} ${PRESSAO}`}
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
          <div className="mt-2">
            <LinhaEstado
              estado={estado}
              porGravar={false}
              onTentarDeNovo={(texto) => void onGuardar(texto)}
            />
          </div>
        </div>
      ) : carga === "a-carregar" ? (
        <p className="text-foreground/40 text-xs py-1">A carregar…</p>
      ) : goal > 0 ? (
        <>
          <div className="flex items-end justify-between mb-2">
            <div>
              <span
                className="font-light"
                style={{
                  fontSize: "clamp(18px, 2vw, 24px)",
                  color: tintaDoRotulo(wonThisMonth >= goal ? "#3a5c39" : "#4c6752"),
                }}
              >
                {eur(wonThisMonth)}
              </span>
              <span className="text-foreground/30 text-xs ml-2">de {eur(goal)}</span>
            </div>
            <span
              className="text-sm font-semibold tabular-nums"
              style={{ color: tintaDoRotulo(wonThisMonth >= goal ? "#3a5c39" : "#4c6752") }}
            >
              {Math.min(100, Math.round((wonThisMonth / goal) * 100))}%
            </span>
          </div>
          <div className="h-2.5 bg-[var(--bo-tinta-6)] rounded-full overflow-hidden">
            {/* 250 ms e não 700: o degrau `elemento` da casa (`PROGRESSO`, em
                `ui/movimento.ts`) é o tempo de «uma coisa a mover-se». A 700 ms
                a barra ainda estava a encher depois de já se ter lido a
                percentagem escrita ao lado — o número dizia uma coisa e o
                desenho outra. Os 700 não vinham de decisão nenhuma escrita. */}
            <div
              className={`h-full w-full origin-left rounded-full ${PROGRESSO}`}
              style={{
                transform: `scaleX(${fraccaoDaBarra(wonThisMonth, goal)})`,
                background: wonThisMonth >= goal ? "#3a5c39" : "#4c6752",
              }}
            />
          </div>
          {wonThisMonth >= goal && (
            <p className="text-[var(--bo-sucesso)] text-[10px] tracking-[0.12em] uppercase font-semibold mt-2">
              Meta atingida ✓
            </p>
          )}
        </>
      ) : (
        <p className="text-foreground/40 text-xs py-1">Sem meta definida.</p>
      )}

      {estado.tipo === "conflito" && (
        <AvisoConflito
          conflito={estado}
          rotulo="uma meta de receita"
          onEscolher={(escolha) => {
            // Ficar com a do servidor fecha o editor: deixá-lo aberto com o
            // número dela seria prometer uma gravação que já não vai acontecer.
            if (escolha === "servidor") setEditingGoal(false);
            onResolver(estado, escolha);
          }}
        />
      )}
      {estado.tipo === "erro" && !editingGoal && (
        <div className="mt-2">
          <LinhaEstado
            estado={estado}
            porGravar={false}
            onTentarDeNovo={(texto) => void onGuardar(texto)}
          />
        </div>
      )}
    </div>
  );
});

/** Espera, em ms, entre a última tecla e a gravação no servidor. */
const ATRASO_GRAVACAO = 800;

const NotasEquipa = memo(function NotasEquipa({
  campo,
  estado,
  carga,
  onGuardar,
  onResolver,
  onRecarregar,
}: CampoProps) {
  const gravado = campo?.value ?? "";
  // `null` = o que está no ecrã é o que está no servidor. Enquanto se escreve,
  // o rascunho manda — inclusive depois de uma falha, para o texto ficar à
  // vista em vez de ser substituído pela versão antiga do servidor.
  const [rascunho, setRascunho] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const anular = useAnular();
  /**
   * O texto gravado quando se abriu o editor. O «Anular» das notas é da
   * SESSÃO de escrita, oferecido ao fechar — um aviso por gravação seria um
   * por pausa a escrever.
   */
  const aoAbrir = useRef<string | null>(null);
  function abrirEditor() {
    aoAbrir.current = gravado;
    setEditingNotes(true);
  }
  // Texto que uma gravação falhada deixou pendurado sem ninguém o ter escrito
  // aqui — é o caso da passagem do browser para o servidor. Se não o
  // mostrássemos, ela via "Sem notas." com as notas dela a existir algures.
  const porMostrar = estado.tipo === "erro" ? estado.texto : "";
  const teamNotes = rascunho ?? (gravado || porMostrar);
  const porGravar = rascunho !== null && rascunho !== gravado;

  // O texto continua a aparecer a cada tecla; o que é adiado é a IDA AO
  // SERVIDOR — uma gravação por tecla seria um pedido por carácter.
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelarTimer = () => {
    if (notesTimer.current) {
      clearTimeout(notesTimer.current);
      notesTimer.current = null;
    }
  };
  function escrever(v: string) {
    setRascunho(v);
    cancelarTimer();
    notesTimer.current = setTimeout(() => {
      notesTimer.current = null;
      void onGuardar(v);
    }, ATRASO_GRAVACAO);
  }
  async function fechar() {
    // Fechar não pode engolir o que ainda estava a caminho: o que estiver
    // pendente vai já.
    const pendente = notesTimer.current !== null;
    const texto = teamNotes;
    cancelarTimer();
    setEditingNotes(false);
    const antes = aoAbrir.current;
    aoAbrir.current = null;
    const ok = pendente ? await onGuardar(texto) : !porGravar;
    if (!ok || antes === null || antes === texto) return;
    // Volta ao texto de quando se abriu, com a revisão de agora: se outra
    // pessoa gravou entretanto, é o conflito de sempre (as duas lado a lado),
    // e não aparece «Anulado.».
    anular("Notas da equipa guardadas.", async () => {
      const voltou = await onGuardar(antes);
      if (voltou) setRascunho(null);
      return voltou;
    });
  }
  useEffect(() => cancelarTimer, []);

  // Sair da página com texto por gravar (ou com uma gravação falhada) é
  // exactamente a forma de perder trabalho sem aviso que este ecrã tinha.
  const arriscado = porGravar || estado.tipo === "erro" || estado.tipo === "conflito";

  /**
   * ── ESTE CARTÃO NO «GUARDAR TUDO» DO BACK OFFICE ─────────────────────────
   *
   * É o quinto sítio da casa com trabalho por gravar, e está na vista que abre
   * o dia: deixá-lo de fora do registo era o botão do cabeçalho dizer «tudo
   * guardado» com as notas dela por gravar à frente dos olhos — a mentira por
   * omissão que esse botão existe para acabar.
   *
   * O nome diz onde é, e não o que o componente se chama: «Notas da equipa
   * (Visão Geral)» é o que ela reconhece na pergunta ao fechar o separador.
   */
  const oRegistoFalaPorMim = useInscricaoNoRegisto({
    nome: "Notas da equipa (Visão Geral)",
    porGravar: arriscado,
    gravarJa: async (): Promise<ResultadoDoEcra> => {
      // O que estava adiado vai JÁ — este é o gesto de quem se vai levantar da
      // secretária, e esperar pelos 800 ms era gravar depois de ela sair.
      cancelarTimer();
      if (await onGuardar(teamNotes)) return { estado: "guardado" };
      // Não há cópia local nenhuma destas notas: o que não chega ao servidor
      // não existe em mais lado nenhum. Num conflito é ainda mais concreto —
      // há uma versão mais recente lá, e alguém tem de escolher.
      return {
        estado: "nao-guardado",
        porque:
          estado.tipo === "conflito"
            ? "Há uma versão mais recente no servidor — escolhe qual fica, na Visão Geral."
            : "O servidor não aceitou as notas da equipa.",
      };
    },
  });

  // Havendo registo, quem trava a saída é ele — e nomeia o que se perde. Sem
  // registo (um teste, ou este cartão montado fora do back office), este
  // continua a valer.
  useEffect(() => {
    if (oRegistoFalaPorMim || !arriscado) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [oRegistoFalaPorMim, arriscado]);

  return (
    <div className="bo-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="bo-eyebrow">Notas da equipa</h3>
        {!editingNotes && carga !== "erro" && (
          <button
            onClick={abrirEditor}
            className={`alvo-toque text-foreground/40 text-[10px] tracking-[0.12em] uppercase hover:text-sage-600 ${ESTADO} ${PRESSAO} rounded ${FOCUS_RING}`}
          >
            {teamNotes ? "Editar" : "Adicionar nota"}
          </button>
        )}
      </div>
      {carga === "erro" ? (
        <AvisoLeitura onRecarregar={onRecarregar} />
      ) : editingNotes ? (
        <div>
          <textarea
            autoFocus
            rows={4}
            value={teamNotes}
            onChange={(e) => escrever(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") void fechar();
            }}
            aria-label="Notas da equipa"
            placeholder="Notas partilhadas com a equipa — lembretes, contexto, próximos passos…"
            className="bo-input w-full px-3 py-2 text-sm text-[var(--bo-tinta-72)] resize-none"
          />
          <div className="flex items-center justify-between gap-3 mt-2">
            <LinhaEstado
              estado={estado}
              porGravar={porGravar}
              onTentarDeNovo={(texto) => void onGuardar(texto)}
            />
            <button
              onClick={() => void fechar()}
              className={`text-sage-600 text-[10px] tracking-[0.1em] uppercase font-medium hover:opacity-75 shrink-0 ${ESTADO} ${PRESSAO}`}
            >
              Fechar
            </button>
          </div>
        </div>
      ) : carga === "a-carregar" ? (
        <p className="text-foreground/40 text-xs">A carregar…</p>
      ) : (
        <>
          {teamNotes ? (
            <p
              className="text-[var(--bo-text-muted)] text-sm leading-relaxed whitespace-pre-wrap cursor-text"
              onClick={abrirEditor}
            >
              {teamNotes}
            </p>
          ) : (
            <p className="text-foreground/40 text-xs">Sem notas.</p>
          )}
          {(porGravar || estado.tipo === "erro") && (
            <div className="mt-2">
              <LinhaEstado
                estado={estado}
                porGravar={porGravar}
                onTentarDeNovo={(texto) => void onGuardar(texto)}
              />
            </div>
          )}
        </>
      )}

      {estado.tipo === "conflito" && (
        <AvisoConflito
          conflito={estado}
          rotulo="notas"
          onEscolher={(escolha) => {
            // Ficar com a do servidor tem de largar MESMO o rascunho: mantê-lo
            // no ecrã por baixo de "resolvido" seria mostrar um texto que já
            // ninguém vai gravar — outra vez a mentira que se veio corrigir.
            if (escolha === "servidor") {
              cancelarTimer();
              setRascunho(null);
            }
            onResolver(estado, escolha);
          }}
        />
      )}
    </div>
  );
});

/**
 * Os dois cartões partilham UMA leitura do servidor (um pedido, não dois) e
 * mantêm gravações independentes — escrever a meta no telemóvel não pode
 * atropelar as notas abertas no portátil.
 */
const PainelEquipa = memo(function PainelEquipa({ wonThisMonth }: { wonThisMonth: number }) {
  const { snapshot, carga, estado, guardar, resolver, recarregar } = usePainelEquipa();
  const anular = useAnular();
  const metaAntes = snapshot?.meta?.value ?? "";
  // A meta anula-se para a de antes, com a revisão de agora (um 409 é o
  // conflito de sempre, e não diz «Anulado.»).
  const guardarMeta = useCallback(
    async (v: string) => {
      const ok = await guardar("meta", v);
      if (ok && v !== metaAntes) {
        anular("Meta do mês guardada.", () => guardar("meta", metaAntes));
      }
      return ok;
    },
    [guardar, anular, metaAntes],
  );
  const guardarNotas = useCallback((v: string) => guardar("notas", v), [guardar]);
  const resolverMeta = useCallback(
    (c: Conflito, escolha: "meu" | "servidor") => void resolver("meta", c, escolha),
    [resolver],
  );
  const resolverNotas = useCallback(
    (c: Conflito, escolha: "meu" | "servidor") => void resolver("notas", c, escolha),
    [resolver],
  );
  return (
    <>
      <MetaReceita
        wonThisMonth={wonThisMonth}
        campo={snapshot?.meta}
        estado={estado.meta}
        carga={carga}
        onGuardar={guardarMeta}
        onResolver={resolverMeta}
        onRecarregar={recarregar}
      />
      <NotasEquipa
        campo={snapshot?.notas}
        estado={estado.notas}
        carga={carga}
        onGuardar={guardarNotas}
        onResolver={resolverNotas}
        onRecarregar={recarregar}
      />
    </>
  );
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * À ESPERA DE RESPOSTA — o dinheiro que está pendurado
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * As propostas que seguiram há {@link DIAS_ATE_PERGUNTAR} dias ou mais e em que
 * ninguém marcou nada. Não é um alarme: é a lista de quem se telefona hoje, com
 * o valor ao lado para se ver de relance quanto está em jogo.
 *
 * Cada linha traz o gesto inteiro — «Ganho» e «Perdido» ali mesmo. Se para
 * marcar fosse preciso abrir o pedido, o gesto voltava a ser um plano em vez de
 * um toque, e o plano é justamente o que não estava a acontecer.
 *
 * Desaparece sozinha quando não há nenhuma. Uma secção que diz «nada aqui»
 * todos os dias é uma secção que se deixa de ler.
 */
function AEsperaDeResposta({
  linhas,
  pendurado,
  userName,
  onOpen,
  onQuoteAtualizado,
}: {
  linhas: { quote: Quote; dias: number; valor: number }[];
  pendurado: number;
  userName: string;
  onOpen: (q: Quote) => void;
  onQuoteAtualizado?: (q: Quote) => void;
}) {
  if (linhas.length === 0) return null;
  return (
    <section aria-labelledby="a-espera-de-resposta-titulo" className="bo-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[var(--bo-hairline)]">
        <div>
          <h3 id="a-espera-de-resposta-titulo" className="bo-eyebrow">
            À espera de resposta
          </h3>
          <p className="text-foreground/40 text-[11px] mt-1 leading-snug">
            Propostas enviadas há {DIAS_ATE_PERGUNTAR} dias ou mais sem resposta marcada.
          </p>
        </div>
        <div className="text-right">
          <p
            className="text-[var(--bo-aviso)] font-light leading-none"
            style={{ fontSize: "clamp(16px, 2vw, 22px)" }}
          >
            {eur(pendurado)}
          </p>
          <p className="text-foreground/35 text-[9px] tracking-[0.2em] uppercase mt-1">
            pendurado em {linhas.length} proposta{linhas.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      <ul className="divide-y divide-[var(--bo-hairline)]">
        {linhas.slice(0, 8).map(({ quote, dias, valor }) => (
          <li key={quote.id} className="px-5 py-3">
            {/* A linha inteira é UM botão, com o mesmo desenho da «Atividade
                recente» aqui em baixo: `w-full` mais `!justify-between`, para o
                `alvo-toque` esticar em vez de centrar. O nome à esquerda, o
                dinheiro à direita, e o rótulo dito por extenso para quem ouve o
                ecrã (senão o nome acessível seria a linha toda seguida). */}
            <button
              type="button"
              onClick={() => onOpen(quote)}
              aria-label={`Abrir o pedido de ${quote.name}`}
              className={`alvo-toque !justify-between w-full flex items-center justify-between gap-3 text-left rounded ${FOCUS_RING} ${ESTADO} ${PRESSAO}`}
            >
              <span className="min-w-0">
                <span className="block text-[var(--bo-tinta-72)] text-sm font-medium truncate">
                  {quote.name}
                </span>
                <span className="block text-foreground/35 text-xs mt-0.5 truncate">
                  {eventTypeLabel(quote)} · {esperaEmPalavras(dias)}
                </span>
              </span>
              <span className="shrink-0 text-sage-600 text-sm font-semibold tabular-nums">
                {eur(valor)}
              </span>
            </button>
            <PerguntaDeDesfecho
              quote={quote}
              quem={userName}
              onGravado={(q) => onQuoteAtualizado?.(q)}
            />
          </li>
        ))}
      </ul>
      {linhas.length > 8 && (
        <p className="px-5 py-3 text-foreground/35 text-[11px] border-t border-[var(--bo-hairline)]">
          e mais {linhas.length - 8} — vê-as todas na lista de pedidos.
        </p>
      )}
    </section>
  );
}

interface Props {
  quotes: Quote[];
  /**
   * As propostas, para a conta do dinheiro (`dinheiro-dos-pedidos.ts`): a taxa
   * de IVA que o cliente viu. Sem elas, conta-se como antes.
   */
  propostas?: PropostaParaContas[];
  userName: string;
  onOpen: (q: Quote) => void;
  onGoStats: () => void;
  onGo: (
    view: "pedidos" | "kanban" | "calendario" | "tarefas" | "propostas" | "clientes" | "pagamentos",
  ) => void;
  onNew: () => void;
  /**
   * O pedido tal como o servidor o devolveu depois de alguém marcar aqui o
   * desfecho. Quem recebe actualiza a lista — sem isto, marcar «Ganho» na Visão
   * Geral mudava o servidor e deixava o ecrã a dizer o contrário.
   */
  onQuoteAtualizado?: (q: Quote) => void;
  /**
   * A leitura dos pedidos não voltou.
   *
   * Esta vista não lê nada: recebe os pedidos já lidos pelo AdminClient, e o
   * desenho do servidor engole a falha e devolve uma lista vazia. Daqui, uma
   * base de dados que não respondeu é indistinguível de um estúdio acabado de
   * abrir — e o ecrã dava as boas-vindas («Este é o teu ponto de partida») a
   * quem tem cinquenta casamentos marcados. A distinção só pode vir de quem
   * fez a leitura; sem ela, a vista comporta-se exactamente como antes.
   */
  falhaDeLeitura?: LeituraFalhada | null;
  /** Volta a pedir a lista de pedidos, quando quem lê sabe repeti-la. */
  aoTentarDeNovo?: () => void;
  /**
   * Quantos pedidos existem mas estão arquivados.
   *
   * A Visão Geral recebe só os activos. Com tudo arquivado ficava igualzinha a
   * uma instalação nova, e a frase de boas-vindas era falsa: o trabalho existe,
   * está noutra gaveta.
   */
  arquivados?: number;
  /** Leva à lista de pedidos já com os arquivados à vista. */
  onVerArquivados?: () => void;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE FICA ATRÁS DE UM TOQUE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Nove dos treze blocos da Visão Geral vivem aqui dentro. Não é um arquivo
 * morto — é a diferença entre «o que preciso de saber agora» e «o que quero
 * consultar quando for a isso».
 *
 * ── PORQUÊ UM `<details>` NATIVO E NÃO UM ESTADO DO REACT ─────────────────
 *
 * Porque assim isto abre sem uma linha de JavaScript, responde ao teclado sem
 * ninguém escrever um `onKeyDown`, e — a parte que se esquece — o «localizar na
 * página» do browser encontra o que está lá dentro MESMO FECHADO, e abre-o. Um
 * `{aberto && …}` em React apagava o conteúdo do DOM: quem procurasse
 * «Margarida» com o ⌘F não a encontrava, e concluía, com razão, que ela não
 * estava no ecrã.
 *
 * ── O RÓTULO DIZ O QUE LÁ ESTÁ ───────────────────────────────────────────
 *
 * A regra da casa é nunca deixar alguém sem saber o que está a acontecer.
 * «Mais» sozinho seria uma gaveta anónima, e uma gaveta anónima não se abre —
 * desconfia-se dela. Por isso a linha de baixo enumera o que lá está dentro,
 * pelo nome com que ela os conhece.
 *
 * ── E A ESCOLHA DELA FICA ────────────────────────────────────────────────
 *
 * Se abrir, fica aberto da próxima vez. Quem gosta de ver tudo não tem de
 * carregar todos os dias no mesmo sítio — e quem não gosta nunca mais lá mexe.
 * A leitura é num efeito e não no desenho: o servidor não sabe o que está no
 * armazenamento do telemóvel dela, e desenhar coisas diferentes dos dois lados
 * é o defeito de hidratação que esta casa já apanhou noutro sítio.
 */
const CHAVE_DO_MAIS = "liquen-visao-geral-mais";

function MaisDoPainel({ children }: { children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  /**
   * ── A CASCATA DOS NOVE, E PORQUE É QUE ELA NÃO CORRE À CHEGADA ───────────
   *
   * Este é o único dos sete `<details>` destes ficheiros cujo corpo são VÁRIOS
   * blocos, e é literalmente o caso para que a `.bo-cena` foi escrita: nove
   * coisas a aparecer ao mesmo tempo, sem ordem de leitura nenhuma.
   *
   * O que a peça (`ui/gaveta.ts`) traz, e que aqui é obrigatório: **só anima o
   * que ela abriu, com o gesto, agora.** A escolha fica guardada no
   * `localStorage` — quem abre a gaveta encontra-a aberta da próxima vez —, e
   * sem esta regra apanhava, todas as manhãs, estes blocos a entrar por cima
   * dos QUATRO da vista, que já têm a sua própria cascata (`--cena` 0 a 3,
   * aqui em baixo). Dois movimentos ao mesmo tempo no mesmo ecrã lêem-se como
   * um defeito, não como uma apresentação.
   */
  const gaveta = useGaveta();

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(CHAVE_DO_MAIS) === "1") setAberto(true);
    } catch {
      /* armazenamento bloqueado — fica fechado, que é o estado por omissão */
    }
  }, []);

  return (
    <details
      className="bo-mais"
      open={aberto}
      onToggle={(e) => {
        const agora = (e.currentTarget as HTMLDetailsElement).open;
        gaveta.aoAlternar(e);
        setAberto(agora);
        try {
          localStorage.setItem(CHAVE_DO_MAIS, agora ? "1" : "0");
        } catch {
          /* sem armazenamento, a escolha vale só para esta visita */
        }
      }}
    >
      <summary
        onClick={gaveta.aoTocarNoResumo}
        className={`alvo-toque -mx-1 flex items-start gap-3 rounded-lg px-1 py-3 ${ESTADO} ${PRESSAO} hover:bg-[var(--bo-tinta-3)] ${FOCUS_RING}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-[var(--bo-text)]">
            Mais do painel
          </span>
          <span className="bo-text-muted mt-0.5 block text-[12px] leading-snug">
            Contadores, notas da equipa, meta do mês, lembretes, agenda, fases dos pedidos, dinheiro
            recebido, o que precisa de atenção e a atividade recente.
          </span>
        </span>
        {/* A seta fica na `.bo-mais-seta` do `globals.css` e NÃO passa para a
            `SETA_DA_GAVETA`: esta é a única das sete que roda por `transform`
            escrito à mão em CSS, com os mesmos 200 ms e a mesma curva. Passá-la
            para a classe do Tailwind deixava a regra do `globals.css` órfã, e
            esse ficheiro não se mexe daqui. Os dois lados estão presos um ao
            outro pelo `gaveta-que-abre.test.tsx`. */}
        <svg
          className="bo-mais-seta mt-1 shrink-0 text-foreground/40"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      {/* ── UM INVÓLUCRO POR BLOCO, E ELE EXISTE SEMPRE ────────────────────
          A escada é POR BLOCO: o `--cena` tem de ser escrito em cada um, senão
          o `min()` do `globals.css` lê zero e os nove entram todos ao mesmo
          tempo — que é o estado de que se vem. Três destes blocos são
          componentes (`PainelEquipa`, `MemoReminders`, `MemoAgenda`) e não
          recebem `className`, portanto quem leva a classe é um invólucro.

          O invólucro está cá SEMPRE, aberta ou fechada, e é de propósito: uma
          camada que aparecesse ao abrir remontava o que está lá dentro, e o
          `PainelEquipa` guarda notas por gravar. O que muda entre fechada e
          aberta é só a classe e o `style` — nunca a identidade dos nós. */}
      <div className="mt-[var(--bo-gap-vista)] flex flex-col gap-[var(--bo-gap-vista)]">
        {Children.map(children, (bloco, ordem) => (
          <div {...gaveta.bloco(ordem)}>{bloco}</div>
        ))}
      </div>
    </details>
  );
}

export default function Overview({
  quotes,
  propostas,
  userName,
  onOpen,
  onGoStats,
  onGo,
  onNew,
  onQuoteAtualizado,
  falhaDeLeitura,
  aoTentarDeNovo,
  arquivados = 0,
  onVerArquivados,
}: Props) {
  /**
   * ── OS DOIS BLOCOS QUE ESPERAM POR SER VISTOS ────────────────────────────
   *
   * Os quatro blocos desta vista entram em cascata (`.bo-cena`). Os dois
   * primeiros estão sempre no ecrã; estes dois estão abaixo da dobra num
   * telemóvel, e faziam a sua entrada enquanto ninguém olhava — quando ela lá
   * chegava a rolar, já estava tudo parado.
   *
   * Passam a esperar pela chegada. A animação é a mesma; muda o instante. Ver
   * o `useEntradaAoChegar` para as três redes que garantem que o bloco aparece
   * mesmo que o gatilho falhe.
   */
  const chegadaDosNumeros = useEntradaAoChegar<HTMLDivElement>();
  const chegadaDaEspera = useEntradaAoChegar<HTMLDivElement>();

  /**
   * ── O QUE AQUI DENTRO AINDA LÊ O RELÓGIO, E PORQUE É QUE FICA ─────────────
   *
   * Este cálculo também usa a hora (o «hoje» dos eventos, os «14d parado», os
   * dias até ao próximo evento) e, ao contrário do `timeAgo` e da saudação, NÃO
   * passou para o {@link useRelogio}. A razão é a diferença de grão: aqui as
   * contas mudam de valor à MEIA-NOITE, não ao minuto, e o desencontro exige
   * que a fronteira do dia caia no segundo entre o desenho do servidor e a
   * hidratação — contra uma fronteira por minuto, que era o que dava «há 3min»
   * contra «há 2min» em 3 de 25 aberturas.
   *
   * E o preço de o adiar seria o ecrã: sem hora, este bloco não sabe contar
   * nada, e a Visão Geral chegaria em branco — que é precisamente o que o
   * desenho no servidor existe para evitar. O mesmo vale para o Reminders e
   * para a Agenda, que contam dias pela mesma régua.
   *
   * Fica anotado por ser uma decisão e não um descuido: se um dia estes números
   * passarem a mudar ao minuto, o caminho está aberto — é o mesmo `useRelogio`.
   */
  const data = useMemo(() => {
    const now = new Date();
    // "Hoje" e "daqui a uma semana" no calendário de quem está a olhar — as
    // datas dos eventos são dias locais, e comparar com o dia UTC dava
    // "Eventos hoje: 0" numa manhã em que havia um casamento.
    const hoje = todayKey();
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndKey = chaveLocal(weekEnd);
    const thisMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
    const lastMonthD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonthD.getFullYear()}-${lastMonthD.getMonth()}`;

    let thisMonth = 0,
      lastMonth = 0,
      pipeline = 0,
      won = 0,
      wonThisMonth = 0,
      wonLastMonth = 0,
      received = 0,
      outstanding = 0;
    let eventsToday = 0,
      eventsThisWeek = 0;
    const byStatus: Record<string, number> = {};
    const months = Array.from({ length: 6 }, () => 0);
    const porPedido = propostasPorPedido(propostas);
    const valorDe = (q: Quote) => valorDoPedido(q, porPedido.get(q.id)).comIva;

    for (const q of quotes) {
      byStatus[q.status] = (byStatus[q.status] ?? 0) + 1;
      /**
       * ── OS TRÊS NÚMEROS TÊM DE ESTAR NA MESMA UNIDADE ────────────────────
       *
       * «Ganho» e «Recebido» estão lado a lado na mesma fila, e estavam em
       * unidades diferentes: o Ganho somava `quotedPrice`, que é o campo
       * «Preço final (SEM IVA)» do ecrã, e o Recebido soma linhas de pagamento,
       * que são COM IVA. Um casamento integralmente pago mostrava Recebido 23%
       * acima do Ganho — o que se lê como um erro de contas, e ensina a não
       * confiar na fila inteira.
       *
       * A casa já tinha corrigido este mesmo erro duas vezes, e deixou as duas
       * escritas: em `Reminders.tsx` («os dois ramos NÃO estão na mesma
       * unidade») e em `PaymentsPanel.tsx» («deixava o "Em falta" errado em
       * ~23%»). Este era o ecrã que faltava — e é o primeiro que ela abre.
       *
       * ── E TÊM DE SER OS MESMOS DAS PROPOSTAS ─────────────────────────────
       * Pedido dela (14/10): «num sítio diz uma coisa noutro diz outra». A
       * conta passou a ser UMA, em `dinheiro-dos-pedidos.ts`, e é a das
       * Propostas, das Estatísticas, do Kanban e dos Clientes: manda o estado
       * que ela dá ao pedido; o valor é o preço final com a taxa da proposta
       * que seguiu (ou, sem preço, o total dela).
       */
      const contratado = valorDe(q);
      if (q.status === "cotado") pipeline += contratado;
      if (q.status === "aceite") won += contratado;
      for (const p of q.payments ?? []) {
        if (p.paid) received += p.amount;
        else outstanding += p.amount;
      }
      // «Evento» é a regra do cartão «Hoje» (`contaComoEvento`), e não
      // qualquer pedido com data: a frase dizia «Tem 1 evento hoje» por cima
      // de um cartão que dizia «Não há eventos», por causa de um pedido Novo.
      if (contaComoEvento(q)) {
        if (q.date === hoje) eventsToday++;
        if (q.date && q.date >= hoje && q.date <= weekEndKey) eventsThisWeek++;
      }

      const sd = new Date(q.submittedAt);
      const sKey = `${sd.getFullYear()}-${sd.getMonth()}`;
      if (sKey === thisMonthKey) thisMonth++;
      if (sKey === lastMonthKey) lastMonth++;
      const monthsBack =
        (now.getFullYear() - sd.getFullYear()) * 12 + now.getMonth() - sd.getMonth();
      if (monthsBack >= 0 && monthsBack < 6) months[5 - monthsBack]++;

      // Won revenue attributed to the month the deal was last touched (accepted).
      if (q.status === "aceite" && contratado > 0) {
        const wd = new Date(q.lastUpdated ?? q.submittedAt);
        const wKey = `${wd.getFullYear()}-${wd.getMonth()}`;
        if (wKey === thisMonthKey) wonThisMonth += contratado;
        if (wKey === lastMonthKey) wonLastMonth += contratado;
      }
    }

    // Dias contados entre DIAS (chaves «aaaa-mm-dd» ao meio-dia), e não entre
    // instantes: `floor((agora − instante)/dia)` mudava de valor à hora a que
    // cada pedido entrou, e não à meia-noite que o comentário de cima promete.
    const diasEntre = (de: string, ate: string) =>
      Math.round((Date.parse(`${ate}T12:00:00`) - Date.parse(`${de}T12:00:00`)) / 86400000);
    // Next upcoming confirmed event (accepted within next 90 days)
    const nextEvent =
      quotes
        .filter((q) => q.date && q.date >= hoje && (q.status === "aceite" || q.status === "cotado"))
        .sort((a, b) => a.date!.localeCompare(b.date!))[0] ?? null;
    const nextEventDays = nextEvent?.date ? diasEntre(hoje, nextEvent.date) : null;

    const needAction = quotes
      .filter((q) => {
        if (
          q.status !== "pendente" &&
          q.status !== "em_revisao" &&
          q.status !== "a_preparar" &&
          q.status !== "cotado"
        )
          return false;
        return true;
      })
      .map((q) => {
        const daysSince = diasEntre(chaveLocal(new Date(q.lastUpdated ?? q.submittedAt)), hoje);
        return { q, daysSince, isStale: daysSince >= 14 };
      })
      .sort((a, b) => {
        // Stale leads first, then by date
        if (a.isStale && !b.isStale) return -1;
        if (!a.isStale && b.isStale) return 1;
        return +new Date(b.q.submittedAt) - +new Date(a.q.submittedAt);
      });
    const staleCount = needAction.filter((x) => x.isStale).length;

    const recent = [...quotes]
      .sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt))
      .slice(0, 6);

    const accepted = byStatus["aceite"] ?? 0;
    const decided = accepted + (byStatus["rejeitado"] ?? 0);
    const conversion = decided > 0 ? Math.round((accepted / decided) * 100) : 0;
    /**
     * O denominador do valor médio é quem TEM preço, não quem foi ganho.
     *
     * `won` só soma os aceites com valor (`valorDe`); dividir pelo total
     * de aceites metia no denominador casamentos que não entraram no
     * numerador, e o «valor médio por evento ganho» saía sistematicamente
     * abaixo da verdade — mais abaixo quanto mais pedidos ganhos estivessem
     * por preencher, que é precisamente quando o número é mais consultado.
     */
    const acceptedComPreco = quotes.filter((q) => q.status === "aceite" && valorDe(q) > 0).length;
    const avgTicket = acceptedComPreco > 0 ? won / acceptedComPreco : 0;
    // `billed` é o total REGISTADO (recebido + a receber) das linhas de
    // pagamento — nunca leu o livro de facturas, nem quando ele existia. O nome
    // ficou da altura em que a casa facturava aqui; não é mostrado em lado
    // nenhum (serve só de denominador da barra), por isso mantém-se para não
    // mexer no que não mudou.
    const billed = received + outstanding;

    // Active pipeline = everything not yet won/lost. Pending review = the leads
    // still waiting on us to send a proposal (Novo + Aguardar resposta + A
    // preparar proposta — esta última ainda não seguiu, por isso ainda é nossa).
    const active =
      (byStatus["pendente"] ?? 0) +
      (byStatus["em_revisao"] ?? 0) +
      (byStatus["a_preparar"] ?? 0) +
      (byStatus["cotado"] ?? 0);
    const pendingReview =
      (byStatus["pendente"] ?? 0) + (byStatus["em_revisao"] ?? 0) + (byStatus["a_preparar"] ?? 0);

    /**
     * As propostas que seguiram e em que ninguém marcou nada há uma semana ou
     * mais. É a lista do dinheiro pendurado — ver `DIAS_ATE_PERGUNTAR` para o
     * porquê dos sete dias.
     */
    // Com IVA, como o quadrado «À espera» lá em cima: a lista mostrava o preço
    // SEM IVA ao lado de um total COM IVA, e as duas somas não batiam.
    const semResposta = aEsperaDeResposta(quotes, now).map((l) => ({
      ...l,
      valor: valorDe(l.quote),
    }));

    return {
      thisMonth,
      lastMonth,
      pipeline,
      semResposta,
      pendurado: totalPendurado(semResposta),
      won,
      wonThisMonth,
      wonLastMonth,
      received,
      outstanding,
      billed,
      eventsToday,
      eventsThisWeek,
      months,
      needAction,
      staleCount,
      nextEvent,
      nextEventDays,
      recent,
      conversion,
      avgTicket,
      active,
      pendingReview,
      total: quotes.length,
      byStatus,
      funnelMax: Math.max(1, ...FUNNEL.map((f) => byStatus[f.id] ?? 0)),
    };
  }, [quotes, propostas]);

  /**
   * ── A SAUDAÇÃO E A DATA TAMBÉM SÃO RELÓGIO ────────────────────────────────
   *
   * O mesmo padrão do `timeAgo`, e neste ficheiro havia mais dois: a hora, para
   * escolher entre «Bom dia» e «Boa tarde», e a data por extenso. Aqui o
   * desencontro não é sequer uma corrida de segundos — é SISTEMÁTICO: o servidor
   * corre em UTC e ela está em Portugal, que no Verão está uma hora à frente.
   * Entre as 12:00 e as 13:00 de Lisboa o servidor escrevia «Bom dia» e o
   * browser dizia «Boa tarde», TODOS OS DIAS; a data por extenso discordava da
   * meia-noite à uma da manhã.
   *
   * Enquanto não há relógio, saúda-se sem hora nenhuma — «Olá» é verdade a
   * qualquer hora — e a linha da data fica em branco. Uma e outra acertam-se no
   * instante em que a página hidrata.
   */
  const agora = useRelogio();
  const hour = agora === null ? null : new Date(agora).getHours();
  const greeting =
    hour === null ? "Olá" : hour < 12 ? "Bom dia" : hour < 20 ? "Boa tarde" : "Boa noite";

  // Smart headline: surface the most pressing things for today.
  const headline = (() => {
    const bits: string[] = [];
    if (data.eventsToday > 0)
      bits.push(`${data.eventsToday} evento${data.eventsToday !== 1 ? "s" : ""} hoje`);
    else if (data.eventsThisWeek > 0)
      bits.push(`${data.eventsThisWeek} evento${data.eventsThisWeek !== 1 ? "s" : ""} esta semana`);
    // «Por responder» é o MESMO número da barra de baixo (`A_ESPERAR_RESPOSTA`):
    // contavam-se aqui também as propostas enviadas, e a Visão Geral dizia 134
    // ao lado de uma barra que dizia 133. Uma proposta enviada está à espera
    // do cliente, não de nós — continua na lista de atenção, mas não na frase.
    const porResponder = data.needAction.filter((n) =>
      A_ESPERAR_RESPOSTA.includes(n.q.status),
    ).length;
    if (porResponder > 0)
      bits.push(`${porResponder} pedido${porResponder !== 1 ? "s" : ""} por responder`);
    // Minimalista: só fala quando há algo a pedir ação — sem frases de enchimento.
    if (bits.length === 0) return "";
    return `Tem ${bits.join(" e ")}.`;
  })();

  /**
   * ── DOIS ATALHOS, E NÃO QUATRO ────────────────────────────────────────────
   *
   * A análise dos dois sites de referência fecha em «no máximo dois CTA», e
   * aqui eram quatro: «Novo pedido», «Fases dos pedidos», «Calendário» e
   * «Tarefas». Num telemóvel de 390 px isso são DUAS FILAS inteiras de botões,
   * logo por baixo do cumprimento e por cima de tudo o resto — o primeiro
   * terço do ecrã de entrada gasto em navegação.
   *
   * Perguntei-lhe quais usa mesmo todos os dias, e a resposta foi «Novo pedido
   * e Fases dos pedidos». Os outros dois não desaparecem: o Calendário e as
   * Tarefas continuam no menu lateral e na barra de baixo, que é onde a
   * navegação vive. O que sai daqui é a DUPLICAÇÃO — dois destinos a ocupar o
   * lugar mais caro do produto para dizer o que o menu já diz.
   *
   * Não é uma escolha minha sobre o trabalho dela: é a escolha dela, e está
   * aqui escrita para o dia em que alguém quiser acrescentar um quinto.
   */
  const quickActions: { label: string; onClick: () => void; icon: React.ReactNode }[] = [
    {
      label: "Novo pedido",
      onClick: onNew,
      icon: <path d="M12 5v14M5 12h14" strokeLinecap="round" />,
    },
    {
      label: "Fases dos pedidos",
      onClick: () => onGo("kanban"),
      icon: (
        <>
          <rect x="3" y="4" width="4" height="16" rx="1" />
          <rect x="10" y="4" width="4" height="11" rx="1" />
          <rect x="17" y="4" width="4" height="7" rx="1" />
        </>
      ),
    },
  ];

  const dateLabel =
    agora === null
      ? // Espaço INQUEBRÁVEL e não um espaço normal: um espaço normal colapsa e
        // a linha ficaria com altura zero até hidratar — a página assentava com
        // um salto. Este guarda o lugar exacto que a data vai ocupar.
        " "
      : new Date(agora).toLocaleDateString("pt-PT", {
          weekday: "long",
          day: "numeric",
          month: "long",
        });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O ECRÃ DE BOAS-VINDAS É UMA AFIRMAÇÃO — E HAVIA DUAS MANEIRAS DE SER FALSA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * «Ainda sem pedidos por aqui. Este é o teu ponto de partida.» é a primeira
   * coisa que se lê ao abrir o back office, e diz duas coisas de uma vez: que a
   * lista está vazia, e que está vazia porque nunca houve nada. A segunda
   * metade estava a ser inventada em dois casos:
   *
   *   · a leitura dos pedidos não voltou (a base de dados em baixo, ou — o
   *     caso comum — a sessão a caducar num separador aberto desde a manhã).
   *     Aí não se sabe se há pedidos: não se chegou a perguntar. Ver
   *     `src/lib/porque-nao-leu.ts`;
   *   · está tudo ARQUIVADO. Esta vista recebe só os activos, e um estúdio que
   *     acabou a época e arrumou tudo lia exactamente o mesmo que uma
   *     instalação nova.
   *
   * Nos dois casos o vazio continua a ser um vazio — não se transforma num
   * alarme —, o que muda é dizer o PORQUÊ certo e dar o passo que resolve
   * aquele porquê, e não outro.
   */
  if (quotes.length === 0) {
    const tudoArquivado = arquivados > 0;
    return (
      <div className="flex flex-col gap-[var(--bo-gap-vista)]">
        <div>
          <p className="text-foreground/30 text-[10px] tracking-[0.4em] uppercase mb-2">
            {dateLabel}
          </p>
          <h2
            className="text-foreground font-normal"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(26px, 3.5vw, 40px)",
              letterSpacing: "var(--bo-tracking-display)",
            }}
          >
            {greeting}, {userName}.
          </h2>
        </div>
        {falhaDeLeitura ? (
          <AvisoDeFalha
            titulo="Não foi possível ler os pedidos"
            falha={falhaDeLeitura}
            aoTentarDeNovo={aoTentarDeNovo}
          />
        ) : (
          <div className="bo-card p-[var(--bo-p-vazio)] sm:p-12 text-center flex flex-col items-center">
            <span
              className="flex items-center justify-center w-14 h-14 rounded-2xl mb-3.5 sm:mb-5 bg-sage-600/[0.08] text-sage-600"
              aria-hidden="true"
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </span>
            <h3
              className="text-[var(--bo-text)] font-medium text-base sm:text-xl mb-2"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {tudoArquivado ? "Está tudo arquivado." : "Ainda sem pedidos por aqui."}
            </h3>
            <p className="text-foreground/45 text-sm max-w-sm leading-relaxed mb-6">
              {tudoArquivado
                ? `Não há nenhum pedido activo. ${
                    arquivados === 1
                      ? "O único que existe está arquivado"
                      : `Os ${arquivados} que existem estão arquivados`
                  }, e os arquivados não contam para nada do que se vê aqui — por isso a Visão Geral está assim.`
                : "Este é o teu ponto de partida. Assim que registares o primeiro pedido, a Visão Geral enche-se de vida — eventos, propostas e receita, tudo num só olhar."}
            </p>
            {/* A acção DENTRO do vazio, e a que resolve este vazio: com tudo
              arquivado o primeiro passo não é criar mais um pedido, é ir ver os
              que já existem. */}
            {tudoArquivado && onVerArquivados && (
              <button
                onClick={onVerArquivados}
                /* `alvo-toque` (globals.css) porque este botão é escrito à
                   mão e não passa pelo `ui/Button.tsx`, que é onde vive o piso
                   de 44 px do dedo: media 37 px de altura, e é o único caminho
                   para sair de um ecrã que não tem mais nada. Só cresce com
                   dedo — com rato fica exactamente como está desenhado. */
                className={`alvo-toque inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[10px] tracking-[0.15em] uppercase font-medium bg-[var(--bo-seleccao)] text-[var(--bo-sobre-seleccao)] hover:bg-[var(--bo-seleccao-hover)] ${ESTADO} ${PRESSAO} mb-3 ${FOCUS_RING}`}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                >
                  <path d="M3 7h18v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7ZM2 3h20v4H2z" />
                </svg>
                Ver os {arquivados} arquivados
              </button>
            )}
            <button
              onClick={onNew}
              /* `alvo-toque` pela mesma razão do botão acima — e para os dois
                 ficarem da mesma altura quando aparecem juntos. */
              className={`alvo-toque inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] tracking-[0.15em] uppercase font-medium ${ESTADO} ${PRESSAO} ${
                tudoArquivado && onVerArquivados
                  ? "bg-[var(--bo-surface)] border border-[var(--bo-hairline)] text-[var(--bo-text-muted)] hover:text-[var(--bo-text)] hover:border-[var(--bo-hairline-strong)]"
                  : "bg-[var(--bo-seleccao)] text-[var(--bo-sobre-seleccao)] hover:bg-[var(--bo-seleccao-hover)]"
              } ${FOCUS_RING}`}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              >
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              {tudoArquivado && onVerArquivados ? "Criar um pedido" : "Criar o primeiro pedido"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    // O espaço entre os blocos de topo é o token da escala (`globals.css`):
    // 20 px abaixo de 640, 28 a partir daí — o valor que esta vista já tinha.
    <div className="flex flex-col gap-[var(--bo-gap-vista)]">
      {/* ══════════════════════════════════════════════════════════════════
          A ENTRADA: QUATRO BLOCOS, E O RESTO ATRÁS DE UM TOQUE
          ══════════════════════════════════════════════════════════════════

          Palavras dela, a olhar para o deploy verdadeiro: «o back office está
          com a mesma estrutura, não me diz nada — eu gostava mesmo de o levar
          ao nível da Apple e da Pixelmatters».

          O que faltava não era superfície. Esta vista tinha TREZE blocos
          empilhados, todos visíveis ao mesmo tempo. A apple.com mostra seis, e
          cada um ocupa um ecrã inteiro. Nenhuma afinação de cor ou de raio
          salva uma página que diz treze coisas de uma vez.

          Ficam QUATRO à vista, e são os que respondem à pergunta de quem abre
          isto de manhã — «o que é que me espera?»:

            1. quem é ela e o que pode fazer já;
            2. o próximo evento;
            3. o dinheiro;
            4. quem está à espera de resposta.

          Os outros nove NÃO foram apagados: passam para dentro do `<details>`
          lá em baixo, que diz pelo nome o que lá tem. É reversível — uma
          decisão de composição, não de dados.
      */}

      {/* Greeting + quick actions */}
      <div
        style={{ "--cena": 0 } as React.CSSProperties}
        className="bo-cena flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5"
      >
        <div>
          <p className="text-foreground/30 text-[10px] tracking-[0.4em] uppercase mb-2">
            {dateLabel}
          </p>
          <h2
            className="text-foreground font-normal"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(26px, 3.5vw, 40px)",
              letterSpacing: "var(--bo-tracking-display)",
            }}
          >
            {greeting}, {userName}.
          </h2>
          {headline && <p className="text-foreground/40 text-sm mt-2">{headline}</p>}
        </div>
        {/* GRELHA DE DUAS COLUNAS, e não `flex-wrap`.
            A 390 px os quatro atalhos quebravam 2+2 mas com a largura de cada
            rótulo: «Novo pedido» ficava curto ao lado de «Fases dos pedidos», e
            a coluna da direita saía irregular — o desalinho que se vê primeiro
            num telemóvel, antes sequer de se ler o que lá está. Numa grelha as
            duas colunas têm a mesma largura, e deixa de depender do
            comprimento das palavras. No computador (`lg:`) volta a ser a fila
            que era, encostada à direita do cumprimento. */}
        <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap">
          {quickActions.map((a, i) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className={`alvo-toque flex items-center justify-center lg:justify-start gap-2 px-3.5 py-2 rounded-xl text-[13px] lg:text-[10px] tracking-[0.12em] uppercase font-medium ${ESTADO} ${PRESSAO} ${FOCUS_RING} ${
                i === 0
                  ? "bg-[var(--bo-seleccao)] text-[var(--bo-sobre-seleccao)] hover:bg-[var(--bo-seleccao-hover)] "
                  : "bg-[var(--bo-surface)] border border-[var(--bo-hairline)] text-[var(--bo-text-muted)] hover:text-[var(--bo-text)] hover:border-[var(--bo-hairline-strong)] "
              }`}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              >
                {a.icon}
              </svg>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── HOJE (10/11) ─────────────────────────────────────────────────
          O que precisa dela hoje, num sítio só e logo à entrada — ver
          `Hoje.tsx` e `lib/orcamento/hoje.ts`. Não pede nada à rede. */}
      <Hoje quotes={quotes} propostas={propostas ?? []} onOpen={onOpen} onGo={onGo} />

      {/* Próximo evento em destaque */}
      {data.nextEvent && data.nextEventDays !== null && data.nextEventDays <= 30 && (
        <button
          onClick={() => onOpen(data.nextEvent!)}
          style={{ "--cena": 1 } as React.CSSProperties}
          className={`bo-cena w-full text-left rounded-2xl p-5 border ${ESTADO} ${PRESSAO} ${FOCUS_RING} ${
            data.nextEventDays <= 3
              ? "bg-[var(--bo-perigo)]/[0.07] border-[var(--bo-perigo)]/25 hover:border-[var(--bo-perigo)]/40"
              : data.nextEventDays <= 7
                ? "bg-amber-500/[0.05] border-amber-500/20 hover:border-amber-500/35"
                : "bg-sage-600/[0.05] border-sage-600/20 hover:border-sage-600/35"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p
                className="text-[10px] tracking-[0.25em] uppercase font-medium mb-1.5"
                style={{
                  color: tintaDoRotulo(
                    data.nextEventDays <= 3
                      ? "#8a2a22"
                      : data.nextEventDays <= 7
                        ? "#b5894a"
                        : "#4c6752",
                  ),
                }}
              >
                {data.nextEventDays === 0
                  ? "Evento hoje"
                  : data.nextEventDays === 1
                    ? "Evento amanhã"
                    : `Próximo evento · faltam ${data.nextEventDays} dias`}
              </p>
              <h3
                className="text-[var(--bo-text)] font-medium text-lg leading-tight truncate"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {data.nextEvent.name}
              </h3>
              <p className="text-foreground/40 text-sm mt-1">
                {new Date(data.nextEvent.date! + "T12:00:00").toLocaleDateString("pt-PT", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
                {data.nextEvent.location ? ` · ${data.nextEvent.location}` : ""}
                {data.nextEvent.guests ? ` · ${data.nextEvent.guests} convidados` : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p
                className="text-2xl sm:text-3xl font-light tabular-nums"
                style={{
                  color: tintaDoRotulo(
                    data.nextEventDays <= 3
                      ? "#8a2a22"
                      : data.nextEventDays <= 7
                        ? "#b5894a"
                        : "#4c6752",
                  ),
                }}
              >
                {data.nextEventDays === 0 ? "hoje" : `${data.nextEventDays}d`}
              </p>
              <p className="text-foreground/25 text-[10px] tracking-[0.15em] uppercase mt-0.5">
                {metaFor(STATUS_META, data.nextEvent.status).label}
              </p>
            </div>
          </div>
        </button>
      )}

      {/**
       * ══════════════════════════════════════════════════════════════════════
       * OS TRÊS NÚMEROS, E O QUE CADA UM CONTA
       * ══════════════════════════════════════════════════════════════════════
       *
       * Palavras dela: «Não dá para perceber qual é o dinheiro que ganhamos.»
       * Os três já existiam — estavam perdidos numa fila de cinco cartões, com
       * rótulos («Valor em propostas», «Receita ganha») que descrevem uma
       * coluna de base de dados e não uma pergunta. E a linha de apoio que este
       * ficheiro já calculava, o `hint`, NUNCA CHEGAVA AO ECRÃ: só ia parar ao
       * `aria-label`. Quem lê com os olhos nunca a viu.
       *
       * Agora são três, grandes, com a frase por baixo em letra pequena. Um
       * número em que ela não confia vale zero, e ela disse-me que não percebia
       * estes.
       *
       * ── OS RÓTULOS MUDARAM, OS NÚMEROS NÃO ───────────────────────────────
       * «Receita ganha» → «Ganho» e «Valor em propostas» → «À espera» são a
       * MESMA conta, com o nome que ela usa a falar. A regra da casa (ver o que
       * se fez ontem ao tirar as facturas) é não mudar o significado de um
       * número sem mudar o rótulo; mudar só o rótulo, mantendo a conta, é o que
       * aqui se faz — e a frase por baixo diz exactamente qual é a conta.
       */}
      {/**
       * ── E A FORMA DISTO NUM TELEMÓVEL ────────────────────────────────────
       *
       * Medido a 390×844: cada um destes era um cartão de 358×109 px, os três
       * empilhados de 319 a 670. Trezentos e cinquenta e um píxeis — 42% do
       * ecrã — para três números. Palavras dela: «para mobile nada está
       * adequado». Um número de dinheiro não precisa de um cartão inteiro.
       *
       * Abaixo de 640 os três passam a viver DENTRO DA MESMA CAIXA, uma linha
       * cada, separados por um risco: o rótulo e a frase à esquerda, o número
       * à direita, onde o olho já o vai buscar numa fila de valores. A moldura
       * sobe para o grupo (`border`+`divide-y`) e sai de cada botão — três
       * caixas com ar entre elas gastam três vezes a mesma margem.
       *
       * A partir de 640 nada disto se aplica: volta a grelha de três cartões,
       * exactamente como estava. É diferença só de ESTILO, portanto é CSS e
       * não um hook — a regra do `ADAPTIVE-PRIMITIVES.md`.
       *
       * O que NÃO muda é a frase por baixo de cada número. É a razão de ela
       * poder confiar nos valores; encolher o bloco à custa dela seria trocar
       * este problema pelo pior.
       */}
      {/**
       * ── UM NÚMERO MANDA, OS OUTROS CINCO ACOMPANHAM ──────────────────────
       *
       * A análise dos dois sites de referência traz esta regra como padrão 08:
       * «no máximo dois CTA» — e, no ecrã de entrada, um só número herói. Aqui
       * eram SEIS números com o mesmo peso: os três de dinheiro todos a
       * `clamp(24px, 3vw, 34px)`, e os três de trabalho logo por baixo a
       * `clamp(18px, 2.2vw, 26px)`. Entre 34 e 26 não há hierarquia nenhuma —
       * há seis coisas a pedir a mesma atenção, que é o mesmo que nenhuma
       * pedir. Palavras dela, na altura em que estes três nasceram: «Não dá
       * para perceber qual é o dinheiro que ganhamos.» Dar-lhes nomes que ela
       * usa resolveu METADE do problema; a outra metade é de tamanho.
       *
       * Três degraus, e não seis iguais:
       *
       *     GANHO        clamp(32px, 4.6vw, 48px)   o número da pergunta
       *     à espera     clamp(20px, 2.4vw, 26px)   o mesmo dinheiro, por decidir
       *     recebido     clamp(20px, 2.4vw, 26px)
       *     contadores   clamp(18px, 1.9vw, 22px)   quantos, não quanto
       *
       * A 1024 o herói fica 1,85× maior do que os dois ao lado; a 390, 1,6×.
       * Abaixo de 1,5× o olho lê «dois tamanhos parecidos» em vez de «este
       * primeiro»; acima de 2× num telemóvel o número de seis dígitos com o
       * separador de milhares começa a partir a linha.
       *
       * A coluna do herói também é mais larga (`1.4fr` contra `1fr`) a partir
       * de 640. Não é enfeite: a 48 px, «13.257,85 €» precisa de mais largura
       * do que «0 €», e uma célula que se ajusta ao maior conteúdo é a única
       * que nunca quebra em duas linhas.
       *
       * Os contadores DESCEM (26 → 22). Se só o herói subisse, os cinco de
       * baixo continuavam empatados entre si — o padrão pede uma FILA
       * secundária, não um pódio com cinco segundos lugares. E são contagens
       * de um ou dois algarismos: 22 px chega-lhes de sobra.
       *
       * Nada disto mexe numa conta, num rótulo ou numa frase de apoio. É só
       * tamanho — o que muda é para onde o olho vai primeiro ao abrir o painel.
       */}
      <div
        role="group"
        aria-label="Dinheiro — ganho, à espera e recebido"
        /* A cascata entra no GRUPO e não em cada número. Medido no browser,
           com dados verdadeiros, antes desta correcção: o `--cena` saía
           `0, 2, 2, 2, 3` — o `2` três vezes, porque a classe tinha caído
           DENTRO do `.map()` dos três valores. Os três cartões animavam-se
           cada um por si e o bloco a que pertencem não se animava de todo.
           Uma cascata de blocos que anima filhos não é uma cascata: é um
           tremor. */
        ref={chegadaDosNumeros}
        style={{ "--cena": 2 } as React.CSSProperties}
        className="bo-cena flex flex-col divide-y divide-[var(--bo-hairline)] rounded-2xl border border-[var(--bo-hairline)] bg-[var(--bo-surface)] sm:grid sm:grid-cols-[1.4fr_1fr_1fr] sm:gap-3 sm:divide-y-0 sm:rounded-none sm:border-0 sm:bg-transparent"
      >
        {[
          {
            v: eur(data.won),
            l: "Ganho",
            hint: "propostas que marcaste como ganhas, ao valor confirmado com IVA",
            delta: { now: data.wonThisMonth, prev: data.wonLastMonth },
            cor: "#3a5c39",
            tamanho: "clamp(32px, 4.6vw, 48px)",
            go: onGoStats,
          },
          {
            v: eur(data.pipeline),
            l: "À espera",
            hint: "propostas enviadas, ainda sem resposta marcada, com IVA",
            cor: "#7c854b",
            tamanho: "clamp(20px, 2.4vw, 26px)",
            go: () => onGo("kanban"),
          },
          {
            v: eur(data.received),
            l: "Recebido",
            hint: "pagamentos que já estão dados como recebidos",
            cor: "#4c6752",
            tamanho: "clamp(20px, 2.4vw, 26px)",
            go: onGoStats,
          },
        ].map((k) => (
          <button
            key={k.l}
            onClick={k.go}
            aria-label={`${k.l}: ${k.v} — ${k.hint}. Abrir.`}
            /* `flex-wrap` + `order`: no telemóvel a linha lê-se «rótulo …
               número» e a frase passa por baixo, a toda a largura (`w-full`).
               A partir de 640 tudo volta a `block`, e a ordem do DOM — número,
               rótulo, frase — é a que se vê. A ordem do DOM não muda em lado
               nenhum, portanto quem ouve a página ouve sempre o mesmo. */
            className={`foco-largo flex flex-wrap items-baseline gap-x-3 p-4 text-left ${ESTADO} ${PRESSAO} sm:block sm:rounded-2xl sm:p-5 sm:border sm:bg-[var(--bo-surface)] sm:border-[var(--bo-hairline)] sm:hover:border-[var(--bo-hairline-strong)] ${FOCUS_RING}`}
          >
            <div className="order-2 ml-auto flex items-start gap-2 sm:order-none sm:ml-0 sm:w-full sm:justify-between">
              <p
                className="font-light leading-none"
                style={{
                  fontSize: k.tamanho,
                  // No escuro, o mesmo tom mais claro — achado n.º 14.
                  color: tintaDoRotulo(k.cor),
                }}
              >
                {k.v}
              </p>
              {k.delta && <Delta now={k.delta.now} prev={k.delta.prev} />}
            </div>
            {/* O rótulo era `text-[10px]` com 0.25em de espacejamento: o chão
                do telemóvel levanta-o a 12, mas num rótulo que agora ENCABEÇA
                a linha isso ainda é pouco. 15 px (o degrau `body` da casa) é o
                que o faz ler-se como nome do número e não como legenda. */}
            {/* O tamanho troca em `lg:`, NÃO em `sm:`, e isso é deliberado.
                O layout muda aos 640 (a linha vira cartão), mas o rótulo
                miudinho em maiúsculas só faz sentido onde a interface é densa
                de rato — 1024, a mesma linha em que o chão da letra acaba e a
                tabela começa. Com o corte em `sm:` havia uma FRESTA entre 640 e
                1023 onde o `sm:text-[10px]` voltava a pintar por baixo do chão:
                medido num iPad a 768, eram estes três rótulos outra vez a 10 px. */}
            <p className="order-1 text-[15px] font-semibold text-[var(--bo-text)] sm:mt-2 lg:text-[10px] lg:tracking-[0.25em] lg:uppercase">
              {k.l}
            </p>
            {/* A LETRA PEQUENA QUE FALTAVA. Não é decoração: é a diferença
                entre um número e um número em que se confia.
                O cinzento passou de `text-foreground/45` (~3.8:1 sobre branco,
                abaixo de AA) para o degrau auditado `--bo-text-muted`
                (~5.6:1) — é este o «cinzento-azeitona pequeno» que ela disse
                não conseguir ler. */}
            <p className="order-3 mt-1 w-full text-[12px] leading-snug bo-text-muted sm:w-auto">
              {k.hint}
            </p>
          </button>
        ))}
      </div>

      <div ref={chegadaDaEspera} style={{ "--cena": 3 } as React.CSSProperties} className="bo-cena">
        <AEsperaDeResposta
          linhas={data.semResposta}
          pendurado={data.pendurado}
          userName={userName}
          onOpen={onOpen}
          onQuoteAtualizado={onQuoteAtualizado}
        />
      </div>

      <MaisDoPainel>
        {/* Os contadores de trabalho — quantos, e não quanto. Ficam por baixo dos
            três de dinheiro, e trazem agora a mesma linha de apoio à vista.
            Mesma forma dos três de cima no telemóvel, e de propósito: são duas
            leituras — «o dinheiro» e «o trabalho» — e duas caixas dizem isso
            melhor do que seis cartões todos iguais empilhados. Os números são
            contagens curtas, portanto as linhas ficam ainda mais baixas. */}
        <div className="flex flex-col divide-y divide-[var(--bo-hairline)] rounded-2xl border border-[var(--bo-hairline)] bg-[var(--bo-surface)] sm:grid sm:grid-cols-3 sm:gap-3 sm:divide-y-0 sm:rounded-none sm:border-0 sm:bg-transparent">
          {[
            {
              v: String(data.active),
              l: "Pedidos ativos",
              hint: "ainda em aberto, seja em que fase for",
              go: () => onGo("pedidos"),
            },
            {
              v: String(data.pendingReview),
              l: "Por responder",
              hint: "esperam uma proposta nossa",
              go: () => onGo("pedidos"),
            },
            {
              v: String(data.eventsThisWeek),
              l: "Próximos 7 dias",
              hint: "eventos já agendados",
              go: () => onGo("calendario"),
            },
          ].map((k) => (
            <button
              key={k.l}
              onClick={k.go}
              aria-label={`${k.l}: ${k.v} — ${k.hint}. Abrir.`}
              className={`flex flex-wrap items-baseline gap-x-3 p-4 text-left ${ESTADO} ${PRESSAO} sm:block sm:rounded-xl sm:border sm:bg-[var(--bo-surface)] sm:border-[var(--bo-hairline)] sm:hover:border-[var(--bo-hairline-strong)] ${FOCUS_RING}`}
            >
              <p
                className="order-2 ml-auto font-light leading-none text-[var(--bo-text)] sm:order-none sm:ml-0"
                style={{ fontSize: "clamp(18px, 1.9vw, 22px)" }}
              >
                {k.v}
              </p>
              {/* Era `text-[9px]` no tom `faint` — o degrau que o próprio
                  `globals.css` marca como «decorativo, nunca o único portador de
                  informação». Só que ERA o único: sem ele o número é um algarismo
                  solto. Passa a 15 px no tom de texto a sério. */}
              {/* `lg:` e não `sm:`, pela mesma razão do bloco de cima: entre 640
                  e 1023 o `sm:text-[9px]` reabria a fresta por baixo do chão. */}
              <p className="order-1 text-[15px] font-semibold text-[var(--bo-text)] sm:mt-2 lg:text-[9px] lg:font-medium lg:tracking-[0.25em] lg:uppercase lg:text-[var(--bo-text-faint)]">
                {k.l}
              </p>
              <p className="order-3 mt-1 w-full text-[12px] leading-snug bo-text-muted sm:w-auto">
                {k.hint}
              </p>
            </button>
          ))}
        </div>

        <PainelEquipa wonThisMonth={data.wonThisMonth} />

        {/* Reminders — derived urgent items */}
        <MemoReminders quotes={quotes} onOpen={onOpen} />

        {/* Agenda — events, calendar entries, tasks & payments due */}
        <MemoAgenda quotes={quotes} onOpen={onOpen} />

        {/* Pipeline funnel + financial pulse */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Funnel */}
          <div className="bo-card p-[var(--bo-p-cartao)]">
            <div className="flex items-center justify-between mb-3.5 sm:mb-5">
              <h3 className="bo-eyebrow">Fases dos pedidos</h3>
              <button
                onClick={() => onGo("kanban")}
                className={`alvo-toque text-sage-600 hover:text-[var(--bo-accent-hover)] text-[10px] tracking-[0.15em] uppercase ${ESTADO} ${PRESSAO} rounded ${FOCUS_RING}`}
              >
                Abrir →
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {FUNNEL.map((f) => {
                const count = data.byStatus[f.id] ?? 0;
                return (
                  <div key={f.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="flex items-center gap-2 text-[var(--bo-text-muted)] text-xs">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: STATUS_META[f.id].color }}
                        />
                        {f.label}
                      </span>
                      <span className="text-foreground/40 text-[11px] tabular-nums">{count}</span>
                    </div>
                    <div className="h-1.5 bg-[var(--bo-tinta-6)] rounded-full overflow-hidden">
                      <div
                        className={`h-full w-full origin-left rounded-full ${PROGRESSO}`}
                        style={{
                          transform: `scaleX(${fraccaoDaBarra(count, data.funnelMax)})`,
                          background: STATUS_META[f.id].color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-3.5 pt-3.5 sm:mt-5 sm:pt-4 border-t border-[var(--bo-hairline)]">
              <span className="text-foreground/35 text-xs">
                Pedidos que acabam em evento
                <span className="block text-foreground/25 text-[10px]">
                  de cada 100 decididos, quantos ganhou
                </span>
              </span>
              <span className="text-[var(--bo-tinta-72)] text-sm font-semibold tabular-nums">
                {data.conversion}%
              </span>
            </div>
          </div>

          {/* Financial pulse */}
          <div className="bo-card p-[var(--bo-p-cartao)]">
            <div className="flex items-center justify-between mb-3.5 sm:mb-5">
              <h3 className="bo-eyebrow">Dinheiro — recebido e a receber</h3>
              <button
                onClick={onGoStats}
                className={`alvo-toque text-sage-600 hover:text-[var(--bo-accent-hover)] text-[10px] tracking-[0.15em] uppercase ${ESTADO} ${PRESSAO} rounded ${FOCUS_RING}`}
              >
                Ver tudo →
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3.5 sm:mb-5">
              <div>
                <p
                  className="text-sage-600 font-light leading-none mb-1"
                  style={{ fontSize: "clamp(18px, 2vw, 24px)" }}
                >
                  {eur(data.received)}
                </p>
                <p className="text-foreground/30 text-[9px] tracking-[0.2em] uppercase">Recebido</p>
              </div>
              <div>
                <p
                  className="text-[var(--bo-tinta-72)] font-light leading-none mb-1"
                  style={{ fontSize: "clamp(18px, 2vw, 24px)" }}
                >
                  {eur(data.outstanding)}
                </p>
                <p className="text-foreground/30 text-[9px] tracking-[0.2em] uppercase">
                  A receber
                </p>
              </div>
            </div>
            {data.billed > 0 ? (
              <>
                <div className="relative h-2 rounded-full overflow-hidden bg-[var(--bo-tinta-6)]">
                  <div
                    className={`absolute inset-0 origin-left bg-sage-600 ${PROGRESSO}`}
                    style={{ transform: `scaleX(${fraccaoDaBarra(data.received, data.billed)})` }}
                  />
                  <div
                    className={`absolute inset-0 origin-left bg-[var(--bo-aviso-tom)]/70 ${PROGRESSO}`}
                    style={{
                      transform: `translateX(${fraccaoDaBarra(data.received, data.billed) * 100}%) scaleX(${fraccaoDaBarra(data.outstanding, data.billed)})`,
                    }}
                  />
                </div>
                <div className="flex items-center gap-4 mt-2.5 text-[10px] text-foreground/40">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sage-600" /> Recebido
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[var(--bo-aviso-tom)]/70" /> Por
                    receber
                  </span>
                </div>
              </>
            ) : (
              <p className="text-foreground/40 text-xs leading-relaxed">
                Ainda sem pagamentos registados. Assim que registar o primeiro, o recebido e o que
                falta receber aparecem aqui.
              </p>
            )}
            <div className="flex items-center justify-between mt-3.5 pt-3.5 sm:mt-5 sm:pt-4 border-t border-[var(--bo-hairline)]">
              <span className="text-foreground/35 text-xs">
                Valor médio por evento ganho
                <span className="block text-foreground/25 text-[10px]">
                  quanto vale, em média, cada pedido fechado
                </span>
              </span>
              <span className="text-[var(--bo-tinta-72)] text-sm font-semibold tabular-nums">
                {eur(data.avgTicket)}
              </span>
            </div>
          </div>
        </div>

        {/* Needs attention + recent activity */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
          <div className="bo-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--bo-hairline)]">
              <h3 className="bo-eyebrow">Precisam de atenção</h3>
              <div className="flex items-center gap-2">
                {data.staleCount > 0 && (
                  <span className="text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-semibold">
                    {data.staleCount} parado{data.staleCount !== 1 ? "s" : ""}
                  </span>
                )}
                {data.needAction.length > 0 && (
                  <span className="text-[10px] tabular-nums bg-sage-600/10 text-sage-600 rounded-full px-2 py-0.5">
                    {data.needAction.length}
                  </span>
                )}
              </div>
            </div>
            <div className="divide-y divide-[var(--bo-hairline)] max-h-[360px] overflow-y-auto">
              {data.needAction.length === 0 && (
                <div className="text-center py-[var(--bo-p-vazio)] px-[var(--bo-p-cartao)] sm:py-12">
                  <p className="text-sage-600 text-sm font-medium">Tudo tratado.</p>
                  <p className="text-foreground/35 text-xs mt-1.5 leading-relaxed">
                    Não há pedidos à tua espera. Bom trabalho — aproveita para preparar os próximos
                    eventos.
                  </p>
                </div>
              )}
              {data.needAction.slice(0, 8).map(({ q, daysSince, isStale }) => (
                <button
                  key={q.id}
                  onClick={() => onOpen(q)}
                  className={`w-full text-left px-5 py-3.5 hover:bg-[var(--bo-tinta-3)] ${ESTADO} ${PRESSAO} flex items-center justify-between gap-3 ${FOCUS_RING} focus-visible:ring-inset`}
                >
                  <div className="min-w-0">
                    <p className="text-[var(--bo-tinta-72)] text-sm truncate font-medium">
                      {q.name}
                    </p>
                    <p className="text-foreground/30 text-xs truncate mt-0.5">
                      {eventTypeLabel(q)} · {q.guests} convidados
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {isStale ? (
                      <span className="inline-flex items-center gap-1 text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 font-semibold">
                        {daysSince}d parado
                      </span>
                    ) : (
                      <span
                        className="text-[9px] tracking-[0.12em] uppercase px-2 py-0.5 rounded-md"
                        style={{
                          background: `${metaFor(STATUS_META, q.status).color}18`,
                          // A cor de ESCREVER, não a de preencher: medido 3,16:1 antes.
                          color: tintaDoRotulo(metaFor(STATUS_META, q.status).color),
                        }}
                      >
                        {metaFor(STATUS_META, q.status).label}
                      </span>
                    )}
                    <TempoDesde
                      iso={q.submittedAt}
                      className="text-[var(--bo-text-faint)] text-[10px] mt-1 block"
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="bo-card overflow-hidden">
            <h3 className="bo-eyebrow px-5 py-4 border-b border-[var(--bo-hairline)]">
              Atividade recente
            </h3>
            <div className="divide-y divide-[var(--bo-hairline)]">
              {data.recent.map((q) => (
                <button
                  key={q.id}
                  onClick={() => onOpen(q)}
                  className={`alvo-toque !justify-between w-full text-left px-5 py-3 hover:bg-[var(--bo-tinta-3)] ${ESTADO} ${PRESSAO} flex items-center justify-between gap-3 ${FOCUS_RING} focus-visible:ring-inset`}
                >
                  <span className="text-[var(--bo-text-muted)] text-xs truncate font-medium">
                    {q.name}
                  </span>
                  <TempoDesde
                    iso={q.submittedAt}
                    className="text-foreground/30 text-[10px] shrink-0"
                  />
                </button>
              ))}
              {/* ── «AINDA SEM MOVIMENTOS POR AQUI.» ─────────────────────────
                  Cinco palavras que não diziam nem o que é este painel, nem
                  porque é que está vazio, nem o que fazer a seguir. Uma frase
                  dessas, num canto de um ecrã cheio, lê-se como uma parte da
                  página que não carregou.

                  Passa a dizer as três coisas — o que a lista mostra, porque é
                  que não tem nada, e o passo a dar — sem virar alarme: uma
                  atividade recente vazia é o estado normal de quem ainda não
                  recebeu o primeiro pedido.

                  NOTA para quem vier a seguir: hoje isto está fora de alcance.
                  Esta lista são os `quotes` ordenados por data, e um `quotes`
                  vazio é apanhado lá em cima pelo ecrã de boas-vindas, que
                  devolve antes de se chegar aqui. Fica escrito na mesma, porque
                  o dia em que a Visão Geral deixar de ter esse atalho — ou em que
                  a lista passar a ter janela — este é o texto certo. */}
              {data.recent.length === 0 && (
                <div className="text-center py-[var(--bo-p-vazio)] px-[var(--bo-p-cartao)] sm:py-10">
                  <p className="text-foreground/45 text-sm">Ainda sem movimentos por aqui.</p>
                  <p className="text-foreground/30 text-xs mt-1.5 leading-relaxed">
                    Esta lista são os últimos pedidos que entraram, do mais recente para trás.
                    Enquanto não entrar nenhum — pelo formulário do site ou criado à mão — fica
                    assim.
                  </p>
                  <button
                    onClick={onNew}
                    className={`alvo-toque mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] tracking-[0.15em] uppercase font-medium bg-[var(--bo-surface)] border border-[var(--bo-hairline)] text-[var(--bo-text-muted)] hover:text-[var(--bo-text)] hover:border-[var(--bo-hairline-strong)] ${ESTADO} ${PRESSAO} ${FOCUS_RING}`}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      aria-hidden="true"
                    >
                      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                    </svg>
                    Criar um pedido
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </MaisDoPainel>
    </div>
  );
}
