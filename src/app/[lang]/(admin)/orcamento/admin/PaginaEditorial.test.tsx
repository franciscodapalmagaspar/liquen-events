// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { HEX } from "@/lib/pdf-editorial/paleta";
import { composicao } from "@/lib/pdf-editorial/mosaico";
import { planoDaProposta } from "@/lib/pdf-editorial/plano";
import PaginaEditorial, { fontesDasFolhas } from "./PaginaEditorial";

/**
 * A miniatura do PDF novo no estúdio. Duas coisas se prendem aqui: que a folha
 * tem as cores do PDF (os tokens `--bo-papel-pdf*` são os `HEX` do gerador, não
 * uma segunda cópia que diverge), e que as páginas dos temas têm as MESMAS
 * caixas que o servidor desenha.
 */

afterEach(cleanup);

describe("o papel do PDF no estúdio", () => {
  it("os tokens são as cores do PDF", () => {
    // O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
    // todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
    // o browser os aplica no back office.
    const css =
      readFileSync("src/app/globals.css", "utf8") + readFileSync("src/app/admin.css", "utf8");
    const token = (nome: string) =>
      new RegExp(`--${nome}:\\s*(#[0-9a-f]{6})`, "i").exec(css)?.[1]?.toLowerCase();
    // A Tinta, a Cal, o Linho e a Pedra do documento de 23/10.
    expect(token("bo-papel-pdf")).toBe(HEX.tinta.toLowerCase());
    expect(token("bo-papel-pdf-texto")).toBe(HEX.cal.toLowerCase());
    expect(token("bo-papel-pdf-baixo")).toBe(HEX.linho.toLowerCase());
    expect(token("bo-papel-pdf-fio")).toBe(HEX.pedra.toLowerCase());
  });
});

describe("as páginas dos temas", () => {
  const doc = {
    template: "decoracao",
    clientNames: "TESTE A & TESTE B",
    serviceGroups: [],
    budgetItems: [],
    coverImages: [],
    moodBoards: [
      { title: "Mesas de jantar", images: ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg", "f.jpg"] },
    ],
  } as unknown as ProposalDoc;
  const urls = Object.fromEntries(["a", "b", "c", "d", "e", "f"].map((k) => [`${k}.jpg`, `/${k}`]));

  it("têm uma fotografia por caixa do mosaico, e pela ordem de desenho", () => {
    const plano = planoDaProposta(doc);
    const i = plano.findIndex((p) => p.tipo === "tema");
    const p = plano[i];
    if (p.tipo !== "tema") throw new Error("sem página de tema");
    const fontes = fontesDasFolhas(doc, plano, urls);
    const { container } = render(
      <PaginaEditorial
        pagina={p}
        doc={doc}
        fotosDoTema={fontes.fotosDoTema}
        outras={fontes.outrasDa(i)}
      />,
    );
    const c = composicao(
      p.fotos.map(() => 1.5),
      p.vez % 2 === 0,
    );
    if (c.tipo === "texto") throw new Error("composição inesperada");
    const imgs = [...container.querySelectorAll("img")].map((im) => im.getAttribute("src"));
    expect(imgs).toHaveLength(c.celulas.length);
    expect(imgs).toEqual(["/a", "/b", "/c", "/d", "/e", "/f"]);
  });

  it("a folha marca-se como folha do cliente, para manter a letra do documento", () => {
    const plano = planoDaProposta(doc);
    const { container } = render(<PaginaEditorial pagina={plano[0]} doc={doc} />);
    expect(container.querySelector("[data-folha-do-cliente]")).not.toBeNull();
  });
});

/**
 * Revisão de 14/11, n.º 9: a foto escolhida que já não existe vinha do plano
 * com o caminho e sem marca — a miniatura pedia-a ao armazenamento e saía
 * partida. O PDF deixa o lugar vazio; a miniatura mostra o mesmo, com aviso.
 */
describe("a foto escolhida que já não existe, na miniatura", () => {
  const doc = {
    template: "decoracao",
    clientNames: "TESTE A & TESTE B",
    serviceGroups: [],
    budgetItems: [],
    coverImages: [],
    moodBoards: [],
  } as unknown as ProposalDoc;

  it("é um lugar vazio com aviso, e nunca uma imagem do caminho que falta", () => {
    const plano = planoDaProposta(doc);
    const i = plano.findIndex((p) => p.tipo === "indice");
    const urls = { "TESTE/apagada.jpg": "/assinada-mas-nao-existe" };
    const fontes = fontesDasFolhas(
      doc,
      plano,
      urls,
      {},
      {
        indice: [{ ref: "TESTE/apagada.jpg", emFalta: true }],
      },
    );
    expect(fontes.outrasDa(i)(0)).toEqual({ emFalta: true });
    const { container, getAllByText } = render(
      <PaginaEditorial pagina={plano[i]} doc={doc} outras={fontes.outrasDa(i)} />,
    );
    expect(container.querySelector("img")).toBeNull();
    // Uma vez, na moldura (o fundo arrastado fica liso).
    expect(getAllByText("Foto em falta")).toHaveLength(1);
  });
});
