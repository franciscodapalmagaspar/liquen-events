import type { AparenciaDoTelefone } from "@/components/CampoTelefone";
import { ESTADO } from "./movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CAMPO DO TELEFONE, COM A PELE DO BACK OFFICE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `CampoTelefone` é um só para o site e para o back office (pedido dela,
 * 30/10: «em todo o lado»), e a pele é que muda. Esta vive AQUI, dentro da
 * pasta do back office, e não ao lado do componente, por causa do ponto 3 da
 * Parte −1 do `docs/DESIGN-SYSTEM.md`: só o `admin.css` varre esta pasta, e
 * estas classes não têm de viajar na folha do site.
 *
 * A lista que se abre é a do `ui/Escolha` — o mesmo material, a mesma folga,
 * a mesma pastilha de acento na linha activa (branco sobre `--bo-accent`,
 * 6,55:1) —, para a escolha do país não ser uma terceira maneira de escolher
 * coisas neste back office.
 *
 * As bordas e o enchimento do botão e do número ficam com quem chama
 * (`classeDoBotao`, `classeDoNumero`): a gaveta usa a caixa (`bo-input`), o
 * diálogo do pedido novo usa o sublinhado do `Field`.
 */
export const APARENCIA_DO_BACK_OFFICE: AparenciaDoTelefone = {
  caixa: "relative flex items-stretch gap-2",
  botao:
    "inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-sm text-[var(--bo-text)] " +
    "disabled:cursor-not-allowed disabled:opacity-50 " +
    ESTADO,
  lista:
    "bo-material bo-material-desfoque bo-entrada absolute left-0 top-full z-[100] mt-1 " +
    "w-80 max-w-[calc(100vw_-_2rem)] p-[var(--bo-material-folga)] " +
    "shadow-[var(--bo-sombra-suspensa)]",
  procura:
    "bo-input mb-1 w-full px-3 py-2 text-sm text-[var(--bo-text)] pointer-coarse:text-base " +
    "placeholder:text-[var(--bo-text-muted)]",
  opcoes: "max-h-72 overflow-y-auto overscroll-contain",
  opcao:
    "alvo-toque flex cursor-default items-center gap-2.5 px-2.5 py-2 text-sm " +
    "rounded-[var(--bo-material-raio-pastilha)] " +
    ESTADO,
  opcaoActiva: "bg-[var(--bo-accent)] text-white",
  opcaoInactiva: "text-[var(--bo-tinta-72)]",
  indicativo: "ml-auto pl-2 tabular-nums text-[var(--bo-text-muted)]",
  indicativoActivo: "ml-auto pl-2 tabular-nums text-white",
  semResultados: "px-2.5 py-3 text-sm text-[var(--bo-text-muted)]",
  erro: "bo-entrada mt-1.5 text-xs leading-relaxed text-[var(--bo-perigo)]",
};

/** O sublinhado do `Field variant="underline"`, para o número e o botão. */
export const TELEFONE_SUBLINHADO = {
  botao: "rounded-none border-0 border-b border-foreground/20 px-0 py-2 hover:border-foreground/40",
  numero:
    "w-full rounded-none border-0 border-b bg-transparent px-0 py-2 text-sm text-[var(--bo-text)] " +
    "placeholder:text-foreground/30 focus:outline-none " +
    ESTADO,
  numeroBom: "border-foreground/20 hover:border-foreground/40 focus:border-sage-600",
  numeroComErro: "border-[var(--bo-perigo)]/70 focus:border-[var(--bo-perigo)]",
};

/** A caixa (`bo-input`) da gaveta, para o número e o botão. */
export const TELEFONE_EM_CAIXA = {
  botao: "bo-input px-2.5 py-2",
  numero: "bo-input w-full px-3 py-2 text-sm text-[var(--bo-text)]",
};
