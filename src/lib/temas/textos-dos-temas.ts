import type { ThemeSummary } from "@/lib/theme-types";

/**
 * As frases da Biblioteca de Temas que dependem de números e datas — puras.
 * (Saiu do topo do `Temas.tsx` na fase 8 de `docs/ESTRUTURA-DO-CODIGO.md`,
 * tal e qual.)
 */

/**
 * O que a pergunta de eliminar um tema diz, com os números.
 *
 * As FOTOGRAFIAS: a contagem pode ser desconhecida (pasta ilegível —
 * `imageCount === null`), um mínimo (`truncated`, «500+») ou zero (a pasta
 * está vazia), e as três versões têm de fazer sentido.
 *
 * As PROPOSTAS: `propostas` é o número que o cartão mostra (`usos`, sem os
 * rascunhos). Com zero não há nada a dizer; sem número (a contagem ainda não
 * chegou, ou falhou) fica a frase de antes, que continua verdadeira: ao
 * eliminar, o servidor copia para cada proposta as fotos que ela usa
 * (`theme-materializar.ts`), e é por isso que elas não mudam.
 */
export function fraseDeEliminar(
  t: Pick<ThemeSummary, "imageCount" | "truncated">,
  propostas: number | null,
): { fotos: string; propostas: string | null } {
  const n = t.imageCount;
  const fotos =
    t.imageCount === null
      ? "As fotografias que estiverem lá dentro vão com ele."
      : n === 0
        ? "A pasta está vazia: não leva nenhuma fotografia."
        : n === 1 && !t.truncated
          ? "Leva 1 fotografia com ele."
          : `Leva ${n}${t.truncated ? "+" : ""} fotografias com ele.`;
  const frasePropostas =
    propostas === null
      ? "As propostas já feitas com estas fotos não são afectadas."
      : propostas === 0
        ? null
        : propostas === 1
          ? "Está em 1 proposta — essa guarda as fotos que usa e não muda."
          : `Está em ${propostas} propostas — essas guardam as fotos que usam e não mudam.`;
  return { fotos, propostas: frasePropostas };
}

/**
 * "há 3 dias", "hoje" — a data como se fala, para o cartão poder dizer o que
 * está vivo e o que está parado sem gastar uma linha inteira com um formato
 * completo. Datas futuras (relógios trocados) contam como hoje, em vez de
 * dizerem "há -2 dias".
 */
/**
 * Quando foi mexido, como se diz — até um mês. Depois disso, a data.
 *
 * Ponto 13 da auditoria do `docs/APPLE-TEMAS.md`: «mantém o relativo e
 * acrescenta `title` com a data completa; a partir de 30 dias mostra a data».
 * «Há 2 meses» já não responde à pergunta de trabalho («foi antes ou depois do
 * casamento dos Ferreira?»), e dois temas com «há 1 ano» podem estar onze
 * meses afastados. Abaixo dos 30 dias o relativo é mais preciso do que a data
 * de relance; a partir daí é ao contrário.
 *
 * A data vai no formato da casa, `DD/MM/AAAA` (Parte 9.6 do sistema de
 * design), e não por extenso: está no fim de uma linha que trunca, e a
 * versão longa continua no `title` (`dataPorExtenso`).
 */
export function desdeQuando(iso: string | undefined, agora = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const dias = Math.floor((agora - t) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  return new Date(t).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * A data inteira, para o `title` de uma data relativa.
 *
 * «há 1 mês» é o que se lê de relance; «12 de agosto de 2026» é o que responde
 * quando a pergunta é «foi antes ou depois do casamento dos Ferreira?». As
 * duas, e não uma — é o ponto 13 da auditoria do `docs/APPLE-TEMAS.md` e a
 * última linha das proibições da Parte 9.
 *
 * Devolve `undefined` quando não há data ou ela não se deixa ler: um `title`
 * vazio é uma dica que aparece sem nada escrito.
 */
export function dataPorExtenso(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return undefined;
  return new Date(t).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Quantas fotos tem o tema, em português e sem mentir:
 * `null` = a pasta NÃO pôde ser lida (dizer "0 fotos" leria-se como "as minhas
 * fotos desapareceram"); `truncated` = a contagem bateu no teto do servidor,
 * portanto é um MÍNIMO ("500+ fotos").
 */
export function photoCountLabel(count: number | null, truncated?: boolean): string {
  if (count === null) return "Fotos indisponíveis";
  if (truncated) return `${count}+ fotos`;
  return plural(count, "foto", "fotos");
}
