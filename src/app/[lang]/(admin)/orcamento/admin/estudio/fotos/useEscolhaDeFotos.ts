"use client";
import { useState } from "react";
import { useSaidaDeUmSo } from "../../ui/saida";
import { type FotoRepetida } from "@/lib/orcamento/fotos-repetidas";
import type { DestinoDaFoto } from "../tipos";

export function useEscolhaDeFotos() {
  // Qual o destino das fotos escolhidas na biblioteca de temas (null = fechado).
  /** Para onde vai a fotografia que se escolher na biblioteca de temas. */
  const [picker, setPicker] = useState<DestinoDaFoto | null>(null);

  /* ── A BIBLIOTECA DE TEMAS TAMBÉM SE FECHA ────────────────────────────────
     Era a última folha da casa sem saída, e a única que precisava de uma
     alteração DESTE lado: as outras desapareciam por um `return null` próprio,
     esta desaparece porque o `picker` fica nulo aqui.

     O `ultimoPicker` existe porque a folha continua a desenhar-se durante os
     200 ms da saída e precisa de saber o que estava a mostrar — sem ele, lia
     `picker.kind` de um nulo. Guarda-se no desenho e não num efeito: num efeito
     o React já teria desenhado o nulo.

     E é o MESMO nó a sair, nunca um recriado: esta folha rouba o foco ao
     montar, e um nó novo a meio da saída roubava-o outra vez para uma caixa que
     já se está a apagar. */
  const aSairDoPicker = useSaidaDeUmSo(picker !== null);
  const [ultimoPicker, setUltimoPicker] = useState(picker);
  if (picker !== null && picker !== ultimoPicker) setUltimoPicker(picker);
  const pickerNoEcra = picker ?? (aSairDoPicker ? ultimoPicker : null);
  /** O que está a ser arrastado agora (identificador do dnd-kit), ou nada. */
  /** As fotos de biblioteca já usadas noutras propostas, com onde e quando. */
  const [repetidas, setRepetidas] = useState<FotoRepetida[]>([]);
  const [aArrastar, setAArrastar] = useState<string | null>(null);
  /** A fotografia aberta em grande: o board e a posição. */
  const [lupa, setLupa] = useState<{ bi: number; ii: number } | null>(null);

  return {
    aArrastar,
    lupa,
    picker,
    pickerNoEcra,
    repetidas,
    setAArrastar,
    setLupa,
    setPicker,
    setRepetidas,
  };
}
