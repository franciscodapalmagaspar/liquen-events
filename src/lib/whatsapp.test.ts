import { describe, expect, it } from "vitest";
import {
  linkDaConversa,
  linkDoWhatsApp,
  numeroParaWhatsApp,
  timelineParaWhatsApp,
} from "./whatsapp";
import type { TimelineItem } from "./orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MENSAGEM QUE VAI PELO WHATSAPP É A MESMA FOLHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este texto é o que fica no telemóvel do fornecedor — longe do papel, longe do
 * ecrã dela, e sem nada com que o comparar. Se agrupar de outra maneira, ninguém
 * dá pela diferença até ao dia em que duas pessoas discordam sobre a mesma hora.
 */

const m = (t: Partial<TimelineItem> & { time: string; title: string }): TimelineItem => ({
  id: `${t.time}-${t.title}`,
  ...t,
});

const DIA: TimelineItem[] = [
  m({ time: "08:30", title: "Chegada Icook", local: "Fitapreta" }),
  m({ time: "10:30", title: "Chegada Festaaluga" }),
  m({ time: "10:30", title: "Chegada Liquen Flowers" }),
  m({ time: "16:30", title: "Sergey chega", local: "Fitapreta", notas: "enviar táxi" }),
];

describe("a timeline escrita para o WhatsApp", () => {
  const texto = timelineParaWhatsApp({
    titulo: "Casamento J&P 28.06.25",
    adultos: "240",
    staff: "24",
    momentos: DIA,
  });

  it("escreve a hora uma vez, com tudo o que acontece nela por baixo", () => {
    /* A primeira das duas regras da folha. Numa lista seriam duas linhas «10h30»
       seguidas, e a coluna da esquerda passava a parecer dois momentos. */
    expect(texto.match(/10h30/g)).toHaveLength(1);
    expect(texto).toContain("• Chegada Festaaluga");
    expect(texto).toContain("• Chegada Liquen Flowers");
  });

  it("escreve o local quando MUDA, e não em todas as linhas", () => {
    /* A segunda regra. «Fitapreta» às 08h30 e nada até mudar — incluindo às
       16h30, que é o mesmo sítio. */
    expect(texto.match(/Fitapreta/g)).toHaveLength(1);
    expect(texto).toContain("*08h30* — Fitapreta");
  });

  it("leva as contagens e as notas, que é o que ninguém tem de cor", () => {
    expect(texto).toContain("240 adultos");
    expect(texto).toContain("24 staff");
    // Sem crianças escritas, não se inventa um zero.
    expect(texto).not.toContain("crianças");
    expect(texto).toContain("↳ enviar táxi");
  });

  it("acaba com o contacto da casa", () => {
    /* A mensagem anda pelos telemóveis de dez fornecedores. Quem precisar de
       ligar à Líquen às sete da manhã tem o número onde já está a olhar. */
    expect(texto).toMatch(/Líquen/);
    expect(texto).toMatch(/\+351/);
  });
});

describe("o endereço que abre o WhatsApp", () => {
  it("leva a mensagem escrita e NÃO leva destinatário", () => {
    /* Sem número, o WhatsApp abre na lista de contactos — que é o que ela
       pediu. Com número, ia direito a uma conversa: acertava quase sempre, e no
       dia em que errasse mandava uma proposta com preços à florista. */
    const url = linkDoWhatsApp("olá");
    expect(url).toContain("text=ol%C3%A1");
    expect(url).not.toMatch(/wa\.me\/\d/);
    expect(url).not.toMatch(/[?&]phone=/);
  });

  it("um dia comprido demais é cortado, e a mensagem diz que foi", () => {
    /* Uma parede de texto de três páginas não se lê, rola-se. Entregar meia
       folha sem avisar era pior do que dizer que o dia inteiro vai no PDF. */
    const comprido = Array.from({ length: 200 }, (_, i) =>
      m({ time: `${String(6 + (i % 17)).padStart(2, "0")}:00`, title: `Momento número ${i}` }),
    );
    const url = linkDoWhatsApp(timelineParaWhatsApp({ titulo: "Dia longo", momentos: comprido }));
    expect(decodeURIComponent(url)).toContain("A timeline completa vai no PDF");
  });
});

/**
 * O NÚMERO QUE O `wa.me` ENTENDE (30/10). Os links da gaveta, dos Clientes e
 * do dossier eram feitos com o telefone cru: um pedido antigo com «912 345
 * 678», sem o +351, dava um link que o WhatsApp diz não existir.
 */
describe("numeroParaWhatsApp / linkDaConversa", () => {
  it.each([
    ["+351912345678", "351912345678"],
    ["+351 912 345 678", "351912345678"],
    ["912 345 678", "351912345678"],
    ["266123456", "351266123456"],
    ["00447911123456", "447911123456"],
    ["+44 7911 123456", "447911123456"],
    ["(+351) 912-345-678", "351912345678"],
  ])("%s → %s", (telefone, numero) => {
    expect(numeroParaWhatsApp(telefone)).toBe(numero);
  });

  it("sem telefone, não há link", () => {
    expect(linkDaConversa("")).toBe("");
    expect(linkDaConversa(undefined)).toBe("");
    expect(linkDaConversa("+5511912345678")).toBe("https://wa.me/5511912345678");
  });
});
