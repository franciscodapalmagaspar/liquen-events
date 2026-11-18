// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  RegistoDeGravacoesProvider,
  frasesDaResposta,
  enumerarNomes,
} from "./registo-de-gravacoes";
import BotaoGuardarTudo from "./GuardarTudo";
import { useGravacaoAutomatica } from "./useGravacaoAutomatica";
import { type RespostaDoEnvio } from "@/lib/gravar-com-tecto";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O REGISTO INSCREVE QUEM GRAVA SOZINHO, SEM NINGUÉM SE LEMBRAR DISSO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O botão «Guardar tudo» só pode falar por quem está inscrito. Se a inscrição
 * fosse uma linha que cada ecrã novo tem de se lembrar de escrever, o botão
 * passaria a mentir por omissão à primeira vez que alguém se esquecesse — e um
 * botão que diz «tudo guardado» com trabalho por gravar noutro sítio é pior do
 * que não haver botão nenhum.
 *
 * Por isso quem usa a gravação automática partilhada é inscrito por ela. Estes
 * testes seguram isso, e seguram também a outra metade: com registo, o travão
 * de fechar o separador passa a ser UM só, o do registo, que sabe dizer O QUE
 * é que se perde.
 */

afterEach(cleanup);

/** Um ecrã que grava sozinho com o hook partilhado — o caso normal. */
function EcraQueGravaSozinho({
  nome,
  enviar,
}: {
  nome?: string | null;
  enviar: (v: string) => Promise<RespostaDoEnvio>;
}) {
  const [texto, setTexto] = useState("");
  useGravacaoAutomatica({ valor: texto, enviar, nome });
  return <input aria-label="campo" value={texto} onChange={(e) => setTexto(e.target.value)} />;
}

const nuncaResponde = () => new Promise<RespostaDoEnvio>(() => {});

describe("A gravação automática inscreve-se sozinha no registo", () => {
  it("um ecrã que grava sozinho aparece no contador com o NOME que lhe deram", async () => {
    const user = userEvent.setup();
    render(
      <RegistoDeGravacoesProvider>
        <BotaoGuardarTudo />
        <EcraQueGravaSozinho nome="Notas do pedido LQ-042" enviar={nuncaResponde} />
      </RegistoDeGravacoesProvider>,
    );
    // Nada escrito, nada por gravar.
    expect(screen.getByRole("button", { name: /tudo guardado/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText("campo"), "três mil caracteres");

    const botao = await screen.findByRole("button", { name: /guardar tudo \(1\)/i });
    expect(botao.getAttribute("title") ?? "").toContain("Notas do pedido LQ-042");
  });

  /** `nome: null` é a forma de um ecrã dizer «inscrevo-me à mão» — uma decisão
   *  escrita, e não um esquecimento. O painel do pedido usa-a porque tem mais
   *  coisas por gravar do que as que passam por este hook. */
  it("com `nome: null` não se inscreve — quem o faz, inscreve-se por outra via", async () => {
    const user = userEvent.setup();
    render(
      <RegistoDeGravacoesProvider>
        <BotaoGuardarTudo />
        <EcraQueGravaSozinho nome={null} enviar={nuncaResponde} />
      </RegistoDeGravacoesProvider>,
    );
    await user.type(screen.getByLabelText("campo"), "escrito");
    expect(await screen.findByRole("button", { name: /tudo guardado/i })).toBeInTheDocument();
  });

  /**
   * Com registo, o travão de saída é o do registo — e esse sabe dizer o que se
   * perde. Sem registo (um ecrã montado fora do back office, um teste), o hook
   * continua a ter o seu: um travão que desaparece em silêncio seria a pior
   * troca possível.
   */
  it("com registo, é o registo que trava a saída — e nomeia o que está por gravar", async () => {
    const user = userEvent.setup();
    render(
      <RegistoDeGravacoesProvider>
        <BotaoGuardarTudo />
        <EcraQueGravaSozinho nome="Notas do pedido LQ-042" enviar={nuncaResponde} />
      </RegistoDeGravacoesProvider>,
    );
    await user.type(screen.getByLabelText("campo"), "escrito");
    await screen.findByRole("button", { name: /guardar tudo \(1\)/i });

    const evento = new Event("beforeunload", { cancelable: true });
    let frase = "";
    Object.defineProperty(evento, "returnValue", {
      configurable: true,
      get: () => frase,
      set: (v: unknown) => {
        frase = String(v);
      },
    });
    await act(async () => {
      window.dispatchEvent(evento);
    });
    expect(evento.defaultPrevented).toBe(true);
    expect(frase).toContain("Notas do pedido LQ-042");
  });

  it("sem registo nenhum, o hook continua a travar a saída sozinho", async () => {
    const user = userEvent.setup();
    render(<EcraQueGravaSozinho nome="Notas do pedido LQ-042" enviar={nuncaResponde} />);
    await user.type(screen.getByLabelText("campo"), "escrito");

    const evento = new Event("beforeunload", { cancelable: true });
    await act(async () => {
      window.dispatchEvent(evento);
    });
    expect(evento.defaultPrevented).toBe(true);
  });
});

describe("As palavras da resposta", () => {
  const quando = new Date();

  it("tudo no servidor — di-lo sem rodeios", () => {
    const f = frasesDaResposta({
      quando,
      itens: [
        { nome: "A", resultado: { estado: "guardado" } },
        { nome: "B", resultado: { estado: "guardado" } },
      ],
    });
    expect(f.titulo).toBe("Está tudo guardado no servidor.");
    expect(f.tudoBem).toBe(true);
  });

  it("um de cinco a faltar não pode dar «guardado»", () => {
    const f = frasesDaResposta({
      quando,
      itens: [
        { nome: "A", resultado: { estado: "guardado" } },
        { nome: "B", resultado: { estado: "guardado" } },
        { nome: "C", resultado: { estado: "guardado" } },
        { nome: "D", resultado: { estado: "guardado" } },
        { nome: "E", resultado: { estado: "nao-guardado" } },
      ],
    });
    expect(f.titulo).toBe("Faltou guardar 1 de 5.");
    expect(f.tudoBem).toBe(false);
    expect(f.linhas.find((l) => l.nome === "E")?.texto).toMatch(/não ficou guardado/i);
  });

  it("nada por gravar não é «guardado» — é nada por gravar", () => {
    const f = frasesDaResposta({ quando, itens: [] });
    expect(f.titulo).toBe("Não havia nada por gravar.");
    expect(f.tudoBem).toBe(true);
  });

  it("os nomes lêem-se como uma frase, não como uma lista de código", () => {
    expect(enumerarNomes(["A"])).toBe("A");
    expect(enumerarNomes(["A", "B"])).toBe("A e B");
    expect(enumerarNomes(["A", "B", "C"])).toBe("A, B e C");
  });
});
