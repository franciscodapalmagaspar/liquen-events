/**
 * Os ícones das redes, num sítio só. Eram escritos dentro do `Footer.tsx`;
 * desde que a proposta online também os mostra (pedido dela, 25/10: «o
 * Instagram, o LinkedIn, como logo, como está no site»), vivem aqui, para os
 * dois sítios desenharem exactamente o mesmo traço.
 *
 * Decorativos: o nome vai na ligação que os envolve (`aria-label`).
 */
const TRACO = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

export function IconeInstagram({ tamanho = 19 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" {...TRACO}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

export function IconeFacebook({ tamanho = 19 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" {...TRACO}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

export function IconeLinkedIn({ tamanho = 19 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" {...TRACO}>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}
