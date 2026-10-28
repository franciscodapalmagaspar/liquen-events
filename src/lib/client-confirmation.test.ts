import { describe, it, expect } from "vitest";
import { buildClientConfirmation } from "./client-confirmation";

describe("buildClientConfirmation", () => {
  /**
   * ── A REFERÊNCIA VOLTOU AO EMAIL ──────────────────────────────────────
   *
   * O desenho anterior escondia-a, por decisão dela. A carta que ela mandou
   * depois («é assim que quero que o cliente receba a mensagem») mostra-a na
   * última linha do resumo — é essa a regra agora. Vai no corpo e no texto;
   * no assunto e no pré-cabeçalho continua a não ir.
   */
  it("builds a Portuguese quote confirmation as her letter, with the reference in the summary", () => {
    const { subject, html, text } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
    });
    expect(subject).toBe("Pedido de Proposta");
    expect(html).toContain(">Estimada Ana,</p>");
    expect(html).toContain('word-break:break-all;">LIQ-ABC-1234</td>');
    expect(text).toContain("Referência: LIQ-ABC-1234");
    expect(subject).not.toContain("LIQ-");
  });

  it("states no turnaround at all — not a date, not a window", () => {
    const { subject, html, text } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
    });
    // In high season a number the team can't always hit does more damage than
    // the reassurance it buys. «Em breve» promises no number.
    const timing =
      /\d+\s*(horas?|dias?)\s*úteis|segunda-feira|terça-feira|quarta-feira|quinta-feira|sexta-feira/i;
    expect(subject).not.toMatch(timing);
    expect(html).not.toMatch(timing);
    expect(text).not.toMatch(timing);
  });

  it("mirrors the event back in the summary table", () => {
    const { html, text } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
      event: {
        typeLabel: "Casamento",
        date: "2027-02-23",
        guests: 120,
        location: "Évora",
        space: "Exterior",
        ceremony: "Civil",
        plural: true,
      },
    });
    expect(html).toContain(">Casamento, 23 de fevereiro de 2027</p>");
    expect(html).toContain(">23 de fevereiro de 2027</td>");
    expect(html).toContain(">120 (previsão)</td>");
    expect(html).toContain(">Évora</td>");
    expect(html).toContain(">Exterior</td>");
    expect(html).toContain(">Civil</td>");
    expect(text).toContain("Data: 23 de fevereiro de 2027");
  });

  /**
   * O registo é o da carta dela, à letra — «o seu contacto», «o vosso dia» —
   * e o tipo entra na frase pelo TIPO, não pela etiqueta.
   */
  it("puts the event type in the sentence by its noun", () => {
    const { html, text } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
      event: {
        typeLabel: "Casamento",
        eventType: "casamentos",
        date: "2027-02-23",
        location: "Quinta do Vale",
        plural: true,
      },
    });
    expect(html).toContain(
      "organização do vosso casamento, previsto para o dia 23 de fevereiro de 2027, no local indicado.",
    );
    expect(text).toContain("Agradecemos o seu contacto");
  });

  it("an open date says «Ainda a definir», as the form does", () => {
    const { html } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
      event: { typeLabel: "Casamento", date: "", plural: true },
    });
    expect(html).toContain(">Ainda a definir</td>");
  });

  it("the guest estimate she picked is what the email shows", () => {
    const { html } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
      event: { typeLabel: "Casamento", guestsRange: "100 a 150" },
    });
    expect(html).toContain(">100 a 150 (previsão)</td>");
  });

  it("every image in the email travels with it as an attachment", () => {
    const { html, attachments } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
    });
    const noHtml = new Set([...html.matchAll(/src="cid:([^"]+)"/g)].map((m) => m[1]));
    const anexados = new Set(attachments.map((a) => a.cid));
    expect(noHtml.size).toBeGreaterThan(0);
    for (const cid of noHtml) expect(anexados, `«cid:${cid}» sem anexo`).toContain(cid);
    // E nenhuma imagem por endereço remoto.
    expect(html).not.toMatch(/<img[^>]+src="https?:/);
  });

  it("builds an English contact confirmation (no reference, no steps)", () => {
    const { subject, html } = buildClientConfirmation({
      locale: "en",
      name: "John",
    });
    expect(subject).toMatch(/received your message/);
    expect(html).toContain("Hello John");
    expect(html).not.toContain("LIQ-");
    // The 3-step ladder would be a lie with no proposal coming.
    expect(html).not.toContain("What happens next");
  });

  it("greets by first name only, and copes with an empty name", () => {
    const { html } = buildClientConfirmation({
      locale: "pt",
      name: "  Ana   Maria  Silva ",
    });
    expect(html).toContain("Olá Ana,");

    const bare = buildClientConfirmation({ locale: "pt", name: "   " });
    expect(bare.html).toContain("Olá,");
    expect(bare.html).not.toContain("Olá ,");
  });

  it("strips bidi overrides that would reverse the rendering", () => {
    const { html } = buildClientConfirmation({
      locale: "pt",
      name: "Ana‮",
    });
    expect(html).not.toContain("‮");
  });

  it("is a complete document with a preheader and dark-mode support", () => {
    const { html } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
    });
    expect(html).toMatch(/^<!doctype html>/i);
    // O desenho dela declara `lang="pt"` (era `pt-PT` no anterior).
    expect(html).toContain('lang="pt"');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("mso-hide:all"); // hidden preheader
  });

  it("escapes HTML in the client-provided name", () => {
    const { html } = buildClientConfirmation({
      locale: "pt",
      name: '<img src=x onerror="alert(1)">',
    });
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain("&lt;img");
  });
});

/**
 * A confirmação do formulário público também é um email para um cliente — e
 * portanto leva a MESMA assinatura que as respostas escritas à mão, o envio da
 * proposta e o recibo. Era o único que tinha um fecho próprio.
 */
describe("buildClientConfirmation — assinatura da casa", () => {
  it("assina com o nome e o cargo da casa, no HTML e no texto", () => {
    const { html, text } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
    });
    expect(html).toContain("Catarina Gaspar");
    expect(html).toContain("Manager");
    expect(text).toContain("Catarina Gaspar");
    expect(text).toContain("Manager");
  });

  it("assina também a versão inglesa — a assinatura é a mesma em todo o lado", () => {
    const { html } = buildClientConfirmation({ locale: "en", name: "John" });
    expect(html).toContain("Catarina Gaspar");
  });

  it("não repete os contactos duas vezes no mesmo email", () => {
    const { html } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
    });
    const vezes = html.split("+351 919 259 820").length - 1;
    expect(vezes).toBe(1);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 * A ETIQUETA NO TÍTULO, O SUBSTANTIVO NA FRASE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Uma frase de abertura antiga colava o RÓTULO do tipo numa frase e errou de
 * três maneiras em correio verdadeiro («para o casamentos», «para o outro», a
 * vírgula pendurada sem data). A carta dela volta a ter o tipo numa frase
 * («a organização do vosso casamento»), e por isso a frase usa o TIPO (que tem
 * substantivo e género próprios) e nunca a etiqueta — que fica no assunto e no
 * título, onde é etiqueta.
 */
describe("buildClientConfirmation — o tipo de evento é uma etiqueta", () => {
  const base = { locale: "pt", name: "Ana", referenceId: "LIQ-ABC-1234" } as const;

  it("um rótulo de lista entra tal como é, e nunca a meio de uma frase", () => {
    const { html, text } = buildClientConfirmation({
      ...base,
      event: {
        typeLabel: "Batizado / Comunhão",
        eventType: "batizados",
        date: "2027-05-03",
        plural: true,
      },
    });
    expect(html).toContain(">Batizado / Comunhão, 3 de maio de 2027</p>");
    expect(html).toContain("do vosso batizado, previsto para o dia 3 de maio de 2027.");
    expect(text.toLowerCase()).not.toContain("vosso batizado / comunhão");

    // Sem tipo (o «Outro» do formulário): «evento», nunca a etiqueta.
    const outro = buildClientConfirmation({
      ...base,
      event: { typeLabel: "Outro", date: "2027-05-03" },
    });
    expect(outro.html).toContain("do vosso evento, previsto para o dia 3 de maio de 2027.");
    expect(outro.html.toLowerCase()).not.toContain("vosso outro");
  });

  it("o email inglês diz tudo em inglês, incluindo o tipo na etiqueta", () => {
    const { subject, text, html } = buildClientConfirmation({
      locale: "en",
      name: "Sarah",
      referenceId: "LIQ-ABC-1234",
      // A etiqueta chega já na língua de quem lê — é a rota que a resolve.
      event: { typeLabel: "Wedding", date: "2027-06-12", location: "Évora", plural: true },
    });
    expect(subject).toBe("Proposal Request – Wedding | 12 June 2027");
    expect(text).toContain("Date: 12 June 2027");
    expect(html).toContain(">12 June 2027</td>");
    expect(text.toLowerCase()).not.toContain("casamento");
    expect(html.toLowerCase()).not.toContain("casamento");
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 * O EMAIL NÃO AFIRMA A GEOGRAFIA DO EVENTO DE QUEM O RECEBE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A 7 de agosto uma cliente com um casamento em Vermil, Guimarães, leu no
 * corpo «No Alentejo, a altura do ano muda por completo a luz…». O conselho é
 * verdadeiro; a geografia não era a dela. A nota da data em aberto é o único
 * parágrafo do email que fala do país, e fala dele sem prender ninguém a uma
 * região.
 *
 * O que PODE continuar a dizer Alentejo é a assinatura — a morada da casa é
 * quem somos, não onde é o evento.
 */
describe("buildClientConfirmation — a geografia do evento é a do cliente", () => {
  it("não põe o evento no Alentejo por omissão", () => {
    const { text, html } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
      event: { typeLabel: "Casamento", date: "", location: "Vermil, Guimarães", plural: true },
    });
    // A nota das épocas saiu com o desenho novo; o que fica guardado é que o
    // email não afirma uma região que pode não ser a do evento.
    expect(text).not.toMatch(/n[oa] Alentejo/i);
    expect(html).not.toMatch(/n[oa] Alentejo/i);
  });

  it("nem na versão inglesa", () => {
    const { text } = buildClientConfirmation({
      locale: "en",
      name: "Sarah",
      referenceId: "LIQ-ABC-1234",
      event: { typeLabel: "Wedding", date: "", location: "Guimarães", plural: true },
    });
    expect(text).not.toMatch(/in the Alentejo/i);
  });
});

/**
 * «Olá Vanessa martins,» e «Olá Francisco Maria Carrelhas Das Neves Da Palma
 * Gaspar,» — os dois saíram, a 27 e 28 de julho. Uma saudação usa o primeiro
 * nome: é mais curto, é como se trata alguém, e não há apelido em minúscula
 * para reparar.
 *
 * A CAIXA fica como a pessoa a escreveu, de propósito: «de», «da» e os nomes
 * estrangeiros são assim em muitos casos, e um corrector de maiúsculas erra
 * sempre com alguém — que é precisamente o dano que se quer evitar.
 */
describe("buildClientConfirmation — a saudação usa o primeiro nome", () => {
  it("corta o nome completo no primeiro nome, e não mexe na caixa", () => {
    const curto = buildClientConfirmation({ locale: "pt", name: "Vanessa martins" });
    expect(curto.text).toContain("Olá Vanessa,");
    expect(curto.text).not.toContain("martins");

    const comprido = buildClientConfirmation({
      locale: "pt",
      name: "Francisco Maria Carrelhas Das Neves Da Palma Gaspar",
    });
    expect(comprido.text).toContain("Olá Francisco,");
    expect(comprido.text).not.toContain("Carrelhas");
  });
});
