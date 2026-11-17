import "server-only";
import { createRepository, type Mapper } from "./repository";
import { isUniqueViolation } from "./invoices-store";

/**
 * Notas da equipa + meta de receita da Visão Geral — guardadas no SERVIDOR.
 *
 * Até aqui os dois campos viviam no `localStorage` do browser que os escreveu:
 * o ecrã prometia "notas partilhadas com a equipa" e entregava um bloco de
 * notas privado, invisível no telemóvel e apagado com o histórico. Passam a ser
 * duas linhas numa tabela, como qualquer outro dado do back office.
 *
 * ── Uma LINHA POR CAMPO, não uma linha com dois campos ────────────────────
 * As notas e a meta mudam em alturas diferentes e por razões diferentes.
 * Partilhar uma linha significaria partilhar um número de versão: escrever a
 * meta no telemóvel invalidaria as notas abertas no portátil e provocaria um
 * conflito onde não há nenhum. Duas linhas, dois `revision` independentes.
 *
 * ── `revision`: compare-and-set VISÍVEL ───────────────────────────────────
 * Quem grava diz sobre que revisão escreveu. Se entretanto outra pessoa (ou o
 * outro dispositivo dela) gravou, a revisão já não bate certo e a escrita é
 * RECUSADA com {@link StaleWriteError} — que transporta a versão do servidor,
 * para o ecrã poder mostrar as duas e deixar a decisão a quem escreveu. O
 * contrário — o último a gravar ganha — apagaria texto alheio sem que ninguém
 * desse por isso, que é exactamente o defeito que este módulo vem corrigir.
 *
 * O `touch: true` do mapper acrescenta a segunda tranca, mais abaixo: a escrita
 * no Supabase só passa se o `updated_at` ainda for o que foi lido, o que fecha
 * a janela entre o nosso `get` e o nosso `update` (duas gravações legítimas na
 * MESMA revisão, à mesma milésima). O `Repository.updateWith` volta a ler e a
 * tentar; à segunda volta a revisão já não bate certo e o conflito aparece à
 * frente do utilizador em vez de se dissolver.
 */

export const OVERVIEW_FIELDS = ["notas", "meta"] as const;
export type OverviewFieldId = (typeof OVERVIEW_FIELDS)[number];

/** Tecto do texto das notas (caracteres). Generoso, mas limitado. */
export const MAX_NOTES = 20_000;
/** Tecto da meta de receita, em euros. */
export const MAX_GOAL = 10_000_000;

export interface OverviewField {
  id: OverviewFieldId;
  /** Texto das notas, ou a meta em euros escrita como texto ("15000"). */
  value: string;
  /** Sobe 1 a cada gravação aceite. 0 = nunca foi gravado. */
  revision: number;
  updatedAt: string;
}

export type OverviewSnapshot = Record<OverviewFieldId, OverviewField>;

/** Data de uma linha que ainda não existe — nunca "agora", que seria mentira. */
const NUNCA_GRAVADO = "1970-01-01T00:00:00.000Z";

export function isOverviewFieldId(v: unknown): v is OverviewFieldId {
  return typeof v === "string" && (OVERVIEW_FIELDS as readonly string[]).includes(v);
}

/** O campo tal como existe antes da primeira gravação: vazio, revisão 0. */
export function emptyField(id: OverviewFieldId): OverviewField {
  return { id, value: "", revision: 0, updatedAt: NUNCA_GRAVADO };
}

/**
 * A gravação assentava numa versão que já não é a actual. Leva a versão do
 * servidor para que o chamador a possa mostrar — perder o texto de alguém em
 * silêncio não é uma opção.
 */
export class StaleWriteError extends Error {
  readonly current: OverviewField;
  constructor(current: OverviewField) {
    super(`Gravação sobre uma versão antiga de "${current.id}" (revisão ${current.revision})`);
    this.name = "StaleWriteError";
    this.current = current;
  }
}

export const mapper: Mapper<OverviewField, "overview_settings"> = {
  table: "overview_settings",
  fileName: "overview-settings.json",
  getId: (f) => f.id,
  toRow: (f) => ({
    id: f.id,
    value: f.value,
    revision: f.revision,
    updated_at: f.updatedAt,
  }),
  fromRow: (r) => ({
    id: String(r.id ?? "") as OverviewFieldId,
    // Uma coluna nula ou de outro tipo lê-se como "" — nunca como "null".
    value: typeof r.value === "string" ? r.value : "",
    revision: Number.isFinite(Number(r.revision)) ? Number(r.revision) : 0,
    updatedAt: String(r.updated_at ?? NUNCA_GRAVADO),
  }),
  order: { column: "id", ascending: true },
  fileCompare: (a, b) => a.id.localeCompare(b.id),
  // Compare-and-set no `updated_at`, além do nosso `revision` (ver cabeçalho).
  touch: true,
};

const repo = createRepository(mapper);

/**
 * Os dois campos, sempre ambos: uma linha que ainda não existe devolve-se
 * vazia com revisão 0, para o cliente ter sempre uma base sobre a qual gravar.
 */
export async function readOverviewSettings(): Promise<OverviewSnapshot> {
  const stored = await repo.list();
  const snapshot: OverviewSnapshot = { notas: emptyField("notas"), meta: emptyField("meta") };
  for (const field of stored) {
    if (isOverviewFieldId(field.id)) snapshot[field.id] = field;
  }
  return snapshot;
}

/**
 * Grava um campo SE `baseRevision` ainda for a revisão actual.
 *
 * @throws {StaleWriteError} quando não for — com a versão do servidor dentro.
 */
export async function saveOverviewField(
  id: OverviewFieldId,
  value: string,
  baseRevision: number,
): Promise<OverviewField> {
  const current = await repo.get(id);

  // Primeira gravação de sempre: só é aceite a quem diz estar a escrever sobre
  // o vazio (revisão 0). Quem julga estar na revisão 3 leu outra coisa.
  if (!current) {
    if (baseRevision !== 0) throw new StaleWriteError(emptyField(id));
    const created: OverviewField = {
      id,
      value,
      revision: 1,
      updatedAt: new Date().toISOString(),
    };
    try {
      await repo.create(created);
      return created;
    } catch (err) {
      // Dois dispositivos a estrear o campo ao mesmo tempo: o segundo insert
      // bate na chave primária. É um conflito, não uma avaria.
      if (!isUniqueViolation(err)) throw err;
      throw new StaleWriteError((await repo.get(id)) ?? emptyField(id));
    }
  }

  const saved = await repo.updateWith(id, (fresh) => {
    if (fresh.revision !== baseRevision) throw new StaleWriteError(fresh);
    return {
      ...fresh,
      value,
      revision: fresh.revision + 1,
      updatedAt: new Date().toISOString(),
    };
  });

  // A linha existia no `get` e desapareceu antes do update (só por intervenção
  // externa). Tratado como conflito: o cliente relê e decide, nada é apagado.
  if (!saved) throw new StaleWriteError(emptyField(id));
  return saved;
}
