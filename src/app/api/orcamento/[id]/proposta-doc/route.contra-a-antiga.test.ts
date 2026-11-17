/**
 * A ROTA NOVA CONTRA A ANTIGA, LADO A LADO (fase 5) — a prova dos retratos que
 * não foram tirados antes de partir.
 *
 * Os retratos de `route.caracterizacao.test.ts` foram tirados com a rota ainda
 * inteira, excepto os dos CORPOS ESTRANHOS, que vieram depois. Este teste é o
 * que os certifica: tira a rota antiga do git (`bfd82ccf`, o commit de
 * caracterização), põe-na ao lado da nova, corre os mesmos cenários nas duas
 * com o mesmo palco, e exige o mesmo retrato, letra a letra.
 *
 * Só corre a pedido — `COMPARAR_COM_A_ROTA_ANTIGA=1 npx vitest run <este>` —,
 * porque precisa do git com o histórico (um clone raso não o tem) e porque a
 * rota antiga importa os módulos de HOJE: quando um deles mudar de forma, ela
 * deixa de compilar, e isso não é uma regressão da nova. Correu verde a 17/11
 * (70 casos). Enquanto compilar, é a prova; depois disso, o retrato guardado
 * é que manda.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
// O palco ANTES das rotas: é ele que regista os duplos.
import { params, repor, retrato } from "./_caracterizacao/palco";
import { POST } from "./route";
import { CENARIOS, ESTRANHOS } from "./_caracterizacao/cenarios";

const COMMIT_DA_CARACTERIZACAO = "bfd82ccf";
/** A rota, relativa à raiz do repositório (o que o `git show` pede). */
const ROTA = "src/app/api/orcamento/[id]/proposta-doc/route.ts";
/**
 * Onde a antiga fica a correr: DENTRO do repositório (o `node_modules` e os
 * `@/` resolvem como os da nova — a antiga só tem imports `@/` e de pacotes),
 * mas fora do `src/`: um Ctrl-C a meio não deixa lá um ficheiro que o `tsc` e
 * o `next build` apanhariam.
 */
const RAIZ = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: import.meta.dirname,
  encoding: "utf8",
}).trim();
const PASTA_DA_ANTIGA = path.join(RAIZ, "node_modules", ".cache", "rota-antiga");
const FICHEIRO_DA_ANTIGA = path.join(PASTA_DA_ANTIGA, "route.ts");

type Post = typeof POST;

describe.skipIf(!process.env.COMPARAR_COM_A_ROTA_ANTIGA)(
  "a rota nova responde o mesmo que a antiga",
  () => {
    let postAntigo: Post;

    beforeAll(async () => {
      const antiga = execFileSync("git", ["show", `${COMMIT_DA_CARACTERIZACAO}:${ROTA}`], {
        cwd: RAIZ,
      });
      mkdirSync(PASTA_DA_ANTIGA, { recursive: true });
      writeFileSync(FICHEIRO_DA_ANTIGA, antiga);
      ({ POST: postAntigo } = (await import(/* @vite-ignore */ FICHEIRO_DA_ANTIGA)) as {
        POST: Post;
      });
    });
    afterAll(() => rmSync(PASTA_DA_ANTIGA, { recursive: true, force: true }));

    const casos: Array<[string, () => void, () => NextRequest]> = [
      ...CENARIOS,
      ...ESTRANHOS.map(
        ([nome, fazer, preparar]) =>
          [nome, preparar ?? (() => {}), fazer] as [string, () => void, () => NextRequest],
      ),
    ];

    it.each(casos)("%s", async (_nome, preparar, fazer) => {
      // O relógio que um cenário espia («sem tempo para o email») volta ao
      // verdadeiro depois de cada rota: o caso seguinte corre com o tempo a
      // passar, nas duas.
      const correr = async (post: Post) => {
        repor();
        preparar();
        try {
          return await retrato(await post(fazer(), { params }));
        } finally {
          vi.mocked(Date.now).mockRestore?.();
        }
      };
      const antiga = await correr(postAntigo);
      const nova = await correr(POST);
      expect(nova).toBe(antiga);
    });
  },
);
