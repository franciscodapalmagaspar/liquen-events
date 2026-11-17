// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DESTINO ONDE ELA ESTÁ TEM DE SE DISTINGUIR DAQUELE ONDE PODE IR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a olhar para a captura da coluna: «eu quero uma óptima
 * animação aqui no menu e design».
 *
 * O que estava lá: o item ACTIVO pintava-se `bg-[var(--bo-surface-hover)]` com
 * `text-[var(--bo-text)]`, e o item sob o rato pintava-se
 * `hover:bg-[var(--bo-surface-hover)]` com `hover:text-[var(--bo-text)]`. **O
 * mesmo fundo e a mesma cor de texto.** A única diferença que sobrava era o
 * `font-medium` — e num relance, a 13 px, um peso de letra não é uma diferença.
 * Quem distinguia de facto era o filete verde, que vivia FORA da pastilha
 * (`left-1`, 8 px à esquerda dela) e por isso se lia como outro objecto
 * encostado à margem.
 *
 * ── O QUE ESTE CASO PRENDE, E PORQUÊ CADA COISA ───────────────────────────
 *
 *  1. **O activo usa a cor da casa.** Não basta «é diferente do hover»: uma
 *     diferença qualquer passaria (um cinzento um pouco mais escuro, por
 *     exemplo) e não resolveria o pedido, que é ter uma IDENTIDADE. Por isso o
 *     caso exige o token do acento, e exige-o no fundo E na tinta.
 *
 *  2. **O activo não pode partilhar a lavagem do hover.** É a metade que
 *     falhava antes, dita ao contrário: se alguém devolver o
 *     `--bo-surface-hover` ao activo, isto fica vermelho.
 *
 *  3. **O filete é do mesmo objecto e da mesma cor.** Ele estava escrito com um
 *     hex à mão, `#4d6350`, e o acento da casa é `#4c6350` — um dígito de
 *     diferença, perto o suficiente para ninguém ver e longe o suficiente para
 *     divergirem no dia em que o acento mudar. O caso proíbe o hex e exige o
 *     token, e exige que o filete tenha saído da margem (`left-1`) para a borda
 *     da pastilha (`left-3`, que é o `px-3` desta coluna).
 *
 *  4. **A bolha do contador tem transição.** Ela muda de cor ao trocar de
 *     destino (acento com branco quando activa, cinzenta quando não) e não
 *     tinha classe de transição nenhuma: era um corte seco ao lado de uma
 *     pastilha que se esbate em 120 ms.
 *
 * ── O CONTROLO NEGATIVO, VERIFICADO A SÉRIO ───────────────────────────────
 *
 * Um caso que só lê classes passa com facilidade demais, por isso este ficheiro
 * traz o seu próprio controlo: o último `it` reconstrói, a partir da fonte, a
 * pastilha COMO ELA ESTAVA (o par activo/hover antigo) e verifica que as
 * mesmas asserções a REPROVAM. Sem isso, «o activo distingue-se» é uma frase
 * que passa mesmo quando não se distingue nada.
 *
 * E as asserções foram corridas contra o ficheiro ANTES da correcção: falhavam
 * as quatro (o activo com `--bo-surface-hover`, sem `--bo-accent`; o filete com
 * `bg-[#4d6350]` e `left-1`; a bolha sem `ESTADO`). Está escrito porque um caso
 * novo que nasce verde não prova nada.
 *
 * ── O QUE NÃO ESTÁ AQUI ───────────────────────────────────────────────────
 *
 * Onde o filete PÁRA. Ele mede-se (`offsetTop`/`offsetHeight`) e no jsdom não
 * há disposição nenhuma — `offsetParent` é sempre nulo e as medidas são zero.
 * Isso mede-se num browser e já está medido: `e2e/admin-views.spec.ts`, «a
 * marca do destino activo».
 *
 * E o CONTRASTE. Calcula-se, não se afirma: sobre o branco desta coluna o
 * acento sobre a sua própria lavagem dá 5,19:1 (texto normal pede 4,5:1) e as
 * duas lavagens dão 1,26:1 e 1,10:1 contra o branco, ou seja distinguem-se uma
 * da outra. Os números estão ao lado do código que os usa.
 */

/** O duplo do `./lazy`, por procuração — ver `AdminClient.menu-sem-dobra.test.tsx`. */
vi.mock("./lazy", () => {
  const duplos = new Map<string, () => React.ReactElement>();
  return new Proxy({} as Record<string, unknown>, {
    get(_alvo, nome) {
      if (typeof nome !== "string" || nome === "then" || nome === "__esModule") return undefined;
      if (nome === "WARM_ORDER") return [];
      if (!duplos.has(nome)) {
        const C = () => <div data-testid={`view-${nome}`}>{nome} stub</div>;
        C.displayName = `Lazy(${nome})`;
        duplos.set(nome, C);
      }
      return duplos.get(nome);
    },
    has: () => true,
  });
});

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

const CAMINHO = "src/app/[lang]/(admin)/orcamento/admin/AdminClient.tsx";
const FONTE = readFileSync(CAMINHO, "utf8");

/** Comentários fora: a prosa desta casa CITA o que foi apagado, de propósito —
 *  as strings antigas continuam escritas nos comentários e uma leitura crua
 *  encontrava-as lá e dava-as por vivas. */
function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

const CODIGO = semComentarios(FONTE);

const pedido = (): Quote =>
  ({
    id: "LQ-001",
    submittedAt: "2026-05-01T10:00:00.000Z",
    lastUpdated: "2026-05-01T10:00:00.000Z",
    status: "pendente",
    name: "Ana Marques",
    email: "ana@example.com",
    category: "particulares",
    eventType: "casamentos",
    date: "2026-09-20",
    location: "Évora",
    guests: 80,
  }) as Quote;

function montar() {
  render(
    <ToastProvider>
      <AdminClient initialQuotes={[pedido()]} userName="Catarina" />
    </ToastProvider>,
  );
  return screen.getByRole("complementary");
}

/** O destino marcado como página actual, tal como o gancho do filete o encontra. */
function destinoActivo(barra: HTMLElement): HTMLElement {
  const el = barra.querySelector<HTMLElement>('[aria-current="page"]');
  if (!el) throw new Error("a coluna não tem destino nenhum marcado como página actual");
  return el;
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, headers: new Headers(), json: async () => [] })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("A coluna de destinos — o activo tem a cor da casa", () => {
  it("o destino activo pinta-se com o acento, no fundo e na tinta", () => {
    const activo = destinoActivo(montar());
    const classes = activo.className;

    expect(classes, "o destino activo não usa a lavagem de acento da casa").toContain(
      "bg-[var(--bo-accent-ring)]",
    );
    expect(classes, "o rótulo do destino activo não usa a tinta de acento").toContain(
      "text-[var(--bo-accent)]",
    );
  });

  it("o activo NÃO partilha a lavagem cinzenta do hover", () => {
    const activo = destinoActivo(montar());

    // Esta é a metade que falhava: o activo tinha exactamente esta classe, e o
    // não-activo tinha-a em `hover:`. Duas pastilhas iguais.
    expect(
      activo.className,
      "o destino activo voltou a pintar-se com a mesma lavagem do hover — " +
        "onde ela ESTÁ e onde ela pode IR ficam outra vez iguais",
    ).not.toMatch(/(^|\s)bg-\[var\(--bo-surface-hover\)\]/);
  });

  it("o ícone do destino activo acompanha o rótulo", () => {
    const icone = destinoActivo(montar()).querySelector("span");
    expect(icone?.className, "o ícone do destino activo ficou cinzento").toContain(
      "text-[var(--bo-accent)]",
    );
  });

  /**
   * A classe do filete, e SÓ dela.
   *
   * A primeira versão deste caso procurava `bg-[#4d6350]` no ficheiro INTEIRO e
   * ficava vermelha por uma razão que não é esta: esse hex aparece ~30 vezes no
   * `AdminClient.tsx` (chips, caixas de selecção, o botão da próxima acção) e é
   * uma dívida à parte — o acento da casa é `#4c6350`, um dígito ao lado, e
   * ninguém pode ver a diferença a olho. Aqui mede-se o filete; a varredura das
   * outras trinta é outro trabalho, e fica dito em vez de ficar escondido
   * dentro de um caso que promete outra coisa.
   */
  const CLASSE_DO_FILETE = /pointer-events-none absolute [^`]*w-\[3px\][^`]*/.exec(CODIGO)?.[0];

  it("o filete é da mesma cor que a pastilha, e pela variável e não por um hex", () => {
    expect(CLASSE_DO_FILETE, "não encontrei o filete do destino activo").toBeTruthy();
    expect(
      CLASSE_DO_FILETE,
      "o filete voltou a ter a cor escrita à mão. O hex que lá esteve (`#4d6350`) nem " +
        "sequer era o acento da casa (`#4c6350`) — um dígito ao lado, perto o suficiente " +
        "para ninguém ver. Agora a proibição é de QUALQUER hex, e não só daquele: a fase " +
        "03 do sistema de design tirou os literais de cor do back office todo, e um hex " +
        "novo aqui seria o primeiro a voltar.",
    ).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(CLASSE_DO_FILETE, "o filete deixou de usar o token do acento").toContain(
      "bg-[var(--bo-accent)]",
    );
  });

  it("o filete assenta na borda da pastilha e não na margem da coluna", () => {
    // A coluna tem `px-3`: a pastilha começa aos 12 px. `left-1` são 4 px, ou
    // seja 8 px de branco entre o filete e a pastilha — dois objectos.
    const onde = /absolute (left-\d+) top-0 w-\[3px\]/.exec(CODIGO);
    expect(onde, "não encontrei o filete do destino activo").not.toBeNull();
    expect(
      onde![1],
      "o filete voltou para a margem da coluna, fora da pastilha do destino activo",
    ).toBe("left-3");
  });

  it("a bolha do contador muda de cor com transição, e não a corte seco", () => {
    const bolha = /className=\{`ml-auto min-w-\[20px\][^`]*`\}/.exec(CODIGO);
    expect(bolha, "não encontrei a bolha do contador").not.toBeNull();
    expect(
      bolha![0],
      "a bolha do contador troca de cor sem transição — é a avaria nº 2 do censo " +
        "do `ui/movimento.ts`, transições em falta",
    ).toContain("${ESTADO}");
  });

  /**
   * ── O CONTROLO NEGATIVO ────────────────────────────────────────────────
   *
   * As asserções acima têm de REPROVAR a pastilha antiga. Sem este caso, um
   * `toContain` sobre uma cadeia de classes que calhe passar dá verde sem
   * provar nada — e foi exactamente assim que a coluna chegou ao ponto de ter
   * o activo igual ao hover sem nenhum teste dar por isso.
   */
  it("controlo negativo: a pastilha ANTIGA é reprovada por estas mesmas asserções", () => {
    const antigaActiva = "bg-[var(--bo-surface-hover)] text-[var(--bo-text)] font-medium";
    const antigoFilete =
      "pointer-events-none absolute left-1 top-0 w-[3px] rounded-full bg-[#4d6350]";

    // 1 · o par activo/hover antigo não tem acento nenhum…
    expect(antigaActiva).not.toContain("bg-[var(--bo-accent-ring)]");
    expect(antigaActiva).not.toContain("text-[var(--bo-accent)]");
    // 2 · …e partilha a lavagem do hover, que é a avaria.
    expect(antigaActiva).toMatch(/(^|\s)bg-\[var\(--bo-surface-hover\)\]/);
    // 3 · o filete antigo era um hex à mão, e do lado de fora da pastilha.
    expect(/pointer-events-none absolute [^`]*w-\[3px\][^`]*/.exec(antigoFilete)?.[0]).toContain(
      "#4d6350",
    );
    expect(/absolute (left-\d+) top-0 w-\[3px\]/.exec(antigoFilete)![1]).toBe("left-1");
    // 4 · e a bolha antiga não tinha transição.
    const antigaBolha =
      "ml-auto min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[10px] " +
      "font-semibold leading-none tabular-nums ";
    expect(antigaBolha).not.toContain("${ESTADO}");
  });
});
