"use client";

import { eur } from "@/lib/money";
import { Button } from "../../../ui";
import { nomeDoPasso, passoAoLado } from "@/lib/orcamento/passos-do-estudio";
import { type Step } from "../../tipos";
import { useEstudio } from "../../contexto";

/**
 * ── UM `mr-auto` SÓ, E NÃO DOIS AUTOS FRENTE A FRENTE ──────────
 * A folga livre da fila é dada ao `mr-auto` acima, que a absorve toda e
 * encosta este grupo à direita. Pôr aqui um `ml-auto` seria pior do que
 * redundante: com margens automáticas dos dois lados o flexbox REPARTE
 * a folga em partes iguais, e o grupo ficaria centrado — com o total a
 * passear-se para o meio da barra sempre que o estado mudasse de
 * largura.
 *
 * ── A DICA SAI QUANDO NÃO CABE, EM VEZ DE FICAR COM UMA LETRA ──
 * A 390 px, com «← Inspiração» e «Seguinte: Rever e enviar» ao
 * lado, sobravam uns 30 px para a linha da esquerda, e o
 * `truncate` deixava «Pree…» e depois só «P.» (auditoria de
 * 13/11, n.º 12) — e um total cortado a meio é pior: lê-se outro
 * número. O grupo passa a contentor (`@container`, com a folga
 * toda da barra, e `justify-end` para continuar encostado à
 * direita), e a linha e a divisória saem quando a caixa não dá
 * ~120 px à linha: 27rem com o «anterior», 20rem sem ele.
 *
 * ── E O TOTAL NUNCA SAI (auditoria de 14/11, n.º 1) ──────────
 * O `@container` deste grupo foi-se. Um contentor de tamanho
 * inline MEDE ZERO para quem o embrulha a abraçar o conteúdo — e
 * a barra, a partir de 40rem, é `w-fit`. MEDIDO a 1440 e a 768:
 * o grupo ficava com 0 px, o `@max-[20rem]:hidden` apagava o
 * total, e a barra encolhia para 26 px com os botões a sair por
 * fora. A 390, a partir do passo 2, o «anterior» tirava-lhe o
 * lugar na mesma.
 *
 * Palavras dela: «não quero fazer scroll para saber quanto vai a
 * proposta». Por isso quem cede espaço numa caixa estreita são
 * os BOTÕES — o nome do passo passa a só se ouvir (`sr-only`) e
 * fica a seta —, e o total não cede nunca (`shrink-0`). As
 * perguntas de largura são feitas à caixa de cima, que é um
 * bloco e mede a sério.
 */
export function TotalEPassosNaBarra() {
  const {
    guardar: { aGuardarAgora, guardarAgora },
    passos: { irParaPasso, step },
    pronta: { isDeco },
    rascunho: { soNesteComputador },
    total: { money, totais },
  } = useEstudio();
  return (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
      {/* ── A ETIQUETA VIAJA COM O NÚMERO ────────────────────────────
                    A escolha acima — no telemóvel, o que o CLIENTE paga — estava
                    certa. O que estava errado era a palavra: «Total» ficava FORA
                    do corte e servia os dois números. No telemóvel lia-se
                    «Total 3.025,80 €» (com IVA); no computador, «Total 2.460,00 €
                    sem IVA». A mesma proposta, a mesma palavra, dois valores —
                    e ela trabalha no telemóvel e confere no computador.

                    Não é a conta que muda: é a etiqueta que mentia num dos dois.
                    Em todo o resto do ficheiro `totais.aPagar` aparece sempre
                    como «total a pagar» (ver o bloco de totais e o gerador do
                    PDF); só esta barra lhe chamava «Total».

                    Por isso o rótulo e o valor passam a viver DENTRO do mesmo
                    ramo. Separá-los com dois `hidden` independentes foi o que
                    deixou a palavra emparelhar-se com o número errado — e é um
                    engano que volta sozinho se o par se voltar a separar. */}
      {/* ── O NÚMERO QUE DECIDE TEM DE SE DISTINGUIR DA MOLDURA ────────
                  Estava tudo a 12 px: rótulo, número e ressalva. Um `font-semibold`
                  no meio de uma linha inteira do mesmo tamanho não faz hierarquia
                  nenhuma a três metros de distância — e a esta barra olha-se de
                  relance, não se lê.
            
                  O valor sobe a 14 px e o resto fica nos 12; a caixa não cresce
                  porque a altura da barra é dada pelo botão (40 px) e não pelo texto
                  (16 px de linha, 20 com o valor maior).
            
                  QUAL dos dois números leva o tamanho não se mexe: continua a ser o
                  que já estava a `<strong>` em cada ramo. Escolher outro seria
                  decidir qual é «o» total da casa — decisão dela, não minha, e esta
                  barra já perdeu uma terceira soma por alguém a ter tomado sozinho.
            
                  `tabular-nums` porque o total muda ENQUANTO ela escreve os serviços:
                  com algarismos de larguras diferentes, cada tecla remede a linha e o
                  número dança. Em algarismos tabulares um 4 e um 1 ocupam o mesmo, e
                  a linha fica quieta. É o mesmo que o bloco de totais aqui em baixo
                  já faz (ver `LinhaDeTotal`). */}
      <p
        data-total-da-barra
        className="shrink-0 whitespace-nowrap text-xs tabular-nums text-[var(--bo-text-muted)]"
      >
        {money.base > 0 ? (
          <>
            <span className="@min-[48rem]:hidden">
              <span className="text-foreground/45">A pagar</span>{" "}
              <strong className="font-semibold text-[var(--bo-text)]">{eur(totais.aPagar)}</strong>
            </span>
            <span className="hidden @min-[48rem]:inline">
              <span className="text-foreground/45">Total</span>{" "}
              <strong className="font-semibold text-[var(--bo-text)]">{eur(totais.total)}</strong>{" "}
              <span className="text-foreground/45">sem IVA · a pagar {eur(totais.aPagar)}</span>
            </span>
          </>
        ) : (
          /* A instrução do estado vazio estava `hidden sm:inline`: quem
                       abre uma proposta em branco no telemóvel não via nada a dizer
                       o que fazer a seguir. Fica, numa versão curta que cabe na
                       barra sem ser cortada pelo `truncate` do `<p>`. */
          <>
            <span className="@min-[48rem]:hidden">Preenche e avança.</span>
            <span className="hidden @min-[48rem]:inline">
              Preenche este passo e avança para o seguinte.
            </span>
          </>
        )}
      </p>
      {/* ── UMA DIVISÓRIA A SÉRIO ENTRE O QUE SE LÊ E O QUE SE CARREGA ──
                  Um traço de 1 px com a altura do texto, no `--bo-hairline-strong`
                  da casa. Diz que o número e o botão são vizinhos de propósito e não
                  a mesma coisa — que é precisamente o que um espaço não conseguia
                  dizer. `aria-hidden` porque não há nada aqui para ouvir. */}
      <span aria-hidden className="h-5 w-px shrink-0 bg-[var(--bo-hairline-strong)]" />
      {/* ══════════════════════════════════════════════════════════════
                O «GUARDAR AGORA» SAIU — MENOS NO ÚNICO CASO EM QUE ERA A ÚNICA
                MANEIRA DE GRAVAR
                ══════════════════════════════════════════════════════════════

                Palavras dela: «"Guardar agora" ao lado de "Tudo guardado" é
                redundante e contraditório». É, e a gravação automática cobre
                MESMO o que o botão cobria — não é uma suposição: `guardarAgora`
                chama `flushDraft.current()`, que é exactamente a mesma função
                `save` que o temporizador de 800 ms chama. Botão e automático
                gravavam pelo mesmo caminho, com as mesmas regras. Além disso a
                desmontagem grava o que faltasse, e o registo do back office
                trava a saída da página com trabalho por gravar.

                ── O CASO EM QUE O BOTÃO NÃO ERA REDUNDANTE ──────────────────
                Quando o servidor RECUSA: a cópia local é síncrona e apaga o
                «por gravar», e o temporizador só volta a correr à tecla
                seguinte. Nesse estado — o mesmo em que uma proposta inteira já
                se perdeu — carregar aqui era a única forma de voltar a tentar.
                Tirar o botão por inteiro era tirar isso.

                Por isso ele fica, mas SÓ nesse estado, e com o nome do que faz
                nele: «Tentar guardar outra vez». Ao lado de «Tudo guardado» já
                não há botão nenhum — há o indicador, e mais nada. O ⌘S continua
                a valer sempre, para quem se levanta da secretária e quer a
                certeza sem esperar pelos 800 ms. */}
      {soNesteComputador && (
        <Button
          size="sm"
          variant="secondary"
          onClick={guardarAgora}
          loading={aGuardarAgora}
          title="Tentar guardar outra vez no servidor (⌘S)"
        >
          Tentar outra vez
        </Button>
      )}
      {/* ── ANTERIOR E SEGUINTE (A2) ─────────────────────────────
                  O botão principal diz PARA ONDE vai («Seguinte: Serviços»),
                  e não só «Seguinte»: com cinco passos, o nome do próximo é o
                  que diz quanto falta. O anterior é discreto e só existe a
                  partir do 2.º. */}
      {passoAoLado(step, -1) && (
        <Button
          data-acessorio-da-barra=""
          size="sm"
          variant="ghost"
          className="shrink-0"
          onClick={() => irParaPasso(passoAoLado(step, -1) as Step)}
          // O nome inteiro, dito de uma vez: com o nome do passo num
          // `<span>` à parte o Chromium lia «Seguinte : Serviços».
          aria-label={`← ${nomeDoPasso(passoAoLado(step, -1) as Step, !isDeco)}`}
        >
          {/* Um <span> só à volta: o botão é `flex` com `gap`, e cada
                      filho solto ganhava um espaço à frente («Seguinte : …»). */}
          <span>
            ←
            <span className="@max-[36rem]:sr-only">
              {" "}
              {nomeDoPasso(passoAoLado(step, -1) as Step, !isDeco)}
            </span>
          </span>
        </Button>
      )}
      <Button
        size="sm"
        variant="primary"
        className="shrink-0"
        onClick={() => irParaPasso(passoAoLado(step, 1) as Step)}
        iconRight={<span aria-hidden="true">→</span>}
        aria-label={`Seguinte: ${nomeDoPasso(passoAoLado(step, 1) as Step, !isDeco)}`}
      >
        <span>
          Seguinte
          <span className="@max-[36rem]:sr-only">
            : {nomeDoPasso(passoAoLado(step, 1) as Step, !isDeco)}
          </span>
        </span>
      </Button>
    </div>
  );
}
