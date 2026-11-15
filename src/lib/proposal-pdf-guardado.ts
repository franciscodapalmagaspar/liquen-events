import "server-only";
import { getSupabase } from "./supabase";
import { log } from "./logger";
import { after } from "next/server";
import { arquivarPdfDesmontado, ligado as arquivoLigado } from "./arquivo-de-pdfs/arquivo";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PDF DO CASAL, GUARDADO NO INSTANTE EM QUE JÁ EXISTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Do inventário de esperas: «Ver a proposta completa (PDF)», na página onde o
 * casal decide gastar milhares de euros, é um link directo. Carrega-se, e a
 * página não sabe de nada — nem que está a trabalhar, nem que falhou.
 *
 * Havia duas saídas: dar-lhe uma espera com nome, ou tirar-lhe a espera. A
 * segunda é melhor e é mais simples, e a razão é esta: **o ficheiro já foi
 * desenhado uma vez.** No envio, o `pdfBuffer` existe em memória — é o mesmo
 * que segue em anexo no email, o mesmo cujo `sha256` fica selado no contrato.
 * Desenhá-lo outra vez quando o casal carrega no botão é refazer, com oitenta
 * fotografias e o `sharp` a reencodar cada uma, um trabalho que já está feito.
 *
 * ── PORQUE É QUE A CACHE EM MEMÓRIA NÃO CHEGA ─────────────────────────────
 *
 * `proposal-pdf-cache.ts` guarda o desenho por processo, e isso resolve o caso
 * do leitor de PDF a pedir o ficheiro aos bocados. Não resolve o caso que
 * interessa: o casal abre o link do email às onze da noite, três dias depois do
 * envio, num processo que acabou de arrancar. A cache está vazia, e ele paga o
 * desenho inteiro.
 *
 * ── A CHAVE É O CONTEÚDO, E TEM DE SER ────────────────────────────────────
 *
 * Não é o id da proposta. Se fosse, uma proposta revista servia o ficheiro
 * ANTIGO até alguém a reenviar — exactamente o defeito contra o qual a rota do
 * link já se protege («a página na versão 2 com um botão que descarrega a 1»).
 * Com a chave pelo conteúdo, um documento revisto simplesmente não encontra
 * nada guardado e desenha-se; o ficheiro velho fica lá, órfão e inofensivo, e
 * nunca mais é pedido.
 *
 * ── NADA AQUI PODE PARTIR NADA ────────────────────────────────────────────
 *
 * Isto é memória, não é a verdade. Uma escrita que falhe custa um desenho a
 * mais; uma leitura que falhe custa o mesmo. Por isso **nenhuma função deste
 * módulo lança**: devolvem `null` ou `false` e a vida continua pelo caminho
 * que já existia. Um PDF que não se consegue guardar não pode impedir uma
 * proposta de seguir para um casal.
 */

/** Privado, como tudo o que tem dados de clientes. Servido só por quem tem o token. */
const BUCKET = "proposal-pdfs";

/** Um PDF de proposta anda pelos 0,5–4 MB; acima de 20 é outra coisa qualquer. */
const LIMITE_BYTES = 20 * 1024 * 1024;

/** Uma tentativa por processo — o mesmo padrão do `ensureBucket` das fotos. */
let bucketPronto: Promise<boolean> | null = null;

function ehNaoEncontrado(erro: { message?: string } | null): boolean {
  return /not found|does not exist/i.test(erro?.message ?? "");
}

async function garantirBucket(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  if (!bucketPronto) {
    bucketPronto = (async () => {
      try {
        const { data, error } = await sb.storage.getBucket(BUCKET);
        if (data) return true;
        if (error && !ehNaoEncontrado(error)) {
          log.warn("pdf-guardado: getBucket falhou", { erro: error.message });
          return false;
        }
        const { error: erroCriar } = await sb.storage.createBucket(BUCKET, {
          public: false,
          fileSizeLimit: LIMITE_BYTES,
          allowedMimeTypes: ["application/pdf"],
        });
        // Duas funções a arrancar ao mesmo tempo criam-no as duas; a segunda
        // recebe «already exists» e isso é um sucesso, não uma avaria.
        if (erroCriar && !/exist/i.test(erroCriar.message)) {
          log.warn("pdf-guardado: createBucket falhou", { erro: erroCriar.message });
          return false;
        }
        return true;
      } catch (e) {
        log.warn("pdf-guardado: bucket indisponível", { erro: String(e) });
        return false;
      }
    })();
  }
  return bucketPronto;
}

/**
 * O caminho do ficheiro.
 *
 * A pasta é o id da proposta e o nome é a chave do conteúdo. Podia ser tudo
 * plano; assim consegue-se ver, num relance da consola do Storage, quantas
 * versões uma proposta teve — e apagar as de uma proposta antiga é apagar uma
 * pasta em vez de procurar chaves soltas.
 */
function caminho(proposalId: string, chave: string): string {
  return `${proposalId.replace(/[^a-zA-Z0-9_-]/g, "")}/${chave}.pdf`;
}

/**
 * Guarda o PDF. Devolve se ficou guardado — para quem chamar poder registá-lo,
 * não para decidir nada.
 *
 * `upsert: false`: a chave é o conteúdo, portanto o que já lá está é
 * byte-a-byte o mesmo ficheiro. Reescrevê-lo era gastar uma escrita para
 * chegar ao mesmo sítio.
 */
export async function guardarPdfDaProposta(
  proposalId: string,
  chave: string,
  bytes: Buffer,
): Promise<boolean> {
  if (!proposalId || !chave || bytes.byteLength === 0) return false;
  if (bytes.byteLength > LIMITE_BYTES) {
    log.warn("pdf-guardado: grande demais para guardar", { bytes: bytes.byteLength });
    return false;
  }
  const sb = getSupabase();
  if (!sb || !(await garantirBucket())) return false;
  try {
    const { error } = await sb.storage.from(BUCKET).upload(caminho(proposalId, chave), bytes, {
      contentType: "application/pdf",
      upsert: false,
      // Um ano: o conteúdo está na chave, portanto este ficheiro nunca muda.
      cacheControl: "31536000",
    });
    // «Already exists» é o caminho normal a partir da segunda vez.
    if (error && !/exist|duplicate/i.test(error.message)) {
      log.warn("pdf-guardado: não ficou guardado", { erro: error.message });
      return false;
    }
    // Um PDF NOVO: guarda-se também desmontado, ao lado, com prova
    // (`arquivo-de-pdfs/`, fase 2 — desligado por omissão). Depois da
    // resposta: não atrasa o envio nem o casal. O original fica sempre.
    if (!error && arquivoLigado()) {
      const arquivar = () => arquivarPdfDesmontado(proposalId, chave, bytes).then(() => undefined);
      try {
        after(arquivar);
      } catch {
        // Fora de um pedido (testes, scripts) o `after` não existe.
        await arquivar();
      }
    }
    return true;
  } catch (e) {
    log.warn("pdf-guardado: não ficou guardado", { erro: String(e) });
    return false;
  }
}

/**
 * O PDF guardado, se lá estiver.
 *
 * `null` quer dizer «desenha-o» e não «falhou»: as duas respostas levam ao
 * mesmo sítio, e distingui-las aqui só daria a quem chama uma decisão que não
 * tem de tomar.
 */
export async function lerPdfDaProposta(proposalId: string, chave: string): Promise<Buffer | null> {
  if (!proposalId || !chave) return null;
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.storage.from(BUCKET).download(caminho(proposalId, chave));
    if (error || !data) return null;
    const bytes = Buffer.from(await data.arrayBuffer());
    return bytes.byteLength > 0 ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * O PDF já está guardado, sem o trazer para dentro da função?
 *
 * `lerPdfDaProposta` desce o ficheiro inteiro — dois, três, às vezes dez
 * megabytes. Para SERVIR isso é o trabalho; para PERGUNTAR «já existe?» é
 * desperdício, e é a pergunta que o aquecimento nocturno faz uma vez por
 * proposta. Uma listagem de um item devolve o nome e mais nada.
 *
 * `search` é um prefixo, não uma igualdade: pede-se um item e confirma-se o
 * nome à letra, senão uma chave que comece pela outra dava um falso «existe» —
 * e um falso «existe» é o pior dos dois erros, porque deixa a proposta por
 * aquecer e ninguém fica a saber.
 *
 * `false` quer dizer «não sei se está lá» tanto como «não está»: as duas
 * respostas levam ao mesmo sítio (desenhar), e distingui-las aqui só daria a
 * quem chama uma decisão que não tem de tomar.
 */
export async function existePdfDaProposta(proposalId: string, chave: string): Promise<boolean> {
  if (!proposalId || !chave) return false;
  const sb = getSupabase();
  if (!sb) return false;
  const alvo = `${chave}.pdf`;
  try {
    const { data, error } = await sb.storage
      .from(BUCKET)
      .list(proposalId.replace(/[^a-zA-Z0-9_-]/g, ""), { search: alvo, limit: 1 });
    if (error || !data) return false;
    return data.some((f) => f.name === alvo);
  } catch {
    return false;
  }
}

/** Só para os testes: esquece a tentativa de criar o bucket. */
export function esquecerBucketDePdfs(): void {
  bucketPronto = null;
}
