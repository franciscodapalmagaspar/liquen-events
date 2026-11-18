import type { View } from "./nav";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS ATALHOS DE TECLADO DO BACK OFFICE, NUM SÍTIO SÓ (BO 4)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estavam escritos duas vezes: o `AdminClient` ouvia o acorde «G» + letra por
 * uma tabela, e a folha dos atalhos (`ShortcutsModal`) mostrava outra, à mão.
 * As duas já discordavam — a folha prometia «G C» e «G F» para duas vistas que
 * ela mandou tirar do menu. Agora a folha lê ESTA tabela, e uma letra nova só
 * existe se estiver aqui.
 */

/**
 * O acorde «G, depois…». Uma letra por destino, e nenhuma repetida.
 *
 * ── O QUE SAIU, E PORQUÊ ──────────────────────────────────────────────────
 * `c` (Clientes) e `f` (Fornecedores): as duas vistas estão fora do `NAV` a
 * pedido dela («não quero estas opções», ver `nav.tsx`) e nenhum botão do back
 * office leva lá. Um atalho para um sítio que o menu esconde era uma porta
 * secreta para o que ela pediu para não ver. As letras ficaram livres e
 * passaram a outros destinos.
 *
 * `k` (Organização de propostas) FICA: também está fora do menu, mas a Visão
 * Geral leva lá («Fases dos pedidos», e o «Abrir →» do funil) — continua a ser
 * um destino alcançável.
 *
 * ── AS LETRAS NOVAS ───────────────────────────────────────────────────────
 * `d` Pagamentos (dinheiro — o `p` é dos Pedidos), `i` Temas (inspiração —
 * os temas são as fotos de inspiração; o `t` é das Tarefas), `m` Material,
 * `c` Contratos (as Propostas Aceites) e `f` Fazer proposta.
 *
 * Nenhuma delas é uma tecla solta de outra vista: o Calendário só ouve o `t`
 * solto (e deixa passar o `t` de um acorde `g`+`t`), e o resto do back office
 * só ouve teclas com modificador. Um teste prende as duas coisas.
 */
export const VIEW_KEYS: Readonly<Record<string, View>> = {
  o: "overview",
  p: "pedidos",
  f: "fazer-proposta",
  r: "propostas",
  d: "pagamentos",
  a: "calendario",
  t: "tarefas",
  c: "contratos",
  m: "material",
  i: "temas",
  e: "estatisticas",
  k: "kanban",
};

/**
 * ── O `/` FOCA A PROCURA DA VISTA ONDE SE ESTÁ ────────────────────────────
 *
 * Era «ir para os Pedidos e focar a procura deles», estivesse onde estivesse.
 * Nas Propostas, o `/` tirava-a das Propostas. Agora foca o campo de procura
 * da vista aberta, pelo NOME acessível desse campo — o mesmo que um leitor de
 * ecrã anuncia, e que cada vista já tem.
 *
 * Pelo nome e não por uma marca nova em cada campo: assim isto não obriga a
 * mexer em vistas que não são deste trabalho (os Pagamentos, por exemplo), e
 * um campo cujo nome mude parte um teste em vez de partir em silêncio.
 *
 * Uma vista sem procura não está aqui; aí o `/` abre a procura em tudo (⌘K),
 * que é a procura que serve qualquer sítio.
 */
const PROCURA_DA_VISTA: Partial<Record<View, string>> = {
  pedidos: "Procurar pedidos por nome, email, local ou ID",
  "fazer-proposta": "Procurar cliente",
  propostas: "Procurar propostas",
  pagamentos: "Procurar cliente",
  contratos: "Procurar contratos",
  material: "Procurar material",
  temas: "Procurar tema por nome ou nota",
  guioes: "Procurar eventos",
  mesas: "Procurar eventos",
  fornecedores: "Procurar fornecedores",
  clientes: "Procurar cliente",
  inventario: "Procurar itens do inventário",
  servicos: "Procurar na biblioteca de serviços",
};

/** O seletor do campo de procura da vista, ou `null` se ela não tiver. */
export function procuraDaVista(view: View): string | null {
  const nome = PROCURA_DA_VISTA[view];
  return nome ? `input[aria-label="${nome}"]` : null;
}

/**
 * O foco está num sítio onde se ESCREVE? As teclas soltas («n», «/», «g» e o
 * acorde) nunca disparam aí — é a mesma pergunta que o `AdminClient`, o
 * Calendário e os Temas já faziam, cada um à sua maneira.
 */
export function aEscrever(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  if (!el) return false;
  /* Uma caixa de seleção, um rádio ou um botão em forma de `<input>` não
     recebem texto: depois de marcar a caixa de um pedido, o foco fica NELA, e
     o ⌘A e o Esc que vêm a seguir são do lote, não de um campo (revisão · 2). */
  if (el.tagName === "INPUT") return !INPUTS_QUE_NAO_SAO_ESCRITA.has((el as HTMLInputElement).type);
  return el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable === true;
}

const INPUTS_QUE_NAO_SAO_ESCRITA: ReadonlySet<string> = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
]);

/**
 * O alvo da tecla está dentro de uma janela aberta (diálogo ou alerta)? Os
 * atalhos de lote — ⌘A, Esc — nunca agem por trás de uma (revisão · 8). É a
 * regra que as Tarefas já seguiam, agora num sítio só.
 */
export function dentroDeUmaJanela(alvo: EventTarget | null): boolean {
  const el = alvo as Element | null;
  return !!el?.closest?.('[role="dialog"], [role="alertdialog"]');
}

/** A parte da tecla que interessa a um atalho com ⌘/Ctrl. */
type Tecla = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

/**
 * É ⌘ (Mac) ou Ctrl (resto) mais `letra`? Com `sozinho`, nem ⌥ nem ⇧ podem vir
 * juntos — o ⌘A dos Pedidos não é o ⌘⇧A. A regra estava escrita à mão em cada
 * atalho do `useAtalhosDoTeclado`.
 */
export function comComando(e: Tecla, letra: string, sozinho = false): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== letra) return false;
  return !sozinho || (!e.altKey && !e.shiftKey);
}
