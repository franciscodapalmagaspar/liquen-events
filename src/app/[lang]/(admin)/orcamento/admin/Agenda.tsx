"use client";

import { useCallback, useMemo } from "react";
import type { Quote, CalendarEvent, Task } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import { eur0 as eur } from "@/lib/money";
import { todayKey } from "./util";
import { tintaDoRotulo } from "./status-meta";
import { Button, Card, EmptyState } from "./ui";
import { useCachedList } from "./useCachedList";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { SkeletonRow } from "./Skeleton";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { diaPorExtenso } from "@/lib/data-curta";

const DAYS_AHEAD = 14;

function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? "Evento";
}

type ItemKind = "evento" | "agenda" | "tarefa" | "pagamento" | "seguimento";

interface AgendaItem {
  date: string;
  time?: string;
  title: string;
  sub?: string;
  kind: ItemKind;
  color: string;
  onClick?: () => void;
  /**
   * ── UM ATALHO PARA A CARGA, NA LINHA DO EVENTO ─────────────────────────
   *
   * Do registo do audit: «a checklist da carrinha — a única tarefa que É de
   * telemóvel — está a quatro toques e não tem entrada nenhuma na navegação».
   *
   * O caminho normal são quatro toques e quatro ecrãs de rolo: barra de baixo →
   * Pedidos → encontrar o pedido → «Produção» → «Abrir para carregar». A
   * Agenda já mostra o evento do dia; falta-lhe só levar lá.
   *
   * É um `<a href>` e não um `onClick`: assim o voltar do browser funciona de
   * borla, e a rota da carga — que o service worker guarda de propósito para
   * abrir sem rede — abre como abriria escrita à mão.
   */
  atalho?: { href: string; rotulo: string };
}

const KIND_LABEL: Record<ItemKind, string> = {
  evento: "Evento",
  agenda: "Agenda",
  tarefa: "Tarefa",
  pagamento: "Pagamento",
  seguimento: "Seguimento",
};

const KIND_COLOR: Record<ItemKind, string> = {
  evento: "#7c854b",
  agenda: "#7a8caa",
  tarefa: "#8a2a22",
  pagamento: "#b5894a",
  seguimento: "#637a5f",
};

interface Props {
  quotes: Quote[];
  onOpen: (q: Quote) => void;
}

export default function Agenda({ quotes, onOpen }: Props) {
  /**
   * A MESMA leitura que o Calendário e as Tarefas fazem, e não uma segunda.
   *
   * Isto pedia `/api/calendario` e `/api/tarefas` por sua conta, ao lado do
   * Reminders (que pedia as tarefas outra vez) e do aquecimento ocioso do
   * AdminClient (que pedia as duas mais uma vez): abrir a Visão Geral eram
   * TRÊS pedidos de tarefas e DOIS de calendário, todos com a mesma resposta.
   *
   * O `useCachedList` já resolve isto com as chaves que as vistas grandes usam
   * ("calendario", "tarefas"): partilha a cache entre montagens e junta os
   * pedidos em voo numa só viagem, mesmo quando três sítios pedem ao mesmo
   * tempo — que é exactamente o que aqui acontecia. Uma falha continua a
   * dar-nos uma lista vazia e uma agenda com o que dá para mostrar, como antes.
   */
  const {
    data: calEvents = [],
    loading: aLerMarcacoes,
    falha: falhaDasMarcacoes,
    refresh: recarregarMarcacoes,
  } = useCachedList<CalendarEvent[]>("calendario", "/api/calendario");
  const {
    data: tasks = [],
    loading: aLerTarefas,
    falha: falhaDasTarefas,
    refresh: recarregarTarefas,
  } = useCachedList<Task[]>("tarefas", "/api/tarefas", {
    revalidarAoVoltar: true,
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * «AGENDA TRANQUILA» É UMA AFIRMAÇÃO — E ELA NÃO A PODIA FAZER
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O comentário aqui em cima dizia, sem se envergonhar, que «uma falha
   * continua a dar-nos uma lista vazia e uma agenda com o que dá para
   * mostrar». Só que com AS DUAS leituras em baixo — que é o que acontece
   * assim que o cookie caduca, e o back office fica aberto horas — não sobra
   * nada para mostrar, e o ecrã escrevia «Agenda tranquila. Nada agendado para
   * os próximos 14 dias.» É a pior frase possível: a única que dispensa alguém
   * de ir ver, dita precisamente no momento em que ninguém conseguiu ver.
   *
   * Um erro vê-se; isto não se via. Por isso são três estados e não dois — a
   * ler, não deu para ler, e vazio a sério. Ver `src/lib/porque-nao-leu.ts`.
   *
   * Os eventos e os pagamentos vêm dos `quotes`, que já estão em memória: se
   * houver alguma coisa deles na janela, a agenda continua a desenhar-se como
   * sempre — mas com uma linha por cima a dizer o que lhe falta, porque uma
   * agenda a que faltam as tarefas todas não é a agenda.
   */
  const falha = falhaDasMarcacoes ?? falhaDasTarefas;
  const aLer = aLerMarcacoes || aLerTarefas;
  const oQueFaltou =
    falhaDasMarcacoes && falhaDasTarefas
      ? "as marcações do calendário e as tarefas"
      : falhaDasMarcacoes
        ? "as marcações do calendário"
        : "as tarefas";
  // Só se repete o que falhou: pedir outra vez a lista que veio bem era gastar
  // uma viagem para chegar ao mesmo sítio.
  const tentarDeNovo = useCallback(() => {
    if (falhaDasMarcacoes) recarregarMarcacoes();
    if (falhaDasTarefas) recarregarTarefas();
  }, [falhaDasMarcacoes, falhaDasTarefas, recarregarMarcacoes, recarregarTarefas]);

  const { byDay, days } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Local `YYYY-MM-DD` keys — deriving these from `toISOString()` (UTC) shifts
    // the window by a day in +offset zones (e.g. Portugal in summer, UTC+1), so
    // yesterday's items leak in and "Hoje" lands on the wrong header.
    const pad = (n: number) => String(n).padStart(2, "0");
    const localKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const todayKey = localKey(today);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + DAYS_AHEAD);
    const horizonKey = localKey(horizon);
    const inRange = (d?: string) => !!d && d >= todayKey && d <= horizonKey;

    const items: AgendaItem[] = [];

    for (const q of quotes) {
      if (inRange(q.date)) {
        items.push({
          date: q.date,
          title: q.name,
          sub: `${eventTypeLabel(q)} · ${q.guests} convidados`,
          kind: "evento",
          color: "#7c854b",
          onClick: () => onOpen(q),
          // Pelo id do PEDIDO: a rota da carga é indexada pelo id da checklist,
          // que a Agenda não conhece — e era essa a razão técnica de a única
          // ligação em todo o repositório estar escondida a quatro toques.
          atalho: {
            href: `/orcamento/admin/carregamento/pedido/${encodeURIComponent(q.id)}`,
            rotulo: "Carregar",
          },
        });
      }
      for (const p of q.payments ?? []) {
        if (!p.paid && inRange(p.date)) {
          items.push({
            date: p.date,
            title: `${eur(p.amount)} — ${q.name}`,
            sub: p.kind,
            kind: "pagamento",
            color: "#b5894a",
            onClick: () => onOpen(q),
          });
        }
      }
      // Lead follow-ups scheduled within the window (skip closed deals).
      if (inRange(q.followUpAt) && q.status !== "aceite" && q.status !== "rejeitado") {
        items.push({
          date: q.followUpAt!,
          title: `Seguir ${q.name}`,
          sub: eventTypeLabel(q),
          kind: "seguimento",
          color: KIND_COLOR.seguimento,
          onClick: () => onOpen(q),
        });
      }
    }
    for (const e of calEvents) {
      if (inRange(e.date)) {
        items.push({
          date: e.date,
          time: e.time,
          title: e.title,
          sub: e.note,
          kind: "agenda",
          color: "#7a8caa",
        });
      }
    }
    for (const t of tasks) {
      if (!t.done && inRange(t.dueDate)) {
        items.push({
          date: t.dueDate!,
          title: t.title,
          sub: t.assignee ? `Resp.: ${t.assignee}` : t.area,
          kind: "tarefa",
          color: "#8a2a22",
        });
      }
    }

    items.sort(
      (a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""),
    );

    const map = new Map<string, AgendaItem[]>();
    for (const it of items) {
      if (!map.has(it.date)) map.set(it.date, []);
      map.get(it.date)!.push(it);
    }
    return { byDay: map, days: Array.from(map.keys()) };
  }, [quotes, calEvents, tasks, onOpen]);

  const todayStr = todayKey();
  function dayLabel(key: string): string {
    const diff = Math.round(
      (+new Date(key + "T12:00:00") - +new Date(todayStr + "T12:00:00")) / 864e5,
    );
    const rel = diff === 0 ? "Hoje" : diff === 1 ? "Amanhã" : "";
    const full = diaPorExtenso(key);
    return rel ? `${rel} · ${full}` : full;
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-[var(--bo-hairline)]">
        <p className="bo-eyebrow">Agenda · próximos {DAYS_AHEAD} dias</p>
        <p className="mt-1 text-xs leading-relaxed text-foreground/45">
          Eventos, tarefas e pagamentos que se aproximam. Cada linha indica o tipo.
        </p>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {/* ── A AGENDA QUE ESTÁ LÁ, MENOS O QUE NÃO SE CONSEGUIU LER ────────
            Há eventos dos pedidos para mostrar, mas falta-lhe metade. Sem esta
            linha, uma agenda incompleta é indistinguível de uma agenda
            completa — e a diferença entre as duas é uma tarefa que ninguém faz
            hoje. Fica em cima do primeiro dia, que é onde o olho começa. */}
        {falha && days.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--bo-perigo)]/20 bg-[var(--bo-perigo-lavagem)]/40 px-5 py-2.5 sm:px-6">
            <p className="bo-text-muted min-w-0 flex-1 text-[11px] leading-snug">
              Falta aqui o que não deu para ler — {oQueFaltou}. O que está em baixo vem dos pedidos,
              e está certo.
            </p>
            {falha.valeTentarDeNovo && (
              <Button size="sm" variant="ghost" onClick={tentarDeNovo}>
                Tentar de novo
              </Button>
            )}
          </div>
        )}
        {days.length === 0 ? (
          aLer ? (
            /* A LER não é VAZIO. Enquanto as duas listas não voltarem, esta
               agenda não sabe nada sobre os próximos dias — e uma frase que
               diga o contrário chega sempre antes da resposta. */
            <div role="status" aria-busy="true" className="divide-y divide-[var(--bo-hairline)]">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <span className="sr-only">A ler a agenda…</span>
            </div>
          ) : falha ? (
            /* NÃO DEU PARA LER: aqui não se afirma nada sobre os próximos dias.
               Diz-se o que faltou, porquê, e o passo a dar — que numa leitura é
               sempre tentar outra vez, nunca «repete», que não há gesto nenhum
               para repetir. */
            <div className="px-5 pb-5 sm:px-6">
              <AvisoDeFalha
                titulo={`Não foi possível ler ${oQueFaltou}`}
                mensagem={`${falha.mensagem} Dos pedidos não há nada nos próximos ${DAYS_AHEAD} dias; o resto ficou por ler, e não por estar vazio.`}
                falha={falha}
                aoTentarDeNovo={tentarDeNovo}
              />
            </div>
          ) : (
            /* VAZIO A SÉRIO — e continua a ser um vazio, sem alarme nenhum: as
               primeiras semanas são feitas disto. O que mudou é dizer de onde
               é que estas linhas vêm, para não parecer um ecrã por acabar. */
            <EmptyState
              icon={
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="18" height="17" rx="2" />
                  <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
                </svg>
              }
              title="Agenda tranquila"
              description={`Já li os pedidos, as marcações do calendário e as tarefas: nenhum deles tem nada marcado para os próximos ${DAYS_AHEAD} dias. Os eventos, tarefas e pagamentos aparecem aqui à medida que se aproximam.`}
            />
          )
        ) : (
          /* ── O ESQUELETO DÁ LUGAR À AGENDA, EM VEZ DE SALTAR PARA ELA ─────
             O ramo `aLer` desenha três `SkeletonRow`; quando as três leituras
             voltam, os dias montam de raiz e o esqueleto sai. Era uma troca de
             um fotograma para o outro, e é a espera que ela vê primeiro ao
             abrir a Visão Geral de manhã.

             `.bo-cena`: 600 ms, doze píxeis, só a desacelerar — a banda de
             apresentação. Uma vez só, num invólucro que embrulha os dias
             todos: um degrau por dia seria a agenda a montar-se aos bocados.

             O invólucro é um `div` sem estilo nenhum — as molduras dos dias
             continuam a ser as de cada dia (`border-b … last:border-0`),
             portanto o desenho não muda. E o esqueleto continua sem entrada. */
          <div className="bo-cena">
            {days.map((key) => (
              <div key={key} className="border-b border-[var(--bo-hairline)] last:border-0">
                <p
                  className={`px-5 sm:px-6 pt-4 pb-1.5 text-[10px] tracking-[0.2em] uppercase capitalize font-medium ${key === todayStr ? "text-sage-600" : "text-foreground/40"}`}
                >
                  {dayLabel(key)}
                </p>
                <div className="pb-2">
                  {byDay.get(key)!.map((it, i) => {
                    const Wrap = it.onClick ? "button" : "div";
                    return (
                      /* ── O ATALHO É IRMÃO DA LINHA, E NÃO FILHO ──────────────
                       A linha inteira já é um botão que abre o pedido, e um
                       link dentro de um botão é HTML inválido — o toque fica
                       entregue ao navegador e cada um decide o que quer. Fica
                       ao lado, sobreposto à direita: a linha mantém o realce
                       de ponta a ponta e o alvo do atalho é só dele. */
                      <div key={i} className="relative">
                        <Wrap
                          onClick={it.onClick}
                          className={`w-full text-left px-5 sm:px-6 py-2.5 flex items-center gap-3 ${it.atalho ? "pr-24 sm:pr-28" : ""} ${it.onClick ? `hover:bg-[var(--bo-tinta-3)] ${ESTADO} ${PRESSAO}` : ""}`}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: it.color }}
                          />
                          {it.time && (
                            <span className="text-foreground/45 text-[11px] tabular-nums shrink-0 w-10">
                              {it.time}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-[var(--bo-tinta-72)] text-sm truncate">{it.title}</p>
                            {it.sub && (
                              <p className="text-foreground/40 text-[11px] truncate capitalize">
                                {it.sub}
                              </p>
                            )}
                          </div>
                          <span
                            className="text-[9px] tracking-[0.12em] uppercase px-1.5 py-0.5 rounded-sm shrink-0"
                            style={{ background: `${it.color}1f`, color: tintaDoRotulo(it.color) }}
                          >
                            {KIND_LABEL[it.kind]}
                          </span>
                        </Wrap>
                        {it.atalho && (
                          <a
                            href={it.atalho.href}
                            className={`alvo-toque absolute inset-y-0 right-3 sm:right-4 my-auto inline-flex h-8 items-center rounded-lg border border-sage-600/30 bg-[var(--bo-surface)] px-2.5 text-[11px] font-medium text-sage-600 hover:bg-sage-600/[0.06] ${ESTADO} ${PRESSAO}`}
                          >
                            {it.atalho.rotulo}
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
