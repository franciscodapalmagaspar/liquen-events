// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { importarDocumento, type Importacao } from "@/lib/importar-proposta/ia/importar";
import {
  leituraCerta,
  leituraSoDoOrcamento,
  propostaDeTeste,
} from "@/lib/importar-proposta/ia/fixtures.testkit";
import { docx } from "@/lib/importar-proposta/fabricar.testkit";

vi.mock("./image-prep", () => ({
  prepareImageWithThumb: vi.fn(async (file: File) => ({
    file,
    thumb: file,
    micro: null,
    mid: null,
    lqip: null,
    cor: "#aabbcc",
  })),
}));

import ImportarProposta from "./ImportarProposta";

function preparar(resposta: Importacao, depois: (Importacao | "falha")[] = []) {
  const urls: string[] = [];
  const corpos: (FormData | undefined)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url);
      const ok = (dados: unknown) => ({ ok: true, status: 200, json: async () => dados });
      if (url === "/api/orcamento/importar") {
        corpos.push(init?.body as FormData);
        const r = corpos.length === 1 ? resposta : (depois[corpos.length - 2] ?? resposta);
        if (r === "falha")
          return { ok: false, status: 500, json: async () => ({ error: "Falhou TESTE" }) };
        return ok({ ok: true, ...r });
      }
      if (url === "/api/orcamento/manual")
        return ok({ ok: true, quote: { id: "LIQ-T-1", name: "Ana" } });
      if (url.endsWith("/assets"))
        return ok({ ok: true, images: [{ path: "LIQ-T-1/f.jpg", url: "u" }] });
      if (url.endsWith("/proposta-rascunho")) return ok({ ok: true, updatedAt: "x" });
      throw new Error(`inesperado: ${url}`);
    }),
  );
  render(
    <ToastProvider>
      <ImportarProposta open onClose={() => {}} onCreated={() => {}} />
    </ToastProvider>,
  );
  return { urls, corpos };
}

async function escolher() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, {
    target: { files: [new File([propostaDeTeste() as BlobPart], "antiga.docx")] },
  });
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

describe("a revisão lado a lado", () => {
  it("mostra o documento e a proposta nova, e NÃO cria enquanto um aviso de dinheiro não for confirmado", async () => {
    const l = leituraCerta();
    l.orcamento.valoresNaoUsados = []; // o sinal de 522 € fica sem sítio → aviso de dinheiro
    const { urls } = preparar(
      await importarDocumento(propostaDeTeste(), { leituraCarregada: JSON.stringify(l) }),
    );
    await escolher();
    expect(screen.getByText("No documento")).toBeTruthy();
    expect(screen.getByText("Na proposta nova")).toBeTruthy();
    expect(screen.getByText(/sem custo\) e verificado por regras fixas/)).toBeTruthy();
    const aviso = screen.getByText(/522,00\s€ em «Sinal de 30%/);
    expect(aviso).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await screen.findByText(/Falta confirmar o aviso de dinheiro/);
    expect(urls).not.toContain("/api/orcamento/manual");

    // Cada aviso aparece no topo e junto do campo: confirma-se uma vez cada um.
    const vistos = new Set<string>();
    for (const c of screen.getAllByRole("checkbox")) {
      const t = c.parentElement?.textContent ?? "";
      if (!vistos.has(t)) {
        vistos.add(t);
        fireEvent.click(c);
      }
    }
    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await waitFor(() => expect(urls).toContain("/api/orcamento/manual"));
  });

  it("sem IA: di-lo, e deixa carregar a leitura feita no Claude do plano (vai com o documento)", async () => {
    const { corpos } = preparar(await importarDocumento(propostaDeTeste(), { chamar: null }));
    await escolher();
    expect(screen.getByText("Importação sem IA")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Descarregar o pedido para o Claude/ })).toBeTruthy();
    const json = screen.getByLabelText(/Carregar a leitura/) as HTMLInputElement;
    fireEvent.change(json, {
      target: { files: [new File([JSON.stringify(leituraCerta())], "l.json")] },
    });
    await waitFor(() => expect(corpos.length).toBe(2));
    expect(corpos[1]?.get("leitura")).toBeInstanceOf(File);
    expect(corpos[1]?.get("ficheiro")).toBeInstanceOf(File);
  });

  it("recarregar com a leitura NÃO apaga o que ela já corrigiu (e uma falha não apaga nada)", async () => {
    const semIa = await importarDocumento(propostaDeTeste(), { chamar: null });
    const comJson = await importarDocumento(propostaDeTeste(), {
      leituraCarregada: JSON.stringify(leituraCerta()),
    });
    preparar(semIa, ["falha", comJson]);
    await escolher();
    const nome = screen.getByLabelText(/Nome do cliente/) as HTMLInputElement;
    fireEvent.change(nome, { target: { value: "Nome corrigido TESTE" } });

    const json = () => screen.getByLabelText(/Carregar a leitura/) as HTMLInputElement;
    const carregar = () =>
      fireEvent.change(json(), {
        target: { files: [new File([JSON.stringify(leituraCerta())], "l.json")] },
      });
    // 1.ª vez a rota falha: fica tudo como estava.
    carregar();
    await screen.findByText(/Falhou TESTE/);
    expect((screen.getByLabelText(/Nome do cliente/) as HTMLInputElement).value).toBe(
      "Nome corrigido TESTE",
    );
    // 2.ª vez passa: a correcção dela fica, o resto vem da leitura.
    carregar();
    await screen.findByText(/sem custo\) e verificado/);
    expect((screen.getByLabelText(/Nome do cliente/) as HTMLInputElement).value).toBe(
      "Nome corrigido TESTE",
    );
    expect((screen.getByLabelText(/Data do evento/) as HTMLInputElement).value).toBe("2027-06-12");
  });

  it("recarregar com a leitura mantém a escolha das fotografias dela", async () => {
    const semIa = await importarDocumento(propostaDeTeste(), { chamar: null });
    const comJson = await importarDocumento(propostaDeTeste(), {
      leituraCarregada: JSON.stringify(leituraCerta()),
    });
    preparar(semIa, [comJson]);
    await escolher();
    const fotos = () => screen.getAllByRole("button", { pressed: true });
    const antes = fotos().length;
    expect(antes).toBeGreaterThan(0);
    // Ela tira a primeira.
    fireEvent.click(fotos()[0]);
    expect(fotos().length).toBe(antes - 1);
    fireEvent.change(screen.getByLabelText(/Carregar a leitura/) as HTMLInputElement, {
      target: { files: [new File([JSON.stringify(leituraCerta())], "l.json")] },
    });
    await screen.findByText(/sem custo\) e verificado/);
    expect(fotos().length).toBe(antes - 1);
  });

  it("sem prova nas contas, ela escolhe o IVA (nada pré-escolhido), e criar espera por ela", async () => {
    const doc = docx([
      "Decoração TESTE: 1.740,00 €",
      "Total: 1.740,00 € + IVA",
      "Os valores não têm IVA incluído.",
    ]);
    const l = leituraSoDoOrcamento();
    l.cliente.nomes = "Decoração TESTE";
    l.naoColocados = [{ id: "p3", motivo: "IVA" }];
    l.orcamento.linhas = [
      {
        descricao: "Decoração TESTE",
        quantidade: { valor: null, citacao: null },
        precoUnitario: { valor: null, citacao: null },
        totalDaLinha: { valor: 1740, citacao: "Decoração TESTE: 1.740,00 €" },
        tipo: "normal",
      },
    ];
    l.orcamento.totalSemIva = { valor: 1740, citacao: "Total: 1.740,00 € + IVA" };
    const r = await importarDocumento(doc, { leituraCarregada: JSON.stringify(l) });
    expect(r.proposta.ivaPorEscolher).toBe(true);
    const { urls, corpos } = preparar(r);
    await escolher();
    const grupo = screen.getByRole("group", { name: /O IVA dos valores do documento/ });
    expect(grupo.textContent).toMatch(/Os valores não têm IVA incluído/);
    // Nada pré-escolhido: criar fica à espera dela.
    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await screen.findByText(/escolher se os valores do documento têm IVA/);
    expect(urls).not.toContain("/api/orcamento/manual");
    // Ela escolhe «sem IVA» — e a linha passa com os 1.740 €.
    fireEvent.click(within(grupo).getByRole("radio", { name: "sem IVA" }));
    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await waitFor(() => expect(urls.some((u) => u.endsWith("/proposta-rascunho"))).toBe(true));
    void corpos;
  });
});
