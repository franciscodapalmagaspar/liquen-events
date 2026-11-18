"use client";

import { StepNav } from "../formulario/StepNav";
import { useEstudio } from "../contexto";

export function PassosDoEstudio() {
  const {
    botaoDoEnvio: { estadosDosPassos },
    passos: { irParaPasso, step },
    pronta: { isDeco },
  } = useEstudio();
  return (
    <>
      {/* Passos do fluxo — sempre visível, dá o sentido de "onde estou / o que
          fazer a seguir". Clicável para saltar entre passos. */}
      <StepNav
        step={step}
        onSelect={irParaPasso}
        estados={estadosDosPassos}
        organizacao={!isDeco}
      />

      {/* ══════════ PASSOS 1 a 4 · Evento, Serviços, Inspiração, Orçamento ══════════ */}
      {/* ── A FOLGA POR BAIXO É A ALTURA MEDIDA DA BARRA, NÃO UM NÚMERO ─────
          Era `pb-20` — 80 px escritos à mão. A barra do fundo é `sticky` e
          desenha-se POR CIMA do conteúdo; sem folga suficiente, o que fica por
          baixo dela não se lê nem se toca. E ela NÃO tem 80 px: cresce com o
          que lhe está dentro (o total embrulha, o botão de tentar outra vez
          aparece) e cresce outra vez no telemóvel, onde a barra de navegação do
          back office lhe soma mais 56 px por baixo. Medido na captura desta
          missão: 66 px de barra num ecrã largo, mais os 56 da navegação — 122,
          contra os 80 reservados. A linha do Sinal ficava debaixo dela.

          Agora a folga sai de `getBoundingClientRect` da própria barra, mais o
          que a separa do fundo do ecrã, e volta a ser medida sempre que a barra
          muda de tamanho (`ResizeObserver`). Um número que se mede não pode
          ficar desactualizado por alguém acrescentar um botão. */}
      {/* ── A FILA SÓ EXISTE ONDE HÁ DUAS COLUNAS ────────────────────────
          Isto era `flex gap-6` em TODAS as larguras. Enquanto o `NavEstudio`
          era `hidden … lg:block`, a fila tinha um filho só e não se notava;
          agora que o índice existe também abaixo de 1024 (uma tira que rola de
          lado), ele passava a ficar AO LADO do conteúdo a 375 px e esmagava a
          coluna onde ela escreve.

          A direcção é do PAI: nenhuma classe no filho (`w-full`, tirar o
          `shrink-0`, `display:contents`) desfaz uma fila. É o mesmo padrão que
          o índice dos mood boards já usa aqui em baixo (`lg:grid lg:grid-cols-…`):
          abaixo de `lg` é um bloco simples e a tira empilha por cima do
          conteúdo; a partir de `lg` é a fila de hoje, ao pixel.

          O `min-w-0 flex-1` do irmão fica inerte fora de um contexto flex, e o
          `@container` dele continua a ser um contentor válido nas duas
          larguras — `container-type: inline-size` não pede flex nenhum. */}
      {/* ── O CONTENTOR VEM POR FORA, E TEM DE VIR ─────────────────────────
          A fila abaixo pergunta «tenho largura para três colunas?». Um elemento
          NÃO PODE consultar-se a si próprio — uma consulta de contentor responde
          sempre sobre um antepassado —, portanto o contentor é esta caixa e a
          pergunta é feita de dentro dela.

          Era `lg:flex`: 1024 DE JANELA. MEDIDO num Chromium, no painel que abre
          a partir do cartão de um cliente: a janela tinha 1280 e esta zona tinha
          498 px. A fila montava-se na mesma, o índice levava 192 dos 498 (38%) e
          a coluna onde ela escreve ficava com 282. A janela dizia que havia
          espaço; aqui dentro não havia. */}
      {/* ── O PASSO QUE CHEGA APRESENTA-SE ────────────────────────────────
          Palavras dela: «imagina, estamos na fazer proposta, passamos para a
          parte seguinte — o que é que metes de animação aí?».

          Até aqui, nada: os três passos trocavam com `hidden`, e o conteúdo
          seguinte aparecia no mesmo fotograma em que o anterior desaparecia.
          Passa a ser a `.view-in` da casa — 240 ms, oito píxeis,
          `cubic-bezier(0, 0, 0.2, 1)` —, que é a classe escrita para
          exactamente isto: «o cromado não sai do sítio, muda o conteúdo dentro
          dele».

          ── PORQUE É A CLASSE A ENTRAR E A SAIR, E NÃO UM `key` ────────────

          Um `key` remonta. E estes dois passos NÃO podem remontar: ficam
          montados de propósito (só `hidden`), porque o passo 1 guarda o
          formulário inteiro e o passo 3 guarda o estado do envio. Remontá-los
          a cada troca perdia o foco, o rolo e o trabalho a meio.

          Tirar e voltar a pôr a classe dá o mesmo efeito sem tocar na árvore:
          quando o passo sai, a classe sai com ele; quando volta, a animação
          recomeça. Sem JavaScript, sem temporizador, sem remontagem.

          A `.view-in` acaba em `transform: none` e usa `backwards` — não fica
          transform pendurado, que é o que quebraria o `position: fixed` de uma
          folha aberta aqui dentro. A barra `sticky` do fundo é IRMÃ destes
          três e não está lá dentro, portanto não a apanha. */}
    </>
  );
}
