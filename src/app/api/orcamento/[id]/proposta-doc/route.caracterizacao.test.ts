/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ROTA DA PROPOSTA, FOTOGRAFADA ANTES DE SER PARTIDA (fase 5)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `docs/ESTRUTURA-DO-CODIGO.md`, fase 5: o `POST` desta rota passa de uma
 * função de complexidade 163 a um orquestrador de etapas. A regra de ferro é
 * que nada muda para quem a chama — código a código, campo a campo.
 *
 * Os 185 casos de `route.test.ts` provam o que cada regra QUER. Este ficheiro
 * prova outra coisa: que a resposta é a MESMA. Cada cenário guarda o retrato
 * inteiro do que a rota fez — o estado HTTP, o corpo tal e qual (o TEXTO, para
 * a ordem dos campos também contar), os cabeçalhos que o estúdio lê, o email
 * que saiu, o que se gravou e cada linha do registo. O retrato foi tirado com
 * a rota ANTES de ser partida (commit de caracterização) e fica no
 * `__snapshots__`; depois disso, qualquer diferença é uma regressão.
 *
 * EXCEPÇÃO, e dita: os retratos dos CORPOS ESTRANHOS (`ESTRANHOS`) foram
 * tirados depois de partir a rota. Quem os certifica é
 * `route.contra-a-antiga.test.ts`, que corre a rota antiga (do git) e a nova
 * lado a lado, com os mesmos cenários, e exige o mesmo retrato.
 *
 * O palco (os duplos, o pedido, o retrato) está em `_caracterizacao/palco.ts`
 * e os cenários em `_caracterizacao/cenarios.ts`, partilhados pelos dois.
 *
 * Só se normaliza o que muda sozinho entre corridas: identificadores
 * (`randomUUID`) e datas (o relógio).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
// O palco ANTES da rota: é ele que regista os duplos (ver o cabeçalho dele).
import { ctl, doc, envio, params, pedido, repor, retrato } from "./_caracterizacao/palco";
import { GET, POST } from "./route";
import { CENARIOS, ESTRANHOS } from "./_caracterizacao/cenarios";

beforeEach(repor);

describe("o retrato de cada resposta da rota (fase 5)", () => {
  it.each(CENARIOS)("%s", async (_nome, preparar, fazer) => {
    preparar();
    const res = await POST(fazer(), { params });
    vi.mocked(Date.now).mockRestore?.();
    expect(await retrato(res)).toMatchSnapshot();
  });

  it.each(ESTRANHOS)("corpo estranho: %s", async (_nome, fazer, preparar) => {
    preparar?.();
    expect(await retrato(await POST(fazer(), { params }))).toMatchSnapshot();
  });

  it("o segundo envio do mesmo documento é uma repetição", async () => {
    await POST(envio(), { params });
    vi.clearAllMocks();
    expect(await retrato(await POST(envio(), { params }))).toMatchSnapshot();
  });

  it("o segundo toque no WhatsApp é uma repetição", async () => {
    await POST(envio(doc(), { porEmail: false }), { params });
    vi.clearAllMocks();
    expect(
      await retrato(await POST(envio(doc(), { porEmail: false }), { params })),
    ).toMatchSnapshot();
  });

  it("o reenvio depois de a marcação falhar reconhece-se pelo registo", async () => {
    ctl.marcarEnviadaFalha = true;
    await POST(envio(), { params });
    vi.clearAllMocks();
    expect(await retrato(await POST(envio(), { params }))).toMatchSnapshot();
  });

  it("depois do WhatsApp, o email do mesmo documento sai", async () => {
    await POST(envio(doc(), { porEmail: false }), { params });
    vi.clearAllMocks();
    expect(await retrato(await POST(envio(), { params }))).toMatchSnapshot();
  });

  it("a segunda pré-visualização sai da memória, e o envio a seguir também", async () => {
    await POST(pedido({ mode: "preview", doc: doc() }), { params });
    expect(
      await retrato(await POST(pedido({ mode: "preview", doc: doc() }), { params })),
    ).toMatchSnapshot();
    vi.clearAllMocks();
    expect(await retrato(await POST(envio(), { params }))).toMatchSnapshot();
  });

  it("GET: sem propostas, e depois de um envio", async () => {
    const pedirGet = () =>
      GET(new Request("https://liquen.test/x") as unknown as NextRequest, { params });
    expect(await (await pedirGet()).text()).toMatchSnapshot();
    await POST(envio(), { params });
    expect(await (await pedirGet()).text()).toMatchSnapshot();
    ctl.autenticado = false;
    const r = await pedirGet();
    expect([r.status, await r.text()]).toMatchSnapshot();
  });
});
