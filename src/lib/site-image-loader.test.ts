import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import siteImageLoader, {
  LOGO_WIDTHS,
  siteImageKey,
  snapLogoWidth,
  logoImageUrl,
  isLogoSrc,
  siteImageAvifUrl,
} from "./site-image-loader";
import {
  GALLERY_WIDTHS,
  galleryKey,
  galleryImageLoader,
} from "../app/[lang]/(site)/galeria/gallery-image-loader";
import { heroKey, HERO_SOURCES, HERO_WIDTHS } from "./hero-image-loader";
import nextConfig from "../../next.config";

const ROOT = path.join(__dirname, "..", "..");
const PREGEN_LOGOS = path.join(ROOT, "scripts", "pregen-logos.mjs");

describe("site-image-loader: nenhuma imagem local depende do optimizador", () => {
  it("as fotos (/imagens/) vão para um WebP estático, nunca para o /_next/image", () => {
    expect(siteImageLoader({ src: "/imagens/20_10_2025_0044.jpg", width: 640, quality: 75 })).toBe(
      "/_img/g/20_10_2025_0044-640.webp",
    );
    expect(
      siteImageLoader({ src: "/imagens/20_10_2025_0044.jpg", width: 640, quality: 75 }),
    ).not.toContain("/_next/image");
  });

  it("os logótipos (/logos/, /logo-liquen*.png) vão para /_img/l/", () => {
    expect(siteImageLoader({ src: "/logos/clientes/esri.avif", width: 128, quality: 50 })).toBe(
      "/_img/l/esri-128.webp",
    );
    expect(siteImageLoader({ src: "/logo-liquen.png", width: 256, quality: 75 })).toBe(
      "/_img/l/logo-liquen-256.webp",
    );
    expect(siteImageLoader({ src: "/logo-liquen-branco.png", width: 64, quality: 75 })).toBe(
      "/_img/l/logo-liquen-branco-64.webp",
    );
  });

  it("os logótipos em subpastas mais fundas também contam (o pré-gerador é recursivo)", () => {
    expect(isLogoSrc("/logos/clientes/2026/novo.png")).toBe(true);
    expect(siteImageLoader({ src: "/logos/clientes/2026/novo.png", width: 100, quality: 75 })).toBe(
      "/_img/l/novo-128.webp",
    );
  });

  it("não é logótipo o que só PARECE (o prefixo é /logos/, não /logo)", () => {
    // "/logotipos/x.png" começa por "/logo" mas não por "/logos/". Se o teste
    // de prefixo alguma vez relaxar para "/logo", esta imagem passaria a pedir
    // um /_img/l/ que ninguém gerou.
    expect(isLogoSrc("/logotipos/x.png")).toBe(false);
    expect(isLogoSrc("/logo-liquen-preto.png")).toBe(false);
    expect(isLogoSrc("/logos/x.png")).toBe(true);
  });
});

describe("site-image-loader: o ramo de recurso", () => {
  /**
   * MEDIDO, NÃO SUPOSTO. Com um `loaderFile` global, o `/_next/image` deixa de
   * existir: o servidor faz render404 antes de validar parâmetros
   * (node_modules/next/dist/server/next-server.js:198). Contra dois builds de
   * produção deste ramo, com o servidor a correr:
   *   loader "default" -> /_next/image?url=%2Flogo-liquen.png&w=256&q=55  200
   *   loader "custom"  -> o mesmo pedido                                  404
   * (confirmado tanto com `next start` como com o servidor `standalone`, que é
   * o que o Dockerfile corre.)
   *
   * Por isso o recurso NÃO pode ser o optimizador — seria um 404 garantido e
   * silencioso. Devolve o original intacto: maior, sem redimensionar, mas
   * aparece.
   */
  it("qualquer outra origem devolve o `src` INTACTO — e nunca o optimizador", () => {
    for (const src of [
      "/og-liquen.jpg",
      "/icon-512.png",
      "https://xxxx.supabase.co/storage/v1/object/sign/propostas/capa.jpg?token=abc",
      "https://cdn.exemplo.pt/foto.png",
    ]) {
      const url = siteImageLoader({ src, width: 640, quality: 75 });
      expect(url).toBe(src);
      expect(url).not.toContain("/_next/image");
    }
  });

  it("NENHUM ramo do carregador pode alguma vez emitir um URL /_next/image", () => {
    const srcs = [
      "/imagens/a.jpg",
      "/logos/b.png",
      "/logo-liquen.png",
      "/logo-liquen-branco.png",
      "/logo-liquen-marca.png",
      "/qualquer-outra.jpg",
      "https://remoto.exemplo/x.jpg",
      "",
    ];
    for (const src of srcs) {
      for (const width of [16, 64, 384, 640, 1920, 3840]) {
        expect(siteImageLoader({ src, width, quality: 75 })).not.toContain("/_next/image");
      }
    }
  });
});

describe("site-image-loader: as escadas", () => {
  it("arredonda a largura dos logótipos PARA CIMA e satura no topo", () => {
    expect(snapLogoWidth(1)).toBe(64);
    expect(snapLogoWidth(64)).toBe(64);
    expect(snapLogoWidth(65)).toBe(128);
    expect(snapLogoWidth(256)).toBe(256);
    expect(snapLogoWidth(257)).toBe(384);
    expect(snapLogoWidth(385)).toBe(512);
    expect(snapLogoWidth(1920)).toBe(512);
    // Nunca serve MENOS do que o pedido, a não ser no topo da escada.
    for (const w of [10, 100, 200, 300, 383, 500]) {
      expect(snapLogoWidth(w)).toBeGreaterThanOrEqual(w);
    }
  });

  it("as escadas do contrato não mudam sem que alguém repare", () => {
    expect([...LOGO_WIDTHS]).toEqual([64, 128, 256, 384, 512]);
    expect([...GALLERY_WIDTHS]).toEqual([384, 640, 768, 1024, 1280]);
    for (const ladder of [LOGO_WIDTHS, GALLERY_WIDTHS]) {
      expect([...ladder], "escada por ordem crescente").toEqual([...ladder].sort((a, b) => a - b));
    }
  });

  it("o topo da escada dos logótipos chega para o maior logótipo do sítio", () => {
    // O wordmark do Navbar é o maior: 3747x2238, desenhado no máximo a
    // `h-[148px]` -> 148 * (3747/2238) = 248 px de CSS.
    //
    // A escada tem de cobrir 2x, não 1x. Cobria só 1x e servia 384 px para os
    // 496 px de dispositivo de um ecrã de alta resolução — na única imagem que
    // aparece em TODAS as páginas. O degrau de 512 é a correcção; este teste
    // passa a exigir os 2x para o erro não poder voltar.
    const larguraCssMaxima = Math.round(148 * (3747 / 2238));
    expect(Math.max(...LOGO_WIDTHS)).toBeGreaterThanOrEqual(larguraCssMaxima * 2);
  });
});

describe("site-image-loader: a chave", () => {
  it("é o basename saneado", () => {
    expect(siteImageKey("/logos/clientes/hilton-garden-inn.avif")).toBe("hilton-garden-inn");
    expect(siteImageKey("/logo-liquen.png")).toBe("logo-liquen");
    expect(siteImageKey("/logos/Câmara de Évora.png")).toBe("C_mara_de__vora");
    expect(siteImageKey("/imagens/J&A-68.jpg")).toBe("J_A-68");
  });

  it("é EXACTAMENTE a mesma regra dos outros dois carregadores", () => {
    // Três ficheiros diferentes constroem nomes de ficheiro estático; se a
    // regra divergir num deles, esse passa a pedir ficheiros que o pré-gerador
    // nunca escreveu — 404 silencioso.
    for (const src of [
      "/imagens/foto com espaço.jpeg",
      "/imagens/Natalia e Jonathan-198.jpg",
      "/logos/clientes/José de Mello.png",
      "/logo-liquen.png",
      "/x/y/z.tar.gz",
    ]) {
      expect(siteImageKey(src)).toBe(galleryKey(src));
      expect(siteImageKey(src)).toBe(heroKey(src));
    }
  });
});

describe("site-image-loader: contrato com o resto do sistema", () => {
  it("as fotos resolvem para o MESMO ficheiro que o carregador da galeria", () => {
    // A mesma foto aparece na galeria (com `loader={galleryImageLoader}`) e nas
    // páginas de serviço (pelo carregador global). Se os dois discordassem, o
    // visitante descarregava duas cópias da mesma imagem.
    for (const src of ["/imagens/20_10_2025_0044.jpg", "/imagens/20_10_2025_0225.jpg"]) {
      for (const width of [200, 384, 640, 1024, 1920]) {
        expect(siteImageLoader({ src, width, quality: 75 })).toBe(
          galleryImageLoader({ src, width, quality: 65 }),
        );
      }
    }
  });

  it("o next.config.ts aponta mesmo para este ficheiro", () => {
    expect(nextConfig.images?.loader).toBe("custom");
    const loaderFile = nextConfig.images?.loaderFile;
    expect(loaderFile).toBe("./src/lib/site-image-loader.ts");
    expect(existsSync(path.join(ROOT, loaderFile!)), `${loaderFile} não existe`).toBe(true);
  });

  it("a escada e os nomes estão em sincronia com scripts/pregen-logos.mjs", () => {
    // O .mjs não pode importar TS, por isso a sincronia é verificada aqui.
    const script = readFileSync(PREGEN_LOGOS, "utf8");

    const widths = script.match(/const WIDTHS = \[([^\]]+)\]/);
    expect(widths, "não encontrei WIDTHS em pregen-logos.mjs").not.toBeNull();
    expect(widths![1].split(",").map((n) => Number(n.trim()))).toEqual([...LOGO_WIDTHS]);

    // A pasta de saída do pré-gerador tem de ser a que o carregador pede.
    expect(script).toContain('path.join(PUBLIC, "_img", "l")');

    // E os dois logótipos da raiz têm de ser os mesmos dos dois lados.
    const roots = script.match(/const ROOT_LOGOS = \[([^\]]+)\]/);
    expect(roots, "não encontrei ROOT_LOGOS em pregen-logos.mjs").not.toBeNull();
    const doScript = roots![1].match(/"([^"]+)"/g)!.map((s) => s.slice(1, -1));
    expect(doScript.every(isLogoSrc), `${doScript} não são todos reconhecidos`).toBe(true);
    expect(doScript.sort()).toEqual([
      "/logo-liquen-branco.png",
      "/logo-liquen-marca.png",
      "/logo-liquen.png",
    ]);
  });

  it("todos os logótipos de public/ têm um ficheiro pré-gerado para cada largura", () => {
    // Guarda de integridade contra o disco: se o pré-gerador não correr, ou se
    // alguém acrescentar um logótipo sem regenerar, isto falha antes de a dona
    // ver um buraco na parede de clientes.
    const outDir = path.join(ROOT, "public", "_img", "l");
    if (!existsSync(outDir)) return; // árvore sem build ainda — o build gera-os

    const emFalta: string[] = [];
    for (const src of [
      "/logo-liquen.png",
      "/logo-liquen-branco.png",
      "/logo-liquen-marca.png",
      ...listarLogos(path.join(ROOT, "public", "logos")),
    ]) {
      for (const w of LOGO_WIDTHS) {
        const f = path.join(ROOT, "public", logoImageUrl(src, w));
        if (!existsSync(f)) emFalta.push(logoImageUrl(src, w));
      }
    }
    expect(emFalta, "corre `node scripts/pregen-logos.mjs`").toEqual([]);
  });

  it("o URL não leva `q=` nenhum — a qualidade fica cozida no ficheiro", () => {
    // Um `q=` no URL criaria chaves de cache distintas para o mesmo ficheiro
    // estático, e daria a impressão falsa de que mudar `quality={…}` muda a
    // imagem servida (não muda: o WebP já está escrito).
    for (const q of [50, 55, 65, 70, 72, 75, undefined]) {
      expect(siteImageLoader({ src: "/imagens/a.jpg", width: 640, quality: q })).toBe(
        "/_img/g/a-640.webp",
      );
      expect(siteImageLoader({ src: "/logo-liquen.png", width: 256, quality: q })).toBe(
        "/_img/l/logo-liquen-256.webp",
      );
    }
  });
});

describe("site-image-loader: as fotografias de largura total", () => {
  /**
   * Estas eram servidas com o tecto de 1280 das fotos comuns quando são
   * desenhadas a 3840 px de dispositivo num ecrã 1920 a 2x. Medido `naturalWidth`
   * contra a caixa real: heróis 2048/4070, estas 1280/3840 — de 2x de ampliação
   * para 3x. A escada dos heróis (até 2048) é a que lhes serve.
   */
  it("uma fotografia de largura total vai para a escada grande, não para a das fotos comuns", () => {
    const url = siteImageLoader({ src: "/imagens/JOAO_E_PEDRO_1Y1A4472.jpg", width: 1920 });
    expect(url).toBe("/_img/JOAO_E_PEDRO_1Y1A4472-2048.webp");
    // O ramo das fotos comuns tê-la-ia travado nos 1280.
    expect(url).not.toContain("/_img/g/");
  });

  it("a decisão é da ORIGEM, não de quem chama", () => {
    // O mesmo ficheiro pedido em larguras diferentes sobe a escada dos heróis
    // inteira, venha pelo <HeroImage> (que passa o seu carregador) ou por aqui.
    for (const [pedida, esperada] of [
      [640, 640],
      [800, 1080],
      [1300, 1536],
      [1920, 2048],
      [4000, 2048],
    ] as const) {
      expect(siteImageLoader({ src: "/imagens/hd-edited.jpg", width: pedida })).toBe(
        `/_img/hd-edited-${esperada}.webp`,
      );
    }
  });

  it("a lista do carregador e a do pré-gerador são a MESMA", () => {
    // São dois ficheiros (um é .mjs e não pode importar TS). Se divergirem, o
    // carregador aponta para ficheiros que o build não escreveu — 404 em cada
    // fundo de secção.
    const script = readFileSync(path.join(ROOT, "scripts", "pregen-heroes.mjs"), "utf8");
    const bloco = script.match(/const HERO_SOURCES = \[([\s\S]*?)\];/);
    expect(bloco, "não encontrei HERO_SOURCES em pregen-heroes.mjs").toBeTruthy();
    const noScript = [...bloco![1].matchAll(/"(\/imagens\/[^"]+)"/g)].map((m) => m[1]).sort();
    const noLoader = [...HERO_SOURCES].sort();
    expect(noScript).toEqual(noLoader);
  });

  it("todas as fotografias de largura total têm ficheiros gerados", () => {
    const dir = path.join(ROOT, "public", "_img");
    if (!existsSync(dir)) return; // árvore acabada de clonar, sem build
    const faltam: string[] = [];
    for (const src of HERO_SOURCES) {
      for (const w of HERO_WIDTHS) {
        const f = path.join(dir, `${heroKey(src)}-${w}.webp`);
        if (!existsSync(f)) faltam.push(path.basename(f));
      }
    }
    expect(faltam).toEqual([]);
  });
});

/** Todos os "/logos/…" existentes em disco, recursivamente. */
function listarLogos(dir: string, base = path.join(ROOT, "public"), out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) listarLogos(p, base, out);
    else if (/\.(png|jpe?g|avif|webp|tiff?)$/i.test(name)) {
      out.push("/" + path.relative(base, p).split(path.sep).join("/"));
    }
  }
  return out;
}

describe("site-image-loader: o gémeo AVIF (a <source> do SafeImage)", () => {
  /**
   * O `SafeImage` só põe uma `<source type="image/avif">` quando esta função
   * diz que há AVIF em TODAS as larguras. Um «sim» a mais é uma imagem partida
   * (o browser escolhe a `<source>` pelo `type`, não pela existência); por
   * isso cada ramo é conferido contra o WebP que o carregador serve e, havendo
   * build, contra o disco.
   */
  const LARGURAS = [16, 64, 256, 360, 384, 640, 768, 1024, 1080, 1280, 1536, 1920, 3840];

  it("é o WebP do carregador com outra extensão, largura a largura, nos dois ramos com gémeo", () => {
    for (const src of ["/imagens/EW1_1100.jpg", "/imagens/M&F0678.jpg", "/imagens/hd-edited.jpg"]) {
      for (const w of LARGURAS) {
        const avif = siteImageAvifUrl(src, w);
        expect(avif, `${src} @${w}`).not.toBeNull();
        expect(avif!.replace(/\.avif$/, ".webp")).toBe(siteImageLoader({ src, width: w }));
      }
    }
  });

  it("os logótipos, a bandeja _intake/ e o que vem de fora NÃO têm gémeo", () => {
    for (const src of [
      "/logo-liquen.png",
      "/logos/deloitte.png",
      "/imagens/_intake/nova.jpg",
      "/imagens/foto.jpg?v=2",
      "/imagens/animacao.gif",
      "https://exemplo.pt/imagens/foto.jpg",
      "data:image/webp;base64,AAAA",
    ]) {
      expect(siteImageAvifUrl(src, 640), src).toBeNull();
    }
  });

  it("todas as fotografias de largura total têm o AVIF gerado em cada degrau", () => {
    const dir = path.join(ROOT, "public", "_img");
    if (!existsSync(dir)) return; // árvore acabada de clonar, sem build
    const faltam: string[] = [];
    for (const src of HERO_SOURCES) {
      for (const w of HERO_WIDTHS) {
        const f = path.join(ROOT, "public", siteImageAvifUrl(src, w)!);
        if (!existsSync(f)) faltam.push(path.basename(f));
      }
    }
    expect(faltam).toEqual([]);
  });

  it("as fotografias de /imagens/ têm o AVIF gerado em cada degrau da galeria", () => {
    // `/_img/g/` não é versionado: só existe depois de `npm run pregen`/build.
    if (!existsSync(path.join(ROOT, "public", "_img", "g"))) return;
    const fotos = readdirSync(path.join(ROOT, "public", "imagens")).filter((n) =>
      /\.(jpe?g|png|webp)$/i.test(n),
    );
    const faltam: string[] = [];
    for (const n of fotos) {
      const src = `/imagens/${n}`;
      if (HERO_SOURCES.has(src)) continue;
      for (const w of GALLERY_WIDTHS) {
        const f = path.join(ROOT, "public", siteImageAvifUrl(src, w)!);
        if (!existsSync(f)) faltam.push(path.basename(f));
      }
    }
    expect(faltam).toEqual([]);
  });
});
