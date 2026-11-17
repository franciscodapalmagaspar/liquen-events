import { explicarPossivelSpam, lerPossivelSpam } from "@/lib/anti-spam/possivel-spam";

/**
 * A marca «Possível spam» de um pedido (17/11). Discreta de propósito: não é
 * um aviso nem conta nada (`.claude/rules/dados.md`) — é uma nota ao lado do
 * nome, para ela decidir se vale a chamada. O pedido continua na lista como
 * os outros. Cor + ícone + palavra (DESIGN-SYSTEM, «nunca só por cor»), em
 * tinta neutra: não é um erro do pedido.
 *
 * Sem marca, não desenha nada.
 */
export function EtiquetaPossivelSpam({ valor }: { valor: unknown }) {
  const marca = lerPossivelSpam(valor);
  if (!marca) return null;
  const porque = explicarPossivelSpam(marca);
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] whitespace-nowrap text-[var(--bo-tinta-72)] uppercase ring-1 ring-[var(--bo-hairline)] ring-inset"
      title={`Possível spam: ${porque}`}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.5v.01" strokeLinecap="round" />
      </svg>
      Possível spam
      <span className="sr-only">: {porque}</span>
    </span>
  );
}
