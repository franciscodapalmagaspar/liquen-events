import type { CSSProperties } from "react";
import { SITE } from "@/lib/site";
import { ROTULO_DO_LIVRO, type Lingua } from "@/lib/legal/textos-legais";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A LIGAÇÃO AO LIVRO DE RECLAMAÇÕES ELETRÓNICO — UMA SÓ, EM TODO O LADO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Obrigatória para quem presta serviços a consumidores: o acesso à plataforma
 * oficial, visível, em todas as páginas. Nasceu no rodapé do sítio (pedido
 * dela, 17/10: «no canto, ao lado da privacidade, e transparente»), e a
 * auditoria legal de 17/11 encontrou três sítios onde ela não chegava, porque
 * nenhum deles monta esse rodapé:
 *
 *   · as páginas dos anúncios (`/s/…`), sem cromado por decisão de desenho;
 *   · a proposta online (`/proposta/[token]`), que tem o seu próprio fecho;
 *   · os ecrãs de erro que vivem fora do layout (o 404 global, o 404 de `/s/`
 *     e o `global-error`).
 *
 * Por isso a ligação saiu do `Footer.tsx` para aqui, e o rodapé passou a usar
 * esta mesma peça: um endereço (`SITE.livroReclamacoes`), um logótipo, um nome.
 *
 * Desde o documento de 17/11 (`docs/LEGAL-FORMULARIO.md`) vive dentro do
 * `AvisoLegal.tsx`, com a resolução de litígios e as ligações legais: é essa
 * a peça que as páginas montam. O nome vem de `textos-legais.ts`.
 *
 * ── PORQUE É QUE NÃO É `SafeImage` NEM `next/image` ────────────────────────
 * Tem de poder entrar no 404 global, onde um componente de cliente vai para o
 * pacote de TODAS as rotas (ver o cabeçalho de `global-not-found.tsx`), e no
 * `global-error`, que não carrega a folha de estilos do sítio. Por isso é um
 * `<img>` simples, com os WebP que o `pregen-logos.mjs` já escreve (um teste
 * prende que existem), e o essencial do desenho em `style` — a altura e a
 * silhueta não dependem de nenhuma classe.
 *
 * `sobre`: a cor do que está por trás. Num fundo escuro o logótipo vai em
 * silhueta branca (o rodapé, a proposta); num claro, em silhueta escura.
 */

/** Os ficheiros pré-gerados de `public/logos/livro-de-reclamacoes.png`. */
export const LIVRO_DE_RECLAMACOES_1X = "/_img/l/livro-de-reclamacoes-128.webp";
export const LIVRO_DE_RECLAMACOES_2X = "/_img/l/livro-de-reclamacoes-256.webp";
/** As proporções do original (1012×408). */
const LARGURA = 1012;
const ALTURA = 408;

export default function LivroDeReclamacoes({
  lingua,
  sobre = "escuro",
  altura = 40,
  className,
  style,
}: {
  /** A língua da página: dá o nome e o `aria-label` do documento de 17/11. */
  lingua: Lingua;
  sobre?: "escuro" | "claro";
  /** Altura do logótipo, em px. */
  altura?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <a
      href={SITE.livroReclamacoes}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ROTULO_DO_LIVRO[lingua].rotulo}
      title={ROTULO_DO_LIVRO[lingua].nome}
      className={className}
      style={{ display: "inline-flex", alignItems: "center", ...style }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- ver o cabeçalho */}
      <img
        src={LIVRO_DE_RECLAMACOES_1X}
        srcSet={`${LIVRO_DE_RECLAMACOES_1X} 1x, ${LIVRO_DE_RECLAMACOES_2X} 2x`}
        alt=""
        width={LARGURA}
        height={ALTURA}
        loading="lazy"
        decoding="async"
        style={{
          height: altura,
          width: "auto",
          maxWidth: "none",
          filter: sobre === "escuro" ? "brightness(0) invert(1)" : "brightness(0)",
        }}
      />
    </a>
  );
}
