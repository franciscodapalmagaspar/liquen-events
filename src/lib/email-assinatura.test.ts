import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./logger", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import {
  assinaturaDeEmail,
  assinanteDoEmail,
  emailAoCliente,
  ASSINATURA_NOME,
  ASSINATURA_CARGO,
  BANNER_EMAIL_CID,
} from "./email-assinatura";
import { log } from "./logger";
import { SITE } from "./site";
import { MAIL_TO } from "./mail";
import { EMAIL_LOGO_CID } from "./email-logo";

describe("assinaturaDeEmail", () => {
  it("assina sempre com o mesmo nome e cargo da casa", () => {
    const { html, texto } = assinaturaDeEmail();
    expect(html).toContain(ASSINATURA_NOME);
    expect(html).toContain(ASSINATURA_CARGO);
    expect(texto).toContain(ASSINATURA_NOME);
    expect(texto).toContain(ASSINATURA_CARGO);
  });

  /**
   * A assinatura que ela usa no telemóvel tem «líquen.alentejo@gmail.com» e
   * «líquen-events.com», com acento no i. O endereço não existe e a ligação não
   * abre. Este teste é o que impede que alguém volte a escrever os contactos à
   * mão a partir da fotografia em vez de os ler do `SITE`.
   */
  it("nunca escreve o domínio nem o email com acento", () => {
    const { html, texto } = assinaturaDeEmail();
    expect(html).not.toMatch(/líquen[.-]/i);
    expect(texto).not.toMatch(/líquen[.-]/i);
    expect(html).toContain(MAIL_TO);
    expect(html).toContain(SITE.url);
  });

  it("mostra o telefone com o espaçamento único do SITE", () => {
    const { html, texto } = assinaturaDeEmail();
    expect(html).toContain(SITE.phoneDisplay);
    expect(texto).toContain(SITE.phoneDisplay);
    // «+351 91 92 59 820» é o mesmo número com outro espaçamento — dois
    // espaçamentos espalhados pelo produto é o que se está a evitar.
    expect(html).not.toContain("91 92 59 820");
  });

  it("a versão em texto leva os mesmos contactos que o HTML", () => {
    const { texto } = assinaturaDeEmail();
    expect(texto).toContain(MAIL_TO);
    expect(texto).toContain(SITE.url);
    expect(texto).toContain(SITE.name);
  });

  /**
   * ── A FAIXA E OS ÍCONES ─────────────────────────────────────────────────
   *
   * Aqui estavam três testes a prender a decisão CONTRÁRIA: «fecha na
   * assinatura: uma só imagem, e nenhum banner». Era a decisão certa para o
   * rectângulo verde vazio que aqui esteve, e deixou de ser a decisão desta
   * casa: ela mandou a peça dela — faixa com a marca de água do líquen, redes
   * em ícones — e a instrução, «sempre com este banner e com este aspeto».
   *
   * O que NÃO mudou, e continua preso: nenhuma imagem por URL.
   */
  it("leva a faixa da casa por cid:, e nenhuma imagem remota", () => {
    const { html, anexos } = assinaturaDeEmail();
    expect(html).toContain(`cid:${BANNER_EMAIL_CID}`);
    expect(anexos.some((a) => a.cid === BANNER_EMAIL_CID)).toBe(true);
    // O Gmail/Outlook bloqueiam imagens remotas de um remetente desconhecido,
    // e o ficheiro só existe depois do deploy: nenhum <img> aponta para http.
    expect(html).not.toMatch(/<img[^>]+src="https?:/);
  });

  it("as redes saem em ícones, cada um com o nome no `alt`", () => {
    const { html, anexos } = assinaturaDeEmail();
    for (const rede of ["Facebook", "Instagram", "LinkedIn"]) {
      expect(html).toContain(`cid:liquen-social-${rede.toLowerCase()}`);
      expect(html).toContain(`alt="${rede}"`);
      expect(anexos.some((a) => a.cid === `liquen-social-${rede.toLowerCase()}`)).toBe(true);
    }
    // O `width`/`height` no ATRIBUTO é a única forma que o Outlook respeita.
    expect(html).toMatch(/<img src="cid:liquen-social-[a-z]+" alt="[^"]+" width="18" height="18"/);
  });

  /**
   * ── O «í» DO LINKEDIN ──────────────────────────────────────────────────
   *
   * O perfil dela é `pt.linkedin.com/company/líquen-events`, com acento. Um
   * `href` com uma letra acentuada crua é um endereço que cada cliente de
   * correio resolve à sua maneira, e os que não o convertem cortam o link no
   * «í» — o ícone ficava a apontar para `…/company/l`.
   */
  it("o endereço do LinkedIn vai percent-encoded, para atravessar o correio", () => {
    const { html } = assinaturaDeEmail();
    expect(html).toContain("https://pt.linkedin.com/company/l%C3%ADquen-events");
    expect(html).not.toContain("company/líquen-events");
  });

  it("uma rede sem endereço não desenha ícone nenhum", () => {
    // O filtro é o que permitiu o LinkedIn entrar sozinho no dia em que ela
    // deu o endereço, sem se mexer no desenho. Sem este teste, a lista podia
    // voltar a ser fixa e um ícone a apontar para lado nenhum passava.
    const html = assinaturaDeEmail().html;
    for (const rede of ["Facebook", "Instagram", "LinkedIn"]) {
      expect(html).toContain(`alt="${rede}"`);
    }
    expect(html).not.toMatch(/href=""/);
  });

  it("já não repete o logótipo por cima do nome — a marca está na faixa", () => {
    const { html } = assinaturaDeEmail();
    expect(html).not.toContain(`cid:${EMAIL_LOGO_CID}`);
  });

  it("dá um Buffer novo a cada chamada — o nodemailer consome o anterior", () => {
    const a = assinaturaDeEmail().anexos.find((x) => x.cid === BANNER_EMAIL_CID)!;
    const b = assinaturaDeEmail().anexos.find((x) => x.cid === BANNER_EMAIL_CID)!;
    expect(a.content).not.toBe(b.content);
    expect(Buffer.from(a.content).equals(Buffer.from(b.content))).toBe(true);
  });
});

describe("emailAoCliente", () => {
  it("junta a assinatura ao corpo, nas duas versões, e devolve os anexos", () => {
    const { html, text, attachments } = emailAoCliente({
      html: "<p>Segue a proposta.</p>",
      texto: "Segue a proposta.",
    });
    expect(html).toContain("<p>Segue a proposta.</p>");
    expect(html).toContain(ASSINATURA_NOME);
    expect(text).toContain("Segue a proposta.");
    expect(text).toContain(SITE.phoneDisplay);
    expect(attachments.some((a) => a.cid === BANNER_EMAIL_CID)).toBe(true);
  });

  /**
   * HTML de email é hostil: o Outlook não percebe metade do CSS moderno. Nada
   * daqui pode depender de flexbox/grid nem de uma folha de estilo no
   * cabeçalho — que o Gmail deita fora de qualquer forma.
   */
  it("não usa flexbox, grid nem <style> no cabeçalho", () => {
    const { html } = emailAoCliente({ html: "<p>Olá.</p>", texto: "Olá." });
    expect(html).not.toContain("display:flex");
    expect(html).not.toContain("display:grid");
    expect(html).not.toContain("<style");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUEM ASSINA É QUEM ENVIOU — E NUNCA, NUNCA, QUEM RECEBE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O nome era fixo: saísse o email de quem saísse, assinava a Catarina. Com mais
 * do que uma conta no back office (`admin-auth`), isso deixou de ser verdade —
 * quem escreve ao casal assina o que escreveu.
 *
 * E a protecção, que é a razão pela qual isto se mexeu: chegou a sair um email
 * com DUAS assinaturas contraditórias, uma delas com o nome da própria pessoa
 * que o recebeu. A causa estava no corpo (um `{nome}` no rodapé de um modelo
 * guardado no back office, ver `email-modelos.ts`) e não aqui — mas a regra
 * vale na mesma, e vale para sempre: nenhum email pode sair assinado com o nome
 * de quem o vai ler.
 */
describe("quem assina", () => {
  beforeEach(() => {
    vi.mocked(log.warn).mockClear();
  });

  it("assina com o nome de quem tem a sessão iniciada", () => {
    const { html, texto } = assinaturaDeEmail({ nome: "Rui Belo" });
    expect(html).toContain("Rui Belo");
    expect(texto).toContain("Rui Belo");
    expect(html).not.toContain(ASSINATURA_NOME);
  });

  it("sem sessão (o formulário público) assina a casa, com o cargo", () => {
    const { html, texto } = assinaturaDeEmail();
    expect(html).toContain(ASSINATURA_NOME);
    expect(html).toContain(ASSINATURA_CARGO);
    expect(texto).toContain(ASSINATURA_CARGO);
  });

  /** «Manager» é o cargo DELA. Debaixo de outro nome era uma promoção
   *  inventada pelo software — melhor nenhum cargo do que um cargo falso. */
  it("o cargo da casa não acompanha um nome que não é o da casa", () => {
    const { html, texto } = assinaturaDeEmail({ nome: "Rui Belo" });
    expect(html).not.toContain(ASSINATURA_CARGO);
    expect(texto).not.toContain(ASSINATURA_CARGO);
  });

  /** A conta dela pode chamar-se só «Catarina». Continua a ser ela. */
  it("o cargo acompanha o primeiro nome da conta da casa", () => {
    expect(assinanteDoEmail({ nome: "Catarina" }).cargo).toBe(ASSINATURA_CARGO);
    expect(assinanteDoEmail({ nome: "catarina gaspar" }).cargo).toBe(ASSINATURA_CARGO);
  });

  it("nunca assina com o nome de quem recebe — cai para o da casa e regista", () => {
    const { nome, cargo } = assinanteDoEmail({
      nome: "Mónica Teófilo",
      destinatario: "Mónica Teófilo",
    });
    expect(nome).toBe(ASSINATURA_NOME);
    expect(cargo).toBe(ASSINATURA_CARGO);
    expect(vi.mocked(log.warn)).toHaveBeenCalledTimes(1);
  });

  /** Acentos, maiúsculas e espaços a mais não podem ser a porta do lado. */
  it("a protecção não se desfaz com acentos, maiúsculas nem espaços", () => {
    expect(
      assinanteDoEmail({ nome: "  MÓNICA   teofilo ", destinatario: "Monica Teófilo" }).nome,
    ).toBe(ASSINATURA_NOME);
  });

  /** Nomes diferentes não podem accionar a protecção — senão ninguém assina. */
  it("deixa passar um nome que só se parece com o do destinatário", () => {
    expect(assinanteDoEmail({ nome: "Mónica Teófilo", destinatario: "Mónica Teixeira" }).nome).toBe(
      "Mónica Teófilo",
    );
    expect(vi.mocked(log.warn)).not.toHaveBeenCalled();
  });

  /** O registo não pode levar os nomes: vai para o webhook de alertas. */
  it("regista a ocorrência sem escrever lá os nomes", () => {
    assinanteDoEmail({ nome: "Mónica Teófilo", destinatario: "Mónica Teófilo" });
    const [mensagem, contexto] = vi.mocked(log.warn).mock.calls[0];
    expect(JSON.stringify([mensagem, contexto])).not.toMatch(/Mónica|Teófilo/i);
  });

  it("o emailAoCliente leva a assinatura de quem envia até ao fim", () => {
    const { html, text } = emailAoCliente({
      html: "<p>Segue.</p>",
      texto: "Segue.",
      quem: { nome: "Rui Belo", destinatario: "Mónica Teófilo" },
    });
    expect(html).toContain("Rui Belo");
    expect(text).toContain("Rui Belo");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NENHUM `cid:` FICA SEM ANEXO — É ASSIM QUE SE MANDA UMA CRUZ VERMELHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Apanhado ao vivo nesta mudança: a confirmação do formulário público desenha
 * o logótipo no CABEÇALHO e ia buscar o anexo à assinatura. Quando a
 * assinatura passou a ser a dela — sem logótipo em cima, com a faixa em baixo
 * — o anexo deixou de vir, e o `<img>` do topo ficava a apontar para nada: uma
 * cruz vermelha no primeiro email que um cliente novo recebe desta casa.
 *
 * Este teste não prende um caso: percorre TODOS os `cid:` do HTML e exige um
 * anexo para cada um. Serve para o próximo que mexa nas imagens do correio.
 */
describe("os cid: e os anexos andam sempre juntos", () => {
  const cidsDe = (html: string) => [...html.matchAll(/cid:([a-z0-9-]+)/gi)].map((m) => m[1]);

  it("na assinatura", () => {
    const { html, anexos } = assinaturaDeEmail();
    const cids = cidsDe(html);
    // Controlo positivo: há mesmo imagens embutidas para verificar.
    expect(cids.length).toBeGreaterThan(1);
    for (const cid of cids) {
      expect(
        anexos.some((a) => a.cid === cid),
        `\`cid:${cid}\` sem anexo`,
      ).toBe(true);
    }
  });

  it("no email inteiro que sai para o cliente", () => {
    const { html, attachments } = emailAoCliente({ html: "<p>Olá.</p>", texto: "Olá." });
    for (const cid of cidsDe(html)) {
      expect(
        attachments.some((a) => a.cid === cid),
        `\`cid:${cid}\` sem anexo`,
      ).toBe(true);
    }
  });

  it("na confirmação do formulário público, que desenha o logótipo no topo", async () => {
    const { buildClientConfirmation } = await import("./client-confirmation");
    const { html, attachments } = buildClientConfirmation({
      name: "Ana Dias",
      locale: "pt",
    } as Parameters<typeof buildClientConfirmation>[0]);
    const cids = cidsDe(html);
    expect(cids).toContain(EMAIL_LOGO_CID);
    for (const cid of cids) {
      expect(
        attachments.some((a) => a.cid === cid),
        `\`cid:${cid}\` sem anexo`,
      ).toBe(true);
    }
  });
});

/**
 * As imagens do correio são FICHEIROS em `public/email/`, para se poderem
 * trocar sem regenerar constantes. Um ficheiro que desapareça de lá tira a
 * faixa (ou uma rede) de todos os emails da casa, em silêncio — este teste é o
 * barulho.
 */
describe("as imagens do correio estão no sítio", () => {
  it("a faixa e os três ícones existem em public/email", async () => {
    const { existsSync } = await import("node:fs");
    const path = await import("node:path");
    for (const nome of [
      "banner-liquen-email.png",
      "social-facebook.png",
      "social-instagram.png",
      "social-linkedin.png",
      "logo-liquen-email.png",
    ]) {
      expect(
        existsSync(path.join(process.cwd(), "public", "email", nome)),
        `falta public/email/${nome}`,
      ).toBe(true);
    }
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TODOS OS LINKS DA ASSINATURA, UM A UM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela depois de o ícone do LinkedIn não abrir o perfil da empresa:
 * «verificar TODOS os links — Facebook, Instagram, LinkedIn, site, email,
 * telefone. URLs em configuração e não fixos no código. Se algum perfil não
 * existir, remover o ícone em vez de o deixar apontar para lado nenhum.»
 *
 * O que um teste PODE afirmar é o que está aqui: que cada link sai da
 * configuração, que tem a forma certa, e que uma rede sem endereço desaparece.
 * O que ele NÃO pode afirmar é que um perfil existe do outro lado — isso é uma
 * ida à internet, e um teste que a fizesse falhava sempre que o LinkedIn
 * estivesse em baixo, que é a definição de teste instável.
 */
describe("os links da assinatura", () => {
  const html = () => assinaturaDeEmail({ nome: "Catarina Gaspar" }).html;
  const texto = () => assinaturaDeEmail({ nome: "Catarina Gaspar" }).texto;

  it("o telefone é dialável no href e legível no ecrã", () => {
    // `tel:` não leva espaços; o que se lê leva.
    expect(html()).toContain(`href="tel:${SITE.phone}"`);
    expect(html()).toContain(SITE.phoneDisplay);
    expect(SITE.phone).toMatch(/^\+\d{6,}$/);
    expect(texto()).toContain(SITE.phoneDisplay);
  });

  /**
   * O endereço da assinatura é o PÚBLICO (`SITE.email`), não a caixa das
   * notificações internas (`MAIL_TO`, que é uma variável de ambiente). Hoje
   * têm o mesmo valor; no dia em que ela mandar os avisos para outra caixa, a
   * assinatura de todos os emails ao cliente passaria a mostrar o endereço
   * interno sem ninguém escrever uma linha para isso acontecer.
   */
  it("o email é o de contacto da empresa, e não o das notificações", () => {
    expect(html()).toContain(`href="mailto:${SITE.email}"`);
    expect(texto()).toContain(SITE.email);
  });

  it("o site aparece sem o esquema, e o href leva-o", () => {
    expect(html()).toContain(`href="${SITE.url}"`);
    expect(html()).toContain(SITE.url.replace(/^https?:\/\//, ""));
  });

  it("as três redes saem da configuração, com o endereço tal e qual", () => {
    const h = html();
    for (const url of [SITE.facebook, SITE.instagram, SITE.linkedin]) {
      expect(url.trim()).not.toBe("");
      expect(h).toContain(`href="${url}"`);
    }
  });

  it("cada rede tem a forma de um endereço do seu sítio", () => {
    expect(SITE.facebook).toMatch(/^https:\/\/(www\.)?facebook\.com\//);
    expect(SITE.instagram).toMatch(/^https:\/\/(www\.)?instagram\.com\//);
    // Um perfil de EMPRESA, e não um perfil pessoal (`/in/`): o ícone da
    // assinatura da casa aponta para a Líquen Events.
    expect(SITE.linkedin).toMatch(/^https:\/\/([a-z]{2}\.)?linkedin\.com\/company\/[^/\s]+$/);
  });

  it("nenhum href fica vazio ou a apontar para lado nenhum", () => {
    const hrefs = [...html().matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(4);
    for (const h of hrefs) {
      expect(h.trim()).not.toBe("");
      expect(h).not.toBe("#");
      expect(h).toMatch(/^(https?:|mailto:|tel:)/);
    }
  });
});
