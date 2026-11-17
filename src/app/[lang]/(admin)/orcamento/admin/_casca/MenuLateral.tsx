"use client";

import Image from "next/image";
import { type Dispatch, type RefObject, type SetStateAction } from "react";
import type { useDescarga } from "../ui/descarregar";
import type { Marca } from "../ui/useMarcaQueAnda";
import { CORE_NAV, MORE_NAV, type View } from "../nav";
import { ESTADO, MARCA, PRESSAO } from "../ui/movimento";
import { ItemDoMenu } from "./ItemDoMenu";
import { RodapeDoMenu } from "./RodapeDoMenu";

/**
 * O MENU DO BACK OFFICE — a coluna da esquerda no computador e a gaveta no
 * telemóvel (a mesma árvore), com a marca, os destinos e o rodapé de quem está
 * dentro. Saiu tal e qual do `AdminClient.tsx` (fase 7 de
 * `docs/ESTRUTURA-DO-CODIGO.md`).
 */
export interface MenuLateralProps {
  userName: string;
  view: View;
  navOpen: boolean;
  setNavOpen: Dispatch<SetStateAction<boolean>>;
  gavetaRef: RefObject<HTMLDivElement | null>;
  colunaDosDestinos: RefObject<HTMLElement | null>;
  marcaDoDestino: Marca | null;
  marcaPodeAndar: boolean;
  setShortcutsOpen: Dispatch<SetStateAction<boolean>>;
  setRestoreOpen: Dispatch<SetStateAction<boolean>>;
  setPasskeysOpen: Dispatch<SetStateAction<boolean>>;
  setAjudaOpen: Dispatch<SetStateAction<boolean>>;
  copiaDeSeguranca: ReturnType<typeof useDescarga>;
  descarregarCopia: () => void;
  pedirParaSair: () => void;
  pendingCount: number;
  escolherDestino: (id: View) => void;
}

export function MenuLateral({
  userName,
  view,
  navOpen,
  setNavOpen,
  gavetaRef,
  colunaDosDestinos,
  marcaDoDestino,
  marcaPodeAndar,
  setShortcutsOpen,
  setRestoreOpen,
  setPasskeysOpen,
  setAjudaOpen,
  copiaDeSeguranca,
  descarregarCopia,
  pedirParaSair,
  pendingCount,
  escolherDestino,
}: MenuLateralProps) {
  return (
    <>
      {/* ── E A COLUNA DEIXOU DE SER UMA COLUNA ──────────────────────────
          «A barra substitui o menu». No computador já não há coluna encostada
          ao conteúdo: o que resta desta peça é uma GAVETA, igual em todas as
          larguras, e o que ela guarda deixou de ser navegação — é o
          logótipo, a conta, a ajuda e as quatro acções (Atalhos, Backup,
          Repor, Sair). Os destinos vivem todos na barra de baixo.

          Por isso caíram daqui os `lg:` que a faziam coluna (`lg:sticky`,
          `lg:translate-x-0`, `lg:shadow-none`, a largura zero do recolher) e
          o `lg:contents` do invólucro — sem ele, o invólucro volta a ser o
          bloco contentor que impede a página de se arrastar para o lado, e
          agora também no computador. */}
      <div
        ref={gavetaRef}
        className="pointer-events-none fixed inset-0 z-40 overflow-hidden [transform:translateZ(0)]"
      >
        {/* O véu vive DENTRO do invólucro da gaveta. Fora dele, a armadilha
            de foco (que tira os irmãos da árvore) deixava-o inerte, e tocar
            fora da gaveta deixava de a fechar. Cá dentro, também passa a
            cobrir a barra de baixo — que, com a gaveta aberta, já não
            responde. */}
        {navOpen && (
          <div
            className="bo-entrada bo-entrada-fundo pointer-events-auto absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={() => setNavOpen(false)}
          />
        )}
        {/* A sombra só existe aberta: fechada, a gaveta está em x = −256 com
            o bordo direito em x = 0, e a sombra pintava ~40 px de cinzento
            no canto esquerdo de todos os ecrãs. */}
        <aside
          inert={!navOpen}
          role={navOpen ? "dialog" : undefined}
          aria-modal={navOpen || undefined}
          aria-label={navOpen ? "Menu" : undefined}
          className={`bo-material-faixa bo-material-desfoque pointer-events-auto fixed top-0 z-40 h-dvh w-64 shrink-0 flex flex-col overflow-y-auto overscroll-contain border-r border-[var(--bo-hairline)] motion-safe:transition-[transform,box-shadow] motion-safe:duration-300 ${
            navOpen
              ? "translate-x-0 shadow-[var(--bo-sombra-modal)]"
              : "-translate-x-full shadow-none"
          }`}
        >
          {/* A cruz que fecha a gaveta. Deixou de ser «do telemóvel»: a
              coluna acabou e isto é uma gaveta nas duas larguras, portanto a
              porta de saída tem de existir onde quer que ela a abra. */}
          <button
            className={`absolute top-3 right-3 w-11 h-11 flex items-center justify-center text-[var(--bo-text-faint)] hover:text-[var(--bo-text)] rounded-lg hover:bg-[var(--bo-surface-hover)] ${ESTADO} ${PRESSAO}`}
            onClick={() => setNavOpen(false)}
            aria-label="Fechar menu"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>

          {/* Marca — o logótipo sozinho, em maior. A legenda "Back Office" saiu:
            quem está aqui dentro já sabe onde está, e o rótulo só roubava
            espaço ao único elemento que identifica a casa. O nome continua a
            ser anunciado por leitores de ecrã através do `alt` da imagem. */}
          {/* ── NUM ECRÃ BAIXO, O LOGÓTIPO DÁ O LUGAR AOS DESTINOS ──────────
              Medido num iPhone 14 com as barras do Safari (390×664): a
              largura toda dava ao logótipo ~138 px de altura, e com o rodapé
              da conta colado ao fundo só se viam 4 dos 10 destinos — a lista
              acabava num fio e parecia completa (auditoria, 14/11). Abaixo de
              760 px de altura o logótipo fica numa faixa de 64 px; e a gaveta
              passou a rolar INTEIRA (`overflow-y-auto` no `aside`), com os
              destinos primeiro e a conta depois, em vez de uma lista que rola
              presa entre os dois. */}
          <div className="w-full shrink-0 px-3 pt-5 pb-6 flex justify-center [@media(max-height:760px)]:pb-2">
            <Image
              src="/logo-liquen.png"
              alt="Líquen Events"
              width={300}
              height={179}
              priority
              /* Centrado e a ocupar a largura toda da barra.
               *
               * Antes limitava-se a altura (`h-28`), e com isso o logótipo
               * parava nos ~188 px de largura numa barra de 256: sobrava
               * margem dos dois lados e ele ficava pequeno no meio do vazio.
               * Amarrando à LARGURA (`w-full`) e deixando a altura seguir o
               * rácio, passa a encher a barra de margem a margem — é a marca
               * que abre o dia de trabalho, não um ícone. */
              className="w-full h-auto object-contain [@media(max-height:760px)]:h-16 [@media(max-height:760px)]:w-auto"
            />
          </div>

          {/* ── A COLUNA MOSTRA TUDO, E NÃO ESCONDE NADA ────────────────
              Palavras dela: «retira o mais e deixa tudo à vista».

              Havia aqui um grupo dobrável chamado «Mais» (as reticências) com
              cinco destinos lá dentro — Propostas Aceites, Material, Temas,
              Estatísticas e Definições —, fechado por omissão. A ideia era
              que quem chega visse uma lista curta. Ela não chega: TRABALHA
              aqui, todos os dias, e sabe de cor o que quer. O que a dobra lhe
              dava era um toque a mais para cinco destinos e um sítio onde
              procurar o que ela já sabia que existia.

              Fica um fio a separar o dia de trabalho do resto. Um fio não é
              uma dobra: não esconde nada, não tem estado, não precisa de ser
              aberto — só diz onde acaba o que se usa a toda a hora. Onze
              destinos numa lista sem nenhuma pausa lêem-se como uma parede.

              O QUE SAIU COM O GRUPO, e não ficou pendurado: o estado
              `moreNavOpen`, a abertura automática quando o destino activo
              vivia lá dentro, e a dependência que esse estado tinha no efeito
              que mede o filete (ver a nota dele lá em cima). */}
          <nav
            ref={colunaDosDestinos}
            /* «Mais destinos», que é o nome do ⋯ que a abre — e é o que ela
               é: no telemóvel a barra leva quatro e o resto vive aqui. O
               nome «Navegação do back office» passou para a barra, que é
               quem faz agora esse trabalho nas duas larguras. */
            aria-label="Mais destinos"
            /* `lg:hidden`: no computador os destinos estão TODOS na barra de
               baixo, e o mesmo destino em dois sítios do mesmo ecrã é a
               confusão que a regra do `soNoComputador` já evitava do outro
               lado. Abaixo de `lg` a barra só leva quatro, e esta lista
               continua a ser onde os outros vivem. */
            className="relative lg:hidden shrink-0 px-3 py-4 flex flex-col gap-1"
          >
            {/* O filete que anda. `aria-hidden` porque não diz nada que o
                `aria-current="page"` de cada destino não diga melhor — é
                desenho, não informação. Ver `marcaDoDestino` lá em cima.

                ── DUAS CORRECÇÕES, E AS DUAS SÃO DE PERTENÇA ──────────────

                1. **A COR ERA UM HEX À MÃO, E ERA O TOKEN ERRADO POR UM
                   DÍGITO.** Estava escrito `bg-sage-600`; o acento da casa é
                   `--bo-accent: #4c6350`. Um `d` por um `c` — perto o
                   suficiente para ninguém ver, longe o suficiente para o
                   filete deixar de acompanhar o acento no dia em que ele
                   mudar. Passa a ser o token, que é o que a pastilha activa
                   usa agora: os dois pintam-se da MESMA variável e não podem
                   divergir.

                2. **VIVIA FORA DA PASTILHA.** Estava em `left-1` (4 px) e a
                   pastilha começa aos 12 px (o `px-3` desta coluna), portanto
                   havia 8 px de branco entre os dois e o filete lia-se como
                   um segundo objecto encostado à margem. Passa a `left-3` —
                   a borda esquerda da própria pastilha —, onde é o rebordo
                   dela e não um vizinho.

                O QUE NÃO MUDA, de propósito: continua a ser UM `span` filho
                directo do `<nav>`, continua a andar por `translate` e
                continua a ter a altura do destino marcado. É isso que o
                passeio `e2e/admin-views.spec.ts` («a marca do destino
                activo») mede — que há um só, e que ele PÁRA à altura do
                `[aria-current="page"]`.

                ── E OS DOIS TEMPOS NÃO SÃO UMA HESITAÇÃO ──────────────────

                Fica escrito porque já foi lido como avaria: a pastilha
                esbate-se em 120 ms (`ESTADO`) e o filete desliza em 250 ms
                (`MARCA`), e isso parece o mesmo acontecimento contado a dois
                ritmos. É deliberado, e a razão está por extenso na ficha do
                `MARCA` em `ui/movimento.ts`: o sinal («ouvi-te») chega no
                degrau `micro` e o movimento («e agora mostro-te») no degrau
                `elemento`. Com os dois iguais, o clique parece LENTO — a cor
                ficaria à espera do percurso. É a mesma assimetria que o
                `Segmented` usa, com os mesmos dois degraus da casa.

                Não são «duas velocidades de interacção» a competir: o
                `movimento.ts` diz que essas são duas (20 ms e 120 ms) e que
                os 250 ms NÃO são uma terceira — são o degrau de «uma coisa a
                mover-se», que é literalmente o que o filete é. Por isso aqui
                não se soma tempo nenhum: o gesto que indica direcção e origem
                já existe, e é este. */}
            {marcaDoDestino && (
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute left-3 top-0 w-[3px] rounded-full bg-[var(--bo-accent)] ${
                  marcaPodeAndar ? MARCA : ""
                }`}
                style={{ translate: `0 ${marcaDoDestino.y}px`, height: marcaDoDestino.altura }}
              />
            )}
            {CORE_NAV.map((id) => (
              <ItemDoMenu
                key={id}
                id={id}
                view={view}
                pendingCount={pendingCount}
                onEscolher={escolherDestino}
              />
            ))}

            {/* O resto, do outro lado de um fio. A mesma árvore serve a
                gaveta do telemóvel e a coluna do computador: não há dobra num
                nem no outro, e portanto não há duas navegações a explicar.

                NOTA PARA QUEM LÊ O `nav.tsx`: o `CORE_NAV` e o `MORE_NAV`
                continuam a decidir a ORDEM e onde cai o fio, e isso continua
                a fazer sentido. O que já não faz é o nome e a prosa que os
                acompanha, que falam de «a collapsible Mais group» — a dobra
                saiu daqui e o nome ficou lá. Renomeá-los é no `nav.tsx`. */}
            <div className="mt-3 flex flex-col gap-1 border-t border-[var(--bo-hairline)] pt-3">
              {MORE_NAV.map((id) => (
                <ItemDoMenu
                  key={id}
                  id={id}
                  view={view}
                  pendingCount={pendingCount}
                  onEscolher={escolherDestino}
                />
              ))}
            </div>
          </nav>

          <RodapeDoMenu
            userName={userName}
            setShortcutsOpen={setShortcutsOpen}
            setRestoreOpen={setRestoreOpen}
            setPasskeysOpen={setPasskeysOpen}
            setAjudaOpen={setAjudaOpen}
            copiaDeSeguranca={copiaDeSeguranca}
            descarregarCopia={descarregarCopia}
            pedirParaSair={pedirParaSair}
          />
        </aside>
      </div>
    </>
  );
}
