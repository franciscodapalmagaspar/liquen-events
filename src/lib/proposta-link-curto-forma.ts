import { randomInt } from "node:crypto";

/**
 * A FORMA dos códigos curtos das propostas: o alfabeto, os comprimentos, como
 * se cunha um código e como se lê de um endereço. Funções puras, sem
 * armazenamento — o armazenamento está em `proposta-link-curto.ts` (que
 * reexporta isto) e em `ligacoes-de-proposta-tabela.ts`. Saiu de lá a 18/11
 * para o ficheiro não passar das 400 linhas (regra `codigo.md`).
 */

/** Crockford base32, minúsculas: sem `i`, `l`, `o` nem `u`. */
const ALFABETO = "0123456789abcdefghjkmnpqrstvwxyz";

/**
 * Quantos símbolos tem um código NOVO: 8 × 5 bits = 40 bits.
 *
 * ── PORQUE É QUE PASSOU DE 16 A 8 (pedido dela, 25/10) ────────────────────
 *
 * «Gostava que aqui ficasse o nome dos noivos e não estas palavras todas
 * manhosas.» O endereço passa a `/proposta/ana-e-joao-k7m2q9xd`: os nomes à
 * frente (só para o olho — não abrem nada) e o código no fim, que continua a
 * ser a chave. Ela escolheu isto depois de lhe dizer que só os nomes deixavam
 * qualquer pessoa abrir a proposta de um casal adivinhando-os.
 *
 * Quarenta bits sozinhos adivinham-se com paciência; por isso os códigos de 8
 * têm um tecto de tentativas por IP (`TENTATIVAS_POR_MINUTO`) que os de 16 não
 * precisam. Com esse tecto, adivinhar fica fora do alcance de qualquer pessoa.
 */
export const COMPRIMENTO_DO_CODIGO = 12;

/**
 * ── E PORQUE É QUE PASSOU DE 8 A 12 (decisão dela, 10/11) ─────────────────
 *
 * Numa revisão de segurança: 40 bits com um tecto POR IP param uma pessoa,
 * mas não quem tenta de muitos endereços ao mesmo tempo — e um acerto mostra a
 * proposta inteira de um casal. Doze símbolos são 60 bits: um milhão de vezes
 * mais códigos, fora do alcance de qualquer busca, e o endereço continua curto
 * (os nomes à frente ficam). Ela escolheu «Sim, mais compridas».
 *
 * Os de 8 já enviados (25/10 a 10/11) continuam a abrir, com o tecto de
 * tentativas de sempre.
 */
export const COMPRIMENTO_DE_8 = 8;

/** Os códigos emitidos antes de 25/10 têm 16 símbolos (80 bits) e continuam a abrir. */
export const COMPRIMENTO_ANTIGO = 16;

/**
 * Um código novo, sem viés.
 *
 * ── PORQUE É QUE ISTO NÃO É `randomBytes()[i] % 32` ───────────────────────
 *
 * Era, e estava CERTO: o resto de 256 por 32 é zero, portanto ler cada byte
 * módulo 32 é uniforme — não há aqui o enviesamento clássico de mapear 0-255
 * para um alfabeto que não divide 256.
 *
 * A análise de segurança do GitHub não faz essa conta: vê um `%` sobre uma
 * fonte criptográfica e levanta um alerta de severidade alta («creating biased
 * random numbers from a cryptographically secure source»). O achado era falso —
 * e um aviso alto que se explica de cada vez que aparece é um aviso que um dia
 * se ignora quando for verdadeiro. É a mesma razão por que o marcador das fotos
 * deixou de se chamar `token` (ver `ThemePicker.tsx`).
 *
 * O `randomInt` não tem resto nenhum para enviesar: pede um número dentro da
 * gama e rejeita internamente o que não cabe. Custa dezasseis chamadas por
 * código, o que é nada, e não precisa de defesa escrita.
 */
export function codigoNovo(): string {
  let saida = "";
  for (let i = 0; i < COMPRIMENTO_DO_CODIGO; i += 1) saida += ALFABETO[randomInt(ALFABETO.length)];
  return saida;
}

/** Isto tem a forma de um código curto? Serve para distinguir do token, que é
 *  muito mais comprido e traz pontos. */
export function pareceCodigoCurto(valor: unknown): boolean {
  const v = String(valor ?? "");
  return (
    (v.length === COMPRIMENTO_DO_CODIGO ||
      v.length === COMPRIMENTO_DE_8 ||
      v.length === COMPRIMENTO_ANTIGO) &&
    /^[0-9a-z]+$/.test(v)
  );
}

/**
 * O código dentro de um segmento de endereço, ou `null`.
 *
 *   `ana-e-joao-k7m2q9xd`  → `k7m2q9xd`  (o formato novo: nomes + código)
 *   `njwwrj4m7tyz6x62`     → o próprio   (os 16 de antes, sem nomes)
 *
 * O código é o que vem depois do ÚLTIMO hífen; os nomes não contam para nada,
 * e por isso um link continua a abrir se os nomes da proposta mudarem depois.
 * Um token assinado tem pontos, maiúsculas e `_`, e nunca passa por aqui.
 */
export function codigoDoEndereco(segmento: unknown): string | null {
  const s = String(segmento ?? "");
  if (!/^[0-9a-z]+(?:-[0-9a-z]+)*$/.test(s)) return null;
  const codigo = s.slice(s.lastIndexOf("-") + 1);
  return pareceCodigoCurto(codigo) ? codigo : null;
}

/**
 * Os nomes para o endereço: «Ana & João» → `ana-e-joao`. Sem acentos (um
 * endereço com «ã» copiado para certos clientes de email parte-se), minúsculas,
 * e no máximo ~40 caracteres, cortados num hífen. Sem nomes, `proposta`.
 */
export function nomesNoEndereco(nomes: unknown): string {
  const base = String(nomes ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!base) return "proposta";
  if (base.length <= 40) return base;
  const corte = base.slice(0, 41);
  const ultimo = corte.lastIndexOf("-");
  return (ultimo > 10 ? corte.slice(0, ultimo) : base.slice(0, 40)).replace(/-+$/g, "");
}
