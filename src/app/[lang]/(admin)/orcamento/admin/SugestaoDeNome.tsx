"use client";

import { arrumarNomeDeTema, nomePrecisaDeArrumo } from "@/lib/tema-nome";
/* A escala de movimento da casa — ver `ui/movimento.ts` para o censo que a
   motivou. `ESTADO` são os 120 ms do degrau `micro` numa lista fechada de
   propriedades (nenhuma delas força *layout*); `PRESSAO` é o toque a 20 ms.
   As duas trazem `motion-safe:` — não há rede global no `globals.css`. */
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «QUERES DIZER "SEATING PLANS"?» — a sugestão, ao lado do campo
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A regra do corrector está no `tema-nome.ts` e é uma só: ele PROPÕE. Este
 * componente é a metade que faltava dessa frase — o sítio onde a proposta
 * aparece e onde se aceita com um clique.
 *
 * ── Porque é que não corrige sozinho ao gravar ────────────────────────────
 * Porque um nome é escolha de quem o escreve. Um tema pode chamar-se «lapelas»
 * de propósito, ou levar o nome de um espaço que o dicionário não conhece. Um
 * corrector que reescreve por baixo o que a dona acabou de escrever é usado uma
 * vez e evitado para sempre — e a seguir escreve-se tudo com medo.
 *
 * ── E porque é que aparece enquanto se escreve ────────────────────────────
 * Porque depois de gravar já é tarde: o nome errado ficou no índice pelo qual
 * ela procura, e a correcção passa a ser uma segunda tarefa que ninguém faz.
 * Aqui custa um clique, no momento em que a atenção já está no campo.
 *
 * Não é um erro e não se veste como tal: sem vermelho, sem ícone de aviso. É
 * uma sugestão, e o botão diz exactamente o que vai acontecer se for aceite.
 */
export function SugestaoDeNome({
  valor,
  onAceitar,
  className = "",
}: {
  valor: string;
  /** Recebe o nome já arrumado. Quem chama decide o que fazer com ele. */
  onAceitar: (arrumado: string) => void;
  className?: string;
}) {
  // Enquanto o campo está a meio de ser escrito, quase tudo «precisa de
  // arrumo»: «bouq» viraria «Bouq». Abaixo de três letras cala-se.
  if (valor.trim().length < 3 || !nomePrecisaDeArrumo(valor)) return null;
  const arrumado = arrumarNomeDeTema(valor);

  return (
    <p className={`mt-1.5 text-xs leading-relaxed text-[var(--bo-text-muted)] ${className}`}>
      Queres dizer{" "}
      <button
        type="button"
        /**
         * NÃO ROUBAR O FOCO AO CAMPO.
         *
         * No campo de RENOMEAR, o `onBlur` grava. Sem isto, carregar na
         * sugestão tirava o foco do campo primeiro, o `onBlur` gravava o nome
         * POR ARRUMAR e o clique chegava a um campo que já tinha fechado — a
         * sugestão parecia não fazer nada, e tinha acabado de gravar
         * exactamente o que ela queria corrigir.
         *
         * `preventDefault` no `mousedown` impede o blur; o `click` corre a
         * seguir, com o campo ainda em foco.
         */
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onAceitar(arrumado)}
        className={`font-medium text-sage-600 underline decoration-sage-600/35 underline-offset-2 ${ESTADO} ${PRESSAO} hover:decoration-sage-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-600/45 focus-visible:ring-offset-2 focus-visible:rounded-sm`}
      >
        «{arrumado}»
      </button>
      ? Os nomes dos temas são o índice por onde se procura.
    </p>
  );
}

export default SugestaoDeNome;
