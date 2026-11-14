// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { importarDocumento, type Importacao } from "@/lib/importar-proposta/ia/importar";
import {
  leituraCerta,
  leituraComIvaIncluido,
  leituraSoDoOrcamento,
  propostaComIvaIncluido,
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
import { eur } from "@/lib/money";

function preparar(resposta: Importacao, depois: (Importacao | "falha")[] = []) {
  const urls: string[] = [];
  const corpos: (FormData | undefined)[] = [];
  const rascunhos: {
    doc: { budgetAmounts?: (number | null)[]; totalAmount?: number; totalVatMode?: string };
  }[] = [];
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
      if (url.endsWith("/proposta-rascunho")) {
        rascunhos.push(JSON.parse(String(init?.body)));
        return ok({ ok: true, updatedAt: "x" });
      }
      throw new Error(`inesperado: ${url}`);
    }),
  );
  render(
    <ToastProvider>
      <ImportarProposta open onClose={() => {}} onCreated={() => {}} />
    </ToastProvider>,
  );
  return { urls, corpos, rascunhos };
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
    await screen.findByText(/confirmar o aviso de dinheiro/);
    expect(urls).not.toContain("/api/orcamento/manual");
    // O IVA é sempre ela que o escolhe.
    const grupo = screen.getByRole("group", { name: /O IVA dos valores do documento/ });
    fireEvent.click(within(grupo).getByRole("radio", { name: "sem IVA" }));
    escolherOTotal();

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

  it("o ecrã mostra os valores convertidos depois da escolha — IGUAIS aos que o rascunho grava", async () => {
    const l = leituraComIvaIncluido();
    l.orcamento.linhas[1].tipo = "normal";
    l.cliente.nomes = "Velas TESTE";
    const r = await importarDocumento(propostaComIvaIncluido(), {
      leituraCarregada: JSON.stringify(l),
    });
    const { rascunhos } = preparar(r);
    await escolher();
    const grupo = screen.getByRole("group", { name: /O IVA dos valores do documento/ });
    // As contas sugerem, mas nada vem escolhido.
    expect(grupo.textContent).toMatch(/sugerem: com IVA/);
    expect(
      within(grupo).getByRole("radio", { name: "com IVA" }).getAttribute("aria-checked"),
    ).not.toBe("true");
    fireEvent.click(within(grupo).getByRole("radio", { name: "com IVA" }));
    escolherOTotal(50);
    // O que o ecrã mostra para as linhas…
    const nova = screen.getByText("Na proposta nova").parentElement!;
    const mostrado = [...nova.querySelectorAll("li .tabular-nums")].map((x) => x.textContent);
    expect(mostrado).toEqual([eur(20.33), eur(20.32)]);
    // … é exactamente o que se grava.
    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await waitFor(() => expect(rascunhos.length).toBe(1));
    expect(rascunhos[0].doc.budgetAmounts).toEqual([20.33, 20.32]);
    expect(rascunhos[0].doc.totalAmount).toBe(50);
    expect(rascunhos[0].doc.totalVatMode).toBe("incluido");
    expect(mostrado).toEqual(rascunhos[0].doc.budgetAmounts!.map((x) => eur(x as number)));
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
    escolherOTotal(1740);
    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await waitFor(() => expect(urls.some((u) => u.endsWith("/proposta-rascunho"))).toBe(true));
    void corpos;
  });
});

/** Ela escolhe o total na conferência: a candidata com este valor (ou a primeira). */
function escolherOTotal(valor?: number) {
  const f = screen.getByTestId("candidatas-ao-total");
  const radios = within(f).getAllByRole("radio");
  const r =
    valor === undefined
      ? radios[0]
      : radios.find((x) => x.closest("label")!.textContent!.includes(eur(valor)))!;
  fireEvent.click(r);
}

describe("6.ª revisão — uma só escolha do IVA, e o resumo é o que se grava", () => {
  const comIvaIncluido = () => {
    const l = leituraComIvaIncluido();
    l.cliente.nomes = "Velas TESTE"; // um nome citado, para só faltar o que se testa
    return importarDocumento(propostaComIvaIncluido(), { leituraCarregada: JSON.stringify(l) });
  };

  it("o IVA escolhe-se num sítio só: em baixo é um espelho; o total, na lista", async () => {
    preparar(await comIvaIncluido());
    await escolher();
    // Um só grupo de escolha do IVA na folha.
    expect(screen.getAllByRole("radio", { name: "com IVA" })).toHaveLength(1);
    const espelho = screen.getByTestId("iva-espelho");
    expect(espelho.textContent).toMatch(/Por escolher/);
    const total = screen.getByLabelText(/Valor total/) as HTMLInputElement;
    // 10.ª revisão: nada vem escolhido, e o IVA não mexe no total.
    expect(total.value).toBe("");
    fireEvent.click(screen.getByRole("radio", { name: "com IVA" }));
    expect(espelho.textContent).toMatch(/Com IVA/);
    expect(total.value).toBe("");
    // O IVA marca a sugestão na lista: a de 50 €, primeiro.
    const lista = screen.getByTestId("candidatas-ao-total");
    expect(within(lista).getAllByRole("radio")[0].closest("label")!.textContent).toMatch(
      /50,00\s€.*sugerido/,
    );
    escolherOTotal(50);
    expect(total.value).toBe("50,00");
  });

  it("no código do ecrã, o modo do IVA só muda por `escolherModoDoIva`", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const f of ["ImportarProposta.tsx", "RevisaoDaImportacao.tsx"]) {
      const src = readFileSync(join(__dirname, f), "utf8");
      expect(src).not.toMatch(/set\(\s*"totalVatMode"/);
      expect(src).not.toMatch(/totalVatMode:\s*(?:m|v|modo)\b/);
    }
  });

  it("ela apaga o total: o resumo diz «sem total», e criar pede o total ou a confirmação", async () => {
    const { urls } = preparar(await comIvaIncluido());
    await escolher();
    fireEvent.click(screen.getByRole("radio", { name: "com IVA" }));
    escolherOTotal(50);
    const total = screen.getByLabelText(/Valor total/) as HTMLInputElement;
    fireEvent.change(total, { target: { value: "" } });
    const nova = screen.getByText("Na proposta nova").parentElement!;
    expect(nova.textContent).toMatch(/Totalsem total/);
    fireEvent.click(screen.getByRole("radio", { name: "sem IVA" }));
    expect(total.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await screen.findByText(/o documento tem total — escreve-o ou confirma que fica sem total/);
    expect(urls).not.toContain("/api/orcamento/manual");
    fireEvent.click(
      screen.getByRole("checkbox", { name: /confirmo que a proposta fica sem total/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await waitFor(() => expect(urls).toContain("/api/orcamento/manual"));
  });

  it("depois da escolha, as linhas que não somam o total são aviso de dinheiro que trava o criar", async () => {
    const { urls } = preparar(await comIvaIncluido());
    await escolher();
    // «sem IVA» e 40,65: as linhas ficam 25 + 25 = 50, o total 40,65 + IVA.
    fireEvent.click(screen.getByRole("radio", { name: "sem IVA" }));
    escolherOTotal(40.65);
    const aviso = screen.getAllByText(/as linhas somam 50,00\s€ — o total é 40,65\s€ sem IVA/);
    expect(aviso.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await screen.findByText(/confirmar o aviso de dinheiro/);
    expect(urls).not.toContain("/api/orcamento/manual");
    // Com «com IVA» e 50 batem ao cêntimo, e o aviso sai.
    fireEvent.click(screen.getByRole("radio", { name: "com IVA" }));
    escolherOTotal(50);
    expect(screen.queryByText(/Com o IVA que escolheste/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await waitFor(() => expect(urls).toContain("/api/orcamento/manual"));
  });

  it("sem IA (regras): o mesmo bloco, as mesmas sugestões, e a «Base» não é serviço", async () => {
    const r = await importarDocumento(propostaComIvaIncluido(), { chamar: null });
    preparar(r);
    await escolher();
    const grupo = screen.getByRole("group", { name: /O IVA dos valores do documento/ });
    expect(grupo.textContent).toMatch(/sugerem: com IVA/);
    expect(
      within(grupo).getByRole("radio", { name: "com IVA" }).getAttribute("aria-checked"),
    ).not.toBe("true");
    const base = screen.getByRole("radiogroup", { name: "«Base» é um serviço?" });
    expect(
      within(base).getByRole("radio", { name: "não é serviço" }).getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.click(within(grupo).getByRole("radio", { name: "com IVA" }));
    const nova = screen.getByText("Na proposta nova").parentElement!;
    const mostrado = [...nova.querySelectorAll("li .tabular-nums")].map((x) => x.textContent);
    expect(mostrado).toEqual([eur(20.33), eur(20.32)]);
    expect(screen.getByTestId("rotulo-iva").textContent).not.toMatch(/Não encontrado/);
  });
});

describe("10.ª revisão — recarregar com a leitura guarda a conferência dela", () => {
  it("o IVA, o total e os interruptores ficam", async () => {
    const semIa = await importarDocumento(propostaComIvaIncluido(), { chamar: null });
    const l = leituraComIvaIncluido();
    l.cliente.nomes = "Velas TESTE";
    const comJson = await importarDocumento(propostaComIvaIncluido(), {
      leituraCarregada: JSON.stringify(l),
    });
    preparar(semIa, [comJson]);
    await escolher();
    fireEvent.click(screen.getByRole("radio", { name: "com IVA" }));
    escolherOTotal(50);
    const total = () => (screen.getByLabelText(/Valor total/) as HTMLInputElement).value;
    expect(total()).toBe("50,00");
    fireEvent.change(screen.getByLabelText(/Carregar a leitura/), {
      target: { files: [new File([JSON.stringify(l)], "l.json")] },
    });
    await screen.findByText(/sem custo\) e verificado/);
    expect(screen.getByRole("radio", { name: "com IVA" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(total()).toBe("50,00");
  });
});

describe("7.ª revisão — o IVA e o aviso da soma em todos os caminhos", () => {
  const semValores = () =>
    importarDocumento(
      docx(["Casamento Ana TESTE & Rui TESTE", { h: 1, t: "Cerimónia" }, "Arco de flores"]),
      { chamar: null },
    );

  it("documento sem valores: ela escreve o total, aparece a escolha do IVA, e cria", async () => {
    const r = await semValores();
    expect(r.revisao).not.toBeNull();
    expect(r.proposta.ivaPorEscolher).toBeFalsy();
    const { urls } = preparar(r);
    await escolher();
    fireEvent.change(screen.getByLabelText(/Nome do cliente/), { target: { value: "Ana TESTE" } });
    expect(screen.queryByRole("group", { name: /O IVA dos valores do documento/ })).toBeNull();
    fireEvent.change(screen.getByLabelText(/Valor total/), { target: { value: "1.000" } });
    const grupo = screen.getByRole("group", { name: /O IVA dos valores do documento/ });
    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await screen.findByText(/dizer se o total inclui IVA/);
    expect(urls).not.toContain("/api/orcamento/manual");
    fireEvent.click(within(grupo).getByRole("radio", { name: "sem IVA" }));
    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await waitFor(() => expect(urls).toContain("/api/orcamento/manual"));
  });

  it("total escrito por ela e sem linhas: mudar o IVA deixa uma nota, que some ao voltar", async () => {
    preparar(await semValores());
    await escolher();
    fireEvent.change(screen.getByLabelText(/Valor total/), { target: { value: "1.000" } });
    const grupo = screen.getByRole("group", { name: /O IVA dos valores do documento/ });
    fireEvent.click(within(grupo).getByRole("radio", { name: "sem IVA" }));
    expect(screen.queryByText(/Mudaste o IVA/)).toBeNull();
    fireEvent.click(within(grupo).getByRole("radio", { name: "com IVA" }));
    expect(screen.getByText(/Mudaste o IVA — confirma que este total é com IVA/)).toBeTruthy();
    expect((screen.getByLabelText(/Valor total/) as HTMLInputElement).value).toBe("1.000");
    fireEvent.click(within(grupo).getByRole("radio", { name: "sem IVA" }));
    expect(screen.queryByText(/Mudaste o IVA/)).toBeNull();
  });

  it("sem revisão (revisao: null): o aviso da soma aparece e trava o criar até ser confirmado", async () => {
    const l = leituraComIvaIncluido();
    l.cliente.nomes = "Velas TESTE";
    const r = await importarDocumento(propostaComIvaIncluido(), {
      leituraCarregada: JSON.stringify(l),
    });
    const { urls } = preparar({ ...r, revisao: null });
    await escolher();
    fireEvent.click(screen.getByRole("radio", { name: "sem IVA" }));
    escolherOTotal(40.65);
    expect(screen.getByText(/Com o IVA que escolheste, as linhas somam 50,00\s€/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await screen.findByText(/confirmar o aviso de dinheiro/);
    expect(urls).not.toContain("/api/orcamento/manual");
    fireEvent.click(screen.getByRole("checkbox", { name: /Com o IVA que escolheste/ }));
    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await waitFor(() => expect(urls).toContain("/api/orcamento/manual"));
  });
});

describe("10.ª revisão — a conferência do dinheiro, sem IA", () => {
  const regras = (frases: Parameters<typeof docx>[0]) =>
    importarDocumento(docx(["Casamento Ana Teste & Rui Exemplo", ...frases]), { chamar: null });

  it("cada linha tem o seu interruptor «serviço / não é serviço», pré-posto, e ela manda", async () => {
    preparar(
      await regras([
        "Flores TESTE: 1.000,00 €",
        "Pagamento do transporte: 230,00 €",
        "Total: 1.230,00 €",
      ]),
    );
    await escolher();
    const nova = () => screen.getByText("Na proposta nova").parentElement!.textContent ?? "";
    const transporte = screen.getByRole("radiogroup", {
      name: "«Pagamento do transporte» é um serviço?",
    });
    expect(
      within(transporte).getByRole("radio", { name: "não é serviço" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(nova()).not.toMatch(/Pagamento do transporte/);
    fireEvent.click(within(transporte).getByRole("radio", { name: "serviço" }));
    expect(nova()).toMatch(/Pagamento do transporte/);
    fireEvent.click(within(transporte).getByRole("radio", { name: "não é serviço" }));
    expect(nova()).not.toMatch(/Pagamento do transporte/);
  });

  it("o total: todas as candidatas, nada escolhido, e o Criar espera", async () => {
    const { urls } = preparar(
      await regras([
        "Flores TESTE: 10.000,00 €",
        "Total sem IVA: 10.000,00 €",
        "Total com IVA: 12.300,00 €",
        "Valor final: 11.500,00 €",
      ]),
    );
    await escolher();
    const lista = screen.getByTestId("candidatas-ao-total");
    const radios = within(lista).getAllByRole("radio");
    // As três do documento e «outro valor»; nenhuma marcada.
    expect(radios).toHaveLength(4);
    for (const r of radios) expect((r as HTMLInputElement).checked).toBe(false);
    fireEvent.click(
      within(screen.getByRole("group", { name: /O IVA dos valores do documento/ })).getByRole(
        "radio",
        { name: "sem IVA" },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await screen.findByText(/escolher o total/);
    expect(urls).not.toContain("/api/orcamento/manual");
    escolherOTotal(10000);
    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await waitFor(() => expect(urls).toContain("/api/orcamento/manual"));
  });

  it("S4: «3 000 = 3 690 − 690» com «sem IVA» cria sem nenhum aviso — em dois cliques", async () => {
    const { urls } = preparar(
      await regras([
        "Flores TESTE: 1.000,00 €",
        "Velas TESTE: 2.000,00 €",
        "IVA (23%): 690,00 €",
        "Total: 3.690,00 €",
      ]),
    );
    await escolher();
    fireEvent.click(
      within(screen.getByRole("group", { name: /O IVA dos valores do documento/ })).getByRole(
        "radio",
        { name: "sem IVA" },
      ),
    );
    escolherOTotal(3000);
    expect(screen.queryByText(/Com o IVA que escolheste/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await waitFor(() => expect(urls).toContain("/api/orcamento/manual"));
  });

  it("a taxa: um campo a 23 %; a do documento é sugestão, e ela confirma-a ali", async () => {
    const { urls } = preparar(
      await regras(["Livros TESTE: 100,00 €", "IVA (6%): 6,00 €", "Total: 106,00 €"]),
    );
    await escolher();
    const taxa = screen.getByLabelText(/Taxa do IVA/) as HTMLInputElement;
    expect(taxa.value).toBe("6");
    expect(screen.getByTestId("rotulo-iva").textContent).toMatch(/IVA a 6%/);
    fireEvent.click(
      within(screen.getByRole("group", { name: /O IVA dos valores do documento/ })).getByRole(
        "radio",
        { name: "sem IVA" },
      ),
    );
    escolherOTotal(100);
    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await screen.findByText(/confirmar a taxa do IVA \(o documento sugere 6%\)/);
    expect(urls).not.toContain("/api/orcamento/manual");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar 6%" }));
    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await waitFor(() => expect(urls).toContain("/api/orcamento/manual"));
  });

  it("«Usar a soma das linhas» com outro total no documento: aviso de dinheiro que trava", async () => {
    const { urls } = preparar(
      await regras(["Flores TESTE: 500,00 €", "Velas TESTE: 250,00 €", "Total: 800,00 €"]),
    );
    await escolher();
    fireEvent.click(screen.getByRole("button", { name: /Usar a soma das linhas \(750,00/ }));
    expect(screen.getAllByText(/Usaste a soma das linhas \(750,00\s€\)/).length).toBeGreaterThan(0);
    fireEvent.click(
      within(screen.getByRole("group", { name: /O IVA dos valores do documento/ })).getByRole(
        "radio",
        { name: "sem IVA" },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await screen.findByText(/confirmar o aviso de dinheiro/);
    expect(urls).not.toContain("/api/orcamento/manual");
  });

  it("a linha de desconto não é serviço, e um aviso «põe à mão» trava o criar", async () => {
    const { urls } = preparar(
      await regras(["Flores TESTE: 1.000,00 €", "Desconto: 100,00 €", "Total: 900,00 €"]),
    );
    await escolher();
    expect(screen.getAllByText(/desconto de 100,00\s€ — põe à mão/).length).toBeGreaterThan(0);
    fireEvent.click(
      within(screen.getByRole("group", { name: /O IVA dos valores do documento/ })).getByRole(
        "radio",
        { name: "sem IVA" },
      ),
    );
    escolherOTotal(900);
    fireEvent.click(screen.getByRole("button", { name: /Criar o pedido/ }));
    await screen.findByText(/confirmar os? .*aviso/);
    expect(urls).not.toContain("/api/orcamento/manual");
  });
});
