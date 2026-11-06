import { NextRequest, NextResponse } from "next/server";
import { isAuthed, ADMIN_NAME_COOKIE } from "@/lib/admin-auth";
import {
  getProposalDraft,
  saveProposalDraft,
  clearProposalDraft,
  ehFalhaPermanente,
  porqueNaoGuardou,
  avisoDeSitioEfemero,
  type StoredProposalDraft,
} from "@/lib/proposal-drafts";
import { log } from "@/lib/logger";
import { juntarRascunhos } from "@/lib/rascunho-juntar";
import { comCpu } from "@/lib/medir-cpu";
import { marcarPropostaEmPreparacao } from "@/lib/estado-do-pedido-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Teto do tamanho de um rascunho. Um documento do estúdio são alguns KB
 * (caminhos de fotos, textos e números — nunca bytes de imagem). 512 KB é
 * folgado para o maior casamento e trava, na mesma, um cliente avariado a
 * tentar guardar meio megabyte de lixo a cada meio segundo.
 */
const MAX_DRAFT_BYTES = 512 * 1024;

/**
 * ── DUAS FERRAMENTAS, DOIS RASCUNHOS, O MESMO PEDIDO ───────────────────────
 *
 * O estúdio não é a única maneira de montar uma proposta: a ferramenta antiga
 * (a tabela de linhas do `ProposalBuilder`) vive no mesmo separador, sobre o
 * MESMO pedido, e não guardava absolutamente nada — doze linhas escritas à mão
 * desapareciam ao trocar de cliente.
 *
 * Guardá-las aqui é a resposta óbvia — o armazém já existe, já está na cópia de
 * segurança e já sabe dizer quando NÃO gravou. O que não podia era ficarem na
 * mesma chave: `proposal-draft:<pedido>` é um documento do estúdio, e um
 * documento de linhas escrito por cima dele fazia as duas ferramentas
 * disputarem a mesma gaveta à «última escrita vence» — que aqui significa
 * apagar o trabalho uma da outra.
 *
 * Por isso a variante, e por isso uma LISTA FECHADA: o nome entra numa chave do
 * `app_state`, uma tabela partilhada por marcadores de operação e contadores.
 * Sem a lista, quem chamasse a rota escolhia a chave que quisesse dentro do
 * espaço de nomes. Fora da lista, o parâmetro é simplesmente ignorado — grava
 * no rascunho do estúdio, que é o comportamento de sempre.
 *
 * A forma `<pedido>--<variante>` continua a passar no `ehChaveDeRascunho`
 * (letras, dígitos, `-` e `_`), portanto estas gavetas vão na cópia de
 * segurança e voltam na reposição pelo mesmo caminho das outras.
 */
/**
 * ── E A GAVETA DO RESGATE, QUE ESTAVA ESCRITA E ERA INALCANÇÁVEL ──────────
 *
 * O `PUT` guarda, desde sempre, a versão que ia ser esmagada numa chave irmã
 * `<chave>--sobreposto`, e devolve o nome dela em `resgate`. Isso cumpria
 * metade da regra da casa — «se falhar, não perder trabalho»: o trabalho da
 * outra pessoa ficava mesmo guardado.
 *
 * A outra metade não existia. Esta lista é fechada de propósito (ver acima), e
 * `sobreposto` NÃO estava nela: um `GET ?variante=sobreposto` caía no `else` e
 * devolvia o rascunho do estúdio — ou seja, a gaveta estava cheia e não havia
 * porta. O trabalho estava guardado num sítio que nenhuma parte do produto
 * conseguia abrir.
 *
 * As duas entradas, e não uma: a chave de resgate é construída sobre a chave
 * JÁ escolhida, portanto a ferramenta antiga das linhas gera
 * `<pedido>--orcamento-linhas--sobreposto`. Deixar essa de fora repetia o
 * defeito na outra metade do estúdio.
 *
 * A lista continua fechada — é ela que impede quem chame a rota de escolher a
 * chave que quiser dentro do espaço de nomes do `app_state`.
 */
const VARIANTES_DE_RASCUNHO = new Set([
  "orcamento-linhas",
  "sobreposto",
  "orcamento-linhas--sobreposto",
]);

function idDoRascunho(request: NextRequest, id: string): string {
  let variante: string | null = null;
  try {
    // `new URL(request.url)` e não `request.nextUrl`: esta rota é chamada com
    // pedidos que nem sempre são um `NextRequest` completo (os testes usam um
    // `Request` simples), e uma leitura de parâmetros não pode ser o motivo
    // pelo qual uma gravação estoira.
    variante = new URL(request.url).searchParams.get("variante");
  } catch {
    /* URL ilegível — vale o rascunho do estúdio, como sempre valeu */
  }
  return variante && VARIANTES_DE_RASCUNHO.has(variante) ? `${id}--${variante}` : id;
}

/** Quem está a gravar, para o aviso poder dizer "alterado pela Catarina" em vez
 *  de "alterado noutro sítio". É só um nome escrito no login — não é
 *  identidade nem autorização (isso é o `isAuthed`), por isso limita-se o
 *  tamanho e mais nada. */
function whoIsSaving(request: NextRequest): string | undefined {
  // Defensivo de propósito: é um enfeite da mensagem de aviso. Se o nome não
  // estiver ao alcance, o rascunho grava-se na mesma — falhar uma gravação por
  // causa de uma etiqueta seria trocar o essencial pelo acessório.
  const raw = request.cookies?.get?.(ADMIN_NAME_COOKIE)?.value?.trim();
  return raw ? raw.slice(0, 40) : undefined;
}

/** O rascunho guardado no servidor para este pedido (null se não houver). */
async function GET_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json({
      ok: true,
      draft: await getProposalDraft(idDoRascunho(request, id)),
    });
  } catch (err) {
    log.error("proposta-rascunho GET falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * Grava o rascunho. Última escrita vence — o estúdio é usado por uma equipa
 * pequena e bloquear a edição seria pior do que o problema. Mas a escrita não
 * é cega: quem grava manda o `baseUpdatedAt` que leu, e se entretanto alguém
 * gravou por cima a resposta di-lo (`overwrote`), para o estúdio poder avisar
 * em vez de a alteração desaparecer em silêncio.
 *
 * ── E QUANDO A GRAVAÇÃO NÃO ACONTECE ──────────────────────────────────────
 *
 * Esta rota respondia `{ ok: true }` mesmo quando o `app_state` recusava a
 * escrita — porque `saveProposalDraft` devolvia o rascunho na mesma e não havia
 * como saber. O estúdio escrevia «guardado às 14:32» e o trabalho ficava só no
 * `localStorage` daquele portátil. Foi assim que uma proposta inteira
 * desapareceu para quem a foi ver noutro computador.
 *
 * Agora responde **503 com `guardado: false`**, e não 500: isto não é uma
 * avaria do pedido — o pedido foi entendido, o rascunho é válido, e a edição
 * continua a poder seguir. É o ARMAZENAMENTO que não está disponível, e é
 * exactamente isso que o 503 diz. `permanente` diz ao estúdio se vale a pena
 * tentar outra vez (rede) ou se é a instalação que está incompleta.
 */
async function PUT_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || !("doc" in body)) {
      return NextResponse.json({ error: "Rascunho em falta." }, { status: 400 });
    }
    const serialised = JSON.stringify(body.doc ?? null);
    if (serialised.length > MAX_DRAFT_BYTES) {
      return NextResponse.json({ error: "Rascunho demasiado grande." }, { status: 413 });
    }

    const chave = idDoRascunho(request, id);
    const current = await getProposalDraft(chave);
    const base = typeof body.baseUpdatedAt === "string" ? body.baseUpdatedAt : null;
    const alguemGravouEntretanto = Boolean(current && base && current.updatedAt !== base);

    /**
     * ── JUNTAR CAMPO A CAMPO, QUANDO SE SABE O QUE CADA UM MUDOU ──────────
     *
     * Achado n.º 6 da auditoria — ver `rascunho-juntar.ts`. Quem grava manda
     * os `campos` que mudou desde a última conversa com o servidor e o valor
     * que eles tinham (`base`). Com isso, o que a outra pessoa mudou noutros
     * campos fica, e só o campo em que as duas mexeram é escrito por cima.
     *
     * Um cliente que não mande `campos` (um separador aberto antes desta
     * versão) continua a ter o comportamento antigo: a última escrita inteira.
     */
    const ehDoc = (v: unknown): v is Record<string, unknown> =>
      !!v && typeof v === "object" && !Array.isArray(v);
    const campos =
      Array.isArray(body.campos) && body.campos.every((c: unknown) => typeof c === "string")
        ? (body.campos as string[])
        : null;
    let docAGravar: unknown = body.doc;
    let juntou = false;
    let conflitos: string[] = [];
    if (
      alguemGravouEntretanto &&
      campos &&
      ehDoc(body.base) &&
      ehDoc(current?.doc) &&
      ehDoc(body.doc)
    ) {
      const j = juntarRascunhos(current.doc, body.doc, campos, body.base);
      docAGravar = j.doc;
      juntou = true;
      conflitos = j.conflitos;
    }
    // «Escrevi por cima do trabalho de alguém» só quando é verdade: sem
    // junção, sempre que alguém gravou entretanto; com junção, só se as duas
    // pessoas mexeram no mesmo campo.
    const overwrote = alguemGravouEntretanto && (!juntou || conflitos.length > 0);

    /**
     * ══════════════════════════════════════════════════════════════════════
     * ANTES DE ESCREVER POR CIMA, GUARDA-SE O QUE ESTAVA LÁ
     * ══════════════════════════════════════════════════════════════════════
     *
     * O cenário, verificado: a Ana abre o estúdio de manhã e deixa o separador
     * aberto. A Catarina abre a MESMA proposta à tarde noutro computador,
     * compõe dois mood boards e escreve os textos, com gravação automática a
     * correr. A Ana volta ao portátil e escreve um carácter. Oitocentos
     * milissegundos depois, o documento das nove da manhã é gravado por cima
     * do das quatro da tarde.
     *
     * Isto era detectado (`overwrote`) e escrito na mesma, e o aviso chegava
     * DEPOIS, uma vez por sessão, a dizer «ficou a tua versão». As duas horas
     * de trabalho da outra pessoa não existiam em mais lado nenhum.
     *
     * Continua a escrever-se — bloquear a edição de duas pessoas numa casa de
     * três é pior do que o problema, e essa decisão está explicada acima. O
     * que muda é haver de onde resgatar: a versão que ia desaparecer fica numa
     * chave irmã, e a resposta di-lo para o estúdio o poder dizer a quem está
     * a olhar.
     *
     * UMA SÓ ranhura de resgate por rascunho, e de propósito: guardar todas as
     * sobreposições enchia o `app_state` de documentos com mood boards lá
     * dentro. A que interessa é sempre a última, porque é a única que ainda
     * não foi vista por ninguém.
     */
    let resgate: string | null = null;
    if (overwrote && current?.doc != null) {
      const chaveDeResgate = `${chave}--sobreposto`;
      const { persistencia: guardouOResgate } = await saveProposalDraft(
        chaveDeResgate,
        current.doc,
        current.savedBy,
      );
      if (guardouOResgate.gravado) {
        resgate = chaveDeResgate;
      } else {
        // Não se trava a gravação por causa do resgate: o trabalho de quem
        // está a escrever AGORA não pode ficar refém de uma cópia falhada.
        log.error("proposta-rascunho: a versão sobreposta não pôde ser guardada", null, {
          id: chave,
          motivo: guardouOResgate.motivo,
        });
      }
    }

    const { draft: saved, persistencia } = await saveProposalDraft(
      chave,
      docAGravar,
      whoIsSaving(request),
    );
    if (!persistencia.gravado) {
      const motivo = persistencia.motivo;
      log.error("proposta-rascunho: NÃO guardado — o trabalho ficou só no navegador", null, {
        id: chave,
        motivo,
      });
      return NextResponse.json(
        {
          ok: false,
          guardado: false,
          motivo,
          permanente: ehFalhaPermanente(motivo),
          erro: porqueNaoGuardou(motivo),
        },
        { status: 503 },
      );
    }
    // ── O caso do meio: ficou, e não dura ────────────────────────────────
    //
    // Produção sem Supabase: o `setState` escreve no `data/app-state.json`, que
    // em Vercel é o disco da função — não sobrevive a um deploy e muitas vezes
    // nem à invocação seguinte. A escrita ACONTECEU, por isso não é 503 e a
    // edição segue exactamente como sempre seguiu; o que não pode é sair daqui
    // um «guardado» seco, que é a mesma frase que o estúdio escreveu no dia em
    // que uma proposta inteira ficou presa no `localStorage` de um portátil.
    //
    // 200 com `duradouro: false` e a frase por escrito: quem já lê `guardado`
    // continua a ler o que lia, e quem quiser dizer a verdade tem com quê.
    if (!persistencia.duradouro) {
      log.warn("proposta-rascunho: guardado num sítio que um deploy apaga", {
        id: chave,
        onde: persistencia.onde,
      });
    }

    /**
     * ── O PEDIDO PASSA A «A PREPARAR PROPOSTA» (6/11, pedido dela) ──────────
     *
     * Só o rascunho DO ESTÚDIO (`chave === id`): a ferramenta antiga das linhas
     * e a gaveta do resgate não são uma proposta a ser montada. E só depois de
     * o rascunho ter ficado gravado — um pedido «a preparar» cuja proposta não
     * existe no servidor era o quadro a dizer uma coisa que não é.
     *
     * Barato de propósito, porque isto corre a cada autosave: uma leitura de
     * uma coluna, e uma escrita no pedido SÓ na gravação em que o estado muda.
     * Nunca atira — ver `marcarPropostaEmPreparacao`. O estado novo vai na
     * resposta para o estúdio poder actualizar a sua cópia do pedido.
     */
    // O `.catch` é a segunda guarda, e de propósito: o rascunho JÁ está
    // gravado, e um 500 daqui fazia o estúdio dizer «não guardado» sobre uma
    // escrita que passou — por causa da cor de uma coluna.
    const estadoDoPedido =
      chave === id ? await marcarPropostaEmPreparacao(id).catch(() => null) : null;

    return NextResponse.json({
      ok: true,
      guardado: true,
      duradouro: persistencia.duradouro,
      ...(persistencia.duradouro ? {} : { onde: persistencia.onde, aviso: avisoDeSitioEfemero() }),
      updatedAt: saved.updatedAt,
      overwrote,
      ...(alguemGravouEntretanto && current?.savedBy ? { previousBy: current.savedBy } : {}),
      ...(resgate ? { resgate, resgateEm: current?.updatedAt } : {}),
      // O documento como ficou, para o estúdio pôr no ecrã o que veio da outra
      // pessoa — sem isto ela continuava a ver a sua versão como a gravada.
      ...(juntou ? { juntou: true as const, doc: docAGravar, conflitos } : {}),
      ...(estadoDoPedido ? { estadoDoPedido } : {}),
    } satisfies {
      ok: true;
      guardado: true;
      duradouro: boolean;
      onde?: string;
      aviso?: string;
      updatedAt: string;
      overwrote: boolean;
      previousBy?: string;
      resgate?: string;
      resgateEm?: string;
      juntou?: true;
      doc?: unknown;
      conflitos?: string[];
      estadoDoPedido?: string;
    });
  } catch (err) {
    log.error("proposta-rascunho PUT falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/** Descarta o rascunho (proposta enviada, ou limpo à mão no estúdio). */
async function DELETE_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    // Falhar a limpeza não perde trabalho — perde-se o contrário: o rascunho
    // fica onde estava e volta a aparecer na próxima abertura. Por isso continua
    // a ser 200. Mas o `apagado` diz a verdade, para o estúdio não prometer uma
    // limpeza que não houve.
    const { gravado } = await clearProposalDraft(idDoRascunho(request, id));
    return NextResponse.json({ ok: true, apagado: gravado } satisfies {
      ok: true;
      apagado: boolean;
    });
  } catch (err) {
    log.error("proposta-rascunho DELETE falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export type { StoredProposalDraft };

// Quanto processador gasta cada pedido (3/11) — ver `medir-cpu.ts`.
export const GET = comCpu("proposta-rascunho GET", GET_semMedida);
export const PUT = comCpu("proposta-rascunho PUT", PUT_semMedida);
export const DELETE = comCpu("proposta-rascunho DELETE", DELETE_semMedida);
