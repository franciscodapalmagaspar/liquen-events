"use client";

import { round2 } from "@/lib/money";
import { contractedAmounts, effectiveVatRate } from "@/lib/orcamento/dossier";
import { formatPrice } from "@/lib/orcamento/pricing";
import { type Quote, type QuoteStatus } from "@/lib/orcamento/types";
import { EscolhaDoEstado } from "../../EscolhaDoEstado";
import { eventCountdown, parseMoney } from "../../util";
import { STATUS_OPTIONS } from "../PastilhaDoEstado";
import { type EdicaoDoPedido } from "../useEdicaoDoPedido";

/** Os campos de trabalho do pedido: estado, preço, data, convidados,
 *  responsável e local. (Saíram da gestão do pedido na fase 7 da estrutura do
 *  código, tal e qual.) */
export interface CamposDoPedidoProps {
  edicao: EdicaoDoPedido;
  selected: Quote;
  ganhoSemProposta: string | null;
  escolherEstado: (novo: QuoteStatus) => void;
}

export function CamposDoPedido({
  edicao,
  selected,
  ganhoSemProposta,
  escolherEstado,
}: CamposDoPedidoProps) {
  const {
    editPrice,
    setEditPrice,
    editStatus,
    editAssigned,
    setEditAssigned,
    editDate,
    setEditDate,
    editGuests,
    setEditGuests,
    editLocation,
    setEditLocation,
    erroDeConvidados,
  } = edicao;
  return (
    <>
      {/* ── CAMPOS EDITÁVEIS ────────────────────────────
          Tudo em grelha, à mão — e cada rótulo LIGADO ao
          seu campo (`htmlFor` ↔ `id`). Eram dez rótulos
          soltos: por cima de um campo, a dizer o que ele
          é, e sem nada que o dissesse ao browser.

          Duas consequências, e a segunda é a que se nota
          todos os dias. Quem usa leitor de ecrã ouvia
          «edit text» sem saber de quê. E tocar no rótulo
          não fazia nada — quando um rótulo ligado põe o
          cursor no campo, o que num telemóvel duplica o
          alvo de cada um destes onze campos sem mexer no
          desenho.

          Havia dois remendos com `aria-label`, e saíram:
          um `aria-label` SUBSTITUI o rótulo visível, o
          que deixa os dois livres para dizerem coisas
          diferentes sem ninguém dar por isso — era o
          caso, «Estado» no ecrã e «Estado do pedido» no
          leitor.

          O campo dos convidados já estava certo, e é o
          modelo: é o único que também liga o erro ao
          campo (`aria-invalid` + `aria-describedby`). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            id="pedido-estado-rotulo"
            htmlFor="pedido-estado"
            className="bo-eyebrow block mb-1.5"
          >
            Estado
          </label>
          <EscolhaDoEstado
            forma="campo"
            id="pedido-estado"
            estados={STATUS_OPTIONS}
            valor={editStatus}
            aoMudar={escolherEstado}
            aria-labelledby="pedido-estado-rotulo"
            aria-describedby={
              ganhoSemProposta === selected.id && editStatus === "aceite"
                ? "pedido-estado-aviso"
                : undefined
            }
            containerClassName="w-full"
            className="bo-input w-full px-3 py-2 text-sm text-[var(--bo-text)]"
          />
          {ganhoSemProposta === selected.id && editStatus === "aceite" && (
            <p
              id="pedido-estado-aviso"
              role="status"
              className="mt-1.5 text-xs leading-relaxed text-[var(--bo-aviso)]"
            >
              Nenhuma proposta deste pedido chegou ao cliente. Marcar como Ganho cria o contrato na
              mesma — se foi aceite de boca, está certo; senão, envia primeiro a proposta.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="pedido-preco" className="bo-eyebrow block mb-1.5">
            Preço final (sem IVA) €
          </label>
          <input
            id="pedido-preco"
            type="text"
            inputMode="decimal"
            value={editPrice}
            onChange={(e) => setEditPrice(e.target.value)}
            placeholder="Ex.: 12500"
            className="bo-input px-3 py-2 text-sm text-[var(--bo-text)] w-full"
          />
          {(() => {
            /**
             * ── A MESMA BASE DOS DOIS LADOS ──────────
             *
             * Isto misturava três coisas na mesma conta:
             * o preço escrito e o `quotedPrice` são
             * LÍQUIDOS, o `priceBreakdown.total` do
             * fallback é BRUTO, e os custos de
             * fornecedor são com IVA (que é dedutível).
             *
             * O resultado era dois números para a mesma
             * pergunta no mesmo ecrã: num pedido de
             * 10.000 € com 5.000 € de custos, aqui dizia
             * «Margem 5.000 €» e o separador Financeiro
             * dizia 5.934,96 €. A regra certa é a que o
             * `EventCosts` já aplica e explica.
             */
            const escrito = parseMoney(editPrice);
            const revenue = escrito != null ? escrito : contractedAmounts(selected).net;
            const taxa = effectiveVatRate(selected);
            const custosComIva = (selected.eventSuppliers ?? []).reduce(
              (s, e) => s + (e.actualCost ?? e.estimatedCost ?? 0),
              0,
            );
            if (!custosComIva) return null;
            const costs = round2(custosComIva / (1 + taxa));
            const margin = round2(revenue - costs);
            return (
              <p className="mt-1 text-[10px] text-foreground/45">
                Custos {formatPrice(costs)} · Margem{" "}
                <span className={margin >= 0 ? "text-sage-600" : "text-[var(--bo-perigo)]"}>
                  {formatPrice(margin)}
                </span>
              </p>
            );
          })()}
        </div>
        <div>
          <label htmlFor="pedido-data" className="bo-eyebrow block mb-1.5">
            Data do evento
          </label>
          <input
            id="pedido-data"
            type="date"
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
            className="bo-input px-3 py-2 text-sm text-[var(--bo-text)] w-full"
          />
          {editDate &&
            (() => {
              const cd = eventCountdown(editDate);
              return cd ? (
                <p
                  className={`mt-1 text-[10px] ${cd.tone === "soon" || cd.tone === "today" ? "text-[var(--bo-perigo)]" : "text-foreground/40"}`}
                >
                  {cd.label}
                </p>
              ) : null;
            })()}
        </div>
        <div>
          <label className="bo-eyebrow block mb-1.5" htmlFor="campo-convidados">
            Convidados
          </label>
          <input
            id="campo-convidados"
            type="number"
            min={0}
            value={editGuests}
            aria-invalid={erroDeConvidados ? true : undefined}
            aria-describedby={erroDeConvidados ? "erro-dos-convidados" : undefined}
            onChange={(e) => setEditGuests(e.target.value)}
            className={`bo-input px-3 py-2 text-sm text-[var(--bo-text)] w-full${
              erroDeConvidados ? " border-[var(--bo-perigo)]" : ""
            }`}
          />
          {/* O `min={0}` do input não trava nada — o
            teclado escreve o que quer. Esta é a frase
            que chega ANTES do clique, e diz o que
            fazer em vez de citar o esquema. */}
          {erroDeConvidados && (
            <p
              id="erro-dos-convidados"
              className="mt-1 text-[10px] leading-relaxed text-[var(--bo-perigo)]"
            >
              {erroDeConvidados}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="pedido-responsavel" className="bo-eyebrow block mb-1.5">
            Responsável
          </label>
          <input
            id="pedido-responsavel"
            type="text"
            value={editAssigned}
            onChange={(e) => setEditAssigned(e.target.value)}
            placeholder="Nome do membro da equipa…"
            className="bo-input px-3 py-2 text-sm text-[var(--bo-text)] w-full"
          />
        </div>
        <div>
          <label htmlFor="pedido-local" className="bo-eyebrow block mb-1.5">
            Local
          </label>
          <input
            id="pedido-local"
            value={editLocation}
            onChange={(e) => setEditLocation(e.target.value)}
            placeholder="Local do evento…"
            className="bo-input px-3 py-2 text-sm text-[var(--bo-text)] w-full"
          />
        </div>
      </div>
    </>
  );
}
