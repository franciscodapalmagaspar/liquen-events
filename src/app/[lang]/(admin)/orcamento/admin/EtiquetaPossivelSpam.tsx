import { explicarPossivelSpam, lerPossivelSpam } from "@/lib/anti-spam/possivel-spam";

/**
 * A marca «Possível spam» de um pedido (17/11). Discreta de propósito: não é
 * um aviso nem conta nada (`.claude/rules/dados.md`) — é uma nota ao lado do
 * nome, para ela decidir se vale a chamada. O pedido continua na lista como
 * os outros. Cor + ícone + palavra (DESIGN-SYSTEM, «nunca só por cor»), em
 * tinta neutra: não é um erro do pedido. Forma e letra dos tokens: o raio de
 * badge (`rounded-badge`, 6 px — a cápsula é das ações principais) e o
 * `text-caption` da escala, com o ícone à altura da letra.
 *
 * Sem marca, não desenha nada.
 */
export function EtiquetaPossivelSpam({
  valor,
  className = "",
}: {
  valor: unknown;
  /** A margem de quem a monta: vive aqui, para não sobrar uma caixa vazia. */
  className?: string;
}) {
  const marca = lerPossivelSpam(valor);
  if (!marca) return null;
  const porque = explicarPossivelSpam(marca);
  return (
    <span
      className={`${className} inline-flex shrink-0 items-center gap-1 rounded-badge px-1.5 py-0.5 text-caption font-medium whitespace-nowrap text-[var(--bo-tinta-72)] ring-1 ring-[var(--bo-hairline)] ring-inset`}
      title={`Possível spam: ${porque}`}
    >
      <svg
        width="12"
        height="12"
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
