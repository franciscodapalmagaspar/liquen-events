import { useCallback, useInsertionEffect, useRef } from "react";

/**
 * Uma função que NUNCA muda de identidade e chama sempre a versão mais recente
 * da que se lhe deu — o padrão que o React descreve como «event handler» que
 * não é dependência de nada (10/11).
 *
 * Serve para os componentes memorizados do estúdio (`memo`): uma prop que é uma
 * seta escrita no JSX (`onSaltar={(bi) => …}`) nasce nova a cada desenho e
 * deita o `memo` fora. Esta não. Como lê a versão actual no momento em que é
 * CHAMADA, nunca age com dados velhos — só não pode ser chamada durante o
 * desenho (é para acções do utilizador e efeitos, como qualquer `onClick`).
 */
export function useAccaoEstavel<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useInsertionEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
