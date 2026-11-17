"use client";

import { memo, useState } from "react";
import { FUSO_DO_ESTUDIO } from "@/lib/fuso";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import {
  faltaADataDoEvento,
  AVISO_SEM_DATA,
  PORQUE_FALTA_A_DATA,
} from "@/lib/orcamento/data-em-falta";
import { faltaODesfecho } from "@/lib/orcamento/desfecho";
import {
  contextoDeLocal,
  diasDeEspera,
  esperaEmPalavras,
  tomDeEspera,
} from "@/lib/orcamento/espera";
import { pedidoParado } from "@/lib/orcamento/pedidos/espera-na-lista";
import { formatPrice } from "@/lib/orcamento/pricing";
import type { Quote } from "@/lib/orcamento/types";
import PerguntaDeDesfecho from "../PerguntaDeDesfecho";
import { ESTADO, PRESSAO } from "../ui/movimento";
import { diasDesde, eventCountdown } from "../util";
import { statusBadge } from "./pastilha-do-estado";

// One quote card in the pedidos list. Extracted to MODULE scope and wrapped in
// React.memo so that typing in the detail edit panel — which only changes
// AdminClient's editX state — no longer reconciles all ~50 cards on every
// keystroke. All props are stable across a keystroke (the quote object comes
// from the memoised visibleQuotes; isCurrent/isSelected are booleans; todayStr
// is a stable string; onOpen/onToggle are stable callbacks), so memo skips
// re-rendering each row. Saves, selection and filtering still update the list
// because they change these props (via visibleQuotes / the booleans).

export const QuoteCard = memo(function QuoteCard({
  q,
  isCurrent,
  isSelected,
  todayStr,
  userName,
  onOpen,
  onToggle,
  onDesfecho,
  doLoteNovo = false,
}: {
  q: Quote;
  isCurrent: boolean;
  isSelected: boolean;
  todayStr: string;
  /** Quem está a marcar — vai para o histórico do pedido. */
  userName: string;
  onOpen: (q: Quote) => void;
  onToggle: (id: string) => void;
  /** O pedido gravado quando alguém marca aqui o desfecho. */
  onDesfecho: (q: Quote) => void;
  /**
   * Veio no lote que o «Mostrar mais» acabou de acrescentar.
   *
   * Marca, e nada mais: quem anima é o `ENTRADA_DO_LOTE`, pousado no bloco da
   * lista, que a partir daqui alcança o `<li>` inteiro — o da linha, com o fio
   * que a separa da de cima — por `:has()`. Ver a nota da constante.
   */
  doLoteNovo?: boolean;
}) {
  const cat = CATEGORIES.find((c) => c.id === q.category);
  const et =
    q.category && q.eventType
      ? EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType)
      : null;
  // Lead parado: status ativo sem atividade há 14+ dias
  const lastActivity = q.lastUpdated ?? q.submittedAt;
  const daysSince = diasDesde(lastActivity, todayStr);
  const isStale = pedidoParado(q.status, daysSince);
  const espera = diasDeEspera(q);
  const tom = espera === null ? null : tomDeEspera(espera);
  const ctx = contextoDeLocal(q);
  /** Este cartão foi marcado agora, aqui. Ver o comentário lá em baixo. */
  const [marcadoAqui, setMarcadoAqui] = useState(false);
  return (
    /* ── A MOLDURA DO CARTÃO É ESTA CAIXA, E NÃO O BOTÃO LÁ DENTRO ──────────
       Estava no `<button>`: o risco, o fundo branco e a sombra eram dele. Com a
       pergunta «já responderam?» a ter de ficar FORA desse botão (um botão
       dentro de outro é HTML inválido), o gesto ficava a flutuar por baixo do
       cartão, em cima do fundo da página, como se pertencesse ao pedido
       seguinte. A moldura sobe um nível e passa a abraçar os dois. */
    /* 120 ms e não 200: 200 não era degrau nenhum desta casa, e o que aqui
       muda é cor de moldura e de fundo — um ESTADO, ou seja o degrau `micro`.
       E sai o `transition-all`: o `all` põe o browser a considerar `width`,
       `height` e `margin` a cada fotograma, numa lista que pode ter dezenas de
       cartões. O `ESTADO` traz uma lista fechada, e o `motion-safe:` dele faz
       o mesmo trabalho que o `motion-reduce:transition-none` que aqui estava. */
    <div
      data-lote-novo={doLoteNovo ? "" : undefined}
      className={`relative rounded-xl border ${ESTADO} ${
        isCurrent
          ? "border-sage-600/45 bg-sage-600/[0.05] "
          : isSelected
            ? "border-sage-600/30 bg-sage-600/[0.03]"
            : "border-[var(--bo-hairline)] hover:border-[var(--bo-hairline-strong)] bg-[var(--bo-surface)] "
      }`}
    >
      {/* O `<input>` mede 16 px, mas quem se toca é o RÓTULO — o HTML manda o
          toque no rótulo activar o controlo. 24 px chegavam para o rato e não
          para o dedo; `alvo-toque` leva-o a 44 px no telemóvel sem mexer no
          quadrado desenhado, que continua a ser o de 16 px. */}
      <label
        className="alvo-toque absolute left-2 top-3.5 z-10 flex items-center justify-center min-w-[24px] min-h-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(q.id)}
          className="w-4 h-4 accent-sage-600"
          aria-label={`Selecionar pedido de ${q.name}`}
        />
      </label>
      <button
        type="button"
        onClick={() => onOpen(q)}
        className={`w-full text-left p-5 pl-12 rounded-xl ${ESTADO} ${PRESSAO}`}
      >
        {/* ── A HIERARQUIA, E PORQUE É QUE ELA NÃO EXISTIA ─────────────────
            Palavras dela: «o nome do casal tem o mesmo peso visual que o email,
            que a categoria e que a referência». Medido, era mesmo: 14 / 12 / 10
            / 9 px, todos no mesmo cinzento a rondar `/70`. Quatro degraus tão
            juntos que o olho não os separa — e numa lista o que se faz é
            VARRER, não ler.

            A ordem que o cartão passa a dizer, e que é a ordem por que se usa:
            o NOME (o que se procura) · o ESTADO e a ESPERA (o que decide) · o
            contexto (confirma) · a REFERÊNCIA (um detalhe, e só serve depois de
            já se saber qual é). Tamanho, peso e tom, os três a dizer o mesmo —
            um só não chega. */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            {/* Um tamanho só, sem variante `lg:`: este cartão NÃO EXISTE no
                computador. O `TabelaOuCartoes` troca-o pela tabela a partir de
                1024, portanto um `lg:` aqui seria uma regra que nunca chega a
                aplicar-se — e a pior espécie de código morto é a que parece
                cuidada. */}
            <p className="text-[17px] font-semibold text-[var(--bo-text)] leading-snug truncate">
              {q.name}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <p className="text-[13px] bo-text-muted truncate">{q.email}</p>
              {q.assignedTo && (
                <span className="shrink-0 text-[9px] tracking-[0.08em] uppercase px-1.5 py-0.5 rounded bg-sage-600/10 text-sage-600 font-medium whitespace-nowrap">
                  {q.assignedTo}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {statusBadge(q.status)}
            {/* HÁ QUANTO TEMPO ESPERA. A etiqueta "Novo" dizia o mesmo de um
                pedido de ontem e de um de há nove dias — e é o de há nove dias
                que já pediu orçamento a mais alguém. Só aparece para quem ainda
                espera resposta nossa: uma proposta enviada está à espera DELES.
                Cores: cinzento até 2 dias, âmbar de 3 a 6, vermelho a partir
                dos 7. */}
            {espera !== null && (
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-semibold tracking-[0.1em] uppercase ${
                  tom === "urgente"
                    ? "bg-[var(--bo-perigo)]/15 text-[var(--bo-perigo)]"
                    : tom === "aviso"
                      ? "bg-[var(--bo-aviso-tom)]/15 text-[var(--bo-aviso)]"
                      : "bg-[var(--bo-tinta-6)] text-foreground/45"
                }`}
                title={
                  espera <= 0
                    ? "Entrou hoje e ainda não teve resposta"
                    : `Entrou ${esperaEmPalavras(espera)} e ainda não teve resposta`
                }
              >
                {esperaEmPalavras(espera)}
              </span>
            )}
            {isStale && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] tracking-[0.1em] uppercase font-semibold bg-amber-500/10 text-amber-600"
                title={`Sem atividade há ${daysSince} dias`}
              >
                <span className="w-1 h-1 rounded-full bg-current" />
                {daysSince}d parado
              </span>
            )}
            {q.followUpAt &&
              q.followUpAt <= todayStr &&
              q.status !== "aceite" &&
              q.status !== "rejeitado" && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] tracking-[0.1em] uppercase font-semibold ${
                    q.followUpAt < todayStr
                      ? "bg-[var(--bo-perigo)]/15 text-[var(--bo-perigo)]"
                      : "bg-[var(--bo-marca)]/15 text-sage-600"
                  }`}
                  title={q.followUpAt < todayStr ? "Seguimento em atraso" : "Seguimento hoje"}
                >
                  <span className="w-1 h-1 rounded-full bg-current" />
                  Seguir
                </span>
              )}
          </div>
        </div>
        {/* A FILA QUEBRA, e é por isso que o cartão cabe num telemóvel.
            Categoria · tipo · convidados · região · contagem: são cinco factos
            que num iPhone SE pedem 316 px numa caixa de 273 (o `pl-12` do risco
            de estado come 48). Sem `flex-wrap` nada disto encolhe — a fila
            esticava o cartão, o cartão esticava a página, e o que sobrava para
            lá da margem («faltam 16 meses», e a própria barra de baixo) ficava
            CORTADO, porque o `body` tem `overflow-x: clip` e não há como lá
            chegar. `gap-y-1` e não `gap-3` na vertical: a segunda linha é a
            continuação da mesma frase, não outro bloco. */}
        {/* NO TELEMÓVEL SEPARA O ESPAÇO, NÃO O RISCO.
            Os riscos são elementos próprios entre cada facto, e numa fila que
            QUEBRA (é o que esta faz num telemóvel) um deles fica a fechar a
            linha: lia-se «Eventos Particulares | Casamentos |» com um risco
            pendurado no fim, que parece um erro. Não há CSS que esconda só o
            último de cada linha — a linha é decidida na disposição, não na
            folha de estilo.
            Por isso os riscos vivem a partir de `sm`, onde a fila NÃO quebra, e
            no telemóvel separa-se com mais ar (`gap-x-4`), que é o que os
            cartões bem desenhados fazem. */}
        <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-3 gap-y-1 bo-text-muted text-[10px]">
          <span>{cat?.label ?? "—"}</span>
          {et && (
            <>
              <span className="hidden sm:block w-px h-2.5 bg-[var(--bo-tinta-10)]" />
              <span>{et.label}</span>
            </>
          )}
          <span className="hidden sm:block w-px h-2.5 bg-[var(--bo-tinta-10)]" />
          <span>{q.guests} convidados</span>
          {/* ONDE É. A região reconhecida e a distância a Évora dizem, antes
              de abrir seja o que for, se aquele casamento é ali ao lado ou se
              obriga a dormir fora — que muda o preço e a equipa. */}
          {ctx.regiao && (
            <>
              <span className="hidden sm:block w-px h-2.5 bg-[var(--bo-tinta-10)]" />
              <span title={ctx.aproximado ? "Região, não morada" : undefined}>
                {ctx.regiao}
                {ctx.km !== null && ctx.km > 0 && ` · ≈ ${ctx.km} km`}
              </span>
            </>
          )}
          {(() => {
            const cd = eventCountdown(q.date);
            if (!cd || cd.tone === "past") return null;
            return (
              <>
                <span className="hidden sm:block w-px h-2.5 bg-[var(--bo-tinta-10)]" />
                {/* QUANDO É O EVENTO — «a data é o que decide». Era um de
                    cinco factos todos iguais nesta fila; passa a ter peso
                    sempre, e não só quando já está em cima. O vermelho continua
                    reservado ao que urge: o peso diz «isto conta», a cor diz
                    «isto conta AGORA», e as duas coisas não são a mesma. */}
                <span
                  className={
                    cd.tone === "today" || cd.tone === "soon"
                      ? "text-[var(--bo-perigo)] font-semibold"
                      : "text-[var(--bo-text)] font-medium"
                  }
                >
                  {cd.label}
                </span>
              </>
            );
          })()}
        </div>
        {/* PROVÁVEL CASAMENTO À DISTÂNCIA: sem data E sem sítio reconhecível.
            Não é um diagnóstico — é um aviso de que aquele pedido se trabalha
            de outra maneira (fuso horário, visita impossível, tudo por
            escrito). Uma das ausências sozinha não bastava: datas por marcar há
            às dezenas em casamentos de Évora. */}
        {/* F-15: no cartão a data em falta nem «—» tinha — a fila de factos
            simplesmente não a mencionava, e um facto que não aparece lê-se
            como um facto que está bem. */}
        {faltaADataDoEvento(q) && (
          <div className="mt-2.5">
            <span
              className="inline-flex items-center rounded-full bg-[var(--bo-aviso-tom)]/12 px-2 py-0.5 text-[11px] font-medium text-[var(--bo-aviso)]"
              title={PORQUE_FALTA_A_DATA}
            >
              {AVISO_SEM_DATA}
            </span>
          </div>
        )}
        {ctx.destination && (
          <div className="mt-2.5">
            <span
              className="inline-flex items-center rounded-full bg-sage-600/10 px-2 py-0.5 text-[9px] font-medium tracking-wide text-sage-600"
              title="Sem data e sem local concreto — normalmente organiza-se à distância"
            >
              Provável casamento à distância
            </span>
          </div>
        )}
        {q.tags && q.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2.5">
            {q.tags.slice(0, 4).map((t) => (
              <span
                key={t}
                className="px-2 py-0.5 rounded-full bg-sage-600/10 text-sage-600 text-[9px] font-medium tracking-wide"
              >
                {t}
              </span>
            ))}
            {q.tags.length > 4 && (
              <span className="text-foreground/30 text-[9px] px-1">+{q.tags.length - 4}</span>
            )}
          </div>
        )}
        {/* ── A REFERÊNCIA SAIU DAQUI ─────────────────────────────────────
            Estava nesta linha, em `font-mono`, em TODOS os pedidos da lista.
            Perguntei-lhe se precisava dela de relance ou só ao abrir o pedido,
            e a resposta foi «retira a referência».

            Tinha razão, e a defesa que aqui estava escrita dizia-o sem dar por
            isso: «quando SE PRECISA dela é para a ler letra a letra ao
            telefone». Uma coisa que só se usa com o pedido já aberto não tem de
            estar em vinte linhas de lista — está no painel de detalhe, que é
            onde ela está quando precisa de a ler.

            O que fica nesta fila é o que decide: o VALOR e a data. Sem a
            referência à esquerda deixa de haver duas pontas para separar, por
            isso a fila deixa de ser `justify-between` e encosta ao fim, ao pé
            do resto dos números. */}
        <div className="flex items-center justify-end mt-3 pt-3 border-t border-[var(--bo-hairline)]">
          <div className="flex items-center gap-3">
            {q.quotedPrice ? (
              <span className="text-sage-600 text-[13px] font-semibold">
                {formatPrice(q.quotedPrice)}
                {/* Achado n.º 29: este é SEM IVA, e as Propostas mostram o
                    mesmo pedido COM IVA — sem o rótulo, eram dois números
                    diferentes para a mesma coisa. */}
                <span className="ml-1 text-[11px] font-normal text-[var(--bo-text-muted)]">
                  s/ IVA
                </span>
              </span>
            ) : q.priceBreakdown?.total ? (
              <span className="bo-text-muted text-[13px]">
                ≈ {formatPrice(q.priceBreakdown.rangeMin)}–{formatPrice(q.priceBreakdown.rangeMax)}
              </span>
            ) : null}
            <span className="bo-text-faint text-[12px]">
              {new Date(q.submittedAt).toLocaleDateString("pt-PT", {
                // Achado n.º 20: o servidor (UTC) e o browser (Lisboa) escreviam dias
                // diferentes entre a meia-noite e a uma — erro de hidratação.
                timeZone: FUSO_DO_ESTUDIO,
                day: "numeric",
                month: "short",
              })}
            </span>
          </div>
        </div>
      </button>
      {/* ── «JÁ RESPONDERAM?» ───────────────────────────────────────────────
          FORA do botão do cartão, e é obrigatório que assim seja: um <button>
          dentro de outro <button> é HTML inválido, o browser desfaz o aninhamento
          e o que sai é um cartão partido em pedaços com o gesto a abrir o pedido
          em vez de o marcar.

          A moldura só existe quando há pergunta a fazer: um `div` com margem
          desenhado à mesma em todos os cartões punha 16 px de vazio por baixo
          de cada pedido novo da lista.

          O `|| marcadoAqui` é o que impede a moldura de desaparecer NO INSTANTE
          da marcação: assim que o servidor responde, o pedido deixa de ter
          proposta enviada e a condição de cima passa a falsa. Sem a segunda
          metade, o recibo («Marcado como perdido») e o campo do motivo — que é
          opcional e vem DEPOIS — nasciam e morriam no mesmo render. */}
      {(faltaODesfecho(q) || marcadoAqui) && (
        <div className="px-5 pb-4 -mt-2">
          <PerguntaDeDesfecho
            quote={q}
            quem={userName}
            onGravado={(actualizado) => {
              setMarcadoAqui(true);
              onDesfecho(actualizado);
            }}
          />
        </div>
      )}
    </div>
  );
});
