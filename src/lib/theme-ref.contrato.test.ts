import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ehRefDeTema,
  caminhoDoRefDeTema,
  refDeTema,
  separarRefs,
  THEME_REF_PREFIX,
} from "./theme-ref";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O FORMATO DA REFERÊNCIA, E A ÚNICA PORTA POR ONDE SE APAGA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Duas coisas separadas, com o mesmo dono: a REFERÊNCIA `tema:<caminho>` — que
 * vai parar dentro de um `src` e dentro de um `storage.download()` — e a regra
 * de que nenhuma rota pode apagar fotos da Biblioteca sem passar pela
 * salvaguarda.
 */

describe("o formato da referência", () => {
  it("vai e volta", () => {
    expect(refDeTema("italia/a1.jpg")).toBe("tema:italia/a1.jpg");
    expect(caminhoDoRefDeTema(refDeTema("italia/a1.jpg"))).toBe("italia/a1.jpg");
  });

  /**
   * O TESTE QUE INTERESSA. O que estiver depois do prefixo é interpolado num
   * caminho do Storage. Aceitar travessias aqui seria dar a um documento —
   * que pode ter sido escrito por uma versão antiga, ou restaurado de uma
   * cópia de segurança — a capacidade de escolher que ficheiro do bucket é
   * lido.
   */
  it("recusa tudo o que não seja <pasta>/<ficheiro>.<ext>", () => {
    for (const mau of [
      "tema:../../etc/passwd",
      "tema:italia/../../outro/a.jpg",
      "tema:/absoluto/a.jpg",
      "tema:italia/a.jpg?x=1",
      "tema:italia/a.exe",
      "tema:italia",
      "tema:",
      "tema:italia/sub/pasta/a.jpg",
      "tema:https://exemplo.pt/a.jpg",
    ]) {
      expect(ehRefDeTema(mau), `${mau} passou o guarda`).toBe(false);
      expect(caminhoDoRefDeTema(mau)).toBe("");
    }
  });

  it("aceita as extensões de imagem que a biblioteca guarda", () => {
    for (const bom of ["italia/a.jpg", "italia/a.jpeg", "t_1/a-2.png", "T-1/AB.WEBP"]) {
      expect(ehRefDeTema(`${THEME_REF_PREFIX}${bom}`), `${bom} foi recusado`).toBe(true);
    }
  });

  /** Um caminho da pasta de um pedido NÃO é uma referência — e é por isso que
   *  o prefixo existe: os dois formatos são indistinguíveis pela forma. */
  it("não confunde uma foto da própria proposta com uma da biblioteca", () => {
    expect(ehRefDeTema("q-1/uuid.jpg")).toBe(false);
    expect(ehRefDeTema("data:image/jpeg;base64,AAAA")).toBe(false);
    expect(ehRefDeTema("")).toBe(false);
    expect(ehRefDeTema(null)).toBe(false);
  });

  it("separa as duas famílias e deita fora os vazios", () => {
    expect(separarRefs(["tema:italia/a.jpg", "q-1/b.jpg", "", "tema:mau"])).toEqual({
      daBiblioteca: ["tema:italia/a.jpg"],
      // `tema:mau` não é uma referência válida; segue como caminho de proposta,
      // onde não vai resolver — e não aparecer num mapa é o resultado certo.
      daProposta: ["q-1/b.jpg", "tema:mau"],
    });
  });
});

// ── A única porta ──────────────────────────────────────────────────────────

/** Todos os ficheiros de código dentro de `dir`, sem testes. */
function ficheiros(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      ficheiros(caminho, saida);
    } else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
      saida.push(caminho);
    }
  }
  return saida;
}

describe("apagar fotos da Biblioteca", () => {
  /**
   * `deleteThemeImage` e `deleteThemeFolder` apagam bytes sem olhar a quem os
   * usa. Desde que uma foto escolhida para um mood board passou a ser
   * REFERENCIADA em vez de copiada, chamá-las directamente de uma rota tira
   * imagens a propostas já enviadas.
   *
   * A salvaguarda podia ser uma linha a acrescentar em cada rota — e nesse caso
   * quem escrever a terceira rota que apaga fotos tem de se lembrar dela. É por
   * isso que existem o `apagarFotoDaBiblioteca` e o `apagarPastaDaBiblioteca`:
   * a salvaguarda não é um passo à parte, é a única forma de apagar. Este teste
   * é o que impede a porta das traseiras de reaparecer.
   */
  it("nenhuma rota chama o Storage directamente — passa sempre pela salvaguarda", () => {
    const infractores: string[] = [];
    for (const ficheiro of ficheiros(join(process.cwd(), "src", "app"))) {
      // Sem comentários: uma rota que EXPLIQUE porque não chama o
      // `deleteThemeImage` está a fazer exactamente o que se pretende, e
      // acusá-la disso ensinava a apagar a explicação para calar o teste.
      const fonte = readFileSync(ficheiro, "utf-8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      for (const proibida of ["deleteThemeImage", "deleteThemeFolder"]) {
        if (fonte.includes(proibida)) {
          infractores.push(`${ficheiro.replace(process.cwd() + "/", "")} → ${proibida}`);
        }
      }
    }
    expect(
      infractores,
      "use apagarFotoDaBiblioteca / apagarPastaDaBiblioteca (theme-materializar.ts): " +
        "apagar sem pôr a salvo tira fotos de propostas já enviadas",
    ).toEqual([]);
  });
});

describe("mover fotos da Biblioteca", () => {
  /**
   * Auditoria 6, n.º 1. Mover uma foto muda-lhe a chave, e as propostas e os
   * rascunhos guardam REFERÊNCIAS (`tema:<pasta>/<ficheiro>`) — um `move` cru
   * deixava-as a apontar para o vazio, e as etiquetas da Biblioteca presas ao
   * caminho antigo. A única porta é o `moverFotosDaBiblioteca`; uma rota só
   * pode chamar a primitiva para COPIAR.
   */
  it("nenhuma rota move com o `transferThemeImage` — passa pela porta do mover", () => {
    const infractores: string[] = [];
    for (const ficheiro of ficheiros(join(process.cwd(), "src", "app"))) {
      const fonte = readFileSync(ficheiro, "utf-8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      for (const m of fonte.matchAll(/transferThemeImage\(([^)]*)\)/g)) {
        const modo = m[1].split(",").at(-1)?.trim();
        if (modo !== '"copy"') {
          infractores.push(`${ficheiro.replace(process.cwd() + "/", "")} → ${m[0]}`);
        }
      }
    }
    expect(infractores, "use moverFotosDaBiblioteca (theme-materializar.ts)").toEqual([]);
  });
});
