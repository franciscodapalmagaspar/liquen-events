"use client";

import { ESTADO, PRESSAO } from "../../ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «ISTO NÃO SAI PELA ORDEM QUE AQUI VÊS» — DITO, E COM SAÍDA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Enquanto a ordem vier sugerida pela lista de Serviços, a lista desenhada por
 * baixo NÃO é a ordem em que os campos estão guardados. É a ordem certa — a
 * que sai impressa — mas uma lista que se reordena sozinha sem dizer nada é
 * uma lista em que não se confia.
 *
 * A frase diz o que está a acontecer; o botão dá a saída, que é passar a
 * mandar nela (`ordemExplicita`). Nem sequer é uma acção destrutiva: escreve
 * exactamente a ordem que já está à vista.
 */
export function AvisoDeOrdem({
  mostrar,
  onde,
  onFixar,
}: {
  mostrar: boolean;
  /** «As linhas do orçamento», «As páginas de inspiração». */
  onde: string;
  onFixar: () => void;
}) {
  if (!mostrar) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] px-3 py-2">
      <p className="min-w-[16rem] flex-1 text-[11px] leading-relaxed text-[var(--bo-text-muted)]">
        {onde} estão pela ordem da lista de <strong className="font-medium">Serviços</strong>, que é
        a ordem por que o PDF sai — e não pela ordem em que foram escritas. Arruma os Serviços e
        isto acompanha.
      </p>
      <button
        type="button"
        onClick={onFixar}
        className={`alvo-toque shrink-0 rounded-lg border border-[var(--bo-hairline-strong)] px-2.5 py-1 text-[11px] font-medium text-[var(--bo-tinta-72)] hover:border-foreground/30 hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
      >
        Arrumar eu
      </button>
    </div>
  );
}
