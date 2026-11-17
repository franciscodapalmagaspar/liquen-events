"use client";

import { type Dispatch, type SetStateAction } from "react";
import BotaoGuardarTudo from "../GuardarTudo";
import NotificationBell from "../NotificationBell";
import { type View } from "../nav";
import { ESTADO, PRESSAO } from "../ui/movimento";

/**
 * As acções da barra de topo do back office: a ajuda, o «Guardar tudo», o
 * sino, procurar, e a acção primária da vista («+ Novo», «Nova tarefa»).
 * (Saiu do cabeçalho na fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`, tal e qual.)
 */
export interface AccoesDoCabecalhoProps {
  view: View;
  setPaletteOpen: Dispatch<SetStateAction<boolean>>;
  setNewQuoteOpen: Dispatch<SetStateAction<boolean>>;
  setAjudaOpen: Dispatch<SetStateAction<boolean>>;
  mostrarAccoesDePedidos: boolean;
  pedirNovaTarefa: () => void;
}

export function AccoesDoCabecalho({
  view,
  setPaletteOpen,
  setNewQuoteOpen,
  setAjudaOpen,
  mostrarAccoesDePedidos,
  pedirNovaTarefa,
}: AccoesDoCabecalhoProps) {
  return (
    <div className="ml-auto flex items-center gap-1.5 pointer-coarse:gap-2.5 sm:gap-2 shrink-0">
      <button
        onClick={() => setAjudaOpen(true)}
        aria-label="Ajuda e glossário"
        title="Ajuda e glossário"
        // No telemóvel vive na gaveta (ver lá o porquê): aqui os
        // 50 px que ocupava eram quase metade do que sobrava para o
        // título da vista.
        className={`alvo-toque hidden lg:flex w-10 h-10 items-center justify-center text-foreground/30 rounded-lg hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-text-muted)] ${ESTADO} ${PRESSAO}`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M9.4 9a2.6 2.6 0 1 1 3.4 2.5c-.7.3-1.3.9-1.3 1.7v.3" strokeLinecap="round" />
          <path d="M12 17h.01" strokeLinecap="round" />
        </svg>
      </button>
      {/* ── O GESTO QUE GRAVA TUDO ──────────────────────────────
          Vive aqui, no cabeçalho, porque é o único sítio que está
          sempre à vista seja qual for a vista aberta — e o que ele
          diz («2 por gravar» ou «Tudo guardado») tem de valer antes
          de se carregar nele. Um botão de guardar que só fala depois
          do clique obriga a carregar nele para saber se era preciso.
          Fica ANTES da campainha e da pesquisa: entre saber se o
          trabalho está guardado e ver notificações, a pergunta que se
          faz de portátil na mão é a primeira. */}
      <BotaoGuardarTudo />
      <NotificationBell />
      {/* A vista dos Temas tem campo de procura próprio, e dois sítios
          para procurar na mesma página é uma escolha a mais sem ganho
          nenhum: o de dentro filtra os temas à medida que se escreve,
          este abre a navegação global. Só o BOTÃO sai — o atalho ⌘K
          continua a funcionar em todo o lado, aqui incluído. */}
      {view !== "temas" && (
        <button
          onClick={() => setPaletteOpen(true)}
          // `flex` e não `hidden sm:flex`: abaixo de 640 px o botão
          // desaparecia, e com ele a ÚNICA forma de chegar à pesquisa
          // global — porque a outra é o ⌘K, e num telemóvel não há ⌘.
          // A procura por nome de casal deixava de existir no
          // aparelho onde ela mais a usa. O rótulo continua a só
          // aparecer a partir de `md`; o que passa a estar sempre lá
          // é o alvo.
          // `min-w-11` a par do `min-h-11`: sem rótulo (abaixo de
          // `md`) o botão fica só com a lupa de 12 px e media 38 px
          // de largura — alto que chegue e estreito de mais.
          className={`flex items-center gap-2 px-3 py-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center border border-[var(--bo-hairline)] text-[var(--bo-text-faint)] text-[10px] tracking-[0.12em] uppercase rounded-lg hover:bg-[var(--bo-surface-hover)] hover:text-[var(--bo-text-muted)] ${ESTADO} ${PRESSAO}`}
          // Sem isto, abaixo de `md` (onde o rótulo está escondido) o
          // botão é uma lupa sem nome nenhum para o VoiceOver. O
          // `title` não serve: num telemóvel nunca chega a aparecer.
          aria-label="Pesquisar"
          title="Pesquisar (Ctrl K)"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <span className="hidden md:inline">Pesquisar</span>
          {/* ── O «⌘K» SAIU DO BOTÃO ────────────────────────────
              «Retirar o K», com a captura da pastilha à frente.

              O ATALHO fica e continua a funcionar — o que sai é o
              letreiro. E faz sentido: uma etiqueta de teclado ao lado
              de um botão é uma dica, e uma dica só vale enquanto é
              nova. Depois de a pessoa saber o atalho, aquilo passa a
              ser um selo permanente a ocupar largura num cabeçalho
              que já tinha pouca — e num ecrã de toque anunciava uma
              tecla que o aparelho não tem. */}
        </button>
      )}
      {view === "tarefas" && (
        <button
          onClick={pedirNovaTarefa}
          aria-label="Nova tarefa"
          className={`alvo-toque flex items-center gap-2 px-4 py-2 bg-[var(--bo-seleccao)] text-[var(--bo-sobre-seleccao)] text-[10px] tracking-[0.15em] uppercase rounded-full hover:bg-[var(--bo-seleccao-hover)] ${ESTADO} ${PRESSAO} `}
          title="Escrever uma tarefa (⌘N)"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          <span className="hidden sm:inline">Nova tarefa</span>
        </button>
      )}
      {mostrarAccoesDePedidos && (
        <button
          onClick={() => setNewQuoteOpen(true)}
          aria-label="Novo pedido"
          className={`alvo-toque flex items-center gap-2 px-4 py-2 bg-[var(--bo-seleccao)] text-[var(--bo-sobre-seleccao)] text-[10px] tracking-[0.15em] uppercase rounded-full hover:bg-[var(--bo-seleccao-hover)] ${ESTADO} ${PRESSAO} `}
          title="Criar pedido manualmente"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          <span className="hidden sm:inline">Novo</span>
        </button>
      )}
    </div>
  );
}
