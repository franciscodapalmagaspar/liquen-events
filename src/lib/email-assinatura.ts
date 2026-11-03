import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { esc, type Attachment } from "./mail";
import { SITE } from "./site";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ASSINATURA DA CASA — UMA SÓ, PARA TODO O CORREIO QUE SAI PARA O CLIENTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cada rota que escrevia a um cliente inventava o seu próprio rodapé, e havia
 * cinco versões da mesma linha («Líquen Events · email · telefone») espalhadas
 * por cinco ficheiros. Mudar o telefone obrigava a caçá-las uma a uma, e quem
 * escrevesse a sexta rota copiava a que tivesse mais à mão. Isto é a fonte
 * única: mudar aqui muda em todos os emails, e um caminho novo que use o
 * {@link emailAoCliente} leva a assinatura sem ter de se lembrar dela.
 *
 * ── QUEM ASSINA: QUEM ENVIOU, COM A CASA COMO RECURSO ─────────────────────
 *
 * Era fixo — assinava sempre «Catarina Gaspar», saísse o email de quem saísse.
 * Fazia sentido quando havia uma conta; com várias (`admin-auth.ts`) deixou de
 * fazer: quem escreve ao casal assina o que escreveu, e o casal responde a uma
 * pessoa. O nome vem da sessão (ver `email-quem-assina.ts`), e o da casa é o
 * recurso — para o correio que ninguém enviou à mão (a confirmação automática
 * do formulário público) e para quando a sessão não traz nome.
 *
 * O CARGO continua a ser um só e é dela. Não acompanha outro nome: «Manager»
 * debaixo do nome de outra pessoa é uma promoção inventada pelo software, e
 * nenhum cargo é melhor do que um cargo falso. O dia em que as contas tiverem
 * um campo `cargo` (`ADMIN_USERS`, no `admin-auth.ts`) é o dia em que isto
 * deixa de ser preciso.
 *
 * Os CONTACTOS não estão escritos aqui: vêm todos do `SITE`. É de
 * propósito e não é zelo — a assinatura que ela usa hoje no telemóvel tem
 * «líquen.alentejo@gmail.com» e «líquen-events.com» COM ACENTO no i. Um
 * endereço com acento não existe e uma ligação para `líquen-events.com` não
 * abre. Escrever os contactos à mão aqui era copiar esse erro para dentro de
 * todos os emails que saem; lidos do `SITE` são, por construção, os
 * verdadeiros. O mesmo para o espaçamento do número: um só, o do `SITE`.
 *
 * ── IMAGENS: SÓ POR `cid:` ────────────────────────────────────────────────
 *
 * Vale aqui, e com mais força, tudo o que está escrito no `email-logo.ts`: uma
 * imagem remota parte-se enquanto o deploy não subiu e é bloqueada por
 * omissão pelo Gmail/Outlook/Apple Mail quando o remetente é desconhecido —
 * que é o caso de metade destes emails. Nenhum `<img>` daqui aponta para um
 * URL: os bytes viajam com a mensagem.
 *
 * ── AS REDES SÃO ÍCONES ──────────────────────────────────────────────────
 *
 * Decisão dela, 20-08-2026, com a assinatura dela à frente: «sempre com este
 * banner e com este aspeto a dizer catarina manager, redes sociais».
 *
 * Aqui estavam as três redes escritas por extenso, e a razão estava escrita:
 * peso (mais um anexo por rede, em CADA email), o Outlook a escalar imagens
 * pequenas ao seu critério, e um ícone de 16 px sem etiqueta ser um enigma
 * para quem lê com as imagens desligadas. As três continuam a ser verdade e
 * nenhuma delas manda: a assinatura é o rosto da casa e o desenho é dela.
 *
 * O que se fez para as pagar o mais barato possível:
 *   · os ícones são PNG de 18 px — exactamente o tamanho a que aparecem, com
 *     `width`/`height` no atributo, que é a única forma que o Outlook
 *     respeita. Foram de 32 px até 3/11; ver «O FICHEIRO TEM O TAMANHO A QUE
 *     APARECE», na faixa, para a razão de não voltarem a sê-lo;
 *   · cada um leva `alt` («Facebook», «Instagram», «LinkedIn»), portanto quem
 *     tem as imagens desligadas ou lê por leitor de ecrã continua a ler o nome
 *     da rede, que era a terceira objecção;
 *   · a versão em texto simples continua a levar os endereços por extenso.
 *
 * O LOGÓTIPO que estava no topo da assinatura SAIU. Não é corte por corte: a
 * assinatura dela não o tem (a marca aparece na faixa, em baixo), e tê-lo nos
 * dois sítios era o mesmo desenho duas vezes com dez linhas de intervalo.
 * Poupa ~7 KB por email, que é quase o que a faixa custa.
 */

/** Quem assina quando não há sessão com nome — e quem assina a protecção. */
export const ASSINATURA_NOME = "Catarina Gaspar";
export const ASSINATURA_CARGO = "Manager";

/** Um nome não vai além disto na assinatura: cabe numa linha em qualquer ecrã. */
const MAXIMO_NOME = 60;

export interface QuemAssina {
  /**
   * O nome de quem assina, LIDO DO PERFIL da conta. Vazio → assina a casa.
   *
   * Nunca um nome derivado de um endereço de email. Um email real a uma cliente
   * saiu assinado «Liquen Alentejo» — o `nomeVisivel` fabricou-o a partir de
   * `liquen.alentejo@gmail.com`, e daí seguiu para o `sub` da sessão e para o
   * fundo do email. Quem resolve isto é o `assinaturaDeQuemEnvia`
   * (`email-quem-assina.ts`), que só devolve o que estiver escrito no perfil.
   */
  nome?: string;
  /** O cargo, também do perfil. Só acompanha um `nome` que venha de lá. */
  cargo?: string;
  /**
   * O nome de quem RECEBE. Não aparece em lado nenhum do email: existe só para
   * a protecção abaixo poder comparar os dois.
   */
  destinatario?: string;
}

/**
 * Dois nomes comparam-se sem acentos, sem maiúsculas e sem pontuação: «MÓNICA
 * Teófilo», «monica teofilo» e «Mónica  Teófilo.» são a mesma pessoa, e a
 * protecção não pode desfazer-se por causa de um acento que alguém não escreveu
 * no formulário.
 */
function normalizarNome(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NENHUM EMAIL SAI ASSINADO COM O NOME DE QUEM O VAI LER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Saiu um email a uma cliente com duas assinaturas contraditórias, e uma delas
 * era o nome DELA. A causa estava no corpo — um `{nome}` que ficou no rodapé de
 * um modelo guardado no back office (ver `email-modelos.ts`), e portanto texto
 * dela, não código nosso —, mas a regra vale à mesma e vale daqui para a
 * frente: se o nome de quem assina for o nome de quem recebe, alguma coisa se
 * trocou pelo caminho, e o que se faz nesse caso não é adivinhar — é assinar a
 * casa, que nunca está errada, e deixar rasto.
 *
 * O rasto NÃO leva os nomes. O `log.warn` acaba no webhook de alertas
 * (`logger.ts`), que serializa o contexto para dentro de um `fetch`: o nome de
 * uma cliente não sai daqui para fora por causa de um aviso. Saber que
 * aconteceu, e em que envio, chega para ir ver.
 */
export function assinanteDoEmail(quem: QuemAssina = {}): { nome: string; cargo: string } {
  const daCasa = { nome: ASSINATURA_NOME, cargo: ASSINATURA_CARGO };

  const candidato = String(quem.nome ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAXIMO_NOME);
  if (!candidato) return daCasa;

  const destinatario = normalizarNome(quem.destinatario);
  if (destinatario && destinatario === normalizarNome(candidato)) {
    log.warn("assinatura: o nome de quem envia era igual ao do destinatário — assinou a casa");
    return daCasa;
  }

  // O CARGO ESCRITO NO PERFIL manda. É a razão de ser do perfil: uma pessoa
  // que não seja a dona assina com o cargo dela, e não sem cargo nenhum.
  const cargoDoPerfil = String(quem.cargo ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAXIMO_NOME);
  if (cargoDoPerfil) return { nome: candidato, cargo: cargoDoPerfil };

  // Sem cargo escrito: o da casa só acompanha o nome dela — incluindo quando a
  // conta se chama só «Catarina» e a assinatura da casa é «Catarina Gaspar».
  const nome = normalizarNome(candidato);
  const casa = normalizarNome(ASSINATURA_NOME);
  const ehDaCasa = nome === casa || casa.startsWith(`${nome} `);
  return { nome: candidato, cargo: ehDaCasa ? ASSINATURA_CARGO : "" };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FAIXA DA CASA, NO FIM DE TODOS OS EMAILS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto já cá esteve e foi tirado — «o rectângulo verde no fim dos emails
 * vai-se» —, com o argumento de que era verde vazio com o logótipo repetido.
 * O argumento estava certo sobre o que lá estava, e ERRADO sobre o que ela
 * queria: a faixa dela não é um rectângulo vazio, tem a marca de água do
 * líquen, e é assim que a casa assina há anos. Ela mandou a peça e a
 * instrução: «sempre com este banner e com este aspeto».
 *
 * Volta, e volta EXPLÍCITA. O que se tirou da outra vez, e não volta, foi o
 * mecanismo silencioso: naquele desenho, largar um ficheiro com o nome certo
 * numa pasta punha uma imagem em todo o correio da casa sem ninguém escrever
 * uma linha — foi assim que a primeira apareceu. Agora a faixa está escrita
 * aqui, à vista, e é obrigatória: se o ficheiro faltar, o email SAI À MESMA e
 * sem imagem partida, e fica um erro no registo — porque uma faixa em falta é
 * uma avaria de instalação, não o estado normal de nada.
 *
 * O ficheiro é `public/email/banner-liquen-email.png` e é a fonte de verdade:
 * substituí-lo troca a faixa em todos os emails, sem regenerar constantes.
 *
 * ── O FICHEIRO TEM O TAMANHO A QUE APARECE (3/11) ────────────────────────
 *
 * Medidas: 400×120 no ficheiro e no ecrã. Até 3/11 era 1120×336 no ficheiro
 * («para os ecrãs de alta densidade»), apresentado a 560×168.
 *
 * Ela, com a captura do iPhone: «no e-mail há esse espaçamento entre o anexo
 * […] e o banner […] tenho medo que os clientes não consigam ver a proposta
 * porque está muito para baixo». O nosso HTML acaba na faixa — não há nada
 * depois dela. MEDIDO na captura (iPhone de 393 pt): o branco tinha ~265 pt; a
 * faixa aparecia com 345×104 sendo o ficheiro 336 de alto (232 pt a mais), e
 * os ícones a 18 sendo de 32 (14 a mais). 232 + 14 + a margem normal do
 * Gmail dá os 265: o Gmail do iPhone guarda o lugar de cada imagem pelo
 * tamanho do FICHEIRO e não o devolve quando o estilo a encolhe.
 *
 * Daí a regra: nenhum ficheiro desta pasta é maior do que o tamanho a que
 * aparece (um teste prende-a). A faixa a 400 foi a escolha dela, contra a de
 * 560 — que ainda deixava ~85 pt de branco no telemóvel. Troca-se um pouco de
 * nitidez num ecrã de alta densidade por o anexo vir logo a seguir.
 */
export const BANNER_EMAIL_CID = "liquen-banner";

const BANNER_FICHEIRO = "banner-liquen-email.png";
export const BANNER_LARGURA = 400;
export const BANNER_ALTURA = 120;

/** Acima disto a faixa pesa mais do que tudo o resto da mensagem. */
const BANNER_TECTO_BYTES = 200_000;

/**
 * Os ícones das redes, no mesmo sítio e pela mesma razão: ficheiros, não
 * constantes de base64, para se poderem trocar sem regenerar nada.
 */
const ICONES_SOCIAIS: Readonly<Record<string, string>> = {
  Facebook: "social-facebook.png",
  Instagram: "social-instagram.png",
  LinkedIn: "social-linkedin.png",
};

/**
 * Lidos do disco UMA vez e guardados — incluindo a ausência. Um `readFileSync`
 * por email seria uma ida ao disco em cada envio; o ficheiro só muda com um
 * deploy novo, que traz um processo novo.
 */
const cacheDeImagens = new Map<string, Buffer | null>();

function imagemDoEmail(nome: string): Buffer | null {
  const guardada = cacheDeImagens.get(nome);
  if (guardada !== undefined) return guardada;
  let lida: Buffer | null = null;
  try {
    lida = readFileSync(path.join(process.cwd(), "public", "email", nome));
    if (lida.byteLength > BANNER_TECTO_BYTES) {
      /**
       * Vai na mesma — uma imagem que não aparece por causa de um limite que
       * ninguém vê é pior do que um email pesado —, mas fica registado.
       *
       * O tamanho MEDIDO não entra aqui, e é de propósito: o `log.warn` acaba
       * no webhook de alertas (`logger.ts`), que serializa o contexto para
       * dentro de um `fetch`. Um valor lido do disco a viajar para fora é um
       * rasto que o CodeQL segue e assinala — «file data in outbound network
       * request». O nome e o tecto são constantes nossas e chegam para saber o
       * que fazer. NÃO voltes a pôr aqui o `byteLength`.
       */
      log.warn("assinatura: uma imagem do email é grande demais", {
        ficheiro: nome,
        tecto: BANNER_TECTO_BYTES,
      });
    }
  } catch {
    // A faixa é obrigatória: a falta dela é uma avaria de instalação e tem de
    // se ver. Os ícones seguem a mesma regra — sem eles a assinatura fica sem
    // as redes, que é uma diferença que se nota.
    log.error("assinatura: imagem do email em falta em public/email", null, { ficheiro: nome });
  }
  cacheDeImagens.set(nome, lida);
  return lida;
}

type Rede = { nome: string; url: string };

/**
 * As redes que ESTÃO configuradas.
 *
 * A lista é filtrada e não fixa: uma rede sem endereço fica de fora, porque um
 * ícone social a apontar para lado nenhum é pior do que não haver ícone. O
 * LinkedIn esteve vazio até ela dar o endereço do perfil; entrou sozinho
 * quando o `SITE.linkedin` deixou de estar vazio, sem se tocar aqui.
 */
function redesConfiguradas(): Rede[] {
  // Pela ORDEM da assinatura dela: Facebook, Instagram, LinkedIn.
  const todas: Rede[] = [
    { nome: "Facebook", url: SITE.facebook },
    { nome: "Instagram", url: SITE.instagram },
    { nome: "LinkedIn", url: SITE.linkedin },
  ];
  return todas.filter((r) => r.url.trim() !== "");
}

// Cores em linha, porque um `<style>` no cabeçalho não sobrevive ao Gmail e
// estes blocos entram tanto num email com folha de estilo (a confirmação)
// como num fragmento sem nenhuma. As classes `em-*` não fazem falta a
// ninguém — onde a folha existe, dão o modo escuro de borla; onde não existe,
// não são nada.
const TINTA = "#2a2620";
const CINZA = "#8f8a7a";
const RISCO = "#ece7dc";
const LIGACAO = "#1155cc";

/**
 * A assinatura, nas duas versões e com os anexos que ela precisa.
 *
 * As três peças vêm juntas de propósito: o HTML refere `cid:`s que só existem
 * se os anexos forem os que vêm aqui, e quem lê em texto simples não pode
 * ficar sem os contactos que o HTML mostra. Devolvê-las separadamente era
 * abrir a porta a um email com um `<img>` a apontar para um anexo que ficou
 * para trás — uma cruz vermelha na caixa de correio do cliente.
 */
export function assinaturaDeEmail(quem: QuemAssina = {}): {
  html: string;
  texto: string;
  anexos: Attachment[];
} {
  /**
   * ── O ENDEREÇO DA ASSINATURA É O PÚBLICO, NÃO O DAS NOTIFICAÇÕES ─────────
   *
   * Isto usava o `MAIL_TO`, e são coisas diferentes que por acaso têm hoje o
   * mesmo valor. O `MAIL_TO` é a caixa para onde a casa manda os AVISOS
   * INTERNOS (um pedido novo, uma cópia de segurança) e é uma variável de
   * ambiente; o `SITE.email` é o endereço de contacto que a empresa publica.
   *
   * Enquanto forem iguais, ninguém dá por isso. No dia em que ela mandar as
   * notificações para outra caixa — a coisa mais natural do mundo — a
   * assinatura de todos os emails ao cliente passava a mostrar o endereço
   * interno, sem ninguém escrever uma linha para isso acontecer.
   */
  const assinante = assinanteDoEmail(quem);
  const redes = redesConfiguradas();
  const dominio = SITE.url.replace(/^https?:\/\//, "");

  const ligacao = (href: string, texto: string) =>
    `<a class="em-link" href="${esc(href)}" style="color:${LIGACAO};text-decoration:underline">${esc(texto)}</a>`;

  // Sem cargo NÃO se escreve a linha — um `<div>` vazio deixa na mesma um
  // degrau de espaço por baixo do nome, e um degrau que só aparece a algumas
  // pessoas é do género de defeito que ninguém consegue descrever ao telefone.
  const linhaCargo = assinante.cargo
    ? `<div class="em-muted" style="color:${CINZA};font-size:13px;font-style:italic;mso-line-height-rule:exactly;line-height:19px">${esc(assinante.cargo)}</div>`
    : "";

  /**
   * As redes, em ícones. Cada um é um anexo `cid:` (nunca um URL — ver o
   * cabeçalho), com `width`/`height` no ATRIBUTO, que é a única forma que o
   * Outlook respeita, e com `alt` para quem tem as imagens desligadas.
   */
  const anexosSociais: Attachment[] = [];
  const linhaRedes = redes.length
    ? `<tr><td style="padding-top:8px">${redes
        .map((r) => {
          const ficheiro = ICONES_SOCIAIS[r.nome];
          const bytes = ficheiro ? imagemDoEmail(ficheiro) : null;
          if (!bytes) {
            // Sem ícone, a rede sai em palavra em vez de desaparecer: uma rede
            // a menos é pior do que uma rede escrita.
            return `<a class="em-strong" href="${esc(r.url)}" style="color:${TINTA};text-decoration:underline;font-size:12px">${esc(r.nome)}</a>`;
          }
          const cid = `liquen-social-${r.nome.toLowerCase()}`;
          anexosSociais.push({
            filename: ficheiro,
            content: Buffer.from(bytes),
            contentType: "image/png",
            cid,
          });
          return `<a href="${esc(r.url)}" style="text-decoration:none;display:inline-block"><img src="cid:${cid}" alt="${esc(r.nome)}" width="18" height="18" style="display:inline-block;width:18px;height:18px;border:0;vertical-align:middle"></a>`;
        })
        .join('<span style="display:inline-block;width:10px">&nbsp;</span>')}</td></tr>`
    : "";

  /**
   * A FAIXA, no fim — e é ela que fecha a assinatura. Ver o cabeçalho do
   * bloco: é uma decisão dela, e é obrigatória. Em falta, o email sai à mesma
   * e sem imagem partida (não se escreve `<img>` nenhum), com o erro no
   * registo.
   */
  const bytesDaFaixa = imagemDoEmail(BANNER_FICHEIRO);
  const linhaFaixa = bytesDaFaixa
    ? `<tr><td style="padding-top:16px">
    <img src="cid:${BANNER_EMAIL_CID}" alt="${esc(SITE.name)}" width="${BANNER_LARGURA}" height="${BANNER_ALTURA}" style="display:block;width:100%;max-width:${BANNER_LARGURA}px;height:auto;border:0">
  </td></tr>`
    : "";

  /**
   * ── «NADA AFASTADO UMAS COISAS DAS OUTRAS» ──────────────────────────────
   *
   * Instrução dela, e é sobre isto: a assinatura tinha 28 px de margem por
   * cima, 18 px depois do risco, 14 px antes do nome e 12 px antes de cada
   * bloco — degraus que somavam quase um ecrã de telemóvel entre o fim do
   * texto e o fim da assinatura. Passa a 16/10/8, e as linhas de contacto de
   * 21 para 19 px de entrelinha. É a mesma informação, junta, como na
   * assinatura dela.
   */
  const html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <tr><td class="em-hair" style="border-top:1px solid ${RISCO};padding-top:10px">
    <div class="em-strong" style="color:${TINTA};font-size:15px;font-weight:700;mso-line-height-rule:exactly;line-height:20px">${esc(assinante.nome)}</div>
    ${linhaCargo}
  </td></tr>
  <tr><td style="padding-top:8px">
    <div style="mso-line-height-rule:exactly;line-height:19px"><a class="em-strong" href="tel:${esc(SITE.phone)}" style="color:${TINTA};text-decoration:none;font-size:13px;white-space:nowrap">${esc(SITE.phoneDisplay)}</a></div>
    <div style="mso-line-height-rule:exactly;line-height:19px;font-size:13px">${ligacao(`mailto:${SITE.email}`, SITE.email)}</div>
    <div style="mso-line-height-rule:exactly;line-height:19px;font-size:13px">${ligacao(SITE.url, dominio)}</div>
  </td></tr>
  ${linhaRedes}
  ${linhaFaixa}
</table>`;

  // Coerente com o HTML, e não uma versão pobre dele: quem lê em texto tem de
  // ficar com os MESMOS contactos. Um email cujas duas alternativas divergem
  // muito é, por si só, um sinal de spam.
  const texto = [
    "--",
    assinante.nome,
    ...(assinante.cargo ? [assinante.cargo] : []),
    SITE.name,
    "",
    SITE.phoneDisplay,
    SITE.email,
    SITE.url,
    ...(redes.length ? ["", ...redes.map((r) => `${r.nome}: ${r.url}`)] : []),
  ].join("\n");

  /**
   * A faixa e os ícones das redes. O logótipo do topo saiu com o desenho novo
   * (ver o cabeçalho) — e o `emailLogoAttachment` continua a existir e a ser
   * usado pela confirmação do formulário público, que o desenha no cabeçalho.
   *
   * `Buffer.from(...)` a cada chamada, e não o buffer guardado: o nodemailer
   * CONSOME o conteúdo de um anexo, portanto partilhar o buffer entre envios
   * fazia o segundo email sair com a imagem vazia. É a mesma armadilha que o
   * `emailLogoAttachment` documenta.
   */
  const anexos: Attachment[] = [
    ...anexosSociais,
    ...(bytesDaFaixa
      ? [
          {
            filename: BANNER_FICHEIRO,
            content: Buffer.from(bytesDaFaixa),
            contentType: "image/png",
            cid: BANNER_EMAIL_CID,
          } satisfies Attachment,
        ]
      : []),
  ];

  return { html, texto, anexos };
}

/**
 * Um email para o cliente, pronto a entregar ao `sendMail`.
 *
 * Recebe o CORPO (o que aquele email tem de particular) e devolve a mensagem
 * inteira — moldura, assinatura e anexos. É a forma de a assinatura não
 * depender de cada rota se lembrar dela: quem escreve ao cliente chama isto e
 * fica servido.
 *
 * O `html` do corpo é markup já montado por quem chama (e já escapado com
 * `esc` onde tem valores de fora); o `texto` é a versão em texto simples do
 * mesmo corpo, sem escape nenhum — escapar é uma preocupação de HTML.
 *
 * Quem tiver anexos próprios (o PDF da proposta, o do recibo) junta-os aos
 * `attachments` devolvidos, em vez de os substituir — substituí-los deixava o
 * logótipo de fora e punha uma cruz vermelha no email.
 */
export function emailAoCliente({
  html,
  texto,
  quem,
}: {
  html: string;
  texto: string;
  /** Quem envia (e quem recebe, para a protecção). Ausente → assina a casa. */
  quem?: QuemAssina;
}): {
  html: string;
  text: string;
  attachments: Attachment[];
} {
  const assinatura = assinaturaDeEmail(quem);
  return {
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:${TINTA}">
${html}
${assinatura.html}
</div>`,
    text: `${texto}\n\n${assinatura.texto}`,
    attachments: assinatura.anexos,
  };
}
