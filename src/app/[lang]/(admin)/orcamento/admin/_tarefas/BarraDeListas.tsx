"use client";

import { ESTADO, PRESSAO } from "../ui/movimento";
import { LISTAS_INTELIGENTES, type Lista, type ListaId } from "@/lib/tarefas/listas";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A BARRA DAS LISTAS — «Não há listas» era o ponto 10 da auditoria
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * «Uma só lista plana chamada "A fazer". Correção: barra lateral com listas
 * inteligentes — Hoje · Esta semana · Atrasadas · Sem data · Todas — e por
 * baixo as listas por evento. Cada uma com contagem.»
 *
 * ── PORQUE É QUE NÃO É UMA COLUNA NO TELEMÓVEL ────────────────────────────
 *
 * Porque uma coluna de 224 px ao lado de um ecrã de 390 não é uma coluna, é
 * metade do ecrã. A partir do `lg:` (1024, o corte da casa em que a barra de
 * destinos deixa de ser gaveta) é a coluna do desenho da Parte 2; abaixo disso
 * é a mesma fila de botões que o filtro por pessoa já é, mesmo gesto e mesmo
 * alvo. Não há um segundo desenho a manter: é o mesmo botão com `lg:w-full`.
 *
 * ── E A SELECÇÃO NÃO SE DIZ SÓ COM COR ────────────────────────────────────
 *
 * A lista escolhida ganha fundo, ganha peso (600) e ganha `aria-pressed`. Os
 * três, porque a cor sozinha não chega — é a regra da Parte 5 do sistema de
 * design e é o que faz isto ler-se numa folha a preto e branco.
 */
export function BarraDeListas({
  eventos,
  contas,
  activa,
  aoEscolher,
}: {
  eventos: readonly Lista[];
  contas: ReadonlyMap<ListaId, number>;
  activa: ListaId;
  aoEscolher: (id: ListaId) => void;
}) {
  const botao = (lista: Lista) => {
    const escolhida = lista.id === activa;
    const porFazer = contas.get(lista.id) ?? 0;
    return (
      <li key={lista.id}>
        <button
          type="button"
          aria-pressed={escolhida}
          onClick={() => aoEscolher(lista.id)}
          className={`alvo-toque flex w-auto items-center justify-between gap-2 rounded-[var(--bo-raio-controlo)] px-3 py-2 text-start text-callout lg:w-full ${ESTADO} ${PRESSAO} ${
            escolhida
              ? "bg-[var(--bo-accent-lavagem)] font-semibold text-[var(--bo-text)]"
              : "text-[var(--bo-text-muted)] hover:bg-[var(--bo-tinta-3)] hover:text-[var(--bo-text)]"
          }`}
        >
          <span className="truncate">{lista.rotulo}</span>
          {/* A contagem é uma dívida, não um inventário: só as por fazer. E a
              zero fica calada — «Atrasadas 0» é o contador de zero que a
              Parte 8 proíbe, só que ao lado de um nome em vez de por cima de
              uma régua. */}
          {porFazer > 0 && (
            /* ── A CONTAGEM LÊ-SE SOBRE O FUNDO ONDE ESTÁ ─────────────────
               `--bo-text-faint` mede 4,77:1 sobre BRANCO — é a conta que o
               `globals.css` fez e que o `escada-da-tinta.test.ts` guarda — mas
               a lista escolhida não está sobre branco: está sobre a lavagem do
               acento (`#e2e6e3`), e aí o mesmo texto mede 4,45:1. MEDIDO pelo
               axe no ecrã, em computador e telemóvel: «insufficient color
               contrast of 4.45 … Expected 4.5:1».

               É um número que diz quantas faltam, portanto é informação — e o
               nível terciário «nunca carrega informação» (Parte 4.3). Na lista
               escolhida usa o degrau de cima; nas outras, sobre branco, o que
               estava já passava. */
            <span
              className={`shrink-0 text-caption2 tabular-nums ${
                escolhida ? "text-[var(--bo-text-muted)]" : "text-[var(--bo-text-faint)]"
              }`}
            >
              {porFazer}
            </span>
          )}
        </button>
      </li>
    );
  };

  // A largura da coluna é do contentor, lá em baixo — é ele que conhece a fila
  // onde esta barra vive.
  return (
    <nav aria-label="Listas de tarefas">
      <p className="bo-eyebrow mb-2" id="tarefas-listas">
        Listas
      </p>
      <ul
        role="list"
        aria-labelledby="tarefas-listas"
        className="flex flex-wrap gap-2 lg:flex-col lg:flex-nowrap lg:gap-1"
      >
        {LISTAS_INTELIGENTES.map(botao)}
      </ul>
      {/* Sem tarefas de evento nenhum não há cabeçalho «Eventos» — um título
          seguido de nada é o defeito que a Parte 8 nomeia duas vezes. */}
      {eventos.length > 0 && (
        <>
          <p className="bo-eyebrow mt-5 mb-2" id="tarefas-eventos">
            Eventos
          </p>
          <ul
            role="list"
            aria-labelledby="tarefas-eventos"
            className="flex flex-wrap gap-2 lg:flex-col lg:flex-nowrap lg:gap-1"
          >
            {eventos.map(botao)}
          </ul>
        </>
      )}
    </nav>
  );
}
