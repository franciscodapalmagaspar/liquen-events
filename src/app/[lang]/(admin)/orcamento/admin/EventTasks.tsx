"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Quote, Task, TaskPriority } from "@/lib/orcamento/types";
import { todayKey } from "./util";
import { useToast } from "./Toast";
import { Button, Field, EmptyState, PerguntaDestrutiva } from "./ui";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { useCachedList } from "./useCachedList";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import { diaDoPrazo } from "@/lib/tarefas/prazo";

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  baixa: "#8a8a82",
  normal: "#7c854b",
  alta: "#8a2a22",
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
};

// Para ordenar as tarefas por fazer: mais urgente primeiro.
const PRIORITY_RANK: Record<TaskPriority, number> = { alta: 0, normal: 1, baixa: 2 };

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ELIMINAR UMA TAREFA — porque é que deixou de ser um `window.confirm`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que estava aqui era `window.confirm('Eliminar a tarefa "X"?')`. Nomeava a
 * tarefa, que já é mais do que a maioria fazia — mas ficava-se por aí, e tinha
 * os defeitos da caixa do browser: não cabe em 375 px sem cortar a frase, não se
 * traduz, não tem o desenho da casa e bloqueia o fio principal do browser
 * enquanto está aberta.
 *
 * A pergunta que fica diz também o que se perde ALÉM do título — a prioridade,
 * a data limite, quem estava encarregado — porque é isso que não se reescreve
 * de cabeça, e porque a tarefa desaparece também da vista global de Tarefas, da
 * Agenda e dos Lembretes, que leem esta mesma lista.
 *
 * PERGUNTA e não janela para anular: apagar uma tarefa é raro (ao contrário de
 * a riscar, que é o gesto do dia) e é caro — repô-la seria criar OUTRA, com
 * outro id, e tudo o que apontasse para a primeira ficava a apontar para o
 * nada. Um «Anular» que não devolve a mesma coisa é pior do que não haver
 * nenhum.
 *
 * CONCLUIR e REABRIR continuam sem pergunta nenhuma: é o mesmo botão nos dois
 * sentidos, e desfaz-se com o mesmo dedo.
 */

/** Uma pergunta que nomeia o que se perde, e o que fazer se a resposta for sim. */
interface Pergunta {
  /** A pergunta, com o NOME da coisa lá dentro. Nunca «Tens a certeza?». */
  titulo: string;
  /** Uma linha por coisa que desaparece, cada uma com o seu número. */
  oQueSePerde: ReactNode[];
  /** A frase por baixo da lista. */
  aviso?: ReactNode;
  /** O verbo, repetido no botão: «Eliminar a tarefa», não «Confirmar». */
  rotulo: string;
  fazer: () => void | Promise<void>;
}

interface Props {
  quote: Quote;
  userName?: string;
}

export default function EventTasks({ quote, userName }: Props) {
  const { toast } = useToast();

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * A MESMA LISTA QUE O RESTO DO BACK OFFICE LÊ, FILTRADA POR ESTE EVENTO
   * ═══════════════════════════════════════════════════════════════════════
   *
   * Isto era um `fetch("/api/tarefas")` cru, feito de novo em CADA pedido
   * aberto, fora da cache partilhada (`useCachedList`) que a vista global de
   * Tarefas, a Agenda e os Lembretes já usam para a mesma lista. Abrir dez
   * pedidos seguidos eram dez pedidos à rede pela MESMA lista inteira; agora
   * só há um, e as vistas que abrirem depois leem-na já em cache.
   *
   * As escritas (marcar concluída, criar, apagar) têm de ir pelo `setData` do
   * hook, e nunca por um `setState` só deste componente: é a mesma lista que a
   * vista global e a Agenda leem, e um `setState` local desincronizava-as (ela
   * risca uma tarefa aqui, volta à lista global, e a tarefa continua por
   * fazer lá).
   */
  const {
    data: allTasks,
    setData: setAllTasks,
    loading,
    error: erro,
    errorMessage: mensagemDeErro,
    refresh: tentarDeNovo,
  } = useCachedList<Task[]>("tarefas", "/api/tarefas");
  const tasks = useMemo(
    () => (allTasks ?? []).filter((t) => t.quoteId === quote.id),
    [allTasks, quote.id],
  );

  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("normal");
  const [newDue, setNewDue] = useState("");
  const [busy, setBusy] = useState(false);
  /** A pergunta em curso — ver o comentário no topo do ficheiro. */
  const [aPerguntar, setAPerguntar] = useState<Pergunta | null>(null);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * UMA GRAVAÇÃO, E UMA FRASE QUE DIZ O QUE ACONTECEU
   * ══════════════════════════════════════════════════════════════════════
   *
   * As três escritas diziam «Não foi possível atualizar a tarefa. Tenta
   * novamente.», «Não foi possível criar a tarefa. Tenta novamente.» e «Erro
   * de ligação. Verifica a internet e tenta novamente.» — a mesma resposta
   * («tenta novamente») para a sessão expirada e para a tarefa que outra
   * pessoa já apagou, onde repetir falha sempre. E nenhuma dizia QUAL tarefa,
   * num painel que mostra a lista toda do evento.
   *
   * Um sítio só a fazer fetch e a escolher a frase. Devolve o corpo porque o
   * `addTask` precisa da tarefa criada, e `ok` porque as outras duas têm de
   * poder desfazer o que puseram no ecrã.
   */
  async function gravar(
    oQue: string,
    url: string,
    init?: RequestInit,
  ): Promise<{ ok: boolean; corpo: unknown }> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      toast(porqueRebentou(oQue).mensagem, "error");
      return { ok: false, corpo: null };
    }
    const corpo = await res.json().catch(() => null);
    if (!res.ok) {
      toast(porqueFalhou(oQue, res, corpo).mensagem, "error");
      return { ok: false, corpo };
    }
    return { ok: true, corpo };
  }

  async function toggleDone(task: Task) {
    setAllTasks((prev) =>
      (prev ?? []).map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)),
    );
    const { ok } = await gravar(
      `${task.done ? "reabrir" : "concluir"} a tarefa «${task.title}»`,
      `/api/tarefas/${task.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !task.done }),
      },
    );
    if (!ok) setAllTasks((prev) => (prev ?? []).map((t) => (t.id === task.id ? task : t)));
  }

  async function addTask() {
    if (!newTitle.trim() || busy) return;
    const titulo = newTitle.trim();
    setBusy(true);
    const { ok, corpo } = await gravar(`criar a tarefa «${titulo}»`, "/api/tarefas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: titulo,
        priority: newPriority,
        dueDate: newDue || undefined,
        quoteId: quote.id,
        clientName: quote.name,
        assignee: userName || undefined,
        // Marca a área para estas tarefas poderem ser filtradas/agrupadas numa
        // vista global de tarefas (antes ficavam sem área e perdiam-se).
        area: "Produção",
      }),
    });
    setBusy(false);
    if (!ok) return;
    const criada = corpo as Task | null;
    /**
     * Gravou-se, mas o que voltou não é uma tarefa.
     *
     * Isto dizia «Não foi possível criar a tarefa» e deixava o formulário
     * cheio — sobre uma tarefa que o servidor ACEITOU. Quem lê carrega outra
     * vez e fica com ela duas vezes na lista do evento. O que se diz agora é o
     * contrário: ficou gravada, só não a conseguimos mostrar.
     */
    if (!criada?.id) {
      toast("Tarefa criada, mas não deu para a mostrar. Atualiza a página.", "error");
      return;
    }
    setAllTasks((prev) => [...(prev ?? []), criada]);
    setNewTitle("");
    setNewPriority("normal");
    setNewDue("");
    setAdding(false);
  }

  /** A pergunta de eliminar — ver o comentário no topo do ficheiro. */
  function perguntarSeElimina(task: Task) {
    const ficam = tasks.length - 1;
    const perde: string[] = [
      `${task.done ? "está concluída" : "está por fazer"}, prioridade ${PRIORITY_LABEL[
        task.priority
      ].toLowerCase()}`,
    ];
    if (task.dueDate) {
      perde.push(
        `a data limite de ${new Date(diaDoPrazo(task.dueDate) + "T12:00:00").toLocaleDateString(
          "pt-PT",
          {
            day: "numeric",
            month: "long",
          },
        )}`,
      );
    }
    if (task.assignee) perde.push(`o nome de quem ficou com ela (${task.assignee})`);
    perde.push(
      `sai também da lista global de tarefas — ficam ${ficam} ${
        ficam === 1 ? "tarefa" : "tarefas"
      } em «${quote.name}»`,
    );
    setAPerguntar({
      titulo: `Eliminar a tarefa «${task.title}»?`,
      oQueSePerde: perde,
      aviso: "Não pode ser anulado.",
      rotulo: "Eliminar a tarefa",
      fazer: () => removeTask(task.id),
    });
  }

  async function removeTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    setAllTasks((prev) => (prev ?? []).filter((t) => t.id !== id));
    const { ok } = await gravar(
      `eliminar a tarefa «${task?.title ?? "sem título"}»`,
      `/api/tarefas/${id}`,
      { method: "DELETE" },
    );
    // Só volta ao ecrã se ainda lá não estiver: com duas remoções no ar, a que
    // falha não pode ressuscitar a que o servidor já apagou.
    if (!ok && task) {
      setAllTasks((prev) =>
        (prev ?? []).some((t) => t.id === id) ? (prev ?? []) : [...(prev ?? []), task],
      );
    }
  }

  const todayStr = todayKey();
  // Por fazer, ordenadas: atrasadas primeiro, depois por prioridade, depois pela
  // data limite mais próxima — o que é urgente fica no topo em vez de se perder
  // pela ordem de criação.
  const todo = tasks
    .filter((t) => !t.done)
    .sort((a, b) => {
      const aOver = a.dueDate && a.dueDate < todayStr ? 0 : 1;
      const bOver = b.dueDate && b.dueDate < todayStr ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority])
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      const ad = a.dueDate ?? "9999-99-99";
      const bd = b.dueDate ?? "9999-99-99";
      return ad < bd ? -1 : ad > bd ? 1 : 0;
    });
  const done = tasks.filter((t) => t.done);

  return (
    // `@container`: a linha de campos do formulário de baixo pergunta pela
    // largura DESTE painel, não pela da janela. Ele vive num cartão de zona
    // do dossier, dentro de uma coluna — a 375 px de ecrã sobram-lhe 279, e
    // num iPad a 768 continuam a ser 279. É a mesma razão pela qual o
    // `EventCosts` e o `PaymentsPanel` ao lado já são contentores.
    <div className="@container">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="bo-eyebrow">Tarefas do evento</p>
        <div className="flex items-center gap-3">
          {tasks.length > 0 && (
            <span className="text-foreground/50 text-[11px] tabular-nums">
              {done.length}/{tasks.length} concluídas
            </span>
          )}
          <Button
            variant="subtle"
            size="sm"
            aria-expanded={adding}
            iconLeft={
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            }
            onClick={() => setAdding((v) => !v)}
          >
            Adicionar
          </Button>
        </div>
      </div>

      {adding && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-sage-600/25 bg-sage-600/[0.04] p-4">
          <Field
            label="Título da tarefa"
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTask();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Ex.: Confirmar catering"
          />
          {/* Prioridade e Data limite, lado a lado, davam duas colunas de
              117 px a 375 px (279 de painel, menos os 32 do `p-4` da caixa
              e os 12 do intervalo). Um `input[type=date]` a 16 px — o piso
              de `pointer: coarse` — mostra «dd/mm/aaaa» mais o calendário e
              não cabe nisso: a data saía da margem. Empilham por omissão e
              voltam a par assim que o painel tem 22 rem. */}
          <div className="grid grid-cols-1 gap-3 @min-[22rem]:grid-cols-2">
            <Field
              as="select"
              label="Prioridade"
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
            >
              {(["baixa", "normal", "alta"] as TaskPriority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Field>
            <Field
              as="input"
              type="date"
              label="Data limite"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="primary"
              onClick={addTask}
              loading={busy}
              disabled={busy || !newTitle.trim()}
            >
              {busy ? "A criar…" : "Criar tarefa"}
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2].map((i) => (
            <div key={i} className="bo-skeleton h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : erro && tasks.length === 0 ? (
        <AvisoDeFalha
          titulo="Não foi possível ler as tarefas deste evento"
          mensagem={mensagemDeErro}
          aoTentarDeNovo={tentarDeNovo}
        />
      ) : tasks.length === 0 && !adding ? (
        <EmptyState
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M9 11l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="4" y="4" width="16" height="16" rx="3" />
            </svg>
          }
          title="Sem tarefas ligadas a este evento"
          description="Cria a primeira tarefa para acompanhar o que falta preparar."
          action={{ label: "Adicionar tarefa", onClick: () => setAdding(true) }}
        />
      ) : (
        /* O esqueleto dá lugar à lista: `.bo-cena` (600 ms) no contentor, uma
           vez só. As linhas lá dentro não têm degrau próprio — a escada é por
           bloco, nunca por linha, e uma lista de tarefas não tem tecto. */
        <div className="bo-cena flex flex-col gap-2">
          {[...todo, ...done].map((task) => (
            <div
              key={task.id}
              className={`group flex items-start gap-3 rounded-xl border p-3 ${ESTADO} ${
                task.done
                  ? "border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] opacity-60"
                  : "border-[var(--bo-hairline)] bg-[var(--bo-surface)] hover:shadow"
              }`}
            >
              {/* 18×18 medidos a 375 px. É a caixa que fecha uma tarefa do
                  evento — mesma correcção da checklist: o alvo cresce para os
                  44 sob dedo, o quadrado desenhado (e a cor da prioridade que
                  ele carrega) fica nos 18 no `span` de dentro.
                  A linha é `items-start`, portanto o alvo alto empurrava o
                  quadrado para baixo do início do título. O `-mt-3` repõe-lhe
                  o alinhamento e vai com a variante `pointer-coarse:` — sem
                  ela, no portátil (onde o botão continua com 18 px) a margem
                  negativa puxava o quadrado para fora da linha. */}
              <button
                onClick={() => toggleDone(task)}
                className={`alvo-toque mt-0.5 shrink-0 pointer-coarse:-mt-3 ${ESTADO} ${PRESSAO}`}
                aria-label={task.done ? "Marcar como pendente" : "Marcar como concluída"}
              >
                <span
                  className={`flex h-[18px] w-[18px] items-center justify-center rounded-md border-[1.5px] ${ESTADO}`}
                  style={{
                    borderColor: task.done ? "#4c6752" : PRIORITY_COLOR[task.priority],
                    background: task.done ? "#4c675214" : "transparent",
                  }}
                >
                  {task.done && (
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="#4c6752"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <path d="M2.5 6l2.5 2.5L9.5 3" />
                    </svg>
                  )}
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm leading-snug ${
                    task.done ? "text-foreground/40 line-through" : "text-[var(--bo-text)]"
                  }`}
                >
                  {task.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {!task.done && (
                    <span
                      className="text-[10px] uppercase tracking-[0.08em]"
                      style={{ color: PRIORITY_COLOR[task.priority] }}
                    >
                      {PRIORITY_LABEL[task.priority]}
                    </span>
                  )}
                  {task.dueDate && !task.done && (
                    <span
                      className={`text-[11px] tabular-nums ${
                        task.dueDate < todayStr
                          ? "font-medium text-[var(--bo-perigo)]"
                          : "text-foreground/45"
                      }`}
                    >
                      {task.dueDate < todayStr ? "Atrasada · " : ""}
                      {new Date(diaDoPrazo(task.dueDate) + "T12:00:00").toLocaleDateString(
                        "pt-PT",
                        {
                          day: "numeric",
                          month: "short",
                        },
                      )}
                    </span>
                  )}
                  {task.assignee && !task.done && (
                    <span className="text-foreground/45 text-[11px]">{task.assignee}</span>
                  )}
                </div>
              </div>
              {/* ── O ALVO QUE NÃO EXISTIA EM LADO NENHUM ──────────────────────
                  Este era o pior dos sete: não tinha sequer a escapatória por
                  largura que os outros tinham. `opacity-0 group-hover` e mais
                  nada — MEDIDO em 7 linhas, ZERO visíveis a 375×667 COM DEDO e
                  ZERO a 768×1024 com dedo. Num ecrã táctil não há hover, por
                  isso não havia como descobrir que a tarefa se podia remover:
                  ali, esta acção não existia de todo.

                  `com-rato:` (globals.css) esconde só onde há mesmo rato — no
                  portátil o botão continua a aparecer ao pairar, exactamente
                  como aparecia. E `alvo-toque` porque, quando finalmente
                  aparecia, media 13×13 px contra os 44 da casa. */}
              <button
                onClick={() => perguntarSeElimina(task)}
                className={`alvo-toque mt-0.5 shrink-0 text-foreground/25 sem-rato:text-[var(--bo-text-muted)] opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:focus-visible:opacity-100 hover:text-[var(--bo-perigo)] ${ESTADO} ${PRESSAO}`}
                aria-label="Remover tarefa"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── A PERGUNTA É A DA CASA ────────────────────────────────────────
          `ui/PerguntaDestrutiva`: folha inferior no telemóvel (ao pé do
          polegar), diálogo centrado no computador, e o verbo repetido no botão
          em vez de «OK». Um `confirm()` do browser não cabe em 375 px, não se
          traduz e não leva uma lista de números lá dentro — que é a única
          coisa que faz a pergunta valer a pena. */}
      <PerguntaDestrutiva
        aberto={!!aPerguntar}
        onFechar={() => setAPerguntar(null)}
        titulo={aPerguntar?.titulo ?? ""}
        oQueSePerde={aPerguntar?.oQueSePerde}
        aviso={aPerguntar?.aviso}
        rotuloConfirmar={aPerguntar?.rotulo ?? ""}
        // Fecha PRIMEIRO e só depois age, em vez de esperar pela resposta com a
        // caixa aberta: estes ecrãs são optimistas — tiram a linha logo e
        // repõem-na se o servidor recusar — e uma caixa a rodar por cima deles
        // atrasaria um gesto que hoje é instantâneo, e impedia dois seguidos.
        onConfirmar={() => {
          const escolhido = aPerguntar;
          setAPerguntar(null);
          void escolhido?.fazer();
        }}
      />
    </div>
  );
}
