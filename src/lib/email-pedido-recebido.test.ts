import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emailPedidoRecebido, noSitio, type DadosDoPedidoRecebido } from "./email-pedido-recebido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EMAIL QUE SAI É A CARTA DELA — BYTE A BYTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «É assim que quero que o cliente receba a mensagem.» A única prova disso que
 * não depende de olhar é esta: com os valores de exemplo do próprio ficheiro,
 * o HTML que o código monta tem de ser IGUAL ao
 * `docs/email-pedido-recebido-carta.html`, trocados só os marcadores que o
 * ficheiro manda trocar (`LOGO_URL`, `BANNER_URL`, `ICON_*_URL`, `*_URL`).
 *
 * Se alguém mexer num espaçamento, numa cor ou numa palavra — no ficheiro ou
 * no código —, isto deixa de ser igual e diz onde.
 */

const ORIGINAL = readFileSync(join(process.cwd(), "docs/email-pedido-recebido-carta.html"), "utf8");

/** O comentário «A TROCAR antes de usar…» é para quem integra: não segue no email. */
function semComentarioDeAutoria(html: string): string {
  const i = html.indexOf("<!--\n  LÍQUEN EVENTS · Email");
  const j = html.indexOf("-->\n", i) + "-->\n".length;
  return html.slice(0, i) + html.slice(j);
}

const REDES = {
  facebook: "https://www.facebook.com/liquen.events",
  instagram: "https://www.instagram.com/liquen.events",
  linkedin: "https://pt.linkedin.com/company/l%C3%ADquen-events",
};

/** Os valores de exemplo DO FICHEIRO, ligados às variáveis reais. */
const EXEMPLO: DadosDoPedidoRecebido = {
  locale: "pt",
  nome: "Diana",
  referencia: "LIQ-45A65D-0E787B2273E29B21",
  pedido: {
    evento: "Casamento",
    tipo: "casamentos",
    data: "2028-06-10",
    convidados: 200,
    local: "Quinta da Melhorada",
    espaco: "Misto (interior e exterior)",
    cerimonia: "Religiosa",
  },
  casa: {
    nome: "Catarina Gaspar",
    cargo: "Manager",
    telefone: "+351919259820",
    telefoneVisivel: "+351 919 259 820",
    email: "liquen.alentejo@gmail.com",
    site: "https://liquen-events.com",
  },
  imagens: {
    logo: "cid:liquen-logo",
    banner: "cid:liquen-banner",
    redes: [
      { nome: "Facebook", url: REDES.facebook, cid: "liquen-social-facebook" },
      { nome: "Instagram", url: REDES.instagram, cid: "liquen-social-instagram" },
      { nome: "LinkedIn", url: REDES.linkedin, cid: "liquen-social-linkedin" },
    ],
  },
};

/**
 * A ÚNICA mudança que ela pediu depois de mandar o ficheiro: o texto corrido
 * da carta «em formato quadrado» — justificado. São os cinco parágrafos
 * longos: quatro com a margem de 18 px e o primeiro da segunda parte («A nossa
 * equipa…»), que abre com margem zero. O ficheiro dela fica como chegou.
 */
const JUSTIFICADO = "text-align:justify;";
function comTextoJustificado(html: string): string {
  return html
    .replaceAll(
      'style="margin:18px 0 0;font-size:17px;line-height:27px;color:#1d1d1f;">',
      `style="margin:18px 0 0;font-size:17px;line-height:27px;color:#1d1d1f;${JUSTIFICADO}">`,
    )
    .replace(
      'style="margin:0;font-size:17px;line-height:27px;color:#1d1d1f;">A nossa equipa',
      `style="margin:0;font-size:17px;line-height:27px;color:#1d1d1f;${JUSTIFICADO}">A nossa equipa`,
    );
}

/** O ficheiro dela com os marcadores trocados e o texto justificado — e mais nada. */
const ESPERADO = comTextoJustificado(semComentarioDeAutoria(ORIGINAL))
  .replace('src="LOGO_URL"', 'src="cid:liquen-logo"')
  .replace('src="BANNER_URL"', 'src="cid:liquen-banner"')
  // Os ícones antes das ligações: `ICON_FACEBOOK_URL` contém `FACEBOOK_URL`.
  .replace('src="ICON_FACEBOOK_URL"', 'src="cid:liquen-social-facebook"')
  .replace('src="ICON_INSTAGRAM_URL"', 'src="cid:liquen-social-instagram"')
  .replace('src="ICON_LINKEDIN_URL"', 'src="cid:liquen-social-linkedin"')
  .replace('href="FACEBOOK_URL"', `href="${REDES.facebook}"`)
  .replace('href="INSTAGRAM_URL"', `href="${REDES.instagram}"`)
  .replace('href="LINKEDIN_URL"', `href="${REDES.linkedin}"`);

/** Onde duas cadeias começam a divergir, para o vermelho dizer ONDE. */
function primeiraDiferenca(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length && i === b.length) return "iguais";
  const linha = a.slice(0, i).split("\n").length;
  return `linha ${linha}:\n  esperado: ${JSON.stringify(a.slice(i - 40, i + 60))}\n  saiu:     ${JSON.stringify(b.slice(i - 40, i + 60))}`;
}

const comPedido = (p: Partial<DadosDoPedidoRecebido["pedido"]>) =>
  emailPedidoRecebido({ ...EXEMPLO, pedido: { ...EXEMPLO.pedido, ...p } });

describe("o email «Pedido de proposta» é a carta dela", () => {
  it("com os valores de exemplo, o HTML é igual ao ficheiro dela", () => {
    const { html } = emailPedidoRecebido(EXEMPLO);
    expect(html === ESPERADO, primeiraDiferenca(ESPERADO, html)).toBe(true);
  });

  it("e o assunto é o do ficheiro", () => {
    expect(emailPedidoRecebido(EXEMPLO).subject).toBe(
      "Pedido de Proposta – Casamento | 10 de junho de 2028",
    );
  });

  it("e nenhum marcador do ficheiro fica por trocar", () => {
    const { html } = emailPedidoRecebido(EXEMPLO);
    for (const m of [
      "LOGO_URL",
      "BANNER_URL",
      "ICON_",
      "FACEBOOK_URL",
      "INSTAGRAM_URL",
      "LINKEDIN_URL",
    ]) {
      expect(html, `ficou «${m}» no email`).not.toContain(m);
    }
  });

  /**
   * O CONTROLO NEGATIVO: a comparação apanha uma mudança de um píxel. Sem
   * isto, um `ESPERADO` montado a partir da própria saída passava sempre.
   */
  it("o texto corrido sai justificado, e só ele", () => {
    const { html } = emailPedidoRecebido(EXEMPLO);
    expect(html.split(JUSTIFICADO)).toHaveLength(6);
    expect(html).toContain(`color:#1d1d1f;">Estimada Diana,</p>`);
  });

  it("e a comparação apanha um espaçamento mexido", () => {
    const { html } = emailPedidoRecebido(EXEMPLO);
    const mexido = html.replace("padding:26px 40px 0;", "padding:25px 40px 0;");
    expect(mexido).not.toBe(ESPERADO);
    expect(ESPERADO).toContain("padding:26px 40px 0;");
  });
});

describe("o que muda de pedido para pedido", () => {
  it("homem com nome claro: «Estimado»; nome ambíguo: «Olá»", () => {
    expect(emailPedidoRecebido({ ...EXEMPLO, nome: "João" }).html).toContain(">Estimado João,</p>");
    expect(emailPedidoRecebido({ ...EXEMPLO, nome: "Alex" }).html).toContain(">Olá Alex,</p>");
    expect(emailPedidoRecebido({ ...EXEMPLO, nome: "" }).html).toContain(">Olá,</p>");
  });

  it("o tipo entra na frase com o género certo", () => {
    const { html } = comPedido({ evento: "Conferência", tipo: "conferencias", local: "Évora" });
    expect(html).toContain(
      "para a organização da vossa conferência, prevista para o dia 10 de junho de 2028, no local indicado.",
    );
  });

  it("sem tipo, «evento» — nunca o rótulo plural da lista", () => {
    const { html } = comPedido({ evento: "", tipo: null });
    expect(html).toContain("organização do vosso evento, previsto para o dia");
  });

  it("sem data: a frase encurta, o resumo diz «Ainda a definir», e o assunto perde o «|»", () => {
    const { html, subject, text } = comPedido({ data: "" });
    expect(html).toContain("do vosso casamento, no local indicado.</p>");
    expect(html).toContain(">Ainda a definir</td>");
    expect(html).toContain(">Casamento</p>");
    expect(subject).toBe("Pedido de Proposta – Casamento");
    expect(text).toContain("Data: Ainda a definir");
    expect(html).toContain("Confirmamos a receção do vosso pedido, no local indicado.");
  });

  it("o local aparece UMA vez, no resumo, tal como foi escrito (28/10)", () => {
    const { html, text } = comPedido({ local: "Rampa beach club" });
    expect(html.match(/Rampa beach club/g)).toHaveLength(1);
    expect(html).toContain(">Rampa beach club</td>");
    expect(html).not.toContain("em Rampa");
    expect(text.match(/Rampa beach club/g)).toHaveLength(1);
  });

  it("sem local: não fica vírgula pendurada", () => {
    const { html } = comPedido({ local: "" });
    expect(html).toContain("previsto para o dia 10 de junho de 2028.</p>");
    expect(html).not.toContain(">Local</td>");
    expect(html).toContain("Confirmamos a receção do vosso pedido para 10 de junho de 2028.");
  });

  it("os convidados dizem a estimativa que ele escolheu, como previsão", () => {
    const { html } = comPedido({ convidados: undefined, convidadosEstimativa: "100 a 150" });
    expect(html).toContain(">100 a 150 (previsão)</td>");
  });

  it("uma linha que chegue vazia sai, e a referência continua a ser a última, com o filete de baixo", () => {
    const { html } = comPedido({ cerimonia: "", espaco: "" });
    expect(html).not.toContain(">Cerimónia</td>");
    expect(html).not.toContain(">Espaço</td>");
    expect(html).toContain(
      'border-bottom:1px solid #d2d2d7;color:#1d1d1f;word-break:break-all;">LIQ-45A65D-0E787B2273E29B21</td>',
    );
  });

  it("escreve o que o cliente escreveu, sem o deixar entrar no HTML", () => {
    const { html } = emailPedidoRecebido({
      ...EXEMPLO,
      nome: '<img src=x onerror="alert(1)">',
      pedido: { ...EXEMPLO.pedido, local: "<b>Évora</b>", evento: 'Festa "da" Ana' },
    });
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<b>Évora</b>");
    expect(html).toContain("&lt;b&gt;Évora&lt;/b&gt;");
  });

  it("sem banner nem redes, os blocos saem inteiros — não fica uma imagem partida", () => {
    const { html } = emailPedidoRecebido({
      ...EXEMPLO,
      imagens: { ...EXEMPLO.imagens, banner: null, redes: [] },
    });
    expect(html).not.toContain("liquen-banner");
    expect(html).not.toContain("liquen-social-");
    expect(html).not.toContain("<!-- Banner Líquen -->");
  });
});

describe("a preposição antes do sítio", () => {
  it.each([
    ["Quinta da Melhorada", "na Quinta da Melhorada"],
    ["Herdade do Esporão", "na Herdade do Esporão"],
    ["Convento do Espinheiro", "no Convento do Espinheiro"],
    ["Palácio de Estoi", "no Palácio de Estoi"],
    ["O Convento", "no Convento"],
    ["Porto", "no Porto"],
    ["Évora", "em Évora"],
    ["Lisboa", "em Lisboa"],
  ])("%s → %s", (local, esperado) => {
    expect(noSitio(local, "pt")).toBe(esperado);
  });

  it("em inglês: «at» um sítio de eventos, «in» uma cidade", () => {
    expect(noSitio("Quinta da Melhorada", "en")).toBe("at Quinta da Melhorada");
    expect(noSitio("Évora", "en")).toBe("in Évora");
  });
});

describe("e em inglês, com o mesmo desenho", () => {
  const EN: DadosDoPedidoRecebido = {
    ...EXEMPLO,
    locale: "en",
    pedido: {
      ...EXEMPLO.pedido,
      evento: "Wedding",
      espaco: "Indoors and outdoors",
      cerimonia: "Religious",
    },
  };

  it("diz tudo em inglês", () => {
    const { subject, html, text } = emailPedidoRecebido(EN);
    expect(subject).toBe("Proposal Request – Wedding | 10 June 2028");
    expect(html).toContain('<html lang="en"');
    expect(html).toContain(">Dear Diana,</p>");
    expect(html).toContain(
      "for the organisation of your wedding, planned for 10 June 2028, at the venue you mentioned.",
    );
    expect(html).toContain(">200 (estimate)</td>");
    for (const pt of [
      "Pedido de",
      "Estimada",
      "Convidados",
      "Referência",
      "cumprimentos",
      "Recebeu este",
    ]) {
      expect(html, `ficou «${pt}» no email inglês`).not.toContain(pt);
      expect(text, `ficou «${pt}» no texto inglês`).not.toContain(pt);
    }
  });

  /**
   * O mesmo desenho: tirando o texto, o esqueleto do HTML inglês é o do
   * português — as mesmas etiquetas, classes, cores, tamanhos e espaçamentos.
   */
  it("e o esqueleto é o mesmo do português", () => {
    const esqueleto = (h: string) =>
      h.replace(/>[^<]*</g, "><").replace(/ (lang|alt)="[^"]*"/g, "");
    expect(esqueleto(emailPedidoRecebido(EN).html)).toBe(
      esqueleto(emailPedidoRecebido(EXEMPLO).html),
    );
  });
});
