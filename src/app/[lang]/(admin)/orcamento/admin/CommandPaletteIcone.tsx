/*
 * O quadrado do ícone de cada linha da paleta (⌘K) — saiu do
 * `CommandPalette.tsx` tal e qual, para o ficheiro caber no tecto da catraca
 * (`test/tamanho-dos-ficheiros.test.ts`).
 */

/** Os grupos cujos resultados são PESSOAS (um casal, um cliente) — levam o
 *  ícone de pessoa; os outros levam a seta de «ir para». */
const GRUPOS_DE_PESSOAS: ReadonlySet<string> = new Set([
  "Pedidos",
  "Recentes",
  "Propostas",
  "Contratos",
]);

/** O ícone da linha: uma pessoa nos grupos de pessoas, uma seta nos outros. */
export function IconeDaLinha({ isActive, grupo }: { isActive: boolean; grupo: string }) {
  return (
    <span
      /* Dentro da pastilha o quadrado do ícone inverte-se
         também: um verde sobre verde não se lê. E fora dela o
         `text-foreground/40` sai — media 2,67:1 sobre branco,
         que é menos de metade do que a norma pede. */
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
        isActive
          ? "bg-[var(--bo-surface)]/20 text-white"
          : "bg-[var(--bo-tinta-6)] text-[var(--bo-text-muted)]"
      }`}
      aria-hidden="true"
    >
      {GRUPOS_DE_PESSOAS.has(grupo) ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 19a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}
