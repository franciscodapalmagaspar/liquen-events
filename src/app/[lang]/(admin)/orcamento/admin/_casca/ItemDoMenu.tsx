"use client";

import { BARRA_INFERIOR, NAV, type View } from "../nav";
import { ESTADO, PRESSAO } from "../ui/movimento";

/**
 * Um destino do menu do back office. Era a função `renderNavItem`, no corpo do
 * `AdminClient`; passou a componente na fase 7 de
 * `docs/ESTRUTURA-DO-CODIGO.md`. O botão desenhado é o mesmo.
 */
// One sidebar destination — shared by the always-visible core list and the
// collapsible "Mais" group so both render identically.
export function ItemDoMenu({
  id,
  view,
  pendingCount,
  onEscolher,
}: {
  id: View;
  /** A vista que está à frente. */
  view: View;
  /** Os pedidos por responder — a bolha ao lado de «Pedidos». */
  pendingCount: number;
  onEscolher: (id: View) => void;
}) {
  const item = NAV.find((n) => n.id === id)!;
  const active = view === id;
  // O QUE JÁ ESTÁ NA BARRA DE BAIXO NÃO SE REPETE NA GAVETA.
  // A regra e a razão estão em `nav.tsx`, ao lado do `BARRA_INFERIOR`. Aqui
  // faz-se por CSS e não por JavaScript de propósito: a mesma árvore serve a
  // gaveta do telemóvel e a coluna do computador, e no computador — onde não
  // há barra de baixo nenhuma — a lista tem de continuar completa. Uma
  // condição em JS obrigava a saber a largura antes de desenhar, que é
  // exactamente o que dá saltos ao hidratar.
  const soNoComputador = BARRA_INFERIOR.includes(id) ? "hidden lg:flex" : "flex";
  return (
    <button
      onClick={() => onEscolher(item.id)}
      aria-current={active ? "page" : undefined}
      /* 120 ms e não 150: os 150 que aqui estavam escritos eram, à letra, o
         `--default-transition-duration` do Tailwind copiado à mão — o número
         que sai quando ninguém escolhe. O degrau da casa para passar o rato e
         focar é o `micro`, 120. E `PRESSAO` porque num item de menu carrega-se. */
      /* ── ONDE ELA ESTÁ ≠ ONDE ELA PODE IR ──────────────────────────────
         O activo e o hover pintavam-se IGUAL: os dois com
         `bg-[var(--bo-surface-hover)]` e `text-[var(--bo-text)]`, e a única
         diferença que sobrava era o `font-medium`. Num relance, o destino
         onde ela ESTÁ e o destino que o dedo está prestes a escolher eram a
         mesma pastilha cinzenta — quem distinguia de facto era o filete, e o
         filete vivia FORA da pastilha, encostado à margem, a ler-se como
         outro objecto.

         O activo passa a ter a cor da casa: a lavagem de acento
         (`--bo-accent-ring`, que já existia para o anel de foco) e tinta de
         acento no rótulo e no ícone. O hover fica como estava — lavagem
         cinzenta neutra. São duas lavagens diferentes em luminosidade E em
         matiz, e o `font-medium` continua lá como segunda pista, portanto a
         distinção não depende só da cor.

         MEDIDO, sobre o branco desta coluna: o acento sobre a sua própria
         lavagem dá **5,19:1**, e texto normal pede 4,5:1 — passa AA. A
         lavagem de acento contra o branco dá 1,26:1 contra os 1,10:1 da
         cinzenta, ou seja também se distinguem uma da outra. */
      className={`alvo-toque !justify-start group ${soNoComputador} items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] ${ESTADO} ${PRESSAO} ${
        active
          ? "bg-[var(--bo-accent-ring)] text-[var(--bo-accent)] font-medium"
          : "text-[var(--bo-text-muted)] font-normal hover:bg-[var(--bo-surface-hover)] hover:text-[var(--bo-text)]"
      }`}
    >
      <span
        className={`shrink-0 ${ESTADO} ${
          active
            ? "text-[var(--bo-accent)]"
            : "text-[var(--bo-text-faint)] group-hover:text-[var(--bo-text-muted)]"
        }`}
      >
        {item.icon}
      </span>
      <span className="truncate">{item.label}</span>
      {item.id === "pedidos" && pendingCount > 0 && (
        <>
          {/* ── O NÚMERO DIZ DE QUE É ────────────────────────────────────
              O contador era lido tal e qual: quem ouve o menu ouvia
              «Pedidos, 4» — e um 4 sozinho tanto pode ser o que falta
              responder como a posição do item na lista. A casa já resolve
              isto assim nos cartões da Visão Geral («Pedidos ativos: 4 —
              ainda em aberto»): a bolha fica decorativa e o nome acessível
              leva a frase inteira.

              E há um efeito lateral que vale por si: o nome do botão passa
              a ser estável. Enquanto o número entrava nele, o botão
              chamava-se «Pedidos» num estúdio sem trabalho e «Pedidos 4»
              num estúdio com trabalho — que é o estado normal. O `smoke`
              do back office procurava-o por «Pedidos» exacto e só falhava
              quando havia dados: um teste que passa no vazio e parte na
              vida real. */}
          <span className="sr-only">, {pendingCount} por responder</span>
          {/* `ESTADO` porque esta bolha MUDA DE COR ao trocar de destino
              (acento com branco quando activa, cinzenta quando não) e não
              tinha transição nenhuma: era um corte seco de 0 ms ao lado de
              uma pastilha que se esbate em 120 ms. É a avaria nº 2 do censo
              do `ui/movimento.ts` — «transições em falta» — e não um tempo
              novo: são os MESMOS 120 ms do resto do item. O que NÃO se faz
              aqui é pulsar o número quando ele muda: nesta casa a pulsação
              já quer dizer «está a acontecer agora» (`ui/EmCurso`). */}
          <span
            aria-hidden="true"
            className={`ml-auto min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none tabular-nums ${ESTADO} ${
              active
                ? "bg-[var(--bo-accent)] text-white"
                : "bg-[var(--bo-surface-hover)] text-[var(--bo-text-muted)]"
            }`}
          >
            {pendingCount}
          </span>
        </>
      )}
    </button>
  );
}
