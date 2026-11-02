// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ThemeImage, ThemeSummary } from "@/lib/theme-types";
import { ToastProvider } from "./Toast";
import Temas from "./Temas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FASES 06 A 09 DO `docs/APPLE-TEMAS.md`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Split view, grelha de fotografias, arrasto entre temas e Quick Look. Ficam
 * num ficheiro à parte do `Temas.test.tsx` — que já tem 3200 linhas e é a rede
 * da ESCALA (milhares de fotos, lotes de 300, estado sob concorrência). O que
 * se prende aqui é outra coisa: os quatro critérios de aceitação do documento
 * que dependem de gestos.
 *
 * ── O QUE O JSDOM NÃO SABE, E COMO SE CONTORNA ────────────────────────────
 *
 * Não sabe arrastar: não há `DragEvent` com `dataTransfer` verdadeiro, não há
 * imagem de arrasto, não há `dragover` contínuo. O que se encena é a SEQUÊNCIA
 * de eventos que o browser dispara, com um `dataTransfer` de mentira que
 * guarda dados a sério — porque é exactamente por lá que a carga viaja entre
 * a grelha e a coluna, e é isso que interessa provar. A sensação do gesto
 * mede-se num browser; aqui prende-se a decisão.
 */

// ── Servidor de mentira ────────────────────────────────────────────────────
type Res = { ok: boolean; status: number; json: () => Promise<unknown> };
const ok = (body: unknown): Res => ({ ok: true, status: 200, json: async () => body });

let handlers: Map<string, (init?: RequestInit) => Res>;
let pedidos: { url: string; init?: RequestInit }[];

function chave(url: string, init?: RequestInit) {
  return `${(init?.method ?? "GET").toUpperCase()} ${url.split("?")[0]}`;
}

function rota(k: string, h: (init?: RequestInit) => Res) {
  handlers.set(k, h);
}

/** Os corpos enviados a uma rota, já em JSON. */
function corpos(k: string): Record<string, unknown>[] {
  return pedidos
    .filter((p) => chave(p.url, p.init) === k)
    .map((p) => JSON.parse(String(p.init?.body ?? "{}")));
}

const T0 = "2026-01-01T00:00:00.000Z";
const tema = (id: string, name: string, imageCount = 2): ThemeSummary => ({
  id,
  name,
  notes: "",
  createdAt: T0,
  updatedAt: T0,
  imageCount,
});

const foto = (temaId: string, n: number): ThemeImage => ({
  path: `${temaId}/foto-${n}.jpg`,
  url: `https://cdn.test/${temaId}-${n}.jpg`,
  thumbUrl: `https://cdn.test/${temaId}-${n}-thumb.jpg`,
});

const TEMAS = [tema("t1", "Terracotta"), tema("t2", "Bouquets Campestres")];

beforeEach(() => {
  handlers = new Map();
  pedidos = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      pedidos.push({ url, init });
      const h = handlers.get(chave(url, init));
      if (!h) return ok({});
      return h(init);
    }),
  );
  rota("GET /api/temas", () => ok(TEMAS));
  rota("GET /api/temas/uso", () => ok({ usos: { t1: 1, t2: 0 } }));
  rota("GET /api/temas/t1/imagens", () =>
    ok({ ok: true, images: [foto("t1", 1), foto("t1", 2)], total: 2 }),
  );
  rota("GET /api/temas/t2/imagens", () => ok({ ok: true, images: [foto("t2", 9)], total: 1 }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function desenhar() {
  return render(
    <ToastProvider>
      <Temas />
    </ToastProvider>,
  );
}

/** O botão que ABRE um tema na grelha de cartões (e não o «⋯» dele). */
async function cartao(nome: RegExp) {
  const todos = await screen.findAllByRole("button", { name: nome });
  const so = todos.filter((b) => b.getAttribute("aria-haspopup") !== "menu");
  if (so.length !== 1) throw new Error(`${so.length} cartões para ${nome}`);
  return so[0];
}

async function abrir(nome: RegExp) {
  // O `findAllByRole` fica FORA do `act`: um `waitFor` lá dentro nunca deixa
  // as microtarefas da leitura correr, e o ecrã fica preso no esqueleto.
  const alvo = await cartao(nome);
  await act(async () => {
    fireEvent.click(alvo);
  });
  await act(async () => {});
}

/** A coluna da esquerda do split view. */
const coluna = () => screen.getByRole("navigation", { name: "Temas da biblioteca" });

/** Uma célula da grelha de fotografias (o alvo da selecção). */
const celula = (i: number, de: number) =>
  screen.getByRole("checkbox", { name: `Selecionar foto ${i} de ${de}` });

/**
 * Um `DataTransfer` de mentira que guarda mesmo o que lá se escreve — é por
 * ele que a carga viaja da grelha para a coluna.
 */
function transferencia() {
  const dados = new Map<string, string>();
  return {
    effectAllowed: "",
    dropEffect: "",
    get types() {
      return [...dados.keys()];
    },
    setData: (t: string, v: string) => dados.set(t, v),
    getData: (t: string) => dados.get(t) ?? "",
    setDragImage: vi.fn(),
    files: [],
    items: { length: 0 },
  } as unknown as DataTransfer;
}

/** O gesto inteiro: pegar na foto `i`, atravessar a coluna e largar em `destino`. */
async function arrastarPara(celulaDaFoto: HTMLElement, destino: HTMLElement) {
  const dt = transferencia();
  const origem = celulaDaFoto.parentElement!;
  await act(async () => {
    fireEvent.dragStart(origem, { dataTransfer: dt });
    fireEvent.dragEnter(destino, { dataTransfer: dt });
    fireEvent.dragOver(destino, { dataTransfer: dt });
    fireEvent.drop(destino, { dataTransfer: dt });
    fireEvent.dragEnd(origem, { dataTransfer: dt });
  });
  await act(async () => {});
  return dt;
}

// ══════════════════════════════════════════════════════════════════════════
describe("Fase 06 — split view", () => {
  it("a lista de temas fica ao lado das fotografias, com o tema aberto marcado", async () => {
    desenhar();
    await abrir(/Terracotta/);

    const lista = within(coluna());
    // Ponto 16: «lista de temas à esquerda, fotografias à direita».
    expect(lista.getByRole("button", { name: /Terracotta/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    // «Seleção persistente no painel que conduz ao detalhe.» [APPLE] O tema
    // que NÃO está aberto não pode dizer que está.
    expect(lista.getByRole("button", { name: /Bouquets/ })).not.toHaveAttribute("aria-current");
  });

  it("trocar de tema troca as fotografias — sem passar pela grelha de cartões", async () => {
    desenhar();
    await abrir(/Terracotta/);
    expect(screen.getByRole("checkbox", { name: "Selecionar foto 1 de 2" })).toBeTruthy();

    await act(async () => {
      fireEvent.click(within(coluna()).getByRole("button", { name: /Bouquets/ }));
    });
    await act(async () => {});

    // O tema do lado abriu-se, e o ecrã NUNCA voltou à grelha de cartões (que
    // é o que o «Novo tema» da barra de topo identifica).
    expect(screen.getByRole("checkbox", { name: "Selecionar foto 1 de 1" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Novo tema" })).toBeNull();
    expect(within(coluna()).getByRole("button", { name: /Bouquets/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("«Todos os temas» é a saída do split view", async () => {
    desenhar();
    await abrir(/Terracotta/);

    await act(async () => {
      fireEvent.click(within(coluna()).getByRole("button", { name: "Todos os temas" }));
    });

    expect(await screen.findByRole("button", { name: "Novo tema" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Temas da biblioteca" })).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe("Fase 07 — o tracejado só existe durante um arrasto", () => {
  const zona = () => document.querySelector("[data-zona-de-largar]") as HTMLElement;

  it("em repouso, com fotografias na grelha, não há tracejado nenhum", async () => {
    desenhar();
    await abrir(/Terracotta/);
    // Critério 8: «o tracejado de destino só existe durante um arrasto». Com
    // fotografias lá dentro a moldura é transparente — «a grelha é só a
    // grelha» (ponto 17).
    expect(zona().className).not.toContain("border-dashed");
    expect(zona().className).toContain("border-transparent");
  });

  it("aparece quando vêm ficheiros por cima, e desaparece quando eles saem", async () => {
    desenhar();
    await abrir(/Terracotta/);

    await act(async () => {
      fireEvent.dragEnter(zona(), { dataTransfer: transferencia() });
    });
    expect(zona().className).toContain("border-dashed");

    await act(async () => {
      fireEvent.dragLeave(zona(), { dataTransfer: transferencia() });
    });
    // «Remover o feedback ao sair.» [APPLE]
    expect(zona().className).not.toContain("border-dashed");
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe("Fase 08 — arrastar fotografias entre temas", () => {
  const moverOk = (n: number) =>
    ok({
      copied: Array.from({ length: n }, (_, i) => ({
        from: `t1/foto-${i + 1}.jpg`,
        to: `t2/foto-${i + 1}.jpg`,
      })),
      existing: [],
      failed: [],
      thumbsMissing: 0,
    });

  it("largar uma foto noutro tema MOVE-a — e o pedido leva o caminho dela", async () => {
    rota("POST /api/temas/t1/imagens/copiar", () => moverOk(1));
    desenhar();
    await abrir(/Terracotta/);

    await arrastarPara(celula(1, 2), within(coluna()).getByRole("button", { name: /Bouquets/ }));

    // «Para contentor diferente MOVE.» [APPLE] E é o MESMO pedido que o
    // «Copiar para…» já fazia — o arrasto é uma segunda porta, não uma
    // segunda operação.
    expect(corpos("POST /api/temas/t1/imagens/copiar")).toEqual([
      { paths: ["t1/foto-1.jpg"], destino: "t2", modo: "mover" },
    ]);
    // E a foto sai da grelha da origem.
    expect(screen.queryByRole("checkbox", { name: /Selecionar foto 2 de 2/ })).toBeNull();
  });

  it("pegar numa foto SELECCIONADA leva a selecção inteira", async () => {
    rota("POST /api/temas/t1/imagens/copiar", () => moverOk(2));
    desenhar();
    await abrir(/Terracotta/);

    await act(async () => {
      fireEvent.click(celula(1, 2));
      fireEvent.click(celula(2, 2), { shiftKey: true });
    });

    await arrastarPara(celula(1, 2), within(coluna()).getByRole("button", { name: /Bouquets/ }));

    expect(corpos("POST /api/temas/t1/imagens/copiar")[0].paths).toEqual([
      "t1/foto-1.jpg",
      "t1/foto-2.jpg",
    ]);
  });

  it("largar no PRÓPRIO tema não é uma operação — não sai pedido nenhum", async () => {
    desenhar();
    await abrir(/Terracotta/);

    await arrastarPara(celula(1, 2), within(coluna()).getByRole("button", { name: /Terracotta/ }));

    expect(corpos("POST /api/temas/t1/imagens/copiar")).toEqual([]);
  });

  it('anuncia o resultado em `role="status"` — não só num aviso que passa', async () => {
    rota("POST /api/temas/t1/imagens/copiar", () => moverOk(1));
    desenhar();
    await abrir(/Terracotta/);

    await arrastarPara(celula(1, 2), within(coluna()).getByRole("button", { name: /Bouquets/ }));

    // Parte 7: «operações de arrasto anunciadas em `role="status"`».
    const regiao = screen.getByRole("status", { name: "Movimento de fotografias" });
    expect(regiao.textContent).toBe("1 fotografia movida para «Bouquets Campestres».");
  });

  it("o aviso traz «Anular», e anular manda as fotografias de volta", async () => {
    rota("POST /api/temas/t1/imagens/copiar", () => moverOk(1));
    rota("POST /api/temas/t2/imagens/copiar", () =>
      ok({ copied: [{ from: "t2/foto-1.jpg", to: "t1/foto-1.jpg" }], existing: [], failed: [] }),
    );
    desenhar();
    await abrir(/Terracotta/);

    await arrastarPara(celula(1, 2), within(coluna()).getByRole("button", { name: /Bouquets/ }));

    // Critério 6: «nenhuma ação destrutiva a um clique sem Anular».
    const anular = await screen.findByRole("button", { name: "Anular" });
    await act(async () => {
      fireEvent.click(anular);
    });
    await act(async () => {});

    // Volta pelo caminho contrário, com o caminho NOVO que o servidor deu.
    expect(corpos("POST /api/temas/t2/imagens/copiar")).toEqual([
      { paths: ["t2/foto-1.jpg"], destino: "t1", modo: "mover" },
    ]);
    expect(screen.getByRole("status", { name: "Movimento de fotografias" }).textContent).toBe(
      "1 fotografia de volta a «Terracotta».",
    );
  });

  it("spring loading: segurar um segundo sobre um tema abre-o, sem largar nada", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    desenhar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await abrir(/Terracotta/);

    const dt = transferencia();
    const origem = celula(1, 2).parentElement!;
    const destino = within(coluna()).getByRole("button", { name: /Bouquets/ });
    await act(async () => {
      fireEvent.dragStart(origem, { dataTransfer: dt });
      fireEvent.dragEnter(destino, { dataTransfer: dt });
    });

    // «Manter sobre um tema ~1 s abre-o.» [APPLE] Antes disso, nada.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(destino).not.toHaveAttribute("aria-current");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(within(coluna()).getByRole("button", { name: /Bouquets/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    // Abrir NÃO é largar: nenhuma fotografia mudou de tema.
    expect(corpos("POST /api/temas/t1/imagens/copiar")).toEqual([]);
  });

  it("«Mover para…» está no menu da fotografia — o arrasto não é o único caminho", async () => {
    desenhar();
    await abrir(/Terracotta/);

    await act(async () => {
      fireEvent.contextMenu(celula(1, 2).parentElement!);
    });
    // Parte 4: «alternativa por menu obrigatória». Sem ela, quem não tem rato
    // (ou está no telemóvel, onde o arrasto HTML5 não pega) não tem caminho.
    expect(screen.getByRole("menuitem", { name: /Mover para…/ })).toBeTruthy();
  });

  it("«Mover para…» abre a folha em «Mover» e o pedido sai como mover", async () => {
    // B1: a folha abria sempre em «Copiar». Quem escolhia «Mover para…» e
    // carregava no botão do fundo COPIAVA — a foto ficava nos dois temas.
    desenhar();
    await abrir(/Terracotta/);

    await act(async () => {
      fireEvent.contextMenu(celula(1, 2).parentElement!);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: /Mover para…/ }));
    });

    const folha = await screen.findByRole("dialog", { name: /foto selecionada/ });
    const modo = within(folha).getByRole("radiogroup", { name: "O que fazer" });
    expect(within(modo).getByRole("radio", { name: "Mover" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(modo).getByRole("radio", { name: "Copiar" })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    rota("POST /api/temas/t1/imagens/copiar", () =>
      ok({ copied: [{ from: "t1/foto-1.jpg" }], existing: [], failed: [] }),
    );
    await act(async () => {
      fireEvent.click(within(folha).getByRole("button", { name: "Mover 1 foto" }));
    });
    expect(corpos("POST /api/temas/t1/imagens/copiar")).toEqual([
      { paths: ["t1/foto-1.jpg"], destino: "t2", modo: "mover" },
    ]);
  });

  it("«Copiar para…» da barra da selecção continua a abrir em «Copiar»", async () => {
    // O outro lado do B1: a porta da barra é a da cópia, e não pode herdar o
    // «Mover» de uma ida anterior pelo menu.
    desenhar();
    await abrir(/Terracotta/);

    await act(async () => {
      fireEvent.contextMenu(celula(1, 2).parentElement!);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: /Mover para…/ }));
    });
    const primeira = await screen.findByRole("dialog", { name: /foto selecionada/ });
    await act(async () => {
      fireEvent.click(within(primeira).getByRole("button", { name: "Cancelar" }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Copiar para…" })[0]);
    });
    const folha = await screen.findByRole("dialog", { name: /foto selecionada/ });
    expect(within(folha).getByRole("radio", { name: "Copiar" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe("Fase 09 — Quick Look", () => {
  it("`Espaço` abre a pré-visualização da fotografia com foco", async () => {
    desenhar();
    await abrir(/Terracotta/);

    await act(async () => {
      fireEvent.keyDown(celula(2, 2), { key: " " });
    });

    // Critério 5, e ponto 23: «é o gesto que qualquer utilizador de Mac tenta
    // primeiro».
    const lupa = await screen.findByRole("dialog", { name: "Foto 2 de 2" });
    expect(lupa).toBeTruthy();
  });

  it("as setas navegam e o `Esc` fecha", async () => {
    desenhar();
    await abrir(/Terracotta/);
    await act(async () => {
      fireEvent.keyDown(celula(1, 2), { key: " " });
    });
    await screen.findByRole("dialog", { name: "Foto 1 de 2" });

    await act(async () => {
      fireEvent.keyDown(document, { key: "ArrowRight" });
    });
    expect(screen.getByRole("dialog", { name: "Foto 2 de 2" })).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog", { name: /^Foto \d+ de 2$/ })).toBeNull();
  });

  it("o `Espaço` está anunciado na célula — um atalho secreto não existe", async () => {
    desenhar();
    await abrir(/Terracotta/);
    expect(celula(1, 2)).toHaveAttribute("aria-keyshortcuts", "Space");
  });
});

describe("Fase 11 — a grelha das fotografias pelo teclado", () => {
  beforeEach(() => {
    rota("GET /api/temas/t1/imagens", () =>
      ok({ ok: true, images: [1, 2, 3, 4, 5].map((n) => foto("t1", n)), total: 5 }),
    );
  });

  it('é um `role="grid"` com células `gridcell` que dizem se estão escolhidas', async () => {
    desenhar();
    await abrir(/Terracotta/);
    const grelha = screen.getByRole("grid", { name: "Fotografias de Terracotta" });
    expect(grelha).toHaveAttribute("aria-multiselectable", "true");
    const celulas = within(grelha).getAllByRole("gridcell");
    expect(celulas).toHaveLength(5);
    // Duas colunas (a base da classe, que é o que o jsdom deixa medir): a
    // terceira foto é a primeira da segunda linha.
    expect(celulas[2]).toHaveAttribute("aria-rowindex", "2");
    expect(celulas[2]).toHaveAttribute("aria-colindex", "1");
    expect(celulas[0]).toHaveAttribute("aria-selected", "false");

    await act(async () => {
      fireEvent.click(celula(1, 5));
    });
    expect(celulas[0]).toHaveAttribute("aria-selected", "true");
  });

  it("só uma foto está no fio do Tab, e as setas levam-no consigo", async () => {
    desenhar();
    await abrir(/Terracotta/);
    const noTab = () =>
      screen
        .getAllByRole("checkbox", { name: /^Selecionar foto/ })
        .filter((b) => b.tabIndex === 0)
        .map((b) => b.getAttribute("aria-label"));
    expect(noTab()).toEqual(["Selecionar foto 1 de 5"]);

    celula(1, 5).focus();
    await act(async () => {
      fireEvent.keyDown(celula(1, 5), { key: "ArrowRight" });
    });
    expect(document.activeElement).toBe(celula(2, 5));
    await act(async () => {
      fireEvent.keyDown(celula(2, 5), { key: "ArrowDown" });
    });
    expect(document.activeElement).toBe(celula(4, 5));
    expect(noTab()).toEqual(["Selecionar foto 4 de 5"]);

    // ⌘/Ctrl+End vai à última; e na ponta a tecla não faz nada.
    await act(async () => {
      fireEvent.keyDown(celula(4, 5), { key: "End", ctrlKey: true });
    });
    expect(document.activeElement).toBe(celula(5, 5));
    await act(async () => {
      fireEvent.keyDown(celula(5, 5), { key: "ArrowRight" });
    });
    expect(document.activeElement).toBe(celula(5, 5));
  });

  it("andar com as setas não escolhe nada; com o `Shift`, a selecção vai atrás", async () => {
    desenhar();
    await abrir(/Terracotta/);
    celula(1, 5).focus();
    await act(async () => {
      fireEvent.keyDown(celula(1, 5), { key: "ArrowRight" });
    });
    expect(screen.queryAllByRole("gridcell", { selected: true })).toHaveLength(0);

    await act(async () => {
      fireEvent.keyDown(celula(2, 5), { key: "ArrowDown", shiftKey: true });
    });
    // Da 2 à 4, como no Finder: o intervalo inteiro.
    expect(celula(2, 5)).toHaveAttribute("aria-checked", "true");
    expect(celula(3, 5)).toHaveAttribute("aria-checked", "true");
    expect(celula(4, 5)).toHaveAttribute("aria-checked", "true");
    expect(celula(1, 5)).toHaveAttribute("aria-checked", "false");

    // Voltar para trás por cima do que está escolhido encolhe.
    await act(async () => {
      fireEvent.keyDown(celula(4, 5), { key: "ArrowLeft", shiftKey: true });
    });
    expect(celula(4, 5)).toHaveAttribute("aria-checked", "false");
    expect(celula(3, 5)).toHaveAttribute("aria-checked", "true");
  });

  it("o `Enter` alterna a escolha, e o «⋯» só está no Tab na foto com o foco", async () => {
    desenhar();
    await abrir(/Terracotta/);
    const accoes = screen.getAllByRole("button", { name: /^Acções da foto/ });
    expect(accoes.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    expect(accoes[0].tabIndex).toBe(0);
    // O `Enter` num `<button>` é um `click` — o browser fá-lo; aqui encena-se.
    await act(async () => {
      fireEvent.click(celula(1, 5));
    });
    expect(celula(1, 5)).toHaveAttribute("aria-checked", "true");
  });
});
