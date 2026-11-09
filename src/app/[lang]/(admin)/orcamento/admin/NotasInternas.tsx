"use client";

import { useId, useRef, useState } from "react";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { useAlturaDoConteudo } from "./ui/altura-do-conteudo";

/**
 * O QUE SE SABE E NÃO SE ESCREVE AO CLIENTE.
 *
 * "Cliente da AMARA, cuidado com o prazo." "Recusaram em 2025 por preço."
 * "Margem apertada, não descer mais." São as frases que hoje vivem na cabeça de
 * quem escreveu a proposta, e que se perdem quando é outra pessoa a pegar nela
 * — ou quando são seis meses depois.
 *
 * ── PORQUE É QUE ISTO PARECE UM PAPEL AMARELO ──────────────────────────────
 * O aspecto é a garantia. Um campo com o mesmo desenho dos outros seria, mais
 * cedo ou mais tarde, confundido com um campo que sai na proposta — e a única
 * defesa contra isso não é um teste, é não se parecer com os outros. O teste
 * (em `proposal-doc-pdf.test.ts`) garante o resto: com e sem notas, o PDF
 * desenha exactamente as mesmas instruções.
 */

interface Props {
  valor: string;
  onChange: (v: string) => void;
  /** Rótulo alternativo, para as notas presas a uma secção. */
  titulo?: string;
  placeholder?: string;
  /** Compacta, para viver dentro de uma secção em vez de a encimar. */
  compacta?: boolean;
  /**
   * Vazia, fica fechada numa linha que se toca para escrever.
   *
   * Pedido dela de 9/11 («está uma confusão brutal»): cada secção do estúdio
   * tinha a sua caixa amarela ABERTA — seis caixas vazias a parecer campos por
   * preencher, no meio dos que saem na proposta. Fechada, continua à vista e
   * continua a dizer que é só para nós; abre-se quando há o que escrever, e
   * abre-se sozinha quando já tem uma nota.
   */
  fechadaSeVazia?: boolean;
}

export default function NotasInternas({
  valor,
  onChange,
  titulo = "Notas internas",
  placeholder = "O que precisas de lembrar sobre este negócio e nunca vai na proposta.",
  compacta = false,
  fechadaSeVazia = false,
}: Props) {
  const [aberta, setAberta] = useState(false);
  // O textarea cresce com o texto: uma nota de três linhas dentro de uma caixa
  // de uma linha lê-se por uma frincha, e o que não se relê não serve.
  const ref = useRef<HTMLTextAreaElement>(null);
  /**
   * ── O `id` TEM DE SER O MESMO NO SERVIDOR E NO NAVEGADOR ─────────────────
   *
   * Isto era `useState(() => \`notas-${idCurto()}\`)` — um id ALEATÓRIO,
   * sorteado uma vez no servidor e outra vez no cliente. O React desenhou
   * `htmlFor="notas-53c900b712"` no HTML e `notas-addc8e652c` na hidratação, e
   * respondeu com o erro que apanhou o E2E:
   *
   *   «A tree hydrated but some attributes of the server rendered HTML didn't
   *    match the client properties. This won't be patched up.»
   *
   * «This won't be patched up» é a parte que custa: o `htmlFor` fica a apontar
   * para um `id` que já não existe, portanto carregar no rótulo deixa de pôr o
   * cursor na caixa — e um leitor de ecrã deixa de saber como se chama o campo.
   *
   * O defeito estava escrito desde que o componente nasceu e nunca tinha
   * disparado, porque NINGUÉM O MONTAVA (era código morto — foi este ramo que
   * o pôs no estúdio). O `useId` é a resposta do React para exactamente isto:
   * um identificador estável, igual nos dois lados, único por instância.
   */
  const id = useId();

  // Cresce até 320 px, e só se mede quando se vê — ver `ui/altura-do-conteudo.ts`.
  useAlturaDoConteudo(ref, valor, { maximo: 320 });

  if (fechadaSeVazia && !aberta && !valor.trim()) {
    return (
      <button
        type="button"
        onClick={() => {
          setAberta(true);
          // O campo nasce no próximo desenho; o foco vai lá ter a seguir.
          requestAnimationFrame(() => ref.current?.focus());
        }}
        className={`alvo-toque mt-3 inline-flex items-baseline gap-1.5 rounded-md px-1 py-0.5 text-[11px] text-[var(--bo-aviso)] hover:bg-[var(--bo-aviso-lavagem)]/60 ${ESTADO} ${PRESSAO}`}
      >
        <span aria-hidden="true">✎</span>
        <span>{titulo}</span>
        <span className="text-[var(--bo-aviso)]/80">— só para ti, nunca sai na proposta</span>
      </button>
    );
  }

  return (
    <div
      className={`rounded-xl border border-[var(--bo-aviso-tom)]/30 bg-[var(--bo-aviso-lavagem)]/60 ${
        compacta ? "mt-3 p-3" : "mt-4 p-4"
      }`}
    >
      {/* ── O RÓTULO QUEBRA DE LINHA EM VEZ DE SE ESPREMER ────────────────
          Era uma fila sem `flex-wrap`: três filhos lado a lado, sem chão, sem
          quebra. Numa caixa estreita não há para onde ir e o texto parte-se
          letra a letra.

          MEDIDO num Chromium, no painel do estúdio que abre a partir do cartão
          de um cliente: com a janela a 1440, este rótulo tinha SEIS PÍXEIS — é
          o «S / ó / p / a / r / a» na vertical da fotografia que ela mandou. A
          2000 tinha 60, e dava os quatro degraus «Nota / sobre / as / capas».

          `flex-wrap` deixa a segunda metade da frase cair para a linha de
          baixo, que é o que uma frase faz quando não cabe; `min-w-0` no título
          deixa-o encolher sem empurrar; e `items-baseline` mantém o lápis
          alinhado com a letra quando há duas linhas.

          A causa de fundo — a coluna colapsada — está corrigida no
          `ProposalStudio`. Isto é a rede por baixo: mesmo que uma caixa volte a
          apertar, isto lê-se. */}
      <label
        htmlFor={id}
        className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[10px] font-medium tracking-[0.12em] uppercase text-[var(--bo-aviso)]"
      >
        <span aria-hidden="true">✎</span>
        <span className="min-w-0">{titulo}</span>
        <span className="font-normal normal-case tracking-normal text-[var(--bo-aviso)]">
          — só para ti, nunca sai na proposta
        </span>
      </label>
      <textarea
        id={id}
        ref={ref}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        rows={compacta ? 1 : 2}
        maxLength={4000}
        placeholder={placeholder}
        className="mt-2 w-full resize-none rounded-lg border border-[var(--bo-aviso-tom)]/25 bg-[var(--bo-surface)]/70 px-2.5 py-2 text-xs leading-relaxed text-[var(--bo-text)] placeholder:text-foreground/30 focus:border-[var(--bo-aviso-tom)]/60 focus:outline-none"
      />
    </div>
  );
}
