"use client";

import { fotosQueDestoam } from "@/lib/cor-dominante";
import type { MoodBoard } from "@/lib/proposal-doc";
import { AVISO_DO_BOARD } from "../../classes";
import { useEstudio } from "../../contexto";
import { fraseDasFotosQueDestoam } from "./fotos-que-destoam";

/**
 * O que o cartão de um mood board diz em voz baixa por cima das fotografias:
 * um título igual a outro, o tema a ocupar duas páginas, e as fotos que
 * destoam da paleta. Nenhum trava nada.
 */
export function AvisosDoBoard({
  b,
  bi,
  fotosDoTema,
  paginasDesteTema,
}: {
  b: MoodBoard;
  bi: number;
  fotosDoTema: number;
  paginasDesteTema: number;
}) {
  const {
    fotos: { assetCores },
    paginasDaProposta: { avisosDeTitulo },
  } = useEstudio();
  const destoam = fraseDasFotosQueDestoam(fotosQueDestoam(b.images.map((p) => assetCores[p])));
  return (
    <>
      {/* ── DUAS PÁGINAS COM O MESMO NOME ───────
                                    «"Complementos Dos Noivos" e
                                    "Complementos Noivos". Uma é bouquet,
                                    outra lapelas — mas na proposta aparecem
                                    dois títulos praticamente idênticos
                                    seguidos.»

                                    Não é vermelho e não trava nada: «Mesa
                                    1» e «Mesa 2» é uma decisão, não um
                                    descuido, e um aviso que trava uma
                                    escolha legítima ensina-se a ignorar. Diz
                                    o que viu, cita o outro título, e deixa-a
                                    decidir. */}
      {avisosDeTitulo[bi] && (
        <p className={`${AVISO_DO_BOARD} text-[var(--bo-aviso)]`}>{avisosDeTitulo[bi]}</p>
      )}
      {/* ── DUAS PÁGINAS, E NÃO FOTOS DE FORA ───────
                                    No PDF antigo uma página imprimia dez e
                                    as outras ficavam de fora. No novo
                                    nenhuma fica: acima de doze o tema passa
                                    a duas páginas, e a segunda diz «Mais
                                    ideias…». Não é um erro — diz-se em voz
                                    baixa, para ela decidir se a quer. */}
      {paginasDesteTema > 1 &&
        // Os nós de texto do original: um {" "} à parte não é um espaço dentro do
        // texto, e mede-se diferente (1/64 px). Ver scripts/capturas/estudio-ao-pixel.mjs.
        // prettier-ignore
        <p className={`${AVISO_DO_BOARD} text-[var(--bo-text-muted)]`}>
          {fotosDoTema} fotos: no PDF este tema ocupa{" "}
          {paginasDesteTema} páginas (a segunda diz «Mais ideias…»).
        </p>}
      {/* ── A FOTO QUE DESTOA DA PALETA ────────────
                                    Não é um erro, e por isso não é vermelho:
                                    uma fotografia de cor diferente pode ser
                                    exactamente o que se quer. É uma coisa que
                                    se vê melhor dita do que olhando para uma
                                    grelha de miniaturas pequenas — e que só
                                    aparece quando salta à vista mesmo (ver
                                    `LIMIAR_DE_AVISO` em `cor-dominante.ts`).

                                    Cala-se sozinho quando não há cores que
                                    cheguem: as fotos carregadas antes de a
                                    cor existir não entram na conta. */}
      {destoam &&
        // Os nós de texto do original: um {" "} à parte não é um espaço dentro do
        // texto, e mede-se diferente (1/64 px). Ver scripts/capturas/estudio-ao-pixel.mjs.
        // prettier-ignore
        <p className="mb-2 text-xs leading-relaxed text-[var(--bo-text-muted)]">
          <span aria-hidden="true">◐ </span>
          {destoam}{" "}
          Pode ser de propósito — se não for, troca-a ou arruma a
          página por cor.
        </p>}
    </>
  );
}
