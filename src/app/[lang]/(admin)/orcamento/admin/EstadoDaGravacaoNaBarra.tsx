"use client";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ESTADO DA GRAVAÇÃO NA BARRA DE ACÇÃO — DUAS REGIÕES FIXAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Era UMA região que trocava `aria-live` de `polite` para `assertive` no
 * instante em que o alarme entrava. Alguns leitores de ecrã anunciam com o
 * valor que a região tinha ANTES da mudança — e o alarme («só neste
 * computador») chegava educado, à espera da vez (2.ª revisão de 15/11).
 *
 * Agora são duas, sempre montadas e com o atributo que nunca muda:
 *
 *   · a `polite` leva o estado normal («a guardar», «guardado»), como no
 *     `main` antes das barras que encolhem;
 *   · a `assertive` leva SÓ os alarmes, e está vazia com tudo bem.
 *
 * O que se VÊ é o mesmo de antes: um indicador só, numa das duas.
 */

import type { EstadoDaGravacaoNoEcra } from "@/lib/orcamento/estudio/textos-do-estudio";

export function eAlarmeDaGravacao(estado: EstadoDaGravacaoNoEcra): boolean {
  return estado === "so-neste-computador" || estado === "nao-dura-ao-deploy";
}

export function EstadoDaGravacaoNaBarra({
  haEstado,
  estado,
  texto,
  titulo,
  comMargem,
}: {
  /** Há alguma coisa a dizer? Sem gravação nenhuma ainda, as duas ficam vazias. */
  haEstado: boolean;
  estado: EstadoDaGravacaoNoEcra;
  texto: { curto: string; longo: string; leitor: string };
  titulo: string;
  /** Há outra pastilha à esquerda (o preço por chegar): afasta-se dela. */
  comMargem: boolean;
}) {
  const alarme = eAlarmeDaGravacao(estado);
  const indicador = (
    <span
      // O aviso não pode ter o cinzento discreto dos outros dois: este é para
      // dar nas vistas, e a região `assertive` faz com que também seja
      // anunciado a quem não olha para aqui.
      className={`${comMargem ? "ml-2" : ""} ${
        alarme
          ? "rounded-full bg-[var(--bo-perigo)]/12 px-2 py-0.5 text-[11px] font-semibold text-[var(--bo-perigo)]"
          : "text-[11px] text-foreground/35"
      }`}
      title={titulo}
    >
      {/* No telemóvel os outros dois estados são um glifo; este NÃO, e é de
          propósito: um triângulo sozinho não avisa de nada. */}
      <span aria-hidden className="sm:hidden">
        {texto.curto}
      </span>
      <span className="hidden sm:inline">{texto.longo}</span>
      {/* O visto sozinho não diz nada a quem usa leitor de ecrã. */}
      <span className="sr-only">{texto.leitor}</span>
    </span>
  );
  return (
    <>
      <span aria-live="polite" data-estado-da-gravacao="">
        {haEstado && !alarme && indicador}
      </span>
      <span aria-live="assertive" data-estado-da-gravacao="" data-alarme-da-gravacao="">
        {haEstado && alarme && indicador}
      </span>
    </>
  );
}
