// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import EventCosts from "./EventCosts";
import PaymentsPanel from "./PaymentsPanel";
import EventTasks from "./EventTasks";
import EventTimeline from "./EventTimeline";
import EventChecklist from "./EventChecklist";
import ProductionPlan from "./ProductionPlan";
import GuestList from "./GuestList";
import { CuradoriaDeFotos } from "./CuradoriaDeFotos";
import type { Quote } from "@/lib/orcamento/types";
import type { ThemeImage } from "@/lib/theme-types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS PAINÉIS DE UM EVENTO NUM TELEMÓVEL — 279 px, E NÃO 375
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Estes painéis não vivem no ecrã: vivem dentro de um cartão de ZONA do
 * dossier, que vive dentro de uma coluna. MEDIDO a 375 px de ecrã, o painel
 * tem **279 px** — e num iPad em retrato, a 768 px de ecrã, continua a ter os
 * mesmos 279. É por isso que o `sm:` lhes mente: dispara com a janela, e a
 * janela nunca foi a pergunta.
 *
 * ── A CONTA QUE MANDA NESTA FRENTE ────────────────────────────────────────
 *
 * O maior número que ela lança aqui tem seis algarismos. «202 889,00 €» pede
 * **109 px**. Dentro dos 279 do painel havia três molduras encaixadas — o
 * cartão de zona, o painel, e o quadradinho do número com o seu `p-3` —, e
 * duas colunas de quadradinhos deixavam **110 px** de conteúdo a cada um.
 * Um pixel de folga não é folga: bastava o rótulo ser mais largo do que o
 * número para o `<p>` centrado partir «202 889,00 €» em duas linhas.
 *
 * A correcção não é mais uma coluna, é uma moldura A MENOS: abaixo das 26 rem
 * de painel os quadrados perdem a borda própria e passam a linhas da mesma
 * caixa, separadas por um risco. 110 px passam a **255**. É o padrão que o
 * `Overview.tsx` (:1641) já tinha acertado para caixas dentro de caixas.
 *
 * ── PORQUE É QUE ESTE TESTE OLHA PARA CLASSES E NÃO PARA PÍXEIS ───────────
 *
 * O jsdom não faz layout nem avalia *container queries*: um `getBoundingClientRect`
 * daria 0×0 a tudo e o teste ficava verde por não saber medir. Os píxeis estão
 * medidos no navegador e escritos aqui em cima. O que se prende é a DECISÃO,
 * como fazem o `Overview.movel.test.tsx` e o `Conferencia.movel.test.tsx`.
 *
 * Para «o número não é cortado nem embrulha» isso chega, e chega de forma
 * exacta, porque a propriedade é composta por três classes verificáveis:
 *   · o valor tem `whitespace-nowrap` → não pode partir a meio;
 *   · a linha tem `flex-wrap` → se não couber ao lado do rótulo, desce
 *     inteiro para uma linha só dele, em vez de transbordar;
 *   · nem ele nem nenhum antepassado até ao painel tem `truncate`,
 *     `overflow-hidden` ou uma largura fixa → não pode ser cortado.
 */

const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");
const ler = (f: string) => readFileSync(join(RAIZ, f), "utf8");

/** O maior valor plausível deste back office, e o que fez a conta rebentar. */
const SEIS_ALGARISMOS = 202889;

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "q1",
    name: "Casamento Ana & Rui",
    email: "ana@exemplo.pt",
    ...over,
  }) as Quote;

function envolver(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

beforeEach(() => {
  __resetListCache?.();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]", { headers: { "content-type": "application/json" } })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * O elemento que mostra este valor, seja qual for a forma como o `Intl` decidiu
 * separar os milhares (espaço fino, espaço duro, ponto).
 */
function valorNoEcra(valor: number): HTMLElement {
  const alvo = new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(valor);
  const solto = (s: string) => s.replace(/\s/g, " ").trim();
  const achados = screen.getAllByText((_, no) => {
    if (!no || no.children.length > 0) return false;
    return solto(no.textContent ?? "") === solto(alvo);
  });
  return achados[0] as HTMLElement;
}

/**
 * Nada entre o número e o painel o pode cortar.
 *
 * Sobe pelos antepassados até ao `@container` (o painel) à procura das três
 * formas de um número desaparecer: `truncate` (que é `overflow-hidden` mais
 * reticências), `overflow-hidden` sozinho, e uma largura cravada.
 */
function nadaOCorta(no: HTMLElement) {
  let actual: HTMLElement | null = no;
  while (actual) {
    const c = actual.className || "";
    expect(c, `«${actual.tagName}» corta o número`).not.toMatch(/\btruncate\b/);
    expect(c, `«${actual.tagName}» corta o número`).not.toMatch(/\boverflow-hidden\b/);
    expect(c, `«${actual.tagName}» crava a largura do número`).not.toMatch(/\bw-\d/);
    if (c.includes("@container")) return;
    actual = actual.parentElement;
  }
  throw new Error("não se chegou ao painel — falta o `@container`");
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. O DINHEIRO — O QUE A MOLDURA A MAIS ESTAVA A IMPEDIR
   ═══════════════════════════════════════════════════════════════════════════ */

describe("um valor de seis algarismos dentro de um painel do dossier", () => {
  it("cabe nos custos do evento sem ser cortado nem embrulhar", () => {
    envolver(<EventCosts quote={pedido({ quotedPrice: SEIS_ALGARISMOS })} onChange={() => {}} />);

    const numero = valorNoEcra(SEIS_ALGARISMOS);
    // Não pode partir a meio: «202» numa linha e «889,00 €» na seguinte era o
    // que um `<p>` centrado fazia dentro de 110 px.
    expect(numero.className).toMatch(/\bwhitespace-nowrap\b/);
    // E se não couber ao lado do rótulo, desce inteiro em vez de transbordar.
    expect(numero.parentElement!.className).toMatch(/\bflex-wrap\b/);
    nadaOCorta(numero);
  });

  it("cabe no painel dos pagamentos sem ser cortado nem embrulhar", () => {
    envolver(
      <PaymentsPanel
        quote={pedido({
          priceBreakdown: { subtotal: 164950.41, iva: 37938.59, total: SEIS_ALGARISMOS },
          payments: [],
        } as unknown as Partial<Quote>)}
        onChange={() => {}}
      />,
    );

    const numero = valorNoEcra(SEIS_ALGARISMOS);
    expect(numero.className).toMatch(/\bwhitespace-nowrap\b/);
    expect(numero.parentElement!.className).toMatch(/\bflex-wrap\b/);
    nadaOCorta(numero);
  });
});

describe("o terceiro nível de moldura sai abaixo das 26 rem", () => {
  /**
   * A moldura sobe para o GRUPO e sai de cada quadrado — três caixas com ar
   * entre elas gastam três vezes a mesma margem, e aqui a margem é a que estava
   * a comer o número. A partir das 26 rem volta a grelha de três cartões,
   * exactamente como estava no computador.
   */
  const conferirGrupo = (grupo: HTMLElement) => {
    expect(grupo.className).toMatch(/\bdivide-y\b/);
    expect(grupo.className).toMatch(/(^|\s)border(\s|$)/);
    expect(grupo.className).toMatch(/@min-\[26rem\]:grid-cols-3/);
    expect(grupo.className).toMatch(/@min-\[26rem\]:divide-y-0/);
    expect(grupo.className).toMatch(/@min-\[26rem\]:border-0/);
    // O corte é do PAINEL e não da janela: num iPad a 768 px o `sm:` disparava
    // e o painel continuava com os mesmos 279.
    expect(grupo.className).not.toMatch(/\bsm:/);

    const quadrados = Array.from(grupo.children) as HTMLElement[];
    expect(quadrados).toHaveLength(3);
    for (const q of quadrados) {
      expect(q.className).not.toMatch(/(^|\s)border(\s|$)/);
      expect(q.className).toMatch(/@min-\[26rem\]:border\b/);
      expect(q.className).toMatch(/\bflex-wrap\b/);
    }
  };

  it("nos custos do evento", () => {
    envolver(<EventCosts quote={pedido({ quotedPrice: SEIS_ALGARISMOS })} onChange={() => {}} />);
    conferirGrupo(screen.getByText("Receita (s/ IVA)").closest("div")!.parentElement!);
  });

  it("no painel dos pagamentos, nas DUAS formas do «Em falta»", () => {
    // O terceiro quadrado tem duas formas — o valor em falta e o selo "Tudo
    // recebido". Uma só delas corrigida deixava metade dos eventos partidos.
    const comFalta = pedido({
      priceBreakdown: { subtotal: 1000, iva: 230, total: 1230 },
      payments: [],
    } as unknown as Partial<Quote>);
    const { unmount } = envolver(<PaymentsPanel quote={comFalta} onChange={() => {}} />);
    conferirGrupo(screen.getByText("Total (c/ IVA)").closest("div")!.parentElement!);
    unmount();

    const tudoPago = pedido({
      priceBreakdown: { subtotal: 1000, iva: 230, total: 1230 },
      payments: [{ id: "p1", kind: "saldo", amount: 1230, date: "2026-01-10", paid: true }],
    } as unknown as Partial<Quote>);
    envolver(<PaymentsPanel quote={tudoPago} onChange={() => {}} />);
    expect(screen.getByText("Tudo recebido")).toBeTruthy();
    conferirGrupo(screen.getByText("Total (c/ IVA)").closest("div")!.parentElement!);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. AS GRELHAS DE DUAS COLUNAS QUE NÃO TINHAM BASE
   ═══════════════════════════════════════════════════════════════════════════ */

describe("as grelhas de dois campos empilham por omissão", () => {
  /**
   * MEDIDO a 375 px: 279 px de painel, menos o `p-4` da caixa do formulário e o
   * intervalo, davam ~117 px por coluna. Um `input[type=date]` a 16 px — o piso
   * de `pointer: coarse`, que o CI trava — mostra «dd/mm/aaaa» mais o
   * calendário e não cabe nisso: a data saía da margem.
   */
  it("a Prioridade e a Data limite de uma tarefa nova", async () => {
    envolver(<EventTasks quote={pedido()} />);
    const abrir = screen.getAllByRole("button", { name: /Adicionar/ })[0];
    abrir.click();
    const grelha = (await screen.findByLabelText("Data limite")).closest("div.grid") as HTMLElement;
    expect(grelha.className).toMatch(/\bgrid-cols-1\b/);
    expect(grelha.className).toMatch(/@min-\[22rem\]:grid-cols-2/);
    // `grid-cols-2` sem prefixo nenhum é a base que não existia.
    expect(grelha.className).not.toMatch(/(^|\s)grid-cols-2(\s|$)/);
  });

  it("o Orçado e o Real de um fornecedor", () => {
    envolver(
      <EventCosts
        quote={pedido({
          quotedPrice: 5000,
          eventSuppliers: [
            { id: "f1", name: "Flores da Vila", category: "Floristas", estimatedCost: 400 },
          ],
        } as unknown as Partial<Quote>)}
        onChange={() => {}}
      />,
    );
    const grelha = screen.getByLabelText("Orçado (€)").closest("div.grid") as HTMLElement;
    expect(grelha.className).toMatch(/\bgrid-cols-1\b/);
    expect(grelha.className).toMatch(/@min-\[22rem\]:grid-cols-2/);
    expect(grelha.className).not.toMatch(/(^|\s)grid-cols-2(\s|$)/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. O `sm:` QUE MEDIA O ECRÃ DENTRO DE UM PAINEL DE 279 px
   ═══════════════════════════════════════════════════════════════════════════ */

describe("nenhum destes painéis pergunta pela JANELA quando a pergunta é do painel", () => {
  it("os quatro contadores de convidados", () => {
    envolver(<GuestList quote={pedido({ guests: 100 })} onChange={() => {}} />);
    const grelha = screen.getByText("Confirm.").closest("div")!.parentElement!;
    // A 768 px o `sm:grid-cols-4` disparava e dava 62 px de célula num painel
    // que continuava com 279 — e «Confirm.» já precisa de 60.
    expect(grelha.className).not.toMatch(/sm:grid-cols-4/);
    expect(grelha.className).toMatch(/@min-\[26rem\]:grid-cols-4/);
  });

  it("a linha de adicionar um convidado quebra sem ponto de corte nenhum", () => {
    envolver(<GuestList quote={pedido({ guests: 100 })} onChange={() => {}} />);
    const linha = screen.getByLabelText("Nome").closest("div")!.parentElement!;
    // `sm:flex-row` punha três campos e um botão numa linha de 279 px.
    expect(linha.className).not.toMatch(/sm:flex-row/);
    expect(linha.className).toMatch(/\bflex-wrap\b/);
    // E quem decide onde a linha quebra é a largura mínima de cada campo, não
    // um número escrito na janela.
    expect(screen.getByLabelText("Nome").closest("div")!.className).toMatch(/min-w-\[10rem\]/);
  });

  it("o nome e a categoria de um fornecedor novo", () => {
    // Ficheiro-fonte: o formulário só existe depois de um clique, e o que se
    // guarda aqui é que o `sm:` não voltou ao painel inteiro.
    expect(ler("EventCosts.tsx")).not.toMatch(/grid-cols-1 gap-3 sm:grid-cols-2/);
    expect(ler("EventCosts.tsx")).toMatch(/grid-cols-1 gap-3 @min-\[26rem\]:grid-cols-2/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   4. O ESPAÇO — OS TOKENS, EM VEZ DO NÚMERO OUTRA VEZ
   ═══════════════════════════════════════════════════════════════════════════ */

describe("os estados vazios lêem `--bo-p-vazio`", () => {
  /**
   * `py-10` eram 80 px de ar para dizer que não há nada — 12% de um iPhone SE,
   * iguais a 375 e a 1440. O `ui/EmptyState.tsx` já lia o token; era o
   * `className="px-4 py-10"` de cada chamador que o estava a desligar.
   */

  it("em todos os cinco painéis, sem um `py-10` a tapá-lo", () => {
    // A rede é de código-fonte porque são cinco chamadas ao mesmo componente e
    // o que não pode voltar é a CHAMADA, não o desenho de uma delas.
    for (const f of [
      "EventTasks.tsx",
      "EventCosts.tsx",
      "EventTimeline.tsx",
      "EventChecklist.tsx",
      "ProductionPlan.tsx",
    ]) {
      expect(ler(f), f).not.toMatch(/<EmptyState\s+className="px-4 py-10"/);
    }
  });

  it("e o vazio que chega ao ecrã traz mesmo o token", () => {
    // Os dois painéis que ela encontra vazios num evento novo.
    const { unmount } = envolver(<EventTimeline quote={pedido()} onChange={() => {}} />);
    const cronograma = screen.getByText("Timeline por preencher").parentElement!;
    expect(cronograma.className).toMatch(/py-\[var\(--bo-p-vazio\)\]/);
    expect(cronograma.className).not.toMatch(/\bpy-10\b/);
    unmount();

    envolver(<ProductionPlan quote={pedido()} />);
    const producao = screen.getByText("Plano de produção por gerar").parentElement!;
    expect(producao.className).toMatch(/py-\[var\(--bo-p-vazio\)\]/);
    expect(producao.className).not.toMatch(/\bpy-10\b/);
  });
});

describe("o separador de cada painel lê `--bo-p-vista`", () => {
  /**
   * `pt-6` eram 24 px de ar por cima do título, iguais a 375 e a 1440 — e na
   * mesma zona do dossier há vários painéis destes, cada um a pagar os seus.
   * O token dá 12 no telemóvel e mantém os 24 no computador.
   */
  const raizDe = (ui: React.ReactElement, titulo: string) => (
    envolver(ui),
    screen.getByText(titulo).closest("section,div")!.parentElement!
  );

  it("nos custos, no cronograma, na checklist, na produção e nos convidados", () => {
    for (const f of [
      "EventCosts.tsx",
      "EventTimeline.tsx",
      "EventChecklist.tsx",
      "ProductionPlan.tsx",
      "GuestList.tsx",
      "PaymentsPanel.tsx",
    ]) {
      const src = ler(f);
      // O risco deixou de ser `border-foreground/10` escrito à mão e passou a
      // pedir um degrau da escada da tinta — ver `escada-da-tinta.test.ts`. O
      // que este teste guarda continua a ser o mesmo: que o separador existe e
      // que o espaço por baixo dele vem do token da vista, e não de um 5 ou um
      // 6 escolhidos ali.
      const RISCO = "border-t border-\\[var\\(--bo-hairline-strong\\)\\]";
      expect(src, f).toMatch(new RegExp(`${RISCO} pt-\\[var\\(--bo-p-vista\\)\\]`));
      expect(src, f).not.toMatch(new RegExp(`${RISCO} pt-[56]\\b`));
    }
  });

  it("e chega ao ecrã", () => {
    const raiz = raizDe(
      <EventChecklist quote={pedido()} onChange={() => {}} />,
      "Checklist de Produção",
    );
    expect(raiz.className).toMatch(/pt-\[var\(--bo-p-vista\)\]/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   5. O ECRÃ DE DECIDIR FOTOS UMA A UMA
   ═══════════════════════════════════════════════════════════════════════════ */

const FOTOS: ThemeImage[] = Array.from({ length: 4 }, (_, i) => ({
  path: `t1/foto-${i + 1}.jpg`,
  url: `https://cdn.test/foto-${i + 1}.jpg`,
  thumbUrl: `https://cdn.test/mini-${i + 1}.jpg`,
}));

describe("a curadoria de fotos", () => {
  /**
   * MEDIDO a 320 px (o iPhone SE de origem, e o mais estreito que ela usa): a
   * fila de cima pede 252 px — «12 de 37» são 56, «↩ Anular» 76, «Ver em
   * grelha» 104, mais os intervalos — e a de baixo pede 310. O conteúdo tem
   * 280. `justify-between` não quebra: empurra cada um para o seu extremo e,
   * quando deixam de caber, o de baixo sai da margem. Sem ponto de corte
   * nenhum: `flex-wrap` deixa a fila em linha onde cabe e desce onde não cabe.
   */
  const desenhar = () =>
    render(
      <CuradoriaDeFotos
        images={FOTOS}
        escolhidas={new Set()}
        usadas={new Set()}
        podeEscolherMais
        aoDecidir={() => {}}
        aoVerGrande={() => {}}
        aoSair={() => {}}
      />,
    );

  it("o cabeçalho do progresso quebra em vez de sair da margem", () => {
    desenhar();
    const linha = screen.getByText("1 de 4").parentElement!;
    expect(linha.className).toMatch(/\bjustify-between\b/);
    expect(linha.className).toMatch(/\bflex-wrap\b/);
    // E o par de botões que vive lá dentro quebra pela mesma razão.
    expect(within(linha).getByRole("button", { name: /Anular/ }).parentElement!.className).toMatch(
      /\bflex-wrap\b/,
    );
  });

  it("a linha que decide a foto também", () => {
    desenhar();
    // «Incluir →» é o botão que decide, e era o que saía da margem.
    const linha = screen.getByRole("button", { name: /Incluir/ }).parentElement!;
    expect(linha.className).toMatch(/\bflex-wrap\b/);
  });
});
