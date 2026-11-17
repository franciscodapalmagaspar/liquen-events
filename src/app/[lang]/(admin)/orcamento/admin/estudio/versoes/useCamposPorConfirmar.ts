"use client";
import { useState } from "react";
import type { CampoAMudar } from "@/lib/proposal-copy";

export function useCamposPorConfirmar() {
  /**
   * Os campos que vieram de OUTRA proposta e ainda não foram confirmados.
   *
   * Depois de copiar, estes cinco são os únicos que mudam de casamento para
   * casamento — e são exactamente aqueles cujo erro só se descobre com o PDF
   * já enviado. Ficam marcados até ela lhes tocar.
   */
  const [porConfirmar, setPorConfirmar] = useState<Set<CampoAMudar>>(() => new Set());

  /**
   * O realce de um campo por confirmar, e a forma de o desmarcar.
   *
   * Laranja e não verde: é um AVISO de coisa por rever, não uma acção. O
   * `DESIGN-TOKENS.md` fixa esta regra para a página toda.
   *
   * ── E ACENDE-SE NUMA OCASIÃO SÓ ──────────────────────────────────────────
   *
   * Quando a proposta foi COPIADA DE OUTRA. É aí que os campos trazem mesmo o
   * casal de outra pessoa, e é a única forma de a duplicação fazer mal em vez
   * de bem: uma proposta enviada com o nome ou a data de outro casamento. Esse
   * caso fica marcado, e tem passeio próprio a guardá-lo.
   *
   * Acendia-se TAMBÉM ao abrir qualquer proposta, para assinalar o que o casal
   * tinha escrito no formulário do pedido. A intenção era boa e o resultado não
   * era: seis anéis à volta de seis campos, em todas as propostas, sempre — e
   * ela a ter de tocar num a um para os apagar. Palavras dela: «fica com essas
   * coisas à volta amarelas e eu quero tirar isso».
   *
   * Um aviso que está sempre ligado não é um aviso; é decoração que ensina a
   * não olhar. E o que ele marcava ali não era perigoso: os dados do formulário
   * são deste casal, estão certos, e ela lê-os no ecrã de qualquer maneira. O
   * perigo é o outro caso, e esse continua marcado.
   */
  /**
   * ── E UMA MARCA QUE NÃO É TINTA ────────────────────────────────────────
   *
   * A `bo-por-confirmar` não pinta nada — não tem regra nenhuma no CSS. É um
   * GANCHO, e existe por uma avaria concreta: o passeio
   * `e2e/proposta-fluxos.spec.ts` procurava estes campos por
   * `.ring-\[\#c98a2e\]\/45`, ou seja, pela COR. Quando a fase 03 do sistema
   * de design trocou o literal pelo token `--bo-aviso-tom`, o selector deixou
   * de casar, o passeio contou zero campos marcados e o CI ficou vermelho — não
   * porque o realce tivesse desaparecido, mas porque o teste estava a apontar
   * para a tinta em vez de apontar para o significado.
   *
   * Um teste amarrado à cor chumba a cada mudança de cor. Esta classe é o que
   * ele passa a procurar, e sobrevive à próxima.
   */
  const realce = (campo: CampoAMudar) =>
    porConfirmar.has(campo)
      ? "bo-por-confirmar rounded-lg ring-2 ring-[var(--bo-aviso-tom)]/45 ring-offset-2 ring-offset-white"
      : undefined;
  const confirmado = (campo: CampoAMudar) => {
    // Tocar-lhe É a confirmação. Um botão "confirmar" ao lado de cada campo
    // seria mais um clique para dizer o que o gesto já disse.
    setPorConfirmar((atual) => {
      if (!atual.has(campo)) return atual;
      const proximo = new Set(atual);
      proximo.delete(campo);
      return proximo;
    });
  };

  return { confirmado, realce, setPorConfirmar };
}
