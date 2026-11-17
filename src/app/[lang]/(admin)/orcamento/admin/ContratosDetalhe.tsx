import type { Contract } from "@/lib/contract-types";

/*
 * As datas dos contratos e o detalhe aberto de um contrato — saíram do
 * `Contratos.tsx` tal e qual, para o ficheiro caber no tecto da catraca
 * (`test/tamanho-dos-ficheiros.test.ts`).
 */

// Data + hora (a aceitação é um evento pontual, ao minuto — importa a hora).
export const fmtDateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("pt-PT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

// Só a data (para a coluna de criação, mais compacta).
export const fmtDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

/** Expanded contract details — audit fields + the saved copy of the accepted
 *  terms. Shared by the desktop table's expand row and the mobile card. */
export function ContractDetails({ c }: { c: Contract }) {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 mb-4">
        <div>
          <p className="bo-eyebrow text-foreground/40 mb-1">Proposta</p>
          <p className="text-[var(--bo-text-muted)] font-mono text-[11px] break-all">
            {c.proposalId || "—"}
          </p>
        </div>
        <div>
          <p className="bo-eyebrow text-foreground/40 mb-1">Criado em</p>
          <p className="text-[var(--bo-text-muted)]">{fmtDateTime(c.createdAt)}</p>
        </div>
        <div>
          <p className="bo-eyebrow text-foreground/40 mb-1">Versão dos termos</p>
          <p className="text-[var(--bo-text-muted)]">Versão {c.termsVersion}</p>
        </div>
        {/* IP é dado de auditoria — discreto, não em destaque. */}
        <div>
          <p className="bo-eyebrow text-foreground/40 mb-1">IP de quem aceitou</p>
          <p className="text-foreground/45 font-mono text-[11px] break-all">
            {c.acceptedIp || "—"}
          </p>
        </div>
      </div>
      <p className="bo-eyebrow text-foreground/40 mb-2">Termos aceites (cópia guardada)</p>
      <div className="max-h-72 overflow-y-auto rounded-lg border border-[var(--bo-hairline-strong)] bg-[var(--bo-surface)] p-4">
        <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-[var(--bo-text-muted)]">
          {c.termsSnapshot || "Sem cópia dos termos guardada."}
        </pre>
      </div>
    </>
  );
}
