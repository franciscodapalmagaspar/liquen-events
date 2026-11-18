import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import type { Mapper } from "./repository";
import { esquemaDoSql } from "../../test/comparar-esquemas";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CAMPO QUE A APLICAÇÃO GRAVA E A BASE DE DADOS NÃO GUARDA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Foi assim que as estrelas dos fornecedores se perderam. O tipo `Supplier`, a
 * rota PATCH e o `supplierUpdateSchema` aceitavam `rating` e `preferred`, o
 * ecrã ordenava e filtrava por eles — e o `toRow` do mapper deitava-os fora,
 * porque as colunas não existiam em `db/schema.sql`. Em desenvolvimento nada se
 * via (o backend de ficheiro guarda o objecto de domínio tal e qual); com
 * Supabase, avaliar uma florista com 5 estrelas respondia 200 e no
 * recarregamento seguinte estava tudo apagado, sem erro nenhum.
 *
 * `suppliers-store.test.ts` prende ESSE par. Este ficheiro prende a CLASSE:
 * corre sobre os 26 mappers do sistema e cruza, para cada um, as três coisas
 * que só valem juntas —
 *
 *   1. o que o `toRow` escreve tem de EXISTIR como coluna (senão a gravação
 *      rebenta com `column ... does not exist`, o outro lado da mesma moeda);
 *   2. a coluna da CHAVE (`idColumn ?? "id"`) tem de existir — foi isto que
 *      partiu a biblioteca de fotografias inteira, cuja chave é `path`: o
 *      Postgres respondia 42703, o `isMissingTable` traduzia-o para «a
 *      funcionalidade não está instalada», e a LQIP e a cor de cada foto nunca
 *      chegavam a ser gravadas;
 *   3. nenhuma coluna da tabela fica ÓRFÃ — ou o mapper escreve-a, ou lê-a, ou
 *      está na lista explicada aqui em baixo. Uma coluna que ninguém lê é uma
 *      funcionalidade morta ou um dado que se escreve e nunca se usa, e ambas
 *      as coisas envelhecem a parecer que funcionam.
 *
 * COMO É QUE ISTO SABE o que o mapper escreve e lê: não por expressão regular
 * sobre o código — que mente à primeira reformatação — mas CHAMANDO-O. Monta-se
 * uma linha sintética com TODAS as colunas da tabela, dá-se ao `fromRow` dentro
 * de um `Proxy` que anota cada coluna lida, e o objecto de domínio que sai
 * volta pelo `toRow`, cujas chaves são exactamente as colunas escritas. Os
 * ramos condicionais (`...(t.doc !== undefined ? …)`) entram todos, porque a
 * linha sintética traz tudo preenchido.
 */

// ── O ficheiro de esquema, lido a sério ───────────────────────────────────
// Pelo MESMO leitor que o compara com os tipos gerados da base viva
// (`tipos-da-base.test.ts`): dois leitores do mesmo ficheiro acabavam por
// discordar sobre o que lá está.

async function esquema() {
  const sql = await fs.readFile(path.join(process.cwd(), "db", "schema.sql"), "utf-8");
  return esquemaDoSql(sql);
}

/** As colunas de cada tabela, tal como `db/schema.sql` as garante. */
async function colunasPorTabela(): Promise<Map<string, Set<string>>> {
  const tabelas = new Map<string, Set<string>>();
  for (const [t, cols] of await esquema()) tabelas.set(t, new Set(cols.keys()));
  return tabelas;
}

/**
 * O TIPO SQL de cada coluna, para a linha sintética não ser um monte de
 * strings: um `fromRow` que faz `Array.isArray(r.labels)` ou `Number(r.qty)`
 * tem de receber uma lista e um número, senão a propriedade nem aparece no
 * objecto de domínio e o ramo condicional do `toRow` fica por exercitar.
 */
async function tiposPorTabela(): Promise<Map<string, Map<string, string>>> {
  const tabelas = new Map<string, Map<string, string>>();
  for (const [t, cols] of await esquema()) {
    tabelas.set(t, new Map([...cols].map(([c, col]) => [c, col.tipoSql ?? ""])));
  }
  return tabelas;
}

/** Um valor plausível para uma coluna daquele tipo. */
function valorDe(coluna: string, tipo: string | undefined): unknown {
  switch (tipo) {
    case "boolean":
      return true;
    case "int":
    case "int4":
    case "integer":
    case "smallint":
    case "bigint":
    case "numeric":
      return 1;
    case "jsonb":
    case "json":
      // Lista e não objecto: as colunas jsonb destes mappers são todas listas
      // (`labels`, `transports`, `vehicles`, `photo_order`, `line_items`), e as
      // que não são (`value`, `data`, `doc`, `filter_rule`) são lidas com
      // guardas que aceitam qualquer coisa.
      return [];
    case "timestamptz":
      return "2026-01-01T00:00:00.000Z";
    case "date":
      return "2026-01-01";
    default:
      // `path` e `pasta` da biblioteca são caminhos: um texto qualquer levava o
      // `split("/")` a devolver uma pasta que não existe, o que não parte nada
      // mas torna o teste mais difícil de ler quando falha.
      return coluna.includes("path") || coluna === "pasta" ? "pasta/foto.jpg" : "x";
  }
}

// ── Os mappers ────────────────────────────────────────────────────────────
// Todos os que passam pelo `Repository` (25 stores) mais o dos rascunhos do
// Estúdio, que é um `Mapper` a sério — é ele que a reposição usa para escrever
// no `app_state` (ver `RESTORE_TARGETS`).
const MAPPERS = [
  "./biblioteca-etiquetas-store",
  "./biblioteca-foto-etiquetas-store",
  "./biblioteca-fotos-store",
  "./calendar-store",
  "./contracts-store",
  "./email-templates-store",
  "./event-material-items-store",
  "./event-material-log-store",
  "./event-material-store",
  "./inventory-store",
  "./invoices-store",
  "./material-list-items-store",
  "./material-lists-store",
  "./material-rules-store",
  "./material-store",
  "./overview-settings-store",
  "./passkeys-store",
  "./proposal-drafts",
  "./proposals-store",
  "./proposta-definicoes-store",
  "./quotes-store",
  "./reciclagem-store",
  "./servicos-catalogo-store",
  "./suppliers-store",
  "./tasks-store",
  "./themes-store",
] as const;

type MapperQualquer = Mapper<Record<string, unknown>>;

/**
 * COLUNAS QUE O MAPPER NÃO TOCA, E PORQUÊ.
 *
 * Cada entrada é uma decisão escrita, não uma lacuna tolerada. Quem ligar uma
 * destas colunas ao mapper tem de a tirar daqui — e quem acrescentar uma coluna
 * nova ao esquema sem a ligar a lado nenhum vai ver este teste falhar, que é
 * precisamente o ponto.
 *
 * (O `updated_at` das tabelas com `touch` não precisa de entrada: quem o
 * escreve é o `SupabaseBackend.persist`, e o `bloqueio-optimista.test.ts` já
 * prende esse par.)
 */
const NAO_TOCADAS: Record<string, Record<string, string>> = {
  quotes: {
    created_at:
      "O relógio do pedido é o `submittedAt`, que vive dentro do blob `data`. A coluna " +
      "existe para a base poder ordenar (`quotes_created_at_idx`) e é preenchida pelo " +
      "`default now()` na criação e explicitamente na reposição (`extraColumns` em " +
      "backup-restore.ts) — repor um pedido de Março com a data de hoje desarrumava a lista.",
  },
  biblioteca_fotos: {
    urls:
      "LIDA E ESCRITA, mas fora do mapper — de propósito. É o endereço assinado de cada " +
      "ficheiro por família (`original`, `miniatura`, `media`, `mediaAvif`), e quem lhe " +
      "toca é o `urls-assinados.ts`, com o cliente do Supabase directo. Duas razões para " +
      "não passar pelo repositório: (1) mantém a coluna FORA do tipo `Foto`, portanto " +
      "fora do `toRow`/`fromRow` e, por consequência, fora da cópia de segurança — uma " +
      "cópia restaurada noutro projecto traria endereços assinados por OUTRO Supabase, " +
      "bem formados e completamente mortos; (2) o modo de ficheiro do repositório não " +
      "tem Storage, logo não há endereços para guardar e a funcionalidade é, ali, um " +
      "não-acontecimento. A razão de a coluna existir está escrita por extenso no " +
      "`db/schema.sql` e no `urls-assinados.ts`.",
  },
  proposal_themes: {
    manual_paths:
      "PLANEADA E AINDA POR LIGAR (TEMAS-PLANO.md §4.4): a lista de fotos de um tema " +
      "`kind = 'manual'`. Hoje NADA a escreve nem a lê — nenhuma rota cria temas manuais " +
      "(POST /api/temas só produz `pasta` ou `filtro`). Quem construir a funcionalidade faz " +
      "as duas metades na mesma alteração — o campo em `ProposalTheme`, o par toRow/fromRow " +
      "com a mesma regra condicional do `photo_order`, e esta entrada sai daqui.",
    ordem:
      "PLANEADA E AINDA POR LIGAR (TEMAS-PLANO.md §4.4): ordem manual dos TEMAS na lista " +
      "(não confundir com `photo_order`, que é a ordem das fotos dentro de um tema). Hoje a " +
      'lista ordena-se por nome (`order: { column: "name" }`) e nada escreve esta coluna. ' +
      "Mesma regra: quem lhe der um ecrã liga as duas metades e tira esta entrada.",
  },
};

describe("mappers × db/schema.sql — o que se grava tem mesmo onde ficar", () => {
  /** Carrega o mapper e devolve, junto, o que ele escreve e o que ele lê. */
  async function analisar(modulo: string) {
    const { mapper } = (await import(modulo)) as { mapper: MapperQualquer };
    const colunas = (await colunasPorTabela()).get(mapper.table);
    const tipos = (await tiposPorTabela()).get(mapper.table) ?? new Map<string, string>();
    if (!colunas) return { mapper, colunas: null, escritas: null, lidas: null };

    // Uma linha com TODAS as colunas preenchidas, para os ramos condicionais do
    // `toRow` entrarem em jogo.
    const linha: Record<string, unknown> = {};
    for (const c of colunas) linha[c] = valorDe(c, tipos.get(c));

    // O `Proxy` anota cada coluna que o `fromRow` foi buscar.
    const lidas = new Set<string>();
    const espiada = new Proxy(linha, {
      get(alvo, prop) {
        if (typeof prop !== "string") return Reflect.get(alvo, prop);
        lidas.add(prop);
        return alvo[prop];
      },
      has(alvo, prop) {
        if (typeof prop === "string") lidas.add(prop);
        return prop in alvo;
      },
    });

    const entidade = mapper.fromRow(espiada);
    const escritas = new Set(Object.keys(mapper.toRow(entidade)));
    return { mapper, colunas, escritas, lidas };
  }

  // ── 1. Nada se escreve para uma coluna que não existe ───────────────────
  // A metade que faltava aos fornecedores, do lado oposto: sem a coluna, cada
  // gravação da tabela rebenta com `column "rating" does not exist`.
  it.each(MAPPERS)("%s — o toRow só escreve colunas que db/schema.sql garante", async (modulo) => {
    const { mapper, colunas, escritas } = await analisar(modulo);
    expect(colunas, `db/schema.sql não define a tabela ${mapper.table}`).toBeTruthy();
    const inventadas = [...escritas!].filter((c) => !colunas!.has(c));
    expect(
      inventadas,
      `${mapper.table}: o mapper grava ${inventadas.join(", ")} e db/schema.sql não garante ${
        inventadas.length === 1 ? "essa coluna" : "essas colunas"
      }`,
    ).toEqual([]);
  });

  // ── 2. A chave é endereçável ────────────────────────────────────────────
  // `biblioteca_fotos` tem `path text primary key` e NENHUMA coluna `id`. Sem
  // `idColumn`, o Supabase perguntava `where id = '<caminho>'`, o Postgres
  // respondia 42703 e a aplicação traduzia isso para «não instalado».
  it.each(MAPPERS)("%s — a coluna da chave existe na tabela", async (modulo) => {
    const { mapper, colunas } = await analisar(modulo);
    const chave = mapper.idColumn ?? "id";
    expect(
      colunas!.has(chave),
      `${mapper.table}: o repositório endereça as linhas por "${chave}" e essa coluna não ` +
        `existe — declara \`idColumn\` no mapper (ver Mapper.idColumn)`,
    ).toBe(true);
  });

  // ── 3. Nenhuma coluna fica órfã ─────────────────────────────────────────
  // Uma coluna que o mapper nunca lê nem escreve é funcionalidade morta ou um
  // dado que se grava e nunca se usa. Ou tem quem a leia, ou tem aqui a razão
  // escrita de não ter.
  it.each(MAPPERS)("%s — nenhuma coluna da tabela fica sem quem a leia", async (modulo) => {
    const { mapper, colunas, escritas, lidas } = await analisar(modulo);
    const justificadas = NAO_TOCADAS[mapper.table] ?? {};
    const orfas = [...colunas!].filter((c) => {
      if (escritas!.has(c) || lidas!.has(c)) return false;
      // Quem escreve o `updated_at` das tabelas com comparação é o Repository.
      if (c === "updated_at" && mapper.touch) return false;
      return !(c in justificadas);
    });
    expect(
      orfas,
      `${mapper.table}: ${orfas.join(", ")} — coluna(s) que o mapper nunca lê nem escreve. ` +
        `Ou é uma funcionalidade a meio (liga as duas metades), ou é peso morto: em qualquer ` +
        `dos casos escreve a razão em NAO_TOCADAS, neste ficheiro.`,
    ).toEqual([]);
  });
});

// ── As guardas acima têm mesmo dentes ─────────────────────────────────────
// Os 26 mappers reais passam nas três — é esse o estado que se quer manter. Um
// teste verde que nunca soube ficar vermelho não prende nada, por isso estas
// três provam a falha com mappers de mentira, sobre tabelas que existem mesmo.
describe("as guardas apanham a regressão que as motivou", () => {
  const base: MapperQualquer = {
    table: "suppliers",
    fileName: "suppliers.json",
    getId: (s) => String(s.id),
    toRow: (s) => ({ id: s.id, name: s.name }),
    fromRow: (r) => ({ id: String(r.id), name: String(r.name ?? "") }),
  };

  it("apanha um toRow que grava uma coluna inexistente (o defeito dos fornecedores)", async () => {
    const colunas = (await colunasPorTabela()).get(base.table)!;
    const mapper: MapperQualquer = {
      ...base,
      toRow: (s) => ({ ...base.toRow(s), rating_medio: 4 }),
    };
    const escritas = Object.keys(mapper.toRow({ id: "s1" }));
    expect(escritas.filter((c) => !colunas.has(c))).toEqual(["rating_medio"]);
  });

  it("apanha uma chave que não é coluna nenhuma (o defeito da biblioteca de fotos)", async () => {
    const colunas = (await colunasPorTabela()).get("biblioteca_fotos")!;
    // Sem `idColumn`, o repositório procura `id` — que esta tabela não tem.
    expect(colunas.has("id")).toBe(false);
    expect(colunas.has("path")).toBe(true);
  });

  it("apanha uma coluna que ninguém lê nem escreve", async () => {
    const colunas = (await colunasPorTabela()).get(base.table)!;
    const escritas = new Set(Object.keys(base.toRow({ id: "s1" })));
    const lidas = new Set(["id", "name"]);
    const orfas = [...colunas].filter((c) => !escritas.has(c) && !lidas.has(c));
    // O mapper de mentira ignora tudo o resto — `rating` e `preferred` incluídos,
    // que é exactamente a forma que o defeito tinha.
    expect(orfas).toContain("rating");
    expect(orfas).toContain("preferred");
  });
});
