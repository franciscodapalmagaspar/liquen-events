/**
 * O tipo da base de dados que a aplicação usa: o GERADO (`tipos-da-base.ts`,
 * nunca editado à mão) com uma única correção, escrita aqui à vista.
 *
 * `app_state.value` é `jsonb`, e o gerador di-lo `Json`. Mas o `app_state` é um
 * chave/valor com uma forma por espaço de nomes (docs/ESTRUTURA-DOS-DADOS.md,
 * §1.3), e cada espaço tem o seu tipo e o seu esquema no registo dos espaços
 * (`src/lib/app-state/espacos.ts`). Com `Json`, cada `interface` de domínio
 * gravada lá teria de passar por um `as` (uma `interface` não tem assinatura
 * de índice e o TypeScript não a aceita como `Json`) — e um `as` em cada
 * gravação é exatamente o que este passo veio tirar. `unknown` é a verdade: a
 * coluna aceita qualquer valor serializável, e quem lê não pode assumir nada
 * sem validar. É a correção que a documentação do Supabase recomenda para
 * colunas JSON («Generating TypeScript Types», *Helper types for JSON fields*),
 * escrita sem a dependência `type-fest`.
 */
import type { Database as BaseGerada } from "./tipos-da-base";

type TabelasGeradas = BaseGerada["public"]["Tables"];
type AppStateGerada = TabelasGeradas["app_state"];

type AppState = {
  Row: Omit<AppStateGerada["Row"], "value"> & { value: unknown };
  Insert: Omit<AppStateGerada["Insert"], "value"> & { value?: unknown };
  Update: Omit<AppStateGerada["Update"], "value"> & { value?: unknown };
  Relationships: AppStateGerada["Relationships"];
};

export type Database = Omit<BaseGerada, "public"> & {
  public: Omit<BaseGerada["public"], "Tables"> & {
    Tables: Omit<TabelasGeradas, "app_state"> & { app_state: AppState };
  };
};

/** O nome de uma tabela que existe na base de dados viva. */
export type NomeDaTabela = keyof Database["public"]["Tables"];

/** Uma linha de uma tabela, tal como o Postgres a devolve. */
export type Linha<N extends NomeDaTabela> = Database["public"]["Tables"][N]["Row"];
