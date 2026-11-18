/**
 * A ROTA NOVA CONTRA A ANTIGA, LADO A LADO (fase 5) — a prova dos retratos que
 * não foram tirados antes de partir.
 *
 * Os retratos de `route.caracterizacao.test.ts` foram tirados com a rota ainda
 * inteira, excepto os dos CORPOS ESTRANHOS, que vieram depois. Este teste é o
 * que os certifica: tira a rota antiga do git ({@link COMMIT_DA_ROTA_ANTIGA}),
 * põe-na ao lado da nova, corre os mesmos cenários nas duas com os mesmos
 * duplos, e exige o mesmo retrato, letra a letra.
 *
 * Corre SEMPRE que o clone tem esse commit — é um commit do `main`, por isso
 * qualquer clone inteiro o tem — e no CI, onde o checkout é raso e o próprio
 * teste vai buscar só esse commit ({@link HA_ROTA_ANTIGA}). O fim vem do
 * prazo, e não da falta do commit. Num clone sem o commit, salta — dito no
 * nome do teste. `COMPARAR_COM_A_ROTA_ANTIGA=0` desliga-o.
 *
 * TEM PRAZO, e cumpre-se sozinho ({@link PRAZO}): depois desse dia o teste
 * deixa de correr e o nome e o registo pedem o desvio 8. Antes disso pode acabar mais cedo — a rota antiga
 * importa os módulos de HOJE, e um dia um deles muda de forma e ela deixa de
 * carregar, ou responde diferente sem que a nova tenha mudado. A mensagem da falha di-lo ({@link SE_FALHAR}):
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

/**
 * O PRAZO da prova. Depois deste dia ela deixa de correr, e DI-LO: o nome do
 * teste passa a pedir o desvio 8 e o registo do CI leva um aviso. Não
 * bloqueia — um PR urgente não pode ficar vermelho por causa de um andaime —,
 * mas também não se cala. Mudá-lo é uma decisão, e diz-se no PR.
 */
const PRAZO = "2026-12-31";
const PASSOU_O_PRAZO = new Date().toISOString().slice(0, 10) > PRAZO;
const PEDIDO_DO_PRAZO =
  `o prazo desta prova (${PRAZO}) passou: aplicar o desvio 8 de ` +
  "docs/ESTRUTURA-DO-CODIGO.md (reduzir o retrato, apagar este ficheiro)";
/**
 * Um salto que se VÊ: no GitHub Actions, uma anotação de aviso no PR (a linha
 * `::warning` lida pelo runner); fora dele, um aviso no registo.
 */
function avisar(porque: string): void {
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::warning title=A prova contra a rota antiga não correu::${porque}`);
  } else {
    console.warn(`route.contra-a-antiga: ${porque}`);
  }
}

/**
 * A rota antiga é a do `main` (o lote de 17/11, `e8a4a94b`): a do commit de
 * caracterização (`25180ccd`) mais as duas coisas que o `main` lhe juntou
 * depois — o «sim» antigo às fotos em falta (até ao fim de 18/11) e o rodapé
 * legal dos emails. Compara-se com a que está em produção, e não com a de
 * quando se tirou o retrato.
 */
const COMMIT_DA_ROTA_ANTIGA = "e8a4a94b";
/** O mesmo, por inteiro: é o que o `git fetch` de um só commit pede. */
const COMMIT_COMPLETO = "e8a4a94b2eba1fd0245c3e2d1e4f0b368c5ceefa";
/** A rota, relativa à raiz do repositório (o que o `git show` pede). */
const ROTA = "src/app/api/orcamento/[id]/proposta-doc/route.ts";
/**
 * Onde a antiga fica a correr: DENTRO do repositório (o `node_modules` e os
 * `@/` resolvem como os da nova — a antiga só tem imports `@/` e de pacotes),
 * mas fora do `src/`: um Ctrl-C a meio não deixa lá um ficheiro que o `tsc` e
 * o `next build` apanhariam.
 */
/** O prazo de um comando local; o da ida ao GitHub é {@link PRAZO_DA_BUSCA_MS}. */
const PRAZO_LOCAL_MS = 15_000;
/** Um runner lento a buscar um commit não pode fazer saltar a prova; uma rede
 *  pendurada também não pode prender a parte do CI (o job tem 20 min). */
const PRAZO_DA_BUSCA_MS = 60_000;
function git(args: string[], prazoMs = PRAZO_LOCAL_MS): string | null {
  try {
    return execFileSync("git", args, {
      cwd: import.meta.dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: prazoMs,
    }).trim();
  } catch {
    return null;
  }
}
const RAIZ = git(["rev-parse", "--show-toplevel"]) ?? "";
/** O commit está no clone? */
const temOCommit = () => git(["cat-file", "-e", `${COMMIT_DA_ROTA_ANTIGA}^{commit}`]) !== null;
/**
 * Há rota antiga para tirar? No CI o checkout é raso: busca-se só este commit,
 * e só na parte do CI que corre este teste (uma ida ao GitHub, não cinco). Se a
 * busca falhar, salta — dito no nome.
 */
const HA_ROTA_ANTIGA =
  process.env.COMPARAR_COM_A_ROTA_ANTIGA !== "0" &&
  !PASSOU_O_PRAZO &&
  RAIZ !== "" &&
  (temOCommit() ||
    (!!process.env.CI &&
      git(["fetch", "--no-tags", "--depth=1", "origin", COMMIT_COMPLETO], PRAZO_DA_BUSCA_MS) !==
        null &&
      temOCommit()));
if (PASSOU_O_PRAZO) avisar(PEDIDO_DO_PRAZO);
else if (!HA_ROTA_ANTIGA && process.env.COMPARAR_COM_A_ROTA_ANTIGA !== "0") {
  avisar(
    RAIZ === ""
      ? "não há git (ou isto não é um repositório) — a comparação saltou"
      : process.env.CI
        ? `o commit ${COMMIT_DA_ROTA_ANTIGA} não veio (o fetch falhou ou passou dos 60 s) — a comparação saltou`
        : `este clone não tem o commit ${COMMIT_DA_ROTA_ANTIGA} (raso?) — a comparação saltou`,
  );
}
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
  PASSOU_O_PRAZO
    ? `(SALTA) ${PEDIDO_DO_PRAZO}`
    : `a rota nova responde o mesmo que a antiga (${COMMIT_DA_ROTA_ANTIGA}; salta sem o commit)`,
  () => {
    let postAntigo: Post;
    let pasta = "";

    beforeAll(async () => {
      const antiga = execFileSync("git", ["show", `${COMMIT_DA_ROTA_ANTIGA}:${ROTA}`], {
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
          vi.useRealTimers();
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
