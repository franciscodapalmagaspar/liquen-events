/**
 * As acções de uma fotografia do mood board, pela ordem em que se leem.
 *
 * A MESMA lista para os dois caminhos (a barra do rato e a folha do dedo).
 * Duas listas seriam duas versões da verdade — a acção acrescentada num sítio
 * e esquecida no outro é a forma mais barata de o telemóvel voltar a ficar
 * para trás. Ver `AccoesDaFoto`.
 */
export type AccaoDaFoto = {
  id: string;
  rotulo: string;
  glifo: string;
  onAccao: () => void;
  desativada?: boolean;
  activa?: boolean;
  destrutiva?: boolean;
};

export type EntradaDasAccoes = {
  podeRecuar: boolean;
  podeAvancar: boolean;
  /** `undefined` = esta disposição não tem lugar de destaque; a acção não aparece. */
  principal?: boolean;
  seleccionada: boolean;
  onRecuar: () => void;
  onAvancar: () => void;
  onAmpliar: () => void;
  onSubstituir: () => void;
  onPrincipal: () => void;
  onSeleccionar: () => void;
  onRemover: () => void;
};

export function accoesDaFoto({
  podeRecuar,
  podeAvancar,
  principal,
  seleccionada,
  onRecuar,
  onAvancar,
  onAmpliar,
  onSubstituir,
  onPrincipal,
  onSeleccionar,
  onRemover,
}: EntradaDasAccoes): AccaoDaFoto[] {
  return [
    {
      id: "recuar",
      rotulo: "Mover para trás",
      glifo: "←",
      onAccao: onRecuar,
      desativada: !podeRecuar,
    },
    {
      id: "avancar",
      rotulo: "Mover para a frente",
      glifo: "→",
      onAccao: onAvancar,
      desativada: !podeAvancar,
    },
    { id: "ampliar", rotulo: "Ver em grande", glifo: "⤢", onAccao: onAmpliar },
    { id: "substituir", rotulo: "Trocar por outra fotografia", glifo: "⇄", onAccao: onSubstituir },
    ...(principal !== undefined
      ? [
          {
            id: "principal",
            rotulo: principal
              ? "Deixar de ser a fotografia do cartão"
              : "Fotografia do cartão (a primeira do tema no PDF)",
            glifo: "★",
            onAccao: onPrincipal,
            activa: principal,
          },
        ]
      : []),
    {
      id: "seleccionar",
      rotulo: seleccionada ? "Retirar da selecção" : "Escolher para mover em conjunto",
      glifo: "✓",
      onAccao: onSeleccionar,
      activa: seleccionada,
    },
    {
      id: "remover",
      rotulo: "Remover fotografia",
      glifo: "×",
      onAccao: onRemover,
      destrutiva: true,
    },
  ];
}

/**
 * A primeira acção que apaga leva um traço antes: é o que impede o toque
 * distraído em «Remover» quando se queria a linha de cima.
 */
export function ehPrimeiraDestrutiva(accoes: readonly AccaoDaFoto[], i: number): boolean {
  return !!accoes[i]?.destrutiva && !accoes.slice(0, i).some((x) => x.destrutiva);
}
