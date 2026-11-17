"use client";

import { useDeferredValue } from "react";
import PainelDoEstudio from "../PainelDoEstudio";
import VistaDeConjunto from "../VistaDeConjunto";

/**
 * Os dois painéis que mostram o resultado do que se escreve — ADIADOS (10/11).
 *
 * O invólucro é que chama o `useDeferredValue`: no desenho urgente (a letra)
 * devolve o documento ANTERIOR, e o painel memorizado por dentro não tem nada
 * de novo para desenhar; a seguir, num desenho que o React pode interromper,
 * chega o documento novo. Chamado no estúdio, o mesmo gancho redesenhava o
 * estúdio inteiro duas vezes por letra (medido).
 */
export function VistaAdiada(props: React.ComponentProps<typeof VistaDeConjunto>) {
  const doc = useDeferredValue(props.doc);
  return <VistaDeConjunto {...props} doc={doc} />;
}

export function PainelAdiado(props: React.ComponentProps<typeof PainelDoEstudio>) {
  const doc = useDeferredValue(props.doc);
  const paginas = useDeferredValue(props.paginas);
  return <PainelDoEstudio {...props} doc={doc} paginas={paginas} />;
}
