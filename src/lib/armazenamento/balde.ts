import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { log } from "@/lib/logger";
import {
  blobConfigurado,
  caminhoValido,
  chaveNoBlob,
  ehBaldeDoBlob,
  type BaldeDoBlob,
  type ModoDoBalde,
} from "./baldes";
import { modoDoBalde } from "./modos";
import {
  gravarNoIndice,
  indiceDebaixoDe,
  lerDoIndice,
  tirarDoIndice,
  type LinhaDoIndice,
} from "./indice";
import {
  BlobAvariado,
  BlobRecusado,
  apagarDoBlob,
  copiarNoBlob,
  lerDoBlob,
  porNoBlob,
  urlDeLeituraDoBlob,
} from "./blob";
import { segredoDosEnderecos, urlEstavel } from "./url-estavel";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * `balde(nome)` — O MESMO BALDE DE SEMPRE, MORE ONDE MORAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Substitui `sb.storage.from(nome)` no código do servidor. Devolve um objecto
 * com a MESMA forma da API do supabase-js (`upload`, `download`, `remove`,
 * `list`, `createSignedUrl(s)`, `copy`, `move`, `exists`, …) e os mesmos
 * `{ data, error }` que quem chama já lê — para que nenhum dos ~90 sítios que
 * mexem em ficheiros tenha de saber onde o ficheiro está.
 *
 * ── SEM O TOKEN DO BLOB, É LITERALMENTE O DE ANTES ────────────────────────
 * Sem `BLOB_READ_WRITE_TOKEN`, ou para um balde fora dos três
 * (`baldes.ts`), devolve `sb.storage.from(nome)` TAL E QUAL — o mesmo objecto.
 * Os testes que fazem duplo do `getSupabase` continuam a passar sem saber que
 * isto existe, e em produção nada muda até o dono ligar o store.
 *
 * ── COM O TOKEN, O MODO DO BALDE MANDA (`modos.ts`) ──────────────────────
 *  - `supabase`: cada método passa direito ao Supabase;
 *  - `espelho`: escreve no Supabase e DEPOIS no Blob (um erro do Blob fica nos
 *    registos e não estraga nada); lê sempre do Supabase;
 *  - `blob`: escreve no Blob e regista no índice (`indice.ts`); lê do Blob o
 *    que o índice diz que lá está e do Supabase o resto. Uma escrita recusada
 *    pelo tecto, ou falhada, vai para o Supabase; uma leitura que dê 404 no
 *    Blob volta ao Supabase. Nunca se perde uma fotografia a meio.
 *
 * O envio DIRECTO do navegador (`createSignedUploadUrl`) fica sempre no
 * Supabase, em qualquer modo — ver a secção «O Blob» do
 * `docs/GASTAR-POUCO-DESDE-O-INICIO.md`: nenhum ecrã o usa hoje, e o que lá
 * cair passa ao Blob pela migração (`migracao.ts`).
 */

type BaldeDoSupabase = ReturnType<SupabaseClient["storage"]["from"]>;
type Erro = { name: string; message: string; status: number; statusCode: string };

function erro(message: string, status = 500): Erro {
  return { name: "StorageError", message, status, statusCode: String(status) };
}

/** Um prazo de assinatura a partir do qual o endereço passa a ser o nosso (ver `url-estavel.ts`). */
const PRAZO_DO_ENDERECO_DIRECTO_S = 3600;

export function balde(nome: string, sb?: SupabaseClient | null): BaldeDoSupabase {
  const cliente = sb ?? getSupabase();
  if (!cliente) throw new Error("Armazenamento sem Supabase configurado.");
  const base = cliente.storage.from(nome);
  if (!blobConfigurado() || !ehBaldeDoBlob(nome)) return base;
  const nosso = metodosComBlob(nome, base, cliente);
  return new Proxy(base, {
    get(alvo, prop, receptor) {
      if (typeof prop === "string" && prop in nosso) return nosso[prop as keyof typeof nosso];
      const v = Reflect.get(alvo, prop, receptor);
      return typeof v === "function" ? v.bind(alvo) : v;
    },
  });
}

// ── auxiliares ─────────────────────────────────────────────────────────────

async function emBytes(corpo: unknown): Promise<Uint8Array | null> {
  if (corpo instanceof Uint8Array) return corpo;
  if (corpo instanceof ArrayBuffer) return new Uint8Array(corpo);
  if (ArrayBuffer.isView(corpo))
    return new Uint8Array(corpo.buffer, corpo.byteOffset, corpo.byteLength);
  if (typeof Blob !== "undefined" && corpo instanceof Blob)
    return new Uint8Array(await corpo.arrayBuffer());
  if (typeof corpo === "string") return new TextEncoder().encode(corpo);
  return null; // fluxos e formulários: ficam no Supabase, que os sabe ler
}

const hex = (alg: "md5" | "sha256", b: Uint8Array) => createHash(alg).update(b).digest("hex");

/** O índice falhou de ler: na dúvida, ninguém está no Blob (lê-se do Supabase). */
async function indiceOuVazio(b: BaldeDoBlob, caminhos: readonly string[]) {
  try {
    return await lerDoIndice(b, caminhos);
  } catch (e) {
    log.warn("blob: índice não lido — lê-se do Supabase", { balde: b, erro: String(e) });
    return new Map<string, LinhaDoIndice>();
  }
}

function pareceNaoExiste(e: unknown): boolean {
  const o = e as { status?: unknown; statusCode?: unknown; message?: unknown } | null;
  if (!o) return false;
  if (String(o.statusCode ?? o.status ?? "") === "404") return true;
  return typeof o.message === "string" && /not.?found|não existe|object not found/i.test(o.message);
}

/** O segredo próprio das assinaturas `/api/ficheiro` (não o token — ver `url-estavel.ts`). */
function segredo(): string {
  return segredoDosEnderecos();
}

/**
 * Guarda bytes no Blob e regista-os no índice. Se o índice não ficar gravado,
 * DESFAZ a escrita no Blob: uma fotografia que o índice não conhece era uma
 * fotografia que nenhuma listagem mostrava. Lança `BlobRecusado`/`BlobAvariado`.
 */
async function guardarNoBlob(
  b: BaldeDoBlob,
  caminho: string,
  bytes: Uint8Array,
  opcoes: {
    contentType?: string;
    sobrescrever: boolean;
    cacheSegundos?: number;
    criadoEm?: string;
  },
): Promise<LinhaDoIndice> {
  const chave = chaveNoBlob(b, caminho);
  await porNoBlob(chave, bytes, opcoes);
  const linha: LinhaDoIndice = {
    t: bytes.byteLength,
    m: hex("md5", bytes),
    s: hex("sha256", bytes),
    c: opcoes.criadoEm ?? new Date().toISOString(),
    ...(opcoes.contentType ? { ct: opcoes.contentType } : {}),
  };
  if (!(await gravarNoIndice(b, [{ caminho, linha }]))) {
    await apagarDoBlob([chave], bytes.byteLength).catch(() => undefined);
    throw new BlobAvariado("indice", "avaria");
  }
  return linha;
}

type OpcoesDeEnvio = { upsert?: boolean; contentType?: string; cacheControl?: string };

function metodosComBlob(nome: BaldeDoBlob, base: BaldeDoSupabase, cliente: SupabaseClient) {
  const modo = () => modoDoBalde(nome);

  /** Espelha uma escrita já feita no Supabase. Nunca lança: o Supabase manda. */
  async function espelhar(caminho: string, bytes: Uint8Array, o: OpcoesDeEnvio) {
    try {
      await guardarNoBlob(nome, caminho, bytes, {
        contentType: o.contentType,
        sobrescrever: true,
        cacheSegundos: Number(o.cacheControl) || undefined,
      });
    } catch (e) {
      log.warn("blob: espelho não escrito", { balde: nome, erro: String((e as Error)?.message) });
    }
  }

  async function upload(caminho: string, corpo: unknown, opcoes?: OpcoesDeEnvio) {
    const o = opcoes ?? {};
    const m = await modo();
    // Os bytes para o Blob; o Supabase recebe o corpo ORIGINAL (um `Blob`
    // lê-se as vezes que for preciso, e leva o tipo dele). Um fluxo não se
    // lê aqui (`emBytes` dá null) e vai inteiro para o Supabase.
    const bytes = m === "supabase" ? null : await emBytes(corpo);
    const paraOSupabase = corpo;
    if (m === "supabase" || !bytes || !caminhoValido(caminho)) {
      return base.upload(caminho, paraOSupabase as never, opcoes as never);
    }
    if (m === "espelho") {
      const r = await base.upload(caminho, paraOSupabase as never, opcoes as never);
      if (!r.error) await espelhar(caminho, bytes, o);
      return r;
    }
    // modo `blob`
    if (!o.upsert) {
      // O `upsert: false` do Supabase recusa o que JÁ existe — esteja onde estiver.
      const jaNoBlob = (await indiceOuVazio(nome, [caminho])).has(caminho);
      const jaNoSupabase = jaNoBlob ? false : (await base.exists(caminho)).data === true;
      if (jaNoBlob || jaNoSupabase) {
        return { data: null, error: erro("The resource already exists", 409) };
      }
    }
    try {
      await guardarNoBlob(nome, caminho, bytes, {
        contentType: o.contentType,
        sobrescrever: !!o.upsert,
        cacheSegundos: Number(o.cacheControl) || undefined,
      });
      // Substituído por vontade (`upsert`): a cópia velha que ainda esteja no
      // Supabase já não é a verdade — sai, para não voltar numa listagem.
      if (o.upsert) await base.remove([caminho]).catch(() => undefined);
      return {
        data: { id: chaveNoBlob(nome, caminho), path: caminho, fullPath: `${nome}/${caminho}` },
        error: null,
      };
    } catch (e) {
      if (e instanceof BlobAvariado && e.codigo === "ja-existe") {
        return { data: null, error: erro("The resource already exists", 409) };
      }
      // Tecto, avaria ou índice: a fotografia vai para o Supabase. Nunca se perde.
      log.warn("blob: escrita foi para o Supabase", {
        balde: nome,
        motivo: e instanceof BlobRecusado ? e.motivo : String((e as Error)?.message),
      });
      return base.upload(caminho, paraOSupabase as never, opcoes as never);
    }
  }

  async function download(caminho: string) {
    if ((await modo()) !== "blob") return base.download(caminho);
    const linha = (await indiceOuVazio(nome, [caminho])).get(caminho);
    const doBlob = async () => {
      try {
        const r = await lerDoBlob(chaveNoBlob(nome, caminho), linha?.t ?? 0);
        return r ? new Blob([Buffer.from(r.bytes)], { type: linha?.ct ?? r.tipo }) : null;
      } catch (e) {
        log.warn("blob: leitura falhou — tenta-se o Supabase", {
          balde: nome,
          motivo: e instanceof BlobRecusado ? e.motivo : String((e as Error)?.message),
        });
        return null;
      }
    };
    if (linha) {
      const b = await doBlob();
      if (b) return { data: b, error: null };
      // 404 no Blob (ou tecto): o Supabase ainda pode ter a de antes da migração.
      return base.download(caminho);
    }
    const r = await base.download(caminho);
    if (!r.error || !pareceNaoExiste(r.error)) return r;
    // Último recurso: o índice podia ter falhado de escrever (não devia — ver
    // `guardarNoBlob` —, mas uma fotografia vale uma operação simples).
    const b = await doBlob();
    return b ? { data: b, error: null } : r;
  }

  async function exists(caminho: string) {
    if ((await modo()) === "blob" && (await indiceOuVazio(nome, [caminho])).has(caminho)) {
      return { data: true, error: null };
    }
    return base.exists(caminho);
  }

  async function remove(caminhos: string[]) {
    const m = await modo();
    if (m === "supabase") return base.remove(caminhos);
    const r = await base.remove(caminhos);
    const linhas = await indiceOuVazio(nome, caminhos);
    const noBlob = caminhos.filter((c) => linhas.has(c));
    let saiuDoBlob: string[] = [];
    if (noBlob.length > 0) {
      try {
        const bytes = noBlob.reduce((s, c) => s + (linhas.get(c)?.t ?? 0), 0);
        await apagarDoBlob(
          noBlob.map((c) => chaveNoBlob(nome, c)),
          bytes,
        );
        // Só sai do índice o que saiu do Blob: o índice nunca diz que falta o que lá está.
        if (await tirarDoIndice(nome, noBlob)) saiuDoBlob = noBlob;
      } catch (e) {
        log.warn("blob: ficheiros não apagados do Blob", {
          balde: nome,
          n: noBlob.length,
          erro: String((e as Error)?.message),
        });
      }
    }
    if (r.error) return r;
    const doSupabase = (r.data ?? []) as { name?: string }[];
    const nomes = new Set(doSupabase.map((o) => o.name));
    const extra = saiuDoBlob
      .filter((c) => !nomes.has(c))
      .map((c) => ({ name: c, bucket_id: nome }));
    return { data: [...doSupabase, ...extra] as typeof r.data, error: null };
  }

  async function list(
    prefixo?: string,
    opcoes?: {
      limit?: number;
      offset?: number;
      sortBy?: { column?: string; order?: string };
      search?: string;
    },
  ) {
    if ((await modo()) !== "blob") return base.list(prefixo, opcoes as never);
    const pasta = (prefixo ?? "").replace(/\/+$/, "");
    // 1) O Supabase inteiro desta pasta (o que ainda lá está).
    type Entrada = {
      name: string;
      id: string | null;
      created_at: string | null;
      updated_at: string | null;
      last_accessed_at: string | null;
      metadata: Record<string, unknown> | null;
    };
    const doSupabase: Entrada[] = [];
    for (let offset = 0, paginas = 0; paginas < 50; paginas++, offset += 1000) {
      const { data, error } = await base.list(pasta, {
        limit: 1000,
        offset,
        ...(opcoes?.search ? { search: opcoes.search } : {}),
      });
      if (error) return { data: null, error };
      doSupabase.push(...((data ?? []) as Entrada[]));
      if ((data ?? []).length < 1000) break;
    }
    // 2) O índice do Blob debaixo da mesma pasta (de graça: base de dados).
    let indice: Map<string, LinhaDoIndice>;
    try {
      const r = await indiceDebaixoDe(nome, pasta ? `${pasta}/` : "");
      if (!r.completa) throw new Error("índice incompleto");
      indice = r.linhas;
    } catch (e) {
      // Sem índice, uma listagem do Supabase SÓ esconderia as fotos do Blob —
      // e quem lista para apagar órfãos tomaria isso por «não existem».
      return { data: null, error: erro(`Listagem incompleta: ${String((e as Error)?.message)}`) };
    }
    const porNome = new Map<string, Entrada>();
    for (const e of doSupabase) porNome.set(e.name, e);
    const procura = opcoes?.search?.toLowerCase() ?? "";
    for (const [caminho, linha] of indice) {
      const resto = pasta ? caminho.slice(pasta.length + 1) : caminho;
      const barra = resto.indexOf("/");
      const nomeDaEntrada = barra >= 0 ? resto.slice(0, barra) : resto;
      if (!nomeDaEntrada || porNome.has(nomeDaEntrada)) continue;
      if (procura && !nomeDaEntrada.toLowerCase().startsWith(procura)) continue;
      porNome.set(
        nomeDaEntrada,
        barra >= 0
          ? {
              name: nomeDaEntrada,
              id: null,
              created_at: null,
              updated_at: null,
              last_accessed_at: null,
              metadata: null,
            }
          : {
              name: nomeDaEntrada,
              id: `blob:${chaveNoBlob(nome, caminho)}`,
              created_at: linha.c,
              updated_at: linha.c,
              last_accessed_at: linha.c,
              metadata: {
                size: linha.t,
                contentLength: linha.t,
                ...(linha.m ? { eTag: `"${linha.m}"` } : {}),
                ...(linha.ct ? { mimetype: linha.ct } : {}),
                lastModified: linha.c,
                httpStatusCode: 200,
              },
            },
      );
    }
    const coluna = (opcoes?.sortBy?.column ?? "name") as "name" | "created_at" | "updated_at";
    const sentido = opcoes?.sortBy?.order === "desc" ? -1 : 1;
    const todas = [...porNome.values()].sort((a, b) => {
      // Pastas primeiro, como no Supabase; depois pela coluna pedida.
      if (!a.id !== !b.id) return a.id ? 1 : -1;
      const va = String(a[coluna] ?? "");
      const vb = String(b[coluna] ?? "");
      return (va < vb ? -1 : va > vb ? 1 : 0) * sentido || (a.name < b.name ? -1 : 1);
    });
    const desde = Math.max(0, opcoes?.offset ?? 0);
    const quantos = Math.max(0, opcoes?.limit ?? 100);
    return { data: todas.slice(desde, desde + quantos), error: null };
  }

  /** Assina vários: o que está no Blob pelo Blob, o resto pelo Supabase. */
  async function createSignedUrls(caminhos: string[], prazo: number, opcoes?: unknown) {
    if ((await modo()) !== "blob") return base.createSignedUrls(caminhos, prazo, opcoes as never);
    const linhas = await indiceOuVazio(nome, caminhos);
    const doBlob = new Map<string, string>();
    for (const c of caminhos) {
      const linha = linhas.get(c);
      if (!linha) continue;
      try {
        doBlob.set(
          c,
          prazo < PRAZO_DO_ENDERECO_DIRECTO_S
            ? await urlDeLeituraDoBlob(chaveNoBlob(nome, c), Date.now() + prazo * 1000, linha.t)
            : urlEstavel(nome, c, linha.t, prazo, segredo()),
        );
      } catch (e) {
        log.warn("blob: endereço não assinado — tenta-se o Supabase", {
          balde: nome,
          motivo: e instanceof BlobRecusado ? e.motivo : String((e as Error)?.message),
        });
      }
    }
    const resto = caminhos.filter((c) => !doBlob.has(c));
    let doSupabase: { path: string | null; signedUrl: string; error: string | null }[] = [];
    if (resto.length > 0) {
      const r = await base.createSignedUrls(resto, prazo, opcoes as never);
      if (r.error && doBlob.size === 0) return r;
      doSupabase = (r.data ?? []) as typeof doSupabase;
    }
    const porCaminho = new Map(doSupabase.map((s) => [s.path, s]));
    return {
      data: caminhos.map(
        (c) =>
          (doBlob.has(c)
            ? { path: c, signedUrl: doBlob.get(c)!, error: null }
            : (porCaminho.get(c) ?? { path: c, signedUrl: "", error: "Não assinado" })) as {
            path: string;
            signedUrl: string;
            error: string | null;
          },
      ),
      error: null,
    };
  }

  async function createSignedUrl(caminho: string, prazo: number, opcoes?: unknown) {
    if ((await modo()) !== "blob") return base.createSignedUrl(caminho, prazo, opcoes as never);
    const r = await createSignedUrls([caminho], prazo, opcoes);
    const linha = r.data?.[0];
    if (r.error || !linha?.signedUrl) {
      return { data: null, error: r.error ?? erro(linha?.error ?? "Não assinado", 400) };
    }
    return { data: { signedUrl: linha.signedUrl }, error: null };
  }

  /**
   * Copia, também entre baldes (`destinationBucket`). Quando nenhum dos dois
   * lados mexe no Blob, é a cópia do Supabase de sempre (sem bytes pela
   * função). Quando mexe, lê-se a origem de onde estiver e escreve-se pelo
   * `balde()` do destino — que decide, pelo modo DELE, onde fica.
   */
  async function copy(de: string, para: string, opcoes?: { destinationBucket?: string }) {
    const destino = opcoes?.destinationBucket ?? nome;
    const modoDaOrigem = await modo();
    const modoDoDestino: ModoDoBalde = ehBaldeDoBlob(destino)
      ? await modoDoBalde(destino)
      : "supabase";
    const linhaDaOrigem =
      modoDaOrigem === "blob" ? (await indiceOuVazio(nome, [de])).get(de) : undefined;
    if (!linhaDaOrigem && modoDoDestino === "supabase") return base.copy(de, para, opcoes as never);

    // Dentro do Blob, sem bytes pela função: uma operação avançada.
    if (linhaDaOrigem && modoDoDestino === "blob" && ehBaldeDoBlob(destino)) {
      const jaLa = (await indiceOuVazio(destino, [para])).has(para);
      if (jaLa) return { data: null, error: erro("The resource already exists", 409) };
      try {
        await copiarNoBlob(chaveNoBlob(nome, de), chaveNoBlob(destino, para), {
          tamanho: linhaDaOrigem.t,
          sobrescrever: false,
          contentType: linhaDaOrigem.ct,
        });
        if (
          await gravarNoIndice(destino, [
            { caminho: para, linha: { ...linhaDaOrigem, c: new Date().toISOString(), v: false } },
          ])
        ) {
          return { data: { path: para }, error: null };
        }
        await apagarDoBlob([chaveNoBlob(destino, para)], linhaDaOrigem.t).catch(() => undefined);
      } catch (e) {
        if (e instanceof BlobAvariado && e.codigo === "ja-existe")
          return { data: null, error: erro("The resource already exists", 409) };
        // segue pelo caminho dos bytes
      }
    }
    const lido = await download(de);
    if (lido.error || !lido.data)
      return { data: null, error: lido.error ?? erro("Origem não lida", 404) };
    const bytes = new Uint8Array(await (lido.data as Blob).arrayBuffer());
    const r = await balde(destino, cliente).upload(para, bytes, {
      upsert: false,
      contentType: linhaDaOrigem?.ct ?? ((lido.data as Blob).type || undefined),
    });
    return r.error ? { data: null, error: r.error } : { data: { path: para }, error: null };
  }

  /** Muda de caminho dentro do mesmo balde. */
  async function move(de: string, para: string, opcoes?: unknown) {
    if ((await modo()) === "supabase") return base.move(de, para, opcoes as never);
    const linha = (await indiceOuVazio(nome, [de])).get(de);
    if (!linha) {
      const r = await base.move(de, para, opcoes as never);
      return r;
    }
    const c = await copy(de, para);
    if (c.error) return { data: null, error: c.error };
    const r = await remove([de]);
    if (r.error) log.warn("blob: origem de uma mudança não apagada", { balde: nome });
    return { data: { message: "Successfully moved" }, error: null };
  }

  return { upload, download, exists, remove, list, createSignedUrl, createSignedUrls, copy, move };
}
