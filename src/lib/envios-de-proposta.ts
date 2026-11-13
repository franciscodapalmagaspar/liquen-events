import "server-only";
import { getState, listStateByPrefix, setState, type ResultadoDeEscrita } from "./app-state";
import type { Mapper } from "./repository";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE SEGUIU, PARA QUEM, QUANDO, E COM QUE TEXTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Enviada a proposta, ficava gravado o DOCUMENTO (a coluna `proposals.doc`) e
 * mais nada do EMAIL. O quadro dizia «Proposta enviada» e o histórico do
 * pedido ganhava uma linha com o valor — mas a pergunta que se faz três
 * semanas depois, ao telefone, é outra: *o que é que nós lhes escrevemos?*
 *
 * Desde que o corpo passou a ser editável no ecrã de envio, essa pergunta
 * deixou de ter resposta possível em lado nenhum. O modelo guardado não serve
 * — ele é o PONTO DE PARTIDA e pode ter sido reescrito para aquele casal, e
 * pode ter mudado desde então. O rascunho do estúdio também não: é o
 * documento, não o email, e apaga-se no «Limpar rascunho».
 *
 * Isto é a cópia. Uma entrada por envio, com quem recebeu, quando, de que
 * modelo partiu, quem assinou, o assunto, o corpo tal e qual, e o anexo que
 * seguiu com ele.
 *
 * ── O QUE ISTO NÃO É, E NÃO PODE VIR A SER ────────────────────────────────
 *
 * NÃO é rastreio. Não há aqui — nem pode passar a haver — «aberto em», «lido
 * às», «carregou no link». É decisão dela, escrita para quem vier a seguir:
 * um pixel invisível, um endereço que conta cliques ou um aviso de leitura são
 * sinal recolhido às escondidas de quem recebe o email, e esta casa não o
 * recolhe. Os campos abaixo são todos factos do lado de CÁ: o que nós
 * mandámos, quando o mandámos, e quem carregou no botão.
 *
 * ── ONDE FICA GUARDADO, E PORQUÊ AÍ ───────────────────────────────────────
 *
 * Na tabela `app_state`, com a chave `envio-de-proposta:<pedido>` — o mesmo
 * sítio e a mesma decisão dos rascunhos do estúdio (ver `proposal-drafts.ts`,
 * que escreve por extenso o «deliberadamente NÃO se criou uma tabela nova»).
 * Um envio são alguns KB de texto, e a alternativa custava um passo manual de
 * SQL numa instalação a trabalhar.
 *
 * A proposta de esquema para uma tabela `proposal_emails` a sério está no
 * relatório desta entrega — as migrações são aprovadas antes, e é regra dela.
 * Até lá, o que aqui está tem duas limitações escritas à frente: o TECTO de
 * {@link ENVIOS_GUARDADOS} entradas por pedido, e a AUSÊNCIA da cópia de
 * segurança (`backup-restore.ts` exporta os rascunhos por conjunto próprio;
 * este espaço de nomes ainda não tem o seu).
 */

/** O espaço de nomes dos envios dentro do `app_state`. */
export const ENVIOS_PREFIX = "envio-de-proposta:";

/**
 * Quantos envios se guardam por pedido.
 *
 * Uma proposta revista três ou quatro vezes é o normal; doze é uma negociação
 * fora do vulgar e já é mais do que alguém alguma vez vai reler. O tecto existe
 * porque isto vive numa linha só do `app_state`: sem ele, um pedido teimoso
 * fazia crescer um único valor JSON sem fim, e é a linha inteira que se lê e
 * reescreve a cada envio.
 *
 * Quando estoura, o que sai é o MAIS ANTIGO. O que interessa é o que seguiu da
 * última vez.
 */
export const ENVIOS_GUARDADOS = 12;

/** Quanto corpo se guarda. O tecto do que se pode escrever é 10.000; guardar
 *  mais do que isso seria guardar o que nunca chegou a sair. */
const MAXIMO_CORPO_GUARDADO = 12_000;

export interface AnexoEnviado {
  /** O nome do ficheiro tal como ele chega à pasta de transferências deles. */
  nome: string;
  /** O tamanho do PDF em bytes — o do ficheiro, não o do anexo codificado. */
  bytes: number;
}

/** Um email de proposta que SAIU. Só se escreve depois de o correio ter sido
 *  aceite — ver a rota do envio: «enviada» é um facto sobre o mundo. */
export interface EnvioDeProposta {
  /** Quando seguiu (ISO). É também a ordem: o mais recente é o último. */
  enviadoEm: string;
  /** O endereço do cliente para onde foi. */
  para: string;
  /** O nome de quem carregou no botão, lido da sessão. Vazio = a casa. */
  porQuem: string;
  /** A chave do modelo de que o corpo partiu («registo-formal»). Vazia quando
   *  o envio não passou pelo ecrã novo (o texto da casa, um envio antigo). */
  modelo: string;
  /** A língua em que o email saiu. */
  idioma: "pt" | "en";
  assunto: string;
  /** O corpo TAL E QUAL, em texto — o que estava na caixa quando ela carregou
   *  em Enviar, já com a ligação da proposta resolvida. Não é o HTML: o que se
   *  quer reler daqui a três semanas são as palavras, e o markup da moldura da
   *  casa é sempre o mesmo e não é dela. */
  texto: string;
  /** O documento que seguiu com ele. */
  anexo?: AnexoEnviado;
  /** A proposta a que este email pertence, para cruzar com o histórico. */
  propostaId?: string;
}

/** O que fica guardado por pedido: a lista, do mais antigo ao mais recente. */
interface EnviosDoPedido {
  envios: EnvioDeProposta[];
}

/** A chave de um pedido, saneada para não sair do seu espaço de nomes. */
export function chaveDosEnvios(quoteId: string): string {
  return `${ENVIOS_PREFIX}${String(quoteId ?? "").replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

const texto = (valor: unknown, tecto = 500): string =>
  typeof valor === "string" ? valor.slice(0, tecto) : "";

/** Uma entrada lida do armazenamento, com a forma garantida. Uma linha
 *  estragada não pode deitar abaixo a lista inteira de um pedido. */
function comoEnvio(cru: unknown): EnvioDeProposta | null {
  if (!cru || typeof cru !== "object") return null;
  const o = cru as Record<string, unknown>;
  const enviadoEm = texto(o.enviadoEm, 40);
  if (!enviadoEm) return null;
  const anexo = o.anexo as Record<string, unknown> | undefined;
  return {
    enviadoEm,
    para: texto(o.para, 320),
    porQuem: texto(o.porQuem, 120),
    modelo: texto(o.modelo, 120),
    idioma: o.idioma === "en" ? "en" : "pt",
    assunto: texto(o.assunto, 500),
    texto: texto(o.texto, MAXIMO_CORPO_GUARDADO),
    ...(anexo && typeof anexo === "object"
      ? {
          anexo: {
            nome: texto(anexo.nome, 240),
            bytes: typeof anexo.bytes === "number" && anexo.bytes >= 0 ? anexo.bytes : 0,
          },
        }
      : {}),
    ...(texto(o.propostaId, 60) ? { propostaId: texto(o.propostaId, 60) } : {}),
  };
}

/** Os envios de um pedido, do mais antigo ao mais recente. Nunca lança. */
export async function listarEnvios(quoteId: string): Promise<EnvioDeProposta[]> {
  const guardado = await getState<EnviosDoPedido>(chaveDosEnvios(quoteId));
  const crus = Array.isArray(guardado?.envios) ? guardado.envios : [];
  return crus.map(comoEnvio).filter((e): e is EnvioDeProposta => e !== null);
}

/**
 * Acrescenta um envio à lista do pedido.
 *
 * NUNCA LANÇA, e isto é a parte que interessa: o email JÁ SAIU quando esta
 * função é chamada. Uma falha a guardar a cópia não pode virar um erro no ecrã
 * de quem enviou — do lado dela, a proposta seguiu, e a única coisa que uma
 * excepção aqui conseguia era fazê-la carregar em Enviar outra vez e o casal
 * receber a proposta duas vezes. Devolve ONDE ficou, para quem chamar poder
 * dizer a verdade sem ter de a adivinhar.
 */
export async function registarEnvio(
  quoteId: string,
  envio: EnvioDeProposta,
): Promise<ResultadoDeEscrita> {
  try {
    // Para acrescentar: uma leitura falhada NÃO pode dar uma lista vazia — a
    // escrita seguinte apagava o histórico dos envios (auditoria de 13/11).
    // Lança, e o `catch` de baixo diz que a cópia não ficou guardada.
    const guardado = await getState<EnviosDoPedido>(chaveDosEnvios(quoteId), { ouFalha: true });
    const anteriores = (Array.isArray(guardado?.envios) ? guardado.envios : [])
      .map(comoEnvio)
      .filter((e): e is EnvioDeProposta => e !== null);
    const limpo = comoEnvio(envio);
    if (!limpo) {
      log.warn("envios de proposta: entrada sem forma, não foi guardada", { quoteId });
      return { gravado: false, duradouro: false, onde: "nenhures" };
    }
    // O mais antigo é o que sai. `slice(-N)` depois de acrescentar, e não
    // antes: com a lista já no tecto, cortar primeiro deitava fora um envio
    // para depois falhar a escrita e ficar sem os dois.
    const envios = [...anteriores, limpo].slice(-ENVIOS_GUARDADOS);
    return await setState<EnviosDoPedido>(chaveDosEnvios(quoteId), { envios });
  } catch (e) {
    log.error("envios de proposta: não foi possível guardar a cópia do email", e, { quoteId });
    return { gravado: false, duradouro: false, onde: "nenhures" };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   A CÓPIA DE SEGURANÇA
   ═══════════════════════════════════════════════════════════════════════════

   Isto ficou escrito no cabeçalho como uma limitação conhecida — «a AUSÊNCIA
   da cópia de segurança (`backup-restore.ts` exporta os rascunhos por conjunto
   próprio; este espaço de nomes ainda não tem o seu)» — e é uma limitação com
   um custo concreto: a cópia de segurança diária levava a proposta e não
   levava o EMAIL que a acompanhou. No dia da reposição, a pergunta «o que é
   que nós lhes escrevemos?» voltava a não ter resposta — e esse é precisamente
   o dia em que ela se faz.

   O caminho é o dos rascunhos do estúdio, passo por passo, porque o problema é
   o mesmo: estas linhas vivem no `app_state`, que é uma tabela PARTILHADA.
   Apagá-la para repor os envios levava à frente os marcadores de operação que
   lá vivem ao lado (o UID até onde a caixa de entrada já avisou, os fechos do
   Meta, o contador de facturas). Por isso só se toca neste espaço de nomes.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Uma chave que a reposição sabe voltar a escrever — e que, por isso, é a
 * mesma que a exportação aceita. Sem esta verificação, uma cópia adulterada
 * escrevia onde quisesse dentro do `app_state`.
 */
export function ehChaveDeEnvios(key: unknown): key is string {
  return (
    typeof key === "string" &&
    key.startsWith(ENVIOS_PREFIX) &&
    key === chaveDosEnvios(key.slice(ENVIOS_PREFIX.length))
  );
}

/**
 * Os envios de um pedido, na forma em que viajam no ficheiro.
 *
 * `key` é a chave INTEIRA do `app_state`, e não só o id do pedido: é o que
 * torna a reposição uma escrita literal, sem uma segunda regra a remontar
 * chaves e a divergir do `chaveDosEnvios` com o tempo.
 */
export interface EnviosNaCopia {
  key: string;
  envios: EnvioDeProposta[];
}

/** A tradução entre a entrada do ficheiro e a linha do `app_state`. */
export const mapper: Mapper<EnviosNaCopia> = {
  table: "app_state",
  fileName: "app-state.json",
  getId: (e) => e.key,
  /** `key text primary key` — ver a mesma linha em `proposal-drafts.ts`, e a
   *  avaria que a sua ausência custou na `biblioteca_fotos`. */
  idColumn: "key",
  toRow: (e) => ({
    key: e.key,
    value: { envios: e.envios } satisfies EnviosDoPedido,
  }),
  fromRow: (row) => {
    const guardado = (row.value ?? {}) as Partial<EnviosDoPedido>;
    const crus = Array.isArray(guardado.envios) ? guardado.envios : [];
    return {
      key: String(row.key ?? ""),
      // A MESMA limpeza da leitura normal: uma entrada estragada não pode
      // deitar abaixo a lista de um pedido, nem numa cópia de segurança.
      envios: crus.map(comoEnvio).filter((e): e is EnvioDeProposta => e !== null),
    };
  },
};

/**
 * Quantas chaves se varrem de uma vez.
 *
 * Há uma chave por pedido a quem alguma vez foi enviada uma proposta, e ela
 * não desaparece. O número a comparar é «quantas propostas se enviaram desde
 * sempre», que só cresce — a mesma conta dos rascunhos, e o mesmo tecto, por
 * isso: 10 000 afasta o problema para lá do horizonte de vida da instalação, e
 * garante que a varredura não MENTE. Se um dia lá chegarem, a cópia declara-se
 * incompleta em vez de deixar envios de fora sem ninguém saber.
 */
export const LIMITE_ENVIOS = 10_000;

/** Quantas escritas em voo de cada vez, na reposição. */
const LOTE_DE_ESCRITAS = 25;

const ERRO_VARREDURA =
  `não foi possível varrer as cópias dos emails enviados (chaves \`${ENVIOS_PREFIX}\` em app_state): ` +
  `ou a leitura falhou — a tabela existe? ver db/schema.sql —, ou há mais de ${LIMITE_ENVIOS} ` +
  `chaves e a varredura ficou truncada. Uma lista incompleta não pode passar por completa numa cópia de segurança.`;

/**
 * As cópias que existem, para a cópia de segurança.
 *
 * LANÇA quando a varredura não se conseguiu fazer INTEIRA — devolver `[]`
 * calado dava um ficheiro com ar de completo e sem os emails lá dentro.
 */
export async function listEnviosDeProposta(): Promise<EnviosNaCopia[]> {
  const { entradas, completa } = await listStateByPrefix<unknown>(ENVIOS_PREFIX, LIMITE_ENVIOS);
  if (!completa) throw new Error(ERRO_VARREDURA);

  const tudo: EnviosNaCopia[] = [];
  for (const { key, value } of entradas) {
    if (!ehChaveDeEnvios(key)) continue;
    if (value == null || typeof value !== "object") continue;
    const doPedido = mapper.fromRow({ key, value });
    // Um pedido cuja lista ficou vazia não tem cópia nenhuma a salvar.
    if (doPedido.envios.length === 0) continue;
    tudo.push(doPedido);
  }
  // Por ordem de chave: duas exportações do mesmo estado têm de se ler igual.
  return tudo.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Escreve as cópias do ficheiro por cima das que existem — SUBSTITUINDO, como
 * todos os outros conjuntos da reposição, e sem tocar no resto do `app_state`.
 *
 * LANÇA se alguma escrita não chegou ao servidor: uma cópia que não ficou
 * gravada tem de sair pelo nome em `failed`, e não passar por reposta.
 */
export async function replaceEnviosDeProposta(tudo: readonly EnviosNaCopia[]): Promise<void> {
  const { entradas, completa } = await listStateByPrefix<unknown>(ENVIOS_PREFIX, LIMITE_ENVIOS);
  if (!completa) throw new Error(ERRO_VARREDURA);

  const doFicheiro = new Map<string, EnviosNaCopia>();
  for (const doPedido of tudo) {
    if (!ehChaveDeEnvios(doPedido.key)) {
      throw new Error(
        `a cópia traz uma chave de envios fora do espaço de nomes ("${String(doPedido.key).slice(0, 60)}") — nada foi escrito neste conjunto.`,
      );
    }
    doFicheiro.set(doPedido.key, doPedido);
  }

  const escritas: { key: string; value: unknown }[] = [
    ...[...doFicheiro.values()].map((e) => ({
      key: e.key,
      value: (mapper.toRow(e) as { value: unknown }).value,
    })),
    // Substituir, não fundir: o que está na base e não está na cópia desaparece.
    ...entradas
      .filter(({ key, value }) => ehChaveDeEnvios(key) && value != null && !doFicheiro.has(key))
      .map(({ key }) => ({ key, value: null })),
  ];

  const falhadas: string[] = [];
  for (let i = 0; i < escritas.length; i += LOTE_DE_ESCRITAS) {
    const lote = escritas.slice(i, i + LOTE_DE_ESCRITAS);
    const resultados = await Promise.all(
      lote.map(async (e) => ({ key: e.key, ...(await setState(e.key, e.value)) })),
    );
    for (const r of resultados) {
      if (!r.gravado) falhadas.push(`${r.key} (${r.motivo ?? "sem motivo"})`);
    }
  }

  if (falhadas.length) {
    throw new Error(
      `${falhadas.length} de ${escritas.length} cópias de email não ficaram gravadas: ${falhadas.slice(0, 5).join("; ")}` +
        (falhadas.length > 5 ? ` e mais ${falhadas.length - 5}.` : "."),
    );
  }
}
