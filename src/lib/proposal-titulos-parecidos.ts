import type { ProposalDoc } from "./proposal-doc";
import { temasComPagina } from "./pdf-editorial/plano";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DUAS PÁGINAS COM O MESMO NOME, UMA A SEGUIR À OUTRA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «páginas 6 e 7 dos mood boards: "Complementos Dos Noivos" e
 * "Complementos Noivos". Uma é bouquet, outra lapelas — mas na proposta
 * aparecem dois títulos praticamente idênticos seguidos».
 *
 * ── Porque é que isto não se vê a escrever ────────────────────────────────
 *
 * Porque os dois títulos são escritos com dias de intervalo, em cartões
 * dobrados, longe um do outro na página. Cada um, sozinho, está certo. O que
 * está errado só existe quando os dois se põem lado a lado — e o sítio onde
 * isso acontece pela primeira vez é o PDF, no índice, com o casal a lê-lo.
 *
 * ── E porque é que não é um erro ──────────────────────────────────────────
 *
 * Porque pode ser de propósito: «Mesas — 1» e «Mesas — 2» é uma decisão, e não
 * um descuido. Isto NÃO trava nada e não pinta nada de vermelho; diz o que
 * viu, ao lado dos dois títulos, e deixa-a decidir. Um aviso que trava uma
 * escolha legítima ensina-se a ignorar, e o próximo — o que interessa —
 * ignora-se com ele.
 *
 * ── O que conta como «parecido» ───────────────────────────────────────────
 *
 * Não é uma distância de edição. «Complementos Dos Noivos» e «Complementos
 * Noivos» diferem em quatro letras e uma palavra inteira; «Cerimónia» e
 * «Cerimónias» diferem numa letra e são o mesmo problema; «Mesa 1» e «Mesa 2»
 * diferem numa letra e NÃO são problema nenhum.
 *
 * O que separa os três casos é o que sobra depois de tirar o que não distingue:
 * acentos, maiúsculas, pontuação e as palavras vazias da língua («de», «dos»,
 * «da», «e», «o»). O que fica é o conjunto de palavras COM significado. Se dois
 * títulos ficam com exactamente o mesmo conjunto, lêem-se como o mesmo nome —
 * e é isso, e só isso, que aqui se diz.
 *
 * «Mesa 1» e «Mesa 2» sobrevivem porque os números não são palavras vazias:
 * ficam `{mesa, 1}` e `{mesa, 2}`, que são conjuntos diferentes.
 */

/**
 * O que sobra de um nome depois de tirar o que não o distingue.
 *
 * Vive em `essencia-do-nome.ts` porque tem DOIS clientes que não se conhecem:
 * os títulos das páginas de inspiração (aqui) e os nomes dos temas da
 * biblioteca (`temas-parecidos.ts`). É a mesma pergunta — «isto lê-se como
 * aquilo?» — e duas cópias eram duas oportunidades de só uma delas ganhar a
 * palavra vazia que faltava.
 */
export { essenciaDoNome as essenciaDoTitulo } from "./essencia-do-nome";
import { essenciaDoNome as essenciaDoTitulo } from "./essencia-do-nome";

export interface TitulosParecidos {
  /** Os índices REAIS no `doc.moodBoards`, pela ordem em que as páginas saem. */
  bis: number[];
  /** Os títulos como ela os escreveu — é assim que o aviso os cita. */
  titulos: string[];
}

/**
 * Os grupos de páginas de inspiração cujos títulos se lêem como o mesmo nome.
 *
 * Só as páginas que chegam a SAIR: uma página sem fotografias não é impressa, e
 * acusar um choque com uma folha que não existe é mandar corrigir o que
 * ninguém vai ler.
 *
 * Um título vazio nunca entra. Há um aviso próprio para «página sem título», e
 * são coisas diferentes — juntá-las dava «estas três páginas têm o mesmo nome»
 * sobre três páginas que não têm nome nenhum.
 */
export function titulosParecidos(doc: ProposalDoc): TitulosParecidos[] {
  const boards = doc.moodBoards ?? [];
  const porEssencia = new Map<string, number[]>();

  for (const bi of temasComPagina(doc)) {
    const titulo = (boards[bi]?.title ?? "").trim();
    if (!titulo) continue;
    const chave = essenciaDoTitulo(titulo);
    if (!chave) continue;
    const lista = porEssencia.get(chave);
    if (lista) lista.push(bi);
    else porEssencia.set(chave, [bi]);
  }

  return [...porEssencia.values()]
    .filter((bis) => bis.length > 1)
    .map((bis) => ({
      bis,
      titulos: bis.map((bi) => (boards[bi]?.title ?? "").trim()),
    }));
}

/**
 * O aviso que uma página vê sobre si própria, ou `null`.
 *
 * Escrito na segunda pessoa do que ela está a fazer, e a citar o OUTRO título:
 * «"Complementos Noivos" lê-se como esta». Dizer só «há títulos parecidos»
 * obrigava a procurar qual.
 */
export function avisoDeTituloParecido(doc: ProposalDoc, bi: number): string | null {
  const grupo = titulosParecidos(doc).find((g) => g.bis.includes(bi));
  if (!grupo) return null;
  const outros = grupo.titulos.filter((_, i) => grupo.bis[i] !== bi);
  if (outros.length === 0) return null;
  const lista =
    outros.length === 1
      ? `«${outros[0]}»`
      : `${outros
          .slice(0, -1)
          .map((t) => `«${t}»`)
          .join(", ")} e «${outros[outros.length - 1]}»`;
  return outros.length === 1
    ? `${lista} lê-se como esta página. No documento ficam dois títulos quase iguais seguidos.`
    : `${lista} lêem-se como esta página. No documento ficam títulos quase iguais seguidos.`;
}
