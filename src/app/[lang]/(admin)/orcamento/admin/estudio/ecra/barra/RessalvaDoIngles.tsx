"use client";

import { useEstudio } from "../../contexto";

/**
 * ══════════════════════════════════════════════════════════
 * A RESSALVA TEM DE SER VERIFICÁVEL NO PAPEL
 * ══════════════════════════════════════════════════════════
 *
 * Quem a lê vai a seguir mandar o PDF a um cliente inglês.
 *
 * Já esteve errada duas vezes, e das duas por prometer a
 * descoberta ao cliente: prometeu «datas» quando a data do
 * evento saía em português, e depois prometeu que os campos
 * preenchidos ficavam TODOS como estavam — quando a data e o
 * tipo de evento passaram a traduzir-se sozinhos e a prosa dela
 * passou a ter uma segunda caixa.
 *
 * Diz agora as três coisas que são verdade, e nenhuma a mais:
 * o que ela traduziu sai em inglês, o que não traduziu sai em
 * português, e os valores ficam à portuguesa.
 *
 * ── ISTO É PROSA DENTRO DE UMA BARRA COLADA, E ISSO CUSTA ECRÃ ──
 * A barra do fundo é `sticky` e `flex-wrap`: um filho `w-full`
 * não ocupa uma linha, ocupa uma LINHA SÓ PARA ELE. A 375 px
 * estas três frases dão cinco linhas de texto, e a barra —
 * que já se sobrepõe ao conteúdo e já lhe rouba a folga por
 * baixo — cresce outro tanto. Ela mandou a fotografia: com a
 * barra de navegação por baixo, sobrava menos de metade do ecrã
 * para a proposta que estava a escrever.
 *
 * Já havia uma máquina a MEDIR a barra e a reservar essa altura
 * ao conteúdo (ver o comentário do passo 1). Resolvia o sintoma
 * — o que ficava por baixo deixou de ser inalcançável — e
 * deixava a causa de pé: uma barra livre de crescer cresce.
 *
 * Não se esconde. Mostra-se QUANDO É A PERGUNTA: este parágrafo
 * responde a «o que muda se eu escolher inglês?», e ela trabalha
 * em português. Com «Português» escolhido fica uma linha, que
 * chega para saber que há uma diferença e onde a ler; com
 * «Inglês» escolhido abre inteiro, porque aí é a consequência do
 * que ela acabou de fazer.
 *
 * Em ecrã largo abre sempre: lá a barra tem espaço, e a única
 * razão para o encurtar era a que não existe.
 *
 * ── E AGORA UMA LINHA SÓ, EM QUALQUER ECRÃ ─────────────────
 * Palavras dela, com a captura desta barra e da do passo 3:
 * «coloca estas barras muito mais finas de modo a não estarem
 * a atrapalhar o trabalho de por trás». No ecrã largo o texto
 * inteiro ocupava uma linha só para ele, e a barra tinha três
 * andares (voltar · idioma e PDF · ressalva · «Rever e
 * enviar»).
 *
 * Com «Português» fica a frase curta, À VISTA e na mesma fila
 * dos controlos — continua dito, antes do clique, que o inglês
 * muda o documento. O texto inteiro fica para o leitor de ecrã
 * (`sr-only`) e abre à vista quando se escolhe «Inglês», que é
 * quando passa a ser a consequência do que ela fez.
 */
export function RessalvaDoIngles() {
  const {
    traducoes: { idiomaDoPdf },
  } = useEstudio();
  return (
    <p
      className={
        idiomaDoPdf === "en"
          ? "w-full text-right text-[11px] leading-snug text-foreground/50"
          : "order-first text-[11px] leading-snug text-foreground/50"
      }
    >
      {idiomaDoPdf === "en" ? (
        <>
          Em inglês sai a moldura do documento — rótulos, textos da casa, condições, a data e o tipo
          de evento. Da tua prosa sai em inglês o que estiver nas caixas «EN»; o que ficar em branco
          sai em português. Os valores continuam à portuguesa (1.234,56 €).
        </>
      ) : (
        <>
          <span aria-hidden="true">Em inglês muda a moldura do documento.</span>
          <span className="sr-only">
            Em inglês sai a moldura do documento — rótulos, textos da casa, condições, a data e o
            tipo de evento. Da tua prosa sai em inglês o que estiver nas caixas «EN»; o que ficar em
            branco sai em português. Os valores continuam à portuguesa (1.234,56 €).
          </span>
        </>
      )}
    </p>
  );
}
