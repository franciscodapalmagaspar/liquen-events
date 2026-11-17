"use client";

import { type Dispatch, type RefObject, type SetStateAction } from "react";
import { formatPrice } from "@/lib/orcamento/pricing";
import { type Quote, type QuoteStatus } from "@/lib/orcamento/types";
import NotaDaProposta from "../../NotaDaProposta";
import { FollowUpField, TagsField } from "../../lazy";
import { SectionCard } from "../../ui";
import { type EdicaoDoPedido } from "../useEdicaoDoPedido";
import { FactosDoEvento } from "./FactosDoEvento";
import { CamposDoPedido } from "./CamposDoPedido";
import { ContactosDoPedido } from "./ContactosDoPedido";

/**
 * A GESTÃO DO PEDIDO — o formulário de trabalho do painel, sempre à vista:
 * estado, preço, data, convidados, responsável, local, os contactos, etiquetas
 * e seguimento, o motivo de perda e as notas internas. (Saiu do
 * `AdminClient.tsx` na fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`, tal e qual.)
 */
export interface GestaoDoPedidoProps {
  edicao: EdicaoDoPedido;
  setQuotes: Dispatch<SetStateAction<Quote[]>>;
  selected: Quote;
  setSelected: Dispatch<SetStateAction<Quote | null>>;
  ganhoSemProposta: string | null;
  escolherEstado: (novo: QuoteStatus) => void;
  devolvidoAqui: { quoteId: string; endereco: string } | null;
  emailSugerido: string | null;
  gestaoRef: RefObject<HTMLDivElement | null>;
  allTags: string[];
}

export function GestaoDoPedido({
  edicao,
  setQuotes,
  selected,
  setSelected,
  ganhoSemProposta,
  escolherEstado,
  devolvidoAqui,
  emailSugerido,
  gestaoRef,
  allTags,
}: GestaoDoPedidoProps) {
  const { editNotes, setEditNotes, editStatus, editLostReason, setEditLostReason } = edicao;
  return (
    <>
      {/* ── Gestão do pedido — o formulário de trabalho, SEMPRE
        visível (nada escondido atrás de "Mostrar mais"). ── */}
      <div ref={gestaoRef} className="scroll-mt-24">
        <SectionCard eyebrow="Gestão do pedido" padding="md">
          <div className="flex flex-col gap-5">
            <FactosDoEvento selected={selected} />

            <CamposDoPedido
              edicao={edicao}
              selected={selected}
              ganhoSemProposta={ganhoSemProposta}
              escolherEstado={escolherEstado}
            />

            <ContactosDoPedido
              edicao={edicao}
              devolvidoAqui={devolvidoAqui}
              emailSugerido={emailSugerido}
            />

            {/* Etiquetas + seguimento — gravam sozinhos. */}
            <div className="grid grid-cols-1 gap-4 border-t border-[var(--bo-hairline)] pt-4 sm:grid-cols-2">
              <TagsField
                key={`tags-${selected.id}`}
                quote={selected}
                suggestions={allTags}
                onChange={(tags) => {
                  setQuotes((prev) => prev.map((q) => (q.id === selected.id ? { ...q, tags } : q)));
                  setSelected((prev) => (prev ? { ...prev, tags } : prev));
                }}
              />
              <FollowUpField
                key={`fu-${selected.id}`}
                quote={selected}
                onChange={(followUpAt) => {
                  setQuotes((prev) =>
                    prev.map((q) => (q.id === selected.id ? { ...q, followUpAt } : q)),
                  );
                  setSelected((prev) => (prev ? { ...prev, followUpAt } : prev));
                }}
              />
            </div>

            {editStatus === "rejeitado" && (
              <div>
                <label htmlFor="pedido-motivo" className="bo-eyebrow block mb-1.5">
                  Motivo de perda
                </label>
                <textarea
                  id="pedido-motivo"
                  rows={2}
                  value={editLostReason}
                  onChange={(e) => setEditLostReason(e.target.value)}
                  placeholder="Ex.: Orçamento acima do esperado, escolheram outro fornecedor…"
                  className="bo-input px-3 py-2 text-sm text-[var(--bo-text)] resize-none w-full"
                />
              </div>
            )}
            {selected.status === "rejeitado" &&
              selected.lostReason &&
              editStatus !== "rejeitado" && (
                <div className="rounded-lg border border-[var(--bo-hairline)] bg-[var(--bo-tinta-6)] px-3 py-2">
                  <p className="mb-1 text-[9px] uppercase tracking-[0.2em] text-[var(--bo-text-muted)]">
                    Motivo de perda anterior
                  </p>
                  <p className="text-xs text-[var(--bo-tinta-72)]">{selected.lostReason}</p>
                </div>
              )}

            <div>
              <label htmlFor="pedido-notas" className="bo-eyebrow block mb-1.5">
                Notas internas
              </label>
              <textarea
                id="pedido-notas"
                rows={3}
                // O que se escreve aqui grava-se sozinho — ver a
                // gravação automática lá em cima. A barra de
                // baixo diz em que pé está.
                aria-describedby="estado-da-gravacao-do-pedido"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Notas internas sobre este pedido…"
                className="bo-input px-3 py-2 text-sm text-[var(--bo-text)] resize-none w-full"
              />
              {/* ── E A NOTA QUE FOI ESCRITA NO ESTÚDIO ────
                  A caixa acima é do PEDIDO. Esta é a nota da
                  PROPOSTA, e mostra-se aqui porque quem abre
                  a ficha três semanas depois não passa pelo
                  estúdio — era aí que a frase se perdia.
                  Só de leitura: ver `NotaDaProposta`. */}
              <NotaDaProposta key={selected.id} quoteId={selected.id} />
            </div>

            {/* Estimativa calculada — contexto para definir o preço. */}
            {selected.priceBreakdown && (
              <div className="rounded-lg bg-[var(--bo-tinta-6)] p-3 flex flex-col gap-1.5">
                <p className="text-[9px] uppercase tracking-[0.2em] text-foreground/50">
                  Estimativa calculada
                </p>
                {selected.priceBreakdown.addonsCost > 0 && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-[var(--bo-text-muted)]">Extras</span>
                    <span className="text-[var(--bo-tinta-72)]">
                      {formatPrice(selected.priceBreakdown.addonsCost)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-[10px]">
                  <span className="text-[var(--bo-text-muted)]">Subtotal</span>
                  <span className="text-[var(--bo-tinta-72)]">
                    {formatPrice(selected.priceBreakdown.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-[var(--bo-text-muted)]">IVA 23%</span>
                  <span className="text-[var(--bo-tinta-72)]">
                    {formatPrice(selected.priceBreakdown.iva)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[var(--bo-hairline)] pt-1 text-xs font-medium">
                  <span className="text-[var(--bo-text-muted)]">Total</span>
                  <span className="font-semibold text-sage-600">
                    {formatPrice(selected.priceBreakdown.total)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
