"use client";

import { EventCosts, PaymentsPanel } from "../../lazy";
import { usePedidoAberto } from "./pedido-aberto";

/** O separador «Financeiro» do pedido: pagamentos e custos do evento. (Saiu
 *  das ferramentas do pedido na fase 7 da estrutura do código, tal e qual.) */

export function SeparadorFinanceiro() {
  const { selected, alterarOAberto } = usePedidoAberto();
  return (
    <>
      {/* Cobrança — payments first (the key action), costs
      below. Eyebrow mirrors the other two panels. */}
      <p className="bo-eyebrow text-foreground/45">Pagamentos</p>

      <PaymentsPanel
        key={`pay-${selected.id}`}
        quote={selected}
        onChange={(payments) => {
          alterarOAberto({ payments });
        }}
        onContractRef={(ref) => {
          const contractRef = ref || undefined;
          alterarOAberto({ contractRef });
        }}
      />

      {/* Suppliers booked for this event + budget vs actual cost */}
      <EventCosts
        key={`costs-${selected.id}`}
        quote={selected}
        onChange={(eventSuppliers) => {
          alterarOAberto({ eventSuppliers });
        }}
      />
    </>
  );
}
