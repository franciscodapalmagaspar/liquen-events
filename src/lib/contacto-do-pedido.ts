import {
  AsYouType,
  Metadata,
  getCountries,
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/max";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CONTACTO DE QUEM PEDE UM ORÇAMENTO — a regra, num sítio só
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (28/10): chegou um pedido com o email mal escrito («candmcasmento…» em
 * vez do que a pessoa queria), a confirmação nunca chegou, e não havia mais
 * por onde lhe responder. Decidiu: no formulário completo, o email passa a ser
 * obrigatório.
 *
 * Ela (30/10): «quero que o sistema detete e não deixe enviar emails que não
 * existem ou números de telefone seja qual país for». Para o telefone pediu a
 * bandeira e o número, com Portugal já escolhido, e conferido com as regras do
 * país escolhido; e em todo o lado, no site e no back office.
 *
 * ── O TELEFONE, DE QUALQUER PAÍS ────────────────────────────────────────────
 *
 * Até aqui a regra era caseira: rigorosa para Portugal (9 dígitos a começar
 * por 9, 2 ou 3) e, para os outros, «8 a 15 dígitos» — que deixava passar um
 * número espanhol com um dígito a menos ou um brasileiro sem o 9 do móvel.
 *
 * Passa a ser a `libphonenumber-js`, a versão em JavaScript das regras que o
 * Google mantém para todos os países (prefixos, quantos dígitos, móvel ou
 * fixo). Com os metadados COMPLETOS (`/max`): os pequenos só contam dígitos, e
 * contar dígitos é a regra caseira outra vez.
 *
 *   · com «+» ou «00», o país vem do próprio número;
 *   · sem eles, conta o país escolhido na bandeira (Portugal por omissão — é o
 *     que o servidor assume quando um pedido chega sem «+»).
 *
 * O que se grava é sempre E.164 (`+351912345678`): é a forma que o WhatsApp, a
 * Meta e o Google Ads já aceitam, e a que diz o país sem mais nada ao lado.
 *
 * ── O MESMO FICHEIRO NO BROWSER E NO SERVIDOR ───────────────────────────────
 *
 * O servidor importa isto directamente (`validation.ts`, as rotas). O browser
 * NÃO: as regras pesam ~150 KB e o formulário abre sem elas — o
 * `telefone-no-browser.ts` carrega ESTE módulo com `import()` quando a pessoa
 * toca no campo. É de propósito o mesmo ficheiro: duas regras parecidas
 * acabavam a discordar, e o pior caso é o browser dizer «está bem» e o
 * servidor recusar depois do clique.
 *
 * O `sugestaoDeEmail` mudou-se para `sugestao-de-email.ts` pela mesma razão (o
 * formulário precisa dele logo, sem os telefones atrás), e continua a sair
 * daqui para quem já o importava deste sítio.
 */

export { sugestaoDeEmail } from "./sugestao-de-email";

export type Pais = CountryCode;

/** O país que se assume quando o número vem sem «+». */
export const PAIS_POR_OMISSAO: Pais = "PT";

/**
 * Os separadores que se aceitam no meio de um número. Tudo o resto (letras, um
 * `@`, «ext. 2») recusa o número inteiro: a biblioteca é generosa e lê
 * «912345678a» como um número válido, e um telefone com uma letra lá dentro é
 * um engano que se quer apanhar, não arrumar.
 */
const SO_NUMERO = /^[+\d\s.\-()/]+$/;
const SEPARADORES = /[\s.\-()/]/g;

/** O texto sem separadores, com o «00» internacional escrito como «+». */
function compactar(bruto: string): string | null {
  const limpo = (bruto ?? "").trim();
  if (!limpo || !SO_NUMERO.test(limpo)) return null;
  let c = limpo.replace(SEPARADORES, "");
  if (c.startsWith("00")) c = `+${c.slice(2)}`;
  // Um «+» que não está à frente não é um indicativo: é um engano.
  if (c.lastIndexOf("+") > 0) return null;
  return c || null;
}

function paisOuOmissao(pais: string | undefined): Pais {
  return pais && isSupportedCountry(pais) ? (pais as Pais) : PAIS_POR_OMISSAO;
}

/**
 * O número em E.164 (`+351912345678`), ou `null` se não for um número que
 * exista com as regras do país.
 *
 * `pais` é o país escolhido na bandeira; só conta quando o número vem sem «+».
 */
export function normalizarTelefone(bruto: string, pais: string = PAIS_POR_OMISSAO): string | null {
  const c = compactar(bruto);
  if (!c) return null;
  const lido = parsePhoneNumberFromString(c, paisOuOmissao(pais));
  return lido?.isValid() ? lido.number : null;
}

/** O indicativo do país, sem o «+» («351»). */
export function indicativoDe(pais: string): string {
  return getCountryCallingCode(paisOuOmissao(pais));
}

/** Todos os países que a biblioteca conhece, com o indicativo. */
export function paisesComIndicativo(): { pais: Pais; indicativo: string }[] {
  return getCountries().map((pais) => ({ pais, indicativo: getCountryCallingCode(pais) }));
}

/**
 * O país PRINCIPAL de um indicativo partilhado: o +1 é dos EUA (e do Canadá, e
 * de vinte ilhas), o +44 é do Reino Unido (e de Guernsey, Jersey, Man). São os
 * metadados que dizem qual é o principal; o método existe, só não vem nas
 * declarações de tipos da biblioteca.
 */
function paisPrincipalDe(indicativo: string): Pais | undefined {
  const m = new Metadata() as unknown as {
    getCountryCodeForCallingCode?: (c: string) => Pais | undefined;
  };
  return m.getCountryCodeForCallingCode?.(indicativo);
}

/**
 * Tira o indicativo da frente do texto como a pessoa o escreveu («+55 11
 * 91234-5678» → «11 91234-5678»), sem lhe mexer no resto. Os separadores entre
 * os dígitos do indicativo saltam-se.
 */
function semIndicativo(texto: string, indicativo: string): string {
  const t = texto.trim();
  const inicio = /^\(?\s*(?:\+|00)/.exec(t);
  if (!inicio) return t;
  let i = inicio[0].length;
  let falta = indicativo.length;
  while (i < t.length && falta > 0) {
    if (/\d/.test(t[i])) falta--;
    i++;
  }
  return t.slice(i).replace(/^[\s).\-/]+/, "");
}

/**
 * De que país é um número escrito com «+» ou «00»?
 *
 * É o que deixa a bandeira mudar sozinha quando a pessoa cola «+44 …»: devolve
 * o país e o resto do número já sem o indicativo, para o campo ficar com a
 * bandeira certa e o número nacional ao lado. `null` enquanto o indicativo
 * ainda não está completo («+3» pode ser meia Europa), ou quando não é de país
 * nenhum (+800, os números internacionais gratuitos).
 */
export function paisDoNumero(texto: string): { pais: Pais; numero: string } | null {
  const c = compactar(texto);
  if (!c || !c.startsWith("+")) return null;
  const lido = parsePhoneNumberFromString(c);
  if (lido?.isValid() && lido.country) {
    return { pais: lido.country, numero: lido.formatNational() };
  }
  const aEscrever = new AsYouType();
  aEscrever.input(c);
  const indicativo = aEscrever.getCallingCode();
  if (!indicativo) return null;
  const pais = aEscrever.getCountry() ?? paisPrincipalDe(indicativo);
  if (!pais) return null;
  return { pais, numero: semIndicativo(texto, indicativo) };
}

/**
 * Um telefone GRAVADO, partido em bandeira e número, para o campo o mostrar.
 *
 * Um E.164 válido sai com o país dele e o número no formato do país («912 345
 * 678»). Um número antigo sem «+» fica português e como estava escrito — os
 * pedidos antigos não mudam de forma só por se abrirem.
 */
export function separarTelefone(valor: string): { pais: Pais; numero: string } {
  const t = (valor ?? "").trim();
  if (!t) return { pais: PAIS_POR_OMISSAO, numero: "" };
  const doNumero = paisDoNumero(t);
  if (doNumero) return doNumero;
  const lido = parsePhoneNumberFromString(compactar(t) ?? "", PAIS_POR_OMISSAO);
  if (lido?.isValid() && lido.country) return { pais: lido.country, numero: lido.formatNational() };
  return { pais: PAIS_POR_OMISSAO, numero: t };
}

/**
 * O país de um número já em E.164, quando é válido. Serve para acertar a
 * bandeira nos indicativos partilhados: escolhe-se o +1 e aparecem os EUA, mas
 * um 416… é de Toronto.
 */
export function paisDoE164(e164: string): Pais | null {
  const lido = parsePhoneNumberFromString(e164);
  return lido?.isValid() && lido.country ? lido.country : null;
}

/**
 * Um telefone para LER («+351 912 345 678»): o E.164 junta os dígitos todos,
 * e é assim que se grava, mas não é assim que uma pessoa confere um número.
 * O que não é válido sai como está.
 */
export function telefoneParaLer(valor: string): string {
  const c = compactar(valor);
  const lido = c ? parsePhoneNumberFromString(c, PAIS_POR_OMISSAO) : undefined;
  return lido?.isValid() ? lido.formatInternational() : (valor ?? "").trim();
}
