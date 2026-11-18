"use client";

import { type Dispatch, type SetStateAction } from "react";
import { type Quote } from "@/lib/orcamento/types";
import { pedidoDaResposta } from "@/lib/orcamento/pedidos/pedido-da-resposta";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import { MoreMenu } from "../../MoreMenu";
import { descarregarOCalendario, imprimirOPedido } from "../../imprimir-a-pedido";
import { usePedidoAberto } from "./pedido-aberto";

/**
 * O «⋯» DO PEDIDO — duplicar, arquivar ou restaurar, imprimir a timeline e o
 * dossier, levar o evento para o calendário, apagar. Saiu do
 * `CabecalhoDoPainel` (que passava das 250 linhas) tal e qual; a impressão vem
 * a pedido (`imprimir-a-pedido.ts`).
 */
export interface MenuDoPedidoProps {
  setAApagar: Dispatch<SetStateAction<Quote | null>>;
  duplicateQuote: (q: Quote) => Promise<void>;
}

export function MenuDoPedido({ setAApagar, duplicateQuote }: MenuDoPedidoProps) {
  const { selected, toast, mostrarPedido } = usePedidoAberto();
  return (
    <>
      {/* Every secondary / destructive / print action tucked into
          one calm overflow menu so the header stays uncluttered. */}
      <MoreMenu
        items={[
          {
            label: "Duplicar pedido",
            hint: "Clonar para um cliente recorrente",
            onClick: () => duplicateQuote(selected),
            icon: (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" />
              </svg>
            ),
          },
          {
            label: selected.archived ? "Restaurar pedido" : "Arquivar pedido",
            hint: selected.archived
              ? "Voltar a mostrar na lista principal"
              : "Ocultar da lista principal (reversível)",
            onClick: async () => {
              const next = !selected.archived;
              const confirm_ =
                !next ||
                window.confirm(`Arquivar "${selected.name}"? Ficará oculto da lista principal.`);
              if (!confirm_) return;
              /**
               * ── UM `if (res.ok)` SEM `else` NEM `catch` ──
               *
               * Era esta a forma anterior, e o resultado é o
               * pior possível num gesto que faz um pedido
               * DESAPARECER da lista: com a rede em baixo não
               * acontecia nada nenhum — nem o pedido saía da
               * lista, nem havia aviso. Ficava-se a olhar para
               * um menu que não respondeu, sem saber se foi o
               * dedo que falhou ou o servidor.
               */
              const oQue = `${next ? "arquivar" : "restaurar"} «${selected.name}»`;
              let res: Response;
              try {
                res = await fetch(`/api/orcamento/${selected.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ archived: next }),
                });
              } catch {
                toast(porqueRebentou(oQue).mensagem, "error");
                return;
              }
              const corpo = await res.json().catch(() => null);
              if (!res.ok) {
                toast(porqueFalhou(oQue, res, corpo).mensagem, "error");
                return;
              }
              const updated = pedidoDaResposta(corpo);
              if (updated) mostrarPedido(updated);
              toast(next ? "Pedido arquivado" : "Pedido restaurado", "success");
            },
            icon: (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 8v13H3V8M23 3H1v5h22V3zM10 12h4" />
              </svg>
            ),
          },
          {
            label: "Timeline",
            hint: "Imprimir a folha de operações",
            onClick: () => imprimirOPedido("timeline", selected, toast),
            icon: (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <path
                  d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <rect x="6" y="14" width="12" height="7" rx="1" />
              </svg>
            ),
          },
          {
            label: "Dossier PDF",
            hint: "Imprimir o dossier completo do evento",
            onClick: () => imprimirOPedido("dossier", selected, toast),
            icon: (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <path
                  d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M14 2v6h6M9 13h6M9 17h6M9 9h1" strokeLinecap="round" />
              </svg>
            ),
          },
          ...(selected.date
            ? [
                {
                  label: "Adicionar ao calendário",
                  hint: "Descarregar .ics (Google/Apple/Outlook)",
                  onClick: () => descarregarOCalendario(selected, toast),
                  icon: (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
                      <path d="M12 13v5M9.5 15.5 12 18l2.5-2.5" />
                    </svg>
                  ),
                },
              ]
            : []),
          {
            label: "Apagar pedido",
            hint: "Fica 30 dias na Reciclagem",
            // A pergunta nomeia o pedido e enumera o que
            // vai atrás dele. Ver `PerguntaDestrutiva`.
            onClick: () => setAApagar(selected),
            icon: (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
              </svg>
            ),
          },
        ]}
      />
    </>
  );
}
