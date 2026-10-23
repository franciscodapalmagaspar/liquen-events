/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DUPLO DO `next/font/google`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `next/font/google` não é uma biblioteca normal: é um MARCADOR que o
 * compilador do Next lê. Na compilação, um `Inter({...})` é substituído pelo
 * `@font-face` gerado e pelos nomes de classe. Fora do compilador — num teste
 * do vitest, que corre em node — a função não existe.
 *
 * Enquanto nenhum teste montou um layout, isto nunca se viu. No dia em que o
 * layout do grupo `(admin)` passou a carregar a letra do painel, o teste que
 * guarda o `<main>` do back office deixou de arrancar com `Geist is not a
 * function` — um erro que não tem nada que ver com o que esse teste mede.
 *
 * É o mesmo caso do `server-only`, que este projecto já resolve da mesma
 * maneira, com uma nota do mesmo teor no `vitest.config.ts`: um marcador de
 * compilação, apontado a um duplo para o teste poder correr.
 *
 * ── PORQUE É QUE AS FAMÍLIAS ESTÃO ESCRITAS UMA A UMA ─────────────────────
 *
 * Porque um `import { Geist }` é resolvido de forma ESTÁTICA: um `Proxy` que
 * respondesse a qualquer nome não serve, porque o nome tem de existir como
 * exportação para o import não vir vazio. A lista é, portanto, obrigatória —
 * e é por isso que existe o `duplo-das-letras.test.ts` ao lado: se alguém
 * acrescentar uma letra à aplicação e se esquecer desta lista, o teste diz-lho
 * com essas palavras, em vez de o próximo teste de layout rebentar com uma
 * mensagem que não explica nada.
 *
 * ── O QUE O DUPLO DEVOLVE ─────────────────────────────────────────────────
 *
 * A forma do verdadeiro, e não os seus valores: um nome de classe, o nome da
 * variável CSS que lhe pediram, e o `style`. Nomes reconhecíveis, para que um
 * teste que caia sobre eles diga de onde vêm.
 */

type Opcoes = {
  variable?: string;
  subsets?: string[];
  weight?: string | string[];
  style?: string | string[];
  display?: string;
  adjustFontFallback?: boolean;
  fallback?: string[];
  preload?: boolean;
};

type Letra = {
  className: string;
  variable: string;
  style: { fontFamily: string };
};

function letra(nome: string): (opcoes?: Opcoes) => Letra {
  return (opcoes: Opcoes = {}) => ({
    className: `duplo-${nome}`,
    /* O verdadeiro devolve aqui um NOME DE CLASSE que define a variável, e não
       a variável em si. O duplo faz o mesmo: quem o põe num `className` fica
       com uma classe, como ficaria em produção. */
    variable: opcoes.variable ? `duplo-${nome}-variavel` : "",
    style: { fontFamily: nome },
  });
}

export const Inter = letra("Inter");
export const Playfair_Display = letra("Playfair_Display");
export const Archivo = letra("Archivo");
export const Geist = letra("Geist");
export const Geist_Mono = letra("Geist_Mono");
export const Bodoni_Moda = letra("Bodoni_Moda");
export const Jost = letra("Jost");
