import { eur0 } from "@/lib/money";
import { ROTULO_DO_ESTADO } from "@/lib/orcamento/estado-do-pedido";
import type { ActivityEntry, Quote, QuoteStatus } from "@/lib/orcamento/types";
import { textoMudou, type PainelEscrito } from "./painel-do-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O «GUARDAR ALTERAÇÕES» DO PAINEL DO PEDIDO, EM TRÊS PASSOS PUROS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Era uma função só dentro do `AdminClient.tsx` (`saveChanges`, complexidade
 * 105): comparava cada campo com o pedido gravado, escrevia as linhas do
 * histórico, montava o corpo do PATCH e, depois de gravar, o corpo do «Anular».
 * As três decisões passam a viver aqui, sem rede, sem relógio e sem React — e o
 * componente fica com a casca: ler os campos, chamar isto, mandar, mostrar.
 *
 * (Fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`. O comportamento está preso, letra a
 * letra, no caso de caracterização do `AdminClient.gravacao.test.tsx`, escrito
 * ANTES de a função sair do componente.)
 *
 * ── A REGRA DE CADA CAMPO NÃO É SEMPRE A MESMA, E ISSO É DE PROPÓSITO ───────
 *
 * Há duas perguntas por campo, e as respostas nem sempre coincidem:
 *   · vai no CORPO? — sempre que mudou, incluindo para vazio (apagar tem de
 *     gravar; um `undefined` desaparecia no JSON e o antigo ficava);
 *   · entra no HISTÓRICO? — só quando diz alguma coisa (apagar as notas ou o
 *     local não escreve «Local: »).
 * Cada `if` abaixo é a regra que o componente já tinha, copiada sem a mudar.
 */

/** Quem escreve as linhas, quando, e como se lhes dá um id. */
export interface AutorDasLinhas {
  actor: string;
  agora: string;
  novoId: () => string;
}

/** O corpo do PATCH. Só leva o que mudou — ver o cabeçalho. */
export interface CorpoDaGravacao {
  status?: QuoteStatus;
  quotedPrice?: number | null;
  adminNotes?: string;
  base?: { adminNotes: string };
  assignedTo?: string | null;
  lostReason?: string | null;
  date?: string;
  guests?: number;
  location?: string;
  name?: string;
  email?: string;
  phone?: string;
  activityLogAppend?: ActivityEntry[];
}

/** O que o «Anular» devolve: o valor de ANTES de cada campo que foi no corpo. */
export interface CorpoDoAnular {
  quotedPrice?: number | null;
  adminNotes?: string;
  assignedTo?: string | null;
  lostReason?: string | null;
  date?: string;
  guests?: number;
  location?: string;
  name?: string;
  email?: string;
  phone?: string;
}

const rotulo = (s: QuoteStatus): string => ROTULO_DO_ESTADO[s] ?? s;

/**
 * As linhas que este «Guardar» acrescenta ao histórico, pela ordem de sempre:
 * estado, preço, notas, responsável, data, convidados, local, email, telefone,
 * nome.
 */
export function linhasDoHistorico(
  antes: Quote,
  escrito: PainelEscrito,
  { actor, agora, novoId }: AutorDasLinhas,
): ActivityEntry[] {
  const linhas: ActivityEntry[] = [];
  const linha = (kind: ActivityEntry["kind"], summary: string) =>
    linhas.push({ id: novoId(), at: agora, kind, actor, summary });

  if (escrito.estado !== antes.status) {
    linha("status_change", `${rotulo(antes.status)} → ${rotulo(escrito.estado)}`);
  }
  if (escrito.preco !== undefined && escrito.preco !== (antes.quotedPrice ?? 0)) {
    linha("price_set", `Preço: ${eur0(escrito.preco)}`);
  }
  if (escrito.notas.trim() !== (antes.adminNotes ?? "").trim() && escrito.notas.trim()) {
    linha("note_added", "Notas internas atualizadas");
  }
  if (escrito.responsavel.trim() !== (antes.assignedTo ?? "").trim()) {
    const para = escrito.responsavel.trim();
    linha("assigned", para ? `Atribuído a ${para}` : "Responsável removido");
  }
  const novaData = escrito.data || undefined;
  if (novaData !== (antes.date ?? undefined) && novaData) {
    const porExtenso = new Date(novaData + "T12:00:00").toLocaleDateString("pt-PT");
    linha("note_added", `Data do evento alterada para ${porExtenso}`);
  }
  if (escrito.convidados !== antes.guests) {
    linha("note_added", `Convidados: ${antes.guests} → ${escrito.convidados}`);
  }
  if (textoMudou(escrito.local, antes.location) && escrito.local.trim()) {
    linha("note_added", `Local: ${escrito.local.trim()}`);
  }
  // O que mudou nos contactos fica no registo, como tudo o resto que se altera
  // à mão: daqui a três meses ninguém se lembra de quem acrescentou o email.
  if (textoMudou(escrito.email, antes.email)) {
    const novo = escrito.email.trim();
    linha("note_added", novo ? `Email do cliente: ${novo}` : "Email do cliente removido");
  }
  if (textoMudou(escrito.telefone, antes.phone)) {
    const novo = escrito.telefone.trim();
    linha("note_added", novo ? `Telefone do cliente: ${novo}` : "Telefone do cliente removido");
  }
  if (textoMudou(escrito.nome, antes.name) && escrito.nome.trim()) {
    linha("note_added", `Nome do cliente: ${antes.name} → ${escrito.nome.trim()}`);
  }
  return linhas;
}

/**
 * ── SÓ O QUE FOI TOCADO ─────────────────────────────────────────────────────
 *
 * Isto mandava os oito campos em todas as gravações, com os valores que o ecrã
 * tinha lido ao abrir: duas pessoas no mesmo pedido escreviam por cima uma da
 * outra sem nunca colidirem. Um campo que ninguém tocou não vai; um campo
 * LIMPO continua a ir (como `null`/`""`, nunca omitido).
 *
 * E o `status` é o mais importante de todos para não ir por hábito: a rota
 * trata a presença dele como «estado escolhido à mão» e desliga as transições
 * automáticas por causa disso.
 *
 * `baseDasNotas` é o texto de onde as notas partiram, para o servidor recusar
 * com 409 se outra pessoa as gravou entretanto (como na gravação automática).
 */
export function corpoDaGravacao(
  antes: Quote,
  escrito: PainelEscrito,
  { baseDasNotas, linhas }: { baseDasNotas: string; linhas: ActivityEntry[] },
): CorpoDaGravacao {
  const corpo: CorpoDaGravacao = {};
  if (escrito.estado !== antes.status) corpo.status = escrito.estado;
  if (escrito.preco !== (antes.quotedPrice ?? undefined)) corpo.quotedPrice = escrito.preco ?? null;
  if (escrito.notas !== (antes.adminNotes ?? "")) {
    corpo.adminNotes = escrito.notas;
    corpo.base = { adminNotes: baseDasNotas };
  }
  if (escrito.responsavel !== (antes.assignedTo ?? "")) {
    corpo.assignedTo = escrito.responsavel.trim() || null;
  }
  if (escrito.motivoDePerda !== (antes.lostReason ?? "")) {
    corpo.lostReason = escrito.motivoDePerda.trim() || null;
  }
  if (escrito.data !== (antes.date ?? "")) corpo.date = escrito.data;
  if (escrito.convidados !== antes.guests) corpo.guests = escrito.convidados;
  const local = escrito.local.trim();
  if (textoMudou(local, antes.location)) corpo.location = local;
  // Os contactos vão APARADOS e sempre que mudarem — incluindo para vazio.
  if (textoMudou(escrito.nome, antes.name)) corpo.name = escrito.nome.trim();
  if (textoMudou(escrito.email, antes.email)) corpo.email = escrito.email.trim();
  if (textoMudou(escrito.telefone, antes.phone)) corpo.phone = escrito.telefone.trim();
  // Acrescentadas no servidor, nunca o histórico inteiro: duas ferramentas a
  // gravar ao mesmo tempo nunca se sobrescrevem.
  if (linhas.length > 0) corpo.activityLogAppend = linhas;
  return corpo;
}

/**
 * ── O «ANULAR» DE TUDO O QUE ESTE «GUARDAR» MUDOU ───────────────────────────
 *
 * Para cada campo que foi no corpo, volta o valor que lá estava — com a mesma
 * regra de `null`/`""` do envio, para apagar mesmo. O estado não entra aqui:
 * quando ele também mudou, quem o desfaz é o `reporEstadoDoPedido`, que leva
 * isto como `extra` (e desfaz a cadeia do «Ganho»).
 */
export function corpoDoAnular(antes: Quote, corpo: CorpoDaGravacao): CorpoDoAnular {
  const inverso: CorpoDoAnular = {};
  if ("quotedPrice" in corpo) inverso.quotedPrice = antes.quotedPrice ?? null;
  if ("adminNotes" in corpo) inverso.adminNotes = antes.adminNotes ?? "";
  if ("assignedTo" in corpo) inverso.assignedTo = antes.assignedTo ?? null;
  if ("lostReason" in corpo) inverso.lostReason = antes.lostReason ?? null;
  if ("date" in corpo) inverso.date = antes.date ?? "";
  if ("guests" in corpo) inverso.guests = antes.guests;
  if ("location" in corpo) inverso.location = antes.location ?? "";
  if ("name" in corpo) inverso.name = antes.name ?? "";
  if ("email" in corpo) inverso.email = antes.email ?? "";
  if ("phone" in corpo) inverso.phone = antes.phone ?? "";
  return inverso;
}
