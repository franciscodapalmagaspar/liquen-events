import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/proposal-doc-render", () => ({ conteudoWebDoDocumento: vi.fn() }));
vi.mock("@/lib/app-state", () => ({
  getState: vi.fn(async () => null),
  setState: vi.fn(async () => ({ gravado: true })),
}));
vi.mock("@/lib/proposta-fotos", async () => {
  const real = await vi.importActual<typeof import("@/lib/proposta-fotos")>("@/lib/proposta-fotos");
  return { ...real, fotosDaProposta: vi.fn() };
});
vi.mock("@/lib/pdf-editorial/paleta-das-fotos", () => ({ paletaDasFotos: vi.fn(async () => []) }));

import PropostaWeb from "./PropostaWeb";
import { montarPropostaWeb } from "@/lib/proposta-web/modelo";
import { textosWeb } from "@/lib/proposta-web/textos-web";
import { inventarioDeFotos } from "@/lib/proposta-fotos";
import type { ConteudoWeb } from "@/lib/pdf-editorial/conteudo-web";
import type { ProposalDoc } from "@/lib/proposal-doc";

const C = (n: number) => `LQ-TESTE/foto-${n}.jpg`;
const doc = {
  coverImages: [C(0)],
  moodBoards: [
    { title: "Flores da mesa", images: [C(1), C(2), C(3)] },
    { title: "Velas", images: [C(4), C(5)] },
  ],
  escolhas: [],
} as unknown as ProposalDoc;
const f = (n: number, aspecto = 1.5) => ({ ref: C(n), aspecto });

const conteudo: ConteudoWeb = {
  casamento: true,
  lema: "",
  organizacao: false,
  capa: { sobretitulo: "", nomes: "Ana & Rui", partes: [], fundo: f(0) },
  proposta: { sobretitulo: "", titulo: "Proposta", factos: [], nota: "", foto: f(1) },
  servicos: null,
  ambiente: null,
  capitulos: [
    {
      numero: 1,
      nome: "Jantar",
      linha: "Mesas e luz",
      // O motor do PDF dá ao capítulo a nota do PRIMEIRO tema que a tem.
      nota: "NOTA-DO-PRIMEIRO",
      fotos: [f(1), f(2)],
      temas: [
        {
          titulo: "TITULO-DO-PRIMEIRO",
          subtitulo: "Mesas e luz",
          nota: "NOTA-DO-PRIMEIRO",
          fotos: [f(1), f(2, 0.7), f(3)],
        },
        {
          titulo: "TITULO-DO-SEGUNDO",
          subtitulo: "",
          nota: "NOTA-DO-SEGUNDO",
          fotos: [f(4), f(5, 0.7)],
        },
      ],
    },
  ],
  citacao: null,
  investimento: null,
  cronograma: null,
  condicoes: [],
  fotoDasCondicoes: null,
  fecho: { sobretitulo: "", agradecimento: "", validade: "", fundo: f(0) },
} as unknown as ConteudoWeb;

const assinadas = inventarioDeFotos(doc).map((e, i) => ({
  id: e.id,
  marca: `m${i}`,
  miniatura: `https://cdn.teste/mini-${i}.webp?token=x`,
  media: `https://cdn.teste/media-${i}.webp?token=x`,
  original: `https://cdn.teste/orig-${i}.jpg?token=x`,
  largura: 1800,
}));

/**
 * Auditoria legal (17/11): a proposta online não monta o rodapé do sítio, e o
 * Livro de Reclamações Eletrónico tem de estar em todas as páginas. Vai no
 * fecho da página, a mesma peça do rodapé, nas duas línguas.
 */
describe("a proposta online leva ao Livro de Reclamações", () => {
  it.each(["pt", "en"] as const)("%s: no rodapé, com nome e numa janela nova", async (idioma) => {
    const t = textosWeb(idioma);
    const dados = await montarPropostaWeb(
      conteudo,
      { id: "p-livro", doc },
      "TOKEN",
      idioma,
      t,
      assinadas,
    );
    const html = renderToStaticMarkup(<PropostaWeb dados={dados} lang={idioma} datas="" />);
    const rodape = html.slice(html.indexOf('<footer class="pw-foot"'));
    expect(rodape).toContain('href="https://www.livroreclamacoes.pt/Inicio/"');
    expect(rodape).toContain(
      `aria-label="${t.livroReclamacoes.nome} (${t.livroReclamacoes.novaJanela})"`,
    );
    expect(rodape).toContain('target="_blank"');
  });
});
