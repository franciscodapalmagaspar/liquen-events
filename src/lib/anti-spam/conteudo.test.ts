import { describe, expect, it } from "vitest";
import { motivoDeSpam } from "./conteudo";

/**
 * O filtro de conteúdo (17/11). Quando diz «spam», a rota finge sucesso e o
 * pedido perde-se em silêncio — por isso os casos VERDADEIROS (pedidos reais
 * de noivos, em português, com acentos e com ligações de inspiração) são a
 * metade que mais importa deste ficheiro.
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

describe("spam é apanhado", () => {
  const falsos: Array<[string, Parameters<typeof motivoDeSpam>[0], string]> = [
    [
      "ligação no nome",
      { nome: "Cheap SEO https://seo.example.com", mensagem: "hi" },
      "ligacao-no-nome",
    ],
    [
      "domínio de topo de spam",
      { nome: "Mark", mensagem: "Check https://best-offer.xyz/now" },
      "dominio-de-spam",
    ],
    [
      "domínio .ru sem esquema",
      { nome: "Ivan", mensagem: "visit www.cheap-pills.ru today" },
      "dominio-de-spam",
    ],
    [
      "três ligações a sítios desconhecidos",
      { nome: "John", mensagem: "https://a-site.com/x https://b-site.com/y https://c-site.net/z" },
      "ligacoes",
    ],
    [
      "backlinks",
      { nome: "Kevin", mensagem: "We sell high quality backlinks for your website." },
      "palavras-de-spam",
    ],
    [
      "crypto",
      { nome: "Amy", mensagem: "Invest in crypto and double your money." },
      "palavras-de-spam",
    ],
    [
      "online casino",
      { nome: "Bob", mensagem: "Best online casino bonus here" },
      "palavras-de-spam",
    ],
    [
      "duas palavras fracas juntas",
      { nome: "Sam", mensagem: "I can improve your SEO and bring more traffic to your site." },
      "palavras-de-spam",
    ],
    [
      "cirílico",
      { nome: "Анна", mensagem: "Здравствуйте, предлагаем услуги продвижения сайта недорого." },
      "alfabeto",
    ],
    ["maiúsculas não escapam", { nome: "Tom", mensagem: "BUY VIAGRA NOW" }, "palavras-de-spam"],
    [
      "nos outros campos também",
      { nome: "Ok", mensagem: "", outros: ["https://spam-site.top/promo"] },
      "dominio-de-spam",
    ],
  ];
  it.each(falsos)("%s", (_nome, texto, motivo) => {
    expect(motivoDeSpam(texto)).toBe(motivo);
  });
});
