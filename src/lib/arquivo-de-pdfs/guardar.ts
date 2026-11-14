import { desmontarPdf, provar, remontarPdf, sha256, type Desmontado } from "./desmontar";
import { BUCKET_DO_ARQUIVO, PASTA_DAS_IMAGENS, PASTA_DOS_ESQUELETOS } from "./protegidos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * GUARDAR O PDF DESMONTADO AO LADO DO ORIGINAL — COM PROVA E COM TECTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Fase 2 de `docs/ARQUIVO-DE-PDFS.md`, aprovada por ele e por ela a 14/11:
 * NADA se apaga. O original continua em `proposal-pdfs`, e é ele que as rotas
 * servem. Aqui guarda-se, num bucket à parte ({@link BUCKET_DO_ARQUIVO}):
 *
 *   · `img/<sha256>.jpg` — cada JPEG embutida UMA vez, pelo resumo; a mesma
 *     imagem em dois PDF (versões da mesma proposta, a mesma foto da
 *     Biblioteca na mesma caixa) não se guarda duas vezes;
 *   · `esq/<proposta>__<chave>.gz` — o esqueleto (~35 KB).
 *
 * ── A PROVA, NO MOMENTO ──────────────────────────────────────────────────
 *
 * Antes de escrever o que quer que seja, remonta-se o esqueleto SERIALIZADO
 * com as imagens, e compara-se com o `sha256` do PDF. Se não der, regista-se e
 * não se guarda nada. O esqueleto vai em ÚLTIMO lugar: um esqueleto no balde
 * quer dizer que todas as imagens que cita já lá estão.
 *
 * ── O CUSTO (regra 7) ────────────────────────────────────────────────────
 *
 * O que isto acrescenta é espaço a MAIS, e é temporário: os originais ficam
 * enquanto ele não autorizar a fase 3. Por isso tem um tecto duro
 * ({@link TECTO_BYTES}, 20 MB) medido no próprio balde antes de cada escrita, e
 * um aviso antes de lá chegar ({@link AVISO_BYTES}). Passado o tecto, não se
 * guarda mais nada e o registo diz porquê — nunca se passa do plano gratuito.
 *
 * Sem `server-only` e sem os atalhos `@/`: o script de recolha
 * (`scripts/arquivo-de-pdfs.mjs`) usa ESTAS funções, para a regra ser uma só.
 */

/** O tecto do espaço a mais (imagens + esqueletos). Pedido dele: ~20 MB. */
export const TECTO_BYTES = 20 * 1024 * 1024;
/** A partir daqui avisa-se, em cada escrita. */
export const AVISO_BYTES = 16 * 1024 * 1024;

/** O mínimo do cliente do Supabase que isto usa (o do servidor e o do script). */
export interface ClienteDoArquivo {
  storage: {
    getBucket(id: string): PromiseLike<{ data: unknown; error: { message: string } | null }>;
    from(bucket: string): {
      list(
        pasta: string,
        opcoes: { limit: number; offset: number },
      ): PromiseLike<{
        data: { name: string; id?: string | null; metadata?: { size?: number } | null }[] | null;
        error: { message: string } | null;
      }>;
      upload(
        caminho: string,
        corpo: Buffer,
        opcoes: { contentType: string; upsert: boolean; cacheControl?: string },
      ): PromiseLike<{ error: { message: string } | null }>;
      download(caminho: string): PromiseLike<{
        data: { arrayBuffer(): Promise<ArrayBuffer> } | null;
        error: { message: string } | null;
      }>;
    };
  };
}

export interface Registo {
  info(msg: string, dados?: Record<string, unknown>): void;
  warn(msg: string, dados?: Record<string, unknown>): void;
}

const seguro = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "");
export const caminhoDaImagem = (sha: string) => `${PASTA_DAS_IMAGENS}${seguro(sha)}.jpg`;
export const caminhoDoEsqueleto = (proposalId: string, chave: string) =>
  `${PASTA_DOS_ESQUELETOS}${seguro(proposalId)}__${seguro(chave)}.gz`;

/** O que o balde do arquivo tem: as imagens (pelo resumo), os esqueletos, e o total. */
export interface Ocupacao {
  bytes: number;
  imagens: Set<string>;
  esqueletos: Set<string>;
}

const POR_PAGINA = 1000;
/** 20 MB a ~100 KB por imagem são ~200 ficheiros: 20 páginas é folga de sobra. */
const MAX_PAGINAS = 20;

async function listar(
  sb: ClienteDoArquivo,
  pasta: string,
): Promise<{ nome: string; bytes: number }[] | null> {
  const saida: { nome: string; bytes: number }[] = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const { data, error } = await sb.storage
      .from(BUCKET_DO_ARQUIVO)
      .list(pasta, { limit: POR_PAGINA, offset: p * POR_PAGINA });
    if (error || !data) return null;
    for (const f of data) {
      if (!f.id) continue;
      saida.push({ nome: f.name, bytes: Number(f.metadata?.size ?? 0) });
    }
    if (data.length < POR_PAGINA) return saida;
  }
  // Mais do que isto não cabe no tecto: «não sei» vale «cheio».
  return null;
}

/** Mede o balde. `null` = não se conseguiu (e então não se escreve). */
export async function medirOcupacao(sb: ClienteDoArquivo): Promise<Ocupacao | null> {
  const [imgs, esqs] = await Promise.all([
    listar(sb, PASTA_DAS_IMAGENS.replace(/\/$/, "")),
    listar(sb, PASTA_DOS_ESQUELETOS.replace(/\/$/, "")),
  ]);
  if (!imgs || !esqs) return null;
  return {
    bytes: [...imgs, ...esqs].reduce((s, f) => s + f.bytes, 0),
    imagens: new Set(imgs.map((f) => f.nome.replace(/\.jpg$/, ""))),
    esqueletos: new Set(esqs.map((f) => `${PASTA_DOS_ESQUELETOS}${f.nome}`)),
  };
}

export type EstadoDoArquivo =
  /** Guardado (ou, em ensaio, guardar-se-ia). */
  | "guardado"
  /** O esqueleto deste PDF já lá estava. */
  | "ja-estava"
  /** A remontagem não deu o sha256: nada guardado. */
  | "prova-falhou"
  /** O balde não existe (é criado à mão) ou não se deixou medir. */
  | "sem-bucket"
  /** Passaria do tecto: nada guardado. */
  | "tecto"
  /** Uma escrita falhou; o original está intacto. */
  | "falhou";

export interface ResultadoDoArquivo {
  estado: EstadoDoArquivo;
  pdfBytes: number;
  /** Imagens cortadas deste PDF (com repetições), e quantas já estavam no balde. */
  imagens: number;
  imagensJaGuardadas: number;
  /** O que este PDF ACRESCENTA ao balde: as imagens novas + o esqueleto. */
  bytesNovos: number;
  esqueletoBytes: number;
  /** O balde depois (ou, em ensaio, como ficaria). */
  ocupacaoDepois: number;
}

/**
 * Desmonta, prova e guarda. Nunca lança.
 *
 * `ocupacao`: a medida do balde; sem ela, mede-se agora. O script de recolha
 * passa a sua, e ela é ACTUALIZADA aqui (as imagens novas passam a contar como
 * guardadas) — é assim que o ensaio mede a partilha entre PDFs sem escrever.
 * `ensaio`: faz tudo menos escrever.
 * `tecto`: só em ensaio — para o script medir o arquivo inteiro sem parar.
 * `esperado`: o sha256 que a remontagem tem de dar (por omissão, o destes bytes;
 * o script passa o `pdf_sha256` selado na proposta, quando há).
 */
export async function guardarDesmontado(
  sb: ClienteDoArquivo,
  registo: Registo,
  proposalId: string,
  chave: string,
  pdf: Uint8Array,
  opcoes: {
    ocupacao?: Ocupacao;
    ensaio?: boolean;
    esperado?: string;
    /** Só o ensaio do script o muda (para medir tudo); a escrever, vale o tecto. */
    tecto?: number;
  } = {},
): Promise<ResultadoDoArquivo> {
  const vazio: ResultadoDoArquivo = {
    estado: "falhou",
    pdfBytes: pdf.byteLength,
    imagens: 0,
    imagensJaGuardadas: 0,
    bytesNovos: 0,
    esqueletoBytes: 0,
    ocupacaoDepois: opcoes.ocupacao?.bytes ?? 0,
  };
  const esqueletoEm = caminhoDoEsqueleto(proposalId, chave);
  let d: Desmontado;
  try {
    d = await desmontarPdf(pdf);
  } catch (e) {
    registo.warn("arquivo de PDFs: não deu para desmontar — nada guardado", {
      proposalId,
      erro: String(e),
    });
    return { ...vazio, estado: "prova-falhou" };
  }
  const esperado = (opcoes.esperado ?? d.pdfSha256).toLowerCase();
  if (!(await provar(d, esperado))) {
    registo.warn("arquivo de PDFs: a remontagem NÃO deu o sha256 — nada guardado", {
      proposalId,
      chave,
      esperado,
      obtido: d.pdfSha256,
    });
    return { ...vazio, estado: "prova-falhou", imagens: d.cortes.length };
  }

  let ocupacao = opcoes.ocupacao;
  if (!ocupacao) {
    try {
      const { data, error } = await sb.storage.getBucket(BUCKET_DO_ARQUIVO);
      if (error || !data) {
        registo.warn("arquivo de PDFs: o balde não existe — nada guardado", {
          balde: BUCKET_DO_ARQUIVO,
        });
        return { ...vazio, estado: "sem-bucket", imagens: d.cortes.length };
      }
      ocupacao = (await medirOcupacao(sb)) ?? undefined;
    } catch {
      ocupacao = undefined;
    }
    if (!ocupacao) {
      registo.warn("arquivo de PDFs: não deu para medir o balde — nada guardado");
      return { ...vazio, estado: "sem-bucket", imagens: d.cortes.length };
    }
  }

  const base = {
    pdfBytes: d.pdfBytes,
    imagens: d.cortes.length,
    esqueletoBytes: d.esqueleto.length,
  };
  if (ocupacao.esqueletos.has(esqueletoEm)) {
    return {
      ...base,
      estado: "ja-estava",
      imagensJaGuardadas: d.imagens.size,
      bytesNovos: 0,
      ocupacaoDepois: ocupacao.bytes,
    };
  }
  const novas = [...d.imagens].filter(([s]) => !ocupacao.imagens.has(s));
  const bytesNovos = novas.reduce((s, [, b]) => s + b.length, 0) + d.esqueleto.length;
  const depois = ocupacao.bytes + bytesNovos;
  const resultado = {
    ...base,
    imagensJaGuardadas: d.imagens.size - novas.length,
    bytesNovos,
    ocupacaoDepois: depois,
  };
  const tecto = opcoes.ensaio ? (opcoes.tecto ?? TECTO_BYTES) : TECTO_BYTES;
  if (depois > tecto) {
    registo.warn("arquivo de PDFs: passaria do tecto — nada guardado", {
      proposalId,
      ocupacao: ocupacao.bytes,
      acrescentaria: bytesNovos,
      tecto: TECTO_BYTES,
    });
    return { ...resultado, estado: "tecto", ocupacaoDepois: ocupacao.bytes };
  }
  if (depois > AVISO_BYTES) {
    registo.warn("arquivo de PDFs: perto do tecto", { ocupacao: depois, tecto: TECTO_BYTES });
  }

  if (!opcoes.ensaio) {
    const balde = sb.storage.from(BUCKET_DO_ARQUIVO);
    for (const [s, b] of novas) {
      const { error } = await balde.upload(caminhoDaImagem(s), b, {
        contentType: "image/jpeg",
        upsert: false,
        cacheControl: "31536000",
      });
      // «Já existe» é o mesmo conteúdo (o nome é o resumo): sucesso.
      if (error && !/exist|duplicate/i.test(error.message)) {
        registo.warn("arquivo de PDFs: uma imagem não subiu — esqueleto NÃO guardado", {
          proposalId,
          erro: error.message,
        });
        return { ...resultado, estado: "falhou" };
      }
    }
    const { error } = await balde.upload(esqueletoEm, d.esqueleto, {
      contentType: "application/gzip",
      upsert: false,
      cacheControl: "31536000",
    });
    if (error && !/exist|duplicate/i.test(error.message)) {
      registo.warn("arquivo de PDFs: o esqueleto não subiu", { proposalId, erro: error.message });
      return { ...resultado, estado: "falhou" };
    }
  }
  // A medida em memória segue o que se escreveu (ou escreveria).
  for (const [s, b] of novas) {
    ocupacao.imagens.add(s);
    ocupacao.bytes += b.length;
  }
  ocupacao.esqueletos.add(esqueletoEm);
  ocupacao.bytes += d.esqueleto.length;
  registo.info("arquivo de PDFs: desmontado e provado", {
    proposalId,
    chave,
    ensaio: !!opcoes.ensaio,
    pdfBytes: d.pdfBytes,
    imagens: d.cortes.length,
    novas: novas.length,
    bytesNovos,
    ocupacao: ocupacao.bytes,
  });
  return { ...resultado, estado: "guardado" };
}

/**
 * Remonta um PDF do arquivo (preparado para a fase 3; nenhuma rota o usa).
 * `null` se faltar alguma peça ou se a remontagem não der o sha256 do
 * esqueleto (ou o `esperado`, quando se passa) — nunca devolve um PDF errado.
 */
export async function remontarDoArquivo(
  sb: ClienteDoArquivo,
  proposalId: string,
  chave: string,
  esperado?: string,
): Promise<Buffer | null> {
  const balde = sb.storage.from(BUCKET_DO_ARQUIVO);
  const baixar = async (caminho: string): Promise<Buffer | null> => {
    const { data, error } = await balde.download(caminho);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  };
  try {
    const esqueleto = await baixar(caminhoDoEsqueleto(proposalId, chave));
    if (!esqueleto) return null;
    const pdf = await remontarPdf(esqueleto, (s) => baixar(caminhoDaImagem(s)));
    if (esperado && sha256(pdf) !== esperado.toLowerCase()) return null;
    return pdf;
  } catch {
    return null;
  }
}
