"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Task, TaskPriority } from "@/lib/orcamento/types";
import { SkeletonList } from "./Skeleton";
import { useToast } from "./Toast";
import { useAnular } from "./ui/anular";
import { useDepoisDeApagar } from "./ui/depois-de-apagar";
import { todayKey } from "./util";
import {
  Button,
  Card,
  EmptyState,
  Escolha,
  Field,
  MenuDeAccoes,
  PerguntaDestrutiva,
  type AccaoDeItem,
} from "./ui";
import { useCachedList } from "./useCachedList";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { metaFor, tintaDoRotulo } from "./status-meta";
import { ESTADO, MOLA_DE_MARCAR, PRESSAO } from "./ui/movimento";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import { interpretarTarefa, type Interpretacao } from "@/lib/tarefas/linguagem-natural";
import { tituloEPrazo } from "@/lib/tarefas/prazo";
/* As regras das fases 05 e 06 vivem em `@/lib/tarefas/listas` e não aqui: o que
   é uma tarefa «de hoje» e o que conta como atrasada são perguntas que se
   discutem e se testam sozinhas, longe do desenho. */
import {
  AGRUPAMENTOS,
  AGRUPAMENTO_POR_OMISSAO,
  amanha,
  LISTAS_INTELIGENTES,
  LISTA_POR_OMISSAO,
  ORDENACOES,
  ORDENACAO_POR_OMISSAO,
  agruparTarefas,
  contarPorLista,
  listasDeEvento,
  ordemVisivel,
  ordenarTarefas,
  pertenceALista,
  reordenarManualmente,
  type Agrupamento,
  type Lista,
  type ListaId,
  type Ordenacao,
} from "@/lib/tarefas/listas";
/* A ordem manual GUARDADA — a outra metade da fase 09. O `listas.ts` diz qual
   é a ordem; este diz o que se grava para ela sobreviver a um recarregamento. */
import { ordemGuardada, posicoesDepoisDeMover } from "@/lib/tarefas/posicoes";
import { TarefaDetalhe } from "./TarefaDetalhe";

const PRIORITY_META: Record<TaskPriority, { label: string; color: string }> = {
  alta: { label: "Alta", color: "#8a2a22" },
  normal: { label: "Normal", color: "#9aa36a" },
  baixa: { label: "Baixa", color: "#8a8a82" },
};

const AREAS = ["Comercial", "Produção", "Decoração", "Financeiro", "Logística", "Geral"];

/**
 * Segundo e meio entre marcar uma tarefa e ela descer para as Concluídas.
 *
 * O número é o dos Lembretes, e o que ele compra está escrito no `aDescansar`:
 * é o tempo de desmarcar sem a lista saltar. Mais curto não chega para o dedo
 * voltar atrás; mais longo e a lista parece que não percebeu o toque.
 */
const ESPERA_ANTES_DE_DESCER_MS = 1500;

/* Os dois ícones da linha, escritos uma vez: o mesmo desenho serve os botões
   soltos do computador e os itens do menu «⋯» do dedo. */
const LapisIcon = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
  </svg>
);

const CaixoteIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    <path
      d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/* Os ícones do menu da linha (fase 09). «Dentro de um grupo, ou todos têm
   ícone ou nenhum tem» [APPLE, 9.8] — e este menu tem-nos todos, portanto os
   itens novos trazem o seu. O desenho é o mínimo que se lê a 14 px. */
const VistoIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const RelogioIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const SetaIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

const SetaBaixoIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 5v14M19 12l-7 7-7-7" />
  </svg>
);

/**
 * Uma linha da lista, memoizada.
 *
 * O título da tarefa nova é estado DESTE ecrã, por isso cada tecla escrita em
 * "O que há para fazer?" voltava a desenhar a lista inteira — e, de caminho, a
 * refazer o `filter`/`sort` das tarefas (que também estavam fora de qualquer
 * `useMemo`). Com a linha atrás de `memo()` e os derivados memoizados, escrever
 * deixa de tocar na lista: nenhuma linha muda enquanto se escreve um título.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A LINHA QUE ESCREVE — A ÚLTIMA DA LISTA, COMO NOS LEMBRETES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fechada é um convite de uma linha: «＋ Nova tarefa». Aberta é o campo, com os
 * quatro detalhes por baixo.
 *
 * ── OS ATALHOS, E PORQUE É QUE SÃO ESTES ─────────────────────────────────
 *
 *  · `Enter` cria **e o campo fica aberto**, vazio, à espera da seguinte.
 *    Quem escreve tarefas escreve-as em rajada — a segunda vem a seguir à
 *    primeira, e obrigar a um toque entre cada uma é atrito puro.
 *  · `⇧Enter` cria e FECHA, para quem só tinha uma.
 *  · `Esc` desiste. Com texto escrito, desiste do texto; sem texto, fecha a
 *    linha — que é a ordem em que se espera perder as coisas.
 *
 * ── E O CAMPO NÃO É UMA CÁPSULA ──────────────────────────────────────────
 *
 * «Mini a medium são retângulos arredondados; cápsula só em large e extra
 * large.» [APPLE] É o `bo-input` da casa, que já é o rectângulo de 10 px de
 * todos os outros campos do produto.
 */
function LinhaDeEscrever({
  aberta,
  aoAbrir,
  aoFechar,
  campo,
  botao,
  titulo,
  aoEscrever,
  aoCriar,
  aGravar,
  children,
}: {
  aberta: boolean;
  aoAbrir: () => void;
  aoFechar: () => void;
  campo: React.RefObject<HTMLInputElement | null>;
  /** O botão que ocupa o lugar do campo quando ele fecha — para onde o foco volta. */
  botao: React.RefObject<HTMLButtonElement | null>;
  titulo: string;
  aoEscrever: (v: string) => void;
  aoCriar: (fecharDepois: boolean) => void;
  aGravar: boolean;
  children: React.ReactNode;
}) {
  if (!aberta) {
    return (
      <button
        ref={botao}
        type="button"
        onClick={aoAbrir}
        className={`alvo-toque flex w-full items-center gap-2.5 px-5 py-3 text-left text-sm text-[var(--bo-text-muted)] hover:bg-[var(--bo-tinta-3)] hover:text-[var(--bo-text)] sm:px-6 ${ESTADO} ${PRESSAO}`}
      >
        <span
          aria-hidden="true"
          className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border border-dashed border-foreground/30 text-[11px] leading-none"
        >
          +
        </span>
        Nova tarefa
      </button>
    );
  }

  return (
    <div className="px-5 py-3.5 sm:px-6">
      <input
        ref={campo}
        value={titulo}
        onChange={(e) => aoEscrever(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            aoCriar(e.shiftKey);
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            if (titulo) aoEscrever("");
            else aoFechar();
          }
        }}
        /* ── `readOnly` E NÃO `disabled`: O FOCO FICA ONDE ESTÁ ────────────
           Um campo desactivado deixa de poder ter foco, e o que estava focado
           passa a `<body>`. MEDIDO: com `disabled`, `document.activeElement`
           ficava em `BODY` enquanto a tarefa gravava, e só voltava ao campo
           depois — por um `requestAnimationFrame` a apostar numa re-desenho
           que nem sempre chega a tempo.

           E é nessa janela que quem escreve «em rajada» (a intenção escrita
           aqui em cima) já começou a tarefa seguinte: as teclas caíam nos
           atalhos globais da página, onde «g» seguido de uma letra muda de
           vista. `readOnly` engole-as no campo em vez de as entregar à página,
           e `aria-busy` diz a quem ouve que o campo está a gravar. */
        readOnly={aGravar}
        aria-busy={aGravar || undefined}
        aria-label="Nova tarefa"
        placeholder="O que há para fazer?"
        className="bo-input w-full px-3 py-2 text-sm"
      />
      {children}
      {/* Uma linha, e não um botão. O que ela precisa de saber é que o Enter
          chega — e depois de saber uma vez, isto é ruído que se aprende a
          saltar. Fica em `text-caption` e some com a linha ao fechar. */}
      <p className="bo-text-muted mt-2 text-[11px]">
        <kbd className="pointer-coarse:hidden">Enter</kbd>
        <span className="pointer-coarse:hidden"> cria e fica pronto para a seguinte · </span>
        <kbd className="pointer-coarse:hidden">Esc</kbd>
        <span className="pointer-coarse:hidden"> desiste</span>
        <span className="hidden pointer-coarse:inline">Toca fora para desistir.</span>
      </p>
    </div>
  );
}

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
function BarraDeListas({
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

const TaskRow = memo(function TaskRow({
  t,
  overdue,
  arrastavel,
  escolhida,
  marca,
  aArrastar,
  onToggle,
  onEdit,
  onRemove,
  onEscolher,
  onPrazo,
  onMover,
  onArrastar,
}: {
  t: Task;
  overdue: boolean;
  /**
   * ── A COSTURA DO ARRASTAR, E ONDE ELA FICA ──────────────────────────────
   *
   * A fase 06 entrega «ordenação manual ACTIVA o arrastar»; o arrasto em si é
   * a fase 09. Enquanto ela não chega, o que a linha ganha é a MARCA de que
   * está arrastável — `data-arrastavel` — e mais nada: nem cursor de mão, nem
   * pega desenhada. Um cursor `grab` por cima de uma linha que não se agarra é
   * uma promessa falsa, e três botões no hover de uma linha são proibição da
   * Parte 8.
   *
   * ── E A FASE 09 CHEGOU ──────────────────────────────────────────────────
   *
   * A marca continua a ser a mesma (`data-arrastavel`), e agora traz com ela o
   * `draggable` e os quatro manipuladores. O que NÃO veio foi a pega desenhada:
   * a linha inteira agarra-se, que é o que os Lembretes fazem, e uma pega de
   * seis pontinhos seria o terceiro controlo de uma linha que a Parte 8 quer
   * com um.
   */
  arrastavel: boolean;
  /** A linha que o painel de detalhe está a mostrar. */
  escolhida: boolean;
  /** Onde é que a linha arrastada vai entrar, se for aqui. */
  marca: "antes" | "depois" | null;
  /** Esta é a linha que está a ser arrastada neste momento. */
  aArrastar: boolean;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onRemove: (id: string) => void;
  onEscolher: (t: Task) => void;
  /** «Hoje» e «Amanhã» do menu — o prazo sem abrir o editor. */
  onPrazo: (t: Task, quando: "hoje" | "amanha") => void;
  /** A alternativa ao arrasto, que nunca pode ser o único caminho. [APPLE] */
  onMover: (id: string, direccao: -1 | 1) => void;
  /**
   * Os quatro momentos do arrasto, num objecto só: são estáveis, chegam do
   * ecrã, e passá-los soltos era quadruplicar a lista de propriedades de uma
   * linha que está atrás de um `memo()`.
   */
  onArrastar: {
    comecar: (e: React.DragEvent<HTMLElement>) => void;
    porCima: (e: React.DragEvent<HTMLElement>) => void;
    largar: (e: React.DragEvent<HTMLElement>) => void;
    acabar: () => void;
  };
}) {
  return (
    /* ── LINHA DE TABELA NO COMPUTADOR, CARTÃO DE DUAS LINHAS NO TELEMÓVEL ──
       MEDIDO a 390×844: o título mostrava 113 px dos 1009 de que precisava —
       11 %. A causa era esta fila: seis colunas a disputar 342 px, e o título o
       único com `min-w-0`, portanto o único que cede. Com `truncate` por cima,
       lia-se «Confirmar com a Herda…» dezasseis vezes seguidas.

       A conversão é a que os outros cartões do back office já fazem — e faz-se com
       `flex-wrap` SOZINHO, sem ponto de corte por viewport: a fila quebra
       quando não cabe, que é a pergunta certa (a lição das linhas de grupo do
       estúdio, em MOBILE-AUDIT.md). O mínimo no título é o que faz o
       `flex-wrap` disparar — sem ele, o título encolhe até 0 em vez de empurrar
       os controlos para a linha de baixo.

       Fica assim no telemóvel:
         linha 1 · [concluir 44px] título inteiro, a quebrar as linhas que
                   precisar, com o prazo/área/cliente por baixo;
         linha 2 · prioridade, editar e eliminar, todos com o tamanho da casa.
       No computador nada muda: tudo cabe numa fila e o título volta a cortar
       (`sm:truncate`), que é o que mantém a densidade da lista. */
    <li
      // Ver a nota no `arrastavel`: a marca é o que a fase 09 vem procurar.
      // `undefined` e não `false` — um atributo que diz «false» no HTML é um
      // atributo presente, e quem o procurar com `[data-arrastavel]` apanhava
      // a lista inteira.
      data-arrastavel={arrastavel || undefined}
      // A identidade da linha no DOM. É por aqui que o teclado (setas, ⌘⌫,
      // ⇧F10) e o arrasto sabem em que tarefa estão sem que o ecrã tenha de
      // fabricar um manipulador por linha — que é o que desfazia o `memo()`.
      data-tarefa={t.id}
      draggable={arrastavel || undefined}
      onDragStart={arrastavel ? onArrastar.comecar : undefined}
      onDragOver={arrastavel ? onArrastar.porCima : undefined}
      onDrop={arrastavel ? onArrastar.largar : undefined}
      onDragEnd={arrastavel ? onArrastar.acabar : undefined}
      aria-current={escolhida || undefined}
      className={`group relative flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:items-center sm:px-5 sm:py-3.5 ${ESTADO} ${
        escolhida ? "bg-[var(--bo-accent-lavagem)]" : "hover:bg-[var(--bo-tinta-3)]"
      } ${arrastavel ? "cursor-grab active:cursor-grabbing" : ""} ${aArrastar ? "opacity-50" : ""}`}
    >
      {/* ── A LINHA DE INSERÇÃO ────────────────────────────────────────────
          «Sinal de aceitação só sobre destino válido — linha de inserção ou
          realce do contentor.» [APPLE]

          Um elemento absoluto e não um `border-top`: uma moldura de 2 px que
          aparece e desaparece empurra a linha 2 px para baixo a cada passagem
          do cursor, e o que se vê é a lista a tremer debaixo do que se
          arrasta. Este não ocupa espaço nenhum. */}
      {marca && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 h-0.5 bg-[var(--bo-accent)] ${
            marca === "antes" ? "top-0" : "bottom-0"
          }`}
        />
      )}
      {/* ── É UMA `<input type="checkbox">` A SÉRIO ───────────────────────
          «Checkbox que não é `<input type="checkbox">`» está nas proibições
          deste ecrã, e com razão: o que estava aqui era um `<button>` com
          `aria-pressed`, e um botão premido não é uma caixa marcada. Um leitor
          de ecrã lê-lhe «botão, premido» em vez de «caixa de verificação,
          marcada»; o `Espaço` faz o que um botão faz e não o que uma caixa
          faz; e uma lista de dezasseis não se percorre com as setas de um
          grupo de caixas porque não é um.

          A caixa real está lá, transparente e por cima do quadrado desenhado
          (`appearance-none` mais `absolute inset-0`): é ela que recebe o
          toque, o foco e o teclado, e o quadrado é só o que se vê. */}
      <label
        className={`alvo-toque relative -m-2 flex shrink-0 cursor-pointer items-center justify-center p-2 com-rato:-m-2.5 com-rato:p-2.5 ${ESTADO} ${PRESSAO}`}
      >
        <input
          type="checkbox"
          checked={t.done}
          onChange={() => onToggle(t)}
          aria-label={t.title}
          /* ── 20×20 ENTRE DOIS ALVOS DE 44 ────────────────────────────────
           MEDIDO: 20×20 px, dezasseis vezes na lista, encostado ao «Editar»
           e ao «Eliminar» que já eram 44. Era o vizinho que ficou de fora.
           (Esses dois passaram para dentro do menu «⋯» na fase 09; o vizinho
           de 44 px à direita é agora o botão do menu.)

           O quadrado desenhado continua com 20 px — quem cresce é o alvo à
           volta, como no rótulo da lista de pedidos. O `p-2` com `-m-2`
           dava 36 px ao rato; a Parte 6 pede 40 («checkbox com 18 px visuais
           e 40 px de alvo»), e `com-rato:p-2.5 com-rato:-m-2.5` leva-o lá sem
           ocupar mais espaço na linha — MEDIDO: 36×36 antes, 40×40 depois, com
           a linha com a mesma altura. O `alvo-toque` leva-o aos 44 no dedo
           (só sob `(pointer: coarse)`, ver globals.css) e aí nada mudou. */
          className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-md"
        />
        <span
          aria-hidden="true"
          /* A mola só na ida. Uma caixa que salta ao DESmarcar celebrava um
             desfazer, e o `key` é o que a faz correr outra vez a cada marcação
             — sem ele a animação corre uma vez e nunca mais. */
          key={t.done ? "marcada" : "por-marcar"}
          className={`flex h-5 w-5 items-center justify-center rounded-md border ${ESTADO} peer-focus-visible:ring-2 peer-focus-visible:ring-sage-600/45 peer-focus-visible:ring-offset-2 ${
            t.done
              ? `border-sage-600 bg-sage-600 ${MOLA_DE_MARCAR}`
              : "border-foreground/25 group-hover:border-sage-600/60"
          }`}
        >
          {t.done && (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M2 6l2.5 2.5L10 3"
                stroke="white"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      </label>
      <div className="min-w-0 flex-1">
        {/* ── O TÍTULO É A PORTA DO PAINEL DE DETALHE (fase 08) ─────────────
            Era um `<p>`. Passa a botão porque passou a fazer alguma coisa:
            abre o detalhe da tarefa na coluna do lado.

            ── E PORQUE É QUE O NOME ACESSÍVEL NÃO É O TÍTULO ───────────────
            Porque a caixa de verificação ao lado já se chama assim
            (`aria-label={t.title}`), e dois elementos com o MESMO nome na
            mesma lista mandam quem ouve o ecrã adivinhar em qual está — e
            partem qualquer passeio que procure por nome. «Abrir «X»» CONTÉM o
            texto visível, que é o que a WCAG 2.5.3 exige de um rótulo que não
            seja igual ao que está escrito.

            A linha inteira não é clicável de propósito: um `div` com `onClick`
            por cima de uma caixa de verificação e de um menu é um alvo que
            engole os cliques dos outros dois, e não se alcança com o teclado
            sem lhe inventar um `tabIndex` que compete com o que já lá está. */}
        <button
          type="button"
          data-abrir
          onClick={() => onEscolher(t)}
          aria-label={`Abrir «${t.title}»`}
          title={t.title}
          /* ── E O ALVO ────────────────────────────────────────────────────
             `alvo-toque` porque isto é um controlo novo e o mínimo da casa são
             44 px no dedo. MEDIDO a 375 px: sem ele o título dava 20 px de
             altura — passa dos 24 da WCAG 2.2 AA por baixo e dos 44 desta casa
             por muito. Com ele, a linha cresce de 68 para 82 px no telemóvel
             (a caixa de verificação ao lado já era 44) e ganha-se o gesto que
             se espera de uma lista no telemóvel: tocar no nome abre a tarefa.

             `block` a seguir por ordem: o `.alvo-toque` põe `display:
             inline-flex` numa camada, e um título centrado a meio da linha não
             é um título de lista. No computador nada disto existe — a regra
             vive dentro de `(pointer: coarse)`.

             ── E COM RATO, QUE TAMBÉM TINHA 20 PX ──────────────────────────
             MEDIDO num 1440×900: 278×20. A Parte 6 pede alvos de 40 px, e a
             linha não tem altura para os dar à letra. O `py-2.5` com `-my-2.5`
             alarga a área que responde sem mexer na altura da linha; o
             `relative` é o que a põe POR CIMA da linha de data e área logo
             abaixo, que de outro modo ficava com a metade de baixo do alvo
             (um irmão posterior pinta-se por cima de um anterior sem posição). */
          className={`alvo-toque relative block w-full text-start text-sm break-words com-rato:-my-2.5 com-rato:py-2.5 sm:truncate ${ESTADO} ${PRESSAO} ${
            t.done ? "text-foreground/30 line-through" : "text-[var(--bo-tinta-72)]"
          }`}
        >
          {t.title}
        </button>
        <div className="text-[10px] mt-0.5 flex items-center gap-2 flex-wrap">
          {t.dueDate && (
            <span
              className={
                overdue
                  ? "inline-flex items-center gap-1 text-[var(--bo-perigo)]"
                  : "text-foreground/30"
              }
            >
              {/* ── ATRASADA NÃO SE DIZ SÓ COM COR ─────────────────────────
                  «Data atrasada com ícone E texto: nunca só a cor vermelha.»
                  [APPLE] A palavra já cá estava; faltava o sinal, que é o que
                  faz a linha destacar-se numa folha impressa a preto e branco
                  e para quem não distingue o vermelho do cinzento. */}
              {overdue && <span aria-hidden="true">⚠</span>}
              {overdue ? "Atrasada · " : ""}
              {new Date(t.dueDate + "T12:00:00").toLocaleDateString("pt-PT", {
                day: "numeric",
                month: "short",
              })}
            </span>
          )}
          {t.area && (
            <span className="text-foreground/30 border border-[var(--bo-hairline-strong)] rounded px-1.5 py-0.5">
              {t.area}
            </span>
          )}
          {t.clientName && <span className="text-foreground/25">{t.clientName}</span>}
        </div>
      </div>
      {/* ── A SEGUNDA LINHA DO CARTÃO ────────────────────────────────────────
          `w-full` num contentor que quebra é o que garante uma linha só para os
          controlos — não é uma percentagem calculada à sorte que às vezes ainda
          deixava a etiqueta de prioridade subir para junto do título.

          E `sm:contents` faz esta caixa DESAPARECER a partir de `sm`: os filhos
          voltam a ser filhos directos da fila, com o mesmo espaçamento de
          sempre. É por isso que a linha do computador fica byte a byte como
          estava, em vez de ser um segundo desenho a manter em paralelo. */}
      <div className="flex w-full items-center gap-2 sm:contents">
        {t.assignee && (
          <span
            className="hidden sm:flex items-center gap-1.5 shrink-0"
            title={`Responsável: ${t.assignee}`}
          >
            {/* ── O NOME INTEIRO, NUNCA SÓ A INICIAL ─────────────────────────
                «Responsável com `aria-label` do nome completo, nunca só as
                iniciais.» (Parte 6) Medido antes: sem `aria-label`, e a
                inicial lia-se solta («C») antes do nome.

                A inicial passa a muda (`aria-hidden`) — é desenho, e o nome ao
                lado já diz tudo — e o nome ganha o contexto que lhe faltava:
                «Responsável: Catarina Almeida». É texto escondido e não um
                `aria-label` num `<span>` de propósito: um `aria-label` num
                elemento sem papel não é anunciado de forma fiável, e o texto
                está sempre na árvore. */}
            <span
              aria-hidden="true"
              className="w-5 h-5 rounded-full bg-sage-600 text-white flex items-center justify-center text-[9px] font-bold"
            >
              {t.assignee.slice(0, 1).toUpperCase()}
            </span>
            <span className="text-foreground/35 text-[10px]">
              <span className="sr-only">Responsável: </span>
              {t.assignee}
            </span>
          </span>
        )}
        {!t.done && (
          <span
            className="text-[9px] tracking-[0.12em] uppercase px-2 py-0.5 rounded-sm shrink-0"
            style={{
              background: `${metaFor(PRIORITY_META, t.priority).color}22`,
              // A cor de ESCREVER, não a de preencher: medido 2,40:1 antes.
              color: tintaDoRotulo(metaFor(PRIORITY_META, t.priority).color),
            }}
          >
            {/* «Alta» sozinho não diz de quê. O prefixo escondido é o que faz
                «Prioridade: Alta» (Parte 6). */}
            <span className="sr-only">Prioridade: </span>
            {metaFor(PRIORITY_META, t.priority).label}
          </span>
        )}
        {/* ══ AS ACÇÕES DA TAREFA — UM BOTÃO, E O MESMO DO BOTÃO DIREITO ════
            «Hover revela, à direita, um `⋯` que abre o mesmo menu do botão
            direito. **Um botão, não três.**» (Parte 3 do documento) E o ponto
            20: «não há menu de contexto» — este é ele.

            ── O QUE MUDOU, E O QUE SE PAGA POR ISSO ────────────────────────
            Estavam aqui DUAS formas da mesma lista: com rato, o lápis e o
            caixote soltos; sem rato, um «⋯». A razão de a segunda existir está
            medida e continua verdadeira — a 375×667 com dedo eram 40 alvos de
            44 px visíveis ao mesmo tempo em 20 linhas, e com o menu passam a
            20. O que mudou é que a PRIMEIRA deixou de chegar: as acções desta
            fase (concluir, hoje, amanhã, mover para cima, mover para baixo)
            não cabem soltas numa linha sem a encher de ícones, e um menu que
            só existe no dedo era pôr metade delas fora do alcance de quem
            trabalha ao computador — que é onde ela passa o dia.

            Custo, dito à frente: com rato, «Editar tarefa» passa de um clique
            a dois. Compensa-o o painel de detalhe da fase 08, onde as notas,
            os passos e as ligações se escrevem sem abrir menu nenhum, e onde o
            «Editar tarefa» está à vista.

            ── E AS SETE ACÇÕES, PELAS REGRAS DA PARTE 9.8 ──────────────────
            Cinco a oito itens; o que está indisponível OCULTA-SE em vez de
            esbater («Marcar como concluída» numa tarefa já concluída não
            aparece, e o mover só existe com a ordem manual ligada); a
            destrutiva no fim, a vermelho, separada — o `MenuDeAccoes` põe-lhe
            o filete sozinho; e NENHUM atalho de teclado escrito ao lado de um
            item, que é proibição da Apple para menus de contexto.

            O que o ponto 20 pede e não está aqui: «Escolher data…»,
            «Atribuir a…» e «Prioridade». Os três são submenus — um nível de
            profundidade que o `ui/MenuDeAccoes` não tem —, e os três já se
            fazem no «Editar tarefa», que é o item logo acima. Um segundo menu
            escrito ao lado do primeiro para lhes dar casa era a família
            duplicada que a Parte −1 do sistema de design manda não criar. */}
        <MenuDeAccoes
          className="shrink-0"
          sobre={t.title}
          accoes={[
            ...(t.done
              ? []
              : [
                  {
                    id: "editar",
                    rotulo: "Editar tarefa",
                    icone: LapisIcon,
                    onAccao: () => onEdit(t),
                  } satisfies AccaoDeItem,
                ]),
            {
              id: "concluir",
              // Um item comutável com o rótulo variável, e nunca dois itens.
              // [APPLE, 9.7]
              rotulo: t.done ? "Voltar a abrir" : "Marcar como concluída",
              icone: VistoIcon,
              onAccao: () => onToggle(t),
            },
            ...(t.done
              ? []
              : (
                  [
                    { id: "hoje", rotulo: "Hoje", icone: RelogioIcon, quando: "hoje" },
                    { id: "amanha", rotulo: "Amanhã", icone: RelogioIcon, quando: "amanha" },
                  ] as const
                ).map(
                  (a) =>
                    ({
                      id: a.id,
                      rotulo: a.rotulo,
                      icone: a.icone,
                      onAccao: () => onPrazo(t, a.quando),
                    }) satisfies AccaoDeItem,
                )),
            /* ── A ALTERNATIVA AO ARRASTO ─────────────────────────────────
               «Oferece sempre alternativa por menu ou teclado. Arrastar nunca
               é o único caminho.» [APPLE] Só aparecem com a ordenação
               «Manual», que é a única em que reordenar quer dizer alguma
               coisa — noutra ordem, mover uma linha para cima era uma ordem
               que o `sort` seguinte desfazia à frente dela. */
            ...(arrastavel
              ? ([
                  {
                    id: "subir",
                    rotulo: "Mover para cima",
                    icone: SetaIcon,
                    onAccao: () => onMover(t.id, -1),
                  },
                  {
                    id: "descer",
                    rotulo: "Mover para baixo",
                    icone: SetaBaixoIcon,
                    onAccao: () => onMover(t.id, 1),
                  },
                ] satisfies AccaoDeItem[])
              : []),
            {
              id: "eliminar",
              rotulo: "Eliminar",
              icone: CaixoteIcon,
              destrutiva: true,
              onAccao: () => onRemove(t.id),
            },
          ]}
        />
      </div>
    </li>
  );
});

export default function Tarefas({
  defaultAssignee = "",
  pedidoDeNova = 0,
}: {
  defaultAssignee?: string;
  /**
   * Sobe de um sempre que a barra de cima pede uma tarefa nova — o botão
   * «Nova tarefa» ou o ⌘N. Ver a nota no `AdminClient`: é um contador e não um
   * booleano porque dois toques seguidos têm de pedir duas vezes.
   */
  pedidoDeNova?: number;
}) {
  const { toast } = useToast();
  const anular = useAnular();
  const depoisDeApagar = useDepoisDeApagar();
  const {
    data: tasks = [],
    setData: setTasks,
    loading,
    error,
    errorMessage,
    refresh,
  } = useCachedList<Task[]>("tarefas", "/api/tarefas", {
    revalidarAoVoltar: true,
  });
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);

  /**
   * ── A LINHA DE ESCREVER, E QUEM A ABRE ────────────────────────────────
   *
   * Fechada por omissão: o conteúdo desta página são as tarefas, e um campo
   * aberto a ocupar o topo antes de haver alguma é o cartão permanente que
   * saiu daqui com outro nome.
   *
   * Abre por três caminhos, e todos acabam no mesmo sítio: o toque na última
   * linha, o botão «Nova tarefa» da barra, e o ⌘N. Os dois últimos chegam pelo
   * `pedidoDeNova`, e é o efeito abaixo que lhes dá o foco — abrir um campo
   * sem lhe pôr o cursor obriga a um segundo toque para o gesto que já foi
   * pedido.
   */
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * MARCAR UMA TAREFA NÃO PODE FAZER A LISTA SALTAR DEBAIXO DO CURSOR
   * ══════════════════════════════════════════════════════════════════════════
   *
   * «Ao marcar, a checkbox anima com mola, o texto ganha risco e desce a
   * opacidade, a linha **fica no lugar durante ~1,5 s** e só depois desliza
   * para Concluídas. Marcar e desmarcar rapidamente nunca deve fazer a lista
   * saltar. A espera de 1,5 s não é decoração — é o que permite desmarcar sem
   * a lista saltar debaixo do cursor. É o comportamento dos Lembretes e é a
   * diferença entre uma lista que se usa e uma que irrita.»
   *
   * Ela tem razão e a razão é mecânica, não estética: sem a espera, marcar a
   * terceira de cinco tira-a da lista, as duas de baixo sobem 44 px, e o dedo
   * que ia marcar a quarta acerta na quinta. Quem marca três seguidas erra
   * duas.
   *
   * O que fica AQUI é só o «onde se desenha». O risco, a opacidade e a mola da
   * caixa acontecem no mesmo instante do toque — o que espera é a mudança de
   * sítio, e mais nada.
   *
   * Desmarcar dentro da janela CANCELA o temporizador: a tarefa nunca chega a
   * ir a lado nenhum, e por isso não há salto nenhum a desfazer.
   */
  const [aDescansar, setADescansar] = useState<ReadonlySet<string>>(new Set());
  const temporizadores = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const mapa = temporizadores.current;
    return () => {
      for (const id of mapa.values()) clearTimeout(id);
      mapa.clear();
    };
  }, []);

  const descansar = useCallback((id: string, marcada: boolean) => {
    const mapa = temporizadores.current;
    const jaMarcado = mapa.get(id);
    if (jaMarcado) {
      clearTimeout(jaMarcado);
      mapa.delete(id);
    }
    if (!marcada) {
      // Desmarcou dentro da janela: sai do descanso e volta a ser o que era.
      setADescansar((antes) => {
        if (!antes.has(id)) return antes;
        const depois = new Set(antes);
        depois.delete(id);
        return depois;
      });
      return;
    }
    setADescansar((antes) => new Set(antes).add(id));
    mapa.set(
      id,
      setTimeout(() => {
        mapa.delete(id);
        setADescansar((antes) => {
          const depois = new Set(antes);
          depois.delete(id);
          return depois;
        });
      }, ESPERA_ANTES_DE_DESCER_MS),
    );
  }, []);

  const [aEscrever, setAEscrever] = useState(false);
  const campoDoTitulo = useRef<HTMLInputElement | null>(null);
  /**
   * ── O FOCO ESPERA PELO CAMPO, E NÃO POR UM FOTOGRAMA ────────────────────
   *
   * Isto pedia o foco com `requestAnimationFrame`, na aposta de que num
   * fotograma o campo já estaria desenhado. Aposta que só ganha de um lado:
   *
   *   · o botão «Nova tarefa» chega por um `onClick` do React — um evento
   *     discreto, que desenha de imediato — e o campo já existe quando o
   *     fotograma chega;
   *   · o ⌘N chega por um ouvinte NATIVO da janela (`AdminClient`), cujo
   *     `setState` o React agenda como tarefa normal, e essa pode vir DEPOIS
   *     do fotograma. O `campoDoTitulo.current` ainda era `null`, o foco não ia
   *     para lado nenhum e ficava no `<body>`.
   *
   * MEDIDO num Chromium, duas vezes seguidas: ⌘N → `document.activeElement` é
   * `BODY`, com o campo já aberto. E o que se escreve a seguir não é perdido
   * por ser inofensivo: cai nos atalhos globais da página («g» seguido de uma
   * letra muda de vista), que foi como a sonda saiu do ecrã das Tarefas a
   * meio de «Chamar fotógrafo».
   *
   * Agora são dois passos que não dependem de relógio nenhum: o pedido levanta
   * uma bandeira e abre a linha; e quem dá o foco é o efeito que corre QUANDO
   * a linha abriu, que é o único momento em que há campo. Se já estava aberta
   * (⌘N outra vez, vindo de outro sítio), o campo existe e foca-se logo.
   */
  const queroFoco = useRef(false);
  useEffect(() => {
    if (!pedidoDeNova) return;
    if (campoDoTitulo.current) {
      campoDoTitulo.current.focus();
      return;
    }
    queroFoco.current = true;
    setAEscrever(true);
  }, [pedidoDeNova]);
  useEffect(() => {
    if (!aEscrever || !queroFoco.current) return;
    queroFoco.current = false;
    campoDoTitulo.current?.focus();
  }, [aEscrever]);
  /**
   * ── E QUANDO O CAMPO FECHA, O FOCO NÃO CAI PARA O `<body>` ──────────────
   *
   * O campo que fecha é o elemento focado, e desaparece. «Nunca mudes o foco
   * sem acção da pessoa. Excepção única: quando o elemento focado desaparece
   * durante navegação por teclado — move para um vizinho.» (Parte 12.2)
   *
   * MEDIDO: `Esc` com o campo vazio deixava `document.activeElement` em
   * `BODY`, e quem navega por teclado voltava ao princípio da página. O
   * vizinho é o botão «Nova tarefa», que ocupa o mesmo sítio — e cobre os
   * dois caminhos que fecham o campo: o `Esc` e o `Shift+Enter`.
   */
  const botaoDeAbrir = useRef<HTMLButtonElement | null>(null);
  const devolverFoco = useRef(false);
  const fecharEscrever = useCallback(() => {
    devolverFoco.current = true;
    setAEscrever(false);
  }, []);
  useEffect(() => {
    if (aEscrever || !devolverFoco.current) return;
    devolverFoco.current = false;
    botaoDeAbrir.current?.focus();
  }, [aEscrever]);

  /**
   * ── A PERGUNTA DE ELIMINAR ────────────────────────────────────────────
   *
   * O que estava aqui era `confirm('Eliminar a tarefa "X"?')`. A caixa do
   * browser não cabe num ecrã de 375 px, aparece no TOPO — longe do polegar,
   * e longe da linha em que ela acabou de tocar —, diz «OK» em vez de dizer o
   * que vai fazer, e bloqueia o fio principal enquanto está aberta.
   *
   * Guarda-se a tarefa e não só o `id`: o título tem de aparecer na pergunta,
   * e a linha pode desaparecer da lista entre a pergunta e a resposta.
   */
  const [aEliminar, setAEliminar] = useState<Task | null>(null);

  // new-task form
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueDate, setDueDate] = useState("");
  /* O responsável com que a linha ABRE. Vive numa função e não escrito duas
     vezes porque é lido em três sítios — ao montar, ao limpar depois de criar,
     e para saber se ela mexeu no campo antes de a leitura lhe tocar. Três
     cópias do mesmo `?:` era o mesmo que três oportunidades de discordarem. */
  const PREDEFINIDO = useCallback(
    () => (defaultAssignee && defaultAssignee !== "Equipa" ? defaultAssignee : ""),
    [defaultAssignee],
  );
  const [assignee, setAssignee] = useState(PREDEFINIDO);
  const [area, setArea] = useState("");

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O QUE ELA ESCREVE NA LINHA, LIDO — E MOSTRADO ANTES DE ACONTECER
   * ══════════════════════════════════════════════════════════════════════════
   *
   * «Confirmar florista amanhã às 10h #Ana !alta» tem lá dentro uma data, uma
   * hora, um responsável e uma prioridade. O motor que os lê está em
   * `lib/tarefas/linguagem-natural.ts`, é puro, e recusa-se a adivinhar — na
   * dúvida não extrai nada, porque uma data errada só se descobre no dia.
   *
   * ── E MOSTRA-SE, EM VEZ DE ACONTECER EM SILÊNCIO ────────────────────────
   *
   * Esta é a decisão que interessa. Uma extracção silenciosa faz duas coisas
   * más ao mesmo tempo: come a palavra do título — ela escreve «amanhã» e a
   * palavra desaparece sem explicação — e acerta 90% das vezes, com os 10% que
   * falham a ficarem guardados como se fossem verdade.
   *
   * Por isso o que se lê aparece por baixo do campo, em pastilhas, ENQUANTO
   * ela escreve: o que ela vê é o que vai ficar. E se não quiser nada disto,
   * há um botão que o desliga — o texto fica exactamente como o escreveu.
   *
   * ── E NÃO SE ESCREVE NOS CAMPOS ENQUANTO ELA ESCREVE ────────────────────
   *
   * Os quatro campos de baixo são dela. Escrever-lhes por cima a cada tecla
   * dava uma caixa de data a saltar enquanto ela pensa, e apagava o que ela lá
   * tivesse posto à mão. O que a leitura preenche, preenche no momento de
   * CRIAR — e só onde ela não tocou.
   */
  const [semInterpretar, setSemInterpretar] = useState(false);
  const lida: Interpretacao = useMemo(() => interpretarTarefa(title), [title]);
  const aInterpretar = !semInterpretar && lida.marcas.length > 0;

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A EQUIPA É UMA LISTA DE PESSOAS, NÃO UMA CAIXA DE TEXTO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O responsável era escrito à mão. «Ana», «ana» e «Ana R.» eram três
   * colaboradoras diferentes para o produto — e uma tarefa atribuída a uma
   * delas não aparecia no filtro das outras duas. O sistema sabe exactamente
   * quem trabalha aqui (as contas estão configuradas) e nunca o perguntava.
   *
   * VAZIO NÃO É «NÃO HÁ NINGUÉM». É «não sei quem são»: a instalação com
   * palavra-passe partilhada não tem contas nomeadas, e aí o campo tem de
   * continuar a aceitar um nome escrito à mão. Uma lista vazia que fechasse o
   * campo tirava a funcionalidade a quem ainda não migrou.
   *
   * Pelo `useCachedList` e não por um efeito próprio: é o gancho que esta
   * página já usa para as tarefas, trata da cache e da revalidação, e evita
   * mais uma gravação de estado escrita dentro de um `useEffect` — que é um
   * aviso que este ficheiro não tem nenhum e não vai passar a ter.
   */
  const { data: respostaDaEquipa } = useCachedList<{ nomes?: string[] }>(
    "equipa",
    "/api/admin/equipa",
  );
  const equipa = useMemo(
    () => (Array.isArray(respostaDaEquipa?.nomes) ? respostaDaEquipa.nomes : []),
    [respostaDaEquipa],
  );

  /**
   * As opções do campo de responsável.
   *
   * A equipa configurada MAIS o que já estiver escrito naquela tarefa. A
   * segunda metade é a que evita o estrago: há tarefas antigas atribuídas a
   * nomes que não são conta nenhuma («Ana R.», «o fornecedor»), e uma lista
   * fechada apagava-as em silêncio no primeiro `select` que se tocasse. Uma
   * migração que perde dados não é uma migração.
   */
  const opcoesDeResponsavel = useCallback(
    (actual: string): string[] => {
      const nomes = [...equipa];
      const escrito = (actual ?? "").trim();
      if (escrito && !nomes.includes(escrito)) nomes.push(escrito);
      return nomes;
    },
    [equipa],
  );

  // filter
  const [who, setWho] = useState<string>("Todos");

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A LISTA ESCOLHIDA, O AGRUPAMENTO E A ORDEM — as fases 05 e 06
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Três estados e não um: a lista diz O QUE se vê, o agrupamento diz como se
   * reparte, e a ordem diz por que fila. São perguntas independentes — «as
   * atrasadas, por responsável, por prioridade» é uma pergunta legítima — e
   * cada uma tem o seu selector.
   *
   * A `ordemManual` é a lista de ids que a fase 09 vai reordenar ao arrastar.
   * Vive aqui e não no servidor porque o `Task` não tem campo de posição; ver
   * o relatório dessa fase, que é onde a persistência tem de ser decidida.
   */
  const [lista, setLista] = useState<ListaId>(LISTA_POR_OMISSAO);
  const [agrupamento, setAgrupamento] = useState<Agrupamento>(AGRUPAMENTO_POR_OMISSAO);
  const [ordenacao, setOrdenacao] = useState<Ordenacao>(ORDENACAO_POR_OMISSAO);
  const [ordemManual, setOrdemManual] = useState<readonly string[]>([]);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A TAREFA ESCOLHIDA — a que o painel de detalhe mostra (fase 08)
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Um id e não a tarefa: a lista é optimista e a tarefa muda de identidade a
   * cada gravação. Guardar o objecto dava um painel a mostrar a versão de antes
   * de ela lhe ter tocado — e a mostrar uma tarefa que já foi eliminada.
   */
  const [escolhida, setEscolhida] = useState<string | null>(null);

  /**
   * ── E O PAINEL VAI TER COM ELA, NO ECRÃ ESTREITO ────────────────────────
   *
   * Abaixo de `lg` o painel não é uma coluna ao lado: é um bloco por BAIXO da
   * lista. Numa lista de vinte tarefas isso é meio ecrã de distância — ela
   * toca numa e não acontece nada à vista, que se lê como avaria.
   *
   * `nearest` e não `start`: rola o MÍNIMO para o painel aparecer, em vez de o
   * atirar para o topo e levar a lista para fora do ecrã. E `auto` para quem
   * pediu para não animar — um `smooth` é movimento como qualquer outro.
   */
  const painelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!escolhida) return;
    const el = painelRef.current;
    if (!el || typeof window.matchMedia !== "function") return;
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    const calmo = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", behavior: calmo ? "auto" : "smooth" });
  }, [escolhida]);

  /* ── O ARRASTO (fase 09) ────────────────────────────────────────────────
     Duas coisas em estado, porque as duas se DESENHAM: qual é a linha que
     está a ser arrastada (fica a meia opacidade) e onde é que ela entra (a
     linha de inserção). O resto do arrasto vive em refs — os manipuladores
     montam-se uma vez e não podem fechar sobre o valor do primeiro desenho. */
  const [aArrastar, setAArrastar] = useState<string | null>(null);
  const [alvoDoArrasto, setAlvoDoArrasto] = useState<string | "fim" | null>(null);
  const aArrastarRef = useRef<string | null>(null);
  const alvoRef = useRef<string | "fim" | null>(null);

  // inline edit
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskFields, setEditTaskFields] = useState({
    title: "",
    priority: "normal" as TaskPriority,
    dueDate: "",
    assignee: "",
    area: "",
  });

  // A lista actual, sempre à mão para os manipuladores optimistas, sem os
  // obrigar a mudar de identidade a cada alteração (o que desfaria o `memo()`
  // das linhas).
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  });

  const startEditTask = useCallback((t: Task) => {
    setEditingTaskId(t.id);
    setEditTaskFields({
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate ?? "",
      assignee: t.assignee ?? "",
      area: t.area ?? "",
    });
  }, []);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * UMA GRAVAÇÃO, E UMA FRASE QUE DIZ QUAL TAREFA
   * ══════════════════════════════════════════════════════════════════════
   *
   * As quatro escritas deste ficheiro tinham cada uma a sua cópia do mesmo
   * `try { fetch } catch { toast("Não foi possível …") }`, e as quatro frases
   * serviam seis situações com respostas diferentes — a rede em baixo, a
   * sessão expirada, a tarefa apagada por outra pessoa, o servidor em baixo.
   * Nenhuma delas dizia QUAL tarefa: numa lista de dezasseis linhas, «Não foi
   * possível atualizar a tarefa» não chega para saber o que não ficou feito.
   *
   * Agora há um sítio só a fazer o pedido, a verificar o `ok` e a escolher a
   * frase (`porque-falhou`), e devolve `ok` em vez de atirar porque quem chama
   * tem de poder REPOR o ecrã. É o padrão de `MaterialListas`.
   */
  const gravar = useCallback(
    async (
      oQue: string,
      url: string,
      init?: RequestInit,
    ): Promise<{ ok: boolean; corpo: unknown }> => {
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
    },
    [toast],
  );

  async function saveEditTask(id: string) {
    // Repõe-se ESTA tarefa, não a lista. Ver a nota sobre a reposição em `toggle`.
    const anterior = tasksRef.current.find((t) => t.id === id);
    // O nome no aviso é o que ela vê na lista DEPOIS da reposição — o antigo.
    // Nomear a tarefa pelo título novo mandava-a procurar uma linha que o ecrã
    // já não tem.
    const titulo = anterior?.title || editTaskFields.title.trim() || "tarefa";
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, ...editTaskFields, title: editTaskFields.title.trim() || t.title }
          : t,
      ),
    );
    setEditingTaskId(null);
    const { ok } = await gravar(`guardar as alterações a «${titulo}»`, `/api/tarefas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...editTaskFields,
        title: editTaskFields.title.trim() || undefined,
      }),
    });
    if (!ok && anterior) setTasks((prev) => prev.map((t) => (t.id === id ? anterior : t)));
    if (!ok || !anterior) return;
    const voltar: Record<string, unknown> = {};
    for (const k of Object.keys(editTaskFields) as (keyof Task)[]) voltar[k] = anterior[k] ?? null;
    anular(`«${titulo}» atualizada.`, () =>
      gravarCampos(id, voltar as Partial<Task>, `voltar ao que estava em «${titulo}»`),
    );
  }

  async function add(fecharDepois = false) {
    /**
     * ── O QUE SE LEU DA LINHA ENTRA AQUI, E NÃO ANTES ────────────────────
     *
     * A regra é uma só: **o que ela escreveu à mão ganha sempre**. A leitura
     * só preenche o campo que continua no valor de partida — prazo vazio,
     * prioridade `normal`, responsável no que a equipa deu por omissão.
     *
     * Sem esta regra, escrever «amanhã» na linha apagava a data que ela tinha
     * acabado de escolher no campo de baixo, e ela via o seu próprio gesto a
     * ser desfeito por uma palavra.
     *
     * A hora junta-se à data com um `T` e o `tituloEPrazo` arruma-a: o prazo
     * grava-se como DIA e a hora vai para o título («… às 10h»). Gravada no
     * prazo, a tarefa saía de «Hoje» e a coluna `date` perdia-a ao recarregar
     * (ver `lib/tarefas/prazo.ts`). Uma hora sem data não vale nada sozinha —
     * «às 10h» de que dia? — e por isso só entra acompanhada.
     */
    const usar = aInterpretar ? lida : null;
    const t = (usar ? usar.titulo : title).trim();
    if (!t || adding) return;

    const prazoLido =
      usar?.data && !dueDate
        ? usar.hora
          ? `${usar.data.valor}T${usar.hora.valor}`
          : usar.data.valor
        : dueDate;
    const responsavelLido =
      usar?.responsavel && assignee.trim() === PREDEFINIDO()
        ? usar.responsavel.valor
        : assignee.trim();
    const prioridadeLida =
      usar?.prioridade && priority === "normal" ? usar.prioridade.valor : priority;

    const comPrazo = tituloEPrazo(t, prazoLido);

    setAdding(true);
    const { ok, corpo } = await gravar(`criar a tarefa «${t}»`, "/api/tarefas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: comPrazo.title,
        priority: prioridadeLida,
        dueDate: comPrazo.dueDate || undefined,
        assignee: responsavelLido || undefined,
        area: area || undefined,
      }),
    });
    setAdding(false);
    if (!ok) return;
    const task = corpo as Task | null;
    // Um 200 sem tarefa no corpo não é uma tarefa criada: enfiar `null` na
    // lista rebentava a linha a seguir, ao desenhá-la. Gravada está — o que
    // falta é a versão do servidor, e essa vem no recarregamento.
    if (!task?.id) {
      toast(
        `A tarefa «${t}» ficou gravada, mas não voltou do servidor. Atualiza a página.`,
        "error",
      );
      return;
    }
    setTasks((prev) => [task, ...prev]);
    // Acrescentar anula-se apagando a que se criou — nada mais aponta para ela.
    anular(`Tarefa «${task.title}» criada.`, async () => {
      setTasks((prev) => prev.filter((x) => x.id !== task.id));
      const { ok: apagou } = await gravar(
        `tirar a tarefa «${task.title}»`,
        `/api/tarefas/${task.id}`,
        {
          method: "DELETE",
        },
      );
      if (!apagou)
        setTasks((prev) => (prev.some((x) => x.id === task.id) ? prev : [task, ...prev]));
      return apagou;
    });
    setTitle("");
    setDueDate("");
    setPriority("normal");
    setArea("");
    setAssignee(PREDEFINIDO());
    setSemInterpretar(false);
    /* `Enter` deixa a linha aberta e vazia — quem escreve tarefas escreve-as em
       rajada. `⇧Enter` fecha, para quem só tinha uma. O foco volta ao campo
       nos dois casos em que ele continua a existir: sem isto, a gravação
       tira-o (o campo esteve `disabled`) e a tarefa seguinte precisava de um
       toque que ninguém pediu. */
    if (fecharDepois) fecharEscrever();
    else requestAnimationFrame(() => campoDoTitulo.current?.focus());
  }

  /* O `toggle` chama-se a si próprio (o «Anular» é um marcar ao contrário), e
     um `useCallback` não se vê por dentro. O ref é a ponte, e é actualizado a
     seguir à definição. */
  const alternarRef = useRef<(t: Task) => void>(() => {});
  const alternar = useCallback((t: Task) => alternarRef.current(t), []);

  const toggle = useCallback(
    async (task: Task) => {
      // Optimistic tick, but undo it if the server rejects — otherwise the box
      // stays flipped while the task is unchanged, and desyncs on next reload.
      //
      // A reposição é DESTA tarefa e mais nenhuma. Repor a lista inteira (que era
      // o que se fazia) desfazia tudo o que tivesse gravado bem enquanto este
      // pedido estava a caminho: ela risca uma tarefa, o pedido lento de outra
      // volta com erro, e a primeira desmarca-se sozinha no ecrã apesar de estar
      // concluída no servidor — o desfecho que o `touch` do `tasks-store` existe
      // para impedir, só que aqui sem servidor nenhum pelo meio.
      const passaAMarcada = !task.done;
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: passaAMarcada } : t)));
      /* A linha fica no lugar durante segundo e meio — ver `aDescansar`. O
         risco e a mola já aconteceram; o que espera é a mudança de sítio. */
      descansar(task.id, passaAMarcada);
      const { ok } = await gravar(
        task.done
          ? `reabrir a tarefa «${task.title}»`
          : `dar por concluída a tarefa «${task.title}»`,
        `/api/tarefas/${task.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ done: passaAMarcada }),
        },
      );
      if (!ok) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: task.done } : t)));
        descansar(task.id, task.done);
        return;
      }
      /* ── E DESFAZER, SEMPRE ────────────────────────────────────────────
         «Toast "Tarefa concluída — Anular".» [APPLE: desfazer sempre]

         Só ao CONCLUIR. Reabrir uma tarefa não perde nada — ela volta à lista
         onde estava —, e um aviso a oferecer desfazer uma coisa que não se
         perdeu é ruído que ensina a ignorar os avisos que importam. */
      if (passaAMarcada) {
        toast(`Tarefa concluída — «${task.title}»`, "success", {
          rotulo: "Anular",
          /* Anular é marcar ao contrário, e passa pelo MESMO caminho: grava,
             repõe se o servidor recusar, e cancela o descanso para a linha
             nunca chegar a descer. Uma segunda implementação de «desmarcar»
             era o sítio onde as duas divergiam. */
          aoTocar: () => void alternar({ ...task, done: true }),
        });
      }
    },
    [setTasks, gravar, descansar, toast, alternar],
  );
  useEffect(() => {
    alternarRef.current = toggle;
  }, [toggle]);

  const remove = useCallback(
    async (id: string) => {
      const t = tasksRef.current.find((x) => x.id === id);
      // Guardamos a tarefa e o sítio dela, não a lista: se a eliminação for
      // recusada devolve-se ESTA linha ao lugar sem mexer no que outras
      // gravações tenham feito entretanto (ver a nota em `toggle`).
      const posicao = tasksRef.current.findIndex((x) => x.id === id);
      setTasks((prev) => prev.filter((x) => x.id !== id));
      const { ok, corpo } = await gravar(
        `eliminar a tarefa «${t?.title ?? "sem título"}»`,
        `/api/tarefas/${id}`,
        {
          method: "DELETE",
        },
      );
      if (!ok && t) {
        setTasks((prev) => {
          if (prev.some((x) => x.id === id)) return prev;
          const onde = Math.min(posicao < 0 ? prev.length : posicao, prev.length);
          return [...prev.slice(0, onde), t, ...prev.slice(onde)];
        });
      }
      // Foi para a Reciclagem: o aviso traz «Anular», que a repõe tal e qual.
      if (ok && t) depoisDeApagar(corpo, `«${t.title}» eliminada.`, () => void refresh());
    },
    [setTasks, gravar, depoisDeApagar, refresh],
  );

  /**
   * Perguntar primeiro, e só depois eliminar.
   *
   * A pergunta fica aqui e não dentro do `remove` de propósito: o `remove` é o
   * que AGE — tira a linha, chama o servidor, repõe-na se for recusado — e
   * misturar as duas coisas fazia com que qualquer sítio que quisesse eliminar
   * sem perguntar (uma acção em lote, um desfazer) tivesse de contornar a
   * caixa em vez de simplesmente não a abrir.
   *
   * Sem a tarefa não há nada para nomear na pergunta, e uma pergunta que não
   * diz o que se perde não vale o toque: nesse caso elimina-se e pronto.
   */
  const pedirParaEliminar = useCallback(
    (id: string) => {
      const t = tasksRef.current.find((x) => x.id === id);
      if (!t) {
        void remove(id);
        return;
      }
      setAEliminar(t);
    },
    [remove],
  );

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * GRAVAR UNS CAMPOS DE UMA TAREFA — o caminho do painel e do menu
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O `saveEditTask` grava a linha de edição inteira; isto grava um punhado de
   * campos. É o mesmo desenho — optimista à ida, ESTA tarefa reposta se o
   * servidor recusar (e não a lista, ver a nota no `toggle`) — e passa pelo
   * mesmo `gravar`, para a frase do erro continuar a dizer QUAL tarefa e o quê.
   *
   * Devolve `ok` porque quem chama pode precisar de saber: o painel de detalhe
   * não celebra uma gravação que não aconteceu.
   */
  const gravarCampos = useCallback(
    async (id: string, campos: Partial<Task>, oQue: string): Promise<boolean> => {
      const anterior = tasksRef.current.find((t) => t.id === id);
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...campos } : t)));
      const { ok } = await gravar(oQue, `/api/tarefas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campos),
      });
      if (!ok && anterior) setTasks((prev) => prev.map((t) => (t.id === id ? anterior : t)));
      return ok;
    },
    [gravar, setTasks],
  );

  /**
   * ── O MESMO, COM «ANULAR» ───────────────────────────────────────────────
   * «Tem que haver em tudo uma forma de voltar atrás» (10/10,
   * `docs/TUDO-REVERSIVEL.md`). Grava como o `gravarCampos` e, se ficou, oferece
   * o «Anular» da casa com os valores de ANTES dos campos que mudaram — `null`
   * quando não havia nada, para apagar mesmo (o esquema aceita `nullish`).
   */
  /* O `gravarCampos` pela ref, como o `alternar`: o resultado dele sai destas
     funções (é o que o «Anular» espera), e o React Compiler deixava de
     conseguir guardar a memorização do ecrã com ele na lista de dependências. */
  const gravarCamposRef = useRef(gravarCampos);
  useEffect(() => {
    gravarCamposRef.current = gravarCampos;
  }, [gravarCampos]);

  const gravarComAnular = useCallback(
    async (id: string, campos: Partial<Task>, oQue: string): Promise<boolean> => {
      const anterior = tasksRef.current.find((t) => t.id === id);
      const ok = await gravarCamposRef.current(id, campos, oQue);
      if (!ok || !anterior) return ok;
      const voltar: Record<string, unknown> = {};
      for (const k of Object.keys(campos) as (keyof Task)[]) {
        const antes = anterior[k];
        voltar[k] = antes ?? (Array.isArray(campos[k]) ? [] : null);
      }
      anular(`Feito: ${oQue}.`, () =>
        gravarCamposRef.current(id, voltar as Partial<Task>, `voltar atrás em «${anterior.title}»`),
      );
      return ok;
    },
    [anular],
  );

  // Uma passagem só: as pessoas, e quantas tarefas por fazer tem cada uma. Antes
  // cada botão de pessoa varria a lista toda (`tasks.filter`) a cada render.
  const { people, openByPerson } = useMemo(() => {
    const counts = new Map<string, number>();
    const seen: string[] = [];
    /**
     * A EQUIPA ENTRA PRIMEIRO, mesmo quem não tem tarefa nenhuma.
     *
     * Esta lista nascia só do que estivesse ESCRITO nas tarefas — ou seja, uma
     * colaboradora sem nada atribuído não existia no filtro, e não havia como
     * perguntar «o que é que a Ana tem?» e receber «nada». A ausência de
     * resposta e a resposta «nada» são coisas diferentes.
     *
     * Os nomes escritos à mão que não são conta nenhuma continuam a aparecer, a
     * seguir: são as tarefas antigas, e desaparecerem do filtro seria
     * escondê-las.
     */
    for (const nome of equipa) {
      counts.set(nome, 0);
      seen.push(nome);
    }
    for (const t of tasks) {
      if (!t.assignee) continue;
      if (!counts.has(t.assignee)) {
        counts.set(t.assignee, 0);
        seen.push(t.assignee);
      }
      if (!t.done) counts.set(t.assignee, counts.get(t.assignee)! + 1);
    }
    return { people: ["Todos", ...seen], openByPerson: counts };
  }, [tasks, equipa]);

  const todayStr = todayKey();

  /**
   * ── AS LISTAS POR EVENTO E AS CONTAGENS NASCEM DA LISTA INTEIRA ──────────
   *
   * E não do que está à frente dela. Uma barra lateral cujos números mudassem
   * com o filtro por pessoa deixava de responder à pergunta que se lhe faz —
   * «há quanto atrasado?» — porque já estaria a responder «da Ana, há dois».
   * O filtro por pessoa aperta o CONTEÚDO da lista escolhida; a barra continua
   * a contar a casa toda.
   */
  const eventos = useMemo(() => listasDeEvento(tasks), [tasks]);
  const contas = useMemo(
    () => contarPorLista(tasks, todayStr, eventos),
    [tasks, todayStr, eventos],
  );

  /**
   * Uma lista de evento morre quando a última tarefa dela sai — e ela podia
   * estar dentro dessa lista no momento em que risca a última. Sem esta queda
   * para «Todas», ficava num destino que já não existe a olhar para um vazio
   * que não é o dela.
   */
  const listaActiva: ListaId = contas.has(lista) ? lista : LISTA_POR_OMISSAO;
  const rotuloDaLista =
    [...LISTAS_INTELIGENTES, ...eventos].find((l) => l.id === listaActiva)?.rotulo ?? "";

  // Filtrar e ordenar acontecia em CADA render — inclusive a cada tecla escrita
  // no campo "Nova tarefa", que é estado deste componente. Só depende da lista
  // escolhida, do filtro de pessoa e da ordem.
  const { open, done } = useMemo(() => {
    const daLista = tasks.filter((t) => pertenceALista(t, listaActiva, todayStr));
    const visible = who === "Todos" ? daLista : daLista.filter((t) => t.assignee === who);
    /* ── A TAREFA ACABADA DE MARCAR FICA NO LUGAR ─────────────────────────
       Ver `aDescansar`: durante segundo e meio depois de marcada, a tarefa
       continua a contar como «por fazer» para efeitos de ONDE se desenha.
       Marcada continua marcada — o risco e a mola são imediatos —, o que
       espera é a mudança de sítio. */
    const openTasks = ordenarTarefas(
      visible.filter((t) => !t.done || aDescansar.has(t.id)),
      ordenacao,
      ordemManual,
    );
    const doneTasks = visible.filter((t) => t.done && !aDescansar.has(t.id));
    return { open: openTasks, done: doneTasks };
  }, [tasks, who, aDescansar, listaActiva, todayStr, ordenacao, ordemManual]);

  /* Repartir é a outra pergunta, e é a última: agrupa-se o que já está
     ordenado, para a ordem escolhida valer DENTRO de cada cabeçalho. */
  const grupos = useMemo(
    () => agruparTarefas(open, agrupamento, todayStr),
    [open, agrupamento, todayStr],
  );

  /* Quantas já passaram do prazo. É a metade da verdade que «8 por fazer»
     esconde, e é a que faz alguém mudar de plano. */
  const atrasadas = useMemo(
    () => open.filter((t) => !!t.dueDate && t.dueDate < todayStr).length,
    [open, todayStr],
  );

  /**
   * ── «MANUAL» E «AGRUPAR» NÃO CABEM AO MESMO TEMPO, E DIZEM-NO ────────────
   *
   * Arrastar uma tarefa dentro de uma lista repartida por dias não é reordenar:
   * é mudar-lhe a data ao largá-la noutro cabeçalho — outra funcionalidade,
   * outra fase. Escolher «Manual» desfaz o agrupamento e escolher um
   * agrupamento desfaz o «Manual».
   *
   * O que NÃO se faz é desactivar o selector do outro. Um controlo apagado que
   * não explica porquê é o defeito que o ponto 6 da auditoria deste ecrã
   * nomeia; aqui a mudança acontece à frente dela, nos dois selectores, e
   * desfaz-se com um toque.
   */
  const escolherOrdenacao = (v: Ordenacao) => {
    setOrdenacao(v);
    if (v !== "manual") return;
    /**
     * ── DE ONDE VEM A ORDEM MANUAL AO SER LIGADA ────────────────────────
     *
     * Duas origens, e a pergunta que as separa é «já houve uma arrumação?».
     *
     *  · NUNCA houve: arranca igual ao que está no ecrã (`ordemVisivel`).
     *    Pedir para arrumar à mão não pode fazer a lista saltar antes de se
     *    lhe tocar — é a razão escrita no `ordemVisivel`, e continua de pé.
     *  · JÁ houve: arranca da ordem GUARDADA (`ordemGuardada`, pelas
     *    posições). Aqui a lista salta, e é suposto: saltar para a arrumação
     *    que ela própria fez é o motivo de a termos gravado. O contrário —
     *    ligar «Manual» e receber a ordem por data — apagava-lhe o trabalho
     *    ao primeiro arrasto seguinte.
     *
     * Em qualquer dos casos a ordem tem de conter a lista TODA e não só o que
     * está à frente dela: um filtro por pessoa ou uma lista de evento mostram
     * um pedaço, e as tarefas de fora não podem perder o sítio por não
     * estarem à vista.
     */
    const visiveis = ordemVisivel(grupos);
    const guardada = ordemGuardada(tasks);
    const base = tasks.some((t) => typeof t.posicao === "number") ? guardada : visiveis;
    const resto = guardada.filter((id) => !base.includes(id));
    setOrdemManual([...base, ...resto]);
    setAgrupamento("nenhum");
  };
  const escolherAgrupamento = (v: Agrupamento) => {
    setAgrupamento(v);
    if (v !== "nenhum" && ordenacao === "manual") setOrdenacao(ORDENACAO_POR_OMISSAO);
  };

  /* A ordem do que está à frente dela, e a ordem manual inteira, em refs: os
     manipuladores do arrasto montam-se uma vez e não podem fechar sobre o
     valor do primeiro desenho. */
  const idsVisiveis = useMemo(() => open.map((t) => t.id), [open]);
  const idsVisiveisRef = useRef(idsVisiveis);
  const ordemManualRef = useRef(ordemManual);
  useEffect(() => {
    idsVisiveisRef.current = idsVisiveis;
    ordemManualRef.current = ordemManual;
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * REORDENAR — e a ordem sobrevive ao recarregamento (fase 09)
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `reordenarManualmente` (em `lib/tarefas/listas`) diz qual é a ordem nova;
   * `posicoesDepoisDeMover` (em `lib/tarefas/posicoes`) diz o que se GRAVA para
   * ela lá continuar amanhã. As duas são puras e estão testadas sozinhas; o que
   * está aqui é só a ligação entre elas e o ecrã.
   *
   * A ordem que se move é a MANUAL INTEIRA e não a que está à vista: com um
   * filtro por pessoa ligado, mexer numa linha não pode reatribuir sítio às
   * tarefas que o filtro escondeu.
   */
  const gravarOrdem = useCallback((ordem: readonly string[], mover: string) => {
    /* As tarefas que já não existem saem antes de se calcular seja o que for:
         um id fantasma na ordem manual (uma tarefa eliminada noutro
         separador) obrigava a renumerar a lista toda e, pior, mandava um
         `PATCH` a um endereço que responde 404. */
    const existentes = ordem.filter((id) => tasksRef.current.some((t) => t.id === id));
    const escritas = posicoesDepoisDeMover(
      existentes,
      (id) => tasksRef.current.find((t) => t.id === id)?.posicao,
      mover,
    );
    return Promise.all(
      escritas.map((e) =>
        gravarCamposRef.current(e.id, { posicao: e.posicao }, "guardar a ordem das tarefas"),
      ),
    ).then((r) => r.every(Boolean));
  }, []);

  const aplicarOrdem = useCallback(
    (mover: string, destino: string | null) => {
      const base = ordemManualRef.current.length
        ? [...ordemManualRef.current]
        : [...idsVisiveisRef.current];
      const nova = reordenarManualmente(base, mover, destino);
      // Largar uma linha onde ela já estava não é um movimento: nem se grava,
      // nem se avisa, nem se oferece desfazer uma coisa que não aconteceu.
      if (nova.length === base.length && nova.every((id, i) => id === base[i])) return;
      setOrdemManual(nova);
      void gravarOrdem(nova, mover);

      /* ── O ANÚNCIO, E O DESFAZER ──────────────────────────────────────────
         «Arrasto com alternativa por menu e anúncio em `role="status"`»
         (Parte 6) e «permite desfazer sempre» [APPLE, 12.4]. O aviso da casa é
         as duas coisas: tem `role="status"`, portanto quem ouve o ecrã recebe
         o resultado do gesto, e leva o «Anular» que repõe a ordem anterior —
         e que a volta a gravar, senão o desfazer durava até ao recarregamento
         seguinte.

         A posição é contada na lista VISÍVEL: «3 de 12» tem de bater com o que
         ela consegue contar com o dedo no ecrã, e não com o total escondido. */
      const visiveis = nova.filter((id) => idsVisiveisRef.current.includes(id));
      const onde = visiveis.indexOf(mover);
      const titulo = tasksRef.current.find((t) => t.id === mover)?.title ?? "Tarefa";
      // O «Anular» da casa: espera pelo servidor e diz «Anulado.» só se ficou.
      anular(`«${titulo}» movida — ${onde + 1} de ${visiveis.length}`, () => {
        setOrdemManual(base);
        return gravarOrdem(base, mover);
      });
    },
    [gravarOrdem, anular],
  );

  /**
   * «Mover para cima» / «Mover para baixo» — a alternativa ao arrasto, que
   * nunca pode ser o único caminho. [APPLE, 12.4]
   *
   * Conta-se na lista VISÍVEL (é a que ela vê) e aplica-se à manual inteira. A
   * assimetria entre as duas direcções não é um lapso: `reordenarManualmente`
   * insere ANTES do destino, portanto subir uma casa é «antes do vizinho de
   * cima» e descer uma casa é «antes do vizinho do vizinho» — ou no fim, se
   * não houver segundo vizinho.
   */
  const mover = useCallback(
    (id: string, direccao: -1 | 1) => {
      const visiveis = idsVisiveisRef.current;
      const i = visiveis.indexOf(id);
      if (i < 0) return;
      if (direccao === -1) {
        if (i === 0) return;
        aplicarOrdem(id, visiveis[i - 1]);
      } else {
        if (i >= visiveis.length - 1) return;
        aplicarOrdem(id, visiveis[i + 2] ?? null);
      }
    },
    [aplicarOrdem],
  );

  /* ── OS QUATRO MOMENTOS DO ARRASTO ────────────────────────────────────────
     Arrasto nativo do browser (`draggable`) e não ponteiros à mão: dá de graça
     a imagem translúcida da linha, o scroll automático do contentor e o
     regresso à origem quando o largar falha — três coisas que a Parte 12.4
     exige e que uma reimplementação em `pointermove` teria de refazer pior.
     Onde o nativo não chega é no dedo, e é por isso que o menu tem «Mover para
     cima» e «Mover para baixo». */
  const limparArrasto = useCallback(() => {
    aArrastarRef.current = null;
    alvoRef.current = null;
    setAArrastar(null);
    setAlvoDoArrasto(null);
  }, []);

  const arrastar = useMemo(
    () => ({
      comecar: (e: React.DragEvent<HTMLElement>) => {
        const id = e.currentTarget.dataset.tarefa;
        if (!id) return;
        aArrastarRef.current = id;
        setAArrastar(id);
        e.dataTransfer.effectAllowed = "move";
        // Sem dados no `dataTransfer` o Firefox não chega a começar o arrasto.
        e.dataTransfer.setData("text/plain", id);
      },
      porCima: (e: React.DragEvent<HTMLElement>) => {
        if (!aArrastarRef.current) return;
        // Sem o `preventDefault` o browser recusa o largar — é assim que ele
        // distingue um destino que aceita de um que não aceita.
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const id = e.currentTarget.dataset.tarefa;
        if (!id) return;
        /* Metade de cima da linha, entra ANTES dela; metade de baixo, entra
           antes da seguinte — que é o mesmo que dizer «depois desta». É o que
           faz a linha de inserção cair entre duas linhas e não em cima de uma,
           e o que permite chegar ao fim da lista. */
        const caixa = e.currentTarget.getBoundingClientRect();
        const emCima = e.clientY < caixa.top + caixa.height / 2;
        const visiveis = idsVisiveisRef.current;
        const i = visiveis.indexOf(id);
        const alvo = emCima ? id : (visiveis[i + 1] ?? "fim");
        if (alvo === alvoRef.current) return;
        alvoRef.current = alvo;
        setAlvoDoArrasto(alvo);
      },
      largar: (e: React.DragEvent<HTMLElement>) => {
        e.preventDefault();
        const oQue = aArrastarRef.current;
        const alvo = alvoRef.current;
        limparArrasto();
        if (oQue && alvo) aplicarOrdem(oQue, alvo === "fim" ? null : alvo);
      },
      acabar: limparArrasto,
    }),
    [aplicarOrdem, limparArrasto],
  );

  /** «Hoje» e «Amanhã» do menu da linha — o prazo sem abrir o editor. */
  const porPrazo = useCallback(
    (t: Task, quando: "hoje" | "amanha") => {
      const dia = quando === "hoje" ? todayStr : amanha(todayStr);
      void gravarComAnular(
        t.id,
        { dueDate: dia },
        `pôr «${t.title}» para ${quando === "hoje" ? "hoje" : "amanhã"}`,
      );
    },
    [gravarComAnular, todayStr],
  );

  const escolher = useCallback((t: Task) => setEscolhida(t.id), []);

  /* A tarefa escolhida, tirada da lista VIVA e não guardada à parte: é o que
     faz o painel mostrar o que ela acabou de gravar, e desaparecer quando a
     tarefa é eliminada noutro sítio. */
  const tarefaEscolhida = useMemo(
    () => tasks.find((t) => t.id === escolhida) ?? null,
    [tasks, escolhida],
  );

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O TECLADO DA LISTA (fase 09, ponto 21)
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Vive num `onKeyDown` do contentor da lista e não num ouvinte da janela: os
   * atalhos globais do back office (⌘K, ⌘N, `g`+tecla) são do `AdminClient`, e
   * uma segunda escuta na janela a disputar as mesmas teclas é como se perde a
   * conta a quem responde a quê. Aqui só respondem teclas premidas DENTRO da
   * lista.
   *
   *  · `↓` / `↑` — linha seguinte e anterior. Movem o foco para o título, que é
   *    o que abre o detalhe: é o percurso que a Parte 12.2 descreve («ao entrar
   *    na tabela, foca a primeira linha»).
   *  · `⌘⌫` — eliminar. Passa pela mesma pergunta do botão, e não por um
   *    caminho só do teclado: uma tarefa apagada por engano com a mão no
   *    modificador errado não tem volta.
   *  · `⇧F10` e a tecla de menu — o menu da linha, que é o que o Windows e o
   *    macOS já ensinaram a toda a gente. [Sistema de design, 12.3]
   *
   * O que o documento pede e NÃO está aqui, com a razão:
   *
   *  · `Espaço` a marcar a linha focada. O foco, nesta lista, está num BOTÃO —
   *    o título —, e o `Espaço` num botão é o que o activa. Roubar-lho para
   *    marcar a caixa era partir o teclado de um botão para dar um atalho a
   *    uma caixa que está a um `⇧Tab` de distância e que já responde ao
   *    `Espaço` como manda a norma.
   *  · `⌘1`–`⌘5` a trocar de lista. São os atalhos com que o browser troca de
   *    SEPARADOR, e «nunca reutilizes um atalho padrão para outra ação» é
   *    regra da Apple e da casa. As cinco listas estão a um toque, com
   *    contagem e com `aria-pressed`.
   *  · `⌘F` a filtrar. Nesta casa o `⌘F` é a pesquisa global (e a do browser),
   *    e o filtro por pessoa desta vista é uma fila de botões à vista.
   */
  const teclasDaLista = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const alvo = e.target as HTMLElement | null;
      const linha = alvo?.closest?.("[data-tarefa]") as HTMLElement | null;
      if (!linha) return;
      const id = linha.dataset.tarefa;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        // A escrever dentro da linha de edição, as setas são do campo.
        if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
        const linhas = [
          ...(linha
            .closest("[data-lista-de-tarefas]")
            ?.querySelectorAll<HTMLElement>("[data-tarefa]") ?? []),
        ];
        const seguinte = linhas[linhas.indexOf(linha) + (e.key === "ArrowDown" ? 1 : -1)];
        const abrir = seguinte?.querySelector<HTMLElement>("[data-abrir]");
        if (!abrir) return;
        e.preventDefault();
        abrir.focus();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && (e.key === "Backspace" || e.key === "Delete")) {
        if (!id) return;
        e.preventDefault();
        pedirParaEliminar(id);
        return;
      }

      if ((e.shiftKey && e.key === "F10") || e.key === "ContextMenu") {
        // O menu é o do `ui/MenuDeAccoes` e não tem porta imperativa nenhuma —
        // abre-se pelo seu botão. Carregar-lhe no botão é abrir o MESMO menu, e
        // é o que impede uma segunda implementação de menu ao lado da primeira
        // (Parte −1 do sistema de design).
        const botao = linha.querySelector<HTMLElement>('[aria-haspopup="menu"]');
        if (!botao) return;
        e.preventDefault();
        botao.click();
      }
    },
    [pedirParaEliminar],
  );

  /** O botão direito abre o mesmo menu — ver a nota no `⇧F10`, acima. */
  const menuDoBotaoDireito = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const linha = (e.target as HTMLElement)?.closest?.("[data-tarefa]") as HTMLElement | null;
    const botao = linha?.querySelector<HTMLElement>('[aria-haspopup="menu"]');
    if (!botao) return;
    e.preventDefault();
    botao.click();
  }, []);

  /**
   * Uma linha. O `arrastavel` chega por argumento e não pelo estado porque a
   * secção «Concluídas» usa esta mesma função: reordenar à mão o que já está
   * feito não quer dizer nada, e um `open.map(row)` a passar o índice como
   * segundo argumento seria a maneira silenciosa de dar a marca à linha errada.
   */
  function row(t: Task, arrastavel = false) {
    if (editingTaskId === t.id) {
      return (
        <li
          key={t.id}
          className="px-4 py-3 border-b border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)]"
        >
          <div className="flex flex-col gap-2">
            <input
              autoFocus
              value={editTaskFields.title}
              onChange={(e) => setEditTaskFields({ ...editTaskFields, title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEditTask(t.id);
                if (e.key === "Escape") setEditingTaskId(null);
              }}
              className="bo-input px-3 py-2 text-sm text-[var(--bo-tinta-72)] w-full"
            />
            <div className="flex flex-wrap gap-2">
              <Escolha
                // Este campo NÃO tinha rótulo nenhum — nem `<label>`, nem
                // `aria-label`. Com a caixa do sistema ninguém deu por isso;
                // quem ouve o ecrã ouvia «combobox» e mais nada. Passou a ter.
                aria-label="Prioridade"
                valor={editTaskFields.priority}
                aoMudar={(v) =>
                  setEditTaskFields({ ...editTaskFields, priority: v as TaskPriority })
                }
                className="px-2 py-1.5 text-xs text-[var(--bo-text-muted)]"
              >
                <option value="alta">Alta</option>
                <option value="normal">Normal</option>
                <option value="baixa">Baixa</option>
              </Escolha>
              <input
                type="date"
                value={editTaskFields.dueDate}
                onChange={(e) => setEditTaskFields({ ...editTaskFields, dueDate: e.target.value })}
                className="bo-input px-2 py-1.5 text-xs text-[var(--bo-text-muted)] flex-1"
              />
              {equipa.length > 0 ? (
                <Escolha
                  aria-label="Responsável"
                  valor={editTaskFields.assignee}
                  aoMudar={(v) => setEditTaskFields({ ...editTaskFields, assignee: v })}
                  containerClassName="flex-1 min-w-[100px]"
                  className="px-2 py-1.5 text-xs text-[var(--bo-text-muted)]"
                >
                  <option value="">Sem responsável</option>
                  {opcoesDeResponsavel(editTaskFields.assignee).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Escolha>
              ) : (
                <input
                  value={editTaskFields.assignee}
                  onChange={(e) =>
                    setEditTaskFields({ ...editTaskFields, assignee: e.target.value })
                  }
                  // O ramo do lado (a `Escolha`, quando a equipa está montada)
                  // tinha `aria-label`; este não tinha rótulo NENHUM, e o
                  // `placeholder` era a palavra «Responsável» a fazer de
                  // rótulo. Regra 7 da «Escrita»: o marcador dá um exemplo,
                  // não substitui o rótulo — e um rótulo que desaparece ao
                  // primeiro caracter escrito não é rótulo.
                  aria-label="Responsável"
                  placeholder="Ex.: quem fica responsável"
                  className="bo-input px-2 py-1.5 text-xs text-[var(--bo-text-muted)] flex-1 min-w-[100px]"
                />
              )}
              <Escolha
                aria-label="Área"
                valor={editTaskFields.area}
                aoMudar={(v) => setEditTaskFields({ ...editTaskFields, area: v })}
                className="px-2 py-1.5 text-xs text-[var(--bo-text-muted)]"
              >
                <option value="">Área…</option>
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Escolha>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveEditTask(t.id)} className="flex-1">
                Guardar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingTaskId(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </li>
      );
    }

    return (
      <TaskRow
        key={t.id}
        t={t}
        overdue={!!t.dueDate && !t.done && t.dueDate < todayStr}
        arrastavel={arrastavel}
        escolhida={escolhida === t.id}
        /* A linha de inserção do arrasto. «Depois» só existe na ÚLTIMA linha
           visível — é a única maneira de dizer «no fim» com uma linha que se
           desenha entre duas. */
        marca={
          alvoDoArrasto === t.id
            ? "antes"
            : alvoDoArrasto === "fim" && idsVisiveis[idsVisiveis.length - 1] === t.id
              ? "depois"
              : null
        }
        aArrastar={aArrastar === t.id}
        onToggle={toggle}
        onEdit={startEditTask}
        onRemove={pedirParaEliminar}
        onEscolher={escolher}
        onPrazo={porPrazo}
        onMover={mover}
        onArrastar={arrastar}
      />
    );
  }

  // A falha ANTES de tudo: sem isto, uma leitura que rebentou desenhava
  // "Tudo em dia — não há tarefas pendentes". É a frase mais tranquilizadora do
  // ecrã, e é exactamente o contrário do que se sabe. Ela fecha o separador e
  // vai fazer outra coisa, com a semana da montagem por combinar.
  if (error && tasks.length === 0) {
    return (
      <AvisoDeFalha
        titulo="Não foi possível ler as tarefas"
        mensagem={errorMessage}
        aoTentarDeNovo={refresh}
      />
    );
  }

  return (
    <div
      className="max-w-6xl"
      /* ── `Esc` FECHA O DETALHE ────────────────────────────────────────────
         «Esc cancela sempre a camada de topo» (12.3). Num campo de texto não:
         aí o `Esc` é o de desistir do que se está a escrever, e é assim que a
         linha de escrever e a de editar já o usam. */
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !escolhida) return;
        const alvo = e.target as HTMLElement | null;
        if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
        setEscolhida(null);
      }}
    >
      {/* ── A ESCADA DESTA VISTA ────────────────────────────────────────────
          QUATRO blocos, pela ordem de leitura: as listas (0), escolher de quem
          são as tarefas (1), as tarefas (2) e o detalhe da escolhida (3). O
          último é novo e é o painel da fase 08 — entra depois das tarefas
          porque é delas que ele fala. A escada é a da casa (`.bo-cena` no
          `globals.css`): 600 ms, degraus de 20 ms, tecto ao sexto, desligada em
          `prefers-reduced-motion`. Ver `vistas-que-se-compoem.test.ts`, que a
          mede — e que também põe o tecto nos quatro blocos, onde esta vista
          agora está.

          O `SkeletonList` da espera não leva degrau — um esqueleto é a espera,
          não uma apresentação. */}
      {/* ── TRÊS COLUNAS A PARTIR DE `lg`, UMA ABAIXO DISSO ─────────────────
          «Metade do ecrã está vazia» é o ponto 22 da auditoria, e a correcção
          dele são três colunas: listas · tarefas · detalhe. As três estão cá:
          a terceira é a fase 08, e a largura já lhe estava reservada (o
          `max-w-4xl` de antes não chegava).

          `lg:` e não `md:`: é o corte da casa, o mesmo em que a barra de
          destinos deixa de ser gaveta (ver `Cortes.contrato.test.ts`).

          MEDIDO, com o `px-10` da vista (80 px de margens a partir de `lg`) e
          os dois intervalos de 24: a 1024 sobram 384 px para a coluna do meio,
          a 1280 sobram 640, e de 1440 para cima o `max-w-6xl` fecha nos 1152 e
          o meio assenta em 592. Os 384 do caso mais apertado chegam à linha de
          tarefa — a partir de `sm` ela é uma fila que NÃO quebra e o título
          corta com reticências, que é o que mantém a densidade da lista (a
          Parte 3 do documento manda-o cortar e pôr o texto inteiro no `title`;
          agora está também no painel, que é onde ele se lê por extenso). */}
      <div className="lg:flex lg:items-start lg:gap-6">
        <div
          style={{ "--cena": 0 } as React.CSSProperties}
          className="bo-cena mb-5 lg:mb-0 lg:w-56 lg:shrink-0"
        >
          <BarraDeListas
            eventos={eventos}
            contas={contas}
            activa={listaActiva}
            aoEscolher={setLista}
          />
        </div>

        <div className="min-w-0 flex-1">
          {/* Filter by person */}
          {/* Segundo degrau, e um só para a fila toda: são as pessoas da equipa,
          não uma lista de dados — quinze botões a chegar um a um seria o
          tremor que o tecto do sexto degrau existe para evitar. */}
          {people.length > 1 && (
            <div
              style={{ "--cena": 1 } as React.CSSProperties}
              className="bo-cena flex flex-wrap gap-2 mb-5"
            >
              {defaultAssignee && people.includes(defaultAssignee) && (
                <Button
                  size="sm"
                  variant={who === defaultAssignee ? "primary" : "subtle"}
                  onClick={() => setWho(who === defaultAssignee ? "Todos" : defaultAssignee)}
                  iconLeft={
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                    </svg>
                  }
                >
                  Minhas tarefas
                </Button>
              )}
              {people.map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={who === p ? "primary" : "ghost"}
                  aria-pressed={who === p}
                  onClick={() => setWho(p)}
                >
                  {p}
                  {p !== "Todos" && (
                    <span className="ml-1 text-[11px] tabular-nums opacity-60">
                      {openByPerson.get(p) ?? 0}
                    </span>
                  )}
                </Button>
              ))}
            </div>
          )}

          {loading ? (
            <SkeletonList rows={5} />
          ) : (
            /* Terceiro degrau no CONTENTOR das listas, e não em cada linha: uma
           lista de cinquenta tarefas a entrar linha a linha lê-se como
           lentidão. O degrau está aqui dentro, no ramo já carregado, para o
           esqueleto de cima ficar de fora. */
            <div
              style={{ "--cena": 2 } as React.CSSProperties}
              className="bo-cena"
              /* ── ONDE O TECLADO E O BOTÃO DIREITO DA LISTA VIVEM ───────────
                 Num contentor e não em cada linha: um manipulador por linha
                 desfazia o `memo()` de todas elas a cada desenho, e é
                 exactamente o que o cabeçalho do `TaskRow` diz para não
                 acontecer. A tecla borbulha até aqui e a linha descobre-se pelo
                 `data-tarefa` de quem a recebeu. */
              data-lista-de-tarefas
              onKeyDown={teclasDaLista}
              onContextMenu={menuDoBotaoDireito}
            >
              {/* ── O CARTÃO DEIXOU DE CORTAR O QUE SAI DE DENTRO DELE ────────
              «Isto não está bem, está a tapar, não dá para ver tudo no ecrã» —
              com a lista da Prioridade aberta e cortada a meio, o «Alta» e o
              «Normal» a desaparecerem na borda do cartão.

              A causa é minha e é desta ronda: a caixa de escrever uma tarefa
              passou a ser a ÚLTIMA linha da lista (fase 03), e o cartão tinha
              `overflow-hidden`. Enquanto a criação vivia num cartão só seu lá
              em cima, as listas dos seus campos abriam para o ar; aqui abrem
              para dentro de uma caixa que as corta.

              O `Escolha` já sabe virar a lista para cima quando não há espaço
              — mas ele mede o ECRÃ, e quem estava a cortar era o cartão. Um
              recorte de um antepassado não se vê de dentro.

              Tira-se o recorte, e arredondam-se em vez disso a primeira e a
              última linha: era só para isso que ele servia — para o fundo de
              uma linha em `hover` não esquadrar os cantos do cartão. */}
              <Card
                padding="none"
                className="[&>*:first-child]:rounded-t-2xl [&>*:last-child]:rounded-b-2xl"
              >
                {/* ── «A FAZER (0)» DEIXA DE SER UM CABEÇALHO COM UM ZERO ─────
                «É um cabeçalho com um zero, seguido de um separador e de nada.
                O traço a sublinhar um cabeçalho sem conteúdo por baixo.»

                Duas correcções, e a segunda é a que importa:

                 · com a lista VAZIA não há cabeçalho nenhum nem régua nenhuma
                   — o estado vazio fica sozinho, que é o que ele é;
                 · e a contagem passa a ser ESTADO da vista (`role="status"`),
                   com as atrasadas ao lado, porque «8 por fazer» sem dizer
                   quantas já passaram do prazo é a metade tranquilizadora da
                   verdade.

                O que ela pede e NÃO está aqui: esta contagem vive na barra de
                cima, ao lado do nome da lista. A barra é do `AdminClient` e a
                lista das tarefas vive aqui — passá-la para lá sem levantar o
                estado das tarefas dava uma contagem que não mexia quando ela
                risca uma. Entra com a fase 05, que é quando as listas passam a
                existir e o estado tem de subir de qualquer maneira.

                E a fase 05 chegou sem a levar: o nome da lista e a contagem
                ficam AQUI, no cabeçalho do cartão. A barra de cima é do
                `AdminClient` — que é ficheiro de outro trabalho nesta ronda — e
                o que a impede continua a ser o mesmo: sem levantar o estado das
                tarefas para lá, a contagem lá em cima não mexia quando ela
                risca uma. Fica escrito no relatório desta fase. */}
                {open.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--bo-hairline)] px-5 py-3.5 sm:px-6">
                    <div className="min-w-0">
                      {/* O nome da lista escolhida, que é o título desta vista
                      enquanto a barra de cima não o souber. */}
                      <h2 className="truncate text-headline text-[var(--bo-text)]">
                        {rotuloDaLista}
                      </h2>
                      <p className="bo-eyebrow" role="status">
                        {open.length} por fazer
                        {atrasadas > 0 && (
                          <span className="ml-1.5 text-[var(--bo-perigo)]">
                            · {atrasadas} atrasada{atrasadas === 1 ? "" : "s"}
                          </span>
                        )}
                      </p>
                    </div>
                    {/* ── AGRUPAR E ORDENAR (fase 06) ──────────────────────────
                    Dois selectores e não dois menus: são escolhas com um valor
                    actual que se lê sem abrir nada, e um `Agrupar ⌄` fechado
                    escondia precisamente a informação que interessa — por que
                    critério é que esta lista está repartida agora.

                    Só existem com a lista cheia, como o cabeçalho: agrupar zero
                    tarefas não é uma pergunta.

                    E partem linha quando não cabem (achado n.º 15): eram
                    `shrink-0`, dois seletores de 194 px num telemóvel de 390, e
                    a página inteira ficava com 453 px — encolhida, com uma faixa
                    branca à direita e a barra de baixo esticada. */}
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Escolha
                        aria-label="Agrupar por"
                        valor={agrupamento}
                        aoMudar={(v) => escolherAgrupamento(v as Agrupamento)}
                        className="px-2 py-1.5 text-caption text-[var(--bo-text-muted)]"
                      >
                        {AGRUPAMENTOS.map((a) => (
                          <option key={a.id} value={a.id}>
                            Agrupar: {a.rotulo}
                          </option>
                        ))}
                      </Escolha>
                      <Escolha
                        aria-label="Ordenar por"
                        valor={ordenacao}
                        aoMudar={(v) => escolherOrdenacao(v as Ordenacao)}
                        className="px-2 py-1.5 text-caption text-[var(--bo-text-muted)]"
                      >
                        {ORDENACOES.map((o) => (
                          <option key={o.id} value={o.id}>
                            Ordenar: {o.rotulo}
                          </option>
                        ))}
                      </Escolha>
                    </div>
                  </div>
                )}
                <div className="divide-y divide-[var(--bo-hairline)]">
                  {open.length === 0 ? (
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
                          <path d="M9 11l3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
                          <path
                            d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"
                            strokeLinecap="round"
                          />
                        </svg>
                      }
                      /* ── O ESTADO VAZIO DEIXA DE MANDAR OLHAR PARA OUTRO SÍTIO
                     «"Adiciona uma acima para começar a organizar a equipa."
                     O estado vazio diz o passo seguinte e traz um botão;
                     apontar para outro elemento do ecrã é sinal de que a ação
                     não está onde devia.» [APPLE]

                     Agora a acção está aqui dentro: o botão abre a mesma linha
                     de escrever que vive no fundo da lista, e não há nada para
                     ir procurar.

                     O que NÃO está aqui, e o documento dela pede: a dica da
                     linguagem natural («experimenta escrever "Confirmar
                     florista amanhã às 10h"»). Ela ensina uma capacidade que é
                     a fase 07 e ainda não existe — escrevê-la agora era
                     prometer uma coisa que o campo não faz. Entra com ela. */
                      title="Nada por fazer nesta lista"
                      description="Escreve a primeira e ela fica aqui, com quem a faz e para quando."
                      action={{ label: "Nova tarefa", onClick: () => setAEscrever(true) }}
                    />
                  ) : (
                    /* ── OS GRUPOS, COM O CABEÇALHO PEGADO AO TOPO (fase 06) ────
                   «Um seletor Agrupar por: Data · Evento · Responsável ·
                   Nenhum, com cabeçalhos sticky. Por omissão, Data.»

                   O `sticky` é o que faz a lista longa continuar a dizer ONDE
                   se está: a rolar cinquenta linhas, o «Atrasadas» fica preso
                   ao cimo até o «Hoje» o empurrar. Precisa de fundo OPACO —
                   `--bo-surface`, a mesma face do cartão — porque as linhas
                   passam por baixo dele; e é por isso que aqui não entra vidro
                   nenhum: «vidro só no que flutua; listas, tabelas e
                   formulários ficam opacos» (`docs/LIQUID-GLASS.md`, Parte 5).

                   Um cabeçalho por grupo e nenhum quando o agrupamento é
                   «Nenhum» — o `titulo` vem a `null` e a lista fica corrida,
                   sem uma régua a sublinhar coisa nenhuma. */
                    grupos.map((g) => (
                      <section
                        key={g.id}
                        className="divide-y divide-[var(--bo-hairline)]"
                        aria-labelledby={g.titulo ? `grupo-${g.id}` : undefined}
                      >
                        {g.titulo && (
                          <h2
                            id={`grupo-${g.id}`}
                            className="sticky top-[var(--bo-cabecalho,0px)] z-10 bg-[var(--bo-surface)] px-5 py-2 text-footnote font-semibold text-[var(--bo-text-muted)] sm:px-6"
                          >
                            {g.titulo}
                            {/* A contagem do grupo em `tabular-nums`, como toda a
                            coluna de números da casa. Vem a seguir ao nome e
                            não por baixo: é um cabeçalho de lista, não um KPI. */}
                            <span className="ml-2 tabular-nums text-[var(--bo-text-faint)]">
                              {g.tarefas.length}
                            </span>
                          </h2>
                        )}
                        {/* ── `<ul role="list">` E `<li>`, COMO A PARTE 6 MANDA ────
                            Eram `<div>`s soltas dentro de um `<section>`: quem
                            ouve o ecrã não ouvia «lista, 5 itens», e não tinha
                            como saltar de linha em linha nem saber quantas há.
                            O `role="list"` repete o que `ul` já é de propósito:
                            o Safari tira a semântica de lista a uma `ul` sem
                            marcadores, e é isso que o CSS desta casa faz. */}
                        <ul role="list" className="divide-y divide-[var(--bo-hairline)]">
                          {g.tarefas.map((t) => row(t, ordenacao === "manual"))}
                        </ul>
                      </section>
                    ))
                  )}
                  {/* ── A ÚLTIMA LINHA DA LISTA É QUE CRIA ────────────────────
                  «O formulário de criação é um cartão permanente no topo.
                  Ocupa ~180 px, sempre, para uma ação ocasional. E empurra
                  para baixo aquilo que é o conteúdo da página — as tarefas.»

                  Saiu. A criação passa a ser a última linha da lista, que se
                  transforma em campo ao tocar — é como funciona nos Lembretes,
                  e é o sítio onde a mão já está depois de ler o que falta
                  fazer.

                  E o botão «Adicionar» saiu com ele. Era um primário
                  DESACTIVADO como estado inicial de um ecrã vazio, que é a
                  primeira coisa que se vê ao entrar aqui e se lê como avaria.
                  `Enter` cria, que é o gesto que toda a gente tenta primeiro;
                  o botão só existia para quem não o tentasse. */}
                  <LinhaDeEscrever
                    aberta={aEscrever}
                    aoAbrir={() => setAEscrever(true)}
                    aoFechar={fecharEscrever}
                    botao={botaoDeAbrir}
                    campo={campoDoTitulo}
                    titulo={title}
                    aoEscrever={setTitle}
                    aoCriar={add}
                    aGravar={adding}
                  >
                    {/* ── O QUE A LINHA DIZ, ANTES DE ELA CARREGAR ─────────────────
                        As pastilhas do que foi lido. Não são decoração: são a
                        promessa do que vai ficar gravado, feita ANTES do gesto
                        que a cumpre. É o que separa isto de uma extracção
                        silenciosa que acerta quase sempre.

                        `role="status"`: muda enquanto ela escreve, sem a página
                        recarregar, e quem usa leitor de ecrã tem de ouvir a
                        mesma promessa que os outros lêem. */}
                    {aInterpretar && (
                      <div
                        role="status"
                        /* Nome próprio, e não só o papel. Este ecrã tem mais do
                           que um `role="status"` — a contagem da lista é outro —
                           e um leitor de ecrã que anuncia dois «estados» sem os
                           nomear obriga quem ouve a adivinhar de qual se trata. */
                        aria-label="O que a linha vai gravar"
                        className="mt-2 flex flex-wrap items-center gap-1.5 text-caption2"
                      >
                        <span className="bo-text-muted">Vai ficar com</span>
                        {/* ── SÓ SE MOSTRA O QUE VAI MESMO ACONTECER ────────
                            Um campo que ela já preencheu à mão GANHA à leitura
                            (ver o `add`). Mostrar aqui a data lida, quando o
                            campo de baixo já tem outra, era prometer uma coisa
                            e gravar outra — e das duas seria a pastilha a
                            parecer o erro, porque é a que está à frente dela.

                            A condição de cada pastilha é, à letra, a mesma
                            condição do `add`. Se um dia divergirem, isto volta
                            a mentir; por isso estão escritas com as mesmas
                            palavras nos dois sítios. */}
                        {lida.data && !dueDate && (
                          <Pastilha rotulo="Quando" valor={quandoLido(lida)} />
                        )}
                        {lida.responsavel && assignee.trim() === PREDEFINIDO() && (
                          <Pastilha rotulo="Quem" valor={lida.responsavel.valor} />
                        )}
                        {lida.evento && <Pastilha rotulo="Evento" valor={lida.evento.valor} />}
                        {lida.prioridade && priority === "normal" && (
                          <Pastilha rotulo="Prioridade" valor={lida.prioridade.valor} />
                        )}
                        {/* E o desligar, que é o que torna a promessa honesta:
                            sem ele, a única saída de uma leitura errada era
                            apagar a palavra e reescrever a frase à volta. */}
                        <button
                          type="button"
                          onClick={() => setSemInterpretar(true)}
                          className={`alvo-toque ms-1 rounded-md px-1.5 text-[var(--bo-text-muted)] underline decoration-dotted underline-offset-2 ${ESTADO} ${PRESSAO}`}
                        >
                          Tal como escrevi
                        </button>
                      </div>
                    )}

                    {/* ── OS DETALHES DEIXARAM DE ESTAR ATRÁS DE UMA PORTA ───────────
                «Retira isto do opcional. Quero que apareça logo.»

                Eram quatro campos — responsável, área, prioridade e prazo — dentro
                de um `<details>` fechado, com a palavra «opcional» a dizer que não
                valiam a pena. Valem: o responsável é a coluna por que a grelha do
                dia se reparte, e o prazo é o que põe a tarefa na lista certa. Uma
                tarefa escrita sem eles é uma tarefa que alguém tem de voltar a
                abrir.

                O que sai é a PORTA, não os campos: continuam a poder ficar em
                branco. O que muda é que se vêem sem ninguém ter de os procurar.

                O rótulo perde o «(opcional)» pela mesma razão — a palavra estava a
                responder à pergunta «tenho de preencher isto?», e a resposta já
                está no «Sem responsável» e no «Sem área» de cada campo. */}
                    <div className="mt-3">
                      <p className="bo-eyebrow text-[var(--bo-text-muted)]">Detalhes</p>
                      {/* ── O CORPO É UM BLOCO, E NÃO QUATRO CAMPOS ────────────────────
                  Quatro campos numa grelha são uma LINHA, não quatro blocos: a
                  escada da casa é por bloco, e uma fila de campos a entrar um a um
                  lê-se como um tremor. Entra tudo junto, nos 240 ms e nos quatro
                  píxeis da `.bo-entrada` — a distância de um rótulo, porque isto
                  sai de debaixo do resumo que está mesmo por cima.

                  Continuam a ser UM bloco e não quatro: a escada da casa é por
                  bloco, e uma fila de campos a entrar um a um lê-se como um
                  tremor. */}
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {equipa.length > 0 ? (
                          <Field
                            as="select"
                            label="Responsável"
                            value={assignee}
                            onChange={(e) => setAssignee(e.target.value)}
                          >
                            <option value="">Sem responsável</option>
                            {opcoesDeResponsavel(assignee).map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </Field>
                        ) : (
                          /* Sem contas nomeadas configuradas não há equipa a listar, e o
                     campo continua a ser o de sempre. Ver a nota no `equipa`: uma
                     lista vazia é «não sei quem são», não «não há ninguém». */
                          <Field
                            label="Responsável"
                            value={assignee}
                            onChange={(e) => setAssignee(e.target.value)}
                            // Um cargo, não uma pessoa: o nome de uma colega verdadeira num
                            // exemplo acaba por sair daqui para sítios onde não devia estar.
                            placeholder="Ex.: quem fica responsável"
                          />
                        )}
                        <Field
                          as="select"
                          label="Área"
                          value={area}
                          onChange={(e) => setArea(e.target.value)}
                        >
                          <option value="">Sem área</option>
                          {AREAS.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </Field>
                        <Field
                          as="select"
                          label="Prioridade"
                          value={priority}
                          onChange={(e) => setPriority(e.target.value as TaskPriority)}
                        >
                          <option value="alta">Alta</option>
                          <option value="normal">Normal</option>
                          <option value="baixa">Baixa</option>
                        </Field>
                        <Field
                          label="Prazo"
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                        />
                      </div>
                    </div>
                  </LinhaDeEscrever>
                </div>
              </Card>

              {done.length > 0 && (
                <div className="mt-4">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowDone(!showDone)}
                    aria-expanded={showDone}
                    className="mb-2 tracking-[0.12em] uppercase"
                  >
                    {showDone ? "▾" : "▸"} Concluídas ({done.length})
                  </Button>
                  {showDone && (
                    <Card
                      padding="none"
                      className="overflow-hidden divide-y divide-[var(--bo-hairline)]"
                    >
                      {/* As concluídas nunca são arrastáveis: reordenar à mão o
                      que já está feito não quer dizer nada. */}
                      <ul role="list" className="divide-y divide-[var(--bo-hairline)]">
                        {done.map((t) => row(t))}
                      </ul>
                    </Card>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══ A TERCEIRA COLUNA — O PAINEL DE DETALHE (fase 08) ══════════════
            «Zero espaço morto: o painel de detalhe ocupa a coluna que hoje
            está vazia» (critério de aceitação nº 7).

            ── PORQUE É QUE ELE EXISTE MESMO SEM TAREFA ESCOLHIDA ───────────
            No computador, sim: uma coluna que aparece e desaparece conforme se
            toca numa linha faz a lista do meio mudar de largura a cada toque —
            e a lista é o que ela está a ler. Sem escolha nenhuma, o painel diz
            o que faz, que é a melhor coisa que um sítio vazio pode dizer.

            ── E PORQUE É QUE ABAIXO DE `lg` SÓ EXISTE ESCOLHIDO ────────────
            Porque ali não é uma coluna: é um bloco por baixo da lista. Vazio,
            seria um cartão a explicar-se a si próprio no fim de um ecrã
            estreito — ruído a ocupar o sítio das tarefas. «O painel de detalhe
            colapsa primeiro» é o que a Parte 6 do documento manda quando o
            espaço aperta, e é isto.

            MEDIDO a 375 px: com o painel fechado a vista fica byte a byte como
            estava; aberto, o cartão do detalhe mede 343 px de conteúdo (375
            menos as duas margens de 16) e nenhum dos seus alvos desce dos 44 —
            os dois «Remover», o «Fechar» e o RÓTULO de cada subtarefa levam
            `alvo-toque` (nesse, o alvo é o rótulo inteiro, com o título lá
            dentro; a caixa de 18 px é só o desenho, como na linha da lista).
            Sem transbordo horizontal: os títulos quebram (`break-words`) e as
            ligações cortam (`truncate`). */}
        <div
          style={{ "--cena": 3 } as React.CSSProperties}
          className={`bo-cena mt-5 lg:mt-0 lg:w-72 lg:shrink-0 ${
            tarefaEscolhida ? "" : "hidden lg:block"
          }`}
          ref={painelRef}
        >
          <TarefaDetalhe
            tarefa={tarefaEscolhida}
            aoFechar={() => setEscolhida(null)}
            aoEditar={startEditTask}
            aoGravar={gravarComAnular}
          />
        </div>
      </div>

      {/* ── A PERGUNTA É A DA CASA ──────────────────────────────────────────
          `ui/PerguntaDestrutiva`: folha inferior no telemóvel (ao pé do
          polegar, onde o dedo já está), diálogo centrado no computador, e o
          verbo repetido no botão em vez de «OK». */}
      <PerguntaDestrutiva
        aberto={!!aEliminar}
        onFechar={() => setAEliminar(null)}
        titulo={`Eliminar a tarefa «${aEliminar?.title ?? ""}»?`}
        aviso="Fica 30 dias na Reciclagem, de onde se repõe tal e qual."
        rotuloConfirmar="Eliminar"
        // Fecha PRIMEIRO e só depois age: a lista é optimista — a linha sai
        // logo e volta se o servidor recusar — e uma caixa aberta por cima
        // atrasaria um gesto que hoje é instantâneo.
        onConfirmar={() => {
          const t = aEliminar;
          setAEliminar(null);
          if (t) void remove(t.id);
        }}
      />
    </div>
  );
}

/**
 * Uma pastilha do que a linha disse. Rótulo e valor juntos, porque «11 set»
 * sozinho não diz se é o prazo ou a data do evento.
 */
function Pastilha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bo-accent-lavagem)] px-2 py-0.5">
      <span className="bo-text-muted">{rotulo}</span>
      <span className="font-medium text-[var(--bo-text)]">{valor}</span>
    </span>
  );
}

/**
 * O «quando» por extenso, como ela o vai ler na lista — e não «2026-09-11».
 *
 * A hora só aparece acompanhada da data: «às 10h» de que dia não é informação
 * nenhuma, e o motor deixa-a existir sozinha de propósito para o ECRÃ decidir.
 * Aqui a decisão é não a mostrar sozinha.
 */
function quandoLido(lida: Interpretacao): string {
  if (!lida.data) return "";
  const [ano, mes, dia] = lida.data.valor.split("-");
  const MESES = "jan fev mar abr mai jun jul ago set out nov dez".split(" ");
  const curto = `${Number(dia)} ${MESES[Number(mes) - 1] ?? ""}`;
  const comAno = ano === String(new Date().getFullYear()) ? curto : `${curto} ${ano.slice(2)}`;
  return lida.hora ? `${comAno}, ${lida.hora.valor.replace(":", "h")}` : comAno;
}
