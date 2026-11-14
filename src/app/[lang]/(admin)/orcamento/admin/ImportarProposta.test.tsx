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

function preparar(semArmazenamento = false, ficheiro = FICHEIRO, rascunhoFalhaUmaVez = false) {
  let rascunhoFalhou = false;
  const chamadas: Chamada[] = [];
  const proposta = mapearConteudo(extrairConteudo(ficheiro));
  let fotos = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    chamadas.push({ url, init });
    const ok = (dados: unknown) => ({ ok: true, status: 200, json: async () => dados });
    if (url === "/api/orcamento/importar") return ok({ ok: true, proposta });
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
    // O IVA é sempre ela que o escolhe: marcado como não encontrado até lá.
    expect(screen.getByTestId("rotulo-iva").textContent).toMatch(/Não encontrado/);
    expect(screen.getByText(/2 de 2 escolhidas/)).toBeTruthy();
  });

  it("não cria nada enquanto falta dizer o IVA; depois cria pelos caminhos de sempre e abre", async () => {
    const { chamadas, onCreated } = preparar();
    const user = userEvent.setup();
    await escolherFicheiro();

    const criar = screen.getByRole("button", { name: /Criar o pedido e abrir no Fazer proposta/ });
    await user.click(criar);
    expect(
      await screen.findByText(/Falta escolher se os valores do documento têm IVA/),
    ).toBeTruthy();
    expect(chamadas.map((c) => c.url)).toEqual(["/api/orcamento/importar"]);

    // Tira uma das duas fotografias e escolhe o IVA.
    await user.click(screen.getAllByRole("button", { pressed: true })[1]);
    expect(screen.getByText(/1 de 2 escolhidas/)).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "sem IVA" }));
    // 6.ª revisão: depois de escolher, a marca «Não encontrado» do IVA sai.
    expect(screen.getByTestId("rotulo-iva").textContent).not.toMatch(/Não encontrado/);
    await user.click(criar);

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const urls = chamadas.map((c) => c.url);
    expect(urls).toEqual([
      "/api/orcamento/importar",
      "/api/orcamento/manual",
      "/api/orcamento/LIQ-IMP-1/assets",
      "/api/orcamento/LIQ-IMP-1/proposta-rascunho",
    ]);
    const pedido = JSON.parse(chamadas[1].init?.body as string);
    expect(pedido).toMatchObject({
      name: "Inês Teste & Tiago Exemplo",
      date: "2027-07-04",
      location: "Quinta do Ensaio",
      eventType: "casamentos",
    });
    expect(pedido.notes).toMatch(/importada de «antiga\.docx»/);
    // A fotografia vai com a miniatura e a cor, como no estúdio.
    const form = chamadas[2].init?.body as FormData;
    expect(form.getAll("files")).toHaveLength(1);
    expect(form.getAll("thumbs")).toHaveLength(1);
    expect(form.get("cores")).toBe("#aabbcc");

    const { doc } = JSON.parse(chamadas[3].init?.body as string);
    expect(chamadas[3].init?.method).toBe("PUT");
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
    await user.click(screen.getByRole("radio", { name: "com IVA" }));
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

  it("com 13 fotografias: liga 8 por omissão, a 9.ª não liga, e sobem só 8", async () => {
    // A capa e 4 fotografias em cada uma de três secções.
    const seccao = (t: string, p: string) => [
      { h: 1 as const, t },
      { li: `Ponto de ${t}` },
      ...Array.from({ length: 4 }, (_, i) => ({ img: `${p}${i}.jpeg` })),
    ];
    const muitas = docx([
      "Casamento Inês Teste & Tiago Exemplo",
      { img: "capa.jpeg" },
      ...seccao("Cerimónia", "c"),
      ...seccao("Mesas", "m"),
      ...seccao("Bar", "b"),
      { h: 1, t: "Orçamento" },
      "Total 2.800 € + IVA",
    ]);
    const { chamadas, onCreated } = preparar(false, muitas);
    const user = userEvent.setup();
    await escolherFicheiro(muitas);

    expect(screen.getByText(/8 de 13 escolhidas/)).toBeTruthy();
    expect(screen.getByText(/Máximo 8 — tira uma para pôr outra/)).toBeTruthy();
    // A capa e as primeiras de cada secção, à vez: c0 m0 b0 c1 m1 b1 c2.
    const ligadas = screen
      .getAllByRole("button", { pressed: true })
      .map((b) => b.querySelector("img")?.getAttribute("alt"));
    expect(ligadas).toHaveLength(8);
    expect(ligadas[0]).toBe("Fotografia da capa");

    // A 9.ª não liga.
    const desligada = screen.getAllByRole("button", { pressed: false })[0];
    await user.click(desligada);
    expect(desligada.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/8 de 13 escolhidas/)).toBeTruthy();

    // «+ IVA» no texto não escolhe por ela.
    await user.click(screen.getByRole("radio", { name: "sem IVA" }));

    await user.click(
      screen.getByRole("button", { name: /Criar o pedido e abrir no Fazer proposta/ }),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(chamadas.filter((c) => c.url.endsWith("/assets"))).toHaveLength(8);
  });

  it("se o rascunho falha depois de o pedido criado, diz a verdade e o novo clique continua — sem 2.º pedido nem fotos repetidas", async () => {
    const { chamadas, onCreated } = preparar(false, FICHEIRO, true);
    const user = userEvent.setup();
    await escolherFicheiro();
    await user.click(screen.getByRole("radio", { name: "sem IVA" }));
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
