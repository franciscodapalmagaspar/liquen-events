import { APARENCIA_DO_SITE, type AparenciaDoTelefone } from "@/components/CampoTelefone";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS FORMULÁRIOS DO SÍTIO COM O DESENHO DA APPLE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (30/10): «coloca tudo do formulário em design de apple», e depois «o
 * formulário dos anúncios também». Escolheu as caixas redondas do apple.com:
 * cada campo é uma caixa cinzenta-clara de cantos redondos.
 *
 * Desde 31/10 é só dos DOIS formulários dos anúncios — o curto das páginas do
 * Google (`PedidoRapido`, em `/casamentos/…`) e o de quatro campos das páginas
 * da Meta (`PedidoRelampago`, em `/s/…`). A página do orçamento voltou ao
 * desenho de antes, a pedido dela («quero deixar como estava antes do design
 * da apple»; posta a escolha, «Só a página do orçamento»), com o sublinhado
 * da `.field-line`. Por isso a caixa daqui tem nome próprio, `.campo-apple`
 * no `globals.css`: mexer numa não muda a outra.
 */

/**
 * Um campo de escrever com o rótulo POR CIMA (os formulários dos anúncios).
 * 16 px no telemóvel: abaixo disso o Safari do iPhone amplia a página ao
 * focar. O exemplo a `--fg-tertiary` (4,2:1 sobre o cinzento da caixa).
 */
export const CAMPO_APPLE =
  "campo-apple w-full px-3.5 py-3 text-[16px] text-[var(--fg-primary)] " +
  "placeholder:text-[var(--fg-tertiary)] focus:outline-none sm:text-[15px]";

/** O rótulo por cima do campo: letra normal, e não maiúsculas espaçadas. */
export const ROTULO_APPLE = "mb-1.5 block text-[13px] font-medium text-[var(--fg-secondary)]";

/**
 * O BOTÃO DE ENVIAR: uma cápsula verde em letra normal, sem seta (6,2:1). É
 * daqui e não do `PRIMARY_BUTTON_CLASS`, que é o das outras páginas do sítio e
 * fica como está.
 */
export const BOTAO_APPLE =
  "inline-flex items-center justify-center gap-2.5 rounded-full bg-[var(--accent)] px-7 py-3 " +
  "text-[15px] font-medium text-white transition-[background-color,transform] duration-200 " +
  "hover:bg-[var(--accent-hover)] active:scale-[0.98] motion-reduce:transition-none " +
  "disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:min-h-11";

/** O cartão branco de cantos redondos onde o formulário vive, sobre uma fotografia. */
export const CARTAO_APPLE =
  "rounded-[28px] bg-[var(--bg-elevated)] shadow-[0_30px_80px_-24px_rgb(8_8_8/0.45)]";

/**
 * O TELEMÓVEL NAS CAIXAS REDONDAS. O botão da bandeira é uma caixa igual à do
 * número — a mesma altura, o mesmo contorno, o mesmo foco (branca, contorno
 * escuro de 2 px) — e abre a mesma lista dos países.
 *
 * A largura do botão é fixa: 6,5 rem chegam para a bandeira, o indicativo mais
 * comprido (três algarismos) e a seta dupla do botão de escolha da Apple.
 */
export const TELEFONE_APPLE: AparenciaDoTelefone = {
  ...APARENCIA_DO_SITE,
  caixa: "relative flex items-stretch gap-2",
  botao:
    "inline-flex w-[6.5rem] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl " +
    "border border-[var(--border-strong)] bg-[var(--bg-subtle)] text-sm text-[var(--fg-primary)] " +
    "transition-[background-color,border-color,box-shadow] duration-200 hover:border-[var(--fg-tertiary)] " +
    "aria-expanded:border-[var(--fg-secondary)] aria-expanded:bg-[var(--bg-elevated)] " +
    "aria-expanded:shadow-[inset_0_0_0_1px_var(--fg-secondary)] motion-reduce:transition-none",
  seta: "dupla",
};
