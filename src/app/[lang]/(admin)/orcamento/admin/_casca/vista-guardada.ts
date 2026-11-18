/**
 * Onde a secção aberta do back office fica guardada: o endereço, o cookie e o
 * `localStorage`. Só constantes, sem React — o `page.tsx` (servidor) lê o
 * cookie por aqui. Quem as escreve é o `useVistaNoEndereco`.
 */

/** A secção aberta, por aparelho (a ponte para quem ainda não tem cookie). */
export const VIEW_STORAGE_KEY = "liquen-admin-view";
/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MESMA SECÇÃO, MAS NUM COOKIE — PARA O SERVIDOR A PODER LER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO por uma auditoria, em separador limpo: a ~1 s aparece a Visão Geral
 * (desenhada no servidor), a ~2 s a aplicação troca SOZINHA para a última
 * secção usada e o menu lateral fecha-se. Quem entrou para ver a Visão Geral
 * vê-a desaparecer-lhe da frente.
 *
 * A causa é a memória estar num sítio onde o servidor não chega: o
 * `localStorage` só existe depois de a página ter sido desenhada, portanto a
 * escolha dela só podia ser aplicada DEPOIS — como uma correcção, à vista.
 *
 * Um cookie é a mesma memória por aparelho, mas viaja com o pedido. O servidor
 * desenha logo a secção certa e não há salto nenhum para corrigir.
 *
 * O `localStorage` FICA, e não é redundância: é ele que continua a valer para
 * quem tenha os cookies restringidos, e é a ponte para quem já tem uma escolha
 * guardada e ainda não tem cookie nenhum.
 */
export const VIEW_COOKIE = "liquen-admin-view";

/**
 * O nome do parâmetro que leva a secção no endereço: `/orcamento/admin?v=pedidos`.
 *
 * Curto de propósito. Isto vai parar a favoritos e a mensagens («abre-me isto»),
 * e um endereço que se lê ao telefone vale mais do que um que se explica.
 */
export const PARAM_VISTA = "v";
