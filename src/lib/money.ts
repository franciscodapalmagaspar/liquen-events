/**
 * Fonte única para a matemática e a formatação de valores monetários.
 *
 * Módulo *client-safe* de propósito: NÃO importa `server-only`, `./repository`,
 * `fs` nem nada exclusivo do Node. Assim tanto os componentes de cliente
 * (ex.: Faturas.tsx) como o código de servidor (invoices-store, rotas, PDFs)
 * partilham exactamente as mesmas funções — sem cópias que possam divergir.
 *
 * Mesmo padrão de `inventory-types.ts` (client-safe) re-exportado por
 * `inventory-store.ts` (server-only).
 */

/**
 * Arredonda um valor aos cêntimos (2 casas decimais), com o meio cêntimo a
 * subir — que é a regra do arredondamento comercial e a que a factura assume.
 *
 * ── PORQUE É QUE ISTO NÃO É `Math.round(n * 100) / 100` ────────────────────
 * Era. E `Math.round(1.005 * 100) / 100` dá 1,00, não 1,01. Não é um erro do
 * `Math.round`: é que 1,005 NÃO EXISTE em vírgula flutuante — o número que lá
 * está é 1,00499999999999989, e esse arredonda mesmo para baixo. O mesmo
 * acontece com 2,675, com 8,615 e com qualquer valor cujo terceiro decimal
 * seja um 5 exacto, que é precisamente o que sai de multiplicar uma base por
 * uma taxa de IVA.
 *
 * Um IVA de 1,005 € facturado como 1,00 € é um cêntimo a menos entregue ao
 * Estado, e uma factura em que as parcelas não fecham o total é uma conversa
 * com o contabilista. Por isso empurra-se o valor uma fracção infinitesimal
 * para longe do zero antes de arredondar: o empurrão (quatro épsilons
 * relativos, ~1e-13 do valor) é maior do que o erro de representação e muito
 * menor do que meio cêntimo, por isso só muda o resultado nos casos que
 * ESTAVAM a cair para o lado errado.
 *
 * Nos negativos o empurrão vai para baixo, para o meio cêntimo se afastar do
 * zero dos dois lados (−1,005 → −1,01). Uma margem negativa arredonda como o
 * seu simétrico.
 */
export function round2(n: number): number {
  const emCentimos = n * 100;
  const empurrao = Math.abs(emCentimos) * Number.EPSILON * 4;
  return Math.round(emCentimos + (emCentimos < 0 ? -empurrao : empurrao)) / 100;
}

/**
 * A percentagem de sinal da casa, quando a proposta não diz outra coisa.
 *
 * Era uma constante escondida dentro de `splitThirtySeventy` e dentro de um
 * `sinal / 3 * 7` numa rota de facturas. Passa a ter nome, para os sítios que
 * a usam poderem ser encontrados.
 */
export const SINAL_POR_OMISSAO = 30;

/**
 * Divide o total de um evento no sinal e no saldo, arredondados aos cêntimos.
 *
 * O saldo é obtido por SUBTRACÇÃO e não por `total × (100−pct)`: assim as duas
 * parcelas somam sempre exactamente o total, mesmo quando o arredondamento do
 * sinal come um cêntimo. Uma factura em que as parcelas não fecham o total é
 * uma conversa com o contabilista.
 */
export function splitSinal(
  total: number,
  percentagem: number = SINAL_POR_OMISSAO,
): { sinal: number; saldo: number } {
  const t = round2(Math.max(0, total));
  const pct = Math.min(100, Math.max(0, percentagem));
  // `round2` e não um `Math.round` escrito à mão: o meio cêntimo tem de subir
  // aqui exactamente como sobe em todo o resto do dinheiro. Enquanto foram
  // duas contas diferentes, o sinal que o estúdio mostrava e o IVA que a
  // factura calculava podiam arredondar para lados opostos no mesmo valor.
  const sinal = round2(t * (pct / 100));
  const saldo = round2(t - sinal);
  return { sinal, saldo };
}

/**
 * O saldo a partir do SINAL JÁ FACTURADO, quando não há proposta para o
 * confirmar.
 *
 * Generaliza o `sinal / 3 × 7` que estava escrito à mão em
 * `/api/faturas/[id]` — com 30% dá exactamente o mesmo número. Existe porque,
 * assim que a percentagem passa a ser configurável, `/3×7` deixa de ser uma
 * simplificação e passa a ser uma conta errada.
 *
 * ── O QUE ESTA CONTA NÃO CONSEGUE SABER ────────────────────────────────────
 * O sinal já foi arredondado quando foi facturado, e este arredondamento
 * é AMPLIFICADO pela reconstrução na proporção `(100−pct)/pct`. Aos 30% da
 * casa o factor é 7/3 e o desvio máximo é pouco mais de um cêntimo — foi por
 * isso que ninguém deu por ele durante anos. A 1%, o factor é 99 e meio
 * cêntimo escondido no sinal torna-se cerca de meio EURO no saldo.
 *
 * Não há maneira de o evitar sem o total; o que se pode fazer, e se faz, é
 * reconstruir primeiro o TOTAL e tirar-lhe o sinal por subtracção. Assim as
 * duas parcelas fecham sempre, ao cêntimo, o total reconstruído — nunca sobra
 * um cêntimo entre elas. Quem tem o total à mão deve usar {@link splitSinal},
 * que é exacto; isto é a rede para quando a proposta já não existe.
 */
export function saldoAPartirDoSinal(
  sinal: number,
  percentagem: number = SINAL_POR_OMISSAO,
): number {
  const pct = Math.min(99.99, Math.max(0.01, percentagem));
  const totalReconstruido = round2((sinal * 100) / pct);
  return round2(totalReconstruido - sinal);
}

/** @deprecated Use {@link splitSinal}. Mantido porque é lido em vários sítios. */
export function splitThirtySeventy(total: number): { sinal: number; saldo: number } {
  return splitSinal(total, SINAL_POR_OMISSAO);
}

/**
 * ── UM FORMATADOR SÓ, E NÃO UM POR NÚMERO (9/11) ──────────────────────────
 * Criavam um `Intl.NumberFormat` novo em CADA chamada. Criar um custa dezenas
 * de vezes mais do que usá-lo, e há ecrãs com centenas de valores — o quadro
 * dos Pagamentos chama isto 5 a 8 vezes por cartão, de cada vez que se abre ou
 * fecha um cliente. Ela: «quando se carrega num cliente está super travada».
 * O texto que sai é o mesmo: as mesmas opções, o mesmo idioma.
 */
const EUR2 = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});
const EUR0 = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/** Formatador de euros pt-PT com 2 casas decimais (ex.: "1234,50 €"). */
export const eur = (n: number): string => EUR2.format(n || 0);

/** Formatador de euros pt-PT sem casas decimais (ex.: "1235 €"). */
export const eur0 = (n: number): string => EUR0.format(n || 0);

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DINHEIRO NOS PAPÉIS QUE O CLIENTE LÊ — E PORQUE É QUE NÃO É O `eur`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `Intl` de pt-PT tem duas manias que ninguém em Portugal tem:
 *
 *   1. só agrupa milhares a partir de CINCO dígitos — 24 600 sai «24 600,00 €»
 *      e 4 600 sai «4600,00 €», sem separador nenhum;
 *   2. agrupa com um espaço INQUEBRÁVEL, nunca com o ponto que toda a gente
 *      escreve à mão.
 *
 * As duas juntas davam isto, TUDO na mesma coluna de uma factura de 24 600 €:
 *
 *     Base de incidência   20 000,00 €
 *     IVA (23%)             4600,00 €     ← um sem separador, entre dois com
 *     TOTAL                24 600,00 €
 *
 * E davam, entre o PDF da proposta e o email que o transporta, «7.890,00 €» num
 * e «7890,00 €» no outro — dois números para o mesmo valor, à distância de um
 * clique. É o género de pormenor que faz um casal olhar duas vezes para uma
 * folha de dinheiro e perguntar se os números vieram de sítios diferentes.
 * (Vieram: uns são dela, outros são contas nossas. Não se deve notar.)
 *
 * `useGrouping: "always"` mata a primeira mania; o {@link milharesComPonto} mata
 * a segunda.
 *
 * ── PORQUE É QUE ISTO NÃO SUBSTITUI O `eur` ────────────────────────────────
 * Nasceu como `eurDoc`, privado do `proposal-doc-pdf`, com a nota de que era
 * «uma decisão tipográfica DESTE documento, não uma mudança na forma como a
 * aplicação inteira mostra dinheiro». O raciocínio mantém-se — o que mudou foi
 * o âmbito: não é um documento, são TODOS os artefactos que saem para o
 * cliente (os dois PDFs de proposta, o PDF da factura, os emails que os
 * levam). Esses escrevem todos igual, e escrevem como ela escreve à mão.
 *
 * O back office continua com o {@link eur}: são dezenas de ecrãs internos onde
 * o formato do `Intl` nunca incomodou ninguém, e mudá-los é uma decisão de
 * produto, não a correcção de um defeito que o cliente vê. Se um dia se quiser
 * unificar, unifica-se apontando o `eur` para aqui — não copiando isto para lá.
 *
 * ── O ESPAÇO ANTES DO «€» FICA ─────────────────────────────────────────────
 * Só o separador de MILHARES vira ponto. O espaço antes do símbolo continua
 * inquebrável, e é isso que impede o «€» de cair sozinho para a linha seguinte
 * num email estreito ou no fim de uma coluna do PDF.
 *
 * ── E É DESENHÁVEL ─────────────────────────────────────────────────────────
 * A factura e a proposta antiga desenham-se com as fontes-PADRÃO do pdf-lib
 * (Helvetica/WinAnsi), e o `drawText` LANÇA no que essa codificação não tem.
 * Os três caracteres em jogo passam: o ponto é ASCII, o espaço inquebrável é
 * 0xA0 (Latin-1) e o «€» é 0x80 no CP1252. Um separador «tipograficamente
 * bonito» (U+2009, U+202F) rebentava o PDF — ver `pdf-text.ts`.
 */
/**
 * Um montante escrito SEM separador nenhum — «7890,00 €».
 *
 * O `Intl` não põe separador abaixo de cinco dígitos, portanto um total
 * gerado (ou escrito à mão) nos milhares baixos chega aqui sem nada para
 * trocar. Reconhece-se pelo «€» que vem a seguir, e é isso que torna a regra
 * segura: um ano («2026»), um número de documento («FT 2026/0007») ou uma
 * contagem de convidados não têm um símbolo de euro colado atrás. O que não
 * parece dinheiro não é tocado.
 *
 * Quatro dígitos ou mais, de propósito: 999 não leva separador em português
 * nenhum, e um valor JÁ pontuado («12.300,00 €») não tem nenhuma corrida de
 * quatro dígitos seguidos — por isso passar duas vezes por aqui não faz mal.
 */
const MONTANTE_SEM_SEPARADOR = /\d{4,}(?=(?:[.,]\d+)?\s*\u20AC)/g;

export function milharesComPonto(texto: string): string {
  return texto
    .replace(/\u00A0(?=\d{3}(?:\D|$))/g, ".")
    .replace(MONTANTE_SEM_SEPARADOR, (inteiros) => inteiros.replace(/\B(?=(\d{3})+$)/g, "."));
}

/**
 * Euros como se escrevem no que sai para o cliente: "4.600,00 €".
 *
 * Milhares por pontos a partir de quatro dígitos (999 não leva separador),
 * cêntimos por vírgula, e o espaço inquebrável antes do símbolo.
 *
 * A `moeda` existe porque a proposta antiga guarda a sua (`Proposal.currency`)
 * e desenhava-a: hoje é sempre "EUR", mas uma proposta gravada noutra moeda não
 * pode passar a dizer euros por causa desta mudança. A pontuação é a mesma seja
 * qual for o símbolo — quem lê a folha lê-a em português.
 */
export const eurDocumento = (n: number, moeda = "EUR"): string =>
  milharesComPonto(
    new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: moeda,
      maximumFractionDigits: 2,
      useGrouping: "always",
    }).format(n || 0),
  );

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DINHEIRO NA FOLHA INGLESA — «4.600,00 €» → «€4,600.00»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Decisão da dona da casa: numa proposta inglesa o dinheiro escreve-se à
 * inglesa, com o símbolo à frente. A folha portuguesa não muda nada.
 *
 * ── PORQUE É QUE ISTO TRABALHA SOBRE TEXTO, E NÃO SOBRE NÚMEROS ───────────
 *
 * Seria mais limpo formatar o número na origem. Só que METADE do dinheiro
 * desta folha nunca foi número nosso: o «Valor Total», os valores adicionais e
 * o preço estimado do modelo de Organização são CAMPOS LIVRES que ela escreve
 * («2.950,79 €», «a partir de 4.600,00 €»). Converter só as nossas contas
 * punha «€4,600.00» e «4.600,00 €» na mesma coluna do mesmo quadro — que é
 * pior do que não converter nada, porque parece que os números vieram de
 * sítios diferentes. Vieram; não se deve notar.
 *
 * ── COMO SE RECONHECE UM MONTANTE SEM ENGANO ──────────────────────────────
 *
 * Pelo SÍMBOLO DE MOEDA colado a ele, que é a mesma regra de segurança do
 * {@link milharesComPonto}: um ano («2026»), uma referência («LIQ-2026-0007»),
 * uma contagem de convidados ou uma data não têm um «€» atrás, e por isso não
 * são tocados. O que não parece dinheiro fica exactamente como ela o escreveu.
 *
 * ── OS CÊNTIMOS APARECEM ──────────────────────────────────────────────────
 *
 * «2500 €» sai «€2,500.00». Numa folha de dinheiro as colunas alinham pelos
 * cêntimos, e um valor sem eles fica a discordar dos vizinhos.
 *
 * ── E CONTINUA DESENHÁVEL ─────────────────────────────────────────────────
 *
 * Os três caracteres em jogo existem na codificação WinAnsi com que o pdf-lib
 * desenha (a vírgula e o ponto são ASCII, o «€» é 0x80 no CP1252), e o
 * resultado já não tem espaço nenhum entre o símbolo e o número — portanto
 * desaparece também o risco de o «€» cair sozinho para a linha seguinte.
 */
const MONTANTE_PT = /(-?)(\d[\d.   ]*?)(?:,(\d{1,2}))?\s*([€$£])/g;

/** A vírgula decimal de uma percentagem («23,5%»), que em inglês é ponto. */
const PERCENTAGEM_PT = /(\d+),(\d+)(?=\s*%)/g;

export function montantesEmIngles(texto: string): string {
  return texto
    .replace(
      MONTANTE_PT,
      (_todo, sinal: string, inteiros: string, centimos: string | undefined, simbolo: string) => {
        const digitos = inteiros.replace(/[^\d]/g, "");
        if (!digitos) return _todo;
        const agrupados = digitos.replace(/\B(?=(\d{3})+$)/g, ",");
        return `${sinal}${simbolo}${agrupados}.${(centimos ?? "").padEnd(2, "0")}`;
      },
    )
    .replace(PERCENTAGEM_PT, "$1.$2");
}

/** O montante na língua do documento. Em português, nada muda. */
export function montanteNaLingua(texto: string, idioma: "pt" | "en"): string {
  return idioma === "en" ? montantesEmIngles(texto) : texto;
}
