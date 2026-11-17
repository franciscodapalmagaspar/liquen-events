"use client";

import { type Dispatch, type SetStateAction } from "react";
import { type ThemeSummary } from "@/lib/theme-types";
import { dataPorExtenso, desdeQuando, photoCountLabel } from "@/lib/temas/textos-dos-temas";
import { plural } from "@/lib/plural";
import ImagemComPlanoB from "../ImagemComPlanoB";
import { type PedidoDeMenu } from "../MenuDeContexto";
import { adiantarTema } from "../prefetch-de-tema";
import { EsqueletoDeCor, type AccaoDeItem } from "../ui";
import { ESTADO, PRESSAO } from "../ui/movimento";
import { FolderIcon } from "./icones";
import { temPoucasFotos } from "@/lib/temas/ordem";
import { teclaDeMenu } from "../ui/tecla-de-menu";

/** O cartão de um tema na biblioteca: a capa, o nome, as contas e o uso, e
 *  o arrasto de fotografias para cima dele. (Saiu da lista da biblioteca na fase
 *  8 da estrutura do código, tal e qual.) */
export interface CartaoDoTemaProps {
  setOpenId: Dispatch<SetStateAction<string | null>>;
  usos: Record<string, number> | null;
  setMenu: Dispatch<SetStateAction<PedidoDeMenu | null>>;
  accoesDoTema: (t: ThemeSummary, opcoes?: { naPasta?: boolean }) => AccaoDeItem[];
  parecidos: Map<string, ThemeSummary[]>;
  t: ThemeSummary;
}

export function CartaoDoTema({
  setOpenId,
  usos,
  setMenu,
  accoesDoTema,
  parecidos,
  t,
}: CartaoDoTemaProps) {
  return (
    <>
      <button
        type="button"
        onClick={() => setOpenId(t.id)}
        /* ── O RATO POUSA, AS FOTOS COMEÇAM A VIR ─────────────────
           «Prefetch on hover: passar o rato sobre um tema começa a
           carregar as suas fotos.» Abrir um tema são duas esperas em
           fila — a listagem da pasta e só DEPOIS as miniaturas —, e
           enquanto a primeira não volta a grelha nem tem endereços
           para pedir. O rato costuma pousar um segundo antes do
           clique, e esse segundo chega.

           Só com rato: num telemóvel não há «passar por cima», há
           tocar — e tocar já abre. Ver `adiantarTema`. */
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") adiantarTema(t.id);
        }}
        onFocus={() => adiantarTema(t.id)}
        /* ── O MENU SEM RATO: Shift+F10 E A TECLA DE MENU ─────────
           O botão direito tem o seu equivalente de teclado, e é este
           (o mesmo de qualquer sistema). Abre o MESMO menu, ancorado
           ao canto de baixo do cartão; ao fechar, o foco volta ao
           cartão (`MenuDeContexto`). */
        onKeyDown={(e) => {
          if (!teclaDeMenu(e)) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.left, y: r.bottom, sobre: t.name, accoes: accoesDoTema(t) });
        }}
        /* ── SOMBRA, E NÃO BORDA ──────────────────────────────────
           Ponto 11 da auditoria: «cartões delimitados por borda em vez
           de sombra. Em modo claro a elevação faz-se por sombra.» E a
           Parte 9 proíbe «borda a marcar elevação». Era um fio de 10 %
           em repouso que ganhava o acento sob o rato; passa a sombra de
           repouso que se ergue sob o rato — o único efeito de hover de
           um cartão (Parte 12.1 do sistema de design), sem `scale`. O
           `ESTADO` já anima `box-shadow` nos 150 ms do degrau
           interactivo, com a `--ease-interactive`: é a linha «Hover do
           cartão» da tabela da Parte 5, sem tempo novo nenhum. Os dois
           tokens e a razão de existirem estão no `globals.css`. Em
           escuro a sombra quase não se vê, e é a regra: lá quem separa
           é a luminosidade (`--bo-surface` sobre `--bo-chao`).

           O raio é o `--radius-tile`, 12 px: era `rounded-2xl` (os 20
           do degrau «painel»), o documento pedia 12 e o cartão da casa
           diz 16. A escolha não era deste ficheiro — foi dela: «sim à
           sombra, cantos a 12». O token e a razão estão no `tema.css`.

           `h-full`: a célula da grelha já estica à altura da fila
           (`align-items: stretch`), mas o cartão dentro dela não a
           seguia. Com o rasto de números a poder ocupar duas linhas,
           «todos os cartões da mesma fila têm a mesma altura»
           (critério 2 da Parte 8) só se cumpre se o cartão encher a
           célula — medido a 1440, a primeira fila tinha fundos a 508,
           523 e 525 px.

           `flex flex-col` (9/11): um `<button>` CENTRA o que tem dentro
           na vertical. Com o `h-full` a esticar todos à altura do mais
           alto da fila, os cartões mais baixos punham a fotografia uns
           9 px abaixo do topo — uma faixa branca por cima da capa em
           uns cartões e não noutros. Em coluna, o conteúdo fica
           encostado ao topo e a sobra vai para o fundo. */
        className={`flex h-full w-full flex-col items-stretch justify-start overflow-hidden rounded-tile bg-[var(--bo-surface)] text-left shadow-[var(--bo-sombra-repouso)] hover:shadow-[var(--bo-sombra-erguida)] ${ESTADO} ${PRESSAO}`}
      >
        {/* A moldura é 4:3 SEMPRE, aconteça o que acontecer lá dentro: é
          ela que mantém a primeira linha alinhada quando as fotos têm
          proporções diferentes umas das outras. */}
        {/* ══════════════════════════════════════════════════════
            UMA FOTOGRAFIA, INTEIRA
            ══════════════════════════════════════════════════════

            Decisão dela na Fase 2: uma imagem por cartão.

            Aqui havia a capa e, encostada à direita, uma tira com mais
            três fotos do tema — «uma capa só diz o que é a foto de
            capa; três fotos dizem o que é o TEMA». A ideia estava
            certa; o desenho é que não chegava lá: na grelha compacta a
            tira tinha 41 px de largura e cada foto ~41 × 33. Pequena de
            mais para se ler como uma fotografia — o que se via era
            textura no canto do cartão, e a capa ficava com três quartos
            do espaço.

            O conjunto continua dito, noutro sítio e melhor: «9 fotos»
            no rasto de números, que custa uma linha de texto em vez de
            um quarto da imagem, e a grelha inteira ao abrir o tema, que
            é onde se escolhe.

            A moldura é 4:3 SEMPRE: é ela que mantém a primeira linha
            alinhada quando as fotos têm proporções diferentes. */}
        {/* ══════════════════════════════════════════════════════
            NUNCA UM CARTÃO VAZIO
            ══════════════════════════════════════════════════════

            T1 do `docs/PROPOSTAS-E-TEMAS-APPLE.md`: «muitos cartões
            sem capa ao fim de 5 s — a página parece partida».

            Por baixo da fotografia fica SEMPRE o lugar pintado com a
            cor dela (`EsqueletoDeCor`, com a `coverCor` que vem no
            resumo): enquanto a capa viaja, vê-se a cor certa; e se as
            duas fontes falharem, a imagem sai (`ImagemComPlanoB`) e a
            cor fica. Sem cor gravada é o esqueleto cinzento.

            Um tema COM fotos e SEM `coverUrl` — o Storage estourou os
            8 s da lista, ou a capa não se deixou assinar — já não
            mostra o ícone de pasta: mostra o lugar, com a cor quando
            a há e o fundo neutro da moldura quando não (sem o brilho
            a passar: aí não há nada a caminho, e o brilho diria que
            há). O ícone fica para o que ele diz, uma pasta vazia
            (`imageCount` 0).

            A fotografia leva `relative` para ficar POR CIMA do lugar,
            que é `absolute`; o `!` vence a `.bo-skeleton`, que está
            fora de camadas e traz o seu próprio `position` e raio. */}
        <div
          data-capa-do-tema={t.id}
          className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--bo-tinta-6)]"
        >
          {t.imageCount === 0 ? (
            <div
              data-pasta-vazia
              className="flex h-full w-full items-center justify-center text-foreground/40"
            >
              {FolderIcon}
            </div>
          ) : t.coverUrl || t.coverCor || t.resumoPendente ? (
            <EsqueletoDeCor cor={t.coverCor} className="!absolute inset-0 !rounded-none" />
          ) : null}
          {t.coverUrl && t.imageCount !== 0 && (
            <ImagemComPlanoB
              src={t.coverUrl}
              avif={t.coverAvif}
              planoB={t.coverFallbackUrl}
              lqip={t.coverLqip}
              /* ── SEM `scale` NO HOVER ──────────────────────────
                 Era `group-hover:scale-[1.02]` na capa. A Parte 9 do
                 `docs/APPLE-TEMAS.md` proíbe `scale` no hover de
                 cartões de grelha, e a Parte 3 repete-o com a razão
                 («sobrepõe os vizinhos»). Aqui a capa está dentro de
                 uma moldura `overflow-hidden`, portanto não chegava a
                 tapar o vizinho — o que fazia era mexer a fotografia
                 debaixo do ponteiro em cada passagem de rato, numa
                 grelha de 28 cartões que se percorre com o rato.

                 O que sinaliza o hover continua a ser a moldura a
                 ganhar o acento, no botão aqui em baixo. */
              className="relative h-full w-full object-cover"
            />
          )}
        </div>
        <div className="px-3 py-2.5">
          {/* ══════════════════════════════════════════════════════
              O NOME NÃO SE CORTA
              ══════════════════════════════════════════════════════

              Palavras dela: «os títulos longos são cortados».

              Era `truncate`, ou seja uma linha e reticências. O nome é
              a ÚNICA coisa por que ela procura um tema — «Clássico
              Intemporal (Branco/dourado)» virava «Clássico Intempor…»,
              e dois temas parecidos ficavam indistinguíveis
              exactamente no sítio onde é preciso distingui-los.

              Duas linhas, e a altura reservada mesmo quando só se usa
              uma: sem isso, um cartão de nome curto ficava mais baixo
              do que o vizinho e a grelha perdia a linha de base. Ao
              fim de duas linhas ainda pode cortar — mas aí já se leu o
              que distingue. */}
          {/* O `title` é a dica que o ponto 10 pede para quando o
              nome corta ao fim das duas linhas: «título com altura
              reservada de duas linhas, com tooltip quando trunca».
              Vai sempre, e não só quando corta — saber SE corta exige
              medir o nó depois de desenhado, e uma dica que repete o
              nome que está à vista não incomoda ninguém. */}
          {/* ── O TIPO DA CASA, E NÃO UM NÚMERO ESCRITO À MÃO ──────
              Era `text-[14px] leading-snug`. O `ThemeCard` da Parte 3
              pede «headline/600», e o mapeamento da Parte 6.3 do
              sistema de design diz o mesmo de qualquer «nome em
              lista». O `text-headline` traz tamanho, entrelinha e
              peso de uma vez (15/22, 600). A altura reservada passa a
              ser DUAS ENTRELINHAS do token — `min-h-11` = 2,75rem =
              2 × 1,375rem —, e não 2,7em, que com a entrelinha nova
              já não chegava às duas linhas e voltava a desalinhar a
              fila. */}
          <p title={t.name} className="line-clamp-2 min-h-11 text-headline text-[var(--bo-text)]">
            {t.name}
          </p>
          {/* ══════════════════════════════════════════════════════
              UMA LINHA DE NÚMEROS, E NÃO TRÊS
              ══════════════════════════════════════════════════════

              Palavras dela: «os metadados pesam mais do que a imagem».

              Pesavam: o cartão chegou a ter o nome, a contagem, a data,
              o uso, o aviso de poucas fotos e a nota — seis linhas de
              texto debaixo de uma fotografia, num cartão de 165 px.
              Nenhuma era falsa; juntas, nenhuma se lia.

              Agora os números são um só rasto, pela ordem em que
              respondem à pergunta «o que é este tema?»: quantas fotos
              tem, quantas vezes saiu, e há quanto tempo não lhe tocam.
              A data vai no fim por ser a menos decisiva das três.

              Era `truncate`, e com a data absoluta (a partir de 30
              dias, «15/08/2026») o rasto deixou de caber num cartão de
              seis colunas: lia-se «15/08/2…», que é uma data que não
              diz o ano. O desenho do cartão na Parte 3 do documento
              parte o rasto em DUAS linhas («14 fotos · / 1 proposta ·
              ⚑»), e é isso que fica: quebra entre palavras, nunca a
              meio de um número, e no máximo duas linhas. Os cartões
              da mesma fila continuam da mesma altura — a grelha estica
              cada célula à mais alta. */}
          {/* «caption, --fg-tertiary, tabular-nums» (Parte 3). Os
              algarismos com a mesma largura são o que deixa «9 fotos»
              e «14 fotos» alinharem de cartão para cartão, e a cor é
              o terceiro papel de texto da casa
              (`--bo-texto-terciario`, 4,7:1 sobre o cartão branco e
              5,7:1 sobre o escuro, os números da Parte 5.2). */}
          {/* ── DUAS LINHAS FIXAS (9/11) ──────────────────────────
              Era um rasto só, que partia onde calhava: «3 fotos · 2
              propostas · há 6 / dias · ★» num cartão, «10 fotos ·
              Nunca usado · / 09/10/2026» no vizinho, uma linha no
              terceiro — e a fila deixava de alinhar. Agora a primeira
              linha diz o que o tema TEM e quanto SAIU; a segunda,
              QUANDO lhe tocaram (e a estrela). Cada uma numa linha. */}
          <p className="mt-0.5 text-caption tabular-nums text-[var(--bo-texto-terciario)]">
            <span className="block truncate">
              {t.resumoPendente ? "A contar…" : photoCountLabel(t.imageCount, t.truncated)}
              {/* «7 propostas» ou «Nunca usado» — a segunda é a metade
                mais útil: é o que distingue um tema que a biblioteca
                TEM de um tema que o estúdio USA. Só entra quando a
                contagem chegou (vem de outro pedido, depois dos
                cartões).

                Era «por usar»; a Parte 6 do documento manda «Nunca
                usado», e a diferença não é de gosto: em minúsculas e
                sem verbo, «por usar» lia-se como mais um número da
                fila. Agora é também o nome de um âmbito da barra —
                «Por usar» —, e o rasto do cartão e o filtro dizem a
                mesma coisa com as mesmas palavras. */}
              {usos
                ? usos[t.id]
                  ? ` · ${plural(usos[t.id], "proposta", "propostas")}`
                  : " · Nunca usado"
                : ""}
            </span>
            <span className="block min-h-[1lh] truncate">
              {/* NÃO aparece quando a pasta não pôde ser lida: «Fotos
                indisponíveis · há 2 meses» mistura um aviso com uma
                informação de rotina, e é o aviso que tem de se ler.

                ── A DATA RELATIVA LEVA A ABSOLUTA ATRÁS ──────────
                Ponto 13 da auditoria: «"há 1 mês", "há 19 dias". Num
                contexto de trabalho não chega.» O relativo fica (é o
                que se lê de relance numa grelha de 28) e a data
                inteira vai no `title`, que é o que responde quando a
                pergunta passa a ser «isto foi antes ou depois do
                casamento dos Ferreira?». A partir dos 30 dias a
                própria linha passa a dizer a data — ver
                `desdeQuando`. */}
              {t.imageCount !== null && desdeQuando(t.updatedAt) ? (
                <span title={dataPorExtenso(t.updatedAt)}>{desdeQuando(t.updatedAt)}</span>
              ) : null}
              {/* A BANDEIRA DO FAVORITO (era «Fixado no topo»; a palavra
                passou a ser a do menu e do filtro), que era o chip aceso por cima da
                fotografia. Fica no fim da linha, como no desenho do
                `ThemeCard` (Parte 3), e leva nome escrito: um glifo
                sozinho não diz nada a quem ouve o ecrã. */}
              {t.favorito ? (
                <span className="text-[var(--bo-accent)]">
                  {t.imageCount !== null && desdeQuando(t.updatedAt) ? " · " : ""}
                  <span aria-hidden="true">★</span>
                  <span className="sr-only">Favorito</span>
                </span>
              ) : null}
            </span>
          </p>
          {/* ── UMA RESSALVA DE CADA VEZ ────────────────────────
              Duas notas apagadas empilhadas leem-se como nenhuma. Este
              cartão tem três candidatas — o par quase igual (que vive
              por baixo, e é a única accionável), o «poucas fotos» e a
              nota escrita à mão — e mostra UMA.

              A ordem é a de quem pede acção: um tema repetido tem
              remédio a um toque, um tema com poucas fotos é uma nota de
              curadoria, e a nota é contexto.

              ── E A LINHA EXISTE MESMO QUANDO NÃO TEM NADA ───────
              Ponto 10 da auditoria: «cartões com altura desigual… a
              fila fica desalinhada». O nome já tinha as duas linhas
              reservadas; esta não tinha nenhuma — e bastava UM tema
              com nota escrita para o cartão dele ficar 17 px mais alto
              do que os quatro vizinhos. Uma caixa vazia com a altura
              de uma linha custa 17 px e resolve a fila inteira, e é o
              mesmo remédio (altura reservada) que já lá estava no
              nome. `aria-hidden` quando está vazia: é geometria, e não
              há nada para anunciar. */}
          <div className="min-h-[1.125rem]">
            {parecidos.get(t.id) ? null : temPoucasFotos(t) ? (
              <p className="mt-0.5 truncate text-xs text-[var(--bo-aviso)]">
                Ainda com poucas fotos para escolher
              </p>
            ) : t.notes ? (
              <p className="bo-text-muted mt-0.5 truncate text-xs opacity-70">{t.notes}</p>
            ) : null}
          </div>
        </div>
      </button>
    </>
  );
}
