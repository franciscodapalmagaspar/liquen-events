import "server-only";
import { getQuote, deleteQuote } from "./quotes-store";
import { listProposalsForQuote, deleteProposal } from "./proposals-store";
import {
  ligacoesDoPedido,
  fraseDasPropostasQueFicaram,
  oQueAindaPrende,
  registoFiscalDoPedido,
} from "./o-que-prende-o-pedido";
import { clearProposalDraft, draftKey } from "./proposal-drafts";
import { getState } from "./app-state";
import { listProposalImages, removeStoredObject, PROPOSAL_BUCKET } from "./proposal-storage";
import { listTasksForQuote, deleteTask } from "./tasks-store";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * APAGAR UM PEDIDO A SÉRIO — a promessa que estava publicada e não se cumpria
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A política de privacidade do sítio diz, com estas palavras:
 *
 *   «Pedidos que não deem origem a contrato são eliminados no prazo máximo de
 *    12 meses após o último contacto.»
 *
 * O apagamento que existia tirava a linha do pedido e mais nada. As PROPOSTAS
 * ficavam — com o nome do casal, o email, e o documento inteiro lá dentro —
 * porque a chave estrangeira é `on delete set null`: em vez de irem atrás,
 * ficavam órfãs e intactas. As fotografias que ela carregou para aquele pedido
 * ficavam no bucket. O rascunho do estúdio ficava no `app_state`.
 *
 * Uma linha apagada e os dados todos no sítio não é um apagamento. É a
 * aparência de um.
 *
 * ── O QUE FICA, E PORQUE É QUE FICA ───────────────────────────────────────
 *
 * CONTRATOS E FACTURAS NÃO SE APAGAM, e isso não é uma falha: são registos
 * fiscais, e em Portugal têm de ser conservados anos. A própria política sabe
 * disso — por isso a promessa fala de pedidos que NÃO deram origem a contrato.
 *
 * Daí a regra deste módulo: um pedido com contrato — ou, desde o P5 (18/11),
 * com fatura — **não é apagado**, e a resposta di-lo pelo nome em vez de
 * fingir que apagou (o nome da função ficou do tempo em que só havia o
 * contrato; as guardas estão em `o-que-prende-o-pedido.ts`). Quem quiser tratar
 * desse caso tem de o decidir com a contabilidade à frente, não com um botão.
 *
 * ── PORQUE É QUE ISTO CONTA O QUE APAGOU ──────────────────────────────────
 *
 * Porque um apagamento silencioso é indistinguível de um apagamento que não
 * aconteceu — que é exactamente o defeito que este ficheiro veio corrigir. A
 * resposta traz o que saiu e, sobretudo, o que NÃO saiu: se o bucket recusar
 * uma fotografia, isso tem de chegar a quem carregou no botão e ao registo,
 * senão fica um ficheiro com a cara de um casal num sítio que ninguém sabe que
 * ainda existe.
 *
 * ── A ORDEM IMPORTA ───────────────────────────────────────────────────────
 *
 * O pedido é o ÚLTIMO a sair. Se ele fosse primeiro e alguma coisa falhasse a
 * meio, ficavam propostas órfãs sem nada que apontasse para elas — ou seja, o
 * defeito de hoje, agora sem forma de o encontrar. Enquanto o pedido existir,
 * uma segunda tentativa sabe o que ainda falta.
 */

/** O que uma passagem de apagamento levou, e o que não conseguiu levar. */
export interface ResultadoDoApagamento {
  apagado: boolean;
  /** Só quando `apagado` é falso. */
  /**
   * Só quando `apagado` é falso e NADA saiu. `nao-verificado`: não se conseguiu
   * ler os contratos ou as faturas — não se apaga nada, e o ecrã diz a frase
   * genérica (não afirma um contrato que pode não existir).
   */
  motivo?: "tem-contrato" | "tem-fatura" | "nao-verificado" | "nao-existe";
  contou: {
    propostas: number;
    fotos: number;
    /** O rascunho do estúdio, quando havia um. */
    rascunhos: number;
    /** As tarefas ligadas ao pedido (guardam o nome do casal). */
    tarefas: number;
  };
  /** O que ficou para trás, em linguagem de quem vai ler o registo. */
  falhou: string[];
  /**
   * O que SAIU, pelo id (as chaves, nos rascunhos). Um apagar que pára a meio
   * deixa na Reciclagem só isto — e não o retrato inteiro, que repunha por
   * cima do pedido vivo o que nunca tinha saído (revisão de 13/11).
   */
  saiu: { propostas: string[]; tarefas: string[]; rascunhos: string[] };
}

const nadaSaiu = () => ({
  propostas: [] as string[],
  tarefas: [] as string[],
  rascunhos: [] as string[],
});

const VAZIO = { propostas: 0, fotos: 0, rascunhos: 0, tarefas: 0 };

/**
 * Apaga um pedido e tudo o que é dele, quando ele não deu origem a contrato.
 *
 * Nunca lança: um apagamento que rebenta a meio deixa o sistema num estado que
 * ninguém consegue descrever. Devolve sempre o que conseguiu e o que não.
 */
export async function apagarPedidoSemContrato(
  pedidoId: string,
  /**
   * `fotos: false` deixa a pasta do pedido no Storage: é o que a Reciclagem
   * pede (`src/lib/reciclagem.ts`), que só a apaga quando a entrada sai de vez.
   */
  opcoes: { fotos?: boolean } = {},
): Promise<ResultadoDoApagamento> {
  const id = String(pedidoId ?? "").trim();
  if (!id)
    return {
      apagado: false,
      motivo: "nao-existe",
      contou: { ...VAZIO },
      falhou: [],
      saiu: nadaSaiu(),
    };

  const contou = { ...VAZIO };
  const falhou: string[] = [];
  const saiu = nadaSaiu();

  const pedido = await getQuote(id);
  if (!pedido) return { apagado: false, motivo: "nao-existe", contou, falhou, saiu };

  /**
   * ── O CONTRATO MANDA PARAR ──────────────────────────────────────────────
   *
   * Qualquer contrato, e não só o aceite: um contrato emitido já é um registo,
   * e a promessa da política é sobre pedidos que NÃO deram origem a contrato
   * nenhum. Na dúvida entre apagar de mais e apagar de menos, num registo
   * fiscal, apaga-se de menos.
   *
   * E se a leitura dos contratos falhar, também se pára. Não saber se há
   * contrato não é o mesmo que saber que não há — e aqui a diferença é entre
   * cumprir uma política e destruir contabilidade.
   */
  //
  // E a FATURA também (P5, 17/11): é um registo fiscal como o contrato, e a
  // chave dela é `set null` — apagar o pedido apagava-lhe a origem de vez. O
  // ecrã diz a frase genérica de sempre. As guardas vivem em
  // `o-que-prende-o-pedido.ts` (esta é `registoFiscalDoPedido`).
  try {
    const fiscal = await registoFiscalDoPedido(id);
    if (fiscal) return { apagado: false, motivo: fiscal, contou, falhou, saiu };
  } catch (e) {
    // Não saber se há contrato não é o mesmo que saber que não há: não se
    // apaga nada. Mas também não se afirma um contrato que pode não existir.
    falhou.push("não consegui verificar se este pedido tem contrato ou faturas");
    log.error("apagar-pedido: leitura fiscal falhou — não se apaga nada", e, { pedido: id });
    return { apagado: false, motivo: "nao-verificado", contou, falhou, saiu };
  }

  // ── As tarefas do pedido (auditoria de 12/11, n.º 7) ─────────────────────
  //
  // Cada tarefa guarda uma cópia do nome do casal (`client_name`) e o id do
  // pedido, sem chave estrangeira: apagar o pedido deixava-as para trás, com
  // os dados pessoais que esta função existe para apagar. A Reciclagem guarda-
  // as no retrato do pedido ANTES de chamar isto, e repõe-nas com ele.
  //
  // Desde o P5 (17/11) a base apaga-as sozinha com o pedido (`on delete
  // cascade`). Por isso vêm PRIMEIRO, antes de qualquer outra coisa sair: se
  // alguma fica por apagar (ou nem se consegue listar), pára-se aqui — senão a
  // cascata levava-as sem que este relatório nem a Reciclagem o soubessem, e o
  // pedido ficava vivo sem as propostas e as fotografias. Uma segunda tentativa
  // sabe o que ainda falta.
  let tarefasFicaram = false;
  try {
    const tarefas = await listTasksForQuote(id);
    for (const t of tarefas) {
      try {
        await deleteTask(t.id);
        contou.tarefas++;
        saiu.tarefas.push(t.id);
      } catch (e) {
        tarefasFicaram = true;
        falhou.push(`a tarefa ${t.id} não foi apagada`);
        log.error("apagar-pedido: tarefa não apagada", e, { pedido: id, tarefa: t.id });
      }
    }
  } catch (e) {
    tarefasFicaram = true;
    falhou.push("não consegui listar as tarefas deste pedido");
    log.error("apagar-pedido: listagem de tarefas falhou", e, { pedido: id });
  }
  if (tarefasFicaram) {
    log.warn("apagar-pedido: ficaram tarefas — não se apaga mais nada (a cascata levá-las-ia)", {
      pedido: id,
    });
    return { apagado: false, contou, falhou, saiu };
  }

  // ── As propostas, que é onde estão os dados pessoais a mais ──────────────
  try {
    const propostas = await listProposalsForQuote(id);
    for (const p of propostas) {
      try {
        await deleteProposal(p.id);
        contou.propostas++;
        saiu.propostas.push(p.id);
      } catch (e) {
        falhou.push(`a proposta ${p.id} não foi apagada`);
        log.error("apagar-pedido: proposta não apagada", e, { pedido: id, proposta: p.id });
      }
    }
  } catch (e) {
    falhou.push("não consegui listar as propostas deste pedido");
    log.error("apagar-pedido: listagem de propostas falhou", e, { pedido: id });
  }
  // Uma proposta que ficou (não saiu, ou nasceu noutro ecrã) faz parar AQUI,
  // antes de as fotografias e os rascunhos saírem sem volta: o pedido e essa
  // proposta ficam inteiros, e uma segunda tentativa sabe o que falta.
  try {
    const ficaram = await listProposalsForQuote(id);
    if (ficaram.length > 0) {
      if (!falhou.some((f) => f.startsWith("a proposta "))) {
        falhou.push(fraseDasPropostasQueFicaram(ficaram.length));
      }
      return { apagado: false, contou, falhou, saiu };
    }
  } catch (e) {
    falhou.push("não consegui confirmar as propostas deste pedido");
    log.error("apagar-pedido: confirmação das propostas falhou", e, { pedido: id });
    return { apagado: false, contou, falhou, saiu };
  }

  // ── As fotografias que ela carregou para este pedido ─────────────────────
  //
  // Só a pasta `<pedido>/` do bucket das propostas. As fotografias da
  // BIBLIOTECA não se tocam: vivem noutro bucket, são dela, e são usadas em
  // muitas propostas — apagá-las por causa de um pedido esvaziaria mood boards
  // de outros casais.
  if (opcoes.fotos !== false) {
    try {
      const fotos = await listProposalImages(id);
      for (const f of fotos) {
        try {
          await removeStoredObject(PROPOSAL_BUCKET, f.path);
          contou.fotos++;
        } catch (e) {
          falhou.push(`a fotografia ${f.path} continua no armazenamento`);
          log.error("apagar-pedido: fotografia não apagada", e, { pedido: id, path: f.path });
        }
      }
    } catch (e) {
      falhou.push("não consegui listar as fotografias deste pedido");
      log.error("apagar-pedido: listagem de fotografias falhou", e, { pedido: id });
    }
  }

  // ── O rascunho do estúdio, e as suas variantes ───────────────────────────
  //
  // As três chaves que o `proposta-rascunho` conhece: o documento do estúdio, a
  // tabela de linhas da ferramenta antiga, e as duas gavetas de resgate. Um
  // rascunho esquecido tem lá dentro o mesmo documento que a proposta tinha.
  for (const chave of [
    id,
    `${id}--orcamento-linhas`,
    `${id}--sobreposto`,
    `${id}--orcamento-linhas--sobreposto`,
  ]) {
    try {
      // Só se apaga (e só se CONTA) o rascunho que existe. Gravar `null` por
      // cima de nada deixava uma chave vazia por pedido — e contava-a como
      // «apagada», o que fazia a Reciclagem achar que o pedido já tinha saído
      // em parte quando nada tinha saído (revisão de 13/11, n.º 3). A leitura
      // é a de quem vai escrever: se falhar, lança, e diz-se que ficou.
      if ((await getState(draftKey(chave), { ouFalha: true })) == null) continue;
      const r = await clearProposalDraft(chave);
      if (r.gravado) {
        contou.rascunhos++;
        saiu.rascunhos.push(chave);
      } else falhou.push(`o rascunho ${chave} não foi limpo`);
    } catch (e) {
      falhou.push(`o rascunho ${chave} não foi limpo`);
      log.error("apagar-pedido: rascunho não limpo", e, { pedido: id, chave });
    }
  }

  // ── E o pedido, por último ───────────────────────────────────────────────
  //
  // Antes, outra vez o que pode ter nascido entretanto noutro ecrã — a mesma
  // pergunta do início, alargada (`ligacoesDoPedido`). Um contrato ou uma fatura ficavam
  // sem origem pelo `set null`; uma proposta ficava solta com o nome do casal;
  // uma tarefa caía pela cascata sem relatório nem Reciclagem. Em qualquer
  // caso o pedido fica, e a próxima tentativa sabe o que há.
  //
  // SEM `motivo`: aqui já saiu muita coisa, e um motivo de recusa diria à
  // Reciclagem «nada saiu» — e ela deitava fora a única cópia do que saiu.
  try {
    const prende = oQueAindaPrende(await ligacoesDoPedido(id));
    if (prende.length > 0) {
      falhou.push(...prende);
      return { apagado: false, contou, falhou, saiu };
    }
  } catch (e) {
    falhou.push("não consegui confirmar o que ainda está ligado ao pedido antes de o apagar");
    log.error("apagar-pedido: a segunda verificação falhou", e, { pedido: id });
    return { apagado: false, contou, falhou, saiu };
  }
  try {
    await deleteQuote(id);
  } catch (e) {
    falhou.push("o pedido em si não foi apagado");
    log.error("apagar-pedido: o pedido não foi apagado", e, { pedido: id });
    return { apagado: false, contou, falhou, saiu };
  }

  log.info("pedido apagado por completo", {
    pedido: id,
    propostas: contou.propostas,
    fotos: contou.fotos,
    rascunhos: contou.rascunhos,
    tarefas: contou.tarefas,
    ficou_por_apagar: falhou.length,
  });
  return { apagado: true, contou, falhou, saiu };
}
