"use client";

import { useState } from "react";
import { Card } from "../../ui";
import { ESTADO, PRESSAO } from "../../ui/movimento";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * UMA SECÇÃO NUNCA APARECE FECHADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «as secções aparecem colapsadas». E aparecer colapsada é o
 * mesmo que não existir — a proposta abria com o Evento, as Capas, os
 * Serviços, os Mood boards, o Orçamento e o Total todos dobrados, e o que se
 * via era uma pilha de títulos.
 *
 * ── O QUE ISTO ERA, E PORQUE É QUE PARECIA BOA IDEIA ──────────────────────
 *
 * Havia um automatismo escrito a partir de um pedido antigo — «secções
 * concluídas recolhem-se automaticamente» — que tirava uma fotografia do que
 * já estava preenchido quando a proposta abria e fechava essas. Numa proposta
 * a meio, funciona. Numa proposta ACABADA, que é o caso de todas as que ela
 * reabre para conferir antes de enviar, está tudo preenchido — portanto
 * fechava-se tudo. O automatismo era mais certeiro precisamente onde fazia
 * mais estrago.
 *
 * E havia uma segunda camada: a dobra ficava guardada no `localStorage`. Um
 * «fechar» de há três semanas, feito para chegar depressa ao fundo da página,
 * continuava a fechar a secção hoje — sem nada no ecrã que dissesse porquê.
 *
 * ── O QUE FICA ────────────────────────────────────────────────────────────
 *
 * A dobra continua a existir e continua a ser útil: dobrar os Serviços para
 * chegar ao Total num telemóvel é um gesto legítimo. O que deixa de existir é
 * a dobra que ninguém pediu AGORA — nem o automatismo, nem a memória entre
 * visitas. Abrir a proposta mostra a proposta.
 *
 * E DEIXOU DE HAVER EXCEPÇÃO. O «Só para ti» (`PainelInterno.tsx`) nascia
 * fechado por outra razão — são custos e margem, e não é isso que se quer no
 * ecrã quando alguém está ao lado a ver. Ela pediu-o aberto («coloca esta barra
 * já aberta por definição»), e a razão antiga continua verdadeira: o que mudou
 * é quem decide se vale a troca. O princípio passa a valer sem ressalvas.
 */
export function Section({
  title,
  children,
  /** Chave estável — a âncora do salto da Conferência. */
  id,
  /** Marca à direita do título — "3 linhas", "por preencher". */
  nota,
  /** Um controlo à direita do título — o "Reordenar" dos Serviços, por
   *  exemplo. Fica FORA do botão que dobra a secção: um botão dentro de outro
   *  botão não é HTML válido, e clicar num fecharia o outro. */
  accao,
  /**
   * O que fica no FUNDO da secção, depois do conteúdo — hoje, a nota interna
   * daquela secção.
   *
   * ── PORQUE É UMA RANHURA DA SECÇÃO E NÃO MAIS UM FILHO ──────────────────
   *
   * Podia ser escrito como último filho em cada uma das seis. Seria a mesma
   * coisa até ao dia em que uma delas ficasse com a nota no meio do conteúdo
   * — e uma nota interna que aparece onde calha, ao pé de campos que SAEM na
   * proposta, é exactamente o que o papel amarelo do `NotasInternas` existe
   * para evitar. A ranhura garante que está sempre no mesmo sítio, por baixo
   * de tudo, e que se dobra com a secção como o resto.
   */
  rodape,
  /**
   * A secção é de OUTRO passo (A2). Fica montada e só se esconde — o
   * formulário é um só, e um campo desmontado perdia o foco e o trabalho a
   * meio. Ver `passos-do-estudio.ts`.
   */
  escondida = false,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
  nota?: string;
  accao?: React.ReactNode;
  rodape?: React.ReactNode;
  escondida?: boolean;
}) {
  const [fechada, setFechada] = useState(false);
  /**
   * ── E O CORPO ENTRA QUANDO ELA ABRE — NUNCA AO CARREGAR ─────────────────
   *
   * A secção fechada continua a ter os campos no formulário (é o `hidden` aqui
   * em baixo, e a razão está escrita lá): abrir e fechar é uma troca de
   * `display`, e uma troca de `display` é o corte mais seco que há. Passa a
   * haver a `.bo-entrada` da casa — 240 ms, quatro píxeis, a curva de quem
   * apresenta.
   *
   * O que este estado guarda, e é a parte que importa, é que a entrada SÓ
   * corre depois de ela tocar no título. Se a classe estivesse ligada apenas
   * ao `!fechada`, as nove secções — que abrem todas abertas, de propósito —
   * animavam ao mesmo tempo no instante em que a proposta abre, por cima da
   * `.view-in` que o passo já traz. Duas apresentações do mesmo ecrã ao mesmo
   * tempo lê-se como um salto, não como uma entrada.
   *
   * Depois do primeiro toque a classe fica, e é isso que faz a entrada correr
   * de cada vez que a secção volta: um elemento que sai de `display: none`
   * recomeça a animação sozinho, sem temporizador e sem remontar nada.
   *
   * A `.bo-entrada` acaba sem `fill-mode`, portanto não deixa `transform`
   * pendurado — o que quebraria a barra `sticky` do fundo se ela estivesse cá
   * dentro. Não está: é irmã dos três passos, e não filha de nenhuma secção.
   */
  const [jaAbriuAMao, setJaAbriuAMao] = useState(false);

  function alternar() {
    if (!id) return;
    if (fechada) setJaAbriuAMao(true);
    setFechada((v) => !v);
  }

  const corpoId = id ? `sec-${id}` : undefined;
  return (
    <Card className="mb-4" id={id ? `seccao-${id}` : undefined} hidden={escondida}>
      {/* `flex-wrap`: SEM ela, um `nota` comprido («Mood boards», com "0
          páginas · 0 fotos · PDF com cerca de 7" ao lado) e o título competiam
          pela MESMA linha sem ninguém a ceder por inteiro — o `nota` já vinha
          `shrink-0` (não podia encolher), portanto era sempre o título a levar
          com o aperto. MEDIDO a 375 px: o botão do título ficava com 66×56 px
          e o `h3` com 49×40 — «Mood boards» a partir-se em «Mood» / «boards».
          «Só para ti», ao lado (`PainelInterno.tsx`), tinha o mesmo problema
          por uma razão parecida.

          Com a quebra ligada e o BOTÃO do título também `shrink-0` (a seguir),
          o título deixa de ceder espaço nenhum: quando não cabem os dois lado
          a lado, é o `nota` — que já não encolhe — a descer inteiro para a
          linha de baixo, como já acontecia nas linhas de Serviços. */}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {id ? (
          <button
            type="button"
            onClick={alternar}
            aria-expanded={!fechada}
            aria-controls={corpoId}
            /* `alvo-toque` + `py-2`: o cabeçalho de uma secção É o interruptor
               que a abre e fecha, e media 20 px de altura — metade do mínimo de
               44. Num telemóvel, abrir "Serviços" era acertar numa faixa da
               espessura de uma linha de texto. O `items-baseline` mantém-se para
               a seta e o título continuarem alinhados pela base.
               `shrink-0`: ver o comentário acima do invólucro — o título nunca
               é quem cede espaço a um `nota` comprido. */
            className={`alvo-toque group -my-1 flex shrink-0 items-baseline gap-2 py-2 text-left ${ESTADO} ${PRESSAO}`}
          >
            {/* ── A SETA DEMORA O QUE AS IRMÃS DEMORAM ────────────────────
                Tinha `motion-safe:transition-transform` e mais nada — sem
                duração, o Tailwind cai no seu `--default-transition-duration`,
                que são 150 ms que ninguém escolheu (é a mesma avaria que o
                `ui/movimento.ts` conta por extenso, e a razão de os números
                dele estarem escritos um a um).

                As duas setas irmãs desta casa já escolheram: a do «Mais do
                painel» (`Overview.tsx`, pela `.bo-mais-seta` do `globals.css`)
                e a dos «Detalhes (opcional)» (`Tarefas.tsx:810`) rodam as duas
                em 200 ms com a `cubic-bezier(0, 0, 0.2, 1)` — o registo do
                back office, o mesmo dos 240/600 ms. Esta passa a ser a
                terceira, e não uma quarta velocidade.

                ── E A LISTA COBRE MESMO O `rotate` ────────────────────────
                No Tailwind v4 `rotate-90` emite a propriedade AUTÓNOMA
                `rotate: 90deg`, não um `transform` — a armadilha que já mordeu
                esta casa duas vezes. O que a fecha é a forma NOMEADA:
                compilado com o Tailwind 4.3.0 deste repositório,
                `transition-transform` sai como
                `transition-property: transform, translate, scale, rotate`, e
                cobre-a. Quem NÃO a cobre é a forma entre parênteses rectos —
                `transition-[transform]` sai literal e deixa o `rotate` de fora.
                Por isso fica a nomeada, e uma varredura prende-a. */}
            <span
              aria-hidden
              className={`text-[10px] text-foreground/35 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0,0,0.2,1)] ${fechada ? "" : "rotate-90"}`}
            >
              ▶
            </span>
            <h3 className="font-display text-base leading-tight text-[var(--bo-text)] group-hover:text-foreground">
              {title}
            </h3>
          </button>
        ) : (
          <h3 className="font-display shrink-0 text-base leading-tight text-[var(--bo-text)]">
            {title}
          </h3>
        )}
        {nota && <span className="shrink-0 text-xs text-foreground/45">{nota}</span>}
        {accao && <div className="shrink-0">{accao}</div>}
      </div>
      {/* `hidden` e não desmontar: uma secção fechada continua a ter os campos
          no formulário, e fechá-la não pode apagar o que lá está escrito.
          A `.bo-entrada` entra por cima disso e não em vez disso — ver
          `jaAbriuAMao`, lá em cima, para o porquê de ela só chegar ao primeiro
          toque dela. */}
      <div
        id={corpoId}
        hidden={fechada}
        /* `bo-entrada-folha` — oito píxeis e não quatro, o mesmo que a dobra da
           disposição: quatro é a distância de um item de menu, e isto é um
           bloco de conteúdo a descer para dentro da página. */
        className={jaAbriuAMao ? "bo-entrada bo-entrada-folha" : undefined}
      >
        {children}
        {rodape}
      </div>
    </Card>
  );
}
