import "server-only";
import { getSupabase } from "./supabase";
import { PROPOSAL_BUCKET } from "./proposal-storage";
import { THEME_BUCKET, ehRefDeTema, caminhoDoRefDeTema, themeIdOfPath } from "./theme-ref";
import { entradasDe } from "./reciclagem-store";
import { getTheme } from "./themes-store";
import { CHAVE_DA_CAPA, fotosEscolhidasDoDocumento, type FotoEscolhida } from "./fotos-escolhidas";
import {
  aCapaDelaVaiNoPdf,
  aFaltaDaCapaTrava,
  haFotoNaInspiracao,
} from "./pdf-editorial/regra-da-capa";
import { isPendingImage, type ProposalDoc } from "./proposal-doc";
import { formasDeCaminhos } from "./biblioteca-fotos-store";
import { LARGURAS_DE_PARTILHA, type FotoSuspeita } from "./proposta-fotos-verificacao-tipos";
import { avaliarFoto, type LugarDaFoto } from "./qualidade-da-foto";
import { marcaDaRef } from "./proposta-fotos";
import { log } from "./logger";
import { listagemComMemoria } from "./memoria-das-listagens";
import type {
  FotoEmFalta,
  FotoEscolhidaEmFalta,
  VerificacaoDeFotos,
} from "./proposta-fotos-verificacao-tipos";

export type {
  MotivoDeFalta,
  FotoEmFalta,
  FotoEscolhidaEmFalta,
  VerificacaoDeFotos,
} from "./proposta-fotos-verificacao-tipos";
export { PORQUE_FALTA, PORQUE_SUSPEITA } from "./proposta-fotos-verificacao-tipos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS QUE FALTAM — DESCOBERTAS ANTES DE O LINK SEGUIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a olhar para a página de uma proposta que já tinha seguido:
 *
 *   «Na secção Decoração Seatting Plan há quatro barras cinzentas com ícone de
 *   imagem quebrada onde devia estar a primeira foto. Um cliente que veja isto
 *   conclui que a empresa é descuidada.»
 *
 * ── PORQUE É QUE ISTO NÃO SE VIA ANTES DE SAIR ────────────────────────────
 *
 * Porque assinar um caminho NÃO PROVA QUE O FICHEIRO EXISTE. Está escrito no
 * `proposta-fotos.ts` e é a raiz de todo este defeito: o Storage devolve um
 * endereço assinado, bem formado e válido, para um objecto que lá não está. A
 * página recebe o endereço, mete-o num `<img>`, e o 404 só acontece no
 * NAVEGADOR DO CASAL. Do lado de cá, tudo parecia bem.
 *
 * Este módulo faz a única pergunta que ninguém estava a fazer: **os ficheiros
 * estão mesmo lá?** E faz-la LISTANDO as pastas, não descarregando as fotos —
 * uma ida ao Storage por PASTA, seja o documento de quatro fotos ou de
 * quarenta e seis. Descarregar cada uma para confirmar seriam dezenas de
 * megabytes e uma rota que estoura o tempo-limite.
 *
 * ── O QUE ISTO NÃO FAZ, E É DE PROPÓSITO ──────────────────────────────────
 *
 * Não corre no navegador do casal, e não é chamado pela página deles. Uma
 * verificação do lado do cliente diria, para ser útil, que a página FOI
 * ABERTA — e isso é sinal de comportamento passivo, que está proibido. A
 * pergunta faz-se aqui, do lado de cá, antes de o link existir.
 */

/** Uma fotografia do documento, com o sítio onde ela vive escrito para uma pessoa. */
interface Entrada {
  id: string;
  ref: string;
  onde: string;
  /** Para onde vai — a mesma régua do aviso ao pôr a foto (`qualidade-da-foto.ts`). */
  lugar: LugarDaFoto;
  /**
   * Escolhida por ELA para a capa ou para uma página que o PDF desenha
   * (`fotosEscolhidasDoDocumento`): se faltar, TRAVA o envio.
   */
  escolhida?: FotoEscolhida;
}

/**
 * O inventário COM o sítio de cada fotografia — e com as `pending:` lá dentro.
 *
 * É deliberadamente parecido com o `inventarioDeFotos` do `proposta-fotos.ts`
 * e não é o mesmo: aquele existe para ASSINAR (e por isso deita fora as
 * `pending:`, que não têm ficheiro para assinar), este existe para CONTAR A
 * UMA PESSOA o que falta — e uma foto reservada e nunca copiada é precisamente
 * uma das coisas que falta.
 *
 * Os `id` são os mesmos nos dois, e têm de ser: é por eles que o ecrã da
 * proposta e este relatório falam da mesma fotografia.
 */
function inventarioComSitio(doc: Partial<ProposalDoc>): Entrada[] {
  const out: Entrada[] = [];
  const juntar = (
    id: string,
    onde: string,
    ref: unknown,
    lugar: LugarDaFoto = "tema",
    escolhida?: FotoEscolhida,
  ) => {
    if (typeof ref !== "string" || !ref.trim()) return;
    out.push({ id, ref, onde, lugar, ...(escolhida ? { escolhida } : {}) });
  };
  const escolhidas = fotosEscolhidasDoDocumento(doc);
  const capa = escolhidas.find((f) => f.chave === CHAVE_DA_CAPA);
  const iCapa = capa ? (doc.coverImages ?? []).indexOf(capa.ref) : -1;
  (doc.coverImages ?? []).forEach((ref, i) =>
    juntar(
      `c${i}`,
      `Capa · ${i === 0 ? "esquerda" : "direita"}`,
      ref,
      "capa",
      i === iCapa ? capa : undefined,
    ),
  );
  (doc.moodBoards ?? []).forEach((board, b) => {
    // Com título, cita-se («Lapelas»); sem ele, nomeia-se pela posição. Um
    // «Mood board «»» com aspas à volta de nada é pior do que a posição.
    const titulo = (board?.title ?? "").trim();
    const nome = titulo ? `Mood board «${titulo}»` : `Mood board ${b + 1}`;
    (board?.images ?? []).forEach((ref, i) => juntar(`b${b}f${i}`, `${nome} · foto ${i + 1}`, ref));
  });
  (doc.escolhas ?? []).forEach((escolha, e) => {
    const titulo = (escolha?.titulo ?? "").trim();
    const nome = titulo ? `«${titulo}»` : `${e + 1}`;
    (escolha?.opcoes ?? []).forEach((opcao, o) => {
      const rotulo = (opcao?.rotulo ?? "").trim() || `opção ${o + 1}`;
      juntar(`e${e}o${o}`, `Escolha ${nome} · ${rotulo}`, opcao?.imagem);
    });
  });
  // As que ela escolheu para as páginas do PDF — com o MESMO `id` do
  // `inventarioDeFotos` (28/10: ficavam de fora desta conferência). Só as das
  // páginas que o PDF AINDA desenha (`fotosEscolhidasDoDocumento`, revisão de
  // 14/11): uma chave órfã não sai no PDF, e acusá-la não deixava resolver.
  for (const f of escolhidas) {
    if (f.chave === CHAVE_DA_CAPA) continue;
    juntar(
      `p${marcaDaRef(f.chave).slice(0, 8)}f${f.lugar}`,
      `Página «${f.pagina}» · foto ${f.lugar + 1}`,
      f.ref,
      "pagina",
      f,
    );
  }
  return out;
}

/** Quantas páginas de listagem se pedem, e de que tamanho. O mesmo tecto do
 *  `listProposalImages`: uma pasta de pedido não passa disto. */
const PAGINA = 200;
const MAX_PAGINAS = 25;
/**
 * Numa pasta maior do que o tecto, quantas se perguntam uma a uma (ver
 * `nomesNaPasta`). As que passarem disto ficam «por confirmar».
 */
const MAX_PERGUNTAS_POR_FICHEIRO = 40;
/** Quantas perguntas uma a uma ao mesmo tempo. */
const PERGUNTAS_EM_PARALELO = 4;

/**
 * O que se sabe de uma pasta: os nomes, e se a lista está INTEIRA. Uma lista
 * cortada no tecto não diz nada das que ficaram para lá do corte.
 */
interface Listagem {
  nomes: Set<string>;
  inteira: boolean;
}

/**
 * Os nomes de ficheiro que existem numa pasta de um bucket.
 *
 * Devolve `null` quando não se conseguiu listar — que é diferente de uma pasta
 * vazia, e a diferença decide se se acusa uma foto de faltar. Acusar por não
 * se ter conseguido perguntar seria pior do que não perguntar.
 *
 * Revisão de 14/11, importante n.º 2: a lista pára no tecto (PAGINA ×
 * MAX_PAGINAS = 5000). Até aqui devolvia-se o que se tinha lido como se fosse
 * a pasta inteira, e uma foto para lá do corte passava a «já não existe» —
 * travava o envio e escondia-se ao casal. Agora a listagem diz se está
 * `inteira`; quando não está, quem chama pergunta por ficheiro.
 *
 * Com `comMemoria` (revisão de 14/11, 2.ª, importante n.º 1): da memória
 * (`memoria-das-listagens.ts`), ou à espera da pergunta que outra página já
 * fez — UMA listagem por pasta para as páginas desenhadas em paralelo. Só os
 * desenhos de rascunho, a pré-visualização real e o plano do estúdio a pedem.
 * Sem ela — o travão do envio e a porta do casal —, de fresco, e nada se
 * guarda: «já corrigi — voltar a confirmar» tem de ver o que está lá agora.
 */
function nomesNaPasta(bucket: string, pasta: string, comMemoria = false): Promise<Listagem | null> {
  return comMemoria
    ? listagemComMemoria(bucket, pasta, () => listarAPasta(bucket, pasta))
    : listarAPasta(bucket, pasta);
}

async function listarAPasta(bucket: string, pasta: string): Promise<Listagem | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const nomes = new Set<string>();
  let inteira = false;
  for (let p = 0; p < MAX_PAGINAS; p += 1) {
    const { data, error } = await sb.storage
      .from(bucket)
      .list(pasta, { limit: PAGINA, offset: p * PAGINA });
    if (error || !data) {
      log.warn("verificação de fotos: não deu para listar a pasta", { bucket, pasta });
      return null;
    }
    for (const o of data) if (o.id && !o.name.startsWith(".")) nomes.add(o.name);
    if (data.length < PAGINA) {
      inteira = true;
      break;
    }
  }
  return { nomes, inteira };
}

/**
 * Este ficheiro está nesta pasta? Uma pergunta só, pelo nome (`search`), sem
 * listar a pasta — para as pastas maiores do que o tecto. `null` quando não se
 * conseguiu saber (e «não sei» não acusa).
 *
 * O `search` do Storage procura pelo começo do nome; confere-se o nome exacto.
 * Se a resposta vier cheia sem o nome lá dentro, também não se sabe.
 */
async function existeNaPasta(bucket: string, pasta: string, nome: string): Promise<boolean | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const LIMITE = 100;
  try {
    const { data, error } = await sb.storage
      .from(bucket)
      .list(pasta, { limit: LIMITE, search: nome });
    if (error || !data) return null;
    if (data.some((o) => o.name === nome)) return true;
    return data.length < LIMITE ? false : null;
  } catch {
    return null;
  }
}

/** Corre `fn` sobre cada um, no máximo `limite` ao mesmo tempo, pela ordem. */
async function mapLimit<T, R>(itens: readonly T[], limite: number, fn: (t: T) => Promise<R>) {
  const saida: R[] = new Array(itens.length);
  let proximo = 0;
  await Promise.all(
    Array.from({ length: Math.min(limite, itens.length) }, async () => {
      while (proximo < itens.length) {
        const i = proximo++;
        saida[i] = await fn(itens[i]);
      }
    }),
  );
  return saida;
}

/** `pasta/ficheiro.jpg` → `["pasta", "ficheiro.jpg"]`; `null` se não tiver a forma. */
function partir(caminho: string): [string, string] | null {
  const corte = caminho.indexOf("/");
  if (corte <= 0 || corte === caminho.length - 1) return null;
  return [caminho.slice(0, corte), caminho.slice(corte + 1)];
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O NÚCLEO: QUE FICHEIROS FALTAM — UMA IDA AO STORAGE POR PASTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma função só, para a verificação do passo do envio, para o travão da rota
 * (`fotosEscolhidasQueFaltam`) e para a proposta online (`refsQueJaNaoExistem`)
 * — até 14/11 a rota tinha uma cópia desta lógica, e as duas podiam discordar.
 *
 * Uma pasta que não se deixa listar NÃO desliga o resto (revisão de 14/11,
 * n.º 2): as fotos dessa pasta ficam «por confirmar» (não se acusam), e as das
 * outras pastas continuam a ser conferidas. Antes, uma pasta em falha fazia a
 * rota responder «não sei» para a proposta inteira — e o travão desligava-se.
 */
interface Procura {
  emFalta: FotoEmFalta[];
  /** As de endereços de fora (`https://`), que daqui não se confirmam. */
  naoVerificaveis: number;
  /** As que estavam numa pasta que não se deixou listar: nem bem, nem mal. */
  porConfirmar: Entrada[];
  /** As que foram ao Storage (para as medidas, a seguir). */
  porResolver: Entrada[];
}

const caminhoDe = (ref: string) => (ehRefDeTema(ref) ? caminhoDoRefDeTema(ref) : ref);

async function procurarAsQueFaltam(
  entradas: readonly Entrada[],
  opcoes: { memoria?: boolean } = {},
): Promise<Procura> {
  const emFalta: FotoEmFalta[] = [];
  const porConfirmar: Entrada[] = [];
  let naoVerificaveis = 0;

  /** As que ainda são uma promessa: nem chegam a ir ao Storage. */
  const porResolver: Entrada[] = [];
  for (const e of entradas) {
    if (isPendingImage(e.ref)) {
      emFalta.push({ id: e.id, onde: e.onde, motivo: "por-copiar" });
      continue;
    }
    // Os bytes vêm dentro do próprio documento — não há ficheiro que possa
    // faltar. As propostas anteriores ao Storage são todas assim.
    if (e.ref.startsWith("data:")) continue;
    if (/^https?:\/\//i.test(e.ref)) {
      naoVerificaveis += 1;
      continue;
    }
    porResolver.push(e);
  }

  /** Pasta → as entradas que dela dependem, por bucket. */
  const porPasta = new Map<string, { bucket: string; pasta: string; entradas: Entrada[] }>();
  for (const e of porResolver) {
    const tema = ehRefDeTema(e.ref);
    const caminho = caminhoDe(e.ref);
    const partes = caminho ? partir(caminho) : null;
    if (!partes) {
      // Um caminho sem forma nunca vai resolver — e o motivo certo é o do
      // sítio de onde ele devia vir.
      emFalta.push({
        id: e.id,
        onde: e.onde,
        motivo: tema ? "saiu-da-biblioteca" : "nao-esta-no-bucket",
      });
      continue;
    }
    const bucket = tema ? THEME_BUCKET : PROPOSAL_BUCKET;
    const chave = `${bucket}::${partes[0]}`;
    const grupo = porPasta.get(chave) ?? { bucket, pasta: partes[0], entradas: [] };
    grupo.entradas.push(e);
    porPasta.set(chave, grupo);
  }

  // UMA ida ao Storage por pasta, e todas ao mesmo tempo.
  const listagens = await Promise.all(
    [...porPasta.values()].map(async (g) => ({
      ...g,
      listagem: await nomesNaPasta(g.bucket, g.pasta, opcoes.memoria).catch(() => null),
    })),
  );

  const acusar = (e: Entrada) =>
    emFalta.push({
      id: e.id,
      onde: e.onde,
      motivo: ehRefDeTema(e.ref) ? "saiu-da-biblioteca" : "nao-esta-no-bucket",
    });
  const nomeDe = (e: Entrada) => {
    const caminho = caminhoDe(e.ref);
    const partes = caminho ? partir(caminho) : null;
    return partes ? partes[1] : null;
  };

  /** As das pastas maiores do que o tecto: perguntam-se uma a uma. */
  const umaAUma: { g: (typeof listagens)[number]; e: Entrada; nome: string }[] = [];
  for (const g of listagens) {
    // Não se conseguiu listar: estas não se acusam (ver `nomesNaPasta`) — mas
    // as das outras pastas continuam a contar.
    if (!g.listagem) {
      porConfirmar.push(...g.entradas);
      continue;
    }
    for (const e of g.entradas) {
      const nome = nomeDe(e);
      if (!nome || g.listagem.nomes.has(nome)) continue;
      // Não está na parte lida: numa pasta INTEIRA, falta; numa pasta cortada
      // no tecto, pode estar para lá do corte — pergunta-se por ela.
      if (g.listagem.inteira) acusar(e);
      else umaAUma.push({ g, e, nome });
    }
  }
  if (umaAUma.length > MAX_PERGUNTAS_POR_FICHEIRO) {
    log.warn("verificação de fotos: pasta maior do que o tecto — algumas ficam por confirmar", {
      porConfirmar: umaAUma.length - MAX_PERGUNTAS_POR_FICHEIRO,
    });
    porConfirmar.push(...umaAUma.splice(MAX_PERGUNTAS_POR_FICHEIRO).map((x) => x.e));
  }
  const respostas = await mapLimit(umaAUma, PERGUNTAS_EM_PARALELO, ({ g, nome }) =>
    existeNaPasta(g.bucket, g.pasta, nome),
  );
  umaAUma.forEach(({ e }, i) => {
    if (respostas[i] === false) acusar(e);
    else if (respostas[i] === null) porConfirmar.push(e);
  });
  return { emFalta, naoVerificaveis, porConfirmar, porResolver };
}

/**
 * As fotografias deste documento que não vão aparecer ao casal.
 *
 * NUNCA LANÇA: isto corre antes de um envio, e uma verificação que rebenta não
 * pode ser o que impede uma proposta de sair. Uma falha vem como
 * `verificou: false`, que quem mostra tem de saber ler — e, mesmo assim, as
 * escolhidas que se SABE que faltam vêm em `escolhidasQueFaltam`.
 */
export async function verificarFotosDaProposta(
  doc: Partial<ProposalDoc> | null | undefined,
): Promise<VerificacaoDeFotos> {
  const entradas = inventarioComSitio(doc ?? {});
  const vazio: VerificacaoDeFotos = {
    total: entradas.length,
    emFalta: [],
    suspeitas: [],
    naoVerificaveis: 0,
    verificou: false,
  };
  if (entradas.length === 0) return { ...vazio, verificou: true };

  try {
    const { emFalta, naoVerificaveis, porConfirmar, porResolver } =
      await procurarAsQueFaltam(entradas);
    // As escolhidas que faltam TRAVAM o envio: com a página e o tema, para a
    // frase dizer onde ir (ver `oQueFaltaParaEnviar`). A MESMA função da rota.
    const escolhidasQueFaltam = await escolhidasQueFaltamDe(entradas, emFalta, doc ?? {});
    // Os caminhos de TODAS as que se sabe que faltam (não só as escolhidas):
    // o estúdio deixa de as oferecer nas alternativas (revisão de 14/11, n.º 6).
    const idsEmFalta = new Set(emFalta.filter((f) => f.motivo !== "por-copiar").map((f) => f.id));
    const refsEmFalta = [
      ...new Set(entradas.filter((e) => idsEmFalta.has(e.id)).map((e) => e.ref)),
    ];
    const comRefs = refsEmFalta.length > 0 ? { refsEmFalta } : {};
    if (porConfirmar.length > 0) {
      // Uma pasta não respondeu: a verificação não é inteira («não sei» não
      // acusa), mas o que se sabe das outras pastas não se deita fora.
      return { ...vazio, emFalta, escolhidasQueFaltam, naoVerificaveis, ...comRefs };
    }

    /**
     * ── E AGORA AS QUE ESTÃO LÁ, MAS NÃO DEVIAM IR ASSIM ────────────────
     *
     * As medidas vêm da tabela das fotografias, não dos ficheiros: uma
     * consulta por pasta contra descarregar quarenta e seis imagens para lhes
     * medir a largura. Uma foto sem linha na tabela não entra — não saber a
     * medida é não saber, e daí não sai acusação nenhuma.
     */
    const jaEmFalta = new Set(emFalta.map((f) => f.id));
    const paraMedir = porResolver.filter((e) => !jaEmFalta.has(e.id));
    const formas = await formasDeCaminhos(
      paraMedir.map((e) => caminhoDe(e.ref)).filter((c): c is string => !!c),
    );

    const suspeitas: FotoSuspeita[] = [];
    for (const e of paraMedir) {
      const caminho = caminhoDe(e.ref);
      const forma = caminho ? formas.get(caminho) : undefined;
      if (!forma) continue;
      const { largura, altura } = forma;
      // A régua é a do aviso ao pôr a foto (28/10): as duas perguntas dão a
      // mesma resposta. A medida de partilha vem PRIMEIRO: uma foto do
      // Pinterest é quase sempre pequena também, e das duas frases é esta que
      // diz o que fazer.
      const avaliacao = avaliarFoto(largura, altura, e.lugar);
      if (avaliacao.nivel !== "ma") continue;
      const motivo = LARGURAS_DE_PARTILHA.includes(largura)
        ? "medida-de-partilha"
        : "pequena-demais";
      suspeitas.push({ id: e.id, onde: e.onde, motivo, largura, altura });
    }

    return {
      total: entradas.length,
      emFalta,
      escolhidasQueFaltam,
      suspeitas,
      naoVerificaveis,
      verificou: true,
      ...comRefs,
    };
  } catch (err) {
    log.error("verificação de fotos falhou", err);
    return vazio;
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOS ESCOLHIDAS QUE JÁ NÃO EXISTEM — TRAVAM O ENVIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 14/11: em propostas enviadas a 6/11 e 12/11, uma foto que ela escolhera para
 * um separador estava na Reciclagem da Biblioteca, e o PDF pôs OUTRA no lugar
 * dela, em silêncio. O desenho deixou de o fazer (`pdf-editorial/embutir.ts`),
 * e o envio passa a travar — no estúdio e na rota, pela mesma regra
 * (`oQueFaltaParaEnviar`, id `foto-escolhida-em-falta`) e pela MESMA conta
 * (`procurarAsQueFaltam` + `escolhidasQueFaltamDe`).
 *
 * «Escolhidas» são as de `fotosEscolhidasDoDocumento`: a capa e as das páginas
 * que o PDF ainda desenha. Uma foto de um mood board que falta sai do mosaico
 * (não é trocada por outra), e continua a ser o aviso de sempre.
 *
 * Custo: uma listagem por PASTA das fotos escolhidas (poucas), e, só para as
 * que faltam, uma leitura do tema e da Reciclagem pelo caminho.
 *
 * Nunca lança, e nunca devolve «não sei» para tudo: uma pasta que não responde
 * deixa por acusar só as dela.
 */
export async function fotosEscolhidasQueFaltam(
  doc: Partial<ProposalDoc> | null | undefined,
): Promise<FotoEscolhidaEmFalta[]> {
  const entradas = inventarioComSitio(doc ?? {}).filter((e) => e.escolhida);
  if (entradas.length === 0) return [];
  try {
    const { emFalta, porConfirmar } = await procurarAsQueFaltam(entradas);
    if (porConfirmar.length > 0) {
      log.warn("fotos escolhidas: há pastas por confirmar — essas não se acusam", {
        porConfirmar: porConfirmar.length,
      });
    }
    return await escolhidasQueFaltamDe(entradas, emFalta, doc ?? {});
  } catch (err) {
    log.error("verificação das fotos escolhidas falhou", err);
    return [];
  }
}

/**
 * As fotografias do documento cujo ficheiro SE SABE que já não está lá — para
 * a proposta online não desenhar uma imagem partida (14/11). As que não se
 * conseguiram confirmar (pasta que não respondeu, endereços de fora) NÃO
 * entram: «não sei» nunca esconde uma fotografia ao casal.
 *
 * As `pending:` também não: a página do casal já as deixa de fora
 * (`inventarioDeFotos`).
 */
export async function refsQueJaNaoExistem(
  refs: readonly string[],
  /**
   * `memoria`: aceita uma listagem guardada há pouco (`MEMORIA_MS`), e partilha
   * a que estiver em curso — só os rascunhos, a pré-visualização e o plano.
   */
  opcoes: { memoria?: boolean } = {},
): Promise<Set<string>> {
  const unicas = [...new Set(refs.filter((r) => r && !isPendingImage(r)))];
  if (unicas.length === 0) return new Set();
  const entradas: Entrada[] = unicas.map((ref, i) => ({
    id: `r${i}`,
    ref,
    onde: "",
    lugar: "tema",
  }));
  try {
    const { emFalta } = await procurarAsQueFaltam(entradas, opcoes);
    const ids = new Set(emFalta.map((f) => f.id));
    return new Set(entradas.filter((e) => ids.has(e.id)).map((e) => e.ref));
  } catch (err) {
    log.warn("fotos que já não existem: não deu para confirmar", { erro: String(err) });
    return new Set();
  }
}

/**
 * As fotografias da inspiração (os mood boards) que se SABE que faltam — para
 * a regra da capa (`haFotoNaInspiracao`). As que a verificação já conferiu
 * vêm de `emFalta`; as outras (o travão da rota só confere as escolhidas)
 * perguntam-se agora: uma listagem por pasta, e só quando a capa falta e não
 * ia para o PDF. «Não sei» não conta como falta.
 */
async function inspiracaoQueFalta(
  entradas: readonly Entrada[],
  emFalta: readonly FotoEmFalta[],
  doc: Partial<ProposalDoc>,
): Promise<Set<string>> {
  const ehDaInspiracao = (e: Entrada) => /^b\d+f\d+$/.test(e.id);
  const conferidas = new Set(entradas.filter(ehDaInspiracao).map((e) => e.id));
  const porConferir = inventarioComSitio(doc).filter(
    (e) => ehDaInspiracao(e) && !conferidas.has(e.id),
  );
  const faltas = [...emFalta];
  if (porConferir.length > 0) faltas.push(...(await procurarAsQueFaltam(porConferir)).emFalta);
  const ids = new Set(faltas.map((f) => f.id));
  return new Set(
    [...entradas.filter(ehDaInspiracao), ...porConferir]
      .filter((e) => ids.has(e.id))
      .map((e) => e.ref),
  );
}

/** Das que faltam, as escolhidas — com a página, o tema e se está na Reciclagem. */
async function escolhidasQueFaltamDe(
  entradas: readonly Entrada[],
  emFalta: readonly FotoEmFalta[],
  doc: Partial<ProposalDoc>,
): Promise<FotoEscolhidaEmFalta[]> {
  const faltam = new Map(emFalta.map((f) => [f.id, f]));
  const vistas = new Set<string>();
  let escolhidas = entradas.filter((e) => {
    if (!e.escolhida || !faltam.has(e.id) || vistas.has(e.ref)) return false;
    vistas.add(e.ref);
    return true;
  });
  /**
   * A CAPA só trava se o PDF a fosse usar (revisão de 14/11, n.º 3): uma ao
   * alto ou pequena, sem «usar mesmo assim», já não ia para a capa — o PDF
   * põe lá a melhor deitada da inspiração, falte ela ou não. A regra é a do
   * desenho (`aCapaDelaVaiNoPdf`); a medida, a da biblioteca (a linha fica
   * quando a foto vai para a Reciclagem). Uma consulta, só quando a capa falta.
   */
  const capa = escolhidas.find((e) => e.escolhida?.chave === CHAVE_DA_CAPA);
  if (capa && !isPendingImage(capa.ref)) {
    const caminho = caminhoDe(capa.ref);
    const forma = caminho
      ? (await formasDeCaminhos([caminho]).catch(() => new Map())).get(caminho)
      : undefined;
    const medida = forma ? { w: forma.largura, h: forma.altura } : null;
    // Não ia para a capa — mas «o PDF põe lá outra» só se houver outra
    // (revisão de 14/11, 2.ª, n.º 3): com a inspiração vazia, ou toda em
    // falta, o PDF saía sem capa. A mesma regra do desenho (`regra-da-capa.ts`).
    if (!aCapaDelaVaiNoPdf(medida, doc.capaMesmoAssim)) {
      const faltaNaInspiracao = await inspiracaoQueFalta(entradas, emFalta, doc);
      const haOutra = haFotoNaInspiracao(doc, (r) => faltaNaInspiracao.has(r));
      if (!aFaltaDaCapaTrava(medida, doc.capaMesmoAssim, haOutra)) {
        escolhidas = escolhidas.filter((e) => e !== capa);
      }
    }
  }
  return Promise.all(
    escolhidas.map(async (e): Promise<FotoEscolhidaEmFalta> => {
      const f = e.escolhida!;
      const base = {
        ref: e.ref,
        pagina: f.pagina,
        ...(f.chave === CHAVE_DA_CAPA ? { capa: true as const } : {}),
      };
      if (faltam.get(e.id)?.motivo === "por-copiar") {
        return { ...base, tema: null, naReciclagem: false, porCopiar: true };
      }
      let tema: string | null = null;
      let naReciclagem = false;
      if (ehRefDeTema(e.ref)) {
        const caminho = caminhoDoRefDeTema(e.ref);
        if (caminho) {
          const [t, naLista] = await Promise.all([
            getTheme(themeIdOfPath(caminho)).catch(() => null),
            entradasDe(caminho).catch(() => []),
          ]);
          tema = t?.name?.trim() || null;
          naReciclagem = naLista.some((x) => x.tipo === "foto-de-tema");
        }
      }
      return { ...base, tema, naReciclagem };
    }),
  );
}
