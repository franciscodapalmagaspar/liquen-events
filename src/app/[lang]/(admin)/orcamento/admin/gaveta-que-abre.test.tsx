// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import Overview from "./Overview";
import { __resetListCache } from "./useCachedList";
import { BLOCO_DA_GAVETA, CORPO_DA_GAVETA, SETA_DA_GAVETA, useGaveta } from "./ui/gaveta";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA GAVETA, SETE SÍTIOS — e um teste que fica vermelho se um deles divergir
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O levantamento contou `<details>` nativos espalhados pelo back office, todos
 * com o corpo a aparecer e a desaparecer sem transição nenhuma. A correcção não
 * é animar sete vezes: é escrever a palavra uma vez (`ui/gaveta.ts`) e aplicá-la.
 *
 * Sete sítios a decidir cada um por si voltam a divergir — já aconteceu nesta
 * casa com a leitura da preferência de movimento, que chegou a ter duas cópias
 * diferentes uma da outra, e com as setas destes mesmos `<details>`, em que três
 * escolheram 200 ms e as outras ficaram nos 150 ms de omissão do Tailwind.
 *
 * É por isso que a maior parte deste ficheiro é uma VARREDURA à fonte e não sete
 * casos de montagem: o que se quer prender não é o comportamento de um sítio, é
 * a impossibilidade de um oitavo nascer sem a palavra.
 */

const RAIZ = "src/app/[lang]/(admin)/orcamento/admin/";
// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const CSS = readFileSync("src/app/globals.css", "utf8") + readFileSync("src/app/admin.css", "utf8");

/**
 * Os seis `<details>` destes seis ficheiros, e quantos há em cada um.
 *
 * Eram sete. O do `Tarefas.tsx` era o «Detalhes (opcional)» de uma tarefa nova
 * — responsável, área, prioridade e prazo — e saiu porque ela o mandou sair:
 * «retira isto do opcional, quero que apareça logo». A gaveta desapareceu, os
 * campos ficaram. Não é uma gaveta a deixar de cumprir o contrato desta lista:
 * é uma gaveta a deixar de existir.
 */
const SITIOS: [ficheiro: string, quantos: number][] = [
  ["Overview.tsx", 1], // «Mais do painel» — o único com o corpo em vários blocos
  ["StatsDashboard.tsx", 1], // a `Section`, usada sete vezes na vista
  ["ServicesEditor.tsx", 1], // «Atalhos de teclado»
  ["EmailDoEnvio.tsx", 1], // «Ver como o cliente o recebe»
  ["FechosMeta.tsx", 1], // «ver o que ficou de fora»
  ["AdminLogin.tsx", 1], // «Mudaste de telemóvel ou de computador?»
];

/**
 * Os três que ficam de fora, e porquê: vivem em ficheiros que não se mexem
 * daqui. Estão escritos para que a lista de cima se leia como uma ESCOLHA e não
 * como um censo distraído — e para que, no dia em que forem adoptados, se saiba
 * onde estavam.
 */
const FORA_DE_ALCANCE = ["AdminClient.tsx (×2)", "ProposalStudio.tsx (×1)"];

function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

const fonte = (f: string) => semComentarios(readFileSync(RAIZ + f, "utf8"));
const quantas = (s: string, agulha: string) => s.split(agulha).length - 1;

describe("a varredura dos sete sítios", () => {
  it("cada `<details>` traz a palavra da casa — um oitavo sem ela chumba aqui", () => {
    const faltam: string[] = [];
    for (const [ficheiro, quantos] of SITIOS) {
      const src = fonte(ficheiro);
      const detalhes = quantas(src, "<details");
      if (detalhes !== quantos) {
        faltam.push(`${ficheiro}: ${detalhes} <details>, esperavam-se ${quantos}`);
        continue;
      }
      if (!src.includes('from "./ui/gaveta"')) {
        faltam.push(`${ficheiro}: não importa a gaveta`);
        continue;
      }
      if (quantas(src, "useGaveta(") !== quantos) {
        faltam.push(
          `${ficheiro}: ${quantas(src, "useGaveta(")} useGaveta() para ${quantos} gavetas`,
        );
      }
      if (quantas(src, "aoTocarNoResumo") !== quantos) {
        faltam.push(`${ficheiro}: o resumo não arma a abertura`);
      }
      if (quantas(src, "aoAlternar") !== quantos) {
        faltam.push(`${ficheiro}: o fecho não desarma a abertura`);
      }
      if (!src.includes("gaveta.corpo") && !src.includes("gaveta.bloco(")) {
        faltam.push(`${ficheiro}: o corpo não leva classe nenhuma`);
      }
    }
    expect(faltam, `gavetas sem a palavra da casa (fora de alcance: ${FORA_DE_ALCANCE})`).toEqual(
      [],
    );
  });

  it("nenhuma seta volta a escolher a sua própria duração", () => {
    // A divergência que se quer impedir, pelo nome: uma transição escrita à mão
    // ao lado de uma rotação. Ou passa pela `SETA_DA_GAVETA`, ou não passa.
    const teimosas: string[] = [];
    for (const [ficheiro] of SITIOS) {
      const src = fonte(ficheiro);
      for (const proibida of ["transition-transform", "transition-[transform]"]) {
        if (src.includes(proibida)) teimosas.push(`${ficheiro}: ${proibida}`);
      }
      // Toda a seta que roda com o `open` do pai vai buscar a duração à peça.
      const rodam = quantas(src, "group-open:rotate");
      if (rodam > quantas(src, "SETA_DA_GAVETA")) {
        teimosas.push(`${ficheiro}: ${rodam} setas a rodar sem a SETA_DA_GAVETA`);
      }
    }
    expect(teimosas).toEqual([]);
  });

  it("a seta anda aos 200 ms da casa, e roda a propriedade que muda", () => {
    // No Tailwind v4 a classe `rotate-*` emite a propriedade AUTÓNOMA `rotate`,
    // e não um `transform`. Lista-se pelo nome.
    expect(SETA_DA_GAVETA).toContain("motion-safe:transition-[rotate]");
    expect(SETA_DA_GAVETA).toContain("motion-safe:duration-200");
    expect(SETA_DA_GAVETA).toContain("ease-[cubic-bezier(0,0,0.2,1)]");
    // E os 200 ms não são um número novo: é o que a `.bo-mais-seta` do
    // `globals.css` já tinha escolhido para esta mesma seta. Se um dos dois
    // lados mudar, isto fica vermelho em vez de os deixar a discordar calados.
    expect(semComentarios(CSS)).toMatch(
      /\.bo-mais-seta\s*\{\s*transition:\s*transform 200ms cubic-bezier\(0, 0, 0\.2, 1\)/,
    );
  });

  it("as duas palavras são as da casa, e nenhuma anima altura", () => {
    const css = semComentarios(CSS);
    expect(CORPO_DA_GAVETA).toBe("bo-entrada");
    expect(BLOCO_DA_GAVETA).toBe("bo-cena");
    // Só `transform` e `opacity` nas duas — um `height` aqui remedia a página a
    // cada fotograma, que é o que um `<details>` a abrir mais convida a fazer.
    for (const nome of ["bo-entrada", "bo-cena"]) {
      const i = css.indexOf(`@keyframes ${nome}`);
      expect(i, `os fotogramas da .${nome} desapareceram`).toBeGreaterThan(-1);
      const corpo = css.slice(i, css.indexOf("}", css.indexOf("to {", i)) + 2);
      expect(corpo, `a .${nome} passou a animar layout`).not.toMatch(
        /\b(height|max-height|padding|margin)\s*:/,
      );
    }
    // A escada tem tecto: sem o `min()`, nove blocos davam 630 ms do primeiro ao
    // último. Com ele, cem milissegundos.
    expect(css).toMatch(/min\(var\(--cena, 0\), var\(--bo-degraus-max\)\)/);
  });

  it("a recusa da entrada tem distância de RÓTULO, e a legenda da nota não tem nenhuma", () => {
    /**
     * As duas mensagens de `role="alert"` que o levantamento apontou, e as duas
     * decisões — que são diferentes de propósito.
     *
     * `AdminLogin`: a recusa nasce colada ao campo que a provocou, uma vez por
     * tentativa. Entra com a `.bo-entrada` — quatro píxeis, distância de rótulo.
     * Oito são a distância de um AVISO, de uma coisa que vem de fora da página,
     * e esta não vem: sai de debaixo do campo.
     *
     * `Overview`: a legenda de estado de uma nota que está a ser ESCRITA, com
     * gravação automática. Cada tentativa falhada repõe o mesmo ramo, e uma
     * entrada a cada passagem é um pisca-pisca por cima do texto dela. Não
     * anima — e esta linha existe para que isso continue a ser uma decisão
     * escrita e não um esquecimento que alguém «corrige».
     */
    expect(fonte("AdminLogin.tsx")).toMatch(/className=\{`bo-entrada flex items-start/);
    const overview = fonte("Overview.tsx");
    const i = overview.indexOf('<span role="alert"');
    expect(i, "a legenda de estado da nota mudou de forma").toBeGreaterThan(-1);
    expect(
      overview.slice(i, overview.indexOf(">", i)),
      "a legenda da nota da equipa passou a animar a cada gravação falhada",
    ).not.toContain("bo-entrada");
  });
});

/**
 * O CONTRATO DA PEÇA — o que ela promete a quem a usa.
 *
 * Uma gaveta de mentira, com o mesmo esqueleto dos sete verdadeiros. Serve para
 * pôr à prova a regra que os sete partilham e que nenhum deles pode verificar
 * sozinho: **só anima o que ela abriu, com o gesto, agora.**
 */
function GavetaDeProva({ aberta = false }: { aberta?: boolean }) {
  const gaveta = useGaveta();
  return (
    <details open={aberta} onToggle={gaveta.aoAlternar} data-testid="gaveta">
      <summary onClick={gaveta.aoTocarNoResumo}>Abrir</summary>
      <div data-testid="corpo" className={gaveta.corpo}>
        o que lá está dentro
      </div>
    </details>
  );
}

const corpo = () => screen.getByTestId("corpo");

describe("o contrato da gaveta", () => {
  afterEach(cleanup);

  it("fechada, o corpo não tem classe nenhuma — mas está no DOM", () => {
    render(<GavetaDeProva />);
    expect(corpo().className).toBe("");
    // O ⌘F do browser tem de o encontrar fechado. É a razão de o elemento ser
    // nativo, e nenhuma animação a pode desfazer.
    expect(corpo().textContent).toContain("o que lá está dentro");
  });

  it("aberta pelo gesto, o corpo entra", () => {
    render(<GavetaDeProva />);
    fireEvent.click(screen.getByText("Abrir"));
    expect(corpo().className).toContain(CORPO_DA_GAVETA);
  });

  it("nascida aberta, NÃO entra — não houve gesto nenhum", () => {
    // É o caso das secções das Estatísticas (`open={defaultOpen}`), numa vista
    // que já traz a sua própria cascata. Uma entrada à montagem batia de frente
    // com ela.
    render(<GavetaDeProva aberta />);
    expect(corpo().className).toBe("");
  });

  it("e uma gaveta com `open` escrito continua a fechar quando ela a fecha", () => {
    // A peça re-desenha o componente a cada gesto, e o `open` destas gavetas é
    // uma PROP. Se o React voltasse a escrevê-la a cada desenho, fechá-la
    // deixava de funcionar — a gaveta abria-se sozinha outra vez, e ninguém
    // ligaria isso a uma animação. Fica preso aqui.
    render(<GavetaDeProva aberta />);
    const detalhe = screen.getByTestId("gaveta") as HTMLDetailsElement;
    expect(detalhe.open).toBe(true);
    fireEvent.click(screen.getByText("Abrir"));
    expect(detalhe.open, "a gaveta com `open` escrito voltou a abrir-se sozinha").toBe(false);
    expect(corpo().className).toBe("");
  });

  it("fecha e reabre, e entra outra vez", () => {
    // Uma classe pendurada depois do primeiro gesto só animava uma vez.
    render(<GavetaDeProva />);
    const resumo = screen.getByText("Abrir");
    fireEvent.click(resumo);
    expect(corpo().className).toContain(CORPO_DA_GAVETA);
    fireEvent.click(resumo);
    expect(corpo().className).toBe("");
    fireEvent.click(resumo);
    expect(corpo().className).toContain(CORPO_DA_GAVETA);
  });

  it("o gesto marca ANTES de o browser abrir", () => {
    // A ordem é a peça toda: o comportamento por omissão de um clique corre
    // depois dos ouvintes, portanto a classe já lá está quando o corpo é
    // mostrado. Ao contrário, havia um fotograma pintado no sítio final.
    const ordem: string[] = [];
    function Sonda() {
      const gaveta = useGaveta();
      return (
        <details
          onToggle={(e) => {
            ordem.push(`toggle:${e.currentTarget.open}`);
            gaveta.aoAlternar(e);
          }}
        >
          <summary
            onClick={(e) => {
              ordem.push(`clique:aberto=${e.currentTarget.closest("details")!.open}`);
              gaveta.aoTocarNoResumo(e);
            }}
          >
            Abrir
          </summary>
          <div className={gaveta.corpo} />
        </details>
      );
    }
    render(<Sonda />);
    fireEvent.click(screen.getByText("Abrir"));
    expect(ordem[0]).toBe("clique:aberto=false");
  });
});

/**
 * O ÚNICO CORPO COM VÁRIOS BLOCOS — «Mais do painel», na Visão Geral.
 *
 * Nove blocos a aparecer de uma vez é literalmente o caso para que a `.bo-cena`
 * foi escrita. As duas coisas que este bloco de casos prende:
 *
 *   · a escada é POR BLOCO, com o `--cena` escrito em cada um. Uma `.bo-cena`
 *     sem `--cena` lê zero e a escada desaparece;
 *   · e não corre à chegada. Esta gaveta é reaberta por um efeito que lê o
 *     `localStorage` — sem esta regra, quem a deixou aberta apanhava, todas as
 *     manhãs, os blocos de dentro a entrar por cima dos quatro da vista, que já
 *     têm a sua própria cascata.
 */
const HOJE = new Date("2026-08-14T09:00:00.000Z");

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "q1",
    submittedAt: "2026-07-01T10:00:00.000Z",
    status: "cotado",
    name: "Ana e Rui",
    email: "ana@exemplo.pt",
    category: "particulares",
    eventType: "casamentos",
    guests: 100,
    ...over,
  }) as Quote;

function desenharVisaoGeral() {
  return render(
    <Overview
      quotes={[pedido(), pedido({ id: "q2", status: "aceite", quotedPrice: 5000 })]}
      userName="Catarina"
      onOpen={vi.fn()}
      onGoStats={vi.fn()}
      onGo={vi.fn()}
      onNew={vi.fn()}
    />,
  );
}

const gavetaDoPainel = () => document.querySelector("details.bo-mais") as HTMLDetailsElement;
const blocosDaGaveta = () =>
  Array.from(gavetaDoPainel().querySelectorAll<HTMLElement>(`.${BLOCO_DA_GAVETA}`));

describe("a cascata do «Mais do painel»", () => {
  beforeEach(() => {
    __resetListCache?.();
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(HOJE);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("[]", { headers: { "content-type": "application/json" } })),
    );
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fechada, não há cascata nenhuma lá dentro", () => {
    desenharVisaoGeral();
    expect(blocosDaGaveta()).toEqual([]);
  });

  it("restaurada aberta do armazenamento, TAMBÉM não — não houve gesto", () => {
    localStorage.setItem("liquen-visao-geral-mais", "1");
    desenharVisaoGeral();
    expect(gavetaDoPainel().open).toBe(true);
    expect(blocosDaGaveta(), "a gaveta restaurada anima por cima da cascata da vista").toEqual([]);
  });

  it("aberta pelo gesto, cada bloco tem a SUA vez — e nenhuma se repete", () => {
    desenharVisaoGeral();
    fireEvent.click(gavetaDoPainel().querySelector("summary")!);
    const blocos = blocosDaGaveta();
    expect(blocos.length, "os blocos da gaveta não entram").toBeGreaterThanOrEqual(4);
    const ordens = blocos.map((b) => b.style.getPropertyValue("--cena"));
    expect(
      ordens.every((o) => /^\d+$/.test(o)),
      `um bloco sem degrau: ${ordens}`,
    ).toBe(true);
    expect(
      ordens.length - new Set(ordens).size,
      `blocos a partilhar a mesma vez: ${ordens.join(", ")}`,
    ).toBe(0);
    expect(Math.min(...ordens.map(Number))).toBe(0);
  });

  it("a escada é por BLOCO e nunca por linha", () => {
    // Uma cascata que anima os filhos de um bloco não é uma cascata, é um
    // tremor — e uma coluna de números entra num degrau só, inteira. O que se
    // exige é que nenhum bloco da cascata esteja dentro de outro.
    desenharVisaoGeral();
    fireEvent.click(gavetaDoPainel().querySelector("summary")!);
    const blocos = blocosDaGaveta();
    const aninhados = blocos.filter((b) => blocos.some((o) => o !== b && o.contains(b)));
    expect(aninhados.map((b) => b.className)).toEqual([]);
  });

  it("abrir não remonta o que lá está dentro", () => {
    // `key` remonta, e vários destes blocos guardam campos por gravar — as notas
    // da equipa, por exemplo. A cascata entra por classe e por `style`, nunca
    // por identidade.
    desenharVisaoGeral();
    const antes = gavetaDoPainel().querySelectorAll("h3").length;
    const nos = Array.from(gavetaDoPainel().querySelectorAll("h3"));
    fireEvent.click(gavetaDoPainel().querySelector("summary")!);
    const depois = Array.from(gavetaDoPainel().querySelectorAll("h3"));
    expect(depois.length).toBe(antes);
    expect(
      depois.every((n, i) => n === nos[i]),
      "os blocos foram remontados ao abrir",
    ).toBe(true);
  });
});
