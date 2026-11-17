"use client";

import { type Dispatch, type RefObject, type SetStateAction } from "react";
import { avisoDeTemaParecido } from "@/lib/temas-parecidos";
import { type ThemeSummary } from "@/lib/theme-types";
import { type PedidoDeMenu } from "../MenuDeContexto";
import { MenuDeAccoes, type AccaoDeItem } from "../ui";
import { ESTADO, PRESSAO } from "../ui/movimento";
import { PlusIcon } from "./icones";
import type { Densidade } from "@/lib/temas/ordem";
import { COLUNAS, MENU_DA_BIBLIOTECA } from "./pele-da-biblioteca";
import { CartaoDoTema } from "./CartaoDoTema";

/** A lista dos temas da biblioteca — os cartões (ou linhas), com a pasta
 *  aberta ao lado no computador. (Saiu da Biblioteca de Temas na fase 8 da
 *  estrutura do código, tal e qual.) */
export interface ListaDaBibliotecaProps {
  setAdding: Dispatch<SetStateAction<boolean>>;
  setOpenId: Dispatch<SetStateAction<string | null>>;
  densidade: Densidade;
  usos: Record<string, number> | null;
  setAFundir: Dispatch<SetStateAction<ThemeSummary | null>>;
  setMenu: Dispatch<SetStateAction<PedidoDeMenu | null>>;
  accoesDoTema: (t: ThemeSummary, { naPasta }?: { naPasta?: boolean }) => AccaoDeItem[];
  accoesDaBiblioteca: AccaoDeItem[];
  parecidos: Map<string, ThemeSummary[]>;
  cartoesADesenhar: readonly ThemeSummary[];
  sentinelaDosCartoes: RefObject<HTMLDivElement | null>;
  haMaisCartoes: boolean;
}

export function ListaDaBiblioteca({
  setAdding,
  setOpenId,
  densidade,
  usos,
  setAFundir,
  setMenu,
  accoesDoTema,
  accoesDaBiblioteca,
  parecidos,
  cartoesADesenhar,
  sentinelaDosCartoes,
  haMaisCartoes,
}: ListaDaBibliotecaProps) {
  return (
    <>
      <div
        style={{ "--cena": 3 } as React.CSSProperties}
        /* ── O BOTÃO DIREITO NO VAZIO DA GRELHA ─────────────────────────
           «Em área vazia da grelha, oferece "Novo tema".» (ponto 8 da
           auditoria.) O `defaultPrevented` é o que distingue o vazio de um
           cartão: o cartão trata o seu próprio menu e já chamou
           `preventDefault` antes de o evento subir até aqui. Sem essa
           pergunta, carregar com o botão direito num cartão abria dois
           menus — o dele e este por cima. */
        onContextMenu={(e) => {
          if (e.defaultPrevented) return;
          e.preventDefault();
          setMenu({
            x: e.clientX,
            y: e.clientY,
            sobre: MENU_DA_BIBLIOTECA,
            accoes: [
              {
                id: "novo-tema",
                rotulo: "Novo tema",
                icone: PlusIcon,
                onAccao: () => setAdding(true),
              },
              ...accoesDaBiblioteca,
            ],
          });
        }}
        className={`bo-cena grid ${COLUNAS[densidade]}`}
      >
        {cartoesADesenhar.map((t) => (
          /* As acções são IRMÃS do botão do cartão, não filhas: um botão
             dentro de outro botão é HTML inválido, e o resultado prático é
             que fixar um tema abria-o a seguir. */
          <div
            key={t.id}
            role="group"
            aria-label={t.name}
            /* ── O BOTÃO DIREITO ABRE O MESMO MENU DO «⋯» ────────────
               Ponto 8 da auditoria: «numa coleção, o botão direito é
               obrigatório». A lista é literalmente a mesma chamada —
               `accoesDoTema(t)` —, e é essa igualdade que o ponto 9 exige
               («abre o MESMO menu do botão direito»). Ver `MenuDeContexto`.

               No contentor e não no botão do cartão: o «⋯», a nota do tema
               parecido e a capa são todos deste tema, e carregar com o botão
               direito em qualquer um deles é a mesma pergunta. */
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, sobre: t.name, accoes: accoesDoTema(t) });
            }}
            className="group relative"
          >
            {/* ══ UM BOTÃO SÓ SOBRE A FOTOGRAFIA ═══════════════════════
                Ponto 9 da auditoria do `docs/APPLE-TEMAS.md`: «três botões
                circulares cinzentos aparecem sobre a fotografia no hover…
                sem rótulo, com ícones ambíguos». A correcção é «UM botão
                discreto ⋯ no canto superior direito, que abre o mesmo menu
                do botão direito» — e a Parte 9 proíbe, à letra, «mais de um
                botão flutuante sobre uma miniatura».

                Aqui havia dois desenhos: com rato, a lista `accoesDoTema`
                percorrida em chips soltos; sem rato, um «⋯». Passa a ser o
                «⋯» nos dois — a mesma lista, um só desenho, e o cartão
                deixa de ter duas linguagens conforme o ponteiro.

                MEDIDO a 375×667 com dedo: os chips tapavam 55,6 % da largura
                de um cartão de 165,5 px (dois alvos de 44) e agora tapam
                26,6 % (um).

                ── E A ESTRELA NÃO SE PERDEU ────────────────────────────
                O chip do favorito ficava SEMPRE visível de propósito: aceso,
                era ele que dizia que o tema está fixado. Tirar o chip sem
                mais nada apagava essa informação — por isso ela desce para o
                rasto de números do cartão, como bandeira, que é onde o
                desenho do `ThemeCard` da Parte 3 do documento a põe («14
                fotos · 1 proposta · ⚑»). O que era um botão a dizer duas
                coisas passa a um botão (no menu) e um sinal (na linha).

                O «⋯» esconde-se em repouso só onde há rato — é o coração do
                `MenuDeAccoes` — e volta com o rato sobre o cartão ou com o
                foco de teclado nele. Onde não há rato está sempre visível. */}
            {/* O `absolute` vai NESTA caixa e não no `MenuDeAccoes`: ele
                dá-se a si mesmo um `relative` (é o que ancora a gaveta) e,
                entre dois utilitários de `position` na mesma classe, quem
                ganha é a ordem do Tailwind e não a ordem em que estão
                escritos. MEDIDO antes de os separar: o menu esticava-se aos
                165,5 px do cartão inteiro. */}
            {/* `right-1 top-1` e não `right-2 top-2`: o que se põe no
                canto é o ALVO de 40 px, e a pastilha de 28 fica 6 px para
                dentro dele — o círculo que se vê assenta a 10 px das
                arestas, dentro do arco do canto do cartão. */}
            <div className="absolute right-1 top-1 z-10">
              <MenuDeAccoes
                sobre={t.name}
                accoes={accoesDoTema(t)}
                /* ── 28 px À VISTA, 40 px DE ALVO ───────────────────────
                   «Botão glass, 28px» (Parte 3) e «o `⋯` sobre a imagem tem
                   28 px visuais e 40 px de alvo» (Parte 7). Era o «⋯» de
                   linha, 44 × 44, com o vidro na caixa de fora — um círculo
                   escuro de 44 px por cima da capa, um quarto da largura de
                   um cartão compacto. O tamanho é uma opção do próprio
                   `MenuDeAccoes` (`tamanho="pequeno"`), e não classes por
                   cima das dele. No dedo o `.alvo-toque` leva o alvo aos 44.

                   ── O VIDRO CLARO VIAJA DENTRO DO BOTÃO ────────────────
                   O «⋯» pousa EM CIMA de uma fotografia, e o `MenuDeAccoes`
                   traz tinta de texto normal (`--bo-text-muted`) — que sobre
                   uma capa clara desaparece. A conta já estava feita para os
                   chips que aqui estavam e não se refaz: `.bo-vidro-claro`,
                   véu de 50% mais vidro a 10%, sem filtro, glifo a branco,
                   3,35:1 sobre a pior fotografia (a conta inteira está no
                   `globals.css`). Sem desfoque de propósito — um por cartão
                   eram noventa numa biblioteca de trinta.

                   Vivia na caixa de fora, que tinha de repetir à mão as
                   variantes de esconder do botão (senão ficava um círculo
                   escuro em repouso com o glifo invisível lá dentro). Agora
                   é a `pastilha`, DENTRO do botão: esconde-se e mostra-se
                   com o mesmo `opacity` do glifo, incluindo com o foco de
                   teclado no cartão (o `group-focus-within` do
                   `MenuDeAccoes`), e não há duas listas para manter
                   iguais. */
                tamanho="pequeno"
                pastilha="bo-vidro-claro text-white"
              />
            </div>
            <CartaoDoTema
              setOpenId={setOpenId}
              usos={usos}
              setMenu={setMenu}
              accoesDoTema={accoesDoTema}
              parecidos={parecidos}
              t={t}
            />
            {/* ── «ISTO JÁ EXISTE COM OUTRO NOME» ───────────────────────
                Palavras dela: «"Clássico Intemporal" aparece duas vezes com
                nomes quase iguais».

                IRMÃO do cartão e não filho, pela mesma razão que as acções:
                um botão dentro de outro botão é HTML inválido, e o resultado
                prático seria carregar aqui abrir o tema. Por baixo e não por
                cima da capa — é uma nota de arrumação, não um alarme, e não
                pode tapar a fotografia que faz o tema reconhecível.

                Cita o outro nome: «este tema está repetido» obrigava a
                procurar qual. E é um botão porque a saída existe agora — abre
                o «Juntar a outro tema…» já com este de origem. */}
            {avisoDeTemaParecido(parecidos.get(t.id)) && (
              <button
                type="button"
                onClick={() => setAFundir(t)}
                className={`alvo-toque mt-1 flex w-full items-center gap-1.5 rounded-lg px-2 text-left text-xs text-[var(--bo-aviso)] hover:bg-[var(--bo-aviso)]/[0.07] ${ESTADO} ${PRESSAO}`}
              >
                <span className="truncate">{avisoDeTemaParecido(parecidos.get(t.id))}</span>
                <span className="shrink-0 underline decoration-dotted underline-offset-2">
                  Juntar
                </span>
              </button>
            )}
          </div>
        ))}
        {haMaisCartoes && (
          /* A marca que pede mais cartões quando se aproxima do ecrã. Ocupa
             a linha inteira para nunca ficar ao lado de um cartão. */
          <div ref={sentinelaDosCartoes} aria-hidden className="col-span-full h-px" />
        )}
      </div>
    </>
  );
}
