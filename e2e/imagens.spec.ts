import { test, expect, devices, type Page, type TestInfo } from "@playwright/test";
import { imagensEmFalta, paginasPublicas, relatorio, varrerPagina } from "./imagens-uteis";

/**
 * A REDE DE SEGURANÇA DAS IMAGENS.
 *
 * A queixa é sempre a mesma — "as fotos falham imenso, muitas vezes nem
 * aparecem" — e já foi corrigida duas vezes em sítios diferentes (a galeria,
 * depois o menu e o portefólio das páginas de serviço). O problema não é cada
 * bug em si: é que NADA impedia uma imagem partida de chegar a produção. Os
 * testes unitários não abrem browser nenhum e o E2E que existia nunca contou uma
 * imagem. Este ficheiro é a peça que faltava.
 *
 * O QUE FAZ. Em cada página pública e em cada um dos dois ecrãs: percorre a
 * página toda, espera que as imagens assentem e exige que TODAS tenham pintado.
 * `naturalWidth > 0` é a única prova real — um <img> com o src partido continua
 * "visível" para o Playwright, com o `src` no sítio e o `alt` no sítio; só o
 * `naturalWidth` a zero o denuncia. É por isso que nada disto era apanhado.
 *
 * PORQUÊ DOIS ECRÃS. O `sizes` de cada <Image> faz o browser escolher um
 * candidato DIFERENTE do srcset conforme a largura e o DPR: o telemóvel pede
 * ficheiros que o computador nunca pede e vice-versa. Um pode faltar sem o outro
 * faltar.
 *
 * PORQUÊ O MENU ABERTO. A fotografia do menu só é montada quando ele abre pela
 * primeira vez (`jaAbriu` em src/components/menu/MenuDoTelemovel.tsx; até 19/11
 * eram as miniaturas dos serviços em destaque).
 * É uma delas que aparece partida na captura de ecrã da dona do site, e nenhuma
 * página fechada as veria alguma vez. A verificação vive dentro do caso de
 * telemóvel (o botão é `lg:hidden`) porque é um clique numa página que já está
 * carregada — não vale meia centena de carregamentos extra no CI.
 *
 * A etiqueta `@imagens` no título permite ao CI correr esta rede sozinha e
 * BLOQUEANTE, separada do resto da suite E2E (ver .github/workflows/ci.yml).
 */

// ─── Os dois ecrãs ───────────────────────────────────────────────────────────
// Descrições reais do Playwright (viewport + DPR + user-agent). O DPR importa
// tanto como a largura: o Pixel 7 tem deviceScaleFactor 2.625, portanto pede
// candidatos do srcset muito mais largos do que a sua largura CSS sugere.
//
// `defaultBrowserType` sai da descrição: o Playwright recusa-o dentro de um
// `describe` (obrigaria a criar outro worker) e este projeto só corre Chromium.
function semBrowserType(descricao: (typeof devices)[string]) {
  const opcoes: Partial<(typeof devices)[string]> = { ...descricao };
  delete opcoes.defaultBrowserType;
  return opcoes;
}
const ECRAS = [
  { nome: "computador", movel: false, opcoes: semBrowserType(devices["Desktop Chrome"]) },
  { nome: "telemóvel", movel: true, opcoes: semBrowserType(devices["Pixel 7"]) },
] as const;

// ─── Quanto se percorre ──────────────────────────────────────────────────────
/**
 * Tecto de passos de scroll por página. As páginas normais chegam ao fim em 6 a
 * 9 passos; quem lá chega perto é a galeria (427 fotos, scroll infinito).
 *
 * A GALERIA É PERCORRIDA TODA — MEDIDO, NÃO ASSUMIDO. A intenção era cortá-la
 * (uma travessia completa parecia cara de mais para o CI), mas a medição diz o
 * contrário: 432 de 432 fotos em 137 passos e 21 s em computador, 436 em 337
 * passos e 38 s em telemóvel. É o que dá servir WebP estáticos pré-gerados em
 * vez de transformações on-demand — não há encode nenhum a pagar. Cortar isso
 * pouparia ~50 s numa suite de ~2 min e deixaria 380 das 427 fotos por olhar,
 * justamente as que ninguém vê até um visitante lá chegar. Não compensa.
 *
 * O tecto de 600 continua a existir como cinto de segurança: um scroll infinito
 * que nunca acabe não pode transformar isto numa corrida sem fim. Quando bate no
 * tecto, o relatório di-lo ("cortado no tecto").
 *
 * `E2E_IMAGENS_RAPIDO=1` corta em 14 passos para o ciclo curto de quem está a
 * mexer no teste — nunca para o CI.
 */
const MAX_PASSOS = process.env.E2E_IMAGENS_RAPIDO ? 14 : 600;

const PAGINAS = paginasPublicas();

// Guarda contra o pior fracasso possível deste ficheiro: passar a verde por ter
// deixado de encontrar páginas. Se o sitemap partir, isto fala.
test("@imagens a descoberta de páginas encontra o sítio todo", async () => {
  expect(PAGINAS.length).toBeGreaterThanOrEqual(20);
  expect(PAGINAS).toContain("/");
  expect(PAGINAS).toContain("/galeria");
  expect(PAGINAS).toContain("/servicos/casamentos");
  expect(PAGINAS.filter((p) => p.startsWith("/en")).length).toBeGreaterThan(0);
});

/**
 * A segunda rede: imagens que FALHARAM, mesmo que o visitante não chegue a ver o
 * buraco.
 *
 * PORQUE É PRECISA ALÉM DO `naturalWidth`. O sítio aprendeu a curar-se: o
 * <GalleryImage> e o <SafeImage> apanham o `onError`, re-tentam e acabam a
 * servir o ficheiro original — e, esgotado tudo, DESMONTAM o <img> e põem uma
 * superfície digna no lugar. Ou seja, a partir de agora uma imagem partida pode
 * pintar-se na mesma (bem), ou desaparecer do DOM (também bem para quem visita)
 * — e nos dois casos uma verificação só de pixels dá verde enquanto o ficheiro
 * continua em falta no servidor. A cura é para o visitante, não para o CI.
 *
 * Junta-se aqui o que o browser recusou, por duas vias que se completam:
 *  • a RESPOSTA do servidor (4xx/5xx, ou pedido sem resposta);
 *  • o evento `error` do próprio <img> (apanhado na captura, à janela, para
 *    valer mesmo para elementos que sejam removidos a seguir) — é o que apanha
 *    um ficheiro que responde 200 e mesmo assim não descodifica.
 *
 * O QUE NEM ISTO APANHA, e é bom saber-se: um ficheiro CORTADO A MEIO cujo
 * cabeçalho continua válido. Medido: um WebP truncado a 120 bytes responde 200,
 * dispara `load` (não `error`) e devolve `naturalWidth = 384` — o browser lê as
 * dimensões do cabeçalho e desenha o que lá está. Nenhuma verificação de DOM ou
 * de rede o distingue de uma foto boa; só uma comparação de pixels o faria, e
 * essa é outra espécie de teste (muito mais frágil). Fica dito em vez de fingido.
 *
 * SÓ SE JULGAM OS FICHEIROS ESTÁTICOS (/_img/…, /imagens/…, /logos/…): esses
 * existem ou não existem, não há falha passageira possível. O `/_next/image`
 * fica de fora da asserção de propósito — pode falhar por pressão (quota, encode
 * a frio, rajada), o site já re-tenta, e transformá-lo em falha seria construir
 * um teste intermitente. Um teste intermitente é ignorado, e um teste ignorado
 * não protege ninguém. As recusas do optimizador vão para o relatório como anexo.
 */
function seguirFalhasDeImagem(page: Page) {
  const estaticas = new Map<string, string>();
  const optimizador = new Map<string, string>();

  const eImagem = (url: string, tipo: string) =>
    tipo === "image" || /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i.test(url);
  const arrumar = (url: string, motivo: string) => {
    if (!url.startsWith("http")) return;
    const { pathname } = new URL(url);
    (pathname === "/_next/image" ? optimizador : estaticas).set(pathname, motivo);
  };

  page.on("response", (res) => {
    if (!eImagem(res.url(), res.request().resourceType())) return;
    if (res.status() < 400) return;
    arrumar(res.url(), `HTTP ${res.status()}`);
  });
  page.on("requestfailed", (req) => {
    if (!eImagem(req.url(), req.resourceType())) return;
    arrumar(req.url(), "sem resposta");
  });

  const recolher = async () => {
    const urls = await page
      .evaluate(() => (window as unknown as { __errosImg?: string[] }).__errosImg ?? [])
      .catch(() => [] as string[]);
    for (const url of urls) arrumar(url, "o browser recusou o ficheiro");
  };

  const formatar = (m: Map<string, string>) => [...m].map(([p, m2]) => `${m2} · ${p}`).sort();
  return {
    estaticasFalhadas: async () => {
      await recolher();
      return formatar(estaticas);
    },
    optimizadorFalhado: async () => {
      await recolher();
      return formatar(optimizador);
    },
  };
}

/**
 * Regista, no browser, todo o <img> que dispare `error` — em captura e à janela,
 * porque o evento de uma imagem não borbulha. Fica num array global para poder
 * ser lido no fim, mesmo que o elemento já tenha sido removido do DOM.
 */
async function registarErrosDeImagem(page: Page) {
  await page.addInitScript(() => {
    const alvos: string[] = [];
    (window as unknown as { __errosImg: string[] }).__errosImg = alvos;
    window.addEventListener(
      "error",
      (e) => {
        const el = e.target as HTMLImageElement | null;
        if (el && el.tagName === "IMG") alvos.push(el.currentSrc || el.src);
      },
      true,
    );
  });
}

/** Anexa uma lista ao relatório HTML, para quem vir o vermelho no CI ter por onde pegar. */
async function anexar(info: TestInfo, nome: string, linhas: string[]) {
  if (linhas.length === 0) return;
  await info.attach(nome, { body: linhas.join("\n"), contentType: "text/plain" });
}

for (const ecra of ECRAS) {
  test.describe(`Imagens · ${ecra.nome}`, () => {
    test.use(ecra.opcoes);

    for (const caminho of PAGINAS) {
      test(`@imagens ${caminho} pinta todas as imagens`, async ({ page }, info) => {
        // A galeria percorre muito mais ecrãs (e muito mais fotos) do que as
        // outras páginas; o tecto acompanha isso em vez de ser único e enorme.
        // Tectos, não custos: medido, a galeria completa leva 21 s (computador)
        // e 38 s (telemóvel), e as outras páginas 3 a 5 s. A folga é para um CI
        // mais lento do que esta máquina.
        test.setTimeout(caminho.endsWith("/galeria") ? 240_000 : 90_000);

        const falhasDeRede = seguirFalhasDeImagem(page);
        await registarErrosDeImagem(page);
        // `load` (a omissão) e não `domcontentloaded`: as páginas hidratam e
        // remontam a seguir, e começar a descer antes disso mede uma página que
        // deixa de existir no frame seguinte. O `varrerPagina` espera ainda pela
        // altura estabilizar.
        await page.goto(caminho);

        const varrimento = await varrerPagina(page, { maxPassos: MAX_PASSOS });
        const falhas = await imagensEmFalta(page, { alcance: varrimento.alcance });
        await anexar(info, "imagens em falta", relatorio(falhas));

        // Fica no relatório quanta página foi mesmo percorrida e quantas imagens
        // foram julgadas — sem isto ninguém sabe se um verde cobre o site todo
        // ou só a primeira dobra.
        info.annotations.push({
          type: "varrimento",
          description:
            `${await page.locator("img").count()} imagens · ${varrimento.alcance}px ` +
            `em ${varrimento.passos} passos${varrimento.cortado ? " (cortado no tecto)" : " (até ao fim)"}`,
        });

        expect
          .soft(
            relatorio(falhas),
            `${falhas.length} imagem(ns) não pintaram em ${caminho} (${ecra.nome})`,
          )
          .toEqual([]);

        // O menu mobile é o único ponto do sítio onde há imagens que NÃO existem
        // no DOM enquanto ninguém interage com a página.
        if (ecra.movel) {
          const doMenu = await abrirMenuEColherFalhas(page);
          await anexar(info, "miniaturas do menu em falta", relatorio(doMenu));
          expect
            .soft(relatorio(doMenu), `miniaturas do menu aberto partidas em ${caminho}`)
            .toEqual([]);
        }

        await anexar(
          info,
          "optimizador (/_next/image) recusou",
          await falhasDeRede.optimizadorFalhado(),
        );
        expect
          .soft(
            await falhasDeRede.estaticasFalhadas(),
            `ficheiros de imagem estáticos que falharam em ${caminho} (${ecra.nome}) — ` +
              "o site pode ter tapado o buraco com o ficheiro original, mas o ficheiro continua em falta",
          )
          .toEqual([]);

        // Uma página sem imagem nenhuma passaria sempre — e é assim que um teste
        // destes apodrece em silêncio. Mesmo as páginas de texto puro
        // (privacidade, termos) têm o logótipo da barra.
        expect(await page.locator("img").count()).toBeGreaterThan(0);
      });
    }
  });
}

/**
 * Abre o menu mobile e devolve as miniaturas que não pintaram.
 *
 * O botão é encontrado pela SEMÂNTICA (`aria-expanded`) e não pelo texto, para o
 * teste valer igual em português e em inglês; e espera-se pelo ESTADO
 * (`aria-expanded="true"`, o diálogo visível, a primeira miniatura no DOM) em
 * vez de por um tempo — o menu tem uma cascata de aberturas de 0,6 s cujo ritmo
 * não interessa nada aqui.
 */
async function abrirMenuEColherFalhas(page: Page) {
  // Margem folgada nas esperas: o clique só acontece depois de a barra hidratar,
  // e num CI carregado essa hidratação chega a levar mais do que os 5 s de
  // omissão. Continua a ser espera por estado — só o tecto é que é maior.
  const espera = { timeout: 20_000 };
  const botao = page.locator("nav[data-public-nav] button[aria-expanded]").first();
  await expect(botao).toBeVisible(espera);
  await botao.click();
  await expect(botao).toHaveAttribute("aria-expanded", "true", espera);

  const seletorMenu = 'nav[data-public-nav] [role="dialog"]';
  const menu = page.locator(seletorMenu);
  await expect(menu).toBeVisible(espera);

  // Guarda: se a fotografia do menu deixar de ser montada, isto tem de dar por ela
  // em vez de passar a verde por não ter nada para verificar.
  const miniaturas = menu.locator("img");
  await expect(miniaturas.first()).toBeAttached(espera);
  expect(await miniaturas.count()).toBeGreaterThan(0);

  // `alcance: 0` é ignorado com uma raiz explícita: o menu é uma sobreposição de
  // posição fixa, está todo no ecrã.
  return imagensEmFalta(page, { alcance: 0, raiz: seletorMenu });
}
