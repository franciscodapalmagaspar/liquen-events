"use client";

import { Section } from "../../formulario/Section";
import { AvisoDeOrdem } from "../../formulario/AvisoDeOrdem";
import { LinhasDoOrcamento } from "./LinhasDoOrcamento";
import { Field } from "../../../ui";
import { ValoresAdicionais } from "./ValoresAdicionais";
import { OrcamentoDaOrganizacao } from "./OrcamentoDaOrganizacao";
import { ResumoDasLinhas } from "../../orcamento/ResumoDasLinhas";
import { useEstudio } from "../../contexto";

/**
 * Budget
 */
export function SeccaoDoOrcamento() {
  const {
    documento: { doc, patch },
    nota: { notaDaSeccao },
    ordem: { fixarOrdem, ordemSugerida },
    passos: { step },
    pronta: { isDeco },
    saltos: { irParaAFalta },
    total: { money, pctSinal, totais },
    traducoes: { caixaDeIngles },
  } = useEstudio();
  return (
    <Section
      title="Orçamento Proposto"
      id="orcamento"
      escondida={step !== "orcamento"}
      rodape={notaDaSeccao("orcamento", "Nota sobre o orçamento")}
    >
      {isDeco ? (
        <>
          <AvisoDeOrdem
            mostrar={ordemSugerida}
            onde="As linhas do orçamento"
            onFixar={fixarOrdem}
          />
          <LinhasDoOrcamento />
          <div className="grid grid-cols-1 @min-[26rem]:grid-cols-2 gap-4">
            {/* ── «LADO A LADO» É UMA PERGUNTA DE CONTENTOR ───────────
                      Era `xl:` — 1280 de JANELA —, e a janela não sabe nada
                      desta caixa: ela é METADE da coluna de conteúdo, ou seja
                      ~245 px aos 1024 e ~280 aos 1440. Duas colunas de 240 px
                      para um par PT/EN não é «lado a lado», é dois campos
                      apertados um contra o outro.

                      Sem ponto de corte nenhum: cada caixa pede a largura de
                      que precisa (14 rem a portuguesa, as 12 rem que a
                      `CaixaInglesa` já pede em `aoLado`) e o `flex-wrap`
                      põe-nas na mesma linha exactamente onde as duas cabem —
                      que é a primeira das respostas que o
                      `Cortes.contrato.test.ts` manda dar quando a pergunta é
                      sobre o contentor. */}
            <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
              <Field
                containerClassName="min-w-0 grow basis-[14rem]"
                label="Nome do total no PDF"
                value={doc.totalLabel ?? ""}
                onChange={(e) => patch({ totalLabel: e.target.value })}
                data-campo="totalLabel"
                placeholder="Valor Total Decoração"
              />
              {/* «Valor Total Decoração» já sai «Decoration Total» por
                        reconhecimento; um rótulo reescrito à mão deixa de ser
                        reconhecido, e é para esse que a caixa existe. */}
              {caixaDeIngles({ tipo: "totalLabel" }, "Nome do total no PDF", {
                className: "bo-input px-2.5 py-2 text-xs text-[var(--bo-tinta-72)]",
                placeholder: "Decoration Total",
              })}
            </div>
          </div>

          <ValoresAdicionais />
        </>
      ) : (
        <OrcamentoDaOrganizacao />
      )}
      {/* ── O RESUMO, COLADO ÀS LINHAS (Fase 2, 10/11) ─────────────
                O que estas linhas dão, logo por baixo delas: ela escreve um
                valor e vê o total a pagar, o sinal e o saldo sem descer ao
                «Total e validade». Só leitura — os números são os MESMOS
                `totais` do bloco «Totais» lá em baixo (a mesma chamada que
                o PDF faz); mudar o sinal continua a ser lá. */}
      {money.gross > 0 && (
        <ResumoDasLinhas
          totais={totais}
          pctSinal={pctSinal}
          onMudar={() => irParaAFalta("total")}
        />
      )}
    </Section>
  );
}
