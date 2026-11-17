import type { Proposal } from "@/lib/orcamento/types";
import { metaFor, tintaDoRotulo } from "../status-meta";
import {
  etiquetaDoLugar,
  explicacaoDoLugar,
  type LugarNoCliente,
} from "@/lib/orcamento/propostas-do-mesmo-cliente";
import { STATUS_META, expiryInfo } from "./contas-da-proposta";

/**
 * Uma linha da lista, memoizada.
 *
 * Sem isto, marcar UMA proposta como aceite (que muda `actionBusy`) voltava a
 * desenhar as 202 linhas — e mudar de filtro custava, medido, um evento de
 * 104 ms (uma tarefa longa de 89 ms). A linha só depende da proposta, do pedido
 * ligado e de estar ocupada.
 */
/** O estado da proposta. Partilhado pela tabela e pelo cartão de propósito: as
 *  duas formas têm de dizer exactamente a mesma coisa. */
export function EstadoChip({ p }: { p: Proposal }) {
  const meta = metaFor(STATUS_META, p.status);
  return (
    <span
      className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]"
      style={{ background: `${meta.color}1f`, color: tintaDoRotulo(meta.color) }}
    >
      {meta.label}
    </span>
  );
}

/** "Expira em 3 dias" / "Expirada". Nada quando não há validade definida. */
export function ValidadeChip({ p }: { p: Proposal }) {
  const exp = expiryInfo(p.validUntil);
  if (!exp) return null;
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${
        exp.tone === "expired"
          ? "bg-[var(--bo-perigo)]/10 text-[var(--bo-perigo)]"
          : exp.tone === "soon"
            ? "bg-[var(--bo-aviso-tom)]/12 text-[var(--bo-aviso)]"
            : "bg-[var(--bo-tinta-6)] text-foreground/45"
      }`}
    >
      {exp.label}
    </span>
  );
}

/**
 * ── «MELANIE E SEBASTIEN» APARECE DUAS VEZES ──────────────────────────────
 *
 * A-01 da auditoria. A lista continua a mostrar TUDO o que mostrava — cada
 * proposta é um documento com o seu valor, o seu estado e a sua validade, e
 * esconder uma atrás da outra tirava-lhe da vista a que estava a expirar.
 *
 * O que muda é que cada linha passa a saber que não está sozinha. É essa a
 * pergunta que ela faz quando vê o mesmo nome duas vezes: *é um engano meu, ou
 * são mesmo duas propostas?*
 *
 * O tom é neutro de propósito — não é um aviso, é um facto. Um cliente com
 * três propostas não tem nada de errado; o que estava errado era não se saber.
 */
export function LugarDoCliente({ lugar }: { lugar: LugarNoCliente }) {
  return (
    <span
      className="ml-1.5 inline-flex shrink-0 items-center rounded-full bg-[var(--bo-tinta-6)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--bo-text-muted)] align-middle"
      title={explicacaoDoLugar(lugar)}
    >
      {etiquetaDoLugar(lugar)}
    </span>
  );
}
