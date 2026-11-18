"use client";

import { Ajuda } from "../../../ui";
import { LinhaDoOrcamento } from "./LinhaDoOrcamento";
import { trazerServicosParaOOrcamento } from "@/lib/orcamento/artigos-de-faturacao";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import { ADD_BTN } from "../../classes";
import { parseMoneyText, type ProposalDoc } from "@/lib/proposal-doc";
import { totaisDasVersoes } from "@/lib/orcamento/versoes-da-proposta";
import { eur } from "@/lib/money";
import { useEstudio } from "../../contexto";

export function LinhasDoOrcamento() {
  const {
    contas: { contagem, escalasDoDoc, linhasDoOrcamento, ordemDoOrcamento, servicosAOrcamentar },
    documento: { doc, setDoc },
    linhas: { addBudgetItem },
    total: { totalInput },
  } = useEstudio();
  return (
    <div className="@container flex flex-col gap-2 mb-3">
      {/* ── OS CABEÇALHOS DAS COLUNAS ────────────────────────────
                      A caixa do fim não tinha nome nenhum: uma quadrícula com a
                      palavra «extra» ao lado, sem cabeçalho e sem uma frase que
                      dissesse o que faz. Palavras dela: «a caixa "extra" não
                      está explicada».

                      As larguras são as MESMAS das dos campos por baixo
                      (`w-32`, `w-28`, `w-16`) — é isso, e só isso, que faz um
                      cabeçalho apontar para a coluna certa. O campo do preço
                      unitário passou para a segunda linha de cada item, ao pé
                      da fórmula a que pertence: enquanto esteve no meio da
                      linha, aparecia só nas linhas que escalam e empurrava as
                      colunas dessas para fora do cabeçalho.

                      ── E PORQUE É QUE O LIMIAR É 36 REM DE CARTÃO ──────────
                      Era `sm:flex` — 640 de JANELA —, e a fila por baixo quebra
                      por CAIXA. Num portátil a 1024 a coluna de conteúdo tem
                      504 px e a fila já vai em duas linhas, mas o cabeçalho
                      continuava a nomear quatro colunas por cima delas: que é
                      literalmente a razão escrita duzentas linhas abaixo para o
                      esconder no telemóvel.

                      A conta da fila: o nome não desce dos `min-w-[12rem]`
                      (192), a escala leva `w-32` (128), o preço `w-28` (112), o
                      «Extra» `w-16` (64), o × `w-5` (20) e são quatro
                      intervalos de 8 — 548 px para caber tudo numa linha. Daí
                      as 36 rem (576), que é o mesmo limiar e a mesma razão do
                      `GRID` do `PaymentsPanel`. Os três sítios que decidem
                      sobre esta fila — este cabeçalho, a palavra «extra» e o
                      «?» — partilham-no, porque separá-los é como um cabeçalho
                      volta a mentir. */}
      <div className="hidden items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-foreground/25 @min-[36rem]:flex">
        <span className="flex-1">Item</span>
        <span className="w-32 shrink-0">Tipo de preço</span>
        <span className="flex w-28 shrink-0 items-center justify-end gap-1">
          Preço (sem IVA)
          <Ajuda sobre="para que servem os preços por linha">
            Os preços por linha são{" "}
            <strong className="font-semibold text-[var(--bo-text)]">só para ti</strong>: servem para
            somar e para avisar quando o total já não bate certo. O PDF continua a mostrar as linhas
            sem preço e um «{doc.totalLabel || "Valor Total"}» único, como nas tuas propostas.
          </Ajuda>
        </span>
        {/* ── A EXPLICAÇÃO, AO PÉ DO CABEÇALHO E A PEDIDO ──────
                        Eram três linhas sempre visíveis por baixo das linhas do
                        orçamento. Palavras dela: «ocupa três linhas sempre
                        visíveis». Úteis na primeira vez, ruído a partir da
                        segunda — e a ocupar o espaço onde deviam estar as
                        linhas. Agora está onde a pergunta se faz: em cima da
                        coluna, atrás de um «?». */}
        <span className="flex w-16 shrink-0 items-center justify-center gap-1">
          Extra
          {/* Os nós de texto do original: um {" "} à parte não é um espaço dentro do
              texto, e mede-se diferente (1/64 px). Ver scripts/capturas/estudio-ao-pixel.mjs. */}
          {/* prettier-ignore */}
          <Ajuda sobre="o que faz a caixa Extra">
            <strong className="font-semibold text-[var(--bo-text)]">Extra</strong>{" "}
            marca uma linha como opcional: ela sai assinalada no quadro do PDF e, por
            baixo do total, a proposta passa a mostrar também o valor <em>sem</em>{" "}
            essa linha. Uma proposta só, com as duas versões lá dentro — em vez de
            dois documentos a divergir.
          </Ajuda>
        </span>
        <span className="w-5 shrink-0" />
      </div>
      {/* Pela ordem que vai SAIR — ver `ordemDoOrcamento`. O `i`
                      continua a ser o índice do array, que é o que os campos
                      escrevem; só a ordem de desenho muda. */}
      {ordemDoOrcamento.map((i) => {
        const l = linhasDoOrcamento[i];
        const escala = escalasDoDoc[i];
        const semPreco = l.preco === null;
        return <LinhaDoOrcamento key={i} escala={escala} i={i} l={l} semPreco={semPreco} />;
      })}
      {/* OS SERVIÇOS JÁ ESCRITOS, COM O VALOR À FRENTE (5/11).
                      Ela: «serviço tal, valor tal, serviço tal, valor tal». Os
                      serviços estão no passo 2; aqui trazem-se de uma vez, com
                      o artigo do Moloni que o nome sugere, e só falta o valor. */}
      {servicosAOrcamentar.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] px-3 py-2">
          <span className="min-w-0 flex-1 text-xs leading-relaxed text-[var(--bo-tinta-72)]">
            {servicosAOrcamentar.length === 1
              ? `O serviço «${servicosAOrcamentar[0]}» ainda não está no orçamento.`
              : `${servicosAOrcamentar.length} serviços da proposta ainda não estão no orçamento: ${servicosAOrcamentar.map((t) => `«${t}»`).join(", ")}.`}
          </span>
          <button
            type="button"
            onClick={() => setDoc((d) => trazerServicosParaOOrcamento(d))}
            className={`alvo-toque shrink-0 text-xs font-medium text-[var(--bo-accent)] underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
          >
            {servicosAOrcamentar.length === 1 ? "Pôr no orçamento" : "Pôr todos no orçamento"}
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className={`${ADD_BTN} ${ESTADO} ${PRESSAO}`} onClick={addBudgetItem}>
          + Adicionar item
        </button>
        {/* O CONTADOR, no lugar onde estava «Soma das linhas».
                        A soma mudou-se para o bloco de totais (que a mostra
                        pela ordem do PDF); aqui fica a única coisa que este
                        sítio pode responder melhor do que ele — quantas destas
                        caixas estão mesmo preenchidas.

                        ── «0 DE 4 LINHAS COM PREÇO» NÃO É UM AVISO ──────────
                        Palavras dela sobre uma proposta CORRECTA: o contador
                        lia-se como erro. E lia-se bem — «0 de 4» tem a forma
                        de um contador por preencher, mas há propostas em que
                        as linhas NUNCA levam valor: o preço vive no total e as
                        linhas são a lista do que está incluído. É, aliás, o
                        formato das propostas dela há anos.

                        As duas situações distinguem-se por um facto e não por
                        um palpite: nenhuma linha com preço E um total escrito é
                        «o preço está no total»; nenhuma linha com preço e nenhum
                        total é «ainda não comecei», e aí um contador a zero
                        também não diz nada que se aproveite. O contador fica
                        para o caso em que ele responde mesmo a alguma coisa —
                        quando há preços por linha para contar. */}
        {contagem.total > 0 &&
          (contagem.comPreco === 0 && parseMoneyText(totalInput) > 0 ? (
            <span className="text-xs text-[var(--bo-text-muted)]">
              Preço definido no total — as linhas não levam valor
            </span>
          ) : contagem.comPreco > 0 ? (
            <span className="text-xs text-[var(--bo-text-muted)]">{contagem.frase}</span>
          ) : null)}
      </div>
      {/* ── UMAS COM PREÇO, OUTRAS SEM: A SOMA ESTÁ INCOMPLETA ──
                      É o caso que mente sem parecer. Nenhuma linha com preço é
                      «ainda não orçamentei» e não soma nada; TODAS com preço é
                      uma soma verdadeira. O meio dá um número plausível que
                      está errado por baixo — e é a partir dele que o aviso de
                      desalinhamento e o botão que arruma o total falam. */}
      {contagem.incompleta && (
        <p className="flex items-start gap-1.5 rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]">
          <span aria-hidden="true">⚠</span>
          <span>
            {contagem.semPreco === 1
              ? "1 linha ainda não tem preço"
              : `${contagem.semPreco} linhas ainda não têm preço`}
            , por isso a soma dos serviços está incompleta — o que aparece nos totais conta só as{" "}
            {contagem.comPreco} que têm.
          </span>
        </p>
      )}

      {/* ── AS DUAS VERSÕES, SEM SEREM DUAS PROPOSTAS ──────────
                      Assim que uma linha é marcada como extra, esta proposta
                      passa a responder ao "e sem isso, quanto fica?" — e o PDF
                      leva os dois números. É de propósito que só o total com
                      extras é escrito à mão: o outro é a subtracção, e dois
                      números escritos podiam discordar no dia em que ela
                      corrigisse só um. */}
      {(() => {
        // Sem segundo argumento: a base sai do próprio documento, e é a
        // mesma leitura que o PDF faz. Passar `totalAmount` cru dava a
        // base em «acrescer» e o BRUTO em «IVA incluído» — o ecrã e o
        // documento a discordarem sobre o mesmo casamento.
        const v = totaisDasVersoes(doc as ProposalDoc);
        if (!v) return null;
        return (
          <div className="mt-1 rounded-xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] px-3 py-2.5">
            {/* O IMPACTO, na frase que ela pediu: quantos estão
                            marcados, e quanto vale a proposta com eles. */}
            <p className="text-xs leading-relaxed text-[var(--bo-tinta-72)]">
              {`${v.linhasExtra} ${v.linhasExtra === 1 ? "item marcado" : "itens marcados"} como extra · versão com extras: `}
              <strong className="font-semibold text-[var(--bo-text)]">
                {eur(v.comoOTotal.comExtras)}
              </strong>
              {" · versão base: "}
              <strong className="font-semibold text-[var(--bo-text)]">
                {eur(v.comoOTotal.base)}
              </strong>
            </p>
            {v.extrasSemPreco > 0 && (
              <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--bo-aviso)]">
                {v.extrasSemPreco === 1
                  ? "Um dos extras não tem preço, por isso não desce da versão base — e enquanto assim for o PDF não mostra o segundo valor."
                  : `${v.extrasSemPreco} extras não têm preço, por isso não descem da versão base — e enquanto assim for o PDF não mostra o segundo valor.`}
              </p>
            )}
          </div>
        );
      })()}
    </div>
  );
}
