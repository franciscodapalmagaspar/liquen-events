import "server-only";
import { getQuote, deleteQuote } from "./quotes-store";
import { listProposalsForQuote, deleteProposal } from "./proposals-store";
import { listContracts } from "./contracts-store";
import { clearProposalDraft } from "./proposal-drafts";
import { listProposalImages, removeStoredObject, PROPOSAL_BUCKET } from "./proposal-storage";
import { listTasks, deleteTask } from "./tasks-store";
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
 * Daí a regra deste módulo: um pedido com contrato **não é apagado**, e a
 * resposta di-lo pelo nome em vez de fingir que apagou. Quem quiser tratar
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
  motivo?: "tem-contrato" | "nao-existe";
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
}

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
  if (!id) return { apagado: false, motivo: "nao-existe", contou: { ...VAZIO }, falhou: [] };

  const contou = { ...VAZIO };
  const falhou: string[] = [];

  const pedido = await getQuote(id);
  if (!pedido) return { apagado: false, motivo: "nao-existe", contou, falhou };

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
  try {
    const contratos = await listContracts();
    if (contratos.some((c) => (c.quoteId ?? "").trim() === id)) {
      return { apagado: false, motivo: "tem-contrato", contou, falhou };
    }
  } catch (e) {
    falhou.push("não consegui verificar se este pedido tem contrato");
    log.error("apagar-pedido: leitura dos contratos falhou — não se apaga nada", e, {
      pedido: id,
    });
    return { apagado: false, motivo: "tem-contrato", contou, falhou };
  }

  // ── As propostas, que é onde estão os dados pessoais a mais ──────────────
  try {
    const propostas = await listProposalsForQuote(id);
    for (const p of propostas) {
      try {
        await deleteProposal(p.id);
        contou.propostas++;
      } catch (e) {
        falhou.push(`a proposta ${p.id} não foi apagada`);
        log.error("apagar-pedido: proposta não apagada", e, { pedido: id, proposta: p.id });
      }
    }
  } catch (e) {
    falhou.push("não consegui listar as propostas deste pedido");
    log.error("apagar-pedido: listagem de propostas falhou", e, { pedido: id });
  }

  // ── As tarefas do pedido (auditoria de 12/11, n.º 7) ─────────────────────
  //
  // Cada tarefa guarda uma cópia do nome do casal (`client_name`) e o id do
  // pedido, sem chave estrangeira: apagar o pedido deixava-as para trás, com
  // os dados pessoais que esta função existe para apagar. A Reciclagem guarda-
  // as no retrato do pedido ANTES de chamar isto, e repõe-nas com ele.
  try {
    const tarefas = (await listTasks()).filter((t) => (t.quoteId ?? "").trim() === id);
    for (const t of tarefas) {
      try {
        await deleteTask(t.id);
        contou.tarefas++;
      } catch (e) {
        falhou.push(`a tarefa ${t.id} não foi apagada`);
        log.error("apagar-pedido: tarefa não apagada", e, { pedido: id, tarefa: t.id });
      }
    }
  } catch (e) {
    falhou.push("não consegui listar as tarefas deste pedido");
    log.error("apagar-pedido: listagem de tarefas falhou", e, { pedido: id });
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
      const r = await clearProposalDraft(chave);
      if (r.gravado) contou.rascunhos++;
    } catch (e) {
      falhou.push(`o rascunho ${chave} não foi limpo`);
      log.error("apagar-pedido: rascunho não limpo", e, { pedido: id, chave });
    }
  }

  // ── E o pedido, por último ───────────────────────────────────────────────
  try {
    await deleteQuote(id);
  } catch (e) {
    falhou.push("o pedido em si não foi apagado");
    log.error("apagar-pedido: o pedido não foi apagado", e, { pedido: id });
    return { apagado: false, contou, falhou };
  }

  log.info("pedido apagado por completo", {
    pedido: id,
    propostas: contou.propostas,
    fotos: contou.fotos,
    rascunhos: contou.rascunhos,
    tarefas: contou.tarefas,
    ficou_por_apagar: falhou.length,
  });
  return { apagado: true, contou, falhou };
}
