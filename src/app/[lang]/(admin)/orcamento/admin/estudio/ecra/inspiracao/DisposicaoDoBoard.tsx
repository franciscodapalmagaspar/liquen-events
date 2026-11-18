"use client";

import EscolherDisposicao from "../../../EscolherDisposicao";
import { capituloDoTema, composicaoEmPalavras, ordemDoDesenho } from "@/lib/pdf-editorial/plano";
import type { Disposicao } from "@/lib/pdf-editorial/mosaico";
import { ASPETO_POR_OMISSAO } from "@/lib/proposal-geometria";
import { eCasamento } from "@/lib/proposal-evento";
import type { MoodBoard } from "@/lib/proposal-doc";
import { useEstudio } from "../../contexto";

/** A disposição das fotos de um mood board, e o capítulo em que o PDF o põe. */
export function DisposicaoDoBoard({
  b,
  bi,
  disposicaoDesteTema,
  fechado,
  fotosDoTema,
  vezDesteTema,
}: {
  b: MoodBoard;
  bi: number;
  disposicaoDesteTema: Disposicao | null;
  fechado: boolean;
  fotosDoTema: number;
  vezDesteTema: number;
}) {
  const {
    disposicao: { disposicaoEmTodos, mudarDisposicao },
    documento: { doc },
    fotos: { aspetosDasFotos },
  } = useEstudio();
  return (
    <>
      {/* ── A DISPOSIÇÃO DAS FOTOS ─────────────────
                                    Saiu no #173 e voltou a 15/10, a pedido
                                    dela, com as composições do PDF novo
                                    (`EscolherDisposicao`). O «Manter a forma»
                                    do PDF antigo não volta: cada célula do
                                    desenho novo já tem quase a forma da sua
                                    foto. */}
      <EscolherDisposicao
        valor={disposicaoDesteTema}
        aspectos={ordemDoDesenho(b).map(
          (k) => aspetosDasFotos[b.images[k] ?? ""] ?? ASPETO_POR_OMISSAO,
        )}
        vezPar={vezDesteTema % 2 === 0}
        desligado={fechado}
        onEscolher={(d) => mudarDisposicao(bi, d)}
        onAplicarATodos={
          doc.moodBoards.length > 1 && disposicaoDesteTema
            ? () => disposicaoEmTodos(disposicaoDesteTema)
            : undefined
        }
      />
      <p className="mt-2 text-xs leading-relaxed text-[var(--bo-text-muted)]">
        Capítulo:{" "}
        <strong className="font-medium text-[var(--bo-tinta-72)]">
          {capituloDoTema(b, eCasamento(doc.eventType), doc.moodBoards)}
        </strong>
        <span className="text-foreground/35"> · </span>
        {composicaoEmPalavras(fotosDoTema, disposicaoDesteTema)}
      </p>
    </>
  );
}
