import "server-only";
import { getSupabase } from "./supabase";
import { PROPOSAL_BUCKET } from "./proposal-storage";
import { THEME_BUCKET, ehRefDeTema, caminhoDoRefDeTema } from "./theme-ref";
import { isPendingImage, type ProposalDoc } from "./proposal-doc";
import { formasDeCaminhos } from "./biblioteca-fotos-store";
import { LARGURAS_DE_PARTILHA, type FotoSuspeita } from "./proposta-fotos-verificacao-tipos";
import { avaliarFoto, type LugarDaFoto } from "./qualidade-da-foto";
import { marcaDaRef } from "./proposta-fotos";
import { log } from "./logger";
import type { FotoEmFalta, VerificacaoDeFotos } from "./proposta-fotos-verificacao-tipos";

export type {
  MotivoDeFalta,
  FotoEmFalta,
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
  const juntar = (id: string, onde: string, ref: unknown, lugar: LugarDaFoto = "tema") => {
    if (typeof ref !== "string" || !ref.trim()) return;
    out.push({ id, ref, onde, lugar });
  };
  (doc.coverImages ?? []).forEach((ref, i) =>
    juntar(`c${i}`, `Capa · ${i === 0 ? "esquerda" : "direita"}`, ref, "capa"),
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
  // `inventarioDeFotos` (28/10: ficavam de fora desta conferência).
  Object.entries(doc.fotosDasPaginas ?? {}).forEach(([chave, e], n) =>
    (e?.fotos ?? []).forEach((ref, i) =>
      juntar(
        `p${marcaDaRef(chave).slice(0, 8)}f${i}`,
        `Página escolhida ${n + 1} · foto ${i + 1}`,
        ref,
        "pagina",
      ),
    ),
  );
  return out;
}

/** Quantas páginas de listagem se pedem, e de que tamanho. O mesmo tecto do
 *  `listProposalImages`: uma pasta de pedido não passa disto. */
const PAGINA = 200;
const MAX_PAGINAS = 25;

/**
 * Os nomes de ficheiro que existem numa pasta de um bucket.
 *
 * Devolve `null` quando não se conseguiu listar — que é diferente de uma pasta
 * vazia, e a diferença decide se se acusa uma foto de faltar. Acusar por não
 * se ter conseguido perguntar seria pior do que não perguntar.
 */
async function nomesNaPasta(bucket: string, pasta: string): Promise<Set<string> | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const nomes = new Set<string>();
  for (let p = 0; p < MAX_PAGINAS; p += 1) {
    const { data, error } = await sb.storage
      .from(bucket)
      .list(pasta, { limit: PAGINA, offset: p * PAGINA });
    if (error || !data) {
      log.warn("verificação de fotos: não deu para listar a pasta", { bucket, pasta });
      return null;
    }
    for (const o of data) if (o.id && !o.name.startsWith(".")) nomes.add(o.name);
    if (data.length < PAGINA) break;
  }
  return nomes;
}

/** `pasta/ficheiro.jpg` → `["pasta", "ficheiro.jpg"]`; `null` se não tiver a forma. */
function partir(caminho: string): [string, string] | null {
  const corte = caminho.indexOf("/");
  if (corte <= 0 || corte === caminho.length - 1) return null;
  return [caminho.slice(0, corte), caminho.slice(corte + 1)];
}

/**
 * As fotografias deste documento que não vão aparecer ao casal.
 *
 * NUNCA LANÇA: isto corre antes de um envio, e uma verificação que rebenta não
 * pode ser o que impede uma proposta de sair. Uma falha vem como
 * `verificou: false`, que quem mostra tem de saber ler.
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
    const emFalta: FotoEmFalta[] = [];
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
      const caminho = tema ? caminhoDoRefDeTema(e.ref) : e.ref;
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
        nomes: await nomesNaPasta(g.bucket, g.pasta),
      })),
    );

    for (const g of listagens) {
      // Não se conseguiu listar: não se acusa ninguém. Ver `nomesNaPasta`.
      if (!g.nomes) return { ...vazio, naoVerificaveis };
      for (const e of g.entradas) {
        const caminho = ehRefDeTema(e.ref) ? caminhoDoRefDeTema(e.ref) : e.ref;
        const partes = caminho ? partir(caminho) : null;
        if (!partes || g.nomes.has(partes[1])) continue;
        emFalta.push({
          id: e.id,
          onde: e.onde,
          motivo: ehRefDeTema(e.ref) ? "saiu-da-biblioteca" : "nao-esta-no-bucket",
        });
      }
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
    const caminhoDe = (ref: string) => (ehRefDeTema(ref) ? caminhoDoRefDeTema(ref) : ref);
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

    return { total: entradas.length, emFalta, suspeitas, naoVerificaveis, verificou: true };
  } catch (err) {
    log.error("verificação de fotos falhou", err);
    return vazio;
  }
}
