"use client";

import { camposPorRever } from "@/lib/proposal-doc-bilingue";
import { type ProposalDoc } from "@/lib/proposal-doc";
import { EmCurso } from "../../../ui";
import { esperaDaTraducao } from "@/lib/orcamento/estudio/esperas";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import { useEstudio } from "../../contexto";

/**
 * ══════════════════════════════════════════════════════════════════
 * TRADUZIR PARA INGLÊS — O BOTÃO, E O MOTOR QUE AINDA NÃO EXISTE
 * ══════════════════════════════════════════════════════════════════
 *
 * Decisão dela: «nós fazemos as propostas em português, e depois o
 * próprio sistema faz uma tradução para inglês». As caixas «EN»
 * deixam de ser trabalho obrigatório e passam a ser REVISÃO: ela
 * corrige a que quiser, ou não lê nenhuma.
 *
 * O motor não existe — não há serviço de tradução escolhido nem
 * chave nenhuma no projecto. A fronteira onde ele vai entrar está
 * escrita (`proposal-traducao.ts`), e enquanto o motor não existir
 * este botão DIZ-O e não faz nada.
 *
 * Um botão que fingisse traduzir — com um dicionário de palavras,
 * por exemplo — mandava-a enviar uma proposta a acreditar que estava
 * traduzida. É o único desfecho pior do que não haver botão nenhum:
 * uma frase portuguesa numa proposta inglesa vê-se; inglês falso não.
 *
 * Só aparece com o bilingue ligado: é onde as caixas que ele
 * preenche estão à vista.
 */
export function TraduzirTudo() {
  const {
    documento: { doc },
    traducoes: { aTraduzir, bilingue, traducao, traducaoLigada, traduzirTudo },
  } = useEstudio();
  return (
    <>
      {bilingue && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {/* ── ENQUANTO A TRADUÇÃO VEM A CAMINHO ─────────────────────
                  O botão dizia «A traduzir…» e mais nada, durante uma ida à
                  rede que numa proposta cheia são vários segundos — e a única
                  coisa que aparecia a seguir era um toast. A caixa fica no
                  lugar do botão, que é onde o estado já vivia. Quantos campos
                  vão é do que o código sabe, e por isso é dito; quantos já
                  voltaram, não — ver `esperaDaTraducao`. */}
          {aTraduzir ? (
            (() => {
              // Os mesmos campos que o `traduzirParaIngles` vai buscar: os
              // vazios e os que ficaram para trás do português.
              const campos = camposPorRever(doc as ProposalDoc).length;
              return (
                <EmCurso
                  className="max-w-xs"
                  titulo="A traduzir para inglês…"
                  estimadoMs={esperaDaTraducao(campos)}
                  nota={
                    campos === 1
                      ? "Vai 1 campo ao serviço de tradução. O que já escreveste fica como está."
                      : `Vão ${campos} campos ao serviço de tradução. O que já escreveste fica como está.`
                  }
                  notaDemorada="O serviço está a demorar. As caixas «EN» preenchem-se assim que a resposta chegar."
                />
              );
            })()
          ) : (
            <button
              type="button"
              disabled={!traducaoLigada}
              onClick={() => void traduzirTudo()}
              className={`alvo-toque inline-flex items-center gap-2 rounded-lg border border-[var(--bo-hairline-strong)] px-3 py-1.5 text-xs font-medium text-[var(--bo-tinta-72)] hover:border-foreground/30 hover:text-[var(--bo-text)] disabled:cursor-not-allowed disabled:opacity-40 ${ESTADO} ${PRESSAO}`}
            >
              <span aria-hidden="true">⇄</span>
              Traduzir para inglês
            </button>
          )}
          {/* ── AS TRÊS FRASES, E PORQUE É QUE NÃO SÃO DUAS ─────────────
                  O botão fica desligado nos dois casos maus, e isso está certo.
                  A frase é que não pode ser a mesma: «ainda não está ligada
                  neste servidor» é uma afirmação sobre a CONFIGURAÇÃO, e quem a
                  lê ou vai pôr a chave ou desiste e escreve as caixas à mão.
                  Dita sobre uma sessão caducada ou uma rede que caiu, manda-a
                  resolver um problema que não existe enquanto o verdadeiro se
                  cura recarregando a página. */}
          {traducao === "ligada" ? (
            <p className="text-[11px] leading-snug text-foreground/50">
              Preenche as caixas «EN» que ainda estão vazias. O que já escreveste fica como está — e
              vale a pena passar os olhos pelo que sair.
            </p>
          ) : traducao === "desligada" ? (
            <p className="text-[11px] leading-snug text-foreground/50">
              A tradução automática ainda não está ligada neste servidor. Até lá, as caixas «EN»
              escrevem-se à mão, e o que ficar em branco sai em português.
            </p>
          ) : (
            <p className="text-[11px] leading-snug text-foreground/50">
              Não deu para saber se a tradução automática está ligada — o servidor não respondeu.
              Recarrega a página; se continuar assim, entretanto as caixas «EN» escrevem-se à mão e
              o que ficar em branco sai em português.
            </p>
          )}
        </div>
      )}
    </>
  );
}
