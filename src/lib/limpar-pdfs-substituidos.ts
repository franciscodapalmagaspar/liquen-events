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
 * Os pontos 2 e 3 descarregam o ficheiro para calcular o `sha256` sempre que
 * a pasta dele tem um selo — o tamanho não decide «diferente» sozinho (3.ª
 * passagem, n.º 1); só os aceites sem pasta, que valem para o balde inteiro,
 * se filtram pelo tamanho antes de descarregar. E uma pasta com um selo de
 * tamanho conhecido sem NENHUM ficheiro desse tamanho fica inteira, sem
 * descargas: não se sabe qual foi o enviado (3.ª passagem, n.º 3). Se a
 * descarga falhar — ou vier com outro tamanho que o do Storage, ou, sem
 * tamanho na listagem, não parecer um PDF inteiro —, o ficheiro
 * fica, e a falha fica registada ({@link Falha}) para não se repetir todas as
 * noites nem tapar os outros. O `sha256` calculado guarda-se no estado
 * ({@link Comparado}) e o ficheiro não volta a descarregar-se para ESPERAR: o
 * caminho tem o conteúdo na chave e o upload é `upsert: false`.
 *
 * Mas a cache nunca decide sozinha uma remoção (revisão de 15/11, 2.ª
 * passagem, n.º 1): uma descarga estragada do mesmo tamanho gravava um
 * `sha256` errado, e o PDF selado saía passados 7 dias. Mesmo antes do
 * `remove`, cada ficheiro do lote que PODE ser um selado (tamanho igual, ou
 * desconhecido) descarrega-se outra vez; só sai se o `sha256` de agora for o
 * mesmo da cache e diferente de todos os selos. Se não confirmar, fica.
 *
 * Antes dessa confirmação, uma releitura curta (só as pastas a apagar) de
 * `proposals` e de `contracts` tira do lote o que entretanto passou a ser o
 * documento atual, o enviado ou o aceite, uma proposta com um contrato novo
 * sem selo, ou a pasta de uma proposta que voltou ou foi apagada a meio.
 *
 * Se UMA leitura falhar, não se apaga nada. As listagens do Storage e as
 * tabelas lêem-se às páginas (mais de 1000 não esconde nada). No máximo
 * {@link POR_NOITE} ficheiros por noite, {@link DESCARGAS_POR_NOITE}
 * descargas para comparar e outras tantas como o lote para confirmar; cada
 * apagado (segundo o que o Storage DIZ que apagou) no log. Só se apaga no
 * balde `proposal-pdfs`, e só caminhos `<pasta>/<chave>.pdf`.
 *
 * Uma descarga que lança conta como descarga falhada. Outra exceção (uma
 * listagem que lança, por ex.) só sai depois de todos os pedidos em curso
 * terem parado ({@link aosPoucos}) e antes de qualquer `remove` — quem chama
 * (o cron) apanha-a, e nada se apagou.
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
 * O cron dá 6 s. Se acabar a meio, nada se apaga e a espera fica como estava
 * — menos na confirmação antes do `remove`: aí saem os que já se confirmaram,
 * e a noite seguinte pede um lote de metade (no mínimo {@link LOTE_MINIMO}).
 * Em qualquer caso,
 * o estado regista onde parou (`ultimaNoite`) e há um `log.warn` — para
 * não falhar em silêncio todas as noites. Os `sha256` já calculados ficam
 * gravados, e a noite seguinte continua daí. As pastas listam-se 8 de cada
 * vez e as descargas 4 de cada vez; medido no teste com 65 PDF em 50 pastas.
 * Nas noites em que algum já cumpriu a espera, as descargas para comparar
 * deixam {@link RESERVA_PARA_APAGAR_MS} livres para a releitura, a confirmação
 * e o `remove` (sem isso, a pior noite medida eram 7 s).
 *
 * Custo: uma listagem da raiz, uma por proposta (dezenas), e três leituras de
 * colunas pequenas. Os textos das tabelas só se lêem nas noites com
 * candidatos; os PDF só se descarregam quando o tamanho coincide com o de um
 * enviado ou aceite — para comparar, cada um uma vez na vida (até
 * {@link DESCARGAS_POR_NOITE} por noite; uma falha descansa 1–8 noites); e
 * outra vez, para confirmar, os do lote que podem ser selados (até
 * {@link POR_NOITE}, só nas noites que apagam). Uma escrita do estado por
 * noite (duas nas noites que apagam), duas releituras e um `remove` só para o lote.
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
/**
 * Uma descarga que falhou não se repete logo: espera 1, 2, 4 e depois 8
 * noites (`2^(n-1)`, no máximo isto). Assim um ficheiro que falha sempre não
 * gasta descargas todas as noites nem tapa os outros no tecto (revisão de
 * 15/11, 2.ª passagem, n.º 3).
 */
export const PAUSA_MAXIMA_NOITES = 8;
/** O lote mais pequeno a que uma noite sem tempo na confirmação reduz a seguinte. */
export const LOTE_MINIMO = 2;
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
/**
 * Nas noites em que algum ficheiro já cumpriu a espera, as descargas para
 * comparar deixam este tempo livre no fim: a releitura, a confirmação (até
 * {@link POR_NOITE} descargas, 4 de cada vez), o `remove` e as gravações. Sem
 * ele, 20 descargas novas + o lote eram ~7 s (medido no teste). O que fica
 * por descarregar não está provado — fica, e tenta-se na noite seguinte.
 */
const RESERVA_PARA_APAGAR_MS = 3_500;
/** O único formato que esta limpeza apaga: `<pasta>/<chave>.pdf`. */
const CAMINHO_APAGAVEL = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.pdf$/;
/** As línguas em que uma proposta pode estar (`proposal-doc-textos.ts`). */
const IDIOMAS = ["pt", "en"] as const;
/**
 * `proposals.id` é `uuid`: um valor noutro formato num `.in("id", …)` faz o
 * PostgREST recusar o pedido inteiro (22P02) — e a releitura falhava sempre.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/**
 * `fn` sobre cada item, no máximo `n` de cada vez; o resultado na ordem dos
 * itens. Se um `fn` lançar, nenhum trabalhador pega no item seguinte, e a
 * exceção só sai depois de os pedidos em curso acabarem — nunca fica um a
 * correr por trás de quem já desistiu (revisão de 15/11, 2.ª passagem, n.º 6).
 */
export async function aosPoucos<T, R>(itens: readonly T[], n: number, fn: (t: T) => Promise<R>) {
  const saida = new Array<R>(itens.length);
  let proximo = 0;
  let erro: { e: unknown } | null = null;
  const trabalhador = async () => {
    while (!erro && proximo < itens.length) {
      const i = proximo++;
      try {
        saida[i] = await fn(itens[i]);
      } catch (e) {
        erro ??= { e };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhador));
  if (erro) throw (erro as { e: unknown }).e;
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

/** Descargas falhadas de um ficheiro: quantas seguidas, e a última (ISO). */
export type Falha = { n: number; ultima: string };

/** O que a limpeza guarda em `app_state`, na {@link CHAVE}. */
export type EstadoDaLimpeza = {
  v: 2;
  espera: EmEspera;
  comparados: Record<string, Comparado>;
  /** As descargas que falharam, para não se repetirem todas as noites. */
  falhas?: Record<string, Falha>;
  /**
   * Os que o `remove` pediu e o Storage não disse que apagou (sem `error`):
   * descansam como as {@link Falha}s, para a confirmação não se repetir todas
   * as noites (revisão de 15/11, 3.ª passagem, n.º 6).
   */
  recusados?: Record<string, Falha>;
  /**
   * O tamanho do lote da próxima noite, quando é menor que {@link POR_NOITE}:
   * uma noite que ficou sem tempo na confirmação faz a seguinte pedir metade
   * (no mínimo {@link LOTE_MINIMO}); uma que confirmou tudo volta a dobrar.
   */
  lote?: number;
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
  for (const campo of ["falhas", "recusados"] as const) {
    const lidas = (o[campo] ?? {}) as Record<string, unknown>;
    for (const [c, e] of Object.entries(lidas)) {
      const x = e as { n?: unknown; ultima?: unknown } | null;
      if (x && typeof x.n === "number" && x.n >= 1 && eTexto(x.ultima)) {
        (vazio[campo] ??= {})[c] = { n: x.n, ultima: x.ultima };
      }
    }
  }
  if (typeof o.lote === "number" && Number.isInteger(o.lote) && o.lote >= 1) vazio.lote = o.lote;
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
    if (!pasta) continue;
    // Uma proposta que EXISTE mas cujo documento não se lê (nulo, ou noutro
    // formato): não se sabe qual é o ficheiro que o link serve. Antes passava
    // à frente, e só o «mais recente da pasta» (porta 1) a protegia — mas o
    // atual pode não ser o mais recente (um documento que voltou atrás). O
    // lado seguro: a pasta inteira fica (revisão de 15/11, 3.ª passagem, n.º 7).
    if (!p.doc || typeof p.doc !== "object") {
      semChave.add(pasta);
      continue;
    }
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
  /** As descargas falhadas; muda com as descargas desta noite. */
  const falhas: Record<string, Falha> = { ...antes.falhas };
  /** Os que o `remove` não confirmou; muda com o `remove` desta noite. */
  const recusados: Record<string, Falha> = { ...antes.recusados };
  /** O tamanho do lote desta noite ({@link EstadoDaLimpeza.lote}). */
  const porNoite = Math.max(LOTE_MINIMO, Math.min(POR_NOITE, antes.lote ?? POR_NOITE));
  let proximoLote: number | undefined = antes.lote;

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
        falhas: apararFalhas(falhas),
        recusados: apararFalhas(recusados),
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

  /**
   * Um selo com tamanho para o qual nenhum ficheiro da pasta tem esse tamanho
   * (nem tamanho desconhecido): o ficheiro que ela enviou não é nenhum dos que
   * lá estão — ou é, e a listagem ou o selo dizem outra coisa. Medido em
   * produção a 15/11: 6 dos 56 selos estavam assim (o envio desenha de novo e
   * sela, mas grava com `upsert: false` numa chave que já existia). «Não sei
   * qual foi o que ela enviou» não autoriza apagar nenhum: a pasta inteira
   * fica, como a de um contrato sem selo, e sem descarga nenhuma (revisão de
   * 15/11, 3.ª passagem, n.º 3). Os selos sem tamanho não decidem isto — esses
   * comparam-se pelo `sha256`.
   */
  const seloSemFicheiro = (ss: readonly Selo[] | undefined, fs: readonly Ficheiro[]) =>
    (ss ?? []).some(
      (s) => s.bytes !== null && !fs.some((f) => f.bytes === null || f.bytes === s.bytes),
    );
  /** Os PDF de cada pasta lida, para a releitura voltar a aplicar a regra de cima. */
  const ficheirosDaPasta = new Map<string, Ficheiro[]>();
  /** As pastas guardadas inteiras por {@link seloSemFicheiro}. */
  const pastasSemOFicheiroDoSelo: string[] = [];

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
      ficheirosDaPasta.set(pasta, pdfs);
      if (pdfs.length === 0) return [];
      if (seloSemFicheiro(selos.get(pasta), pdfs)) {
        pastasSemOFicheiroDoSelo.push(pasta);
        return [];
      }
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
  if (pastasSemOFicheiroDoSelo.length > 0) {
    log.info("limpeza dos PDF: pastas com um selo sem ficheiro do mesmo tamanho ficam inteiras", {
      pastas: pastasSemOFicheiroDoSelo.length,
    });
  }

  // Os `sha256` de ficheiros que já não existem não servem de nada.
  const naRaiz = new Set(pastas);
  for (const c of Object.keys(comparados)) {
    const pasta = pastaDoCaminho(c);
    if (!naRaiz.has(pasta) || (pastasLidas.has(pasta) && !vistos.has(c))) {
      delete comparados[c];
    }
  }
  for (const c of Object.keys(falhas)) {
    const pasta = pastaDoCaminho(c);
    if (!naRaiz.has(pasta) || (pastasLidas.has(pasta) && !vistos.has(c))) delete falhas[c];
  }
  for (const c of Object.keys(recusados)) {
    const pasta = pastaDoCaminho(c);
    if (!naRaiz.has(pasta) || (pastasLidas.has(pasta) && !vistos.has(c))) delete recusados[c];
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
  /** Os selos da própria pasta (e os da releitura), SEM filtro de tamanho. */
  const selosDaPasta = (f: Ficheiro, mais: readonly Selo[] = []) => [
    ...(selos.get(pastaDoCaminho(f.caminho)) ?? []),
    ...mais,
  ];
  /** Todos os selos que um ficheiro pode ser, sem filtro de tamanho. */
  const todosOsSelos = (f: Ficheiro, mais: readonly Selo[] = []) => [
    ...selosDaPasta(f, mais),
    ...selosSemPasta,
  ];
  /**
   * Os selos que obrigam a descarregar o ficheiro para comparar. Os da pasta
   * contam SEMPRE, seja qual for o tamanho: um `pdf_bytes` errado (ou uma
   * listagem com outro tamanho) não pode decidir «diferente» sem descarga
   * (revisão de 15/11, 3.ª passagem, n.º 1). Só os aceites sem pasta — que
   * valem para TODOS os ficheiros do balde — se filtram pelo tamanho aqui; na
   * confirmação antes do `remove` contam todos ({@link todosOsSelos}).
   */
  const podeSerDe = (f: Ficheiro) => [
    ...selosDaPasta(f),
    ...selosSemPasta.filter((s) => s.bytes === null || f.bytes === null || s.bytes === f.bytes),
  ];
  /**
   * Descarrega e calcula o `sha256`. `null` se a descarga falhar, lançar, ou
   * vier com outro tamanho que o da listagem — uma descarga cortada ou trocada
   * não pode gravar um `sha256` (revisão de 15/11, 2.ª passagem, n.º 1).
   *
   * Sem tamanho na listagem não havia verificação nenhuma (3.ª passagem, n.º
   * 2). Agora tem de parecer um PDF inteiro — `%PDF-` no início e `%%EOF` nos
   * últimos 1024 bytes —, e se tiver exatamente o tamanho de um dos selos
   * (`bytes`), tem de ter o `sha256` dele: o mesmo tamanho com outro conteúdo
   * pode ser uma cópia estragada do PDF selado, e isso não se distingue de um
   * PDF diferente. Na dúvida é falha, e o ficheiro fica.
   */
  const shaDescarregado = async (f: Ficheiro, osSelos: readonly Selo[]): Promise<string | null> => {
    try {
      const { data, error } = await sb.storage.from(BUCKET).download(f.caminho);
      if (error || !data) return null;
      const buf = Buffer.from(await data.arrayBuffer());
      if (f.bytes !== null && buf.byteLength !== f.bytes) return null;
      const sha = createHash("sha256").update(buf).digest("hex");
      if (f.bytes === null) {
        if (!pareceUmPdfInteiro(buf)) return null;
        const doMesmoTamanho = osSelos.filter((s) => s.bytes === buf.byteLength);
        if (doMesmoTamanho.length > 0 && !doMesmoTamanho.some((s) => s.sha === sha)) return null;
      }
      return sha;
    } catch {
      return null;
    }
  };
  const registarFalha = (f: Ficheiro, onde: Record<string, Falha> = falhas) => {
    onde[f.caminho] = { n: (onde[f.caminho]?.n ?? 0) + 1, ultima: hoje };
  };
  /** Falhou há pouco: espera 1, 2, 4, 8 noites antes de se tentar de novo. */
  const emPausa = (f: Ficheiro, onde: Record<string, Falha> = falhas) => {
    const x = onde[f.caminho];
    if (!x) return false;
    const noites = Math.min(2 ** (x.n - 1), PAUSA_MAXIMA_NOITES);
    // Meia noite de folga: o cron não corre sempre à mesma hora.
    return agora.getTime() - Date.parse(x.ultima) < (noites - 0.5) * DIA_MS;
  };
  // Sem descarga não há prova: o que passa do tecto fica, e tenta-se depois.
  // Primeiro os que nunca falharam, depois os que falharam há mais tempo — e
  // os que falharam há pouco descansam ({@link PAUSA_MAXIMA_NOITES}).
  const aDescarregar = candidatos
    .filter((f) => podeSerDe(f).length > 0 && shaGuardado(f) === null && !emPausa(f))
    .map((f, i) => ({ f, i, u: falhas[f.caminho] ? Date.parse(falhas[f.caminho].ultima) : -1 }))
    .sort((a, b) => a.u - b.u || a.i - b.i)
    .map((x) => x.f)
    .slice(0, DESCARGAS_POR_NOITE);
  const haDeHaverLote = Object.values(antes.espera).some(
    (e) => agora.getTime() - Date.parse(e.desde) >= ESPERA_DIAS * DIA_MS,
  );
  const reserva = haDeHaverLote ? RESERVA_PARA_APAGAR_MS : 0;
  await aosPoucos(aDescarregar, DESCARGAS_EM_PARALELO, async (f) => {
    if (semTempo()) {
      acabouOTempo = true;
      return;
    }
    if (Date.now() > fim - reserva) return;
    const sha = await shaDescarregado(f, todosOsSelos(f));
    if (sha === null) {
      registarFalha(f);
      return;
    }
    delete falhas[f.caminho];
    comparados[f.caminho] = { sha, bytes: f.bytes, criado: new Date(f.criado).toISOString() };
  });
  if (acabouOTempo) return pararAMeio("descargas para comparar", candidatos.length);

  const prontos = candidatos.filter((f) => {
    const s = shaGuardado(f);
    // Um `sha256` já calculado compara-se com TODOS os selos — não custa nada.
    if (s !== null && todosOsSelos(f).some((x) => x.sha === s)) return false;
    return podeSerDe(f).length === 0 || s !== null;
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
        semProtegidos(BUCKET, [f.caminho]).length > 0 &&
        // Uma confirmação que falhou há pouco não ocupa o lugar dos outros, nem
        // um que o `remove` recusou há pouco.
        !emPausa(f) &&
        !emPausa(f, recusados),
    )
    .slice(0, porNoite);

  // ── A corrida curta: relê as propostas e os contratos das pastas a apagar
  // Entre a leitura de cima e o `remove`, ela pode ter voltado o documento a
  // uma versão antiga (o ficheiro desse caminho passa a ser o ATUAL), enviado
  // esse documento, um casal pode tê-lo aceite, ou uma proposta pode ter
  // voltado da Reciclagem. Duas leituras, só destas pastas.
  let releuMal = false;
  /** Selos que a releitura encontrou, por pasta (os de cima continuam a valer). */
  const selosNovos = new Map<string, Selo[]>();
  if (lote.length > 0) {
    const pastasDoLote = [...new Set(lote.map((f) => pastaDoCaminho(f.caminho)))];
    const reais = pastasDoLote.flatMap((p) => idsDaPasta.get(p) ?? []);
    const ids = [...new Set([...pastasDoLote, ...reais])];
    // Os ids reais vieram da própria coluna; um nome de pasta só se pergunta
    // se tiver a forma de um `uuid`. Um nome noutro formato nunca pode ser o
    // id de uma proposta — não pode «voltar» —, e mandá-lo fazia o PostgREST
    // recusar a releitura inteira (22P02).
    const idsDeProposta = [...new Set([...reais, ...pastasDoLote.filter((p) => UUID.test(p))])];
    const [rp, rc] = await Promise.all([
      idsDeProposta.length > 0
        ? sb
            .from("proposals")
            .select("id, doc, idioma, pdf_sha256, pdf_bytes")
            .in("id", idsDeProposta)
            .then(
              (r) => r,
              (e: unknown) => ({ data: null, error: e }),
            )
        : { data: [], error: null },
      // `contracts.proposal_id` é texto: aqui qualquer nome serve.
      sb
        .from("contracts")
        .select("proposal_id, proposta_pdf_sha256, proposta_pdf_bytes")
        .in("proposal_id", ids)
        .then(
          (r) => r,
          (e: unknown) => ({ data: null, error: e }),
        ),
    ]);
    if (rp.error || !rp.data || rc.error || !rc.data) {
      releuMal = true;
      lote = [];
    } else {
      const linhas = rp.data as (LinhaDoc & { pdf_sha256?: unknown; pdf_bytes?: unknown })[];
      const { atuais, semChave } = osAtuais(linhas);
      const novo = (id: unknown, sha: unknown, bytes: unknown) => {
        if (!eTexto(sha)) return;
        const pasta = pastaDe(String(id ?? ""));
        selosNovos.set(pasta, [
          ...(selosNovos.get(pasta) ?? []),
          { sha: sha.toLowerCase(), bytes: typeof bytes === "number" ? bytes : null },
        ]);
      };
      for (const l of linhas) novo(l.id, l.pdf_sha256, l.pdf_bytes);
      /** Pastas com um contrato (novo ou antigo) sem selo: ficam inteiras. */
      const semSeloAgora = new Set<string>();
      for (const c of rc.data as {
        proposal_id?: unknown;
        proposta_pdf_sha256?: unknown;
        proposta_pdf_bytes?: unknown;
      }[]) {
        if (!eTexto(c.proposta_pdf_sha256)) semSeloAgora.add(pastaDe(String(c.proposal_id ?? "")));
        novo(c.proposal_id, c.proposta_pdf_sha256, c.proposta_pdf_bytes);
      }
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
        if (semSeloAgora.has(pasta)) return false;
        // A regra do selo sem ficheiro do mesmo tamanho, com os selos de agora.
        if (seloSemFicheiro(selosNovos.get(pasta), ficheirosDaPasta.get(pasta) ?? [])) return false;
        return !atuais.has(f.caminho) && !semChave.has(pasta) && !voltaram.has(pasta);
      });
    }
  }

  // ── A confirmação: a cache nunca decide sozinha uma remoção ─────────────
  // Cada ficheiro do lote que pode ser um selado descarrega-se de novo — e
  // aqui contam TODOS os selos (os da pasta, os da releitura e os sem pasta),
  // seja qual for o tamanho (3.ª passagem, n.º 1). Só sai se o `sha256` de
  // agora for o da cache e não for o de nenhum selo; uma descarga que falhe,
  // venha com outro tamanho ou dê outro `sha256` deixa-o ficar. No máximo
  // {@link POR_NOITE}.
  //
  // Sem tempo a meio, saem só os que JÁ se confirmaram (3.ª passagem, n.º 4):
  // dantes não saía nenhum, e uma noite que parava aqui parava aqui todas as
  // noites. Os outros ficam na espera, e a noite seguinte pede um lote mais
  // pequeno ({@link EstadoDaLimpeza.lote}).
  let semTempoNaConfirmacao = false;
  if (lote.length > 0) {
    const confirmados = await aosPoucos(lote, DESCARGAS_EM_PARALELO, async (f) => {
      const podeSer = todosOsSelos(f, selosNovos.get(pastaDoCaminho(f.caminho)));
      if (podeSer.length === 0) return true;
      if (semTempo()) {
        semTempoNaConfirmacao = true;
        return false;
      }
      const agoraSha = await shaDescarregado(f, podeSer);
      if (agoraSha === null) {
        registarFalha(f);
        return false;
      }
      const daCache = shaGuardado(f);
      const igualAUmSelo = podeSer.some((x) => x.sha === agoraSha);
      if (igualAUmSelo || (daCache !== null && daCache !== agoraSha)) {
        // A cache estava errada (ou o ficheiro é um selado): corrige-se, e a
        // espera dele recomeça — se ainda for candidato, a próxima noite vê-o.
        comparados[f.caminho] = {
          sha: agoraSha,
          bytes: f.bytes,
          criado: new Date(f.criado).toISOString(),
        };
        delete espera[f.caminho];
        if (daCache !== null && daCache !== agoraSha) {
          log.warn("limpeza dos PDF: o sha256 guardado não confirmou — o ficheiro fica", {
            ficheiro: f.caminho,
          });
        }
        return false;
      }
      delete falhas[f.caminho];
      return true;
    });
    lote = lote.filter((_, i) => confirmados[i]);
    proximoLote = proximoTamanhoDoLote(porNoite, semTempoNaConfirmacao);
  }
  if (semTempoNaConfirmacao) {
    log.warn("limpeza dos PDF: sem tempo na confirmação — só saem os já confirmados", {
      prazoMs,
      confirmados: lote.length,
      proximoLote,
    });
  }
  /** Onde parou, se parou: a releitura que falhou, ou a confirmação sem tempo. */
  const parou = releuMal
    ? "releitura das propostas"
    : semTempoNaConfirmacao
      ? "confirmação antes de apagar"
      : undefined;

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
      acabou: !parou,
      ...(parou ? { parou } : {}),
      lista,
      bytes: lista.reduce((s, f) => s + (f.bytes ?? 0), 0),
    };
  }

  const estado = (): EstadoDaLimpeza => ({
    v: 2,
    espera,
    comparados: aparar(comparados),
    falhas: apararFalhas(falhas),
    recusados: apararFalhas(recusados),
    ...(proximoLote !== undefined ? { lote: proximoLote } : {}),
    ultimaNoite: parou ? { quando: hoje, acabou: false, parou } : { quando: hoje, acabou: true },
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
    const caminhos = lote.map((f) => f.caminho);
    const { data, error } = await sb.storage.from(BUCKET).remove(caminhos);
    if (!error) {
      // Conta-se o que o Storage DIZ que apagou, não o que se pediu (revisão
      // de 15/11, 2.ª passagem, n.º 4). Um que não venha fica na espera; se
      // tiver mesmo saído, a listagem de amanhã já não o vê e sai de lá.
      const saiu = new Set(
        ((data ?? []) as { name?: unknown }[]).map((o) => String(o?.name ?? "")),
      );
      const naoSairam = lote.filter((f) => !saiu.has(f.caminho));
      if (naoSairam.length > 0) {
        // Com a lista dos caminhos pedidos, para se poder auditar (3.ª
        // passagem, n.º 5) — um `data` vazio sem `error` não diz mais nada.
        log.warn("limpeza dos PDF: o Storage não confirmou todos os apagados", {
          pedidos: lote.length,
          confirmados: lote.length - naoSairam.length,
          caminhos,
          naoConfirmados: naoSairam.map((f) => f.caminho),
        });
      }
      for (const f of lote) {
        if (!saiu.has(f.caminho)) {
          // Recusado em silêncio: descansa como uma descarga falhada (1, 2, 4,
          // 8 noites), para não repetir a confirmação todas as noites (3.ª
          // passagem, n.º 6). Se tiver saído mesmo, a listagem de amanhã já
          // não o vê e o registo desaparece.
          registarFalha(f, recusados);
          continue;
        }
        delete recusados[f.caminho];
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
        caminhos,
      });
    }
  }
  return {
    candidatos: prontos.length,
    emEspera: Object.keys(espera).length,
    apagados,
    acabou: !parou,
    ...(parou ? { parou } : {}),
  };
}

/**
 * O lote da noite seguinte ({@link EstadoDaLimpeza.lote}): metade (no mínimo
 * {@link LOTE_MINIMO}) se esta ficou sem tempo na confirmação; o dobro se a
 * acabou — e `undefined` (o {@link POR_NOITE} de sempre) quando lá chega.
 */
export function proximoTamanhoDoLote(porNoite: number, semTempo: boolean): number | undefined {
  if (semTempo) return Math.max(LOTE_MINIMO, Math.floor(porNoite / 2));
  return porNoite * 2 >= POR_NOITE ? undefined : porNoite * 2;
}

/**
 * Um PDF inteiro começa por `%PDF-` e acaba com `%%EOF` (com, no máximo,
 * espaços e mudanças de linha depois; 1024 bytes de folga, como os leitores).
 * Uma descarga cortada perde o fim.
 */
export function pareceUmPdfInteiro(buf: Uint8Array): boolean {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (b.subarray(0, 5).toString("latin1") !== "%PDF-") return false;
  return b
    .subarray(Math.max(0, b.byteLength - 1024))
    .toString("latin1")
    .includes("%%EOF");
}

/**
 * Os `comparados` dentro do {@link TECTO_COMPARADOS}: ficam os mais recentes
 * (os antigos são os que mais depressa saem do balde). Um que caia daqui
 * apenas se volta a descarregar — nunca se apaga nada por isso.
 */
function apararFalhas(falhas: Record<string, Falha>): Record<string, Falha> {
  const entradas = Object.entries(falhas);
  if (entradas.length <= TECTO_COMPARADOS) return falhas;
  entradas.sort((a, b) => Date.parse(b[1].ultima) - Date.parse(a[1].ultima));
  return Object.fromEntries(entradas.slice(0, TECTO_COMPARADOS));
}

function aparar(comparados: Record<string, Comparado>): Record<string, Comparado> {
  const entradas = Object.entries(comparados);
  if (entradas.length <= TECTO_COMPARADOS) return comparados;
  entradas.sort((a, b) => Date.parse(b[1].criado) - Date.parse(a[1].criado));
  return Object.fromEntries(entradas.slice(0, TECTO_COMPARADOS));
}
