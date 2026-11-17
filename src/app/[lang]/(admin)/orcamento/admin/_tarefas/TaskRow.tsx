"use client";

import { memo } from "react";
import type { TaskPriority } from "@/lib/orcamento/types";
import { MenuDeAccoes } from "../ui";
import { metaFor, tintaDoRotulo } from "../status-meta";
import { ESTADO, MOLA_DE_MARCAR, PRESSAO } from "../ui/movimento";
import { SEM_LUPA } from "../ui/adaptativo";
import { accoesDaLinha } from "./accoes-da-linha";
import type { PropsDaLinha } from "./TaskRow.props";

const PRIORITY_META: Record<TaskPriority, { label: string; color: string }> = {
  alta: { label: "Alta", color: "#8a2a22" },
  normal: { label: "Normal", color: "#9aa36a" },
  baixa: { label: "Baixa", color: "#8a8a82" },
};

/**
 * Uma linha da lista, memoizada.
 *
 * O título da tarefa nova é estado DESTE ecrã, por isso cada tecla escrita em
 * "O que há para fazer?" voltava a desenhar a lista inteira — e, de caminho, a
 * refazer o `filter`/`sort` das tarefas (que também estavam fora de qualquer
 * `useMemo`). Com a linha atrás de `memo()` e os derivados memoizados, escrever
 * deixa de tocar na lista: nenhuma linha muda enquanto se escreve um título.
 */
export const TaskRow = memo(function TaskRow({
  t,
  nomeDoCliente,
  overdue,
  arrastavel,
  escolhida,
  seleccionada,
  aSeleccionar,
  marca,
  aArrastar,
  onToggle,
  onEdit,
  onRemove,
  onEscolher,
  onPrazo,
  onMover,
  onArrastar,
}: PropsDaLinha) {
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
      data-seleccionada={seleccionada || undefined}
      className={`group relative flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:items-center sm:px-5 sm:py-3.5 ${SEM_LUPA} ${ESTADO} ${
        escolhida || seleccionada ? "bg-[var(--bo-accent-lavagem)]" : "hover:bg-[var(--bo-tinta-3)]"
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
          /* ⇧+clique estende o lote, ⌘/Ctrl+clique soma ou tira — como na
             grelha dos Temas. Sem modificador abre o detalhe, a não ser que
             haja um lote a ser escolhido (ver `aSeleccionar`). */
          onClick={(e) => onEscolher(t, { estender: e.shiftKey, somar: e.metaKey || e.ctrlKey })}
          aria-label={aSeleccionar ? `Selecionar «${t.title}»` : `Abrir «${t.title}»`}
          aria-pressed={aSeleccionar ? seleccionada : undefined}
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
          {/* A marca do lote: não só cor (a lavagem da linha) — um visto, à
              frente do título, que se lê também a preto e branco. */}
          {seleccionada && (
            <span aria-hidden="true" className="mr-1.5 font-semibold text-[var(--bo-text)]">
              ✓
            </span>
          )}
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
          {nomeDoCliente && <span className="text-foreground/25">{nomeDoCliente}</span>}
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
          accoes={accoesDaLinha({ t, arrastavel, onEdit, onToggle, onPrazo, onMover, onRemove })}
        />
      </div>
    </li>
  );
});
