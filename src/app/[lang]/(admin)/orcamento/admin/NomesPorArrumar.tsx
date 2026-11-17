"use client";

import { useState } from "react";
import type { ThemeSummary } from "@/lib/theme-types";
import { arrumosDeNomes } from "@/lib/tema-nome";
import { Button } from "./ui";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS NOMES QUE FICARAM POR ARRUMAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, sobre o «Seatings Plans»: «o erro já existia como "Seatting" e
 * mudou de forma — continua por corrigir na origem. Isto tem de ser apanhado
 * automaticamente, não caso a caso.»
 *
 * ── O QUE JÁ EXISTIA, E PORQUE É QUE NÃO CHEGAVA ──────────────────────────
 *
 * O corrector existe (`tema-nome.ts`) e sabe que «Seatings Plans» é «Seating
 * Plans». A `SugestaoDeNome` mostra-o ao lado do campo — mas SÓ enquanto se
 * escreve o nome. Um tema baptizado há seis meses nunca mais passa por esse
 * campo, portanto a correcção existia e não chegava a nenhum dos temas que
 * precisavam dela. E havia ainda o `arrumosDeNomes`, escrito de propósito
 * «para a revisão em lote» — sem que existisse revisão em lote nenhuma.
 *
 * Isto é essa revisão. Aparece SÓ quando há alguma coisa a arrumar; com a
 * biblioteca em ordem não se vê nada, que é a propriedade que faz um aviso
 * valer a pena no dia em que aparecer.
 *
 * ── E CONTINUA A PROPOR, NUNCA A IMPOR ────────────────────────────────────
 *
 * A regra da casa é a mesma do campo: um nome é escolha de quem o escreve. Um
 * tema pode chamar-se «lapelas» de propósito, ou levar o nome de um espaço que
 * o dicionário não conhece. Por isso não há correcção automática ao gravar, e
 * há um «Deixar como está» por linha — que é o que impede a lista de se tornar
 * uma reprimenda permanente por causa de dois nomes que ela quer assim.
 */

/** Um nome por arrumar, com o antes e o depois. */
interface Arrumo {
  tema: ThemeSummary;
  antes: string;
  depois: string;
}

export function NomesPorArrumar({
  themes,
  onRenomear,
}: {
  themes: readonly ThemeSummary[];
  /** Renomeia mesmo. Devolve `true` quando o servidor aceitou. */
  onRenomear: (tema: ThemeSummary, nome: string) => Promise<boolean>;
}) {
  const [aberto, setAberto] = useState(false);
  /** Os que ela mandou deixar como estão, nesta sessão. */
  const [deixados, setDeixados] = useState<ReadonlySet<string>>(new Set());
  const [aGravar, setAGravar] = useState<string | null>(null);

  /**
   * O cruzamento entre os temas e o corrector.
   *
   * `arrumosDeNomes` devolve só os que mudam, pela mesma ordem — é por isso que
   * se pode voltar a casar com o tema pelo nome.
   */
  const porNome = new Map(arrumosDeNomes(themes.map((t) => t.name)).map((a) => [a.antes, a]));
  const arrumos: Arrumo[] = themes
    .filter((t) => !deixados.has(t.id) && porNome.has(t.name))
    .map((t) => ({ tema: t, ...porNome.get(t.name)! }));

  if (arrumos.length === 0) return null;

  const corrigir = async (a: Arrumo) => {
    setAGravar(a.tema.id);
    const feito = await onRenomear(a.tema, a.depois);
    setAGravar(null);
    // Não se tira da lista à mão: o tema volta com o nome novo e deixa de
    // casar com o corrector sozinho. Uma remoção optimista aqui escondia a
    // linha quando a gravação falhasse.
    if (!feito) return;
  };

  return (
    <div className="mb-4 rounded-xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-chao)]/60 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-[var(--bo-tinta-72)]">
          {arrumos.length === 1
            ? "Há um nome de tema por arrumar."
            : `Há ${arrumos.length} nomes de temas por arrumar.`}{" "}
          <span className="bo-text-muted">
            Os nomes são o índice por onde se procura — um tema escrito de outra maneira é um tema
            que não aparece.
          </span>
        </p>
        <Button size="sm" variant="ghost" onClick={() => setAberto((v) => !v)}>
          {aberto ? "Fechar" : "Ver e corrigir"}
        </Button>
      </div>

      {aberto && (
        <ul className="mt-3 flex flex-col gap-2">
          {arrumos.map((a) => (
            <li
              key={a.tema.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-[var(--bo-surface)]/70 px-3 py-2"
            >
              <p className="min-w-0 text-sm">
                {/* O antes riscado e o depois em cheio: a diferença lê-se sem
                    comparar letra a letra, que com «Seatings Plans» → «Seating
                    Plans» é exactamente o que seria preciso. */}
                <span className="text-foreground/40 line-through">{a.antes}</span>
                <span aria-hidden className="mx-1.5 text-foreground/30">
                  →
                </span>
                <span className="font-medium text-[var(--bo-text)]">{a.depois}</span>
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeixados((d) => new Set([...d, a.tema.id]))}
                >
                  Deixar como está
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={aGravar === a.tema.id}
                  onClick={() => corrigir(a)}
                >
                  Corrigir
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default NomesPorArrumar;
