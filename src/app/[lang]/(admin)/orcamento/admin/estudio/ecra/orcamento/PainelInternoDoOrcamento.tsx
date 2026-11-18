"use client";

import PainelInterno from "../../../PainelInterno";
import { parseMoneyText, type ProposalDoc } from "@/lib/proposal-doc";
import { custosDe } from "@/lib/orcamento/margem";
import { somaDosExtrasSemIva } from "@/lib/proposal-budget";
import { eur } from "@/lib/money";
import { RepartoPorArtigo } from "../../../RepartoPorArtigo";
import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import { useEstudio } from "../../contexto";

/**
 * ── O painel que o cliente nunca vê ────────────────────────────
 * Custos, margem, deslocação calculada e o aviso de valor fora do
 * habitual. Vive AQUI, no fim do orçamento, porque é aqui que os
 * números que ele comenta acabam de ser escritos.
 */
export function PainelInternoDoOrcamento() {
  const {
    adicionais: { definirExtras },
    confirmacoes: { pedirConfirmacaoDeDinheiro },
    documento: { doc, setDoc },
    passos: { step },
    pedido: { quote, quotes },
    pronta: { isDeco },
    total: { money, pctSinal, totalInput, vatMode },
  } = useEstudio();
  return (
    <div hidden={step !== "orcamento"}>
      <PainelInterno
        doc={doc as ProposalDoc}
        quote={quote}
        quotes={quotes}
        totalBruto={money.gross}
        onCusto={(i, custo) =>
          setDoc((d) => ({
            ...d,
            // O array dos custos acompanha sempre o das linhas — se ficasse
            // mais curto, o índice 3 passava a ser o custo da linha 4.
            budgetCosts: custosDe(d as ProposalDoc).map((v, j) => (j === i ? custo : v)),
          }))
        }
        /**
         * Os quilómetros até ao local ficam no DOCUMENTO, não num estado
         * do ecrã: é isso que os torna o número desta proposta e que
         * impede que mudar a sede ou o preço do gasóleo lhes toque depois.
         *
         * `null` apaga o campo — «não decidi», e a tabela volta a sugerir.
         * Escrever 0 aqui seria dizer «é em casa», que é outra coisa.
         */
        onKm={(km) =>
          setDoc((d) => {
            if (km === null) {
              const { kmDeslocacao: _fora, ...resto } = d;
              void _fora;
              return resto;
            }
            return { ...d, kmDeslocacao: km };
          })
        }
        /**
         * Quantas carrinhas vão — mesma casa e mesma razão que os
         * quilómetros: é um facto DESTE evento, e fica congelado nele.
         *
         * `null` APAGA o campo, e apagado quer dizer uma. Escrever 1 aqui
         * daria o mesmo preço, mas deixava no documento um número que
         * ninguém decidiu — e nas propostas antigas a ausência é o que
         * garante que nenhuma muda de preço por este campo existir.
         */
        onCarrinhas={(n) =>
          setDoc((d) => {
            if (n === null) {
              const { carrinhasDeslocacao: _fora, ...resto } = d;
              void _fora;
              return resto;
            }
            return { ...d, carrinhasDeslocacao: n };
          })
        }
        onDeslocacao={(label, valueText) => {
          // Se já lá está uma linha de deslocação, actualiza-se essa em
          // vez de acrescentar uma segunda — duas linhas de deslocação
          // numa proposta são uma pergunta do cliente ao telefone.
          //
          // Passa por `definirExtras` como todas as outras: aceitar a
          // deslocação calculada tem de somar ao total, ou volta a haver
          // um valor na proposta que não está no que se cobra.
          const extras = [...(doc.budgetExtras ?? [])];
          const i = extras.findIndex((e) => /desloca/i.test(e.label ?? ""));
          if (i >= 0) extras[i] = { ...extras[i], label, valueText };
          else extras.push({ label, valueText });
          /**
           * ── E PERGUNTA-SE, COM OS DOIS NÚMEROS À VISTA ────────────────
           * «Pôr nos valores adicionais» é a segunda acção do editor que
           * muda o preço final de uma só carregada: a deslocação calculada
           * SOMA-SE ao total, e portanto ao sinal e à fatura. Levava
           * nenhuma pergunta e nenhuma volta atrás — o mesmo desenho do
           * «Usar X €», e por isso o mesmo tratamento.
           */
          const contexto = { mode: vatMode, vatRate: doc.vatRate };
          const antes = parseMoneyText(totalInput);
          const depois = Math.max(
            0,
            Math.round(
              (antes +
                somaDosExtrasSemIva(extras, contexto) -
                somaDosExtrasSemIva(doc.budgetExtras ?? [], contexto)) *
                100,
            ) / 100,
          );
          // Sem diferença nenhuma no dinheiro (a mesma deslocação outra
          // vez) não há nada a confirmar: aplica-se e cala-se.
          if (Math.abs(depois - antes) <= 0.01) {
            definirExtras(extras);
            return;
          }
          pedirConfirmacaoDeDinheiro({
            oQue: "o total",
            de: antes,
            para: depois,
            registo: `Deslocação calculada (${valueText}) posta nos valores adicionais no estúdio: preço final de ${eur(antes)} para ${eur(depois)}.`,
            motivo: "Deslocação posta nos valores adicionais.",
            aplicar: () => definirExtras(extras),
          });
        }}
      />
      {/* A faturação por artigo é do Moloni e não do cliente: veio para
                  aqui, ao pé dos custos e da margem — tudo o que é só para nós
                  num sítio só, DEPOIS do total (pedido dela de 9/11: «uma grande
                  confusão» — estava a meio do que sai no PDF). */}
      {/* ── REPARTIR POR ARTIGO (5/11) ───────────────────────────
                Ela: «ter estes artigos nas propostas». O total sem IVA
                repartido pelos artigos do Moloni — só para ela e para o
                Moloni: não sai no PDF nem na página, e não mexe na versão
                aceite. Ver `RepartoPorArtigo.tsx`. */}
      {isDeco && (
        <div className="mt-3 rounded-2xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] p-4">
          <span className="bo-eyebrow">Faturação por artigo</span>
          <p className="mt-1.5 mb-3 text-xs leading-relaxed text-foreground/45">
            O sinal e o saldo de cada artigo do Moloni, feitos a partir das linhas. Não aparece na
            proposta do cliente.
          </p>
          <RepartoPorArtigo
            doc={doc as ProposalDoc}
            pct={pctSinal}
            permitirManual={false}
            aoMudar={(reparto) => setDoc((d) => ({ ...d, repartoPorArtigo: reparto }) as StudioDoc)}
          />
        </div>
      )}
    </div>
  );
}
