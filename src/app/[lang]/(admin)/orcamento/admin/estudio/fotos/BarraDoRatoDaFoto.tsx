"use client";

import { ESTADO, PRESSAO } from "../../ui/movimento";

/* SEM `alvo-toque`, e é o coração da correcção: esta barra só existe onde há
   rato (`com-rato`), e ali o mínimo de 44 px nunca se aplicaria de qualquer
   maneira. O que ele fazia era garantir que, no dia em que a media query
   falhasse, sete ícones de 24 px se tornassem sete quadrados de 44 — que é a
   coluna de 328 px medida em `AccoesDaFoto`. */
const botao =
  "flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-[11px] leading-none text-white hover:bg-black/75 disabled:opacity-30";

/**
 * O caminho do rato: as duas setas e o «⋯» que abre a mesma folha do dedo.
 * Ver `AccoesDaFoto`.
 */
export function BarraDoRatoDaFoto({
  nome,
  podeRecuar,
  podeAvancar,
  onRecuar,
  onAvancar,
  aoAbrirAFolha,
}: {
  nome: string;
  podeRecuar: boolean;
  podeAvancar: boolean;
  onRecuar: () => void;
  onAvancar: () => void;
  aoAbrirAFolha: () => void;
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden flex-wrap items-center justify-center gap-0.5 p-1 opacity-0 ${ESTADO} group-hover/foto:opacity-100 focus-within:opacity-100 com-rato:flex`}
    >
      <span className="pointer-events-auto flex flex-wrap items-center justify-center gap-0.5">
        <button
          type="button"
          className={`${botao} ${ESTADO} ${PRESSAO}`}
          onClick={onRecuar}
          disabled={!podeRecuar}
          aria-label="Mover para trás"
        >
          <span aria-hidden="true">←</span>
        </button>
        <button
          type="button"
          className={`${botao} ${ESTADO} ${PRESSAO}`}
          onClick={onAvancar}
          disabled={!podeAvancar}
          aria-label="Mover para a frente"
        >
          <span aria-hidden="true">→</span>
        </button>
        {/* A MESMA folha do dedo, e não uma segunda lista: a acção
              acrescentada num sítio e esquecida no outro é a forma mais barata
              de os dois caminhos divergirem. */}
        {/* SEM tom de estado: a célula já diz o que está ligado — anel verde
              à volta quando está escolhida, etiqueta «principal» no canto. Um
              «⋯» verde ler-se-ia como se o próprio botão estivesse ligado. */}
        <button
          type="button"
          className={`${botao} ${ESTADO} ${PRESSAO}`}
          onClick={aoAbrirAFolha}
          aria-haspopup="dialog"
          aria-label={`Mais acções de ${nome}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>
      </span>
    </div>
  );
}
