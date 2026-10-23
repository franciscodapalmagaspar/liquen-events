import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A decisão de 23/10, que desfaz a de 22/10.
 *
 * A 22/10 ela disse «a proposta online não tem nada a ver com a proposta PDF…
 * quero que esteja ao mesmo nível», e a página passou a desenhar AS PÁGINAS DO
 * PDF. A 23/10 mandou o protótipo de uma página web própria («substituir a
 * página pública… por uma página web própria, a ecrã inteiro, gerada a partir
 * dos MESMOS dados do editor… o PDF continua igual e fica acessível por um
 * botão»), e escolheu: vale a página web, para todos os links.
 *
 * O que se prende: a página web é a que se desenha quando há documento; o
 * conteúdo vem do motor do PDF (`propostaWeb` → `conteudoDoEditorial`) e não
 * de um segundo desenho com regras próprias; o PDF está num botão; e o visor
 * das páginas do PDF fica SÓ como rede, se a página web não se deixar montar.
 */
const aqui = join(process.cwd(), "src/app/[lang]/(privado)/proposta/[token]");
const ler = (f: string) => readFileSync(join(aqui, f), "utf8");
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("a proposta online é uma página web feita com o conteúdo do PDF (23/10)", () => {
  const pagina = semComentarios(ler("page.tsx"));

  it("com documento, desenha-se a página web, montada pelo motor do PDF", () => {
    expect(pagina).toMatch(/await propostaWeb\(/);
    expect(pagina).toMatch(/<PropostaWeb\b/);
    expect(pagina.indexOf("<PropostaWeb")).toBeLessThan(pagina.indexOf("<PaginasDoPdf"));
    const modelo = readFileSync(join(process.cwd(), "src/lib/proposta-web/modelo.ts"), "utf8");
    expect(modelo).toMatch(/conteudoWebDoDocumento\(/);
  });

  it("o PDF fica num botão, com a rota de sempre", () => {
    const web = semComentarios(ler("PropostaWeb.tsx"));
    expect(web).toMatch(/href=\{d\.pdf\}/);
    const modelo = readFileSync(join(process.cwd(), "src/lib/proposta-web/modelo.ts"), "utf8");
    expect(modelo).toMatch(/pdf: `\$\{base\}\/pdf`/);
  });

  it("o segundo desenho antigo em HTML (`Documento`) continua fora", () => {
    expect(pagina).not.toMatch(/<Documento\b/);
    expect(pagina).not.toMatch(/from "\.\/Documento"/);
  });

  it("as letras vêm desta casa (next/font), nunca de um pedido ao Google", () => {
    expect(pagina).toMatch(/from "next\/font\/google"/);
    const css = ler("proposta-web.css");
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });
});

describe("a rede: se a página web não se montar, ficam as páginas do PDF", () => {
  const pagina = semComentarios(ler("page.tsx"));

  it("as escolhas continuam por baixo das páginas", () => {
    expect(pagina).toMatch(
      /<PaginasDoPdf\s+base=\{`\/api\/proposta\/\$\{encodeURIComponent\(token\)\}`\}/,
    );
    expect(pagina.indexOf("<PaginasDoPdf")).toBeLessThan(
      pagina.lastIndexOf("<EscolhasDoDocumento"),
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
