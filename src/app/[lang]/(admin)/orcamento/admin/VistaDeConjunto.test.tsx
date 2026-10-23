// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import VistaDeConjunto from "./VistaDeConjunto";
import type { MoodBoard, ProposalDoc } from "@/lib/proposal-doc";
import { planoDaProposta } from "@/lib/pdf-editorial/plano";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A VISTA MOSTRA O DOCUMENTO, E NÃO UM PEDAÇO DELE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «"Todas" mostra 7 páginas quando o PDF tem cerca de 14 — uma
 * pré-visualização parcial dá falsa confiança», e «hoje vê-se um problema na
 * página 5 e tem de se procurar onde ele nasce».
 *
 * Duas coisas se prendem aqui. A primeira é a contagem: o que esta vista desenha
 * é a lista de `planoDaProposta`, a do PDF novo, e não os mood boards.
 * A segunda é o salto: cada miniatura leva ao sítio do formulário onde aquela
 * folha se escreve — sem isso a vista mostra o problema e esconde a solução.
 *
 * E o que já cá estava continua: as setas movem contra o tema VIZINHO (do mesmo
 * capítulo), e não contra a posição ao lado. Com um tema vazio pelo meio a seta
 * trocava a página com ESSE, o ecrã ficava igual, e lia-se como avariada.
 */

afterEach(cleanup);

const board = (over: Partial<MoodBoard> = {}): MoodBoard => ({
  title: "Cerimónia",
  images: ["a.jpg"],
  ...over,
});

const docCom = (boards: MoodBoard[]): ProposalDoc =>
  ({
    template: "decoracao",
    ref: "PO",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "3 de julho de 2027",
    location: "Monte da Oliveirinha",
    guests: "150 pax",
    serviceGroups: [{ title: "Decoração", items: [{ label: "Cerimónia" }] }],
    moodBoards: boards,
    budgetItems: ["Decor Cerimónia"],
    totalLabel: "Valor Total Decoração",
    totalText: "3.000,00 € + IVA",
    coverImages: [],
    notasImportantes: [],
    incluido: [],
    naoIncluido: [],
    condicoesGerais: ["O valor não inclui IVA."],
    observacoesGerais: ["A montagem é na véspera."],
    faseamento: [],
    cancelamento: [],
    cronograma: [],
  }) as unknown as ProposalDoc;

function desenhar(
  boards: MoodBoard[],
  acoes: { onMover?: () => void; onSaltar?: () => void; onIrParaSeccao?: () => void } = {},
) {
  const props = {
    onMover: vi.fn(),
    onSaltar: vi.fn(),
    onIrParaSeccao: vi.fn(),
    ...acoes,
  };
  render(
    <VistaDeConjunto
      doc={docCom(boards)}
      ordem={boards.map((_, i) => i)}
      urls={{ "a.jpg": "/a.jpg" }}
      aspetos={{ "a.jpg": 1.5 }}
      onFechar={vi.fn()}
      {...props}
    />,
  );
  return props;
}

/** As páginas que o PDF novo vai ter — a mesma lista que a vista desenha. */
const plano = (boards: MoodBoard[]) => planoDaProposta(docCom(boards));
const posicao = (boards: MoodBoard[], titulo: string) =>
  plano(boards).findIndex((p) => p.tipo === "tema" && p.titulo === titulo) + 1;

/**
 * ── A CONTAGEM ──────────────────────────────────────────────────────────────
 *
 * A vista desenha as páginas do PDF NOVO, pelo plano (`pdf-editorial/plano.ts`)
 * que um teste prende ao gerador: capa, índice, a proposta, o que propomos, a
 * paleta, os capítulos com os seus temas, a citação, o investimento, as
 * condições e a contracapa.
 */
describe("VistaDeConjunto: o documento inteiro", () => {
  it("desenha as páginas do PDF novo, e não só as de inspiração", () => {
    desenhar([board({ title: "Mesa do bolo" }), board({ title: "Mesas de jantar" })]);
    for (const titulo of [
      "Capa",
      "Índice",
      "A proposta",
      "Mesa do bolo",
      "Mesas de jantar",
      "Investimento",
      "Contracapa",
    ]) {
      expect(screen.getAllByText(titulo).length, `sem a página «${titulo}»`).toBeGreaterThan(0);
    }
  });

  it("cada miniatura diz que página é, e de quantas — as mesmas do plano do PDF", () => {
    const boards = [board({ title: "Mesa do bolo" }), board({ title: "Mesas de jantar" })];
    desenhar(boards);
    const n = plano(boards).length;
    expect(screen.getByText(`Página 1 de ${n}`)).toBeTruthy();
    expect(screen.getByText(`Página ${n} de ${n}`)).toBeTruthy();
  });

  it("um tema sem fotografias e sem texto não é desenhado; só com título, é", () => {
    desenhar([
      board({ title: "Mesas de jantar" }),
      board({ title: "", images: [] }),
      board({ title: "Luzes", images: [] }),
    ]);
    // «Luzes» tem página de texto no PDF novo, com uma fotografia ao lado.
    expect(screen.getAllByText("Luzes").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Tema 2")).toHaveLength(0);
  });

  /**
   * ── O SALTO ───────────────────────────────────────────────────────────────
   *
   * «Hoje vê-se um problema na página 5 e tem de se procurar onde ele nasce.»
   */
  it("clicar numa folha de texto abre a secção que a escreve", () => {
    const { onIrParaSeccao } = desenhar([board({ title: "Mesas de jantar" })]);
    // O «Investimento» é a página do total (o documento de 23/10 já não tem
    // separador do investimento): abre a secção do total.
    fireEvent.click(screen.getByLabelText(/, Investimento$/));
    expect(onIrParaSeccao).toHaveBeenCalledWith("total");
  });

  it("clicar numa página de tema vai ao board, e não só à secção", () => {
    const boards = [board({ title: "Mesa do bolo" }), board({ title: "Mesas de jantar" })];
    const { onSaltar, onIrParaSeccao } = desenhar(boards);
    fireEvent.click(
      screen.getByLabelText(
        new RegExp(`página ${posicao(boards, "Mesas de jantar")}, Mesas de jantar`),
      ),
    );
    expect(onSaltar).toHaveBeenCalledWith(1);
    expect(onIrParaSeccao).not.toHaveBeenCalled();
  });

  it("as setas só existem nos temas", () => {
    const boards = [board({ title: "Mesa do bolo" }), board({ title: "Mesas de jantar" })];
    desenhar(boards);
    // A capa não troca de sítio com o orçamento.
    expect(screen.queryByLabelText("Mover a página 1 para trás")).toBeNull();
    const b = posicao(boards, "Mesas de jantar");
    expect(screen.getByLabelText(`Mover a página ${b} para trás`)).toBeTruthy();
  });
});

describe("VistaDeConjunto: reordenar", () => {
  it("move para o lugar do tema vizinho do mesmo capítulo", () => {
    const boards = [board({ title: "Mesa do bolo" }), board({ title: "Mesas de jantar" })];
    const { onMover } = desenhar(boards);
    fireEvent.click(
      screen.getByLabelText(`Mover a página ${posicao(boards, "Mesas de jantar")} para trás`),
    );
    expect(onMover).toHaveBeenCalledWith(1, 0);
  });

  it("fora de um casamento (cada mood board é um capítulo), as setas continuam a mover", () => {
    const boards = [board({ title: "Bar" }), board({ title: "Arco de abóboras" })];
    const doc = { ...docCom(boards), eventType: "Halloween" } as ProposalDoc;
    const onMover = vi.fn();
    render(
      <VistaDeConjunto
        doc={doc}
        ordem={[0, 1]}
        urls={{ "a.jpg": "/a.jpg" }}
        aspetos={{ "a.jpg": 1.5 }}
        onFechar={vi.fn()}
        onMover={onMover}
        onSaltar={vi.fn()}
        onIrParaSeccao={vi.fn()}
      />,
    );
    const pos =
      planoDaProposta(doc).findIndex((p) => p.tipo === "tema" && p.titulo === "Arco de abóboras") +
      1;
    fireEvent.click(screen.getByLabelText(`Mover a página ${pos} para trás`));
    expect(onMover).toHaveBeenCalledWith(1, 0);
  });

  it("salta por cima de um tema que não sai", () => {
    const boards = [
      board({ title: "Mesa do bolo" }),
      board({ title: "", images: [] }),
      board({ title: "Mesas de jantar" }),
    ];
    const { onMover } = desenhar(boards);
    fireEvent.click(
      screen.getByLabelText(`Mover a página ${posicao(boards, "Mesas de jantar")} para trás`),
    );
    expect(onMover).toHaveBeenCalledWith(2, 0);
  });

  /**
   * O PDF arruma os capítulos pela ordem do dia. Uma seta que passasse um tema
   * do jantar para antes da cerimónia prometia uma troca que o PDF desfazia.
   */
  it("não atravessa capítulos: nas pontas do capítulo as setas ficam desligadas", () => {
    const boards = [board({ title: "Decoração Cerimónia" }), board({ title: "Mesas de jantar" })];
    desenhar(boards);
    const c = posicao(boards, "Decoração Cerimónia");
    const j = posicao(boards, "Mesas de jantar");
    expect(
      screen.getByLabelText(`Mover a página ${c} para a frente`).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByLabelText(`Mover a página ${j} para trás`).hasAttribute("disabled")).toBe(
      true,
    );
  });
});
