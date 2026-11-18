"use client";

import { degrauDosAdicionais, type ContextoDoPreco } from "@/lib/preco-do-pedido";
import { eur, round2 } from "@/lib/money";
import { Field } from "../../../ui";
import { normalizarValor } from "@/lib/proposal-budget";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import { textoDoTotal } from "@/lib/orcamento/estudio/textos-do-estudio";
import { CampoDaValidade } from "./CampoDaValidade";
import { useEstudio } from "../../contexto";

export function CamposDoTotal() {
  const {
    camposPorConfirmar: { confirmado, realce },
    confirmacoes: { pedirConfirmacaoDeDinheiro },
    contas: { contagem },
    documento: { doc },
    total: { desvio, duasFormas, erroDoTotal, escrito, money, onTotalInput, totalInput, vatMode },
  } = useEstudio();
  return (
    <div className="grid grid-cols-1 @min-[26rem]:grid-cols-2 gap-4">
      {/**
       * ── «HÁ UM NÚMERO SÓ» ERA MENTIRA, E CUSTOU-LHE UMA TARDE ─────
       *
       * Palavras dela: «sempre que vou à proposta os valores estão
       * diferentes; não estão iguais àquilo que nós colocamos».
       *
       * Estava aqui. Esta frase prometia que este campo e o «Preço
       * final» do pedido eram o mesmo número — e não são, sempre que
       * há adicionais a somar. O pedido guarda o que o casal PAGA
       * (serviços + deslocação); este campo é só os SERVIÇOS, porque a
       * deslocação tem linha própria logo abaixo e somá-la aqui era
       * contá-la duas vezes na mesma folha.
       *
       * Ela escrevia 3.000 na Gestão do pedido e o estúdio mostrava
       * 2.860. Escrevia 3.000 aqui e a Gestão mostrava 3.140. Os dois
       * números estavam certos; o ecrã é que jurava que eram um só.
       *
       * A aritmética não muda — mudaria o significado de um campo de
       * dinheiro de que saem o sinal, a factura e o PDF. O que muda é
       * o ecrã passar a dizer a verdade, com os DOIS números à vista
       * para ela poder conferir num relance.
       */}
      {(() => {
        const degrau = degrauDosAdicionais(doc as unknown as ContextoDoPreco);
        if (!(degrau > 0)) {
          return (
            <p className="text-xs leading-relaxed text-foreground/50 @min-[26rem]:col-span-2">
              É o mesmo valor do <strong className="font-semibold">Preço final</strong> do pedido —
              escrever aqui altera-o lá, e alterá-lo lá aparece aqui. Há um número só.
            </p>
          );
        }
        // `money.base` já traz os adicionais somados (ver
        // `dinheiroDaProposta`) — é o EFECTIVO, o que o pedido guarda.
        // A parte dos serviços é a do resolvedor cru. Escrever aqui
        // `money.base` somava a deslocação uma segunda vez e a nota
        // dizia 3140 + 140 = 3280 a alguém que tem 3000 de serviços.
        const efectivo = money.base;
        const servicos = round2(efectivo - degrau);
        return (
          <p className="text-xs leading-relaxed text-[var(--bo-text-muted)] @min-[26rem]:col-span-2">
            Este campo é <strong className="font-semibold">só os serviços</strong>. O{" "}
            <strong className="font-semibold">Preço final</strong> do pedido mostra outro número,
            porque leva também os adicionais:{" "}
            <strong className="font-semibold tabular-nums">{eur(servicos)}</strong> +{" "}
            <span className="tabular-nums">{eur(degrau)}</span> de adicionais ={" "}
            <strong className="font-semibold tabular-nums">{eur(efectivo)}</strong>. Escrever aqui
            altera-o lá, e alterá-lo lá aparece aqui — mas os dois ecrãs mostram números diferentes,
            e é assim de propósito.
          </p>
        );
      })()}
      <Field
        // Sempre a base: é o que o pedido guarda, e é o que o rótulo
        // "(sem IVA)" da Gestão do pedido promete. O modo de IVA muda o
        // que o cliente vê, não o significado deste campo.
        label="Valor (sem IVA)"
        inputMode="decimal"
        value={totalInput}
        // Com serviços com preço, o total é a SOMA deles (e dos
        // adicionais) e não se escreve à mão — ver `somarOTotal`.
        // Só fica aberto numa proposta antiga desalinhada, onde o
        // «Usar …» aqui em baixo é o gesto que o arruma.
        readOnly={contagem.comPreco > 0 && !desvio}
        onChange={(e) => {
          confirmado("totalAmount");
          onTotalInput(e.target.value);
        }}
        placeholder="3000"
        data-campo="totalAmount"
        containerClassName={realce("totalAmount")}
        error={erroDoTotal ?? undefined}
        hint={
          desvio
            ? `Escrito à mão — a soma dos serviços com preço é ${eur(desvio.soma)}`
            : contagem.comPreco > 0
              ? !(doc.budgetExtras ?? []).some((e) => normalizarValor(e.valueText) !== null)
                ? "Soma automática dos serviços."
                : doc.budgetExtrasSomam
                  ? "Soma automática dos serviços. Os valores adicionais somam-se por cima."
                  : "Soma automática dos serviços e dos valores adicionais."
              : undefined
        }
      />
      {/* O aviso e o atalho para o corrigir andam juntos: dizer que está
                errado sem dar o gesto que o arruma é meio trabalho. */}
      {desvio && (
        <div className="@min-[26rem]:col-span-2 -mt-1 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2">
          <span className="text-xs text-[var(--bo-tinta-72)]">
            O total está escrito à mão e difere da soma das linhas em{" "}
            <strong className="font-semibold">{eur(Math.abs(desvio.diferenca))}</strong>.
          </span>
          {/**
           * O BOTÃO ESCREVE A SOMA COM OS ADICIONAIS, e não a soma das
           * linhas que está escrita ao lado.
           *
           * O campo onde ele escreve é o TOTAL, e o total desta casa
           * inclui os valores adicionais — é o que o `definirExtras`
           * faz quando se acrescenta uma deslocação, e é o que o PDF
           * confirma ao subtrai-los para imprimir a linha «Valor
           * Total». Escrever aqui a soma dos serviços apagava a
           * deslocação do preço final e, com ela, do sinal e da
           * factura que sai a seguir.
           *
           * E por isso o rótulo mostra o número que vai mesmo ser
           * escrito: um botão que diz 75 € e escreve 2460 € é pior do
           * que não haver botão nenhum.
           *
           * ── E PERGUNTA ANTES DE ESCREVER ─────────────────────────
           * Palavras dela: «é um botão perigoso». Escrevia o número
           * novo por cima do preço final — o valor de que saem a
           * fatura, o sinal e o saldo — sem mostrar o que ia
           * desaparecer. A pergunta traz OS DOIS, e depois de aplicada
           * ficam dez segundos para a anular. Ver
           * `pedirConfirmacaoDeDinheiro`.
           */}
          <button
            type="button"
            className={`alvo-toque -my-1 py-2 text-xs font-medium text-sage-600 underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
            onClick={() =>
              pedirConfirmacaoDeDinheiro({
                oQue: "o total",
                de: escrito.base,
                para: desvio.sugerido,
                registo: `Total alinhado com a soma das linhas no estúdio: preço final de ${eur(escrito.base)} para ${eur(desvio.sugerido)}.`,
                motivo: "Total alinhado com a soma das linhas.",
                aplicar: () => {
                  confirmado("totalAmount");
                  onTotalInput(textoDoTotal(desvio.sugerido));
                },
              })
            }
          >
            Usar {eur(desvio.sugerido)}
          </button>
        </div>
      )}
      {/* ══════════════════════════════════════════════════════════════
                  SÓ HÁ UMA MANEIRA DE CONTAR O IVA: ACRESCE
                  ══════════════════════════════════════════════════════════════

                  Palavras dela: «retira com o IVA incluído. É apenas com o
                  valor sem IVA mais o IVA acresce».

                  Eram duas opções lado a lado, para escolher. A escolha não
                  valia nada — as propostas da casa são todas «valor sem IVA +
                  IVA» — e custava o pior engano que este ecrã pode ter: um
                  toque distraído no cartão errado mudava o que o casal paga
                  SEM mudar o número que ela está a olhar.

                  ── O QUE ISTO NÃO MUDA, E É O QUE INTERESSA ────────────────
                  O campo «Valor (sem IVA)» já mostrava a BASE nos dois modos
                  (`baseDoDoc` → `resolveProposalMoney`). Medido: um documento
                  em «IVA incluído» com 3280 guardado mostra base 2666,67, IVA
                  613,33 e 3280,00 a pagar — exactamente o mesmo que o mesmo
                  documento em «acresce» com base 2666,67. Tirar a opção não
                  mexe em número nenhum: nem no campo, nem no IVA, nem no que o
                  cliente paga, nem nas propostas que já seguiram.

                  Fica a LEITURA, que continua a valer — é onde ela confere que
                  o IVA e o total a pagar são os que espera. O que saiu foi o
                  controlo, não a informação. */}
      <div className="@container flex flex-col gap-1.5">
        <span className="bo-eyebrow">IVA</span>
        <div className="rounded-xl border border-[var(--bo-hairline-strong)] px-3 py-2.5 text-[11px]">
          {/* A leitura é do modo DESTE documento, não do que a casa faz
                      hoje. Uma proposta antiga gravada em «IVA incluído» tem o
                      bruto no `totalAmount`; mostrar-lhe a leitura de «acresce»
                      dizia base 3280 e IVA 754,40 sobre um documento que vale
                      2666,67 e 613,33. Um quadro que mente sobre o dinheiro é
                      pior do que um quadro a menos. */}
          <span className="block font-medium text-[var(--bo-tinta-72)]">
            {vatMode === "acrescer" ? "+ IVA (acresce)" : "IVA incluído"}
          </span>
          {money.base > 0 && (
            <>
              <span className="mt-0.5 block text-[var(--bo-text-muted)]">
                base {eur(duasFormas[vatMode].base)} · IVA {eur(duasFormas[vatMode].iva)}
              </span>
              <span className="block text-[var(--bo-text-muted)]">
                o cliente paga{" "}
                <strong className="font-semibold text-[var(--bo-text)]">
                  {eur(duasFormas[vatMode].total)}
                </strong>
              </span>
            </>
          )}
        </div>
        <p className="text-xs leading-relaxed text-foreground/45">
          {vatMode === "acrescer" ? (
            "O valor acima é sempre sem IVA, e o PDF mostra-o com o IVA a somar por cima."
          ) : (
            /* E não se converte por ela: mudar o modo muda o TEXTO que
                       sai no PDF («3.280,00 €» passa a «2.666,67 € + IVA»).
                       Numa proposta que já seguiu, isso é o documento do casal
                       a deixar de bater certo com o que ele tem em mãos. */
            <>
              Esta proposta foi escrita com o IVA já dentro do valor. As novas são todas «sem IVA +
              IVA acresce»; esta fica como seguiu, para o documento continuar igual ao que o cliente
              tem.
            </>
          )}
        </p>
      </div>
      <CampoDaValidade />
    </div>
  );
}
