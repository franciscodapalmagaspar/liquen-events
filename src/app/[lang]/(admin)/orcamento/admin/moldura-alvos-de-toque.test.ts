import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A MOLDURA AO TOQUE — os alvos que ficaram por baixo dos 44 px
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Os ecrãs do back office já foram medidos um a um. Isto guarda o que os
 * envolve: o cabeçalho, o dossier do evento e os diálogos — e, dentro deles,
 * os alvos que só encolhem NO TELEMÓVEL, que é precisamente por isso que
 * escaparam a quem os desenhou num portátil.
 *
 * ── O padrão que se repete em todos, e que é a razão de este ficheiro existir
 * Quase todos estes botões escondem o rótulo em ecrã pequeno (`hidden
 * sm:inline`). No portátil são «Imprimir Dossier», com texto e 130 px de
 * largura; no telemóvel são um ícone de 14 px dentro de `px-3`, e medem 38.
 * A altura estava tratada — o `ui/Button.tsx` dá `pointer-coarse:h-11` aos
 * tamanhos `sm` e `md` — mas a LARGURA não, e ninguém a mede num ecrã largo
 * porque num ecrã largo o rótulo ainda lá está a segurá-la.
 *
 * Medidos a 375×667 com `(pointer: coarse)`, antes:
 *   · «Copiar link do portal», «Imprimir Dossier», «Timeline» e «.ics»
 *     — 38×44 cada, e a 6 px uns dos outros;
 *   · «Abrir portal» — 38×32, a mais pequena da barra;
 *   · «Criar proposta» (a próxima acção) — 148×40;
 *   · o link de voltar aos «Pedidos» — 65×16, e é a ÚNICA saída do dossier:
 *     essa rota não monta barra de baixo nem gaveta;
 *   · email 301×16, telefone 63×16, WhatsApp 76×19 — os três contactos, que
 *     são links `mailto:`/`tel:`/WhatsApp, ou seja os alvos deste ecrã que
 *     MAIS pertencem a um telemóvel;
 *   · o × das passkeys e o × do repor cópia — 12×18 cada;
 *   · o × do painel do «Guardar tudo» — 32×32, e é o único alvo do painel;
 *   · o sino das notificações — 41×44.
 *
 * ── Porque é que isto se lê no código e não no browser ────────────────────
 * O jsdom não faz layout: `getBoundingClientRect` devolve zeros e uma consulta
 * de media nunca é `(pointer: coarse)`. Um teste que aqui medisse píxeis estava
 * a medir zero e a passar sempre. Quem mede a sério é o `admin-mobile.spec.ts`,
 * num browser verdadeiro. O que este ficheiro guarda é a CAUSA: que a classe
 * que põe o chão de 44 px continue escrita onde tem de estar. É o mesmo molde
 * do `barra-inferior.test.tsx`.
 */

const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");
const ler = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");

const CABECALHO = ler("evento", "[id]", "DossierHeader.tsx");
const LATERAL = ler("evento", "[id]", "DossierAside.tsx");
const PASSKEYS = ler("PasskeysDialog.tsx");
const REPOR = ler("RestoreDialog.tsx");
const GUARDAR = ler("GuardarTudo.tsx");
const SINO = ler("NotificationBell.tsx");
const FOLHA = ler("ui", "FolhaOuDialogo.tsx");

/**
 * A ETIQUETA DE ABERTURA INTEIRA do controlo que contém uma dada âncora.
 *
 * Tem de ir para a frente e para trás, e a primeira versão só ia para trás —
 * o que a fazia falhar em metade dos casos por uma razão parva: em JSX o
 * `className` tanto pode vir antes da âncora (`aria-label="Fechar"`) como
 * depois dela (`onClick={copyPortalLink}`), e um bloco que acaba na âncora
 * perde o atributo justamente quando ele está a seguir.
 *
 * O fim da etiqueta é o primeiro `>` que não esteja dentro de `{…}` — em JSX
 * os atributos trazem chavetas com `>` lá dentro (`{() => …}`), e parar no
 * primeiro `>` cortava a etiqueta ao meio.
 */
function blocoQueContem(fonte: string, ancora: string): string {
  const i = fonte.indexOf(ancora);
  expect(i, `âncora não encontrada: ${ancora}`).toBeGreaterThan(-1);
  const inicio = Math.max(
    fonte.lastIndexOf("<Button", i),
    fonte.lastIndexOf("<button", i),
    fonte.lastIndexOf("<a\n", i),
    fonte.lastIndexOf("<Link", i),
  );
  expect(inicio, `sem etiqueta de abertura antes de: ${ancora}`).toBeGreaterThan(-1);
  let profundidade = 0;
  for (let j = inicio; j < fonte.length; j += 1) {
    const c = fonte[j];
    if (c === "{") profundidade += 1;
    else if (c === "}") profundidade -= 1;
    else if (c === ">" && profundidade === 0 && j > i) return fonte.slice(inicio, j + 1);
  }
  return fonte.slice(inicio);
}

describe("o dossier do evento, ao dedo", () => {
  /**
   * As ferramentas da barra. Todas IMPRIMEM ou descarregam: falhar o toque não
   * custa um toque repetido, custa um dossier na impressora. (O «Copiar link do
   * portal» e o «Abrir portal» saíram com o portal — achado n.º 37.)
   */
  it.each([
    ["onClick={() => printEventDossier(quote)}", "imprimir o dossier"],
    ["onClick={() => printRunSheet(quote)}", "a timeline"],
    ["onClick={() => downloadEventIcs(quote)}", "o .ics"],
  ])("dá 44 px de largura a %s (%s)", (accao) => {
    expect(blocoQueContem(CABECALHO, accao)).toContain("alvo-toque");
  });

  it("separa os alvos da barra em 8 px, e não nos 6 que tinha", () => {
    expect(CABECALHO).toContain("gap-1.5 pointer-coarse:gap-2 mt-4");
  });

  it("levanta o botão da próxima acção de 40 para 44 px", () => {
    // Os estados (zona e desactivado) sobem juntos: um cartão em que a altura
    // do botão muda com o estado lê-se como um salto. Eram três; o do portal
    // saiu com ele (achado n.º 37).
    expect(CABECALHO.match(/h-10 pointer-coarse:h-11 px-4/g)).toHaveLength(2);
    expect(CABECALHO).not.toMatch(/h-10 px-4 bg-/);
  });

  /**
   * A saída. O dossier vive em `evento/[id]`, fora do `AdminClient`: medido,
   * não há ali barra de baixo nem gaveta. Este link é o único caminho de volta.
   */
  it("dá 44 px à única saída do ecrã (o link de voltar aos Pedidos)", () => {
    const bloco = blocoQueContem(CABECALHO, "href={`/${lang}/orcamento/admin`}");
    expect(bloco).toContain("alvo-toque");
    expect(bloco).toContain("!justify-start");
  });
});

describe("os contactos do dossier", () => {
  it.each([
    ["href={`mailto:${quote.email}`}", "o email"],
    ["href={`tel:${quote.phone}`}", "o telefone"],
    // Desde 30/10 o endereço vem pronto do `linkDaConversa` (o número antigo
    // sem +351 ganha o indicativo), e o atributo passou a ser só a variável.
    ["href={wa}", "o WhatsApp"],
  ])("dá 44 px de altura ao link %s (%s)", (atributo) => {
    const bloco = blocoQueContem(LATERAL, atributo);
    expect(bloco).toContain("alvo-toque");
    // Sem isto a classe centra o conteúdo (é feita para botões de ícone) e
    // estes são itens esticados de uma coluna `flex`: o email saltava para o
    // meio do cartão.
    expect(bloco).toContain("!justify-start");
  });

  it("mantém o corte do email a funcionar depois de o link virar inline-flex", () => {
    // Num `inline-flex` o `truncate` não pega no próprio link: precisa de um
    // filho que possa encolher. Antes estava no `<a>`, onde era inerte.
    expect(LATERAL).toContain('<span className="min-w-0 truncate">{quote.email}</span>');
  });
});

describe("os diálogos da moldura", () => {
  /**
   * O `RestoreDialog` continua a desenhar o seu próprio ×, e por isso continua
   * a ser aqui que se prova que ele tem 44 px.
   */
  it("dá 44 px ao × de fechar do repor cópia de segurança", () => {
    const bloco = blocoQueContem(REPOR, 'aria-label="Fechar"');
    expect(bloco).toContain("alvo-toque");
  });

  /**
   * ── AS PASSKEYS DEIXARAM DE TER × PRÓPRIO, E ISSO É A CORRECÇÃO ──────────
   * Este diálogo passou a ser um `FolhaOuDialogo` — folha inferior no
   * telemóvel, diálogo centrado no computador. O × deixou de estar escrito
   * aqui porque passou a vir do primitivo, que o desenha `alvo-toque h-11 w-11`
   * e o garante a TODOS os que o usam de uma vez.
   *
   * Procurar `aria-label="Fechar"` neste ficheiro passou a ser procurar a
   * cópia que se queria ver desaparecer. Ficam duas asserções no lugar de uma:
   * que este diálogo delega mesmo no primitivo, e — a seguir — que o × do
   * primitivo tem os 44 px.
   *
   * A segunda tem de estar AQUI. O `ui/adaptativo.test.tsx` prova que o botão
   * existe e que fecha; não mede nada, e o jsdom também não o deixaria. Sem a
   * linha abaixo, converter um diálogo passava a ser uma forma silenciosa de
   * perder a garantia dos 44 px em todos eles ao mesmo tempo — que é o
   * contrário do que a conversão serve.
   */
  it("as passkeys herdam o × do primitivo em vez de desenharem o seu", () => {
    expect(PASSKEYS).toMatch(/<FolhaOuDialogo\b/);
    expect(PASSKEYS).not.toContain('aria-label="Fechar"');
  });

  it("e o × do primitivo, que agora serve todos, tem 44 px", () => {
    const bloco = blocoQueContem(FOLHA, 'aria-label="Fechar"');
    expect(bloco).toContain("alvo-toque");
    expect(bloco).toMatch(/h-11 w-11/);
  });
});

describe("o painel do «Guardar tudo»", () => {
  /**
   * O painel media 343 px e nascia em `x = -92`: 92 px fora do ecrã pela
   * esquerda, com o `body { overflow-x: clip }` a cortá-los. Estava colado à
   * direita de um botão que não é o último da fila, e por isso a 124 px da
   * margem. Sem `position` no telemóvel, resolve contra o `<header>` (que é
   * `sticky`, logo é bloco de contenção) — e aí `right-4` é a margem do ecrã.
   */
  it("deixa de se pendurar no botão quando há dedo", () => {
    expect(GUARDAR).toContain('className="relative pointer-coarse:static"');
    expect(GUARDAR).toContain("absolute right-0 pointer-coarse:right-4 top-[calc(100%+8px)]");
  });

  it("dá 44 px ao × que dispensa o aviso — o único alvo do painel", () => {
    // A boa notícia apaga-se sozinha; a má FICA. Este × é a única forma de
    // tirar do ecrã «não chegou ao servidor».
    const bloco = blocoQueContem(GUARDAR, "onClick={accao.dispensarResposta}");
    expect(bloco).toContain("alvo-toque");
  });
});

describe("o sino das notificações", () => {
  it("tem 44 px de largura nos três estados em que se pode tocar", () => {
    // Sem VAPID configurado o componente devolve `null` e nunca se vê — foi
    // por isso que ficou de fora de todas as medições anteriores.
    //
    // Passaram a ser TRÊS e não dois: com a rota em baixo o sino deixou de
    // desaparecer da barra (desaparecer lia-se como «ainda não está montado»,
    // que é o oposto do que se passa) e fica lá, sem contagem e sem estado, com
    // um clique que volta a perguntar. É um alvo a mais para medir.
    expect(SINO.match(/className="pointer-coarse:min-w-11"/g)).toHaveLength(3);
  });
});
