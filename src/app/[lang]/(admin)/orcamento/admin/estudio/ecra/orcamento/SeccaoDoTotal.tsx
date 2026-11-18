"use client";

import { Section } from "../../formulario/Section";
import { CamposDoTotal } from "./CamposDoTotal";
import { hojeNoEstudio } from "@/lib/fuso";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import { DEFAULT_CONDICOES_GERAIS, diasDeValidade, withProposalDefaults } from "@/lib/proposal-doc";
import { TotaisDaProposta } from "./TotaisDaProposta";
import { useEstudio } from "../../contexto";

/**
 * Total, IVA e validade — fonte de verdade do dinheiro. O valor + o modo
 * de IVA eliminam a ambiguidade "3.000,00 €" (com IVA?) vs "+ IVA"; o
 * texto do PDF é composto a partir daqui.
 */
export function SeccaoDoTotal() {
  const {
    documento: { doc, patch },
    nota: { notaDaSeccao },
    passos: { step },
  } = useEstudio();
  return (
    <Section
      title="Total e validade"
      id="total"
      escondida={step !== "orcamento"}
      rodape={notaDaSeccao("total", "Nota sobre o total")}
    >
      <CamposDoTotal />
      {/* ── A VALIDADE QUE JÁ PASSOU (B1) ─────────────────────────────
                Uma proposta que já seguiu traz a data de validade FIXADA lá
                dentro — é o que faz o anexo do email e o PDF do link dizerem o
                mesmo. Reaberta para reenviar depois dessa data, sairia com uma
                validade que terminou, e é isso que trava o envio. O remédio é
                um gesto: voltar a contar os dias a partir de hoje. */}
      {doc.validUntil && doc.validUntil < hojeNoEstudio() && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-[var(--bo-perigo)]/35 bg-[var(--bo-perigo)]/[0.06] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]">
          <span>
            A validade desta proposta terminou a {doc.validUntil.split("-").reverse().join("/")}.
          </span>
          <button
            type="button"
            className={`alvo-toque relative font-medium text-sage-600 underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
            onClick={() => patch({ validUntil: undefined })}
          >
            Contar {diasDeValidade(doc, hojeNoEstudio())} dias a partir de hoje
          </button>
        </p>
      )}
      {/* ── AS CONDIÇÕES QUE NÃO SAEM (B1) ────────────────────────────
                Não há editor das Condições Gerais no estúdio: são os textos da
                casa, contratuais, e não se escrevem proposta a proposta. Se um
                rascunho as perdeu, a página não sai no PDF — e o remédio é
                repô-las tal como a casa as tem, sem tocar numa palavra. */}
      {!withProposalDefaults(doc).condicoesGerais.some((l) => l.trim()) && (
        <p
          className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-[var(--bo-perigo)]/35 bg-[var(--bo-perigo)]/[0.06] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]"
          data-campo="condicoesGerais"
          tabIndex={-1}
        >
          <span>As Condições Gerais estão vazias e a página não sai no PDF.</span>
          <button
            type="button"
            className={`alvo-toque relative font-medium text-sage-600 underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
            onClick={() => patch({ condicoesGerais: [...DEFAULT_CONDICOES_GERAIS] })}
          >
            Repor as Condições Gerais da casa
          </button>
        </p>
      )}
      <TotaisDaProposta />
    </Section>
  );
}
