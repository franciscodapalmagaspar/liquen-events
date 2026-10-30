/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EMAIL COM O DOMÍNIO MAL ESCRITO — «Quis dizer ana@gmail.com?»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Saiu de `contacto-do-pedido.ts` (30/10) por uma razão só: esse ficheiro
 * passou a trazer as regras dos telefones de todos os países
 * (`libphonenumber-js`, ~150 KB), e o formulário do site precisa disto LOGO no
 * primeiro desenho. Puro e sem dependências, como sempre foi, para o browser o
 * poder perguntar sem levar as regras dos telefones atrás. O
 * `contacto-do-pedido.ts` volta a exportá-lo, para o servidor e os testes
 * continuarem a encontrá-lo no mesmo sítio.
 */

// ── O EMAIL: domínios mal escritos ─────────────────────────────────────────
//
// O engano que chegou estava ANTES do @ — isso nenhuma máquina apanha, e é por
// isso que o formulário mostra os contactos para confirmar antes de enviar.
// Mas o outro engano comum é DEPOIS do @ («gmial.com», «hotmal.com»), e esse
// apanha-se: sugere-se o domínio certo, sem o trocar sozinho.

const DOMINIOS = [
  "gmail.com",
  "hotmail.com",
  "hotmail.pt",
  "outlook.com",
  "outlook.pt",
  "live.com.pt",
  "live.com",
  "icloud.com",
  "me.com",
  "yahoo.com",
  "sapo.pt",
  "netcabo.pt",
  "msn.com",
  "protonmail.com",
] as const;

/** Distância de edição (inserir, apagar, trocar uma letra, ou trocar duas vizinhas). */
function distancia(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/**
 * O email com o domínio corrigido («ana@gmail.com» para «ana@gmial.com»), ou
 * `null` quando o domínio já é um dos conhecidos ou não se parece com nenhum.
 */
export function sugestaoDeEmail(email: string): string | null {
  const e = (email ?? "").trim();
  const arroba = e.lastIndexOf("@");
  if (arroba < 1) return null;
  const local = e.slice(0, arroba);
  const dominio = e.slice(arroba + 1).toLowerCase();
  if (!dominio || (DOMINIOS as readonly string[]).includes(dominio)) return null;
  let melhor: string | null = null;
  let menor = Infinity;
  for (const d of DOMINIOS) {
    const n = distancia(dominio, d);
    if (n < menor) {
      menor = n;
      melhor = d;
    }
  }
  // Até 2 enganos num domínio comprido; 1 num curto (evita «me.com» → «msn.com»).
  const limite = dominio.length >= 8 ? 2 : 1;
  return melhor && menor > 0 && menor <= limite ? `${local}@${melhor}` : null;
}
