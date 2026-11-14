// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { docx } from "@/lib/importar-proposta/fabricar.testkit";
import { extrairConteudo } from "@/lib/importar-proposta/extrair";
import { mapearConteudo } from "@/lib/importar-proposta/mapear";
import { lerDirectorio } from "@/lib/importar-proposta/zip";

// A redução das fotografias precisa de um canvas a sério; aqui devolve a
// fotografia tal e qual, com uma miniatura — o que interessa é o caminho.
vi.mock("./image-prep", () => ({
  prepareImageWithThumb: vi.fn(async (file: File) => ({
    file,
    thumb: new File([new Uint8Array([1])], "t.jpg", { type: "image/jpeg" }),
    micro: null,
    mid: null,
    lqip: null,
    cor: "#aabbcc",
  })),
}));

// O resumo de cada fotografia (o SHA-256 do original, na vida real). As
// fotografias fabricadas são todas o MESMO JPEG falso, por isso aqui o resumo
// sai do NOME — o que interessa é distinguir umas das outras.
const resumoDoNome = (nome: string) =>
  Array.from(nome)
    .map((c) => c.charCodeAt(0).toString(16))
    .join("")
    .padEnd(32, "0")
    .slice(0, 32);
vi.mock("@/lib/theme-fingerprint", () => ({
  fingerprintBlob: vi.fn(async (f: File) => resumoDoNome(f.name)),
}));

import ImportarProposta from "./ImportarProposta";

// Dados inventados.
const FICHEIRO = docx([
  "Casamento Inês Teste & Tiago Exemplo",
  "Data: 4 de julho de 2027",
  "Local: Quinta do Ensaio",
  { h: 1, t: "Decoração da Cerimónia" },
  { li: "Arco de flores" },
  { img: "cer1.jpeg" },
  { img: "cer2.jpeg" },
  { h: 1, t: "Orçamento" },
  "Total 2.800 €",
]);

interface Chamada {
  url: string;
  init?: RequestInit;
}

function preparar(
  semArmazenamento = false,
  ficheiro = FICHEIRO,
  rascunhoFalhaUmaVez = false,
  /** Os nomes das fotografias que já estão guardadas na Biblioteca. */
  jaGuardadas: readonly string[] = [],
  /** As que, entre ler o ficheiro e gravar o rascunho, saíram da Biblioteca. */
  morremAntesDeGravar: readonly string[] = [],
) {
  let perguntas = 0;
  let rascunhoFalhou = false;
  const chamadas: Chamada[] = [];
  const proposta = mapearConteudo(extrairConteudo(ficheiro));
  let fotos = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    chamadas.push({ url, init });
    const ok = (dados: unknown) => ({ ok: true, status: 200, json: async () => dados });
    if (url === "/api/orcamento/importar") return ok({ ok: true, proposta });
    if (url === "/api/orcamento/fotos-existentes") {
      const { resumos } = JSON.parse(init?.body as string) as { resumos: string[] };
      const existentes: Record<string, string> = {};
      perguntas++;
      for (const nome of jaGuardadas) {
        if (perguntas > 1 && morremAntesDeGravar.includes(nome)) continue;
        const r = resumoDoNome(nome);
        if (resumos.includes(r)) existentes[r] = `tema:t1/${r}.jpg`;
      }
      return ok({ ok: true, existentes });
    }
    if (url === "/api/orcamento/manual") {
      return ok({ ok: true, quote: { id: "LIQ-IMP-1", name: "Inês Teste & Tiago Exemplo" } });
    }
    if (url.endsWith("/assets") && semArmazenamento) {
      return {
        ok: false,
        status: 503,
        json: async () => ({ error: "Armazenamento indisponível" }),
      };
    }
    if (url.endsWith("/assets")) {
      fotos++;
      return ok({ ok: true, images: [{ path: `LIQ-IMP-1/foto${fotos}.jpg`, url: "u" }] });
    }
    if (url.endsWith("/proposta-rascunho")) {
      if (rascunhoFalhaUmaVez && !rascunhoFalhou) {
        rascunhoFalhou = true;
        throw new TypeError("Failed to fetch");
      }
      return ok({ ok: true, updatedAt: "x" });
    }
    throw new Error(`inesperado: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const onCreated = vi.fn();
  const onClose = vi.fn();
  render(
    <ToastProvider>
      <ImportarProposta open onClose={onClose} onCreated={onCreated} />
    </ToastProvider>,
  );
  return { chamadas, onCreated, onClose };
}

async function escolherFicheiro(ficheiro = FICHEIRO) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const f = new File([ficheiro as BlobPart], "antiga.docx");
  fireEvent.change(input, { target: { files: [f] } });
  await screen.findByText(/Lido de «antiga\.docx»/);
}

beforeEach(() => {
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Importar proposta antiga", () => {
  it("manda ao servidor só o texto, e mostra o que leu para ela confirmar", async () => {
    const { chamadas } = preparar();
    await escolherFicheiro();
    const corpo = chamadas[0].init?.body as FormData;
    const enviado = new Uint8Array(await (corpo.get("ficheiro") as File).arrayBuffer());
    // As fotografias ficaram no navegador.
    expect(lerDirectorio(enviado).some((e) => e.nome.includes("/media/"))).toBe(false);

    expect(screen.getByLabelText(/Nome do cliente/)).toHaveProperty(
      "value",
      "Inês Teste & Tiago Exemplo",
    );
    expect(screen.getByLabelText(/Data do evento/)).toHaveProperty("value", "2027-07-04");
    expect(screen.getByLabelText(/^Local/)).toHaveProperty("value", "Quinta do Ensaio");
    expect(screen.getByText("Arco de flores")).toBeTruthy();
    // O total sem IVA dito: avisa e não deixa criar sem ela escolher.
    expect(screen.getByText(/Não percebi se o total inclui IVA/)).toBeTruthy();
    expect(screen.getByText(/2 de 2 escolhidas/)).toBeTruthy();
  });

  it("não cria nada enquanto falta dizer o IVA; depois cria pelos caminhos de sempre e abre", async () => {
    const { chamadas, onCreated } = preparar();
    const user = userEvent.setup();
    await escolherFicheiro();

    const criar = screen.getByRole("button", { name: /Criar o pedido e abrir no Fazer proposta/ });
    await user.click(criar);
    expect(await screen.findByText(/Falta dizer se o total inclui IVA/)).toBeTruthy();
    // Ler o ficheiro pergunta, pelos resumos, que fotografias já estão
    // guardadas — antes de qualquer pedido existir.
    expect(chamadas.map((c) => c.url)).toEqual([
      "/api/orcamento/importar",
      "/api/orcamento/fotos-existentes",
    ]);

    // Tira uma das duas fotografias e escolhe o IVA.
    await user.click(screen.getAllByRole("button", { pressed: true })[1]);
    expect(screen.getByText(/1 de 2 escolhidas/)).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "Acresce IVA" }));
    await user.click(criar);

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const urls = chamadas.map((c) => c.url);
    expect(urls).toEqual([
      "/api/orcamento/importar",
      "/api/orcamento/fotos-existentes",
      "/api/orcamento/manual",
      "/api/orcamento/LIQ-IMP-1/assets",
      "/api/orcamento/LIQ-IMP-1/proposta-rascunho",
    ]);
    const pedido = JSON.parse(chamadas[2].init?.body as string);
    expect(pedido).toMatchObject({
      name: "Inês Teste & Tiago Exemplo",
      date: "2027-07-04",
      location: "Quinta do Ensaio",
      eventType: "casamentos",
    });
    expect(pedido.notes).toMatch(/importada de «antiga\.docx»/);
    // A fotografia vai com a miniatura e a cor, como no estúdio.
    const form = chamadas[3].init?.body as FormData;
    expect(form.getAll("files")).toHaveLength(1);
    // E o resumo do original, para o servidor reconhecer uma que já exista.
    expect(form.get("resumos")).toBe(resumoDoNome("cer1.jpeg"));
    expect(form.getAll("thumbs")).toHaveLength(1);
    expect(form.get("cores")).toBe("#aabbcc");

    const { doc } = JSON.parse(chamadas[4].init?.body as string);
    expect(chamadas[4].init?.method).toBe("PUT");
    expect(doc.moodBoards).toEqual([
      { title: "Decoração da Cerimónia", images: ["LIQ-IMP-1/foto1.jpg"] },
    ]);
    expect(doc.totalAmount).toBe(2800);
    expect(doc.totalVatMode).toBe("acrescer");
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "LIQ-IMP-1" }));
  });

  it("um ficheiro recusado diz porquê e deixa escolher outro", async () => {
    preparar();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 415,
        json: async () => ({ error: "Isto é um PDF. Para importar, usa o ficheiro original." }),
      })),
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File([new TextEncoder().encode("%PDF-1.7")], "p.pdf")] },
    });
    const frase = await screen.findByText("Isto é um PDF. Para importar, usa o ficheiro original.");
    expect(frase.getAttribute("role")).toBe("alert");
    expect(screen.getByText("Escolher o ficheiro da proposta")).toBeTruthy();
  });

  it("sem armazenamento, cria na mesma o pedido e o rascunho — sem fotografias — e diz porquê", async () => {
    const { chamadas, onCreated } = preparar(true);
    const user = userEvent.setup();
    await escolherFicheiro();
    await user.click(screen.getByRole("radio", { name: "IVA incluído" }));
    await user.click(
      screen.getByRole("button", { name: /Criar o pedido e abrir no Fazer proposta/ }),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(
      await screen.findByText(/nenhuma fotografia carregou \(Armazenamento indisponível\)/),
    ).toBeTruthy();
    const rascunho = chamadas.find((c) => c.url.endsWith("/proposta-rascunho"));
    const { doc } = JSON.parse(rascunho?.init?.body as string);
    // Nenhum mood board vazio, nenhuma capa por carregar.
    expect(doc.moodBoards).toEqual([]);
    expect(doc.coverImages).toEqual(["", ""]);
    expect(doc.totalVatMode).toBe("incluido");
  });

  // A capa e 8 fotografias em cada uma de três secções = 25.
  const seccao = (t: string, p: string) => [
    { h: 1 as const, t },
    { li: `Ponto de ${t}` },
    ...Array.from({ length: 8 }, (_, i) => ({ img: `${p}${i}.jpeg` })),
  ];
  const VINTE_E_CINCO = docx([
    "Casamento Inês Teste & Tiago Exemplo",
    { img: "capa.jpeg" },
    ...seccao("Cerimónia", "c"),
    ...seccao("Mesas", "m"),
    ...seccao("Bar", "b"),
    { h: 1, t: "Orçamento" },
    "Total 2.800 € + IVA",
  ]);

  it("com 25 fotografias novas: liga 20 por omissão, a 21.ª não liga, e sobem só 20", async () => {
    const { chamadas, onCreated } = preparar(false, VINTE_E_CINCO);
    const user = userEvent.setup();
    await escolherFicheiro(VINTE_E_CINCO);

    expect(screen.getByText(/20 de 25 escolhidas/)).toBeTruthy();
    expect(screen.getByText(/Máximo 20 novas — tira uma para pôr outra/)).toBeTruthy();
    const ligadas = screen
      .getAllByRole("button", { pressed: true })
      .map((b) => b.querySelector("img")?.getAttribute("alt"));
    expect(ligadas).toHaveLength(20);
    expect(ligadas[0]).toBe("Fotografia da capa");

    // A 21.ª não liga.
    const desligada = screen.getAllByRole("button", { pressed: false })[0];
    await user.click(desligada);
    expect(desligada.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/20 de 25 escolhidas/)).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: /Criar o pedido e abrir no Fazer proposta/ }),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(chamadas.filter((c) => c.url.endsWith("/assets"))).toHaveLength(20);
  });

  it("25 fotografias, 10 já guardadas: ficam as 25, sobem só as 15 novas, e as 10 entram pela Biblioteca", async () => {
    const guardadas = [
      "capa.jpeg",
      ...Array.from({ length: 8 }, (_, i) => `c${i}.jpeg`),
      "m0.jpeg",
    ];
    const { chamadas, onCreated } = preparar(false, VINTE_E_CINCO, false, guardadas);
    const user = userEvent.setup();
    await escolherFicheiro(VINTE_E_CINCO);

    expect(screen.getByText(/25 de 25 escolhidas/)).toBeTruthy();
    expect(screen.getByText(/10 já existem — não ocupam espaço/)).toBeTruthy();
    expect(screen.getByText(/as 15 novas ocupam cerca de 14 MB/)).toBeTruthy();
    expect(screen.queryByText(/Máximo 20 novas/)).toBeNull();

    await user.click(
      screen.getByRole("button", { name: /Criar o pedido e abrir no Fazer proposta/ }),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const enviadas = chamadas.filter((c) => c.url.endsWith("/assets"));
    expect(enviadas).toHaveLength(15);
    // Nenhuma das já guardadas subiu um byte.
    const nomes = enviadas.map((c) => ((c.init?.body as FormData).get("files") as File).name);
    expect(nomes.some((n) => guardadas.includes(n))).toBe(false);
    // E entram na proposta pela referência à Biblioteca.
    const { doc } = JSON.parse(
      chamadas.find((c) => c.url.endsWith("/proposta-rascunho"))!.init?.body as string,
    );
    const refs = JSON.stringify(doc);
    for (const n of guardadas) expect(refs).toContain(`tema:t1/${resumoDoNome(n)}.jpg`);
  });

  it("sem armazenamento, pára ao fim de 3 falhas — mesmo com fotografias já guardadas", async () => {
    const guardadas = [
      "capa.jpeg",
      ...Array.from({ length: 8 }, (_, i) => `c${i}.jpeg`),
      "m0.jpeg",
    ];
    const { chamadas, onCreated } = preparar(true, VINTE_E_CINCO, false, guardadas);
    const user = userEvent.setup();
    await escolherFicheiro(VINTE_E_CINCO);
    await user.click(
      screen.getByRole("button", { name: /Criar o pedido e abrir no Fazer proposta/ }),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    // Duas vias: no máximo 4 tentativas antes de parar — não as 15.
    expect(chamadas.filter((c) => c.url.endsWith("/assets")).length).toBeLessThanOrEqual(4);
  });

  it("uma foto da Biblioteca que saiu entretanto sobe como nova — o rascunho nunca leva um `tema:` morto", async () => {
    const guardadas = [
      "capa.jpeg",
      ...Array.from({ length: 8 }, (_, i) => `c${i}.jpeg`),
      "m0.jpeg",
    ];
    const { chamadas, onCreated } = preparar(false, VINTE_E_CINCO, false, guardadas, ["capa.jpeg"]);
    const user = userEvent.setup();
    await escolherFicheiro(VINTE_E_CINCO);
    await user.click(
      screen.getByRole("button", { name: /Criar o pedido e abrir no Fazer proposta/ }),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    // Confirmou-se outra vez antes de gravar…
    expect(chamadas.filter((c) => c.url === "/api/orcamento/fotos-existentes")).toHaveLength(2);
    // …e a capa, que morreu, subiu: 15 novas + 1.
    const enviadas = chamadas.filter((c) => c.url.endsWith("/assets"));
    expect(enviadas).toHaveLength(16);
    expect(
      enviadas.some((c) => ((c.init?.body as FormData).get("files") as File).name === "capa.jpeg"),
    ).toBe(true);
    const texto = chamadas.find((c) => c.url.endsWith("/proposta-rascunho"))!.init?.body as string;
    expect(texto).not.toContain(`tema:t1/${resumoDoNome("capa.jpeg")}.jpg`);
    expect(texto).toContain(`tema:t1/${resumoDoNome("c0.jpeg")}.jpg`);
  });

  it("se o rascunho falha depois de o pedido criado, diz a verdade e o novo clique continua — sem 2.º pedido nem fotos repetidas", async () => {
    const { chamadas, onCreated } = preparar(false, FICHEIRO, true);
    const user = userEvent.setup();
    await escolherFicheiro();
    await user.click(screen.getByRole("radio", { name: "Acresce IVA" }));
    await user.click(
      screen.getByRole("button", { name: /Criar o pedido e abrir no Fazer proposta/ }),
    );

    expect(await screen.findByText(/O pedido foi criado; falta guardar o rascunho/)).toBeTruthy();
    expect(screen.queryByText(/Não foi possível criar o pedido/)).toBeNull();
    expect(onCreated).not.toHaveBeenCalled();
    const continuar = await screen.findByRole("button", { name: /Continuar a importação/ });
    expect(screen.queryByRole("button", { name: /Outro ficheiro/ })).toBeNull();

    await user.click(continuar);
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    const urls = chamadas.map((c) => c.url);
    expect(urls.filter((u) => u === "/api/orcamento/manual")).toHaveLength(1);
    expect(urls.filter((u) => u.endsWith("/assets"))).toHaveLength(2);
    expect(urls.filter((u) => u.endsWith("/proposta-rascunho"))).toHaveLength(2);
    // O rascunho que ficou guardado leva as duas fotografias da 1.ª tentativa.
    const ultimo = chamadas.filter((c) => c.url.endsWith("/proposta-rascunho")).at(-1);
    const { doc } = JSON.parse(ultimo?.init?.body as string);
    expect(doc.moodBoards[0].images).toEqual(["LIQ-IMP-1/foto1.jpg", "LIQ-IMP-1/foto2.jpg"]);
  });
});
