"use client";

import type { MoodBoard } from "@/lib/proposal-doc";
import type { HTMLAttributes } from "react";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import { TITULO_DO_BOARD } from "../../classes";
import { MenuDeAccoes } from "../../../ui/MenuDeAccoes";
import { useEstudio } from "../../contexto";

export function CabecalhoDoBoard({
  b,
  bi,
  dobrado,
  fechado,
  pega,
  pos,
}: {
  b: MoodBoard;
  bi: number;
  dobrado: boolean;
  fechado: boolean;
  pega: HTMLAttributes<HTMLElement>;
  pos: number;
}) {
  const {
    arrumacao: { alternarBloqueio, duplicarBoard, moveBoard },
    dobras: { alternarDobra },
    documento: { doc },
    fotos: { assetCores },
    fotosDosBoards: { arrumarPorCor },
    moodBoards: { removeBoard, updateBoard },
    traducoes: { caixaDeIngles },
  } = useEstudio();
  return (
    <div className="flex flex-wrap items-center gap-2 mb-2">
      {/* A PEGA DO CARTÃO. Alvo próprio, sempre visível ao
                            toque: com oito boards, levar o último ao topo eram
                            sete cliques nas setas. */}
      <button
        type="button"
        {...pega}
        aria-label={`Arrastar o mood board ${pos + 1}`}
        className={`alvo-toque flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-foreground/35 hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-tinta-72)] active:cursor-grabbing ${ESTADO} ${PRESSAO}`}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      {/* ── A DOBRA ──────────────────────────────────
                                  Um board terminado ocupa um ecrã inteiro de
                                  altura. Fechado fica com o que basta para o
                                  reconhecer: título, subtítulo, quantas fotos
                                  tem e uma tira de miniaturas. */}
      <button
        type="button"
        onClick={() => b.id && alternarDobra(b.id)}
        aria-expanded={!dobrado}
        aria-label={dobrado ? `Abrir o mood board ${pos + 1}` : `Fechar o mood board ${pos + 1}`}
        className={`alvo-toque flex h-8 w-6 shrink-0 items-center justify-center rounded-md text-foreground/40 hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-tinta-72)] ${ESTADO} ${PRESSAO}`}
      >
        <span aria-hidden="true">{dobrado ? "▸" : "▾"}</span>
      </button>
      <input
        // Num cartão estreito (telemóvel), o título desce para uma
        // linha inteira por baixo dos botões: ao lado deles
        // sobravam ~130 px e «Cerimónia» já não cabia.
        className={`bo-input ${TITULO_DO_BOARD} px-2.5 py-2 text-xs text-[var(--bo-tinta-72)]`}
        value={b.title}
        onChange={(e) => updateBoard(bi, { title: e.target.value })}
        // A pega do aviso de ortografia: é por ela
        // que o «Ver no campo» encontra este
        // controlo (ver `chaveDoCampo`).
        data-campo={`boardTitulo:${bi}`}
        placeholder="Decoração Cerimónia"
        aria-label="Título do mood board"
        readOnly={fechado}
      />
      {/* A segunda caixa fica AO LADO em ecrã largo
                                      e por baixo abaixo de `xl` — ver `aoLado`,
                                      em `CaixaInglesa`. Só de leitura quando a
                                      página está fechada, como a portuguesa: um
                                      board terminado é terminado nas duas
                                      línguas. */}
      {caixaDeIngles({ tipo: "boardTitulo", bi }, "Título do mood board", {
        className: `bo-input ${TITULO_DO_BOARD} px-2.5 py-2 text-xs text-[var(--bo-tinta-72)]`,
        readOnly: fechado,
        placeholder: "Ceremony Decoration",
      })}
      {/* ── FECHAR A PÁGINA ──────────────────────────
                                  Marcada como terminada, fica só de leitura e
                                  muda de cor. Reabrir é um clique — e não uma
                                  pergunta a que se responde sem ler. */}
      <button
        type="button"
        onClick={() => alternarBloqueio(bi)}
        aria-pressed={fechado}
        aria-label={
          fechado
            ? `Reabrir o mood board ${pos + 1} a alterações`
            : `Marcar o mood board ${pos + 1} como terminado`
        }
        className={`alvo-toque flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-xs  ${
          fechado
            ? "bg-sage-600/15 text-sage-600"
            : "text-foreground/35 hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-tinta-72)]"
        } ${ESTADO} ${PRESSAO}`}
      >
        <span aria-hidden="true">{fechado ? "🔒" : "🔓"}</span>
      </button>
      {/* ── O RESTO, NUM «⋯» ─────────────────────────────────
                                      Fase 3 do redesenho: a barra deste cartão tinha seis
                                      ícones soltos (setas, cor, duplicar, remover) e lia-se
                                      como um painel de controlo. Fica à vista o título e o
                                      cadeado — o que diz o estado da página —, e o que se
                                      usa de vez em quando entra no menu, com nomes. Mover
                                      à pressa continua a ser a pega (e o índice ao lado). */}
      <MenuDeAccoes
        sobre={`«${b.title.trim() || `mood board ${pos + 1}`}»`}
        sempreVisivel
        className="ml-auto shrink-0"
        accoes={[
          {
            id: "subir",
            rotulo: "Subir uma posição",
            onAccao: () => moveBoard(pos, -1),
            desativada: pos === 0,
          },
          {
            id: "descer",
            rotulo: "Descer uma posição",
            onAccao: () => moveBoard(pos, 1),
            desativada: pos === doc.moodBoards.length - 1,
          },
          // Arrumar por cor só quando há o que arrumar: três
          // fotos com cor conhecida (ver `arrumarPorCor`).
          ...(b.images.filter((p) => assetCores[p]).length >= 3
            ? [
                {
                  id: "cor",
                  rotulo: "Arrumar as fotografias por cor",
                  onAccao: () => arrumarPorCor(bi),
                  desativada: fechado,
                },
              ]
            : []),
          {
            id: "duplicar",
            rotulo: "Duplicar o mood board",
            onAccao: () => duplicarBoard(bi),
            separadorAntes: true,
          },
          {
            id: "remover",
            rotulo: "Remover o mood board",
            onAccao: () => removeBoard(bi),
            destrutiva: true,
            desativada: fechado,
          },
        ]}
      />
    </div>
  );
}
