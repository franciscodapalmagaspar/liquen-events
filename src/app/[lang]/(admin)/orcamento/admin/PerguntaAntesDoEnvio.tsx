"use client";

import { fraseDeCorte } from "./conteudo-incompleto";
import type { Pergunta } from "./usePerguntasDoEnvio";
import { Button } from "./ui";

/**
 * ── O QUE FALTA OU FICA DE FORA, PERGUNTADO ANTES DE SEGUIR ──────────────
 *
 * O servidor desenhou o documento, viu que faltam fotografias ou que a
 * composição cortou alguma coisa, e parou. O email ainda não saiu e a proposta
 * ainda não foi gravada — é o último instante em que voltar atrás não custa
 * nada. A frase de cada corte é a mesma que o aviso da pré-visualização usa; o
 * que muda é a altura em que aparece. As regras da resposta estão em
 * `usePerguntasDoEnvio`.
 */
export default function PerguntaAntesDoEnvio({
  pergunta,
  ocupado,
  onEnviarAssimMesmo,
  onVoltarECorrigir,
}: {
  pergunta: Pergunta;
  ocupado: boolean;
  onEnviarAssimMesmo: () => void;
  onVoltarECorrigir: () => void;
}) {
  const fotos = pergunta.tipo === "fotos";
  return (
    <div className="ml-auto flex flex-col items-end gap-2" role={fotos ? "alert" : undefined}>
      <div className="max-w-lg rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]">
        {fotos ? (
          <>
            <p className="font-medium">
              {pergunta.n === 1
                ? "Falta 1 fotografia no documento."
                : `Faltam ${pergunta.n} fotografias no documento.`}
            </p>
            <p className="mt-1.5 text-[var(--bo-text-muted)]">
              Não se conseguiram ir buscar ao armazenamento, e a proposta ainda não saiu. Volta
              atrás para as trocar, ou envia assim mesmo.
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">O documento sai com conteúdo cortado:</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {pergunta.cortes.map((c) => (
                <li key={`${c.where}:${c.unit}`}>· {fraseDeCorte(c)}</li>
              ))}
            </ul>
            <p className="mt-1.5 text-[var(--bo-text-muted)]">
              Volta atrás para encurtar o que ficou cortado, ou envia assim mesmo se for de
              propósito.
            </p>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="primary" onClick={onEnviarAssimMesmo} disabled={ocupado}>
          Enviar assim mesmo
        </Button>
        <Button size="sm" variant="ghost" onClick={onVoltarECorrigir}>
          Voltar e corrigir
        </Button>
      </div>
    </div>
  );
}
