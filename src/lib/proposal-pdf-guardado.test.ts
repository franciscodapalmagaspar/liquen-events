import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PDF DO CASAL NÃO SE DESENHA DUAS VEZES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Na página onde o casal aceita a proposta, o «Ver a proposta completa (PDF)»
 * era um link directo que mandava REDESENHAR o documento — oitenta fotografias
 * pelo `sharp`, num processo que três dias depois do envio está frio. Segundos,
 * atrás de um link que não diz nada enquanto trabalha.
 *
 * O ficheiro já existe: é o que seguiu em anexo. Isto guarda-o.
 *
 * O que estes testes prendem, por ordem de importância:
 *
 *  1. **a chave é o CONTEÚDO.** Uma proposta revista não pode servir o
 *     ficheiro antigo — é o mesmo defeito de que a rota do link já se protege
 *     («a página na versão 2 com um botão que descarrega a 1»);
 *  2. **nada disto pode partir nada.** É memória, não é a verdade: uma escrita
 *     ou uma leitura que falhem custam um desenho a mais, e mais nada. Nenhuma
 *     função deste módulo lança.
 */

const st = vi.hoisted(() => ({
  /** Os ficheiros guardados: caminho → bytes. */
  ficheiros: new Map<string, Buffer>(),
  /** O bucket existe? */
  bucketExiste: true,
  /** Criar o bucket rebenta? */
  criarRebenta: false,
  /** O upload rebenta? */
  subirRebenta: false,
  /** Quantas vezes se tentou criar o bucket. */
  criacoes: 0,
  /** Quantas vezes se DESCEU um ficheiro — a pergunta «existe?» não pode. */
  descidas: 0,
  cliente: null as unknown,
}));

vi.mock("./supabase", () => ({ getSupabase: () => st.cliente }));
vi.mock("./logger", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const arquivar = vi.hoisted(() => vi.fn(async () => null));
vi.mock("./arquivo-de-pdfs/arquivo", () => ({
  arquivarPdfDesmontado: arquivar,
  ligado: () => process.env.ARQUIVO_DE_PDFS === "ligado",
}));

import {
  guardarPdfDaProposta,
  lerPdfDaProposta,
  existePdfDaProposta,
  esquecerBucketDePdfs,
} from "./proposal-pdf-guardado";

function storageFalso() {
  return {
    storage: {
      async getBucket() {
        return st.bucketExiste
          ? { data: { name: "proposal-pdfs" }, error: null }
          : { data: null, error: { message: "Bucket not found" } };
      },
      async createBucket() {
        st.criacoes += 1;
        if (st.criarRebenta) return { error: { message: "sem permissões" } };
        st.bucketExiste = true;
        return { error: null };
      },
      from() {
        return {
          async upload(caminho: string, bytes: Buffer) {
            if (st.subirRebenta) return { error: { message: "quota excedida" } };
            if (st.ficheiros.has(caminho)) return { error: { message: "already exists" } };
            st.ficheiros.set(caminho, bytes);
            return { error: null };
          },
          async list(pasta: string, opcoes?: { search?: string; limit?: number }) {
            const prefixo = `${pasta}/`;
            const procura = (opcoes?.search ?? "").toLowerCase();
            const nomes = [...st.ficheiros.keys()]
              .filter((c) => c.startsWith(prefixo))
              .map((c) => c.slice(prefixo.length))
              /**
               * `search` do Storage é um `ilike`, e portanto INSENSÍVEL A
               * MAIÚSCULAS. As chaves são `base64url` — `A` e `a` são chaves
               * diferentes e ficheiros diferentes. É por isso que a função
               * confere o nome à letra depois de listar, e é isso que este
               * duplo tem de reproduzir: um duplo sensível a maiúsculas fazia
               * a confirmação passar por não haver nada que a pusesse à prova.
               */
              .filter((nome) => !procura || nome.toLowerCase().startsWith(procura))
              .slice(0, opcoes?.limit ?? 100);
            return { data: nomes.map((name) => ({ name })), error: null };
          },
          async download(caminho: string) {
            st.descidas += 1;
            const b = st.ficheiros.get(caminho);
            if (!b) return { data: null, error: { message: "Object not found" } };
            // `new Uint8Array(b)` e não o `Buffer` directo: o `Buffer` do Node
            // é um `ArrayBufferLike` e o `BlobPart` quer um `ArrayBuffer`.
            return { data: new Blob([new Uint8Array(b)]), error: null };
          },
        };
      },
    },
  };
}

const BYTES = Buffer.from("%PDF-1.7 um documento");

beforeEach(() => {
  st.ficheiros = new Map();
  st.bucketExiste = true;
  st.criarRebenta = false;
  st.subirRebenta = false;
  st.criacoes = 0;
  st.descidas = 0;
  st.cliente = storageFalso();
  esquecerBucketDePdfs();
});

describe("guardar e ler o PDF de uma proposta", () => {
  it("o que se guarda é o que se lê", async () => {
    expect(await guardarPdfDaProposta("p-1", "chave-A", BYTES)).toBe(true);
    const lido = await lerPdfDaProposta("p-1", "chave-A");
    expect(lido?.toString()).toBe(BYTES.toString());
  });

  /** ── O QUE PROTEGE O CASAL DE VER A VERSÃO ERRADA ─────────────────── */

  it("uma chave diferente — um documento revisto — não encontra o antigo", async () => {
    await guardarPdfDaProposta("p-1", "chave-A", BYTES);
    expect(await lerPdfDaProposta("p-1", "chave-B")).toBeNull();
  });

  it("e uma proposta diferente também não", async () => {
    await guardarPdfDaProposta("p-1", "chave-A", BYTES);
    expect(await lerPdfDaProposta("p-2", "chave-A")).toBeNull();
  });

  it("guardar duas vezes a mesma chave não é uma falha", async () => {
    // A chave é o conteúdo: o que já lá está é byte-a-byte o mesmo ficheiro.
    expect(await guardarPdfDaProposta("p-1", "chave-A", BYTES)).toBe(true);
    expect(await guardarPdfDaProposta("p-1", "chave-A", BYTES)).toBe(true);
  });

  /** ── NADA DISTO PODE PARTIR UM ENVIO ──────────────────────────────── */

  it("sem Storage configurado, não lança — devolve que não guardou", async () => {
    st.cliente = null;
    expect(await guardarPdfDaProposta("p-1", "chave-A", BYTES)).toBe(false);
    expect(await lerPdfDaProposta("p-1", "chave-A")).toBeNull();
  });

  it("uma escrita recusada não lança", async () => {
    st.subirRebenta = true;
    expect(await guardarPdfDaProposta("p-1", "chave-A", BYTES)).toBe(false);
  });

  it("um bucket que não se consegue criar não lança", async () => {
    st.bucketExiste = false;
    st.criarRebenta = true;
    expect(await guardarPdfDaProposta("p-1", "chave-A", BYTES)).toBe(false);
  });

  it("uma leitura de um ficheiro que não existe é `null`, não um erro", async () => {
    await expect(lerPdfDaProposta("p-1", "nao-existe")).resolves.toBeNull();
  });

  it("um PDF vazio não se guarda", async () => {
    expect(await guardarPdfDaProposta("p-1", "chave-A", Buffer.alloc(0))).toBe(false);
  });

  it("um ficheiro absurdamente grande não se guarda", async () => {
    // 20 MB é o tecto; uma proposta anda pelos 0,5–4.
    const enorme = Buffer.alloc(21 * 1024 * 1024);
    expect(await guardarPdfDaProposta("p-1", "chave-A", enorme)).toBe(false);
  });

  it("sem id ou sem chave não se faz nada", async () => {
    expect(await guardarPdfDaProposta("", "chave-A", BYTES)).toBe(false);
    expect(await guardarPdfDaProposta("p-1", "", BYTES)).toBe(false);
    expect(await lerPdfDaProposta("", "chave-A")).toBeNull();
  });

  it("o bucket cria-se UMA vez por processo, e não a cada gravação", async () => {
    st.bucketExiste = false;
    await guardarPdfDaProposta("p-1", "a", BYTES);
    await guardarPdfDaProposta("p-1", "b", BYTES);
    await guardarPdfDaProposta("p-1", "c", BYTES);
    expect(st.criacoes).toBe(1);
  });

  it("um id com caracteres estranhos não escapa da pasta", async () => {
    // O caminho é construído aqui; um id vindo de fora não pode subir níveis.
    await guardarPdfDaProposta("../../outra", "chave-A", BYTES);
    expect([...st.ficheiros.keys()].every((c) => !c.includes(".."))).toBe(true);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PERGUNTAR «JÁ ESTÁ LÁ?» NÃO É O MESMO QUE O IR BUSCAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O aquecimento nocturno faz esta pergunta uma vez por proposta, e a resposta
 * quase sempre é «sim». Fazê-la com o `lerPdfDaProposta` era descer o ficheiro
 * inteiro — megabytes — para o deitar fora a seguir, multiplicado por todas as
 * propostas que ela já enviou, todas as noites.
 */
describe("saber se o PDF já lá está, sem o trazer", () => {
  it("diz que sim quando lá está, e sem descer um byte", async () => {
    await guardarPdfDaProposta("p-1", "chave-A", BYTES);
    st.descidas = 0;

    expect(await existePdfDaProposta("p-1", "chave-A")).toBe(true);
    expect(st.descidas, "a pergunta desceu o ficheiro em vez de o listar").toBe(0);
  });

  it("diz que não quando não está", async () => {
    await guardarPdfDaProposta("p-1", "chave-A", BYTES);

    expect(await existePdfDaProposta("p-1", "chave-B")).toBe(false);
    expect(await existePdfDaProposta("p-2", "chave-A")).toBe(false);
  });

  /**
   * A armadilha, e a razão de a função conferir o nome à letra depois de
   * listar.
   *
   * O `search` do Storage é um `ilike`: não distingue maiúsculas. As chaves
   * são `sha256` em `base64url`, onde `A` e `a` são caracteres diferentes e
   * portanto ficheiros diferentes — dois documentos distintos podem dar chaves
   * que só diferem numa caixa. Sem a confirmação à letra, o aquecimento via o
   * PDF de OUTRO documento e dava esta proposta por feita.
   *
   * Um falso «existe» é o pior dos dois erros: a proposta fica por aquecer e
   * ninguém dá por isso.
   */
  it("uma chave que só difere nas maiúsculas não passa pela outra", async () => {
    await guardarPdfDaProposta("p-1", "chaveMAIUSCULA", BYTES);

    expect(await existePdfDaProposta("p-1", "chavemaiuscula")).toBe(false);
    // E a verdadeira continua a ser encontrada — senão isto passava por
    // responder «não» a tudo.
    expect(await existePdfDaProposta("p-1", "chaveMAIUSCULA")).toBe(true);
  });

  it("sem id, sem chave, ou sem armazenamento, a resposta é «não sei» — que é «não»", async () => {
    // As duas respostas levam ao mesmo sítio: desenhar. Distingui-las aqui só
    // daria a quem chama uma decisão que não tem de tomar.
    expect(await existePdfDaProposta("", "chave-A")).toBe(false);
    expect(await existePdfDaProposta("p-1", "")).toBe(false);
    st.cliente = null;
    expect(await existePdfDaProposta("p-1", "chave-A")).toBe(false);
  });

  it("um armazenamento que rebenta não lança — responde que não", async () => {
    st.cliente = {
      storage: {
        from() {
          return {
            async list() {
              throw new Error("a rede caiu");
            },
          };
        },
      },
    };
    await expect(existePdfDaProposta("p-1", "chave-A")).resolves.toBe(false);
  });

  it("saneia o id da mesma maneira que a gravação", async () => {
    /**
     * Aqui estava um `resolves.toBe(false)` sobre um id de travessia, e não
     * conseguia reprovar: sem ficheiro nenhum naquele sítio, a resposta era
     * «não» com ou sem saneamento. Um teste que não distingue o certo do
     * errado.
     *
     * O que importa não é a resposta a um id estranho: é que as DUAS metades
     * concordem. A gravação constrói o caminho com o id saneado; se a pergunta
     * o construísse de outra maneira, procurava numa pasta onde nunca ninguém
     * escreveu e respondia «não existe» a um ficheiro que existe — e o
     * aquecimento redesenhava-o todas as noites, para sempre.
     */
    await guardarPdfDaProposta("../../outra", "chave-A", BYTES);

    expect(
      await existePdfDaProposta("../../outra", "chave-A"),
      "a pergunta e a gravação deixaram de construir o mesmo caminho",
    ).toBe(true);
    expect(
      [...st.ficheiros.keys()].every((c) => !c.includes("..")),
      "o caminho escapou",
    ).toBe(true);
  });
});

/**
 * O desmontado ao lado (`arquivo-de-pdfs/`, fase 2): só para um PDF NOVO, só
 * com o interruptor ligado, e nunca no lugar do original.
 */
describe("o arquivo desmontado, ao lado do original", () => {
  beforeEach(() => {
    st.ficheiros.clear();
    st.bucketExiste = true;
    st.subirRebenta = false;
    st.cliente = storageFalso();
    esquecerBucketDePdfs();
    arquivar.mockClear();
  });

  it("desligado (por omissão), não desmonta nada", async () => {
    delete process.env.ARQUIVO_DE_PDFS;
    expect(await guardarPdfDaProposta("p1", "c1", Buffer.from("%PDF-1"))).toBe(true);
    expect(arquivar).not.toHaveBeenCalled();
  });

  it("ligado: um PDF novo desmonta-se uma vez; o que já lá estava, não", async () => {
    process.env.ARQUIVO_DE_PDFS = "ligado";
    try {
      expect(await guardarPdfDaProposta("p1", "c1", Buffer.from("%PDF-1"))).toBe(true);
      expect(arquivar).toHaveBeenCalledTimes(1);
      expect(arquivar).toHaveBeenCalledWith("p1", "c1", Buffer.from("%PDF-1"));
      expect(st.ficheiros.has("p1/c1.pdf")).toBe(true);
      expect(await guardarPdfDaProposta("p1", "c1", Buffer.from("%PDF-1"))).toBe(true);
      expect(arquivar).toHaveBeenCalledTimes(1);
    } finally {
      delete process.env.ARQUIVO_DE_PDFS;
    }
  });

  it("um original que não ficou guardado não se desmonta", async () => {
    process.env.ARQUIVO_DE_PDFS = "ligado";
    st.subirRebenta = true;
    try {
      expect(await guardarPdfDaProposta("p1", "c1", Buffer.from("%PDF-1"))).toBe(false);
      expect(arquivar).not.toHaveBeenCalled();
    } finally {
      delete process.env.ARQUIVO_DE_PDFS;
    }
  });
});
