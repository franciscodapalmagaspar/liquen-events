"use client";

import { Fragment, useEffect, useRef } from "react";
import {
  FRASE_DO_ESTADO,
  PASSOS,
  nomeDoPasso,
  type EstadoDoPasso,
} from "@/lib/orcamento/passos-do-estudio";
import { ESTADO, PRESSAO } from "../../ui/movimento";
import type { Step } from "../tipos";

/**
 * Indicador de passos "1 · Conteúdo → 2 · Pré-visualizar → 3 · Enviar".
 *
 * ── NO TELEMÓVEL, OS NÚMEROS E SÓ O NOME DO PASSO ONDE SE ESTÁ ────────────
 * MEDIDO a 375 px: os três botões com os nomes por extenso, mais as duas setas
 * e os intervalos, pedem 396 px de fila num espaço de 343 — a fila quebrava e
 * o «3 Enviar» ficava sozinho numa segunda linha, sem seta a ligá-lo, a
 * parecer outra coisa em vez do terceiro passo.
 *
 * O nome dos passos onde NÃO se está passa a `sr-only` abaixo de 640 px: fica
 * o número, que é o que dá o sentido de percurso, e o passo activo continua a
 * dizer o nome — que é a única pergunta a que isto responde quando se está a
 * meio («onde estou?»). Acima de 640 px não muda nada.
 *
 * `sr-only` e NÃO `hidden`: `display: none` tira o texto da árvore de
 * acessibilidade, e o botão passava a chamar-se «2» para quem usa leitor de
 * ecrã — e para os testes que o procuram por «Pré-visualizar».
 */
/**
 * ── A BARRA DOS CINCO PASSOS ─────────────────────────────────────────────────
 *
 * Do documento dela (A2): «a navegação dos passos sempre visível», e «cada
 * passo diz se está completo, incompleto ou com erro». Fica colada ao topo do
 * estúdio, por baixo do cabeçalho do back office (`--bo-cabecalho`, que o
 * `AdminClient` publica), e salta-se livremente entre passos — o formulário é
 * um só e está sempre montado, por isso nada se perde.
 *
 * O sinal não fala só pela cor: ✓, • e ! têm forma própria, e o leitor de
 * ecrã ouve «completo», «por completar» ou «com erros» a seguir ao nome.
 *
 * No telemóvel fica o número e o sinal; o nome só no passo activo, como já era.
 */
const SINAL_DO_ESTADO: Record<EstadoDoPasso, { sinal: string; cor: string }> = {
  completo: { sinal: "✓", cor: "text-[var(--bo-sucesso)]" },
  incompleto: { sinal: "•", cor: "text-[var(--bo-aviso)]" },
  erro: { sinal: "!", cor: "text-[var(--bo-perigo)]" },
};

export function StepNav({
  step,
  onSelect,
  estados,
  organizacao,
}: {
  step: Step;
  onSelect: (s: Step) => void;
  estados: Record<Step, EstadoDoPasso>;
  organizacao: boolean;
}) {
  /**
   * A barra dos passos fica colada por baixo do cabeçalho — e o índice da
   * esquerda e o painel «O que vai sair» colavam-se a `top-4`, POR BAIXO dela:
   * ao descer, a barra tapava-lhes o topo. Era a página «cortada» da captura
   * dela (9/11). A altura publica-se como a do cabeçalho (`--bo-cabecalho`, no
   * `AdminClient`), medida e não escrita à mão: parte em duas linhas num ecrã
   * estreito.
   */
  const barraRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = barraRef.current;
    if (!el) return;
    const publicar = () =>
      document.documentElement.style.setProperty("--bo-passos", `${el.offsetHeight}px`);
    publicar();
    const ro = new ResizeObserver(publicar);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--bo-passos");
    };
  }, []);
  return (
    <nav
      ref={barraRef}
      aria-label="Passos da proposta"
      // Ao descer no telemóvel, sobe para o lugar do cabeçalho e fica compacta
      // (`ui/barras-que-encolhem.ts`, `admin.css`).
      data-passos-da-proposta=""
      className="sticky top-[var(--bo-cabecalho,0px)] z-10 -mx-1 mb-5 flex flex-nowrap items-center gap-1.5 overflow-x-auto border-b border-[var(--bo-hairline)] bg-[var(--bo-surface)] px-1 py-2 [scrollbar-width:none] [&>button]:shrink-0"
    >
      {PASSOS.map((p, i) => {
        const active = p === step;
        const estado = estados[p];
        const { sinal, cor } = SINAL_DO_ESTADO[estado];
        const nome = nomeDoPasso(p, organizacao);
        return (
          <Fragment key={p}>
            <button
              type="button"
              onClick={() => onSelect(p)}
              aria-current={active ? "step" : undefined}
              data-estado={estado}
              className={`alvo-toque gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-xs font-medium  inline-flex items-center ${
                active
                  ? "bg-sage-600 text-white"
                  : "text-foreground/50 hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-text)]"
              } ${ESTADO} ${PRESSAO}`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                  active
                    ? "bg-[var(--bo-surface)]/25 text-white"
                    : "bg-[var(--bo-tinta-10)] text-foreground/50"
                }`}
              >
                {i + 1}
              </span>
              {/* Um `span` só, com o rótulo INTEIRO lá dentro. Partir a frase
                  em pedaços dentro de um `inline-flex` põe cada pedaço na sua
                  própria coluna. */}
              <span className={active ? undefined : "max-sm:sr-only"}>{nome}</span>
              <span
                aria-hidden="true"
                className={`text-[11px] font-semibold ${active ? "text-white" : cor}`}
              >
                {sinal}
              </span>
              <span className="sr-only">, {FRASE_DO_ESTADO[estado]}</span>
            </button>
            {/* As setas saem no telemóvel: com cinco passos, eram elas que
                partiam a barra em duas linhas a 390 px. */}
            {i < PASSOS.length - 1 && (
              <span aria-hidden="true" className="text-foreground/20 max-sm:hidden">
                →
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
