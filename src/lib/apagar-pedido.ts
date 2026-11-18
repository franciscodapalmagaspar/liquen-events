import "server-only";
import { getQuote, deleteQuote } from "./quotes-store";
import { listProposalsForQuote, deleteProposal } from "./proposals-store";
import {
  ligacoesDoPedido,
  oQueFicouDasPropostas,
  propostasQueSairamSemResposta,
  oQueAindaPrende,
  registoFiscalDoPedido,
} from "./o-que-prende-o-pedido";
import { clearProposalDraft, draftKey } from "./proposal-drafts";
import { chavesDoRascunhoDoPedido } from "./chaves-do-rascunho";
import { getState } from "./app-state";
import { listProposalImages, removeStoredObject, PROPOSAL_BUCKET } from "./proposal-storage";
import { listTasksForQuote, deleteTask } from "./tasks-store";
import { log } from "@/lib/logger";
import { lerOuNull, umAUm } from "./apagar-um-a-um";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * APAGAR UM PEDIDO A SÉRIO — a promessa que estava publicada e não se cumpria
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A política de privacidade do sítio diz: «Pedidos que não deem origem a
 * contrato são eliminados no prazo máximo de 12 meses após o último contacto.»
 *
 * O apagamento que existia tirava a linha do pedido e mais nada. As PROPOSTAS
 * ficavam — com o nome do casal, o email e o documento inteiro — porque a
 * chave estrangeira é `on delete set null`; as fotografias ficavam no bucket,
 * e o rascunho do estúdio no `app_state`. Uma linha apagada e os dados todos
 * no sítio não é um apagamento: é a aparência de um.
 *
 * ── O QUE FICA ────────────────────────────────────────────────────────────
 *
 * CONTRATOS E FATURAS NÃO SE APAGAM: são registos fiscais, e conservam-se
 * anos. Um pedido com contrato ou fatura (também a do Moloni, e o rasto de
 * uma a ser criada) **não é apagado**, e a resposta di-lo pelo nome. As guardas
 * vivem em `o-que-prende-o-pedido.ts`.
 *
 * ── PORQUE É QUE CONTA O QUE APAGOU ───────────────────────────────────────
 *
 * Um apagamento silencioso é indistinguível de um que não aconteceu. A
 * resposta traz o que saiu e, sobretudo, o que NÃO saiu — e o que TALVEZ
 * tenha saído, para a Reciclagem lhe guardar a cópia.
 *
 * ── A ORDEM IMPORTA ───────────────────────────────────────────────────────
 *
 *  1. o registo fiscal recusa antes de qualquer coisa sair;
 *  2. as TAREFAS primeiro: a base apaga-as em cascata com o pedido (P5), e
 *     uma que ficasse para trás cairia sem relatório nem Reciclagem;
 *  3. as PROPOSTAS, confirmadas antes de as fotografias saírem: uma que ficou
 *     faz parar com tudo o resto inteiro;
 *  4. as fotografias e 5. os rascunhos;
 *  6. outra vez tudo o que prende o pedido (pode ter nascido noutro ecrã);
 *  7. e o PEDIDO, por último: enquanto ele existir, uma segunda tentativa sabe
 *     o que ainda falta.
 */

/** O que uma passagem de apagamento levou, e o que não conseguiu levar. */
export interface ResultadoDoApagamento {
  apagado: boolean;
  /**
   * Só quando `apagado` é falso e NADA saiu. `nao-verificado`: não se conseguiu
   * ler os contratos ou as faturas — não se apaga nada, e o ecrã diz a frase
   * genérica (não afirma um contrato que pode não existir).
   */
  motivo?: "tem-contrato" | "tem-fatura" | "nao-verificado" | "nao-existe";
  contou: Contagem;
  /** O que ficou para trás, em linguagem de quem vai ler o registo. */
  falhou: string[];
  /**
   * O que SAIU, pelo id (as chaves, nos rascunhos). Um apagar que pára a meio
   * deixa na Reciclagem só isto — e não o retrato inteiro, que repunha por
   * cima do pedido vivo o que nunca tinha saído (revisão de 13/11).
   */
  saiu: OQueSaiu;
  /**
   * Propostas cujo apagar falhou e que não se conseguiu confirmar (a resposta
   * pode ter-se perdido com a proposta já apagada). A Reciclagem guarda-lhes a
   * cópia como se tivessem saído — o «Repor» só repõe o que FALTA, por isso
   * uma que ficou viva não é pisada (revisão de 18/11, R1).
   */
  talvezSaiu: { propostas: string[] };
}

interface Contagem {
  propostas: number;
  fotos: number;
  /** Os rascunhos do estúdio que existiam. */
  rascunhos: number;
  /** As tarefas ligadas ao pedido (guardam o nome do casal). */
  tarefas: number;
}
interface OQueSaiu {
  propostas: string[];
  tarefas: string[];
  rascunhos: string[];
}

/** O que um passo fez. `parar`: o pedido fica, e nada mais sai. */
interface Passo {
  contou?: Partial<Contagem>;
  saiu?: Partial<OQueSaiu>;
  talvezSaiu?: string[];
  falhou?: string[];
  parar?: boolean;
}

/**
 * Apaga um pedido e tudo o que é dele, quando ele não deu origem a registo
 * fiscal. Nunca lança: devolve sempre o que conseguiu e o que não.
 */
export async function apagarPedido(
  pedidoId: string,
  /**
   * `fotos: false` deixa a pasta do pedido no Storage: é o que a Reciclagem
   * pede (`src/lib/reciclagem.ts`), que só a apaga quando a entrada sai de vez.
   */
  opcoes: { fotos?: boolean } = {},
): Promise<ResultadoDoApagamento> {
  const id = String(pedidoId ?? "").trim();
  const pedido = id ? await getQuote(id) : null;
  if (!pedido) return { apagado: false, motivo: "nao-existe", ...nadaAinda() };

  const recusa = await recusaFiscal(pedido);
  if (recusa) return recusa;

  const feito = nadaAinda();
  const passos: (() => Promise<Passo>)[] = [
    () => apagarTarefas(id),
    () => apagarPropostas(id),
    () => (opcoes.fotos === false ? Promise.resolve({}) : apagarFotos(id)),
    () => apagarRascunhos(id),
    () => confirmarQueNadaPrende(id),
    () => apagarOPedido(id),
  ];
  for (const passo of passos) {
    if (juntar(feito, await passo()).parar) return { apagado: false, ...feito };
  }

  log.info("pedido apagado por completo", {
    pedido: id,
    ...feito.contou,
    ficou_por_apagar: feito.falhou.length,
  });
  return { apagado: true, ...feito };
}

// ── O que se vai juntando ──────────────────────────────────────────────────

type Feito = Omit<ResultadoDoApagamento, "apagado" | "motivo">;

const nadaAinda = (): Feito => ({
  contou: { propostas: 0, fotos: 0, rascunhos: 0, tarefas: 0 },
  falhou: [],
  saiu: { propostas: [], tarefas: [], rascunhos: [] },
  talvezSaiu: { propostas: [] },
});

function juntar(feito: Feito, passo: Passo): Passo {
  for (const k of Object.keys(passo.contou ?? {}) as (keyof Contagem)[]) {
    feito.contou[k] += passo.contou?.[k] ?? 0;
  }
  for (const k of Object.keys(passo.saiu ?? {}) as (keyof OQueSaiu)[]) {
    feito.saiu[k].push(...(passo.saiu?.[k] ?? []));
  }
  feito.talvezSaiu.propostas.push(...(passo.talvezSaiu ?? []));
  feito.falhou.push(...(passo.falhou ?? []));
  return passo;
}

// ── 1. O registo fiscal ────────────────────────────────────────────────────

/**
 * Qualquer contrato (não só o aceite) ou fatura recusa. E não saber também
 * recusa: não saber se há contrato não é saber que não há — mas não se
 * afirma um contrato que pode não existir (`nao-verificado`).
 */
async function recusaFiscal(
  pedido: NonNullable<Awaited<ReturnType<typeof getQuote>>>,
): Promise<ResultadoDoApagamento | null> {
  try {
    const motivo = await registoFiscalDoPedido(pedido);
    return motivo ? { apagado: false, motivo, ...nadaAinda() } : null;
  } catch (e) {
    log.error("apagar-pedido: leitura fiscal falhou — não se apaga nada", e, { pedido: pedido.id });
    const feito = nadaAinda();
    feito.falhou.push("não consegui verificar se este pedido tem contrato ou faturas");
    return { apagado: false, motivo: "nao-verificado", ...feito };
  }
}

// ── 2. As tarefas (auditoria de 12/11, n.º 7; cascata desde o P5) ───────────

async function apagarTarefas(pedido: string): Promise<Passo> {
  const tarefas = await lerOuNull(
    () => listTasksForQuote(pedido),
    "apagar-pedido: listagem de tarefas falhou",
    pedido,
  );
  if (!tarefas) return { falhou: ["não consegui listar as tarefas deste pedido"], parar: true };
  const { sairam, falharam } = await umAUm(
    tarefas,
    (t) => deleteTask(t.id),
    (t) => ({ mensagem: "apagar-pedido: tarefa não apagada", contexto: { pedido, tarefa: t.id } }),
  );
  if (falharam.length > 0) {
    log.warn("apagar-pedido: ficaram tarefas — não se apaga mais nada (a cascata levá-las-ia)", {
      pedido,
    });
  }
  return {
    contou: { tarefas: sairam.length },
    saiu: { tarefas: sairam.map((t) => t.id) },
    falhou: falharam.map((t) => `a tarefa ${t.id} não foi apagada`),
    parar: falharam.length > 0,
  };
}

// ── 3. As propostas, com a confirmação ─────────────────────────────────────

const LISTAGEM_DAS_PROPOSTAS_FALHOU = "não consegui listar as propostas deste pedido";

/**
 * As falhas não vão logo para o relatório: quem decide o que é verdade é a
 * confirmação (uma proposta cuja resposta se perdeu pode ter saído, e uma
 * listagem falhada pode não esconder nada). Uma que ficou — ou que nasceu
 * noutro ecrã — faz parar antes de as fotografias e os rascunhos saírem.
 */
async function apagarPropostas(pedido: string): Promise<Passo> {
  const lista = await lerOuNull(
    () => listProposalsForQuote(pedido),
    "apagar-pedido: listagem de propostas falhou",
    pedido,
  );
  const { sairam, falharam } = await umAUm(
    lista ?? [],
    (p) => deleteProposal(p.id),
    (p) => ({
      mensagem: "apagar-pedido: proposta não apagada",
      contexto: { pedido, proposta: p.id },
    }),
  );
  const ids = new Set(falharam.map((p) => p.id));
  const aviso = lista ? [] : [LISTAGEM_DAS_PROPOSTAS_FALHOU];
  const confirmadas = sairam.map((p) => p.id);

  const ficaram = await lerOuNull(
    async () => (await listProposalsForQuote(pedido)).map((p) => p.id),
    "apagar-pedido: confirmação das propostas falhou",
    pedido,
  );
  if (!ficaram) {
    // Sem confirmação não se sabe se as que falharam saíram: «talvez».
    return {
      contou: { propostas: confirmadas.length },
      saiu: { propostas: confirmadas },
      talvezSaiu: [...ids],
      falhou: [
        ...aviso,
        ...oQueFicouDasPropostas([...ids], ids),
        "não consegui confirmar as propostas deste pedido",
      ],
      parar: true,
    };
  }
  // Uma que falhou e a confirmação já não encontra SAIU: só a resposta se
  // perdeu (júri de 18/11, 12.ª volta).
  const semResposta = propostasQueSairamSemResposta(ids, ficaram);
  const todas = [...confirmadas, ...semResposta];
  const parar = ficaram.length > 0;
  return {
    contou: { propostas: todas.length },
    saiu: { propostas: todas },
    falhou: parar ? [...aviso, ...oQueFicouDasPropostas(ficaram, ids)] : [],
    parar,
  };
}

// ── 4. As fotografias que ela carregou para este pedido ────────────────────

/**
 * Só a pasta `<pedido>/` do bucket das propostas. As da BIBLIOTECA não se
 * tocam: vivem noutro bucket e são usadas em muitas propostas.
 */
async function apagarFotos(pedido: string): Promise<Passo> {
  const fotos = await lerOuNull(
    () => listProposalImages(pedido),
    "apagar-pedido: listagem de fotografias falhou",
    pedido,
  );
  if (!fotos) return { falhou: ["não consegui listar as fotografias deste pedido"] };
  const { sairam, falharam } = await umAUm(
    fotos,
    (f) => removeStoredObject(PROPOSAL_BUCKET, f.path),
    (f) => ({
      mensagem: "apagar-pedido: fotografia não apagada",
      contexto: { pedido, path: f.path },
    }),
  );
  return {
    contou: { fotos: sairam.length },
    falhou: falharam.map((f) => `a fotografia ${f.path} continua no armazenamento`),
  };
}

// ── 5. O rascunho do estúdio, e as suas variantes ──────────────────────────

/**
 * Só se apaga (e só se CONTA) o rascunho que existe: gravar `null` por cima de
 * nada deixava uma chave vazia e contava-a como apagada (revisão de 13/11,
 * n.º 3). A leitura é a de quem vai escrever: se falhar, diz-se que ficou.
 */
async function apagarRascunhos(pedido: string): Promise<Passo> {
  const existem: string[] = [];
  const naoLidos: string[] = [];
  for (const chave of chavesDoRascunhoDoPedido(pedido)) {
    try {
      if ((await getState(draftKey(chave), { ouFalha: true })) != null) existem.push(chave);
    } catch (e) {
      naoLidos.push(chave);
      log.error("apagar-pedido: rascunho não limpo", e, { pedido, chave });
    }
  }
  const { sairam, falharam } = await umAUm(
    existem,
    async (chave) => {
      if (!(await clearProposalDraft(chave)).gravado) throw new Error("não gravou");
    },
    (chave) => ({ mensagem: "apagar-pedido: rascunho não limpo", contexto: { pedido, chave } }),
  );
  return {
    contou: { rascunhos: sairam.length },
    saiu: { rascunhos: sairam },
    falhou: [...naoLidos, ...falharam].map((chave) => `o rascunho ${chave} não foi limpo`),
  };
}

// ── 6. O que pode ter nascido entretanto ───────────────────────────────────

/**
 * A pergunta do início, alargada (`ligacoesDoPedido`): um contrato ou uma
 * fatura ficavam sem origem pelo `set null`, uma proposta solta com o nome do
 * casal, uma tarefa caía pela cascata sem relatório. SEM `motivo`: aqui já
 * saiu muita coisa, e um motivo diria à Reciclagem «nada saiu».
 */
async function confirmarQueNadaPrende(pedido: string): Promise<Passo> {
  try {
    const prende = oQueAindaPrende(await ligacoesDoPedido(pedido));
    return { falhou: prende, parar: prende.length > 0 };
  } catch (e) {
    log.error("apagar-pedido: a segunda verificação falhou", e, { pedido });
    return {
      falhou: ["não consegui confirmar o que ainda está ligado ao pedido antes de o apagar"],
      parar: true,
    };
  }
}

// ── 7. E o pedido, por último ──────────────────────────────────────────────

async function apagarOPedido(pedido: string): Promise<Passo> {
  try {
    await deleteQuote(pedido);
    return {};
  } catch (e) {
    log.error("apagar-pedido: o pedido não foi apagado", e, { pedido });
    return { falhou: ["o pedido em si não foi apagado"], parar: true };
  }
}
