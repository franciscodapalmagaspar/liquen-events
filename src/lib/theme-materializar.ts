import "server-only";
import { getState, listStateByPrefix, setState } from "./app-state";
import { DRAFT_PREFIX, type StoredProposalDraft } from "./proposal-drafts";
import { listAllProposals, updateProposal } from "./proposals-store";
import {
  copyThemeImageToProposal,
  deleteThemeFolder,
  deleteThemeImage,
  levarFotoParaAReciclagem,
  themeFolder,
} from "./theme-storage";
import { caminhoDoRefDeTema, ehRefDeTema, themeIdOfPath } from "./theme-ref";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE TORNA A REFERÊNCIA SEGURA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Escolher uma foto da Biblioteca para um mood board deixou de copiar bytes
 * (ver `theme-ref.ts`). A cópia existia por uma razão certa e que não
 * desapareceu: **uma proposta já enviada a um casal não pode perder fotos
 * porque a Biblioteca foi arrumada.**
 *
 * A resposta não é copiar sempre — é copiar no único momento em que faz falta.
 * Antes de uma foto sair da Biblioteca, este módulo:
 *
 *   1. procura quem a referencia (propostas gravadas e rascunhos do estúdio);
 *   2. copia os bytes para a pasta de cada um deles;
 *   3. reescreve lá o caminho, de `tema:<x>` para `<pedido>/<uuid>.jpg`;
 *   4. só então diz a quem chamou que pode apagar.
 *
 * Se qualquer um destes passos falhar, responde que **não** pode apagar. Uma
 * eliminação recusada repete-se; uma foto perdida numa proposta enviada, não.
 *
 * ── Porque é que isto vive num ficheiro à parte ───────────────────────────
 * O `theme-storage.ts` não conhece propostas nem rascunhos, e não devia passar
 * a conhecer só por causa disto — é ele que o `proposals-store` e o
 * `proposal-storage` estão do outro lado de. Aqui a dependência corre num só
 * sentido: este módulo conhece os dois lados, e nenhum dos dois o conhece.
 */

/** Onde uma referência foi encontrada, e o que é preciso para lá lhe tocar. */
interface Portador {
  /** Para os registos: "proposta LIQ-2026-014" ou "rascunho do pedido abc". */
  descricao: string;
  /** A pasta do Storage onde a cópia tem de aterrar. */
  quoteId: string;
  /** O documento onde as referências estão. */
  doc: unknown;
  /**
   * Aplica as substituições e grava. `false` se a gravação falhou.
   *
   * Recebe o MAPA e não o documento já reescrito de propósito: quem grava pode
   * querer reler antes (é o caso do rascunho, que ela pode ter mexido noutro
   * separador entretanto) e aplicar as trocas à versão mais recente.
   */
  gravar: (substituicoes: Map<string, string>) => Promise<boolean>;
}

/**
 * Todas as referências `tema:` dentro de um documento do estúdio.
 *
 * Percorre o documento inteiro em vez de olhar só para `coverImages` e
 * `moodBoards`: uma varredura que conheça a forma do documento fica desatinada
 * no dia em que se acrescentar um sítio onde cabe uma foto, e o sintoma seria
 * uma proposta a perder imagens meses depois. Uma string que passe em
 * `ehRefDeTema` é uma referência, esteja onde estiver.
 */
export function refsDeTemaNoDoc(doc: unknown, encontradas = new Set<string>()): Set<string> {
  if (typeof doc === "string") {
    if (ehRefDeTema(doc)) encontradas.add(doc);
    return encontradas;
  }
  if (Array.isArray(doc)) {
    for (const v of doc) refsDeTemaNoDoc(v, encontradas);
    return encontradas;
  }
  if (doc && typeof doc === "object") {
    for (const v of Object.values(doc)) refsDeTemaNoDoc(v, encontradas);
  }
  return encontradas;
}

/**
 * O mesmo documento com cada referência trocada pelo que `substituicoes` disser.
 *
 * Devolve uma cópia — nada é mutado no sítio — e preserva a POSIÇÃO de tudo:
 * `coverImages` tem duas posições fixas e compactá-las trocaria a foto da
 * direita pela da esquerda (ver `normaliseCoverImages`).
 */
export function trocarRefsNoDoc(doc: unknown, substituicoes: Map<string, string>): unknown {
  if (typeof doc === "string") return substituicoes.get(doc) ?? doc;
  if (Array.isArray(doc)) return doc.map((v) => trocarRefsNoDoc(v, substituicoes));
  if (doc && typeof doc === "object") {
    const saida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(doc)) saida[k] = trocarRefsNoDoc(v, substituicoes);
    return saida;
  }
  return doc;
}

/** Propostas gravadas e rascunhos do estúdio, num só sítio. */
async function todosOsPortadores(): Promise<{ portadores: Portador[]; completo: boolean }> {
  const portadores: Portador[] = [];
  let completo = true;

  try {
    for (const p of await listAllProposals()) {
      if (!p.doc) continue;
      portadores.push({
        descricao: `proposta ${p.id}`,
        quoteId: p.quoteId,
        doc: p.doc,
        gravar: async (substituicoes) =>
          !!(await updateProposal(p.id, {
            doc: trocarRefsNoDoc(p.doc, substituicoes) as typeof p.doc,
          }).catch(() => null)),
      });
    }
  } catch (e) {
    log.error("materializar: não foi possível listar as propostas", e);
    completo = false;
  }

  const { entradas, completa } = await listStateByPrefix<StoredProposalDraft>(DRAFT_PREFIX);
  if (!completa) completo = false;
  for (const { key, value } of entradas) {
    if (!value || typeof value !== "object" || !("doc" in value)) continue;
    const quoteId = key.slice(DRAFT_PREFIX.length);
    if (!quoteId) continue;
    portadores.push({
      descricao: `rascunho do pedido ${quoteId}`,
      quoteId,
      doc: value.doc,
      gravar: async (substituicoes) => {
        try {
          // Relê antes de gravar: entre a varredura e agora ela pode ter
          // mexido no rascunho noutro separador, e escrever o que se leu há
          // dez segundos apagava esse trabalho. O que se preserva é sempre a
          // versão MAIS RECENTE, com as referências trocadas.
          // Uma leitura FALHADA lança (e responde «não gravou»): o `?? value`
          // só vale para «não há rascunho», nunca para «não o consegui ler».
          const actual = (await getState<StoredProposalDraft>(key, { ouFalha: true })) ?? value;
          // `setState` NÃO lança quando a escrita é recusada — dizia-o só nos
          // registos. Este `return true` era, por isso, uma promessa que não
          // tinha como saber se era verdade, e o que ela autoriza a seguir é
          // APAGAR as fotos do Storage. Um rascunho que ficou por reescrever com
          // as fotos já apagadas é um mood board com buracos que ninguém volta a
          // conseguir explicar. Passa a responder o que o `app-state` respondeu.
          const { gravado } = await setState(key, {
            ...actual,
            doc: trocarRefsNoDoc(actual.doc, substituicoes),
          });
          return gravado;
        } catch {
          return false;
        }
      },
    });
  }
  return { portadores, completo };
}

export interface ResultadoMaterializacao {
  /** `true` se é seguro apagar as fotos do Storage. */
  ok: boolean;
  /** Quantas cópias foram feitas (0 no caso normal: ninguém referenciava). */
  copiadas: number;
  /** Quantos documentos foram reescritos. */
  documentos: number;
}

/**
 * Põe a salvo tudo o que referencia as fotos que `interessa` aceitar, e diz se
 * se pode apagar.
 *
 * Um PREDICADO e não uma lista de caminhos porque os dois chamadores fazem
 * perguntas de forma diferente: apagar uma foto conhece o caminho exacto;
 * eliminar um tema quer a pasta INTEIRA — e listá-la para depois comparar
 * caminho a caminho tinha uma janela pela qual uma foto podia escapar (uma
 * página a mais, uma foto carregada entretanto). A pergunta "és desta pasta?"
 * não tem essa janela.
 *
 * O caso normal é o barato: nenhuma proposta referencia a foto, não há cópia
 * nenhuma a fazer, e isto custa uma listagem de propostas mais uma varredura
 * de rascunhos — numa operação que ela faz à mão, uma vez.
 *
 * Nunca lança. Devolve `ok: false` sempre que não conseguir GARANTIR que
 * ninguém fica a perder — incluindo quando não conseguiu sequer olhar.
 */
export async function materializarAntesDeApagar(
  interessa: (themePath: string) => boolean,
): Promise<ResultadoMaterializacao> {
  const { portadores, completo } = await todosOsPortadores();
  if (!completo) {
    log.error("materializar: varredura incompleta — eliminação recusada");
    return { ok: false, copiadas: 0, documentos: 0 };
  }

  let copiadas = 0;
  let documentos = 0;
  for (const portador of portadores) {
    const usadas = [...refsDeTemaNoDoc(portador.doc)].filter((r) =>
      interessa(caminhoDoRefDeTema(r)),
    );
    if (usadas.length === 0) continue;

    const substituicoes = new Map<string, string>();
    for (const ref of usadas) {
      const copia = await copyThemeImageToProposal(caminhoDoRefDeTema(ref), portador.quoteId);
      if (!copia?.path) {
        log.error("materializar: cópia de salvaguarda falhou — eliminação recusada", null, {
          ref,
          onde: portador.descricao,
        });
        return { ok: false, copiadas, documentos };
      }
      substituicoes.set(ref, copia.path);
      copiadas++;
    }

    const gravou = await portador.gravar(substituicoes);
    if (!gravou) {
      log.error("materializar: documento não gravado — eliminação recusada", null, {
        onde: portador.descricao,
      });
      return { ok: false, copiadas, documentos };
    }
    documentos++;
    log.warn("materializar: fotos copiadas para preservar um documento", {
      onde: portador.descricao,
      fotos: usadas.length,
    });
  }
  return { ok: true, copiadas, documentos };
}

// ── As duas portas por onde uma foto sai da Biblioteca ─────────────────────
//
// São ESTAS que as rotas chamam, e nunca o `deleteThemeImage` /
// `deleteThemeFolder` directamente. A razão é simples: quem escrever a
// terceira rota que apaga fotos não tem de se lembrar da salvaguarda, porque
// ela não é um passo à parte — é a única forma de apagar.
// `AcessoAoStorage.contrato.test.ts` é o que impede que essa porta reapareça.

/** Apaga UMA foto, depois de pôr a salvo quem a referencia. */
export async function apagarFotoDaBiblioteca(
  path: string,
): Promise<{ ok: boolean; motivo?: "referencias" }> {
  const salvo = await materializarAntesDeApagar((p) => p === path);
  if (!salvo.ok) return { ok: false, motivo: "referencias" };
  return { ok: await deleteThemeImage(path) };
}

/** Esvazia a pasta de um tema, depois de pôr a salvo quem referencia
 *  QUALQUER foto lá de dentro. */
export async function apagarPastaDaBiblioteca(
  themeId: string,
): Promise<{ ok: boolean; removed: number; motivo?: "referencias" }> {
  const pasta = themeFolder(themeId);
  if (!pasta) return { ok: false, removed: 0 };
  const salvo = await materializarAntesDeApagar((p) => themeIdOfPath(p) === pasta);
  if (!salvo.ok) return { ok: false, removed: 0, motivo: "referencias" };
  return deleteThemeFolder(themeId);
}

// ── E as duas portas da Reciclagem (fase R3b de `docs/TUDO-REVERSIVEL.md`) ──
//
// A mesma salvaguarda, antes de a foto (ou o tema) sair de vista. As propostas
// ficam com a sua cópia, como ficavam ao apagar; e ao repor continuam com ela.

/** Leva UMA foto para a Reciclagem, depois de pôr a salvo quem a referencia. */
export async function guardarFotoNaReciclagem(
  path: string,
  destino: string,
): Promise<{ ok: boolean; motivo?: "referencias" }> {
  const salvo = await materializarAntesDeApagar((p) => p === path);
  if (!salvo.ok) return { ok: false, motivo: "referencias" };
  return { ok: await levarFotoParaAReciclagem(path, destino) };
}

/** Põe a salvo quem referencia QUALQUER foto do tema, antes de o tema ir para
 *  a Reciclagem. As fotos ficam onde estão: só a linha do tema sai. */
export async function salvarAntesDeReciclarOTema(themeId: string): Promise<boolean> {
  const pasta = themeFolder(themeId);
  if (!pasta) return false;
  return (await materializarAntesDeApagar((p) => themeIdOfPath(p) === pasta)).ok;
}
