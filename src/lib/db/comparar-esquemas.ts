/**
 * ════════════════════════════════════════════════════════════════════════════
 * DUAS DESCRIÇÕES DA MESMA BASE DE DADOS, POSTAS LADO A LADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `db/schema.sql` é a base de dados como a ESCREVEMOS; `tipos-da-base.ts` é a
 * base de dados como ELA É, gerada da base viva (docs/ESTRUTURA-DOS-DADOS.md,
 * P1). Quando as duas discordam, uma delas mente: ou há uma migração por
 * aplicar, ou alguém mexeu na base sem passar pelo ficheiro. Este módulo lê as
 * duas para a mesma forma — tabela → coluna → {tipo TypeScript, anulável} — e
 * diz onde diferem.
 *
 * Sem rede de propósito: o CI não tem (nem deve ter) a chave do Supabase. O
 * que prende os tipos à base VIVA é regenerá-los; o que este módulo prende é
 * que, a cada PR, o ficheiro que se escreve à mão e o que se gerou contam a
 * mesma história.
 *
 * Só para testes e ferramentas: importa o compilador de TypeScript, e nada da
 * aplicação o deve importar.
 */
import ts from "typescript";

/** Uma coluna, reduzida ao que as duas descrições conseguem dizer. */
export type Coluna = {
  /** O tipo como o TypeScript o vê: `string`, `number`, `boolean`, `Json`. */
  tipo: string;
  anulavel: boolean;
  /** O tipo SQL (primeira palavra, em minúsculas). Só o `schema.sql` o sabe;
   *  dos tipos gerados vem vazio, e a comparação não olha para ele. */
  tipoSql?: string;
};

export type Esquema = Map<string, Map<string, Coluna>>;

// ── db/schema.sql ───────────────────────────────────────────────────────────

/** As palavras com que começa uma restrição de tabela, que não é coluna. */
const NAO_SAO_COLUNAS = new Set(["primary", "unique", "constraint", "check", "foreign", "exclude"]);

/**
 * O tipo SQL → o tipo que o gerador do Supabase escreve. Um tipo que não está
 * aqui é um erro de propósito: uma coluna `interval` nova não pode passar a
 * comparar-se como `string` só porque ninguém pensou nela.
 */
const TIPO_TS: Record<string, string> = {
  text: "string",
  uuid: "string",
  timestamptz: "string",
  timestamp: "string",
  date: "string",
  time: "string",
  varchar: "string",
  int: "number",
  integer: "number",
  int4: "number",
  int8: "number",
  bigint: "number",
  smallint: "number",
  numeric: "number",
  real: "number",
  double: "number",
  boolean: "boolean",
  bool: "boolean",
  jsonb: "Json",
  json: "Json",
};

function semComentarios(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

/** Divide pelas vírgulas que não estão dentro de parênteses. */
function porVirgulasDeTopo(corpo: string): string[] {
  const partes: string[] = [];
  let nivel = 0;
  let atual = "";
  for (const ch of corpo) {
    if (ch === "(") nivel++;
    if (ch === ")") nivel--;
    if (ch === "," && nivel === 0) {
      partes.push(atual);
      atual = "";
    } else {
      atual += ch;
    }
  }
  partes.push(atual);
  return partes.map((p) => p.trim()).filter(Boolean);
}

/** `nome tipo …resto` → a coluna, ou `null` se a definição é uma restrição. */
function colunaDaDefinicao(def: string): [string, Coluna] | null {
  const m = /^([a-z_][a-z0-9_]*)\s+([a-z0-9_]+)/i.exec(def);
  if (!m || NAO_SAO_COLUNAS.has(m[1].toLowerCase())) return null;
  const tipoSql = m[2].toLowerCase();
  const tipo = TIPO_TS[tipoSql];
  if (!tipo) throw new Error(`Tipo SQL sem correspondência em comparar-esquemas.ts: ${tipoSql}`);
  const resto = def.slice(m[0].length).toLowerCase();
  const anulavel = !/\bnot\s+null\b|\bprimary\s+key\b/.test(resto);
  return [m[1], { tipo, anulavel, tipoSql }];
}

/**
 * As tabelas de `public` com as suas colunas, tal como `db/schema.sql` as
 * deixa depois de correr de ponta a ponta: o `create table` e, por cima, cada
 * `alter table … add column if not exists`.
 */
export function esquemaDoSql(sqlComComentarios: string): Esquema {
  const sql = semComentarios(sqlComComentarios);
  const esquema: Esquema = new Map();

  const criacao = /create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\s*\);/gi;
  for (let m = criacao.exec(sql); m; m = criacao.exec(sql)) {
    const colunas = new Map<string, Coluna>();
    const chavePrimaria: string[] = [];
    for (const def of porVirgulasDeTopo(m[2])) {
      const coluna = colunaDaDefinicao(def);
      if (coluna) colunas.set(...coluna);
      // `primary key (a, b)` ao nível da tabela torna as colunas `not null`
      // tanto como o `primary key` escrito ao lado de cada uma.
      const pk = /^primary\s+key\s*\(([^)]*)\)/i.exec(def);
      if (pk) chavePrimaria.push(...pk[1].split(",").map((c) => c.trim()));
    }
    for (const c of chavePrimaria) {
      const coluna = colunas.get(c);
      if (coluna) coluna.anulavel = false;
    }
    esquema.set(m[1], colunas);
  }

  const acrescento = /alter table public\.(\w+)\s+add column if not exists\s+([^;]+);/gi;
  for (let m = acrescento.exec(sql); m; m = acrescento.exec(sql)) {
    const coluna = colunaDaDefinicao(m[2].trim());
    if (!coluna) continue;
    const colunas = esquema.get(m[1]) ?? new Map<string, Coluna>();
    colunas.set(...coluna);
    esquema.set(m[1], colunas);
  }

  return esquema;
}

// ── tipos-da-base.ts ────────────────────────────────────────────────────────

function membro(no: ts.TypeNode | undefined, nome: string): ts.TypeNode | undefined {
  if (!no || !ts.isTypeLiteralNode(no)) return undefined;
  for (const m of no.members) {
    if (ts.isPropertySignature(m) && m.name.getText() === nome) return m.type;
  }
  return undefined;
}

/**
 * As tabelas de `public` com as colunas da forma `Row`, lidas pela árvore do
 * compilador e não por expressão regular — o gerador muda a indentação e a
 * ordem das uniões entre versões, e a árvore não.
 */
export function esquemaDosTipos(fonte: string): Esquema {
  const ficheiro = ts.createSourceFile("tipos-da-base.ts", fonte, ts.ScriptTarget.Latest, true);
  const database = ficheiro.statements.find(
    (s): s is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === "Database",
  );
  const tabelas = membro(membro(database?.type, "public"), "Tables");
  if (!tabelas || !ts.isTypeLiteralNode(tabelas)) {
    throw new Error("tipos-da-base.ts não tem Database.public.Tables — foi gerado?");
  }

  const esquema: Esquema = new Map();
  for (const tabela of tabelas.members) {
    if (!ts.isPropertySignature(tabela)) continue;
    const row = membro(tabela.type, "Row");
    if (!row || !ts.isTypeLiteralNode(row)) continue;
    const colunas = new Map<string, Coluna>();
    for (const col of row.members) {
      if (!ts.isPropertySignature(col) || !col.type) continue;
      const partes = col.type
        .getText()
        .split("|")
        .map((p) => p.trim());
      colunas.set(col.name.getText(), {
        tipo: partes.filter((p) => p !== "null").join(" | "),
        anulavel: partes.includes("null"),
      });
    }
    esquema.set(tabela.name.getText(), colunas);
  }
  return esquema;
}

// ── A comparação ────────────────────────────────────────────────────────────

/**
 * Cada diferença numa linha legível, ordenada, com a tabela (e a coluna) à
 * frente — é isto que aparece no CI quando fica vermelho, e é isto que se
 * cola na lista das divergências conhecidas.
 */
export function diferencasEntre(ficheiro: Esquema, base: Esquema): string[] {
  const dif: string[] = [];
  const tabelas = new Set([...ficheiro.keys(), ...base.keys()]);
  for (const t of tabelas) {
    const f = ficheiro.get(t);
    const b = base.get(t);
    if (!f) {
      dif.push(`${t}: existe na base e não no schema.sql`);
      continue;
    }
    if (!b) {
      dif.push(`${t}: existe no schema.sql e não na base`);
      continue;
    }
    for (const c of new Set([...f.keys(), ...b.keys()])) {
      const cf = f.get(c);
      const cb = b.get(c);
      if (!cf) dif.push(`${t}.${c}: existe na base e não no schema.sql`);
      else if (!cb) dif.push(`${t}.${c}: existe no schema.sql e não na base`);
      else {
        if (cf.tipo !== cb.tipo)
          dif.push(`${t}.${c}: tipo ${cf.tipo} no schema.sql, ${cb.tipo} na base`);
        if (cf.anulavel !== cb.anulavel) {
          const d = (a: boolean) => (a ? "anulável" : "not null");
          dif.push(`${t}.${c}: ${d(cf.anulavel)} no schema.sql, ${d(cb.anulavel)} na base`);
        }
      }
    }
  }
  return dif.sort();
}
