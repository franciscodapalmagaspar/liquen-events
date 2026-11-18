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
 * Os duplos estão em `_caracterizacao/duplos.ts`, o palco (o pedido, o retrato) em `_caracterizacao/palco.ts`
 * e os cenários em `_caracterizacao/cenarios.ts`, partilhados pelos dois.
 *
 * Só se normaliza o que muda sozinho entre corridas: identificadores
 * (`randomUUID`) e datas (o relógio).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { ctl } from "./_caracterizacao/duplos";
import {
  doc,
  duplosEsquecidos,
  envio,
  params,
  pedido,
  repor,
  retrato,
  retratosEmSequencia,
} from "./_caracterizacao/palco";
import { GET, POST } from "./route";
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

beforeEach(repor);

describe("o retrato de cada resposta da rota (fase 5)", () => {
  it("cada duplo está declarado neste teste", async () => {
    expect(await duplosEsquecidos()).toEqual([]);
  });

  it.each(CENARIOS)("%s", async (_nome, preparar, fazer) => {
    preparar();
    const res = await POST(fazer(), { params });
    vi.mocked(Date.now).mockRestore?.();
    vi.useRealTimers();
    expect(await retrato(res)).toMatchSnapshot();
  });

  it.each(ESTRANHOS)("corpo estranho: %s", async (_nome, fazer, preparar) => {
    preparar?.();
    const res = await POST(fazer(), { params });
    vi.mocked(Date.now).mockRestore?.();
    vi.useRealTimers();
    expect(await retrato(res)).toMatchSnapshot();
  });

  it.each(SEQUENCIAS)("sequência: %s", async (_nome, preparar, pedidos) => {
    preparar();
    expect(await retratosEmSequencia(POST, pedidos)).toMatchSnapshot();
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
