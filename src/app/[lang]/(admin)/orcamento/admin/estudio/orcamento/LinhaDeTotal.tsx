"use client";

/**
 * Uma linha do bloco de totais: o nome à esquerda, o número à direita.
 *
 * `dt`/`dd` e não duas `span`: são pares de rótulo e valor, e é isso que faz um
 * leitor de ecrã ler «Total a pagar, 3.025,80 €» em vez de duas coisas soltas.
 * Os números vão com `tabular-nums` para as vírgulas ficarem uma por baixo da
 * outra — num quadro de dinheiro, colunas desalinhadas leem-se como erros.
 */
export function LinhaDeTotal({
  rotulo,
  valor,
  /** O resultado de uma soma, e não uma parcela. */
  forte,
  /** Traço por cima, a separar as parcelas do que elas dão. */
  regua,
}: {
  rotulo: React.ReactNode;
  valor: string;
  forte?: boolean;
  regua?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${
        regua ? "border-t border-[var(--bo-hairline-strong)] pt-1.5" : ""
      }`}
    >
      <dt className={forte ? "text-[var(--bo-tinta-72)]" : "text-[var(--bo-text-muted)]"}>
        {rotulo}
      </dt>
      <dd
        className={`tabular-nums ${
          forte ? "text-sm font-semibold text-[var(--bo-text)]" : "text-[var(--bo-tinta-72)]"
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}
