import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { log } from "./logger";

// NOTE: `list()` is intentionally UNBOUNDED by default. A blanket row cap was
// tried but reverted: consumers like the "full backup" export, the admin stats
// pipeline, and the daily digest expect the COMPLETE table, and an ascending-
// ordered table (the calendar) would drop the most-recent/upcoming rows first —
// both are silent data loss the operator can't see. A cap only makes sense with
// real pagination. A per-entity `Mapper.listLimit` opt-in remains for a future
// bounded/paginated reader; when set, hitting it logs a warning (never silent).

/**
 * Unified data-access layer.
 *
 * Every entity is persisted through a single `Repository<T>` that hides the
 * "Supabase when configured, else a local JSON file (dev)" decision and the
 * CRUD plumbing that used to be copy-pasted into each store. The only
 * per-entity logic lives in a small `Mapper<T>`:
 *
 *   - toRow / fromRow  translate between the camelCase domain object and the
 *     snake_case database row (the bug-prone part — unit tested per store).
 *   - order / fileCompare  keep Supabase and the file fallback sorted alike.
 *
 * The Supabase backend handles the database row shape; the file backend stores
 * domain objects verbatim. Both satisfy the same `Backend<T>` contract, so the
 * Repository (and the update read-merge-write) is written and tested once.
 */
export interface Mapper<T> {
  /** Supabase table name. */
  table: string;
  /** JSON file name under data/ for the dev fallback. */
  fileName: string;
  /** Stable identity of an entity. */
  getId(entity: T): string;
  /**
   * A COLUNA onde essa identidade vive na base de dados. Omissão: `"id"`.
   *
   * ── PORQUE É QUE ISTO TEVE DE EXISTIR ─────────────────────────────────
   * Estava escrito `"id"` à mão em quatro sítios deste ficheiro. Onze das doze
   * tabelas chamam-lhe mesmo `id` — o `email-templates-store` até guarda o
   * slug nessa coluna de propósito, com a razão escrita — e a décima segunda,
   * `biblioteca_fotos`, tem `path text primary key` e NENHUMA coluna `id`.
   *
   * O resultado era invisível em desenvolvimento e total em produção: o
   * backend de ficheiro usa o `getId` e funciona; o do Supabase perguntava
   * `where id = '<caminho>'`, o Postgres respondia `42703 — column does not
   * exist`, e o `isMissingTable` traduzia isso para «a funcionalidade não está
   * instalada». Etiquetar uma foto respondia 503 a mandar correr um
   * `db/schema.sql` que já estava certo, e a LQIP e a COR de cada fotografia
   * nunca chegavam a ser gravadas — em silêncio, porque quem as escreve
   * envolve-as num `try/catch` de melhor esforço.
   */
  idColumn?: string;
  /** Domain object → database row (snake_case columns). */
  toRow(entity: T): Record<string, unknown>;
  /** Database row → domain object. */
  fromRow(row: Record<string, unknown>): T;
  /** Columns to select; defaults to "*". Use "data" for jsonb-blob tables. */
  selectColumns?: string;
  /** Default ordering applied to lists. */
  order?: { column: string; ascending: boolean };
  /**
   * Tecto de linhas para um `list()` sem paginação.
   *
   * Por OMISSÃO NÃO HÁ TECTO: um `list()` traz a tabela inteira. O comentário
   * aqui dizia "defaults to DEFAULT_LIST_LIMIT" e essa constante nunca existiu
   * — quem lesse ficava a pensar que havia uma rede que não há. Hoje nenhum dos
   * 12 stores define este campo, portanto TODAS as leituras são sem tecto.
   *
   * E é de propósito, apesar de parecer o contrário. Um tecto por omissão
   * ESCONDE dados: numa lista de facturas ou de contratos, devolver as
   * primeiras N linhas em silêncio é pior do que devolver muitas — a página
   * fica bonita e falta lá dinheiro. Por isso a truncagem é sempre por adesão
   * explícita e nunca calada (ver o aviso no `list()` abaixo).
   *
   * Quando vale a pena pôr um tecto: numa tabela que cresça sem relação com o
   * número de eventos (registos de auditoria, telemetria), ou quando uma página
   * ganhar paginação a sério. Aí define-se aqui, e o aviso do `list()` avisa
   * quando a página fica cheia — que é o sinal de que a paginação passou a ser
   * mesmo necessária.
   */
  listLimit?: number;
  /** Comparator mirroring `order` for the file backend. */
  fileCompare?: (a: T, b: T) => number;
  /** Set updated_at on Supabase updates (table must have the column). */
  touch?: boolean;
  /** Adjust a merged entity before an update is persisted (e.g. timestamps). */
  beforeUpdate?: (merged: T) => T;
}

/** Storage contract shared by the Supabase and file backends. */
export interface Backend<T> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  query(column: string, value: unknown, predicate: (e: T) => boolean): Promise<T[]>;
  /**
   * `extra`: colunas a mais para a linha, que o `toRow` cala de propósito —
   * o `created_at` de quem é reposto (Reciclagem). O ficheiro local ignora-as:
   * lá a entidade guarda-se inteira, com a sua data.
   */
  insert(entity: T, extra?: Record<string, unknown>): Promise<void>;
  /**
   * Write `merged` over the stored entity. When `cas` (the entity previously
   * returned by `get` on this same backend instance) is provided and the
   * backend can tell the row changed since that read, it throws ConflictError
   * instead of clobbering the concurrent write (optimistic locking).
   */
  persist(id: string, merged: T, cas?: T): Promise<void>;
  remove(id: string): Promise<void>;
}

/**
 * Houve uma escrita concorrente entre a leitura e a escrita: quem chama tem de
 * reler e voltar a tentar. O `updateWith` faz isso sozinho três vezes; se ainda
 * assim não resolver, este erro sai para fora — e é aí que ele tem de trazer
 * matéria com que se fale a uma pessoa.
 *
 * ── PORQUE É QUE O ERRO TRANSPORTA AS DUAS VERSÕES ────────────────────────
 * Uma colisão não pode acabar em silêncio (o último a gravar apaga o outro) nem
 * em erro cru ("Erro interno", que é o mesmo que silêncio com barulho). Quem
 * gravou tem direito a ver o que o servidor tem AGORA (`current`) ao lado do que
 * ela estava a gravar (`attempted`) e a escolher — que é exactamente o que a
 * rota da Visão Geral já faz com o `StaleWriteError` (409 com a versão do
 * servidor no corpo, ver `src/app/api/visao-geral/route.ts`).
 *
 * O `attempted` é a parte que não se pode cortar: sem ele, a resposta de erro é
 * o sítio onde o trabalho da pessoa desaparece. Com ele, o que ela escreveu
 * continua recuperável mesmo tendo a gravação sido recusada.
 */
export class ConflictError<T = Record<string, unknown>> extends Error {
  /** A linha em causa. */
  readonly id: string;
  /** A tabela, quando quem lançou o erro a conhece — para o registo dizer onde. */
  readonly table?: string;
  /** O que o servidor tem agora. É a versão a mostrar ao lado da da pessoa. */
  readonly current?: T;
  /** O que esta escrita queria gravar. Não pode perder-se com a recusa. */
  readonly attempted?: T;

  constructor(id: string, detalhes?: { table?: string; current?: T; attempted?: T }) {
    super(`Concurrent update on "${id}" — stale read`);
    this.name = "ConflictError";
    this.id = id;
    this.table = detalhes?.table;
    this.current = detalhes?.current;
    this.attempted = detalhes?.attempted;
  }
}

/**
 * O `instanceof` sozinho não chega. Em Next o mesmo módulo pode ser carregado
 * mais do que uma vez (bundles diferentes para rotas, testes que reimportam), e
 * aí `err instanceof ConflictError` dá falso para um erro que É um
 * ConflictError — a colisão voltava a sair como 500 "Erro interno" numa rota e
 * como 409 noutra, consoante o bundle. Reconhecer também pelo `name` é a mesma
 * defesa que `isMissingTable` e `isUniqueViolation` já fazem por código.
 */
export function isConflictError(err: unknown): err is ConflictError {
  return (
    err instanceof ConflictError ||
    (!!err && typeof err === "object" && (err as { name?: unknown }).name === "ConflictError")
  );
}

/**
 * A frase a mostrar quando a repetição não resolveu. Escrita para a pessoa que
 * está a olhar para o ecrã, não para quem lê registos: diz o que aconteceu, diz
 * que o texto dela NÃO ficou gravado (o pior seria deixá-la supor que ficou) e
 * diz o que fazer a seguir.
 */
export const MENSAGEM_DE_CONFLITO =
  "Isto foi alterado por outra pessoa entretanto. O que escreveste NÃO foi gravado — " +
  "vê a versão que está agora no servidor e volta a aplicar a tua alteração.";

/**
 * A tabela — ou uma COLUNA dela — ainda não existe na base de dados, quase
 * sempre porque uma funcionalidade nova foi publicada sem se correr o
 * `db/schema.sql`.
 *
 * Vale a pena distinguir isto de uma avaria: é a diferença entre dizer à equipa
 * "Erro interno" (que não indica caminho nenhum) e "falta correr o schema no
 * Supabase, leva um minuto". O Postgres devolve 42P01 (tabela) e 42703
 * (coluna); o PostgREST responde PGRST205 quando a tabela não está na cache do
 * esquema e PGRST204 quando é a coluna que lá não está.
 *
 * As colunas contam porque o schema cresce por `alter table ... add column if
 * not exists` (ex.: `proposal_themes.cover_path`): quem publicou o código sem
 * correr o ficheiro tem exatamente o mesmo problema e exatamente a mesma
 * solução — e o resto da funcionalidade continua a funcionar sem a coluna.
 */
export function isMissingTable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "42P01" || code === "PGRST205" || code === "42703" || code === "PGRST204") {
    return true;
  }
  const msg = (err as { message?: unknown }).message;
  return (
    typeof msg === "string" &&
    /relation .* does not exist|column .* does not exist|could not find the table|could not find the .* column|schema cache/i.test(
      msg,
    )
  );
}

/**
 * O NOME da coluna que falta, quando o erro o diz — `versao_selo`.
 *
 * ── Porque é que isto vale um extractor ───────────────────────────────────
 *
 * O `isMissingTable` responde «falta alguma coisa», e quem o usa para se
 * salvar tem de decidir o que deitar fora sem saber o quê. A rota do envio da
 * proposta fazia a única coisa que podia: deitava fora TUDO o que fosse
 * recente — `doc`, `pdf_sha256`, `idioma`, o selo da versão — e gravava o
 * resto.
 *
 * Custou uma proposta a sério. A coluna `proposals.doc` existe naquela base
 * desde julho; as do selo da versão nasceram a 20 de agosto. Uma base sem o
 * `db/schema.sql` novo rejeitava o `versao_selo` — e o resgate, para salvar
 * três colunas que não existiam, deitava fora a única que existia e a única
 * que o cliente vê. O casal recebeu quinze páginas em anexo e um link que
 * abria um quadro de preços.
 *
 * Com o nome, quem se salva pode tirar só o que falta e ficar com o resto.
 *
 * `null` quando o erro não nomeia coluna nenhuma (tabela inteira em falta, ou
 * uma mensagem que não se reconhece) — e aí quem chama volta ao que fazia.
 */
export function nomeDaColunaEmFalta(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const msg = (err as { message?: unknown }).message;
  if (typeof msg !== "string") return null;
  const achado =
    // PostgREST: Could not find the 'versao_selo' column of 'proposals' in the schema cache
    /could not find the ['"`]?([A-Za-z0-9_]+)['"`]? column/i.exec(msg) ??
    // Postgres: column "versao_selo" of relation "proposals" does not exist
    // Postgres: column proposals.versao_selo does not exist
    /column ['"`]?([A-Za-z0-9_.]+)['"`]?(?: of relation [^ ]+)? does not exist/i.exec(msg);
  if (!achado) return null;
  // «proposals.versao_selo» → «versao_selo». O nome da tabela já se sabe.
  const nome = achado[1].split(".").pop() ?? "";
  return nome || null;
}

/**
 * A escrita foi RECUSADA por não haver base de dados ligada em produção (ver
 * `assertWritableInProd`): gravar num ficheiro efémero seria perder os dados no
 * deploy seguinte e dizer à equipa que ficaram guardados.
 *
 * Tal como a tabela em falta, isto não é uma avaria — é uma instalação
 * incompleta, e quem está do outro lado merece ouvir isso em vez de "Erro
 * interno".
 */
export function isPersistenceUnavailable(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    typeof (err as { message?: unknown }).message === "string" &&
    (err as { message: string }).message.startsWith("Persistence unavailable")
  );
}

// ── O QUE MAIS PODE CORRER MAL ENTRE AQUI E O POSTGRES ────────────────────
//
// Os dois reconhecedores acima cobrem as duas INSTALAÇÕES incompletas. Tudo o
// resto caía no mesmo `500 "Erro interno"` — e a medição que obrigou a isto foi
// esta: das nove avarias que se conseguem provocar contra um Supabase de
// mentira, SETE saíam com essa frase. Uma chave rejeitada, um projecto em
// pausa, uma consulta que estoirou o tempo e uma leitura negada pelo RLS são
// quatro problemas com quatro resoluções diferentes, e chegavam ao ecrã como o
// mesmo nada.
//
// A forma do erro que sai do postgrest-js foi medida caso a caso (o mesmo
// cliente real, contra um servidor local que responde o que o Supabase
// responde). Duas surpresas guiam o que se segue:
//
//   1. Quando o corpo NÃO é JSON — um projecto em pausa devolve HTML, tal como
//      um 502 de um intermediário —, o erro chega SEM código nenhum: só
//      `{ message: "<html>…" }`. Só a frase o distingue.
//   2. Quando a ligação nem chega a abrir, o postgrest-js tenta três vezes com
//      espera entre elas: medi 8 s até desistir contra uma porta fechada, e o
//      que sai é `{ message: "TypeError: fetch failed", code: "" }`. Também
//      aqui só a frase o distingue — e esses 8 s são metade do orçamento de uma
//      função, que é a outra razão para isto ter nome próprio.

/** O SQLSTATE / código do PostgREST, quando o erro traz algum. */
function codigoDoErro(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  const c = (err as { code?: unknown }).code;
  return typeof c === "string" ? c : "";
}

/** A frase do erro, sempre uma string (mesmo quando não há erro nenhum). */
function mensagemDoErro(err: unknown): string {
  if (!err || typeof err !== "object") return typeof err === "string" ? err : "";
  const m = (err as { message?: unknown }).message;
  return typeof m === "string" ? m : "";
}

/**
 * O estado HTTP da resposta que produziu o erro — ver `comEstadoHttp`, que o
 * cola ao erro no ponto onde ele ainda se sabe. Sem isto um 401 e um 500
 * chegam cá indistinguíveis, porque o `PostgrestError` não o transporta.
 */
function estadoDoErro(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const s = (err as { status?: unknown }).status;
  return typeof s === "number" ? s : null;
}

/**
 * As chaves do Supabase existem mas foram RECUSADAS — chave errada, chave
 * rodada no painel e não actualizada no Vercel, ou a sessão do PostgREST
 * expirada.
 *
 * Não é o mesmo que "faltam as chaves" (`isPersistenceUnavailable`): ali não há
 * base de dados nenhuma configurada, aqui há e ela diz que não. E não é uma
 * avaria: alguém tem de ir colar a chave certa, o que é um passo, não um
 * mistério.
 */
export function isCredencialRecusada(err: unknown): boolean {
  const codigo = codigoDoErro(err);
  if (codigo === "PGRST301" || codigo === "PGRST302" || codigo === "42501") return false;
  const estado = estadoDoErro(err);
  const msg = mensagemDoErro(err);
  if (/invalid api key|no api key found|jwt (expired|invalid)|invalid jwt/i.test(msg)) return true;
  // Um 401/403 do PostgREST sem código é sempre autenticação — a autorização
  // dentro da base de dados chega com SQLSTATE (42501, tratado à parte).
  return (estado === 401 || estado === 403) && !codigo;
}

/** A sessão do PostgREST caducou (PGRST301/302). Mesma resolução da chave
 *  recusada, frase própria porque a causa é outra. */
export function isSessaoExpirada(err: unknown): boolean {
  const codigo = codigoDoErro(err);
  return codigo === "PGRST301" || codigo === "PGRST302";
}

/**
 * Não se chegou a falar com a base de dados: ligação recusada, DNS morto, ou —
 * o caso que mais acontece a um projecto pequeno — o Supabase EM PAUSA, que
 * responde uma página HTML em vez de JSON.
 *
 * O reconhecimento é pela FRASE porque é só isso que sobra: ver a nota acima,
 * medida contra o cliente real.
 */
export function isBaseInacessivel(err: unknown): boolean {
  const msg = mensagemDoErro(err);
  if (!msg) return false;
  // O corpo não era JSON: quem respondeu não foi o PostgREST.
  if (/^\s*</.test(msg) || /<html|<!doctype/i.test(msg)) return true;
  return /fetch failed|fetcherror|network|econnrefused|enotfound|eai_again|etimedout|econnreset|socket hang up|und_err|terminated/i.test(
    msg,
  );
}

/**
 * A consulta foi ao ar por tempo: o `statement_timeout` do Postgres (57014) ou
 * o do pgbouncer. Numa tabela pequena isto quer dizer base sobrecarregada, e a
 * resolução — voltar a tentar, ver o estado do projecto — não tem nada a ver
 * com a de uma instalação incompleta.
 */
export function isTempoEsgotado(err: unknown): boolean {
  const codigo = codigoDoErro(err);
  if (codigo === "57014" || codigo === "57P01" || codigo === "08006") return true;
  return /statement timeout|canceling statement|query timeout|timeout expired/i.test(
    mensagemDoErro(err),
  );
}

/**
 * A base de dados leu o pedido e RECUSOU-O: `permission denied` (42501), que é
 * o que uma política de RLS ou um `revoke` produzem quando o papel usado não é
 * o `service_role`.
 *
 * Atenção ao irmão silencioso deste erro, que NÃO passa por aqui: com RLS
 * ligado e SEM política nenhuma, o Postgres não recusa — devolve zero linhas.
 * Uma leitura com a chave errada responde 200 e uma lista vazia, e é por isso
 * que a rota tem de olhar também para o PAPEL da chave (ver
 * `papelDaChaveSupabase`): sem isso, "a Biblioteca está vazia" e "a Biblioteca
 * está escondida de ti" são o mesmo ecrã.
 */
export function isLeituraNegada(err: unknown): boolean {
  return codigoDoErro(err) === "42501" || /permission denied/i.test(mensagemDoErro(err));
}

/**
 * O erro reduzido a uma linha que se possa MOSTRAR — código, estado e frase,
 * cortada. Existe para que um 500 nunca mais seja anónimo: mesmo quando não
 * reconhecemos a causa, quem está no ecrã leva consigo o que perguntar.
 *
 * Cortada a 200 caracteres porque o que interessa vem sempre à cabeça (o
 * Postgres põe a causa na primeira frase) e porque isto vai para um cartão de
 * aviso, não para os registos — esses levam o erro inteiro.
 */
export function descricaoTecnica(err: unknown): string {
  const partes: string[] = [];
  const codigo = codigoDoErro(err);
  const estado = estadoDoErro(err);
  if (codigo) partes.push(codigo);
  if (estado !== null) partes.push(`HTTP ${estado}`);
  const msg = mensagemDoErro(err) || String(err);
  const etiqueta = partes.length ? `${partes.join(" ")}: ` : "";
  return `${etiqueta}${msg}`.slice(0, 200);
}

/**
 * Cola o estado HTTP ao erro do PostgREST, no único sítio onde ele ainda se
 * sabe: o `PostgrestError` traz código, frase e dicas, mas não o estado — e sem
 * ele um 401 (chave recusada) e um 500 (avaria) chegam a quem decide como o
 * mesmo objecto. Não substitui um estado que já lá venha.
 */
function comEstadoHttp<E>(error: E, status: number | undefined): E {
  if (error && typeof error === "object" && typeof status === "number") {
    const alvo = error as { status?: unknown };
    if (alvo.status === undefined) alvo.status = status;
  }
  return error;
}

/**
 * Erro de chave duplicada com a FORMA do que o Postgres devolve (SQLSTATE
 * 23505), para o backend de ficheiro poder recusar um id repetido tal como a
 * chave primária o recusa no Supabase.
 *
 * A forma importa: quem chama não olha para o backend, olha para o erro.
 * `saveOverviewField` decide pelo `isUniqueViolation` se aquilo foi um conflito
 * (dois dispositivos a estrear o campo) ou uma avaria; `createContractIfAbsent`
 * conta com o insert a perder a corrida para não emitir um segundo sinal. Se o
 * ficheiro deixasse passar o duplicado, essas decisões mudavam consoante o
 * backend — e é precisamente isso que aqui não pode acontecer.
 */
function duplicateKeyError(table: string, id: string): Error {
  return Object.assign(
    new Error(`duplicate key value violates unique constraint "${table}_pkey" — id "${id}"`),
    { code: "23505" },
  );
}

/**
 * ── «JWT ISSUED AT FUTURE» (PGRST303): TENTA OUTRA VEZ ─────────────────────
 *
 * Auditoria de robustez de 13/11: o PostgREST recusa de vez em quando a chave
 * com PGRST303 (o relógio do servidor dele está uns segundos atrás do nosso).
 * Passa sozinho num segundo — mas sem nova tentativa deixou a cópia diária
 * INCOMPLETA a 7, 9 e 11/11 e falhou a lista de pedidos e o link de uma
 * proposta.
 *
 * As ESCRITAS também se repetem, mas SÓ com este erro: o PGRST303 é a chave
 * recusada à porta, antes de o pedido chegar à base de dados — nada ficou
 * escrito, e repetir não duplica nada (auditoria de 13/11, n.º 11). Qualquer
 * outro erro de escrita continua a não se repetir às cegas.
 */
const ESPERAS_DO_RELOGIO_MS = [800, 2000];

/** O máximo de linhas que o Supabase devolve por pedido (o `max-rows`). */
export const PAGINA_DO_SUPABASE = 1000;

export function eRelogioAdiantado(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    ((error as { code?: unknown }).code === "PGRST303" ||
      /issued at future/i.test(String((error as { message?: unknown }).message ?? "")))
  );
}

export async function lerComNovaTentativa<R extends { error: unknown }>(
  ler: () => PromiseLike<R>,
  esperar: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<R> {
  let r = await ler();
  for (const ms of ESPERAS_DO_RELOGIO_MS) {
    if (!eRelogioAdiantado(r.error)) return r;
    await esperar(ms);
    r = await ler();
  }
  return r;
}

// ── Supabase backend ──────────────────────────────────────────────────────
export class SupabaseBackend<T> implements Backend<T> {
  constructor(
    private readonly m: Mapper<T>,
    private readonly sb: SupabaseClient,
  ) {}

  private get cols() {
    return this.m.selectColumns ?? "*";
  }

  /** For `touch` tables, `get` also selects updated_at so persist can CAS on it. */
  private get colsWithStamp() {
    // Uma lista que já traz o `updated_at` não o pede duas vezes.
    if (!this.m.touch || this.cols === "*" || /\bupdated_at\b/.test(this.cols)) return this.cols;
    return `${this.cols}, updated_at`;
  }

  /** A coluna da chave — a do mapper, ou `id` como sempre. Ver `idColumn`. */
  private get idCol() {
    return this.m.idColumn ?? "id";
  }

  // updated_at as of the read, keyed by the entity object `get` returned.
  // WeakMap: entries vanish with the entities, nothing to clean up.
  private stamps = new WeakMap<object, string | null>();

  private map = (r: unknown) => this.m.fromRow(r as Record<string, unknown>);

  async list(): Promise<T[]> {
    const limit = this.m.listLimit; // undefined ⇒ fetch everything (no cap)
    const consulta = () => {
      const base = this.sb.from(this.m.table).select(this.cols);
      // Ordem SEMPRE determinística: sem ela, as páginas de baixo podiam
      // repetir ou saltar linhas. A do mapper, ou a da chave.
      // E com DESEMPATE pela chave: a coluna do mapper repete-se (posição,
      // categoria, data de criação de uma reposição em lote), e com empates
      // na fronteira de uma página o Postgres pode repetir ou saltar linhas
      // (revisão de 13/11, n.º 6).
      if (!this.m.order) return base.order(this.idCol, { ascending: true });
      const porColuna = base.order(this.m.order.column, { ascending: this.m.order.ascending });
      return this.m.order.column === this.idCol
        ? porColuna
        : porColuna.order(this.idCol, { ascending: true });
    };
    if (limit != null) {
      const { data, error, status } = await lerComNovaTentativa(() => consulta().limit(limit));
      if (error) throw comEstadoHttp(error, status);
      const rows = data ?? [];
      // Only an EXPLICIT opt-in limit can truncate — and never silently: a full
      // page is the signal that real pagination is needed.
      if (rows.length >= limit) {
        log.warn("list() hit the configured row cap — results may be truncated", {
          table: this.m.table,
          limit,
        });
      }
      return rows.map(this.map);
    }
    /**
     * «Tudo» é mesmo TUDO (auditoria de 13/11). O Supabase devolve no máximo
     * 1000 linhas por pedido e corta o resto SEM AVISAR — a cópia diária saía
     * truncada, e a limpeza das pastas órfãs, a partir dos 1000 pedidos, dava
     * pastas de pedidos vivos como órfãs. Lê-se por páginas até vir uma
     * incompleta.
     */
    const todas: unknown[] = [];
    for (let desde = 0; ; desde += PAGINA_DO_SUPABASE) {
      const { data, error, status } = await lerComNovaTentativa(() =>
        consulta().range(desde, desde + PAGINA_DO_SUPABASE - 1),
      );
      if (error) throw comEstadoHttp(error, status);
      const pagina = data ?? [];
      todas.push(...pagina);
      if (pagina.length < PAGINA_DO_SUPABASE) break;
    }
    return todas.map(this.map);
  }

  async get(id: string): Promise<T | null> {
    const { data, error, status } = await lerComNovaTentativa(() =>
      this.sb.from(this.m.table).select(this.colsWithStamp).eq(this.idCol, id).maybeSingle(),
    );
    if (error) throw comEstadoHttp(error, status);
    if (!data) return null;
    const entity = this.map(data);
    if (this.m.touch && entity && typeof entity === "object") {
      const stamp = (data as unknown as Record<string, unknown>).updated_at;
      this.stamps.set(entity as object, typeof stamp === "string" ? stamp : null);
    }
    return entity;
  }

  async query(column: string, value: unknown): Promise<T[]> {
    const base = this.sb.from(this.m.table).select(this.cols).eq(column, value);
    const q = this.m.order
      ? base.order(this.m.order.column, { ascending: this.m.order.ascending })
      : base;
    const { data, error, status } = await lerComNovaTentativa(() => q);
    if (error) throw comEstadoHttp(error, status);
    return (data ?? []).map(this.map);
  }

  async insert(entity: T, extra?: Record<string, unknown>): Promise<void> {
    const row = extra ? { ...this.m.toRow(entity), ...extra } : this.m.toRow(entity);
    // Nova tentativa só com o relógio adiantado — ver `lerComNovaTentativa`.
    const { error, status } = await lerComNovaTentativa(() =>
      this.sb.from(this.m.table).insert(row),
    );
    if (error) throw comEstadoHttp(error, status);
  }

  async persist(id: string, merged: T, cas?: T): Promise<void> {
    const row = this.m.toRow(merged);
    if (this.m.touch) row.updated_at = new Date().toISOString();

    // Optimistic locking: only write if the row still carries the updated_at
    // we read. Zero rows updated ⇒ someone else wrote in between ⇒ conflict.
    const stamp = cas && typeof cas === "object" ? this.stamps.get(cas as object) : undefined;
    if (stamp !== undefined) {
      const { data, error, status } = await lerComNovaTentativa(() => {
        const base = this.sb.from(this.m.table).update(row).eq(this.idCol, id);
        const guarded = stamp === null ? base.is("updated_at", null) : base.eq("updated_at", stamp);
        return guarded.select(this.idCol);
      });
      if (error) throw comEstadoHttp(error, status);
      if (!data?.length) throw new ConflictError<T>(id, { table: this.m.table, attempted: merged });
      return;
    }

    const { error, status } = await lerComNovaTentativa(() =>
      this.sb.from(this.m.table).update(row).eq(this.idCol, id),
    );
    if (error) throw comEstadoHttp(error, status);
  }

  async remove(id: string): Promise<void> {
    const { error, status } = await lerComNovaTentativa(() =>
      this.sb.from(this.m.table).delete().eq(this.idCol, id),
    );
    if (error) throw comEstadoHttp(error, status);
  }
}

// ── File backend (dev fallback) ───────────────────────────────────────────
export class FileBackend<T> implements Backend<T> {
  private readonly file: string;
  // Serialize mutating ops: each does read → modify → write with an `await` in the
  // middle, so two concurrent inserts would both read the pre-write array and the
  // second write would clobber the first (lost update). Chaining them through this
  // tail makes read-modify-write atomic within the process.
  //
  // A fila vive na INSTÂNCIA, por isso só serializa quem partilha a instância:
  // ver `createRepository`, que guarda um único FileBackend por repositório
  // exactamente por causa disto.
  private tail: Promise<unknown> = Promise.resolve();
  // Instantâneo de cada linha tal como o `get` a devolveu, indexado pela própria
  // entidade. É o que o `updated_at` é para o backend Supabase — aqui a linha
  // inteira, porque o ficheiro não tem coluna de versão. WeakMap: as entradas
  // desaparecem com as entidades, não há nada para limpar.
  private snapshots = new WeakMap<object, string>();

  constructor(
    private readonly m: Mapper<T>,
    baseDir: string,
  ) {
    this.file = path.join(baseDir, m.fileName);
  }

  private serialize<R>(fn: () => Promise<R>): Promise<R> {
    const run = this.tail.then(fn, fn);
    this.tail = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  private async read(): Promise<T[]> {
    try {
      return JSON.parse(await fs.readFile(this.file, "utf-8")) as T[];
    } catch {
      return [];
    }
  }

  private async write(rows: T[]): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(rows, null, 2));
  }

  // The file backend is a DEV fallback only. In production it means Supabase is
  // unconfigured (env.ts already flags this critical) — so a write would land in
  // an ephemeral file that vanishes on the next deploy, i.e. silent data loss
  // reported to the caller as success. Refuse the write loudly instead: the POST
  // route then treats the lead as un-persisted and falls back to email + an
  // honest error, and the miss reaches alerting via log.error. Reads still work.
  private assertWritableInProd(): void {
    if (process.env.NODE_ENV === "production") {
      log.error(
        "repository: gravação recusada — Supabase não configurado em produção; o fallback para ficheiro é volátil. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
        undefined,
        { file: this.m.fileName },
      );
      throw new Error("Persistence unavailable: Supabase not configured in production");
    }
  }

  async list(): Promise<T[]> {
    const all = await this.read();
    return this.m.fileCompare ? [...all].sort(this.m.fileCompare) : all;
  }

  async get(id: string): Promise<T | null> {
    const found = (await this.read()).find((e) => this.m.getId(e) === id) ?? null;
    // Guarda a linha como estava nesta leitura, para o `persist` poder recusar
    // escrever por cima de uma versão que entretanto mudou.
    if (found && typeof found === "object") {
      this.snapshots.set(found as object, JSON.stringify(found));
    }
    return found;
  }

  async query(_column: string, _value: unknown, predicate: (e: T) => boolean): Promise<T[]> {
    const all = await this.list();
    return all.filter(predicate);
  }

  async insert(entity: T): Promise<void> {
    this.assertWritableInProd();
    const id = this.m.getId(entity);
    return this.serialize(async () => {
      const all = await this.read();
      // A chave primária que o Supabase impõe tem de valer aqui também: sem
      // esta guarda, dois aceites em corrida punham DOIS contratos na mesma
      // proposta (e dois sinais a caminho do cliente), porque o `insert` de
      // ficheiro nunca perdia a corrida que o índice único faz perder.
      if (all.some((e) => this.m.getId(e) === id)) throw duplicateKeyError(this.m.table, id);
      all.push(entity);
      await this.write(all);
    });
  }

  async persist(id: string, merged: T, cas?: T): Promise<void> {
    this.assertWritableInProd();
    const expected = cas && typeof cas === "object" ? this.snapshots.get(cas as object) : undefined;
    return this.serialize(async () => {
      const all = await this.read();
      const idx = all.findIndex((e) => this.m.getId(e) === id);
      if (idx === -1) return;
      // Bloqueio optimista, o mesmo que o backend Supabase faz sobre o
      // `updated_at`: se a linha já não é a que foi lida, alguém escreveu no
      // meio e o `updateWith` tem de reler e voltar a aplicar a alteração —
      // sobrepor aqui apagaria o trabalho dessa pessoa sem ninguém dar por isso.
      if (expected !== undefined && JSON.stringify(all[idx]) !== expected) {
        throw new ConflictError<T>(id, {
          table: this.m.table,
          current: all[idx],
          attempted: merged,
        });
      }
      all[idx] = merged;
      await this.write(all);
    });
  }

  async remove(id: string): Promise<void> {
    this.assertWritableInProd();
    return this.serialize(async () => {
      const all = await this.read();
      await this.write(all.filter((e) => this.m.getId(e) !== id));
    });
  }
}

// ── Repository ─────────────────────────────────────────────────────────────
export class Repository<T> {
  /** `getBackend` is a thunk so backend selection stays lazy (per call), matching the previous getSupabase()-per-method behaviour. */
  constructor(
    private readonly mapper: Mapper<T>,
    private readonly getBackend: () => Backend<T>,
  ) {}

  list(): Promise<T[]> {
    return this.getBackend().list();
  }

  get(id: string): Promise<T | null> {
    return this.getBackend().get(id);
  }

  /** Filtered list. `column` is the snake_case DB column; `predicate` is the equivalent for the file backend. */
  where(column: string, value: unknown, predicate: (e: T) => boolean): Promise<T[]> {
    return this.getBackend().query(column, value, predicate);
  }

  create(entity: T, extra?: Record<string, unknown>): Promise<void> {
    return this.getBackend().insert(entity, extra);
  }

  /** Read-merge-write update. Returns the merged entity, or null if not found. */
  update(id: string, updates: Partial<T>): Promise<T | null> {
    return this.updateWith(id, (current) => ({ ...current, ...updates }) as T);
  }

  /**
   * Read-mutate-write update with optimistic locking. `mutate` derives the new
   * entity from the freshly-read current one (the right tool for appends —
   * activity log, payments — where spreading a stale copy would drop a
   * concurrent write). On conflict the read+mutate is retried, so the change
   * is always applied on top of the latest state.
   */
  async updateWith(id: string, mutate: (current: T) => T): Promise<T | null> {
    const backend = this.getBackend();
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; ; attempt++) {
      const current = await backend.get(id);
      if (!current) return null;
      let merged = mutate(current);
      if (this.mapper.beforeUpdate) merged = this.mapper.beforeUpdate(merged);
      try {
        await backend.persist(id, merged, current);
        return merged;
      } catch (err) {
        if (!isConflictError(err)) throw err;
        if (attempt >= MAX_ATTEMPTS) {
          // Três voltas e o registo continua a mudar debaixo dos pés. Isto já
          // não é uma corrida entre dois cliques — é gente a trabalhar sobre a
          // mesma linha ao mesmo tempo, e a resposta certa é dizê-lo, não
          // insistir até uma das versões vencer por sorte.
          //
          // Relemos de propósito antes de desistir: o `current` desta volta já
          // é velho (foi por isso que a escrita falhou), e quem vai mostrar as
          // duas versões lado a lado precisa da do servidor, não de uma
          // terceira. Se a releitura falhar, vale a que temos — nunca ficamos
          // sem `current`.
          const doServidor = await backend.get(id).catch(() => null);
          throw new ConflictError<T>(id, {
            table: this.mapper.table,
            current: doServidor ?? current,
            attempted: merged,
          });
        }
        // Uma pausa curta e desigual entre tentativas. Sem ela as três voltas
        // acontecem no mesmo instante e disputam a mesma janela: quem perdeu a
        // primeira perde as três, e o conflito sobe sem ter havido repetição
        // nenhuma na prática. O acaso separa duas escritas que arrancaram
        // juntas (dois separadores, dois telemóveis na mesma checklist).
        await new Promise((r) => setTimeout(r, attempt * 5 + Math.random() * 10));
      }
    }
  }

  remove(id: string): Promise<void> {
    return this.getBackend().remove(id);
  }
}

/** Build a repository that targets Supabase when configured, else the dev file. */
export function createRepository<T>(mapper: Mapper<T>): Repository<T> {
  const baseDir = path.join(process.cwd(), "data");
  // UM só FileBackend por repositório. A fila de escrita e os instantâneos do
  // bloqueio optimista vivem na instância: dar uma instância nova a cada
  // chamada — como se fazia aqui — dava a cada operação uma fila vazia e uma
  // memória em branco, e as duas protecções ficavam a não fazer nada. Duas
  // criações em simultâneo liam ambas o mesmo array e a segunda escrita
  // apagava a primeira, que é precisamente o que a fila existe para impedir.
  //
  // A ESCOLHA do backend continua a ser feita a cada chamada: o Supabase pode
  // passar a estar configurado a meio da vida do processo.
  let fileBackend: FileBackend<T> | null = null;
  return new Repository<T>(mapper, () => {
    const sb = getSupabase();
    if (sb) return new SupabaseBackend<T>(mapper, sb);
    return (fileBackend ??= new FileBackend<T>(mapper, baseDir));
  });
}
