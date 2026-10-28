// @vitest-environment jsdom
import { useState, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MAX_IMPORT_BATCH, THEME_PAGE_SIZE, type ThemeSummary } from "@/lib/theme-types";
import { ToastProvider } from "./Toast";
import ThemePicker, { __resetThemePickerState } from "./ThemePicker";
import { MARCA_DA_CAMADA } from "./useCamadaDeHistoria";

/**
 * Rede de segurança do seletor da Biblioteca de Temas.
 *
 * O que se fixa aqui é o que a Catarina sente: o teto das 40 fotos tem de ser
 * visível ANTES do clique (antes, escolhia 60 e só o servidor dizia que não);
 * nas capas escolhe-se UMA foto (a segunda substitui a primeira, não se
 * acumula); e uma importação falhada não pode perder a seleção feita à mão.
 *
 * A partir do momento em que um tema pode ter milhares de fotos, fixa-se
 * também a ESCALA: abre-se uma página (não a pasta toda), a grelha mostra a
 * miniatura, os gestos em bloco param no teto em vez de o ultrapassarem em
 * silêncio, e reabrir o diálogo não custa pedido nenhum.
 *
 * E fixa-se o que mudou de sítio: a CÓPIA já não acontece dentro do diálogo.
 * O botão fecha-o no instante em que é premido e o lote continua a caminho —
 * por isso os testes de importação verificam três coisas que antes não
 * existiam: o diálogo desaparece já, o lote sobrevive ao diálogo desaparecer,
 * e disparar duas vezes não importa a dobrar.
 */

// ── Servidor de mentira ────────────────────────────────────────────────────
// Uma resposta por `MÉTODO /caminho`; o que não estiver registado rebenta o
// teste em vez de ir à rede. O URL completo chega ao handler para se poder
// honrar a paginação (`?offset=&limit=`), que é o que está em causa.
// `headers` faz parte da resposta e não estava aqui — o duplo mentia sobre a
// forma de uma `Response`. Quando a cache do seletor passou a ler o `ETag`
// para o pedido condicional seguinte, o `res.headers` era `undefined` e a
// biblioteca deixava de abrir: 26 testes vermelhos por uma propriedade que o
// duplo devia ter desde sempre.
type Res = {
  ok: boolean;
  status: number;
  headers: { get: (nome: string) => string | null };
  json: () => Promise<unknown>;
};
type Handler = (url: string, init?: RequestInit) => Res | Promise<Res>;
const semCabecalhos = { get: () => null };
const ok = (body: unknown): Res => ({
  ok: true,
  status: 200,
  headers: semCabecalhos,
  json: async () => body,
});
const bad = (status: number, body: unknown): Res => ({
  ok: false,
  status,
  headers: semCabecalhos,
  json: async () => body,
});

let routes: Map<string, Handler>;
/** Todos os URLs pedidos, pela ordem — é aqui que se vê o que foi assinado. */
let calls: string[];
/** Os corpos enviados à rota de importação, pela ordem. */
let imported: string[][];

function route(key: string, handler: Handler) {
  routes.set(key, handler);
}

// ── Dados ──────────────────────────────────────────────────────────────────
const T0 = "2026-01-01T00:00:00.000Z";
const THEME: ThemeSummary = {
  id: "t1",
  name: "Terracotta",
  notes: "",
  createdAt: T0,
  updatedAt: T0,
  imageCount: 41,
};

interface Photo {
  path: string;
  url: string;
  thumbUrl?: string;
  largura?: number;
  altura?: number;
}

/** A pasta do lado do servidor. Cada teste dimensiona-a antes de renderizar. */
let photos: Photo[];
/** Caminhos que a rota de importação recusa copiar. */
let flaky: Set<string>;

/** Uma pasta com `n` fotos; a `withThumbs` diz quais já têm miniatura. */
function folder(n: number, withThumbs: (i: number) => boolean = () => true, tema = "t1"): Photo[] {
  return Array.from({ length: n }, (_, i) => ({
    path: `${tema}/foto-${i + 1}.jpg`,
    url: `https://cdn.test/${tema}-foto-${i + 1}.jpg`,
    ...(withThumbs(i) ? { thumbUrl: `https://cdn.test/${tema}-thumb-${i + 1}.jpg` } : {}),
  }));
}

/** Uma foto a mais do que o lote máximo, para se poder bater no teto. */
const TOTAL = MAX_IMPORT_BATCH + 1;

const onClose = vi.fn();
const onPicked = vi.fn();
const onReserve = vi.fn();
const onDropped = vi.fn();

/** Todos os marcadores reservados, pela ordem por que o estúdio os recebeu. */
function reservados(): { marcador: string; thumbUrl?: string; sourcePath: string }[] {
  return onReserve.mock.calls.flatMap((c) => c[0]);
}

/**
 * O seletor como o estúdio o monta: aberto enquanto for preciso, DESMONTADO
 * quando fecha. É o que torna verificável a promessa nova — o lote continua a
 * caminho mesmo sem diálogo nenhum na árvore.
 */
function Host({
  multiple,
  usedThemePaths,
  usadasNoutras,
  paginaEmConstrucao,
  lugar,
}: {
  multiple: boolean;
  usedThemePaths?: string[];
  usadasNoutras?: Record<string, string>;
  paginaEmConstrucao?: ComponentProps<typeof ThemePicker>["paginaEmConstrucao"];
  lugar?: ComponentProps<typeof ThemePicker>["lugar"];
}) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <ThemePicker
      quoteId="LQ-001"
      multiple={multiple}
      usedThemePaths={usedThemePaths}
      usadasNoutras={usadasNoutras}
      paginaEmConstrucao={paginaEmConstrucao}
      lugar={lugar}
      onClose={() => {
        onClose();
        setOpen(false);
      }}
      onPicked={onPicked}
      onReserve={onReserve}
      onDropped={onDropped}
    />
  );
}

/** Abre o seletor e espera pela grelha de fotos. */
async function openPicker(
  multiple: boolean,
  usedThemePaths?: string[],
  usadasNoutras?: Record<string, string>,
  paginaEmConstrucao?: ComponentProps<typeof ThemePicker>["paginaEmConstrucao"],
) {
  const montado = render(
    <ToastProvider>
      <Host
        multiple={multiple}
        usedThemePaths={usedThemePaths}
        usadasNoutras={usadasNoutras}
        paginaEmConstrucao={paginaEmConstrucao}
      />
    </ToastProvider>,
  );
  await screen.findByRole("button", { name: `Foto 1 de ${visible()}` });
  // Devolvido para os testes que precisam de FECHAR e reabrir — é aí que se vê
  // se a cache entre aberturas funciona.
  return montado;
}

/** Quantas fotos a grelha mostra: uma página, ou a pasta toda se for menor. */
function visible(): number {
  return Math.min(photos.length, THEME_PAGE_SIZE);
}

/** A célula da foto `n` (nome acessível estável; o estado vive no aria-pressed). */
function photo(n: number, suffix = "", count = visible()) {
  return screen.getByRole("button", { name: `Foto ${n} de ${count}${suffix}` });
}

function cells() {
  return screen.getAllByRole("button", { name: /^Foto \d+ de \d+/ });
}

/** O botão que fecha o diálogo a adicionar (mostra sempre quantas vão). */
/**
 * O botão que escolhe tudo o que já desceu.
 *
 * Chamava-se «Selecionar todas as visíveis» e era ambíguo — palavras dela:
 * «seleciona as visíveis no ecrã ou todas as do tema?». O rótulo passa a dizer
 * o número e de onde ele vem, e muda com o estado; por isso aqui procura-se
 * pela FORMA e não pelo texto exacto.
 */
function escolherTodasAsMostradas() {
  return screen.getByRole("button", { name: /^Escolher as \d+ (deste tema|já mostradas)$/ });
}

function addAndClose(n: number) {
  // «Adicionar 4 fotos»: o que se confirma é uma quantidade, e vê-la no botão é
  // a última hipótese de dar por um engano antes de as fotos entrarem.
  return screen.getByRole("button", { name: `Adicionar ${n} ${n === 1 ? "foto" : "fotos"}` });
}
function addAndStay(n: number) {
  return screen.getByRole("button", { name: `Adicionar ${n} e escolher mais` });
}

function importCalls() {
  return calls.filter((u) => u.includes("/assets/importar"));
}

beforeEach(() => {
  onClose.mockReset();
  onPicked.mockReset();
  onReserve.mockReset();
  onDropped.mockReset();
  localStorage.clear();
  // A cache da biblioteca e os lotes em curso vivem no módulo: sem isto um
  // teste abria com as fotos do anterior.
  act(() => __resetThemePickerState());
  routes = new Map();
  calls = [];
  imported = [];
  photos = folder(TOTAL, () => false); // por omissão: fotos antigas, sem miniatura
  flaky = new Set();

  route("GET /api/temas", () => ok([THEME]));
  route("GET /api/temas/t1/imagens", (url) => {
    const q = new URL(url, "http://test").searchParams;
    const offset = Number(q.get("offset") ?? 0);
    const limit = Number(q.get("limit") ?? THEME_PAGE_SIZE);
    return ok({
      ok: true,
      images: photos.slice(offset, offset + limit),
      total: photos.length,
      truncated: false,
    });
  });
  route("POST /api/orcamento/LQ-001/assets/importar", (_url, init) => {
    const paths: string[] = JSON.parse(String(init?.body ?? "{}")).paths ?? [];
    imported.push(paths);
    const failed = paths.filter((p) => flaky.has(p));
    const images = paths
      .filter((p) => !flaky.has(p))
      .map((p) => ({ path: `LQ-001/copia-${p.split("/")[1]}`, url: `https://cdn.test/${p}` }));
    if (images.length === 0) return bad(502, { error: "Falha ao importar as imagens." });
    return ok({ ok: true, images, requested: paths.length, failed });
  });

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const key = `${(init?.method ?? "GET").toUpperCase()} ${url.split("?")[0]}`;
      const handler = routes.get(key);
      if (!handler) return Promise.reject(new Error(`rota não simulada: ${key}`));
      calls.push(url);
      // O `signal` é honrado de propósito. Um duplo que o ignora deixa passar
      // um "Parar" que na realidade não corta nada: a promessa resolve à mesma
      // e o teste conclui que a foto entrou. Aqui, abortar rejeita — como no
      // browser.
      const sinal = init?.signal;
      const resposta = Promise.resolve(handler(url, init));
      if (!sinal) return resposta;
      if (sinal.aborted) {
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }
      return new Promise((resolve, reject) => {
        sinal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        resposta.then(resolve, reject);
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  act(() => __resetThemePickerState());
  vi.unstubAllGlobals();
});

/**
 * Faz o `useMedida` (e o `useAdaptativo` do `FolhaOuDialogo`) responderem que o
 * ecrã é largo. Sem isto o jsdom não tem `matchMedia` nenhum, tudo dá `false` e
 * o que se desenha é a FOLHA — que é o caso por omissão de propósito, mas não
 * serve para afirmar nada sobre o computador.
 */
function ecraLargo() {
  vi.stubGlobal(
    "matchMedia",
    (consulta: string) =>
      ({
        matches: true,
        media: consulta,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

/**
 * O botão de adicionar.
 *
 * O rótulo passou a trazer a CONTAGEM ("Adicionar 5 fotos") — antes dizia
 * sempre "Adicionar à proposta" e, ao lado do "Cancelar", lia-se como
 * desactivado mesmo com fotos escolhidas. Os testes procuram os dois.
 */
describe("ThemePicker", () => {
  it("trava a seleção nas 40 fotos e explica o limite", async () => {
    await openPicker(true);

    // A meio do caminho o rodapé passa a contar para o teto.
    for (let n = 1; n <= MAX_IMPORT_BATCH / 2; n++) fireEvent.click(photo(n));
    expect(
      screen.getByText(`${MAX_IMPORT_BATCH / 2} de ${MAX_IMPORT_BATCH} fotos selecionadas`),
    ).toBeInTheDocument();

    // Tocar nas 41 → ficam 40; a 41.ª nem sequer entra.
    for (let n = MAX_IMPORT_BATCH / 2 + 1; n <= TOTAL; n++) fireEvent.click(photo(n));

    expect(
      screen.getByText(`${MAX_IMPORT_BATCH} de ${MAX_IMPORT_BATCH} fotos selecionadas`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Podes adicionar até ${MAX_IMPORT_BATCH} fotos de cada vez.`),
    ).toBeInTheDocument();
    expect(photo(TOTAL)).toHaveAttribute("aria-pressed", "false");
    // As que sobram ficam anunciadas como indisponíveis (mas alcançáveis).
    expect(photo(TOTAL)).toHaveAttribute("aria-disabled", "true");
    expect(photo(1)).not.toHaveAttribute("aria-disabled");

    // Tirar uma abre lugar outra vez e o aviso desaparece.
    fireEvent.click(photo(1));
    expect(
      screen.queryByText(`Podes adicionar até ${MAX_IMPORT_BATCH} fotos de cada vez.`),
    ).not.toBeInTheDocument();
    fireEvent.click(photo(TOTAL));
    expect(photo(TOTAL)).toHaveAttribute("aria-pressed", "true");
    // 41 cliques numa grelha de 41 células = 41 renderizações completas do
    // diálogo. Não é lento por acidente, é o que este teste faz — e os 5 s por
    // omissão não chegam num runner de CI partilhado.
  }, 20_000);

  it("nas capas (uma só foto) a segunda escolha substitui a primeira", async () => {
    await openPicker(false);

    fireEvent.click(photo(1));
    fireEvent.click(photo(2));

    expect(photo(1)).toHaveAttribute("aria-pressed", "false");
    expect(photo(2)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 foto selecionada")).toBeInTheDocument();
    // O botão diz sempre quantas vão — e só está desligado sem seleção.
    expect(addAndClose(1)).toBeEnabled();
  });

  // ── A importação otimista ────────────────────────────────────────────────

  it("adicionar fecha o diálogo JÁ e a cópia continua sem ele", async () => {
    photos = folder(6);
    // A rota fica presa até se abrir o portão: se alguma coisa no ecrã
    // dependesse da resposta, este teste apanhava-a.
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const real = routes.get("POST /api/orcamento/LQ-001/assets/importar")!;
    route("POST /api/orcamento/LQ-001/assets/importar", async (url, init) => {
      await gate;
      return real(url, init);
    });

    await openPicker(true);
    fireEvent.click(photo(1));
    fireEvent.click(photo(2));
    fireEvent.click(photo(3));
    fireEvent.click(addAndClose(3));

    // Sem esperar por nada: o diálogo já não está cá.
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Não há barra de progresso NENHUMA a segurar o diálogo (um lote pequeno
    // nem sequer a mostra fora dele).
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    // O que se vê é uma pastilha discreta, na proposta, com as miniaturas que
    // já estavam em memória — zero pedidos novos para as ver.
    const chip = screen.getByRole("group", { name: "Fotos a caminho da proposta" });
    expect(chip).toHaveTextContent("A adicionar 3 fotos à proposta…");
    expect(chip.querySelector("img")).toHaveAttribute("src", "https://cdn.test/t1-thumb-1.jpg");
    expect(onPicked).not.toHaveBeenCalled();

    // A cópia sobreviveu ao diálogo: quando chega, entrega ao estúdio.
    release();
    await waitFor(() => expect(onPicked).toHaveBeenCalledTimes(1));
    expect(onPicked.mock.calls[0][0]).toHaveLength(3);
    // Cada cópia sabe de que foto da biblioteca veio — é o que permite dizer
    // "já nesta proposta" da próxima vez.
    expect(onPicked.mock.calls[0][0][0]).toMatchObject({
      path: "LQ-001/copia-foto-1.jpg",
      sourcePath: "t1/foto-1.jpg",
    });
    await waitFor(() => expect(chip).toHaveTextContent("3 fotos adicionadas à proposta."));
  });

  it("disparar duas vezes não importa a dobrar", async () => {
    photos = folder(10);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const real = routes.get("POST /api/orcamento/LQ-001/assets/importar")!;
    route("POST /api/orcamento/LQ-001/assets/importar", async (url, init) => {
      await gate;
      return real(url, init);
    });

    await openPicker(true);
    fireEvent.click(photo(1));
    fireEvent.click(photo(2));

    // Duplo clique no mesmo botão (o "continuar" mantém o diálogo de pé).
    const botao = addAndStay(2);
    fireEvent.click(botao);
    fireEvent.click(botao);
    expect(importCalls()).toHaveLength(1);

    // E as que já vão a caminho não voltam a ser escolhíveis: o toque é
    // ignorado em silêncio, e os gestos em bloco saltam-nas.
    expect(photo(1, " (a adicionar)")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(photo(1, " (a adicionar)"));
    expect(photo(1, " (a adicionar)")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(escolherTodasAsMostradas());
    expect(screen.getByText("8 fotos selecionadas")).toBeInTheDocument();
    fireEvent.click(addAndStay(8));

    release();
    await waitFor(() => expect(onPicked).toHaveBeenCalledTimes(2));
    // Duas viagens, oito caminhos cada uma no máximo, e nenhuma repetição.
    const enviados = imported.flat();
    expect(enviados).toHaveLength(10);
    expect(new Set(enviados).size).toBe(10);
    expect(imported[0]).toEqual(["t1/foto-1.jpg", "t1/foto-2.jpg"]);
  });

  it("uma falha avisa fora do diálogo e não perde a seleção", async () => {
    photos = folder(6);
    route("POST /api/orcamento/LQ-001/assets/importar", () =>
      bad(500, { error: "Não foi possível copiar as fotos." }),
    );
    await openPicker(true);

    fireEvent.click(photo(1));
    fireEvent.click(addAndClose(1));

    const chip = await screen.findByRole("group", { name: "Fotos a caminho da proposta" });
    await waitFor(() => expect(chip).toHaveTextContent("1 foto não entrou na proposta."));
    expect(chip).toHaveTextContent("Não foi possível copiar as fotos.");
    expect(screen.getByRole("button", { name: "Repetir" })).toBeInTheDocument();
    expect(onPicked).not.toHaveBeenCalled();

    // Reabrir traz a seleção de volta, marcada — não se escolhe tudo de novo.
    cleanup();
    render(
      <ToastProvider>
        <Host multiple />
      </ToastProvider>,
    );
    const falhada = await screen.findByRole("button", { name: "Foto 1 de 6 (não entrou)" });
    expect(falhada).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 foto selecionada")).toBeInTheDocument();
  });

  // ── O lugar guardado no instante do clique ───────────────────────────────
  //
  // O estúdio precisa de pôr a foto no mood board JÁ, e a cópia demora. O que
  // sai daqui nesse instante é um MARCADOR por foto — `pending:<uuid>`, que
  // não é caminho de coisa nenhuma —, e é ele que volta dentro da cópia
  // confirmada para o estúdio saber que lugar trocar. Quem não pede reserva
  // continua a receber só o `onPicked` de antes, a acrescentar.

  it("reserva o lugar de cada foto no instante do clique e devolve-o com o caminho", async () => {
    photos = folder(3);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const real = routes.get("POST /api/orcamento/LQ-001/assets/importar")!;
    route("POST /api/orcamento/LQ-001/assets/importar", async (url, init) => {
      await gate;
      return real(url, init);
    });

    await openPicker(true);
    fireEvent.click(photo(1));
    fireEvent.click(photo(2));
    fireEvent.click(photo(3));
    fireEvent.click(addAndClose(3));

    // Sem esperar por nada: os três lugares já estão guardados, com a
    // miniatura que a grelha JÁ desenhou (nenhum pedido novo para a ver).
    expect(onReserve).toHaveBeenCalledTimes(1);
    const lugares = reservados();
    expect(lugares).toHaveLength(3);
    expect(lugares.map((r) => r.sourcePath)).toEqual([
      "t1/foto-1.jpg",
      "t1/foto-2.jpg",
      "t1/foto-3.jpg",
    ]);
    expect(lugares[0].thumbUrl).toBe("https://cdn.test/t1-thumb-1.jpg");
    // Marcadores, não caminhos — e todos diferentes.
    expect(lugares.every((r) => r.marcador.startsWith("pending:"))).toBe(true);
    expect(new Set(lugares.map((r) => r.marcador)).size).toBe(3);
    expect(onPicked).not.toHaveBeenCalled();

    // A cópia confirma e cada foto diz que lugar vem ocupar.
    release();
    await waitFor(() => expect(onPicked).toHaveBeenCalledTimes(1));
    expect(onPicked.mock.calls[0][0]).toEqual(
      lugares.map((r, i) =>
        expect.objectContaining({
          path: `LQ-001/copia-foto-${i + 1}.jpg`,
          sourcePath: r.sourcePath,
          marcador: r.marcador,
        }),
      ),
    );
    expect(onDropped).not.toHaveBeenCalled();
  });

  it("a foto que não entra devolve o lugar, e o Repetir guarda um lugar NOVO", async () => {
    photos = folder(4);
    flaky = new Set(["t1/foto-2.jpg"]);
    await openPicker(true);

    fireEvent.click(photo(1));
    fireEvent.click(photo(2));
    fireEvent.click(addAndClose(2));

    const primeiros = reservados();
    expect(primeiros).toHaveLength(2);

    // A que falhou larga o lugar; a que entrou fica com o dela.
    await waitFor(() => expect(onDropped).toHaveBeenCalledTimes(1));
    expect(onDropped.mock.calls[0][0]).toEqual([primeiros[1].marcador]);
    expect(onPicked.mock.calls[0][0]).toEqual([
      expect.objectContaining({ sourcePath: "t1/foto-1.jpg", marcador: primeiros[0].marcador }),
    ]);

    // À segunda vai — com um lugar NOVO, porque o anterior já saiu do documento.
    flaky.clear();
    fireEvent.click(await screen.findByRole("button", { name: "Repetir" }));
    await waitFor(() => expect(onReserve).toHaveBeenCalledTimes(2));
    const segundo = onReserve.mock.calls[1][0];
    expect(segundo).toEqual([expect.objectContaining({ sourcePath: "t1/foto-2.jpg" })]);
    expect(segundo[0].marcador).not.toBe(primeiros[1].marcador);
    await waitFor(() =>
      expect(onPicked.mock.calls.at(-1)?.[0]).toEqual([
        expect.objectContaining({ sourcePath: "t1/foto-2.jpg", marcador: segundo[0].marcador }),
      ]),
    );
  });

  it("o Parar devolve os lugares das fotos que ficaram por copiar", async () => {
    photos = folder(20);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const real = routes.get("POST /api/orcamento/LQ-001/assets/importar")!;
    route("POST /api/orcamento/LQ-001/assets/importar", async (url, init) => {
      await gate;
      return real(url, init);
    });

    await openPicker(true);
    fireEvent.click(escolherTodasAsMostradas());
    fireEvent.click(addAndClose(20));
    const lugares = reservados();
    expect(lugares).toHaveLength(20);

    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    release();

    // Parar corta TAMBÉM o lote que ia a caminho — senão, com um lote só (o
    // caso comum, 8 fotos ou menos), o botão não parava rigorosamente nada.
    // Portanto os 20 lugares saem todos: nenhum vai receber foto, e um
    // marcador que ninguém vai trocar não pode ficar no documento.
    await waitFor(() => expect(onDropped).toHaveBeenCalled());
    await waitFor(() => expect(onDropped.mock.calls.flatMap((c) => c[0])).toHaveLength(20));
    expect(onDropped.mock.calls.flatMap((c) => c[0]).sort()).toEqual(
      lugares.map((r) => r.marcador).sort(),
    );
    expect(onPicked).not.toHaveBeenCalled();
  });

  it("o Parar funciona com UM lote — o caso em que ele era decorativo", async () => {
    // A regressão que este teste fixa: a paragem era lida só ENTRE lotes. Com
    // 5 fotos há um lote só, portanto a verificação já tinha passado quando o
    // botão aparecia e carregar nele não fazia nada — decorativo exactamente
    // no caso mais comum. Só falha se o pedido em voo deixar de ser cortado.
    photos = folder(5);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const real = routes.get("POST /api/orcamento/LQ-001/assets/importar")!;
    route("POST /api/orcamento/LQ-001/assets/importar", async (url, init) => {
      await gate;
      return real(url, init);
    });

    await openPicker(true);
    fireEvent.click(escolherTodasAsMostradas());
    fireEvent.click(addAndClose(5));
    expect(reservados()).toHaveLength(5);

    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    release();

    const chip = screen.getByRole("group", { name: "Fotos a caminho da proposta" });
    await waitFor(() => expect(chip).toHaveTextContent("Parou — 5 fotos ficaram por adicionar."));
    expect(onPicked).not.toHaveBeenCalled();
    await waitFor(() => expect(onDropped.mock.calls.flatMap((c) => c[0])).toHaveLength(5));
  });

  it("num lote grande a pastilha mostra progresso — e o Parar guarda o que já entrou", async () => {
    photos = folder(30);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const real = routes.get("POST /api/orcamento/LQ-001/assets/importar")!;
    route("POST /api/orcamento/LQ-001/assets/importar", async (url, init) => {
      await gate;
      return real(url, init);
    });

    await openPicker(true);
    fireEvent.click(escolherTodasAsMostradas());
    fireEvent.click(addAndClose(30));

    // O diálogo saiu; a barra ficou na proposta, fora dele.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "Progresso da importação" });
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "30");

    // Parar corta o que falta E o que ia a caminho: nenhuma das 30 entra, e a
    // pastilha guarda-as todas para o "Repetir" — nada se perde, só não entrou.
    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    release();
    const chip = screen.getByRole("group", { name: "Fotos a caminho da proposta" });
    await waitFor(() => expect(chip).toHaveTextContent("Parou — 30 fotos ficaram por adicionar."));
    expect(onPicked).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Repetir" })).toBeInTheDocument();
  });

  it("depois de uma falha parcial o Repetir só volta a tentar o que falhou", async () => {
    photos = folder(20);
    flaky = new Set(["t1/foto-3.jpg"]);
    await openPicker(true);

    for (let n = 1; n <= 10; n++) fireEvent.click(photo(n));
    fireEvent.click(addAndClose(10));

    const chip = await screen.findByRole("group", { name: "Fotos a caminho da proposta" });
    await waitFor(() => expect(chip).toHaveTextContent("1 foto não entrou na proposta."));
    expect(onPicked.mock.calls.flatMap((c) => c[0])).toHaveLength(9);

    // À segunda vai: repete-se só a foto que ficou para trás.
    flaky.clear();
    onPicked.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Repetir" }));
    await waitFor(() => expect(onPicked).toHaveBeenCalledTimes(1));
    expect(onPicked.mock.calls[0][0]).toEqual([
      expect.objectContaining({ sourcePath: "t1/foto-3.jpg" }),
    ]);
    expect(imported[imported.length - 1]).toEqual(["t1/foto-3.jpg"]);
  });

  // ── Escala ───────────────────────────────────────────────────────────────

  it("abre um tema grande com UMA página e vai buscar as seguintes a pedido", async () => {
    photos = folder(150);
    await openPicker(true);

    // Só a primeira página está no ecrã — e só ela foi pedida (= assinada).
    expect(cells()).toHaveLength(THEME_PAGE_SIZE);
    expect(calls.filter((u) => u.includes("/imagens"))).toEqual([
      `/api/temas/t1/imagens?offset=0&limit=${THEME_PAGE_SIZE}`,
    ]);

    // O botão diz quantas faltam, e a página seguinte junta-se à grelha.
    fireEvent.click(screen.getByRole("button", { name: `Mostrar mais (faltam 90)` }));
    await waitFor(() => expect(cells()).toHaveLength(THEME_PAGE_SIZE * 2));
    expect(calls).toContain(
      `/api/temas/t1/imagens?offset=${THEME_PAGE_SIZE}&limit=${THEME_PAGE_SIZE}`,
    );

    // A terceira página fecha a pasta e o botão desaparece.
    fireEvent.click(screen.getByRole("button", { name: "Mostrar mais (faltam 30)" }));
    await waitFor(() => expect(cells()).toHaveLength(150));
    expect(screen.queryByRole("button", { name: /Mostrar mais/ })).not.toBeInTheDocument();
  });

  it("reabrir na mesma sessão não pede nada e volta ao mesmo tema e ao mesmo sítio", async () => {
    photos = folder(150);
    await openPicker(true);
    fireEvent.click(screen.getByRole("button", { name: /Mostrar mais/ }));
    await waitFor(() => expect(cells()).toHaveLength(THEME_PAGE_SIZE * 2));
    const antes = calls.length;

    cleanup();
    render(
      <ToastProvider>
        <Host multiple />
      </ToastProvider>,
    );

    // Sem esperar: a grelha está desenhada, com as duas páginas que ela já
    // tinha mandado vir, e sem uma única viagem nova.
    expect(cells()).toHaveLength(THEME_PAGE_SIZE * 2);
    expect(calls).toHaveLength(antes);
  });

  it("o rato a passar pelo botão que abre a biblioteca já a manda vir", async () => {
    photos = folder(6);
    // O botão vive no estúdio de propostas, não aqui: o seletor apanha o gesto
    // por delegação (pelo nome, ou por `data-biblioteca-temas`).
    render(
      <button type="button" data-teste="abrir">
        Escolher da biblioteca de temas
      </button>,
    );
    fireEvent.pointerOver(screen.getByRole("button", { name: /biblioteca de temas/ }));

    await waitFor(() => expect(calls).toContain("/api/temas"));
    await waitFor(() =>
      expect(calls).toContain(`/api/temas/t1/imagens?offset=0&limit=${THEME_PAGE_SIZE}`),
    );
    const antes = calls.length;

    // Quando ela clica mesmo, o diálogo abre com as fotos e sem pedir nada.
    cleanup();
    render(
      <ToastProvider>
        <Host multiple />
      </ToastProvider>,
    );
    expect(cells()).toHaveLength(6);
    expect(calls).toHaveLength(antes);
  });

  it("mostra a miniatura e cai no original nas fotos que ainda não a têm", async () => {
    photos = folder(4, (i) => i === 0); // só a primeira tem miniatura
    await openPicker(true);

    // A miniatura aparece já; a que não tem uma espera pela vez na fila dos
    // originais (aqui há vagas de sobra, por isso é o tempo de uma renderização).
    expect(photo(1).querySelector("img")).toHaveAttribute("src", "https://cdn.test/t1-thumb-1.jpg");
    await waitFor(() =>
      expect(photo(2).querySelector("img")).toHaveAttribute(
        "src",
        "https://cdn.test/t1-foto-2.jpg",
      ),
    );
  });

  it("as fotos sem miniatura entram numa fila — a que está à vista não espera pelas outras", async () => {
    // O caso da biblioteca antiga: 60 fotos, cada uma com o seu original de
    // ~2,6 MB. Medido em Chromium a 50 Mbit/s: com os 60 downloads ao mesmo
    // tempo (o que o browser faz por omissão), a PRIMEIRA foto só aparece aos
    // 26 s. Três de cada vez, pela ordem da grelha, põe-na lá em ~1,4 s.
    photos = folder(THEME_PAGE_SIZE, () => false);
    await openPicker(true);

    const imgs = () => cells().map((c) => c.querySelector("img") as HTMLImageElement);
    const started = () => imgs().filter((i) => i.getAttribute("src")).length;

    expect(cells()).toHaveLength(THEME_PAGE_SIZE);
    await waitFor(() => expect(started()).toBe(3));
    expect(imgs()[0].getAttribute("src")).toBe("https://cdn.test/t1-foto-1.jpg");

    // Cada uma que acaba liberta a vez seguinte.
    fireEvent.load(imgs()[0]);
    await waitFor(() => expect(started()).toBe(4));
  });

  it("com miniatura não há fila: 25 KB não precisam de vez", async () => {
    photos = folder(THEME_PAGE_SIZE);
    await openPicker(true);

    const imgs = () => cells().map((c) => c.querySelector("img") as HTMLImageElement);
    await waitFor(() =>
      expect(imgs().filter((i) => i.getAttribute("src"))).toHaveLength(THEME_PAGE_SIZE),
    );
    // A primeira dobra não espera pelo `lazy`; o resto do rolo espera.
    expect(imgs()[0]).toHaveAttribute("loading", "eager");
    expect(imgs()[0]).toHaveAttribute("fetchpriority", "high");
    expect(imgs()[THEME_PAGE_SIZE - 1]).toHaveAttribute("loading", "lazy");
  });

  it("a página seguinte chega antes de ela a pedir", async () => {
    photos = folder(150);
    await openPicker(true);

    const pageCalls = () => calls.filter((c) => c.includes("/api/temas/t1/imagens")).length;
    expect(pageCalls()).toBe(1);

    // Passado o tempo de espera, a página seguinte já foi buscada — uma só.
    await waitFor(() => expect(pageCalls()).toBe(2), { timeout: 4000 });
    expect(calls[calls.length - 1]).toContain(`offset=${THEME_PAGE_SIZE}`);

    // O "Mostrar mais" não faz pedido nenhum: as fotos já cá estão.
    fireEvent.click(screen.getByRole("button", { name: /Mostrar mais/ }));
    await waitFor(() => expect(cells()).toHaveLength(THEME_PAGE_SIZE * 2));
    expect(pageCalls()).toBe(2);
  });

  it("'todas as visíveis' e o Shift+clique param no teto, avisando", async () => {
    photos = folder(150);
    await openPicker(true);

    fireEvent.click(escolherTodasAsMostradas());

    expect(
      screen.getByText(`${MAX_IMPORT_BATCH} de ${MAX_IMPORT_BATCH} fotos selecionadas`),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        `Só cabem ${MAX_IMPORT_BATCH} fotos de cada vez — ficaram selecionadas as primeiras.`,
      ),
    ).toBeInTheDocument();
    expect(photo(MAX_IMPORT_BATCH)).toHaveAttribute("aria-pressed", "true");
    expect(photo(MAX_IMPORT_BATCH + 1)).toHaveAttribute("aria-pressed", "false");

    // Um intervalo grande com Shift também para no teto — não o ultrapassa.
    fireEvent.click(screen.getByRole("button", { name: "Limpar seleção" }));
    fireEvent.click(photo(1));
    fireEvent.click(photo(55), { shiftKey: true });
    expect(
      screen.getByText(`${MAX_IMPORT_BATCH} de ${MAX_IMPORT_BATCH} fotos selecionadas`),
    ).toBeInTheDocument();
    expect(photo(MAX_IMPORT_BATCH)).toHaveAttribute("aria-pressed", "true");
    expect(photo(55)).toHaveAttribute("aria-pressed", "false");

    // E o Shift+clique ao contrário desmarca o intervalo todo.
    fireEvent.click(photo(1), { shiftKey: true });
    expect(screen.getByText("Escolhe pelo menos uma foto.")).toBeInTheDocument();
  });

  it("marca as fotos que já estão nesta proposta", async () => {
    await openPicker(true, ["t1/foto-2.jpg"]);

    expect(photo(2, " (já nesta proposta)")).toBeInTheDocument();
    expect(screen.getAllByText("Já nesta proposta")).toHaveLength(1);
    // Continua escolhível: a mesma foto pode ir para a capa e para um board.
    fireEvent.click(photo(2, " (já nesta proposta)"));
    expect(photo(2, " (já nesta proposta)")).toHaveAttribute("aria-pressed", "true");
  });

  it("a seleção sobrevive à troca de separador de tema", async () => {
    photos = folder(6);
    route("GET /api/temas", () =>
      ok([THEME, { ...THEME, id: "t2", name: "Itália", imageCount: 3 }]),
    );
    route("GET /api/temas/t2/imagens", () =>
      ok({ ok: true, images: folder(3, () => true, "t2"), total: 3, truncated: false }),
    );
    await openPicker(true);

    fireEvent.click(photo(1));
    fireEvent.click(photo(2));
    expect(screen.getByText("2 fotos selecionadas")).toBeInTheDocument();

    // Muda de tema: a grelha é outra, a seleção é a mesma.
    fireEvent.click(screen.getByRole("button", { name: /Itália/ }));
    await screen.findByRole("button", { name: "Foto 1 de 3" });
    expect(screen.getByText("2 fotos selecionadas")).toBeInTheDocument();
    expect(screen.getByText("2 são de outros temas.")).toBeInTheDocument();
    fireEvent.click(photo(1, "", 3));
    expect(screen.getByText("3 fotos selecionadas")).toBeInTheDocument();

    // E de volta: as duas primeiras continuam marcadas, sem pedido novo.
    const antes = calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Terracotta/ }));
    await screen.findByRole("button", { name: "Foto 1 de 6" });
    expect(calls).toHaveLength(antes);
    expect(photo(1)).toHaveAttribute("aria-pressed", "true");
    expect(photo(2)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 é de outro tema.")).toBeInTheDocument();

    // O lote leva as três, de ambos os temas.
    fireEvent.click(addAndClose(3));
    await waitFor(() => expect(imported.flat()).toHaveLength(3));
    expect(imported[0]).toContain("t2/foto-1.jpg");
  });

  // ── Teclado ──────────────────────────────────────────────────────────────
  // As células são `<button>`, por isso o Enter e o Espaço são a ativação
  // nativa (= alternar a escolha); o que se fixa aqui é o que foi preciso
  // construir: um só ponto de entrada no Tab e as setas a andar por dentro.

  it("a grelha anda com as setas mantendo um só ponto de entrada no Tab", async () => {
    photos = folder(12);
    await openPicker(true);

    expect(photo(1)).toHaveAttribute("tabindex", "0");
    expect(photo(2)).toHaveAttribute("tabindex", "-1");

    photo(1).focus();
    fireEvent.keyDown(photo(1), { key: "ArrowRight" });
    expect(document.activeElement).toBe(photo(2));
    expect(photo(2)).toHaveAttribute("tabindex", "0");
    expect(photo(1)).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(photo(2), { key: "End" });
    expect(document.activeElement).toBe(photo(12));
    fireEvent.keyDown(photo(12), { key: "Home" });
    expect(document.activeElement).toBe(photo(1));
    // Nas pontas fica quieta em vez de dar a volta.
    fireEvent.keyDown(photo(1), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(photo(1));
  });

  it("o V abre a foto em grande (o original) e o Esc volta à grelha", async () => {
    photos = folder(6);
    await openPicker(true);

    photo(2).focus();
    fireEvent.keyDown(photo(2), { key: "v" });

    const preview = screen.getByRole("group", { name: "Foto 2 de 6 em grande" });
    // Aqui — e só aqui — se puxa o ORIGINAL: é o que distingue duas mesas de
    // terracota que na miniatura são a mesma mancha.
    expect(preview.querySelector("img")).toHaveAttribute("src", "https://cdn.test/t1-foto-2.jpg");

    fireEvent.click(screen.getByRole("button", { name: "Escolher esta foto" }));
    expect(screen.getByText("1 foto selecionada")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: /em grande/ })).not.toBeInTheDocument();
    // O Esc fechou a pré-visualização, NÃO o seletor.
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(photo(2));
  });
});

describe("fotos que já foram para outro casamento", () => {
  it("diz para onde foram, no nome e na marca", async () => {
    photos = folder(4);
    await openPicker(true, undefined, { "t1/foto-2.jpg": "Ana e Rui, 12 set 2026" });

    // No NOME acessível, porque a marca visual não chega a quem não vê a
    // grelha — e é aqui que a decisão de repetir se toma.
    expect(
      screen.getByRole("button", { name: /Foto 2 de 4 \(já usada em Ana e Rui, 12 set 2026\)/ }),
    ).toBeTruthy();
    expect(screen.getAllByTitle("Já usada em Ana e Rui, 12 set 2026").length).toBeGreaterThan(0);
  });

  it("não impede nada — a foto continua a poder ser escolhida", async () => {
    // Repetir pode ser a decisão certa: é a melhor que há daquele arco, e os
    // dois casamentos estão em pontas opostas do país.
    photos = folder(4);
    await openPicker(true, undefined, { "t1/foto-2.jpg": "Ana e Rui" });
    fireEvent.click(screen.getByRole("button", { name: /Foto 2 de 4/ }));
    expect(screen.getByRole("button", { name: /Foto 2 de 4/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("uma foto que já está NESTA proposta não leva as duas marcas", async () => {
    // As duas legendas caem no mesmo sítio e tapavam-se uma à outra; a que
    // interessa primeiro é a desta proposta.
    photos = folder(4);
    await openPicker(true, ["t1/foto-2.jpg"], { "t1/foto-2.jpg": "Ana e Rui" });
    expect(screen.getByRole("button", { name: /Foto 2 de 4 \(já nesta proposta\)/ })).toBeTruthy();
    expect(screen.queryByTitle("Já usada em Ana e Rui")).toBeNull();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COM MUITOS TEMAS, A GRELHA DE FOTOS TEM DE CONTINUAR ALCANÇÁVEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO no telemóvel dela, com 40 temas: a lista empilhava-se em seis linhas e
 * a grelha de fotografias — que é a razão de abrir este painel — ficava
 * espremida num terço, cortada a meio. Palavras dela: «está ao contrário do que
 * devia ser».
 *
 * Passaram-se por aqui duas soluções, e a segunda substituiu a primeira:
 *
 *  1. a lista fechava-se, com um botão «Temas (40)» e o estado guardado. Tirava
 *     a lista do caminho, mas ao preço de um toque para chegar aos temas — e de
 *     um painel que abria a esconder metade do que serve para escolher;
 *  2. os CHIPS: uma linha só, que rola de lado. A lista deixa de precisar de se
 *     fechar porque nunca chega a ocupar mais do que uma linha, e os temas
 *     estão sempre à mão. É o que está.
 *
 * No computador a fila volta a quebrar, com o tecto de altura de sempre: rolar
 * de lado com um rato é mau, e num ecrã largo vêem-se os quarenta de uma vez.
 *
 * O que se prende aqui é a decisão. A altura em pixéis é do browser e mede-se
 * no `geometria-dos-alvos.spec.ts`.
 */
describe("a lista de temas não engole o ecrã", () => {
  /** Quarenta temas, como os dela. */
  const muitos = Array.from({ length: 40 }, (_, i) => ({
    ...THEME,
    id: `t${i + 1}`,
    name: `Tema ${i + 1}`,
    imageCount: 10 + i,
  }));

  const lista = () => screen.getByRole("group", { name: "Temas" });

  async function comMuitos() {
    route("GET /api/temas", () => ok(muitos));
    return openPicker(true);
  }

  it("os temas estão numa linha que rola de lado, não empilhados", async () => {
    await comMuitos();
    const classes = lista().className;
    // Uma linha: sem `flex-wrap` no telemóvel, e a rolar na horizontal.
    expect(classes).toContain("overflow-x-auto");
    expect(classes, "com `flex-wrap` no telemóvel volta a empilhar").not.toMatch(/(^|\s)flex-wrap/);
  });

  it("e numa faixa larga voltam a quebrar, com tecto — rolar de lado com rato é mau", async () => {
    await comMuitos();
    const classes = lista().className;
    // A pergunta é «que largura tem ESTA coluna?» e não «que largura tem a
    // janela?»: a partir de `lg` a coluna são 14 rem, e lá um `sm:` — que a
    // essa altura está sempre ligado — decidia por uma largura que a coluna
    // nunca teve.
    expect(classes).toContain("@min-[26rem]:flex-wrap");
    expect(classes).toContain("@min-[26rem]:overflow-y-auto");
    // `dvh` e não `vh`: com a barra do Safari à vista, `vh` é maior do que o
    // que se vê — o mesmo defeito que punha o rodapé por baixo dela.
    expect(classes).toMatch(/@min-\[26rem\]:max-h-\[\d+dvh\]/);
    expect(classes, "`vh` mede um ecrã que o Safari não mostra todo").not.toMatch(
      /max-h-\[\d+vh\]/,
    );
  });

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * A COLUNA DOS TEMAS TEM TRÊS MEDIDAS, E DUAS NÃO SE VÊEM DA JANELA
   * ═════════════════════════════════════════════════════════════════════════
   *
   * A coluna é uma FAIXA por cima das fotos com 100% do painel enquanto for
   * faixa, e passa a 14 rem quando vira coluna lateral. A partir de `lg` — ou
   * seja, precisamente quando ela é mais ESTREITA do que nunca — todas as
   * variantes `sm:` lá dentro estão ligadas, porque `sm:` só pergunta se a
   * JANELA tem 640 px. Uma delas era `sm:max-w-xs`: um tecto de 20 rem dentro
   * de uma coluna de 14, ou seja uma regra que nunca chegou a fazer nada.
   *
   * Estas três medidas são as que existem de verdade. O jsdom não avalia
   * `@container` nenhum, por isso o teste resolve as classes como o navegador
   * faria e afirma a FORMA que sai de cada uma.
   */
  describe("as três medidas da coluna dos temas", () => {
    /** Faixa estreita, faixa larga, coluna lateral. */
    const FAIXA_ESTREITA = { janela: 390, coluna: 390 };
    const FAIXA_LARGA = { janela: 900, coluna: 768 };
    const COLUNA_LATERAL = { janela: 1120, coluna: 14 * 16 };

    type Medida = { janela: number; coluna: number };

    /** Os utilitários em vigor nesta medida. Uma variante desconhecida REBENTA
     *  em vez de ser ignorada em silêncio — é assim que um `md:` diz o nome. */
    function efectivas(className: string, m: Medida): Set<string> {
      const fora = new Set<string>();
      for (const classe of className.split(/\s+/).filter(Boolean)) {
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
        const utilitario = partes.pop()!;
        if (partes.every((v) => ligada(v, m))) fora.add(utilitario);
      }
      return fora;
    }

    function ligada(v: string, m: Medida): boolean {
      if (v === "sm") return m.janela >= 640;
      if (v === "lg") return m.janela >= 1024;
      const doContentor = /^@min-\[(\d+(?:\.\d+)?)rem\]$/.exec(v);
      if (doContentor) return m.coluna >= Number(doContentor[1]) * 16;
      if (/^\[.*\]$/.test(v)) return true;
      throw new Error(`variante \`${v}:\` desconhecida na coluna dos temas`);
    }

    async function classes() {
      route("GET /api/temas", () => ok(muitos));
      await openPicker(true);
      const fila = lista();
      return {
        fila: fila.className,
        // A linha que segura a lupa/caixa de procurar E a fila de chips.
        linha: fila.parentElement!.className,
      };
    }

    /**
     * ── O QUE FAZ DESTE TESTE UM TESTE ────────────────────────────────────
     *
     * A coluna lateral é a medida mais ESTREITA das três (14 rem) e a janela
     * mais LARGA (1120). Uma regra que pergunte pela janela responde-lhe como
     * se ela tivesse 1120 px de largo. Aqui afirma-se o contrário: a coluna
     * lateral empilha, como a faixa larga — e por ser estreita e alta, não por
     * a janela ser grande.
     */
    it("empilha na faixa larga E na coluna lateral; só a faixa estreita rola de lado", async () => {
      const { fila, linha } = await classes();

      // Faixa estreita: uma fila que rola de lado, para os chips não comerem a
      // altura que é das fotografias.
      expect(efectivas(fila, FAIXA_ESTREITA)).toContain("overflow-x-auto");
      expect(efectivas(fila, FAIXA_ESTREITA)).not.toContain("flex-wrap");
      expect(efectivas(linha, FAIXA_ESTREITA)).not.toContain("flex-col");

      // Faixa larga: os chips quebram e a caixa de procurar vive por cima.
      expect(efectivas(fila, FAIXA_LARGA)).toContain("flex-wrap");
      expect(efectivas(fila, FAIXA_LARGA)).toContain("overflow-y-auto");
      expect(efectivas(linha, FAIXA_LARGA)).toContain("flex-col");

      // Coluna lateral: um tema por linha, com o scroll dela e sem tecto.
      const naColuna = efectivas(fila, COLUNA_LATERAL);
      expect(naColuna).toContain("flex-col");
      expect(naColuna).toContain("flex-nowrap");
      expect(naColuna).toContain("overflow-y-auto");
      expect(naColuna).toContain("max-h-none");
      expect(efectivas(linha, COLUNA_LATERAL)).toContain("flex-col");
    });

    /**
     * A ponta que fecha o par, e a que falha primeiro se alguém repuser um
     * `sm:`. Dentro desta coluna sobra UMA pergunta legítima sobre a janela: o
     * `lg:`, que não é uma largura mas a MUDANÇA DE FORMA (faixa → coluna) e
     * está sincronizado com o salto do painel para as 70 rem. Qualquer outra
     * — um `sm:`, um `min-[…]px:` — está a medir a janela para responder por
     * uma coluna que pode ter 14 rem.
     */
    it("dentro da coluna, a única pergunta sobre a janela é a mudança de forma", async () => {
      const { fila, linha } = await classes();
      const cadeias = [fila, linha];
      for (const cadeia of cadeias) {
        const daJanela = cadeia.split(/\s+/).filter((c) => /^(sm|min-\[[^\]]+\]):/.test(c));
        expect(daJanela, `\`${cadeia}\` mede a janela dentro de uma coluna`).toEqual([]);
      }
    });

    /**
     * A regra morta. `max-w-xs` são 20 rem; a coluna lateral tem 14. Estava
     * escrita, lia-se como uma decisão, e não limitava nada — é o género de
     * linha que sobrevive a três refactorizações porque nunca fez diferença
     * nenhuma.
     */
    it("o tecto de 20 rem da caixa de procurar só existe onde há 20 rem", async () => {
      route("GET /api/temas", () => ok(muitos));
      await openPicker(true);
      fireEvent.click(screen.getByRole("button", { name: "Procurar tema" }));
      const caixa = screen.getByLabelText("Procurar tema").parentElement!.className;

      expect(efectivas(caixa, FAIXA_LARGA)).toContain("max-w-xs");
      expect(
        efectivas(caixa, COLUNA_LATERAL),
        "20 rem dentro de 14 é uma regra que nunca faz nada",
      ).not.toContain("max-w-xs");
      // Mas a caixa continua a ocupar a coluna toda, que é o que lá interessa.
      expect(efectivas(caixa, COLUNA_LATERAL)).toContain("w-full");
    });
  });

  it("os quarenta continuam todos lá — a fila não corta nenhum", async () => {
    await comMuitos();
    // Controlo positivo: um «ver mais» ou um `slice` fazia este número descer.
    expect(lista().querySelectorAll("button").length).toBe(muitos.length);
  });

  it("cada chip traz o nome E a contagem — são a mesma pergunta", async () => {
    await comMuitos();
    expect(screen.getByRole("button", { name: "Tema 2, 11 fotos" })).toBeInTheDocument();
  });

  it("o tema activo distingue-se dos outros", async () => {
    await comMuitos();
    const activos = [...lista().querySelectorAll('button[aria-pressed="true"]')];
    expect(activos).toHaveLength(1);
    expect(activos[0].textContent).toContain("Tema 1");
  });

  /** Abre a procura e escreve. A caixa vive atrás de uma lupa no telemóvel —
   *  ver «a procura vive atrás de uma lupa», mais abaixo. */
  async function procurar(texto: string) {
    const lupa = screen.queryByRole("button", { name: "Procurar tema" });
    if (lupa) fireEvent.click(lupa);
    fireEvent.change(screen.getByRole("textbox", { name: "Procurar tema" }), {
      target: { value: texto },
    });
  }

  it("a procura continua a filtrar a fila", async () => {
    await comMuitos();
    await procurar("Tema 3");
    // «Tema 3», «Tema 30»…«Tema 39» — onze.
    expect(lista().querySelectorAll("button").length).toBe(11);
  });

  it("e o vazio diz o que se procurou, com o caminho de volta", async () => {
    await comMuitos();
    await procurar("zzz");
    // Era «Nenhum tema com esse nome.» — uma legenda cinzenta sem saída.
    expect(screen.getByText("Nenhum tema com «zzz».")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver os 40 temas" }));
    expect(lista().querySelectorAll("button").length).toBe(40);
  });

  it("a grelha das fotos continua a desenhar-se, com os quarenta temas lá", async () => {
    await comMuitos();
    // A razão de tudo isto: chegar às fotos.
    expect(screen.getByRole("button", { name: `Foto 1 de ${visible()}` })).toBeInTheDocument();
  });

  it("ao abrir, o tema activo é posto à vista", async () => {
    // O jsdom não implementa `scrollIntoView`; o componente só o chama quando
    // existe, e sem este duplo não haveria nada para observar.
    const espia = vi.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = espia;
    try {
      await comMuitos();
      expect(espia).toHaveBeenCalled();
      // E é o ACTIVO, não um qualquer: numa fila de quarenta chips o escolhido
      // pode estar a três écrans de distância, para o lado.
      expect((espia.mock.instances[0] as HTMLElement).getAttribute("aria-pressed")).toBe("true");
    } finally {
      delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * A GRELHA MEDE A ZONA DAS FOTOS, E NÃO A JANELA
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Este era o pior defeito do seletor, e mede-se em píxeis. Com
   * `grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-5`, num iPad ao alto:
   *
   *   · a 639 px de janela o painel é full-bleed, a grelha tem 599 px e três
   *     colunas — fotos de 194 px;
   *   · a 641 px entrava o `sm:p-6`, o painel encolhia para 593, a grelha para
   *     553, e o `sm:` mandava CINCO colunas — fotos de 102 px.
   *
   * A janela cresceu dois píxeis, a ZONA DAS FOTOS encolheu 46, e as
   * fotografias ficaram com metade. É a inversão que estes testes prendem — e
   * a razão de ela deixar de existir não é um número mais bem escolhido: é que
   * a grelha deixou de fazer a pergunta errada.
   *
   * ── PORQUE É QUE O TESTE RESOLVE AS CLASSES À MÃO ─────────────────────────
   *
   * O jsdom não faz disposição e não avalia `@media` nem `@container`:
   * renderizar a 639 e a 641 dá o mesmo DOM com a mesma `className`. Um teste
   * que se ficasse pelo `toContain("grid-cols-2")` afirmava a ORTOGRAFIA da
   * classe e passava na mesma com um `sm:grid-cols-5` ao lado — que é
   * precisamente o defeito a apanhar. Por isso o resolvedor abaixo faz o que o
   * navegador faria, e devolve PÍXEIS. É a mesma escolha do
   * `Cortes.movel.test.tsx`.
   */
  describe("as miniaturas, em píxeis", () => {
    /** `px-5` de cada lado do invólucro que rola, e `gap-2` entre células. */
    const MARGEM = 20 * 2;
    const FOLGA = 8;
    const REM = 16;

    /** As duas réguas, e o ponto todo é que são duas. */
    type Medida = { janela: number; contentor: number };

    /** Os utilitários que estão MESMO a valer nesta medida. */
    function activas(className: string, m: Medida): string[] {
      const fora: string[] = [];
      for (const classe of className.split(/\s+/).filter(Boolean)) {
        // Não partir os dois pontos que vivem DENTRO de um valor arbitrário.
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
        const utilitario = partes.pop()!;
        if (partes.every((v) => ligada(v, m))) fora.push(utilitario);
      }
      return fora;
    }

    function ligada(variante: string, m: Medida): boolean {
      if (variante === "sm") return m.janela >= 640;
      if (variante === "lg") return m.janela >= 1024;
      // `@min-[26rem]:` — a ZONA. É esta que decide a grelha.
      const doContentor = /^@min-\[(\d+(?:\.\d+)?)rem\]$/.exec(variante);
      if (doContentor) return m.contentor >= Number(doContentor[1]) * REM;
      // `min-[480px]:` — a JANELA, sem `@`. Era o limiar inventado.
      const daJanela = /^min-\[(\d+(?:\.\d+)?)px\]$/.exec(variante);
      if (daJanela) return m.janela >= Number(daJanela[1]);
      if (/^\[.*\]$/.test(variante)) return true;
      throw new Error(`variante \`${variante}:\` desconhecida na grelha das fotos`);
    }

    /** Quantas colunas a grelha desenha nesta medida. */
    function colunas(className: string, m: Medida): number {
      const util = activas(className, m)
        .filter((c) => c.startsWith("grid-cols-"))
        .pop();
      if (!util) throw new Error("a grelha não declara colunas nenhumas");
      const fixas = /^grid-cols-(\d+)$/.exec(util);
      if (fixas) return Number(fixas[1]);
      // `grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]`: tantas quantas caibam
      // com esse mínimo. É a conta que o `auto-fill` faz.
      const fluida = /^grid-cols-\[repeat\(auto-fill,minmax\((\d+(?:\.\d+)?)rem,1fr\)\)\]$/.exec(
        util,
      );
      if (!fluida) throw new Error(`colunas por decifrar: ${util}`);
      const minimo = Number(fluida[1]) * REM;
      const largura = m.contentor - MARGEM;
      return Math.max(1, Math.floor((largura + FOLGA) / (minimo + FOLGA)));
    }

    /** O lado de uma miniatura, em píxeis. */
    function miniatura(className: string, m: Medida): number {
      const n = colunas(className, m);
      return (m.contentor - MARGEM - FOLGA * (n - 1)) / n;
    }

    const classeDaGrelha = async () => {
      await comMuitos();
      return screen.getByRole("button", { name: /^Foto 1 de/ }).closest(".grid")!.className;
    };

    /** O resolvedor a sério, senão o resto passava por vacuidade. */
    it("o resolvedor separa a régua da janela da régua da zona", () => {
      const c = "grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-5";
      expect(colunas(c, { janela: 400, contentor: 400 })).toBe(2);
      expect(colunas(c, { janela: 480, contentor: 480 })).toBe(3);
      expect(colunas(c, { janela: 640, contentor: 200 })).toBe(5);
      const fluida = "grid-cols-2 @min-[26rem]:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]";
      // 416 de zona → 376 de grelha → (376+8)/(144+8) = 2,5 → duas.
      expect(colunas(fluida, { janela: 320, contentor: 416 })).toBe(2);
      // E a janela não lhe diz nada: a mesma zona dá o mesmo, a 320 ou a 1440.
      expect(colunas(fluida, { janela: 1440, contentor: 416 })).toBe(2);
    });

    /**
     * ── O TESTE QUE IMPORTA ────────────────────────────────────────────────
     *
     * As duas medidas do iPad ao alto, com os números do defeito. Repare-se em
     * qual é qual: a zona MAIS ESTREITA (553 de grelha) é a da janela MAIS
     * LARGA (641). Uma grelha que pergunte pela janela pode responder «mais
     * colunas» a uma zona que encolheu; uma que pergunte pela zona não pode.
     */
    it("a zona encolher nunca dá MAIS colunas — era 3 → 5 com 46 px a menos", async () => {
      const classe = await classeDaGrelha();
      const antes = { janela: 639, contentor: 599 + MARGEM };
      const depois = { janela: 641, contentor: 553 + MARGEM };
      expect(depois.contentor).toBeLessThan(antes.contentor);
      expect(colunas(classe, depois)).toBeLessThanOrEqual(colunas(classe, antes));
    });

    /**
     * E o mesmo dito no que se vê: a miniatura não pode cair para metade.
     * `9rem` é o mínimo declarado na grelha — o `auto-fill` acrescenta uma
     * coluna em vez de descer abaixo dele, e é isso que põe um CHÃO onde antes
     * não havia nenhum. Os 102 px de 641 estavam 42 abaixo deste chão.
     */
    it("e a miniatura tem um CHÃO — os 102 px estavam 34 abaixo do mais baixo", async () => {
      const classe = await classeDaGrelha();
      // Dois chãos, um por regime, e os dois muito acima dos 102 px do defeito:
      //   · abaixo de 26 rem de zona são duas colunas fixas, e o pior caso é o
      //     ecrã mais estreito que existe (320) — 136 px por foto;
      //   · daí para cima o `auto-fill` acrescenta uma coluna em vez de descer
      //     abaixo do mínimo declarado, 9 rem.
      const chaoDe = (contentor: number) => (contentor < 26 * REM ? 8.5 : 9) * REM;
      // Da folha num iPhone SE (320) ao painel de 70 rem com a coluna dos temas
      // ao lado (1120 − 224 = 896), de dois em dois píxeis. E com janelas que
      // não têm nada a ver com a zona: é isso que uma folha faz.
      for (let contentor = 320; contentor <= 896; contentor += 2) {
        for (const janela of [contentor, 639, 641, 1024, 1440]) {
          const px = miniatura(classe, { janela, contentor });
          expect(px, `zona de ${contentor} px numa janela de ${janela}`).toBeGreaterThanOrEqual(
            chaoDe(contentor),
          );
        }
      }
    });

    /**
     * A ponta que fecha o par. Sem isto, alguém repõe um `sm:grid-cols-5` ao
     * lado do `@min-[26rem]:` e os dois testes de cima continuam verdes na
     * maior parte das medidas — foi assim que este defeito viveu tanto tempo.
     */
    it("a grelha não faz uma única pergunta sobre a janela", async () => {
      const classe = await classeDaGrelha();
      const variantes = classe
        .split(/\s+/)
        .filter((c) => c.includes("grid-cols-"))
        .flatMap((c) => c.split(":").slice(0, -1));
      for (const v of variantes) {
        expect(v, `\`${v}:\` mede a janela; a grelha vive numa zona`).toMatch(/^@/);
      }
      // E a zona tem de EXISTIR, senão a consulta não tem sobre o que medir.
      const grelha = screen.getByRole("button", { name: /^Foto 1 de/ }).closest(".grid")!;
      expect(grelha.closest(".\\@container")).toBeTruthy();
    });

    /** Num telemóvel são sempre duas: três a 390 px dão 111 px por foto,
     *  pequeno de mais para escolher decoração — e deixar a grelha fluir num
     *  ecrã de 320 dava UMA coluna gigante. */
    it("num telemóvel são duas colunas, e não uma nem três", async () => {
      const classe = await classeDaGrelha();
      for (const contentor of [320, 375, 390, 414]) {
        expect(colunas(classe, { janela: contentor, contentor })).toBe(2);
      }
    });
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE SE ESCOLHE, DITO PELO NÚMERO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este painel serve para escolher fotos, e três das frases que o diziam não
 * diziam nada:
 *
 *  · «Selecionar todas as visíveis» — palavras dela: «está solto e é ambíguo:
 *    seleciona as visíveis no ecrã ou todas as do tema?». Nenhuma das duas:
 *    escolhe as que já foram CARREGADAS;
 *  · «Adicionar e fechar» — o que se confirma é uma quantidade, e ela não
 *    estava no botão;
 *  · e no telemóvel não havia dica nenhuma sobre as duas acções que uma célula
 *    tem, escolher e ver em grande.
 */
describe("o que se escolhe, dito pelo número", () => {
  it("o botão de escolher tudo diz quantas são e de onde vêm", async () => {
    photos = folder(8);
    await openPicker(true);
    // Sem mais nada por descer, são as do tema — e o número é exacto.
    expect(screen.getByRole("button", { name: "Escolher as 8 deste tema" })).toBeInTheDocument();
  });

  it("e diz outra coisa quando o tema ainda tem mais por descer", async () => {
    // Com paginação, «deste tema» seria mentira: o botão só alcança o que já
    // desceu.
    photos = folder(THEME_PAGE_SIZE + 10);
    await openPicker(true);
    expect(
      screen.getByRole("button", { name: `Escolher as ${THEME_PAGE_SIZE} já mostradas` }),
    ).toBeInTheDocument();
  });

  it("o botão de confirmar traz o número das fotos", async () => {
    photos = folder(6);
    await openPicker(true);
    // Sem nada escolhido não há número para dizer.
    expect(screen.getByRole("button", { name: "Adicionar fotos" })).toBeDisabled();
    fireEvent.click(photo(1));
    expect(screen.getByRole("button", { name: "Adicionar 1 foto" })).toBeEnabled();
    fireEvent.click(photo(2));
    expect(screen.getByRole("button", { name: "Adicionar 2 fotos" })).toBeEnabled();
  });

  it("e o contador diz «fotos», não só o número", async () => {
    photos = folder(6);
    await openPicker(true);
    fireEvent.click(photo(1));
    expect(screen.getByText("1 foto selecionada")).toBeInTheDocument();
    fireEvent.click(photo(2));
    expect(screen.getByText("2 fotos selecionadas")).toBeInTheDocument();
  });

  it("o segundo botão diz que NÃO fecha", async () => {
    photos = folder(6);
    await openPicker(true);
    fireEvent.click(photo(1));
    // «e continuar» não dizia continuar o quê.
    expect(screen.getByRole("button", { name: "Adicionar 1 e escolher mais" })).toBeInTheDocument();
  });

  /**
   * ── UMA INSTRUÇÃO, E OS ATALHOS ATRÁS DO «?» ────────────────────────────
   *
   * Palavras dela: «há três textos de ajuda a competir; devia ser uma
   * instrução curta e os atalhos atrás de um "?"».
   *
   * Eram três: duas versões da mesma frase na barra (uma para o dedo, outra
   * para o rato, ambas sempre visíveis) e a do rodapé. Ficou a do rodapé.
   */
  it("a barra não repete a instrução do rodapé", async () => {
    photos = folder(6);
    await openPicker(true);
    expect(screen.queryByText(/Toca para escolher/)).toBeNull();
    expect(screen.queryByText(/Shift \+ clique escolhe/)).toBeNull();
  });

  it("os atalhos estão a um toque, e não sempre no ecrã", async () => {
    photos = folder(6);
    await openPicker(true);
    const ajuda = screen.getByRole("button", { name: /como escolher fotos/i });
    // Fechado: nada do que ele explica está no ecrã.
    expect(screen.queryByText(/escolhe tudo o que está pelo meio/i)).toBeNull();
    fireEvent.click(ajuda);
    expect(screen.getByText(/escolhe tudo o que está pelo meio/i)).toBeInTheDocument();
    expect(screen.getByText(/mostra-a em grande/i)).toBeInTheDocument();
  });

  /**
   * O painel está encostado à margem direita da barra: ancorado à esquerda,
   * as 18 rem dele saíam do diálogo e lia-se metade de cada linha.
   */
  it("o painel dos atalhos abre para dentro do diálogo", async () => {
    photos = folder(6);
    await openPicker(true);
    fireEvent.click(screen.getByRole("button", { name: /como escolher fotos/i }));
    const painel = screen.getByRole("note");
    expect(painel.className).toContain("right-0");
    expect(painel.className).not.toContain("left-0");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS DETALHES QUE ROUBAVAM ESPAÇO OU LEGIBILIDADE
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("a procura vive atrás de uma lupa", () => {
  const muitos = Array.from({ length: 12 }, (_, i) => ({
    ...THEME,
    id: `t${i + 1}`,
    name: `Tema ${i + 1}`,
  }));

  it("por omissão não há caixa nenhuma a ocupar uma linha", async () => {
    route("GET /api/temas", () => ok(muitos));
    await openPicker(true);
    // 55 px que a grelha não tinha.
    expect(screen.queryByRole("textbox", { name: "Procurar tema" })).toBeNull();
    expect(screen.getByRole("button", { name: "Procurar tema" })).toBeInTheDocument();
  });

  it("a lupa abre a caixa, e fechá-la limpa o que estava escrito", async () => {
    route("GET /api/temas", () => ok(muitos));
    await openPicker(true);
    fireEvent.click(screen.getByRole("button", { name: "Procurar tema" }));
    const campo = screen.getByRole("textbox", { name: "Procurar tema" });
    fireEvent.change(campo, { target: { value: "Tema 1" } });

    fireEvent.click(screen.getByRole("button", { name: "Fechar a procura" }));
    // Um filtro activo por trás de uma caixa fechada é a razão escondida por
    // que a fila mostra dois temas em vez de doze.
    expect(screen.queryByRole("textbox", { name: "Procurar tema" })).toBeNull();
    const lista = screen.getByRole("group", { name: "Temas" });
    expect(lista.querySelectorAll("button").length).toBe(12);
  });

  it("com texto escrito, a caixa não se fecha sozinha", async () => {
    route("GET /api/temas", () => ok(muitos));
    await openPicker(true);
    fireEvent.click(screen.getByRole("button", { name: "Procurar tema" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Procurar tema" }), {
      target: { value: "Tema 4" },
    });
    // O botão passa a ser o de fechar — e a caixa continua lá, com o texto.
    expect((screen.getByRole("textbox", { name: "Procurar tema" }) as HTMLInputElement).value).toBe(
      "Tema 4",
    );
  });

  it("com três temas não há lupa nenhuma — não há o que filtrar", async () => {
    route("GET /api/temas", () => ok(muitos.slice(0, 3)));
    await openPicker(true);
    expect(screen.queryByRole("button", { name: "Procurar tema" })).toBeNull();
  });
});

describe("os chips lêem-se", () => {
  it("o tom é escrito, e não o 55% do botão fantasma", async () => {
    await openPicker(true);
    const chip = screen.getByRole("button", { name: /^Terracotta,/ });
    // O 55% do fantasma dá ~4,5:1 — em cima da linha da AA para letra pequena, e
    // estes chips são a navegação deste painel. Por isso pedem um degrau acima.
    //
    // Era `text-foreground/75`, escrito à mão; passou a ser o degrau `72` da
    // escada da tinta (8,03:1). O que este teste guarda não muda: que o chip
    // NÃO herda o tom do fantasma.
    expect(chip.className).toContain("text-[var(--bo-tinta-72)]");
    expect(chip.className).not.toContain("text-foreground/55");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O GESTO DE VOLTAR FECHA A FOLHA — E NÃO O BACK OFFICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este é o achado mais grave da folha escrita à mão, e o mais barato de
 * corrigir. Num iPhone, deslizar da esquerda É o botão de voltar: numa quinta,
 * com o telemóvel numa mão e uma caixa de flores na outra, faz-se por acidente.
 * Sem uma entrada na história, o Safari SAÍA DA APLICAÇÃO — e levava com ele a
 * selecção de fotos que estava a meio.
 *
 * O `FolhaOuDialogo` empilha uma entrada por camada aberta; a folha escrita à
 * mão não empilhava nenhuma. É a diferença entre o gesto fechar o seletor e o
 * gesto fechar o back office.
 *
 * O jsdom não tem gesto nenhum, mas tem os dois que interessam: `pushState` e o
 * `popstate` que o gesto dispara. É contra esses que se prende — como no
 * `useCamadaDeHistoria.test.tsx`.
 */
describe("o gesto de voltar do iPhone", () => {
  /** O jsdom anda na história numa tarefa sua; um tique de zero não a apanha. */
  const esperarUmTique = () => new Promise((r) => setTimeout(r, 20));

  beforeEach(async () => {
    await esperarUmTique();
    window.history.replaceState(null, "");
  });

  it("empilha uma entrada enquanto o seletor está aberto", async () => {
    expect(window.history.state?.[MARCA_DA_CAMADA]).toBeUndefined();
    await openPicker(true);
    // Sem esta entrada não há nada para o gesto consumir, e o que ele consome
    // a seguir é a página do back office. O que se lê é a MARCA da camada e
    // não o comprimento da história: o comprimento não volta atrás e os
    // testes deste ficheiro partilham uma janela só.
    expect(typeof window.history.state?.[MARCA_DA_CAMADA]).toBe("number");
  });

  it("fecha o seletor em vez de sair do back office", async () => {
    await openPicker(true);
    // Uma escolha por gravar: é isto que o gesto levava com ele.
    fireEvent.click(photo(1));
    expect(screen.getByText("1 foto selecionada")).toBeInTheDocument();

    await act(async () => {
      window.history.back();
      await esperarUmTique();
    });

    expect(onClose, "o gesto tem de fechar ISTO, e não a aplicação").toHaveBeenCalled();
  });
});

describe("fechar sem ser pelo ×", () => {
  it("há uma pega para arrastar, e só no telemóvel", async () => {
    const { container } = await openPicker(true);
    const pega = container.querySelector(".cursor-grab");
    expect(pega, "a única saída era o × no canto mais longe do polegar").toBeTruthy();
    // `touch-none` para o browser não tratar o arrasto como rolagem.
    expect(pega!.className).toContain("touch-none");
  });

  /**
   * O «só no telemóvel» deixou de ser um `sm:hidden` e passou a ser uma
   * decisão do `FolhaOuDialogo`: no computador a pega NÃO EXISTE, em vez de
   * existir escondida. É a mesma promessa (arrastar um diálogo ao centro para
   * baixo não quer dizer nada) com uma garantia mais forte — um `sm:hidden`
   * continua a apanhar toques de um ponteiro que lá chegue.
   *
   * As duas saídas de sempre continuam lá, e são elas que fazem do gesto um
   * atalho e não a única porta.
   */
  it("no computador não há pega nenhuma — e o × e o Esc continuam lá", async () => {
    ecraLargo();
    const { container } = await openPicker(true);
    expect(container.querySelector(".cursor-grab")).toBeNull();
    expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("arrastar para baixo o suficiente fecha o painel", async () => {
    const { container } = await openPicker(true);
    const pega = container.querySelector(".cursor-grab") as HTMLElement;
    // O jsdom não implementa a captura do ponteiro.
    pega.setPointerCapture = () => {};
    fireEvent.pointerDown(pega, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(pega, { clientY: 260, pointerId: 1 });
    fireEvent.pointerUp(pega, { pointerId: 1 });
    expect(onClose).toHaveBeenCalled();
  });

  it("e um arrasto curto devolve o painel ao sítio", async () => {
    const { container } = await openPicker(true);
    const pega = container.querySelector(".cursor-grab") as HTMLElement;
    pega.setPointerCapture = () => {};
    fireEvent.pointerDown(pega, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(pega, { clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(pega, { pointerId: 1 });
    // Trinta pixéis é um toque trémulo, não um gesto.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /biblioteca de temas/i })).toBeInTheDocument();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CURADORIA E A GRELHA SÃO A MESMA SELECÇÃO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela: «alternar entre grelha e curadoria a qualquer momento, sem
 * perder as escolhas». Não há duas listas a sincronizar — há uma, e é a do
 * painel. Este teste é o que garante que continua a ser assim.
 */
describe("uma de cada vez", () => {
  it("a porta só aparece quando a grelha já não cabe no ecrã", async () => {
    photos = folder(6);
    await openPicker(true);
    // Com seis, a grelha mostra-as todas e uma de cada vez seria mais lento.
    expect(screen.queryByRole("button", { name: "Uma de cada vez" })).toBeNull();
  });

  it("o que se escolhe na curadoria aparece escolhido na grelha", async () => {
    photos = folder(12);
    await openPicker(true);
    fireEvent.click(screen.getByRole("button", { name: "Uma de cada vez" }));

    // A grelha sai do ecrã e fica uma foto só.
    expect(screen.queryByRole("button", { name: "Foto 1 de 12" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Incluir/ }));
    fireEvent.click(screen.getByRole("button", { name: /Incluir/ }));
    expect(screen.getByText("2 fotos selecionadas")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ver em grelha" }));
    expect(photo(1)).toHaveAttribute("aria-pressed", "true");
    expect(photo(2)).toHaveAttribute("aria-pressed", "true");
    expect(photo(3)).toHaveAttribute("aria-pressed", "false");
  });

  it("e o que já estava escolhido na grelha sobrevive à ida e volta", async () => {
    photos = folder(12);
    await openPicker(true);
    fireEvent.click(photo(5));
    fireEvent.click(screen.getByRole("button", { name: "Uma de cada vez" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver em grelha" }));
    expect(photo(5)).toHaveAttribute("aria-pressed", "true");
  });

  it("o rodapé continua a contar o mesmo, e o botão a dizer o número", async () => {
    photos = folder(12);
    await openPicker(true);
    fireEvent.click(screen.getByRole("button", { name: "Uma de cada vez" }));
    fireEvent.click(screen.getByRole("button", { name: /Incluir/ }));
    // O cabeçalho, a fila dos temas e o rodapé não saem do sítio: a curadoria
    // substitui a grelha e mais nada.
    expect(screen.getByRole("button", { name: "Adicionar 1 foto" })).toBeEnabled();
    expect(screen.getByRole("group", { name: "Temas" })).toBeInTheDocument();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE SE VIA MAL A 390 PX
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Três defeitos medidos no telemóvel dela, num Chromium a 390×844:
 *
 *  · a LUPA de cada foto levava `.alvo-toque`, que sob `(pointer: coarse)`
 *    força 44×44 — e numa célula de 111 px o disco preto tapava o canto
 *    superior esquerdo de todas as fotografias, encostado à margem na primeira
 *    coluna. Palavras dela: «cortados pela borda esquerda e sobrepostos às
 *    imagens». O alvo estava certo; o que não podia crescer era o desenho;
 *
 *  · o RODAPÉ dizia «Toca» — uma palavra, cortada a meio de «Toca nas fotos
 *    que queres usar.». A linha era `justify-between` com o texto à esquerda e
 *    três botões à direita, que não quebram;
 *
 *  · o FUNDO era `bg-black/35` e mais nada: o título «Fazer proposta» lia-se
 *    por trás do sheet, nítido e cortado ao meio pela aresta.
 *
 * O jsdom não mede pixéis. O que se prende aqui é a decisão em cada um — que é
 * o que um refactor apaga sem dar por isso; a medida é do browser e está no
 * `geometria-dos-alvos.spec.ts`.
 */
describe("o painel a 390 px", () => {
  it("a lupa cresce em ÁREA e não em desenho", async () => {
    await openPicker(true);
    const lupa = screen.getByRole("button", { name: "Ver a foto 1 em grande" });
    // `.alvo-invisivel` estende a área tocável com um `::after`; o
    // `.alvo-toque` esticava o próprio botão.
    expect(lupa.className).toContain("alvo-invisivel");
    expect(
      lupa.className,
      "o `.alvo-toque` força 44×44 no próprio disco — é o defeito",
    ).not.toContain("alvo-toque");
    // E o desenho continua nos 24 px.
    expect(lupa.className).toMatch(/\bh-6\b/);
    expect(lupa.className).toMatch(/\bw-6\b/);
  });

  it("o rodapé quebra em vez de espremer a contagem", async () => {
    await openPicker(true);
    const contagem = screen.getByText("Escolhe pelo menos uma foto.");
    const linha = contagem.closest("div")?.parentElement;
    expect(linha?.className, "sem `flex-wrap` os botões comem o texto").toContain("flex-wrap");
    // O texto ocupa a linha toda no telemóvel e volta ao lado dos botões
    // quando há espaço.
    expect(contagem.closest("div")?.className).toContain("basis-full");
  });

  /**
   * A QUEBRA NÃO SE DESFAZ AOS 640 PX.
   *
   * Era `basis-full sm:basis-auto` no texto e `w-full ... sm:w-auto
   * sm:flex-nowrap` nos botões: a 641 px o painel tem 553, e o `sm:` tirava a
   * quebra de linha exactamente onde ela fazia falta — a contagem e três
   * botões na mesma fila, com o texto a ser o único que encolhe.
   *
   * A janela não é o rodapé. Sem uma única variante de ecrã, a quebra fica de
   * pé em todas as larguras, e é a `basis-full` que diz quem toma a linha.
   */
  it("e nenhuma variante de ecrã a desfaz aos 640 px", async () => {
    await openPicker(true);
    const contagem = screen.getByText("Escolhe pelo menos uma foto.").closest("div")!;
    const botoes = screen.getByRole("button", { name: "Cancelar" }).closest("div")!;
    for (const el of [contagem, botoes]) {
      const comEcra = el.className.split(/\s+/).filter((c) => /^(sm|lg|min-\[[^\]]+\]):/.test(c));
      expect(comEcra, `\`${el.className}\` volta a perguntar pela janela`).toEqual([]);
    }
    expect(contagem.className).toContain("basis-full");
    expect(botoes.className).toContain("w-full");
  });

  it("e a frase inteira está lá — não uma palavra cortada", async () => {
    await openPicker(true);
    // O controlo positivo do de cima: a frase que era cortada. Hoje é outra
    // — «Escolhe pelo menos uma foto.» —, e o que se prende é o mesmo: que
    // cabe inteira.
    expect(screen.getByText("Escolhe pelo menos uma foto.")).toBeInTheDocument();
  });

  /**
   * ── O BOTÃO DESLIGADO PASSA A DIZER PORQUÊ ────────────────────────────
   *
   * Palavras dela: «o botão de adicionar aparece desativado sem dizer porquê».
   * A razão já estava escrita ao lado; o que faltava era estar LIGADA ao
   * botão, para quem ouve o ecrã em vez de o ver.
   */
  it("os botões de adicionar apontam para a razão de estarem desligados", async () => {
    photos = folder(6);
    await openPicker(true);
    const razao = screen.getByText("Escolhe pelo menos uma foto.");
    expect(razao.id).toBeTruthy();
    // Os dois: o «e escolher mais» e o de confirmar. Ambos estão desligados
    // pela mesma razão, e ambos têm de a apontar.
    const botoes = screen.getAllByRole("button", { name: /^Adicionar/ });
    expect(botoes).toHaveLength(2);
    for (const b of botoes) {
      expect(b).toBeDisabled();
      expect(b.getAttribute("aria-describedby")).toBe(razao.id);
    }
  });

  it("e deixam de apontar assim que há uma foto escolhida", async () => {
    photos = folder(6);
    await openPicker(true);
    fireEvent.click(photo(1));
    for (const b of screen.getAllByRole("button", { name: /^Adicionar/ })) {
      expect(b).not.toBeDisabled();
      expect(b.getAttribute("aria-describedby")).toBeNull();
    }
  });

  it("o fundo separa o painel da página, em vez de a deixar ler", async () => {
    await openPicker(true);
    const dialogo = screen.getByRole("dialog", { name: /biblioteca de temas/i });
    // O véu é do `FolhaOuDialogo` e é um irmão do painel, não a camada que o
    // contém: um `backdrop-blur` no PAI desfocava também o painel.
    const veu = dialogo.parentElement!.querySelector("[aria-hidden]")!;
    expect(veu.className, "`black/35` deixava o cabeçalho legível por trás").toContain(
      "backdrop-blur",
    );
    // Escuro que chegue para o título «Fazer proposta» deixar de se ler nítido
    // por trás da folha.
    expect(veu.className).toMatch(/bg-\[var\(--bo-seleccao\)\]\/40/);
  });

  it("e o rodapé não fica debaixo da barra de gestos do iPhone", async () => {
    await openPicker(true);
    const contagem = screen.getByText("Escolhe pelo menos uma foto.");
    const linha = contagem.closest("div")?.parentElement as HTMLElement;
    // Deixou de ser um `style` escrito à mão e passou a vir do primitivo, que
    // o dá a TODAS as folhas — era isto que faltava às outras seis.
    expect(linha.className).toContain("env(safe-area-inset-bottom)");
  });

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * A PÁGINA A GANHAR FORMA
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «deixa de se escolher às cegas e passa a compor-se». O que
   * se prende aqui não é o desenho do canto (isso é do próprio componente) mas
   * a LIGAÇÃO: o que já lá está vem do estúdio, o que vai entrar vem da
   * seleção, e as duas contas somam.
   */
  it("o canto soma o que a página já tem com o que está escolhido", async () => {
    await openPicker(true, undefined, undefined, {
      titulo: "Jardim ao entardecer",
      fotos: [{ path: "b/uma.jpg" }, { path: "b/outra.jpg" }],
      maximo: 10,
    });
    expect(screen.getByText("Jardim ao entardecer")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Foto 1 de ${visible()}` }));
    expect(screen.getByText("3"), "a escolhida conta antes de entrar").toBeInTheDocument();
  });

  it("e diz quando a escolha passa a ocupar duas páginas do PDF", async () => {
    // No PDF novo nenhuma fica de fora: acima do que cabe numa página, o tema
    // passa a duas («Mais ideias…»).
    await openPicker(true, undefined, undefined, {
      fotos: [{ path: "b/uma.jpg" }, { path: "b/outra.jpg" }],
      maximo: 2,
    });
    expect(screen.queryByText(/Ocupa 2 páginas/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: `Foto 1 de ${visible()}` }));
    expect(screen.getByText("Ocupa 2 páginas no PDF")).toBeInTheDocument();
  });

  it("sem página nenhuma para compor, o canto não existe", async () => {
    // É o caso das capas: uma foto por espaço, nenhum conjunto a compor.
    await openPicker(false);
    expect(screen.queryByLabelText("A página em construção")).toBeNull();
  });

  /** Flutuar e não empurrar: o canto não pode roubar altura às fotografias. */
  it("o canto flutua por cima da grelha", async () => {
    await openPicker(true, undefined, undefined, { fotos: [{ path: "b/uma.jpg" }], maximo: 10 });
    const canto = screen.getByLabelText("A página em construção");
    expect(canto.className).toContain("absolute");
    expect(canto.parentElement?.className, "sem `relative` o canto sai do painel").toContain(
      "relative",
    );
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS TEMAS AO LADO, E NÃO EM CIMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «sete linhas de temas ocupam mais de metade da altura do
 * modal. As fotos ficam num terço no fundo, com uma linha e meia visível».
 *
 * Ao alto, os temas comem ALTURA à grelha, e a conta é implacável: 25 temas
 * embrulhados em chips fazem sete filas. Ao lado, comem LARGURA — e largura é o
 * que um seletor de fotos tem de sobra, altura é o que não tem.
 *
 * O jsdom não faz layout: não há aqui píxeis para medir. O que se prende é a
 * DECISÃO, para que ninguém a desfaça sem dar por isso — a mesma escolha do
 * `Overview.movel.test`, que afirma sobre classes pela mesma razão.
 */
describe("o seletor a partir de 1024 px", () => {
  it("a lista de temas vira uma coluna com scroll próprio", async () => {
    await openPicker(true);
    const lista = screen.getByRole("group", { name: "Temas" });
    // Coluna, sem tecto de altura, e a ocupar o que sobra da lateral.
    expect(lista.className).toContain("lg:flex-col");
    expect(lista.className).toContain("lg:max-h-none");
    expect(lista.className).toContain("lg:flex-1");
    // E abaixo disso continua a ser a fila que rola de lado, que é a resposta
    // certa para um ecrã estreito.
    expect(lista.className).toContain("overflow-x-auto");
    expect(lista.className).toContain("snap-x");
  });

  it("o painel abre mais largo, para a coluna não roubar à grelha", async () => {
    // No computador é um DIÁLOGO ao centro, e é aí que a largura máxima existe
    // — a folha do telemóvel usa o ecrã todo e não tem tecto nenhum.
    ecraLargo();
    await openPicker(true);
    const painel = screen.getByRole("dialog");
    expect(painel.className).toContain("lg:max-w-[70rem]");
    // Abaixo de `lg` fica como estava.
    expect(painel.className).toContain("max-w-3xl");
    // E NÃO o degrau `lg` do primitivo (56 rem): com a coluna de 14 rem a
    // grelha ficava com 42, que é o defeito que esta largura veio corrigir.
    expect(painel.className.split(/\s+/)).not.toContain("max-w-4xl");
  });

  it("e cada tema ocupa a linha toda, encostado à esquerda", async () => {
    await openPicker(true);
    const primeiro = screen.getByRole("group", { name: "Temas" }).querySelector("button")!;
    // Centrado, um nome curto ao lado de um comprido lê-se como duas listas.
    expect(primeiro.className).toContain("lg:w-full");
    expect(primeiro.className).toContain("lg:!justify-start");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O SELETOR ABRE A SABER EM QUE PROPOSTA ESTÁ — FASE 6
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «o seletor abre sem saber em que proposta estou».
 *
 * Abria no tema em que se tocou por último — que, ao fim de um dia de
 * trabalho, é muitas vezes de OUTRO casamento. Encher o quarto mood board de
 * um casamento cujos três primeiros vieram todos de «Itália» e ver o diálogo
 * abrir em «Terracotta» é abrir no sítio errado com toda a informação para
 * acertar.
 *
 * A ordem de escolha é o que aqui se prende: o que ela fez NESTA sessão ganha
 * sempre (é o acto mais recente e mais explícito), e o contexto do pedido só
 * entra quando não há nada dessa sessão — mas ganha à memória do dia anterior.
 */
describe("por que tema é que o diálogo abre", () => {
  const varios = Array.from({ length: 4 }, (_, i) => ({
    ...THEME,
    id: `t${i + 1}`,
    name: `Tema ${i + 1}`,
  }));
  /** O nome do tema que está aberto — o chip com `aria-pressed`. */
  function temaActivo(): string {
    const lista = screen.getByRole("group", { name: "Temas" });
    const activos = [...lista.querySelectorAll('button[aria-pressed="true"]')];
    expect(activos, "esperava UM tema activo").toHaveLength(1);
    // Pelo nome ACESSÍVEL e não pelo texto: o chip escreve o nome e a
    // contagem lado a lado, e o `textContent` cola-os («Tema 341»).
    return (activos[0].getAttribute("aria-label") ?? "").split(",")[0].trim();
  }

  beforeEach(() => {
    route("GET /api/temas", () => ok(varios));
    // A pasta responde por qualquer um dos quatro: o que se está a testar é
    // por QUAL deles o diálogo abre, e todos têm de poder abrir.
    for (const t of varios) {
      route(`GET /api/temas/${t.id}/imagens`, (url) => {
        const q = new URL(url, "http://test").searchParams;
        const offset = Number(q.get("offset") ?? 0);
        const limit = Number(q.get("limit") ?? THEME_PAGE_SIZE);
        return ok({
          ok: true,
          images: photos.slice(offset, offset + limit),
          total: photos.length,
          truncated: false,
        });
      });
    }
    // A memória da sessão passada aponta para o «Tema 3» — outro dia, muitas
    // vezes outro casamento. É o palpite que o contexto tem de bater.
    localStorage.setItem("liquen-tema-recente", "t3");
  });

  it("abre no tema de que esta proposta já está a beber", async () => {
    // Nomes que NÃO existem na pasta de mentira: o que se está a testar é por
    // que tema o diálogo abre, e uma foto que também esteja na grelha ganhava
    // o sufixo «(já nesta proposta)» e mudava o nome acessível da célula.
    await openPicker(true, ["t1/usada-a.jpg", "t1/usada-b.jpg", "t2/usada-c.jpg"]);
    expect(temaActivo()).toBe("Tema 1");
  });

  it("uma foto solta de outro tema não muda o rumo", async () => {
    await openPicker(true, ["t2/a.jpg", "t2/b.jpg", "t2/c.jpg", "t4/z.jpg"]);
    expect(temaActivo()).toBe("Tema 2");
  });

  it("sem contexto nenhum, fica a memória da sessão passada", async () => {
    await openPicker(true, []);
    expect(temaActivo()).toBe("Tema 3");
  });

  /** Um caminho que não tem a forma `<tema>/<ficheiro>` não inventa um tema. */
  it("caminhos mal formados são ignorados", async () => {
    await openPicker(true, ["", "/solto.jpg", "sem-barra.jpg"]);
    expect(temaActivo()).toBe("Tema 3");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DUAS QUEIXAS DELA SOBRE ESCOLHER TEMAS, E AS DUAS ESTAVAM NO MESMO SÍTIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «às vezes não aparece a barra de pesquisa, outras vezes não dá
 * para escolher no computador os temas que nós queremos porque aquilo não dá
 * para fazer scroll para cima e para baixo».
 */
describe("escolher um tema no computador", () => {
  it("a caixa de procurar está à vista, sem ser preciso encontrar a lupa", async () => {
    /**
     * Não era «às vezes»: no computador nunca aparecia sozinha. O comentário
     * por cima da fila dizia, por escrito, que a partir de `sm` a caixa «volta
     * a ficar sempre à vista» — e a condição não tinha largura nenhuma.
     * Descrevia uma intenção que o código não cumpria.
     */
    ecraLargo();
    await openPicker(true);
    expect(screen.getByLabelText("Procurar tema")).toBeInTheDocument();
  });

  it("no telemóvel continua atrás da lupa — é altura que as fotos não têm", async () => {
    // Sem `matchMedia` o `useMedida` responde `false`, que é o caso estreito.
    // (A lupa só nasce com mais de três temas — aqui o que se afirma é que a
    // caixa não se abre sozinha e não come a altura das fotografias.)
    await openPicker(true);
    expect(screen.queryByLabelText("Procurar tema")).toBeNull();
  });

  /**
   * ── A ARMADILHA DO FLEX, VISTA NO DOM ─────────────────────────────────
   *
   * A lista dos temas rola com `overflow-y-auto` e pede a altura ao pai com
   * `flex-1`. Só que um elemento `flex` sem `min-h-0` nunca encolhe abaixo do
   * seu conteúdo: os pais cresciam, a coluna (que tem `overflow-hidden`)
   * cortava o que passava, e os temas de baixo ficavam inalcançáveis — sem
   * barra de rolamento, porque a lista nunca chegou a ter altura limitada.
   *
   * O jsdom não faz layout, portanto o que se afirma é a CADEIA: entre quem
   * rola e o primeiro antepassado de altura limitada, todo o `flex` pelo meio
   * tem de deixar a altura passar. Basta um a faltar para o scroll morrer.
   */
  it("a altura chega até quem rola — nenhum elo do flex a segura", async () => {
    ecraLargo();
    await openPicker(true);

    const lista = screen.getByRole("group", { name: "Temas" });
    expect(lista.className).toMatch(/overflow-y-auto/);

    const emFalta: string[] = [];
    let no = lista.parentElement;
    while (no && !no.className.includes("overflow-hidden")) {
      const classe = no.className ?? "";
      if (classe.includes("flex") && !classe.includes("min-h-0")) emFalta.push(classe);
      no = no.parentElement;
    }
    // E o varrimento tem de ter chegado mesmo a um antepassado com altura
    // limitada — senão passava por vacuidade sobre uma árvore que mudou.
    expect(no, "não há antepassado com `overflow-hidden`: a cadeia mudou").not.toBeNull();
    expect(
      emFalta,
      "um `flex` sem `min-h-0` entre a lista e a coluna: a altura não desce e a lista deixa de rolar",
    ).toEqual([]);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O NOME DA FOLHA DIZ PARA QUE SERVE **E** EM QUE TEMA SE ESTÁ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * É a primeira coisa que um leitor de ecrã anuncia ao abrir isto, e é a única
 * que anuncia — depois dela vem uma grelha de «Foto 1 de 12».
 *
 * Já esteve errado das duas maneiras possíveis, o que é a razão de haver aqui
 * um teste e não só um comentário:
 *
 *   · uma `aria-label` fixa («Escolher fotos da biblioteca de temas») dizia o
 *     TRABALHO e nunca o tema — e era uma cópia paralela do cabeçalho, que
 *     ninguém se lembrava de actualizar;
 *   · o cabeçalho que a substituiu («Biblioteca de temas» + o tema) dizia o
 *     TEMA e deixou de dizer o trabalho.
 *
 * As duas metades, e vindas do texto que está mesmo escrito no cabeçalho.
 */
describe("o nome acessível da folha", () => {
  it("junta o trabalho ao tema activo, a partir do texto visível", async () => {
    await openPicker(true);
    const folha = screen.getByRole("dialog");
    const nome = (folha.getAttribute("aria-labelledby") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");

    expect(nome, "o nome não diz para que serve a folha").toMatch(
      /Escolher fotos da biblioteca de temas/i,
    );
    expect(nome, "o nome não diz em que tema se está").toMatch(new RegExp(THEME.name));

    // E é MESMO o texto visível: nada de `aria-label` paralela por cima dele.
    expect(folha.getAttribute("aria-label")).toBeNull();
    for (const pedaco of ["Escolher fotos da biblioteca de temas", THEME.name]) {
      expect(within(folha).getAllByText(pedaco).length).toBeGreaterThan(0);
    }
  });
});

/** O aviso do rodapé (há outras regiões `alert` no ecrã: os avisos). */
function avisoDeQualidade() {
  const a = screen.getAllByRole("alert").find((e) => /má qualidade/.test(e.textContent ?? ""));
  if (!a) throw new Error("sem o aviso de qualidade");
  return a;
}

describe("a qualidade de cada foto, antes de a escolher (ela, 28/10)", () => {
  it("uma foto do Pinterest leva o sinal, e adicioná-la pergunta primeiro", async () => {
    photos = folder(3).map((p, i) =>
      i === 1 ? { ...p, largura: 736, altura: 1104 } : { ...p, largura: 2200, altura: 1467 },
    );
    render(
      <ToastProvider>
        <Host multiple lugar="tema" />
      </ToastProvider>,
    );
    await screen.findByRole("button", { name: "Foto 2 de 3 (má qualidade)" });
    expect(screen.getByRole("button", { name: "Foto 1 de 3" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Foto 1 de 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Foto 2 de 3 (má qualidade)" }));
    fireEvent.click(addAndClose(2));
    // Não adicionou: perguntou.
    expect(onReserve).not.toHaveBeenCalled();
    const alerta = avisoDeQualidade();
    expect(alerta).toHaveTextContent("Esta foto vai ficar com má qualidade");
    expect(alerta).toHaveTextContent(/Pinterest/);

    // «Tirar esta» deixa a boa escolhida, e o botão volta a dizer 1.
    fireEvent.click(within(alerta).getByRole("button", { name: "Tirar esta" }));
    fireEvent.click(addAndClose(1));
    await waitFor(() => expect(onReserve).toHaveBeenCalled());
    expect(reservados().map((r) => r.sourcePath)).toEqual(["t1/foto-1.jpg"]);
  });

  it("«Usar na mesma» segue com todas", async () => {
    photos = folder(2).map((p) => ({ ...p, largura: 600, altura: 400 }));
    render(
      <ToastProvider>
        <Host multiple lugar="tema" />
      </ToastProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Foto 1 de 2 (má qualidade)" }));
    fireEvent.click(addAndClose(1));
    fireEvent.click(within(avisoDeQualidade()).getByRole("button", { name: "Usar na mesma" }));
    await waitFor(() => expect(onReserve).toHaveBeenCalled());
  });

  it("sem saber para onde vai, não se avisa nada", async () => {
    photos = folder(2).map((p) => ({ ...p, largura: 600, altura: 400 }));
    render(
      <ToastProvider>
        <Host multiple />
      </ToastProvider>,
    );
    await screen.findByRole("button", { name: "Foto 1 de 2" });
  });
});
