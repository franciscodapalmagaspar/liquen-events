import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * «A proposta online não tem nada a ver com a proposta PDF… quero que esteja
 * ao mesmo nível» e «quero que tornes extremamente rápido» (22/10).
 *
 * Prende-se a decisão: a página desenha AS PÁGINAS DO PDF (o mesmo ficheiro e
 * a mesma rota do botão), e não um segundo desenho em HTML; as escolhas ficam
 * por baixo; as páginas chegam como imagens desenhadas no servidor, com a
 * primeira no HTML; e a rede (o pdf.js no browser) é a versão «legacy», sem a
 * qual o iPhone mostrava páginas em branco.
 */
const aqui = join(process.cwd(), "src/app/[lang]/(privado)/proposta/[token]");
const ler = (f: string) => readFileSync(join(aqui, f), "utf8");
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("a proposta online é o próprio PDF", () => {
  const pagina = semComentarios(ler("page.tsx"));

  it("a página desenha as páginas do PDF pela rota do botão, e as escolhas por baixo", () => {
    expect(pagina).toMatch(
      /<PaginasDoPdf\s+base=\{`\/api\/proposta\/\$\{encodeURIComponent\(token\)\}`\}/,
    );
    expect(pagina.indexOf("<PaginasDoPdf")).toBeLessThan(pagina.indexOf("<EscolhasDoDocumento"));
  });

  it("o segundo desenho em HTML (`Documento`) já não é montado", () => {
    expect(pagina).not.toMatch(/<Documento\b/);
    expect(pagina).not.toMatch(/from "\.\/Documento"/);
  });

  it("só se assinam as fotografias das alternativas — as outras vêm dentro do PDF", () => {
    expect(pagina).toMatch(
      /fotosDaProposta\(\{\s*coverImages: \[\],\s*moodBoards: \[\],\s*escolhas: proposal\.doc\.escolhas\s*\}\)/,
    );
  });

  it("a primeira página é uma imagem pedida já, com prioridade, e as outras quando chegam perto", () => {
    const visor = semComentarios(ler("PaginasDoPdf.tsx"));
    expect(visor).toMatch(/loading=\{i === 1 \? "eager" : "lazy"\}/);
    expect(visor).toMatch(/fetchPriority=\{i === 1 \? "high" : "auto"\}/);
    expect(visor).toMatch(/\$\{base\}\/pagina\/\$\{i\}\?w=\$\{w\}&v=\$\{v\}/);
    // O pdf.js não vem com a página: só se descarrega se as imagens falharem.
    expect(visor).not.toMatch(/pdfjs-dist/);
    expect(visor).toMatch(/dynamic\(\(\) => import\("\.\/PaginasNoBrowser"\), \{ ssr: false \}\)/);
  });

  it("todas as páginas vêm no HTML com o lugar reservado — nada empurra as escolhas", () => {
    // MEDIDO antes: CLS 0,29 em 4G lento, porque as páginas 2+ só nasciam
    // depois de o React perguntar quantas eram.
    expect(pagina).toMatch(/previstas=\{paginasDoPlano\(proposal\.doc\)\}/);
    const visor = semComentarios(ler("PaginasDoPdf.tsx"));
    expect(visor).toMatch(/paginas\?\.length \?\? Math\.max\(1, previstas\)/);
    // Uma página a mais na previsão (404) não manda a proposta inteira para o pdf.js.
    expect(visor).toMatch(/onError=\{i === 1 \? \(\) => setNoBrowser\(true\) : undefined\}/);
  });

  it("a rede (o pdf.js no browser) é a versão legacy, aos pedaços", () => {
    const visor = semComentarios(ler("PaginasNoBrowser.tsx"));
    expect(visor).toMatch(/import\("pdfjs-dist\/legacy\/build\/pdf\.mjs"\)/);
    expect(visor).toMatch(/"pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs"/);
    expect(visor).not.toMatch(/import\("pdfjs-dist"\)/);
    expect(visor).toMatch(/disableAutoFetch: true/);
  });
});

describe("voltar atrás à proposta é instantâneo, e continua privada", () => {
  const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
  it("as duas formas do endereço levam `private, no-cache` (nunca `public`, nunca `no-store`)", () => {
    for (const fonte of ['"/proposta/:token"', '"/:lang(pt|en)/proposta/:token"']) {
      const i = config.indexOf(`source: ${fonte}`);
      expect(i, `falta a regra de ${fonte}`).toBeGreaterThan(-1);
      const regra = config.slice(i, config.indexOf("}", config.indexOf("headers:", i)) + 1);
      expect(regra).toMatch(/"Cache-Control", value: "private, no-cache"/);
    }
  });
});
