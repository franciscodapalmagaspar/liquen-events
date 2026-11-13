// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EditorDeEscolhas, { type FotoDisponivel } from "./EditorDeEscolhas";
import { escolhaPronta, type Escolha } from "@/lib/proposta-escolhas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ESCREVER AS ALTERNATIVAS — O LADO DELA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que aqui se prende é sobretudo uma coisa: que ela nunca fique convencida
 * de ter dado uma alternativa que o casal não vê. Uma escolha com uma opção
 * só não sai — e se o ecrã não o disser, a conversa que se segue é ela a jurar
 * que escreveu e eles a jurar que não viram.
 */

const FOTOS: FotoDisponivel[] = [
  { caminho: "ped/uma.jpg", url: "u1", onde: "Cerimónia" },
  { caminho: "ped/duas.jpg", url: "u2", onde: "Cerimónia" },
];

const UMA: Escolha[] = [
  {
    id: "e1",
    titulo: "Paleta da cerimónia",
    opcoes: [
      { id: "o1", rotulo: "Verde-oliva e branco" },
      { id: "o2", rotulo: "Terracota e creme" },
    ],
  },
];

function desenhar(escolhas: Escolha[] | undefined = undefined, bilingue = false) {
  const onChange = vi.fn();
  render(
    <EditorDeEscolhas escolhas={escolhas} fotos={FOTOS} bilingue={bilingue} onChange={onChange} />,
  );
  return onChange;
}

afterEach(cleanup);

describe("a secção só se acende quando ela quer", () => {
  it("sem alternativas, é só o convite — nada de «por preencher»", () => {
    // A maior parte das propostas não leva alternativas nenhumas, e um alarme
    // aceso em todas para servir algumas é um alarme que se aprende a ignorar.
    desenhar();
    expect(screen.getByRole("button", { name: /\+ Alternativa/ })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("a primeira alternativa nasce com DUAS opções", async () => {
    // Uma só não é uma escolha. Nascer com uma poupava um clique e punha-a a
    // descobrir a regra a meio.
    const user = userEvent.setup();
    const onChange = desenhar();
    await user.click(screen.getByRole("button", { name: /\+ Alternativa/ }));
    const nova: Escolha[] = onChange.mock.calls[0][0];
    expect(nova).toHaveLength(1);
    expect(nova[0].opcoes).toHaveLength(2);
    // E com identificadores distintos, senão a resposta do casal era ambígua.
    expect(nova[0].opcoes[0].id).not.toBe(nova[0].opcoes[1].id);
    expect(nova[0].id).not.toBe(nova[0].opcoes[0].id);
  });
});

describe("o aviso de que ainda não se vê", () => {
  it("com uma opção por escrever, di-lo", () => {
    desenhar([
      {
        id: "e1",
        titulo: "Paleta",
        opcoes: [
          { id: "o1", rotulo: "Verde-oliva" },
          { id: "o2", rotulo: "" },
        ],
      },
    ]);
    expect(screen.getByText(/Ainda não aparece ao casal/)).toBeTruthy();
  });

  it("sem título, di-lo também", () => {
    desenhar([{ ...UMA[0], titulo: "" }]);
    expect(screen.getByText(/Ainda não aparece ao casal/)).toBeTruthy();
  });

  it("completa, cala-se — e concorda com a regra que o casal vê", () => {
    desenhar(UMA);
    expect(screen.queryByText(/Ainda não aparece ao casal/)).toBeNull();
    // O aviso e a página do casal lêem a MESMA função: se um dia divergirem,
    // este teste não muda mas a promessa parte-se, por isso afirma-se aqui.
    expect(escolhaPronta(UMA[0])).toBe(true);
  });
});

describe("escrever", () => {
  it("o título vai para a escolha certa", async () => {
    const user = userEvent.setup();
    const onChange = desenhar(UMA);
    await user.type(screen.getByLabelText("Título da alternativa 1"), "!");
    expect(onChange).toHaveBeenCalledWith([{ ...UMA[0], titulo: "Paleta da cerimónia!" }]);
  });

  it("acrescentar uma opção não mexe nas que lá estão", async () => {
    const user = userEvent.setup();
    const onChange = desenhar(UMA);
    await user.click(screen.getByRole("button", { name: /\+ Opção/ }));
    const nova: Escolha[] = onChange.mock.calls[0][0];
    expect(nova[0].opcoes.map((o) => o.id).slice(0, 2)).toEqual(["o1", "o2"]);
    expect(nova[0].opcoes).toHaveLength(3);
  });

  it("não deixa apagar abaixo do mínimo — com duas, não há botão de apagar opção", () => {
    desenhar(UMA);
    expect(screen.queryByRole("button", { name: /Apagar a opção/ })).toBeNull();
  });

  it("com três, já deixa", () => {
    desenhar([{ ...UMA[0], opcoes: [...UMA[0].opcoes, { id: "o3", rotulo: "Azul" }] }]);
    expect(screen.getAllByRole("button", { name: /Apagar a opção/ })).toHaveLength(3);
  });

  it("apagar a alternativa apaga a certa", async () => {
    const user = userEvent.setup();
    const duas = [UMA[0], { ...UMA[0], id: "e2", titulo: "Corredor" }];
    const onChange = desenhar(duas);
    await user.click(screen.getByRole("button", { name: /Apagar a alternativa 1/ }));
    // Passou a haver uma pergunta pelo meio — ver a suite «o que apaga e não
    // volta», mais abaixo. O que este teste prende continua a ser o mesmo: sai
    // a que se escolheu, e não a outra.
    await user.click(screen.getByRole("button", { name: /^Apagar a alternativa$/ }));
    expect(onChange).toHaveBeenCalledWith([duas[1]]);
  });
});

describe("a fotografia", () => {
  it("escolhe-se entre as que já estão nos mood boards", async () => {
    const user = userEvent.setup();
    const onChange = desenhar(UMA);
    await user.click(screen.getAllByRole("button", { name: /Pôr uma fotografia/ })[0]);
    await user.click(screen.getByRole("button", { name: /Usar a fotografia 1 de Cerimónia/ }));
    const nova: Escolha[] = onChange.mock.calls[0][0];
    expect(nova[0].opcoes[0].imagem).toBe("ped/uma.jpg");
  });

  it("sem fotografias na proposta, diz porquê em vez de mostrar uma caixa vazia", async () => {
    const user = userEvent.setup();
    render(<EditorDeEscolhas escolhas={UMA} fotos={[]} bilingue={false} onChange={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: /Pôr uma fotografia/ })[0]);
    expect(screen.getByText(/Ainda não há fotografias nos mood boards/)).toBeTruthy();
  });

  it("tira-se sem apagar a opção", async () => {
    const user = userEvent.setup();
    const comFoto = [
      { ...UMA[0], opcoes: [{ ...UMA[0].opcoes[0], imagem: "ped/uma.jpg" }, UMA[0].opcoes[1]] },
    ];
    const onChange = desenhar(comFoto);
    await user.click(screen.getByRole("button", { name: /^Tirar$/ }));
    const nova: Escolha[] = onChange.mock.calls[0][0];
    expect(nova[0].opcoes[0].imagem).toBeUndefined();
    expect(nova[0].opcoes[0].rotulo).toBe("Verde-oliva e branco");
  });
});

describe("as caixas inglesas", () => {
  it("com o interruptor desligado, não existem no DOM", () => {
    desenhar(UMA, false);
    expect(screen.queryByLabelText(/\(inglês\)/)).toBeNull();
  });

  it("ligado, aparecem ao lado de cada campo de prosa", () => {
    desenhar(UMA, true);
    expect(screen.getByLabelText("Título da alternativa 1 (inglês)")).toBeTruthy();
    expect(screen.getByLabelText("Opção 1 (inglês)")).toBeTruthy();
  });

  it("e escrevem no campo irmão, não por cima do português", async () => {
    const user = userEvent.setup();
    const onChange = desenhar(UMA, true);
    await user.type(screen.getByLabelText("Título da alternativa 1 (inglês)"), "C");
    expect(onChange).toHaveBeenCalledWith([{ ...UMA[0], tituloEn: "C" }]);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ISTO NÃO É UM RODAPÉ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «"À escolha do casal" é a funcionalidade mais interessante do
 * ecrã e está no fim, em cinzento, quase invisível».
 *
 * Estava desenhado como uma nota de pé de secção — um título do tamanho e da
 * cor de um rótulo de campo. O que se prende aqui é que deixou de o ser, e que
 * a frase que o acompanha diz para que SERVE, e não só o que é.
 */
describe("o destaque do «À escolha do casal»", () => {
  it("o nome é um título, e não um rótulo de campo", () => {
    render(<EditorDeEscolhas escolhas={[]} fotos={[]} bilingue={false} onChange={() => {}} />);
    const titulo = screen.getByRole("heading", { name: /À escolha do casal/i });
    // Na letra de título do back office. Pede o TOKEN e não uma família: o
    // back office passou a ter uma letra só, e quem escrevesse a família à mão
    // ficava de fora dessa decisão (ver `letra-da-casa.test.ts`).
    expect(titulo.getAttribute("style")).toContain("--font-display");
    expect(titulo.className).not.toContain("uppercase");
  });

  it("continua a dizer que é opcional", () => {
    // É opcional, e a maior parte das propostas não leva alternativas nenhumas.
    // Dar-lhe destaque não é transformá-lo num campo obrigatório.
    render(<EditorDeEscolhas escolhas={[]} fotos={[]} bilingue={false} onChange={() => {}} />);
    expect(screen.getByText(/\(opcional\)/i)).toBeTruthy();
  });

  /**
   * ── A AFIRMAÇÃO QUE VALE POR TODAS ────────────────────────────────────
   */
  it("a explicação diz para que serve, e não só o que é", () => {
    // «Duas paletas para a cerimónia» descreve. O que faz alguém usar isto é
    // saber o que ganha: uma reunião a menos.
    render(<EditorDeEscolhas escolhas={[]} fotos={[]} bilingue={false} onChange={() => {}} />);
    expect(screen.getByText(/sem ser preciso outra reunião/i)).toBeTruthy();
    // E continua a dizer as duas coisas que evitam uma surpresa: onde aparece,
    // e para onde volta a resposta.
    expect(screen.getByText(/não\s*no PDF/i)).toBeTruthy();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE APAGA E NÃO VOLTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As duas acções irreversíveis deste ecrã, e a razão de levarem tratamento
 * diferente — pergunta-se o que é raro e caro, oferece-se anular o que é
 * frequente e barato de refazer (está escrita por extenso no cabeçalho do
 * `EditorDeEscolhas.tsx`).
 *
 * O que aqui se prende é o que faz a diferença entre uma pergunta útil e um
 * «Tens a certeza?»: que a frase NOMEIA a coisa, que DIZ O NÚMERO do que vai
 * com ela, e que responder «não» não perde nada nem escreve nada.
 */
describe("apagar a alternativa — pergunta que conta o que se perde", () => {
  const COM_FOTOS: Escolha[] = [
    {
      id: "e1",
      titulo: "Paleta da cerimónia",
      opcoes: [
        { id: "o1", rotulo: "Verde-oliva e branco", imagem: "ped/uma.jpg" },
        { id: "o2", rotulo: "Terracota e creme", imagem: "ped/duas.jpg" },
        { id: "o3", rotulo: "Azul-pó" },
      ],
    },
  ];

  it("a pergunta nomeia a alternativa, conta as opções e as fotografias", async () => {
    const user = userEvent.setup();
    desenhar(COM_FOTOS);
    await user.click(screen.getByRole("button", { name: /Apagar a alternativa 1/ }));
    const pergunta = screen.getByRole("alertdialog").textContent ?? "";
    // O NOME que ela lhe deu, e não «esta alternativa».
    expect(pergunta).toMatch(/Paleta da cerimónia/);
    // OS NÚMEROS: três opções, duas já com fotografia escolhida à mão.
    expect(pergunta).toMatch(/3 opções/);
    expect(pergunta).toMatch(/2 com fotografia/);
    // E A CONSEQUÊNCIA — o que o casal deixa de ter.
    expect(pergunta).toMatch(/casal fica sem esta escolha/i);
    // Nunca a frase que não acrescenta nada.
    expect(pergunta).not.toMatch(/certeza/i);
  });

  it("cancelar não perde nada nem escreve nada", async () => {
    const user = userEvent.setup();
    const onChange = desenhar(COM_FOTOS);
    await user.click(screen.getByRole("button", { name: /Apagar a alternativa 1/ }));
    await user.click(screen.getByRole("button", { name: /^Cancelar$/ }));
    // Nem uma escrita no documento: cancelar fecha a pergunta e mais nada.
    expect(onChange).not.toHaveBeenCalled();
    // A pergunta sai do ecrã e a alternativa continua inteira.
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByDisplayValue("Paleta da cerimónia")).toBeTruthy();
    expect(screen.getByDisplayValue("Azul-pó")).toBeTruthy();
  });

  it("uma alternativa ainda em branco sai sem pergunta nenhuma", async () => {
    // Regra da casa: nada que não seja destrutivo pode ser atrasado por uma
    // caixa. Uma alternativa acabada de acrescentar por engano não tem nada
    // dentro — perguntar aí é ensinar a responder que sim sem ler.
    const user = userEvent.setup();
    const vazia: Escolha[] = [
      {
        id: "e1",
        titulo: "",
        opcoes: [
          { id: "o1", rotulo: "" },
          { id: "o2", rotulo: "" },
        ],
      },
    ];
    const onChange = desenhar(vazia);
    await user.click(screen.getByRole("button", { name: /Apagar a alternativa 1/ }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

// ── Auditoria 6, n.º 22 — o foco do teclado não pode cair no <body> ────────
describe("apagar a alternativa — o foco do teclado", () => {
  /** Como o estúdio o usa: o pai guarda a lista e devolve-a a cada mudança. */
  function Controlado({ inicial }: { inicial: Escolha[] }) {
    const [escolhas, setEscolhas] = useState(inicial);
    return (
      <EditorDeEscolhas escolhas={escolhas} fotos={FOTOS} bilingue={false} onChange={setEscolhas} />
    );
  }
  const DUAS: Escolha[] = [
    UMA[0],
    { id: "e2", titulo: "Corredor", opcoes: [{ id: "o9", rotulo: "Velas" }] },
  ];

  it("a pergunta recebe o foco no «Cancelar»", async () => {
    const user = userEvent.setup();
    render(<Controlado inicial={DUAS} />);
    await user.click(screen.getByRole("button", { name: /Apagar a alternativa 1/ }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Cancelar$/ }));
  });

  it("depois de apagar, vai para a alternativa seguinte", async () => {
    const user = userEvent.setup();
    render(<Controlado inicial={DUAS} />);
    await user.click(screen.getByRole("button", { name: /Apagar a alternativa 1/ }));
    await user.click(screen.getByRole("button", { name: /^Apagar a alternativa$/ }));
    expect(document.activeElement).toBe(screen.getByDisplayValue("Corredor"));
  });

  it("sem nenhuma a seguir, vai para o «+ Alternativa»", async () => {
    const user = userEvent.setup();
    render(<Controlado inicial={UMA} />);
    await user.click(screen.getByRole("button", { name: /Apagar a alternativa 1/ }));
    await user.click(screen.getByRole("button", { name: /^Apagar a alternativa$/ }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /\+ Alternativa/ }));
  });

  it("cancelar devolve-o ao «×» de onde veio", async () => {
    const user = userEvent.setup();
    render(<Controlado inicial={UMA} />);
    await user.click(screen.getByRole("button", { name: /Apagar a alternativa 1/ }));
    await user.click(screen.getByRole("button", { name: /^Cancelar$/ }));
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /Apagar a alternativa 1/ }),
    );
  });
});

describe("apagar a opção — anular, e não pergunta", () => {
  const TRES: Escolha[] = [
    {
      id: "e1",
      titulo: "Paleta da cerimónia",
      opcoes: [
        { id: "o1", rotulo: "Verde-oliva e branco" },
        { id: "o2", rotulo: "Terracota e creme" },
        { id: "o3", rotulo: "Azul-pó" },
      ],
    },
  ];

  it("apaga já — e o «Anular» diz qual saiu e com quantas fica", async () => {
    const user = userEvent.setup();
    const onChange = desenhar(TRES);
    await user.click(screen.getAllByRole("button", { name: /Apagar a opção/ })[1]);
    // Sem pergunta pelo meio: é o gesto de escrever, e uma caixa a cada um
    // seria uma caixa que se despacha sem ler.
    expect(screen.queryByRole("alertdialog")).toBeNull();
    const nova: Escolha[] = onChange.mock.calls[0][0];
    expect(nova[0].opcoes.map((o) => o.id)).toEqual(["o1", "o3"]);
    // A barra NOMEIA a opção e a alternativa, e dá o NÚMERO do que ficou.
    const barra = screen.getByText(/Pode anular durante/).textContent ?? "";
    expect(barra).toMatch(/Terracota e creme/);
    expect(barra).toMatch(/Paleta da cerimónia/);
    expect(barra).toMatch(/ficam 2/);
  });

  it("anular devolve a opção exactamente onde estava", async () => {
    const user = userEvent.setup();
    const onChange = desenhar(TRES);
    await user.click(screen.getAllByRole("button", { name: /Apagar a opção/ })[1]);
    onChange.mockClear();
    await user.click(screen.getByRole("button", { name: /^Anular$/ }));
    // A lista INTEIRA como estava — a opção volta ao meio, e não ao fim.
    expect(onChange).toHaveBeenCalledWith(TRES);
    // E a oferta desaparece: anulada uma vez, não fica a pedir de novo.
    expect(screen.queryByText(/Pode anular durante/)).toBeNull();
  });
});
