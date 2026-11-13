import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * CARREGAMENTO DIRETO no estúdio de propostas.
 *
 * O guarda desta camada é `isProposalPath`: com escrita direta, o caminho que
 * chega à confirmação vem do navegador, e é só esta função que impede que ele
 * aponte para a pasta de OUTRO pedido — ou para fora do bucket. É pura, e é
 * testada como tal.
 *
 * O resto prova que a verificação de dimensões que a rota multipart fazia com
 * `sharp` ANTES de guardar não desapareceu: passou para a confirmação, e uma
 * imagem que não passa é apagada em vez de ficar no bucket à espera do gerador
 * de PDF.
 */
const st = vi.hoisted(() => ({
  /** O que o `sharp` diz do cabeçalho lido — é assim que se encena uma foto
   *  normal, uma bomba de descompressão e um ficheiro ilegível. */
  meta: { width: 3000, height: 2000 } as { width?: number; height?: number },
  metaThrows: false,
  removed: [] as string[],
  signed: vi.fn(),
  /** Assinatura UMA A UMA. Está aqui para se poder CONTAR: uma ida ao servidor
   *  por foto é precisamente o que o caminho em lote existe para não fazer. */
  signedOne: vi.fn(),
  uploadUrl: vi.fn(),
  hasUploadUrlApi: true,
  /** O conteúdo da pasta do pedido, para a listagem paginada. */
  objectos: [] as { id: string; name: string }[],
  /** Um Storage que ignora o `offset` — devolve sempre a mesma página. */
  ignoraOffset: false,
  /** Cada `list`, com o que lhe foi pedido. */
  listagens: [] as { prefixo: string; limit?: number; offset?: number }[],
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  /** O que já está no bucket — para o carregamento repetido (n.º 18). */
  guardados: new Set<string>(),
}));

// O registo vive no `st` (e não num objecto novo a cada reposição de módulos)
// para os AVISOS poderem ser lidos nos testes: uma truncagem calada é o defeito.
vi.mock("./logger", () => ({ log: st.log }));
vi.mock("./supabase", () => ({
  isDatabaseConfigured: () => true,
  getSupabase: () => ({
    storage: {
      getBucket: async (name: string) => ({ data: { name }, error: null }),
      createBucket: async () => ({ data: null, error: null }),
      updateBucket: async () => ({ data: null, error: null }),
      from: () => ({
        createSignedUrls: st.signed,
        createSignedUrl: st.signedOne,
        upload: async (path: string) => {
          if (st.guardados.has(path)) {
            return {
              data: null,
              error: { statusCode: "409", message: "The resource already exists" },
            };
          }
          st.guardados.add(path);
          return { data: { path }, error: null };
        },
        list: async (prefixo: string, opts?: { limit?: number; offset?: number }) => {
          st.listagens.push({ prefixo, limit: opts?.limit, offset: opts?.offset });
          const limite = opts?.limit ?? 100;
          const salto = st.ignoraOffset ? 0 : (opts?.offset ?? 0);
          return { data: st.objectos.slice(salto, salto + limite), error: null };
        },
        remove: async (paths: string[]) => {
          st.removed.push(...paths);
          return { data: paths.map((name) => ({ name })), error: null };
        },
        ...(st.hasUploadUrlApi ? { createSignedUploadUrl: st.uploadUrl } : {}),
      }),
    },
  }),
}));

// O `sharp` é o único pedaço que não vale a pena correr a sério aqui (exigia
// bytes de uma imagem verdadeira); tudo o resto — o pedido do cabeçalho, o
// corte de bytes, a decisão, a remoção — é o código real.
vi.mock("sharp", () => ({
  default: () => ({
    metadata: async () => {
      if (st.metaThrows) throw new Error("não é uma imagem");
      return st.meta;
    },
  }),
}));

async function load() {
  return import("./proposal-storage");
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  st.meta = { width: 3000, height: 2000 };
  st.metaThrows = false;
  st.removed = [];
  st.objectos = [];
  st.ignoraOffset = false;
  st.listagens = [];
  // O Storage devolve o cabeçalho pedido; `fetchHeader` é código real.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array(1024))),
  );
  st.hasUploadUrlApi = true;
  st.signed.mockImplementation(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })),
    error: null,
  }));
  st.uploadUrl.mockImplementation(async (path: string) => ({
    data: { signedUrl: `https://up/${path}?token=tok`, token: "tok", path },
    error: null,
  }));
  st.signedOne.mockImplementation(async (path: string) => ({
    data: { signedUrl: `https://storage.test/${path}` },
    error: null,
  }));
});

describe("isProposalPath", () => {
  it("aceita um ficheiro dentro da pasta DESTE pedido", async () => {
    const { isProposalPath } = await import("./proposal-storage");

    expect(isProposalPath("q-1/8f14e45f.jpg", "q-1")).toBe(true);
    expect(isProposalPath("q-1/foto.png", "q-1")).toBe(true);
    expect(isProposalPath("q-1/foto.webp", "q-1")).toBe(true);
  });

  it("RECUSA a pasta de outro pedido", async () => {
    const { isProposalPath } = await import("./proposal-storage");

    // É este o furo que o guarda existe para tapar: uma proposta não pode
    // confirmar (nem assinar) fotos de outra.
    expect(isProposalPath("q-2/foto.jpg", "q-1")).toBe(false);
    expect(isProposalPath("q-10/foto.jpg", "q-1")).toBe(false);
  });

  it("recusa travessia de diretórios e subpastas", async () => {
    const { isProposalPath } = await import("./proposal-storage");

    expect(isProposalPath("../theme-assets/t-1/foto.jpg", "q-1")).toBe(false);
    expect(isProposalPath("q-1/../q-2/foto.jpg", "q-1")).toBe(false);
    expect(isProposalPath("q-1/sub/foto.jpg", "q-1")).toBe(false);
    expect(isProposalPath("q-1/foto.svg", "q-1")).toBe(false);
    expect(isProposalPath(42, "q-1")).toBe(false);
  });

  it("compara com o id JÁ limpo, como o resto do módulo", async () => {
    const { isProposalPath } = await import("./proposal-storage");

    // `uploadProposalImage` grava em `<id limpo>/…`; o guarda tem de usar a
    // mesma regra, senão recusava caminhos que ele próprio criou.
    expect(isProposalPath("q1/foto.jpg", "q/1")).toBe(true);
  });
});

describe("createProposalUploadTickets", () => {
  it("constrói o caminho no servidor, na pasta do pedido", async () => {
    const { createProposalUploadTickets } = await load();
    const tickets = await createProposalUploadTickets("q-1", ["image/jpeg", "image/webp"]);

    expect(tickets).toHaveLength(2);
    expect(tickets![0].path).toMatch(/^q-1\/[0-9a-f-]{36}\.jpg$/);
    expect(tickets![1].path).toMatch(/^q-1\/[0-9a-f-]{36}\.webp$/);
    expect(st.uploadUrl).toHaveBeenCalledWith(expect.any(String), { upsert: false });
  });

  it("um Storage sem esta API devolve null — o cliente cai para o multipart", async () => {
    st.hasUploadUrlApi = false;
    const { createProposalUploadTickets } = await load();

    expect(await createProposalUploadTickets("q-1", ["image/jpeg"])).toBeNull();
  });

  it("se um bilhete falhar, não sai nenhum", async () => {
    st.uploadUrl.mockResolvedValueOnce({ data: null, error: { message: "não" } });
    const { createProposalUploadTickets } = await load();

    expect(await createProposalUploadTickets("q-1", ["image/jpeg", "image/jpeg"])).toBeNull();
  });
});

describe("confirmProposalUploads", () => {
  it("assina as boas", async () => {
    const { confirmProposalUploads } = await load();
    const res = await confirmProposalUploads("q-1", ["q-1/a.jpg"]);

    expect(res.images).toEqual([{ path: "q-1/a.jpg", url: "https://signed/q-1/a.jpg" }]);
    expect(res.rejected).toEqual([]);
  });

  it("RECUSA um caminho de outro pedido sem lhe tocar", async () => {
    const { confirmProposalUploads } = await load();
    const res = await confirmProposalUploads("q-1", ["q-2/roubada.jpg", "q-1/minha.jpg"]);

    expect(res.images.map((i) => i.path)).toEqual(["q-1/minha.jpg"]);
    expect(res.rejected).toEqual(["q-2/roubada.jpg"]);
    // Não foi apagada: não é nossa para apagar.
    expect(st.removed).not.toContain("q-2/roubada.jpg");
  });

  it("uma BOMBA de descompressão é apagada e reportada", async () => {
    // 100 000 × 100 000 = 10 gigapixéis: uns KB de PNG que dariam cabo da
    // memória do gerador de PDF ao serem descodificados.
    st.meta = { width: 100_000, height: 100_000 };
    const { confirmProposalUploads } = await load();
    const res = await confirmProposalUploads("q-1", ["q-1/bomba.png"]);

    expect(res.images).toEqual([]);
    expect(res.rejected).toEqual(["q-1/bomba.png"]);
    // O guarda que a rota multipart fazia com `sharp` continua a existir: o
    // que não presta não FICA no bucket à espera do gerador de PDF.
    expect(st.removed).toContain("q-1/bomba.png");
  });

  it("um ficheiro que nem é imagem é apagado", async () => {
    st.metaThrows = true;
    const { confirmProposalUploads } = await load();
    const res = await confirmProposalUploads("q-1", ["q-1/disfarce.jpg"]);

    expect(res.rejected).toEqual(["q-1/disfarce.jpg"]);
    expect(st.removed).toContain("q-1/disfarce.jpg");
  });

  it("uma imagem sem dimensões legíveis é apagada", async () => {
    st.meta = {};
    const { confirmProposalUploads } = await load();
    const res = await confirmProposalUploads("q-1", ["q-1/vazia.jpg"]);

    expect(res.rejected).toEqual(["q-1/vazia.jpg"]);
    expect(st.removed).toContain("q-1/vazia.jpg");
  });

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * SESSENTA FOTOS NÃO PODEM SER CENTO E VINTE PEDIDOS AO MESMO TEMPO
   * ═════════════════════════════════════════════════════════════════════════
   *
   * A confirmação fazia um `Promise.all` sobre as fotos todas, e cada uma
   * assinava o SEU URL e fazia o SEU pedido de cabeçalho. Assinar em lote já
   * existia no módulo (`assinarLote`), com comentários noutros sítios a dizer
   * que uma ida ao servidor POR FOTO é o que se evita — só este caminho é que
   * não o fazia.
   */
  it("assina TUDO num pedido só e não uma vez por foto", async () => {
    const paths = Array.from({ length: 30 }, (_, i) => `q-1/f${i}.jpg`);
    const { confirmProposalUploads } = await load();
    const res = await confirmProposalUploads("q-1", paths);

    expect(res.images).toHaveLength(30);
    expect(st.signedOne).not.toHaveBeenCalled();
    // Um lote para verificar as 30, outro para as assinar para o estúdio.
    expect(st.signed).toHaveBeenCalledTimes(2);
    expect(st.signed.mock.calls[0][0]).toEqual(paths);
  });

  it("os pedidos de cabeçalho vão com tecto de concorrência", async () => {
    let emCurso = 0;
    let maximo = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        emCurso++;
        maximo = Math.max(maximo, emCurso);
        await new Promise((r) => setTimeout(r, 2));
        emCurso--;
        return new Response(new Uint8Array(1024));
      }),
    );
    const paths = Array.from({ length: 30 }, (_, i) => `q-1/f${i}.jpg`);
    const { confirmProposalUploads } = await load();
    await confirmProposalUploads("q-1", paths);

    expect(maximo).toBeLessThanOrEqual(8);
    // E foram lidas todas — o tecto atrasa, não deita fotos fora.
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(30);
  });

  it("uma foto que o lote não assinou é assinada à parte, não dada por má", async () => {
    // Uma assinatura em falta não é prova de que a foto não presta — e apagá-la
    // por isso seria perder a foto de alguém por causa de um soluço do Storage.
    st.signed.mockImplementation(async (paths: string[]) => ({
      data: paths
        .filter((p) => !p.endsWith("teimosa.jpg"))
        .map((path) => ({
          path,
          signedUrl: `https://signed/${path}`,
        })),
      error: null,
    }));
    const { confirmProposalUploads } = await load();
    const res = await confirmProposalUploads("q-1", ["q-1/boa.jpg", "q-1/teimosa.jpg"]);

    expect(st.signedOne).toHaveBeenCalledWith("q-1/teimosa.jpg", 60);
    expect(res.rejected).toEqual([]);
    expect(st.removed).toEqual([]);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UMA LISTAGEM QUE CORTA EM SILÊNCIO PERDE FOTOS DO ESTÚDIO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Estava um `limit: 200` sem paginação e sem aviso: passadas 200 fotos num
 * pedido, as mais antigas desapareciam da grelha — e a pasta é a única lista
 * independente do dispositivo (um rascunho no `localStorage` é daquele
 * navegador). A regra da casa está escrita no topo do `repository.ts`: a
 * truncagem nunca é calada.
 */
describe("listProposalImages pagina a pasta", () => {
  const pasta = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, name: `f${i}.jpg` }));

  it("uma pasta com mais de 200 fotos vem INTEIRA", async () => {
    st.objectos = pasta(250);
    const { listProposalImages } = await load();
    const imagens = await listProposalImages("q-1");

    expect(imagens).toHaveLength(250);
    // Duas páginas: a segunda veio incompleta e por isso é a última.
    expect(st.listagens.map((l) => l.offset)).toEqual([0, 200]);
    expect(imagens[0].path).toBe("q-1/f0.jpg");
    expect(imagens[249].path).toBe("q-1/f249.jpg");
  });

  it("uma pasta que cabe numa página não pede a seguinte", async () => {
    st.objectos = pasta(3);
    const { listProposalImages } = await load();

    expect(await listProposalImages("q-1")).toHaveLength(3);
    expect(st.listagens).toHaveLength(1);
  });

  it("um Storage que ignore o `offset` pára no tecto — e AVISA", async () => {
    // Sem tecto isto era um ciclo infinito; com tecto e sem aviso era a mesma
    // truncagem calada de antes, só que mais tarde.
    st.ignoraOffset = true;
    st.objectos = pasta(200);
    const { listProposalImages } = await load();
    const imagens = await listProposalImages("q-1");

    expect(imagens.length).toBeGreaterThan(0);
    expect(st.listagens.length).toBe(25);
    expect(st.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("truncada"),
      expect.objectContaining({ quoteId: "q-1" }),
    );
  });
});

// ── A pasta de um pedido que saiu de vez da Reciclagem (R3b) ─────────────────
describe("apagarPastaDoPedido", () => {
  it("apaga os originais da pasta, e as mesmas nas derivadas", async () => {
    st.objectos = [
      { id: "1", name: "a.jpg" },
      { id: "2", name: "b.jpg" },
    ];
    const { apagarPastaDoPedido } = await import("./proposal-storage");
    expect(await apagarPastaDoPedido("LIQ-9")).toBe(true);
    expect(st.listagens[0].prefixo).toBe("LIQ-9");
    // Originais + miniaturas + médias + AVIF + capas: o mesmo caminho em cada.
    expect(st.removed.filter((p) => p === "LIQ-9/a.jpg")).toHaveLength(5);
  });

  it("um id estranho não chega ao Storage", async () => {
    const { apagarPastaDoPedido } = await import("./proposal-storage");
    expect(await apagarPastaDoPedido("../")).toBe(false);
    expect(st.listagens).toEqual([]);
  });
});

describe("uploadProposalImage — a mesma foto, repetida depois de a rede falhar (13/11, n.º 18)", () => {
  it("com a mesma chave vai para o MESMO caminho, e a segunda vez usa o ficheiro que lá está", async () => {
    st.guardados.clear();
    st.signedOne.mockResolvedValue({ data: { signedUrl: "https://x/assinado" }, error: null });
    const { uploadProposalImage } = await load();
    const chave = "6f1c2b9e-3a4d-4b8e-9c1f-2a3b4c5d6e7f";
    const a = await uploadProposalImage("q1", Buffer.from("x"), "image/jpeg", chave);
    const b = await uploadProposalImage("q1", Buffer.from("x"), "image/jpeg", chave);
    expect(a?.path).toBe(`q1/${chave}.jpg`);
    expect(b?.path).toBe(a?.path);
    expect(st.guardados.size).toBe(1);
  });

  it("sem chave (ou com uma chave estranha) continua a ser um nome novo", async () => {
    st.guardados.clear();
    st.signedOne.mockResolvedValue({ data: { signedUrl: "https://x/assinado" }, error: null });
    const { uploadProposalImage } = await load();
    const a = await uploadProposalImage("q1", Buffer.from("x"), "image/jpeg", "../../outra");
    expect(a?.path).toMatch(/^q1\/[0-9a-f-]{36}\.jpg$/);
  });
});
