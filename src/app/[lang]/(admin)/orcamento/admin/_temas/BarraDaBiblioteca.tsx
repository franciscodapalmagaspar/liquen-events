"use client";

import { type Dispatch, type SetStateAction } from "react";
import { type ThemeSummary } from "@/lib/theme-types";
import { type PedidoDeMenu } from "../MenuDeContexto";
import { Button, Escolha, Toolbar, type AccaoDeItem } from "../ui";
import { ESTADO, PRESSAO } from "../ui/movimento";
import { PlusIcon, SearchIcon } from "./icones";
import { ORDENS, ORDENS_DE_USO, type Densidade, type Ordem } from "@/lib/temas/ordem";
import { MENU_DA_BIBLIOTECA } from "./pele-da-biblioteca";
import { guardarDensidade, guardarOrdem } from "./preferencias-guardadas";

/** A barra da Biblioteca de Temas: procurar, as contas, a ordem, a
 *  densidade, o menu e «Novo tema». (Saiu da Biblioteca de Temas na fase 8 da
 *  estrutura do código, tal e qual.) */
export interface BarraDaBibliotecaProps {
  themes: ThemeSummary[];
  loading: boolean;
  adding: boolean;
  setAdding: Dispatch<SetStateAction<boolean>>;
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  densidade: Densidade;
  setDensidade: Dispatch<SetStateAction<Densidade>>;
  ordem: Ordem;
  setOrdem: Dispatch<SetStateAction<Ordem>>;
  usos: Record<string, number> | null;
  menu: PedidoDeMenu | null;
  setMenu: Dispatch<SetStateAction<PedidoDeMenu | null>>;
  accoesDaBiblioteca: AccaoDeItem[];
  estadoDaVista: string;
  searchable: boolean;
}

export function BarraDaBiblioteca({
  themes,
  loading,
  adding,
  setAdding,
  search,
  setSearch,
  densidade,
  setDensidade,
  ordem,
  setOrdem,
  usos,
  menu,
  setMenu,
  accoesDaBiblioteca,
  estadoDaVista,
  searchable,
}: BarraDaBibliotecaProps) {
  return (
    <>
      {/* ── A ESCADA DESTA VISTA ────────────────────────────────────────────
          QUATRO blocos, pela ordem de leitura: os controlos (0), os filtros
          (1), o aviso dos nomes por arrumar (2) e a grelha dos temas (3). A
          escada é a da casa (`.bo-cena` no `globals.css`) — 600 ms, degraus de
          20 ms, tecto ao sexto, desligada em `prefers-reduced-motion`.

          ── E O DEGRAU NOVO NÃO SE ACRESCENTA NO FIM ─────────────────────────
          Os filtros nasceram com `--cena: 0`, a partilhar a vez com os
          controlos, e o `vistas-que-se-compoem.test.ts` chumbou — «há blocos a
          partilhar a mesma vez: 0, 0, 1, 2». Não é cosmético: dois blocos a
          entrar no mesmo instante lêem-se como UM bloco, e a escada existe
          justamente para o olho seguir a ordem de leitura.

          Um bloco que entra a meio da página empurra os degraus abaixo dele.
          Contar de cima e renumerar é o preço; pô-lo no fim, longe de onde se
          lê, era pior — a entrada deixava de acompanhar os olhos. */}
      <Toolbar
        style={{ "--cena": 0 } as React.CSSProperties}
        className="bo-cena mb-6"
        start={
          /* ── O CAMPO E O ESTADO DA VISTA, NA MESMA LINHA E NA MESMA BASE ──
             Pedido dela, na Fase 3: «"395 fotos em 25 temas" está órfão». Era
             filho da caixa `relative` que ancora a lupa — herdava a largura do
             campo e lia-se como se descrevesse o que lá estava escrito.

             Agora é IRMÃO do campo e ao LADO dele, não por baixo: o
             `docs/APPLE-TEMAS.md` (ponto 4) manda que a contagem seja o estado
             da vista, «ao lado do campo, em role="status" aria-live="polite"»,
             e que mude ao filtrar. Um estado é uma coisa que se lê de relance
             na mesma linha dos controlos; uma legenda pendurada por baixo é
             uma nota de rodapé.

             A DESCRIÇÃO DA SECÇÃO SAIU («Guarda aqui as fotos por tema…»):
             ponto 3 da auditoria — quem entra na secção Temas sabe o que são
             temas, e a descrição estava a ocupar a linha de maior destaque.

             `basis-72 grow-0` no campo: a largura decide-se pela fila onde ele
             está, não pela janela, e a `Toolbar` já é `flex flex-wrap`. A 375 px
             a fila parte-se e o estado desce para baixo do campo sozinho.

             E `w-72`, não `w-full`. MEDIDO num browser a 1440: com `w-full`, o
             Chrome contava o campo pela largura natural do `input` (~245 px)
             ao medir a fila, e depois desenhava-o com os 288 do `basis-72` —
             a fila ficava 43 px mais curta do que o que lá cabia, e o estado
             caía para baixo do campo com toda a largura da janela livre ao
             lado. Com a largura dita, a fila mede 437 e o estado fica ao lado,
             na mesma linha dos 40 px dos controlos da direita.

             ── UMA ALTURA SÓ NA BARRA INTEIRA: 40 px ───────────────────────
             Ponto 5 da auditoria: o campo «alinhado na mesma linha e na mesma
             baseline dos outros controlos». CONTADO pelas classes, com rato
             (não medido num browser): campo 42 px (`py-2.5` + `text-sm` +
             fio), ordenação 34 a 38 (duas cadeias de `py` na mesma classe),
             tamanho dos cartões 34, «⋯» 36, «Novo tema» 32 — cinco
             controlos, quatro ou cinco alturas. Passam todos a `h-10`, que é
             o degrau `md` do `ui/Button` (`h-10 pointer-coarse:h-11`) e o
             tamanho por omissão da casa. Os 32 do `sm` seriam o outro degrau que existe,
             e ficaram de fora por uma razão que ganha ao documento: «alvo
             efetivo ≥ 40 px em desktop» (Parte 9.1 do sistema de design;
             «Alvos ≥ 40 px» na Parte 7 do dos temas). No dedo continuam os 44
             de sempre — o `input` pela regra do `globals.css`, a ordenação
             pelo `pointer-coarse:min-h-11` do `Escolha`, os botões pelo
             `.alvo-toque` e pelo `pointer-coarse:h-11` do `Button`. */
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {searchable && (
              // O campo só aparece quando há lista que chegue para justificar
              // um controlo a mais — com três temas, procurar é mais trabalho
              // do que ler.
              <div className="relative w-72 max-w-full basis-72 grow-0">
                {SearchIcon}
                {/* ── «PROCURAR TEMAS», E NÃO «… E FOTOGRAFIAS» ─────────────
                    A Parte 6 do documento propõe «Procurar temas e
                    fotografias». Esta procura só lê o NOME e as NOTAS do tema
                    (ver o `visible`, mais acima); uma fotografia não tem texto
                    por onde se ache. Prometer fotografias era um campo que
                    mente na primeira vez que se usa — fica a metade
                    verdadeira, no plural, que é o que a lista mostra.

                    ── E O RAIO DOS CONTROLOS, 10 px ────────────────────────
                    Ponto 5: «campo de pesquisa a 10 px, como tudo o resto» —
                    mini a medium são rectângulos arredondados, cápsula só em
                    large. O `.bo-input` desenha o raio com `var(--bo-radius)`
                    (8 px, o do CONTEÚDO) numa regra fora de camadas, que
                    ganharia a qualquer `rounded-*`. Em vez de a vencer com um
                    `!important`, redefine-se a variável que ela lê, só neste
                    elemento, para o token do controlo (`--radius-control`,
                    `tema.css`). A ordenação ao lado recebe o mesmo. */}
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Procurar temas"
                  aria-label="Procurar tema por nome ou nota"
                  disabled={loading}
                  className="bo-input h-10 pl-10 pr-3 text-sm text-[var(--bo-text)] placeholder-foreground/30 [--bo-radius:var(--radius-control)]"
                />
              </div>
            )}
            {/* O ESTADO DA VISTA. `aria-live="polite"` e não `assertive`:
                muda a cada tecla escrita na procura, e um leitor de ecrã a
                interromper-se a si próprio a cada letra não deixa ouvir nem o
                campo nem a contagem. */}
            <p
              role="status"
              aria-live="polite"
              // O nome distingue esta região da do `ToastProvider`, que também
              // é um `role="status"` e vive na mesma página: sem ele, quem
              // navega por regiões encontra duas «status» e não sabe qual é
              // qual.
              aria-label="Temas à vista"
              className="bo-text-muted text-xs"
            >
              {estadoDaVista}
            </p>
          </div>
        }
        end={
          /* SEM CAIXA À VOLTA, e é isso que corrige a vista no telemóvel.
             Esta fila estava embrulhada num `div.flex items-center gap-2` —
             uma cópia do que o `Toolbar` já põe à volta do `end`, mas SEM o
             `flex-wrap` dele. Uma fila que não quebra não encolhe: pedia
             591 px num ecrã de 390, esticava o documento para 607, e a barra
             de navegação de baixo (que é `w-full`) nascia com 607 px de
             largura e o topo 413 px abaixo do fundo do ecrã — nesta vista
             ficava-se sem navegação nenhuma. Tirar a caixa devolve a fila ao
             contentor que sabe quebrá-la; medido, o documento volta aos
             390 px. Ver `e2e/geometria-dos-alvos.spec.ts` (D4). */
          /* ══════════════════════════════════════════════════════════
             OS CONTROLOS AGRUPADOS PELO QUE FAZEM
             ══════════════════════════════════════════════════════════

             Pedido dela, na Fase 3: «os controlos estão todos alinhados sem
             agrupamento».

             Estavam: cinco controlos em fila, todos com a mesma folga entre
             si — a ordenação, «Rever etiquetas», «Arquivados», o tamanho dos
             cartões e «Novo tema». Espaçamento igual quer dizer «isto é uma
             lista de cinco coisas sem relação», e não era verdade: três deles
             mudam COMO a lista se vê, um muda O QUE ela contém, e dois FAZEM
             alguma coisa.

             O agrupamento é feito com folga e não com linhas divisórias, de
             propósito: uma linha vertical entre grupos parte-se assim que a
             fila quebra no telemóvel — e ela quebra sempre. A folga quebra
             bem. Dentro de um grupo `gap-1.5`; entre grupos, `gap-x-5`. A
             razão entre as duas é o que se lê.

             (A fila não leva caixa própria: o `Toolbar` já dá uma ao `end`, e
             uma segunda por dentro custou-lhe uma vez a navegação inteira no
             telemóvel — ver a nota acima e o `geometria-dos-alvos.spec.ts`.) */
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {/* ── VER: como a lista se mostra ─────────────────────────── */}
            {themes.length > 2 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Era um `<label>` a embrulhar o `<select>`, com o nome num
                    `sr-only` lá dentro. Um rótulo implícito nomeia um `<select>`
                    porque ele é nativo; NÃO nomeia um `role="combobox"`, que
                    recebe o nome do autor. Ficava um campo sem nome nenhum para
                    quem ouve o ecrã — e sem ninguém dar por isso. */}
                <div className="flex items-center">
                  <Escolha
                    aria-label="Ordenar os temas"
                    valor={ordem}
                    aoMudar={(v) => {
                      const o = v as Ordem;
                      setOrdem(o);
                      guardarOrdem(o);
                    }}
                    containerClassName="w-auto"
                    /* A altura e o raio da barra — ver a nota «UMA ALTURA SÓ»
                       no campo de procura. `py-0` porque quem manda é o
                       `h-10`, e o preenchimento da pele só tirava espaço ao
                       texto. */
                    className="h-10 py-0 pl-3 text-xs text-[var(--bo-tinta-72)] [--bo-radius:var(--radius-control)]"
                  >
                    {/* «Mais usados» e «Menos usados» só entram quando a
                        contagem de propostas chegou — ver `ORDENS`. Oferecer
                        uma ordem que ainda não sabe ordenar era pedir-lhe que
                        carregasse e não visse mexer nada. */}
                    {ORDENS.filter((o) => usos || !ORDENS_DE_USO.includes(o.valor)).map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.rotulo}
                      </option>
                    ))}
                  </Escolha>
                </div>
                <div
                  role="group"
                  aria-label="Tamanho dos cartões"
                  /* `min-h-10`, e os botões esticam: a moldura de 1 px
                     está DENTRO dos 40, como nos outros controlos da fila.

                     `hidden sm:flex` (9/11): abaixo de 640 px as duas
                     densidades dão a MESMA grelha de duas colunas (ver
                     `COLUNAS`) — o botão não mudava nada no telemóvel, e
                     empurrava o «⋯» e o «Novo tema» para uma terceira linha. */
                  className="hidden min-h-10 sm:flex overflow-hidden rounded-lg border border-[var(--bo-hairline-strong)]"
                >
                  {(
                    [
                      ["compacto", "Compacto"],
                      ["confortavel", "Confortável"],
                    ] as const
                  ).map(([valor, rotulo]) => (
                    <button
                      key={valor}
                      type="button"
                      aria-pressed={densidade === valor}
                      onClick={() => {
                        setDensidade(valor);
                        guardarDensidade(valor);
                      }}
                      className={`alvo-toque px-3 text-[10px] uppercase tracking-[0.12em] ${ESTADO} ${PRESSAO} ${
                        densidade === valor
                          ? "bg-[var(--bo-tinta-6)] text-[var(--bo-tinta-72)]"
                          : "text-foreground/40 hover:text-[var(--bo-text-muted)]"
                      }`}
                    >
                      {rotulo}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── FAZER ───────────────────────────────────────────────────
                Era «Rever etiquetas» em `ghost` ao lado de «Novo tema»: um
                link de texto entre botões de barra, que é a última linha das
                proibições da Parte 9 do `docs/APPLE-TEMAS.md` — uma acção de
                manutenção rara com o mesmo peso visual dos controlos de vista.

                Passa para dentro do «⋯», que é onde a Apple põe o que se faz
                de vez em quando («máximo três grupos de controlos numa
                toolbar»). Fica com um item só, e é assim que se quer: é a
                gaveta que espera pelo «Fundir temas…» e pelo «Exportar
                biblioteca…» do documento, e um item numa gaveta é melhor do
                que um item a competir com a acção que ela faz todos os dias.

                ── E PORQUE É QUE NÃO É UM `MenuDeAccoes` ───────────────────
                Porque esse esconde-se em repouso onde há rato
                (`com-rato:opacity-0` + `group-hover`), que é exactamente o que
                o torna certo EM CIMA DE UM CARTÃO e errado numa barra: sem um
                `group` à volta, o «⋯» ficaria invisível e «Rever etiquetas»
                deixava de ser encontrável. O painel é o mesmo — o mesmo
                material, os mesmos itens, a mesma lista de `AccaoDeItem` —,
                aberto no `MenuDeContexto`, que é o menu deste ecrã. */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menu?.de === "barra"}
                aria-label={`Acções de ${MENU_DA_BIBLIOTECA}`}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  // Ancorado ao canto inferior esquerdo do botão: o painel
                  // desce dele como desceria de um «⋯» de cartão, e o
                  // `MenuDeContexto` encosta-o para dentro se não couber.
                  setMenu({
                    x: r.left,
                    y: r.bottom + 4,
                    de: "barra",
                    sobre: MENU_DA_BIBLIOTECA,
                    accoes: accoesDaBiblioteca,
                  });
                }}
                className={`alvo-toque flex h-10 w-10 items-center justify-center rounded-lg text-[var(--bo-text-muted)] hover:text-[var(--bo-tinta-72)] active:bg-[var(--bo-tinta-10)] ${ESTADO} ${PRESSAO}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <circle cx="5" cy="12" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="19" cy="12" r="1.6" />
                </svg>
              </button>
              <Button
                variant={adding ? "secondary" : "primary"}
                // `md` e não `sm`: os 40 px da fila — ver «UMA ALTURA SÓ».
                size="md"
                iconLeft={adding ? undefined : PlusIcon}
                onClick={() => setAdding(!adding)}
              >
                {adding ? "Cancelar" : "Novo tema"}
              </Button>
            </div>
          </div>
        }
      />
    </>
  );
}
