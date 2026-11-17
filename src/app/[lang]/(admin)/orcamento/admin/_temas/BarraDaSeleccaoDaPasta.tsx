"use client";

import { type Dispatch, type SetStateAction } from "react";
import { type ThemeCopyMode, type ThemeImage, type ThemeSummary } from "@/lib/theme-types";
import { type AccaoEmBloco } from "../../../../../../lib/temas/listas-de-fotos";
import { plural } from "@/lib/plural";
import { Button, EmCurso, Glass } from "../ui";

/** A barra da selecção da pasta (transferir, copiar, descarregar, remover)
 *  e a espera do que ela mandou fazer. (Saiu da pasta do tema na fase 8 da
 *  estrutura do código, tal e qual.) */
export interface BarraDaSeleccaoDaPastaProps {
  images: ThemeImage[];
  setCopyOpen: Dispatch<SetStateAction<boolean>>;
  setCopyMode: Dispatch<SetStateAction<ThemeCopyMode>>;
  selected: Set<string>;
  bulkBusy: boolean;
  emBloco: AccaoEmBloco | null;
  aMover: { feito: number; total: number } | null;
  anuncio: string;
  clearSelection: () => void;
  pedirParaRemoverAsSeleccionadas: () => void;
  setAsCover: (im: ThemeImage, comAnular?: boolean) => Promise<boolean>;
  selectedCount: number;
  otherThemes: ThemeSummary[];
  downloading: boolean;
  downloadSelected: () => Promise<void>;
}

export function BarraDaSeleccaoDaPasta({
  images,
  setCopyOpen,
  setCopyMode,
  selected,
  bulkBusy,
  emBloco,
  aMover,
  anuncio,
  clearSelection,
  pedirParaRemoverAsSeleccionadas,
  setAsCover,
  selectedCount,
  otherThemes,
  downloading,
  downloadSelected,
}: BarraDaSeleccaoDaPastaProps) {
  return (
    <>
      {/* A BARRA DA SELEÇÃO E A ESPERA DO QUE ELA MANDOU FAZER, no mesmo
          bloco colado ao topo.

          São dois cartões e não um: a remoção esvazia a seleção logo (é
          otimista), a barra de ações desaparece nesse instante e o cartão da
          espera tem de FICAR — os pedidos ainda vão a caminho. A "Transferir"
          faz o contrário: a seleção mantém-se e os dois vêem-se juntos.

          O `sticky` está no invólucro para que a espera acompanhe o scroll tal
          como a barra acompanhava; a 390 px cada um ocupa a largura toda e
          empilham. */}
      {/* ── O QUE O ARRASTO DIZ A QUEM OUVE O ECRÃ ──────────────────────────
          «Operações de arrasto anunciadas em `role="status"`» (Parte 7), e a
          Parte 4 dá a frase: «3 fotografias movidas para Bouquets
          Campestres.» O toast não serve para isto — flutua no canto, some ao
          fim de quatro segundos e o «Anular» que ele carrega é para quem VÊ.

          `aria-label` porque esta página tem outras duas regiões `status` (o
          `ToastProvider` e o estado da vista da lista); sem nome, quem navega
          por regiões encontra três iguais. Vazia em repouso — uma região viva
          com texto lá dentro é lida outra vez a cada re-desenho. */}
      <p role="status" aria-live="polite" aria-label="Movimento de fotografias" className="sr-only">
        {anuncio}
      </p>

      {(selectedCount > 0 || emBloco || aMover) && (
        <div className="sticky top-2 z-20 mb-4 flex flex-col gap-2">
          {selectedCount > 0 && (
            /* ── A PRIMEIRA SUPERFÍCIE DE VIDRO A SÉRIO DA CASA ──────────
               «Aplica-o a uma superfície só — e olha para ela num ecrã com
               fotografias por trás. É onde o efeito se prova.»
               (`docs/LIQUID-GLASS.md`, Parte 7, ponto 3.)

               É esta. A Parte 6 manda o vidro para «a barra de filtros» dos
               Temas e deixa os cartões opacos, e esta é a barra que flutua
               neste ecrã: fica colada ao topo enquanto a grelha de fotografias
               lhe passa por baixo. O documento dela pedia a barra do portal do
               cliente, e essa não existe — o portal é um documento que rola,
               sem sub-navegação nem barra de preço. Trocá-la por esta mantém a
               condição que interessa (fotografias a mexer por trás) e não
               inventa um ecrã para provar um material.

               O que estava aqui era `backdrop-blur` com o fundo a 95%: o
               «frosted glass» que a Parte 1 diagnostica, e opaco ao ponto de o
               desfoque não se ver.

               ── E PORQUE É QUE O FUNDO É 78% E NÃO MENOS ──────────────────
               Porque a Parte 5 diz que o texto sobre vidro precisa de fundo
               próprio, e este texto não tem nenhum. MEDIDO, no pior caso de
               cada tema — foto preta por baixo em claro, foto branca em
               escuro:

                   fundo   texto 82%        dica 72%
                   70%     6,73 / 4,55      4,88 / 3,95   ← a dica reprova
                   78%     7,97 / 5,86      6,03 / 4,95   ✓
                   86%     9,27 / 7,56      —             (vidro por ver)

               Os 78% são o ponto onde o vidro se vê E o pior caso continua
               acima de 4,5:1. A dica sobe de 64% para 72% de tinta pela mesma
               conta: a 64% reprovava a qualquer opacidade que deixasse ver o
               material. Continua a ler-se como secundária — 72 contra 82. */
            <Glass
              superficie="barra"
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-sage-600/25 bg-[var(--bo-surface)]/78 px-4 py-3"
            >
              <p className="text-sm text-[var(--bo-text)]">
                {plural(selectedCount, "foto selecionada", "fotos selecionadas")}
              </p>
              <span className="hidden text-xs text-[var(--bo-tinta-72)] sm:inline">
                Shift + clique seleciona tudo o que está pelo meio.
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {selectedCount === 1 && (
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => {
                      const one = images.find((i) => selected.has(i.path));
                      if (one) setAsCover(one);
                    }}
                  >
                    Definir como capa
                  </Button>
                )}
                {/* ⚠️ "Transferir", aqui ao lado, já significa DESCARREGAR. Esta
                ação chama-se "Copiar para…" — a palavra transferir está
                proibida para ela, senão passam a existir dois significados no
                mesmo sítio. Só aparece havendo outro tema para onde levar. */}
                {otherThemes.length > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setCopyMode("copiar");
                      setCopyOpen(true);
                    }}
                  >
                    Copiar para…
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  loading={downloading}
                  onClick={downloadSelected}
                >
                  Transferir
                </Button>
                <Button size="sm" variant="secondary" onClick={clearSelection}>
                  Limpar seleção
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={bulkBusy}
                  onClick={pedirParaRemoverAsSeleccionadas}
                >
                  Remover
                </Button>
              </div>
            </Glass>
          )}
          {aMover && (
            /* A espera do arrasto, no mesmo sítio e com o mesmo desenho da
               transferência e da remoção. Um lote de quarenta fotografias
               demora, e a única coisa que se via era a grelha parada. */
            <div className="rounded-xl bg-[var(--bo-surface)]/95 backdrop-blur">
              <EmCurso
                titulo="A mover as fotos…"
                feito={aMover.feito}
                total={aMover.total}
                nota="Podes continuar a usar o ecrã. Se te enganaste, o aviso no fim traz «Anular»."
              />
            </div>
          )}
          {emBloco && (
            /* Fundo opaco por baixo: o cartão da espera é translúcido de
               propósito (é um tom sobre o papel), e colado ao topo passava a
               ter as fotos a rolar por trás. */
            <div className="rounded-xl bg-[var(--bo-surface)]/95 backdrop-blur">
              <EmCurso
                titulo={
                  emBloco.tipo === "transferir" ? "A transferir as fotos…" : "A remover as fotos…"
                }
                feito={emBloco.feito}
                total={emBloco.total}
                nota={
                  emBloco.tipo === "transferir"
                    ? "Uma de cada vez — é assim que o navegador as deixa passar todas. Podes continuar a usar o ecrã."
                    : "As propostas já feitas com estas fotos não são afetadas."
                }
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
