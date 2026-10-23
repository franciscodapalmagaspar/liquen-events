// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import VistaDeConjunto from "./VistaDeConjunto";
import EscolherFotoDaPagina from "./EscolherFotoDaPagina";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { chavesDasPaginas, planoDaProposta } from "@/lib/pdf-editorial/plano";
import type { FotosDoPdf } from "@/lib/pdf-editorial/fotos-do-pdf";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS MINIATURAS MOSTRAM AS FOTOGRAFIAS DO PDF — E DEIXAM ESCOLHER OUTRAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A colaboradora dela (15/10): as fotografias das miniaturas «não têm nada a
 * ver» com as do PDF. Até aqui o separador mostrava as duas primeiras fotos do
 * capítulo — precisamente as que o PDF evita. Agora mostra as que o PDF diz
 * (`fotosDoPdf`, a resposta da rota `fotos-do-pdf`), e cada página com
 * fotografia tem «Mudar fotografia» — onde ela escolheu fazê-lo.
 */

afterEach(cleanup);

const URLS: Record<string, string> = Object.fromEntries(
  ["a", "b", "c", "d", "e", "x", "y"].map((k) => [`TESTE/${k}.jpg`, `/mini/${k}.jpg`]),
);

const doc = {
  template: "decoracao",
  ref: "PO",
  clientNames: "TESTE Maria & TESTE Zé",
  eventType: "Casamento",
  serviceGroups: [{ title: "Decoração", items: [{ label: "Cerimónia" }] }],
  moodBoards: [
    { title: "Cerimónia", images: ["TESTE/a.jpg", "TESTE/b.jpg"] },
    { title: "Altar", images: ["TESTE/c.jpg", "TESTE/d.jpg", "TESTE/e.jpg"] },
  ],
  budgetItems: ["Decor Cerimónia"],
  totalText: "3.000,00 € + IVA",
  coverImages: ["TESTE/a.jpg"],
  notasImportantes: [],
  incluido: [],
  naoIncluido: [],
  condicoesGerais: ["O valor não inclui IVA."],
  observacoesGerais: ["A montagem é na véspera."],
  faseamento: [],
  cancelamento: [],
  cronograma: [],
} as unknown as ProposalDoc;

const plano = planoDaProposta(doc);
const chaves = chavesDasPaginas(plano);
const iSep = plano.findIndex((p) => p.tipo === "separador" && p.grupo);
const chaveSep = chaves[iSep];

function desenhar(fotosDoPdf: FotosDoPdf | null, onMudarFoto = vi.fn()) {
  render(
    <VistaDeConjunto
      doc={doc}
      fotosDoPdf={fotosDoPdf}
      onMudarFoto={onMudarFoto}
      ordem={[0, 1]}
      urls={URLS}
      aspetos={{}}
      onMover={vi.fn()}
      onSaltar={vi.fn()}
      onIrParaSeccao={vi.fn()}
    />,
  );
  return onMudarFoto;
}

const imagensDa = (n: number) =>
  [...screen.getAllByRole("img", { name: /como vai sair no PDF/ })[n].querySelectorAll("img")].map(
    (i) => i.getAttribute("src"),
  );

describe("a miniatura mostra as fotografias que o PDF lá põe", () => {
  it("o separador mostra as do PDF, e não as duas primeiras do capítulo", () => {
    desenhar({ [chaveSep]: [{ ref: "TESTE/e.jpg" }, { ref: "TESTE/c.jpg" }] });
    // Como no PDF de 23/10: a segunda é o fundo arrastado (desenhado
    // primeiro), a primeira é a nítida, emoldurada por cima.
    expect(imagensDa(iSep)).toEqual(["/mini/c.jpg", "/mini/e.jpg"]);
  });

  it("com UMA fotografia, o separador usa-a no fundo e emoldurada (como no PDF)", () => {
    desenhar({ [chaveSep]: [{ ref: "TESTE/x.jpg" }] });
    expect(imagensDa(iSep)).toEqual(["/mini/x.jpg", "/mini/x.jpg"]);
  });

  it("enquanto o PDF não respondeu, nenhuma fotografia adivinhada nos painéis", () => {
    desenhar(null);
    expect(imagensDa(iSep)).toEqual([]);
    const iIndice = plano.findIndex((p) => p.tipo === "indice");
    expect(imagensDa(iIndice)).toEqual([]);
  });
});

describe("«Mudar fotografia» nas miniaturas", () => {
  it("o separador abre com duas no máximo; uma página de tema com fotos não tem botão", () => {
    const onMudarFoto = desenhar(null);
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`Mudar a fotografia da página ${iSep + 1},`) }),
    );
    expect(onMudarFoto).toHaveBeenCalledWith(chaveSep, plano[iSep].nome, 2);
    const iTema = plano.findIndex((p) => p.tipo === "tema");
    expect(
      screen.queryByRole("button", {
        name: new RegExp(`Mudar a fotografia da página ${iTema + 1},`),
      }),
    ).toBeNull();
  });
});

describe("a folha de escolher a fotografia", () => {
  const base = {
    aberto: true,
    nome: "Inspiração · Cerimónia",
    max: 2,
    lugares: [
      { ref: "TESTE/e.jpg", url: "/mini/e.jpg" },
      { ref: "TESTE/c.jpg", url: "/mini/c.jpg" },
    ],
    escolhida: false,
    lugar: 0,
    fotosDaProposta: ["a", "b", "x"].map((k) => ({ ref: `TESTE/${k}.jpg`, url: `/mini/${k}.jpg` })),
    carregar: null,
    onLugar: vi.fn(),
    onEscolher: vi.fn(),
    onQuantas: vi.fn(),
    onAutomatico: vi.fn(),
    onBiblioteca: vi.fn(),
    onFechar: vi.fn(),
  };

  it("um toque numa fotografia desta proposta põe-na no lugar escolhido", () => {
    const onEscolher = vi.fn();
    render(<EscolherFotoDaPagina {...base} onEscolher={onEscolher} />);
    const grelha = screen.getByText("Desta proposta").parentElement!;
    fireEvent.click(within(grelha).getAllByRole("button", { name: "Pôr esta fotografia" })[2]);
    expect(onEscolher).toHaveBeenCalledWith("TESTE/x.jpg");
  });

  it("no separador escolhe-se uma ou duas", () => {
    const onQuantas = vi.fn();
    render(<EscolherFotoDaPagina {...base} onQuantas={onQuantas} />);
    fireEvent.click(screen.getByRole("radio", { name: "Uma (página inteira)" }));
    expect(onQuantas).toHaveBeenCalledWith(1);
  });

  it("«Voltar ao automático» só aparece quando a página tem a escolha delas", () => {
    const { rerender } = render(<EscolherFotoDaPagina {...base} />);
    expect(screen.queryByRole("button", { name: "Voltar ao automático" })).toBeNull();
    const onAutomatico = vi.fn();
    rerender(<EscolherFotoDaPagina {...base} escolhida onAutomatico={onAutomatico} />);
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao automático" }));
    expect(onAutomatico).toHaveBeenCalled();
  });
});
