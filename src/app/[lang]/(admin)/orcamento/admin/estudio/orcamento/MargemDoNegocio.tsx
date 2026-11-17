"use client";

import { useMemo } from "react";
import { margemTotal } from "@/lib/orcamento/margem";
import { useDefinicoesDaProposta } from "../../definicoes-da-proposta";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { eur } from "@/lib/money";

/** Resumo em página: a "forma" da proposta (capa, serviços, total sem IVA/IVA/
 *  com IVA, sinal/saldo) sem ter de descarregar o PDF. */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO VAI DEMORAR, E SE O EMAIL AGUENTA O ANEXO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «tempo estimado de geração do PDF, calculado a partir do
 * número de fotos e de gerações anteriores» e «aviso se o PDF ultrapassar o
 * limite de anexo de email (8 MB)».
 *
 * Sem número nenhum, dez segundos e sessenta são a mesma coisa — uma barra a
 * rodar — e não há como distinguir «está a demorar» de «isto encravou». Com
 * número, ela decide se espera.
 *
 * O aviso do anexo é o mais valioso dos dois, porque a alternativa é descobrir
 * pelo casal: o servidor de email do cliente recusa a mensagem, e do lado dela
 * o envio parece ter corrido bem. A sugestão é a que resolve mesmo — menos
 * fotografias nas páginas mais pesadas — e diz-se também o que NÃO se perde: o
 * link da proposta serve na mesma, com o PDF inteiro do outro lado.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * SÓ PARA SI — QUANTO É QUE ISTO DEIXA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Falta o número que permite decidir com noção» — dentro do
 * bloco dos totais.
 *
 * A margem já era calculada: os custos escrevem-se por linha no painel interno,
 * e ele mostra a conta. O que faltava era ela estar ONDE A DECISÃO SE TOMA. O
 * bloco dos totais é o ecrã que se olha ao decidir se se baixa o preço, e era o
 * único sítio onde o número que responde a isso não estava.
 *
 * ── PARCIAL DIZ-SE PARCIAL ────────────────────────────────────────────────
 * Com custos em três linhas de dez, a conta é sobre essas três — e é declarada
 * como tal. Uma margem calculada sobre metade dos custos, apresentada como «a
 * margem», seria uma mentira sempre optimista, e das que só se descobrem no
 * fim do ano.
 *
 * ── E NUNCA SAI DAQUI ─────────────────────────────────────────────────────
 * Os custos vivem em `budgetCosts`, que o desenhador do PDF não lê — com um
 * teste em `proposal-doc-pdf.test.ts` a comparar as instruções de desenho com e
 * sem custos para garantir que continua assim.
 */
export function MargemDoNegocio({ doc }: { doc: ProposalDoc }) {
  const limite = useDefinicoesDaProposta().margemMinima;
  const total = useMemo(() => margemTotal(doc), [doc]);
  // Sem uma única linha com preço E custo não há nada a dizer — e dizer «sem
  // margem» seria dizer que é zero, que é outra coisa.
  if (!total) return null;
  const magra = total.percentagem < limite;

  return (
    <div className="mt-3 border-t border-[var(--bo-hairline)] pt-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="bo-eyebrow">Só para si</span>
        <span className="text-xs text-[var(--bo-tinta-72)]">
          Margem{" "}
          <strong
            className={`font-semibold ${magra ? "text-[var(--bo-perigo)]" : "text-sage-600"}`}
          >
            {eur(total.margem)} · {Math.round(total.percentagem)}%
          </strong>
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-foreground/45">
        {total.parcial
          ? `Sobre as ${total.linhasComCusto} de ${total.linhasTotais} linhas que já têm custo (${eur(total.custo)} de custos em ${eur(total.precoComparavel)} cobrados).`
          : `${eur(total.custo)} de custos em ${eur(total.precoComparavel)} cobrados.`}{" "}
        Não sai no PDF nem em nada que vá para o cliente.
      </p>
      {magra && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2 text-[11px] leading-relaxed text-[var(--bo-tinta-72)]">
          <span aria-hidden="true">⚠</span>
          <span>
            Abaixo dos {limite}% que definiu
            {total.parcial ? " — e ainda faltam custos, portanto pode ser menos" : ""}. Não impede
            nada; é para se saber antes de enviar.
          </span>
        </p>
      )}
    </div>
  );
}
