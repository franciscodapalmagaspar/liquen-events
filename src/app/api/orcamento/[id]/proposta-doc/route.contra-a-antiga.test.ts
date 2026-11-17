/**
 * A ROTA NOVA CONTRA A ANTIGA, LADO A LADO (fase 5) — a prova dos retratos que
 * não foram tirados antes de partir.
 *
 * Os retratos de `route.caracterizacao.test.ts` foram tirados com a rota ainda
 * inteira, excepto os dos CORPOS ESTRANHOS, que vieram depois. Este teste é o
 * que os certifica: tira a rota antiga do git (`25180ccd`, o commit de
 * caracterização), põe-na ao lado da nova, corre os mesmos cenários nas duas
 * com os mesmos duplos, e exige o mesmo retrato, letra a letra.
 *
 * Corre SEMPRE que o clone tem esse commit: aqui, num clone inteiro feito
 * enquanto o ramo existir, e no CI — o checkout lá é raso, mas o passo «A rota
 * antiga da fase 5» (`.github/workflows/ci.yml`) traz só esse commit. Depois
 * de o ramo entrar por squash e desaparecer, não há rota antiga a tirar, e
 * salta — dito no nome do teste. `COMPARAR_COM_A_ROTA_ANTIGA=0`
 * desliga-o.
 *
 * TEM PRAZO, e está escrito: a rota antiga importa os módulos de HOJE, e um
 * dia um deles muda de forma e ela deixa de carregar, ou responde diferente
 * sem que a nova tenha mudado. A mensagem da falha di-lo ({@link SE_FALHAR}):
 * esse dia é o do desvio 8 de `docs/ESTRUTURA-DO-CODIGO.md` — o retrato
 * reduz-se aos casos de fronteira e este ficheiro apaga-se no mesmo PR; não se
 * «conserta» a rota antiga.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import {
  duplosEsquecidos,
  params,
  repor,
  retrato,
  retratosEmSequencia,
} from "./_caracterizacao/palco";
import { POST } from "./route";
import { CENARIOS, ESTRANHOS, SEQUENCIAS } from "./_caracterizacao/cenarios";

// Os duplos (`_caracterizacao/duplos.ts`); o vitest sobe estes `vi.mock` para o topo.
vi.mock("@/lib/admin-auth", async () =>
  (await import("./_caracterizacao/duplos")).DUPLOS["@/lib/admin-auth"](),
);
vi.mock("@/lib/quotes-store", async () =>
  (await import("./_caracterizacao/duplos")).DUPLOS["@/lib/quotes-store"](),
);
vi.mock("@/lib/proposals-store", async () =>
  (await import("./_caracterizacao/duplos")).DUPLOS["@/lib/proposals-store"](),
);
vi.mock("@/lib/contracts-store", async () =>
  (await import("./_caracterizacao/duplos")).DUPLOS["@/lib/contracts-store"](),
);
vi.mock("@/lib/proposal-doc-render", async () =>
  (await import("./_caracterizacao/duplos")).DUPLOS["@/lib/proposal-doc-render"](),
);
vi.mock("@/lib/email-templates-store", async (original) =>
  (await import("./_caracterizacao/duplos")).DUPLOS["@/lib/email-templates-store"](original),
);
vi.mock("@/lib/proposta-link-curto", async () =>
  (await import("./_caracterizacao/duplos")).DUPLOS["@/lib/proposta-link-curto"](),
);
vi.mock("@/lib/mail", async () =>
  (await import("./_caracterizacao/duplos")).DUPLOS["@/lib/mail"](),
);
vi.mock("@/lib/envios-de-proposta", async () =>
  (await import("./_caracterizacao/duplos")).DUPLOS["@/lib/envios-de-proposta"](),
);
vi.mock("@/lib/proposta-fotos-verificacao", async () =>
  (await import("./_caracterizacao/duplos")).DUPLOS["@/lib/proposta-fotos-verificacao"](),
);
vi.mock("@/lib/proposal-pdf-guardado", async () =>
  (await import("./_caracterizacao/duplos")).DUPLOS["@/lib/proposal-pdf-guardado"](),
);

/** O commit de caracterização (a rota é a mesma no pai, `bfd82ccf`). */
const COMMIT_DA_CARACTERIZACAO = "25180ccd";
/** A rota, relativa à raiz do repositório (o que o `git show` pede). */
const ROTA = "src/app/api/orcamento/[id]/proposta-doc/route.ts";
/**
 * Onde a antiga fica a correr: DENTRO do repositório (o `node_modules` e os
 * `@/` resolvem como os da nova — a antiga só tem imports `@/` e de pacotes),
 * mas fora do `src/`: um Ctrl-C a meio não deixa lá um ficheiro que o `tsc` e
 * o `next build` apanhariam.
 */
function git(...args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: import.meta.dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}
const RAIZ = git("rev-parse", "--show-toplevel") ?? "";
/** Há rota antiga para tirar? (Num clone raso, ou sem git, não há.) */
const HA_ROTA_ANTIGA =
  process.env.COMPARAR_COM_A_ROTA_ANTIGA !== "0" &&
  RAIZ !== "" &&
  git("cat-file", "-e", `${COMMIT_DA_CARACTERIZACAO}^{commit}`) !== null;
/** Uma pasta por corrida: duas corridas ao mesmo tempo não se pisam. */
const CACHE = path.join(RAIZ, "node_modules", ".cache");

/** O que dizer quando a comparação falha — pode não ser uma regressão. */
const SE_FALHAR =
  "A rota nova responde diferente da antiga. Se mudaste a resposta, é uma regressão. " +
  "Se mudaste a FORMA de um módulo que a rota antiga importa, a comparação acabou: " +
  "é o dia do desvio 8 de docs/ESTRUTURA-DO-CODIGO.md (reduzir o retrato e apagar " +
  "este ficheiro). COMPARAR_COM_A_ROTA_ANTIGA=0 desliga-a até lá.";

type Post = typeof POST;

describe.skipIf(!HA_ROTA_ANTIGA)(
  `a rota nova responde o mesmo que a antiga (${COMMIT_DA_CARACTERIZACAO}; salta num clone raso)`,
  () => {
    let postAntigo: Post;
    let pasta = "";

    beforeAll(async () => {
      const antiga = execFileSync("git", ["show", `${COMMIT_DA_CARACTERIZACAO}:${ROTA}`], {
        cwd: RAIZ,
      });
      mkdirSync(CACHE, { recursive: true });
      pasta = mkdtempSync(path.join(CACHE, "rota-antiga-"));
      const ficheiro = path.join(pasta, "route.ts");
      writeFileSync(ficheiro, antiga);
      try {
        ({ POST: postAntigo } = (await import(/* @vite-ignore */ ficheiro)) as { POST: Post });
      } catch (e) {
        throw new Error(`A rota antiga já não carrega (${String(e)}). ${SE_FALHAR}`);
      }
    });
    afterAll(() => {
      if (pasta) rmSync(pasta, { recursive: true, force: true });
    });

    const casos: Array<[string, () => void, () => NextRequest]> = [
      ...CENARIOS,
      ...ESTRANHOS.map(
        ([nome, fazer, preparar]) =>
          [nome, preparar ?? (() => {}), fazer] as [string, () => void, () => NextRequest],
      ),
    ];

    it("cada duplo está declarado neste teste", async () => {
      expect(await duplosEsquecidos()).toEqual([]);
    });

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
      expect(nova, SE_FALHAR).toBe(antiga);
    });

    it.each(SEQUENCIAS)("sequência: %s", async (_nome, preparar, pedidos) => {
      repor();
      preparar();
      const antiga = await retratosEmSequencia(postAntigo, pedidos);
      repor();
      preparar();
      const nova = await retratosEmSequencia(POST, pedidos);
      expect(nova, SE_FALHAR).toEqual(antiga);
    });
  },
);
