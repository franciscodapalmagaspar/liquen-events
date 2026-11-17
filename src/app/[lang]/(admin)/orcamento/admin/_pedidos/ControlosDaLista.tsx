"use client";

import { type RefObject } from "react";
import { type useToast } from "../Toast";
import { dateStamp, downloadCsv, quotesToCsvRows } from "../exportar-em-csv";
import { type FiltrosDaLista } from "./useFiltrosDosPedidos";
import { CATEGORIES } from "@/lib/orcamento/data";
import { mesLegivel } from "@/lib/orcamento/pedidos/textos-do-pedido";
import { Escolha } from "../ui/Escolha";
import { ESTADO, PRESSAO } from "../ui/movimento";
import { FILTRO_CAIXA, FILTRO_CLASSES } from "./pele-da-lista";

/**
 * OS CONTROLOS DA LISTA DE PEDIDOS — a procura, o abridor do painel dos filtros
 * no telemóvel, os filtros e a ordem. (Saíram do `AdminClient.tsx` na fase 7 de
 * `docs/ESTRUTURA-DO-CODIGO.md`, tal e qual.)
 */
export interface ControlosDaListaProps {
  filtros: FiltrosDaLista;
  userName: string;
  toast: ReturnType<typeof useToast>["toast"];
  searchRef: RefObject<HTMLInputElement | null>;
  mesesDisponiveis: string[];
  regioesDisponiveis: string[];
  plannersDisponiveis: string[];
}

export function ControlosDaLista({
  filtros,
  userName,
  toast,
  searchRef,
  mesesDisponiveis,
  regioesDisponiveis,
  plannersDisponiveis,
}: ControlosDaListaProps) {
  const {
    filterCategory,
    setFilterCategory,
    filterEspera,
    setFilterEspera,
    filterMes,
    setFilterMes,
    filterRegiao,
    setFilterRegiao,
    filterPlanner,
    setFilterPlanner,
    mineOnly,
    setMineOnly,
    search,
    setSearch,
    filtrosAbertos,
    setFiltrosAbertos,
    sort,
    setSort,
    filtrosActivos,
    filtered,
  } = filtros;
  return (
    <>
      {/* ── OS CONTROLOS, E O ECRÃ QUE ELES COMIAM ───────────────────
          Medido a 390×844: o primeiro cartão de pedido começava a 436 px.
          Metade do telemóvel gasta em controlos antes de se ver aquilo a
          que se veio — quatro filtros de larguras diferentes em três filas
          irregulares.

          A procura fica à vista, porque essa usa-se em todas as sessões.
          O resto recolhe atrás de um botão que diz QUANTOS estão activos.
          A partir de `lg` o painel é sempre visível e o botão desaparece:
          no computador há largura para tudo numa fila, e era assim que já
          estava. */}
      <div
        style={{ "--cena": 0 } as React.CSSProperties}
        className="bo-cena flex flex-col lg:flex-row lg:items-center gap-2.5 sm:gap-3 mb-2.5 sm:mb-4 lg:mb-6"
      >
        <div className="flex items-center gap-2 lg:flex-1 lg:max-w-md">
          <div className="relative flex-1">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/28"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Procurar pedidos por nome, email, local ou ID"
              /* ── O QUE ESTE CAMPO DIZIA, E O QUE CABIA ─────────────
                 Era «Procurar por nome, email, local, ID…  ( / )», e a
                 390 px aparecia cortado a meio, a acabar em «( /» — uma
                 dica de atalho de TECLADO, num aparelho onde não há tecla
                 nenhuma para carregar. Um rótulo cortado não ensina nada;
                 ensina que a página está partida.
                 A dica passa para um `kbd` que só existe onde há teclado,
                 e o texto encolhe até caber ao lado do «Filtros». O que
                 se pode procurar continua dito por inteiro no
                 `aria-label`, que é quem serve o leitor de ecrã. */
              placeholder="Procurar pedidos…"
              className={`w-full bg-[var(--bo-surface)] border border-[var(--bo-hairline)] rounded-xl pl-10 pr-3 py-2.5 text-sm text-[var(--bo-tinta-72)] placeholder-foreground/22 focus:outline-none focus:border-foreground/25 ${ESTADO}`}
            />
            <kbd className="pointer-coarse:hidden absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-[var(--bo-hairline-strong)] px-1.5 py-0.5 text-[10px] text-[var(--bo-text-faint)] lg:block">
              /
            </kbd>
          </div>
          {/* O ABRIDOR. `lg:hidden` porque no computador o painel está
              sempre aberto e um botão que não faz nada é ruído. */}
          <button
            type="button"
            onClick={() => setFiltrosAbertos((v) => !v)}
            aria-expanded={filtrosAbertos}
            aria-controls="painel-filtros-pedidos"
            className={`alvo-toque lg:hidden shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[13px] font-medium ${ESTADO} ${PRESSAO} ${
              filtrosActivos > 0
                ? "bg-sage-600 border-sage-600 text-white"
                : "bg-[var(--bo-surface)] border-[var(--bo-hairline)] text-[var(--bo-text-muted)]"
            }`}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M3 5h18M6 12h12M10 19h4" />
            </svg>
            Filtros
            {filtrosActivos > 0 && (
              <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-[var(--bo-surface)]/25 px-1 text-[12px] font-semibold">
                {filtrosActivos}
              </span>
            )}
          </button>
        </div>
        <div
          id="painel-filtros-pedidos"
          role="group"
          aria-label="Filtros dos pedidos"
          /* `hidden` a sério, e não `opacity-0`: fechado, também não se
             percorre com o teclado nem com o leitor de ecrã. */
          /* ── E ABERTO, ABRE DE ALGUM SÍTIO ──────────────────────────
             O painel passava de `hidden` a `grid` num fotograma: seis
             controlos e a lista inteira a descer de uma vez, sem nada a
             dizer de onde é que aquilo veio. É o gesto que ela faz mais
             vezes no telemóvel, e era dos mais secos.

             A `bo-entrada` da casa, e não uma transição própria: quatro
             píxeis vindos de CIMA, que é onde está o botão que a abriu.
             Só `transform` e `opacity`; o `hidden` continua a ser quem
             fecha, portanto o teclado e o leitor de ecrã continuam a não
             percorrer o que está fechado. E não atrasa nada — os seis
             controlos estão no sítio e clicáveis no primeiro fotograma.

             Não leva `motion-safe:`: a classe traz a guarda dentro dela
             (`@media (prefers-reduced-motion: reduce) { .bo-entrada {
             animation: none } }`), como as outras nove entradas da casa.

             A classe vive no ramo ABERTO do ternário, e é o que faz o
             gesto repetir-se sem `key` e sem um fotograma de JavaScript:
             `display: none` termina a animação, e voltar a desenhar o
             elemento volta a arrancá-la (CSS Animations, § display).
             MEDIDO num Chromium 141, três aberturas seguidas com cliques
             a sério: opacidade 0,22 / 0,22 / 0,22 dois fotogramas depois
             de cada uma — ver `e2e/entrada-que-se-repete.mjs`. */
          className={`${filtrosAbertos ? "grid bo-entrada" : "hidden"} grid-cols-2 gap-2 lg:flex lg:flex-wrap`}
        >
          <button
            onClick={() => setMineOnly((v) => !v)}
            title={`Mostrar apenas pedidos atribuídos a ${userName}`}
            className={`alvo-toque flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs border ${ESTADO} ${PRESSAO} ${
              mineOnly
                ? "bg-sage-600 border-sage-600 text-white"
                : "bg-[var(--bo-surface)] border-[var(--bo-hairline)] text-foreground/45 hover:text-[var(--bo-text-muted)]"
            }`}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
            Atribuídos a mim
          </button>
          {/* ── OS FILTROS DEIXARAM DE ABRIR O MENU DO SISTEMA ───────
              Palavras dela, com uma captura da lista azul do sistema
              aberta por cima da tabela: «aqui também quero com o mesmo
              design da apple».

              Um `<select>` nativo desenha-se com o CSS da casa mas ABRE
              a lista do sistema operativo — azul, com a letra dele, sem
              raio nem material. Não há folha de estilo que lhe chegue: a
              lista é desenhada pelo sistema, fora da página.

              A `Escolha` é a saída que esta casa já tinha: rende um
              `<select>` REAL antes da hidratação (o filtro funciona sem
              JavaScript) e passa a combobox do APG depois de montar — com
              o menu de material, teclado do padrão e o rótulo pelo
              `aria-label`, que um `role="combobox"` não herda de um
              `<label for>`. */}
          <Escolha
            variante="nua"
            containerClassName={FILTRO_CAIXA}
            className={FILTRO_CLASSES}
            valor={filterCategory}
            aoMudar={setFilterCategory}
            aria-label="Filtrar por categoria"
            opcoes={[
              { valor: "all", rotulo: "Todas as categorias" },
              ...CATEGORIES.map((c) => ({ valor: c.id, rotulo: c.label })),
            ]}
          />
          <Escolha
            variante="nua"
            containerClassName={FILTRO_CAIXA}
            className={FILTRO_CLASSES}
            valor={filterEspera}
            aoMudar={(v) => setFilterEspera(v as typeof filterEspera)}
            aria-label="Filtrar por tempo de espera"
            opcoes={[
              { valor: "all", rotulo: "Qualquer espera" },
              { valor: "3", rotulo: "Espera há 3+ dias" },
              { valor: "7", rotulo: "Espera há 7+ dias" },
            ]}
          />
          {mesesDisponiveis.length > 1 && (
            <Escolha
              variante="nua"
              containerClassName={FILTRO_CAIXA}
              className={FILTRO_CLASSES}
              valor={filterMes}
              aoMudar={setFilterMes}
              aria-label="Filtrar por mês do evento"
              opcoes={[
                { valor: "all", rotulo: "Todos os meses" },
                ...mesesDisponiveis.map((m) => ({ valor: m, rotulo: mesLegivel(m) })),
              ]}
            />
          )}
          {regioesDisponiveis.length > 1 && (
            <Escolha
              variante="nua"
              containerClassName={FILTRO_CAIXA}
              className={FILTRO_CLASSES}
              valor={filterRegiao}
              aoMudar={setFilterRegiao}
              aria-label="Filtrar por região"
              opcoes={[
                { valor: "all", rotulo: "Todas as regiões" },
                ...regioesDisponiveis.map((r) => ({ valor: r, rotulo: r })),
              ]}
            />
          )}
          {plannersDisponiveis.length > 0 && (
            <Escolha
              variante="nua"
              containerClassName={FILTRO_CAIXA}
              className={FILTRO_CLASSES}
              valor={filterPlanner}
              aoMudar={setFilterPlanner}
              aria-label="Filtrar por planner"
              opcoes={[
                { valor: "all", rotulo: "Todas as planners" },
                ...plannersDisponiveis.map((n) => ({ valor: n, rotulo: n })),
              ]}
            />
          )}
          <Escolha
            variante="nua"
            /* `col-span-2` no telemóvel: «Quem espera há mais tempo» não
               cabe em meia largura, e um selector com o rótulo cortado
               não diz por que ordem a lista está. Vai no `containerClassName`
               porque quem ocupa a célula da grelha é a caixa, não o botão. */
            containerClassName="col-span-2 min-w-0 flex-1 lg:flex-none"
            className={`w-full ${FILTRO_CLASSES}`}
            valor={sort}
            aoMudar={(v) => setSort(v as typeof sort)}
            aria-label="Ordenar pedidos"
            opcoes={[
              { valor: "espera", rotulo: "Quem espera há mais tempo" },
              { valor: "recent", rotulo: "Mais recentes" },
              { valor: "old", rotulo: "Mais antigos" },
              { valor: "value", rotulo: "Maior valor" },
              { valor: "followup", rotulo: "Seguimentos primeiro" },
              { valor: "eventdate", rotulo: "Data do evento" },
            ]}
          />
          <button
            onClick={() => {
              downloadCsv(`pedidos-${dateStamp()}`, quotesToCsvRows(filtered));
              toast(
                `${filtered.length} pedido${filtered.length !== 1 ? "s" : ""} exportado${filtered.length !== 1 ? "s" : ""}`,
                "success",
              );
            }}
            // `alvo-toque`: 44 px no dedo sem mexer no aspeto com rato.
            // Media 85x38 e passava despercebido porque, a 375 px, ficava
            // fora da margem — os filtros novos mudaram a dobra da barra
            // e trouxeram-no para dentro do ecrã, onde a régua o apanhou.
            className={`alvo-toque flex items-center gap-2 px-3 py-2.5 bg-[var(--bo-surface)] border border-[var(--bo-hairline)] text-foreground/40 text-[10px] tracking-[0.12em] uppercase rounded-xl hover:text-[var(--bo-text-muted)] ${ESTADO} ${PRESSAO} whitespace-nowrap`}
            title="Exportar a lista atual para CSV (Excel)"
          >
            <svg
              width="12"
              height="12"
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
            Exportar
          </button>
        </div>
      </div>
    </>
  );
}
