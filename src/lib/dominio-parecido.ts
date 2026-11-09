/**
 * ════════════════════════════════════════════════════════════════════════════
 * «QUERIAS DIZER @adecco.com?» — UM DOMÍNIO QUASE IGUAL A OUTRO QUE SE CONHECE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (9/11): a proposta da Adecco foi para «Vanessa.Rodrigues@addecco.com» —
 * um «d» a mais — e voltou com «Endereço não encontrado». «O sistema tem que
 * perceber logo se o e-mail existe ou não.»
 *
 * A caixa de correio ninguém a pode confirmar antes de enviar: os servidores
 * não respondem a essa pergunta. O DOMÍNIO já se confere no envio
 * (`dominio-do-email.ts`), mas «addecco.com» existe e recebe correio — por isso
 * passou. O que se apanha aqui é o engano de dedo: um domínio a uma ou duas
 * letras de um que se conhece — os dos outros clientes dela, e os de correio
 * mais comuns (gmail, hotmail, sapo…). Não trava nada: sugere, e ela decide.
 *
 * Corre no navegador, sem rede: custa zero na Vercel (regra 7).
 */

/** Os domínios de correio mais comuns em Portugal (e os de fora mais vistos). */
export const DOMINIOS_COMUNS = [
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.pt",
  "outlook.com",
  "outlook.pt",
  "live.com",
  "live.com.pt",
  "msn.com",
  "yahoo.com",
  "yahoo.com.br",
  "icloud.com",
  "me.com",
  "sapo.pt",
  "netcabo.pt",
  "clix.pt",
  "iol.pt",
  "mail.telepac.pt",
  "gmx.com",
  "gmx.net",
  "proton.me",
  "protonmail.com",
  "aol.com",
] as const;

/** O que está depois do @, em minúsculas e sem espaços. */
export function dominioDe(email: string | null | undefined): string {
  const e = (email ?? "").trim().toLowerCase();
  const i = e.lastIndexOf("@");
  return i < 1 ? "" : e.slice(i + 1);
}

/**
 * Distância de edição com trocas de letras vizinhas (Damerau–Levenshtein,
 * versão «optimal string alignment»): «addecco»→«adecco» é 1, «gmial»→«gmail»
 * é 1.
 */
export function distancia(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const linha = new Array<number>(n + 1).fill(0);
    linha[0] = i;
    return linha;
  });
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

/** Quantas letras de diferença ainda contam como engano, pelo tamanho. */
function tolerancia(dominio: string): number {
  return dominio.length >= 9 ? 2 : 1;
}

/**
 * O email corrigido, quando o domínio está a uma ou duas letras de um
 * conhecido; `null` quando o domínio é ele próprio conhecido, ou não se parece
 * com nenhum.
 *
 * `conhecidos`: os domínios dos outros pedidos (os da casa valem mais do que a
 * lista comum, e vêm primeiro). Um domínio que já aparece nos conhecidos nunca
 * é «engano» — é um cliente.
 */
export function sugerirEmail(
  email: string | null | undefined,
  conhecidos: Iterable<string> = [],
): string | null {
  const e = (email ?? "").trim();
  const dominio = dominioDe(e);
  if (!dominio || !dominio.includes(".")) return null;
  const candidatos = [...new Set([...conhecidos, ...DOMINIOS_COMUNS].map((d) => d.toLowerCase()))];
  if (candidatos.includes(dominio)) return null;
  let melhor: { dominio: string; dist: number } | null = null;
  for (const c of candidatos) {
    if (!c || Math.abs(c.length - dominio.length) > 2) continue;
    const dist = distancia(dominio, c);
    if (dist === 0 || dist > tolerancia(c)) continue;
    if (!melhor || dist < melhor.dist) melhor = { dominio: c, dist };
  }
  if (!melhor) return null;
  return `${e.slice(0, e.lastIndexOf("@"))}@${melhor.dominio}`;
}

/**
 * Os domínios dos emails dos pedidos, sem o do pedido que se está a ver (senão
 * o próprio engano passava a «conhecido»). Um domínio só conta se aparecer em
 * pedidos de pelo menos `minimo` pessoas diferentes — um engano repetido uma
 * vez não se torna regra.
 */
export function dominiosConhecidos(
  emails: Iterable<string | null | undefined>,
  semEste?: string | null,
  minimo = 1,
): string[] {
  const fora = dominioDe(semEste);
  const contagem = new Map<string, number>();
  for (const email of emails) {
    const d = dominioDe(email);
    if (!d || !d.includes(".")) continue;
    contagem.set(d, (contagem.get(d) ?? 0) + 1);
  }
  // O do pedido aberto conta-se a si próprio uma vez: tira-se essa.
  if (fora && contagem.has(fora)) contagem.set(fora, (contagem.get(fora) ?? 1) - 1);
  return [...contagem]
    .filter(([, n]) => n >= minimo)
    .sort((a, b) => b[1] - a[1])
    .map(([d]) => d);
}
