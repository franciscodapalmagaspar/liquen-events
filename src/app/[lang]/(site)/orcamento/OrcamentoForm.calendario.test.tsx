// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocaleProvider } from "@/components/LocaleProvider";
import { getDictionary, pickChromeDict } from "@/lib/i18n";
import OrcamentoForm from "./OrcamentoForm";

/**
 * O CALENDÁRIO DA «DATA DO EVENTO» — pedido dela, 28/10, com a captura do
 * calendário do Chrome: «quero melhorar isto para ficar ao estilo da apple».
 *
 * Com rato, o campo passa a ser o calendário da casa; com o dedo, continua o
 * `<input type="date">` do sistema (os testes do `OrcamentoForm.test.tsx`
 * correm sem `matchMedia` e medem esse). Aqui o browser diz que tem rato.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/image", () => ({ default: () => null }));

const dict = getDictionary("pt");
const to = dict.orcamento;

function montar(rato = true) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((q: string) => ({
      matches: rato && q.includes("pointer: fine"),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  return render(
    <LocaleProvider locale="pt" dict={pickChromeDict(dict)}>
      <OrcamentoForm panelBlur="data:image/webp;base64,AAAA" orcamento={to} />
    </LocaleProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  // Quarta-feira, 28 de outubro de 2026, a meio da tarde em Lisboa.
  vi.setSystemTime(new Date(2026, 9, 28, 15, 0));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const campo = () => screen.getByRole("button", { name: new RegExp(to.labelData, "i") });

describe("OrcamentoForm — o calendário da data, com rato", () => {
  it("o campo é um botão com o rótulo e «Escolher a data», e abre o calendário", async () => {
    montar();
    await waitFor(() => expect(campo()).toHaveAccessibleName(/Data do evento.*Escolher a data/));
    expect(document.querySelector('input[type="date"]')).toBeNull();

    await userEvent.click(campo());
    const dialogo = screen.getByRole("dialog", { name: to.calendario.calendario });
    expect(dialogo).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Outubro 2026/ })).toBeInTheDocument();
    // O dia de hoje é dito, e é onde o foco começa.
    const hoje = screen.getByRole("button", { name: /28 de outubro de 2026, hoje/ });
    expect(hoje).toHaveFocus();
    expect(hoje).toHaveAttribute("aria-current", "date");
  });

  it("escolher um dia escreve-o no campo, fecha, e volta ao campo", async () => {
    montar();
    await waitFor(() => campo());
    await userEvent.click(campo());
    await userEvent.click(screen.getByRole("button", { name: /^sábado, 31 de outubro de 2026$/ }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(campo()).toHaveAccessibleName(/Data do evento.*31 de outubro de 2026/);
    expect(campo()).toHaveFocus();
  });

  it("os dias que já passaram vêem-se mas não se escolhem", async () => {
    montar();
    await waitFor(() => campo());
    await userEvent.click(campo());
    const ontem = screen.getByRole("button", { name: /27 de outubro de 2026, já passou/ });
    expect(ontem).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(ontem);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(campo()).toHaveAccessibleName(/Escolher a data/);
  });

  it("teclado: setas, PageDown e Enter escolhem; Escape fecha sem escolher", async () => {
    montar();
    await waitFor(() => campo());
    await userEvent.click(campo());
    await userEvent.keyboard("{ArrowRight}{ArrowDown}");
    expect(screen.getByRole("button", { name: /, 5 de novembro de 2026/ })).toHaveFocus();
    expect(screen.getByRole("button", { name: /Novembro 2026/ })).toBeInTheDocument();
    await userEvent.keyboard("{PageDown}");
    expect(screen.getByRole("button", { name: /, 5 de dezembro de 2026/ })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(campo()).toHaveAccessibleName(/, 5 de dezembro de 2026/);

    await userEvent.click(campo());
    await userEvent.keyboard("{ArrowRight}{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(campo()).toHaveAccessibleName(/, 5 de dezembro de 2026/);
    expect(campo()).toHaveFocus();
  });

  it("o título abre os meses, para chegar depressa a um casamento daqui a um ano", async () => {
    montar();
    await waitFor(() => campo());
    await userEvent.click(campo());
    await userEvent.click(screen.getByRole("button", { name: /Outubro 2026/ }));
    await userEvent.click(screen.getByRole("button", { name: to.calendario.anoSeguinte }));
    await userEvent.click(screen.getByRole("button", { name: /^Jul/ }));
    expect(screen.getByRole("button", { name: /Julho 2027/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^sábado, 24 de julho de 2027$/ }));
    expect(campo()).toHaveAccessibleName(/24 de julho de 2027/);
  });

  it("um clique fora fecha", async () => {
    montar();
    await waitFor(() => campo());
    await userEvent.click(campo());
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("com «Data ainda a definir» o calendário fica desligado", async () => {
    montar();
    await waitFor(() => campo());
    await userEvent.click(screen.getByLabelText(to.dateFlexibleLabel));
    expect(campo()).toBeDisabled();
  });

  it("com o dedo continua o campo do sistema", async () => {
    montar(false);
    await waitFor(() =>
      expect(screen.getByLabelText(new RegExp(to.labelData, "i"))).toHaveAttribute("type", "date"),
    );
  });
});
