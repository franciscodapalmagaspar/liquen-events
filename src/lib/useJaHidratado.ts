"use client";

import { useEffect, useSyncExternalStore, type RefObject } from "react";

/**
 * A PÁGINA JÁ GANHOU VIDA? — `false` no HTML do servidor, `true` depois de hidratar.
 *
 * Nasceu nos formulários dos anúncios (verificação do legal, 17/11, num browser
 * a sério): um toque em «Enviar» ANTES da hidratação não tinha `onSubmit` à
 * espera e seguia o caminho nativo do `<form>`, que é um GET. O nome, a data e o
 * contacto iam parar ao endereço (`/s/comporta?nome=…&contacto=…`) — ao
 * histórico do browser e aos registos do servidor —, e o pedido perdia-se.
 * Um `method="post"` não serve: as páginas dos anúncios são estáticas, e o Next
 * responde 405 a um POST numa página estática.
 *
 * Com o botão desligado até aqui, um toque cedo não faz nada, os campos ficam
 * preenchidos, e o toque seguinte (já com vida) envia como deve ser.
 *
 * `useSyncExternalStore` e não `useState` + `useEffect`: é a forma que o React
 * dá para «servidor diz uma coisa, browser diz outra» sem desencontro de
 * hidratação nem um desenho a mais.
 */
const nada = () => () => {};

export function useJaHidratado(): boolean {
  return useSyncExternalStore(
    nada,
    () => true,
    () => false,
  );
}

/**
 * O QUE ELA ESCREVEU ANTES DE HIDRATAR — lido do DOM, uma vez, ao montar.
 *
 * Um campo não controlado guarda sozinho o que se escreveu antes de a página
 * ganhar vida (o `FormData` lê-o do DOM). Um campo cujo DESENHO depende de
 * estado não: o React hidrata com o estado do servidor (vazio) e o que está
 * escrito fica sem dono — o telemóvel não segue no campo escondido, a data
 * fica transparente no toque. Isto devolve-lhe o valor (revisão de 17/11).
 */
export function useEscritoAntesDeHidratar(
  ref: RefObject<HTMLInputElement | null>,
  aoLer: (valor: string) => void,
): void {
  useEffect(() => {
    const escrito = ref.current?.value ?? "";
    if (escrito) aoLer(escrito);
    // Só ao montar: depois disso, quem manda é o `onChange`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
