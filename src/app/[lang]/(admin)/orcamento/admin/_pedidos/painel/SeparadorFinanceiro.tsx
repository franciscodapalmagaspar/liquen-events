"use client";

import { type Dispatch, type SetStateAction } from "react";
import { type Quote } from "@/lib/orcamento/types";
import { EventCosts, PaymentsPanel } from "../../lazy";

/** O separador «Financeiro» do pedido: pagamentos e custos do evento. (Saiu
 *  das ferramentas do pedido na fase 7 da estrutura do código, tal e qual.) */
export interface SeparadorFinanceiroProps {
  setQuotes: Dispatch<SetStateAction<Quote[]>>;
  selected: Quote;
  setSelected: Dispatch<SetStateAction<Quote | null>>;
}

export function SeparadorFinanceiro({
  setQuotes,
  selected,
  setSelected,
}: SeparadorFinanceiroProps) {
  return (
    <>
      {/* Cobrança — payments first (the key action), costs
      below. Eyebrow mirrors the other two panels. */}
      <p className="bo-eyebrow text-foreground/45">Pagamentos</p>

      <PaymentsPanel
        key={`pay-${selected.id}`}
        quote={selected}
        onChange={(payments) => {
          setQuotes((prev) => prev.map((q) => (q.id === selected.id ? { ...q, payments } : q)));
          setSelected((prev) => (prev ? { ...prev, payments } : prev));
        }}
        onContractRef={(ref) => {
          const contractRef = ref || undefined;
          setQuotes((prev) => prev.map((q) => (q.id === selected.id ? { ...q, contractRef } : q)));
          setSelected((prev) => (prev ? { ...prev, contractRef } : prev));
        }}
      />

      {/* Suppliers booked for this event + budget vs actual cost */}
      <EventCosts
        key={`costs-${selected.id}`}
        quote={selected}
        onChange={(eventSuppliers) => {
          setQuotes((prev) =>
            prev.map((q) => (q.id === selected.id ? { ...q, eventSuppliers } : q)),
          );
          setSelected((prev) => (prev ? { ...prev, eventSuppliers } : prev));
        }}
      />
    </>
  );
}
