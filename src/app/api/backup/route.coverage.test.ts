import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { BACKUP_DATASETS, NOT_BACKED_UP, PARTIALLY_BACKED_UP } from "./route";
import { ESPACOS } from "@/lib/app-state/espacos";

describe("o app_state na cópia segue o registo dos espaços", () => {
  it("vão os conjuntos que o registo marca com `copia.leva`, e só esses", () => {
    const doRegisto = Object.values(ESPACOS)
      .flatMap((e) => (e.copia.leva ? [e.copia.conjunto] : []))
      .sort();
    const naCopia = BACKUP_DATASETS.filter((d) => d.table === "app_state")
      .map((d) => d.key)
      .sort();
    expect(naCopia).toEqual(doRegisto);
    expect(naCopia).toEqual(["indiceDoBlob", "proposalDrafts", "proposalEmails"]);
  });
});

/**
 * A rede de segurança da cópia de segurança.
 *
 * O defeito que motivou estes testes não foi um erro de lógica: foi alguém
 * acrescentar as faturas, os contratos, o inventário, os modelos de email e os
 * temas à aplicação e nunca ninguém se lembrar de os acrescentar TAMBÉM ao
 * backup. Um teste que enumerasse à mão os conjuntos esperados não apanhava
 * nada — seria só uma segunda lista a envelhecer ao lado da primeira, e a
 * primeira pessoa a acrescentar um store atualizava as duas ou nenhuma.
 *
 * Por isso a verdade destes testes vem de FORA do código do backup:
 *
 *   1. do disco — todo o `src/lib/*-store.ts` expõe um `mapper.table`, e essa
 *      tabela tem de aparecer na cópia;
 *   2. de `db/schema.sql` — toda a tabela criada lá ou vai na cópia ou está
 *      explicitamente documentada em `NOT_BACKED_UP` com a razão.
 *
 * Nenhuma das duas se atualiza sozinha a favor de quem esquece: acrescentar um
 * store novo, ou uma tabela nova, põe estes testes vermelhos até a decisão ser
 * tomada — levar na cópia, ou justificar por escrito porque não vai.
 */

const REPO_ROOT = process.cwd();
const LIB_DIR = path.join(REPO_ROOT, "src", "lib");

/** Os nomes (sem extensão) dos `*-store.ts` que existem MESMO em src/lib. */
const storeNames: string[] = readdirSync(LIB_DIR)
  .filter((f) => f.endsWith("-store.ts"))
  .map((f) => f.slice(0, -3))
  .sort();

/** Carrega um store pelo nome. O caminho é um literal com uma variável, que o
    transformador resolve como um padrão — nunca uma lista escrita à mão. */
const loadStore = (name: string): Promise<{ mapper?: { table?: string } }> =>
  import(`../../../lib/${name}.ts`);

const backedUpTables = new Set(BACKUP_DATASETS.map((d) => d.table));

describe("cobertura do backup", () => {
  it("os stores são mesmo encontrados no disco", () => {
    // Sem isto, uma leitura que deixasse de encontrar ficheiros tornava os
    // testes seguintes verdes por vazio — a falha mais perigosa possível aqui.
    expect(storeNames.length).toBeGreaterThanOrEqual(11);
    expect(storeNames).toContain("invoices-store");
    expect(storeNames).toContain("contracts-store");
  });

  it("TODO o store de src/lib vai na cópia (lista tirada do disco, não escrita à mão)", async () => {
    const missing: string[] = [];
    for (const name of storeNames) {
      const mod = await loadStore(name);
      const table = mod.mapper?.table;
      expect(
        table,
        `${name}.ts não expõe \`mapper.table\` — o backup não o consegue seguir`,
      ).toBeTruthy();
      // A saída é NOT_BACKED_UP, e é a mesma que a mensagem de erro sempre
      // prometeu — até aqui não estava implementada, e o primeiro store
      // legitimamente excluído (as passkeys) mostrou-o. Continua a não haver
      // silêncio: um store novo falha na mesma até alguém decidir, e a decisão
      // "não vai" custa uma razão por escrito, verificada mais abaixo.
      if (!backedUpTables.has(table!) && !(table! in NOT_BACKED_UP)) {
        missing.push(`${name}.ts → tabela "${table}"`);
      }
    }
    expect(
      missing,
      `Estes stores guardam dados que NÃO vão na cópia de segurança. ` +
        `Acrescente-os a BACKUP_DATASETS em src/app/api/backup/route.ts ` +
        `(ou, se não devem mesmo ir, explique porquê em NOT_BACKED_UP):\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
  });

  it("cada conjunto da cópia sabe ler-se e tem chave e tabela únicas", () => {
    expect(BACKUP_DATASETS.length).toBeGreaterThan(0);
    for (const d of BACKUP_DATASETS) {
      expect(d.key, "conjunto sem chave").toBeTruthy();
      expect(d.table, `conjunto "${d.key}" sem tabela`).toBeTruthy();
      expect(typeof d.list, `conjunto "${d.key}" sem leitura`).toBe("function");
    }
    const keys = BACKUP_DATASETS.map((d) => d.key);
    expect(new Set(keys).size, "chaves repetidas escondem conjuntos umas das outras").toBe(
      keys.length,
    );
    /**
     * As TABELAS são únicas — com uma excepção declarada, e não uma tolerância
     * geral. `app_state` é uma tabela PARTILHADA e leva na cópia dois espaços
     * de nomes distintos (`proposal-draft:…` e `envio-de-proposta:…`), cada um
     * com a sua leitura, o seu tecto de varredura e a sua escrita à medida na
     * reposição. Fundi-los num conjunto só era misturar o trabalho por acabar
     * com as cópias do que já saiu, que se repõem por caminhos diferentes.
     *
     * A regra que continua a valer, e é a que interessa: duas tabelas iguais
     * só se admitem quando a tabela é a `app_state`. Qualquer outra repetição
     * é um conjunto a esconder outro, e cai aqui.
     */
    const tables = BACKUP_DATASETS.map((d) => d.table);
    const repetidas = tables.filter((t, i) => tables.indexOf(t) !== i);
    expect(
      [...new Set(repetidas)].filter((t) => t !== "app_state"),
      "tabelas repetidas em BACKUP_DATASETS (só a `app_state` pode, por ser partilhada)",
    ).toEqual([]);
    // Controlo positivo: a excepção não é uma porta aberta — a `app_state`
    // está mesmo lá três vezes (rascunhos, envios e, desde 17/11, o índice do
    // Vercel Blob), e é por isso que a lista acima não é vazia por não haver
    // repetições nenhumas.
    expect(tables.filter((t) => t === "app_state").length).toBe(3);
  });

  describe("contra db/schema.sql", () => {
    const sql = readFileSync(path.join(REPO_ROOT, "db", "schema.sql"), "utf-8");
    const schemaTables = [
      ...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi),
    ].map((m) => m[1]);

    it("o schema foi mesmo lido (senão o teste seguinte passa por vazio)", () => {
      expect(schemaTables.length).toBeGreaterThanOrEqual(14);
      expect(schemaTables).toContain("invoices");
    });

    it("toda a tabela do schema ou vai na cópia ou está justificada por escrito", () => {
      const unaccounted = schemaTables.filter(
        (t) => !backedUpTables.has(t) && !(t in NOT_BACKED_UP),
      );
      expect(
        unaccounted,
        `Tabelas em db/schema.sql que ninguém decidiu se vão na cópia: ${unaccounted.join(", ")}. ` +
          `Acrescente-as a BACKUP_DATASETS ou registe a razão em NOT_BACKED_UP.`,
      ).toEqual([]);
    });

    it("nenhuma tabela declarada na cópia é inventada (apanha gralhas nos literais)", () => {
      // `BACKUP_DATASETS.table` é escrito à mão; uma gralha ("invoces") deixaria
      // o store por cobrir no teste acima, mas com uma mensagem enviesada. Aqui
      // aponta-se diretamente ao literal errado.
      const inventadas = BACKUP_DATASETS.map((d) => d.table).filter(
        (t) => !schemaTables.includes(t),
      );
      expect(
        inventadas,
        `Tabelas declaradas em BACKUP_DATASETS que não existem em db/schema.sql: ${inventadas.join(", ")}`,
      ).toEqual([]);
    });

    /**
     * A terceira lista, e a razão de ela existir.
     *
     * `app_state` guarda duas coisas de valor oposto: os RASCUNHOS do estúdio
     * (trabalho de horas que não existe em mais lado nenhum) e os marcadores de
     * operação (que se refazem sozinhos). A cópia leva os primeiros e não os
     * segundos, e nenhuma das duas listas antigas sabia dizer isso: em
     * `NOT_BACKED_UP` era falso, e só em `BACKUP_DATASETS` dava a entender que
     * a tabela ia inteira. Estas asserções prendem a única saída honesta —
     * a tabela está na cópia E a parte que fica de fora está escrita.
     */
    it("uma tabela que só vai EM PARTE está na cópia e diz, por escrito, o que fica de fora", () => {
      expect(
        Object.keys(PARTIALLY_BACKED_UP).length,
        "a lista das tabelas parciais ficou vazia — se deixou de haver nenhuma, apague-a",
      ).toBeGreaterThan(0);
      for (const [table, reason] of Object.entries(PARTIALLY_BACKED_UP)) {
        expect(schemaTables, `PARTIALLY_BACKED_UP fala de "${table}", que não existe`).toContain(
          table,
        );
        expect(
          backedUpTables.has(table),
          `"${table}" é dada como parcialmente copiada mas não vai na cópia — ou entra em BACKUP_DATASETS, ou a explicação passa para NOT_BACKED_UP`,
        ).toBe(true);
        expect(
          table in NOT_BACKED_UP,
          `"${table}" está ao mesmo tempo excluída e parcialmente copiada`,
        ).toBe(false);
        expect(
          reason.length,
          `"${table}" vai em parte e não diz QUE parte — o ficheiro fica a dar a entender que leva a tabela toda`,
        ).toBeGreaterThan(120);
      }
    });

    it("o espaço de nomes dos rascunhos é o que a cópia diz que é (não uma frase a envelhecer)", async () => {
      // A explicação de `app_state` nomeia o prefixo. Se ele mudar em
      // `proposal-drafts.ts` e a frase ficar, o ficheiro passa a dizer a quem o
      // abre onde procurar uma coisa que já não está lá.
      const { DRAFT_PREFIX } = await import("@/lib/proposal-drafts");
      expect(PARTIALLY_BACKED_UP.app_state).toContain(DRAFT_PREFIX);
      const rascunhos = BACKUP_DATASETS.find((d) => d.key === "proposalDrafts");
      expect(rascunhos?.table, "os rascunhos deixaram de vir do app_state").toBe("app_state");
    });

    it("as exclusões continuam a fazer sentido (nada obsoleto nem contraditório)", () => {
      for (const [table, reason] of Object.entries(NOT_BACKED_UP)) {
        expect(
          schemaTables,
          `NOT_BACKED_UP fala de "${table}", que já não existe no schema`,
        ).toContain(table);
        expect(
          backedUpTables.has(table),
          `"${table}" está ao mesmo tempo excluída e na cópia`,
        ).toBe(false);
        expect(reason.length, `a exclusão de "${table}" não explica nada`).toBeGreaterThan(40);
      }
    });
  });
});
