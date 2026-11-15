import "server-only";
import { semProtegidos } from "@/lib/arquivo-de-pdfs/protegidos";
import { eChaveDeIndiceDeFotos } from "@/lib/indices-de-fotos";
import { lerTodasAsLinhas } from "./ler-todas-as-linhas";
import { createHash } from "node:crypto";
import { getSupabase } from "@/lib/supabase";
import { getState, setState } from "@/lib/app-state";
import { log } from "@/lib/logger";
import { TABELAS_COM_CONTEUDO } from "@/lib/limpar-pastas-orfas";
import { chaveDoPdf } from "@/lib/proposal-pdf-chave";
import { idiomaDaProposta } from "@/lib/proposta-idioma";
import type { ProposalDoc } from "@/lib/proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS PDF DE PROPOSTA QUE JÁ FORAM SUBSTITUÍDOS (10/11, decisão dela)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cada envio guarda o PDF em `proposal-pdfs/<proposta>/<chave>.pdf`, e a chave
 * é o CONTEÚDO (`proposal-pdf-guardado.ts`): uma proposta revista e reenviada
 * deixa o ficheiro anterior lá, «órfão e inofensivo» — mas a ocupar espaço no
 * plano gratuito. A 10/11 eram 9 ficheiros (~9 MB). Ela não quis apagá-los à
 * mão («vou demorar bue tempo») e pediu que saíssem sozinhos, como as
 * fotografias dos pedidos apagados (`limpar-pastas-orfas.ts`).
 *
 * E vale a regra que ela pôs nesse dia: nada sai que depois faça falta. Um PDF
 * fica SEMPRE que for qualquer uma destas coisas:
 *
 *   1. o mais recente da sua proposta, se a proposta existe; e o do documento
 *      ATUAL dela (`chaveDoPdf(doc, idioma)`), que é o que o link, a página
 *      online e o back office servem — mesmo quando não é o mais recente (um
 *      documento que voltou a uma versão anterior encontra o ficheiro antigo,
 *      porque a chave é o conteúdo e o `upsert` é `false`). Uma proposta na
 *      Reciclagem guarda a pasta INTEIRA: pode voltar, e o selo do envio dela
 *      já não está em `proposals` para o reconhecer;
 *   2. o que foi ACEITE: o `sha256` dele está selado no contrato
 *      (`contracts.proposta_pdf_sha256`). Um contrato sem selo guarda a pasta
 *      inteira — «não sei qual foi» não autoriza apagar nenhum; e um selo de
 *      um contrato sem `proposal_id` vale para TODAS as pastas;
 *   3. o último ENVIADO (`proposals.pdf_sha256`);
 *   4. mencionado em qualquer tabela com conteúdo (o nome do ficheiro, ou o id
 *      de uma proposta que já não existe — um resgate na Reciclagem, por ex.).
 *      Não contam as linhas de `app_state` que só APONTAM para a proposta
 *      ({@link PREFIXOS_QUE_NAO_SAO_MENCAO}) — ver «Porque é que não apagava»;
 *   5. com menos de {@link DIAS} dias;
 *   6. e só sai depois de ter sido candidato SEM INTERRUPÇÃO durante pelo menos
 *      {@link ESPERA_DIAS} dias: cada noite que acaba confirma-o, e uma falha
 *      de mais de {@link INTERVALO_MAXIMO_MS} recomeça a contagem (lista em
 *      `app_state`, {@link CHAVE}).
 *
 * Os pontos 2 e 3 comparam o tamanho primeiro e só descarregam o ficheiro
 * para calcular o `sha256` quando o tamanho coincide (ou não se sabe). Se a
 * descarga falhar, o ficheiro fica. O `sha256` calculado guarda-se no estado
 * ({@link Comparado}) e o ficheiro não volta a descarregar-se: o caminho tem o
 * conteúdo na chave e o upload é `upsert: false`, portanto não muda.
 *
 * Mesmo antes do `remove`, uma releitura curta de `proposals` (só as pastas a
 * apagar) tira do lote o que entretanto passou a ser o documento atual, ou a
 * pasta de uma proposta que voltou ou foi apagada a meio.
 *
 * Se UMA leitura falhar, não se apaga nada. As listagens do Storage e as
 * tabelas lêem-se às páginas (mais de 1000 não esconde nada). No máximo
 * {@link POR_NOITE} ficheiros por noite e {@link DESCARGAS_POR_NOITE}
 * descargas para comparar, cada apagado no log. Só se apaga no balde
 * `proposal-pdfs`, e só caminhos `<pasta>/<chave>.pdf`. Nada disto lança.
 *
 * ── PORQUE É QUE NÃO APAGAVA (medido a 14/11) ─────────────────────────────
 *
 * A 14/11 o bucket tinha 65 PDF (132 MB) e a limpeza corria todas as noites —
 * mas só tinha UM ficheiro em espera. Doze PDF de nove propostas APAGADAS
 * (≈11,6 MB, de agosto e setembro) nunca chegavam a candidatos: a porta 4
 * encontrava o id delas no `app_state` e guardava a pasta inteira. Nenhuma
 * dessas menções era um resgate. Eram:
 *
 *   · `ligacao-proposta:<código>` e `ligacao-de-proposta:<id>` — o endereço
 *     curto do link (`proposta-link-curto.ts`). Sem a proposta, o link não abre
 *     nada: a rota lê a proposta antes de procurar o PDF;
 *   · `envio-de-proposta:<pedido>` — a cópia do email (`envios-de-proposta.ts`).
 *     Guarda o nome e o tamanho do anexo, nunca o ficheiro guardado;
 *   · `aquecimento-pdf:estado` — a memória do aquecimento nocturno;
 *   · `proposta-web:…` — a cache da proposta online, derivada do documento.
 *
 * Nenhuma delas lê o ficheiro, e nenhuma o faria voltar a fazer falta. Por isso
 * deixam de contar como menção; tudo o resto conta como dantes.
 *
 * ── ENSAIO ───────────────────────────────────────────────────────────────
 *
 * Com `{ ensaio: true }` faz as mesmas leituras e devolve a `lista` do que
 * sairia (com os bytes), mas não grava a lista de espera nem apaga nada. É o
 * que `scripts/ensaio-pdfs-substituidos.mjs` corre contra produção. O «sai
 * hoje» passa pelos mesmos filtros da limpeza a sério (caminho, protegidos,
 * {@link POR_NOITE}, releitura).
 *
 * ── SE NÃO HOUVER TEMPO ──────────────────────────────────────────────────
 *
 * O cron dá 6 s. Se acabar a meio, nada se apaga e a espera fica como estava,
 * mas o estado regista onde parou (`ultimaNoite`) e há um `log.warn` — para
 * não falhar em silêncio todas as noites. Os `sha256` já calculados ficam
 * gravados, e a noite seguinte continua daí. As pastas listam-se 8 de cada
 * vez e as descargas 4 de cada vez; medido no teste com 65 PDF em 50 pastas.
 *
 * Custo: uma listagem da raiz, uma por proposta (dezenas), e três leituras de
 * colunas pequenas. Os textos das tabelas só se lêem nas noites com
 * candidatos; os PDF só se descarregam quando o tamanho coincide com o de um
 * enviado ou aceite, e cada um uma vez na vida. Uma escrita do estado por
 * noite (duas nas noites que apagam), uma releitura e um `remove` só para o lote.
 */
export const DIAS = 30;
export const ESPERA_DIAS = 7;
export const POR_NOITE = 10;
/**
 * Descargas para comparar o `sha256` (portas 2 e 3), por noite. Um PDF anda
 * pelos 0,5–4 MB e a saída do Supabase gratuito são 5 GB por mês: sem tecto,
 * uma pasta de propostas antigas sem `pdf_bytes` descarregava-se inteira todas
 * as noites. O que fica de fora não está provado — fica, e tenta-se depois.
 * E cada ficheiro descarrega-se UMA vez na vida: o `sha256` dele fica em
 * {@link Comparado} (revisão de 15/11, n.º 2).
 */
export const DESCARGAS_POR_NOITE = 20;
/**
 * A espera dos {@link ESPERA_DIAS} dias tem de ser CONTÍNUA: cada noite que
 * acaba volta a confirmar o candidato. Se a última confirmação tem mais do que
 * isto, houve uma noite pelo meio em que ninguém o viu (falhou, parou a meio,
 * ou ele deixou de ser candidato) — e a contagem recomeça (revisão de 15/11,
 * n.º 4). 36 h: a limpeza corre uma vez por dia, com folga para o cron atrasar.
 */
export const INTERVALO_MAXIMO_MS = 36 * 60 * 60_000;
/**
 * Quantos `sha256` de ficheiros já comparados se guardam no estado. A 14/11 o
 * balde tinha 65 PDF; cada entrada são ~150 bytes de `app_state`.
 */
export const TECTO_COMPARADOS = 500;
export const CHAVE = "limpeza:pdfs-substituidos";

const BUCKET = "proposal-pdfs";
const DIA_MS = 24 * 60 * 60_000;
/** Uma página de listagem do Storage. */
const PAGINA = 1000;
/** Nunca girar para sempre numa listagem: o erro faz a limpeza parar. */
const TECTO_DE_PAGINAS = 50;
/**
 * Pastas listadas ao mesmo tempo. Uma a uma, ~50 pastas a ~150 ms eram ~7,5 s —
 * mais do que os 6 s que o cron dá (revisão de 15/11, n.º 6).
 */
const LISTAGENS_EM_PARALELO = 8;
/** Descargas ao mesmo tempo: 4 × ~3 MB em memória, no máximo. */
const DESCARGAS_EM_PARALELO = 4;
/** O único formato que esta limpeza apaga: `<pasta>/<chave>.pdf`. */
const CAMINHO_APAGAVEL = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.pdf$/;
/** As línguas em que uma proposta pode estar (`proposal-doc-textos.ts`). */
const IDIOMAS = ["pt", "en"] as const;

/** O nome da pasta de uma proposta — o mesmo saneamento de `proposal-pdf-guardado.ts`. */
const pastaDe = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "");
const pastaDoCaminho = (caminho: string) => caminho.split("/")[0];

type Entrada = {
  id?: string | null;
  name: string;
  created_at?: string | null;
  metadata?: { size?: unknown } | null;
};

type Sb = NonNullable<ReturnType<typeof getSupabase>>;

/**
 * Uma pasta do Storage INTEIRA, às páginas. O `list` do Storage devolve no
 * máximo o `limit` pedido: lida só a primeira página, uma pasta com mais de
 * 1000 entradas ficava a meio — e as que faltassem não entravam nas contas.
 */
async function listarTudo(
  sb: Sb,
  pasta: string,
): Promise<{ data: Entrada[] | null; error: unknown }> {
  const todas: Entrada[] = [];
  for (let offset = 0, paginas = 0; ; paginas++) {
    if (paginas >= TECTO_DE_PAGINAS) return { data: null, error: new Error("demasiadas páginas") };
    const { data, error } = await sb.storage.from(BUCKET).list(pasta, {
      limit: PAGINA,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error || !data) return { data: null, error: error ?? new Error("sem dados") };
    todas.push(...(data as Entrada[]));
    // Uma página curta é o fim. Se o servidor cortasse abaixo das 1000, o que
    // ficasse por ler não entrava em `candidatos` — o lado seguro.
    if (data.length < PAGINA) return { data: todas, error: null };
    offset += data.length;
  }
}

/** `fn` sobre cada item, no máximo `n` de cada vez; o resultado na ordem dos itens. */
async function aosPoucos<T, R>(itens: readonly T[], n: number, fn: (t: T) => Promise<R>) {
  const saida = new Array<R>(itens.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      saida[i] = await fn(itens[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhador));
  return saida;
}

/**
 * Chaves de `app_state` que nomeiam uma proposta sem precisarem do PDF dela.
 * Lidas como menção, guardavam para sempre a pasta de uma proposta apagada
 * (ver «Porque é que não apagava», acima). Os prefixos são os dos módulos que
 * as escrevem: `proposta-link-curto.ts`, `envios-de-proposta.ts`,
 * `aquecimento-de-pdf.ts` e `proposta-web/guardado.ts`.
 */
export const PREFIXOS_QUE_NAO_SAO_MENCAO = [
  "ligacao-proposta:",
  "ligacao-de-proposta:",
  "envio-de-proposta:",
  "aquecimento-pdf:",
  "proposta-web:",
] as const;

/** Esta linha de `app_state` conta como menção de um PDF ou de uma proposta? */
export function contaComoMencao(chave: unknown): boolean {
  const k = String(chave ?? "");
  if (k === CHAVE || eChaveDeIndiceDeFotos(k)) return false;
  return !PREFIXOS_QUE_NAO_SAO_MENCAO.some((p) => k.startsWith(p));
}

/**
 * Ficheiro → desde quando é candidato SEM interrupção, e a última noite que o
 * confirmou (ISO).
 */
export type EmEspera = Record<string, { desde: string; visto: string }>;

/**
 * O `sha256` de um ficheiro já descarregado. O caminho tem o conteúdo na chave
 * e o upload é `upsert: false`: enquanto o ficheiro lá estiver, não muda. O
 * tamanho e a data de criação vão junto — se a listagem disser outra coisa
 * (foi apagado e voltou a ser desenhado), a entrada não vale e descarrega-se
 * de novo.
 */
export type Comparado = { sha: string; bytes: number | null; criado: string };

/** O que a limpeza guarda em `app_state`, na {@link CHAVE}. */
export type EstadoDaLimpeza = {
  v: 2;
  espera: EmEspera;
  comparados: Record<string, Comparado>;
  /** A última noite: se acabou, e onde parou se não acabou. */
  ultimaNoite?: { quando: string; acabou: boolean; parou?: string };
};

const eTexto = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/**
 * Lê o estado gravado. O formato antigo (ficheiro → primeira vez visto) passa
 * a `{ desde, visto }` com as duas datas iguais: sem saber se foi confirmado
 * todas as noites, a contagem recomeça — o lado seguro.
 */
export function lerEstado(bruto: unknown): EstadoDaLimpeza {
  const vazio: EstadoDaLimpeza = { v: 2, espera: {}, comparados: {} };
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return vazio;
  const o = bruto as Record<string, unknown>;
  if (o.v !== 2) {
    for (const [c, d] of Object.entries(o)) if (eTexto(d)) vazio.espera[c] = { desde: d, visto: d };
    return vazio;
  }
  const espera = (o.espera ?? {}) as Record<string, unknown>;
  for (const [c, e] of Object.entries(espera)) {
    const x = e as { desde?: unknown; visto?: unknown } | null;
    if (x && eTexto(x.desde) && eTexto(x.visto))
      vazio.espera[c] = { desde: x.desde, visto: x.visto };
  }
  const comparados = (o.comparados ?? {}) as Record<string, unknown>;
  for (const [c, e] of Object.entries(comparados)) {
    const x = e as { sha?: unknown; bytes?: unknown; criado?: unknown } | null;
    if (
      x &&
      eTexto(x.sha) &&
      eTexto(x.criado) &&
      (x.bytes === null || typeof x.bytes === "number")
    ) {
      vazio.comparados[c] = { sha: x.sha, bytes: x.bytes, criado: x.criado };
    }
  }
  const u = o.ultimaNoite as EstadoDaLimpeza["ultimaNoite"] | undefined;
  if (u && eTexto(u.quando)) vazio.ultimaNoite = u;
  return vazio;
}

/** Um PDF que sairia, como o ensaio o mostra. */
export type QueSairia = {
  caminho: string;
  bytes: number | null;
  criado: string;
  /**
   * Sairia esta noite? Com os MESMOS filtros da limpeza a sério: a espera, o
   * formato do caminho, os protegidos, o tecto por noite e a releitura.
   */
  saiaHoje: boolean;
};

type Resultado = {
  candidatos: number;
  emEspera: number;
  apagados: number;
  acabou: boolean;
  /** Onde parou, quando não acabou. */
  parou?: string;
  /** Só no ensaio: o que sairia, e quanto ocupa. */
  lista?: QueSairia[];
  bytes?: number;
};

type Ficheiro = { caminho: string; nome: string; criado: number; bytes: number | null };

type Selo = { sha: string; bytes: number | null };

type LinhaDoc = { id?: unknown; doc?: unknown; idioma?: unknown };

/**
 * Os caminhos do documento ATUAL de cada proposta (`chaveDoPdf(doc, idioma)`),
 * que é o que as rotas do PDF servem — e as pastas em que a chave não se
 * consegue calcular (essas guardam-se inteiras).
 */
function osAtuais(linhas: readonly LinhaDoc[]) {
  const atuais = new Set<string>();
  const semChave = new Set<string>();
  for (const p of linhas) {
    const pasta = pastaDe(String(p.id ?? ""));
    if (!pasta || !p.doc || typeof p.doc !== "object") continue;
    try {
      // A língua gravada primeiro; e as outras também, que são contas de
      // processador sem leitura nenhuma — se ela mudar a língua de volta, o
      // ficheiro ainda lá está.
      const linguas = new Set([idiomaDaProposta(p as { idioma?: unknown }), ...IDIOMAS]);
      for (const l of linguas) atuais.add(`${pasta}/${chaveDoPdf(p.doc as ProposalDoc, l)}.pdf`);
    } catch {
      semChave.add(pasta);
    }
  }
  return { atuais, semChave };
}

export async function limparPdfsSubstituidos(
  agora: Date,
  prazoMs = 8_000,
  { ensaio = false }: { ensaio?: boolean } = {},
): Promise<Resultado> {
  const nada: Resultado = { candidatos: 0, emEspera: 0, apagados: 0, acabou: true };
  const sb = getSupabase();
  if (!sb) return nada;
  const fim = Date.now() + prazoMs;
  const semTempo = () => Date.now() > fim;
  const limite = agora.getTime() - DIAS * DIA_MS;
  const hoje = agora.toISOString();

  // Tudo o que não depende de nada, ao mesmo tempo: o estado, a raiz do balde
  // e as três tabelas pequenas.
  const [lido, { data: raiz, error: erroRaiz }, propostas, contratos, reciclagem] =
    await Promise.all([
      getState<unknown>(CHAVE, { ouFalha: true }).then(
        (v) => ({ ok: true as const, v }),
        () => ({ ok: false as const }),
      ),
      listarTudo(sb, ""),
      // Às páginas: lidas só até às 1000, uma proposta da linha 1001 não estava
      // em `existe` nem nos `selos`, e o PDF enviado e o aceite dela passavam a
      // candidatos (revisão de 13/11, n.º 8).
      lerTodasAsLinhas(sb, "proposals", "id, pdf_sha256, pdf_bytes"),
      lerTodasAsLinhas(sb, "contracts", "proposal_id, proposta_pdf_sha256, proposta_pdf_bytes"),
      lerTodasAsLinhas(sb, "reciclagem", "origem_id"),
    ]);
  // Sem o estado não se sabe o que já se comparou nem há quanto tempo cada um
  // espera. Não se faz nada — e não se grava nada por cima do que lá está.
  if (!lido.ok) {
    log.warn("limpeza dos PDF: o estado não se leu — nada se apagou esta noite");
    return { ...nada, acabou: false, parou: "estado" };
  }
  const antes = lerEstado(lido.v);
  /** Os `sha256` já calculados; cresce com as descargas desta noite. */
  const comparados: Record<string, Comparado> = { ...antes.comparados };

  /**
   * A noite não acabou: nada se apaga e a espera fica como estava (a noite
   * não confirmou ninguém). Mas os `sha256` já calculados GUARDAM-SE — é isso
   * que faz a noite seguinte continuar de onde esta ficou em vez de voltar a
   * descarregar o mesmo e parar no mesmo sítio. E fica registado, no estado e
   * no registo, para não falhar em silêncio todas as noites.
   */
  const pararAMeio = async (parou: string, candidatos = 0): Promise<Resultado> => {
    log.warn("limpeza dos PDF: parou a meio — nada se apagou esta noite", {
      parou,
      prazoMs,
      descarregados: Object.keys(comparados).length - Object.keys(antes.comparados).length,
    });
    if (!ensaio) {
      await setState(CHAVE, {
        ...antes,
        comparados: aparar(comparados),
        ultimaNoite: { quando: hoje, acabou: false, parou },
      } satisfies EstadoDaLimpeza);
    }
    return {
      candidatos,
      emEspera: Object.keys(antes.espera).length,
      apagados: 0,
      acabou: false,
      parou,
    };
  };

  if (erroRaiz || !raiz) return pararAMeio("listagem da raiz");
  if ([propostas, contratos, reciclagem].some((r) => r.error || !r.data)) {
    return pararAMeio("leitura das propostas e contratos");
  }
  const pastas = raiz.filter((e) => !e.id).map((e) => e.name);

  // Tudo pelo nome da PASTA (o id saneado), que é o que a listagem devolve.
  const idsDaPasta = new Map<string, string[]>();
  for (const p of propostas.data as { id: string }[]) {
    const pasta = pastaDe(p.id);
    idsDaPasta.set(pasta, [...(idsDaPasta.get(pasta) ?? []), p.id]);
  }
  const existe = new Set<string>(idsDaPasta.keys());
  /** Na Reciclagem: pode voltar — a pasta inteira fica. */
  const naReciclagem = new Set<string>(
    (reciclagem.data as { origem_id: string | null }[])
      .map((r) => pastaDe(r.origem_id ?? ""))
      .filter(Boolean),
  );
  /** Por proposta, os PDF que não podem sair: o último enviado e o aceite. */
  const selos = new Map<string, Selo[]>();
  /** Propostas com um contrato sem selo: a pasta inteira fica. */
  const semSelo = new Set<string>();
  /** Aceites de contratos sem `proposal_id`: valem para qualquer pasta. */
  const selosSemPasta: Selo[] = [];
  const juntar = (id: string, sha: string | null, bytes: number | null) => {
    if (!sha) return;
    const pasta = pastaDe(id);
    selos.set(pasta, [...(selos.get(pasta) ?? []), { sha: sha.toLowerCase(), bytes }]);
  };
  for (const p of propostas.data as {
    id: string;
    pdf_sha256: string | null;
    pdf_bytes: number | null;
  }[]) {
    juntar(p.id, p.pdf_sha256, p.pdf_bytes);
  }
  for (const c of contratos.data as {
    proposal_id: string | null;
    proposta_pdf_sha256: string | null;
    proposta_pdf_bytes: number | null;
  }[]) {
    if (!c.proposal_id) {
      if (c.proposta_pdf_sha256) {
        selosSemPasta.push({
          sha: c.proposta_pdf_sha256.toLowerCase(),
          bytes: c.proposta_pdf_bytes,
        });
      }
      continue;
    }
    if (!c.proposta_pdf_sha256) semSelo.add(pastaDe(c.proposal_id));
    juntar(c.proposal_id, c.proposta_pdf_sha256, c.proposta_pdf_bytes);
  }

  // ── Portas 1 e 5: por pasta ──────────────────────────────────────────────
  /** Os ficheiros que a listagem desta noite viu, pelas pastas que se leram. */
  const vistos = new Set<string>();
  const pastasLidas = new Set<string>();
  let candidatos: Ficheiro[] = [];
  let acabouOTempo = false;
  const porPasta = await aosPoucos(
    pastas.filter((p) => !semSelo.has(p) && !naReciclagem.has(p)),
    LISTAGENS_EM_PARALELO,
    async (pasta) => {
      if (semTempo()) {
        acabouOTempo = true;
        return [];
      }
      const { data: lista, error } = await listarTudo(sb, pasta);
      if (error || !lista) return [];
      pastasLidas.add(pasta);
      const pdfs = lista
        .filter((f) => f.id && f.name.endsWith(".pdf"))
        .map((f) => ({
          caminho: `${pasta}/${f.name}`,
          nome: f.name,
          criado: f.created_at ? Date.parse(f.created_at) : Number.NaN,
          bytes: typeof f.metadata?.size === "number" ? f.metadata.size : null,
        }));
      for (const f of pdfs) vistos.add(f.caminho);
      if (pdfs.length === 0) return [];
      // Uma data que não se lê não deixa decidir qual é o mais recente: fica tudo.
      if (pdfs.some((f) => Number.isNaN(f.criado))) return [];
      const maisRecente = Math.max(...pdfs.map((f) => f.criado));
      return pdfs.filter(
        (f) => !(existe.has(pasta) && f.criado === maisRecente) && f.criado < limite,
      );
    },
  );
  if (acabouOTempo) return pararAMeio("listagem das pastas");
  candidatos = porPasta.flat();

  // Os `sha256` de ficheiros que já não existem não servem de nada.
  const naRaiz = new Set(pastas);
  for (const c of Object.keys(comparados)) {
    const pasta = pastaDoCaminho(c);
    if (!naRaiz.has(pasta) || (pastasLidas.has(pasta) && !vistos.has(c))) {
      delete comparados[c];
    }
  }

  // ── Porta 4: menções em qualquer tabela ─────────────────────────────────
  if (candidatos.length > 0) {
    const leituras = await Promise.all(
      TABELAS_COM_CONTEUDO.map((t) => lerTodasAsLinhas(sb, t, "*")),
    );
    if (leituras.some((l) => l.error || !l.data)) return pararAMeio("leitura das menções");
    if (semTempo()) return pararAMeio("leitura das menções", candidatos.length);

    // ── Porta 1, segunda metade: o ficheiro do documento ATUAL ─────────────
    // As linhas de `proposals` já vieram inteiras, com o `doc`: não custa
    // leitura nenhuma.
    const { atuais, semChave } = osAtuais(
      leituras[TABELAS_COM_CONTEUDO.indexOf("proposals")].data as LinhaDoc[],
    );
    candidatos = candidatos.filter(
      (f) => !atuais.has(f.caminho) && !semChave.has(pastaDoCaminho(f.caminho)),
    );

    const texto = leituras
      .map((l, i) =>
        JSON.stringify(
          TABELAS_COM_CONTEUDO[i] === "app_state"
            ? // O índice dos resumos (`fotos-resumo.ts`) nomeia pastas de pedidos
              // por fotos que lá estiveram, e os ponteiros para a proposta
              // (`PREFIXOS_QUE_NAO_SAO_MENCAO`) nomeiam-na sem precisarem do
              // PDF — nenhum deles é uma menção.
              (l.data as { key?: string }[]).filter((r) => contaComoMencao(r.key))
            : l.data,
        ),
      )
      .join("\n");
    candidatos = candidatos.filter((f) => {
      const pasta = pastaDoCaminho(f.caminho);
      if (texto.includes(f.nome.replace(/\.pdf$/, ""))) return false;
      // Uma proposta que já não existe mas é mencionada (um resgate guardado,
      // por exemplo) guarda a pasta inteira.
      if (!existe.has(pasta) && texto.includes(pasta)) return false;
      return true;
    });
  }

  // ── Portas 2 e 3: o enviado e o aceite, pelo sha256 ──────────────────────
  // O `sha256` de um ficheiro calcula-se UMA vez: fica em `comparados`, e nas
  // noites seguintes compara-se com os selos de ENTÃO sem descarregar nada.
  // Guarda-se o hash, não «igual»/«diferente»: um selo que apareça depois (um
  // contrato novo, um reenvio de uma versão antiga) continua a ser apanhado.
  const shaGuardado = (f: Ficheiro): string | null => {
    const c = comparados[f.caminho];
    if (!c || c.bytes !== f.bytes || Date.parse(c.criado) !== f.criado) return null;
    return c.sha;
  };
  const podeSerDe = (f: Ficheiro) =>
    [...(selos.get(pastaDoCaminho(f.caminho)) ?? []), ...selosSemPasta].filter(
      (s) => s.bytes === null || f.bytes === null || s.bytes === f.bytes,
    );
  // Sem descarga não há prova: o que passa do tecto fica, e tenta-se depois.
  const aDescarregar = candidatos
    .filter((f) => podeSerDe(f).length > 0 && shaGuardado(f) === null)
    .slice(0, DESCARGAS_POR_NOITE);
  await aosPoucos(aDescarregar, DESCARGAS_EM_PARALELO, async (f) => {
    if (semTempo()) {
      acabouOTempo = true;
      return;
    }
    const { data, error } = await sb.storage.from(BUCKET).download(f.caminho);
    if (error || !data) return;
    comparados[f.caminho] = {
      sha: createHash("sha256")
        .update(Buffer.from(await data.arrayBuffer()))
        .digest("hex"),
      bytes: f.bytes,
      criado: new Date(f.criado).toISOString(),
    };
  });
  if (acabouOTempo) return pararAMeio("descargas para comparar", candidatos.length);

  const prontos = candidatos.filter((f) => {
    const podeSer = podeSerDe(f);
    if (podeSer.length === 0) return true;
    const s = shaGuardado(f);
    return s !== null && !podeSer.some((x) => x.sha === s);
  });

  // ── Porta 6: a lista de espera, contínua ─────────────────────────────────
  const espera: EmEspera = {};
  for (const f of prontos) {
    const a = antes.espera[f.caminho];
    const continuo = a && agora.getTime() - Date.parse(a.visto) <= INTERVALO_MAXIMO_MS;
    espera[f.caminho] = { desde: continuo ? a.desde : hoje, visto: hoje };
  }
  const cumpriu = (f: Ficheiro) => {
    const desde = Date.parse(espera[f.caminho].desde);
    return !Number.isNaN(desde) && agora.getTime() - desde >= ESPERA_DIAS * DIA_MS;
  };
  // Os que sairiam esta noite: os MESMOS filtros no ensaio e a sério.
  let lote = prontos
    .filter(
      (f) =>
        cumpriu(f) &&
        // Só um PDF de uma pasta de proposta, e nunca o que nenhuma limpeza
        // pode levar (`arquivo-de-pdfs/protegidos.ts`).
        CAMINHO_APAGAVEL.test(f.caminho) &&
        semProtegidos(BUCKET, [f.caminho]).length > 0,
    )
    .slice(0, POR_NOITE);

  // ── A corrida curta: relê as propostas das pastas a apagar ──────────────
  // Entre a leitura de cima e o `remove`, ela pode ter voltado o documento a
  // uma versão antiga (o ficheiro desse caminho passa a ser o ATUAL) ou uma
  // proposta pode ter voltado da Reciclagem. Uma leitura, só destas pastas.
  let releuMal = false;
  if (lote.length > 0) {
    const pastasDoLote = [...new Set(lote.map((f) => pastaDoCaminho(f.caminho)))];
    const ids = [...new Set(pastasDoLote.flatMap((p) => [p, ...(idsDaPasta.get(p) ?? [])]))];
    const { data, error } = await sb.from("proposals").select("id, doc, idioma").in("id", ids);
    if (error || !data) {
      releuMal = true;
      lote = [];
    } else {
      const linhas = data as LinhaDoc[];
      const { atuais, semChave } = osAtuais(linhas);
      /** Pastas de propostas que eram apagadas e agora existem: ficam inteiras. */
      const voltaram = new Set(
        linhas.map((l) => pastaDe(String(l.id ?? ""))).filter((p) => !existe.has(p)),
      );
      /**
       * Pastas de propostas que existiam e já não vêm: apagadas entretanto —
       * talvez para a Reciclagem, que guarda a pasta inteira.
       */
      const vieram = new Set(linhas.map((l) => pastaDe(String(l.id ?? ""))));
      lote = lote.filter((f) => {
        const pasta = pastaDoCaminho(f.caminho);
        if (existe.has(pasta) && !vieram.has(pasta)) return false;
        return !atuais.has(f.caminho) && !semChave.has(pasta) && !voltaram.has(pasta);
      });
    }
  }

  if (ensaio) {
    const saem = new Set(lote.map((f) => f.caminho));
    const lista: QueSairia[] = prontos.map((f) => ({
      caminho: f.caminho,
      bytes: f.bytes,
      criado: new Date(f.criado).toISOString(),
      saiaHoje: saem.has(f.caminho),
    }));
    return {
      candidatos: prontos.length,
      emEspera: Object.keys(antes.espera).length,
      apagados: 0,
      acabou: !releuMal,
      ...(releuMal ? { parou: "releitura das propostas" } : {}),
      lista,
      bytes: lista.reduce((s, f) => s + (f.bytes ?? 0), 0),
    };
  }

  const estado = (): EstadoDaLimpeza => ({
    v: 2,
    espera,
    comparados: aparar(comparados),
    ultimaNoite: releuMal
      ? { quando: hoje, acabou: false, parou: "releitura das propostas" }
      : { quando: hoje, acabou: true },
  });
  const gravou = await setState(CHAVE, estado());
  if (!gravou.gravado || !gravou.duradouro) {
    log.warn("limpeza dos PDF: a lista de espera não ficou gravada — nada se apagou");
    return { candidatos: prontos.length, emEspera: prontos.length, apagados: 0, acabou: false };
  }
  if (releuMal) {
    log.warn("limpeza dos PDF: a releitura das propostas falhou — nada se apagou esta noite");
    return {
      candidatos: prontos.length,
      emEspera: Object.keys(espera).length,
      apagados: 0,
      acabou: false,
      parou: "releitura das propostas",
    };
  }

  // Um pedido só, para o lote inteiro.
  let apagados = 0;
  if (lote.length > 0) {
    const { error } = await sb.storage.from(BUCKET).remove(lote.map((f) => f.caminho));
    if (!error) {
      for (const f of lote) {
        apagados++;
        const visto = espera[f.caminho];
        delete espera[f.caminho];
        delete comparados[f.caminho];
        log.info("limpeza: PDF de proposta substituído saiu do armazenamento", {
          ficheiro: f.caminho,
          bytes: f.bytes,
          criado: new Date(f.criado).toISOString(),
          candidatoDesde: visto.desde,
        });
      }
      await setState(CHAVE, estado());
    } else {
      log.warn("limpeza dos PDF: o Storage recusou apagar — ficam para a noite seguinte", {
        n: lote.length,
      });
    }
  }
  return {
    candidatos: prontos.length,
    emEspera: Object.keys(espera).length,
    apagados,
    acabou: true,
  };
}

/**
 * Os `comparados` dentro do {@link TECTO_COMPARADOS}: ficam os mais recentes
 * (os antigos são os que mais depressa saem do balde). Um que caia daqui
 * apenas se volta a descarregar — nunca se apaga nada por isso.
 */
function aparar(comparados: Record<string, Comparado>): Record<string, Comparado> {
  const entradas = Object.entries(comparados);
  if (entradas.length <= TECTO_COMPARADOS) return comparados;
  entradas.sort((a, b) => Date.parse(b[1].criado) - Date.parse(a[1].criado));
  return Object.fromEntries(entradas.slice(0, TECTO_COMPARADOS));
}
