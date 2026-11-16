import "server-only";
import { log } from "./logger";
import { chaveNoBlob } from "./armazenamento/baldes";
import { modoDoBalde } from "./armazenamento/modos";
import { BlobRecusado, lerRespostaDoBlob } from "./armazenamento/blob";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PDF GUARDADO, SERVIDO PELO NOSSO ENDEREÇO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, com a fotografia do Safari: «quando carregamos na proposta
 * por email aparece este url. quero que coloques algo muito mais bonito e sem
 * ser com este url super desconfiado». E, depois: «quero que o pdf fique mesmo
 * e continue a ser rapido e se der quero que trabalhes nisso de ser ainda mais
 * rapido mas com um url adequado».
 *
 * ── O QUE ESTAVA, E PORQUE ESTAVA ────────────────────────────────────────
 *
 * A rota do PDF respondia `302` para um endereço ASSINADO do armazenamento.
 * Fazia-se por velocidade — os bytes iam do CDN direitos ao telemóvel, sem
 * atravessarem a função. O preço era o que ela viu: a barra do Safari passa a
 * mostrar `<referência>.supabase.co`, um domínio que ninguém reconhece, a um
 * casal que está prestes a decidir milhares de euros. Um link de um email da
 * Líquen que aterra noutro sítio qualquer é exactamente o que se ensina toda a
 * gente a não abrir.
 *
 * ── E O REENCAMINHAMENTO NÃO ERA SEQUER O CAMINHO MAIS CURTO ─────────────
 *
 * Vale a pena contar o que se descobriu a olhar para isto, porque contraria o
 * comentário que lá estava.
 *
 * O reencaminhamento NÃO poupava o arranque a frio: a função tem de correr de
 * qualquer maneira — abre o token, lê a proposta, calcula a chave — ANTES de
 * poder dizer para onde ir. O que ele poupava era só a travessia dos bytes.
 *
 * Em troca, custava ao telemóvel uma ida e volta INTEIRA a um segundo domínio:
 * DNS, aperto de mão TLS, pedido, e só então o primeiro byte. Numa quinta com
 * 4G fraco, onde o tempo de ida e volta é o que manda, isso são centenas de
 * milissegundos que se pagam antes de o ficheiro começar sequer a chegar.
 *
 * E havia um SEGUNDO pedido escondido: assinar o endereço é uma chamada à API
 * do armazenamento, feita pela função, antes de responder.
 *
 * Ou seja, o caminho antigo era: assinar (ida e volta do servidor) → 302 →
 * novo domínio (ida e volta do telemóvel) → bytes.
 *
 * Este é: pedir o objecto (uma ida e volta do servidor, com a chave de
 * serviço) → bytes a correr para o telemóvel na ligação que ele JÁ tem aberta.
 *
 * Menos um pedido do lado do servidor, menos uma ligação nova do lado do
 * telemóvel, e o endereço continua a ser o dela.
 *
 * ── EM FLUXO, E É ISSO QUE O TORNA BARATO ────────────────────────────────
 *
 * O corpo da resposta do armazenamento é entregue TAL E QUAL ao browser
 * (`upstream.body`), sem passar por um buffer. A função não chega a segurar o
 * ficheiro em memória — encaminha-o à medida que ele chega. É a diferença
 * entre atravessar e transportar.
 *
 * ── A CHAVE DE SERVIÇO NUNCA SAI DAQUI ───────────────────────────────────
 *
 * Vai num cabeçalho de um pedido feito PELO SERVIDOR. Não entra em nenhuma
 * resposta, em nenhum endereço e em nenhum registo. O que o casal recebe é o
 * ficheiro, e mais nada.
 */

/** O bucket dos PDFs guardados. O mesmo do `proposal-pdf-guardado.ts`. */
const BUCKET = "proposal-pdfs";

/**
 * Os cabeçalhos do armazenamento que fazem sentido repetir ao cliente.
 *
 * `content-length` é o que faz o browser saber quanto falta — sem ele a
 * transferência é uma barra sem fim. Os pedaços (`content-range`) vão porque
 * um leitor de PDF os pede; ver `pdf-resposta.ts`, que diz porquê por extenso.
 *
 * O `content-type` e o `content-disposition` NÃO vêm de lá: são nossos, para
 * este caminho e o do desenho dizerem exactamente a mesma coisa.
 */
/**
 * O `etag` SAIU desta lista, e é a peça que faz o resto funcionar.
 *
 * O que o balde manda é o MD5 do objecto. Nós temos um validador melhor: a
 * `chave` É o `sha256` do documento (ver `proposal-pdf-chave.ts`). Enquanto se
 * repetia o do balde, o navegador voltava com `If-None-Match: "<md5>"` — que
 * nunca é igual ao nosso — e a reabertura não podia ser barata por construção.
 */
const A_REPETIR = ["content-length", "content-range", "last-modified"] as const;

/**
 * ── O DOCUMENTO PASSA A PODER FICAR NO TELEMÓVEL DO CASAL ──────────────────
 *
 * Aqui estava `private, no-store, must-revalidate`. O `no-store` PROÍBE o
 * navegador de guardar o ficheiro — portanto o segundo clique, o «abrir outra
 * vez», o voltar atrás e uma transferência retomada pagavam TUDO de novo: as
 * leituras, a ida ao balde, e os 0,5 a 4 MB, num 4G, numa quinta.
 *
 * E a outra metade desta mesma rota — o caminho do desenho, em `pdf-resposta.ts`
 * — sempre disse `private, max-age=300, must-revalidate`. As duas metades da
 * mesma rota diziam coisas contrárias sobre o mesmo ficheiro.
 *
 * `private` e nunca `public`: o endereço leva o testemunho lá dentro, e uma
 * cache partilhada não teria como ser invalidada quando ela revê a proposta —
 * que é exactamente o defeito que esta casa já combateu («a página na versão 2
 * com um botão que descarrega a 1»).
 *
 * E NUNCA `immutable`: os bytes deste endereço mudam de propósito. Uma revisão
 * muda a `chave`, e o mesmo link salta para a versão mais recente. Com
 * `immutable`, um casal que descarregou a v1 e volta a carregar depois de ela
 * corrigir o preço recebia a v1 sem sequer perguntar.
 */
const CACHE_CONTROL = "private, max-age=300, must-revalidate";

/** O casal já tem esta versão? Compara o que ele traz com a nossa identidade. */
function jaTemEsta(pedido: Request, etag: string): boolean {
  const lista = pedido.headers.get("if-none-match");
  if (!lista) return false;
  return lista
    .split(",")
    .map((v) => v.trim().replace(/^W\//, ""))
    .some((v) => v === "*" || v === etag);
}

/**
 * O PDF guardado, em fluxo, pelo nosso endereço — ou `null`.
 *
 * `null` quer dizer «não deu»: não há armazenamento configurado, o objecto não
 * está lá, ou a rede falhou. Quem chama tem sempre o caminho de recurso (voltar
 * a desenhar), e é por isso que isto nunca lança.
 */
export async function pdfGuardadoEmFluxo(
  pedido: Request,
  proposalId: string,
  chave: string,
  nome: string,
): Promise<Response | null> {
  if (!proposalId || !chave) return null;
  const base = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servico = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !servico) return null;

  const caminho = `${proposalId.replace(/[^a-zA-Z0-9_-]/g, "")}/${chave}.pdf`;
  const endereco = `${base.replace(/\/+$/, "")}/storage/v1/object/${BUCKET}/${caminho}`;

  /**
   * A identidade deste documento, forte porque é o `sha256` do conteúdo.
   *
   * A rota já a calculou, do documento que leu — portanto isto está disponível
   * ANTES de qualquer ida ao armazenamento.
   */
  const etag = `"${chave}"`;
  const validadores = () =>
    new Headers({ ETag: etag, "Cache-Control": CACHE_CONTROL, "Accept-Ranges": "bytes" });

  /** O pedido de pedaço do leitor de PDF, se houver. */
  const pedaco = pedido.headers.get("range");

  /**
   * ── REABRIR NÃO CUSTA UMA IDA AO BALDE NEM UM BYTE ────────────────────────
   *
   * Se o casal já tem esta versão, responde-se aqui: zero armazenamento, zero
   * corpo. É o caso de quem abre a proposta, fecha, e volta a abrir para a
   * mostrar a alguém.
   *
   * Com `Range` NÃO se atalha: quem está a retomar uma transferência quer o
   * pedaço, não um «já tens».
   *
   * Isto vem DEPOIS de a rota ter validado o testemunho — está dentro desta
   * função, que ambas as rotas só chamam com a proposta já lida. Um testemunho
   * forjado continua a apanhar 404, nunca um 304.
   */
  if (!pedaco && jaTemEsta(pedido, etag)) {
    return new Response(null, { status: 304, headers: validadores() });
  }

  /**
   * ── UM `If-Range` QUE NÃO BATE CERTO ANULA O PEDAÇO ───────────────────────
   *
   * Uma transferência retomada manda `If-Range` com o validador que tinha, mais
   * o `Range`. Se a proposta foi revista entretanto, servir o pedaço é costurar
   * bytes de duas versões — e o que sai é um PDF corrompido. A regra é ignorar
   * o `Range` quando o `If-Range` não bate, e mandar o ficheiro inteiro.
   *
   * O outro caminho desta rota já fazia isto; este reencaminhava o `Range` sem
   * olhar.
   */
  const seRange = pedido.headers.get("if-range");
  const pedacoValido =
    pedaco && (!seRange || seRange.trim().replace(/^W\//, "") === etag) ? pedaco : null;

  let doArmazenamento: Response;
  try {
    /**
     * ── COM O BALDE NO VERCEL BLOB (16/11) ───────────────────────────────────
     * Em modo `blob`, o PDF lê-se primeiro do Blob, com o mesmo `Range`. Um
     * 404 lá (ainda não copiado), o tecto do mês ou uma avaria caem para o
     * Supabase como sempre — e um 404 também lá cai para o desenho. Sem o
     * token do Blob, `modoDoBalde` diz `supabase` sem ir à base de dados.
     */
    const doBlob =
      (await modoDoBalde(BUCKET)) === "blob"
        ? await lerRespostaDoBlob(
            chaveNoBlob(BUCKET, caminho),
            pedacoValido ? { Range: pedacoValido } : {},
          ).catch((e) => {
            log.warn("pdf da proposta: o Blob não deu, vai ao Supabase", {
              proposalId,
              motivo: e instanceof BlobRecusado ? e.motivo : "avaria",
            });
            return null;
          })
        : null;
    doArmazenamento =
      doBlob ??
      (await fetch(endereco, {
        headers: {
          Authorization: `Bearer ${servico}`,
          ...(pedacoValido ? { Range: pedacoValido } : {}),
        },
        cache: "no-store",
      }));
  } catch (e) {
    // Uma avaria de rede não é um erro do casal: cai-se para o desenho.
    log.warn("pdf da proposta: não deu para ler o guardado, vai desenhar-se", {
      proposalId,
      erro: String(e),
    });
    return null;
  }

  // 404 é o caso NORMAL da primeira vez: o ficheiro ainda não foi guardado.
  if (doArmazenamento.status === 404) return null;
  /**
   * ── A ARMADILHA, FECHADA ANTES DE EXISTIR ─────────────────────────────────
   *
   * Hoje não se reencaminha nenhum cabeçalho condicional, portanto o balde
   * nunca responde 304. No dia em que alguém o reencaminhar — e é uma
   * optimização que parece óbvia — um 304 cairia no `!ok` aqui em baixo:
   * registava-se um erro falso, devolvia-se `null`, e a rota, calada, desenhava
   * o documento inteiro. O pedido MAIS BARATO passava a ser o mais caro.
   */
  if (doArmazenamento.status === 304 || doArmazenamento.status === 412) {
    return new Response(null, { status: 304, headers: validadores() });
  }
  if (!doArmazenamento.ok || !doArmazenamento.body) {
    log.warn("pdf da proposta: o armazenamento respondeu mal, vai desenhar-se", {
      proposalId,
      estado: doArmazenamento.status,
    });
    return null;
  }

  const cabecalhos = new Headers({
    "Content-Type": "application/pdf",
    // O mesmo que o caminho do desenho escreve — ver `pdf-resposta.ts`. Os dois
    // caminhos da MESMA rota têm de fazer a mesma coisa, e já não fizeram uma
    // vez: um descarregava e o outro abria no visualizador.
    "Content-Disposition": `attachment; filename="${nome}"`,
    "Accept-Ranges": "bytes",
    // O documento de um cliente não fica em cache partilhada nenhuma — ver
    // `CACHE_CONTROL` lá em cima, e porque é que deixou de ser `no-store`.
    "Cache-Control": CACHE_CONTROL,
    ETag: etag,
  });
  for (const k of A_REPETIR) {
    const v = doArmazenamento.headers.get(k);
    if (v) cabecalhos.set(k, v);
  }

  return new Response(doArmazenamento.body, {
    status: doArmazenamento.status,
    headers: cabecalhos,
  });
}
