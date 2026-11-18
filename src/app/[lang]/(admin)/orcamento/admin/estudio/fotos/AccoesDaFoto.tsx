"use client";

import { useState } from "react";
import { ESTADO, PRESSAO } from "../../ui/movimento";
import { accoesDaFoto } from "./accoes-da-foto";
import { BarraDoRatoDaFoto } from "./BarraDoRatoDaFoto";
import { FolhaDasAccoesDaFoto } from "./FolhaDasAccoesDaFoto";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE SE PODE FAZER A UMA FOTOGRAFIA, SEM A TIRAR DE LÁ PRIMEIRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Antes havia um botão só, o × de remover, e só aparecia ao passar o rato.
 * Num telemóvel — que é onde metade deste trabalho é feito — isso é um botão
 * que não existe; e no computador era a única resposta para «esta foto está no
 * sítio errado», o que fazia de remover a ferramenta para tudo.
 *
 * ── PORQUE É QUE COM RATO ESTÁ NUMA BARRA E AO TOQUE NUM «⋯» ──────────────
 *
 * MEDIDO a 375 px, template Decoração, dois mood boards com 3 e 4 fotografias,
 * proposta bilingue ligada — o ecrã de que a dona do negócio mandou fotografia:
 *
 *     célula da miniatura            84 × 72 px
 *     botão (o `alvo-toque` no dedo) 44 × 44 px
 *     sete botões, a quebrar         84 × 328 px
 *     sobe acima da própria foto        256 px
 *     z-index                              20
 *
 * Sete alvos de 44 px NÃO CABEM numa célula de 84: o `flex-wrap` empilhava-os
 * numa coluna quatro vezes e meia mais alta do que a miniatura, e o
 * `absolute bottom-0` fazia essa coluna crescer PARA CIMA, por cima do que
 * estivesse lá — com `z-20`, portanto por cima e não por baixo. Com sete
 * fotografias na página eram sete colunas de quadrados escuros a atravessar o
 * subtítulo, a caixa EN e a descrição. Medido: 13 pedaços de texto tapados,
 * entre eles «Two columns with Roman vase…» com 53 × 29 px de letra por baixo
 * de um quadrado preto.
 *
 * A regra antiga (`[@media(hover:none)]:opacity-100`) estava certa no
 * princípio — num ecrã táctil, «aparece no hover» quer dizer «não existe» — e
 * errada no resultado: tornou visíveis sete botões que não têm onde caber.
 *
 * Agora a FORMA muda com o apontador, e não só a opacidade:
 *   · com rato  — a barra de sete ícones de 24 px, revelada ao passar por
 *                 cima, exactamente como sempre esteve;
 *   · com dedo  — UM «⋯» de 44 px no canto da miniatura, que abre a folha
 *                 inferior com as sete acções escritas por extenso.
 *
 * Tudo em CSS e não com o `usePodeEsconderNoHover()`: um hook lê `false` no
 * servidor e no primeiro desenho, e o computador via o «⋯» a piscar antes de a
 * barra aparecer. A media query não tem primeiro desenho errado.
 *
 * ── E A PERGUNTA É `com-rato`, NÃO `(hover: none)` — ISTO VOLTOU ──────────
 *
 * A barra voltou a aparecer por cima das células, e a dona do negócio mandou a
 * fotografia. A causa é uma pergunta MAL PARTIDA em duas: a barra escondia-se
 * com `(hover: none)`, mas o tamanho dos botões cresce com `(pointer: coarse)`
 * (`.alvo-toque`, em globals.css). São duas perguntas diferentes, e há
 * aparelhos que respondem SIM à segunda e NÃO à primeira: um iPhone ou um iPad
 * com AssistiveTouch, com rato ou com trackpad ligados, e um portátil de ecrã
 * táctil. Nesses, `(hover: none)` é falso — a barra fica — e
 * `(pointer: coarse)` é verdadeiro — cada ícone salta de 24 px para 44.
 *
 * MEDIDO num Chromium com `primaryPointerType=coarse` e `primaryHoverType=hover`,
 * a 390 px, na proposta das capturas (nove fotos, um mood board):
 *
 *     célula                                   89 × 104 px
 *     barra                                    89 × 328 px
 *     sobe acima do topo da própria célula         209 px
 *     cada um dos sete botões                   44 × 44 px
 *     «⋯» (o caminho do dedo)               display: none
 *     pedaços de texto tapados                          5
 *
 * — incluindo o «Imagem guardada» e o «Não consegui mostrá-la neste ecrã.» da
 * própria célula. E, mesmo a `opacity: 0`, a barra continua a APANHAR o toque:
 * `elementFromPoint` no meio do «Tentar novamente» devolvia o botão «Mover para
 * trás». O botão que explica a avaria estava debaixo de um botão invisível.
 *
 * A casa já tem a pergunta inteira, e é uma só: `com-rato`
 * (`(hover: hover) and (pointer: fine)`, globals.css). Os dois lados penduram-se
 * nela — `hidden com-rato:flex` na barra, `com-rato:hidden` no «⋯» — pela razão
 * escrita lá: um browser que não perceba de ponteiros mostra as DUAS formas,
 * feio mas inteiro, em vez de não mostrar nenhuma.
 *
 * E os sete botões da barra deixaram de ser `alvo-toque`. A barra só existe
 * onde há rato, e com rato o mínimo de 44 px nunca se aplica — mas era ele que,
 * quando a media query falhava, transformava 7 × 24 px numa coluna de 328. Sem
 * ele, o pior caso deixa de poder acontecer.
 *
 * ── E REMOVER FICOU MAIS DIFÍCIL DE ACERTAR POR ENGANO, NÃO MAIS FÁCIL ─────
 * Estava um × de 44 px encostado ao ✓ de escolher, dentro de uma célula de 84 —
 * dois alvos a 4 px um do outro, num sítio onde o dedo tapa os dois. Passa a
 * ser uma linha escrita «Remover fotografia», em baixo, separada por um traço
 * das que não apagam nada, e a vermelho. É a mesma regra que o `MenuDeAccoes`
 * já aplica às linhas das tabelas.
 *
 * ── AS SETAS NÃO SÃO UM ADORNO ────────────────────────────────────────────
 * São o caminho do teclado (e do dedo trémulo). Arrastar exige apontar, mover e
 * largar sem falhar; mover uma foto uma casa é um toque, e é o gesto que se faz
 * dez vezes seguidas ao afinar uma página.
 */
export function AccoesDaFoto({
  nome = "esta fotografia",
  podeRecuar,
  podeAvancar,
  principal,
  seleccionada,
  onRecuar,
  onAvancar,
  onAmpliar,
  onSubstituir,
  onPrincipal,
  onSeleccionar,
  onRemover,
}: {
  /** Como se chama esta fotografia na folha do telemóvel («Fotografia 2 de
   *  Decoração Cerimónia»). Sete linhas escritas precisam de dizer a QUEM se
   *  aplicam — a barra de ícones não precisava, porque está em cima da foto. */
  nome?: string;
  podeRecuar: boolean;
  podeAvancar: boolean;
  /** `undefined` = esta disposição não tem lugar de destaque; o botão não aparece. */
  principal?: boolean;
  seleccionada: boolean;
  onRecuar: () => void;
  onAvancar: () => void;
  onAmpliar: () => void;
  onSubstituir: () => void;
  onPrincipal: () => void;
  onSeleccionar: () => void;
  onRemover: () => void;
}) {
  const [folhaAberta, setFolhaAberta] = useState(false);
  const accoes = accoesDaFoto({
    podeRecuar,
    podeAvancar,
    principal,
    seleccionada,
    onRecuar,
    onAvancar,
    onAmpliar,
    onSubstituir,
    onPrincipal,
    onSeleccionar,
    onRemover,
  });

  return (
    <>
      {/* ── O CAMINHO DO DEDO: um alvo, e as sete acções por extenso ────────
          `flex com-rato:hidden` — existe por omissão e desaparece só onde há
          MESMO rato. Antes era `hidden [@media(hover:none)]:flex`, e num
          telemóvel com trackpad ou AssistiveTouch (onde `(hover: none)` é
          falso) isto ficava em `display: none`: sem barra utilizável e sem
          «⋯», a célula não tinha acção nenhuma. Fica no canto inferior direito
          da miniatura e mede 44 px numa célula de 84×72: cabe, e é o único que
          cabe. */}
      <button
        type="button"
        onClick={() => setFolhaAberta(true)}
        aria-label={`Acções de ${nome}`}
        aria-haspopup="dialog"
        className={`alvo-toque pointer-events-auto absolute right-0.5 bottom-0.5 z-20 flex h-11 w-11 items-center justify-center rounded-lg bg-black/60 text-white com-rato:hidden ${ESTADO} ${PRESSAO}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      <FolhaDasAccoesDaFoto
        aberta={folhaAberta}
        aoFechar={() => setFolhaAberta(false)}
        nome={nome}
        accoes={accoes}
      />

      {/* ── O CAMINHO DO RATO: DUAS ACÇÕES, E O RESTO A UM TOQUE ───────────
          Palavras dela: «controlos sobrepostos à imagem». Eram seis círculos
          escuros a tapar a faixa de baixo da fotografia — que é onde costuma
          estar o que interessa numa foto de mesa posta —, e tapavam-na
          precisamente enquanto ela está a olhar para ela.

          Ficam duas: as setas. São o gesto que se faz cem vezes por proposta, e
          mandá-las para dentro de uma folha era trocar um clique por dois no
          trabalho de todos os dias. As outras quatro — ver em grande, trocar,
          principal, escolher — e a que APAGA passam para a folha, que já existe
          e já é a única coisa que o dedo vê. Uma lista escrita por extenso, com
          o «Remover» separado por um traço, é melhor sítio para o botão
          destrutivo do que um círculo de 24 px ao lado de outros cinco iguais.

          `hidden com-rato:flex`: não existe até haver rato — nem desenhada nem
          a apanhar toques. */}
      <BarraDoRatoDaFoto
        nome={nome}
        podeRecuar={podeRecuar}
        podeAvancar={podeAvancar}
        onRecuar={onRecuar}
        onAvancar={onAvancar}
        aoAbrirAFolha={() => setFolhaAberta(true)}
      />
    </>
  );
}
