import "server-only";
import { getState, setState } from "./app-state";
import type { ProposalDoc, ServiceGroup, MoodBoard } from "./proposal-doc";

/**
 * MODELOS DE PROPOSTA — "Casamento standard", "Só decoração de mesas".
 *
 * ── Onde ficam, e porquê aqui ─────────────────────────────────────────────
 * Na tabela `app_state`, que já existe e é exatamente isto: uma chave para um
 * valor JSON. É a mesma decisão (e a mesma razão) dos rascunhos do estúdio em
 * `proposal-drafts.ts`: um modelo tem alguns KB — guarda caminhos de fotos,
 * não bytes — e não vale um passo manual de SQL numa instalação já a
 * funcionar. Uma tabela nova obrigaria a correr um `create table` à mão antes
 * de a funcionalidade servir para alguma coisa, e uma funcionalidade que só
 * arranca depois de alguém abrir o painel do Supabase é uma funcionalidade que
 * não existe.
 *
 * ── Três tipos, uma lista ─────────────────────────────────────────────────
 * A missão pede modelos completos E modelos parciais (só um grupo de serviços,
 * só um mood board). São a mesma ideia com tamanhos diferentes, por isso vivem
 * na mesma lista com um campo `tipo` — em vez de três listas que se podem
 * dessincronizar e três sítios para procurar.
 *
 * ── Nunca lança ───────────────────────────────────────────────────────────
 * `app-state` regista a falha e devolve null. Sem base de dados, a lista de
 * modelos aparece vazia e o resto do estúdio funciona — degrada, não bloqueia.
 */

export type TipoModelo = "completo" | "grupo" | "moodboard";

export interface ModeloProposta {
  id: string;
  /** O nome que ELA deu. É por aqui que o encontra outra vez. */
  nome: string;
  tipo: TipoModelo;
  criadoEm: string;
  /** De que proposta saiu, para se poder dizer "a partir do casamento de …". */
  origem?: string;
  /** `tipo: "completo"` — o documento inteiro. */
  doc?: ProposalDoc;
  /** `tipo: "grupo"` — um grupo de serviços. */
  grupo?: ServiceGroup;
  /** `tipo: "moodboard"` — um mood board. */
  moodboard?: MoodBoard;
}

const CHAVE = "proposal-templates";

/**
 * Tectos.
 *
 * Isto vive todo numa LINHA de `app_state`: cada leitura traz a lista inteira
 * e cada gravação reescreve-a. Sem tecto, um ano de "guardar como modelo"
 * transforma uma linha de base de dados num objecto de megabytes que é lido a
 * cada abertura do estúdio. 60 modelos é muito mais do que qualquer pessoa
 * consegue distinguir numa lista; o tecto de bytes é a rede para o caso de um
 * modelo completo com muitos mood boards.
 */
export const MAX_MODELOS = 60;
export const MAX_BYTES = 512 * 1024;

function tamanho(v: unknown): number {
  try {
    return JSON.stringify(v).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Descarta o que não tem a forma de um modelo, em vez de confiar no JSON. */
function saoModelos(v: unknown): ModeloProposta[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (m): m is ModeloProposta =>
      !!m &&
      typeof m === "object" &&
      typeof (m as ModeloProposta).id === "string" &&
      typeof (m as ModeloProposta).nome === "string" &&
      ["completo", "grupo", "moodboard"].includes((m as ModeloProposta).tipo),
  );
}

export async function listarModelos(): Promise<ModeloProposta[]> {
  return saoModelos(await getState<unknown>(CHAVE));
}

export class ModeloDemasiadoGrande extends Error {}
export class DemasiadosModelos extends Error {}

/**
 * Guarda um modelo. Um `id` já existente SUBSTITUI — é o que faz "guardar por
 * cima do meu Casamento standard" funcionar sem criar um segundo com o mesmo
 * nome.
 */
export async function guardarModelo(modelo: ModeloProposta): Promise<ModeloProposta[]> {
  if (tamanho(modelo) > MAX_BYTES) throw new ModeloDemasiadoGrande();
  // Para mudar: uma leitura falhada lança, nunca grava uma lista vazia por
  // cima dos modelos que lá estão (auditoria de 13/11).
  const atuais = saoModelos(await getState<unknown>(CHAVE, { ouFalha: true }));
  const semEste = atuais.filter((m) => m.id !== modelo.id);
  if (semEste.length >= MAX_MODELOS) throw new DemasiadosModelos();
  // Mais recente primeiro: é a ordem em que são úteis.
  const lista = [modelo, ...semEste];
  await setState(CHAVE, lista);
  return lista;
}

export async function apagarModelo(id: string): Promise<ModeloProposta[]> {
  const lista = saoModelos(await getState<unknown>(CHAVE, { ouFalha: true })).filter(
    (m) => m.id !== id,
  );
  await setState(CHAVE, lista);
  return lista;
}
