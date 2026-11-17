import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CHÃO DO ESPAÇO NO TELEMÓVEL — UMA MEDIDA, UM TOKEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A casa já tinha uma escala de LETRA nomeada em `globals.css`
 * (`--bo-fs-caption/label/body/lead/title`) e uma medida sozinha num token com
 * teste próprio (`--bo-barra-inferior`, ver `barra-inferior.test.tsx`). O que
 * não tinha era uma escala de ESPAÇO — e sem ela cada ecrã escrevia a sua:
 * `py-6` no invólucro das vistas, `gap-8` na grelha dos pedidos, `p-5` num
 * cartão, `p-6` noutro, `py-16` num estado vazio. Todos com o MESMO valor a
 * 375 px e a 1440 px.
 *
 * MEDIDO a 375×667, na lista de pedidos: o cabeçalho fixo (65 px) e a barra de
 * baixo (72) levam 137 do ecrã antes de qualquer conteúdo. O que sobra não tem
 * como pagar 24 px de respiro por cima dos controlos, 20 de margem por baixo de
 * cada fila de filtros e 20 dentro de cada cartão — números desenhados num
 * monitor de 1440 e servidos tal e qual ao telemóvel.
 *
 * ── O QUE ESTE TESTE GUARDA ──────────────────────────────────────────────
 *
 * Três coisas, e nenhuma delas é «o valor certo é X»:
 *
 *   1. a medida está declarada UMA vez, apertada, e realargada UMA vez a
 *      partir de 640 — mobile-first, para que um ecrã novo herde o degrau
 *      apertado sem o pedir;
 *   2. quem precisa dela LÊ o token, em vez de o copiar;
 *   3. ninguém volta a escrever o número à mão — nem em píxeis (`p-[14px]`),
 *      nem na grafia equivalente do Tailwind (`p-3.5 sm:p-6`), que é a forma
 *      como uma cópia costuma reaparecer: não como o mesmo texto, como o mesmo
 *      NÚMERO com outro nome.
 *
 * É a lição do `barra-inferior.test.tsx`: uma constante duplicada não se guarda
 * com uma lista de sítios conhecidos, guarda-se procurando em todos.
 */

const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");
const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

const ler = (f: string) => readFileSync(join(RAIZ, f), "utf8");

/**
 * Os quatro degraus, com o que cada um mede de um lado e do outro dos 640 px.
 * As grafias são as do Tailwind para os mesmos píxeis — é o que um `sed`
 * distraído escreveria se voltasse a espalhar a medida pelos ecrãs.
 */
const ESCALA = [
  { token: "--bo-p-vista", movel: 0.75, largo: 1.5, copias: ["3", "6"] },
  { token: "--bo-gap-vista", movel: 1.25, largo: 1.75, copias: ["5", "7"] },
  { token: "--bo-p-cartao", movel: 0.875, largo: 1.5, copias: ["3.5", "6"] },
  { token: "--bo-p-vazio", movel: 2, largo: 4, copias: ["8", "16"] },
] as const;

/** Todos os `.tsx` do back office, incluindo os primitivos de `ui/`. */
function ficheirosDoBackOffice(dir = RAIZ, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) ficheirosDoBackOffice(p, acc);
    else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) acc.push(p);
  }
  return acc;
}

describe("a escala do espaço do back office", () => {
  it("existe, e diz porque existe", () => {
    expect(CSS).toContain("A ESCALA DO ESPAÇO DO BACK OFFICE");
  });

  for (const { token, movel, largo } of ESCALA) {
    describe(token, () => {
      const declaracoes = [...CSS.matchAll(new RegExp(`${token}:\\s*([\\d.]+)rem`, "g"))];

      it("declara-se exactamente duas vezes: o degrau apertado e o largo", () => {
        expect(declaracoes.map((m) => m[1])).toHaveLength(2);
      });

      it("serve o valor APERTADO por omissão e o largo só a partir de 640", () => {
        // Mobile-first: quem não pergunta nada recebe o telemóvel.
        expect(Number(declaracoes[0][1])).toBe(movel);
        expect(Number(declaracoes[1][1])).toBe(largo);
        expect(Number(declaracoes[0][1])).toBeLessThan(Number(declaracoes[1][1]));
      });

      it("realarga-se no corte da casa, e não num ponto inventado", () => {
        // Só existem `sm` (640) e `lg` (1024) neste back office — está escrito
        // e justificado em `ui/adaptativo.ts`. Entre a declaração apertada e a
        // larga só pode estar a abertura de UM `@media`, e é o dos 640.
        const entre = CSS.slice(declaracoes[0].index!, declaracoes[1].index!);
        const medias = entre.match(/@media[^{]+/g) ?? [];
        expect(medias).toHaveLength(1);
        expect(medias[0]).toMatch(/min-width:\s*640px/);
      });

      it("não se mete no que o dedo trava", () => {
        // Os 44 px do toque e os 16 px dos campos vivem em `(pointer: coarse)`
        // e são um passo bloqueante do CI. A densidade vem de espaço, letra e
        // molduras — a escala do espaço não tem nada que fazer lá dentro.
        const entre = CSS.slice(declaracoes[0].index!, declaracoes[1].index!);
        expect(entre).not.toContain("pointer: coarse");
      });
    });
  }

  it("está em `:root` e não em `body.admin-mode`, por causa do esqueleto", () => {
    // `admin-mode` só entra num `useEffect`, e o `loading.tsx` é um componente
    // de SERVIDOR que nunca chega a tê-la: um token de layout preso a essa
    // classe daria espaço zero no primeiro ecrã da espera, sempre. O mesmo
    // salto que o `-mt-24` do `AdminClient` existe para não deixar acontecer.
    const i = CSS.indexOf("A ESCALA DO ESPAÇO DO BACK OFFICE");
    expect(i).toBeGreaterThan(-1);
    // Só o SELECTOR: o comentário acima explica esta escolha por extenso e
    // nomeia lá dentro a classe que a regra não pode ter.
    const declaracao = semComentarios(
      CSS.slice(CSS.lastIndexOf("/*", i), CSS.indexOf("--bo-p-vista:", i)),
    );
    expect(declaracao).toMatch(/:root\s*\{/);
    expect(declaracao).not.toContain("admin-mode");
  });
});

describe("quem precisa da medida lê o token", () => {
  it("o invólucro de todas as vistas", () => {
    const admin = ler("AdminClient.tsx");
    expect(admin).toMatch(/const VIEW_WRAP =[\s\S]{0,200}py-\[var\(--bo-p-vista\)\]/);
  });

  it("o cartão, que é o degrau que apanha quinze ecrãs de uma vez", () => {
    expect(ler("ui/Card.tsx")).toContain("p-[var(--bo-p-cartao)]");
  });

  it("os DOIS estados vazios do back office", () => {
    // São dois componentes diferentes com o mesmo desenho — um em `ui/`, outro
    // à solta na raiz (ver `densidade.test.tsx`). Enquanto forem dois, têm pelo
    // menos de medir o mesmo.
    expect(ler("ui/EmptyState.tsx")).toContain("py-[var(--bo-p-vazio)]");
    expect(ler("EmptyState.tsx")).toContain("py-[var(--bo-p-vazio)]");
  });

  it("o esqueleto e o conteúdo lêem O MESMO token para o mesmo espaço", () => {
    // Um esqueleto mais folgado do que aquilo que substitui empurra as
    // silhuetas para baixo, e tudo sobe de uma vez quando o conteúdo chega —
    // um salto no instante exacto em que ela já está a olhar.
    for (const f of ["Skeleton.tsx", "loading.tsx", "AdminClient.tsx"]) {
      expect(ler(f), f).toContain("gap-[var(--bo-gap-vista)]");
    }
    expect(ler("loading.tsx")).toContain("py-[var(--bo-p-vista)]");
  });
});

describe("ninguém volta a cravar a medida à mão", () => {
  const ficheiros = ficheirosDoBackOffice();

  it("varre ficheiros a sério (a rede não pode estar vazia)", () => {
    expect(ficheiros.length).toBeGreaterThan(30);
  });

  it("nem em píxeis soltos", () => {
    // `p-[12px]`, `gap-[20px]`, `py-[64px]`… — a medida remontada por fora do
    // token, que é como ela se descolou da primeira vez.
    const px = ESCALA.flatMap(({ movel, largo }) => [movel * 16, largo * 16]);
    const regra = new RegExp(`\\b[pmg][a-z]*-\\[(${px.join("|")})px\\]`);
    const reincidentes = ficheiros.filter((f) =>
      regra.test(semComentarios(readFileSync(f, "utf8"))),
    );
    expect(reincidentes.map(curto), "medida em píxeis soltos").toEqual([]);
  });

  it("nem na grafia equivalente do Tailwind", () => {
    // A cópia não reaparece como o mesmo texto: reaparece como o mesmo NÚMERO
    // com outro nome. `p-3.5 sm:p-6` são exactamente os 14/24 do
    // `--bo-p-cartao`, escritos à mão.
    const reincidentes: string[] = [];
    for (const f of ficheiros) {
      const src = semComentarios(readFileSync(f, "utf8"));
      for (const { copias } of ESCALA) {
        const [movel, largo] = copias;
        const regra = new RegExp(
          `\\b(p|px|py|pt|pb|gap|gap-x|gap-y)-${escapar(movel)}\\s+sm:\\1-${escapar(largo)}\\b`,
        );
        if (regra.test(src)) reincidentes.push(curto(f));
      }
    }
    expect([...new Set(reincidentes)], "escala do espaço reescrita à mão").toEqual([]);
  });

  it("e a receita antiga do invólucro não volta a aparecer em vista nenhuma", () => {
    // `py-6 lg:py-10` era o ritmo do `VIEW_WRAP`, copiado passava a ser uma
    // segunda opinião sobre o mesmo espaço.
    const reincidentes = ficheiros.filter((f) =>
      /py-6\s+lg:py-10/.test(semComentarios(readFileSync(f, "utf8"))),
    );
    expect(reincidentes.map(curto)).toEqual([]);
  });
});

/** Os comentários deste repositório contam a história e citam os números. */
function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const curto = (f: string) => f.slice(RAIZ.length + 1);
const escapar = (v: string) => v.replace(".", "\\.");
