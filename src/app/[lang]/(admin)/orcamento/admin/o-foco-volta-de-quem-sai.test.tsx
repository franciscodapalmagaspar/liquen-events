// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CalendarEvent } from "@/lib/orcamento/types";
import Calendario from "./Calendario";
import ModelosParciais from "./ModelosParciais";
import { MenuDeAccoes } from "./ui/MenuDeAccoes";
import { MoreMenu } from "./MoreMenu";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O FOCO NÃO FICA DENTRO DO QUE SE ESTÁ A APAGAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A ronda das saídas pôs meia dúzia de superfícies a ficarem MONTADAS 200 ms
 * depois de fechadas (`ui/saida.ts`). A metade que se vê ficou boa; a que se
 * ouve e a que se percorre com o Tab não foi verificada em lado nenhum, e é
 * onde uma saída faz um estrago que não se vê.
 *
 * ── O QUE CORRE MAL, EXACTAMENTE ──────────────────────────────────────────
 *
 * O nó que fica a sair leva `inert` no fotograma do gesto — e bem. Só que
 * `inert` não move o foco de sítio: se ele estava LÁ DENTRO (o campo com
 * `autoFocus`, o item de menu que se acabou de escolher), o browser larga-o e
 * ele cai no `<body>`. O Tab seguinte recomeça no topo da página.
 *
 * Foi medido em dois sítios, e os dois falhavam:
 *
 *  · `ModelosParciais` — Escape com o «Guardar como modelo» aberto deixava o
 *    foco na caixa de escrever de um painel `inert`;
 *  · `Calendario` — Escape no «Novo no calendário» deixava-o no campo do
 *    título, pela mesma razão.
 *
 * ── PORQUE É QUE ISTO É UM TESTE E NÃO UMA NOTA ───────────────────────────
 *
 * Porque devolver o foco é uma TAREFA, e a regra da casa é que nenhuma
 * animação atrasa uma. O sítio errado para o devolver é «daqui a 200 ms», e
 * esse engano não deixa rasto nenhum no ecrã — só em quem não olha para ele.
 *
 * ── E POR ISSO SE MEDE TAMBÉM O QUE JÁ ESTAVA CERTO ───────────────────────
 *
 * O `MenuDeAccoes` e o `MoreMenu` já devolviam o foco antes desta ronda. Ficam
 * aqui: são o contrato, e um contrato sem teste é uma intenção. O terceiro
 * caso — `prefers-reduced-motion`, onde a saída é instantânea e o nó desmonta
 * no acto — é o caminho menos percorrido, portanto o menos testado, e é
 * exactamente aquele em que o foco cai no `<body>` sem que ninguém repare.
 */

/** Um `matchMedia` que responde à única pergunta que a saída faz. */
function simularMovimento({ menos = false }: { menos?: boolean } = {}) {
  vi.stubGlobal("matchMedia", (mq: string) => ({
    matches: mq.includes("reduce") ? menos : false,
    media: mq,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* ══════════════════════════════════════════════════════════════════════════
   1. O PAINEL DOS MODELOS PARCIAIS
   ══════════════════════════════════════════════════════════════════════════ */

describe("os modelos parciais devolvem o foco a quem abriu", () => {
  beforeEach(() => {
    simularMovimento();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ modelos: [] }) })),
    );
  });

  const abrirOGuardar = () => {
    render(<ModelosParciais tipo="grupo" paraGuardar={{ id: "g1" } as never} mostrar="guardar" />);
    const abridor = screen.getByRole("button", { name: /Guardar como modelo/i });
    abridor.focus();
    fireEvent.click(abridor);
    return abridor;
  };

  it("Escape: o foco sai da caixa de escrever e volta ao botão", async () => {
    const abridor = abrirOGuardar();
    // O campo tem `autoFocus`: sem devolução, é aqui que o foco fica preso.
    expect(screen.getByLabelText("Nome do modelo")).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => {});

    expect(abridor).toHaveFocus();
  });

  it("«Cancelar»: o mesmo, pelo botão", async () => {
    const abridor = abrirOGuardar();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await act(async () => {});
    expect(abridor).toHaveFocus();
  });

  it("e o painel a sair está mesmo fora do alcance — não é o foco que o segura", async () => {
    abrirOGuardar();
    const campo = screen.getByLabelText("Nome do modelo");
    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => {});

    // Ainda montado (é isso que a saída faz), e já sem nada que o alcance.
    expect(document.body.contains(campo)).toBe(true);
    expect(campo.closest("[inert]")).not.toBeNull();
  });

  it("escolher um modelo devolve o foco ANTES de a inserção correr", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          modelos: [{ id: "m1", nome: "Complementos", tipo: "grupo", grupo: { itens: [] } }],
        }),
      })),
    );
    const inserido: unknown[] = [];
    render(
      <ModelosParciais
        tipo="grupo"
        mostrar="inserir"
        onInserir={() => {
          // Lido DENTRO da acção: é este o instante que interessa, porque se
          // ela abrir um diálogo é este botão que a armadilha de foco memoriza.
          inserido.push(document.activeElement);
        }}
      />,
    );
    const abridor = screen.getByRole("button", { name: /De um modelo/i });
    abridor.focus();
    fireEvent.click(abridor);
    await act(async () => {});

    const item = await screen.findByRole("button", { name: "Complementos" });
    // Com o foco NO ITEM, que é onde ele está para quem chega aqui de teclado —
    // e é o elemento que vai desaparecer com o painel.
    item.focus();
    expect(item).toHaveFocus();
    fireEvent.click(item);
    await act(async () => {});

    expect(inserido).toHaveLength(1);
    expect(inserido[0]).toBe(abridor);
    expect(abridor).toHaveFocus();
  });

  it("com `prefers-reduced-motion` — onde não há saída nenhuma — o foco volta na mesma", async () => {
    simularMovimento({ menos: true });
    const abridor = abrirOGuardar();
    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => {});

    // Sem saída o nó desmonta no acto; é o caminho em que o foco cai no
    // `<body>` mais depressa, e o menos percorrido.
    expect(screen.queryByLabelText("Nome do modelo")).toBeNull();
    expect(abridor).toHaveFocus();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. O «NOVO NO CALENDÁRIO»
   ══════════════════════════════════════════════════════════════════════════ */

const hoje = new Date();
const diaDesteMes = (d: number) =>
  `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const PROVA: CalendarEvent = {
  id: "e1",
  date: diaDesteMes(10),
  title: "Prova de bolo",
  kind: "reuniao",
  createdAt: "2026-08-01T09:00:00.000Z",
};

const resposta = (status: number, body: unknown = {}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  }) as Response;

describe("o «Novo no calendário» devolve o foco a quem o abriu", () => {
  beforeEach(() => {
    __resetListCache();
    simularMovimento();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) =>
        Promise.resolve(
          !init?.method || init.method === "GET" ? resposta(200, [PROVA]) : resposta(200, {}),
        ),
      ),
    );
  });

  afterEach(() => {
    document.body.style.overflow = "";
  });

  /** Abre o painel do dia 10 e, de lá, o diálogo. Devolve o botão que o abriu. */
  async function abrirODialogo() {
    render(
      <ToastProvider>
        <Calendario quotes={[]} onOpen={() => {}} />
      </ToastProvider>,
    );
    await screen.findByLabelText(/Abrir Reunião: Prova de bolo/);
    fireEvent.click(screen.getByRole("gridcell", { name: /, 10 de .*Enter para ver/ }));
    const abridor = screen.getByRole("button", { name: "Adicionar" });
    abridor.focus();
    fireEvent.click(abridor);
    await screen.findByRole("dialog", { name: /Adicionar ao calendário/ });
    return abridor;
  }

  it("Escape: o foco sai do campo do título e volta ao «Adicionar»", async () => {
    const abridor = await abrirODialogo();
    // O campo tem `autoFocus`; é aqui que o foco ficava preso.
    expect(screen.getByPlaceholderText(/Reunião com fornecedor/)).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    await act(async () => {});

    expect(abridor).toHaveFocus();
  });

  it("o «×» faz o mesmo — e a caixa que fica é só uma imagem", async () => {
    const abridor = await abrirODialogo();
    const campo = screen.getByPlaceholderText(/Reunião com fornecedor/);

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await act(async () => {});

    expect(abridor).toHaveFocus();
    // Ainda montada a apagar-se, e já fora da árvore e do fio do teclado.
    expect(document.body.contains(campo)).toBe(true);
    expect(campo.closest("[inert]")).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("com `prefers-reduced-motion` o foco volta na mesma", async () => {
    simularMovimento({ menos: true });
    const abridor = await abrirODialogo();
    fireEvent.keyDown(window, { key: "Escape" });
    await act(async () => {});

    expect(screen.queryByPlaceholderText(/Reunião com fornecedor/)).toBeNull();
    expect(abridor).toHaveFocus();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. OS DOIS QUE JÁ ESTAVAM CERTOS — O CONTRATO, ESCRITO
   ══════════════════════════════════════════════════════════════════════════ */

describe("os dois menus «⋯» já devolviam o foco, e continuam a devolver", () => {
  beforeEach(() => simularMovimento());

  it("`MenuDeAccoes`: escolher uma acção devolve o foco ao abridor", async () => {
    const feito: unknown[] = [];
    render(
      <MenuDeAccoes
        sobre="Terracotta"
        accoes={[
          { id: "dup", rotulo: "Duplicar", onAccao: () => feito.push(document.activeElement) },
        ]}
      />,
    );
    const abridor = screen.getByRole("button", { name: "Acções de Terracotta" });
    abridor.focus();
    fireEvent.click(abridor);
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicar" }));
    await act(async () => {});

    expect(feito[0]).toBe(abridor);
    expect(abridor).toHaveFocus();
  });

  it("`MenuDeAccoes`: e o Escape também", async () => {
    render(
      <MenuDeAccoes
        sobre="Terracotta"
        accoes={[{ id: "dup", rotulo: "Duplicar", onAccao: () => {} }]}
      />,
    );
    const abridor = screen.getByRole("button", { name: "Acções de Terracotta" });
    abridor.focus();
    fireEvent.click(abridor);
    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => {});
    expect(abridor).toHaveFocus();
  });

  it("`MoreMenu`: escolher uma acção devolve o foco ao abridor", async () => {
    const feito: unknown[] = [];
    render(
      <MoreMenu
        items={[{ label: "Imprimir", onClick: () => feito.push(document.activeElement) }]}
      />,
    );
    const abridor = screen.getByRole("button", { name: "Mais" });
    abridor.focus();
    fireEvent.click(abridor);
    fireEvent.click(screen.getByRole("menuitem", { name: /Imprimir/ }));
    await act(async () => {});

    expect(feito[0]).toBe(abridor);
    expect(abridor).toHaveFocus();
  });
});
