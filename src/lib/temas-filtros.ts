import type { ThemeSummary } from "./theme-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS ÂMBITOS DA BIBLIOTECA DE TEMAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido do `docs/APPLE-TEMAS.md`, ponto 12 da auditoria: «"por usar" é
 * metadado sem filtro». A informação mais accionável da grelha — que temas
 * nunca saíram numa proposta — estava escrita em cada cartão e não havia
 * maneira de a usar para reduzir a lista. Ver 567 fotos em 28 temas para
 * descobrir a olho quais é que nunca foram usados é trabalho que o ecrã pode
 * fazer sozinho.
 *
 * Cinco âmbitos, e não um filtro por cada coluna do cartão: são as cinco
 * perguntas que se fazem a esta biblioteca (`Parte 1, ponto 12`).
 *
 * ── PORQUE É QUE ISTO É UM MÓDULO PURO ─────────────────────────────────────
 *
 * Porque as contagens aparecem ao lado do nome de cada âmbito («Por usar 4»),
 * e uma contagem errada num filtro é pior do que não haver filtro nenhum: ela
 * lê o número, escolhe o âmbito e conclui que o ecrã perdeu temas. Aqui
 * medem-se sem desenhar nada.
 *
 * ── O ARQUIVO CONTINUA A SER UMA VISTA, E NÃO UM FILTRO QUE SE SOMA ────────
 *
 * A regra já estava escrita no `Temas.tsx` («ou se está a ver o que se usa, ou
 * o que se pôs de lado») e não muda: os quatro primeiros âmbitos NUNCA mostram
 * um tema arquivado, e «Arquivados» só mostra esses. Misturar os dois devolvia
 * ao ecrã exactamente o que arquivar veio tirar de lá.
 */
export type Ambito = "todos" | "por-usar" | "este-ano" | "favoritos" | "arquivados";

/**
 * O que se sabe sobre o uso dos temas no instante em que se filtra.
 *
 * As duas contagens chegam DEPOIS dos cartões, num pedido próprio (ver
 * `temas-uso.ts`), e podem nunca chegar. `null` quer dizer «não se sabe» — e um
 * âmbito que não se sabe responder não se oferece, em vez de responder zero.
 * Zero é uma resposta, e seria falsa.
 */
export interface DadosDeUso {
  /** Em quantas propostas gravadas cada tema já saiu. */
  usos: Record<string, number> | null;
  /** O mesmo, contando só as propostas do ano corrente. */
  usosEsteAno: Record<string, number> | null;
}

export const AMBITOS: readonly { valor: Ambito; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "por-usar", rotulo: "Por usar" },
  { valor: "este-ano", rotulo: "Usados este ano" },
  { valor: "favoritos", rotulo: "Favoritos" },
  { valor: "arquivados", rotulo: "Arquivados" },
];

/** É um âmbito conhecido? Serve para validar o que vem do `localStorage`. */
export function eAmbito(v: unknown): v is Ambito {
  return typeof v === "string" && AMBITOS.some((a) => a.valor === v);
}

/**
 * Os dados que este âmbito precisa já chegaram?
 *
 * «Por usar» e «Usados este ano» são perguntas sobre as PROPOSTAS, e a
 * biblioteca desenha-se antes de elas serem lidas. Enquanto a resposta não
 * existe, o âmbito não se mostra — um filtro que devolve a lista inteira
 * porque ainda não sabe contar ensina a não confiar nos filtros.
 */
export function ambitoResponde(ambito: Ambito, dados: DadosDeUso): boolean {
  if (ambito === "por-usar") return dados.usos !== null;
  if (ambito === "este-ano") return dados.usosEsteAno !== null;
  return true;
}

/** Pertence este tema a este âmbito? */
function noAmbito(t: ThemeSummary, ambito: Ambito, dados: DadosDeUso): boolean {
  if (ambito === "arquivados") return !!t.arquivado;
  if (t.arquivado) return false;
  if (ambito === "todos") return true;
  if (ambito === "favoritos") return !!t.favorito;
  if (ambito === "por-usar") return (dados.usos?.[t.id] ?? 0) === 0;
  return (dados.usosEsteAno?.[t.id] ?? 0) > 0;
}

/** A lista reduzida ao âmbito. A ordem é a que vier — quem ordena é o ecrã. */
export function filtrarPorAmbito(
  temas: readonly ThemeSummary[],
  ambito: Ambito,
  dados: DadosDeUso,
): ThemeSummary[] {
  return temas.filter((t) => noAmbito(t, ambito, dados));
}

/**
 * Quantos temas tem cada âmbito — sobre a biblioteca TODA e não sobre o que a
 * procura deixou à vista.
 *
 * A razão é a mesma que já vale para o aviso dos temas parecidos: um número ao
 * lado de «Favoritos» que muda enquanto se escreve no campo de procura deixa
 * de ser o tamanho do âmbito e passa a ser uma segunda contagem da procura —
 * que já está dita, e uma vez, no estado da vista.
 */
export function contarPorAmbito(
  temas: readonly ThemeSummary[],
  dados: DadosDeUso,
): Record<Ambito, number> {
  const conta = {} as Record<Ambito, number>;
  for (const { valor } of AMBITOS) {
    conta[valor] = temas.reduce((n, t) => n + (noAmbito(t, valor, dados) ? 1 : 0), 0);
  }
  return conta;
}

/**
 * Os âmbitos que vale a pena mostrar, com a contagem de cada um.
 *
 * «Todos» está sempre. Os outros só aparecem quando têm alguma coisa lá
 * dentro — é a regra que o interruptor «Arquivados» já seguia neste ecrã antes
 * de haver âmbitos («senão seria um controlo a explicar uma funcionalidade que
 * ninguém ainda usou»), e é a mesma que a Apple pede para os menus de
 * contexto: esconder o que não está disponível em vez de o esbater.
 */
export function ambitosDisponiveis(
  temas: readonly ThemeSummary[],
  dados: DadosDeUso,
): { valor: Ambito; rotulo: string; contagem: number }[] {
  const conta = contarPorAmbito(temas, dados);
  return AMBITOS.filter(
    (a) => a.valor === "todos" || (ambitoResponde(a.valor, dados) && conta[a.valor] > 0),
  ).map((a) => ({ ...a, contagem: conta[a.valor] }));
}
