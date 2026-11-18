"use client";

import { ESTADO } from "../../../ui/movimento";
import { EstadoNaBarra } from "./EstadoNaBarra";
import { TotalEPassosNaBarra } from "./TotalEPassosNaBarra";
import { EnvioNaBarra } from "./EnvioNaBarra";
import { Button, EmCurso } from "../../../ui";
import { useEstudio } from "../../contexto";

/**
 * Ação principal — muda conforme o passo, para haver sempre UMA próxima
 * ação óbvia.
 */
export function BarraDeBaixo() {
  const {
    barra: { barraDeBaixo, barraEscondida },
    botaoDoEnvio: { noFormulario },
    envio: { avancoDaEnviada, fimDoPdf, sent },
    ocupado: { busy },
    passos: { irParaPasso, step },
    pdfDaProposta: { descarregarAEnviada },
  } = useEstudio();
  return (
    <div
      ref={barraDeBaixo}
      // `z-20` não é enfeite: sem ele os cartões das secções — que criam o seu
      // próprio contexto de empilhamento — desenham-se POR CIMA desta barra, e o
      // texto do total aparecia misturado com o do campo por baixo. Vê-se na
      // captura de ecrã antes desta linha existir; nenhum teste apanhava.
      /* A barra encosta ao fundo do CONTEÚDO, mas por baixo dela ainda vem a
           barra de navegação do back office (56 px, fixa, só abaixo de `lg`).
           Com `bottom-0` a acção principal — "Pré-visualizar", "Enviar" —
           ficava por baixo dela: tocar ali tocava na navegação e mudava de
           vista. Foi o cheque de oclusão a apanhá-lo; à vista não se distingue
           de um toque que não pegou.
           A partir de `lg` a navegação passa a barra lateral e a folga deixa de
           fazer sentido. */
      /* Esta barra pousa EM CIMA da barra de destinos do telemóvel, portanto
           a sua distância ao fundo é a altura dessa barra — que passou a viver
           no token `--bo-barra-inferior`. Era a quarta cópia do «56px», e com a
           barra a crescer para 72 px ficava a tapá-la. `lg:bottom-0` porque
           acima de 1024 não há barra nenhuma por baixo. */
      /* ── O AVISO E A BARRA JÁ NÃO DISPUTAM A MESMA FAIXA ───────────────
           MEDIDO a 375 px: um aviso («Este rascunho tinha sido alterado noutro
           sítio…») nasce fixo 12 px acima da navegação do telemóvel, e esta
           barra pousa nessa mesma navegação com ~64 px de altura — ou seja, o
           aviso nascia DENTRO da faixa desta barra, em cima do botão
           «Pré-visualizar» (`elementFromPoint` no centro do botão devolvia o
           texto do aviso) durante os 4 s em que fica no ecrã.
           A saída NÃO é levantar esta barra por cima do aviso: a barra é opaca
           e mais alta do que ele, e o aviso — que é como o estúdio diz que uma
           gravação falhou — desaparecia por completo no telemóvel. Quem se
           afasta é o aviso: esta barra publica a sua altura medida em
           `--bo-barra-accao` (ver o `ResizeObserver` lá em cima) e o
           `Toast.tsx` soma-a à distância a que já se punha do fundo. Ficam os
           dois visíveis, e nenhum tapa o outro. */
      /* ── E PASSOU A SER MATERIAL, COMO TUDO O QUE FLUTUA ──────────────
           Palavras dela, com uma captura desta barra ao lado da cápsula de
           vidro: «quero isto com o mesmo design da apple».

           Era uma laje branca de bordo a bordo com um risco por cima — a única
           superfície do estúdio que continuava a fingir que não flutua. Flutua:
           está `sticky`, o conteúdo passa mesmo por baixo dela, e é isso que a
           põe na camada FUNCIONAL do sistema de design, onde vive o material.

           `bo-material` traz o raio, o fio dos quatro lados e a superfície
           translúcida; `bo-material-desfoque` o desfoque. Sai o `border-t`
           (um risco de um lado só é o desenho de uma laje encostada, e a peça
           deixou de o ser) e sai a cor sólida — que se pintava POR CIMA do
           material e o apagava, como já tinha acontecido na coluna e na barra
           de topo.

           `mx-1` em vez de `-mx-1`: uma peça que flutua tem ar dos lados. Era
           negativo de propósito, para a laje ir de bordo a bordo do painel;
           com raio, ir de bordo a bordo era cortar-lhe os cantos contra a
           margem.

           Continua a publicar a sua altura em `--bo-barra-accao` para o aviso
           do `Toast` se afastar dela, e continua a pousar à altura da barra de
           destinos — as duas coisas que este bloco já garantia. */
      /* ── E DEIXOU DE SER UMA LAJE VAZIA DE BORDO A BORDO ──────────────
           Palavras dela, com a captura deste ecrã num portátil: «esta barra de
           pré-visualizar aqui não está muito bem».

           Estava, e era de medida: a barra ocupava a largura inteira do estúdio
           — as três colunas, o formulário e o painel do «que vai sair» — para
           transportar uma frase e um botão. Tudo o resto era vidro por encher.
           E logo por cima da cápsula dos destinos, que também flutua: duas
           lajes empilhadas a comerem o fundo do ecrã.

           `sm:w-fit` faz a barra medir o que tem. `sm:ml-auto` encosta-a à
           direita — e é ISSO que preserva a decisão que este bloco já tinha
           tomado e explicado: «o botão NÃO se mexe para a esquerda (…) a acção
           principal a saltar de sítio entre passos custa mais do que o vazio».
           Sendo o botão o elemento mais à direita de uma barra encostada à
           direita, a borda dele fica no mesmo x nos três passos — que é o que
           aquela decisão queria, e que a laje só conseguia à custa do vazio.

           `max-w-full` porque numa janela estreita o total escrito por extenso
           pode pedir mais do que há; aí volta a caber e o `truncate` do
           parágrafo faz o resto.

           ── E A PERGUNTA É À CAIXA, NÃO À JANELA ──────────────────────────
           Escrevi isto primeiro com `sm:`, e o `o-estudio-pergunta-a-caixa`
           chumbou-o — com razão, e é a rede a fazer o seu trabalho. O estúdio
           desenha-se em DOIS sítios: a página inteira e o painel de detalhe,
           que tem tecto próprio. Com a janela a 1440 a fila do painel tem 712,
           portanto um `sm:` (640 de JANELA) estaria satisfeito sem dizer nada
           sobre o espaço que a barra tem de facto.

           `@min-[40rem]:` pergunta à caixa mais próxima — o `@container` que este
           bloco passou a declarar, e que é mesmo a caixa de quem esta barra é
           filha. MEDIDA: 1360 px com o estúdio sozinho, 712 com o painel de
           detalhe aberto, a janela a 1440 nos dois casos. 40rem é a mesma
           medida que o ficheiro já usa noutras decisões de coluna.

           O `max-w-full` fica solto: não é uma decisão de largura, é uma rede
           para o total escrito por extenso não empurrar a barra para fora.

           Abaixo disso nada se aplica: a barra é a largura da caixa, e o
           `mr-auto` do parágrafo continua a ser quem separa o estado da
           decisão.

           ── E AR ENTRE AS DUAS PEÇAS QUE FLUTUAM ──────────────────────────
           MEDIDO a 1440×900 depois de a barra passar a abraçar o conteúdo: o
           fundo dela ficava aos 814 px e o topo da cápsula dos destinos aos
           816. DOIS píxeis. Duas superfícies de vidro a dois píxeis uma da
           outra não se lêem como duas coisas — lêem-se como uma mancha só com
           um risco no meio, que é o contrário do que flutuar quer dizer.

           A soma ganha o `--bo-barra-folga`: o MESMO ar que a cápsula já tem
           do bordo do ecrã. Não é um número afinado a olho — é o token do ar
           desta casa, aplicado ao vão entre duas peças em vez de ao vão entre
           uma peça e a moldura. Ficam 14 px, e lêem-se como duas. */
      // Escondida pelo teclado (barra compacta): fica no sítio, transparente e
      // inerte — o conteúdo não salta, e nada nela se deixa tocar.
      inert={barraEscondida}
      className={`bo-material bo-material-desfoque sticky bottom-[calc(var(--bo-barra-inferior)+var(--bo-barra-folga)+env(safe-area-inset-bottom))] z-20 mx-1 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 px-2 py-1.5 shadow-[var(--bo-sombra-suspensa)] max-w-full @min-[40rem]:ml-auto @min-[40rem]:w-fit ${ESTADO} ${
        barraEscondida ? "pointer-events-none opacity-0" : ""
      }`}
    >
      {noFormulario && (
        <>
          <EstadoNaBarra />
          <TotalEPassosNaBarra />
        </>
      )}

      <EnvioNaBarra />

      {step === "enviar" && sent && (
        <>
          <Button size="sm" variant="ghost" onClick={() => irParaPasso("evento")}>
            ← Voltar ao evento
          </Button>
          {fimDoPdf.mostrar ? (
            <EmCurso
              emLinha
              className="ml-auto"
              titulo="A descarregar o PDF…"
              concluido={fimDoPdf.concluido}
              pronto="PDF pronto"
              {...(avancoDaEnviada
                ? { feito: avancoDaEnviada.feito, total: avancoDaEnviada.total }
                : { estimadoMs: 2_000 })}
            />
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="ml-auto"
              onClick={() => void descarregarAEnviada()}
              disabled={busy !== null}
            >
              Descarregar PDF
            </Button>
          )}
        </>
      )}
    </div>
  );
}
