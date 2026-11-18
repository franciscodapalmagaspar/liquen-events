# `db/` — a base de dados como a escrevemos

- `schema.sql` — o esquema inteiro, escrito à mão. Corre-se no editor de SQL do
  Supabase numa instalação nova e é idempotente (`if not exists`).
- `migracoes/` — cada mudança à base, com o seu `.volta.sql` (como desfazer) e,
  quando apaga ou move dados, um `.copia.sql` (a cópia que se tira antes).

## Os tipos gerados (`npm run tipos:base`)

`src/lib/db/tipos-da-base.ts` é a base como ELA É, gerada da base viva; nunca
se edita à mão. Depois de aplicar uma migração em produção, regenera-se na
máquina de quem a aplicou:

```sh
SUPABASE_PROJECT_REF=<referência do projeto> npm run tipos:base
npx vitest run src/lib/db
```

- Precisa da [CLI do Supabase](https://supabase.com/docs/guides/cli) instalada
  e com sessão iniciada (`supabase login`). A chave fica na CLI: **nunca** num
  ficheiro do repositório, num `.env` que se junte, nem no chat.
- Só lê o esquema, não os dados. Fica **fora do CI** de propósito: o CI não tem
  chave do Supabase, e não deve ter.
- O teste `src/lib/db/tipos-da-base.test.ts` compara o `schema.sql` com os tipos
  gerados (sem rede) e fica vermelho se discordarem fora da lista das
  divergências conhecidas, ou se o número de tabelas mudar sem se dizer.
