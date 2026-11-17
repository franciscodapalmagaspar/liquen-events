/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O FILTRO DE CONTEÚDO DO FORMULÁRIO — A TERCEIRA CAMADA DO ANTI-SPAM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pedido do Francisco, 17/11 (`docs/LEGAL-FORMULARIO.md`, ponto 4): recusar
 * mensagens com várias ligações, palavras típicas de spam, alfabetos que não
 * são latinos e domínios de topo usados quase só por spam.
 *
 * ── O ERRO QUE AQUI NÃO SE PODE COMETER ───────────────────────────────────
 * Quando isto diz «spam», a rota FINGE sucesso e o pedido perde-se em
 * silêncio: ninguém da casa o vê, e a pessoa julga que foi enviado. Por isso
 * cada regra só dispara com sinais que um casal verdadeiro não dá, e na
 * dúvida deixa passar — um robô a mais na caixa custa um clique, um casamento
 * perdido não se recupera. Concretamente:
 *
 *   · as ligações a Pinterest, Instagram, Google Maps, YouTube, WeTransfer…
 *     não contam: é assim que os noivos mostram o que querem;
 *   · «casino» sozinho não é spam — o Casino Estoril é um sítio de
 *     casamentos. Só as expressões compostas («online casino», «casino
 *     bonus»);
 *   · «SEO», «traffic», «ranking» só contam aos pares;
 *   · um alfabeto não latino só conta quando é a maior parte das letras: um
 *     nome em grego ou um «谢谢» no fim não fazem de ninguém um robô.
 *
 * Função pura, sem rede, sem estado: `conteudo.test.ts` tem os casos
 * verdadeiros e os falsos.
 */

export type MotivoDeSpam =
  | "ligacoes"
  | "dominio-de-spam"
  | "palavras-de-spam"
  | "alfabeto"
  | "ligacao-no-nome";

/** Os campos de texto livre que um pedido traz (os que o robô enche). */
export interface TextoDoPedido {
  nome?: string;
  mensagem?: string;
  outros?: string[];
}

/** Domínios de topo usados quase só por spam (lista da Palumen, `lib/contacto/spam.ts`). */
const TLD_DE_SPAM = new Set([
  "ru",
  "su",
  "xyz",
  "top",
  "click",
  "loan",
  "work",
  "icu",
  "buzz",
  "cn",
  "bid",
  "win",
  "date",
  "stream",
  "review",
  "gq",
  "tk",
  "ml",
  "cf",
  "ga",
]);

/** Domínios que os noivos usam para mostrar inspiração e partilhar ficheiros. */
const DOMINIOS_DE_CONFIANCA = [
  "pinterest.",
  "pin.it",
  "instagram.com",
  "instagr.am",
  "facebook.com",
  "fb.me",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "google.",
  "goo.gl",
  "maps.app.goo.gl",
  "wetransfer.com",
  "we.tl",
  "dropbox.com",
  "icloud.com",
  "canva.com",
  "liquen-events.com",
  "whatsapp.com",
  "wa.me",
];

/** Uma só destas basta: nenhum pedido de evento as usa. */
const PALAVRAS_FORTES = [
  /\bviagra\b/,
  /\bcialis\b/,
  /\bbacklinks?\b/,
  /\bdofollow\b/,
  /\bguest ?posts?\b/,
  /\bbitcoin\b/,
  /\bcrypto(currency)?\b/,
  /\bforex\b/,
  /\bonline casino\b/,
  /\bcasino (bonus|online)\b/,
  /\bporn/,
  /\bescort service/,
  /\bseo (services?|agency|expert)\b/,
  /\bsearch engine optimi[sz]ation\b/,
  /\bfirst page (of|on) google\b/,
  /\brank(ing)? your (website|site)\b/,
  /\bdomain authority\b/,
  /\bpayday loans?\b/,
];

/** Estas só contam aos pares (duas diferentes). */
const PALAVRAS_FRACAS = [
  /\bseo\b/,
  /\btraffic\b/,
  /\branking\b/,
  /\bleads?\b/,
  /\boutsourcing\b/,
  /\bmarketing services\b/,
  /\bweb ?design services\b/,
  /\bunsubscribe\b/,
];

/** Ligações (com esquema, com «www.», ou um domínio solto com caminho). */
const LIGACAO =
  /\b(?:https?:\/\/|www\.)[^\s<>"']+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\/[^\s<>"']*/gi;

/** Alfabetos que não são latinos (cirílico, CJK, árabe, hebraico, tailandês, devanágari…). */
const NAO_LATINO = /[Ѐ-ӿԀ-ԯ֐-׿؀-ۿऀ-ॿ฀-๿぀-ヿ㐀-䶿一-鿿가-힯]/gu;
const LETRA = /\p{L}/gu;

function dominioDe(ligacao: string): string {
  const semEsquema = ligacao.replace(/^https?:\/\//i, "");
  return (semEsquema.split(/[/?#:]/)[0] ?? "").toLowerCase().replace(/\.+$/, "");
}

function eDeConfianca(dominio: string): boolean {
  const d = dominio.replace(/^www\./, "");
  return DOMINIOS_DE_CONFIANCA.some((c) =>
    c.endsWith(".") ? d.startsWith(c) || d.includes(`.${c}`) : d === c || d.endsWith(`.${c}`),
  );
}

/**
 * O veredito. `null` = deixa passar. Um motivo = é spam (e a rota finge
 * sucesso). O motivo vai para o registo, nunca para a resposta.
 */
export function motivoDeSpam(texto: TextoDoPedido): MotivoDeSpam | null {
  const nome = (texto.nome ?? "").trim();
  const tudo = [nome, texto.mensagem ?? "", ...(texto.outros ?? [])].join("\n");
  const minusculas = tudo.toLowerCase();

  // Um nome com uma ligação lá dentro é o robô a anunciar-se.
  if (/https?:\/\/|www\./i.test(nome)) return "ligacao-no-nome";

  const ligacoes = tudo.match(LIGACAO) ?? [];
  const dominios = ligacoes.map(dominioDe).filter(Boolean);
  if (dominios.some((d) => TLD_DE_SPAM.has(d.split(".").pop() ?? ""))) return "dominio-de-spam";
  // Três ou mais ligações a sítios que não são de inspiração nem de ficheiros.
  if (dominios.filter((d) => !eDeConfianca(d)).length >= 3) return "ligacoes";

  if (PALAVRAS_FORTES.some((r) => r.test(minusculas))) return "palavras-de-spam";
  if (PALAVRAS_FRACAS.filter((r) => r.test(minusculas)).length >= 2) return "palavras-de-spam";

  const letras = tudo.match(LETRA)?.length ?? 0;
  const estranhas = tudo.match(NAO_LATINO)?.length ?? 0;
  if (letras >= 12 && estranhas / letras > 0.4) return "alfabeto";

  return null;
}
