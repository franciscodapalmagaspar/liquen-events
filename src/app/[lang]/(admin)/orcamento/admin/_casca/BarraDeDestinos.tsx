"use client";

import { Fragment, type Dispatch, type RefObject, type SetStateAction } from "react";
import { barraDeveSumir } from "@/lib/orcamento/barra-de-destinos";
import { type Quote } from "@/lib/orcamento/types";
import { BARRA_INFERIOR, CORE_NAV, MORE_NAV, NAV, type View } from "../nav";
import { ESTADO, PRESSAO } from "../ui/movimento";
import { DestinoDaBarra } from "./DestinoDaBarra";

/**
 * A BARRA DE DESTINOS DE BAIXO — a cápsula de vidro com os destinos de todos
 * os dias, e o «Mais» que abre a gaveta. «Fica a barra de baixo»
 * (`docs/FAZER-PROPOSTA.md`, Parte −1). Saiu tal e qual do `AdminClient.tsx`
 * (fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`).
 */
export interface BarraDeDestinosProps {
  selected: Quote | null;
  view: View;
  setView: Dispatch<SetStateAction<View>>;
  setNavOpen: Dispatch<SetStateAction<boolean>>;
  navOpen: boolean;
  isDetailOverlay: boolean;
  tecladoNoEcra: boolean;
  barraDeDestinosRef: RefObject<HTMLElement | null>;
  pendingCount: number;
}

export function BarraDeDestinos({
  selected,
  view,
  setView,
  setNavOpen,
  navOpen,
  isDetailOverlay,
  tecladoNoEcra,
  barraDeDestinosRef,
  pendingCount,
}: BarraDeDestinosProps) {
  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════
          A BARRA DE DESTINOS DO TELEMÓVEL — UMA CÁPSULA QUE FLUTUA
          ══════════════════════════════════════════════════════════════════

          Pedido dela, com uma captura de uma barra de navegação a flutuar no
          fundo de um telemóvel: «quero deixar o back office com o mesmo
          design da Apple de liquid glass».

          O que se copia é a FORMA, e o que se copia dela é o que a web sabe
          fazer: a barra deixa de estar encostada ao fundo e a toda a largura
          e passa a ser uma CÁPSULA a flutuar, com folga por baixo e dos
          lados, mais uma peça REDONDA à parte para o abridor da gaveta.

          ── O QUE NÃO SE FINGE ────────────────────────────────────────────
          O material da Apple refracta o que está por trás em tempo real e
          responde ao movimento com brilhos. Em CSS há `backdrop-filter` com
          desfoque e saturação, e mais nada. Portanto: camadas, cantos
          concêntricos, a pastilha do activo e a cápsula a flutuar — sim; um
          vidro pintado a gradientes a fingir refracção — não. É a mesma
          recusa que o `globals.css` já escreveu a propósito da vibrância do
          texto.

          ── PORQUE É QUE O ABRIDOR SAIU DA CÁPSULA ────────────────────────
          Porque não é um destino, e já estava escrito aqui que não é: «é a
          porta para os que não cabem aqui». A captura tem a mesma divisão —
          os destinos numa cápsula, a lupa numa peça redonda separada — e a
          documentação que ela mandou diz o mesmo por palavras: agrupar por
          AFINIDADE, «o que faz coisas parecidas fica junto». Quatro destinos
          num sítio, a porta noutro.

          Continua a ser UM abridor: o hambúrguer do cabeçalho só aparece
          quando esta barra não está. Não voltam a ser dois.

          ── OS 44 PX, CONTADOS A 390 ──────────────────────────────────────
          É a restrição que manda, e conta-se antes de desenhar:

              largura da janela ................... 390 px
              folga lateral (--bo-barra-folga) × 2 . 24
              peça redonda (= altura da cápsula) ... 62
              folga entre as duas peças ............  8
              ──────────────────────────────────────────
              cápsula ............................. 296
              fio da moldura (1 px) × 2 ............  2
              folga do material (4 px) × 2 .........  8
              ──────────────────────────────────────────
              fila útil ........................... 286  ÷ 4 = 71,5 px

          E a altura, pela mesma conta: 62 − 2 (fio) − 8 (folga) = 52. A
          altura da cápsula está contada no `globals.css`, e vem do chão da
          letra do telemóvel — 12 px, não 8.

          73 × 52 por destino, e a peça redonda 62 × 62. Os três acima dos 44
          do `.alvo-toque`, e MEDIDOS num browser — não deduzidos. A 320 px, o
          telemóvel mais estreito que ainda se vê, a fila útil dá 216 ÷ 4 = 54
          px, e continua a passar.

          ── A ALTURA OCUPADA NÃO MUDOU, E ISSO FOI DE PROPÓSITO ───────────
          56 (cápsula) + 12 (folga por baixo) = 68, e o `--bo-barra-inferior`
          reserva 72. O aviso do `Toast`, a barra de acção do estúdio e o
          fundo da lista da biblioteca leem esse token e continuam a pousar
          onde pousavam. A conta e a desigualdade estão no `globals.css` e no
          `barra-inferior.test.tsx`.

          ── E O DEDO PASSA PELOS BURACOS ─────────────────────────────────
          A `<nav>` continua a cobrir a faixa toda, mas deixou de a TAPAR:
          `pointer-events-none` nela e `pointer-events-auto` nas duas peças.
          O que está por baixo, ao lado da cápsula, volta a ser tocável — que
          antes não era.

          Continua escondida enquanto uma gaveta de detalhe está aberta: é
          uma superfície modal, e a barra só lhe sobreporia o rodapé. */}
      <nav
        /* Quem mede a altura dela é a coluna de detalhe, para não lhe acabar
           por baixo. A referência existe para essa medição não ter de
           procurar a barra por um seletor — ver `barraDeDestinosRef`. */
        ref={barraDeDestinosRef}
        /**
         * ── O NOME SEGUE A COISA ────────────────────────────────────────
         *
         * Duas navegações no mesmo ecrã precisam de dois nomes: sem isto, um
         * leitor de ecrã anuncia «navegação» duas vezes e não há como saber
         * qual é qual — nem para quem ouve, nem para um teste.
         *
         * Esta chamava-se «Destinos principais» e a coluna da esquerda
         * chamava-se «Navegação do back office». Trocaram de papel: a coluna
         * acabou, e a navegação do back office é ESTA — em todas as
         * larguras. O nome mudou-se atrás do papel, e não ao contrário.
         *
         * Não é só arrumação: vinte sítios dos passeios do Playwright usam
         * este nome para dizer «já estou dentro do back office», incluindo o
         * arranque que abre a sessão de toda a passagem. Deixá-lo pendurado
         * na lista que passou a `lg:hidden` punha-os todos à espera de uma
         * coisa invisível — o que aconteceu, e é o que isto fecha.
         */
        aria-label="Navegação do back office"
        className={`pointer-events-none fixed bottom-0 inset-x-0 z-30 flex items-end justify-center gap-2 px-[var(--bo-barra-folga)] motion-safe:transition-transform motion-safe:duration-300 ${
          /* ── A REGRA VIVE NUM SÍTIO SÓ, E DIZ-SE EM VOZ ALTA ──────────
             «A barra está sempre, excepto quando alguma coisa modal tomou
             conta do ecrã ou o teclado tomou conta do fundo dele.»

             Aqui estava `selected` sozinho, e era o defeito que a
             colaboradora dela relatou: abaixo de 1280 px o detalhe de um
             pedido é uma folha modal, mas a partir de 1280 é uma COLUNA ao
             lado da lista — e a barra saía nos dois casos. Como a barra é
             hoje a única navegação que há («a barra substitui o menu»), abrir
             um pedido no portátil apagava o menu do ecrã inteiro.

             O `isDetailOverlay` já existia e já era usado para decidir o que
             é modal (trinco do scroll, armadilha de foco, `aria-modal`). O
             que faltava era esta peça usar a mesma resposta que as outras
             três. */
          barraDeveSumir({
            detalheSobreposto: !!selected && isDetailOverlay,
            tecladoAberto: tecladoNoEcra,
          })
            ? "translate-y-full"
            : "translate-y-0"
        }`}
        // A folga por baixo SOMA-SE ao entalhe: no iPhone há a barra de
        // gestos do sistema por baixo de tudo, e uma cápsula que flutue a 12
        // px do bordo da janela flutua a 12 px POR BAIXO dela. A soma põe-a a
        // 12 px do sítio onde o ecrã acaba de facto.
        style={{
          paddingBottom: "calc(var(--bo-barra-folga) + env(safe-area-inset-bottom))",
        }}
      >
        {/* ── A CÁPSULA: OS QUATRO DO DIA ──────────────────────────────────
            Estavam aqui três destinos repetidos da gaveta e um "Mais" que
            abria a mesma gaveta que o hambúrguer do cabeçalho já abria — dois
            abridores em cantos opostos. A regra que ficou é outra: os quatro
            destinos do dia vivem SÓ aqui, o resto vive SÓ na gaveta (a lista
            e a razão estão em `nav.tsx`).

            `min-w-0` na cápsula e `flex-1 min-w-0` em cada destino: sem isso
            o rótulo mais comprido («Fazer proposta») estica a célula dele e
            as quatro deixam de ter a mesma largura. */}
        <div
          /* No telemóvel a cápsula ocupa a faixa toda e reparte-a por
             quatro (`flex-1`). No computador tem DOZE destinos lá dentro e
             não pode esticar-se de margem a margem: mede o que tem
             (`lg:flex-initial`), e se um dia não couber, rola por dentro em vez
             de rebentar a cápsula (`lg:overflow-x-auto`).

             ── `flex-initial` E NÃO `flex-none` ─────────────────────────
             Era `lg:flex-none`, e o `lg:max-w-full` parecia bastar. Não
             bastava: o máximo é a largura do PAI, e o pai tem mais um botão
             ao lado. Com o «Mapa de mesas» a barra passou a treze destinos
             e, medido a 1024 px, a cápsula tinha 966 px + 72 do botão + o
             intervalo, num pai de 1000 — saía 11 px pela esquerda (o
             `o-nome-do-destino-cabe-na-celula` apanhou-o). Com `flex-initial`
             ela pode encolher, e quando encolhe é o `overflow-x-auto` que
             trabalha, como este comentário sempre prometeu. */
          /* ── O GRAU FINO DO MATERIAL, E O QUE ELE CUSTOU A GANHAR ────────
             «eu quero que esteja aquele liquid glass transparente como é
             mesmo no macOS, como é no Instagram, como é no WhatsApp.» Fui
             medir esta cápsula antes de lhe responder, com uma sonda de cor
             conhecida por trás dela e o pixel do meio lido num Chromium:

                 sonda preta ..... rgb(204, 204, 204)
                 sonda branca .... rgb(255, 255, 255)
                 transmissão ..... 51/255 = 20%

             Ou seja o desfoque estava cá, o conteúdo passava mesmo por
             baixo — e a 0,80 de opacidade só um quinto do que passava
             chegava ao olho. O que faltava não era o filtro; era a
             TRANSPARÊNCIA. A `bo-material-fino` é o segundo grau da mesma
             família (0,66 e 32 px de desfoque), e a conta que fixou os dois
             números está no `globals.css`, ao lado do token.

             A `bo-material` continua cá, e tem de continuar: é dela que vêm
             o fio, o raio, a moldura e — o que mais importa — os três
             recuos que devolvem uma superfície opaca a quem não tem
             `backdrop-filter`, a quem pediu menos transparência e a quem
             pediu mais contraste. O grau fino só redefine dois tokens. */
          className="bo-material bo-material-desfoque bo-material-fino bo-material-pilula pointer-events-auto flex min-w-0 flex-1 items-stretch p-[var(--bo-material-folga)] shadow-[var(--bo-sombra-suspensa)] lg:flex-initial lg:max-w-full lg:overflow-x-auto"
          style={{ height: "var(--bo-barra-capsula)" }}
        >
          {/* ── QUATRO NO TELEMÓVEL, TODOS NO COMPUTADOR ─────────────────
              Pedido dela, com a captura da Dock do Mac e da barra do iOS:
              «quero que o menu fique igual ao do mac ios em baixo com a barra
              liquid glass». Posta a escolha entre conviver com a coluna da
              esquerda ou substituí-la, ela respondeu «a barra substitui o
              menu» — portanto no computador não há coluna, há a barra, e a
              barra tem de ter TUDO. Uma barra com quatro destinos ao lado de
              nenhuma coluna seria tirar-lhe oito sítios do dia.

              A ordem é a da COLUNA que ela conhece — `CORE_NAV` e depois
              `MORE_NAV`, com o fio a separar o dia de trabalho do resto —, e
              não a ordem de declaração do `NAV`. Não é o mesmo: medido no
              browser, percorrer o `NAV` dava «Visão Geral · Pedidos ·
              Calendário · Fazer proposta», e na coluna o «Fazer proposta» é o
              terceiro. Mudar de sítio os destinos que ela toca de olhos
              fechados era o custo mais caro desta mudança toda. Os que não são
              dos quatro do dia nascem `hidden` e só aparecem a partir de
              `lg`. É a mesma regra que a gaveta já usava ao contrário
              (`soNoComputador`, mais acima) — nenhum destino aparece duas
              vezes no mesmo ecrã. */}
          {[...CORE_NAV, ...MORE_NAV].map((id, i) => {
            const navItem = NAV.find((n) => n.id === id)!;
            const noTelemovel = BARRA_INFERIOR.includes(id);
            const isActive = view === id;
            /* O FIO QUE A COLUNA JÁ TINHA, no mesmo sítio. Palavras dela
               quando a dobra do «Mais» saiu: «retira o mais e deixa tudo à
               vista» — e o que ficou lá foi um fio a dizer onde acaba o dia
               de trabalho e começa o resto. Não esconde nada, não tem estado,
               não se abre. A Dock do Mac da captura dela tem o mesmo, pela
               mesma razão. Só no computador, porque só lá a barra tem os
               dois grupos. */
            const abreOResto = i === CORE_NAV.length;
            return (
              <Fragment key={id}>
                {abreOResto && (
                  <span
                    aria-hidden
                    className="hidden lg:block my-2 w-px shrink-0 self-stretch bg-[var(--bo-hairline)]"
                  />
                )}
                <DestinoDaBarra
                  setView={setView}
                  pendingCount={pendingCount}
                  id={id}
                  navItem={navItem}
                  noTelemovel={noTelemovel}
                  isActive={isActive}
                />
              </Fragment>
            );
          })}
        </div>

        {/* ── A PEÇA REDONDA: A PORTA DA GAVETA ────────────────────────────
            Ao alcance do polegar, e à parte da cápsula porque não é um
            destino. Sem rótulo escrito: é a peça redonda da captura, e o
            nome dela vive no `aria-label` — quem ouve continua a ouvir «Mais
            destinos», e quem vê continua a ver o mesmo ⋯ no mesmo canto.

            O abridor voltou para aqui, e não para o canto superior esquerdo,
            por uma razão de mão: o polegar de quem segura o telemóvel chega
            ao fundo do ecrã e não chega ao topo do lado oposto. */}
        <button
          onClick={() => setNavOpen(true)}
          aria-label="Mais destinos"
          aria-expanded={navOpen}
          /* O MESMO GRAU DE MATERIAL DA CÁPSULA. As duas peças estão lado a
             lado e são a mesma barra: uma a 0,66 e a outra a 0,80 lêem-se
             como dois vidros diferentes colados um ao outro, que é
             exactamente o defeito que a Parte −1 do sistema de design manda
             evitar. */
          /* ── E O ⋯ VERDE PASSOU A POUSAR NUMA PASTILHA, COMO OS OUTROS ───
             Quando o destino aberto não é nenhum dos quatro da cápsula, esta
             peça é o destino activo — e marcava-o pintando o glifo de verde,
             sem fundo próprio. Medi o que isso dava sobre o pior fundo (uma
             fotografia preta a passar por baixo do vidro):

                 material a 0,80 → #cccccc → acento a 3,28:1
                 material a 0,66 → #a8a8a8 → acento a 2,62:1

             O primeiro já vivia à justa do mínimo de 3:1 que o 1.4.11 pede a
             um controlo sem texto visível; o segundo chumbava-o. Um vidro
             mais transparente não podia entrar sem isto.

             A saída é a que a cápsula já usa e que este ficheiro já explicou
             ao lado da pastilha: o acento não assenta no vidro, assenta na
             lavagem OPACA (`--bo-accent-lavagem`), onde mede 4,95:1 e não
             depende do que passa por baixo. De caminho, as duas peças da
             barra passam a marcar o activo da mesma maneira — pastilha e
             tinta de acento —, que era o que já se dizia aqui e não era
             verdade para esta. */
          className={`alvo-toque bo-material bo-material-desfoque bo-material-fino bo-material-pilula pointer-events-auto flex shrink-0 items-center justify-center shadow-[var(--bo-sombra-suspensa)] ${ESTADO} ${PRESSAO} ${
            !BARRA_INFERIOR.includes(view)
              ? "bo-material-activo text-[var(--bo-accent)]"
              : "text-[var(--bo-tinta-72)]"
          }`}
          style={{
            height: "var(--bo-barra-capsula)",
            width: "var(--bo-barra-capsula)",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </nav>
    </>
  );
}
