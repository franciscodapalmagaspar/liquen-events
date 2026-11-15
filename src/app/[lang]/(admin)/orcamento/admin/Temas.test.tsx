// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ThemeImage, ThemeSummary } from "@/lib/theme-types";
import {
  CHECK_CHUNK,
  MAX_THEME_COPY_BATCH,
  THEME_COPY_CHUNK,
  THEME_PAGE_SIZE,
} from "@/lib/theme-types";
import { ToastProvider } from "./Toast";

/**
 * Responde «sim» à pergunta da casa depois de um gesto de remover.
 *
 * Remover fotos deixou de passar pelo `confirm()` do browser — que não cabe num
 * ecrã de 375 px e aparece longe do dedo. O que estes testes medem (a grelha
 * optimista, a reposição do que o servidor recusa, a barra de progresso do
 * lote) não muda; muda o caminho até lá.
 */
/**
 * Uma acção de uma fotografia pelo «⋯» dela. Eram três círculos (↑, ⤢, ×) por
 * cima de cada foto; a 14/10 passaram a um «⋯» de vidro que abre o mesmo menu
 * do botão direito (APPLE-TEMAS, ponto 9 — a escolha dela).
 */
async function accaoDaFoto(n: number, total: number, rotulo: string) {
  fireEvent.click(screen.getByRole("button", { name: `Acções da foto ${n} de ${total}` }));
  const item = await screen.findByRole("menuitem", { name: rotulo });
  await act(async () => {
    fireEvent.click(item);
  });
}

async function confirmarRemocao() {
  const caixa = await screen.findByRole("dialog");
  await act(async () => {
    fireEvent.click(
      within(caixa).getByRole("button", { name: /^Remover (a fotografia|as fotografias)$/ }),
    );
  });
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Temas, {
  COLUNAS,
  GRELHA_DE_FOTOS,
  PISO_DA_CELULA_PX,
  contarFotosDaBiblioteca,
  desdeQuando,
  fraseDeEliminar,
  mergePage,
  moveItem,
  ordenarTemas,
  reinsertAt,
  temPoucasFotos,
} from "./Temas";

/**
 * Rede de segurança da Biblioteca de Temas.
 *
 * O que aqui se testa não é o desenho do ecrã — é o comportamento À ESCALA a
 * que a Catarina o vai usar (milhares de fotos, lotes de 300) e o estado sob
 * concorrência, que é onde este ecrã perdia fotos: ela larga uma pasta de
 * fotos, arrasta mais para cima enquanto a primeira sobe, e apaga uma pelo
 * meio. Cada teste fixa um caso em que uma versão anterior dava a resposta
 * errada.
 *
 * A preparação da imagem é substituída porque não há `canvas` em jsdom — mas o
 * `vi.fn` serve também para fixar o preset com que a biblioteca comprime e
 * para pôr (ou não) uma miniatura ao lado do original.
 */

const prepare = vi.hoisted(() => vi.fn());
vi.mock("./image-prep", () => ({ prepareImageWithThumb: prepare }));

/**
 * A IMPRESSÃO DIGITAL, encenada — e pela mesma razão por que a preparação da
 * imagem também é.
 *
 * A real (`crypto.subtle.digest` sobre o ficheiro inteiro) resolve-se FORA do
 * ciclo de microtarefas: o `arrayBuffer()` e o resumo terminam quando o
 * browser quiser, e isso tornava estes testes dependentes do relógio — os
 * mesmos testes passavam sozinhos e falhavam em conjunto. O resumo verdadeiro
 * está fixado à parte, em `src/lib/theme-fingerprint.test.ts`, com o
 * `crypto.subtle` a sério; aqui o que se está a provar é OUTRA coisa (o que o
 * ecrã FAZ com o veredicto), por isso o resumo é uma função do CONTEÚDO
 * declarado de cada ficheiro de mentira — que é a propriedade que interessa:
 * bytes iguais, resumo igual.
 */
const fp = vi.hoisted(() => ({
  /** `ficheiro → conteúdo`, preenchido pelos construtores de fotos falsas. */
  content: new WeakMap<File, string>(),
  hash: (s: string) => {
    // Um resumo qualquer, desde que seja 32 hex e função só do conteúdo.
    let a = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) a = Math.imul(a ^ s.charCodeAt(i), 0x01000193) >>> 0;
    return a.toString(16).padStart(8, "0").repeat(4);
  },
}));
vi.mock("@/lib/theme-fingerprint", async () => {
  const real =
    await vi.importActual<typeof import("@/lib/theme-fingerprint")>("@/lib/theme-fingerprint");
  return {
    ...real,
    fingerprintBlob: async (blob: Blob) => {
      const c = blob instanceof File ? fp.content.get(blob) : undefined;
      return c === undefined ? null : fp.hash(c);
    },
  };
});

// ── Servidor de mentira ────────────────────────────────────────────────────
// Cada rota responde por `MÉTODO /caminho` (sem query string). Uma rota pode
// ser "travada": o pedido fica pendurado até o teste o libertar, que é o que
// permite pôr dois lotes a correr ao mesmo tempo e mandar as respostas na
// ordem que interessa.
type Res = { ok: boolean; status: number; json: () => Promise<unknown> };
const ok = (body: unknown): Res => ({ ok: true, status: 200, json: async () => body });
const bad = (status = 500, body: unknown = {}): Res => ({
  ok: false,
  status,
  json: async () => body,
});

let handlers: Map<string, () => Res>;
let heldRoutes: Set<string>;
let queued: Map<string, (() => void)[]>;
let calls: string[];
/** Os pedidos completos (URL com query + corpo), para o que precisa deles. */
let requests: { url: string; init?: RequestInit }[];

function routeKey(url: string, init?: RequestInit) {
  return `${(init?.method ?? "GET").toUpperCase()} ${url.split("?")[0]}`;
}

function route(key: string, handler: () => Res) {
  handlers.set(key, handler);
}

function hold(key: string) {
  heldRoutes.add(key);
}

/** Liberta o pedido mais antigo que está pendurado nessa rota. */
async function release(key: string) {
  const next = queued.get(key)?.shift();
  if (!next) throw new Error(`Não há nenhum pedido travado em ${key}`);
  await act(async () => {
    next();
  });
}

/** Liberta TODOS os pedidos pendurados nessa rota, incluindo os que a
 *  libertação for desbloqueando (é assim que um lote inteiro escoa). */
async function releaseAll(key: string) {
  for (let guard = 0; guard < 500; guard++) {
    const next = queued.get(key)?.shift();
    if (!next) return;
    await act(async () => {
      next();
    });
  }
}

function callsTo(key: string) {
  return calls.filter((c) => c === key).length;
}

function urlsFor(key: string) {
  return requests.filter((r) => routeKey(r.url, r.init) === key).map((r) => r.url);
}

// ── Dados ──────────────────────────────────────────────────────────────────
const T0 = "2026-01-01T00:00:00.000Z";
const THEME: ThemeSummary = {
  id: "t1",
  name: "Terracotta",
  notes: "",
  createdAt: T0,
  updatedAt: T0,
  imageCount: 0,
};

const photo = (n: number, thumb = false): ThemeImage => ({
  path: `t1/foto-${n}.jpg`,
  url: `https://cdn.test/foto-${n}.jpg`,
  ...(thumb ? { thumbUrl: `https://cdn.test/thumb-${n}.jpg` } : {}),
});
const many = (from: number, count: number, thumb = false) =>
  Array.from({ length: count }, (_, i) => photo(from + i, thumb));
/**
 * Uma foto de mentira. O CONTEÚDO é o nome, e não uma constante: desde que a
 * biblioteca reconhece fotos repetidas pelo resumo do ficheiro (SHA-256 do
 * original), dois ficheiros com os mesmos bytes SÃO a mesma foto — e um lote de
 * dez `new File(["x"])` seria corretamente reduzido a uma. Nomes distintos =
 * fotos distintas, que é o que quase todos estes testes querem dizer.
 */
const jpg = (name: string) => withContent(new File([name], name, { type: "image/jpeg" }), name);

/** A MESMA foto, com outro nome de ficheiro — o caso real de ela arrastar duas
 *  cópias do mesmo ficheiro. O resumo é do CONTEÚDO, não do nome. */
const sameAs = (file: File, name: string) =>
  withContent(
    new File([fp.content.get(file) ?? ""], name, { type: "image/jpeg" }),
    fp.content.get(file) ?? "",
  );

function withContent(file: File, content: string): File {
  fp.content.set(file, content);
  return file;
}

/**
 * Quanto está cheia a barra da espera partilhada (`ui/EmCurso.tsx`).
 *
 * Lê-se o `scaleX` e não uma classe: o que se prende é o COMPORTAMENTO — a
 * barra diz a fracção verdadeira do lote —, e o desenho é assunto do `EmCurso`.
 * A marca `data-barra` existe precisamente para isto (o traço é `aria-hidden`,
 * não tem papel nem nome por onde lhe pegar).
 */
function preenchimento(): number {
  const barra = document.querySelector("[data-barra=preenchimento]") as HTMLElement | null;
  const m = /scaleX\(([\d.]+)\)/.exec(barra?.style.transform ?? "");
  if (!m) throw new Error("não há barra da espera no ecrã");
  return Number(m[1]);
}

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
/**
 * A zona de largar, encontrada por marca e não por classe.
 *
 * Era `div.border-dashed`. Deixou de servir na fase 07 do
 * `docs/APPLE-TEMAS.md`: «o tracejado de destino só existe durante um arrasto»
 * (critério 8), portanto em repouso já não há classe nenhuma por onde lhe
 * pegar. O `data-zona-de-largar` é a marca estável, e está escrita no
 * `Temas.tsx` com a razão ao lado.
 */
const dropZone = () => document.querySelector("[data-zona-de-largar]") as HTMLElement;
/**
 * As `<img>` da GRELHA DE FOTOS, e não as da página toda.
 *
 * Era `document.querySelectorAll("img")`, e passou a apanhar uma capa a mais
 * por cada tema no dia em que o split view (fase 06) pôs a lista de temas ao
 * lado da pasta — cada linha dessa lista tem a sua miniatura de 40 px. Contar
 * as capas da navegação como fotos do tema fazia dezoito testes lerem sempre
 * mais uma foto do que a grelha mostra.
 *
 * Fora de uma pasta não há zona de largar, e aí a pergunta é a de sempre.
 */
const imgs = () => Array.from((dropZone() ?? document).querySelectorAll("img"));

/**
 * As fotos que a grelha está mesmo a mostrar.
 *
 * As fotos SEM miniatura entram numa fila (só se descarregam três originais ao
 * mesmo tempo — ver `HEAVY_IMAGE_CONCURRENCY`), por isso uma célula só recebe
 * `src` quando lhe chega a vez. Em jsdom nada carrega sozinho: `settlePhotos`
 * faz o que o browser faz — dar cada foto por carregada, o que liberta a vez
 * seguinte — e só então a grelha tem todas as fotos com `src`.
 */
const photos = () => imgs().map((i) => i.getAttribute("src"));

async function settlePhotos() {
  for (let guard = 0; guard < 300; guard++) {
    const waiting = imgs().filter((i) => i.getAttribute("src") && !i.dataset.settled);
    if (waiting.length === 0) return;
    await act(async () => {
      for (const img of waiting) {
        img.dataset.settled = "1";
        fireEvent.load(img);
      }
    });
  }
  throw new Error("a fila das fotos não escoou");
}

/** Faz andar o relógio falso e deixa o React assentar. Com `ms = 0` é só
 *  "deixa as promessas resolverem". */
async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function renderTemas() {
  return render(
    <ToastProvider>
      <Temas />
    </ToastProvider>,
  );
}

/**
 * O CARTÃO de um tema — e não o «⋯» que está por cima dele.
 *
 * Cada cartão passou a ter um menu de acções cujo nome acessível é «Acções de
 * Terracotta». A partir daí `/Terracotta/` deixou de identificar UM botão e
 * passou a identificar dois, e 47 testes deste ficheiro pararam com «Found
 * multiple elements».
 *
 * A correcção é tornar o selector PRECISO, não afrouxá-lo: o cartão é o botão
 * que abre a pasta, o menu é o que tem `aria-haspopup="menu"`. Um
 * `getAllByRole(...)[0]` também passava, mas passava por acaso — ficava
 * dependente da ordem do DOM e calava-se no dia em que ela mudasse. Este
 * rebenta com uma frase inteligível se algum dia houver zero ou dois cartões.
 */
function soCartoes(bs: HTMLElement[], name: RegExp): HTMLElement {
  const cartoes = bs.filter((b) => b.getAttribute("aria-haspopup") !== "menu");
  if (cartoes.length !== 1)
    throw new Error(`Esperava UM cartão para ${name}; encontrei ${cartoes.length}.`);
  return cartoes[0];
}

function cartaoDoTema(name: RegExp): HTMLElement {
  return soCartoes(screen.getAllByRole("button", { name }), name);
}

async function acharCartaoDoTema(name: RegExp): Promise<HTMLElement> {
  return soCartoes(await screen.findAllByRole("button", { name }), name);
}

/** Há um cartão deste tema na lista? (O «⋯» não conta como cartão.) */
function haCartaoDoTema(name: RegExp): boolean {
  return screen
    .queryAllByRole("button", { name })
    .some((b) => b.getAttribute("aria-haspopup") !== "menu");
}

/**
 * Abre o «⋯» de um tema e devolve o item de menu pedido.
 *
 * O cartão passou a ter UM botão sobre a fotografia em vez de dois chips
 * soltos (ponto 9 da auditoria do `docs/APPLE-TEMAS.md`), por isso as acções
 * deixaram de ser botões da grelha e passaram a ser itens de menu. Quem quiser
 * uma acção abre o menu — que é o que ela também faz.
 */
function accaoNoMenuDoTema(tema: RegExp, accao: string | RegExp): HTMLElement {
  const abridor = screen.getAllByRole("button", { name: new RegExp(`Acções de ${tema.source}`) });
  fireEvent.click(abridor[0]);
  return screen.getByRole("menuitem", { name: accao });
}

/** Abre a pasta de um tema e espera que a leitura das fotos assente. */
async function openFolder(name: RegExp) {
  fireEvent.click(await acharCartaoDoTema(name));
  await screen.findByRole("button", { name: "Adicionar fotos" });
  await act(async () => {});
  await settlePhotos();
}

/**
 * Deixa a fase de VERIFICAÇÃO assentar.
 *
 * Antes de qualquer preparação ou upload, o lote é resumido e confrontado com
 * a pasta (`POST /repetidas`, um pedido por pedaço de 50). São mais algumas
 * voltas de microtarefas do que antes desta funcionalidade, e é por isso que
 * um só `act` deixou de chegar para o primeiro carregamento sair.
 */
async function settleScreening() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** Larga fotos no seletor de ficheiros (o botão "Adicionar fotos"). */
async function chooseFiles(...files: File[]) {
  await act(async () => {
    fireEvent.change(fileInput(), { target: { files } });
  });
  await settleScreening();
}

/** Larga fotos por arrasto — o caminho que continua aberto enquanto o botão
 *  "Adicionar fotos" está ocupado com um lote anterior. */
async function dropFiles(...files: File[]) {
  await act(async () => {
    fireEvent.drop(dropZone(), { dataTransfer: { files } });
  });
  await settleScreening();
}

beforeEach(() => {
  handlers = new Map();
  heldRoutes = new Set();
  queued = new Map();
  calls = [];
  requests = [];
  prepare.mockReset();
  // Sem canvas em jsdom: a foto sobe tal e qual, sem miniatura.
  prepare.mockImplementation(async (f: File) => ({ file: f, thumb: null }));
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const key = routeKey(String(url), init);
      calls.push(key);
      requests.push({ url: String(url), init });
      const res = handlers.get(key)?.() ?? ok({});
      if (!heldRoutes.has(key)) return Promise.resolve(res);
      return new Promise<Res>((resolve) => {
        const q = queued.get(key) ?? [];
        q.push(() => resolve(res));
        queued.set(key, q);
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Biblioteca de Temas — estado sob concorrência", () => {
  it("comprime as fotos da biblioteca com o preset de capa, não com o de mood board", async () => {
    // Uma foto da biblioteca pode acabar numa imagem de CAPA (impressa em
    // grande). Guardá-la com o preset de mood board degradava-a para sempre.
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    route("POST /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(1)] }));

    renderTemas();
    await openFolder(/Terracotta/);

    const f = jpg("praia.jpg");
    await chooseFiles(f);

    expect(prepare).toHaveBeenCalledWith(f, "cover");
  });

  it("guarda as fotos dos dois lotes quando dois carregamentos se cruzam", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    let n = 0;
    route("POST /api/temas/t1/imagens", () => {
      n += 1;
      return ok({ ok: true, images: [photo(n)] });
    });
    hold("POST /api/temas/t1/imagens");

    renderTemas();
    await openFolder(/Terracotta/);

    // Lote 1 pelo seletor de ficheiros; lote 2 arrastado por cima antes de o
    // primeiro terminar. As respostas chegam pela mesma ordem.
    await chooseFiles(jpg("a.jpg"));
    await dropFiles(jpg("b.jpg"));
    expect(callsTo("POST /api/temas/t1/imagens")).toBe(2);

    await release("POST /api/temas/t1/imagens");
    await release("POST /api/temas/t1/imagens");

    expect(photos()).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Acções da foto 1 de 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acções da foto 2 de 2" })).toBeInTheDocument();
  });

  it("não ressuscita uma foto apagada enquanto um lote estava a subir", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(1)], total: 1 }));
    route("POST /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(2)] }));
    hold("POST /api/temas/t1/imagens");
    route("DELETE /api/temas/t1/imagens", () => ok({ ok: true }));

    renderTemas();
    await openFolder(/Terracotta/);
    expect(photos()).toEqual([photo(1).url]);

    // Um lote começa…
    await chooseFiles(jpg("nova.jpg"));
    // …e a foto que já lá estava é removida antes de o lote acabar.
    await accaoDaFoto(1, 1, "Remover do tema…");
    await confirmarRemocao();
    // Do servidor não fica nada; o que está no ecrã é a foto que ela acabou de
    // largar, mostrada a partir do ficheiro que está no computador.
    expect(photos().filter((s) => !s?.startsWith("blob:"))).toEqual([]);

    await release("POST /api/temas/t1/imagens");

    // Fica só a foto nova: a apagada não pode voltar.
    expect(screen.getByRole("button", { name: "Acções da foto 1 de 1" })).toBeInTheDocument();
    expect(photos()).not.toContain(photo(1).url);
  });

  it("repõe só a foto cuja remoção falhou, sem deitar fora as que chegaram entretanto", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(1)], total: 1 }));
    route("POST /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(2)] }));
    hold("POST /api/temas/t1/imagens");
    route("DELETE /api/temas/t1/imagens", () => bad(502));
    hold("DELETE /api/temas/t1/imagens");

    renderTemas();
    await openFolder(/Terracotta/);

    await chooseFiles(jpg("nova.jpg"));
    await accaoDaFoto(1, 1, "Remover do tema…");
    await confirmarRemocao();

    // A foto nova chega primeiro; só depois se sabe que a remoção falhou.
    await release("POST /api/temas/t1/imagens");
    await release("DELETE /api/temas/t1/imagens");
    await settlePhotos();

    // Duas fotos na grelha: a que voltou (do servidor) e a que subiu — esta
    // mostrada da cópia local, que é a que ela própria acabou de largar.
    expect(screen.getByRole("button", { name: "Acções da foto 2 de 2" })).toBeInTheDocument();
    expect(photos()).toHaveLength(2);
    expect(photos()).toContain(photo(1).url);
    expect(photos().some((s) => s?.startsWith("blob:"))).toBe(true);
  });

  it("não faz desaparecer um tema criado enquanto um DELETE falhado ia a caminho", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    route("DELETE /api/temas/t1", () => bad(500));
    hold("DELETE /api/temas/t1");
    route("POST /api/temas", () =>
      ok({ id: "t2", name: "Itália", notes: "", createdAt: T0, updatedAt: T0, imageCount: 0 }),
    );

    renderTemas();
    await openFolder(/Terracotta/);

    // Eliminar (o servidor ainda não respondeu) e criar outro tema entretanto.
    //
    // Eliminar deixou de ser um clique: passa pela pergunta da casa, com a
    // lista do que se perde lá dentro. O que este caso mede — um tema criado
    // enquanto um DELETE falhado ia a caminho — não muda. E chega-se lá pelo
    // «⋯» do cabeçalho: o botão de texto «Eliminar tema» saiu (T3).
    fireEvent.click(screen.getByRole("button", { name: "Acções de Terracotta" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Eliminar tema…" }));
    const caixa = await screen.findByRole("dialog");
    await act(async () => {
      fireEvent.click(within(caixa).getByRole("button", { name: "Eliminar o tema" }));
    });
    fireEvent.click(screen.getByRole("button", { name: "Novo tema" }));
    const field = screen.getByLabelText(/Nome do tema/);
    fireEvent.change(field, { target: { value: "Itália" } });
    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });
    // Criar um tema abre-o logo; voltar à lista para a poder ver inteira.
    fireEvent.click(screen.getByRole("button", { name: "← Temas" }));

    // Só agora o servidor recusa a eliminação.
    await release("DELETE /api/temas/t1");

    expect(haCartaoDoTema(/Terracotta/)).toBe(true);
    expect(haCartaoDoTema(/Itália/)).toBe(true);
  });

  it("«Novo tema» leva o foco ao nome, e o «Ainda não há temas» sai da frente (auditoria de 14/11)", async () => {
    route("GET /api/temas", () => ok([]));
    renderTemas();
    await screen.findByText("Ainda não há temas");

    fireEvent.click(screen.getByRole("button", { name: "Novo tema" }));
    expect(document.activeElement).toBe(screen.getByLabelText(/Nome do tema/));
    expect(screen.queryByText("Ainda não há temas")).toBeNull();

    // Cancelar devolve o estado vazio.
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByText("Ainda não há temas")).toBeTruthy();
  });

  it("não cria dois temas quando o Enter é carregado duas vezes", async () => {
    route("GET /api/temas", () => ok([]));
    route("POST /api/temas", () =>
      ok({ id: "t2", name: "Itália", notes: "", createdAt: T0, updatedAt: T0, imageCount: 0 }),
    );
    hold("POST /api/temas");

    renderTemas();
    await screen.findByText("Ainda não há temas");

    fireEvent.click(screen.getByRole("button", { name: "Novo tema" }));
    const field = screen.getByLabelText(/Nome do tema/);
    fireEvent.change(field, { target: { value: "Itália" } });
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.keyDown(field, { key: "Enter" });

    expect(callsTo("POST /api/temas")).toBe(1);
    // O campo fica bloqueado enquanto grava — o Enter deixa de ter por onde.
    expect(field).toBeDisabled();
  });

  it("distingue pasta por ler de pasta vazia e assume a contagem truncada", async () => {
    route("GET /api/temas", () =>
      ok([
        { ...THEME, id: "t1", name: "Terracotta", imageCount: null },
        { ...THEME, id: "t2", name: "Itália", imageCount: 500, truncated: true },
        { ...THEME, id: "t3", name: "Branco & Verde", imageCount: 1 },
      ]),
    );

    renderTemas();

    // "Fotos indisponíveis" é um AVISO e vai sozinho; os outros trazem também
    // a data da última alteração ("1 foto · há 3 dias"), daí o começo.
    expect(await screen.findByText("Fotos indisponíveis")).toBeInTheDocument();
    expect(screen.getByText(/^500\+ fotos\b/)).toBeInTheDocument();
    expect(screen.getByText(/^1 foto\b/)).toBeInTheDocument();
  });
});

describe("Biblioteca de Temas — milhares de fotos", () => {
  it("pede SÓ a primeira página, e o resto a pedido", async () => {
    // O ecrã anterior pedia tudo de uma vez e o servidor assinava um URL por
    // foto: 4000 fotos = 4000 assinaturas para mostrar as primeiras dezenas.
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 312 }]));
    let call = 0;
    route("GET /api/temas/t1/imagens", () => {
      call += 1;
      return ok({
        ok: true,
        images: call === 1 ? many(1, THEME_PAGE_SIZE) : many(THEME_PAGE_SIZE + 1, 10),
        total: 312,
        truncated: false,
      });
    });

    renderTemas();
    await openFolder(/Terracotta/);

    expect(urlsFor("GET /api/temas/t1/imagens")).toEqual([
      `/api/temas/t1/imagens?offset=0&limit=${THEME_PAGE_SIZE}`,
    ]);
    expect(photos()).toHaveLength(THEME_PAGE_SIZE);
    // A contagem não mente: diz o que está à vista E o que existe.
    expect(screen.getByText(`${THEME_PAGE_SIZE} de 312 fotos`)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Mostrar mais/ }));
    });

    expect(urlsFor("GET /api/temas/t1/imagens")[1]).toBe(
      `/api/temas/t1/imagens?offset=${THEME_PAGE_SIZE}&limit=${THEME_PAGE_SIZE}`,
    );
    expect(photos()).toHaveLength(THEME_PAGE_SIZE + 10);
  });

  it("mostra a miniatura, e o original só quando não há miniatura", async () => {
    // As fotos anteriores às miniaturas continuam a funcionar — é o contrato.
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () =>
      ok({ ok: true, images: [photo(1, true), photo(2)], total: 2 }),
    );

    renderTemas();
    await openFolder(/Terracotta/);

    expect(photos()).toEqual([photo(1, true).thumbUrl, photo(2).url]);
  });

  it("a foto que está no ecrã não espera pelas que não estão", async () => {
    // O CASO DA BIBLIOTECA ANTIGA: 60 fotos sem miniatura, cada uma com o seu
    // original de ~2,6 MB. Pedidos todos ao mesmo tempo, o canal reparte-se
    // por 60 e NENHUMA aparece antes do fim (medido: 26 s até à primeira).
    // Só três de cada vez, pela ordem da grelha, põe a primeira no ecrã em ~1 s.
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () =>
      ok({ ok: true, images: many(1, THEME_PAGE_SIZE), total: THEME_PAGE_SIZE }),
    );

    renderTemas();
    fireEvent.click(await acharCartaoDoTema(/Terracotta/));
    await screen.findByRole("button", { name: "Adicionar fotos" });
    await act(async () => {});

    const started = () => imgs().filter((i) => i.getAttribute("src")).length;
    // As 60 células estão desenhadas; só três é que estão a descarregar.
    expect(imgs()).toHaveLength(THEME_PAGE_SIZE);
    expect(started()).toBe(3);
    // E são as PRIMEIRAS: a fila respeita a ordem por que ela olha.
    expect(photos().slice(0, 3)).toEqual([photo(1).url, photo(2).url, photo(3).url]);

    // Cada foto que acaba liberta a vez seguinte — e nunca há mais do que três.
    await act(async () => {
      fireEvent.load(imgs()[0]);
    });
    expect(started()).toBe(4);

    await settlePhotos();
    expect(started()).toBe(THEME_PAGE_SIZE);
  });

  it("com miniatura não há fila nenhuma — 25 KB não precisam de vez", async () => {
    // Medido: pôr um tecto às miniaturas PIORA (60 × 25 KB em ondas de 6 =
    // 1019 ms, contra 350 ms sem tecto). O que é caro é o byte, não o pedido.
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () =>
      ok({ ok: true, images: many(1, THEME_PAGE_SIZE, true), total: THEME_PAGE_SIZE }),
    );

    renderTemas();
    fireEvent.click(await acharCartaoDoTema(/Terracotta/));
    await screen.findByRole("button", { name: "Adicionar fotos" });
    await act(async () => {});

    expect(imgs().filter((i) => i.getAttribute("src"))).toHaveLength(THEME_PAGE_SIZE);
    // A primeira dobra não espera pelo `lazy`; o resto do rolo espera.
    expect(imgs()[0].getAttribute("loading")).toBe("eager");
    expect(imgs()[0].getAttribute("fetchpriority")).toBe("high");
    expect(imgs()[THEME_PAGE_SIZE - 1].getAttribute("loading")).toBe("lazy");
  });

  it("vai buscar a página seguinte antes de ela a pedir — e o botão não espera", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 312 }]));
    let call = 0;
    route("GET /api/temas/t1/imagens", () => {
      call += 1;
      return ok({
        ok: true,
        images: call === 1 ? many(1, THEME_PAGE_SIZE, true) : many(1000, THEME_PAGE_SIZE, true),
        total: 312,
        truncated: false,
      });
    });

    // O relógio é falso desde o princípio: a espera antes de ir buscar a
    // página seguinte é agendada quando a pasta abre, e um relógio ligado a
    // meio já não a apanhava.
    vi.useFakeTimers();
    try {
      renderTemas();
      await tick();
      fireEvent.click(cartaoDoTema(/Terracotta/));
      await tick();
      // A primeira página não leva companhia: pedir as duas ao mesmo tempo era
      // fazer exatamente o que este trabalho veio corrigir.
      expect(callsTo("GET /api/temas/t1/imagens")).toBe(1);

      await tick(2000);

      // A seguinte já está cá — pedida ao servidor uma vez, e uma só.
      expect(urlsFor("GET /api/temas/t1/imagens")[1]).toBe(
        `/api/temas/t1/imagens?offset=${THEME_PAGE_SIZE}&limit=${THEME_PAGE_SIZE}`,
      );
      expect(callsTo("GET /api/temas/t1/imagens")).toBe(2);

      fireEvent.click(screen.getByRole("button", { name: /Mostrar mais/ }));
      await tick();
      // O clique não fez pedido nenhum: as fotos já estavam em casa.
      expect(callsTo("GET /api/temas/t1/imagens")).toBe(2);
      expect(photos()).toHaveLength(THEME_PAGE_SIZE * 2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a página adiantada é deitada fora quando a grelha muda por baixo dela", async () => {
    // Uma foto que sobe entra à CABEÇA e empurra tudo um lugar: a página que
    // estava guardada para o offset 60 passaria a saltar uma foto. Só encaixa
    // quem foi pedido para o sítio onde a grelha está agora.
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 312 }]));
    let call = 0;
    route("GET /api/temas/t1/imagens", () => {
      call += 1;
      return ok({
        ok: true,
        images: call === 1 ? many(1, THEME_PAGE_SIZE, true) : many(1000, THEME_PAGE_SIZE, true),
        total: 312,
      });
    });
    route("POST /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(900, true)] }));

    vi.useFakeTimers();
    try {
      renderTemas();
      await tick();
      fireEvent.click(cartaoDoTema(/Terracotta/));
      await tick();
      await tick(2000);
      expect(callsTo("GET /api/temas/t1/imagens")).toBe(2); // a adiantada

      // Sobe uma foto: a grelha passa a ter 61 e a página guardada (offset 60)
      // deixou de servir.
      fireEvent.change(fileInput(), { target: { files: [jpg("nova.jpg")] } });
      await tick();
      await tick();
      await tick(2000);

      // Foi deitada fora e pedida outra, agora com o offset certo.
      const urls = urlsFor("GET /api/temas/t1/imagens");
      expect(urls[urls.length - 1]).toBe(
        `/api/temas/t1/imagens?offset=${THEME_PAGE_SIZE + 1}&limit=${THEME_PAGE_SIZE}`,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("o offset de 'Mostrar mais' acompanha as fotos que subiram entretanto", async () => {
    // A lista do servidor é por data decrescente: uma foto nova entra à
    // CABEÇA e empurra tudo o resto um lugar para trás. Com uma contagem de
    // páginas fixa, a página seguinte saltava exatamente essas fotos.
    route("GET /api/temas", () => ok([THEME]));
    let call = 0;
    route("GET /api/temas/t1/imagens", () => {
      call += 1;
      return ok({
        ok: true,
        images: call === 1 ? many(1, THEME_PAGE_SIZE) : many(900, 5),
        total: 500,
      });
    });
    route("POST /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(777)] }));

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(jpg("nova.jpg"));
    expect(photos()).toHaveLength(THEME_PAGE_SIZE + 1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Mostrar mais/ }));
    });

    expect(urlsFor("GET /api/temas/t1/imagens")[1]).toBe(
      `/api/temas/t1/imagens?offset=${THEME_PAGE_SIZE + 1}&limit=${THEME_PAGE_SIZE}`,
    );
  });

  it("uma pasta que não pôde ser lida não é uma pasta vazia", async () => {
    // "0 fotos" aqui leria-se como "as minhas 4000 fotos desapareceram" — e o
    // convite a arrastar fotos levaria a duplicar o que já lá está.
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 300 }]));
    route("GET /api/temas/t1/imagens", () => bad(502));

    renderTemas();
    await openFolder(/Terracotta/);

    expect(screen.getByText("Fotos indisponíveis")).toBeInTheDocument();
    expect(screen.getByText(/Não foi possível ler a pasta/)).toBeInTheDocument();
    expect(screen.queryByText(/Arrasta para aqui/)).not.toBeInTheDocument();
  });

  it("procura temas por nome e por nota, sem acentos nem maiúsculas", async () => {
    route("GET /api/temas", () =>
      ok([
        { ...THEME, id: "t1", name: "Terracotta", notes: "tons quentes" },
        { ...THEME, id: "t2", name: "Itália", notes: "limões" },
        { ...THEME, id: "t3", name: "Branco & Verde", notes: "" },
        { ...THEME, id: "t4", name: "Boho", notes: "" },
        { ...THEME, id: "t5", name: "Praia", notes: "areia e tons quentes" },
      ]),
    );

    renderTemas();
    const field = await screen.findByLabelText(/Procurar tema/);

    await act(async () => {
      fireEvent.change(field, { target: { value: "ITALIA" } });
    });
    expect(haCartaoDoTema(/Itália/)).toBe(true);
    expect(haCartaoDoTema(/Terracotta/)).toBe(false);

    // A nota é muitas vezes como o tema é lembrado.
    await act(async () => {
      fireEvent.change(field, { target: { value: "tons quentes" } });
    });
    expect(haCartaoDoTema(/Terracotta/)).toBe(true);
    expect(haCartaoDoTema(/Praia/)).toBe(true);
    expect(haCartaoDoTema(/Boho/)).toBe(false);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * JUNTAR DOIS TEMAS DUPLICADOS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «"Clássico Intemporal" aparece duas vezes com nomes quase
 * iguais — não tenho como os juntar».
 *
 * O ciclo está preso em `FundirTemas.test.tsx`; o que se prende AQUI é a
 * ligação: que a acção existe nos dois desenhos do cartão (o do rato e o do
 * dedo) e que o que o servidor responde chega à lista sem recarregar a página.
 */
describe("Biblioteca de Temas — juntar temas duplicados", () => {
  const dois = () =>
    route("GET /api/temas", () =>
      ok([
        { ...THEME, id: "t1", name: "Clássico Intemporal", imageCount: 3 },
        { ...THEME, id: "t2", name: "Zen", imageCount: 12 },
      ]),
    );

  /**
   * O comentário do `accoesDoTema` promete que os dois desenhos do cartão
   * mostram a MESMA lista. Enquanto os ícones do rato eram escritos à mão, a
   * promessa era só um comentário — e partiu-se na primeira acção nova.
   */
  /**
   * ── UM DESENHO SÓ, E O BOTÃO DIREITO A DIZER O MESMO ───────────────────
   *
   * Isto media a igualdade entre DOIS desenhos do cartão — chips soltos com
   * rato, «⋯» sem rato. Deixou de haver dois: o ponto 9 da auditoria do
   * `docs/APPLE-TEMAS.md` manda «UM botão discreto ⋯… que abre o mesmo menu do
   * botão direito», e a Parte 9 proíbe mais de um botão flutuante sobre uma
   * miniatura.
   *
   * O que se guarda agora é a igualdade que ficou, e é a que o documento
   * exige: o menu do «⋯» e o menu do botão direito são a MESMA lista.
   */
  it("o «⋯» e o botão direito abrem a mesma lista", async () => {
    dois();
    renderTemas();
    const cartao = await acharCartaoDoTema(/Clássico Intemporal/);

    fireEvent.click(screen.getAllByRole("button", { name: /Acções de Clássico Intemporal/ })[0]);
    const doBotao = screen.getAllByRole("menuitem").map((m) => m.textContent);
    expect(doBotao).toContain("Juntar a outro tema…");
    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.contextMenu(cartao, { clientX: 40, clientY: 40 });
    const doDireito = screen.getAllByRole("menuitem").map((m) => m.textContent);
    expect(doDireito).toEqual(doBotao);
  });

  /** «Ações destrutivas no fim, a vermelho, com confirmação nomeada.» */
  it("«Eliminar tema…» é o último item e pergunta pelo nome", async () => {
    dois();
    renderTemas();
    await acharCartaoDoTema(/Clássico Intemporal/);
    fireEvent.click(screen.getAllByRole("button", { name: /Acções de Clássico Intemporal/ })[0]);
    const itens = screen.getAllByRole("menuitem").map((m) => m.textContent);
    expect(itens[itens.length - 1]).toBe("Eliminar tema…");

    fireEvent.click(screen.getByRole("menuitem", { name: "Eliminar tema…" }));
    expect(await screen.findByText(/Eliminar o tema «Clássico Intemporal»/)).toBeTruthy();
  });

  /**
   * ── O PAR APONTADO, EM VEZ DE PROCURADO ────────────────────────────────
   *
   * Sem isto, juntar duplicados exigia dar por eles: dois cartões com o mesmo
   * nome escrito de duas maneiras, numa grelha de 25. O critério está preso em
   * `temas-parecidos.test.ts`; aqui prende-se que ele CHEGA ao cartão e que
   * leva a algum lado.
   */
  it("aponta o par e abre a fusão a partir dele", async () => {
    route("GET /api/temas", () =>
      ok([
        { ...THEME, id: "t1", name: "Branco e Verde", imageCount: 3 },
        { ...THEME, id: "t2", name: "Verde & Branco", imageCount: 12 },
      ]),
    );
    renderTemas();
    // Pelo próprio aviso e não pelo cartão: o nome «Branco e Verde» passa a
    // identificar dois botões — o cartão dele e o aviso do OUTRO cartão, que o
    // cita. É o preço de o aviso dizer qual é o par, e vale a pena.
    const aviso = await screen.findByText("Lê-se como “Verde & Branco”");
    fireEvent.click(aviso);
    // E abre já com este tema como origem.
    expect(await screen.findByText(/Juntar “Branco e Verde” a/)).toBeTruthy();
  });

  it("um tema sem par não diz nada", async () => {
    route("GET /api/temas", () =>
      ok([
        { ...THEME, id: "t1", name: "Branco", imageCount: 3 },
        { ...THEME, id: "t2", name: "Branco & Verde", imageCount: 12 },
      ]),
    );
    renderTemas();
    await acharCartaoDoTema(/Branco & Verde/);
    expect(screen.queryByText(/Lê-se como/)).toBeNull();
  });

  it("a origem sai da lista e o destino soma as fotos", async () => {
    dois();
    renderTemas();
    await acharCartaoDoTema(/Clássico Intemporal/);
    fireEvent.click(accaoNoMenuDoTema(/Clássico Intemporal/, "Juntar a outro tema…"));

    route("POST /api/temas/t1/fundir", () =>
      ok({
        ok: true,
        moved: 3,
        existing: 0,
        failed: 0,
        thumbsMissing: 0,
        nextOffset: 0,
        done: true,
        leftBehind: 0,
        archived: true,
      }),
    );
    fireEvent.click(await screen.findByRole("radio", { name: /Zen/ }));
    fireEvent.click(screen.getByRole("button", { name: "Juntar os temas" }));
    // Sem `tick`: este bloco corre com o relógio a sério (os relógios falsos
    // são de outros `describe`), e o que se espera é só que as promessas do
    // `fetch` assentem.
    await act(async () => {});
    await act(async () => {});

    // Arquivado sai da vista principal; o destino passa a 15.
    expect(haCartaoDoTema(/Clássico Intemporal/)).toBe(false);
    expect(screen.getByText(/15 fotos/)).toBeTruthy();
  });

  /**
   * A RAZÃO DE O TEMA NÃO TER DESAPARECIDO.
   *
   * Uma foto que já está no destino fica na origem, e por isso a origem não é
   * arquivada. Sem o dizer, ela vê o tema na lista e conclui que falhou.
   */
  it("diz porque é que a origem ficou, quando ficou", async () => {
    dois();
    renderTemas();
    await acharCartaoDoTema(/Clássico Intemporal/);
    fireEvent.click(accaoNoMenuDoTema(/Clássico Intemporal/, "Juntar a outro tema…"));

    route("POST /api/temas/t1/fundir", () =>
      ok({
        ok: true,
        moved: 1,
        existing: 2,
        failed: 0,
        thumbsMissing: 0,
        nextOffset: 2,
        done: true,
        leftBehind: 2,
        archived: false,
      }),
    );
    fireEvent.click(await screen.findByRole("radio", { name: /Zen/ }));
    fireEvent.click(screen.getByRole("button", { name: "Juntar os temas" }));
    // Sem `tick`: este bloco corre com o relógio a sério (os relógios falsos
    // são de outros `describe`), e o que se espera é só que as promessas do
    // `fetch` assentem.
    await act(async () => {});
    await act(async () => {});

    expect(haCartaoDoTema(/Clássico Intemporal/)).toBe(true);
    expect(screen.getByText(/2 fotos já estavam em/)).toBeTruthy();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «USADO EM 7 PROPOSTAS»
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A contagem está presa em `temas-uso.test.ts`. Aqui prende-se o que o ecrã
 * promete: que o número chega DEPOIS dos cartões (e por isso não os atrasa) e
 * que a sua ausência não estraga nada.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS ÂMBITOS — FASE 04 DO `docs/APPLE-TEMAS.md`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «"por usar" é metadado sem filtro»: a informação mais accionável da grelha
 * estava escrita em cada cartão e não havia maneira de reduzir a lista por
 * ela. A aritmética está presa em `lib/temas-filtros.test.ts`; aqui prende-se
 * que ela CHEGA à barra e que carregar num âmbito muda a grelha.
 */
describe("Biblioteca de Temas — os âmbitos", () => {
  const biblioteca = () =>
    route("GET /api/temas", () =>
      ok([
        { ...THEME, id: "t1", name: "Terracotta", imageCount: 9 },
        { ...THEME, id: "t2", name: "Boho", imageCount: 4 },
        { ...THEME, id: "t3", name: "Itália", imageCount: 6, favorito: true },
        { ...THEME, id: "t4", name: "Antigo", imageCount: 2, arquivado: true },
        // O quinto é o que faz a barra ganhar campo de procurar
        // (`themes.length > 4`), e um dos testes precisa dele.
        { ...THEME, id: "t5", name: "Praia", imageCount: 3 },
      ]),
    );

  /** Espera pelos cartões e pela contagem de propostas, que vem a seguir. */
  async function comUso(usos: Record<string, number>) {
    biblioteca();
    route("GET /api/temas/uso", () => ok({ ok: true, usos }));
    renderTemas();
    await acharCartaoDoTema(/Terracotta/);
    await act(async () => {});
  }

  it("filtrar por «Por usar» deixa os temas com zero propostas", async () => {
    await comUso({ t1: 7 });
    fireEvent.click(screen.getByRole("button", { name: /Por usar/ }));

    expect(haCartaoDoTema(/Terracotta/)).toBe(false);
    expect(haCartaoDoTema(/Boho/)).toBe(true);
    // O arquivado não volta pela porta do filtro: o arquivo é uma vista.
    expect(haCartaoDoTema(/Antigo/)).toBe(false);
  });

  it("o estado da vista acompanha o âmbito escolhido", async () => {
    await comUso({ t1: 7 });
    const estado = screen.getByRole("status", { name: "Temas à vista" });
    expect(estado.textContent).toBe("4 temas · 22 fotografias");

    fireEvent.click(screen.getByRole("button", { name: /Favoritos/ }));
    expect(estado.textContent).toBe("1 tema · 6 fotografias");
  });

  it("«Arquivados» é um âmbito, e mostra só o que está arquivado", async () => {
    await comUso({ t1: 7 });
    fireEvent.click(screen.getByRole("button", { name: /Arquivados/ }));
    expect(haCartaoDoTema(/Antigo/)).toBe(true);
    expect(haCartaoDoTema(/Terracotta/)).toBe(false);
  });

  /** Um âmbito sem nada lá dentro seria um controlo a explicar uma
   *  funcionalidade que ninguém ainda usou. */
  it("não oferece «Por usar» enquanto a contagem de propostas não chegar", async () => {
    biblioteca();
    route("GET /api/temas/uso", () => ({ ok: false, status: 500, json: async () => ({}) }));
    renderTemas();
    await acharCartaoDoTema(/Terracotta/);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: /Por usar/ })).toBeNull();
    // E os outros continuam lá.
    expect(screen.getByRole("button", { name: /Favoritos/ })).toBeTruthy();
  });

  /** «Usados este ano» precisa de saber QUANDO um tema saiu, e o
   *  `/api/temas/uso` só devolve QUANTAS vezes. Enquanto não mandar a data, o
   *  âmbito não aparece — em vez de aparecer e devolver a lista toda. */
  it("«Usados este ano» não se oferece enquanto o servidor não mandar o ano", async () => {
    await comUso({ t1: 7 });
    expect(screen.queryByRole("button", { name: /Usados este ano/ })).toBeNull();
  });

  /** «Filtro sem resultados é uma mensagem DIFERENTE de biblioteca vazia.» */
  it("um âmbito vazio depois de uma procura tem saída", async () => {
    await comUso({ t1: 7, t2: 1, t3: 2 });
    fireEvent.click(screen.getByRole("button", { name: /Favoritos/ }));
    fireEvent.change(screen.getByLabelText(/Procurar tema/), { target: { value: "zzz" } });
    await act(async () => {});

    expect(screen.getByText(/Nenhum tema corresponde a “zzz”/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(haCartaoDoTema(/Terracotta/)).toBe(true);
  });

  /** Desarquivar o último arquivado esvazia o âmbito por baixo dos pés. */
  it("um âmbito que desaparece devolve a vista a «Todos»", async () => {
    await comUso({ t1: 7 });
    fireEvent.click(screen.getByRole("button", { name: /Arquivados/ }));
    expect(haCartaoDoTema(/Antigo/)).toBe(true);

    route("PATCH /api/temas/t4", () => ok({ ok: true }));
    fireEvent.click(accaoNoMenuDoTema(/Antigo/, "Repor na lista"));
    await act(async () => {});

    // Sem nada arquivado o âmbito sai da barra — e a vista não fica presa nele.
    expect(screen.queryByRole("button", { name: /Arquivados/ })).toBeNull();
    expect(haCartaoDoTema(/Terracotta/)).toBe(true);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CARTÃO E OS MENUS — FASES 02 E 03
 * ════════════════════════════════════════════════════════════════════════════
 */
describe("Biblioteca de Temas — um botão sobre a fotografia", () => {
  const um = () =>
    route("GET /api/temas", () => ok([{ ...THEME, id: "t1", name: "Terracotta", imageCount: 9 }]));

  /** «Mais de um botão flutuante sobre uma miniatura» é proibido pela Parte 9. */
  it("há um só botão por cima da capa, e é o «⋯»", async () => {
    um();
    renderTemas();
    const grupo = await screen.findByRole("group", { name: "Terracotta" });
    const flutuantes = within(grupo)
      .getAllByRole("button")
      .filter((b) => b.closest('[class*="absolute"]') !== null);
    expect(flutuantes).toHaveLength(1);
    expect(flutuantes[0].getAttribute("aria-haspopup")).toBe("menu");
  });

  /**
   * B3. «`⋯` só aparece no hover ou quando o cartão tem foco de teclado —
   * senão é inacessível por teclado» (Parte 3). O Tab pousa primeiro no botão
   * do CARTÃO, que é irmão do «⋯» e não pai; com `focus-within` na caixa do
   * «⋯» e `focus-visible` no gatilho, nenhum dos dois acendia com o cartão
   * focado. O jsdom não avalia media queries nem `:focus-within`, portanto o
   * que se prende é o contrato das classes, inteiras (um `toContain` na cadeia
   * apanhava «com-rato:focus-within» dentro de «group-focus-within»).
   */
  it("o «⋯» volta com o foco no CARTÃO, e não só com o foco nele", async () => {
    um();
    renderTemas();
    const grupo = await screen.findByRole("group", { name: "Terracotta" });
    expect(grupo.className.split(/\s+/)).toContain("group");
    const gatilho = within(grupo).getByRole("button", { name: "Acções de Terracotta" });
    const classes = gatilho.className.split(/\s+/);
    expect(classes).toContain("com-rato:opacity-0");
    expect(classes).toContain("com-rato:group-focus-within:opacity-100");
    // O vidro vive DENTRO do gatilho desde a Fase 02 (a `pastilha`), e por
    // isso esconde-se e volta com o mesmo `opacity` — já não há uma caixa de
    // fora a repetir as variantes à mão.
    expect(gatilho.querySelector(".bo-vidro-claro")).not.toBeNull();
  });

  /**
   * Fase 02: «botão glass, 28px» e «28 px visuais e 40 px de alvo» (Partes 3 e
   * 7). Era o «⋯» de linha, 44 × 44, com o vidro a toda a volta.
   */
  it("o «⋯» sobre a capa tem 28 px à vista e 40 px de alvo", async () => {
    um();
    renderTemas();
    const grupo = await screen.findByRole("group", { name: "Terracotta" });
    const gatilho = within(grupo).getByRole("button", { name: "Acções de Terracotta" });
    const alvo = gatilho.className.split(/\s+/);
    expect(alvo).toEqual(expect.arrayContaining(["h-10", "w-10", "alvo-toque"]));
    expect(alvo).not.toContain("h-11");
    const pastilha = gatilho.querySelector(".bo-vidro-claro")!;
    expect(pastilha.className.split(/\s+/)).toEqual(expect.arrayContaining(["h-7", "w-7"]));
  });

  /** A estrela era um chip aceso sobre a fotografia; a informação não se
   *  perdeu, mudou de sítio — para o rasto de números, com nome escrito. */
  it("um tema favorito di-lo na linha dos números, e não por cima da capa", async () => {
    route("GET /api/temas", () =>
      ok([{ ...THEME, id: "t1", name: "Terracotta", imageCount: 9, favorito: true }]),
    );
    renderTemas();
    const grupo = await screen.findByRole("group", { name: "Terracotta" });
    // «Favorito», a palavra do menu e do filtro (era «Fixado no topo»).
    expect(within(grupo).getByText("Favorito")).toBeTruthy();
  });

  /**
   * ── NUNCA UM CARTÃO VAZIO (T1) ──────────────────────────────────────────
   *
   * Um tema com fotos e sem capa assinada (o Storage estourou o tempo da
   * lista) mostrava o ícone de pasta, que diz «vazio». Passa a mostrar o lugar
   * com a cor da capa; o ícone fica só para a pasta vazia de verdade.
   */
  it("um tema com fotos e sem capa mostra a cor dela, não o ícone de pasta", async () => {
    route("GET /api/temas", () =>
      ok([
        { ...THEME, id: "t1", name: "Terracotta", imageCount: 9, coverCor: "#a07850" },
        { ...THEME, id: "t2", name: "Itália", imageCount: 0 },
      ]),
    );
    renderTemas();
    const cheio = await acharCartaoDoTema(/Terracotta/);
    expect(cheio.querySelector('[data-cor="#a07850"]')).not.toBeNull();
    expect(cheio.querySelector("[data-pasta-vazia]")).toBeNull();
    // A pasta vazia continua a dizer que está vazia.
    expect(cartaoDoTema(/Itália/).querySelector("[data-pasta-vazia]")).not.toBeNull();
  });

  it("a cor fica por baixo da capa e, com as duas fontes partidas, fica só ela", async () => {
    route("GET /api/temas", () =>
      ok([
        {
          ...THEME,
          imageCount: 9,
          coverUrl: "https://cdn.test/thumb-404.webp",
          coverFallbackUrl: "https://cdn.test/original-404.jpg",
          coverCor: "#a07850",
        },
      ]),
    );
    renderTemas();
    const cartao = await acharCartaoDoTema(/Terracotta/);
    expect(cartao.querySelector('[data-cor="#a07850"]')).not.toBeNull();
    fireEvent.error(cartao.querySelector("img")!);
    fireEvent.error(cartao.querySelector("img")!);
    // Nenhum `<img>` partido no cartão — e o lugar pintado continua lá.
    expect(cartao.querySelector("img")).toBeNull();
    expect(cartao.querySelector('[data-cor="#a07850"]')).not.toBeNull();
    expect(cartao.querySelector("[data-pasta-vazia]")).toBeNull();
  });

  /** «Datas relativas sem data absoluta em tooltip» é proibido pela Parte 9. */
  it("a data relativa leva a data inteira no `title`", async () => {
    const ontem = new Date(Date.now() - 86_400_000).toISOString();
    route("GET /api/temas", () =>
      ok([{ ...THEME, id: "t1", name: "Terracotta", imageCount: 9, updatedAt: ontem }]),
    );
    renderTemas();
    await acharCartaoDoTema(/Terracotta/);
    const relativa = screen.getByText(/ontem/);
    expect(relativa.getAttribute("title")).toMatch(/\d{4}/);
  });

  /** O botão direito é obrigatório numa coleção, e no vazio da grelha oferece
   *  «Novo tema». */
  it("o botão direito no vazio da grelha oferece «Novo tema»", async () => {
    um();
    renderTemas();
    const grupo = await screen.findByRole("group", { name: "Terracotta" });
    const grelha = grupo.parentElement!;
    fireEvent.contextMenu(grelha, { clientX: 10, clientY: 10 });
    expect(screen.getByRole("menuitem", { name: "Novo tema" })).toBeTruthy();
  });

  /** Carregar com o botão direito EM CIMA de um cartão é a pergunta do tema, e
   *  não a da grelha: um menu, e não dois. */
  it("o botão direito num cartão não abre também o menu da grelha", async () => {
    um();
    renderTemas();
    const grupo = await screen.findByRole("group", { name: "Terracotta" });
    fireEvent.contextMenu(grupo, { clientX: 10, clientY: 10 });
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(screen.queryByRole("menuitem", { name: "Novo tema" })).toBeNull();
  });
});

describe("Biblioteca de Temas — em quantas propostas saiu", () => {
  it("o número entra depois, e diz quando um tema nunca saiu", async () => {
    route("GET /api/temas", () =>
      ok([
        { ...THEME, id: "t1", name: "Terracotta", imageCount: 9 },
        { ...THEME, id: "t2", name: "Boho", imageCount: 9 },
      ]),
    );
    route("GET /api/temas/uso", () => ok({ ok: true, usos: { t1: 7 } }));
    renderTemas();
    await acharCartaoDoTema(/Terracotta/);
    await act(async () => {});
    // No mesmo rasto da contagem de fotos, e não numa linha só para ele: seis
    // linhas de texto debaixo de uma fotografia não se leem (ver a Fase 2).
    expect(screen.getByText(/9 fotos · 7 propostas/)).toBeTruthy();
    // «Por usar» é a metade mais útil: distingue um tema que a biblioteca TEM
    // de um tema que o estúdio USA.
    expect(screen.getByText(/9 fotos · Nunca usado/)).toBeTruthy();
  });

  it("uma proposta só não se diz no plural", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, id: "t1", imageCount: 9 }]));
    route("GET /api/temas/uso", () => ok({ ok: true, usos: { t1: 1 } }));
    renderTemas();
    await acharCartaoDoTema(/Terracotta/);
    await act(async () => {});
    expect(screen.getByText(/· 1 proposta\b/)).toBeTruthy();
  });

  /** É um número decorativo: sem ele o cartão fica exactamente como estava. */
  it("sem resposta, o cartão não fica a dizer nada de errado", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, id: "t1", imageCount: 9 }]));
    route("GET /api/temas/uso", () => bad(500));
    renderTemas();
    await acharCartaoDoTema(/Terracotta/);
    await act(async () => {});
    // Dentro do CARTÃO, e não na página: a frase de introdução também fala em
    // propostas, e uma busca solta encontrava-a.
    const cartao = cartaoDoTema(/Terracotta/);
    expect(cartao.textContent).toMatch(/9 fotos/);
    expect(cartao.textContent).not.toMatch(/proposta/);
    expect(cartao.textContent).not.toMatch(/Nunca usado/);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CARTÃO DE UM TEMA — FASE 2
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «os títulos longos são cortados» e «os metadados pesam mais
 * do que a imagem».
 *
 * Pesavam mesmo: o cartão chegou a ter seis linhas de texto debaixo de uma
 * fotografia — nome, contagem, data, uso, aviso de poucas fotos, nota — num
 * cartão de 165 px. Nenhuma era falsa; juntas, nenhuma se lia.
 */
describe("Biblioteca de Temas — o cartão", () => {
  const LONGO = "Clássico Intemporal Branco e Dourado com Velas Altas";

  /**
   * O nome é a ÚNICA coisa por que ela procura um tema. Cortá-lo à primeira
   * linha tornava dois temas parecidos indistinguíveis exactamente no sítio
   * onde é preciso distingui-los.
   */
  it("o nome tem duas linhas, e não uma cortada", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, id: "t1", name: LONGO, imageCount: 9 }]));
    renderTemas();
    const titulo = await screen.findByText(LONGO);
    expect(titulo.className, "`truncate` corta à primeira linha").not.toMatch(/\btruncate\b/);
    expect(titulo.className).toMatch(/line-clamp-2/);
    // A altura das duas linhas fica reservada mesmo com um nome curto, senão a
    // grelha perdia a linha de base entre cartões vizinhos.
    expect(titulo.className).toMatch(/min-h-/);
  });

  /**
   * Fase 02, ponto 11: «cartões delimitados por borda em vez de sombra», e a
   * Parte 9 proíbe «borda a marcar elevação». A sombra é a de repouso da casa
   * e ergue-se sob o rato; nunca `scale` no hover.
   */
  it("o cartão eleva-se por sombra, e não por borda", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, id: "t1", name: "Terracotta", imageCount: 9 }]));
    renderTemas();
    const botao = await acharCartaoDoTema(/Terracotta/);
    const classes = botao.className.split(/\s+/);
    expect(classes).toContain("shadow-[var(--bo-sombra-repouso)]");
    expect(classes).toContain("hover:shadow-[var(--bo-sombra-erguida)]");
    expect(classes.filter((c) => /^(?:hover:)?border(?:-|$)/.test(c))).toEqual([]);
    expect(classes.filter((c) => /scale/.test(c) && c.startsWith("hover:"))).toEqual([]);
  });

  /**
   * «Raio 12 px» (Parte 3, `ThemeCard`), e a decisão dela: «sim à sombra,
   * cantos a 12». O cartão tem UM raio, o do token — e o token tem os 12.
   */
  it("o cartão tem os cantos a 12, pelo token do mosaico", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, id: "t1", name: "Terracotta", imageCount: 9 }]));
    renderTemas();
    const botao = await acharCartaoDoTema(/Terracotta/);
    const raios = botao.className.split(/\s+/).filter((c) => /^rounded(?:-|$)/.test(c));
    expect(raios).toEqual(["rounded-tile"]);
    const tema = readFileSync(join(process.cwd(), "src/app/tema.css"), "utf8");
    expect(tema).toMatch(/--radius-tile:\s*12px;/);
  });

  /**
   * «headline/600, line-clamp 2, altura reservada» e «caption, --fg-tertiary,
   * tabular-nums» (Parte 3). Eram `text-[14px]` e o cinzento de apoio.
   */
  it("o nome usa o tipo da casa, e os números alinham", async () => {
    route("GET /api/temas", () =>
      ok([{ ...THEME, id: "t1", name: "Terracotta", imageCount: 9, updatedAt: T0 }]),
    );
    renderTemas();
    const titulo = await screen.findByText("Terracotta", { selector: "p" });
    const t = titulo.className.split(/\s+/);
    expect(t).toContain("text-headline");
    expect(
      t.filter((c) => /^text-\[\d/.test(c)),
      "tamanho escrito à mão",
    ).toEqual([]);
    // Duas entrelinhas do `text-headline` (1,375rem) = 2,75rem = `min-h-11`.
    expect(t).toContain("min-h-11");
    const rasto = screen.getByText(/9 fotos/).closest("p")!;
    const r = rasto.className.split(/\s+/);
    expect(r).toEqual(
      expect.arrayContaining(["tabular-nums", "text-caption", "text-[var(--bo-texto-terciario)]"]),
    );
  });

  it("os números vão todos no mesmo rasto", async () => {
    route("GET /api/temas", () =>
      ok([{ ...THEME, id: "t1", name: "Terracotta", imageCount: 9, updatedAt: T0 }]),
    );
    route("GET /api/temas/uso", () => ok({ ok: true, usos: { t1: 4 } }));
    renderTemas();
    await acharCartaoDoTema(/Terracotta/);
    await act(async () => {});
    // Duas linhas FIXAS (9/11): fotos e uso na primeira, a data sozinha na
    // segunda. O rasto único partia onde calhava — «há 6 / dias» num cartão,
    // «· / 09/10/2026» no vizinho — e a fila desalinhava. A data tem a linha
    // dela inteira, por isso não se corta a meio.
    const primeira = screen.getByText(/9 fotos · 4 propostas/);
    expect(primeira.textContent).not.toMatch(/há|\d{2}\/\d{2}/);
    const linhas = [...primeira.closest("p")!.children];
    expect(linhas).toHaveLength(2);
    for (const l of linhas) expect(l.className).toMatch(/\bblock\b/);
  });

  it("o cartão enche a célula da grelha, para a fila ter uma altura só", async () => {
    route("GET /api/temas", () =>
      ok([{ ...THEME, id: "t1", name: "Terracotta", imageCount: 9, updatedAt: T0 }]),
    );
    renderTemas();
    await acharCartaoDoTema(/Terracotta/);
    const rasto = screen.getByText(/9 fotos/);
    const cartao = rasto.closest("button")!;
    expect(cartao.className, "sem `h-full`, um rasto de duas linhas desalinha a fila").toMatch(
      /\bh-full\b/,
    );
  });

  /**
   * DUAS RESSALVAS APAGADAS EMPILHADAS LEEM-SE COMO NENHUMA.
   *
   * O par quase igual tem remédio a um toque; o «poucas fotos» é uma nota de
   * curadoria. Quando as duas se aplicam, ganha a que pede acção.
   */
  it("mostra uma ressalva de cada vez, e a accionável primeiro", async () => {
    route("GET /api/temas", () =>
      ok([
        { ...THEME, id: "t1", name: "Itália", imageCount: 1, notes: "limões" },
        { ...THEME, id: "t2", name: "italia", imageCount: 9 },
      ]),
    );
    renderTemas();
    // O par está apontado…
    expect(await screen.findByText("Lê-se como “italia”")).toBeTruthy();
    // …e o «poucas fotos» do mesmo cartão cala-se, apesar de a condição valer.
    expect(screen.queryByText(/Ainda com poucas fotos/)).toBeNull();
    // A nota também: é a menos urgente das três.
    expect(screen.queryByText("limões")).toBeNull();
  });

  it("sem par, o aviso de poucas fotos aparece — e a nota cala-se", async () => {
    route("GET /api/temas", () =>
      ok([{ ...THEME, id: "t1", name: "Itália", imageCount: 1, notes: "limões" }]),
    );
    renderTemas();
    expect(await screen.findByText(/Ainda com poucas fotos/)).toBeTruthy();
    expect(screen.queryByText("limões")).toBeNull();
  });

  it("sem par e com fotos que cheguem, sobra a nota", async () => {
    route("GET /api/temas", () =>
      ok([{ ...THEME, id: "t1", name: "Itália", imageCount: 40, notes: "limões" }]),
    );
    renderTemas();
    expect(await screen.findByText("limões")).toBeTruthy();
    expect(screen.queryByText(/Ainda com poucas fotos/)).toBeNull();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A BARRA DE CONTROLOS — FASE 3
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «os controlos estão todos alinhados sem agrupamento», «"395
 * fotos em 25 temas" está órfão» e «mais folga entre os cartões».
 */
describe("Biblioteca de Temas — a barra de controlos", () => {
  const cinco = () =>
    route("GET /api/temas", () =>
      ok(
        ["Terracotta", "Itália", "Boho", "Praia", "Verde"].map((name, i) => ({
          ...THEME,
          id: `t${i + 1}`,
          name,
          imageCount: 9,
        })),
      ),
    );

  /**
   * O resumo vivia dentro da caixa que ancora o ícone da lupa — herdava a
   * largura do campo e lia-se como se descrevesse o que lá estava escrito.
   * Continua irmão do campo; o que mudou é o que ele conta.
   */
  it("o estado da vista não é filho do campo de procura", async () => {
    cinco();
    renderTemas();
    const estado = await screen.findByRole("status", { name: "Temas à vista" });
    expect(
      estado.closest(".relative"),
      "a caixa `relative` existe só para pôr a lupa em cima do campo",
    ).toBeNull();
    // E o campo continua lá, ao lado.
    expect(screen.getByLabelText(/Procurar tema/)).toBeTruthy();
  });

  /**
   * ── A CONTAGEM MUDA AO FILTRAR ─────────────────────────────────────────
   *
   * Ponto 4 da auditoria do `docs/APPLE-TEMAS.md`: «"567 fotos em 28 temas"
   * está solta por baixo do campo de pesquisa… passa a ESTADO DA VISTA, e
   * muda ao filtrar: `28 temas · 567 fotos` → `4 temas · 61 fotos`».
   *
   * É a diferença entre uma legenda e um estado: depois de carregar num
   * filtro, o que interessa saber é o que sobrou.
   */
  it("o estado da vista conta o que está à vista, e muda com a procura", async () => {
    cinco();
    renderTemas();
    const estado = await screen.findByRole("status", { name: "Temas à vista" });
    expect(estado.textContent).toBe("5 temas · 45 fotografias");

    fireEvent.change(screen.getByLabelText(/Procurar tema/), { target: { value: "Terracotta" } });
    await act(async () => {});
    expect(estado.textContent).toBe("1 tema · 9 fotografias");
  });

  /**
   * Espaçamento igual quer dizer «cinco coisas sem relação», e não era
   * verdade: umas mudam como a lista se vê, outra o que ela contém, duas
   * fazem alguma coisa.
   */
  /**
   * ── «REVER ETIQUETAS» SAIU DE ENTRE OS BOTÕES ──────────────────────────
   *
   * Era um link de texto entre botões de barra — a última linha das
   * proibições da Parte 9 do `docs/APPLE-TEMAS.md`, e o ponto 6 da auditoria:
   * «uma ação de manutenção rara, com o mesmo peso visual dos controlos de
   * vista». Passa para dentro do «⋯», ao lado de «Novo tema».
   */
  it("«Rever etiquetas» vive no «⋯», e não entre os botões", async () => {
    cinco();
    renderTemas();
    const novo = await screen.findByRole("button", { name: /Novo tema/ });
    const grupo = novo.parentElement!;
    expect(grupo.textContent).not.toMatch(/Rever etiquetas/);
    // O que muda a VISTA não está no mesmo grupo do que FAZ.
    expect(grupo.textContent).not.toMatch(/Compacto/);
    expect(grupo.querySelector("select")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Acções de Biblioteca de Temas/ }));
    expect(screen.getByRole("menuitem", { name: "Rever etiquetas…" })).toBeTruthy();
  });

  /**
   * ── FASE 01: O CAMPO DIZ O QUE PROCURA, A 10 px, E A FILA TEM UMA ALTURA ──
   *
   * «Procurar temas» e não «… e fotografias»: a procura só lê o nome e a nota
   * (o teste de cima acha por nome; o dos âmbitos, por nota). Uma fotografia
   * não tem texto por onde se ache.
   */
  it("o campo diz «Procurar temas» e não promete o que não procura", async () => {
    cinco();
    renderTemas();
    const campo = await screen.findByLabelText(/Procurar tema/);
    expect(campo.getAttribute("placeholder")).toBe("Procurar temas");
  });

  /**
   * Ponto 5 da auditoria: «campo de pesquisa a 10 px, como tudo o resto. E
   * alinhado na mesma linha e na mesma baseline dos outros controlos.» Pelas
   * classes davam 42, 34–38, 34, 36 e 32 px. O jsdom não tem caixas, portanto
   * prende-se o contrato das classes: o degrau `h-10` em todos (o `md` do
   * `ui/Button`) e o raio do token do controlo nos dois que usam o `.bo-input`.
   */
  it("os controlos da barra partilham uma altura, e o campo o raio do controlo", async () => {
    cinco();
    renderTemas();
    const campo = await screen.findByLabelText(/Procurar tema/);
    const ordenar = screen.getByRole("combobox", { name: "Ordenar os temas" });
    const reticencias = screen.getByRole("button", { name: /Acções de Biblioteca de Temas/ });
    const novo = screen.getByRole("button", { name: /Novo tema/ });
    const tamanhos = screen.getByRole("group", { name: /Tamanho dos cartões/ });

    for (const [nome, no] of [
      ["campo", campo],
      ["ordenação", ordenar],
      ["«⋯»", reticencias],
      ["«Novo tema»", novo],
    ] as const) {
      expect(no.className.split(/\s+/), `${nome} fora dos 40 px da fila`).toContain("h-10");
    }
    expect(tamanhos.className.split(/\s+/)).toContain("min-h-10");
    for (const no of [campo, ordenar]) {
      expect(no.className.split(/\s+/)).toContain("[--bo-radius:var(--radius-control)]");
    }
    // E o token existe mesmo, com os 10 px que o documento pede.
    const tema = readFileSync(join(process.cwd(), "src/app/tema.css"), "utf8");
    expect(tema).toMatch(/--radius-control:\s*10px;/);
  });

  /**
   * Parte 6: «Fotos de inspiração por tema, prontas para as propostas» →
   * «(fora — a secção chama-se Temas)». O subtítulo vive no `AdminClient`,
   * que este ficheiro não monta; lê-se o mapa onde ele está escrito.
   */
  it("a secção não tem subtítulo por cima do título", () => {
    const fonte = readFileSync(
      join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin/AdminClient.tsx"),
      "utf8",
    );
    const inicio = fonte.indexOf("const VIEW_SUB");
    expect(inicio, "o mapa dos subtítulos mudou de nome").toBeGreaterThan(-1);
    const mapa = fonte.slice(inicio, fonte.indexOf("};", inicio));
    expect(mapa).toMatch(/^\s*temas: "",$/m);
  });

  it("a ordenação e o tamanho dos cartões ficam no mesmo grupo", async () => {
    cinco();
    renderTemas();
    await screen.findByRole("button", { name: /Novo tema/ });
    const tamanhos = screen.getByRole("group", { name: /Tamanho dos cartões/ });
    expect(tamanhos.parentElement!.querySelector("select")).not.toBeNull();
  });

  /**
   * A FOLGA NÃO É QUADRADA, E ISSO É A CORRECÇÃO.
   *
   * Desde que um cartão pode ter uma linha pendurada por baixo («Lê-se
   * como…»), uma folga igual nos dois sentidos punha essa linha à mesma
   * distância do cartão a que pertence e do cartão de baixo.
   */
  it("a folga vertical é maior do que a horizontal", () => {
    for (const classes of Object.values(COLUNAS)) {
      const x = Number(/gap-x-(\d+)/.exec(classes)![1]);
      const y = Number(/gap-y-(\d+)/.exec(classes)![1]);
      expect(y, `folga vertical curta em "${classes}"`).toBeGreaterThan(x);
    }
  });
});

describe("Biblioteca de Temas — as fotos aparecem enquanto sobem", () => {
  it("a foto entra na grelha ANTES de o servidor responder, vinda do ficheiro dela", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    route("POST /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(1)] }));
    hold("POST /api/temas/t1/imagens");

    renderTemas();
    await openFolder(/Terracotta/);

    await chooseFiles(jpg("praia.jpg"));

    // O servidor ainda não respondeu e a foto já está no ecrã — do disco dela.
    expect(callsTo("POST /api/temas/t1/imagens")).toBe(1);
    expect(photos()).toHaveLength(1);
    expect(photos()[0]).toMatch(/^blob:/);
    expect(screen.getByText("A carregar")).toBeInTheDocument();
    // E ainda não é uma foto do tema: não se pode selecionar nem remover o que
    // ainda não existe no servidor.
    expect(screen.queryByRole("button", { name: /Remover foto/ })).toBeNull();

    await release("POST /api/temas/t1/imagens");

    // Chegou: a célula provisória dá lugar à foto verdadeira, sem piscar —
    // continua a mostrar-se a cópia local, que já está no computador dela.
    expect(screen.queryByText("A carregar")).toBeNull();
    expect(screen.getByRole("button", { name: "Acções da foto 1 de 1" })).toBeInTheDocument();
    expect(photos()[0]).toMatch(/^blob:/);
  });

  it("uma foto que falha não deixa a célula pendurada no ecrã", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    route("POST /api/temas/t1/imagens", () => bad(413, { error: "Imagem demasiado grande" }));

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(jpg("enorme.jpg"));

    // Fica a caixa do "tentar novamente" — e mais nada na grelha.
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    expect(screen.queryByText("A carregar")).toBeNull();
    expect(photos()).toHaveLength(0);
  });

  it("liberta as cópias locais ao sair da pasta", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    route("POST /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(1)] }));

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(jpg("praia.jpg"));
    const blob = photos()[0];

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "← Temas" }));
    });

    expect(revoke).toHaveBeenCalledWith(blob);
  });
});

describe("Biblioteca de Temas — lote de 300 fotos", () => {
  it("sobe no máximo quatro fotos ao mesmo tempo, e vai puxando as seguintes", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    let n = 0;
    route("POST /api/temas/t1/imagens", () => {
      n += 1;
      return ok({ ok: true, images: [photo(n)] });
    });
    hold("POST /api/temas/t1/imagens");

    renderTemas();
    await openFolder(/Terracotta/);

    await chooseFiles(...Array.from({ length: 10 }, (_, i) => jpg(`f${i}.jpg`)));
    // Sequencial subia uma; sem limite subia dez de uma vez (e rebentava a
    // memória com 300). São quatro em voo.
    expect(callsTo("POST /api/temas/t1/imagens")).toBe(4);

    await release("POST /api/temas/t1/imagens");
    expect(callsTo("POST /api/temas/t1/imagens")).toBe(5);

    await releaseAll("POST /api/temas/t1/imagens");
    expect(callsTo("POST /api/temas/t1/imagens")).toBe(10);
    expect(photos()).toHaveLength(10);
  });

  it("conta o progresso de verdade — '47 de 312', não uma roda a girar", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    let n = 0;
    route("POST /api/temas/t1/imagens", () => {
      n += 1;
      return ok({ ok: true, images: [photo(n)] });
    });
    hold("POST /api/temas/t1/imagens");

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(...Array.from({ length: 6 }, (_, i) => jpg(`f${i}.jpg`)));

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "6");
    await release("POST /api/temas/t1/imagens");
    await release("POST /api/temas/t1/imagens");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");

    await releaseAll("POST /api/temas/t1/imagens");
    // Terminado o lote, o indicador sai do ecrã.
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("um ficheiro mau não deita fora o resto do lote, e repete-se sem o voltar a escolher", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    let n = 0;
    let failNext = true;
    route("POST /api/temas/t1/imagens", () => {
      n += 1;
      // A primeira falha; as outras passam. Na repetição já não falha nenhuma.
      if (failNext) {
        failNext = false;
        return bad(502, { error: "Falha ao guardar a imagem." });
      }
      return ok({ ok: true, images: [photo(n)] });
    });

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(jpg("a.jpg"), jpg("b.jpg"), jpg("c.jpg"));

    // Duas passaram — a falha não interrompeu o lote.
    expect(photos()).toHaveLength(2);
    expect(screen.getByText(/não subiu/)).toBeInTheDocument();

    // E repete-se a partir do que ficou guardado: nenhum ficheiro é escolhido
    // outra vez, o seletor nem sequer é aberto.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    });
    expect(photos()).toHaveLength(3);
    expect(screen.queryByText(/não subiu/)).not.toBeInTheDocument();
  });

  it("envia a miniatura ao lado do original, e só o original quando não há", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    let n = 0;
    route("POST /api/temas/t1/imagens", () => {
      n += 1;
      return ok({ ok: true, images: [photo(n)] });
    });

    const original = jpg("grande.jpg");
    const thumb = jpg("grande.thumb.jpg");
    prepare.mockImplementationOnce(async () => ({ file: original, thumb }));

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(jpg("grande.jpg"));

    const body = requests.find((r) => routeKey(r.url, r.init) === "POST /api/temas/t1/imagens")
      ?.init?.body as FormData;
    expect(body.getAll("files")).toEqual([original]);
    expect(body.getAll("thumbs")).toEqual([thumb]);

    // Uma foto já pequena não gera miniatura — e o campo fica simplesmente
    // vazio, sem desalinhar a correspondência ficheiro↔miniatura.
    await chooseFiles(jpg("pequena.jpg"));
    const second = requests.filter(
      (r) => routeKey(r.url, r.init) === "POST /api/temas/t1/imagens",
    )[1].init?.body as FormData;
    expect(second.getAll("thumbs")).toEqual([]);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A SELECÇÃO — FASE 05 DO `docs/APPLE-TEMAS.md`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Suportar seleção; ⌘A; Shift+clique para intervalo; ⌘+clique para
 * adicionar.» [APPLE] O clique e o Shift já cá estavam (e têm testes seus, lá
 * em cima, no bloco da remoção em bloco); o que faltava era o ⌘, o ⌘A e o Esc.
 *
 * Com 312 fotos numa pasta, escolher todas eram 312 cliques.
 */
describe("Biblioteca de Temas — os atalhos da selecção", () => {
  async function pastaCom(n: number) {
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: n }]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: many(1, n, true), total: n }));
    renderTemas();
    await openFolder(/Terracotta/);
  }

  it("⌘A escolhe as fotos todas da pasta", async () => {
    await pastaCom(5);
    fireEvent.keyDown(document, { key: "a", metaKey: true });
    expect(screen.getByText("5 fotos selecionadas")).toBeTruthy();
  });

  /** Windows e Linux também abrem o back office, e lá o gesto é o Ctrl. */
  it("Ctrl+A faz o mesmo", async () => {
    await pastaCom(3);
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });
    expect(screen.getByText("3 fotos selecionadas")).toBeTruthy();
  });

  it("Esc limpa a selecção", async () => {
    await pastaCom(4);
    fireEvent.keyDown(document, { key: "a", metaKey: true });
    expect(screen.getByText("4 fotos selecionadas")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText(/fotos selecionadas/)).toBeNull();
  });

  /**
   * O ⌘A dentro de um campo selecciona o TEXTO. Roubá-lo seria tirar um atalho
   * para dar outro — e o campo aqui é o de renomear o tema.
   */
  it("⌘A dentro de um campo não mexe na selecção", async () => {
    await pastaCom(5);
    // O botão do nome, no cabeçalho da pasta, é o que abre o campo.
    fireEvent.click(screen.getByRole("button", { name: "Terracotta" }));
    const campo = await screen.findByLabelText("Nome do tema");
    fireEvent.keyDown(campo, { key: "a", metaKey: true });
    expect(screen.queryByText(/fotos selecionadas/)).toBeNull();
  });

  /**
   * O ⌘ GANHA ao Shift: com os dois carregados acrescenta-se uma foto ao
   * intervalo em vez de o refazer. É o que permite escolher a quadragésima
   * primeira sem perder as quarenta que já estavam.
   */
  it("⌘+clique acrescenta uma foto sem refazer o intervalo do Shift", async () => {
    await pastaCom(5);
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 1 de 5" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 3 de 5" }), {
      shiftKey: true,
    });
    expect(screen.getByText("3 fotos selecionadas")).toBeTruthy();

    // Com Shift E ⌘: sem o ⌘, isto estenderia de 3 até 5 e daria cinco.
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 5 de 5" }), {
      shiftKey: true,
      metaKey: true,
    });
    expect(screen.getByText("4 fotos selecionadas")).toBeTruthy();
  });

  /**
   * ── O BOTÃO DIREITO NUMA FOTOGRAFIA ────────────────────────────────────
   *
   * As quatro acções são as que já estão desenhadas na célula — «tudo o que
   * está no menu de contexto existe também na interface principal» [APPLE] —,
   * e aqui ganham nome escrito. A destrutiva é a última.
   */
  it("o botão direito numa foto abre as acções dela, com a destrutiva no fim", async () => {
    await pastaCom(3);
    const celula = screen.getByRole("checkbox", { name: "Selecionar foto 2 de 3" }).parentElement!;
    fireEvent.contextMenu(celula, { clientX: 20, clientY: 20 });

    // Pela ordem da Parte 3 do `docs/APPLE-TEMAS.md`. Sem outros temas não há
    // para onde mover nem duplicar, e esses dois escondem-se (Parte 9.8).
    const itens = screen.getAllByRole("menuitem").map((m) => m.textContent);
    expect(itens).toEqual([
      "Pré-visualizar",
      "Abrir tamanho real",
      "Definir como capa",
      "Pôr no início",
      "Remover do tema…",
    ]);
    // Três grupos, dois filetes.
    expect(screen.getByRole("menu").querySelectorAll('[role="separator"]')).toHaveLength(2);
  });
});

describe("Biblioteca de Temas — miniaturas em falta", () => {
  /** Um servidor de miniaturas que percorre `total` fotos, `perLote` de cada vez. */
  function serveThumbJob(total: number, perLote = 8) {
    route("POST /api/temas/t1/miniaturas", () => {
      const last = requests.filter(
        (r) => routeKey(r.url, r.init) === "POST /api/temas/t1/miniaturas",
      );
      const cursor = JSON.parse(String(last[last.length - 1].init?.body ?? "{}")).cursor ?? 0;
      const scanned = Math.min(perLote, Math.max(0, total - cursor));
      const next = cursor + scanned;
      return ok({
        ok: true,
        scanned,
        generated: scanned,
        skipped: 0,
        failed: 0,
        nextCursor: next >= total ? null : next,
        total,
      });
    });
  }

  it("não aparece quando as fotos já têm miniatura", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: many(1, 3, true), total: 3 }));

    renderTemas();
    await openFolder(/Terracotta/);

    expect(screen.queryByRole("button", { name: /Gerar miniaturas/ })).toBeNull();
  });

  it("percorre a pasta por lotes, mostra o andamento e continua de onde ficou", async () => {
    // A BIBLIOTECA QUE JÁ EXISTE: fotos carregadas antes de haver miniaturas.
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 20 }]));
    let listed = 0;
    route("GET /api/temas/t1/imagens", () => {
      listed += 1;
      // Depois de gerar, a mesma página volta a vir — agora com miniaturas.
      return ok({ ok: true, images: many(1, 20, listed > 1), total: 20 });
    });
    serveThumbJob(20);

    renderTemas();
    await openFolder(/Terracotta/);

    // A grelha está a mostrar ORIGINAIS: é isso que o cartão diz, e é verdade.
    expect(photos()[0]).toBe(photo(1).url);
    expect(screen.getByText(/Há fotos antigas sem miniatura/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Gerar miniaturas em falta" }));
    });

    // Três lotes (8 + 8 + 4) e o cursor foi sempre o que o servidor mandou.
    const bodies = requests
      .filter((r) => routeKey(r.url, r.init) === "POST /api/temas/t1/miniaturas")
      .map((r) => JSON.parse(String(r.init?.body)).cursor);
    expect(bodies).toEqual([0, 8, 16]);

    // No fim a grelha passa a mostrar as miniaturas — sem recarregar a página.
    await settlePhotos();
    expect(photos()[0]).toBe(photo(1, true).thumbUrl);
    expect(screen.queryByRole("button", { name: /Gerar miniaturas/ })).toBeNull();
  });

  it("parar a meio guarda o que já foi feito e não perde o resto", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 100 }]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: many(1, 20), total: 100 }));
    serveThumbJob(100);
    hold("POST /api/temas/t1/miniaturas");

    renderTemas();
    await openFolder(/Terracotta/);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Gerar miniaturas em falta" }));
    });
    await release("POST /api/temas/t1/miniaturas");

    // A meio: o andamento está à vista e há como parar.
    expect(screen.getByText(/A gerar miniaturas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    await release("POST /api/temas/t1/miniaturas");

    // Parou — e o botão convida a continuar, não a recomeçar do zero.
    expect(screen.getByRole("button", { name: "Continuar a gerar miniaturas" })).toBeVisible();
    expect(screen.getByText(/parado a meio/)).toBeInTheDocument();
    // Dois lotes pedidos, e mais nenhum depois do "Parar".
    expect(callsTo("POST /api/temas/t1/miniaturas")).toBe(2);
  });

  it("desiste quando nada é gerado — não percorre 4000 fotos a falhar em silêncio", async () => {
    // O servidor responde 200 a dizer "vi 8, gerei 0, falharam 8": não é a
    // foto, é o Storage. Insistir seria a barra a andar sem nada acontecer.
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 4000 }]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: many(1, 20), total: 4000 }));
    let cursor = 0;
    route("POST /api/temas/t1/miniaturas", () => {
      cursor += 8;
      return ok({
        scanned: 8,
        generated: 0,
        skipped: 0,
        failed: 8,
        nextCursor: cursor,
        total: 4000,
      });
    });

    renderTemas();
    await openFolder(/Terracotta/);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Gerar miniaturas em falta" }));
    });

    expect(callsTo("POST /api/temas/t1/miniaturas")).toBe(3);
    expect(screen.getByText(/8 fotos sem miniatura|24 fotos sem miniatura/)).toBeInTheDocument();
  });

  it("uma falha do servidor não apaga o que já tinha sido gerado", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 100 }]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: many(1, 20), total: 100 }));
    let n = 0;
    route("POST /api/temas/t1/miniaturas", () => {
      n += 1;
      if (n === 1) {
        return ok({ scanned: 8, generated: 8, skipped: 0, failed: 0, nextCursor: 8, total: 100 });
      }
      return bad(503, { error: "Não foi possível ler a pasta do tema." });
    });

    renderTemas();
    await openFolder(/Terracotta/);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Gerar miniaturas em falta" }));
    });

    // (a mesma frase aparece também no aviso passageiro — chegam as duas)
    expect(screen.getAllByText(/8 miniaturas criadas/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Continuar a gerar miniaturas" })).toBeVisible();
  });
});

describe("Biblioteca de Temas — seleção e ações em bloco", () => {
  const five = { ok: true, images: many(1, 5), total: 5 };

  it("Shift+clique seleciona o intervalo e uma só confirmação remove tudo", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok(five));
    route("DELETE /api/temas/t1/imagens", () => ok({ ok: true }));

    renderTemas();
    await openFolder(/Terracotta/);

    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 1 de 5" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 4 de 5" }), {
      shiftKey: true,
    });
    expect(screen.getByText("4 fotos selecionadas")).toBeInTheDocument();

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    });

    // UMA pergunta para as quatro — não quatro perguntas —, e a pergunta diz
    // quantas são. O `confirm()` do browser deixou de ser usado: a caixa é a
    // da casa, e é ela que se conta agora.
    const caixa = await screen.findByRole("dialog");
    expect(within(caixa).getByText(/4 fotografias/)).toBeTruthy();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      confirmSpy,
      "voltou o `confirm()` do browser ao gesto de remover em bloco",
    ).not.toHaveBeenCalled();
    await confirmarRemocao();
    expect(callsTo("DELETE /api/temas/t1/imagens")).toBe(4);
    expect(photos()).toEqual([photo(5).url]);
  });

  it("as fotos que o servidor recusa apagar voltam ao sítio onde estavam", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok(five));
    let n = 0;
    route("DELETE /api/temas/t1/imagens", () => {
      n += 1;
      return n === 1 ? bad(502) : ok({ ok: true });
    });

    renderTemas();
    await openFolder(/Terracotta/);

    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 2 de 5" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 3 de 5" }), {
      shiftKey: true,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    });
    await confirmarRemocao();

    // A que falhou volta — e volta ao seu lugar na ordem, não ao fim.
    expect(photos()).toHaveLength(4);
    expect(photos()[1]).toBe(photo(2).url);
  });

  it("define uma foto como capa do tema", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok(five));
    route("PATCH /api/temas/t1", () => ok({ ...THEME, coverPath: "t1/foto-3.jpg" }));

    renderTemas();
    await openFolder(/Terracotta/);

    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 3 de 5" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Definir como capa" }));
    });

    const patch = requests.find((r) => routeKey(r.url, r.init) === "PATCH /api/temas/t1");
    expect(JSON.parse(String(patch?.init?.body))).toEqual({ coverPath: "t1/foto-3.jpg" });
    expect(screen.getByText("Capa")).toBeInTheDocument();
    // A ação de capa só faz sentido para UMA foto.
    expect(screen.queryByRole("button", { name: "Definir como capa" })).not.toBeInTheDocument();
  });

  /**
   * ────────────────────────────────────────────────────────────────────────
   * O QUE ELA VÊ ENQUANTO ESPERA
   * ────────────────────────────────────────────────────────────────────────
   *
   * Quarenta fotos a descarregar são um a dois minutos. O `downloadMany` já
   * contava as que iam saindo — e o ecrã passava-lhe um `() => {}`, ou seja,
   * deitava a conta ao lixo e deixava um botão parado.
   */
  it("transferir em bloco mostra a contagem verdadeira, que sobe a cada foto", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok(five));
    // Cada foto é puxada do CDN por `fetch` (o `download` é ignorado entre
    // origens); travá-las é o que deixa parar o lote a meio e olhar.
    for (const n of [1, 2, 3]) {
      route(`GET ${photo(n).url}`, () => ok({}));
      hold(`GET ${photo(n).url}`);
    }

    renderTemas();
    await openFolder(/Terracotta/);

    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 1 de 5" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 3 de 5" }), {
      shiftKey: true,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Transferir" }));
    });

    expect(screen.getByText("A transferir as fotos…")).toBeInTheDocument();
    expect(screen.getByText("0 de 3")).toBeInTheDocument();
    expect(preenchimento()).toBe(0);

    await release(`GET ${photo(1).url}`);
    expect(screen.getByText("1 de 3")).toBeInTheDocument();
    expect(preenchimento()).toBeCloseTo(1 / 3, 4);

    await release(`GET ${photo(2).url}`);
    expect(screen.getByText("2 de 3")).toBeInTheDocument();

    // A resposta da última é que fecha a espera — não um temporizador.
    await release(`GET ${photo(3).url}`);
    expect(screen.queryByText("A transferir as fotos…")).not.toBeInTheDocument();
  });

  /**
   * A remoção é OTIMISTA: as fotos saem da grelha e a seleção esvazia-se no
   * instante do clique, e com ela vai-se a barra de ações. Os pedidos, esses,
   * continuam a caminho do servidor — e é aí que ela ficava sem saber se
   * aquilo estava a andar.
   */
  it("remover em bloco continua a contar depois de a barra de seleção desaparecer", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok(five));
    route("DELETE /api/temas/t1/imagens", () => ok({ ok: true }));
    hold("DELETE /api/temas/t1/imagens");

    renderTemas();
    await openFolder(/Terracotta/);

    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 1 de 5" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 4 de 5" }), {
      shiftKey: true,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    });
    await confirmarRemocao();

    expect(screen.queryByText("4 fotos selecionadas")).not.toBeInTheDocument();
    expect(screen.getByText("A remover as fotos…")).toBeInTheDocument();
    expect(screen.getByText("0 de 4")).toBeInTheDocument();

    await release("DELETE /api/temas/t1/imagens");
    expect(screen.getByText("1 de 4")).toBeInTheDocument();
    expect(preenchimento()).toBeCloseTo(0.25, 4);

    await releaseAll("DELETE /api/temas/t1/imagens");
    expect(screen.queryByText("A remover as fotos…")).not.toBeInTheDocument();
  });
});

describe("reordenar fotos à mão", () => {
  it("tira a foto de onde está e põe-na onde deve ficar", () => {
    expect(moveItem(["a", "b", "c", "d"], 2, 0)).toEqual(["c", "a", "b", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 0, 3)).toEqual(["b", "c", "d", "a"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("nunca perde nem duplica uma foto", () => {
    const list = ["a", "b", "c", "d", "e"];
    for (let from = 0; from < list.length; from++) {
      for (let to = 0; to < list.length; to++) {
        const moved = moveItem(list, from, to);
        expect([...moved].sort()).toEqual([...list].sort());
        expect(moved).toHaveLength(list.length);
      }
    }
  });

  it("devolve a lista intacta para índices fora dela", () => {
    const list = ["a", "b"];
    expect(moveItem(list, -1, 0)).toBe(list);
    expect(moveItem(list, 0, 5)).toBe(list);
  });
});

describe("ajudantes puros da grelha", () => {
  const a = photo(1);
  const b = photo(2);
  const c = photo(3);

  it("mergePage não duplica o que já está na grelha", () => {
    // Acontece de verdade: enquanto sobem fotos, a lista do servidor desloca-se
    // e a página seguinte pode trazer de volta alguma que já mostramos.
    expect(mergePage([a, b], [b, c])).toEqual([a, b, c]);
    expect(mergePage([], [a])).toEqual([a]);
  });

  it("mergePage ignora entradas sem caminho", () => {
    expect(mergePage([a], [{ path: "", url: "x" }])).toEqual([a]);
  });

  it("reinsertAt repõe cada foto no índice onde estava", () => {
    const positions = new Map([
      [a.path, 0],
      [b.path, 1],
      [c.path, 2],
    ]);
    expect(reinsertAt([b], [a, c], positions)).toEqual([a, b, c]);
  });

  it("reinsertAt não repete uma foto que já lá está", () => {
    const positions = new Map([[a.path, 0]]);
    expect(reinsertAt([a, b], [a], positions)).toEqual([a, b]);
  });

  it("reinsertAt aguenta um índice que já não existe na lista encolhida", () => {
    const positions = new Map([[c.path, 9]]);
    expect(reinsertAt([a], [c], positions)).toEqual([a, c]);
  });
});

// ── NÃO REPETIR FOTOS QUE JÁ ESTÃO NO TEMA ─────────────────────────────────
//
// O pedido dela, pelas palavras dela: "quando eu adicionar fotos ele perceber
// se já aquela foto no tema e adicionar só as que ainda não estão". O que aqui
// se fixa é o que separa isso de fazer desaparecer uma foto boa em silêncio.

describe("Biblioteca de Temas — fotos que já lá estão", () => {
  /** O tema já tem estas fotos (a rota de pré-verificação responde por elas). */
  function themeKnows(...files: File[]) {
    const known = new Set(files.map((f) => fp.hash(fp.content.get(f) ?? "")));
    route("POST /api/temas/t1/repetidas", () => {
      const last = requests.filter(
        (r) => routeKey(r.url, r.init) === "POST /api/temas/t1/repetidas",
      );
      const asked: string[] = JSON.parse(String(last[last.length - 1].init?.body ?? "{}")).hashes;
      return ok({
        ok: true,
        known: asked.filter((h) => known.has(h)),
        complete: true,
        legacy: false,
        read: true,
      });
    });
  }

  function serveUploads() {
    let n = 0;
    route("POST /api/temas/t1/imagens", () => {
      n += 1;
      return ok({ ok: true, images: [photo(100 + n)], duplicates: [] });
    });
  }

  beforeEach(() => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    route("POST /api/temas/t1/repetidas", () =>
      ok({ ok: true, known: [], complete: true, legacy: false, read: true }),
    );
    serveUploads();
  });

  it("O PEDIDO: das que ela larga, só sobem as que ainda não estão no tema", async () => {
    const ja = jpg("praia.jpg");
    const nova = jpg("mesa.jpg");
    themeKnows(ja);

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(ja, nova);

    // Uma só subiu — e a repetida nem chegou a ser PREPARADA (é o que poupa os
    // 383 ms por foto, contra os 16 ms que custa resumi-la).
    expect(callsTo("POST /api/temas/t1/imagens")).toBe(1);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith(nova, "cover");
  });

  it("o resumo do ficheiro viaja com a foto que sobe", async () => {
    const nova = jpg("mesa.jpg");
    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(nova);

    const body = requests.find((r) => routeKey(r.url, r.init) === "POST /api/temas/t1/imagens")
      ?.init?.body as FormData;
    expect(body.get("hashes")).toBe(fp.hash("mesa.jpg"));
    expect(body.get("force")).toBeNull();
  });

  it("A MESMA FOTO DUAS VEZES NO MESMO LOTE entra uma só vez", async () => {
    // A pré-verificação nunca as apanharia: ainda não estão na pasta.
    const a = jpg("praia.jpg");
    const copia = sameAs(a, "praia (1).jpg");

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(a, copia, jpg("outra.jpg"));

    expect(callsTo("POST /api/temas/t1/imagens")).toBe(2);
    expect(screen.getByText(/não foi adicionada|não foram adicionadas/)).toBeInTheDocument();
    expect(screen.getByText(/repetidas dentro do mesmo arrasto/)).toBeInTheDocument();
  });

  it("LOTE METADE REPETIDO: a conta que ela lê é verdadeira", async () => {
    const velhas = Array.from({ length: 3 }, (_, i) => jpg(`velha-${i}.jpg`));
    const novas = Array.from({ length: 3 }, (_, i) => jpg(`nova-${i}.jpg`));
    themeKnows(...velhas);

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(...velhas, ...novas);

    expect(callsTo("POST /api/temas/t1/imagens")).toBe(3);
    expect(screen.getByText(/3 fotos não foram adicionadas/)).toBeInTheDocument();
    expect(screen.getByText(/já estavam em/)).toBeInTheDocument();
  });

  it("TODAS REPETIDAS não é uma barra a andar e nada a acontecer", async () => {
    // Sem esta frase ela vê o progresso mexer, a grelha na mesma, e conclui
    // que o site está avariado.
    const velhas = Array.from({ length: 3 }, (_, i) => jpg(`velha-${i}.jpg`));
    themeKnows(...velhas);

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(...velhas);

    expect(callsTo("POST /api/temas/t1/imagens")).toBe(0);
    expect(prepare).not.toHaveBeenCalled();
    expect(screen.getByText(/3 fotos não foram adicionadas/)).toBeInTheDocument();
  });

  it("'Adicionar mesmo assim' volta a subi-las, agora com force", async () => {
    const ja = jpg("praia.jpg");
    themeKnows(ja);

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(ja);
    expect(callsTo("POST /api/temas/t1/imagens")).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Adicionar mesmo assim" }));
    await settleScreening();
    await act(async () => {});

    expect(callsTo("POST /api/temas/t1/imagens")).toBe(1);
    const body = requests.find((r) => routeKey(r.url, r.init) === "POST /api/temas/t1/imagens")
      ?.init?.body as FormData;
    expect(body.get("force")).toBe("1");
    // O RESUMO VAI NA MESMA. Sem ele o servidor cunhava um UUID e esta foto
    // deixava de contar como "está no tema" — um buraco permanente no índice
    // por cada clique em "Adicionar mesmo assim".
    expect(body.get("hashes")).toBe(fp.hash("praia.jpg"));
    // Forçar não volta a perguntar à pasta: é uma decisão dela, já tomada.
    expect(callsTo("POST /api/temas/t1/repetidas")).toBe(1);
    expect(screen.queryByRole("button", { name: "Adicionar mesmo assim" })).toBeNull();
  });

  it("uma repetida apanhada PELO SERVIDOR conta como as outras", async () => {
    // A corrida (dois separadores) e a foto antiga de nome UUID só aparecem
    // aqui — o relatório é do que ACONTECEU, não do que se previu.
    route("POST /api/temas/t1/imagens", () =>
      ok({
        ok: true,
        images: [],
        duplicates: [{ name: "praia.jpg", path: "t1/velha.jpg", reason: "no-tema" }],
      }),
    );

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(jpg("praia.jpg"));

    expect(screen.getByText(/1 foto não foi adicionada/)).toBeInTheDocument();
    // E NÃO é um erro: nada de caixa vermelha nem de "tentar novamente".
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
    // A grelha continua vazia — a miniatura que se vê é a do painel das
    // saltadas, desenhada do ficheiro que está no computador dela.
    expect(screen.queryByRole("button", { name: /Remover foto/ })).toBeNull();
    expect(screen.queryByText("A carregar")).toBeNull();
  });

  it("a pasta ilegível não trava o carregamento — sobe tudo", async () => {
    // `read: false` = não se pôde verificar. Dizer "nenhuma repetida" seria
    // prometer uma verificação que não aconteceu; travar seria pior ainda.
    route("POST /api/temas/t1/repetidas", () => bad(503, { error: "Armazenamento indisponível." }));

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(jpg("a.jpg"), jpg("b.jpg"));

    expect(callsTo("POST /api/temas/t1/imagens")).toBe(2);
    expect(screen.queryByText(/não foram adicionadas/)).toBeNull();
  });

  it("diz uma vez, sem drama, que as fotos antigas nem sempre são reconhecidas", async () => {
    const ja = jpg("praia.jpg");
    const known = new Set([fp.hash("praia.jpg")]);
    route("POST /api/temas/t1/repetidas", () => {
      const last = requests.filter(
        (r) => routeKey(r.url, r.init) === "POST /api/temas/t1/repetidas",
      );
      const asked: string[] = JSON.parse(String(last[last.length - 1].init?.body ?? "{}")).hashes;
      return ok({
        ok: true,
        known: asked.filter((h) => known.has(h)),
        complete: true,
        legacy: true,
        read: true,
      });
    });

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(ja);

    expect(screen.getByText(/nem sempre podem ser reconhecidas/)).toBeInTheDocument();
  });

  it("pergunta à pasta em pedaços, não o arrasto todo de uma vez", async () => {
    // Em pedaços, a primeira foto começa a subir ao fim de ~0,3 s em vez de
    // ~2 s num arrasto de 300.
    const files = Array.from({ length: CHECK_CHUNK + 5 }, (_, i) => jpg(`f${i}.jpg`));
    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(...files);
    expect(callsTo("POST /api/temas/t1/repetidas")).toBe(2);
  });
});

// ── LEVAR FOTOS DE UM TEMA PARA OUTRO ──────────────────────────────────────

describe("Biblioteca de Temas — copiar e mover fotos entre temas", () => {
  const OUTRO: ThemeSummary = {
    ...THEME,
    id: "t2",
    name: "Itália",
    imageCount: 7,
  };
  const cinco = { ok: true, images: many(1, 5), total: 5 };

  /** Abre o diálogo com as fotos `n` selecionadas (índices 1-based da grelha). */
  async function selectAndOpen(...indices: number[]) {
    for (const i of indices) {
      fireEvent.click(screen.getByRole("checkbox", { name: `Selecionar foto ${i} de 5` }));
    }
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copiar para…" }));
    });
  }

  it("o botão só existe havendo outro tema para onde levar", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok(cinco));

    renderTemas();
    await openFolder(/Terracotta/);
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 1 de 5" }));

    expect(screen.queryByRole("button", { name: "Copiar para…" })).toBeNull();
    // A palavra "Transferir" continua a significar DESCARREGAR nesta barra.
    expect(screen.getByRole("button", { name: "Transferir" })).toBeInTheDocument();
  });

  it("copia sem mexer na grelha e soma no cartão do destino", async () => {
    route("GET /api/temas", () => ok([THEME, OUTRO]));
    route("GET /api/temas/t1/imagens", () => ok(cinco));
    route("POST /api/temas/t1/imagens/copiar", () =>
      ok({
        ok: true,
        copied: [
          { from: "t1/foto-1.jpg", to: "t2/foto-1.jpg" },
          { from: "t1/foto-2.jpg", to: "t2/foto-2.jpg" },
        ],
        existing: [],
        failed: [],
        requested: 2,
        thumbsMissing: 0,
      }),
    );

    renderTemas();
    await openFolder(/Terracotta/);
    await selectAndOpen(1, 2);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Copiar 2 fotos$/ }));
    });

    const body = JSON.parse(
      String(
        requests.find((r) => routeKey(r.url, r.init) === "POST /api/temas/t1/imagens/copiar")?.init
          ?.body,
      ),
    );
    expect(body).toEqual({
      paths: ["t1/foto-1.jpg", "t1/foto-2.jpg"],
      destino: "t2",
      modo: "copiar",
    });
    // Copiar não tira nada daqui.
    expect(photos()).toHaveLength(5);

    // O cartão do destino já conta com elas. A linha traz também a data da
    // última alteração ("9 fotos · há 3 dias"), por isso compara-se o começo.
    fireEvent.click(screen.getByRole("button", { name: "← Temas" }));
    expect(await screen.findByText(/^9 fotos\b/)).toBeInTheDocument();
  });

  it("mover tira da grelha SÓ as que o servidor confirmou", async () => {
    route("GET /api/temas", () => ok([THEME, OUTRO]));
    route("GET /api/temas/t1/imagens", () => ok(cinco));
    route("POST /api/temas/t1/imagens/copiar", () =>
      ok({
        ok: true,
        copied: [{ from: "t1/foto-1.jpg", to: "t2/foto-1.jpg" }],
        existing: [],
        failed: ["t1/foto-2.jpg"],
        requested: 2,
        thumbsMissing: 0,
      }),
    );

    renderTemas();
    await openFolder(/Terracotta/);
    await selectAndOpen(1, 2);

    fireEvent.click(screen.getByRole("radio", { name: "Mover" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Mover 2 fotos$/ }));
    });
    await settlePhotos();

    // A que saiu desapareceu; a que falhou continua aqui.
    expect(photos()).toHaveLength(4);
    expect(photos()).not.toContain(photo(1).url);
    expect(photos()).toContain(photo(2).url);
    // E continua SELECIONADA, para não ser preciso escolher tudo de novo.
    expect(screen.getByText("1 foto selecionada")).toBeInTheDocument();
    expect(screen.getByText(/1 de 2 não foi movida para/)).toBeInTheDocument();
  });

  it("'já lá estava' não é um erro e não aparece a vermelho", async () => {
    route("GET /api/temas", () => ok([THEME, OUTRO]));
    route("GET /api/temas/t1/imagens", () => ok(cinco));
    route("POST /api/temas/t1/imagens/copiar", () =>
      ok({
        ok: true,
        copied: [{ from: "t1/foto-1.jpg", to: "t2/foto-1.jpg" }],
        existing: ["t1/foto-2.jpg"],
        failed: [],
        requested: 2,
        thumbsMissing: 0,
      }),
    );

    renderTemas();
    await openFolder(/Terracotta/);
    await selectAndOpen(1, 2);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Copiar 2 fotos$/ }));
    });

    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
    expect(screen.getByText(/1 já lá estavam|1 foto copiada/)).toBeInTheDocument();
  });

  it("um lote grande é partido em pedidos que cabem no teto do servidor", async () => {
    const grande = { ok: true, images: many(1, THEME_PAGE_SIZE), total: THEME_PAGE_SIZE };
    route("GET /api/temas", () => ok([THEME, OUTRO]));
    route("GET /api/temas/t1/imagens", () => ok(grande));
    route("POST /api/temas/t1/imagens/copiar", () => {
      const last = requests.filter(
        (r) => routeKey(r.url, r.init) === "POST /api/temas/t1/imagens/copiar",
      );
      const paths: string[] = JSON.parse(String(last[last.length - 1].init?.body ?? "{}")).paths;
      return ok({
        ok: true,
        copied: paths.map((p) => ({ from: p, to: p.replace("t1/", "t2/") })),
        existing: [],
        failed: [],
        requested: paths.length,
        thumbsMissing: 0,
      });
    });

    renderTemas();
    await openFolder(/Terracotta/);
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 1 de 60" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 60 de 60" }), {
      shiftKey: true,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copiar para…" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Copiar 60 fotos$/ }));
    });

    // 60 fotos em lotes de THEME_COPY_CHUNK, e nenhum acima do teto da rota.
    const bodies = requests
      .filter((r) => routeKey(r.url, r.init) === "POST /api/temas/t1/imagens/copiar")
      .map((r) => JSON.parse(String(r.init?.body)).paths.length);
    expect(bodies).toEqual([THEME_COPY_CHUNK, THEME_COPY_CHUNK, THEME_COPY_CHUNK]);
    expect(Math.max(...bodies)).toBeLessThanOrEqual(MAX_THEME_COPY_BATCH);
  });

  /**
   * PARAR A MEIO NÃO PODE CUSTAR A SELEÇÃO.
   *
   * Mover 60 fotos são três pedidos. Ela carrega em "Parar" depois do primeiro:
   * 20 foram, 40 ficaram sem ser sequer tentadas. Essas 40 não estão nem em
   * `copied`, nem em `existing`, nem em `failed` — e a grelha limpava-lhes a
   * seleção, deixando o cartão a dizer "as que faltavam continuam neste tema"
   * sem o botão de retomar e sem forma de as reencontrar a não ser clicando
   * quarenta vezes.
   */
  it("parar a meio deixa selecionadas as que ainda não foram tentadas", async () => {
    const grande = { ok: true, images: many(1, THEME_PAGE_SIZE), total: THEME_PAGE_SIZE };
    route("GET /api/temas", () => ok([THEME, OUTRO]));
    route("GET /api/temas/t1/imagens", () => ok(grande));
    route("POST /api/temas/t1/imagens/copiar", () => {
      const feitos = requests.filter(
        (r) => routeKey(r.url, r.init) === "POST /api/temas/t1/imagens/copiar",
      );
      const paths: string[] = JSON.parse(
        String(feitos[feitos.length - 1].init?.body ?? "{}"),
      ).paths;
      return ok({
        ok: true,
        copied: paths.map((p) => ({ from: p, to: p.replace("t1/", "t2/") })),
        existing: [],
        failed: [],
        requested: paths.length,
        thumbsMissing: 0,
      });
    });
    hold("POST /api/temas/t1/imagens/copiar");

    renderTemas();
    await openFolder(/Terracotta/);
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 1 de 60" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 60 de 60" }), {
      shiftKey: true,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copiar para…" }));
    });
    fireEvent.click(screen.getByRole("radio", { name: "Mover" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Mover 60 fotos$/ }));
    });

    // "Parar" enquanto o primeiro pedido ainda vai a caminho: o que já foi
    // pedido termina, o resto nem chega a ser tentado.
    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    await release("POST /api/temas/t1/imagens/copiar");
    await settlePhotos();

    // Um pedido só — os outros dois nem saíram.
    expect(callsTo("POST /api/temas/t1/imagens/copiar")).toBe(1);
    expect(photos()).toHaveLength(THEME_PAGE_SIZE - THEME_COPY_CHUNK);
    // E as que faltavam continuam escolhidas, prontas para retomar.
    expect(
      screen.getByText(`${THEME_PAGE_SIZE - THEME_COPY_CHUNK} fotos selecionadas`),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("uma cópia que falha inteira deixa as fotos onde estavam", async () => {
    route("GET /api/temas", () => ok([THEME, OUTRO]));
    route("GET /api/temas/t1/imagens", () => ok(cinco));
    route("POST /api/temas/t1/imagens/copiar", () =>
      bad(502, { error: "Não foi possível copiar as fotos." }),
    );

    renderTemas();
    await openFolder(/Terracotta/);
    await selectAndOpen(1);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Copiar 1 foto$/ }));
    });

    // O diálogo fica aberto, com a razão à vista — e a grelha intacta.
    expect(screen.getByText("Não foi possível copiar as fotos.")).toBeInTheDocument();
    expect(photos()).toHaveLength(5);
  });
});

describe("Biblioteca de Temas — ordem dos cartões", () => {
  const tema = (over: Partial<ThemeSummary>): ThemeSummary => ({ ...THEME, ...over });
  const nomes = (lista: ThemeSummary[]) => lista.map((t) => t.name);

  const A = tema({ id: "a", name: "Alfa", updatedAt: "2026-01-01T00:00:00.000Z", imageCount: 5 });
  const B = tema({ id: "b", name: "Beta", updatedAt: "2026-06-01T00:00:00.000Z", imageCount: 1 });
  const C = tema({ id: "c", name: "Gama", updatedAt: "2026-03-01T00:00:00.000Z", imageCount: 9 });

  it("A–Z, por data e por nº de fotos", () => {
    expect(nomes(ordenarTemas([C, A, B], "alfabetica"))).toEqual(["Alfa", "Beta", "Gama"]);
    expect(nomes(ordenarTemas([A, B, C], "recentes"))).toEqual(["Beta", "Gama", "Alfa"]);
    expect(nomes(ordenarTemas([A, B, C], "fotos"))).toEqual(["Gama", "Alfa", "Beta"]);
  });

  /**
   * O que FIXAR quer dizer: um tema que se usa em quase todas as propostas não
   * pode mudar de sítio porque se ordenou por data. Sem isto, "fixar" era só
   * uma estrela desenhada.
   */
  it("um favorito vem à frente seja qual for a ordem", () => {
    const fixado = { ...C, favorito: true };
    for (const ordem of ["alfabetica", "recentes", "fotos"] as const) {
      expect(nomes(ordenarTemas([A, B, fixado], ordem))[0]).toBe("Gama");
    }
  });

  /**
   * Uma pasta ilegível não sabe quantas fotos tem. Contá-la como zero punha-a
   * atrás de um tema com uma foto — ou seja, escondia no fim da lista
   * precisamente o tema que tem um problema.
   */
  it("uma pasta por ler fica no fim de 'com mais fotos', não à frente do 1 foto", () => {
    const ilegivel = tema({ id: "x", name: "Xis", imageCount: null });
    expect(nomes(ordenarTemas([ilegivel, B], "fotos"))).toEqual(["Beta", "Xis"]);
  });

  it("não mexe na lista que recebe", () => {
    const original = [C, A, B];
    ordenarTemas(original, "alfabetica");
    expect(nomes(original)).toEqual(["Gama", "Alfa", "Beta"]);
  });
});

describe("desdeQuando", () => {
  const agora = Date.parse("2026-08-05T12:00:00.000Z");
  const dias = (n: number) => new Date(agora - n * 86_400_000).toISOString();

  it("fala como se fala", () => {
    expect(desdeQuando(dias(0), agora)).toBe("hoje");
    expect(desdeQuando(dias(1), agora)).toBe("ontem");
    expect(desdeQuando(dias(9), agora)).toBe("há 9 dias");
    expect(desdeQuando(dias(29), agora)).toBe("há 29 dias");
  });

  /**
   * Fase 02, ponto 13: «a partir de 30 dias mostra a data». Era «há 2 meses» e
   * «há 1 ano» — dois temas com «há 1 ano» podiam estar onze meses afastados.
   * Mudou de propósito; o formato é o da casa, `DD/MM/AAAA`.
   */
  it("a partir de 30 dias diz a data, e não «há N meses»", () => {
    expect(desdeQuando(dias(30), agora)).toBe("06/07/2026");
    expect(desdeQuando(dias(60), agora)).toBe("06/06/2026");
    expect(desdeQuando(dias(400), agora)).toBe("01/07/2025");
  });

  /** Um relógio trocado (ou uma escrita acabada de acontecer) não pode produzir
   *  "há -2 dias" no cartão. */
  it("uma data no futuro conta como hoje", () => {
    expect(desdeQuando(new Date(agora + 86_400_000).toISOString(), agora)).toBe("hoje");
  });

  it("sem data, ou com lixo, não diz nada", () => {
    expect(desdeQuando(undefined, agora)).toBe("");
    expect(desdeQuando("ontem à tarde", agora)).toBe("");
  });
});

// ── Bloco 9: os números da biblioteca ──────────────────────────────────────

describe("contarFotosDaBiblioteca", () => {
  const t = (imageCount: number | null) => ({ imageCount }) as never;

  it("soma as fotos e conta os temas", () => {
    expect(contarFotosDaBiblioteca([t(10), t(4), t(0)])).toEqual({
      fotos: 14,
      temas: 3,
      ilegiveis: 0,
      porContar: 0,
    });
  });

  it("uma pasta ilegível NÃO conta como zero — conta como desconhecida", () => {
    // Somá-la a zero em silêncio dava uma biblioteca mais pequena do que é, e
    // é assim que alguém conclui que faltam fotos e as volta a carregar.
    expect(contarFotosDaBiblioteca([t(10), t(null), t(4)])).toEqual({
      fotos: 14,
      temas: 3,
      ilegiveis: 1,
      porContar: 0,
    });
  });

  it("aguenta uma biblioteca vazia", () => {
    expect(contarFotosDaBiblioteca([])).toEqual({
      fotos: 0,
      temas: 0,
      ilegiveis: 0,
      porContar: 0,
    });
  });

  it("um tema por contar (milhares de temas, 9/11) não é uma pasta ilegível", () => {
    // Acima de 150 temas, a contagem dos últimos chega depois: até lá o tema
    // está «por contar», e o total diz-se como mínimo — nunca como avaria.
    const porContar = { imageCount: null, resumoPendente: true } as never;
    expect(contarFotosDaBiblioteca([t(10), porContar, t(4)])).toEqual({
      fotos: 14,
      temas: 3,
      ilegiveis: 0,
      porContar: 1,
    });
  });
});

describe("temPoucasFotos", () => {
  it("avisa abaixo de três — o que não chega para ESCOLHER", () => {
    expect(temPoucasFotos({ imageCount: 0 })).toBe(true);
    expect(temPoucasFotos({ imageCount: 2 })).toBe(true);
    expect(temPoucasFotos({ imageCount: 3 })).toBe(false);
    expect(temPoucasFotos({ imageCount: 40 })).toBe(false);
  });

  it("cala-se quando não se sabe quantas são", () => {
    // Um aviso a partir do que não se sabe é um aviso errado.
    expect(temPoucasFotos({ imageCount: null })).toBe(false);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A GRELHA AO DEDO — o que se mede com uma régua, guardado com uma asserção
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Medido no telemóvel (Chromium a 375×667, `hasTouch`), antes desta rede
 * existir: a grelha dava três colunas de 97,7 px e cada célula levava TRÊS
 * botões de 28×28 sempre visíveis — dois terços do mínimo de 44 px que a casa
 * exige a um alvo de toque, e um deles apaga a foto.
 *
 * O jsdom não sabe medir nada: não há CSS, não há `(pointer: coarse)`, e um
 * `getBoundingClientRect` devolve zeros. Por isso o que se guarda aqui são as
 * DUAS decisões de que o tamanho depende — a grelha começar em duas colunas e
 * cada botão trazer a classe `.alvo-toque` —, que é o que uma alteração
 * distraída apagaria. A medição verdadeira está na régua; isto é o alarme.
 */
describe("Grelha de fotos de um tema — ergonomia de toque", () => {
  it("começa em DUAS colunas, e só larga o piso quando o `auto-fill` já dá duas", () => {
    // Duas colunas a 375 px dão células de 148,5 px, que é o que permite três
    // alvos de 44 px sem eles se tocarem.
    //
    // A fase 07 do `docs/APPLE-TEMAS.md` trocou a escada de cinco degraus por
    // um `repeat(auto-fill, minmax(180px, 1fr))` — mas `auto-fill` sozinho dá
    // UMA coluna abaixo de 372 px de contentor, e 309 px é exactamente o que
    // um telemóvel de 375 dá a esta grelha. Por isso o `auto-fill` só entra a
    // 24rem (384 px), a primeira largura onde ele próprio já dá duas.
    expect(GRELHA_DE_FOTOS).toContain("grid-cols-2");
    expect(GRELHA_DE_FOTOS).toContain(
      "@min-[24rem]:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]",
    );
    // Uma coluna só, ou três sem condição nenhuma, são o defeito medido.
    expect(GRELHA_DE_FOTOS).not.toMatch(/(^|\s)grid-cols-[13](\s|$)/);
  });

  /**
   * ── E A CÉLULA TEM DE TER ALTURA PARA ELES ─────────────────────────────
   *
   * Rede nova, e nasceu de uma sobreposição real. A fase 07 pôs a célula a
   * 4:3, ou seja 25% mais baixa do que a quadrada de antes — e a 320 px o alvo
   * de cima (`×`, que APAGA a foto) passava a sobrepor-se 5,2 px ao de baixo
   * (`↑`). Num toque na zona sobreposta ganha quem vem depois no DOM: o `×`.
   *
   * O piso está escrito no `Temas.tsx` com a conta ao lado; aqui refaz-se a
   * conta a partir dos números que a decidem, para o dia em que alguém mexer
   * num deles.
   */
  it("a célula 4:3 nunca fica mais baixa do que os três alvos que carrega", () => {
    const MARGEM = 4; // `top-1` / `bottom-1`
    const ALVO = 44; // `.alvo-toque`
    const INTERVALO = 8; // o mínimo entre dois alvos, já fixado nesta casa
    expect(PISO_DA_CELULA_PX).toBe(2 * MARGEM + 2 * ALVO + INTERVALO);

    // E o piso vale MESMO: está na célula, na que está a subir e no esqueleto
    // — as três têm de ter a mesma geometria, senão a grelha salta quando uma
    // se torna a outra.
    const fonte = readFileSync(
      join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin/Temas.tsx"),
      "utf8",
    );
    const comRacio = fonte.match(/aspect-\[4\/3\][^"`]*/g) ?? [];
    // A capa do CARTÃO de tema também é 4:3 e não tem alvos por cima; as da
    // GRELHA são as que vivem numa célula com botões.
    const daGrelha = comRacio.filter((c) => c.includes("rounded-lg"));
    expect(daGrelha.length).toBeGreaterThanOrEqual(3);
    for (const classe of daGrelha) {
      expect(classe, `\`${classe}\` é 4:3 e não tem piso de altura`).toContain(
        `min-h-[${PISO_DA_CELULA_PX}px]`,
      );
    }
  });

  it("o «⋯» de cada foto tem 44 px de alvo sem o disco crescer", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 3 }]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: many(1, 3, true), total: 3 }));

    renderTemas();
    await openFolder(/Terracotta/);

    // Um só botão por foto (14/10): o «⋯» de vidro claro, 28 px à vista, e o
    // alvo de 44 no dedo vem do `.alvo-invisivel`, que não pinta nada a mais.
    const botao = screen.getByRole("button", { name: "Acções da foto 2 de 3" });
    expect(botao.className).toContain("alvo-invisivel");
    expect(botao.className).toContain("bo-vidro-claro");
    expect(botao.className).toContain("h-7 w-7");
    expect(
      screen.queryByRole("button", { name: /em grande|para o início|^Remover foto/ }),
    ).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PISO DA CÉLULA — 111 px, e em TODAS as larguras que interessam
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O comentário do `GRELHA_DE_FOTOS` fixa um número: 111 px é a célula mais
 * pequena onde os três botões de 44 px de uma foto ainda cabem sem se tocarem.
 * Só que os degraus da grelha mediam a JANELA e a célula depende da ZONA DE
 * LARGAR — e as duas larguras separam-se exactamente em `lg`, que é onde a
 * navegação deixa de ser uma gaveta por cima da página e passa a ocupar 256 px
 * em fluxo. A 1024 px de janela sobravam 654 para a grelha e ela pedia SEIS
 * colunas: células de 102,3 px, com três alvos de 44 px lá dentro. Num iPad
 * Pro deitado — 1024 px, e dedo — era esse o ecrã.
 *
 * ── PORQUE É QUE O TESTE RESOLVE AS CLASSES À MÃO ───────────────────────────
 *
 * O jsdom não faz disposição, não avalia `@media` e não avalia `@container`:
 * renderizar a 1024 e a 1440 dá o mesmo DOM com a mesma `className`, e um
 * `getBoundingClientRect` devolve zeros. Um teste que se ficasse pelo
 * `toContain("lg:grid-cols-6")` afirmava a ORTOGRAFIA da classe e não a
 * decisão — passava na mesma com o degrau errado ao lado.
 *
 * Por isso o `colunasEm()` faz o que o navegador faria: separa cada classe nas
 * suas variantes, decide quais estão ligadas naquela janela e naquele
 * contentor, e devolve as colunas que sobram. Depois a aritmética é a mesma do
 * ficheiro — `(largura − gap·(n−1)) / n`. É a escolha do `Cortes.movel.test.tsx`
 * e do `adaptativo.test.tsx`; a geometria a sério mede-se no navegador, o que
 * aqui se prende é a decisão.
 */

/** As larguras de janela que interessam a este back office. */
const JANELAS = [375, 640, 1024, 1440] as const;

/** `w-64` da navegação — `fixed` (fora do fluxo) até `lg`, `sticky` daí para cima. */
const BARRA_LATERAL = 256;
/** O `gap-3` da grelha — os 12 px que a fase 07 do `docs/APPLE-TEMAS.md`
 *  fixa («gap de 12»), no lugar do `gap-2` de antes. */
const GAP_DA_GRELHA = 12;
/** O número que o comentário do `GRELHA_DE_FOTOS` fixa como piso. */
const PISO_DA_CELULA = 111;

/** O `px` do `VIEW_WRAP` do `AdminClient`, por lado: px-4 / sm:px-6 / lg:px-10. */
const respiroDaVista = (janela: number) => (janela >= 1024 ? 40 : janela >= 640 ? 24 : 16);

/** A coluna de temas do split view (`lg:grid-cols-[16rem_…]`) mais o `gap-4`
 *  entre ela e a grelha. Só existe a partir de `lg` — ver a fase 06. */
const COLUNA_DO_SPLIT = 256 + 16;

/**
 * A largura ÚTIL da zona de largar — que é o contentor que a grelha mede.
 *
 * Janela − barra lateral (só a partir de `lg`, onde ela entra no fluxo) − o
 * `px` da vista dos dois lados − a coluna do split view (também só a partir de
 * `lg`) − a moldura de 1 px e o `p-4` da própria zona de largar dos dois
 * lados. Dá 309 px a 375, 558 a 640, 382 a 1024 e 798 a 1440.
 *
 * Os dois números de cima não mexeram; os dois de baixo encolheram no dia em
 * que a lista de temas passou a viver ao lado das fotografias. É por isso que
 * este cálculo tem de a conhecer: sem ela, a rede continuava a medir 654 px
 * numa caixa que passou a ter 382 — e o piso de 111 px deixava de ser medido
 * exactamente na largura onde ele já tinha falhado uma vez.
 */
function zonaDeLargar(janela: number): number {
  const desktop = janela >= 1024;
  const emFluxo = janela - (desktop ? BARRA_LATERAL : 0);
  return (
    Math.min(emFluxo, 1600) -
    2 * respiroDaVista(janela) -
    (desktop ? COLUNA_DO_SPLIT : 0) -
    2 * (1 + 16)
  );
}

type Contexto = { janela: number; contentor: number };

/**
 * Os cortes de largura de janela.
 *
 * `sm` e `lg` são os desta casa. `md`, `xl` e `2xl` estão aqui NÃO porque sejam
 * permitidos — o `Cortes.contrato.test.ts` proíbe-os — mas para esta rede
 * conseguir medir o que estava escrito ANTES desta correcção e falhar nos
 * píxeis em vez de rebentar no nome da variante. Uma variante que não seja
 * nenhuma destas rebenta, para isto não passar por vacuidade.
 */
const CORTES_DA_JANELA: Record<string, number> = {
  sm: 640,
  lg: 1024,
  md: 768,
  xl: 1280,
  "2xl": 1536,
};

/** Separa `@min-[22rem]:grid-cols-3` sem partir os `:` de dentro de `[…]`. */
function separar(classe: string): string[] {
  const partes: string[] = [];
  let actual = "";
  let dentro = 0;
  for (const c of classe) {
    if (c === "[" || c === "(") dentro++;
    else if (c === "]" || c === ")") dentro--;
    if (c === ":" && dentro === 0) {
      partes.push(actual);
      actual = "";
      continue;
    }
    actual += c;
  }
  partes.push(actual);
  return partes;
}

const emPixeis = (valor: string, unidade: string) => Number(valor) * (unidade === "rem" ? 16 : 1);

/** Esta variante está ligada neste contexto? */
function ligada(variante: string, ctx: Contexto): boolean {
  if (variante in CORTES_DA_JANELA) return ctx.janela >= CORTES_DA_JANELA[variante];

  const daJanela = /^min-\[(\d+(?:\.\d+)?)(px|rem)\]$/.exec(variante);
  if (daJanela) return ctx.janela >= emPixeis(daJanela[1], daJanela[2]);

  const doContentor = /^@min-\[(\d+(?:\.\d+)?)(px|rem)\]$/.exec(variante);
  if (doContentor) return ctx.contentor >= emPixeis(doContentor[1], doContentor[2]);

  throw new Error(
    `variante \`${variante}:\` desconhecida — a grelha só pode perguntar pela janela (\`sm:\`/\`lg:\`) ou pelo contentor (\`@min-[…]:\`)`,
  );
}

/**
 * Quantas colunas é que um `repeat(auto-fill, minmax(M, 1fr))` dá.
 *
 * É a conta do CSS Grid, e é a única forma de esta rede continuar a medir a
 * célula depois de a fase 07 trocar a escada de degraus por um `auto-fill`:
 * cabem `n` faixas de `M` px enquanto `n·M + (n−1)·gap ≤ largura`, e nunca
 * menos do que uma.
 */
function colunasDoAutoFill(minimo: number, largura: number): number {
  return Math.max(1, Math.floor((largura + GAP_DA_GRELHA) / (minimo + GAP_DA_GRELHA)));
}

/** As colunas que estão MESMO a valer neste contexto. */
function colunasEm(className: string, ctx: Contexto): number {
  let n = 0;
  for (const classe of className.split(/\s+/).filter(Boolean)) {
    const partes = separar(classe);
    const utilitario = partes.pop()!;
    const fixas = /^grid-cols-(\d+)$/.exec(utilitario);
    const auto = /^grid-cols-\[repeat\(auto-fill,minmax\((\d+)px,1fr\)\)\]$/.exec(utilitario);
    if (!fixas && !auto) {
      // Uma forma de `grid-cols-[…]` que esta rede não sabe resolver é uma
      // grelha que ela deixaria de medir em silêncio — que é exactamente o
      // defeito que a fez existir.
      if (/^grid-cols-\[/.test(utilitario)) {
        throw new Error(`\`${utilitario}\` não é uma forma que esta rede saiba resolver`);
      }
      continue;
    }
    if (!partes.every((v) => ligada(v, ctx))) continue;
    n = fixas ? Number(fixas[1]) : colunasDoAutoFill(Number(auto![1]), ctx.contentor);
  }
  if (n === 0) throw new Error(`a grelha não declara colunas nenhumas em ${JSON.stringify(ctx)}`);
  return n;
}

/** O lado da célula quadrada, em píxeis. */
const celula = (largura: number, colunas: number) =>
  (largura - GAP_DA_GRELHA * (colunas - 1)) / colunas;

describe("o resolvedor de classes desta rede (senão isto passava por vacuidade)", () => {
  it("liga a janela, o contentor, e mais nada", () => {
    expect(colunasEm("grid-cols-2 lg:grid-cols-6", { janela: 1023, contentor: 9999 })).toBe(2);
    expect(colunasEm("grid-cols-2 lg:grid-cols-6", { janela: 1024, contentor: 0 })).toBe(6);
    // O contentor decide SOZINHO: a janela pode ser enorme e a caixa estreita.
    expect(
      colunasEm("grid-cols-2 @min-[38rem]:grid-cols-5", { janela: 1440, contentor: 607 }),
    ).toBe(2);
    expect(colunasEm("grid-cols-2 @min-[38rem]:grid-cols-5", { janela: 375, contentor: 608 })).toBe(
      5,
    );
    expect(() =>
      colunasEm("grid-cols-2 aleatoria:grid-cols-9", { janela: 375, contentor: 0 }),
    ).toThrow(/aleatoria:/);
  });

  it("sabe onde vive a zona de largar em cada janela", () => {
    expect(JANELAS.map(zonaDeLargar)).toEqual([309, 558, 382, 798]);
  });
});

describe("a célula da grelha de fotos nunca desce abaixo do piso de 111 px", () => {
  it("aguenta 375, 640, 1024 e 1440 — e é o 1024 que caía", () => {
    const medido = JANELAS.map((janela) => {
      const largura = zonaDeLargar(janela);
      const colunas = colunasEm(GRELHA_DE_FOTOS, { janela, contentor: largura });
      return { janela, largura, colunas, celula: celula(largura, colunas) };
    });

    const abaixo = medido.filter((m) => m.celula < PISO_DA_CELULA);

    expect(
      abaixo.map(
        (m) =>
          `janela ${m.janela}: zona de largar ${m.largura} px ÷ ${m.colunas} colunas = célula de ${m.celula.toFixed(1)} px`,
      ),
      `a célula tem de comportar três alvos de 44 px, e o piso medido para isso são ${PISO_DA_CELULA} px (ver o comentário do \`GRELHA_DE_FOTOS\`). Tabela: ${medido
        .map((m) => `${m.janela}→${m.colunas}c/${m.celula.toFixed(1)}px`)
        .join(" · ")}`,
    ).toEqual([]);
  });

  it("e também não desce em nenhuma largura intermédia da zona de largar", () => {
    // Os degraus são do contentor, portanto o varrimento é do contentor: 240 px
    // (a zona de largar mais estreita que este back office consegue produzir,
    // num ecrã de 320) até aos 1070 do portátil largo, píxel a píxel.
    const maus: string[] = [];
    for (let largura = 240; largura <= 1200; largura++) {
      const colunas = colunasEm(GRELHA_DE_FOTOS, { janela: 1440, contentor: largura });
      const lado = celula(largura, colunas);
      if (lado < PISO_DA_CELULA)
        maus.push(`${largura} px → ${colunas} colunas → ${lado.toFixed(1)} px`);
    }
    expect(maus.slice(0, 5)).toEqual([]);
  });

  it("os degraus perguntam pelo CONTENTOR — nenhum deles pergunta pela janela", () => {
    // É esta a correcção: a célula depende da zona de largar, e a zona de largar
    // deixa de acompanhar a janela em `lg`, onde a navegação entra no fluxo.
    for (const classe of GRELHA_DE_FOTOS.split(/\s+/)) {
      const variantes = separar(classe).slice(0, -1);
      for (const v of variantes) {
        expect(
          v.startsWith("@"),
          `\`${classe}\` mede a janela; a célula desta grelha é decidida pela zona de largar`,
        ).toBe(true);
      }
    }
  });

  it("a zona de largar é mesmo um contentor — senão os `@min-[…]` não medem nada", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 3 }]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: many(1, 3, true), total: 3 }));

    renderTemas();
    await openFolder(/Terracotta/);

    const grelha = screen.getByRole("button", { name: "Acções da foto 2 de 3" });
    const contentor = grelha.closest('[class*="@container"]');
    expect(
      contentor,
      "as fotos vivem numa grelha com degraus `@min-[…]`, e um `@container` que não existe faz esses degraus medirem o elemento errado",
    ).not.toBeNull();
    // E é a zona de largar, não um invólucro qualquer lá em cima. A marca é o
    // `data-zona-de-largar` e não a classe `border-dashed`: desde a fase 07 o
    // tracejado só existe durante um arrasto (critério 8 do documento).
    expect(contentor!.hasAttribute("data-zona-de-largar")).toBe(true);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS OUTROS DOIS SÍTIOS QUE PERGUNTAVAM AO ECRÃ O QUE ERA DO CONTENTOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O mesmo engano do `GRELHA_DE_FOTOS`, em ponto pequeno e sem consequência
 * medida — mas é o engano que volta a crescer. Ficam presos aqui:
 *
 *  · o campo de procurar tinha `sm:w-72` dentro de uma `Toolbar` que já é
 *    `flex flex-wrap` e se parte sozinha. O que decide a largura da caixa é a
 *    fila onde ela está;
 *  · o formulário de criar tema tinha `sm:grid-cols-2` dentro de um `Card`. O
 *    cartão nunca tem a largura da janela: tira-lhe o `px` da vista, a moldura
 *    e o `p-4` dele, e a partir de `lg` mais os 256 px da barra lateral.
 */
describe("largura de contentor, não largura de ecrã", () => {
  /** Cinco temas: é o que faz a barra ganhar campo de procurar (`themes.length > 4`). */
  const cinco = Array.from({ length: 5 }, (_, i) => ({
    ...THEME,
    id: `t${i + 1}`,
    name: `Tema ${i + 1}`,
  }));

  it("o campo de procurar mede a fila da Toolbar, não a janela", async () => {
    route("GET /api/temas", () => ok(cinco));
    renderTemas();

    const campo = await screen.findByLabelText(/Procurar tema/);
    // A caixa `relative` do campo (a que ancora a lupa) é agora a mesma que
    // lhe dá a largura: o estado da vista passou a irmão dela na fila, e não
    // a filho de um invólucro comum. Ver a nota do `start` da barra.
    const caixa = campo.closest("div")!;

    expect(caixa.className).toContain("basis-72");
    expect(
      caixa.className,
      "a largura desta caixa é uma pergunta sobre a FILA em que ela está, e a `Toolbar` já embrulha sozinha",
    ).not.toMatch(/(^|\s)(sm|lg):w-/);
  });

  it("o formulário de criar tema mede o cartão, não a janela", async () => {
    route("GET /api/temas", () => ok(cinco));
    renderTemas();

    fireEvent.click(await screen.findByRole("button", { name: "Novo tema" }));

    const nome = await screen.findByLabelText(/Nome do tema/);
    const grelha = nome.closest('[class*="grid-cols-"]')!;

    expect(grelha.className).toContain("@min-[36rem]:grid-cols-2");
    expect(
      grelha.className,
      "duas colunas quando o CARTÃO as comporta — o cartão não tem a largura da janela",
    ).not.toMatch(/(^|\s)(sm|lg):grid-cols-/);
    expect(
      grelha.closest('[class*="@container"]'),
      "sem `@container` o `@min-[36rem]:` mede um contentor que não é este cartão",
    ).not.toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ECRÃ TEM DE DIZER O QUE FALHOU — não «não foi possível»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «nós tínhamos já imensos temas lá, e diz que não é possível
 * carregar os temas». Era esse o desenho: só um 503 punha uma instrução no
 * ecrã; TUDO o resto — sete das nove maneiras de esta leitura falhar — ia para
 * um toast que dizia «Não foi possível carregar os temas.» e desaparecia.
 *
 * Um toast é bom para «gravado»; é péssimo para uma instrução. Estes testes
 * prendem a regra nova: qualquer recusa fica NO ECRÃ, com o título e a frase
 * que a rota mandar — e quando não vem corpo nenhum (um 504 do intermediário, o
 * caso que nem a rota consegue explicar) fica lá o número da resposta, que é o
 * que ela cita a pedir ajuda.
 */
describe("quando a lista não vem, o ecrã diz porquê", () => {
  it("mostra o título e a frase que a rota mandou, e não um toast", async () => {
    route("GET /api/temas", () =>
      bad(503, {
        titulo: "A base de dados não respondeu",
        error: "O projecto pode estar em pausa. Abre o painel do Supabase e carrega em «Restore».",
      }),
    );

    renderTemas();
    await act(async () => {});

    expect(await screen.findByText("A base de dados não respondeu")).toBeInTheDocument();
    expect(screen.getByText(/Restore/)).toBeInTheDocument();
    // A frase antiga não pode voltar por porta nenhuma.
    expect(screen.queryByText(/Não foi possível carregar os temas/)).toBeNull();
    // E o ecrã não pode, por baixo do aviso, afirmar seja o que for sobre os
    // dados dela — nem «nunca tiveste temas» nem «estão todos arquivados».
    expect(screen.queryByText("Ainda não há temas")).toBeNull();
    expect(screen.queryByText(/Todos os temas estão arquivados/)).toBeNull();
  });

  it("um 500 com causa nomeada também fica no ecrã", async () => {
    route("GET /api/temas", () =>
      bad(500, {
        titulo: "Falha inesperada ao ler os temas",
        error: "Envia esta linha a quem trata da aplicação — XX000 HTTP 500: internal error.",
      }),
    );

    renderTemas();
    await act(async () => {});

    expect(await screen.findByText("Falha inesperada ao ler os temas")).toBeInTheDocument();
    expect(screen.getByText(/XX000/)).toBeInTheDocument();
  });

  it("sem corpo nenhum (504 do intermediário) diz na mesma o que se sabe", async () => {
    route("GET /api/temas", () => ({
      ok: false,
      status: 504,
      json: async () => {
        throw new SyntaxError("Unexpected token '<'");
      },
    }));

    renderTemas();
    await act(async () => {});

    expect(await screen.findByText("O servidor demorou demasiado")).toBeInTheDocument();
    expect(screen.getByText(/504/)).toBeInTheDocument();
    expect(screen.queryByText(/Não foi possível carregar os temas/)).toBeNull();
  });
});

describe("criar um tema com a instalação por acabar", () => {
  it("o impedimento vai para o cartão, com título e frase — não um cartão vazio", async () => {
    route("GET /api/temas", () => ok([]));
    route("POST /api/temas", () =>
      bad(503, {
        titulo: "Falta um passo de instalação",
        error: "A Biblioteca de Temas ainda não está criada na base de dados. Corre db/schema.sql.",
      }),
    );

    renderTemas();
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: "Novo tema" }));
    const campo = screen.getByLabelText(/Nome do tema/);
    fireEvent.change(campo, { target: { value: "Itália" } });
    await act(async () => {
      fireEvent.keyDown(campo, { key: "Enter" });
    });

    expect(await screen.findByText("Falta um passo de instalação")).toBeInTheDocument();
    expect(screen.getByText(/db\/schema\.sql/)).toBeInTheDocument();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE MUDOU DIZ-SE — E SÓ QUANDO NÃO SE VÊ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A regra da casa é não deixar ninguém sem saber se alguma coisa aconteceu. O
 * corolário é o que estes testes prendem: **quando o resultado não é visível no
 * sítio do gesto, tem de ser dito** — e quando é visível, cala-se, porque um
 * aviso a confirmar o que está à frente dos olhos ensina a ignorar avisos.
 *
 * Três gestos desta pasta ficavam do lado errado da linha, e o quarto ficava do
 * outro.
 */
describe("a pasta de um tema diz o que mudou", () => {
  it("remover UMA foto confirma, tal como remover várias", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 2 }]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: many(1, 2, true), total: 2 }));
    route("DELETE /api/temas/t1/imagens", () => ok({ ok: true }));

    renderTemas();
    await openFolder(/Terracotta/);

    await accaoDaFoto(1, 2, "Remover do tema…");
    await confirmarRemocao();

    // O buraco na grelha aparece no instante do clique, muito antes de o
    // servidor responder: é a frase que diz que a remoção PEGOU.
    expect(await screen.findByText("1 foto removida.")).toBeInTheDocument();
    // E o número é o das que saíram mesmo — não o das que estavam na grelha.
    expect(screen.queryByText("2 fotos removidas.")).toBeNull();
  });

  it("reordenar diz que a nova ordem ficou guardada, e em que lugar", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 3 }]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: many(1, 3, true), total: 3 }));

    renderTemas();
    await openFolder(/Terracotta/);

    await accaoDaFoto(2, 3, "Pôr no início");

    // A foto salta para o lugar novo no instante do arrasto; o que não se via
    // era se o servidor tinha ficado com ela lá.
    expect(
      await screen.findByText("Ordem guardada — a foto ficou na posição 1 de 3."),
      "reordenar continua a ser mudo quando corre bem",
    ).toBeInTheDocument();
  });

  it("uma segunda arrumação não empilha um segundo aviso igual", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 3 }]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: many(1, 3, true), total: 3 }));
    hold("PATCH /api/temas/t1");

    renderTemas();
    await openFolder(/Terracotta/);

    // Duas setas seguidas na mesma foto — o gesto de quem a empurra para o
    // fim da grelha. As duas gravam; só a ÚLTIMA fala.
    await accaoDaFoto(2, 3, "Pôr no início");
    await accaoDaFoto(3, 3, "Pôr no início");
    await releaseAll("PATCH /api/temas/t1");

    expect(screen.queryByText("Ordem guardada — a foto ficou na posição 1 de 3.")).not.toBeNull();
    expect(
      screen.queryAllByText("Ordem guardada — a foto ficou na posição 1 de 3."),
      "dois avisos iguais empilhados é o ruído que ensina a não os ler",
    ).toHaveLength(1);
  });

  it("renomear dentro da pasta cita o nome novo, como o renomear da lista", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));

    renderTemas();
    await openFolder(/Terracotta/);

    fireEvent.click(screen.getByRole("button", { name: "Terracotta" }));
    const campo = screen.getByLabelText("Nome do tema");
    fireEvent.change(campo, { target: { value: "Itália" } });
    await act(async () => {
      fireEvent.keyDown(campo, { key: "Enter" });
    });

    expect(await screen.findByText('"Terracotta" passou a "Itália"')).toBeInTheDocument();
    // A frase antiga não dizia QUAL tema nem o que lá ficou escrito.
    expect(screen.queryByText("Tema renomeado.")).toBeNull();
  });

  /**
   * A capa nova no CARTÃO, e não só na pasta.
   *
   * O cartão desenha quatro endereços da mesma fotografia — a derivada, o AVIF
   * que o `<picture>` oferece primeiro, o original de reserva e o borrão. A
   * troca mudava só o primeiro: o AVIF ficava da capa antiga e, como o
   * `<source>` ganha ao `<img>`, o cartão continuava a mostrá-la.
   */
  it("trocar a capa troca os quatro campos do cartão, não só o endereço", async () => {
    const comLqip = (n: number): ThemeImage => ({
      ...photo(n, true),
      lqip: `data:image/webp;base64,LQIP${n}`,
    });
    route("GET /api/temas", () =>
      ok([
        {
          ...THEME,
          imageCount: 2,
          coverUrl: "https://cdn.test/thumb-1.jpg",
          coverAvif: "https://cdn.test/avif-1.avif",
          coverFallbackUrl: "https://cdn.test/foto-1.jpg",
          coverLqip: "data:image/webp;base64,LQIP1",
        },
      ]),
    );
    route("GET /api/temas/t1/imagens", () =>
      ok({ ok: true, images: [comLqip(1), comLqip(2)], total: 2 }),
    );
    route("PATCH /api/temas/t1", () => ok({ ...THEME, coverPath: "t1/foto-2.jpg" }));

    renderTemas();
    await openFolder(/Terracotta/);
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 2 de 2" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Definir como capa" }));
    });
    // De volta à grelha dos cartões.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "← Temas" }));
    });

    const cartao = await acharCartaoDoTema(/Terracotta/);
    const img = cartao.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://cdn.test/thumb-2.jpg");
    // O AVIF da capa ANTIGA não pode continuar à frente da nova.
    expect(cartao.querySelector('source[type="image/avif"]')).toBeNull();
    expect(img.style.backgroundImage).toContain("LQIP2");
    // E o plano B é o original da NOVA.
    fireEvent.error(img);
    expect(img.getAttribute("src")).toBe("https://cdn.test/foto-2.jpg");
  });

  it("definir a capa NÃO diz nada — a etiqueta aparece na própria foto", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 2 }]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: many(1, 2, true), total: 2 }));

    renderTemas();
    await openFolder(/Terracotta/);

    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 2 de 2" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Definir como capa" }));
    });

    // O resultado está à vista, no sítio do gesto: a etiqueta na célula.
    expect(await screen.findByText("Capa")).toBeInTheDocument();
    // E por isso não há aviso nenhum a repetir o que já se lê.
    expect(screen.queryByText("Capa do tema definida.")).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * FASE 2 — OS MENUS DO TEMA E DA FOTOGRAFIA, PELA ORDEM DO DOCUMENTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Parte 3 do `docs/APPLE-TEMAS.md` e T3 do `PROPOSTAS-E-TEMAS-APPLE.md`. O
 * menu do tema tem oito itens em três grupos — ela respondeu «podes» a
 * encurtá-lo: saiu «Pré-visualizar» e ficou «Juntar a outro tema…» —, o
 * «Eliminar tema» sai do cabeçalho da pasta para o «⋯» dele, e os três itens
 * que só a pasta sabe fazer abrem-na a fazê-los.
 */
describe("Biblioteca de Temas — os menus da Fase 2", () => {
  const ORDEM_DO_TEMA = [
    "Abrir",
    "Adicionar fotografias…",
    "Renomear…",
    "Definir capa…",
    "Favorito",
    "Arquivar",
    "Juntar a outro tema…",
    "Eliminar tema…",
  ];

  const comFotos = (n = 3) => {
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: n }]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: many(1, n, true), total: n }));
  };

  it("o menu do tema tem oito itens em três grupos", async () => {
    comFotos();
    renderTemas();
    await acharCartaoDoTema(/Terracotta/);
    fireEvent.click(screen.getByRole("button", { name: "Acções de Terracotta" }));
    const menu = screen.getByRole("menu");
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(ORDEM_DO_TEMA);
    expect(ORDEM_DO_TEMA).toHaveLength(8);
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(2);
  });

  it("numa pasta vazia, «Definir capa…» esconde-se, e não há «Pré-visualizar»", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 0 }]));
    renderTemas();
    await acharCartaoDoTema(/Terracotta/);
    fireEvent.click(screen.getByRole("button", { name: "Acções de Terracotta" }));
    const itens = screen.getAllByRole("menuitem").map((m) => m.textContent);
    expect(itens).not.toContain("Pré-visualizar");
    expect(itens).not.toContain("Definir capa…");
    expect(itens[0]).toBe("Abrir");
  });

  it("um favorito diz «Tirar dos favoritos» — um item comutável, não dois", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 3, favorito: true }]));
    renderTemas();
    await acharCartaoDoTema(/Terracotta/);
    fireEvent.click(screen.getByRole("button", { name: "Acções de Terracotta" }));
    expect(screen.getByRole("menuitem", { name: "Tirar dos favoritos" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Favorito" })).toBeNull();
  });

  it("o cabeçalho da pasta não tem o botão «Eliminar tema»; o «⋯» dele tem", async () => {
    comFotos();
    renderTemas();
    await openFolder(/Terracotta/);
    expect(screen.queryByRole("button", { name: "Eliminar tema" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Acções de Terracotta" }));
    const itens = screen.getAllByRole("menuitem").map((m) => m.textContent);
    // A mesma lista do cartão, sem «Abrir» (já se está lá dentro).
    expect(itens).toEqual(ORDEM_DO_TEMA.filter((i) => i !== "Abrir"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Eliminar tema…" }));
    expect(await screen.findByText(/Eliminar o tema «Terracotta»/)).toBeTruthy();
  });

  it("Shift+F10 num cartão abre o mesmo menu, e o Escape devolve o foco ao cartão", async () => {
    comFotos();
    renderTemas();
    const cartao = await acharCartaoDoTema(/Terracotta/);
    cartao.focus();
    fireEvent.keyDown(cartao, { key: "F10", shiftKey: true });
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(ORDEM_DO_TEMA);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(cartao);
  });

  it("a tecla de menu numa fotografia abre o menu dela", async () => {
    comFotos();
    renderTemas();
    await openFolder(/Terracotta/);
    const celula = screen.getByRole("checkbox", { name: "Selecionar foto 2 de 3" });
    fireEvent.keyDown(celula, { key: "ContextMenu" });
    expect(screen.getByRole("menu", { name: "Acções de foto 2 de 3" })).toBeTruthy();
  });

  it("«Adicionar fotografias…» abre a pasta e o seletor de ficheiros", async () => {
    comFotos();
    const escolher = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    renderTemas();
    await acharCartaoDoTema(/Terracotta/);
    const item = accaoNoMenuDoTema(/Terracotta/, "Adicionar fotografias…");
    await act(async () => {
      fireEvent.click(item);
    });
    await screen.findByRole("button", { name: "Adicionar fotos" });
    expect(escolher).toHaveBeenCalledTimes(1);
    expect((escolher.mock.contexts[0] as HTMLInputElement).type).toBe("file");
  });

  it("«Renomear…» abre a pasta com o campo do nome", async () => {
    comFotos();
    renderTemas();
    await acharCartaoDoTema(/Terracotta/);
    const item = accaoNoMenuDoTema(/Terracotta/, "Renomear…");
    await act(async () => {
      fireEvent.click(item);
    });
    const campo = await screen.findByRole("textbox", { name: "Nome do tema" });
    expect((campo as HTMLInputElement).value).toBe("Terracotta");
  });

  it("«Definir capa…» abre a pasta a escolher a capa: um clique numa foto e está", async () => {
    comFotos();
    route("PATCH /api/temas/t1", () => ok({ ...THEME, coverPath: "t1/foto-2.jpg" }));
    renderTemas();
    await acharCartaoDoTema(/Terracotta/);
    const item = accaoNoMenuDoTema(/Terracotta/, "Definir capa…");
    await act(async () => {
      fireEvent.click(item);
    });
    expect(await screen.findByText("Escolhe a fotografia da capa.")).toBeTruthy();
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "Usar a foto 2 de 3 como capa" }));
    });
    const patch = requests.find((r) => routeKey(r.url, r.init) === "PATCH /api/temas/t1");
    expect(JSON.parse(String(patch?.init?.body))).toEqual({ coverPath: "t1/foto-2.jpg" });
    // O modo acaba, e a foto não ficou seleccionada pelo caminho.
    expect(screen.queryByText("Escolhe a fotografia da capa.")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Selecionar foto 2 de 3" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("no modo «escolher a capa», o Escape cancela sem mexer em nada", async () => {
    comFotos();
    renderTemas();
    await acharCartaoDoTema(/Terracotta/);
    const item = accaoNoMenuDoTema(/Terracotta/, "Definir capa…");
    await act(async () => {
      fireEvent.click(item);
    });
    await screen.findByText("Escolhe a fotografia da capa.");
    await act(async () => {});
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Escolhe a fotografia da capa.")).toBeNull();
    expect(callsTo("PATCH /api/temas/t1")).toBe(0);
  });

  it("menu da foto: «Abrir tamanho real» abre o original num separador novo", async () => {
    comFotos();
    const abrir = vi.spyOn(window, "open").mockReturnValue(null);
    renderTemas();
    await openFolder(/Terracotta/);
    fireEvent.contextMenu(
      screen.getByRole("checkbox", { name: "Selecionar foto 2 de 3" }).parentElement!,
      { clientX: 20, clientY: 20 },
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Abrir tamanho real" }));
    expect(abrir).toHaveBeenCalledWith(photo(2).url, "_blank", "noopener");
  });

  it("menu da foto: «Duplicar para…» abre a folha em «Copiar»", async () => {
    route("GET /api/temas", () =>
      ok([
        { ...THEME, imageCount: 3 },
        { ...THEME, id: "t2", name: "Zen", imageCount: 1 },
      ]),
    );
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: many(1, 3, true), total: 3 }));
    renderTemas();
    await openFolder(/Terracotta/);
    fireEvent.contextMenu(
      screen.getByRole("checkbox", { name: "Selecionar foto 2 de 3" }).parentElement!,
      { clientX: 20, clientY: 20 },
    );
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual([
      "Pré-visualizar",
      "Abrir tamanho real",
      "Mover para…",
      "Duplicar para…",
      "Definir como capa",
      "Pôr no início",
      "Remover do tema…",
    ]);
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Duplicar para…" }));
    });
    const folha = await screen.findByRole("dialog", { name: /foto selecionada/ });
    const modo = within(folha).getByRole("radiogroup", { name: "O que fazer" });
    expect(within(modo).getByRole("radio", { name: "Copiar" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});

/**
 * ── A PERGUNTA DE ELIMINAR DIZ OS NÚMEROS (T3) ────────────────────────────
 *
 * «Uma confirmação que diz quantas fotos e propostas são afectadas.» Dizia
 * «as propostas já feitas com estas fotos não são afectadas» — sem número.
 */
describe("Biblioteca de Temas — eliminar diz quantas fotos e propostas", () => {
  it("as frases, no singular e no plural, e os casos sem número", () => {
    expect(fraseDeEliminar({ imageCount: 5 }, 2)).toEqual({
      fotos: "Leva 5 fotografias com ele.",
      propostas: "Está em 2 propostas — essas guardam as fotos que usam e não mudam.",
    });
    expect(fraseDeEliminar({ imageCount: 1 }, 1)).toEqual({
      fotos: "Leva 1 fotografia com ele.",
      propostas: "Está em 1 proposta — essa guarda as fotos que usa e não muda.",
    });
    // Nenhuma proposta: não há nada a dizer sobre elas.
    expect(fraseDeEliminar({ imageCount: 5 }, 0).propostas).toBeNull();
    // A contagem truncada é um mínimo; a pasta ilegível não tem número.
    expect(fraseDeEliminar({ imageCount: 500, truncated: true }, 0).fotos).toBe(
      "Leva 500+ fotografias com ele.",
    );
    expect(fraseDeEliminar({ imageCount: null }, 0).fotos).toBe(
      "As fotografias que estiverem lá dentro vão com ele.",
    );
    expect(fraseDeEliminar({ imageCount: 0 }, 0).fotos).toMatch(/vazia/);
    // Sem a contagem de usos, fica a frase de antes — que continua verdadeira.
    expect(fraseDeEliminar({ imageCount: 5 }, null).propostas).toBe(
      "As propostas já feitas com estas fotos não são afectadas.",
    );
  });

  it("a confirmação mostra N fotografias e M propostas, e que fica na Reciclagem", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 7 }]));
    route("GET /api/temas/uso", () => ok({ ok: true, usos: { t1: 3 } }));
    renderTemas();
    await acharCartaoDoTema(/Terracotta/);
    // O número de propostas já chegou ao cartão.
    await screen.findByText(/3 propostas/);
    fireEvent.click(accaoNoMenuDoTema(/Terracotta/, "Eliminar tema…"));
    const caixa = await screen.findByRole("dialog");
    expect(within(caixa).getByText("Leva 7 fotografias com ele.")).toBeTruthy();
    expect(
      within(caixa).getByText("Está em 3 propostas — essas guardam as fotos que usam e não mudam."),
    ).toBeTruthy();
    expect(
      within(caixa).getByText("Fica 30 dias na Reciclagem, de onde pode voltar."),
    ).toBeTruthy();
  });
});
