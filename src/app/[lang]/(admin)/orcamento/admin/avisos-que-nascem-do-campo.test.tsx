// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClientMessenger from "./ClientMessenger";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE CORREU MAL APARECE DE ALGUM SÍTIO — E A QUATRO PÍXEIS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A `.bo-entrada` do `globals.css` tem um censo escrito no próprio ficheiro: os
 * nove sítios do back office que aparecem POR CIMA da página. Faltava-lhe uma
 * família inteira, e é a que fala quando alguma coisa falha — as mensagens de
 * `role="alert"` que nascem por baixo do campo onde ela acabou de escrever.
 * Apareciam num fotograma, a empurrar o que estava por baixo.
 *
 * E faltava a mesma coisa aos painéis que abrem por montagem condicional: «Só
 * para ti» (custos e margem), o seguimento e os motivos de uma proposta
 * perdida. Todos nasciam de um clique num botão logo acima, e todos apareciam
 * inteiros de uma vez.
 *
 * ── QUATRO PÍXEIS, E NÃO OITO ─────────────────────────────────────────────
 *
 * É a decisão que este ficheiro prende, e é a que se perde primeiro. A
 * `.bo-entrada` nua são dez píxeis — a distância de um rótulo ao seu campo.
 * A `.bo-entrada-folha` são dezoito, e o `globals.css` chama-lhes «a distância de
 * um aviso» a pensar na FOLHA do telemóvel e na pilha do `Toast`: coisas que
 * vêm de fora do ecrã.
 *
 * Nada disto vem de fora do ecrã. Um erro por baixo de uma caixa de texto nasce
 * COLADO a ela, e os dezoito píxeis dir-lhe-iam que veio de outro sítio qualquer.
 * Por isso a `.bo-entrada` nua, e por isso o teste que se segue verifica que
 * nenhuma delas apanhou o `-folha` por distracção.
 *
 * ── E A REGRA QUE MANDA NUM AVISO DE ERRO ─────────────────────────────────
 *
 * Nenhuma animação pode ATRASAR uma tarefa. A frase tem de estar legível quando
 * ela olha, não 240 ms depois. É por isso que o quarto teste prende a duração e
 * a curva da classe: a `cubic-bezier(0, 0, 0.2, 1)` gasta a maior parte da
 * distância no arranque, portanto o texto lê-se muito antes de a animação
 * acabar. Trocá-la por uma curva que hesite no início — uma `--ease-in`, uma
 * simétrica — punha a mensagem a chegar depois da decisão.
 *
 * ── O QUE ESTE FICHEIRO PRENDE, E O QUE NÃO ───────────────────────────────
 *
 * Prende que o gesto existe, que é o da casa e que é a MEDIDA certa. Não prende
 * que se veja: isso é o browser, e o jsdom não tem disposição nenhuma. O último
 * teste é o único que corre a sério — monta o mensageiro, faz o envio falhar e
 * confirma que a classe chega mesmo ao nó que tem o `role="alert"`, e não só ao
 * ficheiro.
 */

const ler = (f: string) => readFileSync(`src/app/[lang]/(admin)/orcamento/admin/${f}`, "utf8");

// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const CSS = readFileSync("src/app/globals.css", "utf8") + readFileSync("src/app/admin.css", "utf8");

/**
 * Os cinco avisos, cada um com o pedaço de `className` por onde se reconhece.
 * O `role="alert"` sozinho não chegava para os apanhar: há ficheiros com mais
 * do que um nó a falar, e o que interessa é ESTE.
 */
const AVISOS: { ficheiro: string; marca: RegExp; oQue: string }[] = [
  {
    ficheiro: "EventCosts.tsx",
    marca: /className="bo-entrada mb-5 rounded-xl border border-\[var\(--bo-perigo\)\]\/25/,
    oQue: "o custo que colidiu",
  },
  {
    ficheiro: "ClientMessenger.tsx",
    marca:
      /className="bo-entrada text-\[var\(--bo-perigo\)\] text-xs mb-3 leading-relaxed" role="alert"/,
    oQue: "a mensagem que não foi ao cliente",
  },
  {
    ficheiro: "PaymentsPanel.tsx",
    marca:
      /className="bo-entrada flex items-start gap-2\.5 rounded-lg border border-\[var\(--bo-aviso-tom\)\]/,
    oQue: "o recebido acima do contratado",
  },
  {
    ficheiro: "PerguntaDeDesfecho.tsx",
    marca: /role="alert"\s+className="bo-entrada mt-2 text-\[var\(--bo-perigo\)\]/,
    oQue: "o valor de desfecho que não se percebe",
  },
  {
    ficheiro: "EmailTemplatesBilingue.tsx",
    marca: /className="bo-entrada mb-2 flex flex-wrap items-center gap-x-2/,
    oQue: "os pedidos que não deram para ler",
  },
];

/** Os três painéis que abrem por montagem condicional. */
const PAINEIS: { ficheiro: string; abre: RegExp; marca: RegExp; oQue: string }[] = [
  {
    ficheiro: "PainelInterno.tsx",
    abre: /\{aberto && \(/,
    marca: /className="bo-entrada border-t border-\[var\(--bo-hairline\)\] p-4"/,
    oQue: "«Só para ti» — custos e margem",
  },
  {
    ficheiro: "Acompanhamento.tsx",
    abre: /\{seguimentoAberto && \(/,
    marca: /className="bo-entrada mt-3 flex flex-wrap items-end gap-2 rounded-xl/,
    oQue: "o seguimento, com data e nota",
  },
  {
    ficheiro: "Acompanhamento.tsx",
    abre: /\{aRecusar && \(/,
    marca: /className="bo-entrada mt-3 rounded-xl border border-\[var\(--bo-hairline\)\]/,
    oQue: "os motivos de uma proposta perdida",
  },
];

describe("os avisos de erro nascem colados ao campo", () => {
  for (const { ficheiro, marca, oQue } of AVISOS) {
    it(`${ficheiro}: ${oQue}`, () => {
      expect(ler(ficheiro)).toMatch(marca);
    });
  }

  /**
   * O controlo que dá sentido ao de cima. Um `bo-entrada-folha` aqui seria
   * silencioso — anima na mesma, e ninguém dá por ele numa revisão — e estaria
   * errado: dezoito píxeis são a distância de quem vem de fora do ecrã, e nenhum
   * destes vem. É o engano mais fácil de cometer, porque o `globals.css` chama
   * aos oito «a distância de um aviso» (a pensar na folha e no `Toast`).
   */
  it("nenhum deles usa a distância de uma folha, que é de quem vem de fora", () => {
    for (const { ficheiro, marca } of AVISOS) {
      const linha = ler(ficheiro).match(marca)?.[0] ?? "";
      expect(linha).not.toMatch(/bo-entrada-folha/);
    }
  });
});

describe("os painéis que abrem saem do botão que os abriu", () => {
  for (const { ficheiro, abre, marca, oQue } of PAINEIS) {
    it(`${ficheiro}: ${oQue}`, () => {
      const fonte = ler(ficheiro);
      // Continua a abrir por MONTAGEM: é dela que a entrada vem. Se algum dia
      // passar a `hidden`, a classe deixa de correr e este teste fica a mentir.
      expect(fonte).toMatch(abre);
      expect(fonte).toMatch(marca);
    });
  }

  /**
   * ── E NENHUM DELES PODE GANHAR UM `key` ────────────────────────────────
   *
   * É a armadilha que custa trabalho a sério, e não pixéis. Os três guardam
   * coisas por gravar — as caixas de custo do «Só para ti», a data e a nota do
   * seguimento, o motivo e o detalhe da recusa. Um `key` a mudar remonta a
   * árvore e deita-os fora, e é a maneira mais natural de alguém fazer uma
   * animação recomeçar. A entrada vem da CLASSE do elemento que monta, e a
   * montagem é a que o `{… && …}` já fazia.
   */
  it("a entrada vem da classe, e não de um `key` que remontaria o que está por gravar", () => {
    for (const { ficheiro, marca } of PAINEIS) {
      const abertura = ler(ficheiro).match(marca)?.[0] ?? "";
      expect(abertura).not.toMatch(/\bkey=/);
    }
  });
});

describe("a classe que todos eles usam", () => {
  it("são 240 ms, o degrau de um rótulo, e a curva de quem chega e assenta", () => {
    // O degrau do RÓTULO é o valor por omissão da variável — é o que faz da
    // `.bo-entrada` nua a distância de um aviso ao campo que o gerou. Eram
    // quatro píxeis escritos à mão aqui; hoje são dez, e vêm da escada do
    // percurso do `:root`, para não haver dois sítios a discordar.
    expect(CSS).toMatch(
      /transform:\s*translateY\(var\(--bo-entrada-y,\s*calc\(-1 \* var\(--bo-percurso-rotulo\)\)\)\)/,
    );
    expect(CSS).toContain("--bo-percurso-rotulo: 10px");
    expect(CSS).toMatch(
      /\.bo-entrada\s*\{\s*animation:\s*bo-entrada\s+240ms\s+cubic-bezier\(0,\s*0,\s*0\.2,\s*1\)/,
    );
  });

  it("cala-se por inteiro com movimento reduzido", () => {
    expect(CSS).toMatch(
      /prefers-reduced-motion:\s*reduce\)\s*\{\s*\.bo-entrada\s*\{\s*animation:\s*none/,
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   E UMA VEZ A SÉRIO, NO DOM
   ══════════════════════════════════════════════════════════════════════════

   Os testes de cima lêem ficheiros: apanham a classe a desaparecer, não a
   classe a ir parar ao nó errado. Este monta o mensageiro, faz o envio falhar
   por o pedido não ter email — que é o caminho que o `ClientMessenger.test.tsx`
   já descreve — e vai buscar o nó pelo `role="alert"`, como o leitor de ecrã o
   encontraria. Se a classe estiver no `<div>` de fora, ou no `<p>` errado, isto
   fica vermelho e os de cima ficavam verdes. */

const QUOTE = { id: "q1", name: "Ana Silva", email: "" } as Quote;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("no DOM, a classe está no nó que fala", () => {
  it("o aviso do mensageiro entra com a `.bo-entrada`", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ emailed: false, emailError: "Este pedido não tem email." }),
      })),
    );
    const user = userEvent.setup();
    render(<ClientMessenger quote={QUOTE} />);

    await user.type(screen.getByLabelText("Mensagem ao cliente"), "Olá");
    await user.click(screen.getByRole("button", { name: /Enviar e-mail/ }));
    // O envio espera 10 s para se poder cancelar (`useEnvioAdiado`); aqui não.
    await user.click(screen.getByRole("button", { name: /^Enviar já$/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const aviso = screen.getByRole("alert");
    expect(aviso.className).toMatch(/\bbo-entrada\b/);
    // A distância de um rótulo, e não a de quem vem de fora do ecrã.
    expect(aviso.className).not.toMatch(/bo-entrada-folha/);
  });
});
