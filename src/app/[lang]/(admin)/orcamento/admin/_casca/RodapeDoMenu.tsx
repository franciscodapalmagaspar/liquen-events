"use client";

import { type Dispatch, type SetStateAction } from "react";
import type { useDescarga } from "../ui/descarregar";
import { ESTADO, PRESSAO } from "../ui/movimento";

/**
 * O RODAPÉ DO MENU — quem está dentro, e as acções da conta e da casa
 * (chaves de acesso, ajuda, atalhos, cópia de segurança, repor, sair).
 * (Saiu do menu na fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`, tal e qual.)
 */
export interface RodapeDoMenuProps {
  userName: string;
  setShortcutsOpen: Dispatch<SetStateAction<boolean>>;
  setRestoreOpen: Dispatch<SetStateAction<boolean>>;
  setPasskeysOpen: Dispatch<SetStateAction<boolean>>;
  setAjudaOpen: Dispatch<SetStateAction<boolean>>;
  copiaDeSeguranca: ReturnType<typeof useDescarga>;
  descarregarCopia: () => void;
  pedirParaSair: () => void;
}

export function RodapeDoMenu({
  userName,
  setShortcutsOpen,
  setRestoreOpen,
  setPasskeysOpen,
  setAjudaOpen,
  copiaDeSeguranca,
  descarregarCopia,
  pedirParaSair,
}: RodapeDoMenuProps) {
  return (
    <>
      {/* User — `mt-auto` cola-o ao fundo quando sobra altura; quando não
          sobra, vem a seguir aos destinos, dentro do mesmo rolo. */}
      <div className="mt-auto shrink-0 px-2.5 pb-5 pt-3 border-t border-[var(--bo-hairline)]">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--bo-surface-hover)] mb-2">
          <div className="w-8 h-8 rounded-full bg-[var(--bo-accent)] flex items-center justify-center text-white text-xs font-bold shrink-0">
            {userName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[var(--bo-text)] text-xs font-medium truncate">{userName}</p>
            <p className="text-[var(--bo-text-faint)] text-[10px] truncate">Administração</p>
          </div>
        </div>
        {/* Linha própria, e não um quinto botão na fila de baixo: com cinco
          não cabia o rótulo de nenhum. É também o sítio onde se procura —
          logo debaixo de quem está com a sessão aberta. */}
        <button
          onClick={() => setPasskeysOpen(true)}
          className={`alvo-toque w-full flex items-center justify-center gap-1.5 py-2 mb-1 text-[var(--bo-text-faint)] text-[9px] tracking-[0.08em] uppercase rounded-lg hover:text-[var(--bo-text)] hover:bg-[var(--bo-surface-hover)] ${ESTADO} ${PRESSAO}`}
          title="Entrar sem palavra-passe neste aparelho"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
          </svg>
          Os meus dispositivos
        </button>
        {/* A AJUDA MUDA-SE PARA AQUI NO TELEMÓVEL.
          Estava na barra de topo, e um botão de 40 px mais o seu espaço
          custavam 50 dos ~110 px que sobravam para o título — que por
          isso saía "Visão…". Aqui é o sítio dela: é uma coisa que se lê
          uma vez, ao lado do backup e da sessão, e não uma acção da
          vista. No computador continua no topo, onde há espaço. */}
        <button
          onClick={() => setAjudaOpen(true)}
          className={`alvo-toque lg:hidden w-full flex items-center justify-center gap-1.5 py-2 mb-1 text-[var(--bo-text-faint)] text-[9px] tracking-[0.08em] uppercase rounded-lg hover:text-[var(--bo-text)] hover:bg-[var(--bo-surface-hover)] ${ESTADO} ${PRESSAO}`}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M9.4 9a2.6 2.6 0 1 1 3.4 2.5c-.7.3-1.3.9-1.3 1.7v.3" strokeLinecap="round" />
            <path d="M12 17h.01" strokeLinecap="round" />
          </svg>
          Ajuda e glossário
        </button>
        {/* ── QUATRO ACÇÕES NUMA LINHA SÓ NÃO CABEM ────────────────────
            Estavam as quatro — Atalhos · Backup · Repor · Sair — em
            `flex`, cada uma `flex-1`, com o ícone e o rótulo LADO A LADO,
            ícones de 11 px e letra de 9 px. MEDIDO na gaveta do telemóvel
            (390 px de ecrã): sobram ~320 px de gaveta, ou seja ~78 px por
            célula para um ícone mais uma palavra em maiúsculas com
            `tracking` — e num ecrã de toque o «Atalhos» esconde-se
            (`pointer-coarse:hidden`), portanto a fila fica com três
            larguras de ~105 px e um buraco onde estava a quarta.

            Passam a EMPILHAR: o ícone por cima do rótulo. A palavra deixa
            de disputar a largura com o ícone, e por isso o ícone pode
            crescer de 11 para 14 px sem apertar nada — é o mesmo tamanho
            que a fila ao lado já usa para o cadeado dos dispositivos.
            E ficam numa LINHA SÓ, nas duas larguras. Houve aqui um
            `min-w-[4.5rem]` por meio caminho, e MEDIDO a 1440 ele partia
            a fila em duas: 4 × 72 px não cabem nos 236 px úteis da
            coluna, e o «Sair» — o mais importante dos quatro, o que ela
            toca ao fim do dia — ficava sozinho numa segunda linha. Com o
            ícone POR CIMA, a célula só precisa da largura do rótulo
            (~50 px o mais comprido), portanto os quatro cabem em 236 px
            sem mínimo nenhum. O `flex-wrap` fica como rede, não como
            plano.

            Este é o sítio onde ela carrega em «Sair» ao fim do dia e em
            «Backup» quando desconfia. Nenhum dos quatro muda de sítio,
            de nome ou de ordem — só passam a ter onde caber. */}
        <div className="flex flex-wrap gap-1 pointer-coarse:gap-2">
          {/* A LISTA DE ATALHOS DE TECLADO NÃO APARECE NUM ECRÃ DE TOQUE.
            É uma folha inteira a ensinar teclas — ⌘K, ?, G depois P — a
            quem não tem teclado. Ocupava metade da gaveta de navegação
            no telemóvel para não oferecer nada que ali se possa fazer.
            Continua a abrir com "?" em quem tem teclado, e o botão
            continua lá no computador. */}
          <button
            onClick={() => setShortcutsOpen(true)}
            className={`alvo-toque pointer-coarse:hidden flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[var(--bo-text-faint)] text-[9px] tracking-[0.08em] uppercase rounded-lg hover:text-[var(--bo-text)] hover:bg-[var(--bo-surface-hover)] ${ESTADO} ${PRESSAO}`}
            title="Atalhos de teclado"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12" strokeLinecap="round" />
            </svg>
            Atalhos
          </button>
          <button
            type="button"
            onClick={descarregarCopia}
            aria-busy={copiaDeSeguranca.aCorrer || undefined}
            className={`alvo-toque flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[var(--bo-text-faint)] text-[9px] tracking-[0.08em] uppercase rounded-lg hover:text-[var(--bo-text)] hover:bg-[var(--bo-surface-hover)] ${ESTADO} ${PRESSAO}`}
            title="Exportar backup"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path
                d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Backup
          </button>
          {/* A outra metade do botão ao lado. Fica AQUI, encostado ao
            Backup, porque é aqui que se procura num dia mau — e porque
            uma cópia sem forma de a repor nunca foi uma cópia. */}
          <button
            onClick={() => setRestoreOpen(true)}
            className={`alvo-toque flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[var(--bo-text-faint)] text-[9px] tracking-[0.08em] uppercase rounded-lg hover:text-[var(--bo-text)] hover:bg-[var(--bo-surface-hover)] ${ESTADO} ${PRESSAO}`}
            title="Repor cópia de segurança"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path
                d="M12 21V9m0 0l-4 4m4-4l4 4M5 3h14"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Repor
          </button>
          <button
            onClick={pedirParaSair}
            className={`alvo-toque flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[var(--bo-text-faint)] text-[9px] tracking-[0.08em] uppercase rounded-lg hover:text-[var(--bo-text)] hover:bg-[var(--bo-surface-hover)] ${ESTADO} ${PRESSAO}`}
            title="Terminar sessão"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path
                d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Sair
          </button>
        </div>
      </div>
    </>
  );
}
