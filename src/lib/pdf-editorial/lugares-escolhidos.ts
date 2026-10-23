import type { FotosDeUmaPagina } from "@/lib/proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TROCAR E ENQUADRAR UMA FOTOGRAFIA NUM LUGAR DE UMA PÁGINA DO PDF
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela de 23/10: escolher as fotografias da página «Paleta e ambiente»
 * e ajustar a posição de cada foto escolhida, em qualquer página. A ordem conta:
 * cada posição de `fotos` é um LUGAR da página (na paleta, os cinco quadrados e
 * o painel grande no sexto), `""` é «este lugar fica automático», e `focos[k]`
 * é o enquadramento da foto do lugar `k`. É o que `montar.ts` lê.
 *
 * Puro, para o estúdio não ter a regra escondida num componente de 14 000
 * linhas.
 */

type Foco = { x: number; y: number };

/**
 * Põe `ref` no lugar `k`. Na paleta (`porLugar`) os outros lugares ficam como
 * estavam — automáticos (`""`) ou os dela. Nas outras páginas fica fixado o que
 * lá se via (`agora`), como sempre foi, e os vazios saem. A foto nova começa
 * com o enquadramento automático.
 */
export function trocarNoLugar(
  dela: FotosDeUmaPagina | undefined,
  agora: readonly (string | null)[],
  k: number,
  ref: string,
  max: number,
  porLugar: boolean,
): FotosDeUmaPagina {
  const lugar = Math.min(Math.max(0, k), max - 1);
  const fotos = porLugar
    ? Array.from({ length: max }, (_, i) => dela?.fotos[i] ?? "")
    : agora.slice(0, max).map((f) => f ?? "");
  while (fotos.length <= lugar) fotos.push("");
  const mudou = fotos[lugar] !== ref;
  fotos[lugar] = ref;
  const focos = fotos.map((_, i) => dela?.focos?.[i] ?? null);
  if (mudou) focos[lugar] = null;
  const ficam = porLugar ? fotos.map((_, i) => i) : fotos.flatMap((f, i) => (f.trim() ? [i] : []));
  return arrumar(
    ficam.map((i) => fotos[i]),
    ficam.map((i) => focos[i]),
  );
}

/**
 * O enquadramento do lugar `k` (`null` = o automático). Enquadrar uma foto que
 * o sistema escolheu FIXA-A nesse lugar — senão o enquadramento ficava preso a
 * uma fotografia que o PDF podia trocar. Sem fotografia no lugar, nada muda.
 */
export function enquadrarNoLugar(
  dela: FotosDeUmaPagina | undefined,
  agora: readonly (string | null)[],
  k: number,
  foco: Foco | null,
): FotosDeUmaPagina | null {
  const ref = agora[k];
  if (!ref) return null;
  const n = Math.max(dela?.fotos.length ?? 0, agora.length, k + 1);
  const fotos = Array.from({ length: n }, (_, i) =>
    dela ? (dela.fotos[i] ?? "") : (agora[i] ?? ""),
  );
  fotos[k] = ref;
  const focos = fotos.map((_, i) => dela?.focos?.[i] ?? null);
  focos[k] = foco;
  return arrumar(fotos, focos);
}

/** Sem `focos` quando nenhum lugar tem enquadramento dela. */
function arrumar(fotos: string[], focos: (Foco | null)[]): FotosDeUmaPagina {
  return focos.some(Boolean) ? { fotos, focos } : { fotos };
}
