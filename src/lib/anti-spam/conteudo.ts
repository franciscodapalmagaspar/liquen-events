/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O FILTRO DE CONTEÚDO DO FORMULÁRIO — A TERCEIRA CAMADA DO ANTI-SPAM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pedido do Francisco, 17/11 (`docs/LEGAL-FORMULARIO.md`, ponto 4): olhar para
 * as ligações, as palavras típicas de spam, os alfabetos que não são latinos e
 * os domínios de topo usados quase só por spam.
 *
 * ── ISTO NUNCA DEITA UM PEDIDO FORA (decisão de 17/11) ────────────────────
 * A primeira versão fingia sucesso quando isto dizia «spam», e uma revisão
 * independente achou pedidos VERDADEIROS deitados fora assim: três quintas
 * `.com`, um quadro no OneDrive, uma noiva chamada Олена. O cliente lia
 * «enviado» e a Catarina nunca recebia nada — o pior erro possível.
 *
 * Agora o veredito daqui é só uma MARCA: o pedido grava-se e notifica-se
 * como os outros, com «possível spam» (`veredito.ts`). Só o isco (o campo
 * escondido `website`) descarta. Mesmo assim, a marca não deve sair a quem
 * não é spam, por isso cada regra só dispara com sinais que um casal
 * verdadeiro não dá:
 *
 *   · as ligações a Pinterest, Instagram, OneDrive, Zola, Canva… não contam;
 *     das outras contam os DOMÍNIOS DISTINTOS, e só a partir de cinco;
 *   · um domínio de topo de spam (`.ru`, `.xyz`…) sozinho, numa ligação só,
 *     não conta — o fotógrafo do casal pode ser `ivanphoto.ru`;
 *   · «casino» sozinho não é spam (o Casino Estoril é um sítio de casamentos),
 *     e «bitcoin»/«crypto» só contam ao lado de uma ligação que não seja de
 *     inspiração (Pinterest, Instagram, um mapa…);
 *   · «SEO», «ranking», «outsourcing» só contam aos pares;
 *   · um alfabeto não latino nunca conta nos NOMES (Олена Шевченко é uma
 *     noiva), e na mensagem só conta quando ela é longa E vem com outro sinal.
 *
 * Função pura, sem rede, sem estado: `conteudo.test.ts` tem os casos
 * verdadeiros (a tabela da revisão) e os falsos.
 */

export type MotivoDeSpam =
  | "ligacoes"
  | "dominio-de-spam"
  | "palavras-de-spam"
  | "alfabeto"
  | "ligacao-no-nome";

/** Os campos de texto livre que um pedido traz (os que o robô enche). */
export interface TextoDoPedido {
  /** Quem escreve. Conta para as ligações; nunca para o alfabeto. */
  nome?: string;
  mensagem?: string;
  /** Os nomes dos noivos (`partnerA/B`): só contam para as ligações. */
  nomes?: string[];
  /** Os outros campos de texto (o nome do evento, o local, a empresa). */
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
  "canva.site",
  "1drv.ms",
  "onedrive.live.com",
  "zola.com",
  "withjoy.com",
  "notion.site",
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
  /\bforex\b/,
  /\bonline casino\b/,
  /\bcasino (bonus|online)\b/,
  // Palavra inteira: «Pornic» é uma terra em França.
  /\bporn(o|ography|ographic)?\b/,
  /\bescort service/,
  /\bseo (services?|agency|expert)\b/,
  /\bsearch engine optimi[sz]ation\b/,
  /\bfirst page (of|on) google\b/,
  /\brank(ing)? your (website|site)\b/,
  /\bdomain authority\b/,
  /\bpayday loans?\b/,
];

/**
 * Estas só contam ao lado de uma ligação: um casal que se conheceu numa
 * conferência de criptomoedas, ou que pergunta se pode pagar em bitcoin, não é
 * um robô. O robô quer que se carregue em alguma coisa.
 */
const PALAVRAS_COM_LIGACAO = [/\bbitcoin\b/, /\bcrypto(currency)?\b/];

/**
 * Estas só contam aos pares (duas diferentes). «traffic» e «leads» saíram: um
 * jantar de uma equipa comercial fala dos dois, e o trânsito de Lisboa também.
 */
const PALAVRAS_FRACAS = [
  /\bseo\b/,
  /\branking\b/,
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
  // A pontuação que fecha a frase não é do domínio («…quintadamalveira.com,»),
  // e o `www.` também não: `www.x.com` e `x.com` são o mesmo sítio.
  return (semEsquema.split(/[/?#:]/)[0] ?? "")
    .toLowerCase()
    .replace(/[.,;!?)\]]+$/, "")
    .replace(/^www\./, "");
}

/**
 * Um domínio de confiança. As entradas que acabam em «.» (`pinterest.`,
 * `google.`) valem para os domínios de topo de um país ou genéricos da casa
 * (`pinterest.pt`, `google.com`, `google.co.uk`, `google.com.br`) — e SÓ
 * para esses: `google.spam1.com`, `google.abc.de` e `pinterest.com.ru` não
 * são a Google nem o Pinterest. Um domínio de topo de spam nunca é de
 * confiança, com uma exceção: o domínio de um país, direto (`google.ru`,
 * `google.cn` — um mapa de um casal russo ou chinês). Já `google.top` e
 * `google.com.ru` (que qualquer pessoa regista) não.
 *
 * Compara-se RÓTULO a rótulo (o que está entre pontos), sem construir uma
 * expressão regular com o nome da marca: o CodeQL do lote de 17/11 apontou a
 * versão anterior, que só escapava os pontos — qualquer outro carácter
 * especial do nome virava regra da expressão.
 */
const TLD_CURTO = /^[a-z]{2,3}$/;

export function deConfianca(c: string): (dominio: string) => boolean {
  if (!c.endsWith(".")) return (d: string) => d === c || d.endsWith(`.${c}`);
  const marca = c.slice(0, -1).split(".");
  /** A marca está nos rótulos de `partes`, a acabar logo antes de `fim`? */
  const marcaAcabaEm = (partes: string[], fim: number) =>
    fim - marca.length >= 0 && marca.every((r, i) => partes[fim - marca.length + i] === r);
  return (d: string) => {
    const partes = d.split(".");
    const tld = partes[partes.length - 1] ?? "";
    if (!TLD_CURTO.test(tld)) return false;
    // `marca.com.br`/`marca.co.uk` primeiro, como fazia a expressão antiga.
    const meio = partes[partes.length - 2];
    const comCo = (meio === "com" || meio === "co") && marcaAcabaEm(partes, partes.length - 2);
    if (!comCo && !marcaAcabaEm(partes, partes.length - 1)) return false;
    const pais = tld.length === 2 && !comCo;
    return pais || !TLD_DE_SPAM.has(tld);
  };
}
const CONFIANCA: Array<(dominio: string) => boolean> = DOMINIOS_DE_CONFIANCA.map(deConfianca);

function eDeConfianca(dominio: string): boolean {
  return CONFIANCA.some((e) => e(dominio));
}

/**
 * Os sítios de INSPIRAÇÃO, onde ninguém publica uma página de venda: o que
 * conta para «bitcoin»/«crypto» é uma ligação que não seja destas. As outras
 * de confiança (Notion, Canva, Dropbox…) deixam qualquer pessoa publicar.
 */
const INSPIRACAO = [
  "pinterest.",
  "pin.it",
  "instagram.com",
  "instagr.am",
  "google.",
  "maps.app.goo.gl",
];
const DE_INSPIRACAO = DOMINIOS_DE_CONFIANCA.map((c, i) =>
  INSPIRACAO.includes(c) ? CONFIANCA[i] : null,
).filter((e): e is (d: string) => boolean => e !== null);

/** A partir de quantos domínios DISTINTOS e desconhecidos as ligações contam. */
const LIGACOES_A_PARTIR_DE = 5;
/** Quantas letras faz uma mensagem «longa», para o alfabeto poder contar. */
const MENSAGEM_LONGA = 60;

function proporcaoNaoLatina(texto: string): { letras: number; proporcao: number } {
  const letras = texto.match(LETRA)?.length ?? 0;
  const estranhas = texto.match(NAO_LATINO)?.length ?? 0;
  return { letras, proporcao: letras ? estranhas / letras : 0 };
}

/**
 * O veredito. `null` = sem sinais. Um motivo = POSSÍVEL spam: o pedido grava-se
 * na mesma, com a marca (ver o cabeçalho). O motivo vai para a marca e para o
 * registo, nunca para a resposta a quem enviou.
 */
export function motivoDeSpam(texto: TextoDoPedido): MotivoDeSpam | null {
  const nome = (texto.nome ?? "").trim();
  const mensagem = texto.mensagem ?? "";
  const nomes = texto.nomes ?? [];
  const outros = texto.outros ?? [];
  const tudo = [nome, mensagem, ...nomes, ...outros].join("\n");
  const minusculas = tudo.toLowerCase();

  // Um nome com uma ligação lá dentro é o robô a anunciar-se.
  if (/https?:\/\/|www\./i.test(nome)) return "ligacao-no-nome";

  const ligacoes = tudo.match(LIGACAO) ?? [];
  const distintos = [...new Set(ligacoes.map(dominioDe).filter(Boolean))];
  const desconhecidos = distintos.filter((d) => !eDeConfianca(d) && !d.endsWith(".pt"));
  const deSpam = distintos.filter(
    (d) => TLD_DE_SPAM.has(d.split(".").pop() ?? "") && !eDeConfianca(d),
  );
  const foraDaInspiracao = distintos.filter((d) => !DE_INSPIRACAO.some((e) => e(d)));
  const fracas = PALAVRAS_FRACAS.filter((r) => r.test(minusculas)).length;

  // Um domínio de topo de spam só conta acompanhado: de outra ligação a um
  // sítio desconhecido, ou de uma palavra suspeita. Sozinho — ou ao lado do
  // Pinterest e do OneDrive dos noivos — é o fotógrafo do casal.
  if (deSpam.length > 0 && (desconhecidos.length >= 2 || fracas >= 1)) return "dominio-de-spam";
  // Os `.pt` não contam: o spam quase nunca vem de um domínio `.pt`, e uns
  // noivos a comparar quintas mandam muitos.
  if (desconhecidos.length >= LIGACOES_A_PARTIR_DE) return "ligacoes";

  if (PALAVRAS_FORTES.some((r) => r.test(minusculas))) return "palavras-de-spam";
  // Uma ligação que não seja de inspiração: o Pinterest dos noivos ao lado de
  // «podemos pagar em bitcoin?» não é um robô; uma página do Notion pode ser.
  if (foraDaInspiracao.length > 0 && PALAVRAS_COM_LIGACAO.some((r) => r.test(minusculas))) {
    return "palavras-de-spam";
  }
  if (fracas >= 2) return "palavras-de-spam";

  // O alfabeto: só a MENSAGEM (e os outros campos), nunca os nomes; só quando
  // é longa; e só com outro sinal ao lado — duas ligações a sítios
  // desconhecidos, ou uma palavra suspeita. Uma ligação só (o fotógrafo do
  // casal, mesmo que seja `.ru`) não é sinal: uma noiva ucraniana que escreve
  // na língua dela e manda o portefólio do fotógrafo não leva marca nenhuma.
  const { letras, proporcao } = proporcaoNaoLatina([mensagem, ...outros].join("\n"));
  const outroSinal = desconhecidos.length >= 2 || fracas > 0;
  if (letras >= MENSAGEM_LONGA && proporcao > 0.4 && outroSinal) return "alfabeto";

  return null;
}
