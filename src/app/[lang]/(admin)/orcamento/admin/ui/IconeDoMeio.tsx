import type { ReactNode } from "react";
import type { MeioDePagamento } from "@/lib/orcamento/meios-de-pagamento";

/**
 * O ícone de um meio de pagamento (ver `lib/orcamento/meios-de-pagamento.ts`).
 *
 * Os traços são os da Lucide (licença ISC), a biblioteca que o sistema de
 * design manda usar (§8.1): `smartphone` (MB Way), `landmark` (transferência),
 * `banknote` (numerário), `credit-card` (Multibanco), `pen-line` (cheque) e
 * `wallet` (o que não se reconhece). Contorno, `currentColor`, e decorativo —
 * o nome do meio está sempre escrito ao lado.
 */
export function IconeDoMeio({ meio, tamanho = 14 }: { meio: MeioDePagamento; tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
      data-meio={meio}
    >
      {TRACOS[meio]}
    </svg>
  );
}

const TRACOS: Record<MeioDePagamento, ReactNode> = {
  mbway: (
    <>
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
      <path d="M12 18h.01" />
    </>
  ),
  transferencia: (
    <>
      <path d="M3 22h18" />
      <path d="M6 18v-7" />
      <path d="M10 18v-7" />
      <path d="M14 18v-7" />
      <path d="M18 18v-7" />
      <path d="M12 2 20 7H4z" />
    </>
  ),
  numerario: (
    <>
      <rect width="20" height="12" x="2" y="6" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  multibanco: (
    <>
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <path d="M2 10h20" />
    </>
  ),
  cheque: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  outro: (
    <>
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </>
  ),
};
