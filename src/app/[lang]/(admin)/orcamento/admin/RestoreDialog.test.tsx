// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RestoreDialog from "./RestoreDialog";
import { RESTORE_CONFIRM_PHRASE } from "@/lib/backup-restore-types";

/**
 * O ECRÃ da reposição. O assunto aqui é o percurso de quem repõe, e sobretudo
 * o que ele NÃO deixa fazer:
 *
 *   · carregar o ficheiro faz um ENSAIO e mostra o que se perderia;
 *   · o botão de repor está morto até a frase estar escrita;
 *   · os avisos críticos aparecem;
 *   · a cópia do estado anterior é descarregada assim que a reposição acaba;
 *   · um conjunto por repor aparece PELO NOME.
 */

const FICHEIRO = {
  schemaVersion: 2,
  exportedAt: "2026-03-01T00:00:00.000Z",
  quotes: [{ id: "q1" }],
  proposals: [],
  suppliers: [],
  tasks: [],
  calendarEvents: [],
};

function planoFalso(overrides: Record<string, unknown> = {}) {
  return {
    exportedAt: "2026-03-01T00:00:00.000Z",
    schemaVersion: 2,
    ageDays: 12,
    newestCurrent: "2026-04-01T00:00:00.000Z",
    datasets: [
      {
        key: "quotes",
        label: "Pedidos",
        table: "quotes",
        incoming: 1,
        current: 4,
        created: 0,
        replaced: 1,
        removed: 3,
        newerThanBackup: 3,
      },
      {
        key: "themes",
        label: "Temas",
        table: "proposal_themes",
        incoming: 0,
        current: 2,
        created: 0,
        replaced: 0,
        removed: 0,
        newerThanBackup: 0,
        skipped: "a cópia não traz este conjunto",
      },
    ],
    counters: [
      { year: 2026, inFile: 30, current: 42, highestIssued: 42, willBe: 42, raised: true },
    ],
    warnings: [
      { level: "critico", message: "⚠️ ESTA CÓPIA É MAIS ANTIGA DO QUE OS DADOS QUE LÁ ESTÃO." },
      { level: "aviso", message: "As FOTOS não estão na cópia — vivem nos buckets de Storage." },
    ],
    totals: { incoming: 1, current: 6, created: 0, replaced: 1, removed: 3, newerThanBackup: 3 },
    unreadable: [],
    photosNotice: "As FOTOS não estão na cópia — vivem nos buckets de Storage.",
    ...overrides,
  };
}

/** Um ficheiro que o `<input type=file>` aceita, com o conteúdo dado. */
function ficheiroJson(conteudo: unknown, nome = "liquen-backup-2026-03-01.json"): File {
  return new File([JSON.stringify(conteudo)], nome, { type: "application/json" });
}

const fetchMock = vi.fn();
const cliques: string[] = [];

beforeEach(() => {
  cliques.length = 0;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // jsdom não tem createObjectURL — sem isto o download da cópia anterior
  // atirava, e o teste do "guarde-a à mão" não distinguia os dois caminhos.
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }),
  );
  const realClick = HTMLAnchorElement.prototype.click;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (this.download) cliques.push(this.download);
    else realClick.call(this);
  });
  // `File.text()` não existe em todas as versões do jsdom.
  if (!File.prototype.text) {
    File.prototype.text = function (this: File) {
      return new Response(this).text();
    };
  }
});

afterEach(() => {
  // O vitest desta casa não corre com `globals`, por isso a limpeza automática
  // do Testing Library não está ligada — sem isto os diálogos empilham-se e as
  // consultas encontram dois de tudo (ver Temas.test.tsx / ThemePicker.test.tsx).
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function respostaEnsaio(plan = planoFalso()) {
  return { ok: true, status: 200, json: async () => ({ dryRun: true, fileHash: "hash-1", plan }) };
}

async function carregarFicheiro(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.getByLabelText("Ficheiro da cópia de segurança");
  await user.upload(input, ficheiroJson(FICHEIRO));
}

describe("RestoreDialog", () => {
  it("fechado não desenha nada", () => {
    const { container } = render(<RestoreDialog open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("carregar o ficheiro faz um ENSAIO (sem `confirm`) e mostra o que se perderia", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(respostaEnsaio());
    render(<RestoreDialog open onClose={() => {}} />);
    await carregarFicheiro(user);

    await waitFor(() => expect(screen.getByText("Pedidos")).toBeInTheDocument());

    // O pedido ao servidor NÃO leva confirmação — é um ensaio.
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.confirm).toBeUndefined();
    expect(body.backup).toEqual(FICHEIRO);

    // A tabela diz quantos desaparecem.
    const linha = screen.getByRole("row", { name: /Pedidos/ });
    expect(within(linha).getByText("3")).toBeInTheDocument();
    // Um conjunto que a cópia não traz aparece marcado, não escondido.
    expect(screen.getByText(/não é reposto — a cópia não traz este conjunto/)).toBeInTheDocument();
  });

  it("o índice do Vercel Blob diz «junta, não apaga» em vez de um número de apagados (2.ª revisão 17/11, n.º 8)", async () => {
    const user = userEvent.setup();
    const base = planoFalso();
    fetchMock.mockResolvedValue(
      respostaEnsaio({
        ...base,
        datasets: [
          ...base.datasets,
          {
            key: "indiceDoBlob",
            label: "Índice dos ficheiros no Vercel Blob",
            table: "app_state",
            incoming: 2,
            current: 5,
            created: 0,
            replaced: 2,
            removed: 0,
            newerThanBackup: 0,
            junta: true,
          },
        ],
      }),
    );
    render(<RestoreDialog open onClose={() => {}} />);
    await carregarFicheiro(user);
    const linha = await screen.findByRole("row", { name: /Vercel Blob/ });
    expect(within(linha).getByText("junta, não apaga")).toBeInTheDocument();
  });

  it("mostra o aviso CRÍTICO de a cópia ser mais antiga do que os dados", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(respostaEnsaio());
    render(<RestoreDialog open onClose={() => {}} />);
    await carregarFicheiro(user);
    await waitFor(() =>
      expect(screen.getByText(/MAIS ANTIGA DO QUE OS DADOS/)).toBeInTheDocument(),
    );
  });

  it("diz que o contador de faturas foi ELEVADO e porquê", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(respostaEnsaio());
    render(<RestoreDialog open onClose={() => {}} />);
    await carregarFicheiro(user);
    await waitFor(() => expect(screen.getByText(/Numeração de faturas/)).toBeInTheDocument());
    expect(screen.getByText(/um contador nunca pode recuar/)).toBeInTheDocument();
  });

  it("diz, no ecrã, que as FOTOS não vêm na cópia", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(respostaEnsaio());
    render(<RestoreDialog open onClose={() => {}} />);
    await carregarFicheiro(user);
    await waitFor(() =>
      expect(screen.getByText(/As FOTOS não estão na cópia/)).toBeInTheDocument(),
    );
  });

  it("o botão de repor está MORTO até a frase estar certa", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(respostaEnsaio());
    render(<RestoreDialog open onClose={() => {}} />);
    await carregarFicheiro(user);
    await waitFor(() => expect(screen.getByText("Pedidos")).toBeInTheDocument());

    const botao = screen.getByRole("button", { name: "Repor definitivamente" });
    expect(botao).toBeDisabled();

    const caixa = screen.getByLabelText(/Para repor, escreve/);
    await user.type(caixa, "sim");
    expect(botao).toBeDisabled();

    await user.clear(caixa);
    await user.type(caixa, RESTORE_CONFIRM_PHRASE);
    expect(botao).toBeEnabled();
  });

  it("repõe, descarrega a CÓPIA DO ESTADO ANTERIOR e mostra o que foi feito", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(respostaEnsaio()).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        dryRun: false,
        ok: true,
        plan: planoFalso(),
        applied: [{ key: "quotes", label: "Pedidos", deleted: 4, inserted: 1 }],
        failed: [],
        counters: [],
        snapshotBefore: { schemaVersion: 2, quotes: [{ id: "antigo" }] },
      }),
    });
    const toast = vi.fn();
    render(<RestoreDialog open onClose={() => {}} toast={toast} />);
    await carregarFicheiro(user);
    await waitFor(() => expect(screen.getByText("Pedidos")).toBeInTheDocument());

    await user.type(screen.getByLabelText(/Para repor, escreve/), RESTORE_CONFIRM_PHRASE);
    await user.click(screen.getByRole("button", { name: "Repor definitivamente" }));

    await waitFor(() => expect(screen.getByText("Cópia reposta.")).toBeInTheDocument());

    // A confirmação levou a frase E a impressão digital do ficheiro do ensaio.
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.confirm).toBe(RESTORE_CONFIRM_PHRASE);
    expect(body.fileHash).toBe("hash-1");

    // A rede de segurança foi mesmo guardada.
    expect(cliques).toHaveLength(1);
    expect(cliques[0]).toMatch(/^liquen-antes-do-restauro-/);
    expect(toast).toHaveBeenCalledWith("Cópia reposta", "success");
  });

  it("um conjunto POR REPOR aparece pelo nome, e a reposição não se diz completa", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(respostaEnsaio()).mockResolvedValueOnce({
      ok: false,
      status: 207,
      json: async () => ({
        dryRun: false,
        ok: false,
        plan: planoFalso(),
        applied: [{ key: "quotes", label: "Pedidos", deleted: 4, inserted: 1 }],
        failed: [{ key: "invoices", label: "Faturas", error: "permission denied" }],
        counters: [],
        snapshotBefore: {},
      }),
    });
    render(<RestoreDialog open onClose={() => {}} />);
    await carregarFicheiro(user);
    await waitFor(() => expect(screen.getByText("Pedidos")).toBeInTheDocument());
    await user.type(screen.getByLabelText(/Para repor, escreve/), RESTORE_CONFIRM_PHRASE);
    await user.click(screen.getByRole("button", { name: "Repor definitivamente" }));

    await waitFor(() => expect(screen.getByText(/Reposição INCOMPLETA/)).toBeInTheDocument());
    expect(screen.getByText("Faturas")).toBeInTheDocument();
    expect(screen.getByText(/permission denied/)).toBeInTheDocument();
  });

  it("um ficheiro recusado pelo servidor mostra os erros e NÃO deixa repor", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: "A cópia de segurança não passou na validação — nada foi alterado.",
        errors: ['"Faturas" (invoices) registo 0: status — valor inválido'],
      }),
    });
    render(<RestoreDialog open onClose={() => {}} />);
    await carregarFicheiro(user);

    await waitFor(() => expect(screen.getByText(/Nada foi alterado/)).toBeInTheDocument());
    expect(screen.getByText(/"Faturas" \(invoices\) registo 0/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Repor definitivamente" })).toBeNull();
  });

  it("um ficheiro que nem sequer é JSON é recusado no browser, sem chegar ao servidor", async () => {
    const user = userEvent.setup();
    render(<RestoreDialog open onClose={() => {}} />);
    const input = screen.getByLabelText("Ficheiro da cópia de segurança");
    await user.upload(
      input,
      new File(["isto não é json"], "lixo.json", { type: "application/json" }),
    );

    await waitFor(() => expect(screen.getByText(/não é JSON válido/)).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("com um conjunto ilegível a reposição fica BLOQUEADA — nem há frase para escrever", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      respostaEnsaio(
        planoFalso({ unreadable: [{ key: "invoices", label: "Faturas", error: "db em baixo" }] }),
      ),
    );
    render(<RestoreDialog open onClose={() => {}} />);
    await carregarFicheiro(user);
    await waitFor(() => expect(screen.getByText("Pedidos")).toBeInTheDocument());

    expect(screen.queryByLabelText(/Para repor, escreve/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Repor definitivamente" })).toBeNull();
  });
});
