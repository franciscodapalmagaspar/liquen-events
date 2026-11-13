import "server-only";
import { randomUUID } from "node:crypto";
import { log } from "./logger";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, nomeVisivel, readSession } from "./admin-auth";
import { isMissingTable } from "./repository";
import {
  entradasDe,
  guardarNaReciclagem,
  listarReciclagem,
  trocarRetrato,
  obterDaReciclagem,
  tirarDaReciclagem,
  type EntradaDaReciclagem,
} from "./reciclagem-store";
import { deleteTask, listTasks, obterTarefa, reporTarefa } from "./tasks-store";
import { deleteSupplier, obterFornecedor, reporFornecedor } from "./suppliers-store";
import { deleteCalendarEvent, obterEvento, reporEvento } from "./calendar-store";
import { apagarServico, criarServico, obterServico } from "./servicos-catalogo-store";
import { deleteMaterial, getMaterial, reporMaterial } from "./material-store";
import { deleteItem, getItem, reporItem } from "./inventory-store";
import { deleteList, getList, reporList } from "./material-lists-store";
import { listItemsOf, obterLinha, reporLinha } from "./material-list-items-store";
import { deleteRule, listRules, obterRegra, reporRegra } from "./material-rules-store";
import type { CalendarEvent, Supplier, Task } from "./orcamento/types";
import type { ServicoCatalogo } from "./servicos-catalogo-store";
import type { MaterialItem } from "./material-types";
import type { PropItem } from "./inventory-types";
import type { MaterialList, MaterialListItem } from "./material-list-types";
import type { MaterialRule } from "./material-rules";
import type { Proposal, Quote } from "./orcamento/types";
import type { ProposalTheme } from "./theme-types";
import { getQuote, reporPedido } from "./quotes-store";
import {
  deleteProposal,
  getProposal,
  listProposalsForQuote,
  reporProposta,
} from "./proposals-store";
import { apagarPedidoSemContrato, type ResultadoDoApagamento } from "./apagar-pedido";
import { draftKey } from "./proposal-drafts";
import { getState, setState } from "./app-state";
import { getEventMaterial, getForQuote, reporEventMaterial } from "./event-material-store";
import type { EventMaterial, EventMaterialItem } from "./event-material-types";
import { listItemsOfEvent, obterEventItem, reporEventItem } from "./event-material-items-store";
import {
  listLogOf,
  obterDoRegisto,
  reporNoRegisto,
  type EventMaterialLog,
} from "./event-material-log-store";
import { apagarPastaDoPedido } from "./proposal-storage";
import { deleteTheme, getTheme, listThemes, reporTema } from "./themes-store";
import {
  apagarFotoDaBiblioteca,
  apagarPastaDaBiblioteca,
  guardarFotoNaReciclagem,
  salvarAntesDeReciclarOTema,
} from "./theme-materializar";
import {
  caminhoNaReciclagem,
  fotoExisteNoTema,
  largarFotoDaReciclagem,
  themeFolder,
  trazerFotoDaReciclagem,
} from "./theme-storage";
import { isThemePath, themeIdOfPath } from "./theme-ref";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APAGAR VAI PARA A RECICLAGEM, E A RECICLAGEM REPÕE TAL E QUAL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fase R3 de `docs/TUDO-REVERSIVEL.md`. Ela escolheu «Reciclagem 30 dias».
 *
 * Apagar faz três coisas, por esta ordem:
 *   1. o RETRATO — a linha e o que cai com ela (ver «cascatas» abaixo);
 *   2. a entrada na Reciclagem;
 *   3. o apagar de sempre.
 * Se o 3 falhar, a entrada sai — uma coisa na Reciclagem que continua viva
 * seria uma segunda cópia a divergir da primeira.
 *
 * Repor grava as linhas de volta com o MESMO id, e só depois tira a entrada.
 * Antes, confere: se entretanto já existe outra coisa com aquele id, ou se o
 * que ela precisa (a lista de uma regra) já não existe, diz-se — 409 — e não
 * se pisa nada.
 *
 * ── CASCATAS QUE SÓ O SUPABASE FAZ ────────────────────────────────────────
 * Apagar um item de material leva as regras que apontam para ele
 * (`material_rules.item_id … on delete cascade`); apagar uma lista leva as
 * suas regras. Sem as guardar no retrato, «Repor» trazia o item sem as regras
 * — e ninguém daria por isso até à checklist seguinte sair incompleta. No
 * ficheiro local as regras ficam (não há cascata): ao repor, uma linha que já
 * lá está não se escreve duas vezes.
 *
 * ── SEM A TABELA ──────────────────────────────────────────────────────────
 * A tabela nasce de uma migração que ela aprova. Até lá, apagar é o de
 * sempre — definitivo — e devolve `false`, para o ecrã o dizer em vez de
 * prometer uma Reciclagem que não existe.
 */

export const DIAS_NA_RECICLAGEM = 30;

/** Quem apagou — o nome da sessão, como ela o reconhece. Nunca atira: um
 *  «quem» em falta não pode impedir um apagar. */
export function quemApagou(req: NextRequest): string | undefined {
  try {
    const conta = readSession(req.cookies.get(ADMIN_COOKIE)?.value)?.name?.trim();
    return conta ? nomeVisivel(conta) : undefined;
  } catch {
    return undefined;
  }
}
const DIA_MS = 24 * 60 * 60 * 1000;

/** Um retrato: grupos de linhas, na ordem em que se repõem. */
type Retrato = Record<string, unknown[]>;

interface DefinicaoDoTipo {
  /** Como se diz na lista («Tarefa», «Fornecedor»). */
  nome: string;
  /** `entradaId` é o id que a entrada vai ter — a foto de um tema precisa
   *  dele para saber para onde vai (`reciclagem/<entrada>/`). */
  capturar(
    id: string,
    entradaId: string,
  ): Promise<{ rotulo: string; retrato: Retrato; ficheiros?: unknown[] } | null>;
  /**
   * Apaga. Com `entradaId`, a coisa vai para a Reciclagem (e o que tem
   * ficheiros deixa-os guardados); sem ele, a Reciclagem não está ligada e o
   * apagar é o de sempre — definitivo, ficheiros incluídos. O que devolve vai
   * para quem chamou (o pedido devolve o que contou).
   */
  apagar(id: string, entradaId?: string): Promise<unknown>;
  /** Porque é que não pode voltar agora, ou `null` se pode. */
  conflito(retrato: Retrato): Promise<string | null>;
  repor(retrato: Retrato): Promise<void>;
  /**
   * Os ficheiros guardados saem de vez («Apagar de vez», ou os 30 dias).
   * `false` deixa a entrada na Reciclagem, para se tentar outra vez — nunca se
   * perde a última referência a uma pasta que ficou no Storage.
   */
  largar?(entrada: EntradaDaReciclagem): Promise<boolean>;
}

/**
 * Um apagar que não pôde acontecer, com a frase e o estado HTTP que a rota
 * já dava antes da Reciclagem (o 409 do contrato, o 502 das fotos).
 */
export class NaoDeuParaApagar extends Error {
  readonly status: number;
  readonly detalhe?: unknown;
  constructor(mensagem: string, status: number, detalhe?: unknown) {
    super(mensagem);
    this.status = status;
    this.detalhe = detalhe;
  }
}

const primeiro = <T>(r: Retrato, grupo: string): T => (r[grupo] ?? [])[0] as T;
const todos = <T>(r: Retrato, grupo: string): T[] => (r[grupo] ?? []) as T[];

/** Repõe uma linha só se ainda lá não estiver (as cascatas do ficheiro local). */
async function reporSeFaltar<T extends { id: string }>(
  linhas: T[],
  obter: (id: string) => Promise<T | null>,
  repor: (l: T) => Promise<void>,
): Promise<void> {
  for (const l of linhas) {
    if (!(await obter(l.id))) await repor(l);
  }
}

const JA_EXISTE = "Isto já voltou: existe outra vez com o mesmo id, e não se repõe por cima.";

/** Um tipo simples: uma linha, sem cascatas. */
function simples<T extends { id: string }>(o: {
  nome: string;
  rotulo: (e: T) => string;
  obter: (id: string) => Promise<T | null>;
  apagar: (id: string) => Promise<void>;
  repor: (e: T) => Promise<void>;
}): DefinicaoDoTipo {
  return {
    nome: o.nome,
    async capturar(id) {
      const e = await o.obter(id);
      return e ? { rotulo: o.rotulo(e) || o.nome, retrato: { principal: [e] } } : null;
    },
    apagar: (id) => o.apagar(id),
    async conflito(r) {
      const e = primeiro<T>(r, "principal");
      return e && (await o.obter(e.id)) ? JA_EXISTE : null;
    },
    async repor(r) {
      await o.repor(primeiro<T>(r, "principal"));
    },
  };
}

export const TIPOS = {
  tarefa: simples<Task>({
    nome: "Tarefa",
    rotulo: (t) => t.title,
    obter: obterTarefa,
    apagar: deleteTask,
    repor: reporTarefa,
  }),
  evento: simples<CalendarEvent>({
    nome: "Marcação do calendário",
    rotulo: (e) => e.title,
    obter: obterEvento,
    apagar: deleteCalendarEvent,
    repor: reporEvento,
  }),
  fornecedor: simples<Supplier>({
    nome: "Fornecedor",
    rotulo: (s) => s.name,
    obter: obterFornecedor,
    apagar: deleteSupplier,
    repor: reporFornecedor,
  }),
  servico: simples<ServicoCatalogo>({
    nome: "Serviço da biblioteca",
    rotulo: (s) => s.nome,
    obter: obterServico,
    apagar: apagarServico,
    repor: criarServico,
  }),
  inventario: simples<PropItem>({
    nome: "Item do inventário",
    rotulo: (i) => i.name,
    obter: getItem,
    apagar: deleteItem,
    repor: reporItem,
  }),
  regra: simples<MaterialRule>({
    nome: "Regra de material",
    rotulo: (r) => r.name,
    obter: obterRegra,
    apagar: deleteRule,
    repor: reporRegra,
  }),

  /** O item e as regras que apontam para ele (cascata no Supabase). */
  material: {
    nome: "Item do catálogo de material",
    async capturar(id) {
      const item = await getMaterial(id);
      if (!item) return null;
      const regras = (await listRules()).filter((r) => r.itemId === id);
      return { rotulo: item.name, retrato: { principal: [item], regras } };
    },
    apagar: deleteMaterial,
    async conflito(r) {
      const item = primeiro<MaterialItem>(r, "principal");
      return item && (await getMaterial(item.id)) ? JA_EXISTE : null;
    },
    async repor(r) {
      await reporMaterial(primeiro<MaterialItem>(r, "principal"));
      await reporSeFaltar(todos<MaterialRule>(r, "regras"), obterRegra, reporRegra);
    },
  },

  /** A lista, as suas linhas e as regras que a acrescentam. */
  lista: {
    nome: "Lista de material",
    async capturar(id) {
      const lista = await getList(id);
      if (!lista) return null;
      const [linhas, regras] = await Promise.all([
        listItemsOf(id),
        listRules().then((rs) => rs.filter((r) => r.listId === id)),
      ]);
      return { rotulo: lista.name, retrato: { principal: [lista], linhas, regras } };
    },
    apagar: deleteList,
    async conflito(r) {
      const lista = primeiro<MaterialList>(r, "principal");
      if (!lista) return null;
      if (await getList(lista.id)) return JA_EXISTE;
      // Uma linha aponta para um item do catálogo. Se esse item foi apagado
      // entretanto, repor a linha deixava-a a apontar para nada.
      for (const l of todos<MaterialListItem>(r, "linhas")) {
        if (!(await getMaterial(l.itemId))) {
          return "Um dos itens desta lista já não está no catálogo. Repõe-no primeiro (também está na Reciclagem, se foi apagado há menos de 30 dias).";
        }
      }
      return null;
    },
    async repor(r) {
      await reporList(primeiro<MaterialList>(r, "principal"));
      await reporSeFaltar(todos<MaterialListItem>(r, "linhas"), obterLinha, reporLinha);
      await reporSeFaltar(todos<MaterialRule>(r, "regras"), obterRegra, reporRegra);
    },
  },

  /**
   * O pedido e tudo o que é dele: as propostas, os rascunhos do estúdio e o
   * material do evento (que no Supabase cai em cascata). A pasta das
   * fotografias fica no Storage enquanto ele estiver na Reciclagem — ninguém a
   * mostra sem o pedido — e só sai quando a entrada sai de vez.
   */
  pedido: {
    nome: "Pedido",
    async capturar(id) {
      const q = await getQuote(id);
      if (!q) return null;
      const [propostas, rascunhos, material, tarefas] = await Promise.all([
        listProposalsForQuote(id),
        rascunhosDoPedido(id),
        getForQuote(id),
        // As tarefas saem com o pedido (`apagarPedidoSemContrato`) e voltam
        // com ele (auditoria de 12/11, n.º 7).
        listTasks().then((ts) => ts.filter((t) => (t.quoteId ?? "").trim() === id)),
      ]);
      const [itens, registo] = material
        ? await Promise.all([listItemsOfEvent(material.id), listLogOf(material.id)])
        : [[], []];
      return {
        rotulo: nomeDoPedido(q) || "Pedido sem nome",
        retrato: {
          principal: [q],
          propostas,
          rascunhos,
          material: material ? [material] : [],
          itens,
          registo,
          tarefas,
        },
      };
    },
    async apagar(id, entradaId) {
      const r = await apagarPedidoSemContrato(id, { fotos: !entradaId });
      if (!r.apagado) throw new NaoDeuParaApagar(fraseDoPedido(r), estadoDoPedido(r), r);
      return r;
    },
    async conflito(r) {
      const q = primeiro<Quote>(r, "principal");
      // O pedido está vivo. Uma entrada normal já voltou de vez. A de um
      // apagar que parou a meio (`parcial`) guarda SÓ o que saiu — propostas,
      // tarefas, rascunhos —, e repõe-se o que disso ainda falta (revisão de
      // 13/11). Nunca o retrato inteiro por cima de um pedido vivo.
      if (q && (await getQuote(q.id))) {
        if (!eParcial(r)) return JA_EXISTE;
        return (await faltaAlgoDoQueSaiu(r)) ? null : JA_EXISTE;
      }
      for (const p of todos<Proposal>(r, "propostas")) {
        if (await getProposal(p.id)) {
          return "Uma das propostas deste pedido já existe outra vez. Nada foi reposto.";
        }
      }
      return null;
    },
    async repor(r) {
      const q = primeiro<Quote>(r, "principal");
      // Com o pedido vivo (só numa entrada `parcial` — ver o `conflito`), o
      // retrato tem só o que saiu, e repõe-se o que disso falta.
      const vivo = !!(await getQuote(q.id));
      if (!vivo) await reporPedido(q);
      await reporSeFaltar(todos<Proposal>(r, "propostas"), getProposal, reporProposta);
      const rascunhos = todos<{ chave: string; valor: unknown }>(r, "rascunhos");
      // Com o pedido vivo, um rascunho só volta se ela não enviou nada desde o
      // apagar: enviar limpa o rascunho, e repor o antigo era pôr trabalho
      // velho por cima do que seguiu.
      const podeRascunhos = !vivo || !(await enviouDepois(q.id, apagadoEmDe(r)));
      for (const { chave, valor } of podeRascunhos ? rascunhos : []) {
        // Um rascunho que entretanto nasceu de novo é trabalho de agora: fica.
        // Lido para decidir se se grava: uma leitura falhada lança — nunca
        // escreve por cima de um rascunho que não se conseguiu ver.
        if ((await getState(draftKey(chave), { ouFalha: true })) == null)
          await setState(draftKey(chave), valor);
      }
      await reporSeFaltar(
        todos<EventMaterial>(r, "material"),
        getEventMaterial,
        reporEventMaterial,
      );
      await reporSeFaltar(todos<EventMaterialItem>(r, "itens"), obterEventItem, reporEventItem);
      await reporSeFaltar(todos<EventMaterialLog>(r, "registo"), obterDoRegisto, reporNoRegisto);
      // Um retrato de antes desta mudança não tem `tarefas`: `todos` dá [].
      await reporSeFaltar(todos<Task>(r, "tarefas"), obterTarefa, reporTarefa);
    },
    async largar(e) {
      // Se voltou (com o mesmo id), a pasta é dele outra vez.
      if (await getQuote(e.origemId)) return true;
      // Outra entrada do MESMO pedido ainda promete um «Repor»: a pasta é dela
      // (revisão de 13/11, n.º 2).
      const outras = (await entradasDe(e.origemId)).filter(
        (o) => o.id !== e.id && o.tipo === "pedido",
      );
      if (outras.length > 0) return true;
      return apagarPastaDoPedido(e.origemId);
    },
  },

  /** Uma proposta sozinha. Volta para o pedido de onde saiu. */
  proposta: {
    nome: "Proposta",
    async capturar(id) {
      const p = await getProposal(id);
      if (!p) return null;
      const quem = (p.clientName ?? "").trim();
      return { rotulo: quem ? `Proposta de ${quem}` : "Proposta", retrato: { principal: [p] } };
    },
    apagar: (id) => deleteProposal(id),
    async conflito(r) {
      const p = primeiro<Proposal>(r, "principal");
      if (!p) return null;
      if (await getProposal(p.id)) return JA_EXISTE;
      if (p.quoteId && !(await getQuote(p.quoteId))) {
        return "O pedido desta proposta já não existe. Repõe primeiro o pedido (está na Reciclagem, se foi apagado há menos de 30 dias).";
      }
      return null;
    },
    async repor(r) {
      await reporProposta(primeiro<Proposal>(r, "principal"));
    },
  },

  /**
   * Um tema. Antes de sair, as propostas que usam fotos dele ficam com a sua
   * cópia (como sempre ficaram); as fotos ficam na pasta, que só sai de vez
   * com a entrada. Repor devolve a linha — e as fotos estão onde estavam.
   */
  tema: {
    nome: "Tema",
    async capturar(id) {
      const t = await getTheme(id);
      return t ? { rotulo: t.name || "Tema sem nome", retrato: { principal: [t] } } : null;
    },
    async apagar(id, entradaId) {
      if (entradaId) {
        if (!(await salvarAntesDeReciclarOTema(id)))
          throw new NaoDeuParaApagar(TEMA_REFERENCIAS, 502);
      } else {
        const limpo = await apagarPastaDaBiblioteca(id);
        if (!limpo.ok) {
          throw new NaoDeuParaApagar(
            limpo.motivo === "referencias" ? TEMA_REFERENCIAS : TEMA_FOTOS,
            502,
          );
        }
      }
      await deleteTheme(id);
    },
    async conflito(r) {
      const t = primeiro<ProposalTheme>(r, "principal");
      if (!t) return null;
      if (await getTheme(t.id)) return JA_EXISTE;
      const nome = (t.name ?? "").trim().toLowerCase();
      const outro = (await listThemes()).find((o) => (o.name ?? "").trim().toLowerCase() === nome);
      return outro
        ? `Já há outro tema chamado «${outro.name}». Muda-lhe o nome e tenta de novo.`
        : null;
    },
    async repor(r) {
      await reporTema(primeiro<ProposalTheme>(r, "principal"));
    },
    async largar(e) {
      if (await getTheme(e.origemId)) return true;
      return (await apagarPastaDaBiblioteca(e.origemId)).ok;
    },
  },

  /**
   * Uma fotografia de um tema que continua. A pasta é a fonte da verdade do
   * que o tema mostra, por isso a foto TEM de sair dela: vai para
   * `reciclagem/<entrada>/` no mesmo bucket, e volta ao mesmo caminho.
   */
  "foto-de-tema": {
    nome: "Fotografia de tema",
    async capturar(path, entradaId) {
      if (!isThemePath(path)) return null;
      const destino = caminhoNaReciclagem(path, entradaId);
      if (!destino) return null;
      const tema = await getTheme(themeIdOfPath(path));
      const foto: FotoNaReciclagem = { path, temaId: themeIdOfPath(path), naReciclagem: destino };
      return {
        rotulo: tema?.name ? `Fotografia de «${tema.name}»` : "Fotografia de um tema",
        retrato: { principal: [foto] },
        ficheiros: [{ de: path, para: destino }],
      };
    },
    async apagar(path, entradaId) {
      const destino = entradaId ? caminhoNaReciclagem(path, entradaId) : null;
      const r = destino
        ? await guardarFotoNaReciclagem(path, destino)
        : await apagarFotoDaBiblioteca(path);
      if (!r.ok) {
        throw new NaoDeuParaApagar(
          r.motivo === "referencias" ? FOTO_REFERENCIAS : "Falha ao remover a imagem.",
          502,
        );
      }
    },
    async conflito(r) {
      const f = primeiro<FotoNaReciclagem>(r, "principal");
      if (!f) return null;
      if (!(await getTheme(f.temaId))) {
        return "O tema desta fotografia já não existe. Repõe primeiro o tema (está na Reciclagem, se foi eliminado há menos de 30 dias).";
      }
      if (await fotoExisteNoTema(f.path)) return "Esta fotografia já voltou a estar no tema.";
      return null;
    },
    async repor(r) {
      const f = primeiro<FotoNaReciclagem>(r, "principal");
      const como = await trazerFotoDaReciclagem(f.path, f.naReciclagem);
      if (como === "existe") throw new NaoDaParaRepor("Esta fotografia já voltou a estar no tema.");
      if (como === "falhou") throw new Error("O armazenamento não devolveu a fotografia.");
    },
    async largar(e) {
      const f = primeiro<FotoNaReciclagem>(e.retrato as Retrato, "principal");
      return f ? largarFotoDaReciclagem(f.path, f.naReciclagem) : true;
    },
  },
} satisfies Record<string, DefinicaoDoTipo>;

interface FotoNaReciclagem {
  path: string;
  temaId: string;
  /** Onde a foto espera: `reciclagem/<entrada>/<ficheiro>`. */
  naReciclagem: string;
}

const TEMA_REFERENCIAS =
  "Há propostas que usam fotos deste tema e não foi possível guardar lá uma cópia. O tema NÃO foi eliminado — tenta de novo.";
const TEMA_FOTOS =
  "Não foi possível apagar as fotos do tema. O tema não foi eliminado — tenta de novo.";
const FOTO_REFERENCIAS =
  "Esta foto é usada por uma proposta e não foi possível guardar lá uma cópia. A foto NÃO foi removida — tenta de novo.";

/** As quatro chaves do rascunho que o `apagarPedidoSemContrato` limpa. */
const chavesDoRascunho = (id: string) => [
  id,
  `${id}--orcamento-linhas`,
  `${id}--sobreposto`,
  `${id}--orcamento-linhas--sobreposto`,
];

async function rascunhosDoPedido(id: string): Promise<{ chave: string; valor: unknown }[]> {
  const out: { chave: string; valor: unknown }[] = [];
  for (const chave of chavesDoRascunho(id)) {
    const valor = await getState<unknown>(draftKey(chave));
    if (valor != null) out.push({ chave, valor });
  }
  return out;
}

/** Os noivos, ou quem escreveu (o mesmo de `pastas-com-nome.ts`). */
function nomeDoPedido(q: Quote): string {
  const noivos = [q.partnerA, q.partnerB].map((n) => (n ?? "").trim()).filter(Boolean);
  if (noivos.length === 2) return `${noivos[0]} e ${noivos[1]}`;
  if (noivos.length === 1) return noivos[0];
  return (q.name ?? "").trim();
}

/** As frases e os estados que a rota do pedido já dava. */
function fraseDoPedido(r: ResultadoDoApagamento): string {
  if (r.motivo === "nao-existe") return "Não encontrado";
  if (r.motivo === "tem-contrato") {
    return "Este pedido deu origem a contrato, e um contrato é um registo fiscal que tem de ser conservado. Nada foi apagado.";
  }
  return "Não consegui apagar este pedido.";
}
const estadoDoPedido = (r: ResultadoDoApagamento) =>
  r.motivo === "nao-existe" ? 404 : r.motivo === "tem-contrato" ? 409 : 500;

export type TipoNaReciclagem = keyof typeof TIPOS;

export const eTipo = (t: string): t is TipoNaReciclagem => t in TIPOS;

/**
 * O que a rota de apagar devolve:
 *  · `{ id }` — está na Reciclagem, com esta entrada;
 *  · `false` — apagado de vez (a Reciclagem ainda não está ligada);
 *  · `null` — já não existia nada com aquele id.
 */
export type ResultadoDeApagar = { id: string } | false | null;

/**
 * Apaga, passando pela Reciclagem.
 *
 * Devolve `null` quando não há nada com aquele id (a rota responde como
 * sempre respondeu a um apagar de algo que já não existe: `ok`).
 */
export async function enviarParaAReciclagem(
  tipo: TipoNaReciclagem,
  id: string,
  quem?: string,
): Promise<ResultadoDeApagar> {
  return (await enviarComDetalhe(tipo, id, quem)).reciclagem;
}

/**
 * O mesmo, mais o que o apagar devolveu — o pedido conta o que apagou, e a
 * rota continua a dizê-lo. Lança `NaoDeuParaApagar` quando o apagar recusa
 * (e então nada fica na Reciclagem).
 */
export async function enviarComDetalhe(
  tipo: TipoNaReciclagem,
  id: string,
  quem?: string,
): Promise<{ reciclagem: ResultadoDeApagar; detalhe?: unknown }> {
  const def: DefinicaoDoTipo = TIPOS[tipo];
  const entradaId = randomUUID();
  const capturado = await def.capturar(id, entradaId);
  if (!capturado) return { reciclagem: null, detalhe: await def.apagar(id) };
  /**
   * Uma segunda tentativa de apagar o MESMO pedido, depois de uma que parou a
   * meio: a entrada antiga guarda o que já saiu (e que já não se consegue
   * capturar). Junta-se tudo numa entrada só, e a antiga sai quando a nova
   * fica — nunca antes (revisão de 13/11, n.º 2).
   */
  const anteriores =
    tipo === "pedido"
      ? (await entradasDe(id).catch(() => [] as EntradaDaReciclagem[])).filter(
          (e) => e.tipo === "pedido",
        )
      : [];
  const retratoNovo = capturado.retrato as Retrato;
  if (anteriores.length > 0) {
    capturado.retrato = juntarRetratos(
      capturado.retrato,
      anteriores.map((e) => e.retrato as Retrato),
    );
  }
  const largarAnteriores = async () => {
    for (const e of anteriores) await tirarDaReciclagem(e.id).catch(() => {});
  };
  const entrada: EntradaDaReciclagem = {
    id: entradaId,
    tipo,
    rotulo: capturado.rotulo,
    origemId: id,
    apagadoEm: new Date().toISOString(),
    apagadoPor: quem,
    retrato: capturado.retrato,
    ficheiros: capturado.ficheiros ?? [],
  };
  try {
    await guardarNaReciclagem(entrada);
  } catch (err) {
    // A migração ainda não correu: apaga-se como sempre, e diz-se.
    if (isMissingTable(err)) return { reciclagem: false, detalhe: await def.apagar(id) };
    throw err;
  }
  try {
    const detalhe = await def.apagar(id, entrada.id);
    await largarAnteriores();
    return { reciclagem: { id: entrada.id }, detalhe };
  } catch (err) {
    // Se o apagar parou A MEIO (o pedido saiu em parte: propostas, rascunhos,
    // tarefas), a entrada é a ÚNICA cópia do que já saiu — fica na Reciclagem.
    // Só se tira quando nada saiu (auditoria de 13/11, «dados que se perdem»).
    // Só um apagar que FALHOU a meio (sem `motivo`): uma recusa — o contrato,
    // um pedido que já não existe — não apagou nada, e as entradas que havia
    // ficam como estavam.
    const parouAMeio =
      err instanceof NaoDeuParaApagar &&
      !(err.detalhe as { motivo?: unknown } | undefined)?.motivo &&
      (saiuAlgo(err.detalhe) || anteriores.length > 0);
    if (parouAMeio && tipo === "pedido") {
      // A entrada fica — mas só com o que saiu (desta vez e das anteriores).
      const saiu = (err.detalhe as { saiu?: Parameters<typeof soOQueSaiu>[1] }).saiu ?? {
        propostas: [],
        tarefas: [],
        rascunhos: [],
      };
      const reduzido = juntarRetratos(
        soOQueSaiu(retratoNovo, saiu, entrada.apagadoEm),
        anteriores.map((e) => e.retrato as Retrato),
      );
      reduzido.parcial = [{ apagadoEm: entrada.apagadoEm }];
      // Se não se conseguir trocar, fica o retrato inteiro: o «Repor» com o
      // pedido vivo recusa-o (não é `parcial`), e o que saiu continua guardado.
      await trocarRetrato(entrada.id, reduzido).catch((e) =>
        log.error("reciclagem: não deu para reduzir a entrada parcial", e, { id: entrada.id }),
      );
    }
    if (parouAMeio && err instanceof NaoDeuParaApagar) {
      await largarAnteriores();
      throw new NaoDeuParaApagar(
        "O pedido não foi apagado por completo. O que já saiu está guardado na Reciclagem — tenta de novo.",
        err.status,
        err.detalhe,
      );
    }
    await tirarDaReciclagem(entrada.id).catch(() => {});
    throw err;
  }
}

/** A entrada é a de um apagar de pedido que parou a meio? */
const eParcial = (r: Retrato): boolean => (r.parcial ?? []).length > 0;
const apagadoEmDe = (r: Retrato): string =>
  String((primeiro<{ apagadoEm?: string }>(r, "parcial") ?? {}).apagadoEm ?? "");

/** Saiu alguma proposta do pedido criada DEPOIS de `desde` (um envio novo)? */
async function enviouDepois(quoteId: string, desde: string): Promise<boolean> {
  const t = Date.parse(desde);
  if (Number.isNaN(t)) return true; // sem data, o lado seguro: não repor rascunhos
  const propostas = await listProposalsForQuote(quoteId);
  return propostas.some((p) => Date.parse(p.createdAt ?? "") > t);
}

/** Do que um apagar parcial levou, alguma coisa ainda não voltou? */
async function faltaAlgoDoQueSaiu(r: Retrato): Promise<boolean> {
  for (const p of todos<{ id: string }>(r, "propostas"))
    if (!(await getProposal(p.id))) return true;
  for (const t of todos<{ id: string }>(r, "tarefas")) if (!(await obterTarefa(t.id))) return true;
  const q = primeiro<Quote>(r, "principal");
  if (q && !(await enviouDepois(q.id, apagadoEmDe(r)))) {
    for (const { chave } of todos<{ chave: string }>(r, "rascunhos")) {
      if ((await getState(draftKey(chave))) == null) return true;
    }
  }
  return false;
}

/**
 * O retrato de um apagar que parou a meio: o pedido (para o rótulo e o
 * «Repor» de depois), e só as linhas que SAÍRAM. O material, os itens e o
 * registo nunca saem num apagar parcial (caem em cascata com o pedido), e um
 * retrato com eles repunha-os a dobrar por cima do pedido vivo.
 */
function soOQueSaiu(
  r: Retrato,
  saiu: { propostas: string[]; tarefas: string[]; rascunhos: string[] },
  apagadoEm: string,
): Retrato {
  const ids = (l: unknown) => String((l as { id?: unknown })?.id ?? "");
  return {
    principal: r.principal ?? [],
    propostas: todos<unknown>(r, "propostas").filter((p) => saiu.propostas.includes(ids(p))),
    tarefas: todos<unknown>(r, "tarefas").filter((t) => saiu.tarefas.includes(ids(t))),
    rascunhos: todos<{ chave: string }>(r, "rascunhos").filter((x) =>
      saiu.rascunhos.includes(x.chave),
    ),
    parcial: [{ apagadoEm }],
  };
}

/**
 * Junta os retratos de entradas do MESMO pedido: o que saiu numa tentativa que
 * parou a meio não está no retrato da tentativa seguinte (já não existia para
 * ser capturado). O retrato novo manda; do antigo entra o que falta, por `id`
 * (ou `chave`, nos rascunhos).
 */
function juntarRetratos(novo: Retrato, antigos: Retrato[]): Retrato {
  const out: Retrato = { ...novo };
  const chaveDe = (l: unknown): string | null => {
    const o = l as { id?: unknown; chave?: unknown } | null;
    if (o && typeof o.id === "string") return `id:${o.id}`;
    if (o && typeof o.chave === "string") return `chave:${o.chave}`;
    return null;
  };
  for (const antigo of antigos) {
    for (const [grupo, linhas] of Object.entries(antigo)) {
      if (grupo === "principal" && (out.principal ?? []).length > 0) continue;
      // A marca de parcial decide-a quem junta, não se herda.
      if (grupo === "parcial") continue;
      const atuais = [...(out[grupo] ?? [])];
      const vistas = new Set(atuais.map(chaveDe).filter(Boolean));
      for (const l of linhas ?? []) {
        const k = chaveDe(l);
        if (k && vistas.has(k)) continue;
        atuais.push(l);
        if (k) vistas.add(k);
      }
      out[grupo] = atuais;
    }
  }
  return out;
}

/** O apagar devolveu uma contagem com alguma coisa já apagada? */
function saiuAlgo(detalhe: unknown): boolean {
  const contou = (detalhe as { contou?: Record<string, unknown> } | undefined)?.contou;
  if (!contou || typeof contou !== "object") return false;
  return Object.values(contou).some((n) => typeof n === "number" && n > 0);
}

/** O porquê de um «Repor» não poder acontecer — a rota responde 409. */
export class NaoDaParaRepor extends Error {
  readonly status: 404 | 409;
  constructor(mensagem: string, status: 404 | 409 = 409) {
    super(mensagem);
    this.status = status;
  }
}

/** Repõe tal e qual, com o mesmo id, e tira a entrada da Reciclagem. */
export async function reporDaReciclagem(entradaId: string): Promise<EntradaDaReciclagem> {
  const entrada = await obterDaReciclagem(entradaId);
  if (!entrada) throw new NaoDaParaRepor("Isto já não está na Reciclagem.", 404);
  if (!eTipo(entrada.tipo)) {
    throw new NaoDaParaRepor(`Não se sabe repor «${entrada.tipo}».`);
  }
  const def: DefinicaoDoTipo = TIPOS[entrada.tipo];
  const retrato = entrada.retrato as Retrato;
  const porque = await def.conflito(retrato);
  if (porque) throw new NaoDaParaRepor(porque);
  await def.repor(retrato);
  await tirarDaReciclagem(entrada.id);
  return entrada;
}

/** Os ficheiros que a entrada guarda saem de vez. `true` se não ficou nada. */
async function largarFicheiros(entrada: EntradaDaReciclagem): Promise<boolean> {
  if (!eTipo(entrada.tipo)) return true;
  const def: DefinicaoDoTipo = TIPOS[entrada.tipo];
  try {
    return def.largar ? await def.largar(entrada) : true;
  } catch {
    return false;
  }
}

/**
 * «Apagar de vez»: a entrada sai, e com ela a última cópia (e os ficheiros
 * que guardava). Se os ficheiros não saírem, a entrada FICA — e diz-se.
 */
export async function apagarDeVez(entradaId: string): Promise<boolean> {
  const entrada = await obterDaReciclagem(entradaId);
  if (!entrada) return false;
  if (!(await largarFicheiros(entrada))) {
    throw new NaoDeuParaApagar(
      "As fotografias guardadas não saíram do armazenamento. Continua na Reciclagem — tenta de novo.",
      502,
    );
  }
  await tirarDaReciclagem(entradaId);
  return true;
}

/**
 * As pastas da Biblioteca cujo tema está na Reciclagem. A pasta fica no
 * Storage, e a Biblioteca (que lista pela `biblioteca_fotos`) mostrava-a outra
 * vez se não a escondesse. Sem a tabela não há nada a esconder.
 */
export async function pastasDeTemasNaReciclagem(): Promise<Set<string>> {
  try {
    const todas = await listarReciclagem();
    return new Set(todas.filter((e) => e.tipo === "tema").map((e) => themeFolder(e.origemId)));
  } catch (err) {
    if (isMissingTable(err)) return new Set();
    throw err;
  }
}

/** Quando sai sozinha da Reciclagem. */
export function saiEm(entrada: Pick<EntradaDaReciclagem, "apagadoEm">): Date {
  return new Date(new Date(entrada.apagadoEm).getTime() + DIAS_NA_RECICLAGEM * DIA_MS);
}

/** A lista para o ecrã, com o nome do tipo e o dia em que sai. */
export async function oQueEstaNaReciclagem(): Promise<
  (Omit<EntradaDaReciclagem, "retrato" | "ficheiros"> & { tipoNome: string; saiEm: string })[]
> {
  const todas = await listarReciclagem();
  return todas.map(({ retrato: _r, ficheiros: _f, ...e }) => {
    void _r;
    void _f;
    return {
      ...e,
      tipoNome: eTipo(e.tipo) ? TIPOS[e.tipo].nome : e.tipo,
      saiEm: saiEm(e).toISOString(),
    };
  });
}

/**
 * A limpeza dos 30 dias. Corre dentro de `/api/cron/backup`, DEPOIS da cópia
 * de segurança do dia — nada sai da Reciclagem sem ter passado por ela.
 * Em lotes, para caber no tempo da função.
 */
export async function limparExpiradas(
  agora: Date = new Date(),
  lote = 50,
  /** Uma pasta grande demora: o que não couber neste tempo fica para amanhã. */
  tectoMs = 40_000,
): Promise<{ apagadas: number; ficaram: number }> {
  const comeco = Date.now();
  const todas = await listarReciclagem();
  const expiradas = todas.filter((e) => saiEm(e).getTime() <= agora.getTime()).slice(0, lote);
  let apagadas = 0;
  let ficaram = 0;
  for (const e of expiradas) {
    if (Date.now() - comeco > tectoMs) break;
    // Os ficheiros primeiro: se não saírem, a entrada fica (e com ela a
    // única lembrança de que há uma pasta para apagar).
    if (await largarFicheiros(e)) {
      await tirarDaReciclagem(e.id);
      apagadas++;
    } else {
      ficaram++;
    }
  }
  return { apagadas, ficaram };
}
