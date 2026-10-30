// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { carregarTelefones } from "@/lib/telefone-no-browser";
import { getCountryCallingCode, type CountryCode } from "libphonenumber-js/max";
import CampoTelefone, {
  INDICATIVOS_FIXADOS,
  PAISES_FIXADOS,
  TEXTOS_DE_RECURSO,
} from "./CampoTelefone";
import { pt } from "@/lib/i18n/pt";
import { en } from "@/lib/i18n/en";

/**
 * O TELEFONE COM A BANDEIRA (pedido dela, 30/10): «números de telefone seja
 * qual país for», com a bandeira e o número, Portugal já escolhido, e
 * conferido com as regras do país escolhido.
 *
 * O que se prende aqui: a bandeira muda à mão (a lista) e sozinha (um «+44»
 * colado), o erro aparece ao sair do campo com o nome do país, e o que o pai
 * recebe é o E.164.
 */

afterEach(cleanup);

/** O campo dentro de um pai que guarda o valor, como os formulários fazem. */
function Pai({
  inicial = "",
  aoMudar,
  mostrarErro,
}: {
  inicial?: string;
  aoMudar?: (v: string) => void;
  mostrarErro?: boolean;
}) {
  const [v, setV] = useState(inicial);
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <label htmlFor="tel">Telemóvel</label>
      <CampoTelefone
        id="tel"
        value={v}
        onChange={(n) => {
          setV(n);
          aoMudar?.(n);
        }}
        mostrarErro={mostrarErro}
        locale="pt"
      />
      <output data-testid="valor">{v}</output>
    </form>
  );
}

const numero = () => screen.getByLabelText("Telemóvel") as HTMLInputElement;
const botao = () => screen.getByRole("button", { name: /país do número/i });
const valor = () => screen.getByTestId("valor").textContent;

/** Escreve, e espera pelas regras (o `import()` do primeiro toque). */
async function escrever(texto: string) {
  fireEvent.focus(numero());
  fireEvent.change(numero(), { target: { value: texto } });
  await act(async () => {
    await carregarTelefones();
  });
}

describe("CampoTelefone — a bandeira e o número", () => {
  it("abre com Portugal e o +351, e o número nacional sai em E.164", async () => {
    render(<Pai />);
    expect(botao()).toHaveAccessibleName("País do número: Portugal (+351)");
    expect(numero()).toHaveAttribute("type", "tel");
    expect(numero()).toHaveAttribute("inputmode", "tel");
    await escrever("912 345 678");
    await waitFor(() => expect(valor()).toBe("+351912345678"));
  });

  it("escolher o Reino Unido na lista muda o indicativo, e o número segue as regras de lá", async () => {
    render(<Pai />);
    fireEvent.click(botao());
    const procura = screen.getByRole("combobox", { name: /procurar país/i });
    await waitFor(() => expect(procura).toHaveFocus());
    fireEvent.change(procura, { target: { value: "reino" } });
    fireEvent.click(await screen.findByRole("option", { name: /Reino Unido/ }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(botao()).toHaveAccessibleName("País do número: Reino Unido (+44)");
    expect(numero()).toHaveFocus();

    fireEvent.change(numero(), { target: { value: "020 7946 0958" } });
    await waitFor(() => expect(valor()).toBe("+442079460958"));
  });

  it("um número inválido para o país mostra o erro ao sair do campo, com o país e o indicativo", async () => {
    render(<Pai />);
    fireEvent.click(botao());
    fireEvent.click(await screen.findByRole("option", { name: /Reino Unido/ }));
    fireEvent.change(numero(), { target: { value: "07911 12" } });
    // Enquanto escreve, nada.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.blur(numero());
    const erro = await screen.findByRole("alert");
    expect(erro).toHaveTextContent("Este número não é válido para Reino Unido (+44).");
    expect(numero()).toHaveAttribute("aria-invalid", "true");
    expect(numero().getAttribute("aria-describedby")).toContain(erro.id);
    // O pai recebe o número com o indicativo, para o servidor o ler no país certo.
    expect(valor()).toBe("+44 07911 12");
  });

  it("colar um «+44 …» muda a bandeira sozinha, e o número fica nacional", async () => {
    render(<Pai />);
    await escrever("+44 20 7946 0958");
    await waitFor(() => expect(botao()).toHaveAccessibleName("País do número: Reino Unido (+44)"));
    expect(numero().value).toBe("020 7946 0958");
    expect(valor()).toBe("+442079460958");
  });

  it("colar o número do Brasil muda para o Brasil, e é válido", async () => {
    render(<Pai />);
    await escrever("+55 11 91234-5678");
    await waitFor(() => expect(botao()).toHaveAccessibleName("País do número: Brasil (+55)"));
    expect(valor()).toBe("+5511912345678");
    fireEvent.blur(numero());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("o «00» conta como «+»", async () => {
    render(<Pai />);
    await escrever("0033 6 12 34 56 78");
    await waitFor(() => expect(botao()).toHaveAccessibleName("País do número: França (+33)"));
    expect(valor()).toBe("+33612345678");
  });

  it("um valor gravado abre com a bandeira dele e o número no formato do país", async () => {
    render(<Pai inicial="+442079460958" />);
    await waitFor(() => expect(numero().value).toBe("020 7946 0958"));
    expect(botao()).toHaveAccessibleName("País do número: Reino Unido (+44)");
  });

  it("um número antigo, que não se percebe, fica como estava e não é reescrito", async () => {
    const aoMudar = vi.fn();
    render(<Pai inicial="91 234 56 78 ext" aoMudar={aoMudar} />);
    await waitFor(() => expect(numero().value).toBe("91 234 56 78 ext"));
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it("na tentativa de enviar, o erro aparece sem ter de sair do campo", async () => {
    const { rerender } = render(<Pai />);
    await escrever("91234");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    rerender(<Pai mostrarErro />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este número não é válido para Portugal (+351).",
    );
  });
});

describe("CampoTelefone — a lista, ao teclado", () => {
  it("os oito mais usados vêm à frente, por esta ordem", async () => {
    render(<Pai />);
    fireEvent.click(botao());
    const opcoes = await screen.findAllByRole("option");
    expect(opcoes.slice(0, 8).map((o) => o.id.replace("tel-pais-", ""))).toEqual([
      ...PAISES_FIXADOS,
    ]);
    // O país escolhido está marcado.
    expect(screen.getByRole("option", { name: /Portugal/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("procura sem acentos, setas, Enter escolhe — e o Enter não envia o formulário", async () => {
    const enviar = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={enviar}>
        <label htmlFor="t">Telemóvel</label>
        <CampoTelefone id="t" value="" onChange={() => {}} locale="pt" />
      </form>,
    );
    fireEvent.keyDown(botao(), { key: "ArrowDown" });
    const procura = await screen.findByRole("combobox");
    fireEvent.change(procura, { target: { value: "suica" } });
    await waitFor(() => expect(procura.getAttribute("aria-activedescendant")).toBe("t-pais-CH"));
    fireEvent.keyDown(procura, { key: "Enter" });
    expect(enviar).not.toHaveBeenCalled();
    expect(botao()).toHaveAccessibleName("País do número: Suíça (+41)");
  });

  it("o escolhido leva o ✓ (o desenho da Apple), e só ele", async () => {
    render(<Pai />);
    fireEvent.click(botao());
    await screen.findByRole("combobox");
    const vistos = screen
      .getAllByRole("option")
      .filter((o) => o.querySelector("[data-visto]") !== null);
    expect(vistos).toHaveLength(1);
    expect(vistos[0]).toHaveTextContent("Portugal");
    expect(vistos[0]).toHaveAttribute("aria-selected", "true");
  });

  it("procura pelo indicativo", async () => {
    render(<Pai />);
    fireEvent.click(botao());
    const procura = await screen.findByRole("combobox");
    fireEvent.change(procura, { target: { value: "+244" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    expect(screen.getByRole("option")).toHaveTextContent("Angola");
  });

  it("o Escape fecha a lista e devolve o foco ao botão, sem chegar ao que está por baixo", async () => {
    const porBaixo = vi.fn();
    render(
      <div onKeyDown={porBaixo}>
        <Pai />
      </div>,
    );
    fireEvent.click(botao());
    const procura = await screen.findByRole("combobox");
    fireEvent.keyDown(procura, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(botao()).toHaveFocus();
    expect(porBaixo).not.toHaveBeenCalled();
  });

  it("em inglês, os nomes vêm em inglês", async () => {
    render(
      <CampoTelefone
        id="x"
        value=""
        onChange={() => {}}
        locale="en"
        textos={en.common.campoTelefone}
      />,
    );
    expect(screen.getByRole("button")).toHaveAccessibleName(
      "Country of the number: Portugal (+351)",
    );
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("option", { name: /United Kingdom/ })).toBeInTheDocument();
  });
});

describe("CampoTelefone — o que não pode desacertar", () => {
  it("as frases de recurso são as do dicionário", () => {
    expect(TEXTOS_DE_RECURSO).toEqual(pt.common.campoTelefone);
  });

  it("os indicativos escritos à mão são os da biblioteca", () => {
    for (const p of PAISES_FIXADOS) {
      expect(INDICATIVOS_FIXADOS[p]).toBe(getCountryCallingCode(p as CountryCode));
    }
  });
});
