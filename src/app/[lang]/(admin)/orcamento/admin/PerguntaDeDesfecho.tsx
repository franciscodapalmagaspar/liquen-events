"use client";

import { asPropostasMudaram } from "./percentagem-do-sinal";
import { useState } from "react";
import { razaoDaRecusa } from "@/lib/porque-falhou";
import type { MotivoDeRecusa, Quote } from "@/lib/orcamento/types";
import {
  MOTIVOS_DE_PERDA,
  NOME_DO_MOTIVO,
  corpoDaMarcacao,
  corpoDoMotivo,
  desfechoJaMarcado,
  faltaODesfecho,
  valorConfirmado,
  type Desfecho,
} from "@/lib/orcamento/desfecho";
import { eur, randomId } from "./util";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { reporEstadoDoPedido } from "./anular-estado";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «ELES DISSERAM QUE SIM?» — o gesto de um toque
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ontem saiu o botão que deixava o cliente aceitar a proposta online. A
 * resposta do casal passou a chegar por email, por telefone ou por WhatsApp — e
 * ninguém a marcava em lado nenhum. O pedido ficava eternamente em «Proposta
 * enviada», o «Ganho» da Visão Geral ficava a zero com o dinheiro já na conta,
 * e os números diziam a verdade sobre uma coisa que ninguém lhes tinha contado.
 *
 * Isto é a entrada que faltava, e está DUAS VEZES no caminho dela: no cartão da
 * lista de pedidos e dentro do painel do pedido aberto. Não é um menu, não é um
 * submenu, não é um selector de estado escondido — são duas palavras e dois
 * botões, à frente dela no momento em que se lembra.
 *
 * ── NADA DISTO É VISÍVEL PARA O CLIENTE ───────────────────────────────────
 * É back office. Não há email, não há página, não há aviso do lado de lá. O
 * casal já respondeu por onde lhe apeteceu; isto é só alguém a registá-lo.
 *
 * ── O QUE GRAVA, E POR ONDE ───────────────────────────────────────────────
 * Um PATCH a `/api/orcamento/[id]` com o `status` — exactamente o mesmo caminho
 * que o selector de estado do painel usa. É de propósito: é esse PATCH que
 * semeia o plano de produção ao pôr um pedido em «aceite»
 * (`semearProducaoAoGanhar`), e um segundo caminho «mais directo» seria a
 * maneira de perder essa sementeira sem ninguém ligar a perda ao gesto novo.
 */

/** Como o campo mostra o valor de partida — vazio quando nunca houve preço. */
function textoDoValor(q: Quote): string {
  // `!= null` e não a verdade do valor: um preço de ZERO é um preço escrito, e
  // lido como «sem preço» o campo abria vazio a mentir sobre o que está gravado.
  return q.quotedPrice != null ? String(q.quotedPrice) : "";
}

/**
 * O que se diz de uma gravação recusada, pelo código que voltou.
 *
 * A regra vive em `razaoDaRecusa` (`lib/porque-falhou.ts`). Isto era a segunda
 * cópia dela — a primeira está no `AdminClient` — e as duas tinham divergido:
 * esta conhecia o 404 e a outra o 413, portanto o mesmo servidor dizia coisas
 * diferentes conforme o sítio do ecrã em que se estava a carregar.
 *
 * A frase de reserva fica aqui, e não na peça partilhada: «não foi possível
 * MARCAR» é sobre este diálogo e mais nenhum.
 */
function porqueNaoGravou(status: number): string {
  return razaoDaRecusa(status) ?? "Não foi possível marcar.";
}

/**
 * O `a-gravar` LEVA O DESFECHO consigo, e não é um detalhe de arrumação: sem
 * ele, gravar um «Perdido» caía no mesmo ramo de desenho do «Ganho» e o campo
 * do valor PISCAVA no ecrã durante a ida ao servidor. Perder um casamento não
 * tem preço nenhum a confirmar, e um campo de dinheiro a aparecer nesse
 * instante é a sugestão de que tem.
 */
type Fase =
  | { tipo: "pergunta" }
  | { tipo: "quanto" }
  | { tipo: "a-gravar"; desfecho: Desfecho }
  | { tipo: "marcado"; desfecho: Desfecho; valor?: number };

interface Props {
  quote: Quote;
  /** Quem está a marcar — vai para o histórico do pedido. */
  quem: string;
  /** O pedido como o servidor o devolveu. Quem recebe actualiza a lista. */
  onGravado: (q: Quote) => void;
  /**
   * `cartao` é a versão apertada, que vive no rodapé de um cartão da lista;
   * `painel` é a que abre o pedido. Só muda o tamanho e o espaçamento — as
   * palavras e o gesto são os mesmos nos dois sítios, de propósito.
   *
   * `linha` é a da TABELA de pedidos, no computador. Vive debaixo da pastilha
   * do estado, numa célula de 9rem, e a do cartão não cabia lá: o traço por
   * cima, a pergunta escrita e dois botões soltos faziam cada linha dobrar de
   * altura e ficar torta — palavras dela, «está assim tipo em cima das
   * coisas». Aqui são dois botões colados num só controlo, da altura de uma
   * pastilha, e a pergunta passa a ser o nome do grupo.
   */
  variante?: "cartao" | "painel" | "linha";
}

export default function PerguntaDeDesfecho({ quote, quem, onGravado, variante = "cartao" }: Props) {
  const [fase, setFase] = useState<Fase>({ tipo: "pergunta" });
  /**
   * O pedido como estava ANTES da marcação — para o «Anular» do recibo.
   * Palavras dela: «tem que haver no site todo, em tudo aquilo que se faz,
   * uma forma de voltar atrás».
   */
  const [antes, setAntes] = useState<{ status: Quote["status"]; quotedPrice?: number } | null>(
    null,
  );
  const [aAnular, setAAnular] = useState(false);
  const [escrito, setEscrito] = useState(() => textoDoValor(quote));
  const [aviso, setAviso] = useState<string | null>(null);
  const [notaMotivo, setNotaMotivo] = useState("");
  const [motivoAGravar, setMotivoAGravar] = useState<MotivoDeRecusa | null>(null);
  const [motivoGravado, setMotivoGravado] = useState(false);

  const jaMarcado = fase.tipo === "marcado";
  // A pergunta desaparece assim que deixa de fazer sentido — mas não a meio do
  // próprio gesto: depois de marcar, o `quote` que chega de fora já vem
  // decidido, e sem esta segunda condição o recibo (e o campo do motivo, que é
  // opcional e vem DEPOIS) desapareciam no mesmo instante em que aparecem.
  if (!faltaODesfecho(quote) && !jaMarcado) return null;

  const linha = variante === "linha";
  const compacto = variante !== "painel";

  /**
   * ════════════════════════════════════════════════════════════════════════
   * DOIS SEPARADORES ABERTOS NO MESMO PEDIDO
   * ════════════════════════════════════════════════════════════════════════
   *
   * Ela deixa o back office aberto no portátil e abre-o outra vez no telemóvel.
   * O separador da frente marca «Ganho» por 5.000 € (houve negociação); o
   * separador de trás continua a mostrar «Proposta enviada» com os 4.600 € da
   * proposta original, e um toque distraído punha os 4.600 € por cima dos
   * 5.000 € já registados — sem aviso nenhum, e com uma segunda linha no
   * histórico a dizer «Proposta enviada → Ganho» sobre um pedido que já estava
   * ganho.
   *
   * Por isso lê-se o pedido ANTES de escrever. Se já estiver decidido, não se
   * grava nada: diz-se o que lá está e o ecrã acerta-se pelo servidor. A janela
   * de corrida encolhe de HORAS (um separador esquecido) para os milissegundos
   * entre a leitura e a escrita — que é o melhor que se consegue sem uma
   * gravação condicional na rota, que outros ecrãs também usam.
   */
  async function marcar(desfecho: Desfecho, valor?: number) {
    setAviso(null);
    setFase({ tipo: "a-gravar", desfecho });
    try {
      const fresco = await fetch(`/api/orcamento/${quote.id}`, { cache: "no-store" });
      if (fresco.ok) {
        const actual = (await fresco.json()) as Quote;
        const decidido = desfechoJaMarcado(actual);
        if (decidido) {
          setAviso(
            decidido === "ganho"
              ? `Este pedido já tinha sido marcado como ganho${
                  actual.quotedPrice != null ? ` por ${eur(actual.quotedPrice)}` : ""
                } noutro sítio. Não foi alterado.`
              : "Este pedido já tinha sido marcado como perdido noutro sítio. Não foi alterado.",
          );
          setFase({ tipo: "marcado", desfecho: decidido, valor: actual.quotedPrice });
          onGravado(actual);
          return;
        }
      }

      const res = await fetch(`/api/orcamento/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          corpoDaMarcacao({
            desfecho,
            valor,
            quem,
            quando: new Date().toISOString(),
            id: randomId,
          }),
        ),
      });
      if (!res.ok) {
        setAviso(porqueNaoGravou(res.status));
        // Volta ao ponto onde ela estava, com o número escrito: uma gravação
        // recusada tem de deixar o gesto por fazer E à mão de se repetir.
        setFase(desfecho === "ganho" ? { tipo: "quanto" } : { tipo: "pergunta" });
        return;
      }
      const actualizado = (await res.json()) as Quote;
      // O desfecho arrasta a proposta no servidor: a lista leve relê-se.
      asPropostasMudaram();
      setAntes({ status: quote.status, quotedPrice: quote.quotedPrice });
      setFase({ tipo: "marcado", desfecho, valor });
      onGravado(actualizado);
    } catch {
      setAviso("Não foi possível chegar ao servidor — verifica a ligação.");
      setFase(desfecho === "ganho" ? { tipo: "quanto" } : { tipo: "pergunta" });
    }
  }

  function confirmarGanho() {
    const lido = valorConfirmado(escrito);
    if (!lido.ok) {
      setAviso(lido.porque);
      return;
    }
    void marcar("ganho", lido.valor);
  }

  /**
   * O motivo de perda, gravado sozinho e sem tocar no estado — um dos cinco
   * botões, nunca uma frase escrita à mão. É por AQUI que a contagem de
   * `analise-de-propostas.ts` («perdi seis por preço este ano») deixa de ser
   * uma frase impossível: o botão que se carrega é a mesma lista fechada
   * (`MotivoDeRecusa`) que essa contagem lê — a rota propaga-o para a
   * proposta mais recente do pedido. O detalhe em texto livre, quando há, vai
   * junto no mesmo pedido, e vive à parte (`lostNote`), como já acontece do
   * lado das propostas.
   */
  async function guardarMotivo(motivo: MotivoDeRecusa) {
    setAviso(null);
    setMotivoAGravar(motivo);
    try {
      const res = await fetch(`/api/orcamento/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpoDoMotivo(motivo, notaMotivo)),
      });
      if (!res.ok) {
        setAviso(porqueNaoGravou(res.status));
        setMotivoAGravar(null);
        return;
      }
      setMotivoGravado(true);
      onGravado((await res.json()) as Quote);
    } catch {
      setAviso("Não foi possível chegar ao servidor — verifica a ligação.");
      setMotivoAGravar(null);
    }
  }

  const botao =
    "alvo-toque rounded-full border px-3.5 py-1.5 text-[10px] font-semibold tracking-[0.1em] uppercase disabled:opacity-50";
  const previsto = valorConfirmado(escrito);

  return (
    <div
      className={
        linha
          ? "mt-1.5"
          : compacto
            ? "mt-3 pt-3 border-t border-[var(--bo-hairline)]"
            : "rounded-xl border border-sage-600/25 bg-sage-600/[0.04] p-4"
      }
      // O gesto vive dentro de cartões que são eles próprios um botão de abrir.
      // Sem isto, tocar em «Ganho» abria o pedido por baixo da marcação.
      onClick={(e) => e.stopPropagation()}
    >
      {fase.tipo === "marcado" ? (
        /* ── O RECIBO APARECE DE ALGUM SÍTIO ──────────────────────────────
           «Marcado como ganho — 4.600 €» é o fim de um percurso que começou
           num pedido de orçamento e passou por uma proposta inteira. Aparecia
           num fotograma, no lugar onde estavam os botões.

           `.bo-entrada` — 240 ms, quatro píxeis, a distância de um rótulo. Não
           é uma apresentação de 600: o cartão não mudou, mudou o que ele diz.

           E só o RECIBO leva entrada. O painel do valor, que aparece antes
           deste, tem `autoFocus` no campo — uma entrada ali arrastava o campo
           quatro píxeis debaixo do cursor que já lá está. */
        <div className="bo-entrada flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className={`text-sage-600 ${compacto ? "text-[11px]" : "text-sm"} font-medium`}>
              {fase.desfecho === "ganho"
                ? `Marcado como ganho${fase.valor != null ? ` — ${eur(fase.valor)}` : ""}.`
                : "Marcado como perdido."}
            </p>
            {/* A volta atrás fica ao lado do recibo enquanto ele está à vista:
                repõe o estado e o valor de antes, e — se foi «Ganho» — leva a
                proposta aceite e o contrato pendente que isso criou. */}
            {antes && (
              <button
                type="button"
                disabled={aAnular}
                onClick={() => {
                  setAAnular(true);
                  setAviso(null);
                  reporEstadoDoPedido({
                    quoteId: quote.id,
                    de: antes.status,
                    para: fase.desfecho === "ganho" ? "aceite" : "rejeitado",
                    actor: quem,
                    extra:
                      fase.desfecho === "ganho" ? { quotedPrice: antes.quotedPrice ?? null } : {},
                  })
                    .then((reposto) => {
                      setAntes(null);
                      setFase({ tipo: "pergunta" });
                      if (reposto) onGravado(reposto);
                    })
                    .catch((e: unknown) =>
                      setAviso(e instanceof Error ? e.message : "Não foi possível anular."),
                    )
                    .finally(() => setAAnular(false));
                }}
                className={`alvo-toque text-[11px] font-medium text-[var(--bo-text-muted)] underline underline-offset-2 hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
              >
                {aAnular ? "A anular…" : "Anular"}
              </button>
            )}
          </div>
          {/* ── «PERDIDO» NÃO INTERROGA ─────────────────────────────────────
              O negócio já está marcado; o motivo vem DEPOIS, é opcional, e
              nunca trava nada. Quem não quiser escrever fecha o pedido e o
              registo fica igualmente certo. */}
          {fase.desfecho === "perdido" &&
            !quote.lostReason &&
            (motivoGravado ? (
              <p className="text-foreground/45 text-[11px]">Motivo guardado.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-foreground/45 text-[10px] tracking-[0.1em] uppercase">
                  Motivo (opcional)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {MOTIVOS_DE_PERDA.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => void guardarMotivo(m)}
                      disabled={motivoAGravar !== null}
                      className={`${botao} border-[var(--bo-hairline-strong)] text-[var(--bo-text-muted)] hover:border-foreground/30 ${ESTADO} ${PRESSAO}`}
                    >
                      {motivoAGravar === m ? "A guardar…" : NOME_DO_MOTIVO[m]}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={notaMotivo}
                  maxLength={300}
                  onChange={(e) => setNotaMotivo(e.target.value)}
                  // Sem rótulo nenhum, era o `placeholder` a dizer o que o
                  // campo é. Regra 7: o rótulo fica (para quem ouve o ecrã) e
                  // o marcador passa a dar um exemplo do que aqui se escreve.
                  aria-label="Detalhe (opcional)"
                  placeholder="Ex.: ficou acima do orçamento"
                  className="bo-input px-2.5 py-2 text-sm text-[var(--bo-text)]"
                />
              </div>
            ))}
        </div>
      ) : linha &&
        (fase.tipo === "quanto" || (fase.tipo === "a-gravar" && fase.desfecho === "ganho")) ? (
        /* Na tabela, o valor cabe numa linha: o campo, um «Confirmar» e um
           «Cancelar». A frase que explica de onde vem o número fica no
           `title` — na tabela não há altura para ela, e o número que lá está
           escrito já é o da proposta enviada. */
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            autoFocus
            type="text"
            inputMode="decimal"
            value={escrito}
            onChange={(e) => {
              setEscrito(e.target.value);
              setAviso(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmarGanho();
              if (e.key === "Escape") setFase({ tipo: "pergunta" });
            }}
            aria-label="Valor combinado (sem IVA) €"
            title="É o valor da proposta enviada. Se houve negociação, corrige aqui"
            placeholder="Ex.: 4.600"
            className="bo-input w-[6.5rem] px-2 py-1 text-xs tabular-nums text-[var(--bo-text)]"
          />
          <button
            type="button"
            onClick={confirmarGanho}
            disabled={fase.tipo === "a-gravar"}
            className={`alvo-toque h-6 rounded-full bg-sage-600 px-2.5 text-[11px] font-medium text-white hover:bg-[var(--bo-accent-hover)] disabled:opacity-50 ${ESTADO} ${PRESSAO}`}
          >
            {fase.tipo === "a-gravar" ? "A marcar…" : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEscrito(textoDoValor(quote));
              setAviso(null);
              setFase({ tipo: "pergunta" });
            }}
            className={`alvo-toque h-6 px-1 text-[11px] text-[var(--bo-text-muted)] hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
          >
            Cancelar
          </button>
        </div>
      ) : fase.tipo === "quanto" || (fase.tipo === "a-gravar" && fase.desfecho === "ganho") ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[8rem] flex-1 flex-col gap-1">
              <span className="text-foreground/45 text-[10px] tracking-[0.1em] uppercase">
                Valor combinado (sem IVA) €
              </span>
              <input
                autoFocus
                type="text"
                inputMode="decimal"
                value={escrito}
                onChange={(e) => {
                  setEscrito(e.target.value);
                  setAviso(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmarGanho();
                  if (e.key === "Escape") setFase({ tipo: "pergunta" });
                }}
                placeholder="Ex.: 4.600"
                className="bo-input px-2.5 py-2 text-sm text-[var(--bo-text)]"
              />
            </label>
            <button
              type="button"
              onClick={confirmarGanho}
              disabled={fase.tipo === "a-gravar"}
              className={`${botao} border-sage-600 bg-sage-600 text-white hover:bg-[var(--bo-accent-hover)] ${ESTADO} ${PRESSAO}`}
            >
              {fase.tipo === "a-gravar"
                ? "A marcar…"
                : previsto.ok && previsto.valor > 0
                  ? `Confirmar ${eur(previsto.valor)}`
                  : "Confirmar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEscrito(textoDoValor(quote));
                setAviso(null);
                setFase({ tipo: "pergunta" });
              }}
              className={`${botao} border-transparent text-foreground/45 hover:text-[var(--bo-tinta-72)] ${ESTADO} ${PRESSAO}`}
            >
              Cancelar
            </button>
          </div>
          {/* O valor que já vem escrito é o da proposta que seguiu. Dizê-lo
              evita a dúvida de onde saiu aquele número — e é a diferença entre
              confirmar e adivinhar. */}
          <p className="text-foreground/40 text-[10px] leading-snug">
            É o valor da proposta enviada. Se houve negociação, corrige aqui — é este que passa a
            contar como ganho.
          </p>
        </div>
      ) : linha ? (
        /* ── DOIS BOTÕES, UM CONTROLO ──────────────────────────────────────
           Da altura da pastilha que está por cima, e com a mesma forma: lê-se
           como uma segunda pastilha que se pode tocar, e não como um bloco
           que caiu em cima da linha. O verde só no «Ganho» — é o gesto que se
           espera, e o «Perdido» fica ao lado, sem gritar. */
        <div
          role="group"
          aria-label="Já responderam?"
          title="Já responderam?"
          className="inline-flex h-6 items-stretch overflow-hidden rounded-full border border-[var(--bo-hairline-strong)] text-[11px] font-medium"
        >
          <button
            type="button"
            disabled={fase.tipo === "a-gravar"}
            onClick={() => {
              setAviso(null);
              setFase({ tipo: "quanto" });
            }}
            className={`alvo-toque inline-flex items-center gap-1 px-2.5 text-sage-600 hover:bg-sage-600/10 disabled:opacity-50 ${ESTADO} ${PRESSAO}`}
          >
            <span aria-hidden="true">✓</span>
            Ganho
          </button>
          <span aria-hidden="true" className="w-px bg-[var(--bo-hairline-strong)]" />
          <button
            type="button"
            disabled={fase.tipo === "a-gravar"}
            onClick={() => void marcar("perdido")}
            className={`alvo-toque inline-flex items-center gap-1 px-2.5 text-[var(--bo-text-muted)] hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-text)] disabled:opacity-50 ${ESTADO} ${PRESSAO}`}
          >
            <span aria-hidden="true">✕</span>
            {fase.tipo === "a-gravar" ? "A marcar…" : "Perdido"}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`text-[var(--bo-text-muted)] ${compacto ? "text-[11px]" : "text-sm"} mr-1`}
          >
            Já responderam?
          </span>
          <button
            type="button"
            disabled={fase.tipo === "a-gravar"}
            onClick={() => {
              setAviso(null);
              setFase({ tipo: "quanto" });
            }}
            className={`${botao} border-sage-600 bg-sage-600 text-white hover:bg-[var(--bo-accent-hover)] ${ESTADO} ${PRESSAO}`}
          >
            Ganho
          </button>
          <button
            type="button"
            disabled={fase.tipo === "a-gravar"}
            onClick={() => void marcar("perdido")}
            className={`${botao} border-[var(--bo-hairline-strong)] text-[var(--bo-text-muted)] hover:border-foreground/35 hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
          >
            Perdido
          </button>
        </div>
      )}

      {/* ── O QUE CORREU MAL NASCE COLADO AO CAMPO ─────────────────────────
          O aviso é quase sempre sobre o valor combinado — um número que não se
          percebe — e aparece debaixo da linha onde ela o escreveu. Aparecia num
          fotograma.

          `.bo-entrada`, os mesmos 240 ms e QUATRO píxeis do recibo aqui em
          cima: a distância de um rótulo, porque é do campo que ele vem.

          E note-se onde ESTÁ, que é o que o `momentos-que-nao-saltam.test.ts`
          prende: aqui fora, irmão dos dois ramos. O painel do valor combinado
          continua SEM entrada nenhuma — tem `autoFocus`, e animá-lo arrastava o
          campo debaixo do cursor que já lá está. Uma entrada no aviso não é uma
          entrada no painel: o aviso monta sozinho, depois de o campo estar
          parado e focado, e nunca mexe no que está por cima dele. */}
      {aviso && (
        <p
          role="alert"
          className="bo-entrada mt-2 text-[var(--bo-perigo)] text-[11px] leading-snug"
        >
          {aviso}
        </p>
      )}
    </div>
  );
}
