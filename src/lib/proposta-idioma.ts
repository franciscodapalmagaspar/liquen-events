import {
  ehIdiomaDaProposta,
  IDIOMA_POR_OMISSAO,
  type IdiomaDaProposta,
} from "@/lib/orcamento/listas-fechadas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EM QUE LÍNGUA É QUE ESTA PROPOSTA FOI FEITA?
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A pergunta é feita em cinco sítios — o email que leva a proposta, a página
 * onde o casal a aceita, o portal do cliente, o PDF do link do cliente e o PDF
 * do portal — e tem de ter sempre a mesma resposta. Por isso vive aqui, e não
 * espalhada por cinco `?? "pt"`: um esquecimento num deles é uma proposta
 * inglesa a sair em português por uma porta só, que é exactamente a avaria que
 * a língua gravada veio corrigir.
 *
 * ── AUSENTE É PORTUGUÊS, E NÃO É PREGUIÇA ─────────────────────────────────
 *
 * Todas as propostas anteriores a esta coluna foram escritas, desenhadas e
 * enviadas em português. Lê-las como portuguesas não é uma suposição: é o que
 * elas SÃO. É também o que garante que nada muda de comportamento — uma
 * proposta de ontem continua a ser respondida e descarregada exactamente como
 * era —, e é a razão de não haver migração nenhuma a escrever "pt" por cima de
 * linhas antigas: um `update` sobre a tabela inteira mexeria no `updated_at` de
 * propostas que ninguém tocou, e não acrescentava um único facto novo.
 *
 * ── E O QUE NÃO É UMA LÍNGUA TAMBÉM É PORTUGUÊS ───────────────────────────
 *
 * Uma base sem a restrição `proposals_idioma_chk`, uma cópia de segurança
 * restaurada à mão, um campo escrito por engano: o que não se sabe desenhar
 * vale o mesmo que a ausência. A alternativa era deixar um valor inventado
 * atravessar o email, a página do aceite e o PDF, e falhar em cada um deles de
 * uma maneira diferente.
 */
export function idiomaDaProposta(
  proposta?: { idioma?: unknown } | null | undefined,
): IdiomaDaProposta {
  const gravado = proposta?.idioma;
  return ehIdiomaDaProposta(gravado) ? gravado : IDIOMA_POR_OMISSAO;
}
