import { describe, expect, it } from "vitest";
import { deConfianca, motivoDeSpam } from "./conteudo";

/**
 * O filtro de conteúdo (17/11). Já não descarta nada: quando diz «spam», o
 * pedido grava-se na mesma, com a marca «possível spam». Mesmo assim, a marca
 * não deve sair a quem não é spam — por isso os casos VERDADEIROS (pedidos
 * reais de noivos, em português, com acentos e com ligações de inspiração) são
 * a metade que mais importa deste ficheiro.
 */

describe("pedidos verdadeiros passam", () => {
  const verdadeiros: Array<[string, Parameters<typeof motivoDeSpam>[0]]> = [
    [
      "português com acentos",
      {
        nome: "Inês Conceição Gonçalves",
        mensagem:
          "Olá! Vamos casar em junho de 2027 na Quinta da Aveleda, cerca de 120 convidados. Gostávamos de flores em tons de pêssego e verde-oliva, com muitas velas. Obrigada!",
      },
    ],
    [
      "uma ligação de Pinterest",
      {
        nome: "João & Matilde",
        mensagem:
          "Deixamos aqui a nossa pasta de inspiração: https://pin.it/3xYz9AbC e também https://www.pinterest.pt/matilde/casamento-boho/",
      },
    ],
    [
      "várias ligações de inspiração e de ficheiros",
      {
        nome: "Ana Sá",
        mensagem:
          "https://www.instagram.com/p/abc https://pinterest.com/pin/1 https://pinterest.com/pin/2 https://we.tl/t-xyz https://maps.app.goo.gl/aaa",
      },
    ],
    [
      "o Casino Estoril é um sítio de casamentos",
      { nome: "Rita", mensagem: "Jantar de empresa no Casino Estoril, 200 pessoas, dezembro." },
    ],
    [
      "um evento de empresa fala de marketing",
      {
        nome: "Paula Marques",
        mensagem:
          "Somos a equipa de marketing de uma empresa de Lisboa e queremos um jantar de Natal.",
      },
    ],
    [
      "duas ligações a sítios dos noivos",
      {
        nome: "Tiago",
        mensagem:
          "O local é https://www.quintadoscomes.pt e o catering https://www.cateringdaana.pt/menus",
      },
    ],
    [
      "um nome em grego",
      { nome: "Γιώργος Παπαδόπουλος", mensagem: "We are getting married in Comporta in May." },
    ],
    [
      "um «obrigado» em chinês no fim",
      {
        nome: "Li Wei",
        mensagem: "Wedding for 80 guests in Sintra, September 2027. Thank you! 谢谢",
      },
    ],
    [
      "três quintas portuguesas a comparar",
      {
        nome: "Marta",
        mensagem:
          "Estamos indecisos entre https://www.quintadaaveleda.pt, https://www.herdadedoesporao.pt/eventos e www.monteda-ravasqueira.pt",
      },
    ],
    ["sem mensagem", { nome: "Maria", mensagem: "" }],
    [
      "um site .pt com caminho",
      { nome: "Sofia", mensagem: "Vejam liquen-events.com/galeria, adorámos." },
    ],
  ];
  it.each(verdadeiros)("%s", (_nome, texto) => {
    expect(motivoDeSpam(texto)).toBeNull();
  });
});

/**
 * A tabela da revisão independente de 17/11: pedidos verdadeiros que a
 * primeira versão do filtro apanhava (e deitava fora). Nenhum leva a marca.
 */
describe("a tabela da revisão: verdadeiros que a primeira versão apanhava", () => {
  const casos: Array<[string, Parameters<typeof motivoDeSpam>[0]]> = [
    [
      "três quintas .com",
      {
        nome: "Carolina",
        mensagem:
          "Estamos a ver https://www.quintadamalveira.com, https://www.quintadotorneiro.com/eventos e https://www.casadosarcos.com/casamentos",
      },
    ],
    [
      "quatro sítios .com distintos, um deles repetido",
      {
        nome: "Rui",
        mensagem:
          "https://a-quinta.com/1 https://a-quinta.com/2 https://b-quinta.com/x https://fotografo-c.com/p https://dj-d.com/s",
      },
    ],
    [
      "OneDrive e zola",
      {
        nome: "Emma",
        mensagem:
          "Our board: https://1drv.ms/f/s!AbCdEf and https://onedrive.live.com/view?id=1 — website https://www.zola.com/wedding/emmaandtom and https://withjoy.com/emma-tom",
      },
    ],
    [
      "canva.site e notion.site",
      {
        nome: "Leonor",
        mensagem:
          "https://leonor-e-pedro.canva.site/ e https://pedro.notion.site/Casamento-123 e https://www.pinterest.com/x/ e https://exemplo.com/a",
      },
    ],
    ["«Олена Шевченко» sozinha", { nome: "Олена Шевченко", mensagem: "" }],
    [
      "«Олена Шевченко» com uma mensagem curta em inglês",
      { nome: "Олена Шевченко", mensagem: "Wedding in Lisbon, June 2027, 60 guests." },
    ],
    [
      "os noivos com nomes em cirílico",
      {
        nome: "Olena",
        mensagem: "Hello!",
        nomes: ["Олена Шевченко", "Тарас Коваленко"],
      },
    ],
    [
      "uma mensagem inteira em ucraniano",
      {
        nome: "Олена Шевченко",
        mensagem:
          "Добрий день! Ми плануємо весілля в Сінтрі у червні 2027 року, приблизно 80 гостей. Хотіли б квіти в пастельних тонах. Дякуємо!",
      },
    ],
    [
      "ucraniano longo com o portefólio do fotógrafo",
      {
        nome: "Олена Шевченко",
        mensagem:
          "Добрий день! Плануємо весілля в Сінтрі у червні 2027 року, приблизно 80 гостей. Наш фотограф: https://ivanphoto.ru/portfolio",
      },
    ],
    [
      "uma mensagem inteira em chinês",
      {
        nome: "王芳",
        mensagem:
          "您好！我们计划明年六月在里斯本举行婚礼，大约一百位客人。我们希望用白色和绿色的花。请给我们报价。谢谢！",
      },
    ],
    [
      "Pornic (uma terra em França)",
      { nome: "Claire", mensagem: "We live in Pornic, France, and want to marry in Portugal." },
    ],
    [
      "traffic e leads num evento de empresa",
      {
        nome: "Mark",
        mensagem:
          "Corporate dinner for our sales team (we celebrate a record year in leads). Please consider traffic in Lisbon, the venue is downtown. SEO team included.",
      },
    ],
    [
      "bitcoin sem ligação",
      { nome: "Satoshi", mensagem: "Can we pay in bitcoin? Wedding for 50 guests in Porto." },
    ],
    [
      "bitcoin ao lado do Pinterest (ligação de confiança)",
      {
        nome: "Rita",
        mensagem: "O nosso Pinterest: https://pin.it/abc — podemos pagar em bitcoin?",
      },
    ],
    [
      "www.x.com e x.com são o mesmo sítio",
      {
        nome: "Rui",
        mensagem:
          "https://www.quinta-a.com/x https://quinta-a.com/y https://www.quinta-b.com/z https://quinta-b.com/w https://fotografo.com/p",
      },
    ],
    [
      "um mapa do google.ru e dois fornecedores",
      {
        nome: "Olga",
        mensagem:
          "https://www.google.ru/maps/place/x https://quinta-a.com/x https://fotografo.com/p",
      },
    ],
    [
      "crypto sem ligação",
      {
        nome: "Amy",
        mensagem: "We met at a crypto conference, so a small nod to that would be fun.",
      },
    ],
    [
      "o fotógrafo ivanphoto.ru",
      { nome: "Ivan", mensagem: "Our photographer: https://ivanphoto.ru/portfolio" },
    ],
    [
      "o fotógrafo ivanphoto.ru ao lado do Pinterest e do OneDrive",
      {
        nome: "Olena",
        mensagem:
          "https://ivanphoto.ru/portfolio, https://pin.it/abc e https://1drv.ms/f/s!x — e de novo https://ivanphoto.ru/casamentos.",
      },
    ],
  ];
  it.each(casos)("%s", (_nome, texto) => {
    expect(motivoDeSpam(texto)).toBeNull();
  });
});

describe("spam é apanhado", () => {
  const falsos: Array<[string, Parameters<typeof motivoDeSpam>[0], string]> = [
    [
      "ligação no nome",
      { nome: "Cheap SEO https://seo.example.com", mensagem: "hi" },
      "ligacao-no-nome",
    ],
    [
      "dois domínios de topo de spam",
      { nome: "Mark", mensagem: "Check https://best-offer.xyz/now and https://more-offers.top/x" },
      "dominio-de-spam",
    ],
    [
      "um domínio .ru sem esquema, com outra ligação",
      { nome: "Ivan", mensagem: "visit www.cheap-pills.ru today, or https://pills-shop.com/buy" },
      "dominio-de-spam",
    ],
    [
      "um domínio de spam com uma palavra suspeita",
      { nome: "Ivan", mensagem: "Best ranking for you: https://rank.xyz/now" },
      "dominio-de-spam",
    ],
    [
      "cinco ligações a sítios desconhecidos e distintos",
      {
        nome: "John",
        mensagem:
          "https://a-site.com/x https://b-site.com/y https://c-site.net/z https://d-site.org/w https://e-site.io/v",
      },
      "ligacoes",
    ],
    [
      "backlinks",
      { nome: "Kevin", mensagem: "We sell high quality backlinks for your website." },
      "palavras-de-spam",
    ],
    [
      "crypto com uma ligação",
      { nome: "Amy", mensagem: "Invest in crypto and double your money: https://coins-now.com/a" },
      "palavras-de-spam",
    ],
    [
      "um domínio que só COMEÇA por google. não é a Google",
      {
        nome: "Bot",
        mensagem:
          "https://google.spam1.com/a https://google.spam2.com/b https://pinterest.spam3.com/c https://google.spam4.com/d https://pinterest.spam5.com/e",
      },
      "ligacoes",
    ],
    [
      "sósias da Google e do Pinterest não são de confiança",
      {
        nome: "Bot",
        mensagem:
          "https://google.abc.de/a https://pinterest.abc.de/b https://google.xyz.ru/c https://pinterest.com.ru/d https://google.qqq.de/e",
      },
      "dominio-de-spam",
    ],
    [
      "crypto com uma página do Notion",
      {
        nome: "Bot",
        mensagem: "Invest in crypto and double your money: https://gains.notion.site/now",
      },
      "palavras-de-spam",
    ],
    ["porno", { nome: "X", mensagem: "free porno videos" }, "palavras-de-spam"],
    [
      "online casino",
      { nome: "Bob", mensagem: "Best online casino bonus here" },
      "palavras-de-spam",
    ],
    [
      "duas palavras fracas juntas",
      {
        nome: "Sam",
        mensagem: "I can improve your SEO and your Google ranking, cheap outsourcing.",
      },
      "palavras-de-spam",
    ],
    [
      "cirílico longo com duas ligações a sítios desconhecidos",
      {
        nome: "Анна",
        mensagem:
          "Здравствуйте, предлагаем услуги продвижения сайта недорого и быстро, подробнее здесь https://prodvizhenie-saitov.com/ceny и https://raskrutka.net/zakaz",
      },
      "alfabeto",
    ],
    ["maiúsculas não escapam", { nome: "Tom", mensagem: "BUY VIAGRA NOW" }, "palavras-de-spam"],
    [
      "nos outros campos também",
      { nome: "Ok", mensagem: "", outros: ["https://spam-site.top/promo https://spam2.click/x"] },
      "dominio-de-spam",
    ],
  ];
  it.each(falsos)("%s", (_nome, texto, motivo) => {
    expect(motivoDeSpam(texto)).toBe(motivo);
  });
});

/**
 * O CodeQL do lote de 17/11 apontou a regra das marcas «de país» (`pinterest.`,
 * `google.`): fazia uma expressão regular com o nome da marca escapando só os
 * pontos («incomplete string escaping» e «incomplete regular expression for
 * hostnames»). Qualquer outro carácter especial do nome virava regra da
 * expressão. Agora compara-se rótulo a rótulo, sem expressão nenhuma.
 */
describe("a marca de confiança compara rótulos, não uma expressão regular", () => {
  it("um carácter especial no nome da marca vale como letra, não como regra", () => {
    const mais = deConfianca("a+b.");
    expect(mais("a+b.com")).toBe(true);
    expect(mais("aaab.com")).toBe(false);
    const ponto = deConfianca("a.b.");
    expect(ponto("a.b.pt")).toBe(true);
    expect(ponto("x.a.b.co.uk")).toBe(true);
    expect(ponto("axb.pt")).toBe(false);
  });

  it("as marcas da casa continuam a dizer o mesmo", () => {
    const google = deConfianca("google.");
    const sim = [
      "google.com",
      "google.pt",
      "google.co.uk",
      "google.com.br",
      "maps.google.com",
      "google.ru",
      "google.cn",
    ];
    for (const d of sim) expect(google(d), d).toBe(true);
    const nao = [
      "google.top",
      "google.com.ru",
      "google.spam1.com",
      "google.abc.de",
      "notgoogle.com",
      "google.info",
      "google",
      "google.c0m",
    ];
    for (const d of nao) expect(google(d), d).toBe(false);
    const pin = deConfianca("pinterest.");
    expect(pin("pinterest.pt")).toBe(true);
    expect(pin("pinterest.com.ru")).toBe(false);
    expect(deConfianca("pin.it")("pin.it")).toBe(true);
    expect(deConfianca("pin.it")("xpin.it")).toBe(false);
  });
});
