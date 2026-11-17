"use client";

import type { MudancasDosPedidos } from "@/lib/orcamento/pedidos/lista-de-pedidos";
import { type Quote } from "@/lib/orcamento/types";
import { EventCosts, PaymentsPanel } from "../../lazy";

/** O separador «Financeiro» do pedido: pagamentos e custos do evento. (Saiu
 *  das ferramentas do pedido na fase 7 da estrutura do código, tal e qual.) */
export interface SeparadorFinanceiroProps {
  pedidos: MudancasDosPedidos;
  selected: Quote;
}

export function SeparadorFinanceiro({ pedidos, selected }: SeparadorFinanceiroProps) {
  return (
    <>
      {/* Cobrança — payments first (the key action), costs
      below. Eyebrow mirrors the other two panels. */}
      <p className="bo-eyebrow text-foreground/45">Pagamentos</p>

      <PaymentsPanel
        key={`pay-${selected.id}`}
        quote={selected}
        onChange={(payments) => {
          pedidos.mudar(selected.id, { payments });
        }}
        onContractRef={(ref) => {
          const contractRef = ref || undefined;
          pedidos.mudar(selected.id, { contractRef });
        }}
      />

      {/* Suppliers booked for this event + budget vs actual cost */}
      <EventCosts
        key={`costs-${selected.id}`}
        quote={selected}
        onChange={(eventSuppliers) => {
          pedidos.mudar(selected.id, { eventSuppliers });
        }}
      />
    </>
  );
}
