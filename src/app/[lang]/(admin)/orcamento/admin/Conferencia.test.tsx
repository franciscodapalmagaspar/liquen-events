// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { Quote } from "@/lib/orcamento/types";
import Conferencia from "./Conferencia";

/**
 * O envio é irreversível — o email sai uma vez. Estes testes prendem o que
 * torna a lista útil: apanhar a divergência entre a proposta e o pedido, mostrar
 * também o que passou, e não travar nada.
 */

/**
 * Uma proposta COMPLETA — a que se pode mesmo enviar.
 *
 * Era um esqueleto, e passava por «está tudo bem» porque esta lista não olhava
 * para o título interno, os grupos, as capas nem os mood boards: quem olhava
 * era a coluna lateral do outro passo, com outras palavras. Agora é uma lista
 * só, e um documento certo é um documento que segue.
 */
const doc = (over: Partial<ProposalDoc> = {}): ProposalDoc =>
  ({
    ref: "Ana e Rui · Decoração",
    clientNames: "Ana e Rui",
    eventDate: "18 de Setembro de 2027",
    location: "Évora",
    guests: "120 pax",
    totalText: "12.000,00 € + IVA",
    // Cada serviço com valor e artigo do Moloni (5/11): é o que deixa uma
    // proposta seguir. 12.000 € é o total que os casos «certos» escrevem.
    budgetItems: ["Decoração Floral"],
    budgetAmounts: [12000],
    budgetArtigos: ["flores"],
    serviceGroups: [{ letter: "a)", title: "Decoração Floral", items: [] }],
    // Com título e nota: um tema mudo é um aviso (B1).
    moodBoards: [{ title: "Cerimónia", annotation: "Arco de flores.", images: ["board/1.jpg"] }],
    coverImages: ["capa/1.jpg", "capa/2.jpg"],
    // As duas folhas do fecho, PREENCHIDAS. Sem elas este documento sai com
    // duas folhas em branco no meio — e desde o achado F-13 a conferência
    // di-lo, com razão. Um fixture chamado «documento certo» tem de o ser:
    // ficar sem isto era manter o teste verde à custa de o tornar falso.
    condicoesGerais: ["O orçamento é válido por 30 dias."],
    observacoesGerais: ["Montagem na véspera, a combinar com a quinta."],
    ...over,
  }) as ProposalDoc;

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "LQ-1",
    name: "Ana e Rui",
    date: "2027-09-18",
    location: "Évora",
    guests: 120,
    ...over,
  }) as Quote;

afterEach(cleanup);

describe("quando está tudo bem", () => {
  it("di-lo, e mostra os vistos", () => {
    render(<Conferencia doc={doc()} quote={pedido()} totalBruto={12_000} />);
    expect(screen.getByText(/Está tudo de acordo com o pedido original/)).toBeTruthy();
    // Os vistos verdes são metade da utilidade: uma lista só com problemas não
    // diz se as outras verificações foram sequer feitas.
    expect(screen.getByText("Nome dos clientes")).toBeTruthy();
    expect(screen.getByText("Data do evento")).toBeTruthy();
    expect(screen.getByText("Local")).toBeTruthy();
  });
});

describe("quando algo não bate certo", () => {
  it("mostra o nome da proposta e o do pedido, lado a lado", () => {
    render(
      <Conferencia
        doc={doc({ clientNames: "Ana e Rui" })}
        quote={pedido({ name: "Maria Silva" })}
        totalBruto={12_000}
      />,
    );
    expect(screen.getByText(/Ana e Rui.*Maria Silva|Maria Silva/)).toBeTruthy();
    expect(screen.getByText(/Há coisas a que vale a pena olhar/)).toBeTruthy();
  });

  it("apanha o texto de exemplo que ficou por substituir", () => {
    render(
      <Conferencia
        doc={doc({ totalText: "[Valor Total]" })}
        quote={pedido()}
        totalBruto={12_000}
      />,
    );
    expect(screen.getByText(/Ficou por substituir/)).toBeTruthy();
  });

  it("diz sempre que nada disto impede o envio", () => {
    render(
      <Conferencia
        doc={doc({ location: "Outro sítio qualquer" })}
        quote={pedido()}
        totalBruto={12_000}
      />,
    );
    expect(screen.getByText(/Nenhuma te impede de enviar/)).toBeTruthy();
  });
});

describe("acessibilidade", () => {
  it("a gravidade também se ouve, não só se vê pela cor", () => {
    // O símbolo e a cor não chegam a quem usa leitor de ecrã, e a diferença
    // entre "conferido" e "a confirmar" é a razão de a lista existir.
    render(<Conferencia doc={doc()} quote={pedido()} totalBruto={12_000} />);
    expect(screen.getAllByText(/\(conferido\)/).length).toBeGreaterThan(0);
  });
});

/**
 * O QUE FALTA PARA ENVIAR, AQUI E COM LINK.
 *
 * Antes vivia numa coluna lateral que só existe acima de 1280 px — no
 * telemóvel, no tablet e num portátil pequeno ela nunca a via — e numa frase
 * estática por baixo do botão, sempre com as mesmas palavras e sem link
 * nenhum. Passa a viver na lista que já se lê antes de carregar em enviar.
 */
describe("o que impede o envio", () => {
  it("aparece em primeiro, e a lista di-lo no cabeçalho", () => {
    render(<Conferencia doc={doc({ ref: "" })} quote={pedido()} totalBruto={12_000} />);
    expect(screen.getByText(/Uma coisa impede o envio/)).toBeTruthy();
    expect(screen.getByText("Falta o título interno")).toBeTruthy();
  });

  it("cada linha leva ao sítio onde se resolve", async () => {
    const idas: { seccao?: string; campo?: string }[] = [];
    render(
      <Conferencia
        doc={doc({ ref: "" })}
        quote={pedido()}
        totalBruto={12_000}
        onIr={(v) => idas.push({ seccao: v.seccao, campo: v.campo })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Falta o título interno/ }));
    expect(idas).toEqual([{ seccao: "evento", campo: "ref" }]);
  });

  it("o que está conferido NÃO é um link", () => {
    // Um visto verde clicável convida a um salto que não resolve nada.
    render(<Conferencia doc={doc()} quote={pedido()} totalBruto={12_000} onIr={() => {}} />);
    expect(screen.queryByRole("button", { name: /Nome dos clientes/ })).toBeNull();
    // CONTROLO POSITIVO: com o mesmo `onIr`, o que NÃO está conferido é.
    cleanup();
    render(
      <Conferencia
        doc={doc({ location: "" })}
        quote={pedido()}
        totalBruto={12_000}
        onIr={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /Local/ })).toBeTruthy();
  });

  it("sem impedimentos, o cabeçalho volta a ser o de sempre", () => {
    render(<Conferencia doc={doc()} quote={pedido()} totalBruto={12_000} />);
    expect(screen.getByText(/Está tudo de acordo com o pedido original/)).toBeTruthy();
  });
});
